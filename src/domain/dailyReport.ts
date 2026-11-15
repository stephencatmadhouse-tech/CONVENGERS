/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Daily Construction Report — rules shared by the form, history, review and tests.
 */

import type {
  DailyReport,
  DailyReportStatus,
  UserRole,
} from "../types/index.ts";
import { isValidIso } from "./dates.ts";

export const DR_PROJECT = { id: "bahay-build", name: "Convengers Bahay Build" };

export const DR_STATUS_LABEL: Record<DailyReportStatus, string> = {
  draft: "Draft",
  uploading: "Uploading",
  pending: "Pending Submission",
  submitted: "Submitted",
  under_review: "Under Review",
  approved: "Approved",
  returned: "Returned for Revision",
};
export const DR_STATUS_COLOR: Record<DailyReportStatus, string> = {
  draft: "#7A7D8F",
  uploading: "#7026C8",
  pending: "#D97706",
  submitted: "#1E1B4B",
  under_review: "#8B35E8",
  approved: "#1F9D68",
  returned: "#DC3545",
};

export const PHOTO_TYPES = [
  "Construction photograph",
  "Activity photo",
  "Material delivery photo",
  "Site condition photo",
  "Supporting image",
];
export const WORK_STATUSES = [
  "Not started",
  "In progress",
  "Completed",
  "On hold",
  "Delayed",
] as const;
export const WEATHER = [
  "Sunny",
  "Partly cloudy",
  "Cloudy",
  "Light rain",
  "Heavy rain",
  "Thunderstorm",
  "Windy",
];

const rand = (n: number) => {
  const a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  const buf =
    typeof crypto !== "undefined" && crypto.getRandomValues
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
  const d = date.replace(/-/g, "");
  const r = rand(6);
  return { id: `DR-${d}-${r}`, reference: `DCR-${d}-${r.slice(0, 4)}` };
}

export function blankDailyReport(
  date: string,
  user: { id: string; name: string },
): DailyReport {
  const { id, reference } = newDailyReportId(date);
  const now = new Date().toISOString();
  return {
    id,
    reference,
    projectId: DR_PROJECT.id,
    projectName: DR_PROJECT.name,
    date,
    weather: "",
    siteLocation: "",
    preparedBy: user.name,
    preparedById: user.id,
    createdAt: now,
    updatedAt: now,
    updatedBy: user.name,
    status: "draft",
    activities: [],
    manpower: { skilled: 0, general: 0, subcontractor: 0, other: 0 },
    materials: [],
    equipment: [],
    site: {
      observations: "",
      issues: "",
      delays: "",
      safety: "",
      corrective: "",
      recommendations: "",
    },
    photos: [],
    history: [],
  };
}

export const manpowerTotal = (r: Pick<DailyReport, "manpower">) =>
  r.manpower.skilled +
  r.manpower.general +
  r.manpower.subcontractor +
  r.manpower.other;

/** Validation before SUBMISSION (drafts only need a valid date). */
export function validateDailyReport(r: DailyReport, today: string): string[] {
  const e: string[] = [];
  if (!isValidIso(r.date)) e.push("Choose the reporting date.");
  else if (r.date > today)
    e.push("The reporting date cannot be in the future.");
  if (r.projectId !== DR_PROJECT.id)
    e.push("The report is not linked to the project.");
  const hasContent =
    r.activities.length > 0 ||
    !!r.site.observations.trim() ||
    !!r.site.issues.trim();
  if (!hasContent)
    e.push("Add at least one construction activity or a site observation.");
  r.activities.forEach((a, i) => {
    if (!a.activityId)
      e.push(`Activity ${i + 1}: choose the construction activity.`);
    if (!a.accomplishment.trim() && !a.workDescription.trim())
      e.push(
        `Activity ${i + 1}: describe the work or the actual accomplishment.`,
      );
    if (
      a.progress !== null &&
      (!Number.isFinite(a.progress) || a.progress < 0 || a.progress > 100)
    )
      e.push(`Activity ${i + 1}: progress must be between 0% and 100%.`);
  });
  const mp = r.manpower;
  (["skilled", "general", "subcontractor", "other"] as const).forEach((k) => {
    if (!Number.isInteger(mp[k]) || mp[k] < 0 || mp[k] > 1000)
      e.push("Manpower counts must be whole numbers between 0 and 1,000.");
  });
  r.materials.forEach((m, i) => {
    if (!m.description.trim())
      e.push(`Material ${i + 1}: enter the material description.`);
    if (m.deliveryDate && !isValidIso(m.deliveryDate))
      e.push(`Material ${i + 1}: check the delivery date.`);
  });
  r.equipment.forEach((q, i) => {
    if (!q.description.trim())
      e.push(`Equipment ${i + 1}: enter the equipment description.`);
  });
  if (
    r.photos.some(
      (p) =>
        p.uploadStatus !== "uploaded" &&
        p.uploadStatus !== "pending" &&
        p.uploadStatus !== "uploading",
    )
  )
    e.push("Some photographs failed to upload — retry or remove them.");
  return [...new Set(e)];
}

const MANAGER = ["admin", "director", "manager"];
const STAFF = [
  "admin",
  "director",
  "manager",
  "construction_manager",
  "engineer",
  "production",
  "quality",
  "staff",
];

/** The preparer can edit until the report is under review or approved; returned reports can be revised. */
export function canEditReport(
  r: DailyReport,
  user: { id: string; role: UserRole },
): boolean {
  if (!STAFF.includes(user.role)) return false;
  if (r.preparedById !== user.id) return false;
  return ["draft", "uploading", "pending", "submitted", "returned"].includes(
    r.status,
  );
}

export const canReview = (role: UserRole) => MANAGER.includes(role);

/** Review transitions for authorized reviewers. Submission never approves a report. */
export function reviewActions(
  status: DailyReportStatus,
): { to: DailyReportStatus; label: string; needsRemarks?: boolean }[] {
  if (status === "submitted")
    return [
      { to: "under_review", label: "Start Review" },
      { to: "approved", label: "Approve" },
      { to: "returned", label: "Return for Revision", needsRemarks: true },
    ];
  if (status === "under_review")
    return [
      { to: "approved", label: "Approve" },
      { to: "returned", label: "Return for Revision", needsRemarks: true },
    ];
  return [];
}
