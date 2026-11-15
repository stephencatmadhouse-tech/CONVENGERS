/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Convengers Bahay Build — Node server (AI Studio / Cloud Run).
 *
 * Serves the web app, the Google Drive file service (/api/drive/*) and the
 * live "who is online" presence channel (/ws). All project data lives in
 * Firebase (Firestore + security rules); this server keeps no project data.
 *
 * Presence is only for signed-in, active internal users: a client must join
 * with a valid Firebase ID token before it receives or appears in presence.
 */

import express from 'express';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { WebSocketServer, WebSocket } from 'ws';
import type { Collaborator, UserRole } from './src/types/index.ts';
import { handleDriveRequest } from './server/drive/handler.ts';
import { driveEnv } from './server/drive/config.ts';
import { verifyCaller } from './server/drive/admin.ts';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16 * 1024 });
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const isDev = process.env.NODE_ENV !== 'production';

app.disable('x-powered-by');

// Google Drive file service (server-side credentials only; see server/drive/). Reads its own request bodies.
app.all('/api/drive/*', (req, res) => {
  void handleDriveRequest(req, res);
});

// Any other /api path: this server has no other API (project data is in Firebase)
app.all('/api/*', (_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ---------------- Live presence (internal users only) ----------------
const collaborators = new Map<string, Collaborator>(); // clientId -> collaborator
const joined = new Map<WebSocket, string>(); // verified socket -> clientId

const clip = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : '');
const COLOR = /^#[0-9a-fA-F]{6}$/;

function collaboratorList(): Collaborator[] {
  const now = Date.now();
  for (const [id, c] of collaborators.entries()) if (now - c.lastActive > 90000) collaborators.delete(id);
  return Array.from(collaborators.values());
}

/** Send only to sockets that joined with a verified internal account. */
function broadcast(payload: unknown, except?: WebSocket) {
  const str = JSON.stringify(payload);
  for (const ws of joined.keys()) {
    if (ws !== except && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(str);
      } catch {
        // ignore
      }
    }
  }
}

function broadcastPresence() {
  const list = collaboratorList();
  broadcast({ type: 'PRESENCE_SYNC', collaborators: list, count: list.length, timestamp: Date.now() });
}

wss.on('connection', (ws: WebSocket) => {
  let clientId: string | null = null;

  ws.on('message', async (raw: unknown) => {
    let msg: any;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (!msg || typeof msg.type !== 'string') return;

    if (msg.type === 'JOIN') {
      const caller = await verifyCaller(driveEnv(), msg.idToken ? `Bearer ${msg.idToken}` : undefined).catch(() => null);
      if (!caller?.internal) {
        ws.send(JSON.stringify({ type: 'PRESENCE_DENIED' }));
        return;
      }
      const id = clip(msg.clientId, 64);
      if (!id) return;
      clientId = id;
      joined.set(ws, id);
      collaborators.set(id, {
        clientId: id,
        userId: caller.uid,
        userName: clip(msg.userName, 60) || caller.name || 'Team member',
        userRole: caller.role as UserRole,
        userColor: COLOR.test(msg.userColor) ? msg.userColor : '#3A9BFF',
        lastActive: Date.now(),
        device: msg.device === 'mobile' ? 'mobile' : 'desktop',
        focusedCellId: null,
      });
      ws.send(JSON.stringify({ type: 'INIT_SYNC', collaborators: collaboratorList(), timestamp: Date.now() }));
      broadcastPresence();
      return;
    }

    // Everything below requires a verified join
    if (!clientId || joined.get(ws) !== clientId) return;
    const col = collaborators.get(clientId);
    if (!col) return;
    col.lastActive = Date.now();

    if (msg.type === 'CELL_FOCUS') {
      col.focusedCellId = clip(msg.cellId, 120) || null;
      broadcast({ type: 'CELL_FOCUS', clientId, userId: col.userId, userName: col.userName, userColor: col.userColor, cellId: col.focusedCellId }, ws);
    } else if (msg.type === 'CELL_BLUR') {
      col.focusedCellId = null;
      broadcast({ type: 'CELL_BLUR', clientId, cellId: clip(msg.cellId, 120) }, ws);
    } else if (msg.type === 'HEARTBEAT' || msg.type === 'PING') {
      ws.send(JSON.stringify({ type: 'PONG', timestamp: Date.now() }));
    }
  });

  ws.on('close', () => {
    if (clientId && joined.get(ws) === clientId) {
      collaborators.delete(clientId);
      joined.delete(ws);
      broadcastPresence();
    }
    joined.delete(ws);
  });
});

// Periodic cleanup of stale presence
setInterval(() => {
  const before = collaborators.size;
  collaboratorList();
  if (collaborators.size !== before) broadcastPresence();
}, 30000);

// --- STATIC ASSETS & VITE INTEGRATION ---
async function startServer() {
  if (isDev) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Convengers Bahay Build Server running on http://localhost:${PORT} (${isDev ? 'development' : 'production'})`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
