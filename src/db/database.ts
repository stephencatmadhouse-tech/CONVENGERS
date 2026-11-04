/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  User,
  UserWithCredentials,
  UserRole,
  Milestone,
  ScopeItem,
  Activity,
  ConcretePour,
  Episode,
  Character,
  ActivityOverride,
  SystemSettings,
  AuditLog,
  FullDashboardData,
} from '../types/index.ts';
import {
  INITIAL_USERS,
  INITIAL_SETTINGS,
  INITIAL_MILESTONES,
  INITIAL_SCOPES,
  INITIAL_CONCRETE_POURS,
  INITIAL_CHARACTERS,
  INITIAL_EPISODES,
} from './seedData.ts';

interface Session {
  token: string;
  userId: string;
  expiresAt: number;
}

interface DatabaseSchema {
  version: number;
  users: UserWithCredentials[];
  sessions: Session[];
  settings: SystemSettings;
  milestones: Milestone[];
  scopes: ScopeItem[];
  activities: Activity[];
  pours: ConcretePour[];
  episodes: Episode[];
  characters: Character[];
  overrides: Record<string, ActivityOverride>;
  auditLogs: AuditLog[];
}

export class DatabaseEngine {
  private dbPath: string;
  private data: DatabaseSchema;
  private isSaving: boolean = false;
  private saveQueue: Array<() => void> = [];

  constructor(filePath?: string) {
    this.dbPath = filePath || path.join(process.cwd(), 'data', 'database.json');
    this.data = this.loadOrCreate();
  }

  private loadOrCreate(): DatabaseSchema {
    try {
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      if (fs.existsSync(this.dbPath)) {
        const raw = fs.readFileSync(this.dbPath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && parsed.version && Array.isArray(parsed.milestones)) {
          // Self-heal: ensure all milestones retain their original title, dateText, and badges if missing
          parsed.milestones = parsed.milestones.map((m: Milestone) => {
            const initial = INITIAL_MILESTONES.find((im) => im.id === m.id);
            if (initial) {
              return {
                ...initial,
                ...m,
                label: m.label && m.label.trim() ? m.label : initial.label,
                dateText: m.dateText && m.dateText.trim() ? m.dateText : initial.dateText,
                badge: m.badge || initial.badge,
              };
            }
            return m;
          });
          return parsed;
        }
      }
    } catch (err) {
      console.error('Error loading database, resetting to initial seed:', err);
    }

    const initial = this.getInitialSchema();
    this.persistSync(initial);
    return initial;
  }

  public getInitialSchema(): DatabaseSchema {
    return {
      version: 1,
      users: [...INITIAL_USERS],
      sessions: [],
      settings: { ...INITIAL_SETTINGS },
      milestones: [...INITIAL_MILESTONES],
      scopes: [...INITIAL_SCOPES],
      activities: [],
      pours: [...INITIAL_CONCRETE_POURS],
      episodes: [...INITIAL_EPISODES],
      characters: [...INITIAL_CHARACTERS],
      overrides: {},
      auditLogs: [],
    };
  }

  private persistSync(data: DatabaseSchema): void {
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const tmpPath = `${this.dbPath}.${Date.now()}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tmpPath, this.dbPath);
  }

  public async save(): Promise<void> {
    if (this.isSaving) {
      return new Promise<void>((resolve) => {
        this.saveQueue.push(resolve);
      });
    }

    this.isSaving = true;
    try {
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) {
        await fs.promises.mkdir(dir, { recursive: true });
      }
      const tmpPath = `${this.dbPath}.${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`;
      const content = JSON.stringify(this.data, null, 2);
      await fs.promises.writeFile(tmpPath, content, 'utf-8');
      await fs.promises.rename(tmpPath, this.dbPath);
    } catch (err) {
      console.error('Failed to write database file:', err);
    } finally {
      this.isSaving = false;
      if (this.saveQueue.length > 0) {
        const next = this.saveQueue.shift();
        if (next) next();
      }
    }
  }

  // --- AUDIT LOGS ---
  public logAudit(userId: string, userEmail: string, action: string, entityType: string, entityId: string, details?: string): void {
    const log: AuditLog = {
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      userId,
      userEmail,
      action,
      entityType,
      entityId,
      details,
      timestamp: new Date().toISOString(),
    };
    this.data.auditLogs.unshift(log);
    if (this.data.auditLogs.length > 500) {
      this.data.auditLogs = this.data.auditLogs.slice(0, 500);
    }
    this.save();
  }

  public getAuditLogs(): AuditLog[] {
    return this.data.auditLogs;
  }

  // --- AUTHENTICATION & SESSIONS ---
  public verifyPassword(password: string, user: UserWithCredentials): boolean {
    const hash = crypto.scryptSync(password, user.salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(user.passwordHash, 'hex'));
  }

  public createSession(userId: string): string {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days
    this.data.sessions.push({ token, userId, expiresAt });
    // Clean expired
    this.data.sessions = this.data.sessions.filter(s => s.expiresAt > Date.now());
    this.save();
    return token;
  }

  public getUserByToken(token: string): User | null {
    if (!token) return null;
    const session = this.data.sessions.find(s => s.token === token && s.expiresAt > Date.now());
    if (!session) return null;
    const user = this.data.users.find(u => u.id === session.userId);
    if (!user) return null;
    const { passwordHash, salt, ...safeUser } = user;
    return safeUser;
  }

  public getUserByEmail(email: string): UserWithCredentials | null {
    return this.data.users.find(u => u.email.toLowerCase() === email.toLowerCase()) || null;
  }

  public registerUser(name: string, email: string, password: string, role: UserRole = 'viewer'): User {
    if (this.getUserByEmail(email)) {
      throw new Error('User with this email already exists.');
    }
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    const id = `usr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const newUser: UserWithCredentials = {
      id,
      name,
      email,
      role,
      passwordHash: hash,
      salt,
      createdAt: new Date().toISOString(),
    };
    this.data.users.push(newUser);
    this.save();
    const { passwordHash, salt: _, ...safeUser } = newUser;
    return safeUser;
  }

  public removeSession(token: string): void {
    this.data.sessions = this.data.sessions.filter(s => s.token !== token);
    this.save();
  }

  public getDefaultUser(): User {
    const admin = this.data.users.find(u => u.role === 'admin') || this.data.users[0];
    const { passwordHash, salt, ...safeUser } = admin;
    return safeUser;
  }

  // --- FULL DATA FETCH ---
  public getFullDashboard(currentUser: User | null): FullDashboardData {
    return {
      user: currentUser,
      settings: this.data.settings,
      milestones: this.data.milestones,
      scopes: this.data.scopes,
      activities: this.data.activities,
      pours: this.data.pours,
      episodes: this.data.episodes,
      characters: this.data.characters,
      overrides: this.data.overrides,
      auditLogs: currentUser && (currentUser.role === 'admin' || currentUser.role === 'manager') 
        ? this.data.auditLogs.slice(0, 50) 
        : [],
    };
  }

  // --- MILESTONES ---
  public getMilestones(): Milestone[] {
    return this.data.milestones;
  }

  public updateMilestone(id: string, updates: Partial<Milestone>, user: User): Milestone {
    const item = this.data.milestones.find(m => m.id === id);
    if (!item) throw new Error('Milestone not found');

    // Never allow valid titles or dates to be erased with empty strings
    const safeUpdates: Partial<Milestone> = { ...updates };
    if ('label' in safeUpdates && (!safeUpdates.label || !safeUpdates.label.trim())) {
      delete safeUpdates.label;
    }
    if ('dateText' in safeUpdates && (!safeUpdates.dateText || !safeUpdates.dateText.trim())) {
      delete safeUpdates.dateText;
    }

    Object.assign(item, safeUpdates, {
      updatedAt: new Date().toISOString(),
      updatedBy: user.name,
    });

    // Ensure item has label and dateText from INITIAL_MILESTONES if missing
    if (!item.label || !item.dateText) {
      const initial = INITIAL_MILESTONES.find(im => im.id === id);
      if (initial) {
        item.label = item.label || initial.label;
        item.dateText = item.dateText || initial.dateText;
        item.badge = item.badge || initial.badge;
      }
    }

    this.logAudit(user.id, user.email, 'UPDATE', 'Milestone', id, `Updated to ${item.status}`);
    this.save();
    return item;
  }

  // --- SCOPE ITEMS ---
  public getScopes(): ScopeItem[] {
    return this.data.scopes;
  }

  public updateScopePercent(id: string, percent: number, user: User): ScopeItem {
    const item = this.data.scopes.find(s => s.id === id);
    if (!item) throw new Error('Scope item not found');
    const clamped = Math.max(0, Math.min(100, Math.round(percent)));
    item.percentComplete = clamped;
    item.updatedAt = new Date().toISOString();
    item.updatedBy = user.name;
    this.logAudit(user.id, user.email, 'UPDATE_PROGRESS', 'ScopeItem', id, `Set to ${clamped}%`);
    this.save();
    return item;
  }

  public addScope(scope: Omit<ScopeItem, 'id'>, user: User): ScopeItem {
    const id = `sc_added_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const newItem: ScopeItem = {
      ...scope,
      id,
      isAdded: true,
      updatedAt: new Date().toISOString(),
      updatedBy: user.name,
    };
    this.data.scopes.push(newItem);
    this.logAudit(user.id, user.email, 'CREATE', 'ScopeItem', id, `Added ${newItem.name}`);
    this.save();
    return newItem;
  }

  public deleteScope(id: string, user: User): void {
    const prev = this.data.scopes.find(s => s.id === id);
    this.data.scopes = this.data.scopes.filter(s => s.id !== id);
    this.logAudit(user.id, user.email, 'DELETE', 'ScopeItem', id, prev ? prev.name : '');
    this.save();
  }

  // --- ACTIVITIES ---
  public getActivities(): Activity[] {
    return this.data.activities;
  }

  public addActivity(act: Omit<Activity, 'id' | 'createdAt' | 'updatedAt'>, user: User): Activity {
    const id = `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date().toISOString();
    const newAct: Activity = {
      ...act,
      id,
      isManual: true,
      createdAt: now,
      updatedAt: now,
      updatedBy: user.name,
    };
    this.data.activities.push(newAct);
    this.logAudit(user.id, user.email, 'CREATE', 'Activity', id, newAct.title);
    this.save();
    return newAct;
  }

  public updateActivity(id: string, updates: Partial<Activity>, user: User): Activity {
    const act = this.data.activities.find(a => a.id === id);
    if (!act) throw new Error('Activity not found');
    Object.assign(act, updates, {
      updatedAt: new Date().toISOString(),
      updatedBy: user.name,
    });
    this.logAudit(user.id, user.email, 'UPDATE', 'Activity', id, act.title);
    this.save();
    return act;
  }

  public deleteActivity(id: string, user: User): void {
    const prev = this.data.activities.find(a => a.id === id);
    this.data.activities = this.data.activities.filter(a => a.id !== id);
    this.logAudit(user.id, user.email, 'DELETE', 'Activity', id, prev ? prev.title : '');
    this.save();
  }

  // --- CONCRETE POURS ---
  public getPours(): ConcretePour[] {
    return this.data.pours;
  }

  public addPour(pour: Omit<ConcretePour, 'id'>, user: User): ConcretePour {
    const id = `pour_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const newPour: ConcretePour = {
      ...pour,
      id,
      updatedAt: new Date().toISOString(),
      updatedBy: user.name,
    };
    this.data.pours.push(newPour);
    this.logAudit(user.id, user.email, 'CREATE', 'ConcretePour', id, `${newPour.floor} - ${newPour.activity}`);
    this.save();
    return newPour;
  }

  public updatePour(id: string, updates: Partial<ConcretePour>, user: User): ConcretePour {
    const pour = this.data.pours.find(p => p.id === id);
    if (!pour) throw new Error('Concrete pour not found');
    Object.assign(pour, updates, {
      updatedAt: new Date().toISOString(),
      updatedBy: user.name,
    });
    this.logAudit(user.id, user.email, 'UPDATE', 'ConcretePour', id, `${pour.floor} - ${pour.activity}`);
    this.save();
    return pour;
  }

  public deletePour(id: string, user: User): void {
    const prev = this.data.pours.find(p => p.id === id);
    this.data.pours = this.data.pours.filter(p => p.id !== id);
    this.logAudit(user.id, user.email, 'DELETE', 'ConcretePour', id, prev ? `${prev.floor} - ${prev.activity}` : '');
    this.save();
  }

  // --- EPISODES & CHARACTERS ---
  public getEpisodes(): Episode[] {
    return this.data.episodes;
  }

  public addEpisode(ep: Omit<Episode, 'id'>, user: User): Episode {
    const id = `ep_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const newEp: Episode = {
      ...ep,
      id,
      updatedAt: new Date().toISOString(),
      updatedBy: user.name,
    };
    this.data.episodes.push(newEp);
    this.logAudit(user.id, user.email, 'CREATE', 'Episode', id, `Ep ${newEp.number}: ${newEp.title}`);
    this.save();
    return newEp;
  }

  public updateEpisode(id: string, updates: Partial<Episode>, user: User): Episode {
    const ep = this.data.episodes.find(e => e.id === id);
    if (!ep) throw new Error('Episode not found');
    Object.assign(ep, updates, {
      updatedAt: new Date().toISOString(),
      updatedBy: user.name,
    });
    this.logAudit(user.id, user.email, 'UPDATE', 'Episode', id, `Ep ${ep.number}: ${ep.title}`);
    this.save();
    return ep;
  }

  public deleteEpisode(id: string, user: User): void {
    const prev = this.data.episodes.find(e => e.id === id);
    this.data.episodes = this.data.episodes.filter(e => e.id !== id);
    this.logAudit(user.id, user.email, 'DELETE', 'Episode', id, prev ? `Ep ${prev.number}: ${prev.title}` : '');
    this.save();
  }

  public getCharacters(): Character[] {
    return this.data.characters;
  }

  public addCharacter(name: string, user: User): Character {
    const existing = this.data.characters.find(c => c.name.toLowerCase() === name.trim().toLowerCase());
    if (existing) return existing;
    const newChar: Character = {
      id: `ch_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: name.trim(),
      createdAt: new Date().toISOString(),
    };
    this.data.characters.push(newChar);
    this.logAudit(user.id, user.email, 'CREATE', 'Character', newChar.id, newChar.name);
    this.save();
    return newChar;
  }

  public updateCharacter(id: string, name: string, user: User): Character {
    const char = this.data.characters.find(c => c.id === id);
    if (!char) throw new Error('Character not found');
    char.name = name.trim();
    this.logAudit(user.id, user.email, 'UPDATE', 'Character', id, char.name);
    this.save();
    return char;
  }

  public deleteCharacter(id: string, user: User): void {
    const prev = this.data.characters.find(c => c.id === id);
    this.data.characters = this.data.characters.filter(c => c.id !== id);
    // Remove from all episodes
    this.data.episodes.forEach(e => {
      e.characters = e.characters.filter(cId => cId !== id);
    });
    this.logAudit(user.id, user.email, 'DELETE', 'Character', id, prev ? prev.name : '');
    this.save();
  }

  // --- OVERRIDES & SETTINGS ---
  public setOverride(key: string, override: Partial<ActivityOverride>, user: User): void {
    if (!this.data.overrides[key]) {
      this.data.overrides[key] = { key };
    }
    Object.assign(this.data.overrides[key], override, {
      updatedAt: new Date().toISOString(),
      updatedBy: user.name,
    });
    this.logAudit(user.id, user.email, 'OVERRIDE', 'Activity', key, JSON.stringify(override));
    this.save();
  }

  public updateSettings(settings: Partial<SystemSettings>, user: User): SystemSettings {
    Object.assign(this.data.settings, settings, {
      version: this.data.settings.version + 1,
      updatedAt: new Date().toISOString(),
    });
    this.logAudit(user.id, user.email, 'SETTINGS_UPDATE', 'System', 'settings');
    this.save();
    return this.data.settings;
  }

  // --- RESET TO FACTORY BASELINE ---
  public resetToBaseline(user: User): void {
    const init = this.getInitialSchema();
    this.data.milestones = init.milestones;
    this.data.scopes = init.scopes;
    this.data.activities = [];
    this.data.pours = init.pours;
    this.data.episodes = init.episodes;
    this.data.characters = init.characters;
    this.data.overrides = {};
    this.data.settings = {
      ...init.settings,
      version: this.data.settings.version + 1,
      updatedAt: new Date().toISOString(),
    };
    this.logAudit(user.id, user.email, 'RESET_BASELINE', 'System', 'all');
    this.persistSync(this.data);
  }

  // --- IMPORT / EXPORT BACKUP ---
  public importBackup(backupData: any, user: User): void {
    if (!backupData || typeof backupData !== 'object') {
      throw new Error('Invalid backup format');
    }

    if (Array.isArray(backupData.milestones)) this.data.milestones = backupData.milestones;
    if (Array.isArray(backupData.scopes)) this.data.scopes = backupData.scopes;
    if (Array.isArray(backupData.activities)) this.data.activities = backupData.activities;
    if (Array.isArray(backupData.pours)) this.data.pours = backupData.pours;
    if (Array.isArray(backupData.episodes)) this.data.episodes = backupData.episodes;
    if (Array.isArray(backupData.characters)) this.data.characters = backupData.characters;
    if (backupData.overrides && typeof backupData.overrides === 'object') this.data.overrides = backupData.overrides;
    
    this.data.settings.version += 1;
    this.data.settings.updatedAt = new Date().toISOString();

    this.logAudit(user.id, user.email, 'IMPORT_BACKUP', 'System', 'all');
    this.persistSync(this.data);
  }
}

export const db = new DatabaseEngine();
