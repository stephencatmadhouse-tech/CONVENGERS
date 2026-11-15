/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Google Drive credentials saved from the app (for hosts where server
 * environment variables cannot be set, e.g. an AI Studio Starter project).
 *
 * Stored in Firestore `driveSecrets/oauth`. The security rules deny every
 * browser read and write (global catch-all), so only this server (Firebase
 * Admin SDK) can read them, and the API never returns the values.
 * Server environment variables, when present, always take precedence.
 */

import { driveEnv, type DriveEnv } from './config.ts';
import { adminDb } from './admin.ts';

export interface StoredDriveCredentials {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  rootFolderId: string;
  savedBy?: string;
  savedAt?: string;
}

export type CredentialSource = 'env' | 'app' | null;

const DOC = ['driveSecrets', 'oauth'] as const;
let cache: { at: number; value: StoredDriveCredentials | null } | null = null;

async function readStored(env: DriveEnv): Promise<StoredDriveCredentials | null> {
  if (cache && Date.now() - cache.at < 60_000) return cache.value;
  let value: StoredDriveCredentials | null = null;
  try {
    const snap = await adminDb(env).collection(DOC[0]).doc(DOC[1]).get();
    const d = snap.exists ? (snap.data() as StoredDriveCredentials) : null;
    value = d && d.clientId && d.clientSecret && d.refreshToken ? d : null;
  } catch {
    value = null;
  }
  cache = { at: Date.now(), value };
  return value;
}

/** Server environment first; otherwise the credentials saved from the app. */
export async function loadDriveEnv(): Promise<DriveEnv & { source: CredentialSource; savedBy?: string; savedAt?: string }> {
  const env = driveEnv();
  if (env.mode) return { ...env, source: 'env' };
  const s = await readStored(env);
  if (!s) return { ...env, source: null };
  return {
    ...env,
    mode: 'oauth',
    oauth: { clientId: s.clientId, clientSecret: s.clientSecret, refreshToken: s.refreshToken },
    rootFolderId: env.rootFolderId || s.rootFolderId,
    source: 'app',
    savedBy: s.savedBy,
    savedAt: s.savedAt,
  };
}

export async function saveStoredCredentials(env: DriveEnv, value: StoredDriveCredentials | null): Promise<void> {
  const ref = adminDb(env).collection(DOC[0]).doc(DOC[1]);
  if (value) await ref.set(value);
  else await ref.delete();
  cache = null;
}
