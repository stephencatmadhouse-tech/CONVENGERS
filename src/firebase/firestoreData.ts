/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  doc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  collection,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  orderBy,
  limit,
  writeBatch,
  DocumentReference,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './config.ts';
import {
  Milestone,
  ScopeItem,
  ConcretePour,
  Episode,
  Character,
  Activity,
  ActivityOverride,
  SystemSettings,
  FullDashboardData,
  AuditLog,
  User,
} from '../types/index.ts';
import {
  INITIAL_SETTINGS,
  INITIAL_MILESTONES,
  INITIAL_SCOPES,
  INITIAL_CONCRETE_POURS,
  INITIAL_EPISODES,
  INITIAL_CHARACTERS,
  INITIAL_OVERRIDES,
} from '../db/seedData.ts';

function isNotFoundError(err: unknown): boolean {
  const code = (err as any)?.code;
  const msg = err instanceof Error ? err.message : String(err);
  return (
    code === 'not-found' ||
    msg.includes('No document to update') ||
    msg.includes('NOT_FOUND')
  );
}

function isPermissionDeniedError(err: unknown): boolean {
  const code = (err as any)?.code;
  const msg = err instanceof Error ? err.message : String(err);
  return code === 'permission-denied' || msg.includes('Missing or insufficient permissions');
}

function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined)
      .map((item) => stripUndefined(item)) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value as Record<string, any>)) {
      if (v !== undefined) {
        out[k] = stripUndefined(v);
      }
    }
    return out as T;
  }
  return value;
}

function toSafeDocId(rawId: unknown, fallbackPrefix: string, index: number): string {
  const str = rawId !== undefined && rawId !== null ? String(rawId).trim() : '';
  if (!str) return `${fallbackPrefix}_${index}`;
  return str.replace(/\//g, '__SLASH__');
}

function decodeHtmlEntities(str: string): string {
  return String(str || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function parseMilestonesFromPageHtml(html: string, stamp: string, userName: string): Milestone[] | null {
  if (!html || typeof html !== 'string') return null;

  if (typeof DOMParser !== 'undefined') {
    try {
      const docEl = new DOMParser().parseFromString(html, 'text/html');
      const selects = Array.from(docEl.querySelectorAll('select.mst')) as HTMLSelectElement[];
      if (selects.length > 0) {
        const parsed: Milestone[] = selects.slice(0, INITIAL_MILESTONES.length).map((sel, idx) => {
          const base = INITIAL_MILESTONES[idx];
          const row = sel.closest('.mrow') || sel.parentElement?.parentElement;
          const dateEl = row?.querySelector('.mdate') || row?.firstElementChild;
          const selectedOpt = sel.querySelector('option[selected]') || sel.options[sel.selectedIndex];
          const status = (selectedOpt?.textContent || sel.value || base?.status || 'Upcoming').trim() as Milestone['status'];
          const dateText = (dateEl?.textContent || base?.dateText || '').replace(/\s+/g, ' ').trim();

          let label = base?.label || '';
          if (row && row.children.length >= 2) {
            const labelCell = row.children[1].cloneNode(true) as HTMLElement;
            labelCell.querySelectorAll('span, div').forEach((el) => {
              const txt = (el.textContent || '').trim();
              if (
                ['Fixed target', 'Confirmed', 'Planned', 'Provided'].includes(txt) ||
                txt.startsWith('Last updated by')
              ) {
                el.remove();
              }
            });
            const extractedLabel = (labelCell.textContent || '').replace(/\s+/g, ' ').trim();
            if (extractedLabel) label = extractedLabel;
          }

          return stripUndefined({
            id: base?.id || `m_${idx}`,
            index: base?.index ?? idx,
            dateText,
            label,
            badge: base?.badge,
            status,
            updatedAt: stamp,
            updatedBy: userName,
          }) as Milestone;
        });
        if (parsed.length > 0) return parsed;
      }
    } catch {
      // Fallback to regex parser below
    }
  }

  const reMst = /<select[^>]*class="[^"]*\bmst\b[^"]*"[^>]*>[\s\S]*?<\/select>/gi;
  const parsed: Milestone[] = [];
  let match: RegExpExecArray | null;
  let idx = 0;
  while ((match = reMst.exec(html)) !== null && idx < INITIAL_MILESTONES.length) {
    const base = INITIAL_MILESTONES[idx];
    const selOpt =
      match[0].match(/<option[^>]*selected[^>]*>([^<]*)<\/option>/i) ||
      match[0].match(/<option[^>]*>([^<]*)<\/option>/i);
    const status = (selOpt ? decodeHtmlEntities(selOpt[1]).trim() : base.status) as Milestone['status'];
    parsed.push(
      stripUndefined({
        ...base,
        status,
        updatedAt: stamp,
        updatedBy: userName,
      }) as Milestone
    );
    idx++;
  }
  return parsed.length > 0 ? parsed : null;
}

function parseScopesFromPageHtml(html: string, stamp: string, userName: string): ScopeItem[] | null {
  if (!html || typeof html !== 'string') return null;

  if (typeof DOMParser !== 'undefined') {
    try {
      const docEl = new DOMParser().parseFromString(html, 'text/html');
      const floorSlides = Array.from(docEl.querySelectorAll('[data-f="GF"], [data-f="2F"], [data-f="3F"]'));
      if (floorSlides.length > 0) {
        const scopes: ScopeItem[] = [];
        floorSlides.forEach((slide) => {
          const floor = slide.getAttribute('data-f') as 'GF' | '2F' | '3F';
          const panels = Array.from(slide.querySelectorAll('.colpanel'));
          let floorOrder = 0;

          const processRow = (row: Element, phase: 'Structural' | 'Finishing') => {
            const rt = row.querySelector('.rt');
            if (!rt) return;
            const children = Array.from(rt.children);
            // rt children: dot, nameBlock, .dt, .dur, pctWrap
            const nameBlock = children[1]?.cloneNode(true) as HTMLElement | undefined;
            let name = '';
            let subNote = '';
            if (nameBlock) {
              const noteEl =
                nameBlock.querySelector('div[style*="font-size:13px"], div[style*="font-size: 13px"]') ||
                nameBlock.querySelector('span[style*="font-weight:400"], span[style*="font-weight: 400"]');
              if (noteEl) {
                subNote = (noteEl.textContent || '').replace(/\s+/g, ' ').trim();
                noteEl.remove();
              }
              nameBlock.querySelectorAll('div').forEach((d) => {
                if ((d.textContent || '').trim().startsWith('Last updated by')) d.remove();
              });
              name = (nameBlock.textContent || '').replace(/\s+/g, ' ').trim();
            }

            const dateText = (row.querySelector('.dt')?.textContent || '').replace(/\s+/g, ' ').trim();
            const pctInput = row.querySelector('input.pct') as HTMLInputElement | null;
            const workingDays = Number(pctInput?.getAttribute('data-w')) || 1;
            const percentComplete = Number(pctInput?.getAttribute('value') ?? pctInput?.value ?? 0) || 0;
            const isAdded = row.classList.contains('added');

            let leftPct = 0;
            let widthPct = 10;
            let color = phase === 'Structural' ? '#3A9BFF' : '#FF9A1F';
            const pf = row.querySelector('.pf');
            const bar = pf?.parentElement as HTMLElement | null;
            if (bar) {
              const styleStr = bar.getAttribute('style') || '';
              const lm = styleStr.match(/left:\s*([\d.]+)%/i);
              const wm = styleStr.match(/width:\s*([\d.]+)%/i);
              const cm = styleStr.match(/background:\s*(#[0-9A-Fa-f]+)/i);
              if (lm) leftPct = Number(lm[1]);
              if (wm) widthPct = Number(wm[1]);
              if (cm) color = cm[1];
            }

            const sortOrder = floorOrder++;
            const matchedBase =
              INITIAL_SCOPES.find((b) => b.floor === floor && b.phase === phase && b.sortOrder === sortOrder) ||
              INITIAL_SCOPES.find((b) => b.floor === floor && b.phase === phase && b.name === name);

            const id = isAdded
              ? `sc_${floor.toLowerCase()}_added_${sortOrder}`
              : matchedBase?.id || `sc_${floor.toLowerCase()}_${phase === 'Structural' ? 's' : 'f'}_${sortOrder}`;

            scopes.push(
              stripUndefined({
                id,
                floor,
                phase,
                name: name || matchedBase?.name || 'Scope Item',
                dateText: dateText || matchedBase?.dateText || '',
                workingDays,
                percentComplete,
                ...(subNote ? { subNote } : {}),
                ...(isAdded ? { isAdded: true } : {}),
                color,
                leftPct,
                widthPct,
                sortOrder,
                updatedAt: stamp,
                updatedBy: userName,
              }) as ScopeItem
            );
          };

          if (panels.length >= 2) {
            Array.from(panels[0].querySelectorAll('.srow')).forEach((r) => processRow(r, 'Structural'));
            Array.from(panels[1].querySelectorAll('.srow')).forEach((r) => processRow(r, 'Finishing'));
          } else {
            Array.from(slide.querySelectorAll('.srow')).forEach((r, idx) =>
              processRow(r, idx < 18 ? 'Structural' : 'Finishing')
            );
          }
        });
        if (scopes.length > 0) return scopes;
      }
    } catch {
      // Fallback handled below
    }
  }
  return null;
}

export class FirestoreDataService {
  private hasSyncedBaseline = false;
  private seedPromise: Promise<void> | null = null;

  public async seedInitialDataIfEmpty(currentUser: User): Promise<void> {
    if (this.hasSyncedBaseline) return;
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'manager')) {
      return;
    }

    if (this.seedPromise) {
      return this.seedPromise;
    }

    this.seedPromise = (async () => {
      try {
        const [
          milestonesSnap,
          scopesSnap,
          poursSnap,
          episodesSnap,
          charactersSnap,
          overridesSnap,
          settingsSnap,
        ] = await Promise.all([
          getDocs(collection(db, 'milestones')),
          getDocs(collection(db, 'scopes')),
          getDocs(collection(db, 'pours')),
          getDocs(collection(db, 'episodes')),
          getDocs(collection(db, 'characters')),
          getDocs(collection(db, 'overrides')),
          getDoc(doc(db, 'settings', 'system')),
        ]);

        const ops: Array<{ type: 'set' | 'delete'; ref: DocumentReference<any>; data?: Record<string, any>; merge?: boolean }> = [];

        // Only seed a collection when it is completely empty (never append into user/imported data).
        if (milestonesSnap.empty) {
          INITIAL_MILESTONES.forEach((m) => {
            ops.push({ type: 'set', ref: doc(db, 'milestones', m.id), data: stripUndefined(m) });
          });
        }

        if (scopesSnap.empty) {
          INITIAL_SCOPES.forEach((s) => {
            ops.push({ type: 'set', ref: doc(db, 'scopes', s.id), data: stripUndefined(s) });
          });
        }

        // Detect and clean up pre-backup legacy mock document IDs (e.g. ep_1..ep_24, pour_1..pour_5, ch_boss)
        // that could otherwise double alongside the real baseline IDs. User-created IDs use timestamp suffixes (ep_17...).
        const isLegacyMockEpisodeId = (id: string) => /^ep_([1-9]|1\d|2[0-4])$/.test(id);
        const isLegacyMockPourId = (id: string) => /^pour_\d{1,3}$/.test(id);
        const isLegacyMockCharId = (id: string) => /^c(h|har)?_(?!\d{10,})[a-z0-9_]+$/i.test(id);

        const existingPours = new Set(poursSnap.docs.map((d) => d.id));
        const legacyPourDocs = poursSnap.docs.filter((d) => isLegacyMockPourId(d.id));
        if (poursSnap.empty) {
          INITIAL_CONCRETE_POURS.forEach((p) => {
            ops.push({ type: 'set', ref: doc(db, 'pours', p.id), data: stripUndefined(p) });
          });
        } else if (currentUser.role === 'admin' && legacyPourDocs.length > 0) {
          legacyPourDocs.forEach((d) => ops.push({ type: 'delete', ref: d.ref }));
          const hasAnyRealPour = INITIAL_CONCRETE_POURS.some((p) => existingPours.has(p.id));
          if (!hasAnyRealPour) {
            INITIAL_CONCRETE_POURS.forEach((p) => {
              ops.push({ type: 'set', ref: doc(db, 'pours', p.id), data: stripUndefined(p) });
            });
          }
        }

        const existingEpisodes = new Set(episodesSnap.docs.map((d) => d.id));
        const legacyEpisodeDocs = episodesSnap.docs.filter((d) => isLegacyMockEpisodeId(d.id));
        if (episodesSnap.empty) {
          INITIAL_EPISODES.forEach((e) => {
            ops.push({ type: 'set', ref: doc(db, 'episodes', e.id), data: stripUndefined(e) });
          });
        } else if (currentUser.role === 'admin' && legacyEpisodeDocs.length > 0) {
          legacyEpisodeDocs.forEach((d) => ops.push({ type: 'delete', ref: d.ref }));
          const hasAnyRealEpisode = INITIAL_EPISODES.some((e) => existingEpisodes.has(e.id));
          if (!hasAnyRealEpisode) {
            INITIAL_EPISODES.forEach((e) => {
              ops.push({ type: 'set', ref: doc(db, 'episodes', e.id), data: stripUndefined(e) });
            });
          }
        }

        const existingCharacters = new Set(charactersSnap.docs.map((d) => d.id));
        const legacyCharDocs = charactersSnap.docs.filter((d) => isLegacyMockCharId(d.id));
        if (charactersSnap.empty) {
          INITIAL_CHARACTERS.forEach((c) => {
            ops.push({ type: 'set', ref: doc(db, 'characters', c.id), data: stripUndefined(c) });
          });
        } else if (currentUser.role === 'admin' && legacyCharDocs.length > 0) {
          legacyCharDocs.forEach((d) => ops.push({ type: 'delete', ref: d.ref }));
          const hasAnyRealChar = INITIAL_CHARACTERS.some((c) => existingCharacters.has(c.id));
          if (!hasAnyRealChar) {
            INITIAL_CHARACTERS.forEach((c) => {
              ops.push({ type: 'set', ref: doc(db, 'characters', c.id), data: stripUndefined(c) });
            });
          }
        }

        if (overridesSnap.empty) {
          Object.entries(INITIAL_OVERRIDES).forEach(([ovKey, ovVal], idx) => {
            const safeId = toSafeDocId(ovKey, 'ov', idx);
            ops.push({ type: 'set', ref: doc(db, 'overrides', safeId), data: stripUndefined(ovVal) });
          });
        }

        if (!settingsSnap.exists()) {
          ops.push({ type: 'set', ref: doc(db, 'settings', 'system'), data: stripUndefined(INITIAL_SETTINGS) });
        }

        if (ops.length > 0) {
          console.log(`Syncing ${ops.length} baseline operation(s) to Firestore...`);
          await this.commitOps(ops);
        }
        this.hasSyncedBaseline = true;
      } catch (err) {
        console.warn('Firestore initial check notice:', err);
      } finally {
        this.seedPromise = null;
      }
    })();

    return this.seedPromise;
  }

  // --- Real-time Listeners ---
  public subscribeAll(onData: (data: Partial<FullDashboardData>) => void): () => void {
    const unsubs: Array<() => void> = [];

    // Milestones
    unsubs.push(
      onSnapshot(collection(db, 'milestones'), (snap) => {
        if (!snap.empty) {
          const list: Milestone[] = [];
          snap.forEach((d) => list.push(d.data() as Milestone));
          list.sort((a, b) => a.index - b.index);
          onData({ milestones: list });
        }
      }, (err) => {
        console.warn('Firestore milestones snapshot notice:', err?.message || err);
      })
    );

    // Scopes
    unsubs.push(
      onSnapshot(collection(db, 'scopes'), (snap) => {
        if (!snap.empty) {
          const list: ScopeItem[] = [];
          snap.forEach((d) => list.push(d.data() as ScopeItem));
          list.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
          onData({ scopes: list });
        }
      }, (err) => {
        console.warn('Firestore scopes snapshot notice:', err?.message || err);
      })
    );

    // Pours
    unsubs.push(
      onSnapshot(collection(db, 'pours'), (snap) => {
        if (!snap.empty) {
          const list: ConcretePour[] = [];
          snap.forEach((d) => list.push(d.data() as ConcretePour));
          onData({ pours: list });
        }
      }, (err) => {
        console.warn('Firestore pours snapshot notice:', err?.message || err);
      })
    );

    // Episodes
    unsubs.push(
      onSnapshot(collection(db, 'episodes'), (snap) => {
        if (!snap.empty) {
          const list: Episode[] = [];
          snap.forEach((d) => list.push(d.data() as Episode));
          list.sort((a, b) => a.number - b.number);
          onData({ episodes: list });
        }
      }, (err) => {
        console.warn('Firestore episodes snapshot notice:', err?.message || err);
      })
    );

    // Activities
    unsubs.push(
      onSnapshot(collection(db, 'activities'), (snap) => {
        const list: Activity[] = [];
        snap.forEach((d) => list.push(d.data() as Activity));
        onData({ activities: list });
      }, (err) => {
        console.warn('Firestore activities snapshot notice:', err?.message || err);
      })
    );

    // Overrides
    unsubs.push(
      onSnapshot(collection(db, 'overrides'), (snap) => {
        const map: Record<string, ActivityOverride> = {};
        snap.forEach((d) => {
          const item = d.data() as ActivityOverride;
          const mapKey = item.key || d.id.replace(/__SLASH__/g, '/');
          map[mapKey] = { ...item, key: mapKey };
        });
        onData({ overrides: map });
      }, (err) => {
        console.warn('Firestore overrides snapshot notice:', err?.message || err);
      })
    );

    // Characters
    unsubs.push(
      onSnapshot(collection(db, 'characters'), (snap) => {
        if (!snap.empty) {
          const list: Character[] = [];
          snap.forEach((d) => list.push(d.data() as Character));
          onData({ characters: list });
        }
      }, (err) => {
        console.warn('Firestore characters snapshot notice:', err?.message || err);
      })
    );

    // Settings
    unsubs.push(
      onSnapshot(doc(db, 'settings', 'system'), (snap) => {
        if (snap.exists()) {
          onData({ settings: snap.data() as SystemSettings });
        }
      }, (err) => {
        console.warn('Firestore settings snapshot notice:', err?.message || err);
      })
    );

    return () => {
      unsubs.forEach((u) => u());
    };
  }

  public subscribeAuditLogs(onLogs: (logs: AuditLog[]) => void): () => void {
    const q = query(collection(db, 'auditLogs'), orderBy('timestamp', 'desc'), limit(200));
    return onSnapshot(q, (snap) => {
      const logs: AuditLog[] = [];
      snap.forEach((d) => {
        logs.push({ ...(d.data() as Omit<AuditLog, 'id'>), id: d.id });
      });
      onLogs(logs);
    }, (err) => {
      console.warn('Firestore auditLogs snapshot notice:', err?.message || err);
    });
  }

  public async logAudit(user: User, action: string, entityType: string, entityId: string, details?: string): Promise<void> {
    if (!user || user.role === 'viewer') return;
    try {
      await addDoc(collection(db, 'auditLogs'), {
        userId: user.id,
        userEmail: user.email || user.name,
        action,
        entityType,
        entityId,
        details: details || '',
        timestamp: new Date().toISOString(),
      });
    } catch {
      // Non-blocking audit telemetry
    }
  }

  // --- MUTATION METHODS ENFORCED BY FIRESTORE SECURITY RULES ---
  public async updateMilestone(id: string, updates: Partial<Milestone>, userName: string): Promise<void> {
    const payload = {
      ...updates,
      updatedAt: new Date().toISOString(),
      updatedBy: userName,
    };
    const docRef = doc(db, 'milestones', id);
    try {
      await updateDoc(docRef, payload);
    } catch (err) {
      if (isNotFoundError(err)) {
        const baseline = INITIAL_MILESTONES.find((m) => m.id === id);
        if (baseline) {
          try {
            await setDoc(docRef, { ...baseline, ...payload }, { merge: true });
            return;
          } catch (seedErr) {
            if (isPermissionDeniedError(seedErr)) {
              throw new Error('Cloud records are not initialized yet. Ask an Admin or Manager to open the dashboard once to sync baseline data.');
            }
            handleFirestoreError(seedErr, OperationType.WRITE, `milestones/${id}`);
          }
        }
      }
      handleFirestoreError(err, OperationType.UPDATE, `milestones/${id}`);
    }
  }

  public async updateScope(id: string, updates: Partial<ScopeItem>, userName: string): Promise<void> {
    const payload = {
      ...updates,
      updatedAt: new Date().toISOString(),
      updatedBy: userName,
    };
    const docRef = doc(db, 'scopes', id);
    try {
      await updateDoc(docRef, payload);
    } catch (err) {
      if (isNotFoundError(err)) {
        const baseline = INITIAL_SCOPES.find((s) => s.id === id);
        if (baseline) {
          try {
            await setDoc(docRef, { ...baseline, ...payload }, { merge: true });
            return;
          } catch (seedErr) {
            if (isPermissionDeniedError(seedErr)) {
              throw new Error('Cloud records are not initialized yet. Ask an Admin or Manager to open the dashboard once to sync baseline data.');
            }
            handleFirestoreError(seedErr, OperationType.WRITE, `scopes/${id}`);
          }
        }
      }
      handleFirestoreError(err, OperationType.UPDATE, `scopes/${id}`);
    }
  }

  public async updatePour(id: string, updates: Partial<ConcretePour>, userName: string): Promise<void> {
    const payload = {
      ...updates,
      updatedAt: new Date().toISOString(),
      updatedBy: userName,
    };
    const docRef = doc(db, 'pours', id);
    try {
      await updateDoc(docRef, payload);
    } catch (err) {
      if (isNotFoundError(err)) {
        const baseline = INITIAL_CONCRETE_POURS.find((p) => p.id === id);
        if (baseline) {
          try {
            await setDoc(docRef, { ...baseline, ...payload }, { merge: true });
            return;
          } catch (seedErr) {
            if (isPermissionDeniedError(seedErr)) {
              throw new Error('Cloud records are not initialized yet. Ask an Admin or Manager to open the dashboard once to sync baseline data.');
            }
            handleFirestoreError(seedErr, OperationType.WRITE, `pours/${id}`);
          }
        }
      }
      handleFirestoreError(err, OperationType.UPDATE, `pours/${id}`);
    }
  }

  public async addPour(pour: ConcretePour, userName: string): Promise<void> {
    const payload = {
      ...pour,
      updatedAt: new Date().toISOString(),
      updatedBy: userName,
    };
    try {
      await setDoc(doc(db, 'pours', pour.id), payload);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `pours/${pour.id}`);
    }
  }

  public async deletePour(id: string): Promise<void> {
    try {
      await deleteDoc(doc(db, 'pours', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `pours/${id}`);
    }
  }

  public async updateEpisode(id: string, updates: Partial<Episode>, userName: string): Promise<void> {
    const payload = {
      ...updates,
      updatedAt: new Date().toISOString(),
      updatedBy: userName,
    };
    const docRef = doc(db, 'episodes', id);
    try {
      await updateDoc(docRef, payload);
    } catch (err) {
      if (isNotFoundError(err)) {
        const baseline = INITIAL_EPISODES.find((e) => e.id === id);
        if (baseline) {
          try {
            await setDoc(docRef, { ...baseline, ...payload }, { merge: true });
            return;
          } catch (seedErr) {
            if (isPermissionDeniedError(seedErr)) {
              throw new Error('Cloud records are not initialized yet. Ask an Admin or Manager to open the dashboard once to sync baseline data.');
            }
            handleFirestoreError(seedErr, OperationType.WRITE, `episodes/${id}`);
          }
        }
      }
      handleFirestoreError(err, OperationType.UPDATE, `episodes/${id}`);
    }
  }

  public async addEpisode(episode: Episode, userName: string): Promise<void> {
    const payload = {
      ...episode,
      updatedAt: new Date().toISOString(),
      updatedBy: userName,
    };
    try {
      await setDoc(doc(db, 'episodes', episode.id), payload);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `episodes/${episode.id}`);
    }
  }

  public async deleteEpisode(id: string): Promise<void> {
    try {
      await deleteDoc(doc(db, 'episodes', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `episodes/${id}`);
    }
  }

  public async setOverride(key: string, override: Partial<ActivityOverride>, userName: string): Promise<void> {
    const safeDocId = toSafeDocId(key, 'ov', 0);
    const payload = stripUndefined({
      ...override,
      key,
      updatedAt: new Date().toISOString(),
      updatedBy: userName,
    });
    try {
      await setDoc(doc(db, 'overrides', safeDocId), payload, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `overrides/${safeDocId}`);
    }
  }

  public async updateSettings(settings: Partial<SystemSettings>): Promise<void> {
    const payload = {
      ...settings,
      updatedAt: new Date().toISOString(),
    };
    try {
      await setDoc(doc(db, 'settings', 'system'), payload, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'settings/system');
    }
  }

  public async addScope(scope: ScopeItem, userName: string): Promise<void> {
    const payload = {
      ...scope,
      updatedAt: new Date().toISOString(),
      updatedBy: userName,
    };
    try {
      await setDoc(doc(db, 'scopes', scope.id), payload);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `scopes/${scope.id}`);
    }
  }

  public async deleteScope(id: string): Promise<void> {
    try {
      await deleteDoc(doc(db, 'scopes', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `scopes/${id}`);
    }
  }

  public async addActivity(activity: Activity, userName: string): Promise<void> {
    const payload = {
      ...activity,
      updatedAt: new Date().toISOString(),
      updatedBy: userName,
    };
    try {
      await setDoc(doc(db, 'activities', activity.id), payload);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `activities/${activity.id}`);
    }
  }

  public async updateActivity(id: string, updates: Partial<Activity>, userName: string): Promise<void> {
    const payload = {
      ...updates,
      updatedAt: new Date().toISOString(),
      updatedBy: userName,
    };
    try {
      await updateDoc(doc(db, 'activities', id), payload);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `activities/${id}`);
    }
  }

  public async deleteActivity(id: string): Promise<void> {
    try {
      await deleteDoc(doc(db, 'activities', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `activities/${id}`);
    }
  }

  public async addCharacter(char: Character): Promise<void> {
    try {
      await setDoc(doc(db, 'characters', char.id), char);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `characters/${char.id}`);
    }
  }

  public async updateCharacter(id: string, name: string): Promise<void> {
    try {
      await updateDoc(doc(db, 'characters', id), { name, updatedAt: new Date().toISOString() });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `characters/${id}`);
    }
  }

  public async deleteCharacter(id: string): Promise<void> {
    try {
      await deleteDoc(doc(db, 'characters', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `characters/${id}`);
    }
  }

  private async commitOps(
    ops: Array<{ type: 'set' | 'delete'; ref: DocumentReference<any>; data?: Record<string, any>; merge?: boolean }>
  ): Promise<void> {
    const CHUNK_SIZE = 400;
    for (let i = 0; i < ops.length; i += CHUNK_SIZE) {
      const batch = writeBatch(db);
      const chunk = ops.slice(i, i + CHUNK_SIZE);
      for (const op of chunk) {
        if (op.type === 'delete') {
          batch.delete(op.ref);
        } else if (op.merge) {
          batch.set(op.ref, op.data || {}, { merge: true });
        } else {
          batch.set(op.ref, op.data || {});
        }
      }
      await batch.commit();
    }
  }

  public async resetToBaseline(currentUser: User): Promise<void> {
    if (currentUser.role !== 'admin') {
      throw new Error('Only Administrators can reset the project database.');
    }
    const stamp = new Date().toISOString();
    try {
      const [
        milestonesSnap,
        scopesSnap,
        poursSnap,
        episodesSnap,
        charactersSnap,
        activitiesSnap,
        overridesSnap,
      ] = await Promise.all([
        getDocs(collection(db, 'milestones')),
        getDocs(collection(db, 'scopes')),
        getDocs(collection(db, 'pours')),
        getDocs(collection(db, 'episodes')),
        getDocs(collection(db, 'characters')),
        getDocs(collection(db, 'activities')),
        getDocs(collection(db, 'overrides')),
      ]);

      const ops: Array<{ type: 'set' | 'delete'; ref: DocumentReference<any>; data?: Record<string, any>; merge?: boolean }> = [];

      const queueCollectionReplace = (
        snap: { docs: Array<{ id: string; ref: DocumentReference<any> }> },
        colName: string,
        items: Array<{ id: string; [k: string]: any }>
      ) => {
        const keepIds = new Set(items.map((x) => x.id));
        snap.docs.forEach((d) => {
          if (!keepIds.has(d.id)) ops.push({ type: 'delete', ref: d.ref });
        });
        items.forEach((item) => {
          ops.push({ type: 'set', ref: doc(db, colName, item.id), data: stripUndefined(item) });
        });
      };

      queueCollectionReplace(
        milestonesSnap,
        'milestones',
        INITIAL_MILESTONES.map((m) => ({ ...m, updatedAt: stamp, updatedBy: currentUser.name }))
      );
      queueCollectionReplace(
        scopesSnap,
        'scopes',
        INITIAL_SCOPES.map((s) => ({ ...s, updatedAt: stamp, updatedBy: currentUser.name }))
      );
      queueCollectionReplace(
        poursSnap,
        'pours',
        INITIAL_CONCRETE_POURS.map((p) => ({ ...p, updatedAt: stamp, updatedBy: currentUser.name }))
      );
      queueCollectionReplace(
        episodesSnap,
        'episodes',
        INITIAL_EPISODES.map((e) => ({ ...e, updatedAt: stamp, updatedBy: currentUser.name }))
      );
      queueCollectionReplace(charactersSnap, 'characters', INITIAL_CHARACTERS);
      queueCollectionReplace(activitiesSnap, 'activities', []);

      const keepOverrideIds = new Set<string>();
      Object.entries(INITIAL_OVERRIDES).forEach(([k, val], idx) => {
        const safeId = toSafeDocId(k, 'ov', idx);
        keepOverrideIds.add(safeId);
        ops.push({
          type: 'set',
          ref: doc(db, 'overrides', safeId),
          data: stripUndefined({ ...val, key: k, updatedAt: stamp, updatedBy: currentUser.name }),
        });
      });
      overridesSnap.docs.forEach((d) => {
        if (!keepOverrideIds.has(d.id)) ops.push({ type: 'delete', ref: d.ref });
      });

      ops.push({
        type: 'set',
        ref: doc(db, 'settings', 'system'),
        data: { ...INITIAL_SETTINGS, updatedAt: stamp },
      });

      await this.commitOps(ops);
      this.hasSyncedBaseline = true;
      await this.logAudit(currentUser, 'RESET_BASELINE', 'System', 'all', 'Project baseline restored');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'baseline');
    }
  }

  public async importBackup(rawBackup: any, currentUser: User): Promise<Partial<FullDashboardData>> {
    if (currentUser.role !== 'admin' && currentUser.role !== 'manager') {
      throw new Error('Only Admins or Managers can import project backups.');
    }
    if (this.seedPromise) {
      await this.seedPromise.catch(() => {});
    }

    let parsed = rawBackup;
    if (typeof parsed === 'string') {
      parsed = JSON.parse(parsed.replace(/^\uFEFF/, ''));
    }

    const source =
      parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed.data && typeof parsed.data === 'object' && !Array.isArray(parsed.data)
          ? parsed.data
          : parsed.dashboard && typeof parsed.dashboard === 'object' && !Array.isArray(parsed.dashboard)
          ? parsed.dashboard
          : parsed
        : null;

    if (!source || typeof source !== 'object') {
      throw new Error('Invalid backup format: expected a JSON backup object.');
    }

    const pm =
      source.pm && typeof source.pm === 'object' && !Array.isArray(source.pm) ? source.pm : null;
    const pageHtml =
      source.page && typeof source.page === 'object' && typeof source.page.html === 'string'
        ? source.page.html
        : null;

    const stamp = new Date().toISOString();
    const ops: Array<{ type: 'set' | 'delete'; ref: DocumentReference<any>; data?: Record<string, any>; merge?: boolean }> = [];
    const importedState: Partial<FullDashboardData> = {};
    const replacedCollections = new Map<string, Set<string>>();

    // 1. Milestones (supports array `milestones`, legacy `ms` map, OR `page.html`)
    let normalizedMilestones: Milestone[] | null = null;
    if (Array.isArray(source.milestones)) {
      normalizedMilestones = source.milestones.map((m: any, idx: number) => {
        const id = toSafeDocId(m?.id ?? (typeof m?.index === 'number' ? `m_${m.index}` : undefined), 'm', idx);
        return stripUndefined({
          ...m,
          id,
          index: typeof m?.index === 'number' ? m.index : idx,
          updatedAt: m?.updatedAt || stamp,
          updatedBy: m?.updatedBy || currentUser.name,
        }) as Milestone;
      });
    } else if (source.ms && typeof source.ms === 'object' && !Array.isArray(source.ms)) {
      normalizedMilestones = INITIAL_MILESTONES.map((base, idx) => {
        const statusOverride = source.ms[base.id] ?? source.ms[String(base.index)] ?? source.ms[base.label];
        return stripUndefined({
          ...base,
          status: statusOverride || base.status,
          updatedAt: stamp,
          updatedBy: currentUser.name,
          index: typeof base.index === 'number' ? base.index : idx,
        }) as Milestone;
      });
    } else if (pageHtml) {
      normalizedMilestones = parseMilestonesFromPageHtml(pageHtml, stamp, currentUser.name);
    }

    if (normalizedMilestones) {
      const keepIds = new Set<string>();
      normalizedMilestones.forEach((m) => {
        keepIds.add(m.id);
        ops.push({ type: 'set', ref: doc(db, 'milestones', m.id), data: m });
      });
      replacedCollections.set('milestones', keepIds);
      importedState.milestones = normalizedMilestones;
    }

    // 2. Scopes (supports array `scopes`, legacy `pct` map, OR `page.html`)
    let normalizedScopes: ScopeItem[] | null = null;
    if (Array.isArray(source.scopes)) {
      normalizedScopes = source.scopes.map((s: any, idx: number) => {
        const matchedBase = INITIAL_SCOPES.find(
          (b) => b.id === s?.id || (b.floor === s?.floor && b.phase === s?.phase && b.name === s?.name)
        );
        const id = toSafeDocId(s?.id ?? matchedBase?.id, 'sc', idx);
        return stripUndefined({
          ...(matchedBase || {}),
          ...s,
          id,
          sortOrder: typeof s?.sortOrder === 'number' ? s.sortOrder : matchedBase?.sortOrder ?? idx,
          updatedAt: s?.updatedAt || stamp,
          updatedBy: s?.updatedBy || currentUser.name,
        }) as ScopeItem;
      });
    } else if (source.pct && typeof source.pct === 'object' && !Array.isArray(source.pct)) {
      normalizedScopes = INITIAL_SCOPES.map((base) => {
        const legacyKey = `${base.floor}|${base.phase}|${base.name}`;
        const pctVal = source.pct[base.id] ?? source.pct[legacyKey] ?? source.pct[base.name];
        return stripUndefined({
          ...base,
          percentComplete: typeof pctVal === 'number' ? pctVal : base.percentComplete,
          updatedAt: stamp,
          updatedBy: currentUser.name,
        }) as ScopeItem;
      });
    } else if (pageHtml) {
      normalizedScopes = parseScopesFromPageHtml(pageHtml, stamp, currentUser.name);
    }

    if (normalizedScopes) {
      const keepIds = new Set<string>();
      normalizedScopes.forEach((s) => {
        keepIds.add(s.id);
        ops.push({ type: 'set', ref: doc(db, 'scopes', s.id), data: s });
      });
      replacedCollections.set('scopes', keepIds);
      importedState.scopes = normalizedScopes;
    }

    // 3. Concrete Pours (`pours` / `concretePours` / `concrete` / `pm.pours` with short or long keys)
    const rawPours = Array.isArray(source.pours)
      ? source.pours
      : Array.isArray(source.concretePours)
      ? source.concretePours
      : Array.isArray(source.concrete)
      ? source.concrete
      : Array.isArray(pm?.pours)
      ? pm.pours
      : null;
    if (rawPours) {
      const keepIds = new Set<string>();
      const normalizedPours = rawPours.map((p: any, idx: number) => {
        const id = toSafeDocId(p?.id, 'pour', idx);
        keepIds.add(id);
        return stripUndefined({
          id,
          floor: p?.floor ?? p?.f ?? 'GF',
          component: p?.component ?? p?.comp ?? '',
          activity: p?.activity ?? p?.act ?? '',
          targetPour: p?.targetPour ?? p?.tp ?? '',
          actualPour: p?.actualPour ?? p?.ap ?? '',
          targetCompletion: p?.targetCompletion ?? p?.tc ?? '',
          actualCompletion: p?.actualCompletion ?? p?.ac ?? '',
          prepStatus: p?.prepStatus ?? p?.prep ?? 'Not started',
          pourStatus: p?.pourStatus ?? p?.pour ?? 'Not poured',
          cureStatus: p?.cureStatus ?? p?.cure ?? 'Not started',
          inspStatus: p?.inspStatus ?? p?.insp ?? 'Pending',
          milestoneStatus: p?.milestoneStatus ?? p?.ms ?? 'Not Yet Started',
          remarks: p?.remarks ?? p?.rem ?? '',
          sourceRef: p?.sourceRef ?? p?.src ?? '',
          updatedAt: p?.updatedAt || stamp,
          updatedBy: p?.updatedBy || currentUser.name,
        }) as ConcretePour;
      });
      normalizedPours.forEach((p: ConcretePour) => {
        ops.push({ type: 'set', ref: doc(db, 'pours', p.id), data: p });
      });
      replacedCollections.set('pours', keepIds);
      importedState.pours = normalizedPours;
    }

    // 4. Episodes (`episodes` / `eps` / `pm.episodes` with short `no`/`scope`/`shoot`/`release`/`chars` or long keys)
    const rawEpisodes = Array.isArray(source.episodes)
      ? source.episodes
      : Array.isArray(source.eps)
      ? source.eps
      : Array.isArray(pm?.episodes)
      ? pm.episodes
      : null;
    if (rawEpisodes) {
      const epMap = new Map<string, Episode>();
      rawEpisodes.forEach((e: any, idx: number) => {
        const rawNo = e?.number ?? e?.no;
        const parsedNo = Number(rawNo);
        const isNumeric = rawNo !== undefined && rawNo !== null && String(rawNo).trim() !== '' && Number.isFinite(parsedNo);
        const epNum = isNumeric ? parsedNo : idx + 1;
        const episodeLabel = e?.episodeLabel ?? (!isNumeric && rawNo !== undefined && String(rawNo).trim() ? String(rawNo).trim() : undefined);
        const id = toSafeDocId(e?.id ?? `ep_${epNum}`, 'ep', idx);
        const charList = Array.isArray(e?.characters)
          ? e.characters.map(String)
          : Array.isArray(e?.chars)
          ? e.chars.map(String)
          : [];
        epMap.set(
          id,
          stripUndefined({
            id,
            number: epNum,
            ...(episodeLabel ? { episodeLabel } : {}),
            title: e?.title ?? '',
            topic: e?.topic ?? '',
            scopeOfWork: e?.scopeOfWork ?? e?.scope ?? '',
            shootStart: e?.shootStart ?? e?.shoot ?? '',
            shootEnd: e?.shootEnd ?? '',
            releaseDate: e?.releaseDate ?? e?.release ?? '',
            location: e?.location ?? '',
            director: e?.director ?? '',
            status: e?.status ?? 'Planned',
            scopeStatus: e?.scopeStatus ?? 'Not started',
            remarks: e?.remarks ?? '',
            characters: charList,
            updatedAt: e?.updatedAt || stamp,
            updatedBy: e?.updatedBy || currentUser.name,
          }) as Episode
        );
      });
      const keepIds = new Set<string>(epMap.keys());
      const normalizedEpisodes = Array.from(epMap.values()).sort((a, b) => a.number - b.number);
      normalizedEpisodes.forEach((e: Episode) => {
        ops.push({ type: 'set', ref: doc(db, 'episodes', e.id), data: e });
      });
      replacedCollections.set('episodes', keepIds);
      importedState.episodes = normalizedEpisodes;
    }

    // 5. Characters (`characters` / `chars` / `pm.characters`)
    const rawCharacters = Array.isArray(source.characters)
      ? source.characters
      : Array.isArray(source.chars)
      ? source.chars
      : Array.isArray(pm?.characters)
      ? pm.characters
      : null;
    if (rawCharacters) {
      const keepIds = new Set<string>();
      const normalizedChars = rawCharacters.map((c: any, idx: number) => {
        const id = toSafeDocId(c?.id, 'ch', idx);
        keepIds.add(id);
        return stripUndefined({
          ...c,
          id,
          name: String(c?.name ?? ''),
          createdAt: c?.createdAt || stamp.split('T')[0],
        }) as Character;
      });
      normalizedChars.forEach((c: Character) => {
        ops.push({ type: 'set', ref: doc(db, 'characters', c.id), data: c });
      });
      replacedCollections.set('characters', keepIds);
      importedState.characters = normalizedChars;
    }

    // 6. Activities (`activities` / `customActs` / `pm.activities`)
    const rawActivities = Array.isArray(source.activities)
      ? source.activities
      : Array.isArray(source.customActs)
      ? source.customActs
      : Array.isArray(pm?.activities)
      ? pm.activities
      : null;
    if (rawActivities) {
      const keepIds = new Set<string>();
      const normalizedActivities = rawActivities.map((a: any, idx: number) => {
        const id = toSafeDocId(a?.id, 'act', idx);
        keepIds.add(id);
        return stripUndefined({
          ...a,
          id,
          createdAt: a?.createdAt || stamp,
          updatedAt: a?.updatedAt || stamp,
          updatedBy: a?.updatedBy || currentUser.name,
        }) as Activity;
      });
      normalizedActivities.forEach((a: Activity) => {
        ops.push({ type: 'set', ref: doc(db, 'activities', a.id), data: a });
      });
      replacedCollections.set('activities', keepIds);
      importedState.activities = normalizedActivities;
    }

    // 7. Activity Overrides (`overrides` / `ov` / `pm.ov` with short `rem`/`hold` or long keys)
    const rawOverrides =
      source.overrides && typeof source.overrides === 'object' && !Array.isArray(source.overrides)
        ? source.overrides
        : source.ov && typeof source.ov === 'object' && !Array.isArray(source.ov)
        ? source.ov
        : pm?.ov && typeof pm.ov === 'object' && !Array.isArray(pm.ov)
        ? pm.ov
        : null;
    if (rawOverrides) {
      const keepIds = new Set<string>();
      const normalizedOverrides: Record<string, ActivityOverride> = {};
      Object.entries(rawOverrides).forEach(([rawKey, val], idx) => {
        if (!val || typeof val !== 'object') return;
        const v = val as Record<string, any>;
        const originalKey = v.key ? String(v.key) : rawKey;
        const safeDocId = toSafeDocId(originalKey, 'ov', idx);
        keepIds.add(safeDocId);
        const cleanOv = stripUndefined({
          key: originalKey,
          owner: v.owner ?? '',
          remarks: v.remarks ?? v.rem ?? '',
          onHold: v.onHold !== undefined ? Boolean(v.onHold) : Boolean(v.hold),
          updatedAt: v.updatedAt || stamp,
          updatedBy: v.updatedBy || currentUser.name,
        }) as ActivityOverride;
        normalizedOverrides[originalKey] = cleanOv;
        ops.push({ type: 'set', ref: doc(db, 'overrides', safeDocId), data: cleanOv });
      });
      replacedCollections.set('overrides', keepIds);
      importedState.overrides = normalizedOverrides;
    }

    // 8. System Settings (`settings`, top-level `theme`/`paper`, or `exportedAt` / `page.ver`)
    if (
      (source.settings && typeof source.settings === 'object') ||
      source.theme ||
      source.paper ||
      source.exportedAt ||
      source.page?.ver
    ) {
      const nextSettings: SystemSettings = stripUndefined({
        theme: source.settings?.theme || source.theme || INITIAL_SETTINGS.theme,
        paper: source.settings?.paper || source.paper || INITIAL_SETTINGS.paper,
        version:
          typeof source.settings?.version === 'number'
            ? source.settings.version + 1
            : typeof source.page?.ver?.v === 'number'
            ? source.page.ver.v
            : INITIAL_SETTINGS.version + 1,
        updatedAt: source.exportedAt || source.settings?.updatedAt || stamp,
      });
      ops.push({ type: 'set', ref: doc(db, 'settings', 'system'), data: nextSettings, merge: true });
      importedState.settings = nextSettings;
    }

    if (ops.length === 0 && replacedCollections.size === 0) {
      throw new Error(
        'No recognizable project data found in this JSON file (expected milestones, scopes, pours, episodes, activities, characters, overrides, or pm/page export).'
      );
    }

    try {
      // Remove stale documents in collections replaced by this backup (execute deletes first)
      const existingSnaps = await Promise.all(
        Array.from(replacedCollections.entries()).map(async ([colName, keepIds]) => {
          const snap = await getDocs(collection(db, colName));
          return { keepIds, snap };
        })
      );
      const deleteOps: Array<{ type: 'set' | 'delete'; ref: DocumentReference<any>; data?: Record<string, any>; merge?: boolean }> = [];
      existingSnaps.forEach(({ keepIds, snap }) => {
        snap.docs.forEach((d) => {
          if (!keepIds.has(d.id)) {
            deleteOps.push({ type: 'delete', ref: d.ref });
          }
        });
      });

      if (deleteOps.length > 0 && currentUser.role !== 'admin') {
        throw new Error('Only an Administrator can replace existing collections containing records to remove.');
      }

      const finalOps = [...deleteOps, ...ops];
      await this.commitOps(finalOps);
      if (typeof window !== 'undefined') {
        try {
          localStorage.removeItem('convengers_cached_dashboard');
        } catch {
          // ignore
        }
      }
      this.hasSyncedBaseline = true;
      await this.logAudit(
        currentUser,
        'IMPORT_BACKUP',
        'System',
        'all',
        `Imported JSON backup (${finalOps.length} operations)`
      );
      return importedState;
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'backup');
      return importedState;
    }
  }
}

export const firestoreData = new FirestoreDataService();
