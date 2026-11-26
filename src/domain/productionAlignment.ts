/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * PRODUCTION ALIGNMENT — connects construction milestones, educational
 * episodes and production schedules.
 *
 * Sources (nothing is duplicated):
 *   episodes            → number, title, topic, target shoot dates, director, cast, status, location
 *   characters          → cast names
 *   register            → construction scopes / pours / milestones (current, baseline and actual dates)
 *   overrides.dependsOn → explicit episode → construction links (same field the activity editor uses)
 *   episodeProduction   → production-only details (classification, team, availability, checklist, approvals)
 *
 * Rules:
 *   - A projected date (derived from the construction schedule) is NEVER treated as a confirmed shoot date.
 *     Only a director / authorized manager approval confirms a shoot date.
 *   - When a linked construction date moves, dependent episodes are flagged FOR REVIEW. Dates are not moved.
 *   - Missing information is reported as "Awaiting Information", never estimated.
 */

import type { ActivityOverride, Character, ChecklistKey, Episode, EpisodeProduction, ProdClass, TeamRole } from '../types/index.ts';
import { RegisterActivity, linkedScopesForEpisode, episodeActivityId } from './register.ts';
import { addDays, diffDays, isValidIso, monthRange, overlaps, todayIso } from './dates.ts';
import { WORK_STOPPAGE_START, WORK_STOPPAGE_END, toIsoDate } from '../utils/calculations.ts';

export const AWAITING = 'Awaiting Information';
export const PRODUCTION_PORTAL_ID = 'PRODUCTION-ALIGNMENT';

export type Light = 'green' | 'yellow' | 'orange' | 'red' | 'gray';
export const LIGHTS: { id: Light; label: string; color: string; note: string }[] = [
  { id: 'green', label: 'Aligned', color: '#16a34a', note: 'Production aligned' },
  { id: 'yellow', label: 'Prepare', color: '#eab308', note: 'Upcoming milestone; preparation required' },
  { id: 'orange', label: 'Adjust', color: '#f97316', note: 'Schedule adjustment required' },
  { id: 'red', label: 'Delayed', color: '#dc2626', note: 'Delayed construction milestone affecting production' },
  { id: 'gray', label: 'Not scheduled', color: '#9ca3af', note: 'Not yet scheduled' },
];
export const LIGHT: Record<Light, (typeof LIGHTS)[number]> = Object.fromEntries(LIGHTS.map((l) => [l.id, l])) as any;

export const CLASS_LABEL: Record<ProdClass, string> = { time: 'Time-Sensitive', flexible: 'Non-Time-Sensitive' };

export const TEAM_ROLES: { id: TeamRole; label: string; required: boolean }[] = [
  { id: 'coordinator', label: 'Production Coordinator', required: true },
  { id: 'camera', label: 'Camera Team', required: true },
  { id: 'site', label: 'Site Coordinator', required: false },
  { id: 'technical', label: 'Technical Resource Person', required: false },
  { id: 'other', label: 'Other Personnel', required: false },
];

export const CHECKLIST: { id: ChecklistKey; label: string; preShoot: boolean; auto?: string }[] = [
  { id: 'script', label: 'Script ready', preShoot: true },
  { id: 'talkingPoints', label: 'Educational talking points ready', preShoot: true },
  { id: 'milestone', label: 'Construction milestone confirmed', preShoot: true, auto: 'Confirmed or started construction activity' },
  { id: 'cast', label: 'Characters confirmed', preShoot: true, auto: 'Every character marked available' },
  { id: 'director', label: 'Director approved', preShoot: true, auto: 'Shoot date approved by the director' },
  { id: 'siteAccess', label: 'Site access coordinated', preShoot: true },
  { id: 'camera', label: 'Camera team ready', preShoot: true },
  { id: 'shot', label: 'Shoot completed', preShoot: false, auto: 'Actual filming date recorded' },
  { id: 'footage', label: 'Footage uploaded', preShoot: false },
  { id: 'docs', label: 'Episode documentation completed', preShoot: false },
];

export const CATEGORIES = ['Educational Episode', 'B-Roll', 'Behind-the-Scenes', 'Special Feature'];

export type ShootStatus =
  | 'Completed'
  | 'Not Scheduled'
  | 'For Review'
  | 'Confirmed'
  | 'Awaiting Construction Confirmation'
  | 'Rescheduled'
  | 'Tentative';

export type AssignmentStatus = 'For Assignment' | 'For Confirmation' | 'Confirmed' | 'Completed';

export interface Range {
  start: string;
  end: string;
}

export interface PPMilestone {
  id: string;
  name: string;
  group: string;
  start?: string;
  finish?: string;
  baselineStart?: string;
  baselineFinish?: string;
  actualStart?: string;
  actualFinish?: string;
  status: string;
  commitment: string;
  /** Started, completed, or its date was confirmed by the construction team. */
  confirmed: boolean;
  delayed: boolean;
  isPour: boolean;
  isMilestone: boolean;
}

export interface PPCheck {
  id: ChecklistKey;
  label: string;
  done: boolean;
  auto: boolean;
  na: boolean;
  preShoot: boolean;
}

export interface PPEpisode {
  id: string;
  number: number;
  code: string; // "EP 08" or label such as "B-ROLLS"
  title: string;
  topic: string;
  category: string;
  classification: ProdClass;
  classAuto: boolean;
  objective?: string;
  description?: string;
  scopeOfWork?: string;
  location?: string;
  duration?: string;
  director?: string;
  directorConfirmed: boolean;
  team: { role: TeamRole; label: string; name?: string; confirmed: boolean; required: boolean }[];
  cast: { id: string; name: string; role?: string; availability: 'Available' | 'Pending' | 'Unavailable' }[];
  target?: Range;
  original?: Range;
  projected?: Range & { commitment: string };
  proposed?: Range & { note?: string };
  confirmed?: Range;
  actual?: Range;
  /** The window shown on calendars: actual → confirmed → target → projected. */
  shown?: Range & { kind: 'actual' | 'confirmed' | 'target' | 'projected' };
  status: ShootStatus;
  light: Light;
  lightReason: string;
  readiness: { pct: number; ready: boolean; awaiting: string[] };
  assignment: AssignmentStatus;
  checklist: PPCheck[];
  milestoneIds: string[];
  linkAuto: boolean;
  moved: { id: string; name: string; from?: string; to?: string }[];
  history: { at: string; by?: string; action: string; from?: string; to?: string; note?: string }[];
  episodeStatus: string;
}

export type AlertType =
  | 'milestoneSoon'
  | 'shootSoon'
  | 'milestoneDelayed'
  | 'scheduleAffected'
  | 'castPending'
  | 'approvalPending'
  | 'teamIncomplete'
  | 'docsPending';

export const ALERT_LABEL: Record<AlertType, string> = {
  milestoneSoon: 'Construction milestone approaching',
  shootSoon: 'Educational shoot approaching',
  milestoneDelayed: 'Construction milestone delayed',
  scheduleAffected: 'Episode production schedule affected',
  castPending: 'Character availability not confirmed',
  approvalPending: 'Director approval pending',
  teamIncomplete: 'Production team assignments incomplete',
  docsPending: 'Shoot completed — documentation pending',
};

export interface PPAlert {
  key: string;
  type: AlertType;
  severity: 'critical' | 'warn' | 'info';
  episodeId: string;
  episode: string;
  title: string;
  impact: string;
  action: string;
  status: 'FOR REVIEW' | 'ACTION REQUIRED' | 'FOR INFORMATION';
  date?: string;
}

export interface PortalProduction {
  asOf: string;
  today: string;
  episodes: PPEpisode[];
  milestones: PPMilestone[];
  characters: { id: string; name: string }[];
  alerts: PPAlert[];
}

export interface ProductionInput {
  episodes: Episode[];
  characters: Character[];
  register: RegisterActivity[];
  records: EpisodeProduction[];
  /** Activity overrides — target-date revision history recorded by every module. */
  overrides?: Record<string, ActivityOverride>;
  today?: string;
  now?: string;
}

const iso = (s?: string) => (isValidIso(s) ? s : undefined);
const range = (start?: string, end?: string): Range | undefined => {
  const s = iso(start);
  if (!s) return undefined;
  const e = iso(end);
  return { start: s, end: e && e >= s ? e : s };
};

const STOP_START = toIsoDate(WORK_STOPPAGE_START);
const STOP_END = toIsoDate(WORK_STOPPAGE_END);

/** Construction milestones a shoot can be aligned with (scopes, pours, project milestones). */
export function constructionMilestones(register: RegisterActivity[], today: string): PPMilestone[] {
  return register
    .filter((r) => r.kind === 'scope' || r.kind === 'pour' || r.kind === 'milestone' || (r.kind === 'manual' && r.stream === 'Construction'))
    .filter((r) => r.start || r.actualStart)
    .map((r) => {
      const finish = r.finish || r.start;
      const done = r.status === 'Completed';
      const delayed = !done && (r.status === 'Delayed' || r.overdue || (!!finish && finish < today && !r.actualFinish));
      return {
        id: r.id,
        name: r.name,
        group: r.kind === 'milestone' ? 'Project Milestone' : r.kind === 'pour' || r.isPour ? 'Concrete Pour' : r.workstream,
        start: r.start,
        finish,
        baselineStart: r.plannedStart,
        baselineFinish: r.plannedFinish,
        actualStart: r.actualStart,
        actualFinish: r.actualFinish,
        status: r.status,
        commitment: r.commitment,
        confirmed: done || !!r.actualStart || r.status === 'Ongoing' || r.commitment === 'Confirmed',
        delayed,
        isPour: r.kind === 'pour' || r.isPour,
        isMilestone: r.kind === 'milestone',
      };
    })
    .sort((a, b) => (a.start || '').localeCompare(b.start || '') || a.name.localeCompare(b.name));
}

const STOPW = new Set(['and', 'the', 'of', 'works', 'work', 'a', 'for', 'to', 'date', 'begins', 'final', 'gf', '2f', '3f', 'ground', 'second', 'third', 'floor']);
function toks(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[()]/g, ' ')
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 1 && !STOPW.has(t))
      .map((t) => t.replace(/s$/, ''))
  );
}
function floorOf(s: string): 'GF' | '2F' | '3F' | undefined {
  const t = s.toLowerCase();
  return /\bgf\b|ground floor/.test(t) ? 'GF' : /\b2f\b|second floor/.test(t) ? '2F' : /\b3f\b|third floor/.test(t) ? '3F' : undefined;
}

/**
 * Suggested links when the standard matcher finds none: each part of the scope of work is matched
 * against construction scopes, concrete pours and project milestones (floor hints respected,
 * closest in time to the shoot preferred). Suggestions are shown as "auto-linked" for the team to confirm.
 */
function fallbackLinks(ep: RegisterActivity, register: RegisterActivity[]): string[] {
  const text = (ep.scopeOfWork || '').trim();
  if (!text || /before the schedule/i.test(text)) return [];
  const pool = register.filter((r) => r.kind === 'scope' || r.kind === 'pour' || r.kind === 'milestone');
  const out: string[] = [];
  text
    .split(';')
    .map((x) => x.trim())
    .filter(Boolean)
    .forEach((seg) => {
      const st = toks(seg);
      if (!st.size) return;
      const fh = floorOf(seg);
      let best: { r: RegisterActivity; score: number }[] = [];
      pool.forEach((r) => {
        if (fh && r.floor && r.floor !== fh) return;
        const rt = toks(r.name);
        let inter = 0;
        rt.forEach((t) => st.has(t) && inter++);
        const score = inter / Math.max(1, Math.min(rt.size, st.size));
        if (inter >= 1 && score >= 0.5) best.push({ r, score });
      });
      const top = Math.max(0, ...best.map((b) => b.score));
      best = best.filter((b) => b.score === top);
      const dist = (r: RegisterActivity) => (r.start && ep.start ? Math.abs(diffDays(r.start, ep.start)) : 9999);
      best.sort((a, b) => dist(a.r) - dist(b.r));
      if (best[0] && !out.includes(best[0].r.id)) out.push(best[0].r.id);
    });
  return out;
}

function code(e: Episode): string {
  return e.episodeLabel ? e.episodeLabel : `EP ${String(e.number).padStart(2, '0')}`;
}

function fmtR(r?: Range): string | undefined {
  if (!r) return undefined;
  return r.start === r.end ? r.start : `${r.start} – ${r.end}`;
}

export function buildProduction(input: ProductionInput): PortalProduction {
  const today = input.today || todayIso();
  const asOf = input.now || new Date().toISOString();
  const recs = new Map(input.records.map((r) => [r.id, r]));
  const chars = new Map(input.characters.map((c) => [c.id, c]));
  const ms = constructionMilestones(input.register, today);
  const msById = new Map(ms.map((m) => [m.id, m]));
  const regById = new Map(input.register.map((r) => [r.id, r]));

  const episodes: PPEpisode[] = [...input.episodes]
    .sort((a, b) => a.number - b.number)
    .map((e) => {
      const rec = recs.get(e.id) || ({ id: e.id } as EpisodeProduction);
      const reg = regById.get(episodeActivityId(e.id));
      // --- construction links: explicit (activity editor / this module) or matched from the scope of work
      let linked: PPMilestone[] = [];
      let linkAuto = false;
      if (reg?.dependsOn.length) {
        linked = reg.dependsOn.map((id) => msById.get(id)).filter((m): m is PPMilestone => !!m);
      } else if (reg) {
        linked = linkedScopesForEpisode(reg, input.register)
          .map((l) => msById.get(l.scope.id))
          .filter((m): m is PPMilestone => !!m);
        if (!linked.length) linked = fallbackLinks(reg, input.register).map((id) => msById.get(id)).filter((m): m is PPMilestone => !!m);
        linkAuto = linked.length > 0;
      }
      const classAuto = !rec.classification;
      const classification: ProdClass = rec.classification || (linked.length ? 'time' : 'flexible');
      const timeSensitive = classification === 'time';
      const completed = e.status === 'Completed' || !!rec.actualStart;

      // --- dates (projected never becomes confirmed)
      const target = range(e.shootStart, e.shootEnd);
      const plannedFrom = reg?.plannedStart && reg.plannedStart !== target?.start ? range(reg.plannedStart, reg.plannedFinish) : undefined;
      const original = plannedFrom;
      let projected: PPEpisode['projected'];
      if (timeSensitive && linked.length) {
        const open = linked.filter((m) => m.status !== 'Completed');
        const basis = (open.length ? open : linked).slice().sort((a, b) => (a.actualStart || a.start || '').localeCompare(b.actualStart || b.start || ''))[0];
        const s = basis.actualStart || basis.start;
        const f = basis.actualFinish || basis.finish;
        const r = range(s, f);
        if (r) projected = { ...r, commitment: basis.actualStart ? 'Actual' : basis.commitment };
      }
      const confirmed = rec.approval ? range(rec.approval.start, rec.approval.end) : e.status === 'Scheduled' && target ? target : undefined;
      const actual = range(rec.actualStart || (e.status === 'Completed' ? reg?.actualStart : undefined), rec.actualEnd || reg?.actualFinish);
      const proposed = rec.proposed ? range(rec.proposed.start, rec.proposed.end) : undefined;
      const shown = actual
        ? { ...actual, kind: 'actual' as const }
        : confirmed
          ? { ...confirmed, kind: 'confirmed' as const }
          : target
            ? { ...target, kind: 'target' as const }
            : projected
              ? { start: projected.start, end: projected.end, kind: 'projected' as const }
              : undefined;

      // --- construction change detection (flag only, never move)
      const moved: PPEpisode['moved'] = [];
      if (timeSensitive && !completed) {
        linked.forEach((m) => {
          const snap = rec.alignedTo?.[m.id];
          if (snap) {
            if ((snap.start || '') !== (m.start || '') || (snap.finish || '') !== (m.finish || '')) {
              moved.push({ id: m.id, name: m.name, from: fmtR(range(snap.start, snap.finish)), to: fmtR(range(m.start, m.finish)) });
            }
          } else {
            const r = regById.get(m.id);
            if (r?.revisionCount && r.lastRevisedAt && (!rec.reviewedAt || r.lastRevisedAt > rec.reviewedAt)) {
              moved.push({ id: m.id, name: m.name, from: fmtR(range(r.plannedStart, r.plannedFinish)), to: fmtR(range(m.start, m.finish)) });
            }
          }
        });
      }
      const delayedMs = timeSensitive && !completed ? linked.filter((m) => m.delayed) : [];
      const msConfirmed = !timeSensitive || (linked.length > 0 && linked.every((m) => m.confirmed));

      // --- cast & team
      const cast = (e.characters || [])
        .map((id) => chars.get(id))
        .filter((c): c is Character => !!c)
        .map((c) => ({ id: c.id, name: c.name, role: rec.cast?.[c.id]?.role || undefined, availability: rec.cast?.[c.id]?.availability || 'Pending' }));
      const castOk = cast.length > 0 && cast.every((c) => c.availability === 'Available');
      const team = TEAM_ROLES.map((t) => ({
        role: t.id,
        label: t.label,
        name: rec.team?.[t.id]?.name?.trim() || undefined,
        confirmed: !!rec.team?.[t.id]?.confirmed,
        required: t.required,
      }));
      const director = e.director?.trim() || undefined;

      // --- checklist
      const autoVal: Partial<Record<ChecklistKey, boolean>> = {
        milestone: msConfirmed,
        cast: castOk,
        director: !!rec.approval || completed,
        shot: completed,
      };
      const checklist: PPCheck[] = CHECKLIST.map((c) => {
        const na = c.id === 'milestone' && !timeSensitive;
        const auto = c.id in autoVal;
        const done = na ? true : auto ? !!autoVal[c.id] || !!rec.checklist?.[c.id] : !!rec.checklist?.[c.id];
        return { id: c.id, label: c.label, done, auto, na, preShoot: c.preShoot };
      });
      const applicable = checklist.filter((c) => !c.na);
      const pct = Math.round((applicable.filter((c) => c.done).length / Math.max(1, applicable.length)) * 100);
      const preReady = checklist.filter((c) => c.preShoot && !c.na).every((c) => c.done);
      const awaiting: string[] = [];
      if (!completed) {
        if (!autoVal.director) awaiting.push('Director approval');
        if (!castOk) awaiting.push('Character availability');
        if (timeSensitive && !msConfirmed) awaiting.push('Construction milestone confirmation');
        if (team.some((t) => t.required && !t.name) || !director) awaiting.push('Team assignment');
      }

      // --- assignment status
      let assignment: AssignmentStatus;
      if (completed) assignment = 'Completed';
      else if (!director || team.some((t) => t.required && !t.name)) assignment = 'For Assignment';
      else if (!rec.directorConfirmed || team.some((t) => t.name && !t.confirmed) || !castOk) assignment = 'For Confirmation';
      else assignment = 'Confirmed';

      // --- status
      let status: ShootStatus;
      if (completed) status = 'Completed';
      else if (!shown || shown.kind === 'projected') status = 'Not Scheduled';
      else if (moved.length) status = 'For Review';
      else if (confirmed) status = 'Confirmed';
      else if (timeSensitive && !msConfirmed) status = 'Awaiting Construction Confirmation';
      else if (e.status === 'Rescheduled') status = 'Rescheduled';
      else status = 'Tentative';

      // --- light
      const when = confirmed || target;
      const misaligned =
        timeSensitive && when && linked.length > 0 && !linked.some((m) => m.status === 'Completed' || overlaps(when.start, when.end, m.actualStart || m.start, m.actualFinish || m.finish));
      const soonMs = linked.find((m) => m.start && m.status !== 'Completed' && diffDays(today, m.start) >= 0 && diffDays(today, m.start) <= 14);
      const soonShoot = when && diffDays(today, when.start) >= 0 && diffDays(today, when.start) <= 14;
      const lapsed = !completed && when && when.end < today;
      let light: Light;
      let lightReason: string;
      if (completed) [light, lightReason] = ['green', 'Shoot completed'];
      else if (!when) [light, lightReason] = ['gray', projected ? 'Not yet scheduled — projected from construction only' : 'Not yet scheduled'];
      else if (delayedMs.length) [light, lightReason] = ['red', `Delayed construction: ${delayedMs.map((m) => m.name).join('; ')}`];
      else if (moved.length) [light, lightReason] = ['orange', `Construction schedule changed: ${moved.map((m) => m.name).join('; ')}`];
      else if (misaligned) [light, lightReason] = ['orange', 'Shoot date does not fall within the linked construction activity'];
      else if (lapsed) [light, lightReason] = ['orange', 'Shoot date has passed without a recorded filming date'];
      else if ((soonMs || soonShoot) && !preReady) [light, lightReason] = ['yellow', soonMs ? `${soonMs.name} starts soon — preparation required` : 'Shoot within 14 days — preparation required'];
      else [light, lightReason] = ['green', 'Production aligned'];

      const revisions = (reg && input.overrides?.[reg.key]?.revisions) || [];
      const history = [
        ...(rec.history || []).map((h) => ({ at: h.at, by: h.by, action: h.action, from: h.from, to: h.to, note: h.note })),
        ...revisions.map((v) => ({
          at: v.at,
          by: v.by,
          action: 'Target shoot date revised',
          from: fmtR(range(v.fromStart, v.fromFinish)),
          to: fmtR(range(v.toStart, v.toFinish)),
        })),
      ].sort((a, b) => b.at.localeCompare(a.at));

      return {
        id: e.id,
        number: e.number,
        code: code(e),
        title: e.title || AWAITING,
        topic: e.topic || '',
        category: rec.category || (e.episodeLabel ? 'B-Roll' : 'Educational Episode'),
        classification,
        classAuto,
        objective: rec.objective?.trim() || undefined,
        description: rec.description?.trim() || undefined,
        scopeOfWork: e.scopeOfWork || undefined,
        location: e.location?.trim() || undefined,
        duration: rec.duration?.trim() || undefined,
        director,
        directorConfirmed: !!rec.directorConfirmed,
        team,
        cast,
        target,
        original,
        projected,
        proposed: proposed ? { ...proposed, note: rec.proposed?.note } : undefined,
        confirmed,
        actual,
        shown,
        status,
        light,
        lightReason,
        readiness: { pct, ready: preReady && !completed, awaiting },
        assignment,
        checklist,
        milestoneIds: linked.map((m) => m.id),
        linkAuto,
        moved,
        history,
        episodeStatus: e.status,
      };
    });

  const usedChars = new Set(episodes.flatMap((e) => e.cast.map((c) => c.id)));
  const characters = input.characters.filter((c) => usedChars.has(c.id)).map((c) => ({ id: c.id, name: c.name }));
  const prod: PortalProduction = { asOf, today, episodes, milestones: ms, characters, alerts: [] };
  prod.alerts = productionAlerts(prod);
  return prod;
}

/** Automated alerts — derived from the current records only. */
export function productionAlerts(p: PortalProduction, horizon = 14): PPAlert[] {
  const today = p.today;
  const ms = new Map(p.milestones.map((m) => [m.id, m]));
  const out: PPAlert[] = [];
  const within = (d: string | undefined, days: number) => !!d && diffDays(today, d) >= 0 && diffDays(today, d) <= days;
  p.episodes.forEach((e) => {
    const name = `${e.code} – ${e.title}`;
    if (e.status === 'Completed') {
      const pending = e.checklist.filter((c) => (c.id === 'footage' || c.id === 'docs') && !c.done);
      if (pending.length)
        out.push({
          key: `pa:docs:${e.id}:${e.actual?.start || ''}`,
          type: 'docsPending',
          severity: 'info',
          episodeId: e.id,
          episode: name,
          title: name,
          impact: `${pending.map((c) => c.label).join(' and ')} not yet marked complete.`,
          action: 'Production team to upload footage and complete the episode documentation.',
          status: 'ACTION REQUIRED',
          date: e.actual?.start,
        });
      return;
    }
    const when = e.confirmed || e.target;
    e.moved.forEach((m) =>
      out.push({
        key: `pa:moved:${e.id}:${m.id}:${m.to || ''}`,
        type: 'scheduleAffected',
        severity: 'warn',
        episodeId: e.id,
        episode: name,
        title: name,
        impact: `The associated construction milestone "${m.name}" has been moved${m.from ? ` from ${m.from}` : ''}${m.to ? ` to ${m.to}` : ''}. The educational shoot may require rescheduling.`,
        action: 'Production Director to review the revised target filming date.',
        status: 'FOR REVIEW',
        date: when?.start,
      })
    );
    if (e.classification === 'time') {
      e.milestoneIds.forEach((id) => {
        const m = ms.get(id);
        if (!m || m.status === 'Completed') return;
        if (m.delayed)
          out.push({
            key: `pa:delay:${e.id}:${id}:${m.finish || ''}`,
            type: 'milestoneDelayed',
            severity: 'critical',
            episodeId: e.id,
            episode: name,
            title: name,
            impact: `"${m.name}" is delayed${m.finish ? ` (target ${m.finish})` : ''}. Filming that depends on it cannot proceed as planned.`,
            action: 'Coordinate with the construction team and agree an alternative shoot date.',
            status: 'FOR REVIEW',
            date: m.finish,
          });
        else if (within(m.start, horizon))
          out.push({
            key: `pa:ms:${e.id}:${id}:${m.start}`,
            type: 'milestoneSoon',
            severity: 'info',
            episodeId: e.id,
            episode: name,
            title: name,
            impact: `"${m.name}" starts ${m.start}${m.confirmed ? '' : ' (projected, not yet confirmed)'}.`,
            action: 'Production team to prepare for filming and confirm site access.',
            status: 'FOR INFORMATION',
            date: m.start,
          });
      });
    }
    if (!when) return;
    if (when.end < today)
      out.push({
        key: `pa:lapsed:${e.id}:${when.end}`,
        type: 'scheduleAffected',
        severity: 'warn',
        episodeId: e.id,
        episode: name,
        title: name,
        impact: `The shoot date (${fmtR(when)}) has passed and no filming date has been recorded.`,
        action: 'Production team to record the actual filming date, or the director to set a revised shoot date.',
        status: 'ACTION REQUIRED',
        date: when.end,
      });
    const soon = within(when.start, horizon);
    const month = within(when.start, 30);
    if (soon)
      out.push({
        key: `pa:shoot:${e.id}:${when.start}`,
        type: 'shootSoon',
        severity: e.readiness.ready ? 'info' : 'warn',
        episodeId: e.id,
        episode: name,
        title: name,
        impact: `Shoot ${e.confirmed ? 'confirmed' : 'targeted'} for ${fmtR(when)}. Readiness ${e.readiness.pct}%.`,
        action: e.readiness.ready ? 'Proceed as planned.' : `Complete: ${e.readiness.awaiting.join(', ') || 'the production checklist'}.`,
        status: e.readiness.ready ? 'FOR INFORMATION' : 'ACTION REQUIRED',
        date: when.start,
      });
    if (month) {
      const pendingCast = e.cast.filter((c) => c.availability !== 'Available');
      if (pendingCast.length)
        out.push({
          key: `pa:cast:${e.id}:${when.start}:${pendingCast.length}`,
          type: 'castPending',
          severity: pendingCast.some((c) => c.availability === 'Unavailable') ? 'critical' : 'warn',
          episodeId: e.id,
          episode: name,
          title: name,
          impact: `${pendingCast.length} character${pendingCast.length === 1 ? '' : 's'} not yet confirmed: ${pendingCast.map((c) => `${c.name} (${c.availability})`).join(', ')}.`,
          action: 'Production coordinator to confirm character availability.',
          status: 'ACTION REQUIRED',
          date: when.start,
        });
      if (!e.confirmed)
        out.push({
          key: `pa:appr:${e.id}:${when.start}`,
          type: 'approvalPending',
          severity: 'warn',
          episodeId: e.id,
          episode: name,
          title: name,
          impact: `Shoot date ${fmtR(when)} is not yet approved by the director.`,
          action: 'Production Director to approve or revise the shoot date.',
          status: 'FOR REVIEW',
          date: when.start,
        });
      if (e.assignment === 'For Assignment')
        out.push({
          key: `pa:team:${e.id}:${when.start}`,
          type: 'teamIncomplete',
          severity: 'warn',
          episodeId: e.id,
          episode: name,
          title: name,
          impact: `Missing: ${[!e.director ? 'Director' : '', ...e.team.filter((t) => t.required && !t.name).map((t) => t.label)].filter(Boolean).join(', ')}.`,
          action: 'Assign the production team for this shoot.',
          status: 'ACTION REQUIRED',
          date: when.start,
        });
    }
  });
  const rank = { critical: 0, warn: 1, info: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity] || (a.date || '9999').localeCompare(b.date || '9999'));
}

// ---------------------------------------------------------------------------
// Summaries used by the dashboard (pure; tested)
// ---------------------------------------------------------------------------

export function kpis(p: PortalProduction) {
  const eps = p.episodes;
  const today = p.today;
  const { start: ms, end: me } = monthRange(today);
  const inMonth = (e: PPEpisode) => !!e.shown && e.status !== 'Completed' && overlaps(e.shown.start, e.shown.end, ms, me);
  const month = eps.filter(inMonth);
  const open = eps.filter((e) => e.status !== 'Completed');
  return {
    total: eps.length,
    completed: eps.filter((e) => e.status === 'Completed').length,
    upcoming: open.length,
    monthConfirmed: month.filter((e) => !!e.confirmed).length,
    monthTentative: month.filter((e) => !e.confirmed).length,
    timeSensitive: eps.filter((e) => e.classification === 'time').length,
    timeOpen: open.filter((e) => e.classification === 'time').length,
    timeCoordination: open.filter((e) => e.classification === 'time' && (e.light === 'orange' || e.light === 'red' || e.status === 'Awaiting Construction Confirmation')).length,
    flexible: eps.filter((e) => e.classification === 'flexible').length,
    flexibleOpen: open.filter((e) => e.classification === 'flexible').length,
    ready: open.filter((e) => e.readiness.ready).length,
    awaitingDirector: open.filter((e) => e.readiness.awaiting.includes('Director approval')).length,
    awaitingCast: open.filter((e) => e.readiness.awaiting.includes('Character availability')).length,
    awaitingMilestone: open.filter((e) => e.readiness.awaiting.includes('Construction milestone confirmation')).length,
    avgReadiness: open.length ? Math.round(open.reduce((s, e) => s + e.readiness.pct, 0) / open.length) : 0,
  };
}

/** Months spanned by episodes and linked milestones, from the first to the projected completion. */
export function seriesMonths(p: PortalProduction): string[] {
  const dates: string[] = [];
  p.episodes.forEach((e) => {
    if (e.shown) dates.push(e.shown.start, e.shown.end);
    if (e.projected) dates.push(e.projected.start, e.projected.end);
  });
  const linked = new Set(p.episodes.flatMap((e) => e.milestoneIds));
  p.milestones.forEach((m) => {
    if (linked.has(m.id) || m.isMilestone) {
      if (m.start) dates.push(m.start);
      if (m.finish) dates.push(m.finish);
    }
  });
  if (!dates.length) return [p.today.slice(0, 7)];
  dates.sort();
  const out: string[] = [];
  let cur = dates[0].slice(0, 7);
  const last = dates[dates.length - 1].slice(0, 7);
  while (cur <= last && out.length < 60) {
    out.push(cur);
    const [y, m] = cur.split('-').map(Number);
    cur = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  }
  return out;
}

export function episodesOn(p: PortalProduction, day: string): PPEpisode[] {
  return p.episodes.filter((e) => e.shown && e.shown.start <= day && e.shown.end >= day);
}

export function episodesInRange(p: PortalProduction, start: string, end: string): PPEpisode[] {
  return p.episodes.filter((e) => e.shown && overlaps(e.shown.start, e.shown.end, start, end));
}

export function milestonesInRange(p: PortalProduction, start: string, end: string, onlyLinked = false): PPMilestone[] {
  const linked = new Set(p.episodes.flatMap((e) => e.milestoneIds));
  return p.milestones.filter(
    (m) => (!onlyLinked || linked.has(m.id) || m.isMilestone) && overlaps(m.actualStart || m.start, m.actualFinish || m.finish, start, end)
  );
}

function daysIn(r: Range, s: string, e: string): number {
  const a = r.start > s ? r.start : s;
  const b = r.end < e ? r.end : e;
  return a > b ? 0 : diffDays(a, b) + 1;
}

/** Character availability matrix (one row per character × episode). */
export function castMatrix(p: PortalProduction, upcomingOnly = true) {
  const rows: { charId: string; character: string; role?: string; episodeId: string; episode: string; when?: Range; whenKind?: string; availability: string; status: string }[] = [];
  p.episodes.forEach((e) => {
    if (upcomingOnly && e.status === 'Completed') return;
    e.cast.forEach((c) =>
      rows.push({
        charId: c.id,
        character: c.name,
        role: c.role,
        episodeId: e.id,
        episode: `${e.code} – ${e.title}`,
        when: e.shown,
        whenKind: e.shown?.kind,
        availability: c.availability,
        status: e.status === 'Completed' ? 'Completed' : c.availability === 'Available' && e.confirmed ? 'Confirmed' : c.availability === 'Available' ? 'Tentative' : 'For Confirmation',
      })
    );
  });
  return rows.sort((a, b) => (a.when?.start || '9999').localeCompare(b.when?.start || '9999') || a.character.localeCompare(b.character));
}

export function characterProfiles(p: PortalProduction) {
  return p.characters
    .map((c) => {
      const eps = p.episodes.filter((e) => e.cast.some((x) => x.id === c.id));
      const upcoming = eps.filter((e) => e.status !== 'Completed' && e.shown && e.shown.end >= p.today);
      const roles = [...new Set(eps.map((e) => e.cast.find((x) => x.id === c.id)?.role).filter(Boolean) as string[])];
      const pending = upcoming.filter((e) => e.cast.find((x) => x.id === c.id)?.availability !== 'Available').length;
      const unavailable = upcoming.filter((e) => e.cast.find((x) => x.id === c.id)?.availability === 'Unavailable').length;
      return {
        id: c.id,
        name: c.name,
        roles,
        episodes: eps.map((e) => ({ id: e.id, code: e.code, title: e.title, when: e.shown, status: e.status })),
        upcoming: upcoming.map((e) => ({ id: e.id, code: e.code, when: e.shown! })).sort((a, b) => a.when.start.localeCompare(b.when.start)),
        availability: unavailable ? 'Unavailable' : pending ? 'Pending' : upcoming.length ? 'Available' : 'No upcoming shoots',
        pending,
      };
    })
    .sort((a, b) => b.episodes.length - a.episodes.length || a.name.localeCompare(b.name));
}

/** Characters booked on two shoots that overlap on the same days. */
const PLACE_STOP = new Set(['and', 'city', 'site', 'the', 'set', 'location', 'studio', 'house', 'shoot']);
const placeWords = (loc?: string) => new Set((loc || '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !PLACE_STOP.has(w)));
/** Two locations are treated as the same place when either is missing or they share a place name (e.g. "Tagaytay"). */
function samePlace(a?: string, b?: string): boolean {
  const x = placeWords(a);
  const y = placeWords(b);
  if (!x.size || !y.size) return true;
  for (const w of x) if (y.has(w)) return true;
  return false;
}

/** Characters booked on two shoots on overlapping dates at different places (one row per episode pair). */
export function castConflicts(p: PortalProduction, start?: string, end?: string) {
  const open = p.episodes.filter((e) => e.status !== 'Completed' && e.shown && (!start || overlaps(e.shown.start, e.shown.end, start, end)));
  const out: { characters: string[]; a: PPEpisode; b: PPEpisode }[] = [];
  for (let i = 0; i < open.length; i++)
    for (let j = i + 1; j < open.length; j++) {
      const a = open[i];
      const b = open[j];
      if (!overlaps(a.shown!.start, a.shown!.end, b.shown!.start, b.shown!.end)) continue;
      if (samePlace(a.location, b.location)) continue; // same place — can be filmed together
      const shared = a.cast.filter((c) => b.cast.some((x) => x.id === c.id)).map((c) => c.name);
      if (shared.length) out.push({ characters: shared, a, b });
    }
  return out;
}

export interface TeamOverview {
  upcoming: { episode: PPEpisode; people: { name: string; role: string; confirmed: boolean }[] }[];
  toConfirm: { name: string; role: string; episode: PPEpisode }[];
  awaitingDirector: PPEpisode[];
  constructionCoordination: PPEpisode[];
  ready: PPEpisode[];
}

export function teamOverview(p: PortalProduction, days = 30): TeamOverview {
  const horizon = addDays(p.today, days);
  const open = p.episodes.filter((e) => e.status !== 'Completed');
  const soon = open.filter((e) => e.shown && e.shown.end >= p.today && e.shown.start <= horizon).sort((a, b) => a.shown!.start.localeCompare(b.shown!.start));
  const people = (e: PPEpisode) => [
    ...(e.director ? [{ name: e.director, role: 'Director', confirmed: e.directorConfirmed }] : []),
    ...e.team.filter((t) => t.name).map((t) => ({ name: t.name!, role: t.label, confirmed: t.confirmed })),
    ...e.cast.map((c) => ({ name: c.name, role: c.role ? `Character · ${c.role}` : 'Character', confirmed: c.availability === 'Available' })),
  ];
  return {
    upcoming: soon.map((e) => ({ episode: e, people: people(e) })),
    toConfirm: soon.flatMap((e) => people(e).filter((x) => !x.confirmed).map((x) => ({ ...x, episode: e }))),
    awaitingDirector: open.filter((e) => !e.confirmed && e.shown).sort((a, b) => a.shown!.start.localeCompare(b.shown!.start)),
    constructionCoordination: open.filter((e) => e.classification === 'time' && e.shown && e.shown.end >= p.today).sort((a, b) => a.shown!.start.localeCompare(b.shown!.start)),
    ready: open.filter((e) => e.readiness.ready),
  };
}

/** Days with no construction-dependent filming — for batching flexible episodes. */
export function productionWindows(p: PortalProduction, days = 60, minLen = 2): { start: string; end: string; days: number; note?: string }[] {
  const busy = p.episodes.filter((e) => e.classification === 'time' && e.status !== 'Completed' && e.shown && e.shown.kind !== 'projected');
  const out: { start: string; end: string; days: number; note?: string }[] = [];
  let run: string | undefined;
  let prev: string | undefined;
  for (let i = 0; i <= days; i++) {
    const d = addDays(p.today, i);
    const free = !busy.some((e) => e.shown!.start <= d && e.shown!.end >= d);
    if (free && !run) run = d;
    if ((!free || i === days) && run) {
      const end = free ? d : prev!;
      const n = diffDays(run, end) + 1;
      if (n >= minLen) out.push({ start: run, end, days: n, note: overlaps(run, end, STOP_START, STOP_END) ? 'Includes the holiday work stoppage — studio / indoor filming only' : undefined });
      run = undefined;
    }
    prev = d;
  }
  return out;
}

export interface MonthPlan {
  key: string;
  start: string;
  end: string;
  construction: PPMilestone[];
  shoots: PPEpisode[];
  confirmed: PPEpisode[];
  pending: PPEpisode[];
  time: PPEpisode[];
  flexible: PPEpisode[];
  ready: PPEpisode[];
  reschedule: PPEpisode[];
  characters: { name: string; days: number; pending: number }[];
  pendingAvailability: number;
  priorities: PPEpisode[];
  deadlines: { episode: PPEpisode; date: string }[];
  creative: PPEpisode[];
  conflicts: string[];
  completed: PPEpisode[];
}

export function monthPlan(p: PortalProduction, key: string): MonthPlan {
  const { start, end } = monthRange(`${key}-01`);
  const shoots = episodesInRange(p, start, end).sort((a, b) => a.shown!.start.localeCompare(b.shown!.start));
  const open = shoots.filter((e) => e.status !== 'Completed');
  const charMap = new Map<string, { name: string; days: number; pending: number }>();
  open.forEach((e) =>
    e.cast.forEach((c) => {
      const cur = charMap.get(c.id) || { name: c.name, days: 0, pending: 0 };
      cur.days += daysIn(e.shown!, start, end);
      if (c.availability !== 'Available') cur.pending++;
      charMap.set(c.id, cur);
    })
  );
  const conflicts = [
    ...castConflicts(p, start, end).map(
      (c) => `${c.a.code} (${c.a.location}) and ${c.b.code} (${c.b.location}) overlap at different locations — ${c.characters.length > 3 ? `${c.characters.slice(0, 3).join(', ')} +${c.characters.length - 3}` : c.characters.join(', ')} booked on both.`
    ),
    ...open.filter((e) => e.light === 'red').map((e) => `${e.code}: ${e.lightReason}.`),
    ...open.filter((e) => e.light === 'orange').map((e) => `${e.code}: ${e.lightReason}.`),
  ];
  const rank: Record<Light, number> = { red: 0, orange: 1, yellow: 2, gray: 3, green: 4 };
  return {
    key,
    start,
    end,
    construction: milestonesInRange(p, start, end, true),
    shoots,
    confirmed: open.filter((e) => !!e.confirmed),
    pending: open.filter((e) => !e.confirmed),
    time: open.filter((e) => e.classification === 'time'),
    flexible: open.filter((e) => e.classification === 'flexible'),
    ready: open.filter((e) => e.readiness.ready),
    reschedule: open.filter((e) => e.light === 'orange' || e.light === 'red'),
    characters: [...charMap.values()].sort((a, b) => b.days - a.days || a.name.localeCompare(b.name)),
    pendingAvailability: [...charMap.values()].reduce((s, c) => s + c.pending, 0),
    priorities: open.filter((e) => e.light !== 'green').sort((a, b) => rank[a.light] - rank[b.light]),
    deadlines: open.map((e) => ({ episode: e, date: e.shown!.start })).filter((d) => d.date >= start),
    creative: open.filter((e) => e.checklist.some((c) => (c.id === 'script' || c.id === 'talkingPoints') && !c.done)),
    conflicts,
    completed: shoots.filter((e) => e.status === 'Completed'),
  };
}

/** "Are we on track?" — share of episodes due by today that were filmed, plus open risks. */
export function onTrack(p: PortalProduction): { label: 'On Track' | 'Needs Attention' | 'At Risk'; due: number; filmed: number; risks: number } {
  const due = p.episodes.filter((e) => (e.confirmed || e.target) && (e.confirmed || e.target)!.end < p.today);
  const filmed = due.filter((e) => e.status === 'Completed').length;
  const risks = p.episodes.filter((e) => e.light === 'red' || e.light === 'orange').length;
  const missed = due.length - filmed;
  const label = missed === 0 && risks === 0 ? 'On Track' : missed > 2 || p.episodes.some((e) => e.light === 'red') ? 'At Risk' : 'Needs Attention';
  return { label, due: due.length, filmed, risks };
}

// ---------------------------------------------------------------------------
// Writes helpers (pure) — used by the management module
// ---------------------------------------------------------------------------

/** Snapshot of the linked construction dates the episode is now aligned to. */
export function alignmentSnapshot(p: PortalProduction, episodeId: string): Record<string, { start?: string; finish?: string }> {
  const e = p.episodes.find((x) => x.id === episodeId);
  const out: Record<string, { start?: string; finish?: string }> = {};
  e?.milestoneIds.forEach((id) => {
    const m = p.milestones.find((x) => x.id === id);
    if (m) out[id] = { ...(m.start ? { start: m.start } : {}), ...(m.finish ? { finish: m.finish } : {}) };
  });
  return out;
}

export const rangeText = fmtR;
