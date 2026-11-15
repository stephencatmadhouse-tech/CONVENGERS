/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Google Drive storage — server configuration.
 * ALL credentials come from server environment variables and never reach the
 * browser. Supported credential types:
 *   1. Service account with access to a Shared Drive folder (recommended):
 *        GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON   (the full JSON key, one line)
 *   2. OAuth refresh token of the Convengers Google account:
 *        GOOGLE_DRIVE_OAUTH_CLIENT_ID / GOOGLE_DRIVE_OAUTH_CLIENT_SECRET / GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN
 * Plus:
 *   GOOGLE_DRIVE_ROOT_FOLDER_ID   id of the "CONVENGERS BAHAY BUILD" folder (or Shared Drive root)
 * Firebase Admin (verifies the signed-in user and writes file metadata):
 *   FIREBASE_SERVICE_ACCOUNT_JSON (optional on Google Cloud, where default credentials work)
 */

import fs from 'node:fs';
import path from 'node:path';

export interface DriveEnv {
  mode: 'service_account' | 'oauth' | null;
  serviceAccount?: Record<string, any>;
  oauth?: { clientId: string; clientSecret: string; refreshToken: string };
  rootFolderId?: string;
  apiBase: string;
  maxUploadBytes: number;
  projectId: string;
  databaseId: string;
}

function readAppletConfig(): {
  projectId?: string;
  firestoreDatabaseId?: string;
} {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'firebase-applet-config.json'), 'utf8'));
  } catch {
    return {};
  }
}

export function driveEnv(): DriveEnv {
  const cfg = readAppletConfig();
  let serviceAccount: Record<string, any> | undefined;
  const env = (k: string) => (process.env[k] || '').trim() || undefined;
  const raw = env('GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON');
  if (raw) {
    try {
      serviceAccount = JSON.parse(raw);
    } catch {
      serviceAccount = undefined;
    }
  }
  const clientId = env('GOOGLE_DRIVE_OAUTH_CLIENT_ID');
  const clientSecret = env('GOOGLE_DRIVE_OAUTH_CLIENT_SECRET');
  const refreshToken = env('GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN');
  const oauth = clientId && clientSecret && refreshToken ? { clientId, clientSecret, refreshToken } : undefined;
  return {
    mode: serviceAccount ? 'service_account' : oauth ? 'oauth' : null,
    serviceAccount,
    oauth,
    rootFolderId: env('GOOGLE_DRIVE_ROOT_FOLDER_ID'),
    apiBase: (process.env.DRIVE_API_BASE || 'https://www.googleapis.com').replace(/\/$/, ''),
    maxUploadBytes: Math.round(Number(process.env.DRIVE_MAX_UPLOAD_MB || 20) * 1024 * 1024),
    projectId: process.env.FIREBASE_PROJECT_ID || cfg.projectId || '',
    databaseId: process.env.FIRESTORE_DATABASE_ID || cfg.firestoreDatabaseId || '(default)',
  };
}

/** Folder layout (names are configurable in `driveConfig/settings`). */
export type FolderKey = 'photos' | 'daily' | 'weekly' | 'monthly' | 'site' | 'supporting';

export interface FolderSettings {
  projectRecords: string;
  projectFolder: string;
  folders: Record<FolderKey, string>;
  monthly: FolderKey[]; // folders split by "Month YYYY"
}

export const DEFAULT_FOLDERS: FolderSettings = {
  projectRecords: 'PROJECT RECORDS',
  projectFolder: 'BAHAY BUILD PROJECT',
  folders: {
    photos: '01 - CONSTRUCTION PHOTOGRAPHS',
    daily: '02 - DAILY CONSTRUCTION REPORTS',
    weekly: '03 - WEEKLY PROGRESS REPORTS',
    monthly: '04 - MONTHLY PROGRESS REPORTS',
    site: '05 - SITE DOCUMENTATION',
    supporting: '06 - SUPPORTING DOCUMENTS',
  },
  monthly: ['photos', 'daily'],
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Folder path (below the root folder) for a file: e.g. PROJECT RECORDS / BAHAY BUILD PROJECT / 01 - … / November 2026 / [subfolder]. */
export function folderPath(s: FolderSettings, key: FolderKey, reportingDate: string, subfolder?: string): string[] {
  const out = [s.projectRecords, s.projectFolder, s.folders[key] || DEFAULT_FOLDERS.folders[key]];
  if (s.monthly.includes(key) && /^\d{4}-\d{2}/.test(reportingDate)) {
    const [y, m] = reportingDate.split('-').map(Number);
    out.push(`${MONTHS[m - 1]} ${y}`);
  }
  const sub = safeName(subfolder || '');
  if (sub) out.push(sub);
  return out.map(safeName).filter(Boolean);
}

/** Folder / file names: no path separators or control characters, max 120 characters. */
export function safeName(s: string): string {
  return String(s || '')
    .replace(/[\u0000-\u001f\\/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

export const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
];
