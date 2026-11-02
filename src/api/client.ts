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
    return this.request<FullDashboardData>('/api/data/all');
  }

  // --- MILESTONES ---
  public async updateMilestone(id: string, updates: Partial<Milestone>): Promise<Milestone> {
    return this.request<Milestone>(`/api/milestones/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  // --- SCOPES ---
  public async updateScopeProgress(id: string, percent: number): Promise<ScopeItem> {
    return this.request<ScopeItem>(`/api/scopes/${id}/progress`, {
      method: 'PUT',
      body: JSON.stringify({ percent }),
    });
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
