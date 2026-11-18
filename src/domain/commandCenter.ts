/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Command Center — derived views of the existing project records.
 *
 * Every figure here is computed from the same records and the same formulas
 * as the rest of the application (computeMetrics, plannedCurve, progress
 * snapshots). Nothing is stored and nothing is estimated: when a value cannot
 * be computed it is returned as null so the interface can say "Not recorded"
 * instead of showing zero.
 */

import type { RegisterActivity } from './register.ts';
import type { ProjectMetrics } from './metrics.ts';
import { plannedCurve, round1 } from './metrics.ts';
import type { ProgressSnapshot } from '../types/index.ts';
import { addDays, diffDays, monthRange, weekRange } from './dates.ts';
import { progressPoint, completedIn } from './reports.ts';

export type PeriodFilter = 'today' | 'week' | 'month' | 'all';
export const PERIOD_LABEL: Record<PeriodFilter, string> = { today: 'Today', week: 'This Week', month: 'This Month', all: 'All Time' };

/** Calendar range of a period filter (weeks start on Monday; "All Time" starts at the project start). */
export function periodRange(f: PeriodFilter, today: string, projectStart: string): { start: string; end: string } {
  if (f === 'today') return { start: today, end: today };
  if (f === 'week') return weekRange(today);
  if (f === 'month') {
    const m = monthRange(today);
    return { start: m.start, end: m.end };
  }
  return { start: projectStart < today ? projectStart : today, end: today };
}

/** Look-ahead window for "upcoming deadlines" that matches the filter. */
export function lookAhead(f: PeriodFilter, today: string): { start: string; end: string } {
  if (f === 'today') return { start: today, end: today };
  if (f === 'week') return { start: today, end: weekRange(today).end };
  if (f === 'month') return { start: today, end: monthRange(today).end };
  return { start: today, end: addDays(today, 30) };
}

// ------------------------------------------------------------------ S-curve
export interface SCurvePoint {
  date: string;
  planned: number | null;
  actual: number | null;
  forecast: number | null;
}

/**
 * Planned cumulative progress (baseline, weekly), actual cumulative progress
 * (recorded snapshots + today's live figure) and the forecast line from today's
 * actual to 100 % at the projected completion date (the same forecast used by
 * the rest of the system). Weeks without a snapshot have actual = null.
 */
export function sCurve(register: RegisterActivity[], snapshots: ProgressSnapshot[], m: Pick<ProjectMetrics, 'actualPct' | 'projectedCompletion' | 'targetCompletion'>, start: string, today: string): SCurvePoint[] {
  const end = [m.targetCompletion, m.projectedCompletion].filter(Boolean).sort().pop() || today;
  const planned = plannedCurve(register, start, end, 7);
  const byDate = new Map<string, SCurvePoint>();
  planned.forEach((p) => byDate.set(p.date, { date: p.date, planned: p.planned, actual: null, forecast: null }));
  const put = (date: string, patch: Partial<SCurvePoint>) => byDate.set(date, { ...(byDate.get(date) || { date, planned: null, actual: null, forecast: null }), ...patch });
  snapshots
    .filter((s) => s.date >= start && s.date < today)
    .forEach((s) => put(s.date, { actual: round1(s.actualPct), ...(byDate.get(s.date)?.planned == null ? { planned: round1(s.plannedPct) } : {}) }));
  put(today, { actual: round1(m.actualPct), forecast: round1(m.actualPct) });
  const fc = m.projectedCompletion || m.targetCompletion;
  if (fc && fc > today && m.actualPct < 100) put(fc, { forecast: 100 });
  const out = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  // planned value for the extra points (today, forecast date): interpolate from the baseline curve
  out.forEach((p) => {
    if (p.planned !== null) return;
    const before = [...planned].reverse().find((x) => x.date <= p.date);
    const after = planned.find((x) => x.date >= p.date);
    if (before && after && after.date !== before.date) {
      const k = diffDays(before.date, p.date) / diffDays(before.date, after.date);
      p.planned = round1(before.planned + (after.planned - before.planned) * k);
    } else if (before) p.planned = before.planned;
  });
  return out;
}

// ------------------------------------------------------------------ weekly progress
export interface WeekBar {
  start: string;
  end: string;
  /** Percentage-point change of overall actual progress during the week (null when no snapshot exists for either end). */
  gain: number | null;
  /** Planned percentage-point change during the week (baseline). */
  plannedGain: number;
  completed: RegisterActivity[];
  current: boolean;
}

export function weeklyProgress(register: RegisterActivity[], snapshots: ProgressSnapshot[], liveActual: number, today: string, from: string, to: string): WeekBar[] {
  const out: WeekBar[] = [];
  for (let ws = weekRange(from).start; ws <= to; ws = addDays(ws, 7)) {
    const we = addDays(ws, 6);
    const endDay = we < today ? we : today;
    if (ws > today) break;
    const a = progressPoint(register, snapshots, addDays(ws, -1), today, liveActual);
    const b = progressPoint(register, snapshots, endDay, today, liveActual);
    out.push({
      start: ws,
      end: we,
      gain: a.actual !== null && b.actual !== null ? round1(b.actual - a.actual) : null,
      plannedGain: round1(b.planned - a.planned),
      completed: register.filter((r) => completedIn(r, ws, we)),
      current: ws <= today && today <= we,
    });
  }
  return out;
}

// ------------------------------------------------------------------ phases
export type PhaseStatus = 'Completed' | 'On track' | 'Slightly behind' | 'Behind' | 'Not started' | 'Ahead';

export function phaseStatus(actual: number, planned: number): PhaseStatus {
  if (actual >= 99.95) return 'Completed';
  if (actual <= 0 && planned <= 0) return 'Not started';
  const v = actual - planned;
  if (v > 3) return 'Ahead';
  if (v >= 0) return 'On track';
  if (v >= -3) return 'Slightly behind';
  return 'Behind';
}

// ------------------------------------------------------------------ timeline
export type TimelineState = 'Completed' | 'Ongoing' | 'Upcoming' | 'Delayed';

export function timelineState(r: RegisterActivity, today: string): TimelineState {
  if (r.status === 'Completed') return 'Completed';
  if (r.status === 'Delayed' || (r.finish && r.finish < today)) return 'Delayed';
  if (r.start && r.start <= today) return 'Ongoing';
  return 'Upcoming';
}

/** Position (0–100 %) of a date on a timeline. */
export function timelinePos(date: string, start: string, end: string): number {
  const span = Math.max(1, diffDays(start, end));
  return Math.max(0, Math.min(100, (diffDays(start, date) / span) * 100));
}

/** Month ticks between two dates (first day of each month). */
export function monthTicks(start: string, end: string): string[] {
  const out: string[] = [];
  let d = start.slice(0, 8) + '01';
  if (d < start) d = monthRange(addDays(monthRange(start).end, 1)).start;
  for (let i = 0; d <= end && i < 48; i++) {
    out.push(d);
    d = monthRange(addDays(monthRange(d).end, 1)).start;
  }
  return out;
}
