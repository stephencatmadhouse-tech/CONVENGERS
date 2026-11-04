/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Collaborator, RemoteFocus, CellEditEvent, FullDashboardData, User } from '../types/index.ts';

const COLLAB_COLORS = [
  '#4BE08A', // Emerald green
  '#3A9BFF', // Cobalt blue
  '#F5C518', // Convengers yellow
  '#FF5D8F', // Multiverse pink
  '#B58CFF', // Violet
  '#FF9A1F', // Orange
  '#00D2D3', // Teal
  '#FF6B6B', // Coral
];

function getOrCreateClientId(): string {
  if (typeof window === 'undefined') return 'client_node';
  let id = sessionStorage.getItem('convengers_client_id');
  if (!id) {
    id = `c_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    sessionStorage.setItem('convengers_client_id', id);
  }
  return id;
}

function getCollabColor(): string {
  if (typeof window === 'undefined') return COLLAB_COLORS[0];
  let color = localStorage.getItem('convengers_user_color');
  if (!color) {
    color = COLLAB_COLORS[Math.floor(Math.random() * COLLAB_COLORS.length)];
    localStorage.setItem('convengers_user_color', color);
  }
  return color;
}

export class RealtimeClient {
  public clientId: string;
  public userColor: string;
  private ws: WebSocket | null = null;
  private sse: EventSource | null = null;
  private currentUser: User | null = null;
  private customName: string | null = null;
  private activeFocusId: string | null = null;
  private remoteFocusMap: Record<string, RemoteFocus> = {};
  private collaborators: Collaborator[] = [];
  private isConnected: boolean = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;

  // Listeners
  private presenceListeners = new Set<(collaborators: Collaborator[]) => void>();
  private remoteFocusListeners = new Set<(focusMap: Record<string, RemoteFocus>) => void>();
  private cellEditListeners = new Set<(event: CellEditEvent) => void>();
  private dashboardListeners = new Set<(data: FullDashboardData) => void>();
  private connectionListeners = new Set<(connected: boolean) => void>();

  constructor() {
    this.clientId = getOrCreateClientId();
    this.userColor = getCollabColor();
    if (typeof window !== 'undefined') {
      this.customName = localStorage.getItem('convengers_nickname');
    }
  }

  public getDisplayName(): string {
    if (this.customName && this.customName.trim()) return this.customName.trim();
    if (this.currentUser && this.currentUser.name) return this.currentUser.name;
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    return isMobile ? 'Mobile Teammate' : 'Teammate';
  }

  public setDisplayName(name: string) {
    this.customName = name.trim();
    if (typeof window !== 'undefined') {
      localStorage.setItem('convengers_nickname', this.customName);
    }
    this.sendJoin();
  }

  public init(user: User | null) {
    this.currentUser = user;
    this.connectWebSocket();
    this.connectSSEFallback();
    this.startHeartbeat();
  }

  public updateUser(user: User | null) {
    this.currentUser = user;
    this.sendJoin();
  }

  private connectWebSocket() {
    if (typeof window === 'undefined') return;
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.isConnected = true;
        this.notifyConnection(true);
        this.sendJoin();
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          this.handleIncomingMessage(msg);
        } catch (e) {
          console.error('Realtime WS parse error:', e);
        }
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        this.notifyConnection(false);
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        this.isConnected = false;
        this.notifyConnection(false);
        this.ws?.close();
      };
    } catch (err) {
      console.warn('Realtime WS init notice:', err);
      this.scheduleReconnect();
    }
  }

  private connectSSEFallback() {
    if (typeof window === 'undefined') return;
    try {
      this.sse = new EventSource('/api/events');
      this.sse.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          this.handleIncomingMessage(msg);
        } catch {
          // ignore
        }
      };
    } catch {
      // ignore
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.connectWebSocket();
    }, 3000);
  }

  private startHeartbeat() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'HEARTBEAT', clientId: this.clientId }));
      } else {
        // Fallback HTTP heartbeat
        fetch('/api/realtime/heartbeat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clientId: this.clientId,
            userId: this.currentUser?.id || 'usr_guest',
            userName: this.getDisplayName(),
            userRole: this.currentUser?.role || 'viewer',
            userColor: this.userColor,
            focusedCellId: this.activeFocusId,
            device: window.innerWidth < 768 ? 'mobile' : 'desktop',
          }),
        }).catch(() => {});
      }
    }, 15000);
  }

  private sendJoin() {
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    const payload = {
      type: 'JOIN',
      clientId: this.clientId,
      userId: this.currentUser?.id || 'usr_guest',
      userName: this.getDisplayName(),
      userRole: this.currentUser?.role || 'viewer',
      userColor: this.userColor,
      device: isMobile ? 'mobile' : 'desktop',
    };

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
    // Also send via HTTP for instant presence even before WS completes
    fetch('/api/realtime/heartbeat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => {});
  }

  private handleIncomingMessage(msg: any) {
    if (!msg || !msg.type) return;

    if (msg.type === 'PRESENCE_SYNC' && Array.isArray(msg.collaborators)) {
      this.collaborators = msg.collaborators;
      this.presenceListeners.forEach((fn) => fn(this.collaborators));
    } else if (msg.type === 'INIT_SYNC' && msg.collaborators) {
      this.collaborators = msg.collaborators;
      this.presenceListeners.forEach((fn) => fn(this.collaborators));
      if (msg.data) {
        this.dashboardListeners.forEach((fn) => fn(msg.data));
      }
    } else if (msg.type === 'CELL_FOCUS') {
      if (msg.clientId !== this.clientId && msg.cellId) {
        this.remoteFocusMap = {
          ...this.remoteFocusMap,
          [msg.cellId]: {
            clientId: msg.clientId,
            userId: msg.userId,
            userName: msg.userName,
            userColor: msg.userColor,
            cellId: msg.cellId,
          },
        };
        this.remoteFocusListeners.forEach((fn) => fn(this.remoteFocusMap));
      }
    } else if (msg.type === 'CELL_BLUR') {
      if (msg.cellId && this.remoteFocusMap[msg.cellId]?.clientId === msg.clientId) {
        const next = { ...this.remoteFocusMap };
        delete next[msg.cellId];
        this.remoteFocusMap = next;
        this.remoteFocusListeners.forEach((fn) => fn(this.remoteFocusMap));
      }
    } else if (msg.type === 'CELL_EDIT_APPLIED') {
      if (msg.clientId !== this.clientId) {
        this.cellEditListeners.forEach((fn) => fn(msg));
      }
    } else if (msg.type === 'DASHBOARD_UPDATED' && msg.data) {
      this.dashboardListeners.forEach((fn) => fn(msg.data));
    }
  }

  // --- OUTGOING ACTIONS ---
  public focusCell(cellId: string) {
    this.activeFocusId = cellId;
    const payload = { type: 'CELL_FOCUS', clientId: this.clientId, cellId };
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
    fetch('/api/realtime/focus', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => {});
  }

  public blurCell(cellId: string) {
    if (this.activeFocusId === cellId) {
      this.activeFocusId = null;
    }
    const payload = { type: 'CELL_BLUR', clientId: this.clientId, cellId };
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
    fetch('/api/realtime/blur', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => {});
  }

  public editCell(entityType: string, entityId: string, field: string, value: any) {
    const payload = {
      type: 'CELL_EDIT',
      clientId: this.clientId,
      entityType,
      entityId,
      field,
      value,
    };

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    } else {
      // Direct REST fallback
      fetch('/api/realtime/cell-edit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('convengers_auth_token') || ''}`,
        },
        body: JSON.stringify(payload),
      }).catch(() => {});
    }
  }

  // --- EVENT SUBSCRIPTIONS ---
  public onPresence(fn: (collaborators: Collaborator[]) => void) {
    this.presenceListeners.add(fn);
    fn(this.collaborators);
    return () => this.presenceListeners.delete(fn);
  }

  public onRemoteFocus(fn: (focusMap: Record<string, RemoteFocus>) => void) {
    this.remoteFocusListeners.add(fn);
    fn(this.remoteFocusMap);
    return () => this.remoteFocusListeners.delete(fn);
  }

  public onCellEdit(fn: (event: CellEditEvent) => void) {
    this.cellEditListeners.add(fn);
    return () => this.cellEditListeners.delete(fn);
  }

  public onDashboard(fn: (data: FullDashboardData) => void) {
    this.dashboardListeners.add(fn);
    return () => this.dashboardListeners.delete(fn);
  }

  public onConnection(fn: (connected: boolean) => void) {
    this.connectionListeners.add(fn);
    fn(this.isConnected);
    return () => this.connectionListeners.delete(fn);
  }

  private notifyConnection(connected: boolean) {
    this.connectionListeners.forEach((fn) => fn(connected));
  }

  public destroy() {
    if (this.ws) this.ws.close();
    if (this.sse) this.sse.close();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.presenceListeners.clear();
    this.remoteFocusListeners.clear();
    this.cellEditListeners.clear();
    this.dashboardListeners.clear();
    this.connectionListeners.clear();
  }
}

export const realtime = new RealtimeClient();
