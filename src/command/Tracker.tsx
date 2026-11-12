/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * 03 — MASTER PROJECT TRACKER (activity register)
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useCommand } from './context.tsx';
import { RegisterActivity } from '../domain/register.ts';
import { fmtDate, fmtRange, isValidIso } from '../domain/dates.ts';
import { toCsv } from '../domain/reports.ts';
import { findDuplicates } from '../domain/validation.ts';
import { StatusPill, ProgressBar, Empty, Modal, Field, Banner, Pill, PRIORITY_HEX, downloadFile, kindColor } from './ui.tsx';
import { ActivityCategory } from '../types/index.ts';

type SortKey = 'id' | 'name' | 'workstream' | 'owner' | 'start' | 'finish' | 'status' | 'progress' | 'weight' | 'updated' | 'slip';

export function parseParams(param?: string): Record<string, string> {
  const out: Record<string, string> = {};
  (param || '').split('&').forEach((kv) => {
    const [k, v] = kv.split('=');
    if (k && v !== undefined) out[decodeURIComponent(k)] = decodeURIComponent(v);
  });
  return out;
}

export const Tracker: React.FC = () => {
  const { register, actions, isManager, route } = useCommand();
  const params = parseParams(route.param);
  const [q, setQ] = useState('');
  const [stream, setStream] = useState('');
  const [workstream, setWorkstream] = useState('');
  const [status, setStatus] = useState(params.status || '');
  const [owner, setOwner] = useState('');
  const [priority, setPriority] = useState('');
  const [onlyAttention, setOnlyAttention] = useState(false);
  const [department, setDepartment] = useState('');
  const [deadline, setDeadline] = useState('');
  const [sort, setSort] = useState<{ k: SortKey; dir: 1 | -1 }>({ k: 'start', dir: 1 });
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (params.status !== undefined) setStatus(params.status);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.param]);

  const workstreams = useMemo(() => Array.from(new Set(register.map((r) => r.workstream))).sort(), [register]);
  const owners = useMemo(() => Array.from(new Set(register.map((r) => r.owner.trim() || 'Unassigned'))).sort(), [register]);
  const departments = useMemo(() => Array.from(new Set(register.map((r) => r.department.trim() || 'Not yet provided'))).sort(), [register]);
  const { today } = useCommand();

  const rows = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const filtered = register.filter((r) => {
      if (ql && !`${r.id} ${r.name} ${r.workstream} ${r.owner} ${r.supporting} ${r.remarks} ${r.scopeOfWork}`.toLowerCase().includes(ql)) return false;
      if (stream && r.stream !== stream) return false;
      if (workstream && r.workstream !== workstream) return false;
      if (status && r.status !== status) return false;
      if (owner && (r.owner.trim() || 'Unassigned') !== owner) return false;
      if (priority && r.priority !== priority) return false;
      if (department && (r.department.trim() || 'Not yet provided') !== department) return false;
      if (deadline) {
        if (r.status === 'Completed' || !r.finish) return false;
        if (deadline === 'overdue' && !(r.finish < today)) return false;
        if (deadline !== 'overdue') {
          const lim = new Date(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10) + Number(deadline));
          const limIso = `${lim.getFullYear()}-${String(lim.getMonth() + 1).padStart(2, '0')}-${String(lim.getDate()).padStart(2, '0')}`;
          if (!(r.finish >= today && r.finish <= limIso)) return false;
        }
      }
      if (onlyAttention && !(r.status === 'Delayed' || (!r.owner.trim() && r.status !== 'Completed') || r.revisionCount >= 2 || r.priority === 'Critical')) return false;
      return true;
    });
    const val = (r: RegisterActivity): string | number => {
      switch (sort.k) {
        case 'id':
          return r.id;
        case 'name':
          return r.name.toLowerCase();
        case 'workstream':
          return r.workstream;
        case 'owner':
          return r.owner.toLowerCase() || 'zzz';
        case 'start':
          return r.start || '9999';
        case 'finish':
          return r.finish || '9999';
        case 'status':
          return r.status;
        case 'progress':
          return r.progress;
        case 'weight':
          return r.weight;
        case 'slip':
          return r.slipDays;
        case 'updated':
          return r.lastUpdated || '';
      }
    };
    return [...filtered].sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      return (va < vb ? -1 : va > vb ? 1 : 0) * sort.dir;
    });
  }, [register, q, stream, workstream, status, owner, priority, onlyAttention, sort, department, deadline, today]);

  const th = (k: SortKey, label: string, cls = '') => (
    <th
      className={`sortable ${cls}`}
      onClick={() => setSort((s) => ({ k, dir: s.k === k ? ((s.dir * -1) as 1 | -1) : 1 }))}
      aria-sort={sort.k === k ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}
    >
      {label} {sort.k === k ? (sort.dir === 1 ? '▲' : '▼') : ''}
    </th>
  );

  const exportCsv = () => {
    const csv = toCsv(
      [
        'Activity ID',
        'Activity',
        'Stream',
        'Workstream',
        'Scope of work',
        'Responsible',
        'Supporting',
        'Department',
        'Baseline start',
        'Baseline finish',
        'Current start',
        'Current finish',
        'Actual start',
        'Actual finish',
        'Baseline duration (wd)',
        'Status',
        'Weight %',
        'Actual progress %',
        'Planned progress % (today)',
        'Weighted accomplishment',
        'Dependencies',
        'Priority',
        'Commitment',
        'Revisions',
        'Remarks',
        'Last updated',
      ],
      rows.map((r) => [
        r.id,
        r.name,
        r.stream,
        r.workstream,
        r.scopeOfWork,
        r.owner,
        r.supporting,
        r.department,
        r.plannedStart,
        r.plannedFinish,
        r.start,
        r.finish,
        r.actualStart,
        r.actualFinish,
        r.baselineDuration,
        r.status,
        r.weight.toFixed(3),
        r.progress,
        r.plannedProgress,
        r.weightedActual.toFixed(3),
        r.dependsOn.join(' '),
        r.priority,
        r.commitment,
        r.revisionCount,
        r.remarks,
        r.lastUpdated || '',
      ])
    );
    downloadFile(`Convengers_Master_Tracker_${new Date().toISOString().slice(0, 10)}.csv`, csv, 'text/csv;charset=utf-8');
    actions.toast(`Exported ${rows.length} activities to CSV`);
  };

  const clear = () => {
    setQ('');
    setStream('');
    setWorkstream('');
    setStatus('');
    setOwner('');
    setPriority('');
    setOnlyAttention(false);
    setDepartment('');
    setDeadline('');
  };

  return (
    <div>
      <div className="cv-filters">
        <input type="search" className="cv-input" placeholder="Search activity, ID, owner, remarks…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search activities" />
        <select className="cv-select" value={stream} onChange={(e) => setStream(e.target.value)} aria-label="Stream">
          <option value="">All streams</option>
          <option>Construction</option>
          <option>Production</option>
          <option>Milestone</option>
        </select>
        <select className="cv-select" value={workstream} onChange={(e) => setWorkstream(e.target.value)} aria-label="Workstream">
          <option value="">All workstreams</option>
          {workstreams.map((w) => (
            <option key={w}>{w}</option>
          ))}
        </select>
        <select className="cv-select" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="">All statuses</option>
          {['Upcoming', 'Ongoing', 'Delayed', 'Completed', 'On Hold'].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select className="cv-select" value={owner} onChange={(e) => setOwner(e.target.value)} aria-label="Owner">
          <option value="">All owners</option>
          {owners.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
        <select className="cv-select" value={priority} onChange={(e) => setPriority(e.target.value)} aria-label="Priority">
          <option value="">All priorities</option>
          {['Critical', 'High', 'Medium', 'Low'].map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <select className="cv-select" value={department} onChange={(e) => setDepartment(e.target.value)} aria-label="Department">
          <option value="">All departments</option>
          {departments.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>
        <select className="cv-select" value={deadline} onChange={(e) => setDeadline(e.target.value)} aria-label="Deadline">
          <option value="">Any deadline</option>
          <option value="overdue">Overdue</option>
          <option value="7">Due in 7 days</option>
          <option value="14">Due in 14 days</option>
          <option value="30">Due in 30 days</option>
        </select>
        <label className="cv-row" style={{ fontSize: 13 }}>
          <input type="checkbox" checked={onlyAttention} onChange={(e) => setOnlyAttention(e.target.checked)} /> Needs attention
        </label>
        <button type="button" className="cv-btn ghost sm" onClick={clear}>
          Clear
        </button>
        <span className="cv-spacer" />
        <button type="button" className="cv-btn sm" onClick={exportCsv}>
          ⬇ CSV
        </button>
        {isManager && (
          <button type="button" className="cv-btn primary sm" onClick={() => setAdding(true)}>
            + Add activity
          </button>
        )}
      </div>
      <div className="cv-dim" style={{ marginBottom: 8 }}>
        Showing {rows.length} of {register.length} activities. Click a row to view or update it — changes save to the original record and appear in every module.
      </div>
      {rows.length ? (
        <div className="cv-table-wrap" style={{ maxHeight: '70vh' }}>
          <table className="cv-table">
            <thead>
              <tr>
                {th('name', 'Activity', 'sticky')}
                {th('id', 'ID')}
                {th('workstream', 'Workstream')}
                {th('owner', 'Responsible')}
                {th('start', 'Baseline → current')}
                {th('finish', 'Actual')}
                {th('status', 'Status')}
                {th('progress', 'Progress (act / plan)')}
                {th('weight', 'Weight')}
                {th('slip', 'Slip')}
                <th>Deps</th>
                <th>Priority</th>
                {th('updated', 'Updated')}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="clickable" onClick={() => actions.openActivity(r.id)}>
                  <td className="sticky" style={{ minWidth: 220, maxWidth: 320 }}>
                    <div className="cv-row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                      <span className="cv-dot" style={{ background: kindColor(r.kind, r.stream) }} />
                      <span className="cv-strong">{r.name}</span>
                    </div>
                    {r.remarks && <div className="cv-dim">{r.remarks.slice(0, 90)}</div>}
                  </td>
                  <td className="cv-dim nowrap">{r.id.length > 22 ? `${r.id.slice(0, 22)}…` : r.id}</td>
                  <td className="nowrap">{r.workstream}</td>
                  <td>
                    {r.owner || <span className="cv-late">Unassigned</span>}
                    <div className="cv-dim">{r.department || 'Dept. not yet provided'}</div>
                  </td>
                  <td className="nowrap">
                    <div>{fmtRange(r.plannedStart, r.plannedFinish)}</div>
                    {r.revisionCount > 0 && <div className="cv-late">→ {fmtRange(r.start, r.finish)}</div>}
                  </td>
                  <td className="nowrap cv-dim">
                    {r.actualStart ? fmtDate(r.actualStart, false) : '—'} / {r.actualFinish ? fmtDate(r.actualFinish, false) : '—'}
                  </td>
                  <td>
                    <StatusPill status={r.status} />
                  </td>
                  <td style={{ minWidth: 140 }}>
                    <ProgressBar actual={r.progress} planned={r.plannedProgress} />
                    <div className="cv-dim">
                      {r.progress}% / {r.plannedProgress}% {r.progressBasis !== 'physical' ? `(${r.progressBasis})` : ''}
                    </div>
                  </td>
                  <td className="num">{r.weight ? `${r.weight.toFixed(2)}%` : '—'}</td>
                  <td className={`num ${r.slipDays > 0 ? 'cv-late' : ''}`}>{r.slipDays ? `${r.slipDays > 0 ? '+' : ''}${r.slipDays}d` : '—'}</td>
                  <td className="num">{r.dependsOn.length || '—'}</td>
                  <td>
                    <Pill label={r.priority} color={PRIORITY_HEX[r.priority]} />
                  </td>
                  <td className="cv-dim nowrap">{r.lastUpdated ? fmtDate(r.lastUpdated.slice(0, 10), false) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty>
          No activities match these filters.{' '}
          <button type="button" className="cv-btn sm ghost" onClick={clear}>
            Clear filters
          </button>
        </Empty>
      )}
      {adding && <AddActivityModal onClose={() => setAdding(false)} />}
    </div>
  );
};

const AddActivityModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { register, actions, user } = useCommand();
  const [f, setF] = useState({ title: '', category: 'Construction' as ActivityCategory, startDate: '', endDate: '', owner: '', description: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const errors: string[] = [];
  if (!f.title.trim()) errors.push('Activity name is required.');
  if (!isValidIso(f.startDate)) errors.push('Start date is required.');
  if (f.endDate && f.endDate < f.startDate) errors.push('End date cannot be before start date.');
  const dupes = f.title.trim() ? findDuplicates(register, f.title, f.startDate || undefined, f.endDate || f.startDate || undefined) : [];

  const save = async () => {
    if (errors.length) return;
    setSaving(true);
    await actions.addActivity({
      title: f.title.trim(),
      description: f.description,
      category: f.category,
      status: 'Upcoming',
      startDate: f.startDate,
      endDate: f.endDate || f.startDate,
      owner: f.owner,
      notes: f.notes,
      isManual: true,
      updatedBy: user.name,
    });
    setSaving(false);
    onClose();
  };

  return (
    <Modal
      title="Add activity to the master register"
      sub="Use this for work not already covered by a scope, pour, milestone or episode. Existing records are never duplicated."
      onClose={onClose}
      width={640}
      footer={
        <>
          <button type="button" className="cv-btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="cv-btn primary" disabled={!!errors.length || saving || dupes.length > 0} onClick={save}>
            {saving ? 'Saving…' : 'Create activity'}
          </button>
        </>
      }
    >
      {dupes.length > 0 && (
        <Banner kind="error">
          An activity with this name already exists in the same dates: {dupes.map((d) => `${d.name} (${d.id}, ${fmtRange(d.start, d.finish)})`).join('; ')}. Update that record instead of
          creating a duplicate.
        </Banner>
      )}
      <div className="cv-fieldset">
        <Field label="Activity name" className="full">
          <input className="cv-input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        </Field>
        <Field label="Category">
          <select className="cv-select" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value as ActivityCategory })}>
            {['Construction', 'Production', 'Milestone', 'Concrete', 'Other'].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Responsible person">
          <input className="cv-input" value={f.owner} onChange={(e) => setF({ ...f, owner: e.target.value })} />
        </Field>
        <Field label="Planned start">
          <input type="date" className="cv-input" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} />
        </Field>
        <Field label="Planned finish">
          <input type="date" className="cv-input" value={f.endDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} />
        </Field>
        <Field label="Description" className="full">
          <textarea className="cv-textarea" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        </Field>
        <Field label="Remarks" className="full">
          <textarea className="cv-textarea" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        </Field>
      </div>
      {errors.length > 0 && f.title && <div className="cv-dim">{errors.join(' ')}</div>}
    </Modal>
  );
};
