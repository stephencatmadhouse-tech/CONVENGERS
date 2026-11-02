/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express, { Request, Response, NextFunction } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { db } from './src/db/database.ts';
import { User, UserRole } from './src/types/index.ts';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const isDev = process.env.NODE_ENV !== 'production';

app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

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
  } else {
    req.user = null;
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
    return res.json(item);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.post('/api/scopes', requireRole(['admin', 'manager']), (req, res) => {
  try {
    const created = db.addScope(req.body, req.user!);
    return res.status(201).json(created);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.delete('/api/scopes/:id', requireRole(['admin', 'manager']), (req, res) => {
  try {
    db.deleteScope(req.params.id, req.user!);
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
    return res.status(201).json(created);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.put('/api/activities/:id', requireRole(['admin', 'manager', 'staff']), (req, res) => {
  try {
    const updated = db.updateActivity(req.params.id, req.body, req.user!);
    return res.json(updated);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.delete('/api/activities/:id', requireRole(['admin', 'manager']), (req, res) => {
  try {
    db.deleteActivity(req.params.id, req.user!);
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
    return res.status(201).json(created);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.put('/api/pours/:id', requireRole(['admin', 'manager', 'staff']), (req, res) => {
  try {
    const updated = db.updatePour(req.params.id, req.body, req.user!);
    return res.json(updated);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.delete('/api/pours/:id', requireRole(['admin', 'manager']), (req, res) => {
  try {
    db.deletePour(req.params.id, req.user!);
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
    return res.status(201).json(created);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.put('/api/episodes/:id', requireRole(['admin', 'manager']), (req, res) => {
  try {
    const updated = db.updateEpisode(req.params.id, req.body, req.user!);
    return res.json(updated);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.delete('/api/episodes/:id', requireRole(['admin', 'manager']), (req, res) => {
  try {
    db.deleteEpisode(req.params.id, req.user!);
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
  return res.status(201).json(char);
});

app.put('/api/characters/:id', requireRole(['admin', 'manager']), (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  try {
    const char = db.updateCharacter(req.params.id, name, req.user!);
    return res.json(char);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

app.delete('/api/characters/:id', requireRole(['admin', 'manager']), (req, res) => {
  try {
    db.deleteCharacter(req.params.id, req.user!);
    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

// --- ACTIVITY OVERRIDES ---
app.put('/api/overrides/:key', requireRole(['admin', 'manager', 'staff']), (req, res) => {
  try {
    db.setOverride(req.params.key, req.body, req.user!);
    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

// --- SETTINGS ---
app.put('/api/settings', requireRole(['admin']), (req, res) => {
  try {
    const updated = db.updateSettings(req.body, req.user!);
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
    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

// --- FACTORY RESET ---
app.post('/api/reset', requireRole(['admin']), (req, res) => {
  try {
    db.resetToBaseline(req.user!);
    return res.json({ ok: true });
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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Convengers Bahay Build Server running on http://localhost:${PORT} (${isDev ? 'development' : 'production'})`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
