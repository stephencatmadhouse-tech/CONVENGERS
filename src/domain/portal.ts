/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * EXTERNAL PORTAL CONTENT & PUBLISHING WORKFLOW
 *
 * The Executive & Client Portal never reads internal records. It reads only
 * the `portal` collection, which receives a SANITIZED copy of content when an
 * authorized user publishes it:
 *   internal register → snapshot/report/photo/document/consideration (draft)
 *   → For Review → Approved → Published (copied to `portal`) → Archived (removed from `portal`)
 *
 * Sanitization rules (applied here, in one place):
 *   - construction scopes, concrete pours and milestones only (no production/episode details)
 *   - no responsible persons, supporting personnel, remarks, concerns or
 *     corrective actions, no issue log, no budget / procurement / suppliers
 *   - every date carries its commitment (Confirmed / Tentative / Target)
 *   - missing values are reported as "Not yet provided", never estimated
 */

import { Milestone, ProjectReport, PublishStatus, Publication, PublicationEvent, UserRole } from '../types/index.ts';
import { RegisterActivity } from './register.ts';
import { ProjectMetrics, round1 } from './metrics.ts';
import { addDays, fmtDate, fmtRange, monthLabel, todayIso } from './dates.ts';
import type { ReportContent, WeeklyContent, MonthlyContent, ReportRow } from './reports.ts';

export const NOT_PROVIDED = 'Not yet provided';
export const PROJECT_NAME = 'Convengers Bahay Build';

export interface PortalItem {
  name: string;
  phase: string;
  start?: string;
  finish?: string;
  actualStart?: string;
  actualFinish?: string;
  status: string;
  progress: number;
  commitment: string;
}

export interface PortalMilestone {
  label: string;
  target?: string; // current target (end of window)
  targetText: string;
  baseline?: string;
  actual?: string;
  status: string;
  progress: number;
  commitment: string;
  revised: boolean;
}

export interface PortalPhase {
  key: string;
  label: string;
  plannedStart?: string;
  plannedFinish?: string;
  start?: string;
  finish?: string;
  actual: number;
  planned: number;
  weight: number;
}

export interface PortalSnapshot {
  projectName: string;
  asOf: string;
  reportingPeriod: string;
  status: string; // On Track / At Risk / Critical
  statusNote: string;
  actualPct: number;
  plannedPct: number;
  variancePct: number;
  targetCompletion?: string;
  projectedCompletion?: string;
  phases: PortalPhase[];
  completed: PortalItem[];
  ongoing: PortalItem[];
  upcoming: PortalItem[];
  milestones: PortalMilestone[];
  scheduleUpdates: { label: string; from: string; to: string; at?: string }[];
  counts: { completed: number; ongoing: number; upcoming: number; delayed: number; total: number };
}

export type PortalRecordKind = 'snapshot' | 'report' | 'photo' | 'document' | 'consideration' | 'update';

/**
 * Published content visible on the PUBLIC client-facing dashboard (no sign-in).
 * Approved project documents (`document`) are restricted to the Project Owner,
 * Executives and internal users — enforced by firestore.rules.
 */
export const PUBLIC_PORTAL_KINDS: PortalRecordKind[] = ['snapshot', 'report', 'photo', 'consideration', 'update'];

/** Shape of every document in the external `portal` collection. */
export interface PortalRecord {
  id: string;
  kind: PortalRecordKind;
  title: string;
  publishedAt: string;
  publishedBy: string;
  periodStart?: string;
  periodEnd?: string;
  content: any;
  localOnly?: boolean;
}

const PHASE_LABEL: Record<string, string> = {
  'GF · Structural': 'Ground Floor — Structural',
  '2F · Structural': 'Second Floor — Structural',
  '3F · Structural': 'Third Floor — Structural',
  'GF · Finishing': 'Ground Floor — Architectural / Finishing',
  '2F · Finishing': 'Second Floor — Architectural / Finishing',
  '3F · Finishing': 'Third Floor — Architectural / Finishing',
  'Concrete pours': 'Concrete Pouring',
  Milestones: 'Key Milestones',
};

const CLIENT_STATUS: Record<string, string> = {
  Completed: 'Completed',
  Ongoing: 'In progress',
  Delayed: 'Behind schedule',
  Upcoming: 'Scheduled',
  'On Hold': 'On hold',
};

function item(r: RegisterActivity): PortalItem {
  return {
    name: r.name,
    phase: PHASE_LABEL[r.workstream] || r.workstream,
    start: r.start,
    finish: r.finish,
    actualStart: r.actualStart,
    actualFinish: r.actualFinish,
    status: CLIENT_STATUS[r.status] || r.status,
    progress: r.progress,
    commitment: r.commitment === 'Target' ? 'Target' : r.commitment,
  };
}

/** Build the client-facing snapshot from the live register (frozen once created). */
export function buildPortalSnapshot(
  register: RegisterActivity[],
  milestones: Milestone[],
  metrics: ProjectMetrics,
  today: string = todayIso()
): PortalSnapshot {
  const construction = register.filter((r) => r.kind === 'scope' || r.kind === 'pour');
  const ms = register.filter((r) => r.kind === 'milestone');
  const in30 = addDays(today, 30);
  const since30 = addDays(today, -30);

  const completed = construction
    .filter((r) => r.status === 'Completed' && ((r.actualFinish || r.finish || '') >= since30))
    .sort((a, b) => (b.actualFinish || b.finish || '').localeCompare(a.actualFinish || a.finish || ''))
    .map(item);
  const ongoing = construction.filter((r) => r.status === 'Ongoing' || r.status === 'Delayed').map(item);
  const upcoming = construction.filter((r) => r.status === 'Upcoming' && r.start && r.start <= in30).map(item);

  // Phase windows for the timeline
  const phaseMap = new Map<string, RegisterActivity[]>();
  register
    .filter((r) => r.kind === 'scope')
    .forEach((r) => phaseMap.set(r.workstream, [...(phaseMap.get(r.workstream) || []), r]));
  const minI = (v: (string | undefined)[]) => v.filter(Boolean).sort()[0];
  const maxI = (v: (string | undefined)[]) => v.filter(Boolean).sort().slice(-1)[0];
  const phases: PortalPhase[] = metrics.workstreams.map((w) => {
    const rs = phaseMap.get(w.key) || [];
    return {
      key: w.key,
      label: PHASE_LABEL[w.key] || w.label,
      plannedStart: minI(rs.map((r) => r.plannedStart)),
      plannedFinish: maxI(rs.map((r) => r.plannedFinish)),
      start: minI(rs.map((r) => r.start)),
      finish: maxI(rs.map((r) => r.finish)),
      actual: round1(w.actual),
      planned: round1(w.planned),
      weight: round1(w.weight),
    };
  });

  const portalMs: PortalMilestone[] = ms.map((m) => ({
    label: m.name,
    target: m.finish,
    targetText: m.dateText || fmtRange(m.start, m.finish),
    baseline: m.revisionCount > 0 ? m.plannedFinish : undefined,
    actual: m.actualFinish,
    status: CLIENT_STATUS[m.status] || m.status,
    progress: m.progress,
    commitment: m.commitment,
    revised: m.revisionCount > 0,
  }));

  const scheduleUpdates = [...ms, ...construction]
    .filter((r) => r.revisionCount > 0 && r.plannedFinish && r.finish && r.plannedFinish !== r.finish)
    .map((r) => ({ label: r.name, from: fmtRange(r.plannedStart, r.plannedFinish), to: fmtRange(r.start, r.finish), at: r.lastRevisedAt?.slice(0, 10) }));

  const statusNote =
    metrics.health === 'On Track'
      ? 'Construction progress is in line with the approved schedule.'
      : metrics.health === 'At Risk'
      ? 'Some activities are behind schedule and are being recovered by the project team.'
      : 'Progress is significantly behind the approved schedule; a recovery plan is in progress.';

  return {
    projectName: PROJECT_NAME,
    asOf: today,
    reportingPeriod: monthLabel(today.slice(0, 7)),
    status: metrics.health,
    statusNote,
    actualPct: metrics.actualPct,
    plannedPct: metrics.plannedPct,
    variancePct: metrics.variancePct,
    targetCompletion: metrics.targetCompletion || undefined,
    projectedCompletion: metrics.projectedCompletion || undefined,
    phases,
    completed,
    ongoing,
    upcoming,
    milestones: portalMs,
    scheduleUpdates,
    counts: {
      completed: construction.filter((r) => r.status === 'Completed').length,
      ongoing: construction.filter((r) => r.status === 'Ongoing').length,
      upcoming: construction.filter((r) => r.status === 'Upcoming').length,
      delayed: construction.filter((r) => r.status === 'Delayed').length,
      total: construction.length,
    },
  };
}

// ---------- Reports ----------
export interface PortalReport {
  type: 'weekly' | 'monthly';
  title: string;
  periodStart: string;
  periodEnd: string;
  executiveSummary: string;
  constructionNarrative: string;
  nextPeriodNarrative: string;
  metrics: { actualPct: number; plannedPct: number; variancePct: number; health: string; projectedCompletion?: string; targetCompletion?: string };
  progressGain: number | null;
  completed: PortalReportRow[];
  ongoing: PortalReportRow[];
  milestones: PortalReportRow[];
  next: PortalReportRow[];
  phases?: { label: string; actual: number; planned: number }[];
}

export interface PortalReportRow {
  name: string;
  phase: string;
  dates: string;
  status: string;
  progress: number;
}

const isConstructionRow = (r: ReportRow) => !/^(EP-|AC-)/.test(r.id) || /Construction|Concrete|Structural|Finishing/.test(r.workstream);
const prow = (r: ReportRow): PortalReportRow => ({
  name: r.name,
  phase: PHASE_LABEL[r.workstream] || r.workstream,
  dates: fmtRange(r.start, r.finish),
  status: CLIENT_STATUS[r.status] || r.status,
  progress: r.progress,
});

/** Client-safe copy of an approved report: no owners, notes, issues or production details. */
export function sanitizeReport(report: ProjectReport): PortalReport {
  const c = report.frozen as ReportContent;
  if (!c) throw new Error('Only approved (frozen) reports can be published.');
  const n = report.narrative || {};
  const base = {
    type: report.type,
    title: report.title,
    periodStart: report.periodStart,
    periodEnd: report.periodEnd,
    executiveSummary: n.executiveSummary || c.autoSummary,
    constructionNarrative: n.construction || '',
    nextPeriodNarrative: n.nextPeriod || '',
    metrics: {
      actualPct: c.metrics.actualPct,
      plannedPct: c.metrics.plannedPct,
      variancePct: c.metrics.variancePct,
      health: c.metrics.health,
      projectedCompletion: c.metrics.projectedCompletion,
      targetCompletion: c.metrics.targetCompletion,
    },
    progressGain: c.progressGain,
  };
  if (c.kind === 'weekly') {
    const w = c as WeeklyContent;
    return {
      ...base,
      completed: w.completed.filter(isConstructionRow).map(prow),
      ongoing: w.ongoing.filter(isConstructionRow).map(prow),
      milestones: w.milestones.filter(isConstructionRow).map(prow),
      next: w.nextWeek.filter(isConstructionRow).map(prow),
    };
  }
  const m = c as MonthlyContent;
  return {
    ...base,
    completed: m.construction.completed.map(prow),
    ongoing: m.construction.ongoing.map(prow),
    milestones: m.milestones.map(prow),
    next: m.nextMonth.filter(isConstructionRow).map((r) => ({ ...prow(r), status: r.outlook === 'Management target' ? 'Target' : r.outlook })),
    phases: m.workstreams.map((w) => ({ label: PHASE_LABEL[w.key] || w.label, actual: w.actual, planned: w.planned })),
  };
}

// ---------- Workflow ----------
export const PUBLISH_LABEL: Record<PublishStatus, string> = {
  draft: 'Draft',
  review: 'For Review',
  approved: 'Approved',
  published: 'Published',
  archived: 'Archived',
};

export interface Transition {
  to: PublishStatus;
  label: string;
  managerOnly: boolean;
}

/** Allowed next steps from a status. Server rules enforce the same permissions. */
export function nextTransitions(status: PublishStatus): Transition[] {
  switch (status) {
    case 'draft':
      return [
        { to: 'review', label: 'Submit for review', managerOnly: false },
        { to: 'archived', label: 'Archive', managerOnly: true },
      ];
    case 'review':
      return [
        { to: 'approved', label: 'Approve', managerOnly: true },
        { to: 'draft', label: 'Return to draft', managerOnly: true },
      ];
    case 'approved':
      return [
        { to: 'published', label: 'Publish to client portal', managerOnly: true },
        { to: 'archived', label: 'Archive', managerOnly: true },
      ];
    case 'published':
      return [{ to: 'archived', label: 'Unpublish & archive', managerOnly: true }];
    case 'archived':
      return [{ to: 'draft', label: 'Restore as draft', managerOnly: true }];
  }
}

export function canTransition(from: PublishStatus, to: PublishStatus, role: UserRole): boolean {
  const t = nextTransitions(from).find((x) => x.to === to);
  if (!t) return false;
  if (t.managerOnly) return role === 'admin' || role === 'manager';
  return ['admin', 'manager', 'engineer', 'production', 'staff'].includes(role);
}

export function transitionPublication(p: Publication, to: PublishStatus, by: string, note?: string): Publication {
  const at = new Date().toISOString();
  const ev: PublicationEvent = { at, by, from: p.status, to, ...(note ? { note } : {}) };
  return { ...p, status: to, history: [...(p.history || []), ev], updatedAt: at, updatedBy: by };
}

/** Portal record written when a publication is published. */
export function portalRecordFor(p: Publication, by: string): PortalRecord {
  return {
    id: p.id,
    kind: p.kind as PortalRecordKind,
    title: p.title,
    publishedAt: new Date().toISOString(),
    publishedBy: by,
    periodStart: p.periodStart,
    periodEnd: p.periodEnd,
    content: p.payload,
  };
}

export function fmtOrPending(iso?: string): string {
  return iso ? fmtDate(iso) : NOT_PROVIDED;
}
