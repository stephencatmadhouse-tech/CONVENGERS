/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * 3D CONSTRUCTION JOURNEY MANAGEMENT
 * Administrators configure the client-facing construction stages: names,
 * order, descriptions, illustrations, visibility, client remarks and the
 * activities each stage represents. Stage progress, status and dates are
 * NEVER entered here — they are calculated live from the linked activities in
 * the Master Project Tracker and reach clients with the next published
 * project status update.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { ArrowUp, ArrowDown, Eye, EyeOff, Link2, Plus, Trash2, Upload, RotateCcw, Image as ImageIcon } from 'lucide-react';
import { useCommand } from './context.tsx';
import { Banner, Card, ConfirmDialog, Empty, Field, Modal, StatusPill } from './ui.tsx';
import { clientConfigStore } from '../firebase/opsStores.ts';
import { useClientConfig } from '../firebase/useClientConfig.ts';
import { uploadFile } from '../firebase/files.ts';
import { computeJourney, defaultJourney, newStageId, sortedStages, type JourneyConfig, type JourneyStage } from '../domain/journey.ts';
import { clientStatus, type PortalJourney } from '../domain/portal.ts';
import { isConstructionItem } from '../domain/categories.ts';
import { fmtDate } from '../domain/dates.ts';
import { JourneyViewer, StageArt } from '../portal/Journey.tsx';
import { firestoreData } from '../firebase/firestoreData.ts';

export const JourneyManagement: React.FC = () => {
  const { register, today, isManager, user, actions } = useCommand();
  const cfg = useClientConfig();
  const [draft, setDraft] = useState<JourneyConfig | null>(null);
  const [linking, setLinking] = useState<JourneyStage | null>(null);
  const [confirm, setConfirm] = useState<{ kind: 'reset' } | { kind: 'delete'; id: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const cur = draft || cfg.journey;
  const dirty = !!draft;
  const editable = isManager;

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const live = useMemo(() => computeJourney(cur, register, today, true), [cur, register, today]);
  const preview: PortalJourney = useMemo(
    () => ({
      sheetUrl: cur.sheetUrl,
      sheetCols: cur.sheetCols || 3,
      sheetRows: cur.sheetRows || 3,
      stages: live
        .filter((s) => s.visible)
        .map((s, i) => ({
          id: s.id,
          index: i,
          name: s.name,
          description: s.description,
          progress: s.progress,
          planned: s.planned,
          status: clientStatus(s.status === 'In Progress' ? 'Ongoing' : s.status),
          start: s.start,
          finish: s.finish,
          actualFinish: s.actualFinish,
          remark: s.remark,
          imageUrl: s.imageUrl,
          activities: s.activities.map((a) => ({ name: a.name, status: clientStatus(a.status), finish: a.finish })),
        })),
    }),
    [cur, live]
  );

  const update = (fn: (c: JourneyConfig) => JourneyConfig) => setDraft(fn(structuredClone(cur)));
  const updateStage = (id: string, patch: Partial<JourneyStage>) => update((c) => ({ ...c, stages: c.stages.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));
  const move = (id: string, dir: -1 | 1) =>
    update((c) => {
      const list = sortedStages(c);
      const i = list.findIndex((s) => s.id === id);
      const j = i + dir;
      if (j < 0 || j >= list.length) return c;
      [list[i], list[j]] = [list[j], list[i]];
      return { ...c, stages: list.map((s, k) => ({ ...s, order: k + 1 })) };
    });
  const addStage = () =>
    update((c) => ({
      ...c,
      stages: [...sortedStages(c), { id: newStageId(), order: c.stages.length + 1, name: 'New stage', description: '', visible: false, activityIds: [] }],
    }));

  const save = async () => {
    const names = cur.stages.map((s) => s.name.trim());
    if (names.some((n) => !n)) return actions.toast('Every stage needs a name.');
    setBusy(true);
    try {
      const rec: JourneyConfig = { ...cur, id: 'journey', stages: sortedStages(cur).map((s, i) => ({ ...s, name: s.name.trim(), order: i + 1 })), updatedAt: new Date().toISOString(), updatedBy: user.name };
      const res = await clientConfigStore.put(rec as any);
      await firestoreData.logAudit(user, 'UPDATE_CONSTRUCTION_JOURNEY', 'ClientConfig', 'journey', `${rec.stages.length} stages`);
      setDraft(null);
      actions.toast(res === 'shared' ? 'Construction journey saved. Publish a project status update to show it to clients.' : 'Saved on this device only — deploy the updated Firestore rules (clientConfig).');
    } catch (e) {
      actions.toast(e instanceof Error ? e.message : 'Could not save the construction journey.');
    } finally {
      setBusy(false);
    }
  };

  const upload = async (file: File | null, apply: (url: string) => void) => {
    if (!file) return;
    setBusy(true);
    try {
      // Reference illustrations are client-facing artwork: managers upload them as published
      const up = await uploadFile('portal', file, { kind: 'illustration', publish: true, folderKey: 'supporting', subfolder: 'Construction Journey Illustrations' });
      apply(up.url);
      actions.toast('Illustration uploaded to Google Drive. Save Changes to keep it.');
    } catch (e) {
      actions.toast(e instanceof Error ? e.message : 'Upload failed — paste an image link instead.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="cv-grid" style={{ gap: 16 }}>
      {!cfg.shared && cfg.loaded && (
        <Banner kind="warn">
          The shared database is refusing the client experience settings, so changes are saved on this device only and clients will not see them. An administrator
          needs to publish the latest <code>firestore.rules</code> (it includes the <code>clientConfig</code> rule) in the Firebase console.
        </Banner>
      )}
      <Card
        title="How the construction journey works"
        note="Master Project Tracker → activities → construction stage → 3D Construction Journey → client dashboard"
        actions={
          editable && (
            <>
              {dirty && (
                <button type="button" className="cv-btn ghost sm" onClick={() => setDraft(null)}>
                  Cancel
                </button>
              )}
              <button type="button" className="cv-btn primary sm" onClick={save} disabled={!dirty || busy}>
                Save Changes
              </button>
            </>
          )
        }
      >
        <div className="cv-sub" style={{ marginTop: 0 }}>
          Stage progress, status and dates are calculated automatically from the linked activities using the same weights as the overall Actual Progress — they are never
          typed in here. Edit the stage names, order, descriptions, illustrations and links below, then publish a project status update in{' '}
          <button type="button" className="cv-linkbtn" onClick={() => actions.navigate('publishing/snapshot')}>
            Client Portal Management
          </button>{' '}
          to show the changes to clients.
        </div>
        {!editable && <Banner kind="info">Read-only: stages are configured by the System Administrator or a Project Manager.</Banner>}
      </Card>

      <Card title="Stage illustrations" note="Upload the nine-stage isometric sheet once (stages are read from its grid in order), or set an image per stage below.">
        <div className="jm-sheet">
          <div className="jm-sheet-prev">
            {cur.sheetUrl ? <img src={cur.sheetUrl} alt="Stage illustration sheet" /> : <div className="jm-empty-art"><ImageIcon size={22} aria-hidden /> No sheet uploaded — placeholder drawings are shown</div>}
          </div>
          <div className="cv-grid" style={{ gap: 10 }}>
            <Field label="Upload stage sheet (PNG or JPG)">
              <input type="file" accept="image/*" className="cv-input" disabled={!editable || busy} onChange={(e) => upload(e.target.files?.[0] || null, (url) => update((c) => ({ ...c, sheetUrl: url })))} />
            </Field>
            <Field label="…or image link">
              <input className="cv-input" value={cur.sheetUrl || ''} disabled={!editable} onChange={(e) => update((c) => ({ ...c, sheetUrl: e.target.value.trim() || undefined }))} />
            </Field>
            <div className="cv-row">
              <Field label="Columns">
                <input type="number" min={1} max={6} className="cv-input" style={{ width: 90 }} value={cur.sheetCols || 3} disabled={!editable} onChange={(e) => update((c) => ({ ...c, sheetCols: Math.max(1, Math.min(6, Number(e.target.value) || 3)) }))} />
              </Field>
              <Field label="Rows">
                <input type="number" min={1} max={6} className="cv-input" style={{ width: 90 }} value={cur.sheetRows || 3} disabled={!editable} onChange={(e) => update((c) => ({ ...c, sheetRows: Math.max(1, Math.min(6, Number(e.target.value) || 3)) }))} />
              </Field>
            </div>
          </div>
        </div>
      </Card>

      <Card
        title={`Construction stages · ${cur.stages.length}`}
        note="Hidden stages are not shown to clients. Stages with no linked activities show “Pending update”."
        actions={
          editable && (
            <>
              <button type="button" className="cv-btn sm" onClick={() => setConfirm({ kind: 'reset' })}>
                <RotateCcw size={14} aria-hidden /> Reset to Default Stages
              </button>
              <button type="button" className="cv-btn sm" onClick={addStage}>
                <Plus size={14} aria-hidden /> Add New Stage
              </button>
            </>
          )
        }
      >
        <div className="jm-list">
          {sortedStages(cur).map((s, i) => {
            const v = live.find((x) => x.id === s.id)!;
            return (
              <div key={s.id} className={`jm-row ${s.visible ? '' : 'hidden'}`}>
                <div className="jm-art">
                  <StageArt stage={{ index: i, name: s.name, imageUrl: s.imageUrl }} journey={{ sheetUrl: cur.sheetUrl, sheetCols: cur.sheetCols, sheetRows: cur.sheetRows }} />
                  <span className="jm-num">{String(i + 1).padStart(2, '0')}</span>
                </div>
                <div className="jm-main">
                  <div className="jm-line">
                    <input className="cv-input jm-name" aria-label="Stage name" value={s.name} disabled={!editable} onChange={(e) => updateStage(s.id, { name: e.target.value })} />
                    <StatusPill status={v.status === 'In Progress' ? 'Ongoing' : v.status === 'Upcoming' ? 'Upcoming' : v.status} />
                  </div>
                  <textarea className="cv-textarea" rows={2} aria-label="Client-facing description" placeholder="Client-facing description" value={s.description} disabled={!editable} onChange={(e) => updateStage(s.id, { description: e.target.value })} />
                  <div className="jm-facts">
                    <span>
                      <b>{v.progress === null ? 'Pending update' : `${v.progress.toFixed(1)}%`}</b> actual
                      {v.planned !== null ? ` · ${v.planned.toFixed(1)}% planned` : ''}
                    </span>
                    <span>{v.start ? `${fmtDate(v.start)} → ${fmtDate(v.finish)}` : 'No dated activities linked'}</span>
                    <span>
                      {v.activities.length} {s.activityIds?.length ? 'selected' : 'auto-linked'} activit{v.activities.length === 1 ? 'y' : 'ies'}
                    </span>
                  </div>
                  <textarea className="cv-textarea" rows={1} aria-label="Approved client remark" placeholder="Approved client remark (optional)" value={s.clientRemark || ''} disabled={!editable} onChange={(e) => updateStage(s.id, { clientRemark: e.target.value })} />
                  <div className="jm-actions">
                    <button type="button" className="cv-btn sm" onClick={() => setLinking(s)} disabled={!editable}>
                      <Link2 size={14} aria-hidden /> Link Activities
                    </button>
                    <label className={`cv-btn sm ${!editable ? 'disabled' : ''}`}>
                      <Upload size={14} aria-hidden /> Stage Image
                      <input type="file" accept="image/*" hidden disabled={!editable || busy} onChange={(e) => upload(e.target.files?.[0] || null, (url) => updateStage(s.id, { imageUrl: url }))} />
                    </label>
                    {s.imageUrl && editable && (
                      <button type="button" className="cv-btn ghost sm" onClick={() => updateStage(s.id, { imageUrl: undefined })}>
                        Remove Image
                      </button>
                    )}
                    <button type="button" className="cv-btn ghost sm" onClick={() => updateStage(s.id, { visible: !s.visible })} disabled={!editable} aria-pressed={s.visible}>
                      {s.visible ? <Eye size={14} aria-hidden /> : <EyeOff size={14} aria-hidden />} {s.visible ? 'Visible to Clients' : 'Hidden'}
                    </button>
                    <span className="jm-spacer" />
                    <button type="button" className="cv-btn ghost sm" aria-label="Move up" onClick={() => move(s.id, -1)} disabled={!editable || i === 0}>
                      <ArrowUp size={14} />
                    </button>
                    <button type="button" className="cv-btn ghost sm" aria-label="Move down" onClick={() => move(s.id, 1)} disabled={!editable || i === cur.stages.length - 1}>
                      <ArrowDown size={14} />
                    </button>
                    <button type="button" className="cv-btn ghost sm" aria-label="Delete stage" onClick={() => setConfirm({ kind: 'delete', id: s.id })} disabled={!editable}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card
        title="Client presentation preview"
        note="Live figures from the Master Project Tracker. Clients see the figures of the latest published project status update."
        actions={
          <button type="button" className="cv-btn sm" onClick={() => setShowPreview((v) => !v)}>
            {showPreview ? 'Hide Preview' : 'Preview Client Presentation'}
          </button>
        }
      >
        {showPreview ? <JourneyViewer journey={preview} asOf={`live preview · ${fmtDate(today)}`} /> : <Empty>Preview hidden.</Empty>}
      </Card>

      {linking && (
        <LinkModal
          stage={linking}
          onClose={() => setLinking(null)}
          onApply={(ids) => {
            updateStage(linking.id, { activityIds: ids.length ? ids : undefined });
            setLinking(null);
          }}
          autoIds={live.find((x) => x.id === linking.id)?.activityIds || []}
        />
      )}
      {confirm?.kind === 'reset' && (
        <ConfirmDialog
          title="Reset to the default nine stages?"
          message="Stage names, order, descriptions, links and per-stage images are replaced by the default nine-stage sequence. The uploaded stage sheet is kept. Nothing changes until you Save Changes."
          confirmLabel="Reset"
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            setDraft({ ...defaultJourney(), sheetUrl: cur.sheetUrl, sheetCols: cur.sheetCols, sheetRows: cur.sheetRows });
            setConfirm(null);
          }}
        />
      )}
      {confirm?.kind === 'delete' && (
        <ConfirmDialog
          title="Delete this stage?"
          message="The stage is removed from the client journey. Its activities are not changed. Nothing changes until you Save Changes."
          confirmLabel="Delete"
          danger
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            const id = confirm.id;
            update((c) => ({ ...c, stages: sortedStages(c).filter((s) => s.id !== id).map((s, k) => ({ ...s, order: k + 1 })) }));
            setConfirm(null);
          }}
        />
      )}
    </div>
  );
};

const LinkModal: React.FC<{ stage: JourneyStage; autoIds: string[]; onClose: () => void; onApply: (ids: string[]) => void }> = ({ stage, autoIds, onClose, onApply }) => {
  const { register } = useCommand();
  const [ids, setIds] = useState<Set<string>>(new Set(stage.activityIds?.length ? stage.activityIds : autoIds));
  const [q, setQ] = useState('');
  const items = register.filter((r) => isConstructionItem(r) && (!q || `${r.id} ${r.name} ${r.workstream} ${r.category}`.toLowerCase().includes(q.toLowerCase())));
  const toggle = (id: string) =>
    setIds((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  return (
    <Modal
      title={`Link Activities · ${stage.name}`}
      sub={stage.activityIds?.length ? 'This stage uses the selected activities.' : 'This stage currently uses automatic links (shown pre-selected). Saving a selection switches it to the selected activities.'}
      onClose={onClose}
      width={760}
      footer={
        <>
          {!!stage.activityIds?.length && (
            <button type="button" className="cv-btn ghost" onClick={() => onApply([])}>
              Use Automatic Links
            </button>
          )}
          <button type="button" className="cv-btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="cv-btn primary" onClick={() => onApply([...ids])}>
            Apply ({ids.size})
          </button>
        </>
      }
    >
      <input className="cv-input" type="search" placeholder="Search activities" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 10 }} />
      <div className="jm-links">
        {items.map((r) => (
          <label key={r.id} className="jm-link">
            <input type="checkbox" checked={ids.has(r.id)} onChange={() => toggle(r.id)} />
            <span>
              <b>{r.name}</b>
              <em>
                {r.id} · {r.workstream} · {r.category} · {fmtDate(r.start)} → {fmtDate(r.finish)}
              </em>
            </span>
          </label>
        ))}
      </div>
    </Modal>
  );
};
