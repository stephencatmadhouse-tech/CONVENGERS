/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Important project announcements.
 *
 * The holiday work stoppage is a project-calendar notice, not a milestone:
 * it has no completion status and no responsible person. It is derived from
 * the same stoppage dates the schedule uses (WORK_STOPPAGE_START / END), so
 * the announcement, the calendar shading and the working-day calculations
 * always agree.
 *
 * Milestone records that describe the stoppage or the resumption of work are
 * kept in the database (and in backups) but are no longer treated as
 * milestones anywhere in the application.
 */

import { WORK_STOPPAGE_END, WORK_STOPPAGE_START, toIsoDate } from '../utils/calculations.ts';
import { addDays, workingDaysBetween } from './dates.ts';

/** Milestone records that are really calendar notices (work stoppage / work resumes). */
export function isNoticeMilestone(m: { label?: string }): boolean {
  return /work\s*stoppage|work\s*stops|work\s*resumes|resumption of work/i.test(m.label || '');
}

export interface ProjectNotice {
  id: string;
  category: 'Important announcement';
  title: string;
  message: string;
  /** First day of the stoppage. */
  start: string;
  /** Last day of the stoppage. */
  end: string;
  /** First working day after the stoppage. */
  resume: string;
}

const weekday = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long' });
const long = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
export const noticeDate = (iso: string) => `${weekday(iso)}, ${long(iso)}`;

/** First working day after a date (Monday–Saturday, excluding holidays and the stoppage). */
function nextWorkingDay(iso: string): string {
  let d = addDays(iso, 1);
  for (let i = 0; i < 40 && workingDaysBetween(d, d) !== 1; i++) d = addDays(d, 1);
  return d;
}

export function workStoppageNotice(): ProjectNotice {
  const start = toIsoDate(WORK_STOPPAGE_START);
  const end = toIsoDate(WORK_STOPPAGE_END);
  const resume = nextWorkingDay(end);
  return {
    id: `work-stoppage-${start.slice(0, 4)}`,
    category: 'Important announcement',
    title: 'Holiday work stoppage',
    message: `Site work stops for the holidays from ${noticeDate(start)} to ${noticeDate(end)}. Work resumes on ${noticeDate(resume)}.`,
    start,
    end,
    resume,
  };
}

/** Announcements to show today: from now until work resumes. */
export function activeNotices(today: string): ProjectNotice[] {
  return [workStoppageNotice()].filter((n) => today <= n.resume);
}

/** Client-portal draft content for a notice (it still goes through review and publishing). */
export function noticePublicationId(n: ProjectNotice): string {
  return `PUB-NOTICE-${n.id}`;
}
