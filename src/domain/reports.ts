/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * WEEKLY & MONTHLY REPORTING ENGINE
 * Builds report content from the master register, the issue log and the
 * daily progress snapshots. Draft reports are recomputed live; approving a
 * report freezes this content into the report record so later schedule
 * changes never silently alter an approved historical report.
 */

import { ProjectIssue, ProgressSnapshot, ProjectReport, Milestone } from '../types/index.ts';
import { RegisterActivity, plannedPercentAt } from './register.ts';
import { computeMetrics, ProjectMetrics, round1 } from './metrics.ts';
import { AlignmentRow, buildAlignment } from './alignment.ts';
import { buildAttention, buildOutlook, OutlookClass } from './attention.ts';
import { addDays, fmtDate, fmtRange, monthLabel, monthRange, todayIso, weekRange } from './dates.ts';

export interface ReportRow {
  id: string;
  name: string;
  workstream: string;
  owner: string;
  start?: string;
  finish?: string;
  plannedFinish?: string;
  status: string;
  progress: number;
  planned: number;
  note: string;
}

export interface IssueRow {
  id: string;
  title: string;
  type: string;
  severity: string;
  status: string;
  owner: string;
  dueDate?: string;
  correctiveAction: string;
}

export interface ProgressPoint {
  date: string;
  actual: number | null;
  planned: number;
  source: 'snapshot' | 'live' | 'none';
}

export interface WeeklyContent {
  kind: 'weekly';
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  metrics: Pick<ProjectMetrics, 'actualPct' | 'plannedPct' | 'variancePct' | 'spi' | 'health' | 'healthReasons' | 'projectedCompletion' | 'targetCompletion'>;
  progressStart: ProgressPoint;
  progressEnd: ProgressPoint;
  progressGain: number | null;
  completed: ReportRow[];
  ongoing: ReportRow[];
  delayed: ReportRow[];
  constructionUpdates: ReportRow[];
  productionUpdates: ReportRow[];
  milestones: ReportRow[];
  nextWeek: ReportRow[];
  issuesOpen: IssueRow[];
  issuesRaised: IssueRow[];
  issuesResolved: IssueRow[];
  correctiveActions: { title: string; action: string; owner: string }[];
  autoSummary: string;
}

export interface MonthlyContent {
  kind: 'monthly';
  periodStart: string;
  periodEnd: string;
  monthKey: string;
  generatedAt: string;
  metrics: WeeklyContent['metrics'];
  progressStart: ProgressPoint;
  progressEnd: ProgressPoint;
  progressGain: number | null;
  workstreams: ProjectMetrics['workstreams'];
  weekly: { id: string; title: string; status: string; actual: number | null; summary: string; saved: boolean }[];
  construction: { completed: ReportRow[]; delayed: ReportRow[]; ongoing: ReportRow[] };
  production: { shoots: ReportRow[]; completed: number; scheduled: number; tentative: number; rescheduled: number };
  milestones: ReportRow[];
  issuesRaised: IssueRow[];
  issuesResolved: IssueRow[];
  issuesOpen: IssueRow[];
  nextMonth: (ReportRow & { outlook: OutlookClass; reasons: string[] })[];
  autoRecommendations: string[];
  autoSummary: string;
}

export type ReportContent = WeeklyContent | MonthlyContent;

function row(r: RegisterActivity, asOf: string, note = ''): ReportRow {
  return {
    id: r.id,
    name: r.name,
    workstream: r.workstream,
    owner: r.owner || 'Unassigned',
    start: r.start,
    finish: r.finish,
    plannedFinish: r.plannedFinish,
    status: r.status,
    progress: r.progress,
    planned: Math.round(plannedPercentAt(r.plannedStart, r.plannedFinish, asOf)),
    note: note || r.remarks || '',
  };
}

function issueRow(i: ProjectIssue): IssueRow {
  return {
    id: i.id,
    title: i.title,
    type: i.type,
    severity: i.severity,
    status: i.status,
    owner: i.owner || 'Unassigned',
    dueDate: i.dueDate,
    correctiveAction: i.correctiveAction || '',
  };
}

const inRange = (iso: string | undefined, s: string, e: string) => !!iso && iso.slice(0, 10) >= s && iso.slice(0, 10) <= e;

/** Snapshot on or before a date (closest). */
export function snapshotAt(snapshots: ProgressSnapshot[], iso: string): ProgressSnapshot | undefined {
  return [...snapshots].filter((s) => s.date <= iso).sort((a, b) => b.date.localeCompare(a.date))[0];
}

function progressPoint(register: RegisterActivity[], snapshots: ProgressSnapshot[], iso: string, today: string, liveActual: number): ProgressPoint {
  const scopes = register.filter((r) => r.kind === 'scope');
  const w = scopes.reduce((s, r) => s + r.weight, 0) || 1;
  const planned = round1(scopes.reduce((s, r) => s + r.weight * plannedPercentAt(r.plannedStart, r.plannedFinish, iso), 0) / w);
  if (iso >= today) return { date: iso, actual: liveActual, planned, source: 'live' };
  const snap = snapshots.find((s) => s.date === iso) || snapshotAt(snapshots, iso);
  // Only accept a snapshot within 3 days of the requested date
  if (snap && Math.abs(new Date(iso).getTime() - new Date(snap.date).getTime()) <= 3 * 86400000) {
    return { date: snap.date, actual: snap.actualPct, planned, source: 'snapshot' };
  }
  return { date: iso, actual: null, planned, source: 'none' };
}

function completedIn(r: RegisterActivity, s: string, e: string): boolean {
  if (r.status !== 'Completed') return false;
  if (r.actualFinish) return inRange(r.actualFinish, s, e);
  return inRange(r.lastUpdated, s, e);
}

export function buildWeeklyContent(
  register: RegisterActivity[],
  milestones: Milestone[],
  issues: ProjectIssue[],
  snapshots: ProgressSnapshot[],
  anyDateInWeek: string,
  today: string = todayIso()
): WeeklyContent {
  const { start, end } = weekRange(anyDateInWeek);
  const asOf = end < today ? end : today;
  const metrics = computeMetrics(register, milestones, asOf);
  const nextStart = addDays(end, 1);
  const nextEnd = addDays(end, 7);

  const completed = register.filter((r) => completedIn(r, start, end)).map((r) => row(r, asOf, r.actualFinish ? `Finished ${fmtDate(r.actualFinish)}` : 'Completion recorded this week'));
  const ongoing = register
    .filter((r) => r.status !== 'Completed' && r.start && r.start <= end && (r.finish || r.start) >= start && r.status !== 'Delayed')
    .map((r) => row(r, asOf));
  const delayed = register.filter((r) => r.status === 'Delayed' && r.finish && r.finish <= end).map((r) => row(r, asOf, `Due ${fmtDate(r.finish)}`));
  const constructionUpdates = register
    .filter((r) => (r.kind === 'scope' || r.kind === 'pour') && inRange(r.lastUpdated, start, end))
    .map((r) => row(r, asOf, r.updatedBy ? `Updated by ${r.updatedBy}` : 'Updated'));
  const productionUpdates = register
    .filter((r) => r.kind === 'episode' && (inRange(r.lastUpdated, start, end) || (r.start && r.start <= end && (r.finish || r.start) >= start)))
    .map((r) => row(r, asOf, `${r.episodeStatus || ''} · ${fmtRange(r.start, r.finish)}`));
  const milestonesRows = register
    .filter((r) => (r.kind === 'milestone' || r.kind === 'pour') && r.finish && r.finish >= start && (r.start || r.finish) <= nextEnd)
    .map((r) => row(r, asOf));
  const nextWeek = register
    .filter((r) => r.status !== 'Completed' && r.start && r.start <= nextEnd && (r.finish || r.start) >= nextStart)
    .map((r) => row(r, asOf));

  const issuesOpen = issues.filter((i) => i.status !== 'Resolved' && i.status !== 'Closed').map(issueRow);
  const issuesRaised = issues.filter((i) => inRange(i.raisedDate, start, end)).map(issueRow);
  const issuesResolved = issues.filter((i) => (i.status === 'Resolved' || i.status === 'Closed') && inRange(i.updatedAt, start, end)).map(issueRow);
  const correctiveActions = [
    ...issues.filter((i) => i.correctiveAction && i.status !== 'Closed').map((i) => ({ title: i.title, action: i.correctiveAction!, owner: i.owner })),
    ...register.filter((r) => r.correctiveAction && r.status !== 'Completed').map((r) => ({ title: r.name, action: r.correctiveAction, owner: r.owner })),
  ];

  const ps = progressPoint(register, snapshots, addDays(start, -1), today, metrics.actualPct);
  const pe = progressPoint(register, snapshots, end, today, metrics.actualPct);
  const gain = ps.actual !== null && pe.actual !== null ? round1(pe.actual - ps.actual) : null;

  const autoSummary = [
    `Week of ${fmtRange(start, end)}: overall physical accomplishment ${metrics.actualPct}% against ${metrics.plannedPct}% planned (${fmtVar(metrics.variancePct)}). Project health: ${metrics.health}.`,
    gain !== null ? `Progress gained this week: ${gain >= 0 ? '+' : ''}${gain} pts.` : 'Weekly progress gain is not available because no progress snapshot was recorded at the start of the week.',
    `${completed.length} activit${completed.length === 1 ? 'y' : 'ies'} completed, ${ongoing.length} ongoing, ${delayed.length} delayed.`,
    nextWeek.length ? `${nextWeek.length} activit${nextWeek.length === 1 ? 'y is' : 'ies are'} scheduled for next week.` : '',
    issuesOpen.length ? `${issuesOpen.length} open issue(s) / risk(s) on the log.` : '',
  ]
    .filter(Boolean)
    .join(' ');

  return {
    kind: 'weekly',
    periodStart: start,
    periodEnd: end,
    generatedAt: new Date().toISOString(),
    metrics: pickMetrics(metrics),
    progressStart: ps,
    progressEnd: pe,
    progressGain: gain,
    completed,
    ongoing,
    delayed,
    constructionUpdates,
    productionUpdates,
    milestones: milestonesRows,
    nextWeek,
    issuesOpen,
    issuesRaised,
    issuesResolved,
    correctiveActions,
    autoSummary,
  };
}

export function buildMonthlyContent(
  register: RegisterActivity[],
  milestones: Milestone[],
  issues: ProjectIssue[],
  snapshots: ProgressSnapshot[],
  reports: ProjectReport[],
  anyDateInMonth: string,
  today: string = todayIso()
): MonthlyContent {
  const { start, end, key } = monthRange(anyDateInMonth);
  const asOf = end < today ? end : today;
  const metrics = computeMetrics(register, milestones, asOf);
  const alignment: AlignmentRow[] = buildAlignment(register, today);

  // Weeks that end inside this month
  const weekly: MonthlyContent['weekly'] = [];
  let w = weekRange(start);
  let guard = 0;
  while (w.start <= end && guard < 7) {
    if (w.end >= start) {
      const id = `W-${w.start}`;
      const saved = reports.find((r) => r.id === id);
      const frozen = saved?.status === 'approved' ? (saved.frozen as WeeklyContent | undefined) : undefined;
      const snap = snapshotAt(snapshots, w.end < today ? w.end : today);
      weekly.push({
        id,
        title: `Week ${fmtRange(w.start, w.end)}`,
        status: saved ? saved.status : 'not generated',
        // Future weeks have no recorded value; the current week uses live data
        actual: frozen ? frozen.metrics.actualPct : w.start > today ? null : w.end >= today ? metrics.actualPct : snap && snap.date >= w.start ? snap.actualPct : null,
        summary: saved?.narrative.executiveSummary || frozen?.autoSummary || '',
        saved: !!saved,
      });
    }
    w = weekRange(addDays(w.end, 1));
    guard++;
  }

  const completed = register.filter((r) => r.stream === 'Construction' && completedIn(r, start, end)).map((r) => row(r, asOf));
  const delayed = register.filter((r) => r.stream === 'Construction' && r.status === 'Delayed' && r.finish && r.finish <= end).map((r) => row(r, asOf));
  const ongoing = register
    .filter((r) => r.stream === 'Construction' && r.status === 'Ongoing' && r.start && r.start <= end && (r.finish || r.start) >= start)
    .map((r) => row(r, asOf));
  const shootsReg = register.filter((r) => r.kind === 'episode' && r.start && r.start <= end && (r.finish || r.start) >= start);
  const shoots = shootsReg.map((r) => row(r, asOf, `${r.episodeStatus || ''} · ${r.location || ''}`));
  const milestonesRows = register.filter((r) => r.kind === 'milestone' && r.finish && r.finish >= start && (r.start || r.finish) <= end).map((r) => row(r, asOf));

  const issuesRaised = issues.filter((i) => inRange(i.raisedDate, start, end)).map(issueRow);
  const issuesResolved = issues.filter((i) => (i.status === 'Resolved' || i.status === 'Closed') && inRange(i.updatedAt, start, end)).map(issueRow);
  const issuesOpen = issues.filter((i) => i.status !== 'Resolved' && i.status !== 'Closed').map(issueRow);

  const nm = monthRange(addDays(end, 1));
  const nextMonth = buildOutlook(register, alignment, nm.start, nm.end, today).map((o) => ({
    ...row(o.activity, asOf),
    outlook: o.outlook,
    reasons: o.reasons,
  }));

  const ps = progressPoint(register, snapshots, addDays(start, -1), today, metrics.actualPct);
  const pe = progressPoint(register, snapshots, end, today, metrics.actualPct);
  const gain = ps.actual !== null && pe.actual !== null ? round1(pe.actual - ps.actual) : null;

  const attention = buildAttention(register, issues, alignment, today).filter((a) => a.severity !== 'info');
  const autoRecommendations = attention.slice(0, 8).map((a) => `${a.category}: ${a.title} — ${a.detail}${a.owner ? ` (Owner: ${a.owner})` : ' (assign an owner)'}`);
  if (nextMonth.some((n) => n.outlook === 'Tentative')) {
    autoRecommendations.push(`Confirm ${nextMonth.filter((n) => n.outlook === 'Tentative').length} tentative schedule(s) for ${monthLabel(nm.key)}.`);
  }

  const autoSummary = [
    `${monthLabel(key)}: overall physical accomplishment ${metrics.actualPct}% vs ${metrics.plannedPct}% planned (${fmtVar(metrics.variancePct)}); health ${metrics.health}.`,
    gain !== null ? `Progress gained during the month: ${gain >= 0 ? '+' : ''}${gain} pts.` : 'Monthly progress gain is unavailable (no snapshot at the start of the month).',
    `${completed.length} construction activit${completed.length === 1 ? 'y' : 'ies'} completed, ${delayed.length} delayed; ${shootsReg.length} production shoot window(s) in the month.`,
    `Projected completion ${fmtDate(metrics.projectedCompletion)} vs target ${fmtDate(metrics.targetCompletion)}.`,
  ].join(' ');

  return {
    kind: 'monthly',
    periodStart: start,
    periodEnd: end,
    monthKey: key,
    generatedAt: new Date().toISOString(),
    metrics: pickMetrics(metrics),
    progressStart: ps,
    progressEnd: pe,
    progressGain: gain,
    workstreams: metrics.workstreams,
    weekly,
    construction: { completed, delayed, ongoing },
    production: {
      shoots,
      completed: shootsReg.filter((r) => r.episodeStatus === 'Completed').length,
      scheduled: shootsReg.filter((r) => r.episodeStatus === 'Scheduled').length,
      tentative: shootsReg.filter((r) => r.episodeStatus === 'Planned' || r.episodeStatus === 'For Confirmation').length,
      rescheduled: shootsReg.filter((r) => r.episodeStatus === 'Rescheduled' || r.revisionCount > 0).length,
    },
    milestones: milestonesRows,
    issuesRaised,
    issuesResolved,
    issuesOpen,
    nextMonth,
    autoRecommendations,
    autoSummary,
  };
}

function pickMetrics(m: ProjectMetrics): WeeklyContent['metrics'] {
  return {
    actualPct: m.actualPct,
    plannedPct: m.plannedPct,
    variancePct: m.variancePct,
    spi: m.spi,
    health: m.health,
    healthReasons: m.healthReasons,
    projectedCompletion: m.projectedCompletion,
    targetCompletion: m.targetCompletion,
  };
}

export function fmtVar(v: number): string {
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)} pts`;
}

export const weeklyReportId = (anyDate: string) => `W-${weekRange(anyDate).start}`;
export const monthlyReportId = (anyDate: string) => `M-${monthRange(anyDate).key}`;

// ---------- CSV ----------
export function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers.map(csvEscape).join(','), ...rows.map((r) => r.map(csvEscape).join(','))].join('\r\n');
}

export function reportToCsv(content: ReportContent, title: string): string {
  const lines: string[] = [];
  lines.push(toCsv(['Report', 'Period start', 'Period end', 'Actual %', 'Planned %', 'Variance (pts)', 'Health', 'Projected completion', 'Target completion'], [
    [title, content.periodStart, content.periodEnd, content.metrics.actualPct, content.metrics.plannedPct, content.metrics.variancePct, content.metrics.health, content.metrics.projectedCompletion, content.metrics.targetCompletion],
  ]));
  const section = (name: string, rows: ReportRow[]) => {
    lines.push('');
    lines.push(csvEscape(name));
    lines.push(
      toCsv(
        ['Activity ID', 'Activity', 'Workstream', 'Owner', 'Start', 'Finish', 'Baseline finish', 'Status', 'Actual %', 'Planned %', 'Note'],
        rows.map((r) => [r.id, r.name, r.workstream, r.owner, r.start, r.finish, r.plannedFinish, r.status, r.progress, r.planned, r.note])
      )
    );
  };
  const issues = (name: string, rows: IssueRow[]) => {
    lines.push('');
    lines.push(csvEscape(name));
    lines.push(toCsv(['Issue ID', 'Title', 'Type', 'Severity', 'Status', 'Owner', 'Due', 'Corrective action'], rows.map((i) => [i.id, i.title, i.type, i.severity, i.status, i.owner, i.dueDate, i.correctiveAction])));
  };
  if (content.kind === 'weekly') {
    section('Completed activities', content.completed);
    section('Ongoing activities', content.ongoing);
    section('Delayed activities', content.delayed);
    section('Construction updates', content.constructionUpdates);
    section('Production updates', content.productionUpdates);
    section('Milestones', content.milestones);
    section("Next week's activities", content.nextWeek);
    issues('Open issues', content.issuesOpen);
  } else {
    section('Construction — completed', content.construction.completed);
    section('Construction — delayed', content.construction.delayed);
    section('Construction — ongoing', content.construction.ongoing);
    section('Production shoots', content.production.shoots);
    section('Milestones', content.milestones);
    section("Next month's projected activities", content.nextMonth);
    issues('Issues raised', content.issuesRaised);
    issues('Issues resolved', content.issuesResolved);
    issues('Open issues', content.issuesOpen);
  }
  return lines.join('\r\n');
}
