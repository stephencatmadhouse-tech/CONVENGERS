/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ScopeItem, ConcretePour, Milestone } from '../types';

export const PHILIPPINE_HOLIDAYS_SET = new Set([
  '2026-11-02', // All Souls' Day
  '2026-11-16', // NCR special non-working (Proc 1449)
  '2026-11-17', // NCR special non-working (Proc 1449)
  '2026-11-18', // NCR special non-working (Proc 1449)
  '2026-11-30', // Bonifacio Day
  '2026-12-08', // Feast of the Immaculate Conception
  '2026-12-24', // Christmas Eve
  '2026-12-25', // Christmas Day
  '2026-12-30', // Rizal Day
  '2026-12-31', // Last Day of Year
  '2027-01-01', // New Year's Day
  '2027-02-06', // Chinese New Year
  '2027-03-25', // Maundy Thursday
  '2027-03-26', // Good Friday
  '2027-03-27', // Black Saturday
  '2027-04-09', // Araw ng Kagitingan
]);

export const WORK_STOPPAGE_START = new Date(2026, 11, 20); // Dec 20, 2026
export const WORK_STOPPAGE_END = new Date(2027, 0, 3);    // Jan 3, 2027
export const PROJECT_START = new Date(2026, 9, 5);        // Oct 5, 2026
export const PROJECT_END = new Date(2027, 3, 30);         // Apr 30, 2027

const MONTH_MAP: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
};

export function toIsoDate(d: Date | null): string {
  if (!d || isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseIsoDate(s: string | undefined): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3]);
}

/**
 * Parses date window strings like "Oct 5–6, 2026", "Jan 7–Feb 13, 2027", "Mar 18–Apr 3, 2027"
 */
export function parseDateWindow(text: string): [Date, Date] | null {
  if (!text) return null;
  const cleaned = text.replace(/\s+/g, ' ').trim();
  
  if (/^Dec 20\s*[–-]\s*Jan 3/i.test(cleaned)) {
    return [new Date(2026, 11, 20), new Date(2027, 0, 3)];
  }

  const regex = /^\s*([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2})(?:,\s*(\d{4}))?(?:\s*[–-]\s*(?:([A-Za-z]{3})[a-z]*\.?\s+)?(\d{1,2})(?:,\s*(\d{4}))?)?/i;
  const match = regex.exec(cleaned);
  if (!match) return null;

  const m1 = MONTH_MAP[match[1].toLowerCase()];
  if (m1 === undefined) return null;

  const year1 = match[3] ? +match[3] : match[6] ? +match[6] : 2026;
  const year2 = match[6] ? +match[6] : match[3] ? +match[3] : year1;

  const m2 = match[4] ? MONTH_MAP[match[4].toLowerCase()] : m1;
  if (m2 === undefined) return null;

  const d1 = +match[2];
  const d2 = match[5] ? +match[5] : d1;

  const startDate = new Date(year1, m1, d1);
  const endDate = new Date(year2, m2, d2);

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return null;
  return [startDate, endDate];
}

/**
 * Counts working days (Monday-Saturday), excluding Sundays, declared holidays, and work stoppage period.
 */
export function calculateWorkingDays(start: Date, end: Date): number {
  if (start > end) return 0;
  let count = 0;
  const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const final = new Date(end.getFullYear(), end.getMonth(), end.getDate());

  while (cur <= final) {
    const dayOfWeek = cur.getDay(); // 0 = Sunday
    const isoKey = toIsoDate(cur);
    const inStoppage = cur >= WORK_STOPPAGE_START && cur <= WORK_STOPPAGE_END;

    if (dayOfWeek !== 0 && !PHILIPPINE_HOLIDAYS_SET.has(isoKey) && !inStoppage) {
      count++;
    }
    cur.setDate(cur.getDate() + 1);
  }

  return count;
}

/**
 * Calculates live schedule elapsed percentage as of today.
 */
export function calculateScheduleElapsed(today: Date = new Date()): {
  elapsedPercent: number;
  totalWorkingDays: number;
  elapsedWorkingDays: number;
} {
  const totalDays = calculateWorkingDays(PROJECT_START, PROJECT_END);
  const normalizedToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  if (normalizedToday <= PROJECT_START) {
    return { elapsedPercent: 0, totalWorkingDays: totalDays, elapsedWorkingDays: 0 };
  }

  const cappedToday = normalizedToday > PROJECT_END ? PROJECT_END : normalizedToday;
  const elapsedDays = calculateWorkingDays(PROJECT_START, cappedToday);
  const elapsedPercent = totalDays > 0 ? Math.min(100, Math.round((elapsedDays / totalDays) * 100)) : 0;

  return { elapsedPercent, totalWorkingDays: totalDays, elapsedWorkingDays: elapsedDays };
}

/**
 * Calculates floor-specific progress weighted by working days.
 */
export function calculateFloorProgress(scopes: ScopeItem[], floor: 'GF' | '2F' | '3F'): number {
  const floorScopes = scopes.filter(s => s.floor === floor);
  if (!floorScopes.length) return 0;

  let totalWeight = 0;
  let weightedProgress = 0;

  floorScopes.forEach(s => {
    const weight = s.workingDays > 0 ? s.workingDays : 1;
    totalWeight += weight;
    weightedProgress += weight * (s.percentComplete || 0);
  });

  return totalWeight > 0 ? Math.round(weightedProgress / totalWeight) : 0;
}

/**
 * Calculates milestone overall status percentage based on milestone statuses.
 * Complete = 100%, In progress = 50%, other = 0%
 */
export function calculateMilestonesCompletion(milestones: Milestone[]): number {
  if (!milestones.length) return 0;
  let score = 0;

  milestones.forEach(m => {
    if (m.status === 'Complete') {
      score += 1;
    } else if (m.status === 'In progress') {
      score += 0.5;
    }
  });

  return Math.round((score / milestones.length) * 100);
}

/**
 * Calculates concrete pour milestones completion percentage.
 */
export function calculateConcreteCompletion(pours: ConcretePour[], floor?: 'GF' | '2F' | '3F'): {
  total: number;
  completed: number;
  percent: number;
} {
  const filtered = floor ? pours.filter(p => p.floor === floor) : pours;
  if (!filtered.length) return { total: 0, completed: 0, percent: 0 };

  const completed = filtered.filter(p => p.milestoneStatus === 'Completed / Approved').length;
  const percent = Math.round((completed / filtered.length) * 100);

  return { total: filtered.length, completed, percent };
}

/**
 * Checks if a pour is overdue.
 */
export function isPourOverdue(pour: ConcretePour, today: Date = new Date()): boolean {
  if (pour.milestoneStatus === 'Completed / Approved') return false;
  const normToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const targetCompletion = parseIsoDate(pour.targetCompletion);
  if (targetCompletion && targetCompletion < normToday) return true;

  const targetPour = parseIsoDate(pour.targetPour);
  if (
    targetPour &&
    targetPour < normToday &&
    !pour.actualPour &&
    pour.pourStatus !== 'Completed' &&
    !['Pouring Ongoing', 'Pouring Completed', 'Curing Ongoing'].includes(pour.milestoneStatus)
  ) {
    return true;
  }

  return false;
}
