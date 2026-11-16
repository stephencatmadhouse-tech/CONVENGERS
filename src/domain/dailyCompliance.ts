/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Daily Construction Report coverage for a period — the link between the
 * daily reports and the weekly / monthly reports.
 *
 * A working day (Monday–Saturday, excluding Philippine holidays and the
 * project work stoppage — the same rule as the schedule) is "reported" when a
 * verified report (Submitted, Under Review or Approved) exists for it from the
 * required reporter (or from anyone, when no reporter is set). Days after
 * `asOf` are not counted. Nothing is estimated: missing days are listed as missing.
 */

import type { DailyReport } from '../types/index.ts';
import { addDays, workingDaysBetween } from './dates.ts';

export interface DailyReporter {
  uid: string;
  name: string;
}

export const VERIFIED_DR: DailyReport['status'][] = ['submitted', 'under_review', 'approved'];

export interface DailySummaryRow {
  id: string;
  reference: string;
  date: string;
  status: DailyReport['status'];
  preparedBy: string;
  preparedById: string;
  activities: number;
  /** Total headcount; null when the report recorded no manpower. */
  manpower: number | null;
  photos: number;
  concerns: string;
}

export interface DailySummary {
  start: string;
  end: string;
  asOf: string;
  reporter: DailyReporter | null;
  /** Verified reports in the period (all preparers), by date. */
  reports: DailySummaryRow[];
  /** Reports not yet verified (draft, uploading, pending, returned) — listed, never used as facts. */
  unverified: { id: string; reference: string; date: string; status: DailyReport['status']; preparedBy: string }[];
  /** Working days in the period up to asOf. */
  workDays: string[];
  /** Working days with a verified report from the required reporter (or anyone). */
  reportedDays: string[];
  /** Working days without one. */
  missingDays: string[];
  /** Sum of recorded headcounts (reports with no manpower are excluded); null when none recorded. */
  workerDays: number | null;
  photos: number;
}

export const isWorkingDay = (iso: string) => workingDaysBetween(iso, iso) === 1;

export function workingDays(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) if (isWorkingDay(d)) out.push(d);
  return out;
}

const total = (d: DailyReport) => d.manpower.skilled + d.manpower.general + d.manpower.subcontractor + d.manpower.other;

export function summarizeDailyReports(all: DailyReport[], start: string, end: string, today: string, reporter?: DailyReporter | null): DailySummary {
  const asOf = end < today ? end : today;
  const inP = all.filter((d) => d.date >= start && d.date <= end);
  const verified = inP.filter((d) => VERIFIED_DR.includes(d.status)).sort((a, b) => a.date.localeCompare(b.date) || a.reference.localeCompare(b.reference));
  const workDays = asOf >= start ? workingDays(start, asOf) : [];
  const fromReporter = verified.filter((d) => !reporter || d.preparedById === reporter.uid);
  const covered = new Set(fromReporter.map((d) => d.date));
  const recorded = verified.filter((d) => total(d) > 0);
  return {
    start,
    end,
    asOf,
    reporter: reporter || null,
    reports: verified.map((d) => ({
      id: d.id,
      reference: d.reference,
      date: d.date,
      status: d.status,
      preparedBy: d.preparedBy,
      preparedById: d.preparedById,
      activities: d.activities.filter((a) => a.name || a.workDescription).length,
      manpower: total(d) > 0 ? total(d) : null,
      photos: d.photos.filter((p) => p.uploadStatus === 'uploaded').length,
      concerns: [d.site.issues, d.site.delays, d.site.safety].map((x) => x.trim()).filter(Boolean).join(' · '),
    })),
    unverified: inP
      .filter((d) => !VERIFIED_DR.includes(d.status))
      .map((d) => ({ id: d.id, reference: d.reference, date: d.date, status: d.status, preparedBy: d.preparedBy }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    workDays,
    reportedDays: workDays.filter((d) => covered.has(d)),
    missingDays: workDays.filter((d) => !covered.has(d)),
    workerDays: recorded.length ? recorded.reduce((s, d) => s + total(d), 0) : null,
    photos: verified.reduce((s, d) => s + d.photos.filter((p) => p.uploadStatus === 'uploaded').length, 0),
  };
}

/** Change marker for a set of source records (id, last update, status). */
export function recordStamp(items: { id: string; updatedAt?: string; status?: string }[]): string {
  const s = items
    .map((i) => `${i.id}:${i.updatedAt || ''}:${i.status || ''}`)
    .sort()
    .join('|');
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${items.length}-${h.toString(36)}`;
}
