/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * AUTOMATED NARRATIVE REPORT GENERATOR
 *
 *   records (daily reports, tracker, milestones, calendar, manpower, materials,
 *   inspections, issues, photos, previous reports)
 *     → collectFacts()       verified facts for the reporting period
 *     → composeSections()    factual narrative, sections B–K ("Not Recorded" where data is missing)
 *     → optional AI wording  (server; any section that introduces a number or date
 *                             that is not in the factual text is rejected)
 *     → editor → review → approval → final → PDF / DOCX → archive
 *
 * Nothing in this file invents activities, quantities, dates, percentages or
 * manpower figures: every sentence is built from a record, and photographs are
 * described only by their own metadata (never as proof of an accomplishment).
 */

import type { DailyReport, DriveFile, ManpowerPlan, Milestone, ProcurementItem, ProgressSnapshot, ProjectDocument, ProjectIssue, CalendarEvent } from '../types/index.ts';
import type { RegisterActivity } from './register.ts';
import { plannedPercentAt } from './register.ts';
import { computeMetrics, round1 } from './metrics.ts';
import { progressPoint, completedIn, fmtVar } from './reports.ts';
import { addDays, diffDays, fmtDate, fmtRange, isValidIso, monthRange, weekRange } from './dates.ts';
import { plural } from '../utils/plural.ts';
import { summarizeDailyReports, recordStamp, VERIFIED_DR, type DailyReporter, type DailySummary } from './dailyCompliance.ts';

// ---------------------------------------------------------------- types
export type NarrativeType = 'daily' | 'weekly' | 'monthly' | 'milestone' | 'activity' | 'status' | 'summary';
export type NarrativeStatus = 'draft' | 'review' | 'approved' | 'final';

export const NARRATIVE_TYPES: Record<NarrativeType, { label: string; code: string; note: string }> = {
  daily: { label: 'Daily Narrative Report', code: 'D', note: 'One working day, from the Daily Construction Reports of that date.' },
  weekly: { label: 'Weekly Accomplishment Report', code: 'W', note: 'Monday to Sunday.' },
  monthly: { label: 'Monthly Construction Progress Report', code: 'M', note: 'Calendar month.' },
  milestone: { label: 'Project Milestone Report', code: 'MS', note: 'Milestones and concrete pours in the chosen period.' },
  activity: { label: 'Construction Activity Report', code: 'A', note: 'One activity of the Master Project Tracker.' },
  status: { label: 'Project Status Report', code: 'S', note: 'Project position as of the chosen date.' },
  summary: { label: 'Overall Project Summary', code: 'P', note: 'From project start to the chosen date.' },
};

export const NARRATIVE_STATUS_LABEL: Record<NarrativeStatus, string> = { draft: 'Draft', review: 'For Review', approved: 'Approved', final: 'Final' };

export type SectionKey = 'summary' | 'activities' | 'accomplishments' | 'resources' | 'progress' | 'issues' | 'corrective' | 'nextPlan' | 'photos' | 'conclusion';
export const SECTION_TITLES: { key: SectionKey; letter: string; title: string }[] = [
  { key: 'summary', letter: 'B', title: 'Executive Summary' },
  { key: 'activities', letter: 'C', title: 'Construction Activities' },
  { key: 'accomplishments', letter: 'D', title: 'Work Accomplishments' },
  { key: 'resources', letter: 'E', title: 'Manpower and Resource Utilization' },
  { key: 'progress', letter: 'F', title: 'Project Progress' },
  { key: 'issues', letter: 'G', title: 'Issues and Concerns' },
  { key: 'corrective', letter: 'H', title: 'Corrective Actions' },
  { key: 'nextPlan', letter: 'I', title: 'Next Period Work Plan' },
  { key: 'photos', letter: 'J', title: 'Photo Documentation' },
  { key: 'conclusion', letter: 'K', title: 'Conclusion' },
];

export interface NarrativeSection {
  key: SectionKey;
  title: string;
  text: string;
}

export interface NarrativePhoto {
  fileId: string;
  url: string;
  caption: string;
  date: string;
  activity?: string;
  source: string; // e.g. "DCR-20261114-AB12" or "Site photo"
  include: boolean;
}

export interface NarrativeAttachment {
  id: string;
  title: string;
  url?: string;
  date?: string;
}

/** Key figures kept with every report (archive comparison, period-to-period consistency). */
export interface NarrativeFigures {
  asOf: string;
  actualPct: number;
  plannedPct: number;
  variancePct: number;
  health: string;
  progressGain: number | null;
  completed: number;
  ongoing: number;
  delayed: number;
  dailyReports: number;
  manDays: number | null;
  issuesOpen: number;
  photos: number;
  /** Working days in the period (to the as-of date) and how many have a verified daily report from the required reporter. */
  workDays?: number;
  daysReported?: number;
  /** Monthly: weeks of the month with a Weekly Accomplishment Report. */
  weeklyReports?: number;
}

export interface NarrativeRevision {
  at: string;
  by: string;
  action: string;
  note?: string;
  sections?: NarrativeSection[];
}

export interface NarrativeReport {
  id: string;
  reference: string;
  type: NarrativeType;
  title: string;
  periodStart: string;
  periodEnd: string;
  subjectId?: string;
  subjectName?: string;
  status: NarrativeStatus;
  preparedBy: string;
  preparedById: string;
  sections: NarrativeSection[];
  /** The version produced by the generator — never changed afterwards (audit). */
  original: { sections: NarrativeSection[]; factual: NarrativeSection[]; engine: 'records' | 'ai'; model?: string; aiRejected?: string[]; generatedAt: string; generatedBy: string };
  photos: NarrativePhoto[];
  attachments: NarrativeAttachment[];
  figures: NarrativeFigures;
  /** Project records the report was built from (links back to the source modules). */
  sources: { dailyReports: string[]; activities: string[]; issues: string[]; previous?: string; weekly?: string[] };
  scheduled?: boolean;
  /** Change marker of the source daily (and, for monthly, weekly) reports when the text was last built. */
  sourceStamp?: string;
  /** Set when a person edits the text; automatic updates never overwrite edited drafts. */
  manualEdits?: boolean;
  revisions: NarrativeRevision[];
  reviewedBy?: string;
  approvedBy?: string;
  approvedAt?: string;
  finalizedBy?: string;
  finalizedAt?: string;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
  localOnly?: boolean;
}

export interface NarrativeSchedule {
  id: 'schedule';
  daily: boolean;
  weekly: boolean;
  monthly: boolean;
  /** Person required to submit the Daily Construction Report every working day. */
  dailyReporter?: DailyReporter | null;
  updatedAt?: string;
  updatedBy?: string;
  localOnly?: boolean;
}

// ---------------------------------------------------------------- periods & references
export function projectStart(register: RegisterActivity[]): string {
  const starts = register.map((r) => r.plannedStart || r.start).filter(isValidIso).sort();
  return starts[0] || '2026-10-01';
}

/** Default reporting period for a report type around a date. */
export function defaultPeriod(type: NarrativeType, date: string, register: RegisterActivity[]): { start: string; end: string } {
  if (type === 'daily') return { start: date, end: date };
  if (type === 'weekly') return weekRange(date);
  if (type === 'monthly' || type === 'milestone') {
    const m = monthRange(date);
    return { start: m.start, end: m.end };
  }
  return { start: projectStart(register), end: date };
}

/** The period after the reporting period (for the work plan). */
export function nextPeriod(type: NarrativeType, end: string): { start: string; end: string } {
  if (type === 'daily') return { start: addDays(end, 1), end: addDays(end, 1) };
  if (type === 'weekly') return { start: addDays(end, 1), end: addDays(end, 7) };
  if (type === 'monthly') {
    const m = monthRange(addDays(end, 1));
    return { start: m.start, end: m.end };
  }
  return { start: addDays(end, 1), end: addDays(end, 14) };
}

/** Deterministic id per type + period (+ subject): the same report is never prepared twice. */
export function narrativeId(type: NarrativeType, start: string, end: string, subjectId?: string): string {
  const base = `NR-${NARRATIVE_TYPES[type].code}-${start.replace(/-/g, '')}-${end.replace(/-/g, '')}`;
  return subjectId ? `${base}-${subjectId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40)}` : base;
}
export const narrativeReference = (id: string) => id.replace(/^NR-/, 'NAR-');

// ---------------------------------------------------------------- facts
export interface NarrativeSources {
  register: RegisterActivity[];
  milestones: Milestone[];
  issues: ProjectIssue[];
  snapshots: ProgressSnapshot[];
  dailyReports: DailyReport[];
  manpower: ManpowerPlan[];
  procurement: ProcurementItem[];
  events: CalendarEvent[];
  driveFiles: DriveFile[];
  documents: ProjectDocument[];
  narratives: NarrativeReport[];
  today: string;
  /** Required daily reporter (from the schedule settings). */
  reporter?: DailyReporter | null;
}

export interface NarrativeRequest {
  type: NarrativeType;
  start: string;
  end: string;
  subjectId?: string;
}

export interface NarrativeFacts {
  req: NarrativeRequest;
  asOf: string;
  subject?: RegisterActivity;
  metrics: ReturnType<typeof computeMetrics>;
  progressGain: number | null;
  progressStartActual: number | null;
  progressEndActual: number | null;
  reports: DailyReport[];
  completed: RegisterActivity[];
  ongoing: RegisterActivity[];
  delayed: RegisterActivity[];
  milestones: RegisterActivity[];
  inspections: RegisterActivity[];
  /** Per reporting date, from the reports that recorded manpower (headcounts summed when a date has several reports). */
  manpowerDays: { date: string; refs: string[]; total: number; skilled: number; general: number; subcontractor: number; other: number }[];
  /** Reports in the period that recorded no manpower. */
  manpowerMissing: string[];
  manpowerPlans: ManpowerPlan[];
  materials: { description: string; quantity: string; unit: string; date?: string; supplier?: string; source: string }[];
  equipment: { description: string; quantity: string; status: string; source: string }[];
  deliveries: ProcurementItem[];
  issuesRaised: ProjectIssue[];
  issuesResolved: ProjectIssue[];
  issuesOpen: ProjectIssue[];
  siteNotes: { date: string; ref: string; kind: 'Issue' | 'Delay' | 'Safety' | 'Corrective action' | 'Recommendation' | 'Observation'; text: string }[];
  corrective: { title: string; action: string; source: string }[];
  next: { start: string; end: string; activities: RegisterActivity[]; events: CalendarEvent[]; deliveries: ProcurementItem[] };
  photos: NarrativePhoto[];
  attachments: NarrativeAttachment[];
  previous?: NarrativeReport;
  /** Daily report coverage of the working days (daily / weekly / monthly / milestone reports). */
  compliance: DailySummary | null;
  /** Monthly: the weeks of the month and their Weekly Accomplishment Reports. */
  weeks: { start: string; end: string; report?: NarrativeReport; reports: DailyReport[] }[];
  sourceStamp: string;
}

const VERIFIED: DailyReport['status'][] = ['submitted', 'under_review', 'approved'];
const inP = (iso: string | undefined, s: string, e: string) => !!iso && iso.slice(0, 10) >= s && iso.slice(0, 10) <= e;
const actName = (reg: RegisterActivity[], id?: string) => (id ? reg.find((r) => r.id === id)?.name : undefined);

export function collectFacts(req: NarrativeRequest, src: NarrativeSources): NarrativeFacts {
  const { start, end, type, subjectId } = req;
  const asOf = end < src.today ? end : src.today;
  const subject = type === 'activity' && subjectId ? src.register.find((r) => r.id === subjectId) : undefined;
  // Construction narrative: production shoots are tracked in the register but are not construction work
  const only = (r: RegisterActivity) => (subject ? r.id === subject.id : r.kind !== 'episode' && r.stream !== 'Production');
  const reg = src.register.filter(only);
  const metrics = computeMetrics(src.register, src.milestones, asOf);
  const ps = progressPoint(src.register, src.snapshots, addDays(start, -1), src.today, metrics.actualPct);
  const pe = progressPoint(src.register, src.snapshots, end, src.today, metrics.actualPct);
  const gain = ps.actual !== null && pe.actual !== null && type !== 'summary' ? round1(pe.actual - ps.actual) : null;

  // Verified daily reports only (submitted, under review or approved); drafts are not project records yet
  const reports = src.dailyReports
    .filter((d) => VERIFIED.includes(d.status) && inP(d.date, start, end))
    .map((d) => (subject ? { ...d, activities: d.activities.filter((a) => a.activityId === subject.id) } : d))
    .filter((d) => !subject || d.activities.length > 0)
    .sort((a, b) => a.date.localeCompare(b.date) || a.reference.localeCompare(b.reference));

  const completed = reg.filter((r) => completedIn(r, start, end));
  const ongoing = reg.filter((r) => r.status !== 'Completed' && r.status !== 'Delayed' && r.start && r.start <= end && (r.finish || r.start) >= start);
  const delayed = reg.filter((r) => r.status === 'Delayed' && r.finish && r.finish <= end);
  const milestones = reg.filter((r) => (r.kind === 'milestone' || r.kind === 'pour') && r.finish && inP(r.finish, start, end));
  const inspections = reg.filter((r) => (r.isInspection || /inspection/i.test(r.name)) && r.finish && inP(r.finish, start, end));

  const byDate = new Map<string, NarrativeFacts['manpowerDays'][number]>();
  const manpowerMissing: string[] = [];
  reports.forEach((d) => {
    const mp = d.manpower;
    const total = mp.skilled + mp.general + mp.subcontractor + mp.other;
    if (!total) return void manpowerMissing.push(d.reference);
    const cur = byDate.get(d.date) || { date: d.date, refs: [], total: 0, skilled: 0, general: 0, subcontractor: 0, other: 0 };
    cur.refs.push(d.reference);
    cur.total += total;
    cur.skilled += mp.skilled;
    cur.general += mp.general;
    cur.subcontractor += mp.subcontractor;
    cur.other += mp.other;
    byDate.set(d.date, cur);
  });
  const manpowerDays = [...byDate.values()].sort((x, y) => x.date.localeCompare(y.date));
  const manpowerPlans = subject
    ? src.manpower.filter((m) => !m.archived && m.linkedActivityId === subject.id && m.start <= end && (m.end || m.start) >= start)
    : src.manpower.filter((m) => !m.archived && m.start <= end && (m.end || m.start) >= start);
  const materials = reports.flatMap((d) =>
    d.materials.filter((m) => m.description.trim()).map((m) => ({ description: m.description.trim(), quantity: m.quantity, unit: m.unit, date: m.deliveryDate || d.date, supplier: m.supplier, source: d.reference }))
  );
  const equipment = reports.flatMap((d) => d.equipment.filter((q) => q.description.trim()).map((q) => ({ description: q.description.trim(), quantity: q.quantity, status: q.status, source: d.reference })));
  const deliveries = src.procurement.filter((p) => !p.archived && inP(p.actualDelivery, start, end) && (!subject || p.linkedActivityId === subject.id));

  const issues = subject ? src.issues.filter((i) => i.linkedActivityId === subject.id) : src.issues;
  const issuesRaised = issues.filter((i) => inP(i.raisedDate, start, end));
  const issuesResolved = issues.filter((i) => (i.status === 'Resolved' || i.status === 'Closed') && inP(i.updatedAt, start, end));
  const issuesOpen = issues.filter((i) => i.status !== 'Resolved' && i.status !== 'Closed' && (i.raisedDate || '') <= end);

  const siteNotes: NarrativeFacts['siteNotes'] = [];
  reports.forEach((d) => {
    const add = (kind: NarrativeFacts['siteNotes'][number]['kind'], text: string) => text.trim() && siteNotes.push({ date: d.date, ref: d.reference, kind, text: text.trim() });
    add('Observation', d.site.observations);
    add('Issue', d.site.issues);
    add('Delay', d.site.delays);
    add('Safety', d.site.safety);
    add('Corrective action', d.site.corrective);
    add('Recommendation', d.site.recommendations);
  });
  const corrective = [
    ...issuesOpen.filter((i) => i.correctiveAction?.trim()).map((i) => ({ title: i.title, action: i.correctiveAction!.trim(), source: 'Issue log' })),
    ...issuesResolved.filter((i) => i.resolution?.trim()).map((i) => ({ title: i.title, action: `Resolved: ${i.resolution!.trim()}`, source: 'Issue log' })),
    ...reg.filter((r) => r.correctiveAction?.trim() && r.status !== 'Completed').map((r) => ({ title: r.name, action: r.correctiveAction.trim(), source: 'Master Project Tracker' })),
  ];

  const np = nextPeriod(type, end);
  const next = {
    ...np,
    activities: reg.filter((r) => r.status !== 'Completed' && r.start && r.start <= np.end && (r.finish || r.start) >= np.start).sort((a, b) => (a.start || '').localeCompare(b.start || '')),
    events: subject ? [] : src.events.filter((e) => !e.done && inP(e.date, np.start, np.end)).sort((a, b) => a.date.localeCompare(b.date)),
    deliveries: src.procurement.filter((p) => !p.archived && p.status !== 'Delivered' && p.status !== 'Cancelled' && inP(p.expectedDelivery || p.requiredDate, np.start, np.end) && (!subject || p.linkedActivityId === subject.id)),
  };

  // Photographs: described only by their own metadata
  const photos: NarrativePhoto[] = [];
  const seen = new Set<string>();
  reports.forEach((d) =>
    d.photos
      .filter((p) => p.uploadStatus === 'uploaded' && (!subject || p.activityId === subject.id))
      .forEach((p) => {
        if (seen.has(p.fileId)) return;
        seen.add(p.fileId);
        const a = actName(src.register, p.activityId);
        photos.push({
          fileId: p.fileId,
          url: `/api/drive/file/${encodeURIComponent(p.fileId)}`,
          caption: [p.photoType, p.description?.trim()].filter(Boolean).join(' — '),
          date: d.date,
          activity: a,
          source: d.reference,
          include: true,
        });
      })
  );
  src.driveFiles
    .filter((f) => f.uploadStatus === 'uploaded' && f.kind === 'photo' && inP(f.reportingDate, start, end) && !seen.has(f.id) && (!subject || f.activityId === subject.id))
    .forEach((f) => {
      seen.add(f.id);
      photos.push({
        fileId: f.id,
        url: `/api/drive/file/${encodeURIComponent(f.id)}`,
        caption: [f.photoType || f.category || 'Site photograph', f.description?.trim()].filter(Boolean).join(' — '),
        date: f.reportingDate,
        activity: actName(src.register, f.activityId || undefined),
        source: 'Site photo',
        include: true,
      });
    });
  photos.sort((a, b) => a.date.localeCompare(b.date));

  const attachments = src.documents
    .filter((d) => !d.archived && inP(d.date, start, end) && (!subject || d.linkedActivityId === subject.id))
    .map((d) => ({ id: d.id, title: d.title, url: d.url, date: d.date }));

  const previous = src.narratives
    .filter((n) => n.type === type && n.periodEnd < start && (n.status === 'approved' || n.status === 'final') && (n.subjectId || '') === (subjectId || ''))
    .sort((a, b) => b.periodEnd.localeCompare(a.periodEnd))[0];

  const compliance = !subject && ['daily', 'weekly', 'monthly', 'milestone'].includes(type) ? summarizeDailyReports(src.dailyReports, start, end, src.today, src.reporter) : null;

  // Monthly ← weekly: every week (Monday–Sunday) that overlaps the month, with its weekly report
  const weeks: NarrativeFacts['weeks'] = [];
  if (type === 'monthly') {
    for (let ws = weekRange(start).start; ws <= end; ws = addDays(ws, 7)) {
      const we = addDays(ws, 6);
      weeks.push({
        start: ws,
        end: we,
        report: src.narratives.find((n) => n.type === 'weekly' && !n.subjectId && n.periodStart === ws),
        reports: reports.filter((d) => d.date >= ws && d.date <= we),
      });
    }
  }
  const sourceStamp = recordStamp([
    // the required reporter changes the coverage text
    ...(compliance ? [{ id: `reporter:${src.reporter?.uid || ''}` }] : []),
    ...src.dailyReports.filter((d) => inP(d.date, start, end) && VERIFIED_DR.includes(d.status)).map((d) => ({ id: d.id, updatedAt: d.updatedAt, status: d.status })),
    ...weeks.filter((w) => w.report).map((w) => ({ id: w.report!.id, updatedAt: w.report!.updatedAt, status: w.report!.status })),
  ]);

  return {
    compliance,
    weeks,
    sourceStamp,
    req,
    asOf,
    subject,
    metrics,
    progressGain: gain,
    progressStartActual: ps.actual,
    progressEndActual: pe.actual,
    reports,
    completed,
    ongoing,
    delayed,
    milestones,
    inspections,
    manpowerDays,
    manpowerMissing,
    manpowerPlans,
    materials,
    equipment,
    deliveries,
    issuesRaised,
    issuesResolved,
    issuesOpen,
    siteNotes,
    corrective,
    next,
    photos,
    attachments,
    previous,
  };
}

// ---------------------------------------------------------------- composer
const NR = 'Not Recorded.';
const list = (items: string[]) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join('; ')}; and ${items[items.length - 1]}`);
const where = (r: RegisterActivity) => r.workstream;
const pct = (n: number) => `${round1(n)}%`;
/** "no activities were", "1 activity was", "3 activities were" */
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const countWas = (n: number, one: string, many: string, verbOne = 'was', verbMany = 'were') => (n === 0 ? `no ${many} ${verbMany}` : `${plural(n, one, many)} ${n === 1 ? verbOne : verbMany}`);

export function periodText(type: NarrativeType, start: string, end: string): string {
  if (type === 'daily' || start === end) return fmtDate(start);
  return fmtRange(start, end);
}

export function figures(f: NarrativeFacts): NarrativeFigures {
  const man = f.manpowerDays.reduce((s, d) => s + d.total, 0);
  return {
    asOf: f.asOf,
    actualPct: f.metrics.actualPct,
    plannedPct: f.metrics.plannedPct,
    variancePct: f.metrics.variancePct,
    health: f.metrics.health,
    progressGain: f.progressGain,
    completed: f.completed.length,
    ongoing: f.ongoing.length,
    delayed: f.delayed.length,
    dailyReports: f.reports.length,
    manDays: f.manpowerDays.length ? man : null,
    issuesOpen: f.issuesOpen.length,
    photos: f.photos.length,
    ...(f.compliance ? { workDays: f.compliance.workDays.length, daysReported: f.compliance.reportedDays.length } : {}),
    ...(f.req.type === 'monthly' ? { weeklyReports: f.weeks.filter((w) => w.report).length } : {}),
  };
}

/** Factual narrative (sections B–K) built only from the collected records. */
export function composeSections(f: NarrativeFacts): NarrativeSection[] {
  const { req, metrics: m } = f;
  const t = NARRATIVE_TYPES[req.type].label;
  const period = periodText(req.type, req.start, req.end);
  const approved = f.reports.filter((d) => d.status === 'approved').length;
  const scope = f.subject ? ` for ${f.subject.name} (${where(f.subject)})` : '';
  const S: Record<SectionKey, string[]> = { summary: [], activities: [], accomplishments: [], resources: [], progress: [], issues: [], corrective: [], nextPlan: [], photos: [], conclusion: [] };

  // B. Executive summary
  S.summary.push(
    `This ${t}${scope} covers ${period}. As of ${fmtDate(f.asOf)}, the overall physical accomplishment of the project stands at ${pct(m.actualPct)} against a planned ${pct(m.plannedPct)} (${fmtVar(m.variancePct)}), and project health is assessed as ${m.health}.`
  );
  if (f.subject) S.summary.push(`${f.subject.name} is recorded at ${pct(f.subject.progress)} with a status of ${f.subject.status.toLowerCase()}.`);
  if (req.type !== 'summary' && req.type !== 'status')
    S.summary.push(
      f.progressGain !== null
        ? `Overall accomplishment changed by ${f.progressGain >= 0 ? '+' : ''}${f.progressGain} percentage points during the period.`
        : 'The overall progress gained during the period is Not Recorded, because no progress snapshot exists for the start of the period.'
    );
  S.summary.push(
    `During the period, ${countWas(f.completed.length, 'activity', 'activities')} completed, ${countWas(f.ongoing.length, 'activity', 'activities')} in progress and ${countWas(f.delayed.length, 'activity', 'activities')} behind schedule.`
  );
  S.summary.push(
    f.reports.length
      ? `${plural(f.reports.length, 'Daily Construction Report')} ${f.reports.length === 1 ? 'was' : 'were'} submitted for the period (${approved ? `${approved} approved` : 'none approved yet'}).`
      : 'No Daily Construction Reports were submitted for this period.'
  );
  const c = f.compliance;
  if (c && !c.workDays.length && c.asOf >= c.start && req.type !== 'daily')
    S.summary.push(`No working day of this period has passed up to ${fmtDate(c.asOf)}, so Daily Construction Report coverage${c.reporter ? ` for ${c.reporter.name}` : ''} is not yet measured.`);
  if (c && c.workDays.length) {
    const who = c.reporter ? ` from ${c.reporter.name}` : '';
    S.summary.push(
      `Daily Construction Reports${who} cover ${c.reportedDays.length} of ${plural(c.workDays.length, 'working day')} up to ${fmtDate(c.asOf)}${
        c.missingDays.length ? `; no report was submitted for ${list(c.missingDays.map((d) => fmtDate(d)))}.` : '.'
      }`
    );
  }
  if (c && c.unverified.length)
    S.summary.push(`${plural(c.unverified.length, 'further report')} (${c.unverified.map((u) => u.reference).join(', ')}) ${c.unverified.length === 1 ? 'is' : 'are'} not yet submitted and ${c.unverified.length === 1 ? 'is' : 'are'} not included.`);
  if (req.type === 'monthly' && f.weeks.length) {
    const have = f.weeks.filter((w) => w.report);
    const appr = have.filter((w) => w.report!.status === 'approved' || w.report!.status === 'final').length;
    S.summary.push(
      have.length
        ? `This report consolidates ${plural(have.length, 'Weekly Accomplishment Report')} covering ${have.length} of ${plural(f.weeks.length, 'week')} of the month (${appr ? `${appr} approved` : 'none approved yet'}).`
        : `No Weekly Accomplishment Reports have been prepared for the ${plural(f.weeks.length, 'week')} of this month.`
    );
  }
  if (f.issuesOpen.length) S.summary.push(`${plural(f.issuesOpen.length, 'issue or risk', 'issues or risks')} remained open at the end of the period.`);
  if (f.previous)
    S.summary.push(
      `Compared with the previous ${t} (${f.previous.reference}, ${periodText(f.previous.type, f.previous.periodStart, f.previous.periodEnd)}), overall accomplishment moved from ${pct(f.previous.figures.actualPct)} to ${pct(m.actualPct)}.`
    );

  // C. Construction activities (chronological, from the daily reports, then the tracker).
  //    Monthly: consolidated week by week from the weekly reports and that week's daily reports.
  if (req.type === 'monthly') {
    f.weeks.forEach((w) => {
      const wr = w.report;
      const head = `Week of ${fmtRange(w.start, w.end)}`;
      const ref = wr ? ` (${wr.reference}, ${wr.status === 'final' ? 'final' : wr.status === 'approved' ? 'approved' : wr.status === 'review' ? 'for review' : 'draft'})` : '';
      const acts = [...new Set(w.reports.flatMap((d) => d.activities.map((x) => x.name).filter(Boolean)))];
      const bits: string[] = [];
      bits.push(w.reports.length ? `${plural(w.reports.length, 'Daily Construction Report')} recorded work on ${acts.length ? list(acts) : 'no named activity'}` : 'no Daily Construction Report was submitted');
      if (wr) bits.push(`${countWas(wr.figures.completed, 'activity', 'activities')} completed and overall accomplishment stood at ${pct(wr.figures.actualPct)} as of ${fmtDate(wr.figures.asOf)}`);
      else bits.push('no Weekly Accomplishment Report has been prepared');
      S.activities.push(`${head}${ref}: ${bits.join('; ')}.`);
      if (wr && (wr.status === 'approved' || wr.status === 'final')) {
        const k = wr.sections.find((x) => x.key === 'conclusion')?.text.trim();
        if (k) S.activities.push(`Approved weekly conclusion (${wr.reference}): ${k}`);
      }
    });
  } else
  f.reports.forEach((d) => {
    const acts = d.activities.filter((a) => a.name || a.workDescription || a.accomplishment);
    const parts = acts.map((a) => {
      const bits = [a.workDescription.trim(), a.accomplishment.trim() ? `accomplishment reported: ${a.accomplishment.trim()}` : ''].filter(Boolean).join('; ');
      return `${a.name || 'An activity'}${bits ? ` (${bits})` : ''}, ${a.workStatus.toLowerCase()}`;
    });
    const head = `On ${fmtDate(d.date)} (${d.reference}${d.weather ? `, weather: ${d.weather.toLowerCase()}` : ''})`;
    S.activities.push(`${parts.length ? `${head}, the site team reported work on ${list(parts)}.` : `${head}, no construction activity was recorded in the report.`}${d.site.observations.trim() ? ` Site observation: ${d.site.observations.trim()}` : ''}`);
  });
  if (f.ongoing.length)
    S.activities.push(
      `According to the Master Project Tracker, work was in progress on ${list(f.ongoing.slice(0, 12).map((r) => `${r.name} (${where(r)}, ${pct(r.progress)} against ${Math.round(plannedPercentAt(r.plannedStart, r.plannedFinish, f.asOf))}% planned)`))}${f.ongoing.length > 12 ? `, and ${plural(f.ongoing.length - 12, 'other activity', 'other activities')}` : ''}.`
    );
  if (!S.activities.length) S.activities.push(`Construction activities for this period: ${NR}`);

  // D. Work accomplishments
  if (f.completed.length)
    S.accomplishments.push(`The following work was completed: ${list(f.completed.map((r) => `${r.name} (${where(r)}${r.actualFinish ? `, completed ${fmtDate(r.actualFinish)}` : ''})`))}.`);
  const reached = f.milestones.filter((r) => r.status === 'Completed');
  if (reached.length) S.accomplishments.push(`Milestones and concrete pours achieved: ${list(reached.map((r) => `${r.name} (${fmtDate(r.actualFinish || r.finish)})`))}.`);
  const reported = f.reports.flatMap((d) => d.activities.filter((a) => a.progress !== null && a.name).map((a) => `${a.name} at ${a.progress}% (${d.reference})`));
  if (reported.length) S.accomplishments.push(`Progress reported from site: ${list(reported)}. Reported figures become tracker progress only after approval.`);
  const qty = f.reports.flatMap((d) => d.activities.filter((a) => a.accomplishment.trim()).map((a) => `${a.name}: ${a.accomplishment.trim()} (${d.reference})`));
  if (qty.length) S.accomplishments.push(`Recorded accomplishments: ${list(qty)}.`);
  if (!S.accomplishments.length) S.accomplishments.push(`Completed work and recorded quantities for this period: ${NR}`);

  // E. Manpower and resources
  if (f.manpowerDays.length) {
    const tot = f.manpowerDays.reduce((x, d) => x + d.total, 0);
    const peak = [...f.manpowerDays].sort((x, y) => y.total - x.total)[0];
    const sum = (k: 'skilled' | 'general' | 'subcontractor' | 'other') => f.manpowerDays.reduce((x, d) => x + d[k], 0);
    const breakdown = `skilled ${sum('skilled')}, general ${sum('general')}, subcontractor ${sum('subcontractor')}, other ${sum('other')}`;
    S.resources.push(
      f.manpowerDays.length === 1
        ? `Manpower recorded on ${fmtDate(peak.date)}: ${plural(tot, 'worker')} (${breakdown}), from ${list(peak.refs)}.`
        : `Daily Construction Reports recorded ${plural(tot, 'worker-day')} over ${plural(f.manpowerDays.length, 'reporting day')} (${breakdown}), with a peak of ${plural(peak.total, 'worker')} on ${fmtDate(peak.date)}.`
    );
    if (f.manpowerMissing.length) S.resources.push(`Manpower was not recorded in ${list(f.manpowerMissing)}.`);
  } else S.resources.push(`Manpower on site: ${NR}`);
  if (f.manpowerPlans.length)
    S.resources.push(`Planned crews during the period: ${list(f.manpowerPlans.map((p) => `${p.trade}${p.team ? ` (${p.team})` : ''}${p.headcount ? `, ${plural(p.headcount, 'person', 'persons')}` : ''}, ${fmtRange(p.start, p.end || p.start)}`))}.`);
  if (f.equipment.length) S.resources.push(`Equipment recorded: ${list(f.equipment.map((q) => `${q.description}${q.quantity ? ` × ${q.quantity}` : ''} (${q.status.toLowerCase()}, ${q.source})`))}.`);
  else S.resources.push(`Equipment: ${NR}`);
  const mats = [
    ...f.materials.map((x) => `${x.description}${x.quantity ? `, ${x.quantity}${x.unit ? ` ${x.unit}` : ''}` : ''}${x.supplier ? ` from ${x.supplier}` : ''} (${x.source})`),
    ...f.deliveries.map((p) => `${p.material}${p.quantity ? `, ${p.quantity}${p.unit ? ` ${p.unit}` : ''}` : ''}${p.supplier ? ` from ${p.supplier}` : ''} (delivered ${fmtDate(p.actualDelivery)})`),
  ];
  S.resources.push(mats.length ? `Materials and deliveries recorded: ${list(mats)}.` : `Materials used and delivered: ${NR}`);

  // F. Project progress
  S.progress.push(`Overall physical accomplishment: ${pct(m.actualPct)} actual against ${pct(m.plannedPct)} planned (${fmtVar(m.variancePct)}${m.spi !== null ? `; schedule performance index ${m.spi.toFixed(2)}` : ''}).`);
  const ws = m.workstreams.filter((w) => w.count > 0);
  if (ws.length && !f.subject) S.progress.push(`By workstream: ${list(ws.map((w) => `${w.label} ${pct(w.actual)} against ${pct(w.planned)} planned`))}.`);
  if (f.delayed.length)
    S.progress.push(`Activities behind schedule: ${list(f.delayed.map((r) => `${r.name} (${where(r)}, due ${fmtDate(r.finish)}, ${plural(Math.max(0, diffDays(r.finish!, f.asOf)), 'day')} late, ${pct(r.progress)} complete)`))}.`);
  if (f.inspections.length) S.progress.push(`Inspections scheduled in the period: ${list(f.inspections.map((r) => `${r.name} (${fmtDate(r.finish)}, ${r.status.toLowerCase()})`))}.`);
  S.progress.push(`Forecast completion: ${fmtDate(m.projectedCompletion)}, against the target completion of ${fmtDate(m.targetCompletion)}.`);

  // G. Issues and concerns
  if (f.issuesRaised.length) S.issues.push(`Issues raised during the period: ${list(f.issuesRaised.map((i) => `${i.title} (${i.severity.toLowerCase()} ${i.type.toLowerCase()}, ${i.status.toLowerCase()})`))}.`);
  const otherOpen = f.issuesOpen.filter((i) => !f.issuesRaised.includes(i));
  if (otherOpen.length) S.issues.push(`Issues still open from earlier periods: ${list(otherOpen.map((i) => `${i.title}${i.dueDate ? ` (resolution due ${fmtDate(i.dueDate)})` : ''}`))}.`);
  const notes = f.siteNotes.filter((n) => n.kind === 'Issue' || n.kind === 'Delay' || n.kind === 'Safety');
  if (notes.length) S.issues.push(`Concerns recorded in the Daily Construction Reports: ${list(notes.map((n) => `${n.kind.toLowerCase()} on ${fmtDate(n.date)}: ${n.text} (${n.ref})`))}.`);
  if (f.delayed.length) S.issues.push(`${plural(f.delayed.length, 'activity is', 'activities are')} behind schedule (listed under Project Progress).`);
  if (!S.issues.length) S.issues.push(`Issues, delays and safety concerns for this period: ${NR}`);

  // H. Corrective actions
  if (f.corrective.length) S.corrective.push(`Documented corrective actions: ${list(f.corrective.map((c) => `${c.title} — ${c.action} (${c.source})`))}.`);
  const fixes = f.siteNotes.filter((n) => n.kind === 'Corrective action' || n.kind === 'Recommendation');
  if (fixes.length) S.corrective.push(`From the Daily Construction Reports: ${list(fixes.map((n) => `${n.kind.toLowerCase()} on ${fmtDate(n.date)}: ${n.text} (${n.ref})`))}.`);
  if (!S.corrective.length) S.corrective.push(`Corrective actions and recommendations for this period: ${NR}`);

  // I. Next period
  const nx = f.next;
  S.nextPlan.push(`Scheduled for ${periodText(req.type === 'daily' ? 'daily' : 'weekly', nx.start, nx.end)}:`);
  if (nx.activities.length)
    S.nextPlan.push(list(nx.activities.slice(0, 15).map((r) => `${r.name} (${where(r)}, ${fmtRange(r.start, r.finish || r.start)}${r.owner ? `, ${r.owner}` : ''})`)) + (nx.activities.length > 15 ? `; and ${plural(nx.activities.length - 15, 'other activity', 'other activities')}.` : '.'));
  if (nx.events.length) S.nextPlan.push(`Calendar entries: ${list(nx.events.map((e) => `${e.title} (${fmtDate(e.date)}${e.owner ? `, ${e.owner}` : ''})`))}.`);
  if (nx.deliveries.length) S.nextPlan.push(`Expected deliveries: ${list(nx.deliveries.map((p) => `${p.material} (${fmtDate(p.expectedDelivery || p.requiredDate)})`))}.`);
  if (S.nextPlan.length === 1) S.nextPlan[0] += ` ${NR}`;

  // J. Photos (metadata only)
  S.photos.push(
    f.photos.length
      ? `${plural(f.photos.length, 'site photograph')} from the project records ${f.photos.length === 1 ? 'is' : 'are'} attached, each with the date, the source record and the caption entered when it was uploaded. Photographs illustrate the records above; accomplishments are stated only from the reports and the tracker.`
      : `Site photographs for this period: ${NR}`
  );

  // K. Conclusion
  const k: string[] = [];
  k.push(`For ${period}, the project recorded an overall physical accomplishment of ${pct(m.actualPct)} against ${pct(m.plannedPct)} planned, and its health is assessed as ${m.health}.`);
  if (f.completed.length || f.delayed.length)
    k.push(`${cap(countWas(f.completed.length, 'activity', 'activities'))} completed during the period and ${countWas(f.delayed.length, 'activity', 'activities', 'remains', 'remain')} behind schedule.`);
  if (f.issuesOpen.length) k.push(`${plural(f.issuesOpen.length, 'open issue or risk requires', 'open issues or risks require')} follow-up.`);
  if (nx.activities.length) k.push(`Priority for the next period: ${list(nx.activities.slice(0, 3).map((r) => r.name))}.`);
  S.conclusion.push(k.join(' '));

  return SECTION_TITLES.map((s) => ({ key: s.key, title: s.title, text: S[s.key].join('\n\n') }));
}

// AI guard (shared with the server): see narrativeGuard.ts
export { numberTokens, addsNoNumbers, addsNoNumberWords, checkAiSection } from './narrativeGuard.ts';

// ---------------------------------------------------------------- schedule
/** The last complete period of each scheduled type that should have a prepared draft. */
export function duePeriods(sched: Pick<NarrativeSchedule, 'daily' | 'weekly' | 'monthly'>, today: string): { type: NarrativeType; start: string; end: string }[] {
  const out: { type: NarrativeType; start: string; end: string }[] = [];
  if (sched.daily) {
    const y = addDays(today, -1);
    out.push({ type: 'daily', start: y, end: y });
  }
  if (sched.weekly) {
    const w = weekRange(addDays(weekRange(today).start, -1));
    out.push({ type: 'weekly', start: w.start, end: w.end });
  }
  if (sched.monthly) {
    const mm = monthRange(addDays(monthRange(today).start, -1));
    out.push({ type: 'monthly', start: mm.start, end: mm.end });
  }
  return out;
}

/** Upcoming preparation dates (for the dashboard and the Project Calendar). */
export function upcomingPreparations(sched: Pick<NarrativeSchedule, 'daily' | 'weekly' | 'monthly'>, today: string, days = 60): { date: string; type: NarrativeType; period: string }[] {
  const out: { date: string; type: NarrativeType; period: string }[] = [];
  if (sched.daily) out.push({ date: addDays(today, 1), type: 'daily', period: fmtDate(today) });
  if (sched.weekly || sched.monthly) {
    for (let i = 1; i <= days; i++) {
      const d = addDays(today, i);
      if (sched.weekly && weekRange(d).start === d) {
        const w = weekRange(addDays(d, -1));
        out.push({ date: d, type: 'weekly', period: fmtRange(w.start, w.end) });
      }
      if (sched.monthly && d.endsWith('-01')) {
        const mm = monthRange(addDays(d, -1));
        out.push({ date: d, type: 'monthly', period: fmtRange(mm.start, mm.end) });
      }
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
