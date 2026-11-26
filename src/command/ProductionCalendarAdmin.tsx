/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * PRODUCTION CALENDAR MANAGEMENT (internal)
 *   Schedule — create, edit, reschedule, update status, assign personnel, photos and
 *              attachments (Google Drive), stakeholder-visible or internal-only, publish.
 *   Proposals — schedules proposed by the production team, approved by an administrator.
 *   Change Log — every schedule modification: previous date, new date, editor, time.
 *
 * Uses the existing calendar collection (`events`); published, stakeholder-visible
 * events are copied (client-safe) to the existing client-portal collection and kept
 * in sync on every save.
 */

import React, { useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Send, EyeOff, CheckCircle2, ImagePlus, Paperclip, History } from 'lucide-react';
import './prodCalendar.css';
import { useCommand } from './context.tsx';
import { Banner, ConfirmDialog, Empty, Field, Modal } from './ui.tsx';
import { useStore } from '../firebase/useStore.ts';
import { eventStore, portalStore } from '../firebase/opsStores.ts';
import { newId } from '../firebase/collectionStore.ts';
import type { CalendarEvent, EventStatus, ProdCategory } from '../types/index.ts';
import {
  PROD_CATEGORIES,
  CATEGORY,
  EVENT_STATUSES,
  STATUS_TONE,
  DEPARTMENTS,
  categoryOf,
  statusOf,
  changeEntry,
  portalEventRecord,
  portalEventId,
  isPublishable,
  fmtTime12,
  type PortalEventContent,
} from '../domain/productionCalendar.ts';
import { fmtDate, isValidIso } from '../domain/dates.ts';
import { newFileId, uploadToDrive, validateFile, driveFileUrl, setDrivePublication } from '../drive/driveClient.ts';
import { SecureImg } from '../drive/SecureMedia.tsx';

const nowIso = () => new Date().toISOString();

export const CatBadge: React.FC<{ c: ProdCategory; sub?: string }> = ({ c, sub }) => (
  <span className="pc-cat" style={{ ['--c' as any]: CATEGORY[c].color }}>
    {sub || CATEGORY[c].short}
  </span>
);
export const StatusBadge: React.FC<{ s: EventStatus }> = ({ s }) => <span className={`pc-st ${STATUS_TONE[s]}`}>{s}</span>;

function whenText(e: CalendarEvent): string {
  const d = e.endDate && e.endDate !== e.date ? `${fmtDate(e.date)} – ${fmtDate(e.endDate)}` : fmtDate(e.date);
  const t = e.time ? ` · ${fmtTime12(e.time)}${e.endTime ? `–${fmtTime12(e.endTime)}` : ''}` : '';
  return d + t;
}

/** Publish / re-publish / withdraw the client copy so the portal always matches the schedule. */
async function syncPortal(e: CalendarEvent, by: string, prev?: PortalEventContent): Promise<void> {
  const id = portalEventId(e.id);
  if (e.published && isPublishable(e)) {
    for (const f of [...(e.photos || []).map((p) => p.fileId), ...(e.attachments || []).map((a) => a.fileId).filter(Boolean)] as string[]) {
      await setDrivePublication(f, true, by).catch(() => undefined);
    }
    await portalStore.put(portalEventRecord(e, by, prev));
  } else if (prev) {
    await portalStore.remove(id).catch(() => undefined);
  }
}

// =====================================================================
export const ProductionCalendarAdmin: React.FC<{ tab?: string }> = ({ tab }) => {
  const { isManager, canEdit } = useCommand();
  const store = useStore(eventStore);
  const [editing, setEditing] = useState<CalendarEvent | 'new' | null>(null);
  const proposals = store.items.filter((e) => e.approval === 'proposed');
  return (
    <div className="cv-grid" style={{ gap: 14 }}>
      {!isManager && canEdit && (
        <Banner kind="info">You can propose schedules. An administrator reviews them and decides what stakeholders see.</Banner>
      )}
      {tab === 'proposals' ? (
        <ProposalList items={proposals} onOpen={setEditing} />
      ) : tab === 'log' ? (
        <ChangeLog items={store.items} />
      ) : (
        <ScheduleList items={store.items} loaded={store.loaded} onOpen={setEditing} />
      )}
      {editing && <EventEditor initial={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
};

// ---------------- schedule list
const ScheduleList: React.FC<{ items: CalendarEvent[]; loaded: boolean; onOpen: (e: CalendarEvent | 'new') => void }> = ({ items, loaded, onOpen }) => {
  const { canEdit, isManager, today, user, actions } = useCommand();
  const portal = useStore(portalStore);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [vis, setVis] = useState('');
  const [when, setWhen] = useState<'upcoming' | 'past' | 'all'>('upcoming');
  const [busy, setBusy] = useState('');
  const [del, setDel] = useState<CalendarEvent | null>(null);
  const list = useMemo(
    () =>
      items
        .filter((e) => e.approval !== 'proposed')
        .filter((e) => (when === 'all' ? true : when === 'upcoming' ? (e.endDate || e.date) >= today : (e.endDate || e.date) < today))
        .filter((e) => !cat || categoryOf(e) === cat)
        .filter((e) => !vis || (vis === 'published' ? e.published && isPublishable(e) : vis === 'stakeholder' ? e.visibility === 'stakeholder' : e.visibility !== 'stakeholder'))
        .filter((e) => !q.trim() || `${e.title} ${e.description || ''} ${e.location || ''} ${(e.personnel || []).join(' ')}`.toLowerCase().includes(q.trim().toLowerCase()))
        .sort((a, b) => (when === 'past' ? -1 : 1) * (a.date + (a.time || '')).localeCompare(b.date + (b.time || ''))),
    [items, when, cat, vis, q, today]
  );
  const prevOf = (e: CalendarEvent) => portal.items.find((r) => r.id === portalEventId(e.id))?.content as PortalEventContent | undefined;
  const setPublished = async (e: CalendarEvent, on: boolean) => {
    setBusy(e.id);
    const at = nowIso();
    const next: CalendarEvent = {
      ...e,
      visibility: on ? 'stakeholder' : e.visibility,
      published: on,
      publishedAt: on ? at : e.publishedAt,
      publishedBy: on ? user.name : e.publishedBy,
      history: [...(e.history || []), { at, by: user.name, action: on ? 'Published to stakeholders' : 'Unpublished' }],
      updatedAt: at,
      updatedBy: user.name,
    };
    try {
      await eventStore.put(next);
      await syncPortal(next, user.name, prevOf(e));
      actions.toast(on ? 'Published — stakeholders can see it in the Production Calendar' : 'Unpublished — removed from the stakeholder portal');
    } catch (err) {
      actions.toast(`Not saved: ${err instanceof Error ? err.message : 'permission denied'}`);
    }
    setBusy('');
  };
  return (
    <>
      <div className="cv-filters">
        <input type="search" className="cv-input" placeholder="Search events…" aria-label="Search events" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="cv-select" aria-label="When" value={when} onChange={(e) => setWhen(e.target.value as any)}>
          <option value="upcoming">Upcoming</option>
          <option value="past">Past</option>
          <option value="all">All dates</option>
        </select>
        <select className="cv-select" aria-label="Category" value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">All categories</option>
          {PROD_CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <select className="cv-select" aria-label="Visibility" value={vis} onChange={(e) => setVis(e.target.value)}>
          <option value="">All visibility</option>
          <option value="published">Published to stakeholders</option>
          <option value="stakeholder">Stakeholder-visible</option>
          <option value="internal">Internal only</option>
        </select>
        <span className="cv-spacer" />
        <button type="button" className="cv-btn sm" onClick={() => actions.navigate('portal/calendar')}>
          Stakeholder View
        </button>
        {canEdit && (
          <button type="button" className="cv-btn primary sm" onClick={() => onOpen('new')}>
            <Plus size={14} aria-hidden /> {isManager ? 'New Event' : 'Propose Event'}
          </button>
        )}
      </div>
      {!loaded ? (
        <Empty>Loading…</Empty>
      ) : list.length === 0 ? (
        <Empty>No events match these filters.</Empty>
      ) : (
        <ul className="pc-admin-list">
          {list.map((e) => {
            const c = categoryOf(e);
            const s = statusOf(e);
            const live = e.published && isPublishable(e);
            return (
              <li key={e.id} style={{ ['--c' as any]: CATEGORY[c].color }}>
                <div className="pc-al-date">
                  <b>{new Date(`${e.date}T00:00:00`).getDate()}</b>
                  <span>{new Date(`${e.date}T00:00:00`).toLocaleString('en-US', { month: 'short' })}</span>
                </div>
                <div className="pc-al-main">
                  <div className="pc-al-t">
                    <b>{e.title}</b>
                    <CatBadge c={c} sub={e.subcategory} />
                    <StatusBadge s={s} />
                  </div>
                  <span className="cv-dim">
                    {whenText(e)}
                    {e.location ? ` · ${e.location}` : ''}
                    {e.department ? ` · ${e.department}` : ''}
                    {(e.personnel || []).length ? ` · ${(e.personnel || []).join(', ')}` : ''}
                  </span>
                </div>
                <span className={`pc-vis ${live ? 'live' : e.visibility === 'stakeholder' ? 'ready' : ''}`}>{live ? 'Published' : e.visibility === 'stakeholder' ? 'Not published' : 'Internal only'}</span>
                <div className="pc-al-a">
                  {isManager && e.visibility === 'stakeholder' && (
                    <button type="button" className={`cv-btn sm ${live ? '' : 'primary'}`} disabled={busy === e.id} onClick={() => setPublished(e, !live)}>
                      {live ? <EyeOff size={14} aria-hidden /> : <Send size={14} aria-hidden />} {live ? 'Unpublish' : 'Publish'}
                    </button>
                  )}
                  {isManager && (
                    <>
                      <button type="button" className="cv-btn sm" aria-label={`Edit ${e.title}`} onClick={() => onOpen(e)}>
                        <Pencil size={14} aria-hidden /> Edit
                      </button>
                      <button type="button" className="cv-btn ghost sm" aria-label={`Delete ${e.title}`} onClick={() => setDel(e)}>
                        <Trash2 size={14} aria-hidden />
                      </button>
                    </>
                  )}
                  {!isManager && (
                    <button type="button" className="cv-btn sm" onClick={() => onOpen(e)}>
                      View
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {del && (
        <ConfirmDialog
          title="Delete this event?"
          message={`“${del.title}” will be removed from the calendar${del.published ? ' and from the stakeholder portal' : ''}.`}
          confirmLabel="Delete"
          danger
          onCancel={() => setDel(null)}
          onConfirm={async () => {
            const e = del;
            setDel(null);
            try {
              await eventStore.remove(e.id);
              if (prevOf(e)) await portalStore.remove(portalEventId(e.id)).catch(() => undefined);
              actions.toast('Event deleted');
            } catch {
              actions.toast('Not deleted — check your permissions');
            }
          }}
        />
      )}
    </>
  );
};

// ---------------- proposals
const ProposalList: React.FC<{ items: CalendarEvent[]; onOpen: (e: CalendarEvent) => void }> = ({ items, onOpen }) => {
  const { isManager, user, actions } = useCommand();
  const [busy, setBusy] = useState('');
  const approve = async (e: CalendarEvent, publish: boolean) => {
    setBusy(e.id);
    const at = nowIso();
    const next: CalendarEvent = {
      ...e,
      approval: 'approved',
      visibility: publish ? 'stakeholder' : e.visibility || 'internal',
      published: publish,
      publishedAt: publish ? at : undefined,
      publishedBy: publish ? user.name : undefined,
      history: [...(e.history || []), { at, by: user.name, action: publish ? 'Approved and published' : 'Approved' }],
      updatedAt: at,
      updatedBy: user.name,
    };
    try {
      await eventStore.put(next);
      await syncPortal(next, user.name);
      actions.toast(publish ? 'Approved and published to stakeholders' : 'Approved');
    } catch (err) {
      actions.toast(`Not saved: ${err instanceof Error ? err.message : 'permission denied'}`);
    }
    setBusy('');
  };
  if (!items.length) return <Empty>No proposed schedules waiting for approval.</Empty>;
  return (
    <ul className="pc-admin-list">
      {items
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((e) => (
          <li key={e.id} style={{ ['--c' as any]: CATEGORY[categoryOf(e)].color }}>
            <div className="pc-al-date">
              <b>{new Date(`${e.date}T00:00:00`).getDate()}</b>
              <span>{new Date(`${e.date}T00:00:00`).toLocaleString('en-US', { month: 'short' })}</span>
            </div>
            <div className="pc-al-main">
              <div className="pc-al-t">
                <b>{e.title}</b>
                <CatBadge c={categoryOf(e)} sub={e.subcategory} />
                <span className="pc-vis ready">Proposed</span>
              </div>
              <span className="cv-dim">
                {whenText(e)} · proposed by {e.proposedBy || e.createdBy}
                {e.visibility === 'stakeholder' ? ' · intended for stakeholders' : ''}
              </span>
            </div>
            <div className="pc-al-a">
              <button type="button" className="cv-btn sm" onClick={() => onOpen(e)}>
                {isManager ? 'Review' : 'Edit'}
              </button>
              {isManager && (
                <>
                  <button type="button" className="cv-btn sm" disabled={busy === e.id} onClick={() => approve(e, false)}>
                    <CheckCircle2 size={14} aria-hidden /> Approve
                  </button>
                  <button type="button" className="cv-btn primary sm" disabled={busy === e.id} onClick={() => approve(e, true)}>
                    <Send size={14} aria-hidden /> Approve &amp; Publish
                  </button>
                </>
              )}
            </div>
          </li>
        ))}
    </ul>
  );
};

// ---------------- change log
const ChangeLog: React.FC<{ items: CalendarEvent[] }> = ({ items }) => {
  const rows = items
    .flatMap((e) => (e.history || []).map((h) => ({ e, h })))
    .sort((a, b) => b.h.at.localeCompare(a.h.at))
    .slice(0, 300);
  if (!rows.length) return <Empty>No schedule changes recorded yet.</Empty>;
  const slot = (x?: { date?: string; endDate?: string; time?: string; status?: string }) =>
    x ? `${x.date ? fmtDate(x.date) : ''}${x.endDate && x.endDate !== x.date ? ` – ${fmtDate(x.endDate)}` : ''}${x.time ? ` ${fmtTime12(x.time)}` : ''}${x.status ? ` · ${x.status}` : ''}` : '—';
  return (
    <div className="cv-table-wrap">
      <table className="cv-table">
        <thead>
          <tr>
            <th>When</th>
            <th>Event</th>
            <th>Change</th>
            <th>Previous</th>
            <th>Updated</th>
            <th>Editor</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ e, h }, i) => (
            <tr key={i}>
              <td className="nowrap">{new Date(h.at).toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</td>
              <td>{e.title}</td>
              <td>{h.action}</td>
              <td className="cv-dim">{slot(h.from)}</td>
              <td>{slot(h.to)}</td>
              <td>{h.by}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// ---------------- editor
const EventEditor: React.FC<{ initial: CalendarEvent | null; onClose: () => void }> = ({ initial, onClose }) => {
  const { user, isManager, canEdit, today, actions } = useCommand();
  const portal = useStore(portalStore);
  const readOnly = !isManager && !(initial === null || (initial.approval === 'proposed' && initial.proposedById === user.id));
  const [f, setF] = useState<CalendarEvent>(
    () =>
      initial || {
        id: newId('EV'),
        date: today,
        type: 'Other',
        title: '',
        done: false,
        category: 'construction',
        subcategory: '',
        status: 'Scheduled',
        visibility: 'stakeholder',
        approval: isManager ? 'approved' : 'proposed',
        published: false,
        personnel: [],
        photos: [],
        attachments: [],
        createdAt: nowIso(),
        createdBy: user.name,
        updatedAt: nowIso(),
        updatedBy: user.name,
        ...(isManager ? {} : { proposedBy: user.name, proposedById: user.id }),
      }
  );
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState('');
  const set = (p: Partial<CalendarEvent>) => setF((x) => ({ ...x, ...p }));
  const cat = f.category || categoryOf(f);
  const upload = async (files: FileList | null, kind: 'photo' | 'document') => {
    if (!files) return;
    const errs: string[] = [];
    setBusy(kind);
    for (const file of Array.from(files)) {
      const e = validateFile(file, kind === 'photo');
      if (e) {
        errs.push(e);
        continue;
      }
      try {
        const fileId = newFileId();
        await uploadToDrive(file, {
          fileId,
          folderKey: kind === 'photo' ? 'photos' : 'supporting',
          reportingDate: f.date,
          kind,
          category: 'Production Calendar',
          description: `${f.title || 'Calendar event'}${kind === 'photo' ? '' : ` — ${file.name}`}`,
        });
        if (kind === 'photo') setF((x) => ({ ...x, photos: [...(x.photos || []), { fileId, caption: '' }] }));
        else setF((x) => ({ ...x, attachments: [...(x.attachments || []), { fileId, title: file.name }] }));
      } catch (err) {
        errs.push(`${file.name}: ${err instanceof Error ? err.message : 'upload failed'}`);
      }
    }
    setErrors(errs);
    setBusy('');
  };
  const save = async (publish?: boolean) => {
    const errs: string[] = [];
    if (!f.title.trim()) errs.push('Enter the event title.');
    if (!isValidIso(f.date)) errs.push('Choose the start date.');
    if (f.endDate && f.endDate < f.date) errs.push('The end date cannot be before the start date.');
    if (f.time && f.endTime && (!f.endDate || f.endDate === f.date) && f.endTime < f.time) errs.push('The end time cannot be before the start time.');
    if (errs.length) return setErrors(errs);
    setBusy('save');
    const at = nowIso();
    const status = f.status || 'Scheduled';
    let next: CalendarEvent = {
      ...f,
      title: f.title.trim(),
      category: cat,
      status,
      done: status === 'Completed',
      type: cat === 'meeting' ? 'Meeting' : f.type && f.type !== 'Meeting' ? f.type : 'Other',
      personnel: (f.personnel || []).map((x) => x.trim()).filter(Boolean),
      updatedAt: at,
      updatedBy: user.name,
    };
    if (!isManager) next = { ...next, approval: 'proposed', published: false, proposedBy: f.proposedBy || user.name, proposedById: f.proposedById || user.id };
    if (isManager && publish !== undefined) next = { ...next, published: publish && next.visibility === 'stakeholder', publishedAt: publish ? at : next.publishedAt, publishedBy: publish ? user.name : next.publishedBy };
    if (isManager && next.visibility !== 'stakeholder') next.published = false;
    const ch = changeEntry(initial || undefined, next, user.name, at);
    next.history = [...(f.history || []), ...(ch ? [ch] : []), ...(isManager && publish && !initial?.published ? [{ at, by: user.name, action: 'Published to stakeholders' }] : [])];
    Object.keys(next).forEach((k) => ((next as any)[k] === '' || (next as any)[k] === undefined) && k !== 'title' && delete (next as any)[k]);
    try {
      const where = await eventStore.put(next);
      if (isManager) await syncPortal(next, user.name, portal.items.find((r) => r.id === portalEventId(next.id))?.content as PortalEventContent | undefined);
      actions.toast(
        where === 'local'
          ? 'Saved on this device only — publish the database rules to share it'
          : !isManager
            ? 'Proposal sent — an administrator will review it'
            : next.published
              ? 'Saved and published — the stakeholder calendar is up to date'
              : 'Saved'
      );
      onClose();
    } catch (err) {
      setErrors([`Not saved: ${err instanceof Error ? err.message : 'the database refused the change'}`]);
    }
    setBusy('');
  };
  const sel = CATEGORY[cat];
  return (
    <Modal
      title={initial ? (readOnly ? initial.title : `Edit · ${initial.title}`) : isManager ? 'New event' : 'Propose an event'}
      sub={initial?.approval === 'proposed' ? `Proposed by ${initial.proposedBy || initial.createdBy}` : initial?.published ? 'Published — saving updates the stakeholder calendar' : undefined}
      onClose={onClose}
      width={860}
      footer={
        readOnly ? (
          <button type="button" className="cv-btn" onClick={onClose}>
            Close
          </button>
        ) : (
          <>
            <button type="button" className="cv-btn ghost" onClick={onClose}>
              Cancel
            </button>
            {isManager ? (
              <>
                <button type="button" className="cv-btn" disabled={!!busy} onClick={() => save()}>
                  Save
                </button>
                {f.visibility === 'stakeholder' && !f.published && (
                  <button type="button" className="cv-btn primary" disabled={!!busy} onClick={() => save(true)}>
                    <Send size={14} aria-hidden /> Save &amp; Publish
                  </button>
                )}
              </>
            ) : (
              <button type="button" className="cv-btn primary" disabled={!!busy || !canEdit} onClick={() => save()}>
                <Send size={14} aria-hidden /> Submit Proposal
              </button>
            )}
          </>
        )
      }
    >
      {errors.length > 0 && (
        <Banner kind="error">
          {errors.map((e) => (
            <div key={e}>{e}</div>
          ))}
        </Banner>
      )}
      <fieldset className="cv-fieldset" disabled={readOnly}>
        <legend>Event</legend>
        <Field label="Event title *" className="full">
          <input className="cv-input" value={f.title} onChange={(e) => set({ title: e.target.value })} />
        </Field>
        <Field label="Category">
          <select className="cv-select" value={cat} onChange={(e) => set({ category: e.target.value as ProdCategory, subcategory: '' })}>
            {PROD_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Type">
          <select className="cv-select" value={f.subcategory || ''} onChange={(e) => set({ subcategory: e.target.value })}>
            <option value="">—</option>
            {sel.subs.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </Field>
        <Field label="Status">
          <select className="cv-select" value={f.status || 'Scheduled'} onChange={(e) => set({ status: e.target.value as EventStatus })}>
            {EVENT_STATUSES.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </Field>
        <Field label="Description" className="full">
          <textarea className="cv-textarea" rows={3} value={f.description || ''} onChange={(e) => set({ description: e.target.value })} />
        </Field>
      </fieldset>
      <fieldset className="cv-fieldset" disabled={readOnly}>
        <legend>Schedule</legend>
        <Field label="Start date *">
          <input type="date" className="cv-input" value={f.date} onChange={(e) => set({ date: e.target.value })} />
        </Field>
        <Field label="End date">
          <input type="date" className="cv-input" value={f.endDate || ''} min={f.date} onChange={(e) => set({ endDate: e.target.value })} />
        </Field>
        <Field label="Start time">
          <input type="time" className="cv-input" value={f.time || ''} onChange={(e) => set({ time: e.target.value })} />
        </Field>
        <Field label="End time">
          <input type="time" className="cv-input" value={f.endTime || ''} onChange={(e) => set({ endTime: e.target.value })} />
        </Field>
        <Field label="Location">
          <input className="cv-input" value={f.location || ''} placeholder="e.g. Site, Tagaytay" onChange={(e) => set({ location: e.target.value })} />
        </Field>
        <Field label="Project phase">
          <input className="cv-input" value={f.phase || ''} placeholder="e.g. 2F Structural" onChange={(e) => set({ phase: e.target.value })} />
        </Field>
      </fieldset>
      <fieldset className="cv-fieldset" disabled={readOnly}>
        <legend>People</legend>
        <Field label="Responsible department">
          <input className="cv-input" list="pc-depts" value={f.department || ''} onChange={(e) => set({ department: e.target.value })} />
          <datalist id="pc-depts">
            {DEPARTMENTS.map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>
        </Field>
        <Field label="Assigned personnel" className="full" hint="Separate names with commas. Names are internal — stakeholders see only the department.">
          <input className="cv-input" value={(f.personnel || []).join(', ')} onChange={(e) => set({ personnel: e.target.value.split(',').map((x) => x.trimStart()) })} />
        </Field>
        <Field label="Additional notes (internal)" className="full">
          <textarea className="cv-textarea" rows={2} value={f.notes || ''} onChange={(e) => set({ notes: e.target.value })} />
        </Field>
      </fieldset>
      <fieldset className="cv-fieldset" disabled={readOnly}>
        <legend>Photos and attachments (Google Drive)</legend>
        <div className="full pc-files">
          {(f.photos || []).map((p, i) => (
            <figure key={p.fileId}>
              <SecureImg src={driveFileUrl(p.fileId)} alt={p.caption || 'Event photo'} />
              <input className="cv-input" aria-label="Photo caption" placeholder="Caption" value={p.caption || ''} onChange={(e) => set({ photos: (f.photos || []).map((x, j) => (j === i ? { ...x, caption: e.target.value } : x)) })} />
              {!readOnly && (
                <button type="button" className="cv-linkbtn" onClick={() => set({ photos: (f.photos || []).filter((_, j) => j !== i) })}>
                  Remove
                </button>
              )}
            </figure>
          ))}
        </div>
        <ul className="full pc-attach">
          {(f.attachments || []).map((a, i) => (
            <li key={i}>
              <Paperclip size={14} aria-hidden /> {a.title}
              {!readOnly && (
                <button type="button" className="cv-linkbtn" onClick={() => set({ attachments: (f.attachments || []).filter((_, j) => j !== i) })}>
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
        {!readOnly && (
          <div className="full cv-row">
            <label className={`cv-btn sm ${busy ? 'disabled' : ''}`}>
              <ImagePlus size={14} aria-hidden /> {busy === 'photo' ? 'Uploading…' : 'Upload Photos'}
              <input type="file" accept="image/*" multiple hidden disabled={!!busy} onChange={(e) => (upload(e.target.files, 'photo'), (e.target.value = ''))} />
            </label>
            <label className={`cv-btn sm ${busy ? 'disabled' : ''}`}>
              <Paperclip size={14} aria-hidden /> {busy === 'document' ? 'Uploading…' : 'Attach Documents'}
              <input type="file" multiple hidden disabled={!!busy} onChange={(e) => (upload(e.target.files, 'document'), (e.target.value = ''))} />
            </label>
          </div>
        )}
      </fieldset>
      <fieldset className="cv-fieldset" disabled={readOnly}>
        <legend>Visibility</legend>
        <label className="pc-radio">
          <input type="radio" name="vis" checked={f.visibility === 'stakeholder'} onChange={() => set({ visibility: 'stakeholder' })} />
          <span>
            <b>Stakeholder-visible</b> — can be published to the client portal&apos;s Production Calendar (no personnel names or internal notes).
          </span>
        </label>
        <label className="pc-radio">
          <input type="radio" name="vis" checked={f.visibility !== 'stakeholder'} onChange={() => set({ visibility: 'internal' })} />
          <span>
            <b>Internal only</b> — shown in the internal Project Calendar only.
          </span>
        </label>
        {f.published && f.visibility !== 'stakeholder' && <p className="full cv-dim">Saving will remove this event from the stakeholder portal.</p>}
      </fieldset>
      {initial && (initial.history || []).length > 0 && (
        <details className="pc-hist">
          <summary>
            <History size={14} aria-hidden /> Change history ({(initial.history || []).length})
          </summary>
          <ul>
            {[...(initial.history || [])].reverse().map((h, i) => (
              <li key={i}>
                <b>{h.action}</b> · {h.by} · {new Date(h.at).toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                {h.from?.date && h.to?.date && h.from.date !== h.to.date && (
                  <span className="cv-dim">
                    {' '}
                    — {fmtDate(h.from.date)} → {fmtDate(h.to.date)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </Modal>
  );
};

