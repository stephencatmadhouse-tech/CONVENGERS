/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Daily Construction Report — rules shared by the form, history, review and tests.
 */

import type { DailyOverallStatus, DailyReport, DailyReportStatus, UserRole } from '../types/index.ts';
import { isValidIso } from './dates.ts';

export const DR_PROJECT = { id: 'bahay-build', name: 'Convengers Bahay Build' };

export const DR_STATUS_LABEL: Record<DailyReportStatus, string> = {
  draft: 'Draft',
  uploading: 'Uploading',
  pending: 'Pending Submission',
  submitted: 'Submitted',
  under_review: 'Under Review',
  approved: 'Approved',
  returned: 'Returned for Revision',
};
export const DR_STATUS_COLOR: Record<DailyReportStatus, string> = {
  draft: '#7A7D8F',
  uploading: '#7026C8',
  pending: '#D97706',
  submitted: '#1E1B4B',
  under_review: '#8B35E8',
  approved: '#1F9D68',
  returned: '#DC3545',
};

export const PHOTO_TYPES = ['Construction photograph', 'Activity photo', 'Material delivery photo', 'Site condition photo', 'Supporting image'];
export const WORK_STATUSES = ['Not started', 'In progress', 'Completed', 'On hold', 'Delayed'] as const;
export const WEATHER = ['Sunny', 'Partly cloudy', 'Cloudy', 'Light rain', 'Heavy rain', 'Thunderstorm', 'Windy'];

const rand = (n: number) => {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  const buf =
    typeof crypto !== 'undefined' && crypto.getRandomValues
      ? crypto.getRandomValues(new Uint8Array(n))
      : Array.from({ length: n }, () => Math.floor(Math.random() * 256));
  for (let i = 0; i < n; i++) s += a[buf[i] % a.length];
  return s;
};

/** Unique report ID and the human reference number derived from it. */
export function newDailyReportId(date: string): {
  id: string;
  reference: string;
} {
  const d = date.replace(/-/g, '');
  const r = rand(6);
  return { id: `DR-${d}-${r}`, reference: `DCR-${d}-${r.slice(0, 4)}` };
}

export function blankDailyReport(date: string, user: { id: string; name: string }): DailyReport {
  const { id, reference } = newDailyReportId(date);
  const now = new Date().toISOString();
  return {
    id,
    reference,
    projectId: DR_PROJECT.id,
    projectName: DR_PROJECT.name,
    date,
    weather: '',
    siteLocation: '',
    preparedBy: user.name,
    preparedById: user.id,
    createdAt: now,
    updatedAt: now,
    updatedBy: user.name,
    status: 'draft',
    activities: [],
    manpower: { skilled: 0, general: 0, subcontractor: 0, other: 0 },
    manpowerRoles: DEFAULT_ROLES.map((role) => ({ role, count: 0 })),
    bRolls: [],
    nextDayPlan: [],
    materials: [],
    equipment: [],
    site: {
      observations: '',
      issues: '',
      delays: '',
      safety: '',
      corrective: '',
      recommendations: '',
    },
    photos: [],
    history: [],
  };
}

/** Validation before SUBMISSION (drafts only need a valid date). */
export function validateDailyReport(r: DailyReport, today: string): string[] {
  const e: string[] = [];
  if (!isValidIso(r.date)) e.push('Choose the reporting date.');
  else if (r.date > today) e.push('The reporting date cannot be in the future.');
  if (r.projectId !== DR_PROJECT.id) e.push('The report is not linked to the project.');
  const hasContent = r.activities.length > 0 || !!r.site.observations.trim() || !!r.site.issues.trim();
  if (!hasContent) e.push('Add at least one item under Work Accomplished Today, or a site issue / observation.');
  r.activities.forEach((a, i) => {
    if (!a.accomplishment.trim() && !a.workDescription.trim() && !a.name.trim()) e.push(`Work item ${i + 1}: describe the work accomplished.`);
    if (a.progress !== null && (!Number.isFinite(a.progress) || a.progress < 0 || a.progress > 100)) e.push(`Work item ${i + 1}: progress must be between 0% and 100%.`);
  });
  (r.manpowerRoles || []).forEach((x) => {
    if (!Number.isInteger(x.count) || x.count < 0 || x.count > 1000) e.push('Manpower counts must be whole numbers between 0 and 1,000.');
    if (x.count > 0 && !x.role.trim()) e.push('Enter the role for every manpower count.');
  });
  const mp = r.manpower;
  (['skilled', 'general', 'subcontractor', 'other'] as const).forEach((k) => {
    if (!Number.isInteger(mp[k]) || mp[k] < 0 || mp[k] > 1000) e.push('Manpower counts must be whole numbers between 0 and 1,000.');
  });
  r.materials.forEach((m, i) => {
    if (!m.description.trim()) e.push(`Material ${i + 1}: enter the material description.`);
    if (m.deliveryDate && !isValidIso(m.deliveryDate)) e.push(`Material ${i + 1}: check the delivery date.`);
  });
  r.equipment.forEach((q, i) => {
    if (!q.description.trim()) e.push(`Equipment ${i + 1}: enter the equipment description.`);
  });
  if (r.photos.some((p) => p.uploadStatus !== 'uploaded' && p.uploadStatus !== 'pending' && p.uploadStatus !== 'uploading'))
    e.push('Some photographs failed to upload — retry or remove them.');
  return [...new Set(e)];
}

const MANAGER = ['admin', 'director', 'manager'];
const STAFF = ['admin', 'director', 'manager', 'construction_manager', 'engineer', 'production', 'quality', 'staff'];

/** The preparer can edit until the report is under review or approved; returned reports can be revised. */
export function canEditReport(r: DailyReport, user: { id: string; role: UserRole }): boolean {
  if (!STAFF.includes(user.role)) return false;
  if (r.preparedById !== user.id) return false;
  return ['draft', 'uploading', 'pending', 'submitted', 'returned'].includes(r.status);
}

export const canReview = (role: UserRole) => MANAGER.includes(role);

/** Review transitions for authorized reviewers. Submission never approves a report. */
export function reviewActions(status: DailyReportStatus): { to: DailyReportStatus; label: string; needsRemarks?: boolean }[] {
  if (status === 'submitted')
    return [
      { to: 'under_review', label: 'Start Review' },
      { to: 'approved', label: 'Approve' },
      { to: 'returned', label: 'Return for Revision', needsRemarks: true },
    ];
  if (status === 'under_review')
    return [
      { to: 'approved', label: 'Approve' },
      { to: 'returned', label: 'Return for Revision', needsRemarks: true },
    ];
  return [];
}

// ======================================================================
// "Convengers Bahay Build Daily Update" format
// ======================================================================

export const MANPOWER_ROLES = ['Foreman', 'Warehouseman', 'Workers', 'Engineer', 'Safety officer', 'Mason', 'Carpenter', 'Steelman', 'Welder', 'Electrician', 'Plumber', 'Painter', 'Subcontractor'];
export const DEFAULT_ROLES = ['Foreman', 'Warehouseman', 'Workers'];
export const OVERALL_STATUSES: DailyOverallStatus['value'][] = ['Ahead of schedule', 'On schedule', 'Delayed'];

/** Manpower by role: the role list when recorded, otherwise the older skilled / general / subcontractor / other counts. */
export function manpowerRolesOf(r: Pick<DailyReport, 'manpower' | 'manpowerRoles'>): { role: string; count: number }[] {
  if (r.manpowerRoles && r.manpowerRoles.length) return r.manpowerRoles.filter((x) => x.role.trim() && x.count > 0);
  const m = r.manpower;
  return (
    [
      ['Skilled workers', m.skilled],
      ['General workers', m.general],
      ['Subcontractor personnel', m.subcontractor],
      ['Other personnel', m.other],
    ] as [string, number][]
  )
    .filter(([, n]) => n > 0)
    .map(([role, count]) => ({ role, count }));
}

/** Total headcount of a report (0 when none recorded). */
export const manpowerTotal = (r: Pick<DailyReport, 'manpower' | 'manpowerRoles'>) =>
  r.manpowerRoles && r.manpowerRoles.length ? r.manpowerRoles.reduce((s, x) => s + (x.count > 0 ? x.count : 0), 0) : r.manpower.skilled + r.manpower.general + r.manpower.subcontractor + r.manpower.other;

/** Keep the older `manpower` field in step with the role list (total under `other`), for older readers and exports. */
export function withRoleManpower(r: DailyReport): DailyReport {
  if (!r.manpowerRoles || !r.manpowerRoles.length) return r;
  return { ...r, manpower: { skilled: 0, general: 0, subcontractor: 0, other: manpowerTotal(r) } };
}

/** "Plastering works." bullets for the work accomplished today. */
export function accomplishedItems(r: Pick<DailyReport, 'activities'>): string[] {
  return r.activities
    .map((a) => {
      const text = (a.workDescription || '').trim() || (a.name || '').trim();
      const extra = (a.accomplishment || '').trim();
      return [text, extra && extra !== text ? `(${extra})` : ''].filter(Boolean).join(' ');
    })
    .filter(Boolean);
}

export const linesOf = (s?: string) =>
  (s || '')
    .split(/\n+/)
    .map((x) => x.replace(/^[\s•\-*]+/, '').trim())
    .filter(Boolean);

/** Site issues / concerns bullets (issues, then delays and safety notes, labelled). */
export function concernItems(r: Pick<DailyReport, 'site'>): string[] {
  return [...linesOf(r.site.issues), ...linesOf(r.site.delays).map((x) => `Delay: ${x}`), ...linesOf(r.site.safety).map((x) => `Safety: ${x}`)];
}

/** Materials & equipment bullets. */
export function materialItems(r: Pick<DailyReport, 'materials' | 'equipment'>): string[] {
  return [
    ...r.materials
      .filter((m) => m.description.trim())
      .map((m) => `${m.description.trim()}${m.quantity ? ` — ${m.quantity}${m.unit ? ` ${m.unit}` : ''}` : ''}${m.supplier ? ` (${m.supplier})` : ''}`),
    ...r.equipment.filter((q) => q.description.trim()).map((q) => `${q.description.trim()}${q.quantity ? ` × ${q.quantity}` : ''}${q.status ? ` — ${q.status.toLowerCase()}` : ''}`),
  ];
}

/** Overall status from the schedule (the same planned vs actual figures as the Gantt chart and dashboards). */
export function scheduleStatus(actualPct: number, plannedPct: number, asOf: string): DailyOverallStatus {
  const v = actualPct - plannedPct;
  return { value: v < -0.5 ? 'Delayed' : v > 0.5 ? 'Ahead of schedule' : 'On schedule', basis: 'Gantt chart', actualPct: Math.round(actualPct * 10) / 10, plannedPct: Math.round(plannedPct * 10) / 10, asOf };
}

const longDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

/** The report as the "Convengers Bahay Build Daily Update" message (for Viber / Messenger / e-mail). */
export function dailyUpdateText(r: DailyReport): string {
  const list = (items: string[]) => (items.length ? items : ['N/A']).map((x) => `• ${x}`).join('\n');
  const team = manpowerRolesOf(r).map((x) => `${x.count} ${x.role}`);
  const uploaded = r.photos.filter((p) => p.uploadStatus === 'uploaded').length;
  const st = r.overallStatus;
  return [
    'Convengers Bahay Build Daily Update',
    '',
    `📅 ${longDate(r.date)}`,
    '',
    '👷 Manpower Attendance:',
    '',
    list(team),
    '',
    '🏗️ Work Accomplished Today:',
    '',
    list(accomplishedItems(r)),
    '',
    '📦 Materials & Equipment:',
    '',
    list(materialItems(r)),
    '',
    '⚠️ Site Issues / Concerns:',
    '',
    list(concernItems(r)),
    '',
    '📸 B-Rolls / Videos:',
    '',
    list((r.bRolls || []).map((x) => x.trim()).filter(Boolean)),
    '',
    '📋 Next Day Work Plan:',
    '',
    list((r.nextDayPlan || []).map((x) => x.trim()).filter(Boolean)),
    '',
    st ? `📊 Overall Status: ${st.value.toUpperCase()} (Based on ${st.basis === 'Gantt chart' ? 'Gantt Chart' : 'Site Assessment'})` : '📊 Overall Status: Not recorded',
    '',
    `📸 Site Photos${uploaded ? ` (${uploaded})` : ''}`,
    '',
    `Ref. ${r.reference}`,
  ].join('\n');
}
