/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Data integrity: validation of edits, duplicate detection and a project
 * data-health check. Nothing here modifies data.
 */

import { ProgressSnapshot, ScopeItem, Milestone, ConcretePour, Episode, Activity } from '../types/index.ts';
import { RegisterActivity } from './register.ts';
import { ProjectMetrics } from './metrics.ts';
import { isValidIso, todayIso } from './dates.ts';
import { parseDateWindow } from '../utils/calculations.ts';

export interface ActivityEditDraft {
  name: string;
  start?: string;
  finish?: string;
  actualStart?: string;
  actualFinish?: string;
  progress?: number;
  owner?: string;
}

export function validateActivityEdit(d: ActivityEditDraft, today: string = todayIso()): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!d.name || !d.name.trim()) errors.push('Activity name is required.');
  if (d.start && !isValidIso(d.start)) errors.push('Start date is not a valid date.');
  if (d.finish && !isValidIso(d.finish)) errors.push('Finish date is not a valid date.');
  if (d.start && d.finish && d.finish < d.start) errors.push('Finish date cannot be earlier than the start date.');
  if (d.actualStart && !isValidIso(d.actualStart)) errors.push('Actual start is not a valid date.');
  if (d.actualFinish && !isValidIso(d.actualFinish)) errors.push('Actual finish is not a valid date.');
  if (d.actualStart && d.actualFinish && d.actualFinish < d.actualStart) errors.push('Actual finish cannot be earlier than actual start.');
  if (d.actualStart && d.actualStart > today) errors.push('Actual start cannot be in the future.');
  if (d.actualFinish && d.actualFinish > today) errors.push('Actual finish cannot be in the future.');
  if (d.progress !== undefined && (isNaN(d.progress) || d.progress < 0 || d.progress > 100)) errors.push('Progress must be between 0 and 100%.');
  if (d.progress !== undefined && d.progress >= 100 && !d.actualFinish) warnings.push('Progress is 100% but no actual finish date is recorded.');
  if (d.actualFinish && d.progress !== undefined && d.progress < 100) warnings.push('An actual finish date is set but progress is below 100%.');
  if (d.progress !== undefined && d.progress > 0 && !d.actualStart) warnings.push('Progress has started but no actual start date is recorded.');
  if (d.owner !== undefined && !d.owner.trim()) warnings.push('No responsible person assigned.');
  return { errors, warnings };
}

export function findDuplicates(register: RegisterActivity[], name: string, start?: string, finish?: string, ignoreId?: string): RegisterActivity[] {
  const n = name.trim().toLowerCase();
  if (!n) return [];
  return register.filter((r) => {
    if (r.id === ignoreId) return false;
    if (r.name.trim().toLowerCase() !== n) return false;
    if (!start || !r.start) return true;
    const f = finish || start;
    return r.start <= f && start <= (r.finish || r.start);
  });
}

export interface HealthCheckFinding {
  severity: 'error' | 'warning' | 'info';
  area: string;
  message: string;
  refId?: string;
}

export function dataHealthCheck(input: {
  scopes: ScopeItem[];
  milestones: Milestone[];
  pours: ConcretePour[];
  episodes: Episode[];
  activities: Activity[];
  register: RegisterActivity[];
}): HealthCheckFinding[] {
  const out: HealthCheckFinding[] = [];
  const ids = new Map<string, number>();
  input.register.forEach((r) => ids.set(r.id, (ids.get(r.id) || 0) + 1));
  ids.forEach((n, id) => n > 1 && out.push({ severity: 'error', area: 'Unique IDs', message: `Activity ID ${id} appears ${n} times.`, refId: id }));

  input.scopes.forEach((s) => {
    if (!parseDateWindow(s.dateText)) out.push({ severity: 'error', area: 'Scopes', message: `"${s.name}" (${s.floor}) has an unreadable date "${s.dateText}". It is excluded from calendars.`, refId: `SC-${s.id}` });
    if (s.percentComplete < 0 || s.percentComplete > 100) out.push({ severity: 'error', area: 'Scopes', message: `"${s.name}" progress ${s.percentComplete}% is out of range.`, refId: `SC-${s.id}` });
  });
  const scopeNames = new Map<string, number>();
  input.scopes.forEach((s) => {
    const k = `${s.floor}|${s.phase}|${s.name.toLowerCase()}|${s.dateText}`;
    scopeNames.set(k, (scopeNames.get(k) || 0) + 1);
  });
  scopeNames.forEach((n, k) => n > 1 && out.push({ severity: 'warning', area: 'Duplicates', message: `Scope "${k.split('|')[2]}" (${k.split('|')[0]} ${k.split('|')[1]}) is listed ${n} times with the same dates.` }));

  input.milestones.forEach((m) => {
    if (!parseDateWindow(m.dateText)) out.push({ severity: 'error', area: 'Milestones', message: `Milestone "${m.label}" has an unreadable date "${m.dateText}".`, refId: `MS-${m.id}` });
  });
  input.pours.forEach((p) => {
    if (!isValidIso(p.targetPour)) out.push({ severity: 'warning', area: 'Concrete pours', message: `${p.floor} ${p.component} has no valid target pour date.`, refId: `PR-${p.id}` });
    if (isValidIso(p.actualPour) && isValidIso(p.actualCompletion) && p.actualCompletion < p.actualPour)
      out.push({ severity: 'error', area: 'Concrete pours', message: `${p.floor} ${p.component}: actual completion is before actual pour.`, refId: `PR-${p.id}` });
  });
  // Pour dates that disagree with the matching scope of work
  input.pours.forEach((p) => {
    const scope = input.scopes.find((s) => s.floor === p.floor && s.name.trim().toLowerCase() === (p.activity || '').trim().toLowerCase());
    const w = scope ? parseDateWindow(scope.dateText) : null;
    if (scope && w && isValidIso(p.targetPour)) {
      const sStart = `${w[0].getFullYear()}-${String(w[0].getMonth() + 1).padStart(2, '0')}-${String(w[0].getDate()).padStart(2, '0')}`;
      const sEnd = `${w[1].getFullYear()}-${String(w[1].getMonth() + 1).padStart(2, '0')}-${String(w[1].getDate()).padStart(2, '0')}`;
      if (p.targetPour < sStart || p.targetPour > sEnd) {
        out.push({
          severity: 'warning',
          area: 'Schedule consistency',
          message: `${p.floor} ${p.component}: target pour ${p.targetPour} is outside its scope "${scope.name}" (${scope.dateText}). Confirm which date is correct.`,
          refId: `PR-${p.id}`,
        });
      }
    }
  });
  const epNums = new Map<string, number>();
  input.episodes.forEach((e) => {
    const k = e.episodeLabel || String(e.number);
    epNums.set(k, (epNums.get(k) || 0) + 1);
    if (!isValidIso(e.shootStart)) out.push({ severity: 'warning', area: 'Production', message: `Episode ${k} "${e.title}" has no valid shoot start date.`, refId: `EP-${e.id}` });
    if (isValidIso(e.shootStart) && isValidIso(e.shootEnd) && e.shootEnd < e.shootStart)
      out.push({ severity: 'error', area: 'Production', message: `Episode ${k}: shoot end is before shoot start.`, refId: `EP-${e.id}` });
  });
  epNums.forEach((n, k) => n > 1 && out.push({ severity: 'warning', area: 'Duplicates', message: `Episode number ${k} is used ${n} times.` }));
  input.activities.forEach((a) => {
    if (isValidIso(a.startDate) && isValidIso(a.endDate) && a.endDate < a.startDate)
      out.push({ severity: 'error', area: 'Activities', message: `"${a.title}": end date is before start date.`, refId: `AC-${a.id}` });
  });

  const unassigned = input.register.filter((r) => r.status !== 'Completed' && !r.owner.trim() && r.kind !== 'episode').length;
  if (unassigned) out.push({ severity: 'info', area: 'Accountability', message: `${unassigned} open activities have no responsible person.` });
  const noBaseline = input.register.filter((r) => r.kind === 'scope' && r.revisionCount === 0).length;
  if (noBaseline === input.register.filter((r) => r.kind === 'scope').length) {
    out.push({ severity: 'info', area: 'Baseline', message: 'No schedule revisions recorded yet: the current dates are being used as the baseline. Freeze the baseline in Settings to lock it explicitly.' });
  }
  const complete100NoFinish = input.register.filter((r) => r.kind === 'scope' && r.progress >= 100 && !r.actualFinish).length;
  if (complete100NoFinish)
    out.push({ severity: 'info', area: 'Actual dates', message: `${complete100NoFinish} completed scope(s) have no actual finish date recorded. Weekly/monthly completion attribution will use their last-updated date.` });
  return out;
}

/** Build a progress snapshot record from current metrics. */
export function makeSnapshot(metrics: ProjectMetrics, register: RegisterActivity[], userName: string, date: string = todayIso()): ProgressSnapshot {
  return {
    id: date,
    date,
    actualPct: metrics.actualPct,
    plannedPct: metrics.plannedPct,
    workstreams: metrics.workstreams.map((w) => ({ key: w.key, label: w.label, actual: w.actual, planned: w.planned, weight: w.weight })),
    counts: {
      completed: metrics.counts.completed,
      ongoing: metrics.counts.ongoing,
      delayed: metrics.counts.delayed,
      upcoming: metrics.counts.upcoming,
      onHold: metrics.counts.onHold,
    },
    milestonesComplete: metrics.milestonesComplete,
    milestonesTotal: metrics.milestonesTotal,
    episodesCompleted: metrics.episodesCompleted,
    episodesTotal: register.filter((r) => r.kind === 'episode').length,
    capturedAt: new Date().toISOString(),
    capturedBy: userName,
  };
}
