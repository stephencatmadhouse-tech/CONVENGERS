/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  waitForPendingWrites,
  terminate,
  clearIndexedDbPersistence,
  doc,
  getDocFromServer,
  type Firestore,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

export const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
/**
 * Firestore with a persistent on-device cache (IndexedDB): data opened once
 * stays available offline and writes made offline are kept after the app is
 * closed and sent when the connection returns. The UI still distinguishes
 * server-confirmed data from device data (see firestoreData sync status).
 * Falls back to the in-memory cache where IndexedDB is unavailable.
 */
function makeDb(): Firestore {
  try {
    return initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }, firebaseConfig.firestoreDatabaseId);
  } catch {
    return getFirestore(app, firebaseConfig.firestoreDatabaseId);
  }
}
export const db = makeDb();

/**
 * On sign-out from a shared device: remove the cached project data, but only
 * after every pending change has reached the server (nothing unsynced is lost).
 * Returns 'cleared' (the page must reload afterwards) or 'kept'.
 */
export async function clearDeviceCacheIfSafe(timeoutMs = 4000): Promise<'cleared' | 'kept'> {
  try {
    const flushed = await Promise.race([
      waitForPendingWrites(db).then(() => true),
      new Promise<boolean>((r) => setTimeout(() => r(false), timeoutMs)),
    ]);
    if (!flushed) return 'kept';
    await terminate(db);
    await clearIndexedDbPersistence(db);
    try {
      localStorage.removeItem('convengers_cached_dashboard');
    } catch {
      // storage unavailable
    }
    return 'cleared';
  } catch {
    return 'kept';
  }
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map((provider) => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Validate connection to Firestore on initialization
export async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'settings', 'system'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firestore offline notice. Please check network and Firebase configuration.');
    }
  }
}

testConnection().catch(() => {});
