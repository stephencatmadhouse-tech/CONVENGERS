/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Project-control collections: reports, issues and progress snapshots.
 *
 * Storage: shared Firestore collections (`reports`, `issues`, `snapshots`).
 * If the deployed Firestore security rules do not yet allow these
 * collections, writes fall back to THIS BROWSER ONLY and every such record is
 * flagged `localOnly: true` so the UI can say plainly that it is not shared.
 * Local records are pushed to Firestore automatically once rules allow it.
 */

import { collection, doc, onSnapshot, setDoc, deleteDoc, getDoc } from 'firebase/firestore';
import { db } from './config.ts';
import { ProjectIssue, ProjectReport, ProgressSnapshot } from '../types/index.ts';

type ControlCollection = 'reports' | 'issues' | 'snapshots';
type Rec = { id: string; localOnly?: boolean; [k: string]: any };

const LS_PREFIX = 'convengers_cc_';
const LOCKED = ['approved', 'published', 'archived'];

function lsRead(col: ControlCollection): Record<string, Rec> {
  try {
    const raw = localStorage.getItem(LS_PREFIX + col);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function lsWrite(col: ControlCollection, map: Record<string, Rec>) {
  try {
    localStorage.setItem(LS_PREFIX + col, JSON.stringify(map));
  } catch {
    // storage full or blocked — nothing else we can do locally
  }
}

function clean<T>(v: T): T {
  return JSON.parse(JSON.stringify(v, (_k, val) => (val === undefined ? undefined : val)));
}

function isPermissionDenied(err: unknown): boolean {
  const code = (err as any)?.code;
  const msg = err instanceof Error ? err.message : String(err);
  return code === 'permission-denied' || /insufficient permissions|PERMISSION_DENIED/i.test(msg);
}

const TIMEOUT = 'CONTROL_STORE_TIMEOUT';
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
function isTimeout(err: unknown): boolean {
  return err instanceof Error && err.message === TIMEOUT;
}

export interface ControlState {
  reports: ProjectReport[];
  issues: ProjectIssue[];
  snapshots: ProgressSnapshot[];
  /** True when the shared collection could be read from Firestore. */
  shared: Record<ControlCollection, boolean>;
}

export type WriteResult = { stored: 'shared' | 'local' };

class ControlStore {
  private remote: Record<ControlCollection, Record<string, Rec>> = { reports: {}, issues: {}, snapshots: {} };
  private shared: Record<ControlCollection, boolean> = { reports: false, issues: false, snapshots: false };
  private listeners = new Set<(s: ControlState) => void>();
  private unsubs: Array<() => void> = [];
  private started = false;

  private emit() {
    const state = this.getState();
    this.listeners.forEach((l) => l(state));
  }

  public getState(): ControlState {
    const merge = (col: ControlCollection) => {
      const local = typeof localStorage !== 'undefined' ? lsRead(col) : {};
      const out: Record<string, Rec> = { ...this.remote[col] };
      Object.values(local).forEach((r) => {
        if (!out[r.id]) out[r.id] = { ...r, localOnly: true };
      });
      return Object.values(out);
    };
    return {
      reports: (merge('reports') as ProjectReport[]).sort((a, b) => b.periodStart.localeCompare(a.periodStart)),
      issues: (merge('issues') as ProjectIssue[]).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      snapshots: (merge('snapshots') as ProgressSnapshot[]).sort((a, b) => a.date.localeCompare(b.date)),
      shared: { ...this.shared },
    };
  }

  public subscribe(cb: (s: ControlState) => void): () => void {
    this.listeners.add(cb);
    if (!this.started) this.start();
    cb(this.getState());
    return () => {
      this.listeners.delete(cb);
    };
  }

  private start() {
    this.started = true;
    (['reports', 'issues', 'snapshots'] as ControlCollection[]).forEach((col) => {
      this.unsubs.push(
        onSnapshot(
          collection(db, col),
          { includeMetadataChanges: true },
          (snap) => {
            if (snap.metadata.fromCache && !this.shared[col] && snap.empty) return;
            const map: Record<string, Rec> = {};
            snap.forEach((d) => {
              map[d.id] = { ...(d.data() as Rec), id: d.id, localOnly: false };
            });
            this.remote[col] = map;
            this.shared[col] = !snap.metadata.fromCache || this.shared[col];
            this.emit();
          },
          () => {
            this.shared[col] = false;
            this.emit();
          }
        )
      );
    });
  }

  /** Re-attempt pushing local-only records to Firestore (e.g. after rules are deployed). */
  public async syncLocal(): Promise<number> {
    let pushed = 0;
    for (const col of ['reports', 'issues', 'snapshots'] as ControlCollection[]) {
      const local = lsRead(col);
      for (const rec of Object.values(local)) {
        try {
          const { localOnly: _l, ...rest } = rec;
          await withTimeout(setDoc(doc(db, col, rec.id), clean(rest)), 10000);
          delete local[rec.id];
          pushed++;
        } catch {
          // still not permitted
        }
      }
      lsWrite(col, local);
    }
    this.emit();
    return pushed;
  }

  private async put(col: ControlCollection, rec: Rec): Promise<WriteResult> {
    const { localOnly: _l, ...rest } = rec;
    try {
      await withTimeout(setDoc(doc(db, col, rec.id), clean(rest)), 10000);
      const local = lsRead(col);
      if (local[rec.id]) {
        delete local[rec.id];
        lsWrite(col, local);
      }
      return { stored: 'shared' };
    } catch (err) {
      if (!isPermissionDenied(err) && !isTimeout(err) && navigator.onLine) throw err;
      const local = lsRead(col);
      local[rec.id] = { ...clean(rest), id: rec.id, localOnly: true };
      lsWrite(col, local);
      this.emit();
      return { stored: 'local' };
    }
  }

  private async remove(col: ControlCollection, id: string): Promise<void> {
    const local = lsRead(col);
    if (local[id]) {
      delete local[id];
      lsWrite(col, local);
      this.emit();
      if (!this.remote[col][id]) return;
    }
    await deleteDoc(doc(db, col, id));
  }

  // ---- Reports ----
  public async saveReport(r: ProjectReport): Promise<WriteResult> {
    const existing = this.getState().reports.find((x) => x.id === r.id);
    if (existing && LOCKED.includes(existing.status)) {
      throw new Error('This report is approved and locked. Approved reports cannot be modified.');
    }
    return this.put('reports', r as Rec);
  }

  /** Publishing-status change of a locked report (content is never changed). */
  public async setReportStatus(id: string, to: 'approved' | 'published' | 'archived', by: string): Promise<WriteResult> {
    const existing = this.getState().reports.find((x) => x.id === id);
    if (!existing) throw new Error('Report not found.');
    if (!LOCKED.includes(existing.status)) throw new Error('Only approved reports can be published or archived.');
    const now = new Date().toISOString();
    const next: ProjectReport = {
      ...existing,
      status: to,
      updatedAt: now,
      updatedBy: by,
      ...(to === 'published' ? { publishedAt: now, publishedBy: by } : {}),
      ...(to === 'archived' ? { archivedAt: now, archivedBy: by } : {}),
    };
    return this.put('reports', next as Rec);
  }

  public async deleteReport(id: string): Promise<void> {
    const existing = this.getState().reports.find((x) => x.id === id);
    if (existing && LOCKED.includes(existing.status)) throw new Error('Approved reports are part of the archive and cannot be deleted.');
    return this.remove('reports', id);
  }

  // ---- Issues ----
  public async saveIssue(i: ProjectIssue): Promise<WriteResult> {
    return this.put('issues', i as Rec);
  }

  public async deleteIssue(id: string): Promise<void> {
    return this.remove('issues', id);
  }

  // ---- Snapshots ----
  /** Store at most one snapshot per day (latest values of that day win). */
  public async saveSnapshot(s: ProgressSnapshot): Promise<WriteResult> {
    return this.put('snapshots', s as Rec);
  }

  public async hasRemoteSnapshot(id: string): Promise<boolean> {
    try {
      const d = await getDoc(doc(db, 'snapshots', id));
      return d.exists();
    } catch {
      return false;
    }
  }

  /** Merge-import from a JSON backup. Never deletes; skips approved reports already present. */
  public async importRecords(payload: { reports?: ProjectReport[]; issues?: ProjectIssue[]; snapshots?: ProgressSnapshot[] }): Promise<{ imported: number; skipped: number }> {
    let imported = 0;
    let skipped = 0;
    const state = this.getState();
    for (const r of payload.reports || []) {
      if (!r || !r.id) continue;
      const cur = state.reports.find((x) => x.id === r.id);
      if (cur && LOCKED.includes(cur.status)) {
        skipped++;
        continue;
      }
      await this.put('reports', r as Rec);
      imported++;
    }
    for (const i of payload.issues || []) {
      if (!i || !i.id) continue;
      const cur = state.issues.find((x) => x.id === i.id);
      if (cur && cur.updatedAt >= i.updatedAt) {
        skipped++;
        continue;
      }
      await this.put('issues', i as Rec);
      imported++;
    }
    for (const s of payload.snapshots || []) {
      if (!s || !s.id) continue;
      if (state.snapshots.find((x) => x.id === s.id)) {
        skipped++;
        continue;
      }
      await this.put('snapshots', s as Rec);
      imported++;
    }
    return { imported, skipped };
  }
}

export const controlStore = new ControlStore();
