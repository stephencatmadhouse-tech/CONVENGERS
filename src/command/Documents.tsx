/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * INTERNAL DOCUMENT REPOSITORY — site reports, weekly/monthly reports,
 * meeting minutes, construction documents, drawings, procurement records,
 * internal approvals and attachments. Files go to Firebase Storage
 * (documents/, internal only) or are attached as links.
 */

import React, { useState } from 'react';
import { useCommand } from './context.tsx';
import { DocumentCategory, ProjectDocument, Publication } from '../types/index.ts';
import { documentStore, publicationStore } from '../firebase/opsStores.ts';
import { useStore } from '../firebase/useStore.ts';
import { newId } from '../firebase/collectionStore.ts';
import { uploadFile, deleteStoredFile } from '../firebase/files.ts';
import { firestoreData } from '../firebase/firestoreData.ts';
import { fmtDate } from '../domain/dates.ts';
import { Banner, Empty, Field, Kpi, Modal, Pill, ConfirmDialog } from './ui.tsx';

export const DOC_CATEGORIES: DocumentCategory[] = [
  'Site report',
  'Weekly report',
  'Monthly report',
  'Meeting minutes',
  'Construction document',
  'Drawing / plan',
  'Procurement record',
  'Internal approval',
  'Site photo',
  'Other attachment',
];

const fmtSize = (n?: number) => (!n ? '' : n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export const Documents: React.FC = () => {
  const { register, canEdit, isAdmin, isManager, actions, user, route } = useCommand();
  const store = useStore(documentStore);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<ProjectDocument | null>(null);
  const linkFilter = /act=([^&]+)/.exec(route.param || '')?.[1];

  const rows = store.items.filter((d) => {
    if (!showArchived && d.archived) return false;
    if (cat && d.category !== cat) return false;
    if (linkFilter && d.linkedActivityId !== decodeURIComponent(linkFilter)) return false;
    if (q && !`${d.title} ${d.notes} ${d.fileName} ${d.category}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });
  const counts = DOC_CATEGORIES.map((c) => ({ c, n: store.items.filter((d) => !d.archived && d.category === c).length })).filter((x) => x.n);

  const blank = (): ProjectDocument => ({
    id: newId('DOC'),
    title: '',
    category: 'Site report',
    date: new Date().toISOString().slice(0, 10),
    createdAt: '',
    createdBy: '',
    updatedAt: '',
    updatedBy: '',
  });

  const prepareForPortal = async (d: ProjectDocument) => {
    let url = d.url;
    // Files in the internal folder are copied to the portal folder so external roles can read them.
    if (d.storagePath && d.url) {
      try {
        const blob = await (await fetch(d.url)).blob();
        const up = await uploadFile('portal', new File([blob], d.fileName || 'document', { type: d.contentType || blob.type }));
        url = up.url;
      } catch (err) {
        actions.toast(err instanceof Error ? err.message : 'Could not copy the file for the portal.');
        return;
      }
    }
    const now = new Date().toISOString();
    const isPhoto = d.category === 'Site photo' || (d.contentType || '').startsWith('image/');
    const pub: Publication = {
      id: newId(isPhoto ? 'PHO' : 'PDO'),
      kind: isPhoto ? 'photo' : 'document',
      title: d.title,
      status: 'draft',
      sourceId: d.id,
      payload: isPhoto
        ? { url, caption: d.notes || '', date: d.date, category: 'Site progress' }
        : { url, category: d.category, date: d.date, description: d.notes || '', fileName: d.fileName },
      history: [{ at: now, by: user.name, to: 'draft', note: `Prepared from document ${d.id}` }],
      createdAt: now,
      createdBy: user.name,
      updatedAt: now,
      updatedBy: user.name,
    };
    const res = await publicationStore.put(pub);
    await firestoreData.logAudit(user, 'PREPARE_PUBLICATION', 'Publication', pub.id, pub.title);
    actions.toast(res === 'shared' ? 'Draft created in Client Portal Publishing — submit it for review' : 'Draft saved on this device only');
    actions.navigate(`publishing/${isPhoto ? 'gallery' : 'documents'}`);
  };

  return (
    <div className="cv-grid" style={{ gap: 14 }}>
      {!store.shared && store.loaded && <Banner kind="warn">Shared document storage is not available yet (deploy the updated Firestore rules). New records are kept on this device only.</Banner>}
      <div className="cv-kpis">
        <Kpi label="Documents" value={store.items.filter((d) => !d.archived).length} />
        {counts.slice(0, 4).map((x) => (
          <Kpi key={x.c} label={x.c} value={x.n} />
        ))}
      </div>
      <div className="cv-filters">
        <input type="search" className="cv-input" placeholder="Search title, notes, file name…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search documents" />
        <select className="cv-select" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category">
          <option value="">All categories</option>
          {DOC_CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <label className="cv-row" style={{ fontSize: 13 }}>
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived
        </label>
        {linkFilter && (
          <button type="button" className="cv-btn sm ghost" onClick={() => actions.navigate('documents')}>
            Clear activity filter
          </button>
        )}
        <span className="cv-spacer" />
        {canEdit && (
          <button type="button" className="cv-btn primary sm" onClick={() => setEditing(blank())}>
            + Upload / add document
          </button>
        )}
      </div>
      {rows.length ? (
        <div className="cv-table-wrap">
          <table className="cv-table">
            <thead>
              <tr>
                <th className="sticky">Document</th>
                <th>Category</th>
                <th>Date</th>
                <th>Linked activity</th>
                <th>File</th>
                <th>Added by</th>
                {isManager && <th>Client portal</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id}>
                  <td className="sticky clickable" style={{ minWidth: 220, cursor: 'pointer' }} onClick={() => setEditing(d)}>
                    <div className="cv-strong">{d.title}</div>
                    <div className="cv-dim">
                      {d.id}
                      {d.archived ? ' · archived' : ''}
                      {d.localOnly ? ' · this device only' : ''}
                    </div>
                  </td>
                  <td>
                    <Pill label={d.category} color="#7026C8" />
                  </td>
                  <td className="nowrap">{fmtDate(d.date)}</td>
                  <td className="cv-dim">{register.find((r) => r.id === d.linkedActivityId)?.name || '—'}</td>
                  <td>
                    {d.url ? (
                      <a href={d.url} target="_blank" rel="noopener noreferrer" className="cv-btn sm">
                        Open {fmtSize(d.size)}
                      </a>
                    ) : (
                      <span className="cv-dim">No file</span>
                    )}
                  </td>
                  <td className="cv-dim">{d.createdBy}</td>
                  {isManager && (
                    <td>
                      <button type="button" className="cv-btn sm ghost" disabled={!d.url || d.archived} onClick={() => prepareForPortal(d)} title="Create a draft publication for the client portal">
                        Prepare for portal
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty>{store.items.length ? 'No documents match these filters.' : 'No documents have been added to the repository yet.'}</Empty>
      )}
      {editing && (
        <DocumentEditor
          doc={editing}
          canDelete={isAdmin}
          onClose={() => setEditing(null)}
          onSave={async (d, isNew) => {
            const res = await documentStore.put(d);
            await firestoreData.logAudit(user, isNew ? 'ADD_DOCUMENT' : 'UPDATE_DOCUMENT', 'Document', d.id, d.title);
            actions.toast(res === 'shared' ? 'Document saved' : 'Saved on this device only (shared storage unavailable)');
          }}
          onDelete={async (d) => {
            await deleteStoredFile(d.storagePath);
            await documentStore.remove(d.id);
            await firestoreData.logAudit(user, 'DELETE_DOCUMENT', 'Document', d.id, d.title);
            actions.toast('Document deleted');
          }}
        />
      )}
    </div>
  );
};

export const DocumentEditor: React.FC<{
  doc: ProjectDocument;
  canDelete: boolean;
  onClose: () => void;
  onSave: (d: ProjectDocument, isNew: boolean) => Promise<void>;
  onDelete: (d: ProjectDocument) => Promise<void>;
}> = ({ doc, canDelete, onClose, onSave, onDelete }) => {
  const { register, canEdit, user } = useCommand();
  const [f, setF] = useState(doc);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [confirmDel, setConfirmDel] = useState(false);
  const isNew = !doc.createdAt;
  const set = <K extends keyof ProjectDocument>(k: K, v: ProjectDocument[K]) => setF((x) => ({ ...x, [k]: v }));
  const valid = f.title.trim() && f.date && (file || f.url);

  const save = async () => {
    setBusy(true);
    setErr('');
    let next = { ...f };
    try {
      if (file) {
        const up = await uploadFile('documents', file);
        next = { ...next, url: up.url, storagePath: up.storagePath, fileName: file.name, size: up.size, contentType: up.contentType };
      }
      const now = new Date().toISOString();
      await onSave({ ...next, title: next.title.trim(), createdAt: next.createdAt || now, createdBy: next.createdBy || user.name, updatedAt: now, updatedBy: user.name }, isNew);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={isNew ? 'Add document' : f.title}
      sub={f.id}
      onClose={onClose}
      width={640}
      footer={
        <>
          {canDelete && !isNew && (
            <button type="button" className="cv-btn danger" style={{ marginRight: 'auto' }} onClick={() => setConfirmDel(true)}>
              Delete
            </button>
          )}
          {canEdit && !isNew && (
            <button type="button" className="cv-btn" onClick={() => set('archived', !f.archived)}>
              {f.archived ? 'Unarchive' : 'Archive'}
            </button>
          )}
          <button type="button" className="cv-btn ghost" onClick={onClose}>
            Cancel
          </button>
          {canEdit && (
            <button type="button" className="cv-btn primary" disabled={busy || !valid} onClick={save}>
              {busy ? (file ? 'Uploading…' : 'Saving…') : 'Save'}
            </button>
          )}
        </>
      }
    >
      {err && <Banner kind="error">{err}</Banner>}
      <fieldset className="cv-fieldset" disabled={!canEdit}>
        <legend>Document</legend>
        <Field label="Title" className="full">
          <input className="cv-input" value={f.title} onChange={(e) => set('title', e.target.value)} />
        </Field>
        <Field label="Category">
          <select className="cv-select" value={f.category} onChange={(e) => set('category', e.target.value as DocumentCategory)}>
            {DOC_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Document date">
          <input type="date" className="cv-input" value={f.date} onChange={(e) => set('date', e.target.value)} />
        </Field>
        <Field label="Linked activity" className="full">
          <select className="cv-select" value={f.linkedActivityId || ''} onChange={(e) => set('linkedActivityId', e.target.value || undefined)}>
            <option value="">— none —</option>
            {register.map((r) => (
              <option key={r.id} value={r.id}>
                {r.workstream} · {r.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Upload file (max 25 MB)" className="full" hint={f.fileName ? `Current file: ${f.fileName}` : undefined}>
          <input type="file" className="cv-input" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        </Field>
        <Field label="…or link (URL)" className="full">
          <input className="cv-input" value={f.storagePath ? '' : f.url || ''} disabled={!!f.storagePath} placeholder="https://drive.google.com/…" onChange={(e) => set('url', e.target.value)} />
        </Field>
        <Field label="Notes" className="full">
          <textarea className="cv-textarea" value={f.notes || ''} onChange={(e) => set('notes', e.target.value)} />
        </Field>
      </fieldset>
      {confirmDel && (
        <ConfirmDialog
          title="Delete this document?"
          message="The record and its uploaded file will be removed. Consider archiving instead."
          confirmLabel="Delete"
          danger
          onCancel={() => setConfirmDel(false)}
          onConfirm={async () => {
            setConfirmDel(false);
            await onDelete(f);
            onClose();
          }}
        />
      )}
    </Modal>
  );
};
