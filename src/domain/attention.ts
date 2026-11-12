/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Management attention list, accountability and forward outlook.
 * All items are derived from the register and the issue log.
 */

import { ProjectIssue, Commitment } from '../types/index.ts';
import { RegisterActivity } from './register.ts';
import { AlignmentRow } from './alignment.ts';
import { addDays, diffDays, fmtDate, todayIso } from './dates.ts';
import { dependencyConflicts } from './metrics.ts';

export type AttentionCategory =
  | 'Critical delay'
  | 'Overdue'
  | 'Unassigned'
  | 'Delayed milestone'
  | 'Repeatedly postponed'
  | 'Critical issue'
  | 'Decision required'
  | 'Upcoming deadline'
  | 'Schedule conflict'
  | 'Dependency risk';

export interface AttentionItem {
  id: string;
  category: AttentionCategory;
  severity: 'critical' | 'warn' | 'info';
  title: string;
  detail: string;
  owner: string;
  due?: string;
  activityId?: string;
  issueId?: string;
}

const SEV_ORDER = { critical: 0, warn: 1, info: 2 } as const;

export function buildAttention(
  register: RegisterActivity[],
  issues: ProjectIssue[],
  alignment: AlignmentRow[],
  today: string = todayIso()
): AttentionItem[] {
  const out: AttentionItem[] = [];
  const horizon = addDays(today, 7);

  register.forEach((r) => {
    if (r.status === 'Completed') return;
    if (r.status === 'Delayed') {
      const late = r.finish ? diffDays(r.finish, today) : 0;
      const critical = r.priority === 'Critical' || (r.isMilestone && r.kind === 'milestone');
      if (r.kind === 'milestone') {
        out.push({
          id: `att-ms-${r.id}`,
          category: 'Delayed milestone',
          severity: 'critical',
          title: r.name,
          detail: `Milestone date ${fmtDate(r.finish)} passed ${late} day(s) ago without completion.`,
          owner: r.owner,
          due: r.finish,
          activityId: r.id,
        });
      } else {
        out.push({
          id: `att-od-${r.id}`,
          category: critical ? 'Critical delay' : 'Overdue',
          severity: critical || late > 7 ? 'critical' : 'warn',
          title: r.name,
          detail: `${r.workstream} · due ${fmtDate(r.finish)} · ${late} day(s) overdue · ${r.progress}% ${r.progressBasis === 'physical' ? 'complete' : 'stage'}`,
          owner: r.owner,
          due: r.finish,
          activityId: r.id,
        });
      }
    }
    const activeOrSoon = r.status === 'Ongoing' || r.status === 'Delayed' || (r.start && r.start <= addDays(today, 30));
    if (!r.owner.trim() && activeOrSoon && r.kind !== 'episode') {
      out.push({
        id: `att-un-${r.id}`,
        category: 'Unassigned',
        severity: r.status === 'Delayed' || r.status === 'Ongoing' ? 'warn' : 'info',
        title: r.name,
        detail: `${r.workstream} · ${r.status} · starts ${fmtDate(r.start)} — no responsible person assigned.`,
        owner: '',
        due: r.start,
        activityId: r.id,
      });
    }
    if (r.revisionCount >= 2) {
      out.push({
        id: `att-rp-${r.id}`,
        category: 'Repeatedly postponed',
        severity: 'warn',
        title: r.name,
        detail: `Re-scheduled ${r.revisionCount} times · baseline finish ${fmtDate(r.plannedFinish)} → now ${fmtDate(r.finish)} (${r.slipDays >= 0 ? '+' : ''}${r.slipDays} days).`,
        owner: r.owner,
        due: r.finish,
        activityId: r.id,
      });
    }
    if (r.status !== 'Delayed' && r.finish && r.finish >= today && r.finish <= horizon && (r.isMilestone || r.priority === 'Critical' || r.priority === 'High')) {
      out.push({
        id: `att-up-${r.id}`,
        category: 'Upcoming deadline',
        severity: 'info',
        title: r.name,
        detail: `${r.workstream} · due ${fmtDate(r.finish)} (${diffDays(today, r.finish)} day(s)) · ${r.progress}%`,
        owner: r.owner,
        due: r.finish,
        activityId: r.id,
      });
    }
  });

  issues.forEach((i) => {
    if (i.status === 'Resolved' || i.status === 'Closed') return;
    if (i.severity === 'Critical' || i.severity === 'High') {
      const overdue = i.dueDate && i.dueDate < today;
      out.push({
        id: `att-is-${i.id}`,
        category: 'Critical issue',
        severity: i.severity === 'Critical' || overdue ? 'critical' : 'warn',
        title: i.title,
        detail: `${i.type} · ${i.severity} · ${i.status}${i.dueDate ? ` · resolve by ${fmtDate(i.dueDate)}${overdue ? ' (OVERDUE)' : ''}` : ''}`,
        owner: i.owner,
        due: i.dueDate,
        issueId: i.id,
        activityId: i.linkedActivityId,
      });
    }
    if (i.decisionRequired || i.type === 'Decision') {
      out.push({
        id: `att-dc-${i.id}`,
        category: 'Decision required',
        severity: 'warn',
        title: i.title,
        detail: `Management decision needed${i.dueDate ? ` by ${fmtDate(i.dueDate)}` : ''}. ${i.description || ''}`.trim(),
        owner: i.owner,
        due: i.dueDate,
        issueId: i.id,
        activityId: i.linkedActivityId,
      });
    }
  });

  alignment
    .filter((a) => a.classification === 'Conflict')
    .forEach((a) =>
      out.push({
        id: `att-cf-${a.episode.id}`,
        category: 'Schedule conflict',
        severity: 'critical',
        title: `${a.episode.name}`,
        detail: a.alerts.find((x) => x.severity === 'critical')?.message || 'Production / construction conflict',
        owner: a.episode.owner,
        due: a.episode.start,
        activityId: a.episode.id,
      })
    );

  dependencyConflicts(register, today).forEach((d, idx) =>
    out.push({
      id: `att-dp-${d.activity.id}-${idx}`,
      category: 'Dependency risk',
      severity: 'warn',
      title: d.activity.name,
      detail: d.reason,
      owner: d.activity.owner,
      due: d.activity.start,
      activityId: d.activity.id,
    })
  );

  // De-duplicate: an activity that is a critical delay should not also appear as overdue
  const seen = new Set<string>();
  const deduped = out.filter((o) => {
    const k = `${o.category}|${o.activityId || o.issueId || o.id}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return deduped.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity] || (a.due || '9999').localeCompare(b.due || '9999'));
}

// ---------- Accountability ----------
export interface OwnerLoad {
  owner: string;
  total: number;
  ongoing: number;
  delayed: number;
  upcoming: number;
  completed: number;
  openIssues: number;
}

export function ownerAccountability(register: RegisterActivity[], issues: ProjectIssue[]): OwnerLoad[] {
  const map = new Map<string, OwnerLoad>();
  const get = (o: string) => {
    const k = o.trim() || 'Unassigned';
    if (!map.has(k)) map.set(k, { owner: k, total: 0, ongoing: 0, delayed: 0, upcoming: 0, completed: 0, openIssues: 0 });
    return map.get(k)!;
  };
  register.forEach((r) => {
    const l = get(r.owner);
    l.total++;
    if (r.status === 'Ongoing') l.ongoing++;
    else if (r.status === 'Delayed') l.delayed++;
    else if (r.status === 'Completed') l.completed++;
    else l.upcoming++;
  });
  issues.forEach((i) => {
    if (i.status === 'Resolved' || i.status === 'Closed') return;
    get(i.owner).openIssues++;
  });
  return Array.from(map.values()).sort((a, b) => b.delayed - a.delayed || b.ongoing - a.ongoing || a.owner.localeCompare(b.owner));
}

// ---------- Forecast / outlook ----------
export type OutlookClass = 'Confirmed' | 'Tentative' | 'Management target' | 'At risk';

export interface OutlookItem {
  activity: RegisterActivity;
  outlook: OutlookClass;
  reasons: string[];
}

export function outlookClass(r: RegisterActivity, risks: string[]): OutlookClass {
  if (risks.length) return 'At risk';
  const c: Commitment = r.commitment;
  if (c === 'Confirmed') return 'Confirmed';
  if (c === 'Tentative') return 'Tentative';
  return 'Management target';
}

export function buildOutlook(
  register: RegisterActivity[],
  alignment: AlignmentRow[],
  fromIso: string,
  toIso: string,
  today: string = todayIso()
): OutlookItem[] {
  const byId = new Map(register.map((r) => [r.id, r]));
  const conflictIds = new Set(alignment.filter((a) => a.classification === 'Conflict').map((a) => a.episode.id));
  return register
    .filter((r) => r.status !== 'Completed' && r.start && r.start <= toIso && (r.finish || r.start) >= fromIso)
    .map((r) => {
      const reasons: string[] = [];
      r.dependsOn.forEach((pid) => {
        const p = byId.get(pid);
        if (p && p.status !== 'Completed' && (p.status === 'Delayed' || (p.finish && r.start && p.finish >= r.start))) {
          reasons.push(`Depends on unfinished "${p.name}" (${p.status})`);
        }
      });
      if (r.status === 'Delayed') reasons.push('Already overdue');
      if (r.progressBasis === 'physical' && r.status === 'Ongoing' && r.plannedProgress - r.progress >= 20) {
        reasons.push(`${r.progress}% done vs ${r.plannedProgress}% planned`);
      }
      if (r.revisionCount >= 2) reasons.push(`Re-scheduled ${r.revisionCount}×`);
      if (conflictIds.has(r.id)) reasons.push('Production/construction conflict');
      if (!r.owner.trim() && r.kind !== 'episode') reasons.push('No responsible person');
      if (r.kind === 'episode' && r.commitment === 'Tentative' && r.start && diffDays(today, r.start) <= 14) reasons.push('Shoot not yet confirmed');
      return { activity: r, outlook: outlookClass(r, reasons), reasons };
    })
    .sort((a, b) => (a.activity.start || '').localeCompare(b.activity.start || ''));
}
