/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Delay & Target-vs-Projected Variance calculations in days, weeks, months,
 * and working days. All values are computed strictly from recorded register
 * dates and ProjectMetrics — nothing is fabricated.
 */

import { RegisterActivity } from './register.ts';
import { ProjectMetrics } from './metrics.ts';
import { addDays, diffDays, isValidIso, maxIso, parseIsoDate, workingDaysBetween } from './dates.ts';

export interface DelayDuration {
  /** Signed calendar days: > 0 = delayed/late, 0 = on target, < 0 = ahead. */
  days: number;
  /** Signed working days (excluding Sundays, PH holidays & stoppage) past target. */
  workingDays: number;
  /** Decimal weeks (signed, 1 decimal place). */
  weeks: number;
  /** Decimal months using average Gregorian month 30.4375 days (signed, 1 decimal place). */
  months: number;
  /** Whole calendar months (always >= 0 magnitude). */
  calendarMonths: number;
  /** Remaining days after whole calendar months (always >= 0). */
  calendarRemDays: number;
  /** Whole weeks within remaining days (always >= 0). */
  remWeeks: number;
  /** Remaining days after weeks (always >= 0). */
  remDays: number;
  /** Human-readable breakdown e.g. "1 mo, 2 wks, 1 day" or "On target". */
  breakdownLabel: string;
}

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Exact calendar month + remainder day difference between two valid ISO dates
 * (from <= to). Uses actual calendar month boundaries.
 */
function calendarMonthsAndDays(fromIso: string, toIso: string): { months: number; remDays: number } {
  const a = parseIsoDate(fromIso);
  const b = parseIsoDate(toIso);
  if (!a || !b || toIso <= fromIso) return { months: 0, remDays: 0 };

  let months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  // Anchor date at a + months, clamped to end of target month
  const anchorYear = a.getFullYear() + Math.floor((a.getMonth() + months) / 12);
  const anchorMonth = (a.getMonth() + months) % 12;
  const maxDom = new Date(anchorYear, anchorMonth + 1, 0).getDate();
  let anchor = new Date(anchorYear, anchorMonth, Math.min(a.getDate(), maxDom));

  if (anchor > b) {
    months--;
    const y2 = a.getFullYear() + Math.floor((a.getMonth() + months) / 12);
    const m2 = (a.getMonth() + months) % 12;
    const max2 = new Date(y2, m2 + 1, 0).getDate();
    anchor = new Date(y2, m2, Math.min(a.getDate(), max2));
  }

  const remDays = Math.max(0, Math.round((b.getTime() - anchor.getTime()) / 86400000));
  return { months: Math.max(0, months), remDays };
}

/** Compute signed delay metrics between a baseline/target date and a projected/actual date. */
export function computeDelayDuration(targetIso?: string, compareIso?: string): DelayDuration {
  if (!isValidIso(targetIso) || !isValidIso(compareIso)) {
    return {
      days: 0,
      workingDays: 0,
      weeks: 0,
      months: 0,
      calendarMonths: 0,
      calendarRemDays: 0,
      remWeeks: 0,
      remDays: 0,
      breakdownLabel: 'On target (0 days)',
    };
  }

  const days = diffDays(targetIso, compareIso);
  if (days === 0) {
    return {
      days: 0,
      workingDays: 0,
      weeks: 0,
      months: 0,
      calendarMonths: 0,
      calendarRemDays: 0,
      remWeeks: 0,
      remDays: 0,
      breakdownLabel: 'On target (0 days)',
    };
  }

  const absDays = Math.abs(days);
  const [early, late] = days > 0 ? [targetIso, compareIso] : [compareIso, targetIso];
  const workingAbs = workingDaysBetween(addDays(early, 1), late);
  const workingDays = days > 0 ? workingAbs : -workingAbs;
  const { months: calMonths, remDays: afterMonths } = calendarMonthsAndDays(early, late);
  const remWeeks = Math.floor(afterMonths / 7);
  const remDays = afterMonths % 7;

  const parts: string[] = [];
  if (calMonths > 0) parts.push(plural(calMonths, 'mo'));
  if (remWeeks > 0) parts.push(plural(remWeeks, 'wk'));
  if (remDays > 0 || parts.length === 0) parts.push(plural(remDays, 'day'));

  const breakdownLabel = days > 0 ? parts.join(', ') : `${parts.join(', ')} ahead`;

  return {
    days,
    workingDays,
    weeks: round1(days / 7),
    months: round1(days / 30.4375),
    calendarMonths: calMonths,
    calendarRemDays: afterMonths,
    remWeeks,
    remDays,
    breakdownLabel,
  };
}

export type DelayCategory = 'Overdue now' | 'Rescheduled slip' | 'Finished late' | 'On / ahead';

export interface ActivityDelayRow {
  activity: RegisterActivity;
  category: DelayCategory;
  baselineDate?: string;
  effectiveDate?: string;
  scheduleSlip: DelayDuration;
  effectiveDelay: DelayDuration;
}

export interface WorkstreamDelaySummary {
  workstream: string;
  total: number;
  delayedCount: number;
  slippedCount: number;
  finishedLateCount: number;
  baselineEnd?: string;
  projectedEnd?: string;
  endDelay: DelayDuration | null;
  maxItemDelay: DelayDuration | null;
}

export interface ProjectDelayReport {
  targetCompletion: string;
  projectedCompletion: string;
  paceCompletion: string | null;
  targetVsProjected: DelayDuration;
  targetVsPace: DelayDuration | null;
  maxOpenOverdue: DelayDuration | null;
  overdueCount: number;
  slippedCount: number;
  finishedLateCount: number;
  totalImpactedCount: number;
  /** Activities with effective delay > 0 days, sorted worst-first. */
  rows: ActivityDelayRow[];
  /** All milestones and concrete pours for target-vs-projected tracking. */
  milestones: ActivityDelayRow[];
  /** Per-workstream summary sorted by max delay descending. */
  workstreams: WorkstreamDelaySummary[];
}

export function buildDelayReport(register: RegisterActivity[], metrics: ProjectMetrics, today: string): ProjectDelayReport {
  const targetCompletion = metrics.targetCompletion;
  const projectedCompletion = metrics.projectedCompletion;
  const paceCompletion = metrics.paceCompletion;

  const targetVsProjected = computeDelayDuration(targetCompletion, projectedCompletion);
  const targetVsPace = paceCompletion ? computeDelayDuration(targetCompletion, paceCompletion) : null;

  const allRows: ActivityDelayRow[] = register.map((r) => {
    const baselineDate = r.plannedFinish || r.finish || r.start;
    const currentFinish = r.finish || r.start;
    const scheduleSlip = computeDelayDuration(r.plannedFinish, r.finish);

    let effectiveDate = currentFinish;
    let category: DelayCategory = 'On / ahead';

    if (r.status === 'Completed') {
      effectiveDate = r.actualFinish || currentFinish;
    } else if (r.status === 'Delayed' || (isValidIso(baselineDate) && baselineDate < today)) {
      effectiveDate = maxIso(currentFinish, today);
    }

    const effectiveDelay = computeDelayDuration(baselineDate, effectiveDate);

    if (r.status === 'Completed') {
      if (effectiveDelay.days > 0) category = 'Finished late';
    } else if (r.status === 'Delayed' || (isValidIso(currentFinish) && currentFinish < today)) {
      category = 'Overdue now';
    } else if (scheduleSlip.days > 0 || effectiveDelay.days > 0) {
      category = 'Rescheduled slip';
    }

    return {
      activity: r,
      category,
      baselineDate,
      effectiveDate,
      scheduleSlip,
      effectiveDelay,
    };
  });

  const rows = allRows
    .filter((row) => row.effectiveDelay.days > 0)
    .sort((a, b) => b.effectiveDelay.days - a.effectiveDelay.days || a.activity.name.localeCompare(b.activity.name));

  const overdueRows = rows.filter((r) => r.category === 'Overdue now');
  const maxOpenOverdue = overdueRows.length ? overdueRows[0].effectiveDelay : null;

  const milestones = allRows
    .filter((row) => row.activity.kind === 'milestone' || row.activity.kind === 'pour')
    .sort((a, b) => String(a.baselineDate || '9999').localeCompare(String(b.baselineDate || '9999')));

  const wsNames = Array.from(new Set(register.map((r) => r.workstream)));
  const workstreams: WorkstreamDelaySummary[] = wsNames
    .map((ws) => {
      const wsRows = allRows.filter((row) => row.activity.workstream === ws);
      const delayedWs = wsRows.filter((row) => row.effectiveDelay.days > 0);
      const baselineEnd = maxIso(...wsRows.map((x) => x.activity.plannedFinish || x.activity.finish));
      const projectedEnd = maxIso(
        ...wsRows.map((x) => (x.activity.status === 'Completed' ? x.activity.actualFinish || x.activity.finish : x.effectiveDate || x.activity.finish))
      );
      const endDelay = baselineEnd && projectedEnd ? computeDelayDuration(baselineEnd, projectedEnd) : null;
      const worst = delayedWs.sort((a, b) => b.effectiveDelay.days - a.effectiveDelay.days)[0];
      return {
        workstream: ws,
        total: wsRows.length,
        delayedCount: wsRows.filter((x) => x.category === 'Overdue now').length,
        slippedCount: wsRows.filter((x) => x.category === 'Rescheduled slip').length,
        finishedLateCount: wsRows.filter((x) => x.category === 'Finished late').length,
        baselineEnd,
        projectedEnd,
        endDelay,
        maxItemDelay: worst ? worst.effectiveDelay : null,
      };
    })
    .sort((a, b) => (b.maxItemDelay?.days || 0) - (a.maxItemDelay?.days || 0) || (b.endDelay?.days || 0) - (a.endDelay?.days || 0));

  return {
    targetCompletion,
    projectedCompletion,
    paceCompletion,
    targetVsProjected,
    targetVsPace,
    maxOpenOverdue,
    overdueCount: rows.filter((r) => r.category === 'Overdue now').length,
    slippedCount: rows.filter((r) => r.category === 'Rescheduled slip').length,
    finishedLateCount: rows.filter((r) => r.category === 'Finished late').length,
    totalImpactedCount: rows.length,
    rows,
    milestones,
    workstreams,
  };
}
