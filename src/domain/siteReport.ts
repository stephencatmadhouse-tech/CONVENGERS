/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Daily site report rules (mobile site reporting).
 * One report per person, date and activity: the ID is deterministic, so a
 * retry or a second submission the same day updates the same record instead
 * of creating a duplicate.
 */

import type { RegisterActivity } from './register.ts';
import { isValidIso } from './dates.ts';

export function siteReportId(date: string, activityId: string, userId: string): string {
  const clean = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `SR-${clean(date)}-${clean(activityId)}-${clean(userId).slice(0, 12)}`.slice(0, 128);
}

/** Activities whose accomplishment % is entered directly (others are updated by status in the activity editor). */
export const progressEditable = (r: RegisterActivity) => r.kind === 'scope' || r.kind === 'manual';

export interface SiteReportForm {
  date: string;
  activityId: string;
  progress: number;
  remarks: string;
  manpower: { trade: string; headcount: number }[];
  deliveries: { material: string; quantity: string; supplier?: string }[];
}

export function validateSiteReport(f: SiteReportForm, act: RegisterActivity | undefined, today: string): string[] {
  const errors: string[] = [];
  if (!isValidIso(f.date)) errors.push('Choose the report date.');
  else if (f.date > today) errors.push('The report date cannot be in the future.');
  if (!act) errors.push('Choose the construction activity.');
  if (!Number.isFinite(f.progress) || f.progress < 0 || f.progress > 100) errors.push('Accomplishment must be between 0% and 100%.');
  if (act && progressEditable(act) && f.progress < act.progress && !f.remarks.trim())
    errors.push(`Accomplishment is lower than the recorded ${act.progress}% — explain why in the site remarks.`);
  f.manpower.forEach((m, i) => {
    if (!m.trade.trim()) errors.push(`Manpower row ${i + 1}: enter the trade or crew.`);
    if (!Number.isInteger(m.headcount) || m.headcount < 0 || m.headcount > 500) errors.push(`Manpower row ${i + 1}: enter a headcount between 0 and 500.`);
  });
  f.deliveries.forEach((d, i) => {
    if (!d.material.trim()) errors.push(`Delivery row ${i + 1}: enter the material.`);
  });
  if (!f.remarks.trim() && act && f.progress === act.progress && !f.manpower.length && !f.deliveries.length)
    errors.push('Nothing to report yet — update the accomplishment or add remarks, manpower or deliveries.');
  return errors;
}
