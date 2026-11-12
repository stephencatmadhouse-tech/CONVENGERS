/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * 10 — ISSUES & ACCOUNTABILITY
 */

import React, { useMemo, useState } from 'react';
import { useCommand } from './context.tsx';
import { ProjectIssue, IssueSeverity, IssueStatus, IssueType } from '../types/index.ts';
import { ownerAccountability, AttentionCategory } from '../domain/attention.ts';
import { fmtDate, todayIso } from '../domain/dates.ts';
import { Card, Empty, Modal, Field, Banner, Pill, ConfirmDialog, Kpi } from './ui.tsx';

const SEV_HEX: Record<string, string> = { Critical: '#E5484D', High: '#F5A623', Medium: '#A34FEA', Low: '#9A9AA3', critical: '#E5484D', warn: '#F5A623', info: '#A34FEA' };
const STATUS_ISSUE_HEX: Record<IssueStatus, string> = { Open: '#E5484D', 'In Progress': '#A34FEA', Resolved: '#22A06B', Closed: '#C7C7D0' };

export const AttentionList: React.FC = () => {
  const { attention, actions } = useCommand();
  const [cat, setCat] = useState<string>('');
  const [sev, setSev] = useState<string>('');
  const cats = useMemo(() => {
    const m = new Map<AttentionCategory, number>();
    attention.forEach((a) => m.set(a.category, (m.get(a.category) || 0) + 1));
    return Array.from(m.entries());
  }, [attention]);
  const list = attention.filter((a) => (!cat || a.category === cat) && (!sev || a.severity === sev));
  return (
    <div className="cv-grid" style={{ gap: 12 }}>
      <div className="cv-filters">
        <button type="button" className={`cv-btn sm ${!cat ? 'purple' : 'ghost'}`} onClick={() => setCat('')}>
          All ({attention.length})
        </button>
        {cats.map(([c, n]) => (
          <button key={c} type="button" className={`cv-btn sm ${cat === c ? 'purple' : 'ghost'}`} onClick={() => setCat(cat === c ? '' : c)}>
            {c} ({n})
          </button>
        ))}
        <span className="cv-spacer" />
        <select className="cv-select" value={sev} onChange={(e) => setSev(e.target.value)} aria-label="Severity">
          <option value="">All severities</option>
          <option value="critical">Critical</option>
          <option value="warn">Warning</option>
          <option value="info">Info</option>
        </select>
      </div>
      {list.length ? (
        <div className="cv-table-wrap">
          <table className="cv-table">
            <thead>
              <tr>
                <th>Severity</th>
                <th>Category</th>
                <th className="sticky">Item</th>
                <th>Detail</th>
                <th>Owner</th>
                <th>Due</th>
              </tr>
            </thead>
            <tbody>
              {list.map((a) => (
                <tr key={a.id} className="clickable" onClick={() => (a.activityId ? actions.openActivity(a.activityId) : actions.navigate('issues/log'))}>
                  <td>
                    <Pill label={a.severity === 'warn' ? 'Warning' : a.severity === 'critical' ? 'Critical' : 'Info'} color={SEV_HEX[a.severity]} />
                  </td>
                  <td className="nowrap">{a.category}</td>
                  <td className="sticky cv-strong" style={{ minWidth: 200 }}>
                    {a.title}
                  </td>
                  <td className="cv-dim" style={{ minWidth: 260 }}>
                    {a.detail}
                  </td>
                  <td>{a.owner || <span className="cv-late">Unassigned</span>}</td>
                  <td className="nowrap">{fmtDate(a.due)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty>Nothing requires management attention in this category.</Empty>
      )}
    </div>
  );
};

function newIssueId(): string {
  const d = todayIso().replace(/-/g, '');
  return `ISS-${d}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

export const IssueLog: React.FC = () => {
  const { issues, canEdit, actions, register, isAdmin, sharedStorage } = useCommand();
  const [editing, setEditing] = useState<ProjectIssue | null>(null);
  const [status, setStatus] = useState<string>('open');
  const [type, setType] = useState<string>('');
  const [q, setQ] = useState('');
  const today = todayIso();
  const list = issues.filter((i) => {
    if (status === 'open' && (i.status === 'Resolved' || i.status === 'Closed')) return false;
    if (status && status !== 'open' && i.status !== status) return false;
    if (type && i.type !== type) return false;
    if (q && !`${i.id} ${i.title} ${i.description} ${i.owner}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  const blank = (): ProjectIssue => ({
    id: newIssueId(),
    type: 'Issue',
    title: '',
    description: '',
    severity: 'Medium',
    status: 'Open',
    owner: '',
    raisedDate: today,
    createdAt: '',
    createdBy: '',
    updatedAt: '',
    updatedBy: '',
  });

  return (
    <div className="cv-grid" style={{ gap: 12 }}>
      {!sharedStorage.issues && (
        <Banner kind="warn">Shared issue storage is not available yet — new issues are saved on this device only until the updated Firestore rules are deployed.</Banner>
      )}
      <div className="cv-kpis">
        <Kpi label="Open" value={issues.filter((i) => i.status === 'Open').length} color="#E5484D" />
        <Kpi label="In progress" value={issues.filter((i) => i.status === 'In Progress').length} />
        <Kpi label="Critical / high open" value={issues.filter((i) => (i.severity === 'Critical' || i.severity === 'High') && i.status !== 'Resolved' && i.status !== 'Closed').length} />
        <Kpi label="Overdue resolution" value={issues.filter((i) => i.dueDate && i.dueDate < today && i.status !== 'Resolved' && i.status !== 'Closed').length} color="#E5484D" />
        <Kpi label="Decisions pending" value={issues.filter((i) => (i.decisionRequired || i.type === 'Decision') && i.status !== 'Resolved' && i.status !== 'Closed').length} />
      </div>
      <div className="cv-filters">
        <input type="search" className="cv-input" placeholder="Search issues…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search issues" />
        <select className="cv-select" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="open">Unresolved</option>
          <option value="">All</option>
          {['Open', 'In Progress', 'Resolved', 'Closed'].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select className="cv-select" value={type} onChange={(e) => setType(e.target.value)} aria-label="Type">
          <option value="">All types</option>
          {['Issue', 'Risk', 'Decision'].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <span className="cv-spacer" />
        {canEdit && (
          <button type="button" className="cv-btn primary sm" onClick={() => setEditing(blank())}>
            + Log issue / risk / decision
          </button>
        )}
      </div>
      {list.length ? (
        <div className="cv-table-wrap">
          <table className="cv-table">
            <thead>
              <tr>
                <th className="sticky">Issue</th>
                <th>Type</th>
                <th>Severity</th>
                <th>Status</th>
                <th>Owner</th>
                <th>Linked activity</th>
                <th>Raised</th>
                <th>Resolve by</th>
                <th>Corrective action</th>
              </tr>
            </thead>
            <tbody>
              {list.map((i) => {
                const act = register.find((r) => r.id === i.linkedActivityId);
                const overdue = i.dueDate && i.dueDate < today && i.status !== 'Resolved' && i.status !== 'Closed';
                return (
                  <tr key={i.id} className="clickable" onClick={() => setEditing(i)}>
                    <td className="sticky" style={{ minWidth: 220 }}>
                      <div className="cv-strong">{i.title}</div>
                      <div className="cv-dim">
                        {i.id}
                        {i.localOnly ? ' · this device only' : ''}
                      </div>
                    </td>
                    <td>{i.type}</td>
                    <td>
                      <Pill label={i.severity} color={SEV_HEX[i.severity]} />
                    </td>
                    <td>
                      <Pill label={i.status} color={STATUS_ISSUE_HEX[i.status]} />
                    </td>
                    <td>{i.owner || <span className="cv-late">Unassigned</span>}</td>
                    <td className="cv-dim">{act ? act.name : '—'}</td>
                    <td className="nowrap">{fmtDate(i.raisedDate)}</td>
                    <td className={`nowrap ${overdue ? 'cv-late' : ''}`}>{fmtDate(i.dueDate)}</td>
                    <td className="cv-dim" style={{ minWidth: 200 }}>
                      {i.correctiveAction || '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty>{issues.length ? 'No issues match the filter.' : 'No issues, risks or decisions have been logged yet.'}</Empty>
      )}
      {editing && <IssueEditor issue={editing} onClose={() => setEditing(null)} canDelete={isAdmin} />}
    </div>
  );
};

const IssueEditor: React.FC<{ issue: ProjectIssue; onClose: () => void; canDelete: boolean }> = ({ issue, onClose, canDelete }) => {
  const { actions, canEdit, register, user } = useCommand();
  const [f, setF] = useState<ProjectIssue>(issue);
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const isNew = !issue.createdAt;
  const errors: string[] = [];
  if (!f.title.trim()) errors.push('Title is required.');
  if (!f.owner.trim()) errors.push('Every issue needs a responsible owner.');
  if (f.dueDate && f.dueDate < f.raisedDate) errors.push('Resolution deadline cannot be before the raised date.');
  const set = <K extends keyof ProjectIssue>(k: K, v: ProjectIssue[K]) => setF((x) => ({ ...x, [k]: v }));
  const save = async () => {
    if (errors.length) return;
    setBusy(true);
    const now = new Date().toISOString();
    await actions.saveIssue({
      ...f,
      title: f.title.trim(),
      createdAt: f.createdAt || now,
      createdBy: f.createdBy || user.name,
      updatedAt: now,
      updatedBy: user.name,
    });
    setBusy(false);
    onClose();
  };
  return (
    <Modal
      title={isNew ? 'Log issue, risk or decision' : f.title}
      sub={f.id}
      onClose={onClose}
      width={720}
      footer={
        <>
          {canDelete && !isNew && (
            <button type="button" className="cv-btn danger" style={{ marginRight: 'auto' }} onClick={() => setConfirmDel(true)}>
              Delete
            </button>
          )}
          <button type="button" className="cv-btn ghost" onClick={onClose}>
            Cancel
          </button>
          {canEdit && (
            <button type="button" className="cv-btn primary" onClick={save} disabled={busy || errors.length > 0}>
              {busy ? 'Saving…' : 'Save'}
            </button>
          )}
        </>
      }
    >
      {errors.length > 0 && f.title && <Banner kind="error">{errors.join(' ')}</Banner>}
      <fieldset className="cv-fieldset" disabled={!canEdit}>
        <legend>Issue</legend>
        <Field label="Title" className="full">
          <input className="cv-input" value={f.title} onChange={(e) => set('title', e.target.value)} />
        </Field>
        <Field label="Type">
          <select className="cv-select" value={f.type} onChange={(e) => set('type', e.target.value as IssueType)}>
            {['Issue', 'Risk', 'Decision'].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="Severity">
          <select className="cv-select" value={f.severity} onChange={(e) => set('severity', e.target.value as IssueSeverity)}>
            {['Low', 'Medium', 'High', 'Critical'].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="Status">
          <select className="cv-select" value={f.status} onChange={(e) => set('status', e.target.value as IssueStatus)}>
            {['Open', 'In Progress', 'Resolved', 'Closed'].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="Linked activity">
          <select className="cv-select" value={f.linkedActivityId || ''} onChange={(e) => set('linkedActivityId', e.target.value || undefined)}>
            <option value="">— none —</option>
            {register.map((r) => (
              <option key={r.id} value={r.id}>
                {r.workstream} · {r.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Description / outstanding concern" className="full">
          <textarea className="cv-textarea" value={f.description} onChange={(e) => set('description', e.target.value)} />
        </Field>
      </fieldset>
      <fieldset className="cv-fieldset" disabled={!canEdit}>
        <legend>Accountability</legend>
        <Field label="Owner (responsible)">
          <input className="cv-input" value={f.owner} onChange={(e) => set('owner', e.target.value)} />
        </Field>
        <Field label="Supporting personnel">
          <input className="cv-input" value={f.supporting || ''} onChange={(e) => set('supporting', e.target.value)} />
        </Field>
        <Field label="Raised on">
          <input type="date" className="cv-input" value={f.raisedDate} onChange={(e) => set('raisedDate', e.target.value)} />
        </Field>
        <Field label="Resolution deadline">
          <input type="date" className="cv-input" value={f.dueDate || ''} onChange={(e) => set('dueDate', e.target.value || undefined)} />
        </Field>
        <label className="cv-row full" style={{ fontSize: 13 }}>
          <input type="checkbox" checked={!!f.decisionRequired} onChange={(e) => set('decisionRequired', e.target.checked)} /> Requires management decision / approval
        </label>
        <Field label="Corrective action" className="full">
          <textarea className="cv-textarea" value={f.correctiveAction || ''} onChange={(e) => set('correctiveAction', e.target.value)} />
        </Field>
        <Field label="Resolution notes" className="full">
          <textarea className="cv-textarea" value={f.resolution || ''} onChange={(e) => set('resolution', e.target.value)} />
        </Field>
      </fieldset>
      {!isNew && (
        <div className="cv-dim">
          Created {fmtDate(f.createdAt.slice(0, 10))} by {f.createdBy} · last updated {fmtDate(f.updatedAt.slice(0, 10))} by {f.updatedBy}
        </div>
      )}
      {confirmDel && (
        <ConfirmDialog
          title="Delete this issue?"
          message="The record will be removed from the shared log. Consider setting it to Closed instead to keep history."
          confirmLabel="Delete"
          danger
          onCancel={() => setConfirmDel(false)}
          onConfirm={async () => {
            setConfirmDel(false);
            await actions.deleteIssue(f.id);
            onClose();
          }}
        />
      )}
    </Modal>
  );
};

export const Accountability: React.FC = () => {
  const { register, issues, actions } = useCommand();
  const loads = useMemo(() => ownerAccountability(register, issues), [register, issues]);
  const [owner, setOwner] = useState<string | null>(null);
  const items = owner ? register.filter((r) => (r.owner.trim() || 'Unassigned') === owner && r.status !== 'Completed') : [];
  return (
    <div className="cv-grid cv-g2" style={{ alignItems: 'start' }}>
      <Card title="Ownership & workload" note="Every task must have a responsible person">
        <div className="cv-table-wrap">
          <table className="cv-table">
            <thead>
              <tr>
                <th>Owner</th>
                <th className="num">Ongoing</th>
                <th className="num">Delayed</th>
                <th className="num">Upcoming</th>
                <th className="num">Done</th>
                <th className="num">Open issues</th>
              </tr>
            </thead>
            <tbody>
              {loads.map((l) => (
                <tr key={l.owner} className="clickable" onClick={() => setOwner(l.owner)} style={owner === l.owner ? { outline: '2px solid #A34FEA' } : undefined}>
                  <td className={l.owner === 'Unassigned' ? 'cv-late' : 'cv-strong'}>{l.owner}</td>
                  <td className="num">{l.ongoing}</td>
                  <td className={`num ${l.delayed ? 'cv-late' : ''}`}>{l.delayed}</td>
                  <td className="num">{l.upcoming}</td>
                  <td className="num">{l.completed}</td>
                  <td className="num">{l.openIssues}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title={owner ? `Open tasks — ${owner}` : 'Select an owner'} note={owner ? `${items.length} open task(s)` : 'Click a row to see that person’s open tasks'}>
        {owner ? (
          items.length ? (
            <div className="cv-list">
              {items.map((r) => (
                <button type="button" key={r.id} className="cv-li clickable" style={{ textAlign: 'left', color: 'inherit' }} onClick={() => actions.openActivity(r.id)}>
                  <div className="cv-li-main">
                    <div className="cv-li-t">{r.name}</div>
                    <div className="cv-li-s">
                      {r.workstream} · due {fmtDate(r.finish)} · {r.status} · {r.progress}%
                    </div>
                    {r.concern && <div className="cv-li-s cv-late">Concern: {r.concern}</div>}
                  </div>
                  <Pill label={r.priority} />
                </button>
              ))}
            </div>
          ) : (
            <Empty>No open tasks.</Empty>
          )
        ) : (
          <Empty>Choose an owner on the left.</Empty>
        )}
      </Card>
    </div>
  );
};
