/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Construction categories — the homeowner-friendly grouping used by the client
 * portal ("Construction Progress"). A category is derived from the activity
 * name / phase unless the team sets it explicitly in the activity editor.
 * Progress per category uses the SAME working-day weights as the overall
 * Actual Progress (computeMetrics), so the categories add up to the total.
 */

import type { RegisterActivity } from './register.ts';
import { plannedPercentAt } from './register.ts';

export const CONSTRUCTION_CATEGORIES = [
  'Pre-Construction',
  'Structural Works',
  'Architectural Works',
  'Electrical Works',
  'Plumbing and Sanitary Works',
  'Mechanical Works',
  'Finishing Works',
  'Testing and Commissioning',
  'Punch Listing',
  'Turnover',
] as const;
export type ConstructionCategory = (typeof CONSTRUCTION_CATEGORIES)[number];

const RULES: [RegExp, ConstructionCategory][] = [
  [/turnover|move-in|handover|hand-over/i, 'Turnover'],
  [/punch|rectification/i, 'Punch Listing'],
  [/testing|commissioning/i, 'Testing and Commissioning'],
  [/mobili[sz]ation|layout|site clearing|site prep/i, 'Pre-Construction'],
  [/electrical|conduit/i, 'Electrical Works'],
  [/plumbing|sanitary/i, 'Plumbing and Sanitary Works'],
  [/mechanical|final mep|fixtures|hvac/i, 'Mechanical Works'],
  [/footing|foundation|excavation|backfill|column|beam|slab|concrete|truss|steel deck|stair|structural|pedestal|rebar|formwork|curing|pour/i, 'Structural Works'],
  [/wall|door|window|ceiling|cabinet|carpentry|metal|glaz/i, 'Architectural Works'],
  [/paint|til(e|ing)|floor finish|finish|styling/i, 'Finishing Works'],
];

type Classifiable = Pick<RegisterActivity, 'name' | 'kind' | 'phase' | 'stream'>;

export function classifyCategory(r: Classifiable): string {
  if (r.stream === 'Production') return 'Production';
  for (const [re, cat] of RULES) if (re.test(r.name)) return cat;
  if (r.kind === 'pour') return 'Structural Works';
  if (r.phase === 'Finishing') return 'Finishing Works';
  if (r.phase === 'Structural') return 'Structural Works';
  return r.kind === 'milestone' ? 'Milestones' : 'Structural Works';
}

export const isConstructionItem = (r: RegisterActivity) => r.kind === 'scope' || r.kind === 'pour' || (r.kind === 'manual' && r.stream === 'Construction');

export interface CategoryProgress {
  name: string;
  actual: number | null; // weighted %, null when no weighted scopes
  planned: number | null;
  status: 'Completed' | 'In Progress' | 'Upcoming' | 'Delayed';
  count: number;
  completed: number;
  latest?: { name: string; date?: string }; // latest accomplishment
  target?: string; // latest current finish
  start?: string;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Status of a group of activities in client terms. */
export function groupStatus(items: RegisterActivity[]): CategoryProgress['status'] {
  if (items.length && items.every((r) => r.status === 'Completed')) return 'Completed';
  if (items.some((r) => r.status === 'Delayed')) return 'Delayed';
  if (items.some((r) => r.status === 'Ongoing' || (r.status !== 'Completed' && r.progress > 0)) || items.some((r) => r.status === 'Completed')) return 'In Progress';
  return 'Upcoming';
}

/** Weighted actual / planned progress of a group, using the existing scope weights. */
export function weightedProgress(items: RegisterActivity[], asOf: string): { actual: number | null; planned: number | null } {
  const weighted = items.filter((r) => r.kind === 'scope' && r.weight > 0);
  const w = weighted.reduce((s, r) => s + r.weight, 0);
  if (!w) return { actual: null, planned: null };
  return {
    actual: round1(weighted.reduce((s, r) => s + r.weight * r.progress, 0) / w),
    planned: round1(weighted.reduce((s, r) => s + r.weight * plannedPercentAt(r.plannedStart, r.plannedFinish, asOf), 0) / w),
  };
}

export function categoryProgress(register: RegisterActivity[], asOf: string): CategoryProgress[] {
  const items = register.filter(isConstructionItem);
  return CONSTRUCTION_CATEGORIES.map((name) => {
    const list = items.filter((r) => r.category === name);
    if (!list.length) return null; // categories that do not apply are not shown
    const { actual, planned } = weightedProgress(list, asOf);
    const done = list
      .filter((r) => r.status === 'Completed')
      .sort((a, b) => (b.actualFinish || b.finish || '').localeCompare(a.actualFinish || a.finish || ''))[0];
    const finishes = list.map((r) => r.finish).filter(Boolean).sort() as string[];
    const starts = list.map((r) => r.start).filter(Boolean).sort() as string[];
    return {
      name,
      actual,
      planned,
      status: groupStatus(list),
      count: list.length,
      completed: list.filter((r) => r.status === 'Completed').length,
      latest: done ? { name: done.name, date: done.actualFinish || done.finish } : undefined,
      target: finishes[finishes.length - 1],
      start: starts[0],
    } as CategoryProgress;
  }).filter((x): x is CategoryProgress => !!x);
}
