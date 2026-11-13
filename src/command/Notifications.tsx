/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Notifications: provider (derived notifications + per-user read state and
 * preferences), the top-bar bell with its dropdown, and the full page.
 */

import React, { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell, CheckCheck, Settings2 } from 'lucide-react';
import './exec.css';
import { useCommand } from './context.tsx';
import { Card, Empty, Banner } from './ui.tsx';
import { useStore } from '../firebase/useStore.ts';
import { documentStore, publicationStore, eventStore } from '../firebase/opsStores.ts';
import { useUserPrefs } from '../firebase/userPrefsStore.ts';
import {
  AppNotification,
  NotifPriority,
  NOTIF_TYPES,
  buildNotifications,
  notifScope,
} from '../domain/notifications.ts';
import { NotificationPrefs, NotificationType } from '../types/index.ts';
import { fmtDate } from '../domain/dates.ts';

export const PRIORITY_COLOR: Record<NotifPriority, { bg: string; fg: string }> = {
  CRITICAL: { bg: '#E5484D', fg: '#FFFFFF' },
  HIGH: { bg: '#F5A623', fg: '#2B1A00' },
  MEDIUM: { bg: '#FFD43B', fg: '#303030' },
  LOW: { bg: '#22A06B', fg: '#FFFFFF' },
};

export const PriorityChip: React.FC<{ p: NotifPriority }> = ({ p }) => (
  <span className="ex-pr" style={{ background: PRIORITY_COLOR[p].bg, color: PRIORITY_COLOR[p].fg }}>
    {p}
  </span>
);

interface NotifApi {
  items: AppNotification[];
  unread: number;
  isRead: (k: string) => boolean;
  markRead: (keys: string[]) => void;
  markUnread: (k: string) => void;
  markAllRead: () => void;
  prefs: NotificationPrefs;
  setPrefs: (p: NotificationPrefs) => void;
  shared: boolean;
  open: (n: AppNotification) => void;
}

const Ctx = createContext<NotifApi | null>(null);
export function useNotifications(): NotifApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useNotifications must be used inside NotificationsProvider');
  return v;
}

export const NotificationsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { register, reports, user, today, actions } = useCommand();
  const docs = useStore(documentStore);
  const pubs = useStore(publicationStore);
  const events = useStore(eventStore);
  const up = useUserPrefs(user.id);

  const items = useMemo(
    () =>
      buildNotifications({
        register,
        reports,
        publications: pubs.items,
        documents: docs.items,
        events: events.items,
        viewer: { name: user.name, email: user.email, role: user.role },
        prefs: up.state.prefs,
        today,
      }),
    [register, reports, pubs.items, docs.items, events.items, user.name, user.email, user.role, up.state.prefs, today]
  );
  const readSet = useMemo(() => new Set(up.state.readKeys), [up.state.readKeys]);
  const unread = items.filter((n) => !readSet.has(n.key)).length;

  const api: NotifApi = {
    items,
    unread,
    isRead: (k) => readSet.has(k),
    markRead: up.markRead,
    markUnread: up.markUnread,
    markAllRead: () => up.markRead(items.map((n) => n.key)),
    prefs: up.state.prefs,
    setPrefs: up.setPrefs,
    shared: up.shared,
    open: (n) => {
      up.markRead([n.key]);
      if (n.activityId && register.some((r) => r.id === n.activityId)) actions.openActivity(n.activityId);
      else if (n.route) actions.navigate(n.route);
    },
  };
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
};

const NotifRow: React.FC<{ n: AppNotification; read: boolean; onOpen: () => void; compact?: boolean }> = ({ n, read, onOpen, compact }) => (
  <button type="button" className={`ex-ni ${read ? '' : 'unread'}`} onClick={onOpen}>
    <span className="ex-ni-dot" aria-label={read ? 'Read' : 'Unread'} />
    <span className="ex-ni-body">
      <span className="ex-ni-top">
        <PriorityChip p={n.priority} />
        <span className="ex-ni-type">{NOTIF_TYPES.find((t) => t.id === n.type)?.label}</span>
        {n.date && <span className="ex-ni-date">{fmtDate(n.date)}</span>}
      </span>
      <span className="ex-ni-title">{n.title}</span>
      <span className="ex-ni-detail">{n.detail}</span>
      {!compact && <span className="ex-ni-act">Next: {n.action}</span>}
    </span>
  </button>
);

/** Bell icon with unread badge and dropdown panel (top bar). */
export const NotificationBell: React.FC = () => {
  const n = useNotifications();
  const { actions } = useCommand();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number }>({ top: 60, left: 16, width: 400 });

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const r = ref.current?.getBoundingClientRect();
      if (!r) return;
      const vw = document.documentElement.clientWidth || window.innerWidth;
      const width = Math.min(400, vw - 32);
      const left = Math.max(16, Math.min(Math.round(r.right - width), vw - width - 16));
      setPos({ top: Math.round(r.bottom + 8), left, width });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || panel.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const list = [...n.items].sort((a, b) => Number(n.isRead(a.key)) - Number(n.isRead(b.key))).slice(0, 8);

  return (
    <div className="ex-bell-wrap" ref={ref}>
      <button
        type="button"
        className="ex-bell"
        aria-label={`Notifications${n.unread ? `, ${n.unread} unread` : ''}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        title="Notifications"
      >
        <Bell size={18} strokeWidth={2} aria-hidden />
        {n.unread > 0 && <span className="ex-bell-badge">{n.unread > 99 ? '99+' : n.unread}</span>}
      </button>
      {open &&
        createPortal(
        <div className="ex-np" role="dialog" aria-label="Notifications" ref={panel} style={{ top: pos.top, left: pos.left, width: pos.width }}>
          <div className="ex-np-h">
            <b>Notifications</b>
            <span className="cv-dim">{n.unread} unread</span>
            <button type="button" className="cv-btn sm ghost" onClick={n.markAllRead} disabled={!n.unread}>
              <CheckCheck size={14} aria-hidden /> Mark all read
            </button>
          </div>
          <div className="ex-np-list">
            {list.length === 0 ? (
              <div className="cv-empty" style={{ margin: 10 }}>You're all caught up — no notifications.</div>
            ) : (
              list.map((x) => (
                <NotifRow
                  key={x.key}
                  n={x}
                  read={n.isRead(x.key)}
                  compact
                  onOpen={() => {
                    setOpen(false);
                    n.open(x);
                  }}
                />
              ))
            )}
          </div>
          <button
            type="button"
            className="ex-np-all"
            onClick={() => {
              setOpen(false);
              actions.navigate('notifications');
            }}
          >
            View all notifications ({n.items.length})
          </button>
        </div>,
          document.body
        )}
    </div>
  );
};

/** Full Notifications page. */
export const NotificationsPage: React.FC = () => {
  const n = useNotifications();
  const { user } = useCommand();
  const scope = notifScope(user.role);
  const [show, setShow] = useState<'all' | 'unread'>('all');
  const [prio, setPrio] = useState<'' | NotifPriority>('');
  const [type, setType] = useState<'' | NotificationType>('');
  const [showPrefs, setShowPrefs] = useState(false);

  const counts = (['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as NotifPriority[]).map((p) => ({ p, c: n.items.filter((x) => x.priority === p).length }));
  const rows = n.items.filter((x) => (show === 'all' || !n.isRead(x.key)) && (!prio || x.priority === prio) && (!type || x.type === type));

  const togglePref = (t: NotificationType) => n.setPrefs({ ...n.prefs, off: { ...n.prefs.off, [t]: !n.prefs.off[t] } });

  return (
    <div className="cv-grid" style={{ gap: 14 }}>
      {scope === 'assigned' && (
        <Banner>Showing notifications for activities where you are the owner or a supporting person ({user.name}).</Banner>
      )}
      {scope === 'readonly' && <Banner>Read-only access: you receive project notifications; changes are made by the project team.</Banner>}
      {!n.shared && (
        <Banner kind="warn">Read status and preferences are saved in this browser until the updated Firestore rules (userPrefs) are deployed.</Banner>
      )}

      <div className="ex-pcount">
        {counts.map(({ p, c }) => (
          <button key={p} type="button" className={`ex-pcount-b ${prio === p ? 'on' : ''}`} onClick={() => setPrio(prio === p ? '' : p)}>
            <PriorityChip p={p} />
            <b>{c}</b>
          </button>
        ))}
      </div>

      <Card
        title={`Notifications · ${n.unread} unread`}
        note="Derived from the master register, reports, documents and calendar entries. Click a notification to open the related activity or page."
        actions={
          <>
            <div className="ex-seg" role="tablist">
              <button type="button" className={show === 'all' ? 'on' : ''} onClick={() => setShow('all')}>
                All ({n.items.length})
              </button>
              <button type="button" className={show === 'unread' ? 'on' : ''} onClick={() => setShow('unread')}>
                Unread ({n.unread})
              </button>
            </div>
            <select className="cv-input" value={type} onChange={(e) => setType(e.target.value as any)} aria-label="Filter by type" style={{ width: 'auto' }}>
              <option value="">All types</option>
              {NOTIF_TYPES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
            <button type="button" className="cv-btn sm" onClick={n.markAllRead} disabled={!n.unread}>
              <CheckCheck size={14} aria-hidden /> Mark all read
            </button>
            <button type="button" className="cv-btn sm ghost" onClick={() => setShowPrefs((v) => !v)} aria-expanded={showPrefs}>
              <Settings2 size={14} aria-hidden /> Preferences
            </button>
          </>
        }
      >
        {showPrefs && (
          <div className="ex-prefs">
            <div className="ex-prefs-lead">
              <label>
                <span>“Due soon” lead time</span>
                <input
                  type="number"
                  min={0}
                  max={30}
                  className="cv-input"
                  value={n.prefs.leadDays}
                  onChange={(e) => n.setPrefs({ ...n.prefs, leadDays: Math.max(0, Math.min(30, Number(e.target.value) || 0)) })}
                  style={{ width: 80 }}
                />
                <span className="cv-dim">days</span>
              </label>
            </div>
            <div className="ex-prefs-grid">
              {NOTIF_TYPES.map((t) => (
                <label key={t.id} className="ex-pref">
                  <input type="checkbox" checked={!n.prefs.off[t.id]} onChange={() => togglePref(t.id)} />
                  <span>
                    <b>{t.label}</b>
                    <em>{t.rule}</em>
                  </span>
                </label>
              ))}
            </div>
            <div className="cv-dim" style={{ fontSize: 12 }}>Preferences are personal — they only change what you are notified about.</div>
          </div>
        )}
        {rows.length === 0 ? (
          <Empty>{n.items.length ? 'No notifications match these filters.' : 'No notifications right now — nothing is overdue, due soon or waiting.'}</Empty>
        ) : (
          <div className="ex-nlist">
            {rows.map((x) => (
              <div key={x.key} className="ex-nrow">
                <NotifRow n={x} read={n.isRead(x.key)} onOpen={() => n.open(x)} />
                <button
                  type="button"
                  className="cv-btn sm ghost ex-nrow-t"
                  onClick={() => (n.isRead(x.key) ? n.markUnread(x.key) : n.markRead([x.key]))}
                >
                  {n.isRead(x.key) ? 'Mark unread' : 'Mark read'}
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};
