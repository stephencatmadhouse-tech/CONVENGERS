/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * PRODUCTION CALENDAR & STAKEHOLDER SCHEDULING
 *
 * One schedule, stored in the existing calendar collection (`events`):
 *   production team proposes → administrator approves → (stakeholder-visible) publish
 *   → a sanitized copy is written to the existing client-portal collection (`portal`, kind "event")
 *   → every later edit of a published event re-publishes it automatically.
 *
 * Stakeholders also see the construction schedule and milestones from the latest
 * published Project Status Update. Nothing internal (personnel names, notes,
 * internal-only events, unpublished files) ever reaches the client portal.
 */

import type { CalendarEvent, EventChange, EventStatus, ProdCategory } from '../types/index.ts';
import type { PortalRecord, PortalSnapshot } from './portal.ts';
import { addDays, diffDays, isValidIso, monthRange, weekRange } from './dates.ts';

export const PROD_CATEGORIES: { id: ProdCategory; label: string; short: string; color: string; subs: string[] }[] = [
  { id: 'construction', label: 'Construction Activities', short: 'Construction', color: '#0A1140', subs: ['Structural works', 'Concrete pouring', 'Masonry works', 'Electrical works', 'Plumbing works', 'Roofing', 'Architectural and finishing works'] },
  { id: 'content', label: 'Content Production', short: 'Content', color: '#7B4DFF', subs: ['Episode filming', 'B-roll shooting', 'Site documentation', 'Interviews', 'Behind-the-scenes content'] },
  { id: 'photo', label: 'Photography & Videography', short: 'Photo & Video', color: '#0B7A75', subs: ['Progress photography', 'Project documentation', 'Drone footage', 'Marketing content shoots'] },
  { id: 'meeting', label: 'Meetings & Coordination', short: 'Meetings', color: '#1F6FE0', subs: ['Client meetings', 'Site meetings', 'Design coordination', 'Contractor meetings', 'Technical discussions'] },
  { id: 'milestone', label: 'Project Milestones', short: 'Milestones', color: '#B7791F', subs: ['Construction phase completion', 'Major project accomplishments', 'Target completion dates', 'Project turnover'] },
  { id: 'announcement', label: 'Stakeholder Announcements', short: 'Announcements', color: '#C81E33', subs: ['Important project announcements', 'Schedule changes', 'Upcoming activities', 'Progress releases'] },
];
export const CATEGORY: Record<ProdCategory, (typeof PROD_CATEGORIES)[number]> = Object.fromEntries(PROD_CATEGORIES.map((c) => [c.id, c])) as any;

export const EVENT_STATUSES: EventStatus[] = ['Scheduled', 'Confirmed', 'Ongoing', 'Completed', 'Rescheduled', 'Postponed', 'Cancelled'];
export const STATUS_TONE: Record<EventStatus, 'neutral' | 'good' | 'info' | 'warn' | 'bad' | 'done'> = {
  Scheduled: 'neutral',
  Confirmed: 'good',
  Ongoing: 'info',
  Completed: 'done',
  Rescheduled: 'warn',
  Postponed: 'warn',
  Cancelled: 'bad',
};
export const DEPARTMENTS = ['Construction', 'Engineering', 'Production', 'Photography & Video', 'Design', 'Project Management', 'Client Relations'];

/** Older calendar entries (Inspection, Site visit, Delivery, …) have no category: map them. */
export function categoryOf(e: Pick<CalendarEvent, 'category' | 'type'>): ProdCategory {
  if (e.category) return e.category;
  if (e.type === 'Meeting' || e.type === 'Site visit') return 'meeting';
  if (e.type === 'Handover / turnover') return 'milestone';
  return 'construction';
}
export function statusOf(e: Pick<CalendarEvent, 'status' | 'done'>): EventStatus {
  return e.status || (e.done ? 'Completed' : 'Scheduled');
}

const slot = (e: Partial<CalendarEvent>) => ({ date: e.date, endDate: e.endDate || e.date, time: e.time || '', endTime: e.endTime || '', status: e.status || '' });

/** Schedule modification record (previous / updated date and status, editor, time). */
export function changeEntry(prev: CalendarEvent | undefined, next: CalendarEvent, by: string, at = new Date().toISOString()): EventChange | null {
  if (!prev) return { at, by, action: next.approval === 'proposed' ? 'Proposed' : 'Created', to: slot(next) };
  const a = slot(prev);
  const b = slot(next);
  const moved = a.date !== b.date || a.endDate !== b.endDate || a.time !== b.time || a.endTime !== b.endTime;
  const st = a.status !== b.status;
  if (!moved && !st) return null;
  const action = moved ? 'Rescheduled' : `Status: ${b.status || 'Scheduled'}`;
  return { at, by, action, from: a, to: b };
}

// ------------------------------------------------------------------ publishing
export interface PortalEventContent {
  eventId: string;
  title: string;
  description: string;
  category: ProdCategory;
  subcategory: string;
  start: string;
  end: string;
  startTime: string;
  endTime: string;
  location: string;
  department: string;
  phase: string;
  status: EventStatus;
  photos: { url: string; caption: string }[];
  attachments: { title: string; url: string }[];
  /** Latest stakeholder-relevant change: shown as an update indicator on the portal. */
  update?: { kind: 'Added' | 'Rescheduled' | 'Postponed' | 'Cancelled' | 'Updated'; at: string; previous?: { start?: string; startTime?: string } };
}

export const portalEventId = (eventId: string) => `EVT-${eventId}`;

/** Can this event appear on the client portal? */
export const isPublishable = (e: CalendarEvent) => e.visibility === 'stakeholder' && e.approval !== 'proposed';

/** Client-safe copy of an event: no personnel names, internal notes or internal files. */
export function portalEventRecord(e: CalendarEvent, by: string, prevContent?: PortalEventContent): PortalRecord {
  const status = statusOf(e);
  const at = new Date().toISOString();
  const content: PortalEventContent = {
    eventId: e.id,
    title: e.title,
    description: (e.description || '').trim(),
    category: categoryOf(e),
    subcategory: e.subcategory || '',
    start: e.date,
    end: e.endDate || e.date,
    startTime: e.time || '',
    endTime: e.endTime || '',
    location: e.location || '',
    department: e.department || '',
    phase: e.phase || '',
    status,
    photos: (e.photos || []).map((p) => ({ url: `/api/drive/file/${encodeURIComponent(p.fileId)}`, caption: p.caption || '' })),
    attachments: (e.attachments || []).filter((x) => x.fileId).map((x) => ({ title: x.title, url: `/api/drive/file/${encodeURIComponent(x.fileId!)}` })),
  };
  // update indicator
  if (!prevContent) content.update = { kind: 'Added', at };
  else if (status === 'Cancelled' && prevContent.status !== 'Cancelled') content.update = { kind: 'Cancelled', at, previous: { start: prevContent.start, startTime: prevContent.startTime } };
  else if (status === 'Postponed' && prevContent.status !== 'Postponed') content.update = { kind: 'Postponed', at, previous: { start: prevContent.start, startTime: prevContent.startTime } };
  else if (prevContent.start !== content.start || prevContent.startTime !== content.startTime || prevContent.end !== content.end)
    content.update = { kind: 'Rescheduled', at, previous: { start: prevContent.start, startTime: prevContent.startTime } };
  else content.update = prevContent.update;
  return { id: portalEventId(e.id), kind: 'event', title: e.title, publishedAt: at, publishedBy: by, periodStart: content.start, periodEnd: content.end, content };
}

// ------------------------------------------------------------------ client view
export interface ClientEvent {
  id: string;
  title: string;
  description: string;
  category: ProdCategory;
  subcategory: string;
  start: string;
  end: string;
  startTime: string;
  endTime: string;
  location: string;
  department: string;
  phase: string;
  status: EventStatus;
  photos: { url: string; caption: string }[];
  attachments: { title: string; url: string }[];
  update?: PortalEventContent['update'];
  /** "schedule": from the published Project Status Update (construction schedule and milestones). */
  source: 'event' | 'schedule';
}

const SNAP_STATUS: Record<string, EventStatus> = { Completed: 'Completed', 'In Progress': 'Ongoing', Upcoming: 'Scheduled', 'Schedule Update Required': 'Rescheduled' };
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Published events + the construction schedule and milestones of the latest published status update. */
export function clientEvents(portal: PortalRecord[], snapshot?: PortalSnapshot | null): ClientEvent[] {
  const out: ClientEvent[] = portal
    .filter((r) => r.kind === 'event' && r.content?.start)
    .map((r) => {
      const c = r.content as PortalEventContent;
      return { ...c, id: r.id, source: 'event' as const };
    });
  const seen = new Set(out.map((e) => `${norm(e.title)}|${e.end}`));
  if (snapshot) {
    (snapshot.milestones || []).forEach((m, i) => {
      if (!isValidIso(m.target)) return;
      const k = `${norm(m.label)}|${m.target}`;
      if (seen.has(k)) return;
      seen.add(k);
      out.push({
        id: `ms-${i}`,
        title: m.label,
        description: m.revised && m.baseline ? `Target revised from ${m.baseline}.` : '',
        category: 'milestone',
        subcategory: /turnover/i.test(m.label) ? 'Project turnover' : 'Construction phase completion',
        start: m.actual || m.target!,
        end: m.actual || m.target!,
        startTime: '',
        endTime: '',
        location: '',
        department: 'Construction',
        phase: '',
        status: SNAP_STATUS[m.status] || (m.status === 'Completed' ? 'Completed' : 'Scheduled'),
        photos: [],
        attachments: [],
        source: 'schedule',
      });
    });
    (snapshot.activities || []).forEach((a, i) => {
      if (!isValidIso(a.start)) return;
      const end = isValidIso(a.finish) ? a.finish! : a.start!;
      const k = `${norm(a.name)}|${end}`;
      if (seen.has(k)) return;
      seen.add(k);
      out.push({
        id: `act-${i}`,
        title: a.name,
        description: a.progress ? `${a.progress}% complete as of the latest status update.` : '',
        category: 'construction',
        subcategory: a.category || 'Structural works',
        start: a.start!,
        end,
        startTime: '',
        endTime: '',
        location: '',
        department: 'Construction',
        phase: a.phase || '',
        status: SNAP_STATUS[a.status] || 'Scheduled',
        photos: [],
        attachments: [],
        source: 'schedule',
      });
    });
  }
  return out.sort((a, b) => (a.start + (a.startTime || '99')).localeCompare(b.start + (b.startTime || '99')) || a.title.localeCompare(b.title));
}

export const onDay = (e: Pick<ClientEvent, 'start' | 'end'>, d: string) => e.start <= d && d <= (e.end || e.start);
export const overlapsRange = (e: Pick<ClientEvent, 'start' | 'end'>, s: string, t: string) => e.start <= t && (e.end || e.start) >= s;

/** Next upcoming activities (not finished, not cancelled), chronological; today and the next 7 days flagged. */
export function upcomingEvents(list: ClientEvent[], today: string, n = 8): (ClientEvent & { when: 'today' | 'week' | 'later'; countdown: number | null })[] {
  return list
    .filter((e) => (e.end || e.start) >= today && e.status !== 'Completed' && e.status !== 'Cancelled')
    .sort((a, b) => (a.start + (a.startTime || '99')).localeCompare(b.start + (b.startTime || '99')))
    .slice(0, n)
    .map((e) => {
      const first = e.start < today ? today : e.start;
      const d = diffDays(today, first);
      return { ...e, when: onDay(e, today) ? ('today' as const) : d <= 7 ? ('week' as const) : ('later' as const), countdown: e.category === 'milestone' ? Math.max(0, diffDays(today, e.start)) : null };
    });
}

/** Recently changed published events (added, rescheduled, postponed, cancelled) within `days`. */
export function recentUpdates(list: ClientEvent[], today: string, days = 14): ClientEvent[] {
  return list
    .filter((e) => e.update && diffDays(e.update.at.slice(0, 10), today) <= days)
    .sort((a, b) => (b.update!.at || '').localeCompare(a.update!.at || ''));
}

/** Monday-first weeks covering a month. */
export function monthGrid(anchor: string): string[][] {
  const m = monthRange(anchor);
  const weeks: string[][] = [];
  for (let d = weekRange(m.start).start; d <= m.end; d = addDays(d, 7)) weeks.push(Array.from({ length: 7 }, (_, i) => addDays(d, i)));
  return weeks;
}

export const fmtTime12 = (t?: string) => {
  if (!t || !/^\d{1,2}:\d{2}/.test(t)) return '';
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};
