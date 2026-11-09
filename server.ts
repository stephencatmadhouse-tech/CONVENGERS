/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express, { Request, Response, NextFunction } from 'express';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { WebSocketServer, WebSocket } from 'ws';
import { db } from './src/db/database.ts';
import { User, UserRole, Collaborator } from './src/types/index.ts';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const isDev = process.env.NODE_ENV !== 'production';

app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Active Collaborator Registry (Google Sheets style presence)
const activeCollaborators = new Map<string, Collaborator>();
const wsClientMap = new Map<WebSocket, string>(); // ws -> clientId
const sseClients = new Set<Response>();

export function getCollaboratorsList(): Collaborator[] {
  const now = Date.now();
  // Prune any collaborator with no ping for > 90 seconds
  for (const [id, c] of activeCollaborators.entries()) {
    if (now - c.lastActive > 90000) {
      activeCollaborators.delete(id);
    }
  }
  return Array.from(activeCollaborators.values());
}

export function broadcastEvent(payload: any, excludeWs?: WebSocket) {
  const str = JSON.stringify(payload);
  // 1. Send to all WebSocket clients
  for (const client of wss.clients) {
    if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
      try {
        client.send(str);
      } catch {
        // ignore
      }
    }
  }
  // 2. Also stream to all SSE clients as backup
  const sseData = `data: ${str}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(sseData);
    } catch {
      sseClients.delete(client);
    }
  }
}

export function broadcastDashboardUpdate() {
  const data = db.getFullDashboard(null);
  broadcastEvent({
    type: 'DASHBOARD_UPDATED',
    data,
    timestamp: Date.now(),
  });
}

export function broadcastPresence() {
  const collaborators = getCollaboratorsList();
  broadcastEvent({
    type: 'PRESENCE_SYNC',
    collaborators,
    count: collaborators.length,
    timestamp: Date.now(),
  });
}

// WebSocket Connection Lifecycle
wss.on('connection', (ws: WebSocket) => {
  let boundClientId: string | null = null;

  // Send current state and presence immediately
  ws.send(JSON.stringify({
    type: 'INIT_SYNC',
    data: db.getFullDashboard(null),
    collaborators: getCollaboratorsList(),
    timestamp: Date.now(),
  }));

  ws.on('message', (messageRaw: any) => {
    try {
      const msg = JSON.parse(messageRaw.toString());
      if (!msg || !msg.type) return;

      if (msg.type === 'JOIN') {
        const { clientId, userId, userName, userRole, userColor, device, token } = msg;
        if (!clientId) return;
        boundClientId = clientId;
        wsClientMap.set(ws, clientId);

        let roleToSet: UserRole = 'viewer';
        if (token) {
          const authUser = db.getUserByToken(token);
          if (authUser) roleToSet = authUser.role;
        } else if (userRole && ['admin', 'manager', 'staff'].includes(userRole)) {
          roleToSet = userRole;
        }

        activeCollaborators.set(clientId, {
          clientId,
          userId: userId || 'usr_guest',
          userName: userName || (roleToSet === 'viewer' ? 'Presentation Viewer' : 'Team Member'),
          userRole: roleToSet,
          userColor: userColor || '#3A9BFF',
          lastActive: Date.now(),
          device: device || 'desktop',
          focusedCellId: null,
        });
        broadcastPresence();
      } else if (msg.type === 'CELL_FOCUS') {
        const { clientId, cellId } = msg;
        if (!clientId) return;
        const col = activeCollaborators.get(clientId);
        if (col) {
          col.focusedCellId = cellId;
          col.lastActive = Date.now();
          broadcastEvent({
            type: 'CELL_FOCUS',
            clientId,
            userId: col.userId,
            userName: col.userName,
            userColor: col.userColor,
            cellId,
          }, ws);
        }
      } else if (msg.type === 'CELL_BLUR') {
        const { clientId, cellId } = msg;
        if (!clientId) return;
        const col = activeCollaborators.get(clientId);
        if (col) {
          col.focusedCellId = null;
          col.lastActive = Date.now();
          broadcastEvent({
            type: 'CELL_BLUR',
            clientId,
            cellId,
          }, ws);
        }
      } else if (msg.type === 'CELL_EDIT') {
        const { clientId, entityType, entityId, field, value } = msg;
        const col = activeCollaborators.get(clientId);

        // Security check: strictly reject edits from viewers
        if (!col || col.userRole === 'viewer') {
          ws.send(JSON.stringify({
            type: 'ERROR',
            message: 'Read-only access: Viewers cannot edit timeline data. Madhouse team sign-in required.',
          }));
          return;
        }

        const user = db.getDefaultUser();
        if (col) {
          col.lastActive = Date.now();
          user.name = col.userName;
          user.role = col.userRole;
        }

        try {
          const updatedRecord = db.updateCellField(entityType, entityId, field, value, user);
          // Broadcast instant granular update to all other clients immediately (<20ms)
          broadcastEvent({
            type: 'CELL_EDIT_APPLIED',
            entityType,
            entityId,
            field,
            value,
            clientId,
            userName: col?.userName || 'Teammate',
            updatedRecord,
            timestamp: Date.now(),
          }, ws);
          // Also broadcast updated full dashboard
          broadcastDashboardUpdate();
        } catch (err: any) {
          ws.send(JSON.stringify({ type: 'ERROR', message: err.message }));
        }
      } else if (msg.type === 'HEARTBEAT' || msg.type === 'PING') {
        const { clientId } = msg;
        if (clientId && activeCollaborators.has(clientId)) {
          activeCollaborators.get(clientId)!.lastActive = Date.now();
        }
        ws.send(JSON.stringify({ type: 'PONG', timestamp: Date.now() }));
      }
    } catch (err) {
      console.error('WebSocket message parsing error:', err);
    }
  });

  ws.on('close', () => {
    if (boundClientId) {
      activeCollaborators.delete(boundClientId);
      broadcastPresence();
    }
    wsClientMap.delete(ws);
  });
});

// Periodic cleanup of stale sessions
setInterval(() => {
  const prevSize = activeCollaborators.size;
  getCollaboratorsList();
  if (activeCollaborators.size !== prevSize) {
    broadcastPresence();
  }
}, 30000);


// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      user?: User | null;
    }
  }
}

// Authentication middleware
function authMiddleware(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    req.user = db.getUserByToken(token);
  }
  // If no active session token is present or invalid, default to Viewer (Read-only).
  // All write access is reserved for authenticated Madhouse team members (Admin, Manager, Staff).
  if (!req.user) {
    req.user = db.getViewerUser();
  }
  next();
}

app.use(authMiddleware);

// Authorization helper
function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required. Please sign in.' });
  }
  next();
}

function requireRole(allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Access denied. Requires one of roles: ${allowedRoles.join(', ')}. Current role: ${req.user.role}`,
      });
    }
    next();
  };
}

// ========================
// API ROUTES
// ========================

// --- AUTHENTICATION ---
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const userCreds = db.getUserByEmail(email);
  if (!userCreds || !db.verifyPassword(password, userCreds)) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  const token = db.createSession(userCreds.id);
  const { passwordHash, salt, ...safeUser } = userCreds;
  db.logAudit(safeUser.id, safeUser.email, 'LOGIN', 'User', safeUser.id);
  return res.json({ token, user: safeUser });
});

app.post('/api/auth/register', (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required.' });
  }

  try {
    const userRole: UserRole = role && ['admin', 'manager', 'staff', 'viewer'].includes(role) ? role : 'viewer';
    const newUser = db.registerUser(name, email, password, userRole);
    const token = db.createSession(newUser.id);
    db.logAudit(newUser.id, newUser.email, 'REGISTER', 'User', newUser.id, `Role: ${newUser.role}`);
    return res.status(201).json({ token, user: newUser });
  } catch (err: any) {
    return res.status(400).json({ error: err.message || 'Registration failed.' });
  }
});

app.get('/api/auth/me', (req, res) => {
  return res.json({ user: req.user || null });
});

app.post('/api/auth/logout', (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    db.removeSession(token);
  }
  return res.json({ ok: true });
});

// Switch role (convenience for demo / testing accounts)
app.post('/api/auth/switch-demo', (req, res) => {
  const { email } = req.body;
  const userCreds = db.getUserByEmail(email);
  if (!userCreds) {
    return res.status(404).json({ error: 'Demo user not found.' });
  }
  const token = db.createSession(userCreds.id);
  const { passwordHash, salt, ...safeUser } = userCreds;
  return res.json({ token, user: safeUser });
});

// --- REAL-TIME SSE STREAM ---
app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  // Initial connection state
  res.write(`data: ${JSON.stringify({ type: 'CONNECTED', data: db.getFullDashboard(null) })}\n\n`);

  sseClients.add(res);

  const heartbeat = setInterval(() => {
    try {
      res.write(': keepalive\n\n');
    } catch {
      clearInterval(heartbeat);
      sseClients.delete(res);
    }
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
  });
});

// --- FULL DASHBOARD DATA ---
app.get('/api/data/all', (req, res) => {
  const data = db.getFullDashboard(req.user || null);
  return res.json(data);
});

// --- MILESTONES ---
app.get('/api/milestones', (_req, res) => {
  return res.json(db.getMilestones());
});

app.put('/api/milestones/:id', requireRole(['admin', 'manager', 'staff']), (req, res) => {
  try {
    const updated = db.updateMilestone(req.params.id, req.body, req.user!);
    broadcastDashboardUpdate();
    return res.json(updated);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

// --- SCOPES ---
app.get('/api/scopes', (_req, res) => {
  return res.json(db.getScopes());
});

app.put('/api/scopes/:id/progress', requireRole(['admin', 'manager', 'staff']), (req, res) => {
  const { percent } = req.body;
  if (typeof percent !== 'number') {
    return res.status(400).json({ error: 'percent number is required.' });
  }
  try {
    const item = db.updateScopePercent(req.params.id, percent, req.user!);
    broadcastDashboardUpdate();
    return res.json(item);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.post('/api/scopes', requireRole(['admin', 'manager']), (req, res) => {
  try {
    const created = db.addScope(req.body, req.user!);
    broadcastDashboardUpdate();
    return res.status(201).json(created);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.delete('/api/scopes/:id', requireRole(['admin', 'manager']), (req, res) => {
  try {
    db.deleteScope(req.params.id, req.user!);
    broadcastDashboardUpdate();
    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

// --- ACTIVITIES ---
app.get('/api/activities', (_req, res) => {
  return res.json(db.getActivities());
});

app.post('/api/activities', requireRole(['admin', 'manager', 'staff']), (req, res) => {
  try {
    const created = db.addActivity(req.body, req.user!);
    broadcastDashboardUpdate();
    return res.status(201).json(created);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.put('/api/activities/:id', requireRole(['admin', 'manager', 'staff']), (req, res) => {
  try {
    const updated = db.updateActivity(req.params.id, req.body, req.user!);
    broadcastDashboardUpdate();
    return res.json(updated);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.delete('/api/activities/:id', requireRole(['admin', 'manager']), (req, res) => {
  try {
    db.deleteActivity(req.params.id, req.user!);
    broadcastDashboardUpdate();
    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

// --- CONCRETE POURS ---
app.get('/api/pours', (_req, res) => {
  return res.json(db.getPours());
});

app.post('/api/pours', requireRole(['admin', 'manager']), (req, res) => {
  try {
    const created = db.addPour(req.body, req.user!);
    broadcastDashboardUpdate();
    return res.status(201).json(created);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.put('/api/pours/:id', requireRole(['admin', 'manager', 'staff']), (req, res) => {
  try {
    const updated = db.updatePour(req.params.id, req.body, req.user!);
    broadcastDashboardUpdate();
    return res.json(updated);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.delete('/api/pours/:id', requireRole(['admin', 'manager']), (req, res) => {
  try {
    db.deletePour(req.params.id, req.user!);
    broadcastDashboardUpdate();
    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

// --- EPISODES & CHARACTERS ---
app.get('/api/episodes', (_req, res) => {
  return res.json(db.getEpisodes());
});

app.post('/api/episodes', requireRole(['admin', 'manager']), (req, res) => {
  try {
    const created = db.addEpisode(req.body, req.user!);
    broadcastDashboardUpdate();
    return res.status(201).json(created);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.put('/api/episodes/:id', requireRole(['admin', 'manager']), (req, res) => {
  try {
    const updated = db.updateEpisode(req.params.id, req.body, req.user!);
    broadcastDashboardUpdate();
    return res.json(updated);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.delete('/api/episodes/:id', requireRole(['admin', 'manager']), (req, res) => {
  try {
    db.deleteEpisode(req.params.id, req.user!);
    broadcastDashboardUpdate();
    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.get('/api/characters', (_req, res) => {
  return res.json(db.getCharacters());
});

app.post('/api/characters', requireRole(['admin', 'manager']), (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  const char = db.addCharacter(name, req.user!);
  broadcastDashboardUpdate();
  return res.status(201).json(char);
});

app.put('/api/characters/:id', requireRole(['admin', 'manager']), (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  try {
    const char = db.updateCharacter(req.params.id, name, req.user!);
    broadcastDashboardUpdate();
    return res.json(char);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.delete('/api/characters/:id', requireRole(['admin', 'manager']), (req, res) => {
  try {
    db.deleteCharacter(req.params.id, req.user!);
    broadcastDashboardUpdate();
    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

// --- ACTIVITY OVERRIDES ---
app.put('/api/overrides/:key', requireRole(['admin', 'manager', 'staff']), (req, res) => {
  try {
    db.setOverride(req.params.key, req.body, req.user!);
    broadcastDashboardUpdate();
    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

// --- SETTINGS ---
app.put('/api/settings', requireRole(['admin']), (req, res) => {
  try {
    const updated = db.updateSettings(req.body, req.user!);
    broadcastDashboardUpdate();
    return res.json(updated);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

// --- BACKUP & RESTORE ---
app.get('/api/backup/export', requireAuth, (_req, res) => {
  const data = db.getFullDashboard(_req.user || null);
  const backup = {
    app: 'convengers-bahay-build',
    format: 1,
    exportedAt: new Date().toISOString(),
    ...data,
  };
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename=Convengers_Backup_${new Date().toISOString().split('T')[0]}.json`);
  return res.json(backup);
});

app.post('/api/backup/import', requireRole(['admin']), (req, res) => {
  try {
    db.importBackup(req.body, req.user!);
    broadcastDashboardUpdate();
    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

// --- FACTORY RESET ---
app.post('/api/reset', requireRole(['admin']), (req, res) => {
  try {
    db.resetToBaseline(req.user!);
    broadcastDashboardUpdate();
    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

// --- REAL-TIME REST FALLBACK ENDPOINTS ---
app.get('/api/realtime/collaborators', (_req, res) => {
  return res.json(getCollaboratorsList());
});

app.post('/api/realtime/heartbeat', (req, res) => {
  const { clientId, userId, userName, userRole, userColor, focusedCellId } = req.body;
  if (clientId) {
    activeCollaborators.set(clientId, {
      clientId,
      userId: userId || req.user?.id || 'usr_guest',
      userName: userName || req.user?.name || 'Teammate',
      userRole: userRole || req.user?.role || 'viewer',
      userColor: userColor || '#3A9BFF',
      focusedCellId: focusedCellId || null,
      lastActive: Date.now(),
      device: req.body.device || 'desktop',
    });
    broadcastPresence();
  }
  return res.json({ ok: true, count: activeCollaborators.size });
});

app.post('/api/realtime/focus', (req, res) => {
  const { clientId, cellId } = req.body;
  if (clientId) {
    const col = activeCollaborators.get(clientId);
    if (col) {
      col.focusedCellId = cellId;
      col.lastActive = Date.now();
      broadcastEvent({
        type: 'CELL_FOCUS',
        clientId,
        userId: col.userId,
        userName: col.userName,
        userColor: col.userColor,
        cellId,
      });
    }
  }
  return res.json({ ok: true });
});

app.post('/api/realtime/blur', (req, res) => {
  const { clientId, cellId } = req.body;
  if (clientId) {
    const col = activeCollaborators.get(clientId);
    if (col) {
      col.focusedCellId = null;
      col.lastActive = Date.now();
      broadcastEvent({
        type: 'CELL_BLUR',
        clientId,
        cellId,
      });
    }
  }
  return res.json({ ok: true });
});

app.post('/api/realtime/cell-edit', requireRole(['admin', 'manager', 'staff']), (req, res) => {
  const { clientId, entityType, entityId, field, value } = req.body;
  try {
    const updated = db.updateCellField(entityType, entityId, field, value, req.user!);
    broadcastEvent({
      type: 'CELL_EDIT_APPLIED',
      entityType,
      entityId,
      field,
      value,
      clientId,
      userName: req.user!.name,
      updatedRecord: updated,
      timestamp: Date.now(),
    });
    broadcastDashboardUpdate();
    return res.json(updated);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

// --- AUDIT LOGS ---
app.get('/api/audit-logs', requireRole(['admin', 'manager']), (_req, res) => {
  return res.json(db.getAuditLogs());
});

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

