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
 * Parses date window strings like "Oct 5–6, 2026", "Jan 7–Feb 13, 2027", "November 3-10, 2026",
 * "Nov 16, 2026", "11/03/2026 - 11/10/2026", "2026-11-03 to 2026-11-10", or single dates.
 */
export function parseDateWindow(text: string): [Date, Date] | null {
  if (!text) return null;
  const cleaned = text.replace(/\s+/g, ' ').trim();

  // Work stoppage shorthand
  if (/^Dec 20\s*[–—-]|to\s*Jan 3/i.test(cleaned)) {
    return [new Date(2026, 11, 20), new Date(2027, 0, 3)];
  }

  // ISO format: YYYY-MM-DD or YYYY-MM-DD to YYYY-MM-DD
  const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s*(?:[–—-]|to|through)\s*(\d{4})-(\d{1,2})-(\d{1,2}))?/i.exec(cleaned);
  if (isoMatch) {
    const s = new Date(+isoMatch[1], +isoMatch[2] - 1, +isoMatch[3]);
    const e = isoMatch[4] ? new Date(+isoMatch[4], +isoMatch[5] - 1, +isoMatch[6]) : s;
    if (!isNaN(s.getTime()) && !isNaN(e.getTime())) return [s, e];
  }

  // Slash format: MM/DD/YYYY or M/D/YYYY
  const slashMatch = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?:\s*(?:[–—-]|to|through)\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?)?/i.exec(cleaned);
  if (slashMatch) {
    const y1 = slashMatch[3] ? (+slashMatch[3] < 100 ? 2000 + +slashMatch[3] : +slashMatch[3]) : (+slashMatch[1] >= 10 ? 2026 : 2027);
    const y2 = slashMatch[6] ? (+slashMatch[6] < 100 ? 2000 + +slashMatch[6] : +slashMatch[6]) : (slashMatch[4] ? (+slashMatch[4] >= 10 ? 2026 : 2027) : y1);
    const s = new Date(y1, +slashMatch[1] - 1, +slashMatch[2]);
    const e = slashMatch[4] ? new Date(y2, +slashMatch[4] - 1, +slashMatch[5]) : s;
    if (!isNaN(s.getTime()) && !isNaN(e.getTime())) return [s, e];
  }

  // Standard text format: Month Day[, Year] [–-to Month Day[, Year]]
  const regex = /^\s*([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,\s*(\d{4}))?(?:\s*(?:[–—-]|to|through)\s*(?:([A-Za-z]{3})[a-z]*\.?\s+)?(\d{1,2})(?:st|nd|rd|th)?(?:,\s*(\d{4}))?)?/i;
  const match = regex.exec(cleaned);
  if (!match) return null;

  const m1 = MONTH_MAP[match[1].toLowerCase()];
  if (m1 === undefined) return null;

  const defYear1 = m1 >= 9 ? 2026 : 2027; // Oct, Nov, Dec -> 2026; Jan-Sep -> 2027
  const year1 = match[3] ? +match[3] : match[6] ? +match[6] : defYear1;

  const m2 = match[4] ? MONTH_MAP[match[4].toLowerCase()] : m1;
  if (m2 === undefined) return null;

  const defYear2 = m2 >= 9 ? 2026 : 2027;
  const year2 = match[6] ? +match[6] : match[3] ? (m2 < m1 ? 2027 : +match[3]) : defYear2;

  const d1 = +match[2];
  const d2 = match[5] ? +match[5] : d1;

  const startDate = new Date(year1, m1, d1);
  const endDate = new Date(year2, m2, d2);

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return null;
  return [startDate, endDate];
}

/**
 * Counts working days (Monday-Saturday), excluding Sundays, declared holidays, and work stoppage period.
 * Returns at least 1 for any valid date range (start <= end).
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

export const PHASE_TIMELINE_WINDOWS: Record<string, { start: Date; end: Date; span: number }> = {
  'GF_Structural': { start: new Date(2026, 9, 5), end: new Date(2027, 0, 20), span: 108 },
  'GF_Finishing': { start: new Date(2027, 0, 7), end: new Date(2027, 3, 14), span: 98 },
  '2F_Structural': { start: new Date(2026, 10, 14), end: new Date(2027, 0, 27), span: 75 },
  '2F_Finishing': { start: new Date(2026, 11, 1), end: new Date(2027, 1, 5), span: 67 },
  '3F_Structural': { start: new Date(2026, 10, 28), end: new Date(2027, 1, 3), span: 68 },
  '3F_Finishing': { start: new Date(2027, 1, 8), end: new Date(2027, 3, 7), span: 59 },
};

/**
 * Automatically recalculates working days and timeline bar position (leftPct & widthPct)
 * for a scope item whenever its dates are edited or revised.
 */
export function recalculateScopeTimeline(
  scope: ScopeItem,
  newDateText?: string,
  allScopesInPhase?: ScopeItem[]
): {
  dateText: string;
  workingDays: number;
  leftPct: number;
  widthPct: number;
} {
  const targetDateText = (newDateText !== undefined ? newDateText : scope.dateText || '').trim();
  const win = parseDateWindow(targetDateText);

  if (!win) {
    return {
      dateText: targetDateText || scope.dateText,
      workingDays: scope.workingDays > 0 ? scope.workingDays : 1,
      leftPct: scope.leftPct || 0,
      widthPct: scope.widthPct || 10,
    };
  }

  const [startDate, endDate] = win;
  const rawWorkingDays = calculateWorkingDays(startDate, endDate);
  const isStoppage = startDate >= WORK_STOPPAGE_START && endDate <= WORK_STOPPAGE_END;
  const workingDays = isStoppage ? 0 : Math.max(1, rawWorkingDays);

  const phaseKey = `${scope.floor}_${scope.phase}`;
  const baseline = PHASE_TIMELINE_WINDOWS[phaseKey] || {
    start: PROJECT_START,
    end: PROJECT_END,
    span: Math.max(1, Math.round((PROJECT_END.getTime() - PROJECT_START.getTime()) / 86400000)),
  };

  let phaseStart = baseline.start.getTime();
  let phaseEnd = baseline.end.getTime();

  if (allScopesInPhase && allScopesInPhase.length > 0) {
    allScopesInPhase.forEach((s) => {
      const sWin = s.id === scope.id ? win : parseDateWindow(s.dateText);
      if (sWin) {
        if (sWin[0].getTime() < phaseStart) phaseStart = sWin[0].getTime();
        if (sWin[1].getTime() > phaseEnd) phaseEnd = sWin[1].getTime();
      }
    });
  } else {
    if (startDate.getTime() < phaseStart) phaseStart = startDate.getTime();
    if (endDate.getTime() > phaseEnd) phaseEnd = endDate.getTime();
  }

  const calculatedSpan = Math.round((phaseEnd - phaseStart) / 86400000);
  const totalSpan = Math.max(baseline.span, calculatedSpan, 1);
  const daysFromStart = Math.max(0, Math.round((startDate.getTime() - phaseStart) / 86400000));
  const durationDays = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1);

  const leftPct = +Math.min(99, (daysFromStart / totalSpan) * 100).toFixed(2);
  const widthPct = +Math.max(0.8, Math.min(100 - leftPct, (durationDays / totalSpan) * 100)).toFixed(2);

  return {
    dateText: targetDateText,
    workingDays,
    leftPct,
    widthPct,
  };
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
