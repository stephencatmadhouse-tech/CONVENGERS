/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Calendar feed + 60-day forecast for the Calendar page and the Executive
 * Dashboard. Events are derived from existing records (register milestones,
 * construction scopes, pours, production episodes, procurement deliveries)
 * plus manually added calendar entries. Weeks start on Monday; "today" is
 * Asia/Manila.
 */

import { CalendarEvent, ProcurementItem } from '../types/index.ts';
import { RegisterActivity } from './register.ts';
import { isTurnover } from './notifications.ts';
import { addDays, diffDays, isValidIso, weekRange } from './dates.ts';

export type CalType = 'Milestone' | 'Construction' | 'Concrete pour' | 'Production' | 'Inspection' | 'Delivery' | 'Handover / turnover' | 'Manual';

export const CAL_TYPES: { id: CalType; color: string }[] = [
  { id: 'Milestone', color: '#7026C8' },
  { id: 'Construction', color: '#8B35E8' },
  { id: 'Concrete pour', color: '#4F46E5' },
  { id: 'Production', color: '#C02AE0' },
  { id: 'Inspection', color: '#F5A623' },
  { id: 'Delivery', color: '#0E9F9A' },
  { id: 'Handover / turnover', color: '#22A06B' },
  { id: 'Manual', color: '#777777' },
];
export const CAL_COLOR: Record<CalType, string> = Object.fromEntries(CAL_TYPES.map((t) => [t.id, t.color])) as Record<CalType, string>;

export interface CalItem {
  id: string;
  date: string;
  time?: string;
  type: CalType;
  /** "Start" / "Target" / "Delivery" … */
  marker: string;
  title: string;
  sub: string;
  owner: string;
  done: boolean;
  overdue: boolean;
  activityId?: string;
  manualId?: string;
  route?: string;
}

export interface CalInput {
  register: RegisterActivity[];
  procurement?: ProcurementItem[];
  manual?: CalendarEvent[];
  today: string;
}

function typeOf(r: RegisterActivity): CalType {
  if (isTurnover(r.name)) return 'Handover / turnover';
  if (r.isInspection) return 'Inspection';
  if (r.kind === 'pour') return 'Concrete pour';
  if (r.kind === 'milestone') return /inspection/i.test(r.name) ? 'Inspection' : 'Milestone';
  if (r.kind === 'episode') return 'Production';
  if (r.stream === 'Production') return 'Production';
  if (/inspection|site visit/i.test(r.name)) return 'Inspection';
  return 'Construction';
}

const MANUAL_TYPE: Record<CalendarEvent['type'], CalType> = {
  Inspection: 'Inspection',
  'Site visit': 'Inspection',
  Delivery: 'Delivery',
  'Handover / turnover': 'Handover / turnover',
  Meeting: 'Manual',
  Other: 'Manual',
};

/** Every calendar item from the project data, sorted by date. */
export function buildCalendar(input: CalInput): CalItem[] {
  const out: CalItem[] = [];
  const { today } = input;

  input.register.forEach((r) => {
    const type = typeOf(r);
    const done = r.status === 'Completed';
    const sub = `${r.id} · ${r.workstream}`;
    const base = { type, title: r.name, sub, owner: r.owner, done, activityId: r.id };
    const single = !r.finish || r.start === r.finish;
    if (r.kind === 'episode') {
      if (isValidIso(r.start)) out.push({ ...base, id: `${r.id}:shoot`, date: r.start, marker: 'Production', overdue: !done && r.start < today });
      return;
    }
    if (isValidIso(r.start) && !single) out.push({ ...base, id: `${r.id}:start`, date: r.start, marker: 'Start', overdue: false });
    if (isValidIso(r.finish)) out.push({ ...base, id: `${r.id}:target`, date: r.finish, marker: r.kind === 'pour' ? 'Pour' : 'Target', overdue: !done && r.finish < today });
    else if (isValidIso(r.start)) out.push({ ...base, id: `${r.id}:start`, date: r.start, marker: 'Start', overdue: false });
  });

  (input.procurement || [])
    .filter((p) => !p.archived && p.status !== 'Cancelled')
    .forEach((p) => {
      const d = p.actualDelivery || p.expectedDelivery || p.requiredDate;
      if (!isValidIso(d)) return;
      const done = p.status === 'Delivered';
      out.push({
        id: `PRC:${p.id}`,
        date: d,
        type: 'Delivery',
        marker: p.actualDelivery ? 'Delivered' : 'Delivery',
        title: `Delivery: ${p.material}`,
        sub: [p.supplier, p.poNumber ? `PO ${p.poNumber}` : '', p.status].filter(Boolean).join(' · '),
        owner: p.supplier || '',
        done,
        overdue: !done && d < today,
        activityId: p.linkedActivityId,
        route: 'procurement',
      });
    });

  (input.manual || []).forEach((e) => {
    if (!isValidIso(e.date)) return;
    out.push({
      id: `EV:${e.id}`,
      date: e.date,
      time: e.time,
      type: MANUAL_TYPE[e.type] || 'Manual',
      marker: e.type,
      title: e.title,
      sub: e.notes || 'Calendar entry',
      owner: e.owner || '',
      done: !!e.done,
      overdue: !e.done && e.date < today,
      activityId: e.linkedActivityId,
      manualId: e.id,
    });
  });

  return out.sort((a, b) => (a.date + (a.time || '99:99')).localeCompare(b.date + (b.time || '99:99')) || a.title.localeCompare(b.title));
}

export function inRange(items: CalItem[], from: string, to: string): CalItem[] {
  return items.filter((i) => i.date >= from && i.date <= to);
}

// ---------- 60-day forecast ----------

export interface ForecastGroup {
  id: string;
  label: string;
  from: string;
  to: string;
  items: CalItem[];
}

export interface WeekLoad {
  start: string;
  end: string;
  total: number;
  byType: Partial<Record<CalType, number>>;
  overloaded: boolean;
}

export interface Forecast {
  from: string;
  to: string;
  groups: ForecastGroup[];
  counts: { d7: number; d14: number; d30: number; d60: number };
  weeks: WeekLoad[];
  threshold: number;
  noOwner: CalItem[];
}

/** Forecast window from today to +60 days (or the past 60 days when `past`). */
export function buildForecast(items: CalItem[], today: string, past = false): Forecast {
  const from = past ? addDays(today, -60) : today;
  const to = past ? today : addDays(today, 60);
  const win = inRange(items, from, to);
  const wk = weekRange(today);

  let groups: ForecastGroup[];
  if (!past) {
    const g = (id: string, label: string, a: string, b: string): ForecastGroup => ({ id, label, from: a, to: b, items: inRange(win, a, b) });
    const weekEnd = wk.end < addDays(today, 1) ? today : wk.end;
    groups = [
      g('today', 'Today', today, today),
      g('week', 'This Week', addDays(today, 1), weekEnd),
      g('next2', 'Next 2 Weeks', addDays(weekEnd, 1), addDays(weekEnd, 14)),
      g('to30', 'Rest of the Next 30 Days', addDays(weekEnd, 15), addDays(today, 30)),
      g('30-60', '30–60 Days', addDays(today, 31), to),
    ].filter((x) => x.from <= x.to);
  } else {
    const g = (id: string, label: string, a: string, b: string): ForecastGroup => ({ id, label, from: a, to: b, items: inRange(win, a, b).reverse() });
    groups = [
      g('today', 'Today', today, today),
      g('p7', 'Past 7 Days', addDays(today, -7), addDays(today, -1)),
      g('p30', '8–30 Days Ago', addDays(today, -30), addDays(today, -8)),
      g('p60', '31–60 Days Ago', from, addDays(today, -31)),
    ];
  }

  const count = (n: number) => (past ? inRange(items, addDays(today, -n), today) : inRange(items, today, addDays(today, n))).length;

  // ~9 Monday-start weeks covering the window
  const weeks: WeekLoad[] = [];
  let ws = weekRange(from).start;
  for (let i = 0; i < 9; i++) {
    const we = addDays(ws, 6);
    const list = inRange(items, ws, we);
    const byType: Partial<Record<CalType, number>> = {};
    list.forEach((x) => (byType[x.type] = (byType[x.type] || 0) + 1));
    weeks.push({ start: ws, end: we, total: list.length, byType, overloaded: false });
    ws = addDays(ws, 7);
  }
  const totals = weeks.map((w) => w.total);
  const avg = totals.reduce((a, b) => a + b, 0) / (totals.length || 1);
  // A week is overloaded when it carries clearly more than the 9-week average (and at least 8 items)
  const threshold = Math.max(8, Math.ceil(avg * 1.5));
  weeks.forEach((w) => (w.overloaded = w.total >= threshold));

  const noOwner = win.filter((i) => !i.done && !i.owner && i.type !== 'Delivery' && !i.manualId);
  return { from, to, groups, counts: { d7: count(7), d14: count(14), d30: count(30), d60: count(60) }, weeks, threshold, noOwner };
}

export const weekLabel = (w: { start: string; end: string }) => {
  const s = w.start.slice(5).replace('-', '/');
  const e = w.end.slice(5).replace('-', '/');
  return `${s}–${e}`;
};

export { diffDays };
