/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Project performance metrics computed from the master register.
 * Every figure is derived from recorded data — no value is estimated or
 * invented. Where a number is a projection it is labelled as such.
 */

import { Milestone } from '../types/index.ts';
import { RegisterActivity, plannedPercentAt } from './register.ts';
import { addDays, diffDays, fmtDate, isValidIso, maxIso, minIso, todayIso, workingDaysBetween } from './dates.ts';
import { PROJECT_START, PROJECT_END, toIsoDate, parseDateWindow } from '../utils/calculations.ts';

export type HealthLevel = 'On Track' | 'At Risk' | 'Critical';

export interface WorkstreamMetric {
  key: string;
  label: string;
  actual: number; // 0–100 within workstream
  planned: number;
  weight: number; // share of total (%)
  count: number;
  completed: number;
  delayed: number;
}

export interface ProjectMetrics {
  asOf: string;
  actualPct: number; // overall physical accomplishment (weighted)
  plannedPct: number; // baseline planned accomplishment as of asOf
  variancePct: number; // actual − planned (percentage points)
  spi: number | null; // schedule performance index (actual / planned)
  targetCompletion: string;
  projectedCompletion: string; // from current schedule + open delays
  paceCompletion: string | null; // indicative, at current SPI
  completionVarianceDays: number; // projected − target (positive = late)
  unrescheduledOverdue: number; // delayed items whose dates were not revised
  health: HealthLevel;
  healthReasons: string[];
  counts: { completed: number; ongoing: number; delayed: number; upcoming: number; onHold: number; total: number };
  workstreams: WorkstreamMetric[];
  milestonesComplete: number;
  milestonesTotal: number;
  episodesCompleted: number;
  episodesTotal: number;
  elapsedPct: number;
}

export function targetCompletionDate(milestones: Milestone[]): string {
  const turnover = milestones.find((m) => /turnover/i.test(m.label)) || milestones.find((m) => /move-in/i.test(m.label));
  const w = turnover ? parseDateWindow(turnover.dateText) : null;
  return w ? toIsoDate(w[1]) : toIsoDate(PROJECT_END);
}

export function projectStartDate(): string {
  return toIsoDate(PROJECT_START);
}

const WS_ORDER = ['GF · Structural', '2F · Structural', '3F · Structural', 'GF · Finishing', '2F · Finishing', '3F · Finishing'];

export function computeMetrics(register: RegisterActivity[], milestones: Milestone[], asOf: string = todayIso()): ProjectMetrics {
  const scopes = register.filter((r) => r.kind === 'scope');
  const totalWeight = scopes.reduce((s, r) => s + r.weight, 0) || 1;
  const actualPct = scopes.reduce((s, r) => s + (r.weight * r.progress) / 100, 0) / (totalWeight / 100);
  const plannedPct =
    scopes.reduce((s, r) => s + (r.weight * plannedPercentAt(r.plannedStart, r.plannedFinish, asOf)) / 100, 0) / (totalWeight / 100);
  const variancePct = actualPct - plannedPct;
  const spi = plannedPct > 0.5 ? actualPct / plannedPct : null;

  // Workstreams
  const wsMap = new Map<string, RegisterActivity[]>();
  scopes.forEach((r) => {
    const arr = wsMap.get(r.workstream) || [];
    arr.push(r);
    wsMap.set(r.workstream, arr);
  });
  const workstreams: WorkstreamMetric[] = Array.from(wsMap.entries())
    .map(([key, items]) => {
      const w = items.reduce((s, r) => s + r.weight, 0) || 1;
      return {
        key,
        label: key,
        actual: items.reduce((s, r) => s + r.weight * r.progress, 0) / w,
        planned: items.reduce((s, r) => s + r.weight * plannedPercentAt(r.plannedStart, r.plannedFinish, asOf), 0) / w,
        weight: items.reduce((s, r) => s + r.weight, 0),
        count: items.length,
        completed: items.filter((r) => r.status === 'Completed').length,
        delayed: items.filter((r) => r.status === 'Delayed').length,
      };
    })
    .sort((a, b) => WS_ORDER.indexOf(a.key) - WS_ORDER.indexOf(b.key));

  const counts = { completed: 0, ongoing: 0, delayed: 0, upcoming: 0, onHold: 0, total: register.length };
  register.forEach((r) => {
    if (r.status === 'Completed') counts.completed++;
    else if (r.status === 'Ongoing') counts.ongoing++;
    else if (r.status === 'Delayed') counts.delayed++;
    else if (r.status === 'On Hold') counts.onHold++;
    else counts.upcoming++;
  });

  // Projected completion from the current schedule: latest current finish of
  // any unfinished construction item; overdue unfinished items are pushed to
  // at least the as-of date (their remaining work cannot finish in the past).
  // Projected completion = the latest finish in the CURRENT (revised) schedule
  // of construction scopes and milestones. Overdue items that have not been
  // re-scheduled are reported separately (`unrescheduledOverdue`) instead of
  // being silently assumed to push the end date.
  const target = targetCompletionDate(milestones);
  const construction = register.filter((r) => r.kind === 'scope' || r.kind === 'milestone' || r.kind === 'pour');
  const projected = maxIso(...construction.map((r) => r.finish)) || target;
  const unrescheduledOverdue = construction.filter((r) => r.status === 'Delayed').length;

  let paceCompletion: string | null = null;
  if (spi && spi > 0 && spi < 1 && actualPct < 100) {
    const start = projectStartDate();
    const totalWd = workingDaysBetween(start, target);
    const elapsedWd = workingDaysBetween(start, asOf);
    const remainingWd = Math.max(0, totalWd - elapsedWd);
    paceCompletion = addWorkingDays(asOf, Math.round(remainingWd / spi));
  }

  const completionVarianceDays = diffDays(target, projected);
  const healthReasons: string[] = [];
  let health: HealthLevel = 'On Track';
  if (variancePct < -10) {
    health = 'Critical';
    healthReasons.push(`Physical accomplishment is ${Math.abs(variancePct).toFixed(1)} pts behind plan`);
  } else if (variancePct < -3) {
    health = 'At Risk';
    healthReasons.push(`Physical accomplishment is ${Math.abs(variancePct).toFixed(1)} pts behind plan`);
  }
  if (completionVarianceDays > 0) {
    health = completionVarianceDays > 14 ? 'Critical' : health === 'Critical' ? 'Critical' : 'At Risk';
    healthReasons.push(`Projected completion ${fmtDate(projected)} is ${completionVarianceDays} day(s) after target`);
  }
  const criticalDelayed = register.filter((r) => r.status === 'Delayed' && (r.priority === 'Critical' || r.isMilestone));
  if (criticalDelayed.length) {
    if (health === 'On Track') health = 'At Risk';
    healthReasons.push(`${criticalDelayed.length} critical item(s) / milestone(s) delayed`);
  }
  if (counts.delayed > 0 && health === 'On Track') {
    health = 'At Risk';
    healthReasons.push(`${counts.delayed} delayed activit${counts.delayed === 1 ? 'y' : 'ies'}`);
  }
  if (!healthReasons.length) healthReasons.push('Progress matches the baseline plan and no activities are delayed');

  const ms = register.filter((r) => r.kind === 'milestone');
  const eps = register.filter((r) => r.kind === 'episode');
  const projStart = projectStartDate();
  const elapsedPct = Math.round(plannedPercentAt(projStart, target, asOf));

  return {
    asOf,
    actualPct: round1(actualPct),
    plannedPct: round1(plannedPct),
    variancePct: round1(variancePct),
    spi: spi === null ? null : Math.round(spi * 100) / 100,
    targetCompletion: target,
    projectedCompletion: projected,
    paceCompletion,
    completionVarianceDays,
    unrescheduledOverdue,
    health,
    healthReasons,
    counts,
    workstreams: workstreams.map((w) => ({ ...w, actual: round1(w.actual), planned: round1(w.planned), weight: round1(w.weight) })),
    milestonesComplete: ms.filter((m) => m.status === 'Completed').length,
    milestonesTotal: ms.length,
    episodesCompleted: eps.filter((e) => e.status === 'Completed').length,
    episodesTotal: eps.length,
    elapsedPct,
  };
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Add N working days (Mon–Sat, excluding holidays/stoppage) to an ISO date. */
export function addWorkingDays(iso: string, n: number): string {
  let cur = iso;
  let added = 0;
  let guard = 0;
  while (added < n && guard < 2000) {
    cur = addDays(cur, 1);
    if (workingDaysBetween(cur, cur) === 1) added++;
    guard++;
  }
  return cur;
}

/** Planned S-curve: baseline planned accomplishment at each week end. */
export function plannedCurve(register: RegisterActivity[], fromIso: string, toIso: string, stepDays = 7): { date: string; planned: number }[] {
  const scopes = register.filter((r) => r.kind === 'scope');
  const totalWeight = scopes.reduce((s, r) => s + r.weight, 0) || 1;
  const out: { date: string; planned: number }[] = [];
  let d = fromIso;
  let guard = 0;
  while (d <= toIso && guard < 200) {
    const p = scopes.reduce((s, r) => s + r.weight * plannedPercentAt(r.plannedStart, r.plannedFinish, d), 0) / totalWeight;
    out.push({ date: d, planned: round1(p) });
    d = addDays(d, stepDays);
    guard++;
  }
  if (out.length && out[out.length - 1].date !== toIso) {
    const p = scopes.reduce((s, r) => s + r.weight * plannedPercentAt(r.plannedStart, r.plannedFinish, toIso), 0) / totalWeight;
    out.push({ date: toIso, planned: round1(p) });
  }
  return out;
}

/**
 * Critical path over declared dependencies. Starting from the item with the
 * latest current finish, walk back through the predecessor that finishes
 * last. Returns an empty list when no dependencies are recorded — the UI then
 * explains that dependencies must be defined (nothing is guessed).
 */
export function criticalPath(register: RegisterActivity[]): string[] {
  const byId = new Map(register.map((r) => [r.id, r]));
  const hasDeps = register.some((r) => r.dependsOn.length > 0);
  if (!hasDeps) return [];
  // Ends: items that are depended on by nobody but have dependencies themselves
  const dependedOn = new Set(register.flatMap((r) => r.dependsOn));
  const ends = register.filter((r) => r.dependsOn.length > 0 && !dependedOn.has(r.id) && r.finish);
  if (!ends.length) return [];
  ends.sort((a, b) => (b.finish || '').localeCompare(a.finish || ''));
  const path: string[] = [];
  let cur: RegisterActivity | undefined = ends[0];
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    path.unshift(cur.id);
    const preds: RegisterActivity[] = cur.dependsOn.map((id) => byId.get(id)).filter((x): x is RegisterActivity => !!x);
    preds.sort((a, b) => (b.finish || '').localeCompare(a.finish || ''));
    cur = preds[0];
  }
  return path;
}

/** Dependency checks: predecessors unfinished while successor is due to start. */
export function dependencyConflicts(register: RegisterActivity[], asOf: string = todayIso(), horizonDays = 14) {
  const byId = new Map(register.map((r) => [r.id, r]));
  const out: { activity: RegisterActivity; predecessor: RegisterActivity; reason: string }[] = [];
  register.forEach((r) => {
    if (r.status === 'Completed' || !r.start) return;
    const startsSoon = diffDays(asOf, r.start) <= horizonDays;
    r.dependsOn.forEach((pid) => {
      const p = byId.get(pid);
      if (!p || p.status === 'Completed') return;
      if (p.finish && r.start && p.finish >= r.start) {
        out.push({ activity: r, predecessor: p, reason: `${p.name} finishes ${fmtDate(p.finish)}, on/after this start (${fmtDate(r.start)})` });
      } else if (startsSoon && p.status === 'Delayed') {
        out.push({ activity: r, predecessor: p, reason: `Predecessor ${p.name} is delayed` });
      }
    });
  });
  return out;
}

export function scheduleWindow(register: RegisterActivity[]): { start: string; end: string } {
  const start = minIso(...register.map((r) => r.plannedStart), ...register.map((r) => r.start)) || projectStartDate();
  const end = maxIso(...register.map((r) => r.plannedFinish), ...register.map((r) => r.finish)) || toIsoDate(PROJECT_END);
  return { start, end };
}

export function isActiveOn(r: RegisterActivity, iso: string): boolean {
  if (!isValidIso(r.start)) return false;
  const f = r.finish || r.start;
  return r.start <= iso && iso <= f;
}
