/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * 09 — PERFORMANCE ANALYTICS & FORECAST.
 * Actual figures come only from the register (today) and recorded daily
 * snapshots (history). Planned figures come from the preserved baseline.
 */

import React, { useMemo, useState } from 'react';
import { useCommand } from './context.tsx';
import { plannedCurve } from '../domain/metrics.ts';
import { buildOutlook, OutlookClass } from '../domain/attention.ts';
import { addDays, diffDays, fmtDate, fmtRange, monthLabel, monthRange } from '../domain/dates.ts';
import { snapshotAt } from '../domain/reports.ts';
import { Card, Kpi, LineChart, BarChart, ProgressBar, Empty, Banner, StatusPill, Pill, pct, STATUS_HEX, kindColor } from './ui.tsx';
import { PROJECT_START, toIsoDate } from '../utils/calculations.ts';

export const Analytics: React.FC = () => {
  const { register, metrics: m, snapshots, today, actions, reports } = useCommand();
  const projStart = toIsoDate(PROJECT_START);

  const curve = useMemo(() => plannedCurve(register, projStart, m.targetCompletion, 7), [register, projStart, m.targetCompletion]);
  const actualPoints = useMemo(() => {
    const pts = snapshots.map((s) => ({ x: s.date, y: s.actualPct }));
    if (!pts.find((p) => p.x === today)) pts.push({ x: today, y: m.actualPct });
    return pts.sort((a, b) => a.x.localeCompare(b.x));
  }, [snapshots, today, m.actualPct]);
  // Merge actual dates into the x-axis so they plot at the right place
  const plannedSeries = useMemo(() => {
    const extra = actualPoints.map((p) => p.x).filter((x) => !curve.find((c) => c.date === x));
    const all = [...curve.map((c) => ({ x: c.date, y: c.planned as number | null }))];
    extra.forEach((x) => all.push({ x, y: null }));
    return all.sort((a, b) => a.x.localeCompare(b.x));
  }, [curve, actualPoints]);

  // Weekly trend from snapshots (week-end values)
  const weekly = useMemo(() => {
    const out: { label: string; value: number }[] = [];
    if (!snapshots.length) return out;
    let ws = addDays(snapshots[0].date, -((new Date(snapshots[0].date).getUTCDay() + 6) % 7));
    let prev: number | null = null;
    let guard = 0;
    while (ws <= today && guard < 60) {
      const we = addDays(ws, 6);
      const snap = snapshotAt(snapshots, we < today ? we : today);
      if (snap && snap.date >= ws) {
        if (prev !== null) out.push({ label: fmtDate(ws, false), value: Math.round((snap.actualPct - prev) * 10) / 10 });
        prev = snap.actualPct;
      }
      ws = addDays(ws, 7);
      guard++;
    }
    return out;
  }, [snapshots, today]);

  // Monthly comparison table (month-end snapshots + live current month)
  const months = useMemo(() => {
    const rows: { key: string; planned: number; actual: number | null; gain: number | null; delayed: number | null; completed: number | null; report?: string }[] = [];
    let cur = monthRange(projStart);
    let prevActual: number | null = null;
    let guard = 0;
    while (cur.start <= today && guard < 24) {
      const endIso = cur.end < today ? cur.end : today;
      const snap = cur.end < today ? snapshotAt(snapshots, cur.end) : undefined;
      const snapOk = snap && snap.date >= cur.start;
      const actual = cur.end >= today ? m.actualPct : snapOk ? snap!.actualPct : null;
      const planned = curve.length ? plannedAtFromCurve(register, endIso) : 0;
      const rep = reports.find((r) => r.id === `M-${cur.key}`);
      rows.push({
        key: cur.key,
        planned,
        actual,
        gain: actual !== null && prevActual !== null ? Math.round((actual - prevActual) * 10) / 10 : null,
        delayed: cur.end >= today ? m.counts.delayed : snapOk ? snap!.counts.delayed : null,
        completed: cur.end >= today ? m.counts.completed : snapOk ? snap!.counts.completed : null,
        report: rep ? rep.status : undefined,
      });
      prevActual = actual;
      cur = monthRange(addDays(cur.end, 1));
      guard++;
    }
    return rows;
  }, [projStart, today, snapshots, m, curve.length, register, reports]);

  const byKind = useMemo(() => {
    const kinds: { k: string; label: string }[] = [
      { k: 'scope', label: 'Scopes' },
      { k: 'pour', label: 'Pours' },
      { k: 'milestone', label: 'Milestones' },
      { k: 'episode', label: 'Episodes' },
      { k: 'manual', label: 'Other' },
    ];
    return kinds
      .map(({ k, label }) => {
        const items = register.filter((r) => r.kind === k);
        return { label, completed: items.filter((r) => r.status === 'Completed').length, delayed: items.filter((r) => r.status === 'Delayed').length, total: items.length };
      })
      .filter((x) => x.total);
  }, [register]);

  const ms = register.filter((r) => r.kind === 'milestone' || r.kind === 'pour');
  const msDone = ms.filter((r) => r.status === 'Completed');
  const msLate = msDone.filter((r) => r.actualFinish && r.plannedFinish && r.actualFinish > r.plannedFinish).length;
  const msOverdue = ms.filter((r) => r.status === 'Delayed').length;

  const scopes = register.filter((r) => r.kind === 'scope');
  const finished = scopes.filter((r) => r.status === 'Completed' && r.actualFinish && r.plannedFinish);
  const finishedLate = finished.filter((r) => r.actualFinish! > r.plannedFinish!);
  const pours = register.filter((r) => r.kind === 'pour');
  const pourVar = pours.filter((p) => p.actualStart && p.plannedStart).map((p) => ({ label: p.floor || '', name: p.name, value: diffDays(p.plannedStart!, p.actualStart!) }));

  const eps = register.filter((r) => r.kind === 'episode');
  const epDue = eps.filter((e) => e.finish && e.finish < today);
  const epDoneDue = epDue.filter((e) => e.status === 'Completed').length;
  const epStatus = ['Planned', 'For Confirmation', 'Scheduled', 'Completed', 'Rescheduled'].map((s) => ({ label: s, value: eps.filter((e) => e.episodeStatus === s).length }));

  return (
    <div className="cv-grid" style={{ gap: 14 }}>
      {snapshots.length < 2 && (
        <Banner kind="info">
          Trend history builds up from daily progress snapshots ({snapshots.length} recorded so far). A snapshot is captured automatically once per day when
          a team member opens the dashboard, or manually in Settings & Data. Past weeks without a snapshot are shown as “n/a” — no history is invented.
        </Banner>
      )}
      <div className="cv-kpis">
        <Kpi label="Overall physical accomplishment" value={pct(m.actualPct)} accent />
        <Kpi label="Planned to date" value={pct(m.plannedPct)} />
        <Kpi label="Schedule variance" value={`${m.variancePct >= 0 ? '+' : ''}${m.variancePct.toFixed(1)} pts`} color={m.variancePct < 0 ? '#E5484D' : '#22A06B'} />
        <Kpi label="SPI" value={m.spi === null ? '—' : m.spi.toFixed(2)} sub="1.00 = on plan" />
        <Kpi label="Completed / delayed" value={`${m.counts.completed} / ${m.counts.delayed}`} sub={`${m.counts.total} activities in register`} />
      </div>

      <Card title="1–2. Planned vs actual progress (S-curve)" note="Planned = baseline, weekly · Actual = recorded snapshots + today (live)">
        <LineChart
          series={[
            { name: 'Planned', color: '#C7C7D0', points: plannedSeries, dashed: true },
            { name: 'Actual', color: '#7026C8', points: actualPoints },
          ]}
          markX={today}
        />
        <div className="cv-legend">
          <span>
            <span className="cv-sw" style={{ background: '#C7C7D0' }} /> Planned (baseline)
          </span>
          <span>
            <span className="cv-sw" style={{ background: '#7026C8' }} /> Actual (recorded)
          </span>
        </div>
      </Card>

      <div className="cv-grid cv-g2">
        <Card title="3. Weekly progress trend" note="Points gained per week (from snapshots)">
          {weekly.length ? <BarChart bars={weekly} signed unit=" pts" /> : <Empty>Needs snapshots from at least two different weeks.</Empty>}
        </Card>
        <Card title="4. Monthly progress — month-to-month comparison">
          <div className="cv-table-wrap">
            <table className="cv-table">
              <thead>
                <tr>
                  <th>Month</th>
                  <th className="num">Planned</th>
                  <th className="num">Actual</th>
                  <th className="num">Variance</th>
                  <th className="num">Gain</th>
                  <th className="num">Completed</th>
                  <th className="num">Delayed</th>
                  <th>Report</th>
                </tr>
              </thead>
              <tbody>
                {months.map((r) => (
                  <tr key={r.key}>
                    <td className="cv-strong nowrap">{monthLabel(r.key)}</td>
                    <td className="num">{r.planned.toFixed(1)}%</td>
                    <td className="num">{r.actual === null ? 'n/a' : `${r.actual.toFixed(1)}%`}</td>
                    <td className={`num ${r.actual !== null && r.actual < r.planned ? 'cv-late' : ''}`}>{r.actual === null ? '—' : (r.actual - r.planned).toFixed(1)}</td>
                    <td className="num">{r.gain === null ? '—' : `${r.gain >= 0 ? '+' : ''}${r.gain}`}</td>
                    <td className="num">{r.completed ?? '—'}</td>
                    <td className="num">{r.delayed ?? '—'}</td>
                    <td>
                      <button type="button" className="cv-btn sm ghost" onClick={() => actions.navigate(`reports/monthly/id=M-${r.key}`)}>
                        {r.report || 'open'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div className="cv-grid cv-g2">
        <Card title="5. Workstream accomplishment" note="Bar = actual · marker = planned · weight = share of project">
          {m.workstreams.map((w) => (
            <div key={w.key} className="cv-hbar">
              <span>
                <b>{w.label}</b>
                <div className="cv-dim">weight {w.weight}% · {w.completed}/{w.count} done</div>
              </span>
              <ProgressBar actual={w.actual} planned={w.planned} />
              <span className="cv-dim" style={{ textAlign: 'right' }}>
                {w.actual.toFixed(1)}% / {w.planned.toFixed(1)}%
              </span>
            </div>
          ))}
        </Card>
        <Card title="6. Delayed vs completed activities">
          <div className="cv-table-wrap">
            <table className="cv-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th className="num">Total</th>
                  <th className="num">Completed</th>
                  <th className="num">Delayed</th>
                  <th style={{ minWidth: 160 }}>Mix</th>
                </tr>
              </thead>
              <tbody>
                {byKind.map((k) => (
                  <tr key={k.label}>
                    <td className="cv-strong">{k.label}</td>
                    <td className="num">{k.total}</td>
                    <td className="num cv-good">{k.completed}</td>
                    <td className="num cv-late">{k.delayed}</td>
                    <td>
                      <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', background: 'rgba(255,255,255,.1)' }}>
                        <div style={{ width: `${(k.completed / k.total) * 100}%`, background: STATUS_HEX.Completed }} />
                        <div style={{ width: `${(k.delayed / k.total) * 100}%`, background: STATUS_HEX.Delayed }} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div className="cv-grid cv-g3">
        <Card title="7. Milestone performance">
          <div className="cv-kpis" style={{ gridTemplateColumns: 'repeat(2,minmax(0,1fr))' }}>
            <Kpi label="Achieved" value={`${msDone.length}/${ms.length}`} />
            <Kpi label="Overdue" value={msOverdue} color={msOverdue ? '#E5484D' : undefined} />
            <Kpi label="Achieved late" value={msLate} sub="Actual vs baseline" />
            <Kpi label="Upcoming (30 d)" value={ms.filter((r) => r.status !== 'Completed' && r.finish && r.finish >= today && r.finish <= addDays(today, 30)).length} />
          </div>
        </Card>
        <Card title="8. Construction schedule performance">
          <div className="cv-kpis" style={{ gridTemplateColumns: 'repeat(2,minmax(0,1fr))' }}>
            <Kpi label="Scopes complete" value={`${scopes.filter((s) => s.status === 'Completed').length}/${scopes.length}`} />
            <Kpi label="Finished late" value={finished.length ? `${finishedLate.length}/${finished.length}` : 'n/a'} sub="Needs actual finish dates" />
            <Kpi label="Re-scheduled scopes" value={scopes.filter((s) => s.revisionCount > 0).length} />
            <Kpi label="Overdue now" value={scopes.filter((s) => s.status === 'Delayed').length} color="#E5484D" />
          </div>
          {pourVar.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div className="cv-kpi-l">Pour date variance (actual − target, days)</div>
              {pourVar.map((p) => (
                <div key={p.name} className="cv-dim">
                  {p.name}: <b className={p.value > 0 ? 'cv-late' : 'cv-good'}>{p.value > 0 ? '+' : ''}{p.value} d</b>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card title="9. Production schedule performance">
          <div className="cv-kpis" style={{ gridTemplateColumns: 'repeat(2,minmax(0,1fr))' }}>
            <Kpi label="Shoots due to date" value={epDue.length} />
            <Kpi label="Completed of due" value={epDue.length ? `${epDoneDue}/${epDue.length}` : 'n/a'} color={epDoneDue < epDue.length ? '#E5484D' : undefined} />
            <Kpi label="Re-scheduled" value={eps.filter((e) => e.revisionCount > 0 || e.episodeStatus === 'Rescheduled').length} />
            <Kpi label="Tentative" value={eps.filter((e) => e.commitment === 'Tentative' && e.status !== 'Completed').length} />
          </div>
          <BarChart bars={epStatus.map((s) => ({ ...s, color: s.label === 'Completed' ? '#22A06B' : s.label === 'Scheduled' ? '#A34FEA' : s.label === 'Rescheduled' ? '#A34FEA' : '#F5A623' }))} height={170} />
        </Card>
      </div>
    </div>
  );
};

function plannedAtFromCurve(register: ReturnType<typeof useCommand>['register'], iso: string): number {
  const c = plannedCurve(register, iso, iso, 1);
  return c[0]?.planned ?? 0;
}

// ---------- Forecast & next-month planning ----------
const OUTLOOK_HEX: Record<OutlookClass, string> = {
  Confirmed: '#22A06B',
  Tentative: '#F5A623',
  'Management target': '#A34FEA',
  'At risk': '#E5484D',
};

export const Forecast: React.FC = () => {
  const { register, alignment, today, actions, metrics: m } = useCommand();
  const [horizon, setHorizon] = useState<'30' | 'next' | '60'>('30');
  const nm = monthRange(addDays(monthRange(today).end, 1));
  const from = horizon === 'next' ? nm.start : today;
  const to = horizon === 'next' ? nm.end : addDays(today, Number(horizon));
  const [cls, setCls] = useState<string>('');
  const items = useMemo(() => buildOutlook(register, alignment, from, to, today), [register, alignment, from, to, today]);
  const shown = items.filter((i) => !cls || i.outlook === cls);
  const counts = (['Confirmed', 'Tentative', 'Management target', 'At risk'] as OutlookClass[]).map((k) => ({ k, n: items.filter((i) => i.outlook === k).length }));

  const pours = items.filter((i) => i.activity.isPour);
  const inspections = items.filter((i) => i.activity.isInspection);
  const shoots = items.filter((i) => i.activity.kind === 'episode');
  const chars = Array.from(new Set(shoots.flatMap((s) => s.activity.characters))).sort();
  const conflicts = alignment.filter((a) => a.classification === 'Conflict' && a.episode.start && a.episode.start <= to && (a.episode.finish || a.episode.start) >= from);

  const section = (title: string, list: typeof items, empty: string) => (
    <Card title={title} note={`${list.length} item(s)`}>
      {list.length ? (
        <div className="cv-list">
          {list.slice(0, 12).map((i) => (
            <button type="button" key={i.activity.id} className="cv-li clickable" style={{ textAlign: 'left', color: 'inherit' }} onClick={() => actions.openActivity(i.activity.id)}>
              <span className="cv-sev" style={{ background: OUTLOOK_HEX[i.outlook] }} />
              <div className="cv-li-main">
                <div className="cv-li-t">{i.activity.name}</div>
                <div className="cv-li-s">
                  {i.activity.workstream} · {fmtRange(i.activity.start, i.activity.finish)} · {i.activity.owner || 'Unassigned'}
                </div>
                {i.reasons.length > 0 && <div className="cv-li-s cv-late">{i.reasons.join(' · ')}</div>}
              </div>
              <Pill label={i.outlook} color={OUTLOOK_HEX[i.outlook]} />
            </button>
          ))}
          {list.length > 12 && <div className="cv-dim">+{list.length - 12} more in the table below</div>}
        </div>
      ) : (
        <Empty>{empty}</Empty>
      )}
    </Card>
  );

  return (
    <div className="cv-grid" style={{ gap: 14 }}>
      <Banner kind="info">
        The outlook is built from the current schedule, declared dependencies and recorded progress. <b>Confirmed</b> = committed dates (confirmed milestones,
        scheduled shoots and pours); <b>Tentative</b> = awaiting confirmation; <b>Management target</b> = planned schedule dates not yet confirmed;{' '}
        <b>At risk</b> = flagged by dependency, delay, progress gap, re-scheduling or missing owner. Assumptions are never shown as commitments.
      </Banner>
      <div className="cv-filters">
        {(
          [
            ['30', 'Next 30 days'],
            ['next', `Next month (${monthLabel(nm.key)})`],
            ['60', 'Next 60 days'],
          ] as const
        ).map(([k, l]) => (
          <button key={k} type="button" className={`cv-btn sm ${horizon === k ? 'purple' : 'ghost'}`} onClick={() => setHorizon(k)}>
            {l}
          </button>
        ))}
        <span className="cv-spacer" />
        {counts.map((c) => (
          <button key={c.k} type="button" className={`cv-btn sm ${cls === c.k ? 'purple' : 'ghost'}`} style={{ borderColor: OUTLOOK_HEX[c.k] }} onClick={() => setCls(cls === c.k ? '' : c.k)}>
            <span className="cv-dot" style={{ background: OUTLOOK_HEX[c.k] }} /> {c.k} ({c.n})
          </button>
        ))}
      </div>
      <div className="cv-kpis">
        <Kpi label="Activities in window" value={items.length} sub={fmtRange(from, to)} />
        <Kpi label="At risk" value={items.filter((i) => i.outlook === 'At risk').length} color="#E5484D" />
        <Kpi label="Concrete pours" value={pours.length} />
        <Kpi label="Inspections / testing" value={inspections.length} />
        <Kpi label="Shoots" value={shoots.length} sub={`${chars.length} character(s) required`} />
        <Kpi label="Projected completion" value={fmtDate(m.projectedCompletion)} sub={`Target ${fmtDate(m.targetCompletion)}`} />
      </div>
      <div className="cv-grid cv-g2">
        {section('Activities at risk of delay', shown.filter((i) => i.outlook === 'At risk'), 'No activities flagged at risk in this window.')}
        {section('Upcoming concrete pouring milestones', pours, 'No concrete pours in this window.')}
        {section('Upcoming inspections & testing', inspections, 'No inspections in this window.')}
        {section('Production schedules', shoots, 'No shoots in this window.')}
      </div>
      <div className="cv-grid cv-g2">
        <Card title="Required character availability">
          {chars.length ? (
            <div className="cv-row" style={{ gap: 6 }}>
              {chars.map((c) => (
                <span key={c} className="cv-chip" style={{ fontSize: 12 }}>
                  {c} · {shoots.filter((s) => s.activity.characters.includes(c)).length} shoot(s)
                </span>
              ))}
            </div>
          ) : (
            <Empty>No characters required in this window.</Empty>
          )}
        </Card>
        <Card title="Potential schedule conflicts & critical dependencies">
          {conflicts.length || items.some((i) => i.reasons.some((r) => r.startsWith('Depends on'))) ? (
            <div className="cv-list">
              {conflicts.map((c) => (
                <div key={c.episode.id} className="cv-li">
                  <span className="cv-sev" style={{ background: '#E5484D' }} />
                  <div className="cv-li-main">
                    <div className="cv-li-t">{c.episode.name}</div>
                    <div className="cv-li-s">{c.alerts.find((a) => a.severity === 'critical')?.message}</div>
                  </div>
                </div>
              ))}
              {items
                .filter((i) => i.reasons.some((r) => r.startsWith('Depends on')))
                .map((i) => (
                  <div key={`d-${i.activity.id}`} className="cv-li">
                    <span className="cv-sev" style={{ background: '#F5A623' }} />
                    <div className="cv-li-main">
                      <div className="cv-li-t">{i.activity.name}</div>
                      <div className="cv-li-s">{i.reasons.filter((r) => r.startsWith('Depends on')).join(' · ')}</div>
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            <Empty>No conflicts or dependency risks detected (dependencies must be recorded to be checked).</Empty>
          )}
        </Card>
      </div>
      <Card title="Full outlook" note={`${shown.length} item(s)`}>
        {shown.length ? (
          <div className="cv-table-wrap">
            <table className="cv-table">
              <thead>
                <tr>
                  <th className="sticky">Activity</th>
                  <th>Workstream</th>
                  <th>Schedule</th>
                  <th>Status</th>
                  <th>Outlook</th>
                  <th>Responsible</th>
                  <th>Why</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((i) => (
                  <tr key={i.activity.id} className="clickable" onClick={() => actions.openActivity(i.activity.id)}>
                    <td className="sticky cv-strong" style={{ minWidth: 200 }}>
                      <span className="cv-dot" style={{ background: kindColor(i.activity.kind, i.activity.stream), marginRight: 6 }} />
                      {i.activity.name}
                    </td>
                    <td className="nowrap">{i.activity.workstream}</td>
                    <td className="nowrap">{fmtRange(i.activity.start, i.activity.finish)}</td>
                    <td>
                      <StatusPill status={i.activity.status} />
                    </td>
                    <td>
                      <Pill label={i.outlook} color={OUTLOOK_HEX[i.outlook]} />
                    </td>
                    <td>{i.activity.owner || <span className="cv-late">Unassigned</span>}</td>
                    <td className="cv-dim">{i.reasons.join('; ') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>Nothing scheduled in this window.</Empty>
        )}
      </Card>
    </div>
  );
};
