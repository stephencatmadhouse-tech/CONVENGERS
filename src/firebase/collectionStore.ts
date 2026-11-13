/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Generic real-time store for one Firestore collection.
 * - Reads/writes the shared Firestore collection (security enforced by
 *   firestore.rules on the server).
 * - If the deployed rules do not yet allow the collection, writes fall back
 *   to THIS BROWSER ONLY and are flagged `localOnly` so the UI can say so.
 */

import { collection, doc, onSnapshot, setDoc, deleteDoc, query, QueryConstraint } from 'firebase/firestore';
import { db } from './config.ts';

type Rec = { id: string; localOnly?: boolean; [k: string]: any };

export interface StoreState<T> {
  items: T[];
  shared: boolean; // shared collection readable
  loaded: boolean; // first response (or error) received
  error?: string;
}

const TIMEOUT = 'STORE_TIMEOUT';
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(TIMEOUT)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

function isPermissionDenied(err: unknown): boolean {
  const code = (err as any)?.code;
  const msg = err instanceof Error ? err.message : String(err);
  return code === 'permission-denied' || /insufficient permissions|PERMISSION_DENIED/i.test(msg);
}

function clean<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

export class CollectionStore<T extends { id: string }> {
  private remote: Record<string, Rec> = {};
  private shared = false;
  private loaded = false;
  private error?: string;
  private listeners = new Set<(s: StoreState<T>) => void>();
  private unsub: (() => void) | null = null;

  constructor(
    public readonly col: string,
    private sortFn?: (a: T, b: T) => number,
    /** Optional query constraints (e.g. the public portal reads only public kinds). */
    private constraints?: QueryConstraint[]
  ) {}

  private lsKey() {
    return `convengers_cs_${this.col}`;
  }
  private lsRead(): Record<string, Rec> {
    try {
      const raw = localStorage.getItem(this.lsKey());
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }
  private lsWrite(map: Record<string, Rec>) {
    try {
      localStorage.setItem(this.lsKey(), JSON.stringify(map));
    } catch {
      // storage unavailable
    }
  }

  getState(): StoreState<T> {
    const out: Record<string, Rec> = { ...this.remote };
    Object.values(this.lsRead()).forEach((r) => {
      if (!out[r.id]) out[r.id] = { ...r, localOnly: true };
    });
    const items = Object.values(out) as unknown as T[];
    if (this.sortFn) items.sort(this.sortFn);
    return { items, shared: this.shared, loaded: this.loaded, error: this.error };
  }

  private emit() {
    const s = this.getState();
    this.listeners.forEach((l) => l(s));
  }

  subscribe(cb: (s: StoreState<T>) => void): () => void {
    this.listeners.add(cb);
    if (!this.unsub) {
      // If the database does not answer (offline / blocked), stop waiting after 8 s.
      const t = setTimeout(() => {
        if (!this.loaded) {
          this.loaded = true;
          this.shared = false;
          this.error = 'unreachable';
          this.emit();
        }
      }, 8000);
      this.unsub = onSnapshot(
        this.constraints?.length ? query(collection(db, this.col), ...this.constraints) : collection(db, this.col),
        { includeMetadataChanges: true },
        (snap) => {
          // A cache-only result (offline) is not confirmation that shared storage works
          if (snap.metadata.fromCache && !this.shared && snap.empty) return;
          const map: Record<string, Rec> = {};
          snap.forEach((d) => {
            map[d.id] = { ...(d.data() as Rec), id: d.id, localOnly: false };
          });
          clearTimeout(t);
          this.remote = map;
          this.shared = !snap.metadata.fromCache || this.shared;
          this.loaded = true;
          this.error = undefined;
          this.emit();
        },
        (err) => {
          clearTimeout(t);
          this.shared = false;
          this.loaded = true;
          this.error = isPermissionDenied(err) ? 'permission-denied' : String(err?.message || err);
          this.emit();
        }
      );
    }
    cb(this.getState());
    return () => {
      this.listeners.delete(cb);
      if (!this.listeners.size && this.unsub) {
        this.unsub();
        this.unsub = null;
        this.loaded = false;
      }
    };
  }

  async put(rec: T): Promise<'shared' | 'local'> {
    const { localOnly: _l, ...rest } = rec as unknown as Rec;
    try {
      await withTimeout(setDoc(doc(db, this.col, rec.id), clean(rest)), 10000);
      const local = this.lsRead();
      if (local[rec.id]) {
        delete local[rec.id];
        this.lsWrite(local);
      }
      return 'shared';
    } catch (err) {
      if (!isPermissionDenied(err) && !(err instanceof Error && err.message === TIMEOUT)) throw err;
      const local = this.lsRead();
      local[rec.id] = { ...clean(rest), id: rec.id, localOnly: true };
      this.lsWrite(local);
      this.emit();
      return 'local';
    }
  }

  async remove(id: string): Promise<void> {
    const local = this.lsRead();
    if (local[id]) {
      delete local[id];
      this.lsWrite(local);
      this.emit();
      if (!this.remote[id]) return;
    }
    await withTimeout(deleteDoc(doc(db, this.col, id)), 10000);
  }

  async syncLocal(): Promise<number> {
    let n = 0;
    const local = this.lsRead();
    for (const r of Object.values(local)) {
      try {
        const { localOnly: _l, ...rest } = r;
        await withTimeout(setDoc(doc(db, this.col, r.id), clean(rest)), 10000);
        delete local[r.id];
        n++;
      } catch {
        // still not permitted
      }
    }
    this.lsWrite(local);
    this.emit();
    return n;
  }
}

export function newId(prefix: string): string {
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `${prefix}-${stamp}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}
