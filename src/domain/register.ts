/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * MASTER PROJECT REGISTER
 * -----------------------
 * One derived list of every schedulable item in the project, built from the
 * records that already exist in Firestore (scopes, concrete pours, milestones,
 * episodes and manual activities) plus each item's control metadata document
 * (the `overrides` collection).
 *
 * Nothing here copies records into a second store: every module (tracker,
 * calendars, Gantt, reports, analytics, forecast) calls `buildRegister` and
 * therefore always shows the same, current data. Edits are written back to
 * the source record, so the Upcoming slide, floor slides and every Command
 * Center view stay in sync automatically.
 */

import {
  Activity,
  ActivityOverride,
  ActivityStatus,
  Commitment,
  ConcretePour,
  Episode,
  Milestone,
  Priority,
  ScopeItem,
  Character,
} from '../types/index.ts';
import { parseDateWindow } from '../utils/calculations.ts';
import { isValidIso, toIsoDate, todayIso, workingDaysBetween, diffDays, parseIsoDate } from './dates.ts';

export type RegisterKind = 'scope' | 'pour' | 'milestone' | 'episode' | 'manual';
export type Stream = 'Construction' | 'Production' | 'Milestone';

export interface RegisterActivity {
  id: string; // stable unique activity ID, e.g. SC-sc_gf_s_3
  key: string; // stable metadata key
  legacyKeys: string[];
  kind: RegisterKind;
  sourceId: string;
  name: string;
  stream: Stream;
  workstream: string; // e.g. "GF · Structural", "Production", "Concrete", "Milestones"
  floor?: 'GF' | '2F' | '3F';
  phase?: 'Structural' | 'Finishing';
  scopeOfWork: string;
  description: string;
  owner: string;
  supporting: string;
  department: string;
  /** Baseline (original) planned dates — preserved when the schedule is revised. */
  plannedStart?: string;
  plannedFinish?: string;
  /** Current (revised) schedule. Equal to planned until a revision is made. */
  start?: string;
  finish?: string;
  actualStart?: string;
  actualFinish?: string;
  baselineDuration: number; // working days
  duration: number; // working days of current schedule
  status: ActivityStatus;
  progress: number; // actual physical / stage progress 0–100
  progressBasis: 'physical' | 'stage' | 'status';
  plannedProgress: number; // where the baseline says it should be today
  weight: number; // share (%) of overall physical accomplishment (scopes only)
  weightedActual: number; // weight × progress / 100
  weightedPlanned: number;
  dependsOn: string[];
  priority: Priority;
  commitment: Commitment;
  remarks: string;
  concern: string;
  correctiveAction: string;
  resolutionDate?: string;
  onHold: boolean;
  overdue: boolean;
  slipDays: number; // current finish − baseline finish (calendar days)
  revisionCount: number;
  lastRevisedAt?: string;
  lastUpdated?: string;
  updatedBy?: string;
  isInspection: boolean;
  isPour: boolean;
  isMilestone: boolean;
  dateText?: string;
  characters: string[];
  episodeStatus?: Episode['status'];
  location?: string;
  badge?: string;
}

export interface RegisterInput {
  scopes: ScopeItem[];
  pours: ConcretePour[];
  milestones: Milestone[];
  episodes: Episode[];
  activities: Activity[];
  overrides: Record<string, ActivityOverride>;
  characters?: Character[];
}

// ---------- Keys ----------
export const scopeKey = (s: ScopeItem) => `sc|${s.id}`;
export const legacyScopeKey = (s: ScopeItem) => `c|${s.floor}|${s.phase}|${s.name}|${s.dateText}`;
export const milestoneKey = (m: Milestone) => `ms|${m.id}`;
export const legacyMilestoneKey = (m: Milestone) => `m|${m.index}|${m.label}`;
export const pourKey = (p: ConcretePour) => `p|${p.id}`;
export const episodeKey = (e: Episode) => `e|${e.id}|s`;
export const manualKey = (a: Activity) => `a|${a.id}`;

export const scopeActivityId = (id: string) => `SC-${id}`;
export const pourActivityId = (id: string) => `PR-${id}`;
export const milestoneActivityId = (id: string) => `MS-${id}`;
export const episodeActivityId = (id: string) => `EP-${id}`;
export const manualActivityId = (id: string) => `AC-${id}`;

/** Merge legacy metadata (older documents) with the stable-key document. */
export function resolveMeta(
  overrides: Record<string, ActivityOverride>,
  key: string,
  legacyKeys: string[] = []
): ActivityOverride {
  let merged: ActivityOverride = { key };
  for (const lk of legacyKeys) {
    const v = overrides[lk];
    if (v) merged = { ...merged, ...stripEmpty(v) };
  }
  const own = overrides[key];
  if (own) merged = { ...merged, ...stripEmpty(own) };
  merged.key = key;
  return merged;
}

function stripEmpty(o: ActivityOverride): Partial<ActivityOverride> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (v === undefined || v === null) continue;
    if (typeof v === 'string' && v === '' && k !== 'remarks') continue;
    out[k] = v;
  }
  return out as Partial<ActivityOverride>;
}

const POUR_STAGE: Record<string, number> = {
  'Not Yet Started': 0,
  'Preparation Ongoing': 15,
  'Ready for Pouring': 25,
  'Scheduled for Pouring': 25,
  'Pouring Ongoing': 50,
  'Pouring Completed': 70,
  'Curing Ongoing': 85,
  'Completed / Approved': 100,
};

function windowIso(text: string | undefined): [string, string] | null {
  const w = parseDateWindow(text || '');
  if (!w) return null;
  return [toIsoDate(w[0]), toIsoDate(w[1])];
}

/** Share of the baseline window's working days elapsed as of `asOf` (0–100). */
export function plannedPercentAt(start: string | undefined, finish: string | undefined, asOf: string): number {
  if (!isValidIso(start)) return 0;
  const end = isValidIso(finish) ? finish : start;
  if (asOf < start) return 0;
  if (asOf >= end) return 100;
  const total = workingDaysBetween(start, end);
  if (total <= 0) {
    // Calendar fallback for windows with no working days (e.g. stoppage)
    const cal = diffDays(start, end) + 1;
    return Math.round(((diffDays(start, asOf) + 1) / cal) * 100);
  }
  const done = workingDaysBetween(start, asOf);
  return Math.max(0, Math.min(100, (done / total) * 100));
}

function deriveStatus(opts: {
  completed: boolean;
  onHold: boolean;
  start?: string;
  finish?: string;
  progress: number;
  today: string;
  forcedDelayed?: boolean;
  forcedOngoing?: boolean;
}): ActivityStatus {
  const { completed, onHold, start, finish, progress, today } = opts;
  if (completed) return 'Completed';
  if (onHold) return 'On Hold';
  if (opts.forcedDelayed) return 'Delayed';
  if (isValidIso(finish) && finish < today) return 'Delayed';
  if (opts.forcedOngoing) return 'Ongoing';
  if ((isValidIso(start) && start <= today) || progress > 0) return 'Ongoing';
  return 'Upcoming';
}

const INSPECTION_RE = /inspect|testing|commission|punchlist/i;

function normalizePriority(p?: string): Priority {
  return p === 'Low' || p === 'High' || p === 'Critical' ? p : 'Medium';
}

/** Build the unified register. Pure; safe to call on every render (memoize). */
export function buildRegister(input: RegisterInput, today: string = todayIso()): RegisterActivity[] {
  const list: RegisterActivity[] = [];
  const charName = new Map((input.characters || []).map((c) => [c.id, c.name]));

  // Weight basis: working days of each construction scope's baseline window
  const scopeWeights = new Map<string, number>();
  let totalWeight = 0;
  input.scopes.forEach((s) => {
    const w = s.workingDays > 0 ? s.workingDays : 0;
    scopeWeights.set(s.id, w);
    totalWeight += w;
  });

  // 1. Construction scopes
  input.scopes.forEach((s) => {
    const key = scopeKey(s);
    const legacy = legacyScopeKey(s);
    const meta = resolveMeta(input.overrides, key, [legacy]);
    const cur = windowIso(s.dateText);
    const start = cur?.[0];
    const finish = cur?.[1];
    const plannedStart = isValidIso(meta.baselineStart) ? meta.baselineStart : start;
    const plannedFinish = isValidIso(meta.baselineFinish) ? meta.baselineFinish : finish;
    const progress = Math.max(0, Math.min(100, Number(s.percentComplete) || 0));
    const status = deriveStatus({
      completed: progress >= 100,
      onHold: !!meta.onHold,
      start,
      finish,
      progress,
      today,
    });
    const rawW = scopeWeights.get(s.id) || 0;
    const weight = totalWeight > 0 ? (rawW / totalWeight) * 100 : 0;
    const planned = plannedPercentAt(plannedStart, plannedFinish, today);
    list.push({
      id: scopeActivityId(s.id),
      key,
      legacyKeys: [legacy],
      kind: 'scope',
      sourceId: s.id,
      name: s.name,
      stream: 'Construction',
      workstream: `${s.floor} · ${s.phase}`,
      floor: s.floor,
      phase: s.phase,
      scopeOfWork: `${s.floor} ${s.phase} works`,
      description: s.subNote || '',
      owner: meta.owner || '',
      supporting: meta.supporting || '',
      department: meta.department || '',
      plannedStart,
      plannedFinish,
      start,
      finish,
      actualStart: meta.actualStart,
      actualFinish: meta.actualFinish,
      baselineDuration: workingDaysBetween(plannedStart, plannedFinish),
      duration: s.workingDays,
      status,
      progress,
      progressBasis: 'physical',
      plannedProgress: Math.round(planned),
      weight,
      weightedActual: (weight * progress) / 100,
      weightedPlanned: (weight * planned) / 100,
      dependsOn: meta.dependsOn || [],
      priority: normalizePriority(meta.priority || (/controlling/i.test(s.name) ? 'Critical' : undefined)),
      commitment: meta.commitment || 'Target',
      remarks: meta.remarks || '',
      concern: meta.concern || '',
      correctiveAction: meta.correctiveAction || '',
      resolutionDate: meta.resolutionDate,
      onHold: !!meta.onHold,
      overdue: status === 'Delayed',
      slipDays: plannedFinish && finish ? diffDays(plannedFinish, finish) : 0,
      revisionCount: meta.revisionCount || 0,
      lastRevisedAt: meta.lastRevisedAt,
      lastUpdated: maxTimestamp(s.updatedAt, meta.updatedAt),
      updatedBy: s.updatedBy || meta.updatedBy,
      isInspection: INSPECTION_RE.test(s.name),
      isPour: /concrete/i.test(s.name),
      isMilestone: /controlling milestone|completion/i.test(s.name),
      dateText: s.dateText,
      characters: [],
    });
  });

  // 2. Concrete pours
  input.pours.forEach((p) => {
    const key = pourKey(p);
    const meta = resolveMeta(input.overrides, key);
    const start = isValidIso(p.targetPour) ? p.targetPour : undefined;
    const finish = isValidIso(p.targetCompletion) ? p.targetCompletion : start;
    const plannedStart = isValidIso(meta.baselineStart) ? meta.baselineStart : start;
    const plannedFinish = isValidIso(meta.baselineFinish) ? meta.baselineFinish : finish;
    const progress = POUR_STAGE[p.milestoneStatus] ?? 0;
    const completed = p.milestoneStatus === 'Completed / Approved';
    const inMotion = ['Pouring Ongoing', 'Curing Ongoing', 'Preparation Ongoing', 'Pouring Completed'].includes(p.milestoneStatus);
    // A pour is late only when it has not been poured by its target date,
    // or not completed by its target completion date.
    const notPouredLate = !!start && start < today && !isValidIso(p.actualPour) && p.pourStatus !== 'Completed' && !inMotion;
    const status = deriveStatus({
      completed,
      onHold: !!meta.onHold,
      start,
      finish: undefined,
      progress,
      today,
      forcedDelayed: p.milestoneStatus === 'Delayed' || notPouredLate || (!!finish && finish < today && !completed),
      forcedOngoing: inMotion,
    });
    list.push({
      id: pourActivityId(p.id),
      key,
      legacyKeys: [],
      kind: 'pour',
      sourceId: p.id,
      name: `${p.floor} · ${p.component} pour`,
      stream: 'Construction',
      workstream: 'Concrete pours',
      floor: p.floor,
      scopeOfWork: p.activity || p.component,
      description: `Prep ${p.prepStatus} · Pour ${p.pourStatus} · Cure ${p.cureStatus} · Inspection ${p.inspStatus}`,
      owner: meta.owner || '',
      supporting: meta.supporting || '',
      department: meta.department || '',
      plannedStart,
      plannedFinish,
      start,
      finish,
      actualStart: isValidIso(p.actualPour) ? p.actualPour : meta.actualStart,
      actualFinish: isValidIso(p.actualCompletion) ? p.actualCompletion : meta.actualFinish,
      baselineDuration: workingDaysBetween(plannedStart, plannedFinish),
      duration: workingDaysBetween(start, finish),
      status,
      progress,
      progressBasis: 'stage',
      plannedProgress: Math.round(plannedPercentAt(plannedStart, plannedFinish, today)),
      weight: 0,
      weightedActual: 0,
      weightedPlanned: 0,
      dependsOn: meta.dependsOn || [],
      priority: normalizePriority(meta.priority || 'High'),
      commitment: meta.commitment || (p.pourStatus === 'Scheduled' || p.milestoneStatus === 'Scheduled for Pouring' ? 'Confirmed' : 'Target'),
      remarks: p.remarks || meta.remarks || '',
      concern: meta.concern || '',
      correctiveAction: meta.correctiveAction || '',
      resolutionDate: meta.resolutionDate,
      onHold: !!meta.onHold,
      overdue: status === 'Delayed',
      slipDays: plannedStart && isValidIso(p.actualPour) ? diffDays(plannedStart, p.actualPour) : plannedFinish && finish ? diffDays(plannedFinish, finish) : 0,
      revisionCount: meta.revisionCount || 0,
      lastRevisedAt: meta.lastRevisedAt,
      lastUpdated: maxTimestamp(p.updatedAt, meta.updatedAt),
      updatedBy: p.updatedBy || meta.updatedBy,
      isInspection: p.inspStatus === 'For inspection',
      isPour: true,
      isMilestone: true,
      characters: [],
    });
  });

  // 3. Milestones
  input.milestones.forEach((m) => {
    const key = milestoneKey(m);
    const legacy = legacyMilestoneKey(m);
    const meta = resolveMeta(input.overrides, key, [legacy]);
    const cur = windowIso(m.dateText);
    const start = cur?.[0];
    const finish = cur?.[1];
    const plannedStart = isValidIso(meta.baselineStart) ? meta.baselineStart : start;
    const plannedFinish = isValidIso(meta.baselineFinish) ? meta.baselineFinish : finish;
    const completed = m.status === 'Complete';
    const progress = completed ? 100 : m.status === 'In progress' ? 50 : 0;
    const status = deriveStatus({
      completed,
      onHold: !!meta.onHold,
      start,
      finish,
      progress,
      today,
      forcedDelayed: m.status === 'Delayed' || m.status === 'Date passed · confirm',
      forcedOngoing: m.status === 'In progress',
    });
    list.push({
      id: milestoneActivityId(m.id),
      key,
      legacyKeys: [legacy],
      kind: 'milestone',
      sourceId: m.id,
      name: m.label,
      stream: 'Milestone',
      workstream: 'Milestones',
      scopeOfWork: 'Key milestone',
      description: m.badge?.text ? `${m.badge.text} date` : '',
      owner: meta.owner || '',
      supporting: meta.supporting || '',
      department: meta.department || '',
      plannedStart,
      plannedFinish,
      start,
      finish,
      actualStart: meta.actualStart,
      actualFinish: meta.actualFinish,
      baselineDuration: workingDaysBetween(plannedStart, plannedFinish),
      duration: workingDaysBetween(start, finish),
      status,
      progress,
      progressBasis: 'status',
      plannedProgress: Math.round(plannedPercentAt(plannedStart, plannedFinish, today)),
      weight: 0,
      weightedActual: 0,
      weightedPlanned: 0,
      dependsOn: meta.dependsOn || [],
      priority: normalizePriority(meta.priority || (m.badge?.type === 'fixed' ? 'Critical' : 'High')),
      commitment:
        meta.commitment ||
        (m.badge?.type === 'confirmed' || m.badge?.type === 'provided' ? 'Confirmed' : m.badge?.type === 'fixed' ? 'Target' : 'Target'),
      remarks: meta.remarks || '',
      concern: meta.concern || '',
      correctiveAction: meta.correctiveAction || '',
      resolutionDate: meta.resolutionDate,
      onHold: !!meta.onHold,
      overdue: status === 'Delayed',
      slipDays: plannedFinish && finish ? diffDays(plannedFinish, finish) : 0,
      revisionCount: meta.revisionCount || 0,
      lastRevisedAt: meta.lastRevisedAt,
      lastUpdated: maxTimestamp(m.updatedAt, meta.updatedAt),
      updatedBy: m.updatedBy || meta.updatedBy,
      isInspection: INSPECTION_RE.test(m.label),
      isPour: /concrete|slab/i.test(m.label),
      isMilestone: true,
      dateText: m.dateText,
      characters: [],
      badge: m.badge?.text,
    });
  });

  // 4. Production episodes (shoot windows)
  input.episodes.forEach((e) => {
    const key = episodeKey(e);
    const meta = resolveMeta(input.overrides, key);
    const start = isValidIso(e.shootStart) ? e.shootStart : undefined;
    const finish = isValidIso(e.shootEnd) ? e.shootEnd : start;
    const plannedStart = isValidIso(meta.baselineStart) ? meta.baselineStart : start;
    const plannedFinish = isValidIso(meta.baselineFinish) ? meta.baselineFinish : finish;
    const completed = e.status === 'Completed';
    const status = deriveStatus({
      completed,
      onHold: !!meta.onHold,
      start,
      finish,
      progress: completed ? 100 : 0,
      today,
    });
    const label = e.episodeLabel ? e.episodeLabel : `Ep ${e.number}`;
    list.push({
      id: episodeActivityId(e.id),
      key,
      legacyKeys: [],
      kind: 'episode',
      sourceId: e.id,
      name: `${label}: ${e.title}`,
      stream: 'Production',
      workstream: 'Production',
      scopeOfWork: e.scopeOfWork || '',
      description: e.topic || '',
      owner: e.director || meta.owner || '',
      supporting: meta.supporting || '',
      department: meta.department || '',
      plannedStart,
      plannedFinish,
      start,
      finish,
      actualStart: meta.actualStart,
      actualFinish: meta.actualFinish,
      baselineDuration: workingDaysBetween(plannedStart, plannedFinish),
      duration: workingDaysBetween(start, finish),
      status,
      progress: completed ? 100 : 0,
      progressBasis: 'status',
      plannedProgress: Math.round(plannedPercentAt(plannedStart, plannedFinish, today)),
      weight: 0,
      weightedActual: 0,
      weightedPlanned: 0,
      dependsOn: meta.dependsOn || [],
      priority: normalizePriority(meta.priority),
      commitment: meta.commitment || (e.status === 'Scheduled' || e.status === 'Completed' ? 'Confirmed' : 'Tentative'),
      remarks: e.remarks || meta.remarks || '',
      concern: meta.concern || '',
      correctiveAction: meta.correctiveAction || '',
      resolutionDate: meta.resolutionDate,
      onHold: !!meta.onHold,
      overdue: status === 'Delayed',
      slipDays: plannedStart && start ? diffDays(plannedStart, start) : 0,
      revisionCount: meta.revisionCount || 0,
      lastRevisedAt: meta.lastRevisedAt,
      lastUpdated: maxTimestamp(e.updatedAt, meta.updatedAt),
      updatedBy: e.updatedBy || meta.updatedBy,
      isInspection: false,
      isPour: false,
      isMilestone: false,
      characters: (e.characters || []).map((id) => charName.get(id) || id),
      episodeStatus: e.status,
      location: e.location,
    });
  });

  // 5. Manual activities
  input.activities.forEach((a) => {
    const key = manualKey(a);
    const meta = resolveMeta(input.overrides, key);
    const start = isValidIso(a.startDate) ? a.startDate : undefined;
    const finish = isValidIso(a.endDate) ? a.endDate : start;
    const plannedStart = isValidIso(meta.baselineStart) ? meta.baselineStart : start;
    const plannedFinish = isValidIso(meta.baselineFinish) ? meta.baselineFinish : finish;
    const progress = a.status === 'Completed' ? 100 : Math.max(0, Math.min(100, meta.progress || 0));
    const status: ActivityStatus =
      a.status === 'Completed' || a.status === 'On Hold'
        ? a.status
        : a.status === 'Delayed' || (finish && finish < today)
        ? 'Delayed'
        : a.status === 'Ongoing' || (start && start <= today)
        ? 'Ongoing'
        : 'Upcoming';
    const stream: Stream = a.category === 'Production' ? 'Production' : a.category === 'Milestone' ? 'Milestone' : 'Construction';
    list.push({
      id: manualActivityId(a.id),
      key,
      legacyKeys: [],
      kind: 'manual',
      sourceId: a.id,
      name: a.title,
      stream,
      workstream: a.category === 'Concrete' ? 'Concrete pours' : a.category === 'Other' ? 'General' : a.category === 'Milestone' ? 'Milestones' : a.category,
      scopeOfWork: a.category,
      description: a.description || '',
      owner: a.owner || meta.owner || '',
      supporting: meta.supporting || '',
      department: meta.department || '',
      plannedStart,
      plannedFinish,
      start,
      finish,
      actualStart: meta.actualStart,
      actualFinish: meta.actualFinish,
      baselineDuration: workingDaysBetween(plannedStart, plannedFinish),
      duration: workingDaysBetween(start, finish),
      status,
      progress,
      progressBasis: 'status',
      plannedProgress: Math.round(plannedPercentAt(plannedStart, plannedFinish, today)),
      weight: 0,
      weightedActual: 0,
      weightedPlanned: 0,
      dependsOn: meta.dependsOn || [],
      priority: normalizePriority(meta.priority),
      commitment: meta.commitment || 'Target',
      remarks: a.notes || meta.remarks || '',
      concern: meta.concern || '',
      correctiveAction: meta.correctiveAction || '',
      resolutionDate: meta.resolutionDate,
      onHold: a.status === 'On Hold' || !!meta.onHold,
      overdue: status === 'Delayed',
      slipDays: plannedFinish && finish ? diffDays(plannedFinish, finish) : 0,
      revisionCount: meta.revisionCount || 0,
      lastRevisedAt: meta.lastRevisedAt,
      lastUpdated: maxTimestamp(a.updatedAt, meta.updatedAt),
      updatedBy: a.updatedBy || meta.updatedBy,
      isInspection: INSPECTION_RE.test(a.title),
      isPour: a.category === 'Concrete',
      isMilestone: a.category === 'Milestone',
      characters: [],
    });
  });

  list.sort((a, b) => (a.start || '9999').localeCompare(b.start || '9999') || a.name.localeCompare(b.name));
  return list;
}

function maxTimestamp(...vals: Array<string | undefined>): string | undefined {
  const v = vals.filter((x): x is string => !!x).sort();
  return v[v.length - 1];
}

/** Episode → construction scope links, by explicit dependency or text match. */
export function linkedScopesForEpisode(ep: RegisterActivity, register: RegisterActivity[]): { scope: RegisterActivity; explicit: boolean }[] {
  const scopes = register.filter((r) => r.kind === 'scope');
  const explicit = ep.dependsOn
    .map((id) => scopes.find((s) => s.id === id))
    .filter((s): s is RegisterActivity => !!s)
    .map((scope) => ({ scope, explicit: true }));
  if (explicit.length) return explicit;
  const text = (ep.scopeOfWork || '').toLowerCase();
  if (!text || /before the schedule/.test(text)) return [];
  const floorHint = /\b(gf|ground)\b/.test(text) ? 'GF' : /\b2f\b/.test(text) ? '2F' : /\b3f\b/.test(text) ? '3F' : undefined;
  const segments = text.split(/[;]/).map((s) => s.trim()).filter(Boolean);
  const matches: RegisterActivity[] = [];
  segments.forEach((seg) => {
    const segTokens = tokens(seg);
    if (!segTokens.size) return;
    let best: { s: RegisterActivity; score: number }[] = [];
    scopes.forEach((s) => {
      const st = tokens(s.name);
      let inter = 0;
      st.forEach((t) => segTokens.has(t) && inter++);
      const score = inter / Math.max(1, Math.min(st.size, segTokens.size));
      if (score >= 0.6) best.push({ s, score });
    });
    if (floorHint) {
      const hinted = best.filter((b) => b.s.floor === floorHint);
      if (hinted.length) best = hinted;
    }
    best.sort((a, b) => b.score - a.score);
    const top = best[0]?.score;
    // Keep the top-scoring scopes that are closest in time to the shoot
    const candidates = best.filter((b) => b.score === top).map((b) => b.s);
    candidates.sort((a, b) => Math.abs(diffDaysSafe(a.start, ep.start)) - Math.abs(diffDaysSafe(b.start, ep.start)));
    if (candidates[0] && !matches.includes(candidates[0])) matches.push(candidates[0]);
  });
  return matches.map((scope) => ({ scope, explicit: false }));
}

function diffDaysSafe(a?: string, b?: string): number {
  if (!a || !b) return 9999;
  return diffDays(a, b);
}

const STOP = new Set(['and', 'the', 'of', 'works', 'work', 'a', '&', '/', '-', 'for', 'to']);
function tokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[()]/g, ' ')
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 1 && !STOP.has(t))
      .map((t) => t.replace(/s$/, ''))
  );
}

export function findActivity(register: RegisterActivity[], id: string): RegisterActivity | undefined {
  return register.find((r) => r.id === id);
}

export function isoOrUndefined(d?: Date | null): string | undefined {
  return d ? toIsoDate(d) : undefined;
}

export { parseIsoDate };
