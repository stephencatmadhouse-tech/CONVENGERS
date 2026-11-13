/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Notification rules for Convengers Bahay Build.
 *
 * Every notification is DERIVED from records that already exist — the master
 * register (scopes, pours, milestones, episodes, added activities), reports,
 * publications, documents and manually added calendar events. Nothing is
 * stored except each user's read keys and preferences.
 *
 * Keys include the date that triggered the rule, so if a target date moves
 * the notification becomes unread again.
 */

import {
  CalendarEvent,
  NotificationPrefs,
  NotificationType,
  ProjectDocument,
  ProjectReport,
  Publication,
  UserRole,
} from '../types/index.ts';
import { RegisterActivity } from './register.ts';
import { addDays, diffDays, fmtDate, isoDateOf, todayIso } from './dates.ts';

export type NotifPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export const PRIORITY_RANK: Record<NotifPriority, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

export const NOTIF_TYPES: { id: NotificationType; label: string; rule: string }[] = [
  { id: 'overdue', label: 'Overdue', rule: 'Past its target date and not completed (Critical)' },
  { id: 'due', label: 'Due soon', rule: 'Target date within your lead time (Medium)' },
  { id: 'unassigned', label: 'Missing owner / date', rule: 'Starting within 30 days with no owner, or a production item with no date (Medium)' },
  { id: 'blocked', label: 'Blocked / on hold', rule: 'On hold for more than 3 days (High)' },
  { id: 'changed', label: 'New or changed', rule: 'Added or updated by someone else in the last 7 days (Medium)' },
  { id: 'verification', label: 'Awaiting verification', rule: 'Inspection, date confirmation or report / client sign-off waiting more than 3 days (Medium)' },
  { id: 'turnover', label: 'Handover / turnover', rule: 'Handover or turnover within 30 days (High) or 60 days (Medium)' },
  { id: 'document', label: 'New document', rule: 'Document uploaded by someone else in the last 3 days (Low)' },
];

export const DEFAULT_PREFS: NotificationPrefs = { off: {}, leadDays: 3 };

export interface AppNotification {
  key: string;
  type: NotificationType;
  priority: NotifPriority;
  title: string;
  detail: string;
  /** Date the rule refers to (target date, upload date …), YYYY-MM-DD. */
  date?: string;
  /** Recommended next action (used by the Needs Attention list). */
  action: string;
  activityId?: string;
  /** Hash route to open when there is no activity to open. */
  route?: string;
  owner?: string;
  workstream?: string;
}

export interface Viewer {
  name: string;
  email: string;
  role: UserRole;
}

/** What a role is allowed to be notified about. */
export type NotifScope = 'all' | 'assigned' | 'readonly';
export function notifScope(role: UserRole): NotifScope {
  if (role === 'admin' || role === 'manager') return 'all';
  if (role === 'viewer') return 'readonly';
  return 'assigned';
}

const TURNOVER_RE = /turnover|turn-over|handover|hand-over|move-in/i;
export const isTurnover = (name: string) => TURNOVER_RE.test(name);

function nameTokens(v: Viewer): string[] {
  const out = new Set<string>();
  const full = (v.name || '').trim().toLowerCase();
  if (full.length >= 3) out.add(full);
  const first = full.split(/\s+/)[0];
  if (first && first.length >= 3) out.add(first);
  const local = (v.email || '').split('@')[0].toLowerCase();
  if (local.length >= 3) out.add(local);
  return [...out];
}

/** True when the viewer is the owner or a supporting person of the activity. */
export function isAssignedTo(r: { owner?: string; supporting?: string }, v: Viewer): boolean {
  const hay = `${r.owner || ''} | ${r.supporting || ''}`.toLowerCase();
  if (!hay.trim() || hay.trim() === '|') return false;
  return nameTokens(v).some((t) => new RegExp(`(^|[^a-z])${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`).test(hay));
}

function isMe(by: string | undefined, v: Viewer): boolean {
  if (!by) return false;
  const b = by.toLowerCase();
  return b === (v.name || '').toLowerCase() || b === (v.email || '').toLowerCase();
}

export interface NotificationInput {
  register: RegisterActivity[];
  reports?: ProjectReport[];
  publications?: Publication[];
  documents?: ProjectDocument[];
  events?: CalendarEvent[];
  viewer: Viewer;
  prefs?: NotificationPrefs;
  today?: string;
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

export function buildNotifications(input: NotificationInput): AppNotification[] {
  const today = input.today || todayIso();
  const prefs = input.prefs || DEFAULT_PREFS;
  const lead = Math.max(0, Math.min(60, Math.round(prefs.leadDays ?? 3)));
  const scope = notifScope(input.viewer.role);
  const out: AppNotification[] = [];
  const on = (t: NotificationType) => prefs.off?.[t] !== true;
  const add = (n: AppNotification) => {
    if (on(n.type)) out.push(n);
  };

  const visible = (r: RegisterActivity) => scope !== 'assigned' || isAssignedTo(r, input.viewer);
  const label = (r: RegisterActivity) => `${r.id} · ${r.workstream}`;

  input.register.filter(visible).forEach((r) => {
    const open = r.status !== 'Completed';
    const base = { activityId: r.id, owner: r.owner, workstream: r.workstream };

    // 1. Overdue — past target, not completed
    if (open && r.finish && r.finish < today) {
      const late = diffDays(r.finish, today);
      add({
        ...base,
        key: `overdue:${r.id}:${r.finish}`,
        type: 'overdue',
        priority: 'CRITICAL',
        title: r.name,
        detail: `${plural(late, 'day')} past target (${fmtDate(r.finish)}) · ${label(r)}${r.owner ? ` · ${r.owner}` : ' · no owner'}`,
        date: r.finish,
        action: r.owner ? `Agree a recovery date with ${r.owner} and update the target` : 'Assign an owner and agree a recovery date',
      });
    } else if (open && r.status === 'Delayed') {
      add({
        ...base,
        key: `overdue:${r.id}:${r.finish || 'flag'}`,
        type: 'overdue',
        priority: 'CRITICAL',
        title: r.name,
        detail: `Marked delayed · ${label(r)}${r.finish ? ` · target ${fmtDate(r.finish)}` : ''}`,
        date: r.finish,
        action: 'Confirm the recovery plan and revised target date',
      });
    }

    // 2. Due within the lead time
    if (open && r.finish && r.finish >= today && diffDays(today, r.finish) <= lead) {
      const d = diffDays(today, r.finish);
      add({
        ...base,
        key: `due:${r.id}:${r.finish}`,
        type: 'due',
        priority: 'MEDIUM',
        title: r.name,
        detail: `Due ${d === 0 ? 'today' : `in ${plural(d, 'day')}`} (${fmtDate(r.finish)}) · ${label(r)}`,
        date: r.finish,
        action: 'Confirm manpower, materials and readiness for the target date',
      });
    }

    // 3. No owner (items starting within 30 days) / production item without a date
    if (open && !r.owner && (!r.start || r.start <= addDays(today, 30))) {
      add({
        ...base,
        key: `unassigned:${r.id}`,
        type: 'unassigned',
        priority: 'MEDIUM',
        title: r.name,
        detail: `No assigned owner · ${label(r)}${r.start ? ` · starts ${fmtDate(r.start)}` : ''}`,
        date: r.start,
        action: 'Add an owner in the activity editor',
      });
    }
    if (open && r.stream === 'Production' && !r.start) {
      add({
        ...base,
        key: `nodate:${r.id}`,
        type: 'unassigned',
        priority: 'MEDIUM',
        title: r.name,
        detail: `No production date yet · ${label(r)}`,
        action: 'Add the production (shoot) date',
      });
    }

    // 4. Blocked / on hold for more than 3 days
    if (open && r.onHold) {
      const since = isoDateOf(r.lastUpdated || r.lastRevisedAt);
      const d = since ? diffDays(since, today) : undefined;
      if (d === undefined || d > 3) {
        add({
          ...base,
          key: `blocked:${r.id}:${since || 'unknown'}`,
          type: 'blocked',
          priority: 'HIGH',
          title: r.name,
          detail: `On hold${d !== undefined ? ` for ${plural(d, 'day')}` : ' (hold date not recorded)'} · ${label(r)}`,
          date: since,
          action: 'Resolve the blocker or record a decision and new date',
        });
      }
    }

    // 5. New or changed in the last 7 days (by someone else)
    const changed = isoDateOf(r.lastUpdated);
    if (changed && diffDays(changed, today) <= 7 && diffDays(changed, today) >= 0 && !isMe(r.updatedBy, input.viewer)) {
      add({
        ...base,
        key: `changed:${r.id}:${r.lastUpdated}`,
        type: 'changed',
        priority: 'MEDIUM',
        title: r.name,
        detail: `${r.kind === 'manual' && r.revisionCount === 0 ? 'Added' : 'Updated'} ${fmtDate(changed)}${r.updatedBy ? ` by ${r.updatedBy}` : ''} · ${label(r)}`,
        date: changed,
        action: 'Review the change',
      });
    }

    // 6. Awaiting verification / confirmation for more than 3 days
    if (open && r.isInspection) {
      const since = isoDateOf(r.lastUpdated) || r.finish;
      const d = since ? diffDays(since, today) : 0;
      if (d > 3) {
        add({
          ...base,
          key: `verify:${r.id}:${since}`,
          type: 'verification',
          priority: 'MEDIUM',
          title: r.name,
          detail: `Awaiting inspection / verification for ${plural(d, 'day')} · ${label(r)}`,
          date: since,
          action: 'Schedule the inspection and record the result',
        });
      }
    }

    // 7. Handover / turnover within 30 / 60 days
    if (open && isTurnover(r.name) && r.finish && r.finish >= today) {
      const d = diffDays(today, r.finish);
      if (d <= 60) {
        const b = d <= 30 ? 30 : 60;
        add({
          ...base,
          key: `turnover:${r.id}:${b}:${r.finish}`,
          type: 'turnover',
          priority: b === 30 ? 'HIGH' : 'MEDIUM',
          title: r.name,
          detail: `Handover / turnover in ${plural(d, 'day')} (${fmtDate(r.finish)}) · ${label(r)}`,
          date: r.finish,
          action: 'Run the pre-turnover punchlist and client walkthrough plan',
        });
      }
    }
  });

  // Manual calendar entries: handover/turnover and inspections waiting
  (input.events || []).forEach((e) => {
    if (e.done) return;
    if (scope === 'assigned' && !isAssignedTo({ owner: e.owner }, input.viewer)) return;
    if (e.type === 'Handover / turnover' && e.date >= today) {
      const d = diffDays(today, e.date);
      if (d <= 60) {
        const b = d <= 30 ? 30 : 60;
        add({
          key: `turnover:ev:${e.id}:${b}:${e.date}`,
          type: 'turnover',
          priority: b === 30 ? 'HIGH' : 'MEDIUM',
          title: e.title,
          detail: `Handover / turnover in ${plural(d, 'day')} (${fmtDate(e.date)}) · calendar entry`,
          date: e.date,
          action: 'Confirm turnover readiness and attendees',
          route: `calendar/agenda/${e.date}`,
          owner: e.owner,
        });
      }
    }
    if (e.date < today && (e.type === 'Inspection' || e.type === 'Site visit') && diffDays(e.date, today) > 3) {
      add({
        key: `verify:ev:${e.id}:${e.date}`,
        type: 'verification',
        priority: 'MEDIUM',
        title: e.title,
        detail: `${e.type} on ${fmtDate(e.date)} not marked done (${plural(diffDays(e.date, today), 'day')})`,
        date: e.date,
        action: 'Record the result and mark the entry done',
        route: `calendar/agenda/${e.date}`,
        owner: e.owner,
      });
    }
  });

  // Reports / publications waiting for approval or client sign-off (managers decide these)
  if (scope === 'all') {
    (input.reports || []).forEach((r) => {
      if (r.status !== 'review') return;
      const since = isoDateOf(r.updatedAt);
      const d = since ? diffDays(since, today) : 0;
      if (d > 3)
        add({
          key: `verify:rep:${r.id}:${r.updatedAt}`,
          type: 'verification',
          priority: 'MEDIUM',
          title: r.title || 'Report for review',
          detail: `${r.type === 'monthly' ? 'Monthly' : 'Weekly'} report waiting for approval for ${plural(d, 'day')}`,
          date: since,
          action: 'Review and approve (or return) the report',
          route: `reports/${r.type === 'monthly' ? 'monthly' : 'weekly'}`,
        });
    });
    (input.publications || []).forEach((p) => {
      if (p.status !== 'review') return;
      const since = isoDateOf(p.updatedAt);
      const d = since ? diffDays(since, today) : 0;
      if (d > 3)
        add({
          key: `verify:pub:${p.id}:${p.updatedAt}`,
          type: 'verification',
          priority: 'MEDIUM',
          title: p.title || 'Client portal item',
          detail: `Client-portal item waiting for sign-off for ${plural(d, 'day')}`,
          date: since,
          action: 'Approve and publish, or return to draft',
          route: 'publishing',
        });
    });
  }

  // New documents uploaded by someone else in the last 3 days
  if (scope !== 'assigned') {
    (input.documents || []).forEach((doc) => {
      const at = isoDateOf(doc.createdAt);
      if (!at || isMe(doc.createdBy, input.viewer)) return;
      const d = diffDays(at, today);
      if (d < 0 || d > 3) return;
      add({
        key: `doc:${doc.id}`,
        type: 'document',
        priority: 'LOW',
        title: doc.title || doc.fileName || 'New document',
        detail: `${doc.category} · uploaded ${fmtDate(at)}${doc.createdBy ? ` by ${doc.createdBy}` : ''}`,
        date: at,
        action: 'Open the document repository',
        route: 'documents',
        activityId: doc.linkedActivityId,
      });
    });
  }

  // De-duplicate keys (a rule can match the same item twice)
  const seen = new Set<string>();
  return out
    .filter((n) => (seen.has(n.key) ? false : (seen.add(n.key), true)))
    .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || String(a.date || '9999').localeCompare(String(b.date || '9999')));
}
