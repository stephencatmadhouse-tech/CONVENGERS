/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Single editor for any register activity. Saves go back to the ORIGINAL
 * record (scope / pour / milestone / episode / activity) and to the
 * activity's control metadata, so every module updates together.
 */

import React, { useMemo, useState } from 'react';
import { RegisterActivity } from '../domain/register.ts';
import { validateActivityEdit, findDuplicates } from '../domain/validation.ts';
import { fmtDate, fmtRange } from '../domain/dates.ts';
import { useCommand, ActivityPatch } from './context.tsx';
import { Modal, Field, Banner, StatusPill, Pill, ProgressBar, PRIORITY_HEX } from './ui.tsx';

const MILESTONE_STATUSES = ['Upcoming', 'In progress', 'Complete', 'Delayed', 'Date passed · confirm'];
const POUR_STATUSES = [
  'Not Yet Started',
  'Preparation Ongoing',
  'Ready for Pouring',
  'Scheduled for Pouring',
  'Pouring Ongoing',
  'Pouring Completed',
  'Curing Ongoing',
  'Completed / Approved',
  'Delayed',
];
const EPISODE_STATUSES = ['Planned', 'For Confirmation', 'Scheduled', 'Completed', 'Rescheduled'];
const ACTIVITY_STATUSES = ['Upcoming', 'Ongoing', 'Completed', 'Delayed', 'On Hold'];

function sourceStatusOf(r: RegisterActivity, data: ReturnType<typeof useCommand>['data']): string {
  if (r.kind === 'milestone') return data.milestones.find((m) => m.id === r.sourceId)?.status || '';
  if (r.kind === 'pour') return data.pours.find((p) => p.id === r.sourceId)?.milestoneStatus || '';
  if (r.kind === 'episode') return data.episodes.find((e) => e.id === r.sourceId)?.status || '';
  if (r.kind === 'manual') return data.activities.find((a) => a.id === r.sourceId)?.status || '';
  return '';
}

export const ActivityEditor: React.FC<{ activity: RegisterActivity; onClose: () => void }> = ({ activity: r, onClose }) => {
  const { data, register, isManager, canEdit, actions, today } = useCommand();
  const initialStatus = sourceStatusOf(r, data);
  const [form, setForm] = useState({
    name: r.name,
    start: r.start || '',
    finish: r.finish || '',
    progress: r.progress,
    sourceStatus: initialStatus,
    actualStart: r.actualStart || '',
    actualFinish: r.actualFinish || '',
    owner: r.owner,
    supporting: r.supporting,
    priority: r.priority,
    commitment: r.commitment,
    dependsOn: r.dependsOn,
    remarks: r.remarks,
    concern: r.concern,
    correctiveAction: r.correctiveAction,
    resolutionDate: r.resolutionDate || '',
    onHold: r.onHold,
  });
  const [depQuery, setDepQuery] = useState('');
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const nameEditable = isManager && r.kind !== 'pour' && r.kind !== 'episode';
  const datesEditable = isManager;
  const pourActualsEditable = r.kind === 'pour' ? isManager : true;
  const progressEditable = canEdit && (r.kind === 'scope' || r.kind === 'manual');

  const check = useMemo(
    () =>
      validateActivityEdit(
        {
          name: form.name,
          start: form.start || undefined,
          finish: form.finish || undefined,
          actualStart: form.actualStart || undefined,
          actualFinish: form.actualFinish || undefined,
          progress: r.kind === 'scope' || r.kind === 'manual' ? Number(form.progress) : undefined,
          owner: r.kind === 'episode' ? undefined : form.owner,
        },
        today
      ),
    [form, r.kind, today]
  );
  const dupes = useMemo(
    () => (form.name.trim() !== r.name ? findDuplicates(register, form.name, form.start || undefined, form.finish || undefined, r.id) : []),
    [form.name, form.start, form.finish, register, r.id, r.name]
  );

  const depOptions = useMemo(() => {
    const q = depQuery.trim().toLowerCase();
    return register
      .filter((x) => x.id !== r.id && !form.dependsOn.includes(x.id))
      .filter((x) => !q || `${x.name} ${x.workstream} ${x.id}`.toLowerCase().includes(q))
      .slice(0, 8);
  }, [depQuery, register, r.id, form.dependsOn]);

  const save = async () => {
    if (check.errors.length) return;
    const patch: ActivityPatch = {};
    if (form.name.trim() !== r.name) patch.name = form.name.trim();
    if ((form.start || undefined) !== r.start) patch.start = form.start;
    if ((form.finish || undefined) !== r.finish) patch.finish = form.finish;
    if ((r.kind === 'scope' || r.kind === 'manual') && Number(form.progress) !== r.progress) patch.progress = Number(form.progress);
    if (form.sourceStatus !== initialStatus) patch.sourceStatus = form.sourceStatus;
    if ((form.actualStart || '') !== (r.actualStart || '')) patch.actualStart = form.actualStart;
    if ((form.actualFinish || '') !== (r.actualFinish || '')) patch.actualFinish = form.actualFinish;
    if (form.owner !== r.owner) patch.owner = form.owner;
    if (form.supporting !== r.supporting) patch.supporting = form.supporting;
    if (form.priority !== r.priority) patch.priority = form.priority;
    if (form.commitment !== r.commitment) patch.commitment = form.commitment;
    if (JSON.stringify(form.dependsOn) !== JSON.stringify(r.dependsOn)) patch.dependsOn = form.dependsOn;
    if (form.remarks !== r.remarks) patch.remarks = form.remarks;
    if (form.concern !== r.concern) patch.concern = form.concern;
    if (form.correctiveAction !== r.correctiveAction) patch.correctiveAction = form.correctiveAction;
    if ((form.resolutionDate || '') !== (r.resolutionDate || '')) patch.resolutionDate = form.resolutionDate;
    if (form.onHold !== r.onHold) patch.onHold = form.onHold;
    if (!Object.keys(patch).length) {
      actions.toast('No changes to save.');
      onClose();
      return;
    }
    setSaving(true);
    const ok = await actions.patchActivity(r, patch);
    setSaving(false);
    if (ok) onClose();
  };

  const statusOptions =
    r.kind === 'milestone' ? MILESTONE_STATUSES : r.kind === 'pour' ? POUR_STATUSES : r.kind === 'episode' ? EPISODE_STATUSES : r.kind === 'manual' ? ACTIVITY_STATUSES : [];

  const revisions = data.overrides[r.key]?.revisions || [];

  return (
    <Modal
      title={r.name}
      sub={
        <span className="cv-row" style={{ gap: 6 }}>
          <span className="cv-chip">{r.id}</span>
          <span className="cv-chip">{r.workstream}</span>
          <StatusPill status={r.status} />
          {r.lastUpdated && <span>Last updated {fmtDate(r.lastUpdated.slice(0, 10))}{r.updatedBy ? ` by ${r.updatedBy}` : ''}</span>}
        </span>
      }
      onClose={onClose}
      footer={
        <>
          <span className="cv-dim" style={{ marginRight: 'auto' }}>
            {canEdit ? (isManager ? 'Manager access: all fields editable.' : 'Staff access: status, progress, actual dates, ownership & notes.') : 'Read-only view.'}
          </span>
          <button type="button" className="cv-btn ghost" onClick={onClose}>
            {canEdit ? 'Cancel' : 'Close'}
          </button>
          {canEdit && (
            <button type="button" className="cv-btn primary" onClick={save} disabled={saving || check.errors.length > 0}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          )}
        </>
      }
    >
      {check.errors.length > 0 && (
        <Banner kind="error">
          {check.errors.map((e) => (
            <div key={e}>{e}</div>
          ))}
        </Banner>
      )}
      {dupes.length > 0 && (
        <Banner kind="warn">
          Possible duplicate: {dupes.map((d) => `${d.id} (${fmtRange(d.start, d.finish)})`).join(', ')}. Make sure this is not the same activity.
        </Banner>
      )}
      {check.warnings.length > 0 && canEdit && (
        <Banner kind="info">
          {check.warnings.map((e) => (
            <div key={e}>{e}</div>
          ))}
        </Banner>
      )}

      <fieldset className="cv-fieldset" disabled={!canEdit}>
        <legend>Activity</legend>
        <Field label="Activity name" className="full">
          <input className="cv-input" value={form.name} disabled={!nameEditable} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label="Workstream">
          <input className="cv-input" value={r.workstream} disabled />
        </Field>
        <Field label="Scope of work">
          <input className="cv-input" value={r.scopeOfWork} disabled />
        </Field>
        {r.description && (
          <Field label="Description" className="full">
            <input className="cv-input" value={r.description} disabled />
          </Field>
        )}
      </fieldset>

      <fieldset className="cv-fieldset" disabled={!canEdit}>
        <legend>Schedule — planned vs actual</legend>
        <Field label="Baseline (original plan)" hint={r.revisionCount ? `Preserved · ${r.revisionCount} revision(s)` : 'Current dates are the baseline'}>
          <input className="cv-input" value={fmtRange(r.plannedStart, r.plannedFinish)} disabled />
        </Field>
        <Field label={r.kind === 'episode' ? 'Shoot start' : r.kind === 'pour' ? 'Target pour' : 'Current start'}>
          <input type="date" className="cv-input" value={form.start} disabled={!datesEditable} onChange={(e) => set('start', e.target.value)} />
        </Field>
        <Field label={r.kind === 'episode' ? 'Shoot end' : r.kind === 'pour' ? 'Target completion' : 'Current finish'}>
          <input type="date" className="cv-input" value={form.finish} disabled={!datesEditable} onChange={(e) => set('finish', e.target.value)} />
        </Field>
        <Field label={r.kind === 'pour' ? 'Actual pour' : 'Actual start'}>
          <input type="date" className="cv-input" value={form.actualStart} max={today} disabled={!pourActualsEditable} onChange={(e) => set('actualStart', e.target.value)} />
        </Field>
        <Field label={r.kind === 'pour' ? 'Actual completion' : 'Actual finish'}>
          <input type="date" className="cv-input" value={form.actualFinish} max={today} disabled={!pourActualsEditable} onChange={(e) => set('actualFinish', e.target.value)} />
        </Field>
        <Field label="Duration">
          <input className="cv-input" value={`${r.duration} working day(s) · baseline ${r.baselineDuration}`} disabled />
        </Field>
        {datesEditable && (form.start !== (r.start || '') || form.finish !== (r.finish || '')) && (
          <div className="full">
            <Banner kind="warn">
              Changing the schedule records a revision. The original baseline ({fmtRange(r.plannedStart, r.plannedFinish)}) is kept for planned-vs-actual
              comparison. Linked {r.kind === 'episode' ? 'construction' : 'production'} schedules are NOT changed automatically — check the Schedule
              Alignment view for coordination alerts.
            </Banner>
          </div>
        )}
      </fieldset>

      <fieldset className="cv-fieldset" disabled={!canEdit}>
        <legend>Status & progress</legend>
        {(r.kind === 'scope' || r.kind === 'manual') && (
          <Field label="Actual physical progress (%)" hint={r.kind === 'scope' ? `Weight ${r.weight.toFixed(2)}% of project · planned today ${r.plannedProgress}%` : undefined}>
            <input
              type="number"
              min={0}
              max={100}
              className="cv-input"
              value={form.progress}
              disabled={!progressEditable}
              onChange={(e) => set('progress', Math.max(0, Math.min(100, Number(e.target.value))))}
            />
          </Field>
        )}
        {statusOptions.length > 0 && (
          <Field label={r.kind === 'pour' ? 'Pour milestone status' : r.kind === 'episode' ? 'Production status' : 'Status'}>
            <select className="cv-select" value={form.sourceStatus} onChange={(e) => set('sourceStatus', e.target.value)}>
              {statusOptions.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Derived register status">
          <div style={{ paddingTop: 6 }}>
            <StatusPill status={r.status} /> <span className="cv-dim">{r.progressBasis === 'physical' ? 'from progress & dates' : 'from status & dates'}</span>
          </div>
        </Field>
        <div className="full">
          <ProgressBar actual={r.kind === 'scope' || r.kind === 'manual' ? Number(form.progress) : r.progress} planned={r.plannedProgress} />
          <div className="cv-dim" style={{ marginTop: 4 }}>
            Bar = actual · white marker = planned as of today ({r.plannedProgress}%)
          </div>
        </div>
        <label className="cv-row full" style={{ fontSize: 13 }}>
          <input type="checkbox" checked={form.onHold} onChange={(e) => set('onHold', e.target.checked)} /> Put on hold (excluded from delay alerts)
        </label>
      </fieldset>

      <fieldset className="cv-fieldset" disabled={!canEdit}>
        <legend>Accountability</legend>
        <Field label={r.kind === 'episode' ? 'Director / owner' : 'Responsible person (task owner)'}>
          <input className="cv-input" value={form.owner} disabled={r.kind === 'episode' && !isManager} onChange={(e) => set('owner', e.target.value)} placeholder="e.g. Engr. Richard" />
        </Field>
        <Field label="Supporting personnel">
          <input className="cv-input" value={form.supporting} onChange={(e) => set('supporting', e.target.value)} />
        </Field>
        <Field label="Priority">
          <select className="cv-select" value={form.priority} onChange={(e) => set('priority', e.target.value as typeof form.priority)}>
            {['Low', 'Medium', 'High', 'Critical'].map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </Field>
        <Field label="Schedule commitment" hint="Confirmed = committed date · Tentative = needs confirmation · Target = management target">
          <select className="cv-select" value={form.commitment} onChange={(e) => set('commitment', e.target.value as typeof form.commitment)}>
            {['Confirmed', 'Tentative', 'Target'].map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </Field>
      </fieldset>

      <fieldset className="cv-fieldset" disabled={!canEdit}>
        <legend>Dependencies (predecessors)</legend>
        <div className="full cv-row" style={{ gap: 6 }}>
          {form.dependsOn.length === 0 && <span className="cv-dim">No predecessors recorded.</span>}
          {form.dependsOn.map((id) => {
            const d = register.find((x) => x.id === id);
            return (
              <span key={id} className="cv-chip" style={{ fontSize: 12 }}>
                {d ? `${d.name} · ${d.workstream}` : id} {d && <StatusPill status={d.status} />}
                {canEdit && (
                  <button type="button" className="cv-x" style={{ fontSize: 16 }} onClick={() => set('dependsOn', form.dependsOn.filter((x) => x !== id))} aria-label="Remove dependency">
                    ×
                  </button>
                )}
              </span>
            );
          })}
        </div>
        {canEdit && (
          <div className="full">
            <input className="cv-input" style={{ width: '100%' }} placeholder="Search activities to add as predecessor…" value={depQuery} onChange={(e) => setDepQuery(e.target.value)} />
            {depQuery && (
              <div className="cv-list" style={{ marginTop: 6 }}>
                {depOptions.map((o) => (
                  <button
                    type="button"
                    key={o.id}
                    className="cv-li clickable"
                    style={{ textAlign: 'left', color: 'inherit' }}
                    onClick={() => {
                      set('dependsOn', [...form.dependsOn, o.id]);
                      setDepQuery('');
                    }}
                  >
                    <div className="cv-li-main">
                      <div className="cv-li-t">{o.name}</div>
                      <div className="cv-li-s">
                        {o.workstream} · {fmtRange(o.start, o.finish)}
                      </div>
                    </div>
                    <StatusPill status={o.status} />
                  </button>
                ))}
                {!depOptions.length && <span className="cv-dim">No matching activities.</span>}
              </div>
            )}
          </div>
        )}
      </fieldset>

      <fieldset className="cv-fieldset" disabled={!canEdit}>
        <legend>Remarks, concerns & corrective action</legend>
        <Field label="Remarks" className="full">
          <textarea className="cv-textarea" value={form.remarks} onChange={(e) => set('remarks', e.target.value)} />
        </Field>
        <Field label="Outstanding concern">
          <textarea className="cv-textarea" value={form.concern} onChange={(e) => set('concern', e.target.value)} />
        </Field>
        <Field label="Corrective action">
          <textarea className="cv-textarea" value={form.correctiveAction} onChange={(e) => set('correctiveAction', e.target.value)} />
        </Field>
        <Field label="Resolution deadline">
          <input type="date" className="cv-input" value={form.resolutionDate} onChange={(e) => set('resolutionDate', e.target.value)} />
        </Field>
      </fieldset>

      {revisions.length > 0 && (
        <fieldset className="cv-fieldset">
          <legend>Schedule revision history</legend>
          <div className="full cv-list">
            {[...revisions].reverse().map((rv, i) => (
              <div key={i} className="cv-li">
                <div className="cv-li-main">
                  <div className="cv-li-t">
                    {fmtRange(rv.fromStart, rv.fromFinish)} → {fmtRange(rv.toStart, rv.toFinish)}
                  </div>
                  <div className="cv-li-s">
                    {fmtDate(rv.at.slice(0, 10))} · {rv.by}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </fieldset>
      )}
      <div className="cv-row">
        <Pill label={`Priority: ${r.priority}`} color={PRIORITY_HEX[r.priority]} />
        <Pill label={`Commitment: ${r.commitment}`} />
        {r.slipDays !== 0 && <Pill label={`Slip vs baseline: ${r.slipDays > 0 ? '+' : ''}${r.slipDays} d`} color={r.slipDays > 0 ? '#E5484D' : '#22A06B'} />}
      </div>
    </Modal>
  );
};
