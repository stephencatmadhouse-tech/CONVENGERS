/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Firebase Admin (server only): verifies the caller's Firebase ID token,
 * reads their role from `users/{uid}` and writes file metadata to Firestore.
 * The Admin SDK is never bundled into the browser.
 */

import { initializeApp, getApps, cert, applicationDefault, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import type { DriveEnv } from './config.ts';

let app: App | null = null;
let fsdb: Firestore | null = null;

export function adminDb(env: DriveEnv): Firestore {
  if (!app) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    let credential;
    if (raw) {
      try {
        credential = cert(JSON.parse(raw));
      } catch {
        credential = undefined;
      }
    }
    app =
      getApps().find((a) => a.name === 'bb-drive') ||
      initializeApp(
        {
          projectId: env.projectId || undefined,
          ...(credential ? { credential } : process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST ? {} : { credential: applicationDefault() }),
        },
        'bb-drive',
      );
  }
  if (!fsdb) fsdb = env.databaseId && env.databaseId !== '(default)' ? getFirestore(app, env.databaseId) : getFirestore(app);
  return fsdb;
}

export const ADMIN_EMAIL = 'stephencat.madhouse@gmail.com';
const STAFF = ['admin', 'director', 'manager', 'construction_manager', 'engineer', 'production', 'quality', 'staff'];
const INTERNAL = [...STAFF, 'viewer'];
const MANAGERS = ['admin', 'director', 'manager'];

export interface Caller {
  uid: string;
  email: string;
  name: string;
  role: string;
  active: boolean;
  internal: boolean;
  staff: boolean;
  manager: boolean;
}

/** Verifies `Authorization: Bearer <Firebase ID token>`; returns null when absent or invalid. */
export async function verifyCaller(env: DriveEnv, authHeader?: string | string[]): Promise<Caller | null> {
  const h = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  const m = /^Bearer\s+(.+)$/i.exec(h || '');
  if (!m) return null;
  adminDb(env);
  let decoded;
  try {
    decoded = await getAuth(app!).verifyIdToken(m[1]);
  } catch {
    return null;
  }
  const snap = await adminDb(env).collection('users').doc(decoded.uid).get();
  const u = snap.exists ? (snap.data() as any) : null;
  const email = String(decoded.email || '').toLowerCase();
  const role = u?.role || (email === ADMIN_EMAIL ? 'admin' : 'pending');
  const status = u?.status || (u ? 'active' : email === ADMIN_EMAIL ? 'active' : 'pending');
  const active = status === 'active';
  return {
    uid: decoded.uid,
    email,
    name: u?.name || decoded.name || email,
    role,
    active,
    internal: active && INTERNAL.includes(role),
    staff: active && STAFF.includes(role),
    manager: active && MANAGERS.includes(role),
  };
}
