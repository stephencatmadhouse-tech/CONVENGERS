/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * CLIENT PORTAL PUBLISHING — the only path from internal data to the
 * Executive & Client Portal:
 *   Draft → For Review → Approved → Published (sanitized copy in `portal`) → Archived
 * Every transition is recorded on the publication and in the audit log.
 */

import React, { useMemo, useState } from 'react';
import { useCommand } from './context.tsx';
import { Publication, PublicationKind, PublishStatus } from '../types/index.ts';
import { publicationStore, portalStore } from '../firebase/opsStores.ts';
import { useStore } from '../firebase/useStore.ts';
import { newId } from '../firebase/collectionStore.ts';
import { uploadFile } from '../firebase/files.ts';
import { firestoreData } from '../firebase/firestoreData.ts';
import { buildPortalSnapshot, canTransition, nextTransitions, portalRecordFor, transitionPublication, PUBLISH_LABEL, PortalSnapshot } from '../domain/portal.ts';
import { fmtDate } from '../domain/dates.ts';
import { Banner, Card, Empty, Field, Kpi, Modal, Pill, ConfirmDialog } from './ui.tsx';
import { ReportStatusStamp } from './Reports.tsx';

export const STATUS_HEX_PUB: Record<PublishStatus, string> = {
  draft: '#9A9AA3',
  review: '#F5A623',
  approved: '#22A06B',
  published: '#7026C8',
  archived: '#C7C7D0',
};

const KIND_LABEL: Record<PublicationKind, string> = {
  snapshot: 'Project status update',
  photo: 'Progress photo',
  document: 'Document',
  consideration: 'Major consideration',
  update: 'Important update',
};

export const Publishing: React.FC<{ tab?: string }> = ({ tab = 'overview' }) => {
  const { user, actions } = useCommand();
  const pubs = useStore(publicationStore);
  const portal = useStore(portalStore);
  const [editing, setEditing] = useState<Publication | null>(null);
  const [confirm, setConfirm] = useState<{ p: Publication; to: PublishStatus } | null>(null);

  const transition = async (p: Publication, to: PublishStatus) => {
    if (!canTransition(p.status, to, user.role)) {
      actions.toast('Your role cannot perform this step. Approval and publishing are done by a Project Manager.');
      return;
    }
    try {
      const next = transitionPublication(p, to, user.name);
      if (to === 'published') await portalStore.put(portalRecordFor(next, user.name));
      if (p.status === 'published' && to !== 'published') await portalStore.remove(p.id);
      const res = await publicationStore.put(next);
      await firestoreData.logAudit(user, `PUBLICATION_${to.toUpperCase()}`, 'Publication', p.id, `${p.title}: ${p.status} → ${to}`);
      actions.toast(
        res === 'local'
          ? 'Saved on this device only (shared storage unavailable)'
          : to === 'published'
          ? 'Published — now visible on the Executive & Client Portal'
          : `Status changed to ${PUBLISH_LABEL[to]}`
      );
    } catch (err) {
      actions.toast(err instanceof Error ? err.message : 'Could not change status');
    }
  };

  const list = (kinds: PublicationKind[]) => pubs.items.filter((p) => kinds.includes(p.kind));

  return (
    <div className="cv-grid" style={{ gap: 14 }}>
      {(!pubs.shared || !portal.shared) && pubs.loaded && (
        <Banner kind="warn">
          Shared publishing storage is not available yet — deploy the updated firestore.rules. Until then publications stay on this device and are{' '}
          <b>not</b> visible to external users.
        </Banner>
      )}
      {tab === 'overview' && <LiveOverview pubs={pubs.items} portalCount={portal.items.length} />}
      {tab === 'snapshot' && <SnapshotTab items={list(['snapshot'])} onEdit={setEditing} onStep={(p, to) => setConfirm({ p, to })} />}
      {tab === 'considerations' && (
        <ItemsTab
          kinds={['consideration', 'update']}
          items={list(['consideration', 'update'])}
          intro="Client-appropriate project concerns, schedule considerations and important updates. Write them for the client — do not paste internal notes."
          onEdit={setEditing}
          onStep={(p, to) => setConfirm({ p, to })}
        />
      )}
      {tab === 'gallery' && (
        <ItemsTab kinds={['photo']} items={list(['photo'])} intro="Approved site photographs for the progress gallery." onEdit={setEditing} onStep={(p, to) => setConfirm({ p, to })} />
      )}
      {tab === 'documents' && (
        <ItemsTab
          kinds={['document']}
          items={list(['document'])}
          intro="Documents prepared for client download. Prepare them from the Document Repository (button “Prepare for portal”)."
          onEdit={setEditing}
          onStep={(p, to) => setConfirm({ p, to })}
          noCreate
        />
      )}
      {tab === 'reports' && <ReportsTab />}
      {editing && <PublicationEditor pub={editing} onClose={() => setEditing(null)} />}
      {confirm && (
        <ConfirmDialog
          title={`${nextTransitions(confirm.p.status).find((t) => t.to === confirm.to)?.label}?`}
          message={
            confirm.to === 'published' ? (
              <>
                <b>{confirm.p.title}</b> will become visible to project owners, executives and client representatives on the Executive &amp; Client Portal.
              </>
            ) : confirm.p.status === 'published' ? (
              <>
                <b>{confirm.p.title}</b> will be removed from the client portal.
              </>
            ) : (
              <>
                Change <b>{confirm.p.title}</b> from {PUBLISH_LABEL[confirm.p.status]} to {PUBLISH_LABEL[confirm.to]}.
              </>
            )
          }
          confirmLabel={nextTransitions(confirm.p.status).find((t) => t.to === confirm.to)?.label || 'Confirm'}
          onCancel={() => setConfirm(null)}
          onConfirm={async () => {
            const c = confirm;
            setConfirm(null);
            await transition(c.p, c.to);
          }}
        />
      )}
    </div>
  );
};

const LiveOverview: React.FC<{ pubs: Publication[]; portalCount: number }> = ({ pubs, portalCount }) => {
  const { actions, reports } = useCommand();
  const by = (s: PublishStatus) => pubs.filter((p) => p.status === s).length;
  const repPublished = reports.filter((r) => r.status === 'published').length;
  return (
    <>
      <Card title="How information reaches the client portal" note="Internal records are never shown to external users directly">
        <div className="cv-sub" style={{ marginTop: 0 }}>
          The Executive &amp; Client Portal reads only content that has been <b>approved and published</b> here. Publishing writes a client-safe copy: construction
          progress, milestones, dates (marked Confirmed / Tentative / Target) and the narratives you write. Responsible persons, internal remarks, issues,
          corrective actions, procurement, budget and production details are never included. Staff prepare drafts and submit them for review; Project
          Managers approve, publish and archive.
        </div>
        <div className="cv-row" style={{ marginTop: 10 }}>
          <a className="cv-btn primary sm" href="#/portal/overview">
            Preview the client portal
          </a>
          <button type="button" className="cv-btn sm" onClick={() => actions.navigate('publishing/snapshot')}>
            Prepare a project status update
          </button>
        </div>
      </Card>
      <div className="cv-kpis">
        <Kpi label="Live on portal" value={portalCount} color="#7026C8" sub="Published items incl. reports" />
        <Kpi label="For review" value={by('review')} color={by('review') ? '#F5A623' : undefined} />
        <Kpi label="Approved, not published" value={by('approved')} />
        <Kpi label="Drafts" value={by('draft')} />
        <Kpi label="Published reports" value={repPublished} />
      </div>
      <Card title="Waiting for action">
        {pubs.filter((p) => p.status === 'review' || p.status === 'approved').length ? (
          <div className="cv-list">
            {pubs
              .filter((p) => p.status === 'review' || p.status === 'approved')
              .map((p) => (
                <div key={p.id} className="cv-li">
                  <div className="cv-li-main">
                    <div className="cv-li-t">{p.title}</div>
                    <div className="cv-li-s">
                      {KIND_LABEL[p.kind]} · updated {fmtDate(p.updatedAt.slice(0, 10))} by {p.updatedBy}
                    </div>
                  </div>
                  <Pill label={PUBLISH_LABEL[p.status]} color={STATUS_HEX_PUB[p.status]} />
                  <button
                    type="button"
                    className="cv-btn sm"
                    onClick={() => actions.navigate(`publishing/${p.kind === 'snapshot' ? 'snapshot' : p.kind === 'photo' ? 'gallery' : p.kind === 'document' ? 'documents' : 'considerations'}`)}
                  >
                    Open
                  </button>
                </div>
              ))}
          </div>
        ) : (
          <Empty>Nothing is waiting for review or publishing.</Empty>
        )}
      </Card>
    </>
  );
};

const Steps: React.FC<{ p: Publication; onStep: (p: Publication, to: PublishStatus) => void }> = ({ p, onStep }) => {
  const { user } = useCommand();
  return (
    <span className="cv-row" style={{ gap: 4 }}>
      {nextTransitions(p.status).map((t) => (
        <button
          key={t.to}
          type="button"
          className={`cv-btn sm ${t.to === 'published' || t.to === 'approved' ? 'primary' : ''}`}
          disabled={!canTransition(p.status, t.to, user.role)}
          title={!canTransition(p.status, t.to, user.role) ? 'Project Manager approval required' : undefined}
          onClick={() => onStep(p, t.to)}
        >
          {t.label}
        </button>
      ))}
    </span>
  );
};

const PubTable: React.FC<{ items: Publication[]; onEdit: (p: Publication) => void; onStep: (p: Publication, to: PublishStatus) => void }> = ({ items, onEdit, onStep }) => {
  const [showArchived, setShowArchived] = useState(false);
  const shown = items.filter((p) => showArchived || p.status !== 'archived');
  return (
    <>
      <label className="cv-row" style={{ fontSize: 13 }}>
        <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived
      </label>
      {shown.length ? (
        <div className="cv-table-wrap">
          <table className="cv-table">
            <thead>
              <tr>
                <th className="sticky">Item</th>
                <th>Type</th>
                <th>Status</th>
                <th>Last change</th>
                <th>Workflow</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => (
                <tr key={p.id}>
                  <td className="sticky clickable" style={{ minWidth: 220, cursor: 'pointer' }} onClick={() => onEdit(p)}>
                    <div className="cv-strong">{p.title}</div>
                    <div className="cv-dim">
                      {p.id}
                      {p.localOnly ? ' · this device only' : ''}
                    </div>
                  </td>
                  <td className="nowrap">{KIND_LABEL[p.kind]}</td>
                  <td>
                    <Pill label={PUBLISH_LABEL[p.status]} color={STATUS_HEX_PUB[p.status]} />
                  </td>
                  <td className="cv-dim nowrap">
                    {fmtDate(p.updatedAt.slice(0, 10))} · {p.updatedBy}
                  </td>
                  <td>
                    <Steps p={p} onStep={onStep} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty>No items yet.</Empty>
      )}
    </>
  );
};

const SnapshotTab: React.FC<{ items: Publication[]; onEdit: (p: Publication) => void; onStep: (p: Publication, to: PublishStatus) => void }> = ({ items, onEdit, onStep }) => {
  const { register, data, metrics, today, user, actions, canEdit } = useCommand();
  const preview = useMemo(() => buildPortalSnapshot(register, data.milestones, metrics, today), [register, data.milestones, metrics, today]);
  const create = async () => {
    const now = new Date().toISOString();
    const p: Publication = {
      id: newId('SNP'),
      kind: 'snapshot',
      title: `Project status update — ${fmtDate(today)}`,
      status: 'draft',
      payload: preview,
      periodStart: today,
      periodEnd: today,
      history: [{ at: now, by: user.name, to: 'draft', note: 'Created from the live master register' }],
      createdAt: now,
      createdBy: user.name,
      updatedAt: now,
      updatedBy: user.name,
    };
    const res = await publicationStore.put(p);
    await firestoreData.logAudit(user, 'CREATE_SNAPSHOT_PUBLICATION', 'Publication', p.id, p.title);
    actions.toast(res === 'shared' ? 'Draft status update created — submit it for review' : 'Draft saved on this device only');
  };
  return (
    <>
      <Card
        title="Project status update for the portal"
        note="Freezes today's client-safe figures into a draft. The portal shows the most recently published update."
        actions={
          canEdit && (
            <button type="button" className="cv-btn primary sm" onClick={create}>
              + Create draft from current data
            </button>
          )
        }
      >
        <SnapshotSummary s={preview} />
      </Card>
      <Card title="Status updates">
        <PubTable items={items} onEdit={onEdit} onStep={onStep} />
      </Card>
    </>
  );
};

export const SnapshotSummary: React.FC<{ s: PortalSnapshot }> = ({ s }) => (
  <div className="cv-grid" style={{ gap: 10 }}>
    <div className="cv-kpis">
      <Kpi label="Status" value={s.status} />
      <Kpi label="Overall progress" value={`${s.actualPct.toFixed(1)}%`} sub={`Planned ${s.plannedPct.toFixed(1)}%`} accent />
      <Kpi label="Completed / in progress" value={`${s.counts.completed} / ${s.counts.ongoing}`} />
      <Kpi label="Target completion" value={s.targetCompletion ? fmtDate(s.targetCompletion) : 'Not yet provided'} />
    </div>
    <div className="cv-dim">
      Includes {s.phases.length} construction phases, {s.milestones.length} milestones, {s.completed.length} recently completed, {s.ongoing.length} ongoing and{' '}
      {s.upcoming.length} upcoming activities, {s.scheduleUpdates.length} schedule change(s). Excludes owners, internal remarks, issues, procurement, budget and
      production details.
    </div>
  </div>
);

const ItemsTab: React.FC<{
  kinds: PublicationKind[];
  items: Publication[];
  intro: string;
  onEdit: (p: Publication) => void;
  onStep: (p: Publication, to: PublishStatus) => void;
  noCreate?: boolean;
}> = ({ kinds, items, intro, onEdit, onStep, noCreate }) => {
  const { canEdit, user, today } = useCommand();
  const blank = (kind: PublicationKind): Publication => {
    const now = new Date().toISOString();
    return {
      id: newId(kind === 'photo' ? 'PHO' : kind === 'update' ? 'UPD' : 'CON'),
      kind,
      title: '',
      status: 'draft',
      payload: kind === 'photo' ? { url: '', caption: '', date: today, category: 'Site progress' } : { text: '', date: today, category: '', impact: '' },
      history: [],
      createdAt: '',
      createdBy: user.name,
      updatedAt: now,
      updatedBy: user.name,
    };
  };
  return (
    <Card
      title={kinds.map((k) => KIND_LABEL[k]).join(' & ')}
      note={intro}
      actions={
        canEdit && !noCreate ? (
          <>
            {kinds.map((k) => (
              <button key={k} type="button" className="cv-btn primary sm" onClick={() => onEdit(blank(k))}>
                + {KIND_LABEL[k]}
              </button>
            ))}
          </>
        ) : undefined
      }
    >
      <PubTable items={items} onEdit={onEdit} onStep={onStep} />
    </Card>
  );
};

const ReportsTab: React.FC = () => {
  const { reports, actions } = useCommand();
  return (
    <Card title="Weekly & monthly reports" note="Reports are approved in Weekly & Monthly Reports, then published from there. Only a client-safe version is published.">
      {reports.length ? (
        <div className="cv-list">
          {reports.map((r) => (
            <div key={r.id} className="cv-li">
              <div className="cv-li-main">
                <div className="cv-li-t">{r.title}</div>
                <div className="cv-li-s">
                  {r.publishedAt ? `Published ${fmtDate(r.publishedAt.slice(0, 10))} by ${r.publishedBy}` : r.approvedAt ? `Approved ${fmtDate(r.approvedAt.slice(0, 10))}` : 'Not yet approved'}
                </div>
              </div>
              <ReportStatusStamp report={r} />
              <button type="button" className="cv-btn sm" onClick={() => actions.navigate(`reports/${r.type}/id=${r.id}`)}>
                Open
              </button>
            </div>
          ))}
        </div>
      ) : (
        <Empty>No reports yet.</Empty>
      )}
    </Card>
  );
};

const PublicationEditor: React.FC<{ pub: Publication; onClose: () => void }> = ({ pub, onClose }) => {
  const { user, actions, canEdit, isAdmin } = useCommand();
  const [f, setF] = useState<Publication>(pub);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const editable = canEdit && (f.status === 'draft' || f.status === 'review') && f.kind !== 'snapshot';
  const isNew = !pub.createdAt;
  const setPayload = (k: string, v: unknown) => setF((x) => ({ ...x, payload: { ...x.payload, [k]: v } }));

  const save = async () => {
    setBusy(true);
    setErr('');
    try {
      let payload = f.payload;
      if (file) {
        const up = await uploadFile('portal', file);
        payload = { ...payload, url: up.url };
      }
      if (f.kind === 'photo' && !payload.url) throw new Error('Choose a photo to upload or paste an image link.');
      const now = new Date().toISOString();
      const next: Publication = {
        ...f,
        payload,
        title: f.title.trim(),
        createdAt: f.createdAt || now,
        createdBy: f.createdBy || user.name,
        updatedAt: now,
        updatedBy: user.name,
        history: isNew ? [{ at: now, by: user.name, to: 'draft' }] : f.history,
      };
      const res = await publicationStore.put(next);
      await firestoreData.logAudit(user, isNew ? 'CREATE_PUBLICATION' : 'EDIT_PUBLICATION', 'Publication', next.id, next.title);
      actions.toast(res === 'shared' ? 'Saved' : 'Saved on this device only');
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={isNew ? `New ${KIND_LABEL[f.kind].toLowerCase()}` : f.title}
      sub={`${f.id} · ${KIND_LABEL[f.kind]} · ${PUBLISH_LABEL[f.status]}`}
      onClose={onClose}
      width={720}
      footer={
        <>
          {isAdmin && !isNew && f.status !== 'published' && (
            <button
              type="button"
              className="cv-btn danger"
              style={{ marginRight: 'auto' }}
              onClick={async () => {
                await publicationStore.remove(f.id);
                await firestoreData.logAudit(user, 'DELETE_PUBLICATION', 'Publication', f.id, f.title);
                onClose();
              }}
            >
              Delete
            </button>
          )}
          <button type="button" className="cv-btn ghost" onClick={onClose}>
            Close
          </button>
          {editable && (
            <button type="button" className="cv-btn primary" disabled={busy || !f.title.trim()} onClick={save}>
              {busy ? 'Saving…' : 'Save'}
            </button>
          )}
        </>
      }
    >
      {err && <Banner kind="error">{err}</Banner>}
      {!editable && f.kind !== 'snapshot' && <Banner kind="info">Content can only be edited while the item is a Draft or For Review. Return it to draft to change it.</Banner>}
      {f.kind === 'snapshot' ? (
        <SnapshotSummary s={f.payload as PortalSnapshot} />
      ) : (
        <fieldset className="cv-fieldset" disabled={!editable}>
          <legend>Client-facing content</legend>
          <Field label="Title" className="full">
            <input className="cv-input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          </Field>
          {(f.kind === 'consideration' || f.kind === 'update') && (
            <>
              <Field label={f.kind === 'consideration' ? 'Description for the client' : 'Update text'} className="full">
                <textarea className="cv-textarea" value={f.payload.text || ''} onChange={(e) => setPayload('text', e.target.value)} />
              </Field>
              <Field label="Date">
                <input type="date" className="cv-input" value={f.payload.date || ''} onChange={(e) => setPayload('date', e.target.value)} />
              </Field>
              {f.kind === 'consideration' && (
                <>
                  <Field label="Category">
                    <input className="cv-input" value={f.payload.category || ''} onChange={(e) => setPayload('category', e.target.value)} placeholder="e.g. Schedule, Weather, Permits" />
                  </Field>
                  <Field label="Schedule impact (optional)" className="full">
                    <input className="cv-input" value={f.payload.impact || ''} onChange={(e) => setPayload('impact', e.target.value)} />
                  </Field>
                </>
              )}
            </>
          )}
          {f.kind === 'photo' && (
            <>
              <Field label="Photo (upload)" className="full" hint={f.payload.url ? 'A photo is attached; choose a new file to replace it.' : undefined}>
                <input type="file" accept="image/*" className="cv-input" onChange={(e) => setFile(e.target.files?.[0] || null)} />
              </Field>
              <Field label="…or image link" className="full">
                <input className="cv-input" value={f.payload.url || ''} onChange={(e) => setPayload('url', e.target.value)} />
              </Field>
              <Field label="Caption" className="full">
                <textarea className="cv-textarea" value={f.payload.caption || ''} onChange={(e) => setPayload('caption', e.target.value)} />
              </Field>
              <Field label="Date taken">
                <input type="date" className="cv-input" value={f.payload.date || ''} onChange={(e) => setPayload('date', e.target.value)} />
              </Field>
              <Field label="Category">
                <select className="cv-select" value={f.payload.category || 'Site progress'} onChange={(e) => setPayload('category', e.target.value)}>
                  {['Site progress', 'Structural progress', 'Completed works', 'Monthly documentation'].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Field>
              {f.payload.url && (
                <div className="full">
                  <img src={f.payload.url} alt="" style={{ maxWidth: '100%', maxHeight: 260, borderRadius: 10, border: '1px solid var(--cv-line)' }} />
                </div>
              )}
            </>
          )}
          {f.kind === 'document' && (
            <>
              <Field label="Description" className="full">
                <textarea className="cv-textarea" value={f.payload.description || ''} onChange={(e) => setPayload('description', e.target.value)} />
              </Field>
              <Field label="Category">
                <input className="cv-input" value={f.payload.category || ''} onChange={(e) => setPayload('category', e.target.value)} />
              </Field>
              <Field label="Date">
                <input type="date" className="cv-input" value={f.payload.date || ''} onChange={(e) => setPayload('date', e.target.value)} />
              </Field>
              <div className="full cv-dim">File: {f.payload.fileName || f.payload.url || 'Not yet provided'}</div>
            </>
          )}
        </fieldset>
      )}
      {f.history?.length > 0 && (
        <fieldset className="cv-fieldset">
          <legend>Audit trail</legend>
          <div className="full cv-list">
            {[...f.history].reverse().map((h, i) => (
              <div key={i} className="cv-li">
                <div className="cv-li-main">
                  <div className="cv-li-t">
                    {h.from ? `${PUBLISH_LABEL[h.from]} → ` : ''}
                    {PUBLISH_LABEL[h.to]}
                  </div>
                  <div className="cv-li-s">
                    {fmtDate(h.at.slice(0, 10))} {h.at.slice(11, 16)} · {h.by}
                    {h.note ? ` · ${h.note}` : ''}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </fieldset>
      )}
    </Modal>
  );
};
