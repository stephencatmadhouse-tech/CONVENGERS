/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * 07 — MILESTONE MONITORING: key milestones + concrete pour milestones.
 */

import React, { useMemo, useState } from 'react';
import { useCommand } from './context.tsx';
import { diffDays, fmtDate, fmtRange } from '../domain/dates.ts';
import { Card, Kpi, StatusPill, Pill, Empty, PRIORITY_HEX } from './ui.tsx';

export const Milestones: React.FC = () => {
  const { register, data, actions, canEdit, today } = useCommand();
  const [show, setShow] = useState<'all' | 'open' | 'done'>('all');
  const ms = useMemo(() => register.filter((r) => r.kind === 'milestone'), [register]);
  const pours = useMemo(() => register.filter((r) => r.kind === 'pour'), [register]);
  const filter = (list: typeof ms) => list.filter((r) => (show === 'all' ? true : show === 'open' ? r.status !== 'Completed' : r.status === 'Completed'));

  const onTime = [...ms, ...pours].filter((r) => r.status === 'Completed' && r.actualFinish && r.plannedFinish && r.actualFinish <= r.plannedFinish).length;
  const late = [...ms, ...pours].filter((r) => r.status === 'Completed' && r.actualFinish && r.plannedFinish && r.actualFinish > r.plannedFinish).length;
  const delayed = [...ms, ...pours].filter((r) => r.status === 'Delayed').length;
  const next = [...ms, ...pours].filter((r) => r.status !== 'Completed' && r.finish && r.finish >= today).sort((a, b) => a.finish!.localeCompare(b.finish!))[0];

  const table = (list: typeof ms, kind: 'milestone' | 'pour') =>
    filter(list).length ? (
      <div className="cv-table-wrap">
        <table className="cv-table">
          <thead>
            <tr>
              <th className="sticky">{kind === 'pour' ? 'Pour milestone' : 'Milestone'}</th>
              <th>Baseline target</th>
              <th>Current target</th>
              <th>Actual</th>
              <th>Variance</th>
              <th>Status</th>
              <th>Responsible</th>
              <th>Dependencies</th>
              <th>Priority</th>
              {kind === 'milestone' && canEdit && <th>Update status</th>}
            </tr>
          </thead>
          <tbody>
            {filter(list).map((r) => {
              const src = kind === 'milestone' ? data.milestones.find((m) => m.id === r.sourceId) : undefined;
              const actual = r.actualFinish || (kind === 'pour' ? r.actualStart : undefined);
              const variance = actual && r.plannedFinish ? diffDays(r.plannedFinish, actual) : r.status !== 'Completed' && r.finish && r.finish < today ? diffDays(r.finish, today) : null;
              return (
                <tr key={r.id}>
                  <td className="sticky clickable" style={{ minWidth: 220, cursor: 'pointer' }} onClick={() => actions.openActivity(r.id)}>
                    <div className="cv-strong">{r.name}</div>
                    <div className="cv-dim">
                      {r.badge && <span className="cv-chip">{r.badge}</span>} {kind === 'pour' ? r.description : ''}
                    </div>
                  </td>
                  <td className="nowrap">{fmtRange(r.plannedStart, r.plannedFinish)}</td>
                  <td className="nowrap">
                    {fmtRange(r.start, r.finish)}
                    {r.revisionCount > 0 && <div className="cv-late">revised {r.revisionCount}×</div>}
                  </td>
                  <td className="nowrap">{actual ? fmtDate(actual) : '—'}</td>
                  <td className={`num ${variance && variance > 0 ? 'cv-late' : variance !== null ? 'cv-good' : ''}`}>
                    {variance === null ? '—' : `${variance > 0 ? '+' : ''}${variance} d${!actual ? ' (open)' : ''}`}
                  </td>
                  <td>
                    <StatusPill status={r.status} />
                  </td>
                  <td>{r.owner || <span className="cv-late">Unassigned</span>}</td>
                  <td className="cv-dim" style={{ maxWidth: 220 }}>
                    {r.dependsOn.length
                      ? r.dependsOn
                          .map((id) => register.find((x) => x.id === id))
                          .filter(Boolean)
                          .map((d) => `${d!.name} (${d!.status})`)
                          .join('; ')
                      : '—'}
                  </td>
                  <td>
                    <Pill label={r.priority} color={PRIORITY_HEX[r.priority]} />
                  </td>
                  {kind === 'milestone' && canEdit && (
                    <td>
                      <select
                        className="cv-select"
                        value={src?.status || ''}
                        aria-label={`Status for ${r.name}`}
                        onChange={(e) => actions.patchActivity(r, { sourceStatus: e.target.value })}
                      >
                        {['Upcoming', 'In progress', 'Complete', 'Delayed', 'Date passed · confirm'].map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    ) : (
      <Empty>No milestones in this view.</Empty>
    );

  return (
    <div className="cv-grid" style={{ gap: 14 }}>
      <div className="cv-kpis">
        <Kpi label="Milestones complete" value={`${ms.filter((r) => r.status === 'Completed').length} / ${ms.length}`} accent />
        <Kpi label="Concrete pours approved" value={`${pours.filter((r) => r.status === 'Completed').length} / ${pours.length}`} />
        <Kpi label="Delayed milestones / pours" value={delayed} color={delayed ? '#D92D3F' : '#22A05A'} />
        <Kpi label="Completed on time / late" value={`${onTime} / ${late}`} sub="Needs actual dates recorded" />
        <Kpi label="Next milestone" value={next ? fmtDate(next.finish) : '—'} sub={next ? `${next.name.slice(0, 48)} · ${diffDays(today, next.finish!)} day(s)` : ''} />
      </div>
      <div className="cv-row">
        {(['all', 'open', 'done'] as const).map((k) => (
          <button key={k} type="button" className={`cv-btn sm ${show === k ? 'purple' : 'ghost'}`} onClick={() => setShow(k)}>
            {k === 'all' ? 'All' : k === 'open' ? 'Open' : 'Completed'}
          </button>
        ))}
      </div>
      <Card title="Key project milestones" note="Baseline dates are preserved when targets are revised">
        {table(ms, 'milestone')}
      </Card>
      <Card title="Concrete pouring milestones" note="Target pour vs actual pour · stage status from the concrete pour tracker">
        {table(pours, 'pour')}
      </Card>
    </div>
  );
};
