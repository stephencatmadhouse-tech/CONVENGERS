/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Executive Dashboard figures, all derived from the master register.
 *
 * Convengers Bahay Build is one project made of workstreams (GF / 2F / 3F
 * structural and finishing, concrete pours, milestones, production). The
 * dashboard's "project" cards and leaderboards are therefore per workstream.
 */

import { RegisterActivity } from './register.ts';
import { addDays, diffDays, monthRange } from './dates.ts';

export type Tier = 'Excellent' | 'Satisfactory' | 'Needs Attention' | 'Critical';
export const TIER_HEX: Record<Tier, string> = {
  Excellent: '#22A06B',
  Satisfactory: '#7026C8',
  'Needs Attention': '#F5A623',
  Critical: '#E5484D',
};

export type KpiId = 'active' | 'inprogress' | 'completedMonth' | 'overdue' | 'due7' | 'due30' | 'blocked' | 'ontime';

export interface ExecKpis {
  activeStreams: string[];
  totalStreams: number;
  lists: Record<Exclude<KpiId, 'ontime' | 'active'>, RegisterActivity[]> & { active: RegisterActivity[] };
  onTime: { pct: number | null; onTime: number; measured: number; completed: number };
}

const open = (r: RegisterActivity) => r.status !== 'Completed';

export function execKpis(register: RegisterActivity[], today: string): ExecKpis {
  const streams = [...new Set(register.map((r) => r.workstream))];
  const activeStreams = streams.filter((s) => register.some((r) => r.workstream === s && open(r)));
  const month = monthRange(today);
  const completedMonth = register.filter((r) => {
    if (r.status !== 'Completed') return false;
    const d = r.actualFinish || r.finish;
    return !!d && d >= month.start && d <= month.end;
  });
  const dueWithin = (n: number) => register.filter((r) => open(r) && !!r.finish && r.finish >= today && r.finish <= addDays(today, n));
  const completed = register.filter((r) => r.status === 'Completed');
  const measured = completed.filter((r) => (r.actualFinish || r.finish) && (r.plannedFinish || r.finish));
  const onTime = measured.filter((r) => (r.actualFinish || r.finish)! <= (r.plannedFinish || r.finish)!).length;
  return {
    activeStreams,
    totalStreams: streams.length,
    lists: {
      active: register.filter(open),
      inprogress: register.filter((r) => r.status === 'Ongoing'),
      completedMonth,
      overdue: register.filter((r) => open(r) && (r.status === 'Delayed' || (!!r.finish && r.finish < today))),
      due7: dueWithin(7),
      due30: dueWithin(30),
      blocked: register.filter((r) => open(r) && r.onHold),
    },
    onTime: { pct: measured.length ? Math.round((onTime / measured.length) * 100) : null, onTime, measured: measured.length, completed: completed.length },
  };
}

export interface StreamHealth {
  workstream: string;
  total: number;
  open: number;
  completed: number;
  overdue: number;
  onHold: number;
  ongoing: number;
  actual: number; // average progress %
  planned: number; // average planned progress %
  score: number | null;
  tier: Tier | null;
  nextTarget?: RegisterActivity;
}

export function tierOf(score: number): Tier {
  return score >= 85 ? 'Excellent' : score >= 70 ? 'Satisfactory' : score >= 50 ? 'Needs Attention' : 'Critical';
}

/**
 * Health score (0–100): starts at 100, minus overdue share (up to 50),
 * minus the gap between planned and actual progress, minus on-hold items.
 */
export function streamHealth(register: RegisterActivity[], today: string): StreamHealth[] {
  const streams = [...new Set(register.map((r) => r.workstream))];
  return streams
    .map((ws) => {
      const list = register.filter((r) => r.workstream === ws);
      const openList = list.filter(open);
      const overdue = openList.filter((r) => r.status === 'Delayed' || (!!r.finish && r.finish < today)).length;
      const onHold = openList.filter((r) => r.onHold).length;
      const actual = list.length ? list.reduce((a, r) => a + r.progress, 0) / list.length : 0;
      const planned = list.length ? list.reduce((a, r) => a + r.plannedProgress, 0) / list.length : 0;
      let score: number | null = null;
      if (list.length) {
        const s = 100 - (openList.length ? (overdue / openList.length) * 50 : 0) - Math.max(0, planned - actual) * 0.8 - Math.min(15, onHold * 5);
        score = Math.max(0, Math.min(100, Math.round(s)));
      }
      const nextTarget = openList.filter((r) => r.finish && r.finish >= today).sort((a, b) => a.finish!.localeCompare(b.finish!))[0];
      return {
        workstream: ws,
        total: list.length,
        open: openList.length,
        completed: list.length - openList.length,
        overdue,
        onHold,
        ongoing: openList.filter((r) => r.status === 'Ongoing').length,
        actual: Math.round(actual),
        planned: Math.round(planned),
        score,
        tier: score === null ? null : tierOf(score),
        nextTarget,
      };
    })
    .sort((a, b) => (a.score ?? 101) - (b.score ?? 101));
}

export interface OwnerPerf {
  owner: string;
  assigned: number;
  completed: number;
  ongoing: number;
  overdue: number;
  dueSoon: number;
  onTimePct: number | null;
  score: number | null;
  tier: Tier | null;
  streams: string[];
}

export function ownerPerformance(register: RegisterActivity[], today: string): OwnerPerf[] {
  const map = new Map<string, RegisterActivity[]>();
  register.forEach((r) => {
    const k = r.owner?.trim() || 'Unassigned';
    map.set(k, [...(map.get(k) || []), r]);
  });
  return [...map.entries()]
    .map(([owner, list]) => {
      const openList = list.filter(open);
      const completed = list.filter((r) => r.status === 'Completed');
      const overdue = openList.filter((r) => r.status === 'Delayed' || (!!r.finish && r.finish < today)).length;
      const measured = completed.filter((r) => (r.actualFinish || r.finish) && (r.plannedFinish || r.finish));
      const onTime = measured.filter((r) => (r.actualFinish || r.finish)! <= (r.plannedFinish || r.finish)!).length;
      const onTimePct = measured.length ? Math.round((onTime / measured.length) * 100) : null;
      let score: number | null = null;
      if (owner !== 'Unassigned' && list.length) {
        score = Math.round(Math.max(0, 100 - (openList.length ? (overdue / openList.length) * 60 : 0) - (onTimePct === null ? 0 : (100 - onTimePct) * 0.3)));
      }
      return {
        owner,
        assigned: list.length,
        completed: completed.length,
        ongoing: openList.filter((r) => r.status === 'Ongoing').length,
        overdue,
        dueSoon: openList.filter((r) => r.finish && r.finish >= today && r.finish <= addDays(today, 14)).length,
        onTimePct,
        score,
        tier: score === null ? null : tierOf(score),
        streams: [...new Set(list.map((r) => r.workstream))],
      };
    })
    .sort((a, b) => (a.owner === 'Unassigned' ? 1 : b.owner === 'Unassigned' ? -1 : b.assigned - a.assigned));
}

export interface MilestoneRow {
  r: RegisterActivity;
  slip: number; // current target − baseline target (days)
  daysToGo: number | null;
}

export function milestoneRows(register: RegisterActivity[], today: string): MilestoneRow[] {
  return register
    .filter((r) => r.kind === 'milestone' || r.kind === 'pour')
    .map((r) => ({
      r,
      slip: r.plannedFinish && r.finish ? diffDays(r.plannedFinish, r.finish) : 0,
      daysToGo: r.finish && r.status !== 'Completed' ? diffDays(today, r.finish) : null,
    }))
    .sort((a, b) => String(a.r.finish || '9999').localeCompare(String(b.r.finish || '9999')));
}

export function countBy<T>(list: T[], fn: (x: T) => string): [string, number][] {
  const m = new Map<string, number>();
  list.forEach((x) => m.set(fn(x) || 'Unspecified', (m.get(fn(x) || 'Unspecified') || 0) + 1));
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}
