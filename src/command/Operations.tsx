/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * PROCUREMENT & MATERIALS MONITORING and MANPOWER SCHEDULES.
 * Records are entered by the project team; nothing is pre-filled or estimated.
 */

import React, { useMemo, useState } from 'react';
import { useCommand } from './context.tsx';
import { ProcurementItem, ProcurementStatus, ManpowerPlan } from '../types/index.ts';
import { procurementStore, manpowerStore } from '../firebase/opsStores.ts';
import { useStore } from '../firebase/useStore.ts';
import { newId } from '../firebase/collectionStore.ts';
import { firestoreData } from '../firebase/firestoreData.ts';
import { addDays, fmtDate, fmtRange, isValidIso } from '../domain/dates.ts';
import { toCsv } from '../domain/reports.ts';
import { Banner, Card, Empty, Field, Kpi, Modal, Pill, downloadFile, ConfirmDialog } from './ui.tsx';

const P_STATUSES: ProcurementStatus[] = ['Required', 'For Canvass', 'Ordered', 'Partially Delivered', 'Delivered', 'Delayed', 'Cancelled'];
const P_COLOR: Record<string, string> = {
  Required: '#9A9AA3',
  'For Canvass': '#F5A623',
  Ordered: '#7026C8',
  'Partially Delivered': '#8B35E8',
  Delivered: '#22A06B',
  Delayed: '#E5484D',
  Cancelled: '#9A9AA3',
};

/** A delivery is late when it is past its expected (or required) date and not delivered / cancelled. */
export function isDeliveryLate(p: ProcurementItem, today: string): boolean {
  if (p.status === 'Delivered' || p.status === 'Cancelled') return false;
  if (p.status === 'Delayed') return true;
  const due = p.expectedDelivery || p.requiredDate;
  return !!due && due < today;
}

export function deliveryEvents(items: ProcurementItem[]) {
  return items
    .filter((p) => !p.archived && p.status !== 'Cancelled' && (p.actualDelivery || p.expectedDelivery || p.requiredDate))
    .map((p) => {
      const d = (p.actualDelivery || p.expectedDelivery || p.requiredDate)!;
      return { id: `PRC:${p.id}`, title: `Delivery: ${p.material}`, start: d, end: d, status: p.status, route: 'procurement' };
    });
}

export const Procurement: React.FC = () => {
  const { register, canEdit, isAdmin, today, actions, user } = useCommand();
  const store = useStore(procurementStore);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [supplier, setSupplier] = useState('');
  const [view, setView] = useState<'active' | 'late' | 'archived' | 'all'>('active');
  const [editing, setEditing] = useState<ProcurementItem | null>(null);

  const items = store.items;
  const suppliers = useMemo(() => Array.from(new Set(items.map((p) => p.supplier || '').filter(Boolean))).sort(), [items]);
  const rows = items.filter((p) => {
    if (view === 'active' && p.archived) return false;
    if (view === 'archived' && !p.archived) return false;
    if (view === 'late' && (p.archived || !isDeliveryLate(p, today))) return false;
    if (status && p.status !== status) return false;
    if (supplier && p.supplier !== supplier) return false;
    if (q && !`${p.id} ${p.material} ${p.description} ${p.supplier} ${p.poNumber} ${p.remarks}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });
  const active = items.filter((p) => !p.archived);
  const pending = active.filter((p) => ['Required', 'For Canvass', 'Ordered', 'Partially Delivered'].includes(p.status)).length;
  const delivered = active.filter((p) => p.status === 'Delivered').length;
  const late = active.filter((p) => isDeliveryLate(p, today)).length;
  const due14 = active.filter((p) => !isDeliveryLate(p, today) && p.status !== 'Delivered' && p.status !== 'Cancelled' && (p.expectedDelivery || p.requiredDate || '9999') <= addDays(today, 14)).length;

  const blank = (): ProcurementItem => ({
    id: newId('PRC'),
    material: '',
    status: 'Required',
    createdAt: '',
    createdBy: '',
    updatedAt: '',
    updatedBy: '',
  });

  const exportCsv = () =>
    downloadFile(
      `Convengers_Procurement_${today}.csv`,
      toCsv(
        ['ID', 'Material', 'Description', 'Qty', 'Unit', 'Linked activity', 'Supplier', 'Supplier contact', 'PO no.', 'Required on site', 'Order date', 'Expected delivery', 'Actual delivery', 'Status', 'Late', 'Remarks'],
        rows.map((p) => [
          p.id,
          p.material,
          p.description,
          p.quantity,
          p.unit,
          register.find((r) => r.id === p.linkedActivityId)?.name || '',
          p.supplier,
          p.supplierContact,
          p.poNumber,
          p.requiredDate,
          p.orderDate,
          p.expectedDelivery,
          p.actualDelivery,
          p.status,
          isDeliveryLate(p, today) ? 'Yes' : '',
          p.remarks,
        ])
      ),
      'text/csv;charset=utf-8'
    );

  return (
    <div className="cv-grid" style={{ gap: 14 }}>
      {!store.shared && store.loaded && <Banner kind="warn">Shared procurement storage is not available yet (deploy the updated Firestore rules). New records are kept on this device only.</Banner>}
      <div className="cv-kpis">
        <Kpi label="Pending orders" value={pending} sub="Required · canvass · ordered · partial" />
        <Kpi label="Received materials" value={delivered} color="#22A06B" />
        <Kpi label="Delayed deliveries" value={late} color={late ? '#E5484D' : undefined} sub="Past expected / required date" />
        <Kpi label="Due in 14 days" value={due14} color="#F5A623" />
        <Kpi label="Tracked items" value={active.length} />
      </div>
      <div className="cv-filters">
        <input type="search" className="cv-input" placeholder="Search material, supplier, PO…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search procurement" />
        <select className="cv-select" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="">All statuses</option>
          {P_STATUSES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select className="cv-select" value={supplier} onChange={(e) => setSupplier(e.target.value)} aria-label="Supplier">
          <option value="">All suppliers</option>
          {suppliers.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        {(['active', 'late', 'archived', 'all'] as const).map((v) => (
          <button key={v} type="button" className={`cv-btn sm ${view === v ? 'purple' : 'ghost'}`} onClick={() => setView(v)}>
            {v === 'active' ? 'Active' : v === 'late' ? 'Delayed' : v === 'archived' ? 'Archived' : 'All'}
          </button>
        ))}
        <span className="cv-spacer" />
        <button type="button" className="cv-btn sm" onClick={exportCsv}>
          ⬇ CSV
        </button>
        {canEdit && (
          <button type="button" className="cv-btn primary sm" onClick={() => setEditing(blank())}>
            + Add material / order
          </button>
        )}
      </div>
      {rows.length ? (
        <div className="cv-table-wrap">
          <table className="cv-table">
            <thead>
              <tr>
                <th className="sticky">Material</th>
                <th>Linked activity</th>
                <th>Supplier</th>
                <th>Qty</th>
                <th>Needed on site</th>
                <th>Ordered</th>
                <th>Expected delivery</th>
                <th>Received</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const lateNow = isDeliveryLate(p, today);
                return (
                  <tr key={p.id} className="clickable" onClick={() => setEditing(p)}>
                    <td className="sticky" style={{ minWidth: 200 }}>
                      <div className="cv-strong">{p.material}</div>
                      <div className="cv-dim">
                        {p.id}
                        {p.poNumber ? ` · PO ${p.poNumber}` : ''}
                        {p.localOnly ? ' · this device only' : ''}
                        {p.archived ? ' · archived' : ''}
                      </div>
                    </td>
                    <td className="cv-dim">{register.find((r) => r.id === p.linkedActivityId)?.name || '—'}</td>
                    <td>
                      {p.supplier || <span className="cv-dim">Not yet provided</span>}
                      {p.supplierContact && <div className="cv-dim">{p.supplierContact}</div>}
                    </td>
                    <td className="num">{p.quantity !== undefined && p.quantity !== null ? `${p.quantity} ${p.unit || ''}` : '—'}</td>
                    <td className="nowrap">{fmtDate(p.requiredDate)}</td>
                    <td className="nowrap">{fmtDate(p.orderDate)}</td>
                    <td className={`nowrap ${lateNow ? 'cv-late' : ''}`}>{fmtDate(p.expectedDelivery)}</td>
                    <td className="nowrap">{fmtDate(p.actualDelivery)}</td>
                    <td>
                      <Pill label={lateNow && p.status !== 'Delayed' ? `${p.status} · late` : p.status} color={lateNow ? '#E5484D' : P_COLOR[p.status]} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty>
          {items.length
            ? 'No materials match these filters.'
            : 'No material requirements or orders have been recorded yet. Add the materials needed for upcoming activities to monitor procurement and deliveries.'}
        </Empty>
      )}
      {editing && (
        <ProcurementEditor
          item={editing}
          onClose={() => setEditing(null)}
          canDelete={isAdmin}
          onSaved={async (rec, isNew) => {
            const res = await procurementStore.put(rec);
            await firestoreData.logAudit(user, isNew ? 'ADD_PROCUREMENT' : 'UPDATE_PROCUREMENT', 'Procurement', rec.id, rec.material);
            actions.toast(res === 'shared' ? 'Procurement record saved' : 'Saved on this device only (shared storage unavailable)');
          }}
        />
      )}
    </div>
  );
};

const ProcurementEditor: React.FC<{ item: ProcurementItem; onClose: () => void; canDelete: boolean; onSaved: (p: ProcurementItem, isNew: boolean) => Promise<void> }> = ({
  item,
  onClose,
  canDelete,
  onSaved,
}) => {
  const { register, canEdit, user, actions } = useCommand();
  const [f, setF] = useState<ProcurementItem>(item);
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const isNew = !item.createdAt;
  const set = <K extends keyof ProcurementItem>(k: K, v: ProcurementItem[K]) => setF((x) => ({ ...x, [k]: v }));
  const errors: string[] = [];
  if (!f.material.trim()) errors.push('Material is required.');
  if (f.quantity !== undefined && f.quantity !== null && (isNaN(f.quantity) || f.quantity < 0)) errors.push('Quantity must be a positive number.');
  if (f.orderDate && f.actualDelivery && f.actualDelivery < f.orderDate) errors.push('Received date cannot be before the order date.');
  if (f.status === 'Delivered' && !f.actualDelivery) errors.push('Enter the date the material was received.');
  const save = async () => {
    if (errors.length) return;
    setBusy(true);
    const now = new Date().toISOString();
    await onSaved({ ...f, material: f.material.trim(), createdAt: f.createdAt || now, createdBy: f.createdBy || user.name, updatedAt: now, updatedBy: user.name }, isNew);
    setBusy(false);
    onClose();
  };
  return (
    <Modal
      title={isNew ? 'Add material / order' : f.material}
      sub={f.id}
      onClose={onClose}
      width={760}
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
            <button type="button" className="cv-btn primary" disabled={busy || errors.length > 0} onClick={save}>
              {busy ? 'Saving…' : 'Save'}
            </button>
          )}
        </>
      }
    >
      {errors.length > 0 && f.material && <Banner kind="error">{errors.join(' ')}</Banner>}
      <fieldset className="cv-fieldset" disabled={!canEdit}>
        <legend>Material requirement</legend>
        <Field label="Material" className="full">
          <input className="cv-input" value={f.material} onChange={(e) => set('material', e.target.value)} placeholder="e.g. 16mm deformed bars" />
        </Field>
        <Field label="Description / specification" className="full">
          <input className="cv-input" value={f.description || ''} onChange={(e) => set('description', e.target.value)} />
        </Field>
        <Field label="Quantity">
          <input type="number" min={0} className="cv-input" value={f.quantity ?? ''} onChange={(e) => set('quantity', e.target.value === '' ? undefined : Number(e.target.value))} />
        </Field>
        <Field label="Unit">
          <input className="cv-input" value={f.unit || ''} onChange={(e) => set('unit', e.target.value)} placeholder="pcs, bags, m³…" />
        </Field>
        <Field label="Needed on site by">
          <input type="date" className="cv-input" value={f.requiredDate || ''} onChange={(e) => set('requiredDate', e.target.value || undefined)} />
        </Field>
        <Field label="Linked activity">
          <select className="cv-select" value={f.linkedActivityId || ''} onChange={(e) => set('linkedActivityId', e.target.value || undefined)}>
            <option value="">— none —</option>
            {register
              .filter((r) => r.stream === 'Construction')
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.workstream} · {r.name}
                </option>
              ))}
          </select>
        </Field>
      </fieldset>
      <fieldset className="cv-fieldset" disabled={!canEdit}>
        <legend>Supplier & purchase</legend>
        <Field label="Supplier">
          <input className="cv-input" value={f.supplier || ''} onChange={(e) => set('supplier', e.target.value)} />
        </Field>
        <Field label="Supplier contact">
          <input className="cv-input" value={f.supplierContact || ''} onChange={(e) => set('supplierContact', e.target.value)} />
        </Field>
        <Field label="PO / reference no.">
          <input className="cv-input" value={f.poNumber || ''} onChange={(e) => set('poNumber', e.target.value)} />
        </Field>
        <Field label="Status">
          <select className="cv-select" value={f.status} onChange={(e) => set('status', e.target.value as ProcurementStatus)}>
            {P_STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="Order date">
          <input type="date" className="cv-input" value={f.orderDate || ''} onChange={(e) => set('orderDate', e.target.value || undefined)} />
        </Field>
        <Field label="Expected delivery">
          <input type="date" className="cv-input" value={f.expectedDelivery || ''} onChange={(e) => set('expectedDelivery', e.target.value || undefined)} />
        </Field>
        <Field label="Received on">
          <input type="date" className="cv-input" value={f.actualDelivery || ''} onChange={(e) => set('actualDelivery', e.target.value || undefined)} />
        </Field>
        <Field label="Remarks" className="full">
          <textarea className="cv-textarea" value={f.remarks || ''} onChange={(e) => set('remarks', e.target.value)} />
        </Field>
      </fieldset>
      {!isNew && <div className="cv-dim">Created {fmtDate(f.createdAt.slice(0, 10))} by {f.createdBy} · updated {fmtDate(f.updatedAt.slice(0, 10))} by {f.updatedBy}</div>}
      {confirmDel && (
        <ConfirmDialog
          title="Delete this procurement record?"
          message="Consider archiving instead to keep the history."
          confirmLabel="Delete"
          danger
          onCancel={() => setConfirmDel(false)}
          onConfirm={async () => {
            setConfirmDel(false);
            await procurementStore.remove(f.id);
            await firestoreData.logAudit(user, 'DELETE_PROCUREMENT', 'Procurement', f.id, f.material);
            actions.toast('Procurement record deleted');
            onClose();
          }}
        />
      )}
    </Modal>
  );
};

// ---------------- Manpower ----------------
export function manpowerEvents(items: ManpowerPlan[]) {
  return items
    .filter((m) => !m.archived && isValidIso(m.start))
    .map((m) => ({ id: `MP:${m.id}`, title: `Manpower: ${m.trade}${m.headcount ? ` (${m.headcount})` : ''}`, start: m.start, end: m.end || m.start, status: 'Planned', route: 'construction/manpower' }));
}

export const Manpower: React.FC = () => {
  const { register, canEdit, isAdmin, today, actions, user } = useCommand();
  const store = useStore(manpowerStore);
  const procurement = useStore(procurementStore);
  const [editing, setEditing] = useState<ManpowerPlan | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const rows = store.items.filter((m) => showArchived || !m.archived);
  const onSiteToday = store.items.filter((m) => !m.archived && m.start <= today && (m.end || m.start) >= today);
  const blank = (): ManpowerPlan => ({ id: newId('MPW'), trade: '', start: today, end: today, createdAt: '', createdBy: '', updatedAt: '', updatedBy: '' });
  const deliveriesSoon = procurement.items.filter(
    (p) => !p.archived && p.status !== 'Delivered' && p.status !== 'Cancelled' && (p.expectedDelivery || p.requiredDate || '9999') <= addDays(today, 14)
  );

  return (
    <div className="cv-grid" style={{ gap: 14 }}>
      <div className="cv-kpis">
        <Kpi label="Crews on site today" value={onSiteToday.length} sub={onSiteToday.length ? `${onSiteToday.reduce((s, m) => s + (m.headcount || 0), 0)} workers recorded` : 'No manpower recorded for today'} />
        <Kpi label="Manpower plans" value={store.items.filter((m) => !m.archived).length} />
        <Kpi label="Deliveries due (14 days)" value={deliveriesSoon.length} color="#F5A623" />
      </div>
      <Card
        title="Manpower schedule"
        note="Trades and crews planned on site. Shown on the construction calendar."
        actions={
          <>
            <label className="cv-row" style={{ fontSize: 13 }}>
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived
            </label>
            {canEdit && (
              <button type="button" className="cv-btn primary sm" onClick={() => setEditing(blank())}>
                + Add manpower plan
              </button>
            )}
          </>
        }
      >
        {rows.length ? (
          <div className="cv-table-wrap">
            <table className="cv-table">
              <thead>
                <tr>
                  <th>Trade / crew</th>
                  <th>Team / contractor</th>
                  <th className="num">Headcount</th>
                  <th>Dates</th>
                  <th>Linked activity</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.id} className="clickable" onClick={() => setEditing(m)}>
                    <td className="cv-strong">
                      {m.trade}
                      {m.archived ? <span className="cv-dim"> · archived</span> : null}
                      {m.localOnly ? <span className="cv-dim"> · this device only</span> : null}
                    </td>
                    <td>{m.team || '—'}</td>
                    <td className="num">{m.headcount ?? '—'}</td>
                    <td className="nowrap">{fmtRange(m.start, m.end)}</td>
                    <td className="cv-dim">{register.find((r) => r.id === m.linkedActivityId)?.name || '—'}</td>
                    <td className="cv-dim">{m.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>No manpower schedules recorded yet.</Empty>
        )}
      </Card>
      <Card title="Material deliveries — next 14 days" note="From Procurement & Materials" actions={<button type="button" className="cv-btn sm" onClick={() => actions.navigate('procurement')}>Procurement</button>}>
        {deliveriesSoon.length ? (
          <div className="cv-list">
            {deliveriesSoon.map((p) => (
              <div key={p.id} className="cv-li">
                <div className="cv-li-main">
                  <div className="cv-li-t">{p.material}</div>
                  <div className="cv-li-s">
                    {p.supplier || 'Supplier not yet provided'} · expected {fmtDate(p.expectedDelivery || p.requiredDate)}
                  </div>
                </div>
                <Pill label={isDeliveryLate(p, today) ? 'Late' : p.status} color={isDeliveryLate(p, today) ? '#E5484D' : P_COLOR[p.status]} />
              </div>
            ))}
          </div>
        ) : (
          <Empty>No deliveries due in the next 14 days.</Empty>
        )}
      </Card>
      {editing && (
        <ManpowerEditor
          item={editing}
          canDelete={isAdmin}
          onClose={() => setEditing(null)}
          onSave={async (rec, isNew) => {
            const res = await manpowerStore.put(rec);
            await firestoreData.logAudit(user, isNew ? 'ADD_MANPOWER' : 'UPDATE_MANPOWER', 'Manpower', rec.id, rec.trade);
            actions.toast(res === 'shared' ? 'Manpower plan saved' : 'Saved on this device only (shared storage unavailable)');
          }}
          onDelete={async (id) => {
            await manpowerStore.remove(id);
            await firestoreData.logAudit(user, 'DELETE_MANPOWER', 'Manpower', id);
          }}
        />
      )}
    </div>
  );
};

const ManpowerEditor: React.FC<{ item: ManpowerPlan; canDelete: boolean; onClose: () => void; onSave: (m: ManpowerPlan, isNew: boolean) => Promise<void>; onDelete: (id: string) => Promise<void> }> = ({
  item,
  canDelete,
  onClose,
  onSave,
  onDelete,
}) => {
  const { register, canEdit, user } = useCommand();
  const [f, setF] = useState(item);
  const isNew = !item.createdAt;
  const set = <K extends keyof ManpowerPlan>(k: K, v: ManpowerPlan[K]) => setF((x) => ({ ...x, [k]: v }));
  const errors: string[] = [];
  if (!f.trade.trim()) errors.push('Trade / crew is required.');
  if (!isValidIso(f.start)) errors.push('Start date is required.');
  if (f.end && f.end < f.start) errors.push('End date cannot be before start date.');
  return (
    <Modal
      title={isNew ? 'Add manpower plan' : f.trade}
      sub={f.id}
      onClose={onClose}
      width={640}
      footer={
        <>
          {canDelete && !isNew && (
            <button
              type="button"
              className="cv-btn danger"
              style={{ marginRight: 'auto' }}
              onClick={async () => {
                await onDelete(f.id);
                onClose();
              }}
            >
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
            <button
              type="button"
              className="cv-btn primary"
              disabled={errors.length > 0}
              onClick={async () => {
                const now = new Date().toISOString();
                await onSave({ ...f, trade: f.trade.trim(), end: f.end || f.start, createdAt: f.createdAt || now, createdBy: f.createdBy || user.name, updatedAt: now, updatedBy: user.name }, isNew);
                onClose();
              }}
            >
              Save
            </button>
          )}
        </>
      }
    >
      {errors.length > 0 && f.trade && <Banner kind="error">{errors.join(' ')}</Banner>}
      <fieldset className="cv-fieldset" disabled={!canEdit}>
        <legend>Manpower</legend>
        <Field label="Trade / crew">
          <input className="cv-input" value={f.trade} onChange={(e) => set('trade', e.target.value)} placeholder="e.g. Steelmen, Masons" />
        </Field>
        <Field label="Team / contractor">
          <input className="cv-input" value={f.team || ''} onChange={(e) => set('team', e.target.value)} />
        </Field>
        <Field label="Headcount">
          <input type="number" min={0} className="cv-input" value={f.headcount ?? ''} onChange={(e) => set('headcount', e.target.value === '' ? undefined : Number(e.target.value))} />
        </Field>
        <Field label="Linked activity">
          <select className="cv-select" value={f.linkedActivityId || ''} onChange={(e) => set('linkedActivityId', e.target.value || undefined)}>
            <option value="">— none —</option>
            {register
              .filter((r) => r.stream === 'Construction')
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.workstream} · {r.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Start">
          <input type="date" className="cv-input" value={f.start} onChange={(e) => set('start', e.target.value)} />
        </Field>
        <Field label="End">
          <input type="date" className="cv-input" value={f.end} onChange={(e) => set('end', e.target.value)} />
        </Field>
        <Field label="Notes" className="full">
          <textarea className="cv-textarea" value={f.notes || ''} onChange={(e) => set('notes', e.target.value)} />
        </Field>
      </fieldset>
    </Modal>
  );
};
