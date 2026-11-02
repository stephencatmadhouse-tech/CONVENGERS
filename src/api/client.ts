/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  User,
  FullDashboardData,
  Milestone,
  ScopeItem,
  Activity,
  ConcretePour,
  Episode,
  Character,
  ActivityOverride,
  SystemSettings,
  AuditLog,
} from '../types/index.ts';

const TOKEN_KEY = 'convengers_auth_token';

class ApiClient {
  private token: string | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      this.token = localStorage.getItem(TOKEN_KEY);
    }
  }

  public setToken(token: string | null) {
    this.token = token;
    if (typeof window !== 'undefined') {
      if (token) {
        localStorage.setItem(TOKEN_KEY, token);
      } else {
        localStorage.removeItem(TOKEN_KEY);
      }
    }
  }

  public getToken(): string | null {
    return this.token;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(endpoint, {
      ...options,
      headers,
    });

    if (!response.ok) {
      let errorMsg = `Request failed: ${response.statusText}`;
      try {
        const errorData = await response.json();
        if (errorData.error) errorMsg = errorData.error;
      } catch {
        // ignore
      }
      throw new Error(errorMsg);
    }

    return response.json();
  }

  public updateCachedDashboard(updater: (prev: FullDashboardData) => FullDashboardData): void {
    if (typeof window === 'undefined') return;
    try {
      const cached = localStorage.getItem('convengers_cached_dashboard');
      if (cached) {
        const parsed = JSON.parse(cached);
        const updated = updater(parsed);
        localStorage.setItem('convengers_cached_dashboard', JSON.stringify(updated));
      }
    } catch {
      // ignore
    }
  }

  // --- AUTH ---
  public async login(email: string, password: string): Promise<{ token: string; user: User }> {
    const res = await this.request<{ token: string; user: User }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    this.setToken(res.token);
    return res;
  }

  public async register(name: string, email: string, password: string, role?: string): Promise<{ token: string; user: User }> {
    const res = await this.request<{ token: string; user: User }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password, role }),
    });
    this.setToken(res.token);
    return res;
  }

  public async switchDemo(email: string): Promise<{ token: string; user: User }> {
    const res = await this.request<{ token: string; user: User }>('/api/auth/switch-demo', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
    this.setToken(res.token);
    return res;
  }

  public async getMe(): Promise<{ user: User | null }> {
    return this.request<{ user: User | null }>('/api/auth/me');
  }

  public async logout(): Promise<void> {
    try {
      await this.request('/api/auth/logout', { method: 'POST' });
    } finally {
      this.setToken(null);
    }
  }

  // --- DATA ---
  public async getFullDashboard(): Promise<FullDashboardData> {
    try {
      const res = await this.request<FullDashboardData>('/api/data/all');
      if (typeof window !== 'undefined') {
        localStorage.setItem('convengers_cached_dashboard', JSON.stringify(res));
      }
      return res;
    } catch (err) {
      console.warn('API unavailable, falling back to local storage cache / seed data:', err);
      if (typeof window !== 'undefined') {
        const cached = localStorage.getItem('convengers_cached_dashboard');
        if (cached) {
          try {
            return JSON.parse(cached);
          } catch {
            // ignore
          }
        }
      }
      // Import seed data dynamically if needed
      const {
        INITIAL_SETTINGS,
        INITIAL_MILESTONES,
        INITIAL_SCOPES,
        INITIAL_CONCRETE_POURS,
        INITIAL_EPISODES,
        INITIAL_CHARACTERS,
        INITIAL_USERS,
      } = await import('../db/seedData.ts');

      const fallback: FullDashboardData = {
        user: INITIAL_USERS[0],
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
      return fallback;
    }
  }

  // --- MILESTONES ---
  public async updateMilestone(id: string, updates: Partial<Milestone>): Promise<Milestone> {
    try {
      const res = await this.request<Milestone>(`/api/milestones/${id}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      });
      this.updateCachedDashboard((prev) => ({
        ...prev,
        milestones: prev.milestones.map((m) => (m.id === id ? res : m)),
      }));
      return res;
    } catch (err) {
      this.updateCachedDashboard((prev) => ({
        ...prev,
        milestones: prev.milestones.map((m) => (m.id === id ? { ...m, ...updates } : m)),
      }));
      return { id, index: 0, dateText: '', label: '', status: 'Upcoming', ...updates } as Milestone;
    }
  }

  // --- SCOPES ---
  public async updateScopeProgress(id: string, percent: number): Promise<ScopeItem> {
    try {
      const res = await this.request<ScopeItem>(`/api/scopes/${id}/progress`, {
        method: 'PUT',
        body: JSON.stringify({ percent }),
      });
      this.updateCachedDashboard((prev) => ({
        ...prev,
        scopes: prev.scopes.map((s) => (s.id === id ? res : s)),
      }));
      return res;
    } catch (err) {
      this.updateCachedDashboard((prev) => ({
        ...prev,
        scopes: prev.scopes.map((s) => (s.id === id ? { ...s, percentComplete: percent } : s)),
      }));
      return { id, floor: 'GF', phase: 'Structural', name: '', dateText: '', workingDays: 1, percentComplete: percent, sortOrder: 0 };
    }
  }

  public async addScope(scope: Omit<ScopeItem, 'id'>): Promise<ScopeItem> {
    return this.request<ScopeItem>('/api/scopes', {
      method: 'POST',
      body: JSON.stringify(scope),
    });
  }

  public async deleteScope(id: string): Promise<void> {
    await this.request(`/api/scopes/${id}`, { method: 'DELETE' });
  }

  // --- ACTIVITIES ---
  public async addActivity(act: Omit<Activity, 'id' | 'createdAt' | 'updatedAt'>): Promise<Activity> {
    return this.request<Activity>('/api/activities', {
      method: 'POST',
      body: JSON.stringify(act),
    });
  }

  public async updateActivity(id: string, updates: Partial<Activity>): Promise<Activity> {
    return this.request<Activity>(`/api/activities/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  public async deleteActivity(id: string): Promise<void> {
    await this.request(`/api/activities/${id}`, { method: 'DELETE' });
  }

  // --- CONCRETE POURS ---
  public async addPour(pour: Omit<ConcretePour, 'id'>): Promise<ConcretePour> {
    return this.request<ConcretePour>('/api/pours', {
      method: 'POST',
      body: JSON.stringify(pour),
    });
  }

  public async updatePour(id: string, updates: Partial<ConcretePour>): Promise<ConcretePour> {
    return this.request<ConcretePour>(`/api/pours/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  public async deletePour(id: string): Promise<void> {
    await this.request(`/api/pours/${id}`, { method: 'DELETE' });
  }

  // --- EPISODES & CHARACTERS ---
  public async addEpisode(ep: Omit<Episode, 'id'>): Promise<Episode> {
    return this.request<Episode>('/api/episodes', {
      method: 'POST',
      body: JSON.stringify(ep),
    });
  }

  public async updateEpisode(id: string, updates: Partial<Episode>): Promise<Episode> {
    return this.request<Episode>(`/api/episodes/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  public async deleteEpisode(id: string): Promise<void> {
    await this.request(`/api/episodes/${id}`, { method: 'DELETE' });
  }

  public async addCharacter(name: string): Promise<Character> {
    return this.request<Character>('/api/characters', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  }

  public async updateCharacter(id: string, name: string): Promise<Character> {
    return this.request<Character>(`/api/characters/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ name }),
    });
  }

  public async deleteCharacter(id: string): Promise<void> {
    await this.request(`/api/characters/${id}`, { method: 'DELETE' });
  }

  // --- OVERRIDES & SETTINGS ---
  public async setOverride(key: string, override: Partial<ActivityOverride>): Promise<void> {
    await this.request(`/api/overrides/${encodeURIComponent(key)}`, {
      method: 'PUT',
      body: JSON.stringify(override),
    });
  }

  public async updateSettings(settings: Partial<SystemSettings>): Promise<SystemSettings> {
    return this.request<SystemSettings>('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  }

  // --- SYSTEM ACTIONS ---
  public async resetToBaseline(): Promise<void> {
    await this.request('/api/reset', { method: 'POST' });
  }

  public async importBackup(backupData: any): Promise<void> {
    await this.request('/api/backup/import', {
      method: 'POST',
      body: JSON.stringify(backupData),
    });
  }

  public async getAuditLogs(): Promise<AuditLog[]> {
    return this.request<AuditLog[]>('/api/audit-logs');
  }
}

export const api = new ApiClient();
