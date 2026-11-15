/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * DAILY SITE REPORT — one screen for site personnel to report from the field:
 * activity, accomplishment %, site remarks, manpower, material deliveries and
 * photographs (camera capture where the phone supports it).
 *
 * Reliability rules:
 *  - "Submitted" is shown only after the shared database confirms every step.
 *  - Anything not confirmed is clearly marked "Saved on this device" with Retry.
 *  - One report per person, date and activity (deterministic ID) — no duplicates.
 *  - The accomplishment % is applied to the activity in the Master Project
 *    Tracker through the same update path as the activity editor.
 */

import React, { useMemo, useState } from 'react';
import { Camera, ImagePlus, Plus, Trash2, CheckCircle2, CloudOff, RefreshCw, Users, Truck, FileText } from 'lucide-react';
import { useCommand } from './context.tsx';
import { Banner, Card, Empty, Field, SyncChip, SYNC_LABEL } from './ui.tsx';
import { useStore } from '../firebase/useStore.ts';
import { siteReportStore, documentStore } from '../firebase/opsStores.ts';
import { uploadFile } from '../firebase/files.ts';
import { newId } from '../firebase/collectionStore.ts';
import { siteReportId, validateSiteReport, progressEditable, type SiteReportForm } from '../domain/siteReport.ts';
import { isConstructionItem } from '../domain/categories.ts';
import { fmtDate } from '../domain/dates.ts';
import { statusLabel } from './ui.tsx';
import type { SiteReport as SiteReportRec, ProjectDocument } from '../types/index.ts';
import { PROJECT_NAME } from '../domain/portal.ts';

type Outcome = { kind: 'confirmed' | 'device' | 'error'; lines: string[]; reportId?: string } | null;

const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T | 'timeout'> =>
  Promise.race([p, new Promise<'timeout'>((r) => setTimeout(() => r('timeout'), ms))]);

export const SiteReport: React.FC = () => {
  const { register, today, user, canEdit, isManager, actions, dataSync } = useCommand();
  const reports = useStore(siteReportStore);
  const blank = (): SiteReportForm => ({ date: today, activityId: '', progress: 0, remarks: '', manpower: [], deliveries: [] });
  const [f, setF] = useState<SiteReportForm>(blank);
  const [q, setQ] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [showAll, setShowAll] = useState(false);

  const activities = useMemo(
    () =>
      register
        .filter((r) => isConstructionItem(r) && r.status !== 'Completed')
        .sort((a, b) => (a.status === 'Delayed' ? -1 : 0) - (b.status === 'Delayed' ? -1 : 0) || (a.start || '9999').localeCompare(b.start || '9999')),
    [register]
  );
  const shown = activities.filter((r) => !q || `${r.name} ${r.workstream} ${r.id}`.toLowerCase().includes(q.toLowerCase()));
  const act = register.find((r) => r.id === f.activityId);
  const set = (p: Partial<SiteReportForm>) => setF((x) => ({ ...x, ...p }));

  const pick = (id: string) => {
    const r = register.find((x) => x.id === id);
    set({ activityId: id, progress: r ? r.progress : 0 });
  };

  const submit = async () => {
    const errs = validateSiteReport(f, act, today);
    setErrors(errs);
    if (errs.length || !act || busy) return;
    setBusy(true);
    setOutcome(null);
    const lines: string[] = [];
    let allConfirmed = true;
    try {
      // 1. Photographs → Document Repository (linked to the activity)
      const photoDocIds: string[] = [];
      for (const file of photos) {
        const up = await uploadFile('documents', file);
        const now = new Date().toISOString();
        const doc: ProjectDocument = {
          id: newId('DOC'),
          title: `Site photo — ${act.name} — ${fmtDate(f.date)}`,
          category: 'Site photo',
          date: f.date,
          url: up.url,
          storagePath: up.storagePath,
          fileName: file.name,
          contentType: up.contentType,
          size: up.size,
          linkedActivityId: act.id,
          createdAt: now,
          createdBy: user.name,
          updatedAt: now,
          updatedBy: user.name,
        };
        const res = await documentStore.put(doc);
        if (res !== 'shared') allConfirmed = false;
        photoDocIds.push(doc.id);
      }
      if (photos.length) lines.push(`${photos.length} photo(s) uploaded to the Document Repository`);

      // 2. Accomplishment % → Master Project Tracker (same path as the activity editor)
      let progressApplied = false;
      if (progressEditable(act) && f.progress !== act.progress) {
        const ok = await withTimeout(actions.patchActivity(act, { progress: f.progress }), 15000);
        progressApplied = ok === true;
        if (ok === 'timeout') {
          allConfirmed = false;
          lines.push(`Accomplishment ${f.progress}% is waiting to reach the shared database`);
        } else if (ok) lines.push(`Accomplishment updated from ${act.progress}% to ${f.progress}%`);
        else {
          allConfirmed = false;
          lines.push('Accomplishment could not be updated');
        }
      } else progressApplied = !progressEditable(act) ? false : true;

      // 3. The daily report record
      const rec: SiteReportRec = {
        id: siteReportId(f.date, act.id, user.id),
        date: f.date,
        project: PROJECT_NAME,
        activityId: act.id,
        activityName: act.name,
        progressBefore: act.progress,
        progressAfter: progressEditable(act) ? f.progress : act.progress,
        progressApplied,
        remarks: f.remarks.trim(),
        manpower: f.manpower.map((m) => ({ trade: m.trade.trim(), headcount: m.headcount })),
        deliveries: f.deliveries.map((d) => ({ material: d.material.trim(), quantity: d.quantity.trim(), ...(d.supplier?.trim() ? { supplier: d.supplier.trim() } : {}) })),
        photoDocIds,
        submittedBy: user.name,
        submittedById: user.id,
        submittedAt: new Date().toISOString(),
      };
      const res = await siteReportStore.put(rec);
      if (res !== 'shared') allConfirmed = false;
      lines.unshift(res === 'shared' ? 'Daily site report confirmed by the shared database' : 'Daily site report saved on this device only');
      setOutcome({ kind: allConfirmed ? 'confirmed' : 'device', lines, reportId: rec.id });
      if (allConfirmed) {
        setF({ ...blank(), date: f.date });
        setPhotos([]);
        setQ('');
      }
    } catch (e) {
      setOutcome({ kind: 'error', lines: [e instanceof Error ? e.message : 'The report could not be submitted.', 'Nothing was marked as submitted. Check the connection and press Submit again — it will not create a duplicate.'] });
    } finally {
      setBusy(false);
    }
  };

  const retry = async (r: SiteReportRec) => {
    const a = register.find((x) => x.id === r.activityId);
    if (a && progressEditable(a) && !r.progressApplied && a.progress !== r.progressAfter) {
      const ok = await withTimeout(actions.patchActivity(a, { progress: r.progressAfter }), 15000);
      if (ok === true) await siteReportStore.put({ ...r, progressApplied: true });
    }
    const n = await siteReportStore.syncLocal();
    actions.toast(n ? 'Report confirmed by the shared database' : 'Still not confirmed — the shared database cannot be reached');
  };

  const mine = reports.items.filter((r) => showAll && isManager ? true : r.submittedById === user.id).slice(0, 30);

  return (
    <div className="cv-grid sr" style={{ gap: 14 }}>
      {dataSync.state !== 'live' && (
        <Banner kind="warn">
          <b>{SYNC_LABEL[dataSync.state]?.label}.</b> Reports are kept on this device and marked “Saved on this device” until the shared database confirms them.
        </Banner>
      )}
      {!canEdit ? (
        <Banner kind="info">Read-only access: daily site reports are submitted by site personnel.</Banner>
      ) : (
        <Card title="Daily Site Report" note="Report today's progress from the site. Fields marked * are required." actions={<SyncChip state={dataSync.state} />}>
          <div className="sr-form">
            <Field label="Project *">
              <select className="cv-select" value={PROJECT_NAME} disabled>
                <option>{PROJECT_NAME}</option>
              </select>
            </Field>
            <Field label="Report date *">
              <input type="date" className="cv-input" value={f.date} max={today} onChange={(e) => set({ date: e.target.value })} />
            </Field>
            <Field label="Construction activity *" className="sr-full">
              <input className="cv-input" type="search" placeholder="Search activities" value={q} onChange={(e) => setQ(e.target.value)} />
              <select className="cv-select" value={f.activityId} onChange={(e) => pick(e.target.value)} size={1}>
                <option value="">Choose an activity ({shown.length})</option>
                {shown.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.status === 'Delayed' ? '⚠ ' : ''}
                    {r.name} · {r.workstream}
                  </option>
                ))}
              </select>
            </Field>
            {act && (
              <div className="sr-act sr-full">
                <b>{act.name}</b>
                <span>
                  {act.id} · {act.workstream} · {statusLabel(act.status)} · target {fmtDate(act.finish)} · recorded {act.progress}%
                </span>
              </div>
            )}
            {act && progressEditable(act) && (
              <Field label={`Accomplishment: ${f.progress}%`} className="sr-full" hint={`Recorded: ${act.progress}% · planned today ${act.plannedProgress}%`}>
                <input type="range" min={0} max={100} step={5} value={f.progress} onChange={(e) => set({ progress: Number(e.target.value) })} className="sr-range" aria-label="Accomplishment percentage" />
                <div className="sr-steps">
                  {[act.progress, 25, 50, 75, 100]
                    .filter((v, i, arr) => arr.indexOf(v) === i)
                    .map((v) => (
                      <button key={v} type="button" className={`sr-chip ${f.progress === v ? 'on' : ''}`} onClick={() => set({ progress: v })}>
                        {v}%
                      </button>
                    ))}
                  <input type="number" inputMode="numeric" min={0} max={100} className="cv-input sr-num" value={f.progress} onChange={(e) => set({ progress: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} aria-label="Accomplishment percentage" />
                </div>
              </Field>
            )}
            {act && !progressEditable(act) && (
              <div className="sr-full cv-dim" style={{ fontSize: 13 }}>
                This item is updated by status, not percentage.{' '}
                <button type="button" className="cv-linkbtn" onClick={() => actions.openActivity(act.id)}>
                  Update its status
                </button>
                . Remarks, manpower, deliveries and photos are still recorded in this report.
              </div>
            )}
            <Field label="Site remarks" className="sr-full">
              <textarea className="cv-textarea" rows={3} value={f.remarks} onChange={(e) => set({ remarks: e.target.value })} placeholder="Work done today, problems, weather, next steps" />
            </Field>

            <div className="sr-full sr-block">
              <div className="sr-block-h">
                <Users size={16} aria-hidden /> Manpower
                <button type="button" className="cv-btn sm" onClick={() => set({ manpower: [...f.manpower, { trade: '', headcount: 1 }] })}>
                  <Plus size={14} aria-hidden /> Add New
                </button>
              </div>
              {f.manpower.map((m, i) => (
                <div key={i} className="sr-row">
                  <input className="cv-input" placeholder="Trade / crew (e.g. Masons)" value={m.trade} onChange={(e) => set({ manpower: f.manpower.map((x, j) => (j === i ? { ...x, trade: e.target.value } : x)) })} />
                  <input className="cv-input sr-num" type="number" inputMode="numeric" min={0} value={m.headcount} aria-label="Headcount" onChange={(e) => set({ manpower: f.manpower.map((x, j) => (j === i ? { ...x, headcount: Math.max(0, Math.round(Number(e.target.value) || 0)) } : x)) })} />
                  <button type="button" className="cv-btn ghost sm" aria-label="Delete row" onClick={() => set({ manpower: f.manpower.filter((_, j) => j !== i) })}>
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>

            <div className="sr-full sr-block">
              <div className="sr-block-h">
                <Truck size={16} aria-hidden /> Material deliveries
                <button type="button" className="cv-btn sm" onClick={() => set({ deliveries: [...f.deliveries, { material: '', quantity: '' }] })}>
                  <Plus size={14} aria-hidden /> Add New
                </button>
              </div>
              {f.deliveries.map((d, i) => (
                <div key={i} className="sr-row">
                  <input className="cv-input" placeholder="Material" value={d.material} onChange={(e) => set({ deliveries: f.deliveries.map((x, j) => (j === i ? { ...x, material: e.target.value } : x)) })} />
                  <input className="cv-input sr-qty" placeholder="Quantity" value={d.quantity} onChange={(e) => set({ deliveries: f.deliveries.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)) })} />
                  <button type="button" className="cv-btn ghost sm" aria-label="Delete row" onClick={() => set({ deliveries: f.deliveries.filter((_, j) => j !== i) })}>
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>

            <div className="sr-full sr-block">
              <div className="sr-block-h">
                <Camera size={16} aria-hidden /> Site photographs
              </div>
              <div className="sr-photo-btns">
                <label className="cv-btn">
                  <Camera size={16} aria-hidden /> Take Photo
                  <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => e.target.files && setPhotos([...photos, ...Array.from(e.target.files)])} />
                </label>
                <label className="cv-btn">
                  <ImagePlus size={16} aria-hidden /> Choose Photos
                  <input type="file" accept="image/*" multiple hidden onChange={(e) => e.target.files && setPhotos([...photos, ...Array.from(e.target.files)])} />
                </label>
              </div>
              {photos.length > 0 && (
                <div className="sr-thumbs">
                  {photos.map((p, i) => (
                    <div key={i} className="sr-thumb">
                      <img src={URL.createObjectURL(p)} alt={p.name} />
                      <button type="button" aria-label="Remove photo" onClick={() => setPhotos(photos.filter((_, j) => j !== i))}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          {errors.length > 0 && (
            <Banner kind="error">
              {errors.map((e) => (
                <div key={e}>{e}</div>
              ))}
            </Banner>
          )}
          {outcome && (
            <div className={`sr-outcome ${outcome.kind}`} role="status">
              {outcome.kind === 'confirmed' ? <CheckCircle2 size={20} aria-hidden /> : <CloudOff size={20} aria-hidden />}
              <div>
                <b>{outcome.kind === 'confirmed' ? 'Submitted' : outcome.kind === 'device' ? 'Saved on this device — not yet submitted' : 'Not submitted'}</b>
                {outcome.lines.map((l) => (
                  <div key={l}>{l}</div>
                ))}
              </div>
            </div>
          )}
          <button type="button" className="cv-btn primary sr-submit" onClick={submit} disabled={busy}>
            {busy ? 'Submitting…' : 'Submit Daily Report'}
          </button>
        </Card>
      )}

      <Card
        title={showAll && isManager ? 'All daily site reports' : 'My daily site reports'}
        note="Confirmed = stored in the shared database · Saved on this device = waiting to sync"
        actions={
          isManager && (
            <button type="button" className="cv-btn sm" onClick={() => setShowAll((v) => !v)}>
              {showAll ? 'Show Mine' : 'Show All'}
            </button>
          )
        }
      >
        {mine.length ? (
          <ul className="sr-list">
            {mine.map((r) => (
              <li key={r.id}>
                <div>
                  <b>{r.activityName}</b>
                  <span>
                    {fmtDate(r.date)} · {r.progressBefore}% → {r.progressAfter}%{r.manpower.length ? ` · ${r.manpower.reduce((a, m) => a + m.headcount, 0)} workers` : ''}
                    {r.deliveries.length ? ` · ${r.deliveries.length} deliveries` : ''}
                    {r.photoDocIds.length ? ` · ${r.photoDocIds.length} photos` : ''}
                    {showAll ? ` · ${r.submittedBy}` : ''}
                  </span>
                  {r.remarks && <em>{r.remarks}</em>}
                </div>
                {r.localOnly ? (
                  <button type="button" className="sr-state device" onClick={() => retry(r)}>
                    <RefreshCw size={13} aria-hidden /> Saved on this device · Retry
                  </button>
                ) : (
                  <span className="sr-state ok">
                    <CheckCircle2 size={13} aria-hidden /> Confirmed
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <Empty>
            <FileText size={18} aria-hidden /> No daily site reports yet.
          </Empty>
        )}
      </Card>
    </div>
  );
};
