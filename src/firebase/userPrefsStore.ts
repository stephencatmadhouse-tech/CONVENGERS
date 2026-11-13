/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Per-user notification state: which notifications the user has read and
 * their notification preferences. Stored in Firestore `userPrefs/{uid}`
 * (server rules: each user can read / write ONLY their own document).
 * If the rules are not deployed yet, the state is kept in this browser only
 * (keyed by user id) and flagged `localOnly`.
 */

import { useEffect, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from './config.ts';
import { NotificationPrefs, UserNotificationState } from '../types/index.ts';
import { DEFAULT_PREFS } from '../domain/notifications.ts';

const MAX_KEYS = 800;
const lsKey = (uid: string) => `convengers_userprefs_${uid}`;

function lsRead(uid: string): UserNotificationState | null {
  try {
    const raw = localStorage.getItem(lsKey(uid));
    return raw ? (JSON.parse(raw) as UserNotificationState) : null;
  } catch {
    return null;
  }
}
function lsWrite(uid: string, s: UserNotificationState) {
  try {
    localStorage.setItem(lsKey(uid), JSON.stringify(s));
  } catch {
    // storage unavailable
  }
}

function normalize(v: Partial<UserNotificationState> | null | undefined): UserNotificationState {
  return {
    readKeys: Array.isArray(v?.readKeys) ? v!.readKeys.filter((k) => typeof k === 'string') : [],
    prefs: {
      off: { ...(v?.prefs?.off || {}) },
      leadDays: typeof v?.prefs?.leadDays === 'number' ? v!.prefs!.leadDays : DEFAULT_PREFS.leadDays,
    },
    updatedAt: v?.updatedAt,
  };
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    p.then(
      (v) => (clearTimeout(t), resolve(v)),
      (e) => (clearTimeout(t), reject(e))
    );
  });
}

export interface UserPrefsApi {
  state: UserNotificationState;
  shared: boolean;
  markRead: (keys: string[]) => void;
  markUnread: (key: string) => void;
  setPrefs: (p: NotificationPrefs) => void;
}

export function useUserPrefs(uid: string | undefined): UserPrefsApi {
  const [state, setState] = useState<UserNotificationState>(() => normalize(uid ? lsRead(uid) : null));
  const [shared, setShared] = useState(false);

  useEffect(() => {
    if (!uid || uid === 'guest') return;
    setState(normalize(lsRead(uid)));
    const unsub = onSnapshot(
      doc(db, 'userPrefs', uid),
      (snap) => {
        if (snap.metadata.fromCache && !snap.exists()) return;
        const remote = snap.exists() ? normalize(snap.data() as UserNotificationState) : null;
        const local = lsRead(uid);
        // Union of read keys so nothing read offline becomes unread again
        const merged = normalize({
          readKeys: [...new Set([...(remote?.readKeys || []), ...(local?.readKeys || [])])].slice(-MAX_KEYS),
          prefs: (local?.localOnly && local.prefs) || remote?.prefs || local?.prefs,
          updatedAt: remote?.updatedAt,
        });
        setState(merged);
        setShared(!snap.metadata.fromCache);
      },
      () => setShared(false)
    );
    return unsub;
  }, [uid]);

  const persist = (next: UserNotificationState) => {
    if (!uid) return;
    const rec = { readKeys: next.readKeys.slice(-MAX_KEYS), prefs: next.prefs, updatedAt: new Date().toISOString() };
    setState(rec);
    lsWrite(uid, { ...rec, localOnly: true });
    if (uid === 'guest') return;
    withTimeout(setDoc(doc(db, 'userPrefs', uid), rec), 10000)
      .then(() => {
        lsWrite(uid, rec);
        setShared(true);
      })
      .catch(() => setShared(false));
  };

  return {
    state,
    shared,
    markRead: (keys) => {
      const set = new Set(state.readKeys);
      let changed = false;
      keys.forEach((k) => {
        if (!set.has(k)) {
          set.add(k);
          changed = true;
        }
      });
      if (changed) persist({ ...state, readKeys: [...set] });
    },
    markUnread: (key) => persist({ ...state, readKeys: state.readKeys.filter((k) => k !== key) }),
    setPrefs: (prefs) => persist({ ...state, prefs }),
  };
}
