/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Cross-calendar alignment: compares the Production calendar (episode shoot
 * windows) with the Construction calendar (scopes, pours, milestones).
 * It NEVER changes either calendar. It only classifies each shoot and raises
 * coordination / conflict alerts for people to act on.
 */

import { RegisterActivity, linkedScopesForEpisode } from './register.ts';
import { diffDays, fmtDate, fmtRange, isValidIso, overlaps, todayIso } from './dates.ts';
import { WORK_STOPPAGE_START, WORK_STOPPAGE_END, toIsoDate } from '../utils/calculations.ts';

export type AlignmentClass = 'Confirmed' | 'Tentative' | 'For Coordination' | 'Conflict' | 'Rescheduled' | 'Completed';

export interface AlignmentAlert {
  type: 'overlap' | 'character' | 'location' | 'tentative' | 'change' | 'misaligned' | 'stoppage';
  severity: 'info' | 'warn' | 'critical';
  message: string;
  relatedIds: string[];
}

export interface AlignmentRow {
  episode: RegisterActivity;
  classification: AlignmentClass;
  linked: { scope: RegisterActivity; explicit: boolean; overlapping: boolean }[];
  overlappingConstruction: RegisterActivity[];
  overlappingPours: RegisterActivity[];
  alerts: AlignmentAlert[];
}

export const ALIGNMENT_COLORS: Record<AlignmentClass, string> = {
  Confirmed: '#22A05A',
  Tentative: '#FFC21A',
  'For Coordination': '#3A7BEF',
  Conflict: '#D92D3F',
  Rescheduled: '#9B7BE0',
  Completed: '#B5B5C5',
};

const STOP_START = toIsoDate(WORK_STOPPAGE_START);
const STOP_END = toIsoDate(WORK_STOPPAGE_END);
const ON_SITE_RE = /site|bahay|project|tagaytay/i;

export function buildAlignment(register: RegisterActivity[], today: string = todayIso()): AlignmentRow[] {
  const episodes = register.filter((r) => r.kind === 'episode');
  const construction = register.filter((r) => r.kind === 'scope' || r.kind === 'manual' && r.stream === 'Construction');
  const pours = register.filter((r) => r.kind === 'pour' || (r.kind === 'scope' && r.isPour));

  return episodes.map((ep) => {
    const alerts: AlignmentAlert[] = [];
    const links = linkedScopesForEpisode(ep, register).map((l) => ({
      ...l,
      overlapping: overlaps(ep.start, ep.finish, l.scope.start, l.scope.finish),
    }));
    const overlappingConstruction = construction.filter((c) => overlaps(ep.start, ep.finish, c.start, c.finish));
    const overlappingPours = pours.filter((p) => overlaps(ep.start, ep.finish, p.start, p.finish));

    if (ep.status === 'Completed') {
      return { episode: ep, classification: 'Completed' as AlignmentClass, linked: links, overlappingConstruction, overlappingPours, alerts };
    }

    // 1. Linked scope not happening during the shoot → conflict
    const misaligned = links.filter((l) => !l.overlapping && l.scope.status !== 'Completed');
    misaligned.forEach((l) => {
      const gap = l.scope.start && ep.start ? diffDays(l.scope.start, ep.start) : 0;
      // Explicit links (declared by the team) are hard conflicts; text-matched
      // links are suggestions and are raised for coordination only.
      const supporting = /\((purchas|procure|sample|touch)/i.test(ep.scopeOfWork);
      alerts.push({
        type: 'misaligned',
        severity: l.explicit && !supporting ? 'critical' : 'warn',
        message: `${l.explicit ? '' : '[auto-matched] '}Shoot ${fmtRange(ep.start, ep.finish)} documents "${l.scope.name}" (${l.scope.workstream}), which is scheduled ${fmtRange(
          l.scope.start,
          l.scope.finish
        )} — ${Math.abs(gap)} day(s) ${gap > 0 ? 'before' : 'after'} the shoot.`,
        relatedIds: [ep.id, l.scope.id],
      });
    });
    // Linked scope already completed before the shoot → cannot be filmed live
    links
      .filter((l) => !l.overlapping && l.scope.status === 'Completed' && ep.start && l.scope.finish && l.scope.finish < ep.start)
      .forEach((l) =>
        alerts.push({
          type: 'misaligned',
          severity: 'warn',
          message: `"${l.scope.name}" was completed ${fmtDate(l.scope.actualFinish || l.scope.finish)} — before this shoot. Confirm re-enactment or B-roll coverage.`,
          relatedIds: [ep.id, l.scope.id],
        })
      );

    // 2. Character availability during construction activities
    if (ep.characters.length && links.some((l) => l.overlapping)) {
      alerts.push({
        type: 'character',
        severity: 'info',
        message: `${ep.characters.length} character(s) needed on site during ${links
          .filter((l) => l.overlapping)
          .map((l) => l.scope.name)
          .join(', ')}: ${ep.characters.slice(0, 8).join(', ')}${ep.characters.length > 8 ? '…' : ''}`,
        relatedIds: [ep.id, ...links.map((l) => l.scope.id)],
      });
    }

    // 3. Activities that may affect the shooting location (pours on shoot days)
    if (overlappingPours.length && ON_SITE_RE.test(ep.location || '')) {
      alerts.push({
        type: 'location',
        severity: 'warn',
        message: `Concrete pour activity on shoot days (${overlappingPours.map((p) => `${p.name} ${fmtDate(p.start)}`).join('; ')}). Coordinate site access, safety and noise.`,
        relatedIds: [ep.id, ...overlappingPours.map((p) => p.id)],
      });
    }

    // Shoot during the holiday work stoppage while documenting construction
    if (isValidIso(ep.start) && overlaps(ep.start, ep.finish, STOP_START, STOP_END) && links.length) {
      alerts.push({
        type: 'stoppage',
        severity: 'critical',
        message: `Shoot falls inside the work stoppage (${fmtRange(STOP_START, STOP_END)}) — no construction activity will be on site.`,
        relatedIds: [ep.id],
      });
    }

    // 4. Tentative shoots needing confirmation
    const isTentative = ep.episodeStatus === 'Planned' || ep.episodeStatus === 'For Confirmation';
    if (isTentative && ep.start) {
      const daysOut = diffDays(today, ep.start);
      alerts.push({
        type: 'tentative',
        severity: daysOut <= 14 ? 'warn' : 'info',
        message:
          daysOut < 0
            ? `Shoot date ${fmtDate(ep.start)} has passed but is still "${ep.episodeStatus}". Confirm what happened.`
            : `Shoot is "${ep.episodeStatus}" — confirm ${daysOut} day(s) ahead of ${fmtDate(ep.start)}.`,
        relatedIds: [ep.id],
      });
    }

    // 5. Schedule changes requiring notification
    const linkedRevised = links.filter((l) => l.scope.revisionCount > 0);
    if (ep.revisionCount > 0 || ep.episodeStatus === 'Rescheduled') {
      alerts.push({
        type: 'change',
        severity: 'warn',
        message: `Shoot was rescheduled${ep.revisionCount ? ` ${ep.revisionCount} time(s)` : ''}${
          ep.lastRevisedAt ? ` (last ${fmtDate(ep.lastRevisedAt.slice(0, 10))})` : ''
        }. Notify construction team${links.length ? ` handling ${links.map((l) => l.scope.name).join(', ')}` : ''}.`,
        relatedIds: [ep.id],
      });
    }
    linkedRevised.forEach((l) =>
      alerts.push({
        type: 'change',
        severity: 'warn',
        message: `Linked construction activity "${l.scope.name}" was re-scheduled (${l.scope.revisionCount}×). Notify production of the new window ${fmtRange(
          l.scope.start,
          l.scope.finish
        )}.`,
        relatedIds: [ep.id, l.scope.id],
      })
    );

    let classification: AlignmentClass = 'Confirmed';
    if (alerts.some((a) => a.severity === 'critical')) classification = 'Conflict';
    else if (ep.episodeStatus === 'Rescheduled' || alerts.some((a) => a.type === 'change')) classification = 'Rescheduled';
    else if (isTentative) classification = 'Tentative';
    else if (alerts.some((a) => a.type === 'location' || a.type === 'character' || a.type === 'misaligned')) classification = 'For Coordination';

    return { episode: ep, classification, linked: links, overlappingConstruction, overlappingPours, alerts };
  });
}

export function alignmentSummary(rows: AlignmentRow[]): Record<AlignmentClass, number> {
  const out: Record<AlignmentClass, number> = {
    Confirmed: 0,
    Tentative: 0,
    'For Coordination': 0,
    Conflict: 0,
    Rescheduled: 0,
    Completed: 0,
  };
  rows.forEach((r) => out[r.classification]++);
  return out;
}
