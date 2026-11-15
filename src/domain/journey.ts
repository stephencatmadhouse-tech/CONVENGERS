/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * BAHAY BUILD | CONSTRUCTION JOURNEY 3D
 *
 * Stage configuration (names, order, descriptions, illustrations, links) is
 * edited by administrators. Stage PROGRESS is never entered by hand: it is
 * calculated from the linked activities in the Master Project Tracker using
 * the same working-day weights as the overall Actual Progress.
 *
 *   Master Project Tracker → activities → stage → journey → client dashboard
 *
 * Default links follow the nine-stage reference sequence by matching activity
 * names / floors / phases. Any stage can instead be linked to an explicit list
 * of activities, and activities linked explicitly are never counted twice.
 */

import type { RegisterActivity } from './register.ts';
import { groupStatus, isConstructionItem, weightedProgress } from './categories.ts';

export interface JourneyStage {
  id: string;
  order: number;
  name: string;
  description: string;
  visible: boolean;
  /** Built-in auto-link rule (default stages). Ignored when `activityIds` is set. */
  rule?: string;
  /** Explicitly linked activity IDs (register IDs such as "SC-sc_gf_s_3"). */
  activityIds?: string[];
  /** Optional illustration for this stage (replaces the sheet tile). */
  imageUrl?: string;
  /** Approved client-facing remark for this stage. */
  clientRemark?: string;
}

export interface JourneyConfig {
  id: 'journey';
  stages: JourneyStage[];
  /** One image containing all stage illustrations in a grid (e.g. the nine-stage sheet). */
  sheetUrl?: string;
  sheetCols?: number;
  sheetRows?: number;
  updatedAt?: string;
  updatedBy?: string;
  localOnly?: boolean;
}

export interface ProjectProfile {
  id: 'profile';
  clientName?: string;
  location?: string;
  /** Short welcome / project description shown to the homeowner. */
  welcome?: string;
  updatedAt?: string;
  updatedBy?: string;
  localOnly?: boolean;
}

export type ClientConfigDoc = JourneyConfig | ProjectProfile;

const RULES: Record<string, (r: RegisterActivity) => boolean> = {
  site: (r) => /mobili[sz]ation|layout|site clearing|site prep/i.test(r.name),
  foundation: (r) => /excavation|footing|foundation|pedestal|tie beam|backfill/i.test(r.name),
  ground: (r) => r.floor === 'GF' && r.phase === 'Structural',
  framing: (r) => (r.floor === '2F' || r.floor === '3F') && r.phase === 'Structural' && !/roof|truss/i.test(r.name),
  walls: (r) => /wall|masonry|\bchb\b/i.test(r.name),
  roofFraming: (r) => /roof|truss/i.test(r.name) && !/roofing|roof sheet|gutter/i.test(r.name),
  roofing: (r) => /roofing|roof sheet|gutter|waterproof/i.test(r.name),
  enclosure: (r) => /door|window|ceiling|glaz|cladding|metal|steel works/i.test(r.name),
  finishing: (r) => r.phase === 'Finishing' || /paint|til(e|ing)|finish|cabinet|carpentry|punch|rectification|testing|commissioning|turnover|move-in/i.test(r.name),
};
/** Rules are evaluated in this order (specific before general); display order is the stage order. */
const RULE_PRIORITY = ['roofing', 'roofFraming', 'site', 'foundation', 'ground', 'framing', 'walls', 'enclosure', 'finishing'];

export const DEFAULT_STAGES: JourneyStage[] = [
  { id: 'st-01', order: 1, rule: 'site', name: 'Site Preparation', description: 'Clearing, layout and mobilization of the lot before construction begins.', visible: true },
  { id: 'st-02', order: 2, rule: 'foundation', name: 'Foundation Works', description: 'Excavation, footings and tie beams that carry the weight of the house.', visible: true },
  { id: 'st-03', order: 3, rule: 'ground', name: 'Ground Floor Works', description: 'Ground floor columns, utilities embedded in the slab and the ground floor slab.', visible: true },
  { id: 'st-04', order: 4, rule: 'framing', name: 'Structural Framing', description: 'Upper-floor columns, beams, steel decks and slabs that form the frame of the house.', visible: true },
  { id: 'st-05', order: 5, rule: 'walls', name: 'Wall Construction', description: 'Walls are assembled and the rooms take shape.', visible: true },
  { id: 'st-06', order: 6, rule: 'roofFraming', name: 'Roof Framing', description: 'Roof beams and trusses that will carry the roof.', visible: true },
  { id: 'st-07', order: 7, rule: 'roofing', name: 'Roofing Works', description: 'Roof sheets, flashing and gutters that close the house from the weather.', visible: true },
  { id: 'st-08', order: 8, rule: 'enclosure', name: 'Architectural Enclosure', description: 'Doors, windows, ceilings and metal works that close and secure the house.', visible: true },
  { id: 'st-09', order: 9, rule: 'finishing', name: 'Finishing and Completion', description: 'Finishes, fixtures, testing, punch listing and turnover of your home.', visible: true },
];

export function defaultJourney(): JourneyConfig {
  return { id: 'journey', stages: DEFAULT_STAGES.map((s) => ({ ...s })), sheetCols: 3, sheetRows: 3 };
}

export function sortedStages(cfg: JourneyConfig): JourneyStage[] {
  return [...cfg.stages].sort((a, b) => a.order - b.order);
}

/** Activities linked to each stage (explicit links first, then auto rules on the remaining activities). */
export function assignStages(cfg: JourneyConfig, register: RegisterActivity[]): Map<string, RegisterActivity[]> {
  const out = new Map<string, RegisterActivity[]>();
  const stages = sortedStages(cfg);
  stages.forEach((s) => out.set(s.id, []));
  const taken = new Set<string>();
  const byId = new Map(register.map((r) => [r.id, r]));
  stages.forEach((s) => {
    if (!s.activityIds?.length) return;
    s.activityIds.forEach((id) => {
      const r = byId.get(id);
      if (r && !taken.has(id)) {
        out.get(s.id)!.push(r);
        taken.add(id);
      }
    });
  });
  const pool = register.filter((r) => isConstructionItem(r) && !taken.has(r.id));
  const autoStages = stages.filter((s) => !s.activityIds?.length && s.rule && RULES[s.rule]);
  const ordered = [...autoStages].sort((a, b) => RULE_PRIORITY.indexOf(a.rule!) - RULE_PRIORITY.indexOf(b.rule!));
  pool.forEach((r) => {
    const st = ordered.find((s) => RULES[s.rule!](r));
    if (st) out.get(st.id)!.push(r);
  });
  return out;
}

export type StageStatus = 'Completed' | 'In Progress' | 'Upcoming' | 'Delayed';

export interface StageView {
  id: string;
  order: number;
  index: number; // position among visible stages (0-based)
  name: string;
  description: string;
  visible: boolean;
  linked: boolean; // has linked activities
  progress: number | null;
  planned: number | null;
  status: StageStatus;
  start?: string;
  finish?: string;
  actualFinish?: string;
  remark?: string;
  imageUrl?: string;
  activities: { name: string; status: string; progress: number; finish?: string; category: string }[];
  activityIds: string[];
}

export function computeJourney(cfg: JourneyConfig, register: RegisterActivity[], asOf: string, includeHidden = false): StageView[] {
  const links = assignStages(cfg, register);
  return sortedStages(cfg)
    .filter((s) => includeHidden || s.visible)
    .map((s, index) => {
      const list = (links.get(s.id) || []).sort((a, b) => (a.start || '9999').localeCompare(b.start || '9999'));
      const { actual, planned } = weightedProgress(list, asOf);
      // Stages with no weighted scopes (e.g. pours only) use their stage/status progress average
      const fallback = list.length ? Math.round((list.reduce((a, r) => a + r.progress, 0) / list.length) * 10) / 10 : null;
      const starts = list.map((r) => r.start).filter(Boolean).sort() as string[];
      const finishes = list.map((r) => r.finish).filter(Boolean).sort() as string[];
      const status: StageStatus = list.length ? groupStatus(list) : 'Upcoming';
      const actualFinishes = list.map((r) => r.actualFinish || (r.status === 'Completed' ? r.finish : undefined)).filter(Boolean).sort() as string[];
      return {
        id: s.id,
        order: s.order,
        index,
        name: s.name,
        description: s.description,
        visible: s.visible,
        linked: list.length > 0,
        progress: list.length ? actual ?? fallback : null,
        planned: list.length ? planned : null,
        status,
        start: starts[0],
        finish: finishes[finishes.length - 1],
        actualFinish: status === 'Completed' ? actualFinishes[actualFinishes.length - 1] : undefined,
        remark: s.clientRemark?.trim() || undefined,
        imageUrl: s.imageUrl || undefined,
        activities: list.map((r) => ({ name: r.name, status: r.status, progress: r.progress, finish: r.finish, category: r.category })),
        activityIds: list.map((r) => r.id),
      };
    });
}

/** Current stage = first in-progress / delayed stage, else the first upcoming one, else the last. */
export function currentStageIndex(stages: { status: string }[]): number {
  const i = stages.findIndex((s) => s.status === 'In Progress' || s.status === 'Delayed' || s.status === 'Schedule Update Required');
  if (i >= 0) return i;
  const u = stages.findIndex((s) => s.status === 'Upcoming');
  return u >= 0 ? u : Math.max(0, stages.length - 1);
}

export function newStageId(): string {
  return `st-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}
