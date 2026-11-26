/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * PRODUCTION ALIGNMENT (internal)
 *   Dashboard — the stakeholder dashboard on live data, plus publishing to the client portal.
 *   Episodes  — production details per episode: classification, construction links, team,
 *               character availability, checklist, proposed / confirmed / actual dates,
 *               review of construction changes, batch scheduling of flexible episodes.
 *   History   — every schedule revision (target, proposed, confirmed, actual, reviews).
 *
 * Writes go to the ORIGINAL records: target dates, status and director → the episode (via the same
 * activity patch every module uses, which records revisions); construction links → the activity's
 * "depends on" list; production-only details → `episodeProduction/{episodeId}`.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Circle, ExternalLink, Pencil, Send, EyeOff, CalendarPlus, ShieldCheck } from 'lucide-react';
import { useCommand } from './context.tsx';
import { Banner, Empty, Field, Modal } from './ui.tsx';
import { useStore } from '../firebase/useStore.ts';
import { episodeProductionStore, portalStore } from '../firebase/opsStores.ts';
import type { CastAvailability, ChecklistKey, EpisodeProduction, ProdChange, ProdClass, TeamRole } from '../types/index.ts';
import {
  AWAITING,
  CATEGORIES,
  CHECKLIST,
  CLASS_LABEL,
  LIGHT,
  PRODUCTION_PORTAL_ID,
  TEAM_ROLES,
  alignmentSnapshot,
  buildProduction,
  rangeText,
  type PPEpisode,
  type PortalProduction,
} from '../domain/productionAlignment.ts';
import { episodeActivityId } from '../domain/register.ts';
import { fmtDate, fmtRange, isValidIso } from '../domain/dates.ts';
import { ProductionAlignment, Status, LightDot } from '../portal/ProductionAlignment.tsx';
import '../portal/productionAlignment.css';

const nowIso = () => new Date().toISOString();

/** Live production alignment built from the current records. */
export function useProductionData(): { data: PortalProduction; records: EpisodeProduction[]; loaded: boolean } {
  const { data, register, today } = useCommand();
  const recs = useStore(episodeProductionStore);
  const built = useMemo(
    () =>
      buildProduction({
        episodes: data.episodes,
        characters: data.characters,
        register,
        records: recs.items,
        overrides: data.overrides,
        today,
      }),
    [data.episodes, data.characters, data.overrides, register, recs.items, today]
  );
  return { data: built, records: recs.items, loaded: recs.loaded };
}

/** The client copy: no editor names in the revision history. */
export function portalCopy(p: PortalProduction): PortalProduction {
  return { ...p, episodes: p.episodes.map((e) => ({ ...e, history: e.history.map(({ by: _by, ...h }) => h) })) };
}
const comparable = (p: PortalProduction) => JSON.stringify({ ...portalCopy(p), asOf: '' });

/**
 * Keeps the published client copy in step with the live records (managers only — they are the
 * ones allowed to publish). Runs while any manager has the internal app open.
 */
export const ProductionPortalSync: React.FC = () => {
  const { isManager, user } = useCommand();
  const { data, loaded } = useProductionData();
  const portal = useStore(portalStore, isManager);
  const rec = portal.items.find((r) => r.id === PRODUCTION_PORTAL_ID);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!isManager || !loaded || !portal.loaded || !rec || rec.localOnly) return;
    if (comparable(rec.content as PortalProduction) === comparable(data)) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      void portalStore
        .put({ ...rec, content: portalCopy(data), publishedAt: nowIso(), publishedBy: user.name })
        .catch(() => undefined);
    }, 2500);
    return () => window.clearTimeout(timer.current);
  }, [isManager, loaded, portal.loaded, rec, data, user.name]);
  return null;
};

export const ProductionAlignmentAdmin: React.FC<{ tab?: string; param?: string }> = ({ tab, param }) => {
  const live = useProductionData();
  const { actions } = useCommand();
  const initial = param?.startsWith('id=') ? decodeURIComponent(param.slice(3)) : null;
  const [editId, setEditId] = useState<string | null>(initial);
  useEffect(() => setEditId(initial), [initial]);
  const manage = (id: string) => setEditId(id);
  return (
    <>
      {tab === 'episodes' ? (
        <EpisodeList p={live.data} onEdit={manage} />
      ) : tab === 'history' ? (
        <HistoryLog p={live.data} />
      ) : (
        <>
          <PublishBar p={live.data} />
          <ProductionAlignment data={live.data} actions={{ onManage: manage }} />
        </>
      )}
      {editId && live.data.episodes.some((e) => e.id === editId) && (
        <EpisodeEditor
          p={live.data}
          rec={live.records.find((r) => r.id === editId)}
          id={editId}
          onClose={() => {
            setEditId(null);
            if (initial) actions.navigate(`palign/${tab || 'dashboard'}`);
          }}
        />
      )}
    </>
  );
};

// ---------------------------------------------------------------------------
const PublishBar: React.FC<{ p: PortalProduction }> = ({ p }) => {
  const { isManager, user, actions } = useCommand();
  const portal = useStore(portalStore);
  const rec = portal.items.find((r) => r.id === PRODUCTION_PORTAL_ID);
  const [busy, setBusy] = useState(false);
  const upToDate = rec && comparable(rec.content as PortalProduction) === comparable(p);
  const publish = async () => {
    setBusy(true);
    try {
      const where = await portalStore.put({ id: PRODUCTION_PORTAL_ID, kind: 'production', title: 'Production Alignment', publishedAt: nowIso(), publishedBy: user.name, content: portalCopy(p) });
      actions.toast(where === 'shared' ? 'Published — signed-in stakeholders can open Production Alignment in the client portal' : 'Saved on this device only — the shared database refused the update');
    } catch (err) {
      actions.toast(`Not published: ${err instanceof Error ? err.message : 'permission denied'}`);
    }
    setBusy(false);
  };
  const unpublish = async () => {
    setBusy(true);
    try {
      await portalStore.remove(PRODUCTION_PORTAL_ID);
      actions.toast('Withdrawn from the client portal');
    } catch (err) {
      actions.toast(`Not withdrawn: ${err instanceof Error ? err.message : 'permission denied'}`);
    }
    setBusy(false);
  };
  return (
    <div className="pa-pub">
      <div>
        <b>Client portal:</b>{' '}
        {rec ? (
          <>
            published {new Date(rec.publishedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
            {rec.localOnly ? ' · on this device only' : upToDate ? ' · up to date' : ' · updating with the latest changes…'}
          </>
        ) : (
          'not published — stakeholders cannot see Production Alignment yet'
        )}
        <span className="pc-dim"> · Visible to signed-in stakeholders, owners and executives (not the public). Updates automatically while published.</span>
      </div>
      <div className="pa-pub-a">
        <a className="pa-btn sm ghost" href="#/portal/production" target="_blank" rel="noreferrer">
          <ExternalLink size={14} aria-hidden /> Stakeholder view
        </a>
        {isManager && (
          <>
            <button type="button" className="pa-btn sm primary" disabled={busy} onClick={publish}>
              <Send size={14} aria-hidden /> {rec ? 'Update now' : 'Publish to client portal'}
            </button>
            {rec && (
              <button type="button" className="pa-btn sm" disabled={busy} onClick={unpublish}>
                <EyeOff size={14} aria-hidden /> Unpublish
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
const EpisodeList: React.FC<{ p: PortalProduction; onEdit: (id: string) => void }> = ({ p, onEdit }) => {
  const { isManager, user, actions, register, patchHelper } = useEditing();
  const [filter, setFilter] = useState<'all' | 'attention' | 'time' | 'flexible' | 'open'>('open');
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [batchDate, setBatchDate] = useState('');
  const [busy, setBusy] = useState(false);
  const list = p.episodes.filter((e) =>
    filter === 'all'
      ? true
      : filter === 'open'
        ? e.status !== 'Completed'
        : filter === 'attention'
          ? e.light === 'red' || e.light === 'orange' || e.readiness.awaiting.length > 0
          : e.classification === filter
  );
  const picked = p.episodes.filter((e) => sel[e.id]);
  const batch = async () => {
    if (!isValidIso(batchDate) || !picked.length) return;
    setBusy(true);
    let n = 0;
    for (const e of picked) {
      const ok = isManager
        ? await patchHelper.approve(e, { start: batchDate, end: batchDate }, `Batched filming day (${picked.map((x) => x.code).join(', ')})`, p)
        : await patchHelper.propose(e, { start: batchDate, end: batchDate }, `Batched filming day (${picked.map((x) => x.code).join(', ')})`);
      if (ok) n++;
    }
    setBusy(false);
    setSel({});
    actions.toast(isManager ? `${n} episode${n === 1 ? '' : 's'} confirmed for ${fmtDate(batchDate)}` : `${n} episode${n === 1 ? '' : 's'} proposed for ${fmtDate(batchDate)} — awaiting director approval`);
  };
  void register;
  void user;
  return (
    <div className="pa">
      <div className="pa-card">
        <div className="pa-sec-h">
          <h2>Episodes</h2>
          <div className="pa-filters">
            <select className="pa-sel" aria-label="Show" value={filter} onChange={(e) => setFilter(e.target.value as any)}>
              <option value="open">Not yet filmed</option>
              <option value="attention">Needs attention</option>
              <option value="time">Time-sensitive</option>
              <option value="flexible">Non-time-sensitive</option>
              <option value="all">All episodes</option>
            </select>
          </div>
        </div>
        <p className="pc-dim pa-note">
          Titles, target dates, director and characters come from the episode records (Production Monitoring → Episodes table). Production details are added here. Select non-time-sensitive episodes to
          batch them into one filming day.
        </p>
        {picked.length > 0 && (
          <div className="pa-batch">
            <b>
              {picked.length} selected ({picked.map((e) => e.code).join(', ')})
            </b>
            <label>
              Filming day <input type="date" className="cv-input" value={batchDate} onChange={(e) => setBatchDate(e.target.value)} aria-label="Batch filming day" />
            </label>
            <button type="button" className="pa-btn sm primary" disabled={busy || !isValidIso(batchDate)} onClick={batch}>
              <CalendarPlus size={14} aria-hidden /> {isManager ? 'Confirm batch' : 'Propose batch'}
            </button>
            <button type="button" className="pa-btn sm ghost" onClick={() => setSel({})}>
              Clear
            </button>
          </div>
        )}
        {list.length ? (
          <div className="pa-tablewrap" style={{ display: 'block' }}>
            <table className="pa-table pa-mtable">
              <thead>
                <tr>
                  <th aria-label="Select" />
                  <th>Episode</th>
                  <th>Classification</th>
                  <th>Shoot</th>
                  <th>Construction</th>
                  <th>Status</th>
                  <th>Readiness</th>
                  <th>Assignment</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.map((e) => (
                  <tr key={e.id}>
                    <td>
                      {e.classification === 'flexible' && e.status !== 'Completed' && (
                        <input type="checkbox" aria-label={`Select ${e.code} for batch filming`} checked={!!sel[e.id]} onChange={(ev) => setSel({ ...sel, [e.id]: ev.target.checked })} />
                      )}
                    </td>
                    <td>
                      <span className="pa-who">
                        <LightDot e={e} /> <b>{e.code}</b> {e.title}
                      </span>
                    </td>
                    <td>
                      {CLASS_LABEL[e.classification]}
                      {e.classAuto && <span className="pc-dim"> · auto</span>}
                    </td>
                    <td>
                      {e.shown ? rangeText(e.shown) : AWAITING}
                      {e.shown && <span className="pc-dim"> · {e.shown.kind}</span>}
                      {e.proposed && <div className="pc-dim">Proposed {rangeText(e.proposed)}</div>}
                    </td>
                    <td className="pa-ms-cell">
                      {e.milestoneIds.length
                        ? e.milestoneIds.map((id) => p.milestones.find((m) => m.id === id)?.name).join('; ')
                        : e.classification === 'time'
                          ? <span className="pc-st warn">Link required</span>
                          : '—'}
                      {e.moved.length > 0 && <div className="pc-st warn">Construction moved — review</div>}
                    </td>
                    <td>
                      <Status s={e.status} />
                    </td>
                    <td>{e.readiness.pct}%</td>
                    <td>{e.assignment}</td>
                    <td>
                      <button type="button" className="pa-btn sm" onClick={() => onEdit(e.id)} aria-label={`Manage ${e.code}`}>
                        <Pencil size={13} aria-hidden /> Manage
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>No episodes match this filter.</Empty>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
const HistoryLog: React.FC<{ p: PortalProduction }> = ({ p }) => {
  const rows = p.episodes.flatMap((e) => e.history.map((h) => ({ ...h, e }))).sort((a, b) => b.at.localeCompare(a.at));
  return (
    <div className="pa">
      <div className="pa-card">
        <div className="pa-sec-h">
          <h2>Schedule revision history</h2>
        </div>
        {rows.length ? (
          <div className="pa-tablewrap" style={{ display: 'block' }}>
            <table className="pa-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Episode</th>
                  <th>Change</th>
                  <th>Previous</th>
                  <th>Updated</th>
                  <th>By</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td>{new Date(r.at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</td>
                    <td>
                      {r.e.code} {r.e.title}
                    </td>
                    <td>
                      {r.action}
                      {r.note && <div className="pc-dim">{r.note}</div>}
                    </td>
                    <td>{r.from || '—'}</td>
                    <td>{r.to || '—'}</td>
                    <td>{r.by || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>No schedule revisions recorded yet.</Empty>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Write helpers
// ---------------------------------------------------------------------------
function useEditing() {
  const { isManager, canEdit, user, actions, register } = useCommand();
  const recs = useStore(episodeProductionStore);
  const recOf = (id: string): EpisodeProduction => recs.items.find((r) => r.id === id) || { id };
  const save = async (next: EpisodeProduction): Promise<boolean> => {
    try {
      const where = await episodeProductionStore.put({ ...next, updatedAt: nowIso(), updatedBy: user.name });
      if (where === 'local') actions.toast('Saved on this device only — the shared database refused the update (check that the latest Firestore rules are published).');
      return true;
    } catch (err) {
      actions.toast(`Not saved: ${err instanceof Error ? err.message : 'permission denied'}`);
      return false;
    }
  };
  const hist = (rec: EpisodeProduction, h: Omit<ProdChange, 'at' | 'by'>): ProdChange[] => [...(rec.history || []), { at: nowIso(), by: user.name, ...h }];
  const regOf = (id: string) => register.find((r) => r.id === episodeActivityId(id));
  const patchHelper = {
    /** Director / manager confirms a shoot date — also becomes the episode's target dates everywhere. */
    approve: async (e: PPEpisode, r: { start: string; end: string }, note: string | undefined, p: PortalProduction): Promise<boolean> => {
      const rec = recOf(e.id);
      const reg = regOf(e.id);
      const prev = e.confirmed || e.target;
      // the confirmation is made against the current construction dates: later moves are flagged for review
      const snap = alignmentSnapshot(p, e.id);
      const next: EpisodeProduction = {
        ...rec,
        ...(Object.keys(snap).length ? { alignedTo: snap, reviewedAt: nowIso(), reviewedBy: user.name } : {}),
        approval: { start: r.start, end: r.end, by: user.name, at: nowIso() },
        proposed: undefined,
        history: hist(rec, { action: 'Shoot date confirmed', from: prev ? rangeText(prev) : undefined, to: rangeText(r), note }),
      };
      delete next.proposed;
      if (!(await save(next))) return false;
      if (reg && (reg.start !== r.start || (reg.finish || reg.start) !== r.end || e.episodeStatus !== 'Scheduled'))
        await actions.patchActivity(reg, { start: r.start, finish: r.end, sourceStatus: 'Scheduled' });
      return true;
    },
    /** Production team proposes an alternative date (never confirms it). */
    propose: async (e: PPEpisode, r: { start: string; end: string }, note?: string): Promise<boolean> => {
      const rec = recOf(e.id);
      return save({
        ...rec,
        proposed: { start: r.start, end: r.end, by: user.name, at: nowIso(), ...(note ? { note } : {}) },
        history: hist(rec, { action: 'Alternative shoot date proposed', from: e.shown ? rangeText(e.shown) : undefined, to: rangeText(r), note }),
      });
    },
  };
  return { isManager, canEdit, user, actions, register, recOf, save, hist, regOf, patchHelper };
}

// ---------------------------------------------------------------------------
// Episode production editor
// ---------------------------------------------------------------------------
const EpisodeEditor: React.FC<{ p: PortalProduction; rec?: EpisodeProduction; id: string; onClose: () => void }> = ({ p, rec: stored, id, onClose }) => {
  const { isManager, canEdit, user, actions, save, hist, regOf, patchHelper } = useEditing();
  const e = p.episodes.find((x) => x.id === id)!;
  const reg = regOf(id);
  const base: EpisodeProduction = stored || { id };
  const [f, setF] = useState<EpisodeProduction>(() => JSON.parse(JSON.stringify(base)));
  const [links, setLinks] = useState<string[]>(e.linkAuto ? [] : e.milestoneIds);
  const [addMs, setAddMs] = useState('');
  const [director, setDirector] = useState(e.director || '');
  const [target, setTarget] = useState({ start: e.target?.start || '', end: e.target?.end || '' });
  const [alt, setAlt] = useState({ start: e.proposed?.start || '', end: e.proposed?.end || '', note: e.proposed?.note || '' });
  const [actual, setActual] = useState({ start: f.actualStart || '', end: f.actualEnd || '', complete: e.episodeStatus === 'Completed' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string[]>([]);
  const ro = !canEdit;
  const set = (patch: Partial<EpisodeProduction>) => setF((x) => ({ ...x, ...patch }));
  const castRec = (cid: string) => f.cast?.[cid] || {};
  const setCast = (cid: string, patch: { role?: string; availability?: CastAvailability }) => set({ cast: { ...(f.cast || {}), [cid]: { ...castRec(cid), ...patch } } });
  const setTeam = (role: TeamRole, patch: { name?: string; confirmed?: boolean }) => set({ team: { ...(f.team || {}), [role]: { name: '', ...(f.team?.[role] || {}), ...patch } } });
  const setCheck = (k: ChecklistKey, v: boolean) => set({ checklist: { ...(f.checklist || {}), [k]: v } });
  const msOptions = p.milestones.filter((m) => !links.includes(m.id));
  const linkChanged = JSON.stringify(links) !== JSON.stringify(e.linkAuto ? [] : e.milestoneIds);

  const saveAll = async () => {
    const errs: string[] = [];
    if (target.start && !isValidIso(target.start)) errs.push('Target start date is not valid.');
    if (target.end && target.start && target.end < target.start) errs.push('Target end date is before the start date.');
    if (actual.start && actual.end && actual.end < actual.start) errs.push('Actual end date is before the start date.');
    setMsg(errs);
    if (errs.length) return;
    setBusy(true);
    let next: EpisodeProduction = { ...f };
    // actual filming dates
    if ((actual.start || '') !== (base.actualStart || '') || (actual.end || '') !== (base.actualEnd || '')) {
      next.actualStart = actual.start || undefined;
      next.actualEnd = actual.end || undefined;
      if (!actual.start) delete next.actualStart;
      if (!actual.end) delete next.actualEnd;
      next.history = hist(next, { action: 'Actual filming date recorded', from: base.actualStart ? rangeText({ start: base.actualStart, end: base.actualEnd || base.actualStart }) : undefined, to: actual.start ? rangeText({ start: actual.start, end: actual.end || actual.start }) : 'cleared' });
    }
    if ((next.classification || '') !== (base.classification || '')) next.history = hist(next, { action: 'Classification changed', from: base.classification ? CLASS_LABEL[base.classification] : 'Automatic', to: next.classification ? CLASS_LABEL[next.classification] : 'Automatic' });
    if (!next.classification) delete next.classification;
    // manager-only keys stay exactly as stored for staff
    if (!isManager) {
      (['approval', 'directorConfirmed', 'alignedTo', 'reviewedAt', 'reviewedBy'] as const).forEach((k) => {
        if (base[k] === undefined) delete (next as any)[k];
        else (next as any)[k] = base[k];
      });
    }
    const ok = await save(JSON.parse(JSON.stringify(next)));
    // original records
    if (ok && reg) {
      const patch: Parameters<typeof actions.patchActivity>[1] = {};
      if (linkChanged) patch.dependsOn = links;
      if (isManager && director.trim() !== (e.director || '')) patch.owner = director.trim();
      if (isManager && target.start && (target.start !== (e.target?.start || '') || (target.end || target.start) !== (e.target?.end || ''))) {
        patch.start = target.start;
        patch.finish = target.end || target.start;
      }
      if (actual.complete !== (e.episodeStatus === 'Completed')) patch.sourceStatus = actual.complete ? 'Completed' : e.confirmed ? 'Scheduled' : 'For Confirmation';
      if (Object.keys(patch).length) await actions.patchActivity(reg, patch);
    }
    setBusy(false);
    if (ok) {
      actions.toast(`${e.code} production details saved`);
      onClose();
    }
  };

  const approve = async (r: { start: string; end: string }) => {
    setBusy(true);
    const ok = await patchHelper.approve(e, r, undefined, p);
    setBusy(false);
    if (ok) {
      actions.toast(`${e.code} shoot date confirmed for ${rangeText(r)}`);
      onClose();
    }
  };
  const propose = async () => {
    if (!isValidIso(alt.start)) return setMsg(['Enter the proposed start date.']);
    setBusy(true);
    const ok = await patchHelper.propose(e, { start: alt.start, end: alt.end || alt.start }, alt.note.trim() || undefined);
    setBusy(false);
    if (ok) {
      actions.toast(`${e.code}: alternative date proposed — awaiting director approval`);
      onClose();
    }
  };
  const revoke = async () => {
    setBusy(true);
    const next: EpisodeProduction = { ...base, history: hist(base, { action: 'Shoot date confirmation withdrawn', from: e.confirmed ? rangeText(e.confirmed) : undefined }) };
    delete next.approval;
    const ok = await save(next);
    if (ok && reg) await actions.patchActivity(reg, { sourceStatus: 'For Confirmation' });
    setBusy(false);
    if (ok) onClose();
  };
  const review = async () => {
    setBusy(true);
    const snap = alignmentSnapshot(p, e.id);
    const ok = await save({
      ...base,
      alignedTo: snap,
      reviewedAt: nowIso(),
      reviewedBy: user.name,
      history: hist(base, {
        action: 'Construction change reviewed — shoot date kept',
        from: e.moved.map((m) => `${m.name}: ${m.from || '—'}`).join('; ') || undefined,
        to: e.moved.map((m) => `${m.name}: ${m.to || '—'}`).join('; ') || undefined,
      }),
    });
    setBusy(false);
    if (ok) {
      actions.toast(`${e.code} reviewed against the current construction schedule`);
      onClose();
    }
  };

  return (
    <Modal
      title={
        <>
          {e.code} – {e.title}
        </>
      }
      sub={`${CLASS_LABEL[e.classification]}${e.classAuto ? ' (automatic)' : ''} · ${e.status} · readiness ${e.readiness.pct}%`}
      onClose={onClose}
      width={980}
      footer={
        <>
          <button type="button" className="cv-btn ghost" onClick={onClose}>
            Cancel
          </button>
          {!ro && (
            <button type="button" className="cv-btn primary" disabled={busy} onClick={saveAll}>
              Save production details
            </button>
          )}
        </>
      }
    >
      {msg.length > 0 && (
        <Banner kind="error">
          {msg.map((m) => (
            <div key={m}>{m}</div>
          ))}
        </Banner>
      )}
      <p className={`pa-reason ${e.light}`}>
        <i style={{ background: LIGHT[e.light].color }} /> {LIGHT[e.light].note} — {e.lightReason}
      </p>

      {e.moved.length > 0 && (
        <Banner kind="warn">
          <b>Construction schedule changed.</b> {e.moved.map((m) => `${m.name}: ${m.from || '—'} → ${m.to || '—'}`).join(' · ')}. The shoot date has not been moved.
          {isManager ? (
            <div style={{ marginTop: 8 }}>
              <button type="button" className="cv-btn sm" disabled={busy} onClick={review}>
                <ShieldCheck size={14} aria-hidden /> Reviewed — keep the current shoot date
              </button>{' '}
              <span className="cv-dim">or confirm a revised date below.</span>
            </div>
          ) : (
            <div className="cv-dim">A director or project manager reviews this change.</div>
          )}
        </Banner>
      )}

      <fieldset className="cv-fieldset" disabled={ro}>
        <legend>Schedule</legend>
        <div className="pa-dates full">
          <span>
            <b>Target</b> {e.target ? rangeText(e.target) : AWAITING}
          </span>
          {e.original && (
            <span>
              <b>Original</b> {rangeText(e.original)}
            </span>
          )}
          <span>
            <b>Projected from construction</b> {e.projected ? `${rangeText(e.projected)} (${e.projected.commitment === 'Actual' ? 'started' : e.projected.commitment.toLowerCase()})` : '—'}
          </span>
          <span>
            <b>Confirmed</b> {e.confirmed ? rangeText(e.confirmed) : 'Not yet confirmed'}
          </span>
        </div>
        {isManager && (
          <>
            <Field label="Target shoot start">
              <input type="date" className="cv-input" value={target.start} onChange={(ev) => setTarget({ ...target, start: ev.target.value })} />
            </Field>
            <Field label="Target shoot end">
              <input type="date" className="cv-input" value={target.end} min={target.start} onChange={(ev) => setTarget({ ...target, end: ev.target.value })} />
            </Field>
            <div className="full pa-approve">
              {e.proposed && (
                <button type="button" className="cv-btn sm primary" disabled={busy} onClick={() => approve({ start: e.proposed!.start, end: e.proposed!.end })}>
                  <CheckCircle2 size={14} aria-hidden /> Approve proposed date ({rangeText(e.proposed)})
                </button>
              )}
              {isValidIso(target.start) && (
                <button type="button" className="cv-btn sm" disabled={busy} onClick={() => approve({ start: target.start, end: target.end || target.start })}>
                  <ShieldCheck size={14} aria-hidden /> Confirm shoot date {rangeText({ start: target.start, end: target.end || target.start })}
                </button>
              )}
              {e.projected && !e.confirmed && (
                <span className="cv-dim">The projected construction date is shown for planning only — it is not confirmed until you confirm a shoot date.</span>
              )}
              {base.approval && (
                <button type="button" className="cv-btn sm ghost" disabled={busy} onClick={revoke}>
                  Withdraw confirmation
                </button>
              )}
            </div>
          </>
        )}
        <Field label="Propose alternative start" hint={isManager ? 'Or confirm directly above.' : 'A director confirms it.'}>
          <input type="date" className="cv-input" value={alt.start} onChange={(ev) => setAlt({ ...alt, start: ev.target.value })} />
        </Field>
        <Field label="Propose alternative end">
          <input type="date" className="cv-input" value={alt.end} min={alt.start} onChange={(ev) => setAlt({ ...alt, end: ev.target.value })} />
        </Field>
        <Field label="Reason / note" className="full">
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="cv-input" value={alt.note} onChange={(ev) => setAlt({ ...alt, note: ev.target.value })} placeholder="e.g. Column pouring moved to the following week" />
            <button type="button" className="cv-btn sm" disabled={busy || !alt.start} onClick={propose}>
              Propose
            </button>
          </div>
        </Field>
        <Field label="Actual filming start">
          <input type="date" className="cv-input" value={actual.start} onChange={(ev) => setActual({ ...actual, start: ev.target.value })} />
        </Field>
        <Field label="Actual filming end">
          <input type="date" className="cv-input" value={actual.end} min={actual.start} onChange={(ev) => setActual({ ...actual, end: ev.target.value })} />
        </Field>
        <label className="pa-chk full">
          <input type="checkbox" checked={actual.complete} onChange={(ev) => setActual({ ...actual, complete: ev.target.checked })} /> Shoot completed (marks the episode Completed in every module)
        </label>
        <Field label="Estimated filming duration">
          <input className="cv-input" value={f.duration || ''} onChange={(ev) => set({ duration: ev.target.value })} placeholder="e.g. 1 day, 4 hours" />
        </Field>
        <Field label="Production location">
          <input className="cv-input" value={e.location || ''} disabled title="Edited in the Episodes table" />
        </Field>
      </fieldset>

      <fieldset className="cv-fieldset" disabled={ro}>
        <legend>Episode & classification</legend>
        <Field label="Production classification">
          <select className="cv-select" value={f.classification || ''} onChange={(ev) => set({ classification: (ev.target.value || undefined) as ProdClass | undefined })}>
            <option value="">Automatic — {e.milestoneIds.length ? 'time-sensitive (linked to construction)' : 'non-time-sensitive'}</option>
            <option value="time">Time-sensitive (depends on construction)</option>
            <option value="flexible">Non-time-sensitive (film anytime)</option>
          </select>
        </Field>
        <Field label="Content category">
          <select className="cv-select" value={f.category || ''} onChange={(ev) => set({ category: ev.target.value || undefined })}>
            <option value="">{e.category} (default)</option>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Educational objective" className="full">
          <input className="cv-input" value={f.objective || ''} onChange={(ev) => set({ objective: ev.target.value })} placeholder={AWAITING} />
        </Field>
        <Field label="Episode description" className="full">
          <textarea className="cv-textarea" rows={2} value={f.description || ''} onChange={(ev) => set({ description: ev.target.value })} placeholder={e.topic || AWAITING} />
        </Field>
      </fieldset>

      <fieldset className="cv-fieldset" disabled={ro}>
        <legend>Construction milestones</legend>
        <div className="full">
          {links.length ? (
            <ul className="pa-msl">
              {links.map((lid) => {
                const m = p.milestones.find((x) => x.id === lid);
                return (
                  <li key={lid} className={m?.delayed ? 'late' : ''}>
                    <span>
                      <b>{m?.name || lid}</b>{' '}
                      <span className="pc-dim">
                        {m ? `${fmtRange(m.start, m.finish)} · ${m.delayed ? 'Delayed' : m.status} · ${m.confirmed ? 'confirmed' : 'projected'}` : ''}
                      </span>{' '}
                      <button type="button" className="cv-btn sm ghost" onClick={() => setLinks(links.filter((x) => x !== lid))} aria-label={`Remove ${m?.name || lid}`}>
                        Remove
                      </button>
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : e.linkAuto ? (
            <p className="cv-dim">
              Linked automatically from the scope of work: <b>{e.milestoneIds.map((x) => p.milestones.find((m) => m.id === x)?.name).join('; ')}</b>.{' '}
              <button type="button" className="cv-btn sm ghost" onClick={() => setLinks(e.milestoneIds)}>
                Keep these links
              </button>
            </p>
          ) : (
            <p className="cv-dim">No construction milestone linked.</p>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <select className="cv-select" value={addMs} onChange={(ev) => setAddMs(ev.target.value)} aria-label="Add construction milestone">
              <option value="">Add a construction milestone…</option>
              {msOptions.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} · {m.group} · {fmtRange(m.start, m.finish)}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="cv-btn sm"
              disabled={!addMs}
              onClick={() => {
                setLinks([...links, addMs]);
                setAddMs('');
              }}
            >
              Link
            </button>
          </div>
          <p className="cv-dim" style={{ marginTop: 6 }}>
            Links are saved as the episode's dependencies, so they also appear in the Gantt chart and the activity register.
          </p>
        </div>
      </fieldset>

      <fieldset className="cv-fieldset" disabled={ro}>
        <legend>Production team</legend>
        <Field label="Director">
          <input className="cv-input" value={director} onChange={(ev) => setDirector(ev.target.value)} disabled={!isManager} />
        </Field>
        <label className="pa-chk">
          <input type="checkbox" checked={!!f.directorConfirmed} disabled={!isManager} onChange={(ev) => set({ directorConfirmed: ev.target.checked })} /> Director confirmed
        </label>
        {TEAM_ROLES.map((t) => (
          <div key={t.id} className="pa-team-row full">
            <Field label={`${t.label}${t.required ? ' *' : ''}`}>
              <input className="cv-input" value={f.team?.[t.id]?.name || ''} onChange={(ev) => setTeam(t.id, { name: ev.target.value })} />
            </Field>
            <label className="pa-chk">
              <input type="checkbox" checked={!!f.team?.[t.id]?.confirmed} disabled={!f.team?.[t.id]?.name} onChange={(ev) => setTeam(t.id, { confirmed: ev.target.checked })} /> Confirmed
            </label>
          </div>
        ))}
      </fieldset>

      <fieldset className="cv-fieldset" disabled={ro}>
        <legend>Characters</legend>
        {e.cast.length ? (
          <div className="full pa-cast-ed">
            {e.cast.map((c) => (
              <div key={c.id} className="pa-cast-row">
                <b>{c.name}</b>
                <input className="cv-input" aria-label={`${c.name} role`} placeholder="Role in the episode" value={castRec(c.id).role || ''} onChange={(ev) => setCast(c.id, { role: ev.target.value })} />
                <select className="cv-select" aria-label={`${c.name} availability`} value={castRec(c.id).availability || 'Pending'} onChange={(ev) => setCast(c.id, { availability: ev.target.value as CastAvailability })}>
                  <option>Pending</option>
                  <option>Available</option>
                  <option>Unavailable</option>
                </select>
              </div>
            ))}
          </div>
        ) : (
          <p className="cv-dim full">No characters are assigned to this episode.</p>
        )}
        <p className="cv-dim full">Characters are assigned to episodes in Production Monitoring → Episodes table.</p>
      </fieldset>

      <fieldset className="cv-fieldset" disabled={ro}>
        <legend>Production checklist</legend>
        <ul className="pa-check full">
          {CHECKLIST.map((c) => {
            const live = e.checklist.find((x) => x.id === c.id)!;
            const auto = !!c.auto;
            return (
              <li key={c.id} className={live.done ? 'done' : ''}>
                {auto || live.na ? (
                  <>
                    {live.done ? <CheckCircle2 size={16} aria-hidden /> : <Circle size={16} aria-hidden />}
                    <span>{c.label}</span>
                    <span className="pc-dim">{live.na ? 'not applicable' : `automatic — ${c.auto}`}</span>
                  </>
                ) : (
                  <label className="pa-chk">
                    <input type="checkbox" checked={!!f.checklist?.[c.id]} onChange={(ev) => setCheck(c.id, ev.target.checked)} /> {c.label}
                  </label>
                )}
              </li>
            );
          })}
        </ul>
      </fieldset>

      {e.history.length > 0 && (
        <fieldset className="cv-fieldset">
          <legend>History</legend>
          <ul className="pa-hist full">
            {e.history.slice(0, 10).map((h, i) => (
              <li key={i}>
                <span className="pc-dim">{new Date(h.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                <b>{h.action}</b>
                {(h.from || h.to) && (
                  <span>
                    {h.from || '—'} → {h.to || '—'}
                  </span>
                )}
                {h.by && <span className="pc-dim">by {h.by}</span>}
              </li>
            ))}
          </ul>
        </fieldset>
      )}
    </Modal>
  );
};
