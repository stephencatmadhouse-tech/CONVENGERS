/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { FullDashboardData } from '../types/index.ts';
import { BrandLogo } from './BrandLogo.tsx';
import type { RegisterActivity } from '../domain/register.ts';
import type { ProjectMetrics } from '../domain/metrics.ts';
import type { AttentionItem } from '../domain/attention.ts';
import { execKpis, streamHealth, TIER_HEX } from '../domain/executive.ts';
import { addDays, fmtDate, monthLabel, monthRange } from '../domain/dates.ts';
import {
  calculateMilestonesCompletion,
  calculateScheduleElapsed,
  calculateConcreteCompletion,
  calculateFloorProgress,
} from '../utils/calculations.ts';

interface PrintReportProps {
  data: FullDashboardData;
  /** Live project figures for the executive first page (same source as the Executive Dashboard). */
  register?: RegisterActivity[];
  metrics?: ProjectMetrics;
  attention?: AttentionItem[];
  today?: string;
}

const HEALTH_COLOR: Record<string, string> = { 'On Track': '#22A06B', 'At Risk': '#F5A623', Critical: '#E5484D' };
const SEV_COLOR: Record<string, { bg: string; fg: string; label: string }> = {
  critical: { bg: '#E5484D', fg: '#FFFFFF', label: 'CRITICAL' },
  warn: { bg: '#F5A623', fg: '#2B1A00', label: 'ATTENTION' },
  info: { bg: '#E8E8EF', fg: '#303030', label: 'INFO' },
};

/** Page 1 — Executive dashboard, project health and overall summary for stakeholders. */
const ExecutiveSummaryPage: React.FC<{ register: RegisterActivity[]; metrics: ProjectMetrics; attention: AttentionItem[]; today: string }> = ({
  register,
  metrics: m,
  attention,
  today,
}) => {
  const k = execKpis(register, today);
  const streams = streamHealth(register, today).sort((a, b) => a.workstream.localeCompare(b.workstream));
  const healthColor = HEALTH_COLOR[m.health] || '#777777';
  const upcomingMs = register
    .filter((r) => (r.kind === 'milestone' || r.kind === 'pour') && r.status !== 'Completed' && r.finish && r.finish >= today)
    .sort((a, b) => a.finish!.localeCompare(b.finish!))
    .slice(0, 4);
  const topAttention = attention.slice(0, 4);
  const variance = m.variancePct;
  const kpis: { label: string; value: string | number; sub: string; color: string; dark?: boolean }[] = [
    { label: 'Active workstreams', value: k.activeStreams.length, sub: `of ${k.totalStreams}`, color: '#7026C8' },
    { label: 'In progress', value: k.lists.inprogress.length, sub: 'activities ongoing', color: '#8B35E8' },
    { label: 'Completed this month', value: k.lists.completedMonth.length, sub: monthLabel(monthRange(today).key), color: '#22A06B' },
    { label: 'Overdue', value: k.lists.overdue.length, sub: 'past target', color: '#E5484D' },
    { label: 'Due in 7 days', value: k.lists.due7.length, sub: `to ${fmtDate(addDays(today, 7), false)}`, color: '#F5A623', dark: true },
    { label: 'Due in 30 days', value: k.lists.due30.length, sub: `to ${fmtDate(addDays(today, 30), false)}`, color: '#A34FEA' },
    { label: 'Blocked / on hold', value: k.lists.blocked.length, sub: 'flagged on hold', color: '#C02AE0' },
    {
      label: 'On-time completion',
      value: k.onTime.pct === null ? '—' : `${k.onTime.pct}%`,
      sub: k.onTime.measured ? `${k.onTime.onTime} of ${k.onTime.measured} on time` : 'pending update',
      color: '#303030',
    },
  ];

  return (
    <div className="pmx">
      {/* Executive dashboard */}
      <section className="pmx-sec">
        <h2 className="pmx-h2">Executive dashboard <span>as of {fmtDate(today)}</span></h2>
        <div className="pmx-kpis">
          {kpis.map((x) => (
            <div key={x.label} className="pmx-kpi" style={{ background: x.color, color: x.dark ? '#2B1A00' : '#FFFFFF' }}>
              <span className="pmx-kpi-l">{x.label}</span>
              <b className="pmx-kpi-v">{x.value}</b>
              <span className="pmx-kpi-s">{x.sub}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Project health */}
      <section className="pmx-sec">
        <h2 className="pmx-h2">Project health</h2>
        <div className="pmx-health">
          <div className="pmx-health-main" style={{ borderColor: healthColor }}>
            <span className="pmx-status" style={{ background: healthColor, color: m.health === 'At Risk' ? '#2B1A00' : '#FFFFFF' }}>
              {m.health}
            </span>
            <div className="pmx-big">
              {m.actualPct.toFixed(1)}%<small> actual</small>
            </div>
            <div className="pmx-bar">
              <b style={{ width: `${Math.max(0, Math.min(100, m.actualPct))}%` }} />
              <i style={{ left: `${Math.max(0, Math.min(100, m.plannedPct))}%` }} />
            </div>
            <div className="pmx-dim">
              Planned {m.plannedPct.toFixed(1)}% · variance {variance >= 0 ? '+' : ''}
              {variance.toFixed(1)} pts{m.spi !== null ? ` · SPI ${m.spi.toFixed(2)}` : ''} · schedule elapsed {Math.round(m.elapsedPct)}%
            </div>
            <div className="pmx-dates">
              <div>
                <span>Target completion</span>
                <b>{m.targetCompletion ? fmtDate(m.targetCompletion) : 'Pending update'}</b>
              </div>
              <div>
                <span>Projected completion</span>
                <b>{m.projectedCompletion ? fmtDate(m.projectedCompletion) : 'Pending update'}</b>
              </div>
              <div>
                <span>Milestones</span>
                <b>
                  {m.milestonesComplete} / {m.milestonesTotal}
                </b>
              </div>
            </div>
            {m.healthReasons.length > 0 && (
              <ul className="pmx-reasons">
                {m.healthReasons.slice(0, 3).map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            )}
          </div>
          <table className="pmx-streams">
            <thead>
              <tr>
                <th>Workstream</th>
                <th style={{ width: '34%' }}>Actual vs planned</th>
                <th>Open</th>
                <th>Overdue</th>
                <th>Tier</th>
              </tr>
            </thead>
            <tbody>
              {streams.map((h) => (
                <tr key={h.workstream}>
                  <td>
                    <b>{h.workstream}</b>
                  </td>
                  <td>
                    <div className="pmx-barrow">
                      <div className="pmx-bar sm">
                        <b style={{ width: `${h.actual}%` }} />
                        <i style={{ left: `${h.planned}%` }} />
                      </div>
                      <span className="pmx-dim">
                        {h.actual}% / {h.planned}%
                      </span>
                    </div>
                  </td>
                  <td className="num">{h.open}</td>
                  <td className="num" style={{ color: h.overdue ? '#C62828' : undefined, fontWeight: h.overdue ? 700 : 400 }}>
                    {h.overdue}
                  </td>
                  <td>
                    {h.tier ? (
                      <span className="pmx-tier" style={{ background: TIER_HEX[h.tier] }}>
                        {h.tier}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Overall summary */}
      <section className="pmx-sec pmx-two">
        <div>
          <h2 className="pmx-h2">Project summary</h2>
          <div className="pmx-counts">
            <div>
              <b>{m.counts.completed}</b>
              <span>completed</span>
            </div>
            <div>
              <b>{m.counts.ongoing}</b>
              <span>ongoing</span>
            </div>
            <div>
              <b>{m.counts.upcoming}</b>
              <span>upcoming</span>
            </div>
            <div>
              <b style={{ color: m.counts.delayed ? '#C62828' : undefined }}>{m.counts.delayed}</b>
              <span>delayed</span>
            </div>
            <div>
              <b>
                {m.episodesCompleted}/{m.episodesTotal}
              </b>
              <span>episodes done</span>
            </div>
          </div>
          <h3 className="pmx-h3">Upcoming milestones</h3>
          {upcomingMs.length ? (
            <ul className="pmx-list">
              {upcomingMs.map((r) => (
                <li key={r.id}>
                  <b>{fmtDate(r.finish)}</b>
                  <span>{r.name}</span>
                  <em>{r.commitment}</em>
                </li>
              ))}
            </ul>
          ) : (
            <div className="pmx-dim">No upcoming milestones.</div>
          )}
        </div>
        <div>
          <h2 className="pmx-h2">Needs management attention</h2>
          {topAttention.length ? (
            <ul className="pmx-list att">
              {topAttention.map((a) => (
                <li key={a.id}>
                  <span className="pmx-sev" style={{ background: SEV_COLOR[a.severity].bg, color: SEV_COLOR[a.severity].fg }}>
                    {SEV_COLOR[a.severity].label}
                  </span>
                  <span>
                    <b>{a.title}</b>
                    <small>
                      {a.category} · {a.detail}
                    </small>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="pmx-dim">Nothing needs management attention.</div>
          )}
          {attention.length > topAttention.length && <div className="pmx-dim">+ {attention.length - topAttention.length} more in Issues &amp; Accountability</div>}
        </div>
      </section>
    </div>
  );
};

function badgeStyle(status: string): React.CSSProperties {
  const s = (status || '').toLowerCase();
  if (s.includes('complete') || s.includes('approved')) {
    return { background: '#dcfce7', color: '#14532d', border: '1px solid #86efac' };
  }
  if (s.includes('delay') || s.includes('reject')) {
    return { background: '#fee2e2', color: '#7f1d1d', border: '1px solid #fca5a5' };
  }
  if (s.includes('progress') || s.includes('ongoing') || s.includes('scheduled') || s.includes('on-track')) {
    return { background: '#dbeafe', color: '#1e3a8a', border: '1px solid #93c5fd' };
  }
  if (s.includes('confirm') || s.includes('ready') || s.includes('passed')) {
    return { background: '#fef3c7', color: '#78350f', border: '1px solid #fcd34d' };
  }
  return { background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1' };
}

export const PrintReport: React.FC<PrintReportProps> = ({ data, register, metrics, attention, today }) => {
  const milestonePct = calculateMilestonesCompletion(data.milestones);
  const elapsed = calculateScheduleElapsed();
  const concrete = calculateConcreteCompletion(data.pours);
  const gfPct = calculateFloorProgress(data.scopes, 'GF');
  const f2Pct = calculateFloorProgress(data.scopes, '2F');
  const f3Pct = calculateFloorProgress(data.scopes, '3F');
  const epDone = data.episodes.filter((e) => e.status === 'Completed').length;

  const reportDate = new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="pmrep-container" id="pmreport">
      {/* Branded Report Header */}
      <div className="pmrep-header">
        <div className="pmrep-brand">
          <BrandLogo variant="report" />
          <div>
            <div className="pmrep-kicker">CONVENGERS CONSTRUCTION MULTIVERSE · FORMAL PROJECT REPORT</div>
            <h1 className="pmrep-title">Convengers Bahay Build — Executive Status Report</h1>
            <div className="pmrep-meta">
              <span>Report Date: <b>{reportDate}</b></span>
              <span>·</span>
              <span>Window: <b>Oct 5, 2026 – Apr 30, 2027</b></span>
              <span>·</span>
              <span>Portal: <b>www.ConvengersAssemble.com</b></span>
              <span>·</span>
              <span>Version <b>{data.settings.version}</b></span>
            </div>
          </div>
        </div>
        <div className="pmrep-stoppage">
          <span className="pmrep-stoppage-tag">HOLIDAY WORK STOPPAGE</span>
          <span>Stops after Dec 19, 2026 · Resumes Jan 4, 2027</span>
        </div>
      </div>

      {/* Page 1 — executive dashboard, project health and overall summary */}
      {register && metrics && (
        <ExecutiveSummaryPage register={register} metrics={metrics} attention={attention || []} today={today || new Date().toISOString().slice(0, 10)} />
      )}

      {/* Page 2 onwards — detailed status */}
      <div className={register && metrics ? 'pmrep-pagebreak' : undefined}>
        <h2 className="pmrep-h2" style={{ marginTop: 0 }}>Detailed status</h2>
      </div>

      {/* Schedule KPI Summary Grid */}
      <div className="pmrep-kpis">
        <div className="pmrep-kpi">
          <span className="pmrep-kpi-lbl">Schedule Elapsed</span>
          <b className="pmrep-kpi-val">{elapsed.elapsedPercent}%</b>
          <small>{elapsed.elapsedWorkingDays} of {elapsed.totalWorkingDays} working days</small>
        </div>
        <div className="pmrep-kpi">
          <span className="pmrep-kpi-lbl">Milestones Progress</span>
          <b className="pmrep-kpi-val">{milestonePct}%</b>
          <small>{data.milestones.filter((m) => m.status === 'Complete').length}/{data.milestones.length} milestones done</small>
        </div>
        <div className="pmrep-kpi">
          <span className="pmrep-kpi-lbl">Floor Progress (GF / 2F / 3F)</span>
          <b className="pmrep-kpi-val">{gfPct}% · {f2Pct}% · {f3Pct}%</b>
          <small>Weighted by working days</small>
        </div>
        <div className="pmrep-kpi">
          <span className="pmrep-kpi-lbl">Concrete Pours</span>
          <b className="pmrep-kpi-val">{concrete.percent}%</b>
          <small>{concrete.completed}/{concrete.total} pours approved</small>
        </div>
        <div className="pmrep-kpi">
          <span className="pmrep-kpi-lbl">Production Episodes</span>
          <b className="pmrep-kpi-val">{epDone}/{data.episodes.length}</b>
          <small>{data.episodes.length}-item series slate</small>
        </div>
      </div>

      {/* Section 1: Executive Milestones */}
      <section className="pmrep-section">
        <h2 className="pmrep-h2">1. Executive Milestones</h2>
        <table>
          <thead>
            <tr>
              <th style={{ width: '190px' }}>Target Date</th>
              <th>Milestone Description</th>
              <th style={{ width: '130px' }}>Tag</th>
              <th style={{ width: '150px' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {data.milestones.map((m) => (
              <tr key={m.id}>
                <td className="num"><b>{m.dateText}</b></td>
                <td>{m.label}</td>
                <td>{m.badge?.text || '—'}</td>
                <td>
                  <span className="pmrep-badge" style={badgeStyle(m.status)}>
                    {m.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Section 2: Floor Scope Summary */}
      <section className="pmrep-section">
        <h2 className="pmrep-h2">2. Construction Scopes by Floor</h2>
        {(['GF', '2F', '3F'] as const).map((floor) => {
          const floorScopes = data.scopes.filter((s) => s.floor === floor);
          const floorLabel =
            floor === 'GF' ? 'Ground Floor (GF)' : floor === '2F' ? 'Second Floor (2F)' : 'Third Floor (3F)';
          const floorPct = floor === 'GF' ? gfPct : floor === '2F' ? f2Pct : f3Pct;
          return (
            <div key={floor} className="pmrep-subblock">
              <div className="pmrep-subhdr">
                <span>{floorLabel}</span>
                <b>{floorPct}% weighted completion ({floorScopes.length} scopes)</b>
              </div>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: '95px' }}>Phase</th>
                    <th>Scope of Work</th>
                    <th style={{ width: '165px' }}>Scheduled Dates</th>
                    <th style={{ width: '75px' }}>Days</th>
                    <th style={{ width: '90px' }}>Progress</th>
                  </tr>
                </thead>
                <tbody>
                  {floorScopes.map((s) => (
                    <tr key={s.id}>
                      <td>{s.phase}</td>
                      <td>
                        <b>{s.name}</b>
                        {s.subNote ? <div className="pmrep-note">{s.subNote}</div> : null}
                      </td>
                      <td className="num">{s.dateText}</td>
                      <td className="num">{s.workingDays} d</td>
                      <td className="num"><b>{s.percentComplete}%</b></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </section>

      {/* Section 3: Concrete Pouring Status */}
      <section className="pmrep-section">
        <h2 className="pmrep-h2">3. Concrete Pouring Milestones</h2>
        <table>
          <thead>
            <tr>
              <th style={{ width: '50px' }}>Floor</th>
              <th style={{ width: '130px' }}>Component</th>
              <th>Pouring Activity</th>
              <th style={{ width: '92px' }}>Target Pour</th>
              <th style={{ width: '92px' }}>Actual Pour</th>
              <th style={{ width: '150px' }}>Milestone Status</th>
              <th style={{ width: '150px' }}>Remarks</th>
            </tr>
          </thead>
          <tbody>
            {data.pours.map((p) => (
              <tr key={p.id}>
                <td><b>{p.floor}</b></td>
                <td>{p.component}</td>
                <td>{p.activity}</td>
                <td className="num">{p.targetPour || '—'}</td>
                <td className="num">{p.actualPour || '—'}</td>
                <td>
                  <span className="pmrep-badge" style={badgeStyle(p.milestoneStatus)}>
                    {p.milestoneStatus}
                  </span>
                </td>
                <td>{p.remarks || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Section 4: Production Calendar */}
      <section className="pmrep-section">
        <h2 className="pmrep-h2">4. Production Calendar ({data.episodes.length} Episodes)</h2>
        <table>
          <thead>
            <tr>
              <th style={{ width: '42px' }}>Ep</th>
              <th>Title &amp; Topic</th>
              <th style={{ width: '170px' }}>Related Scope</th>
              <th style={{ width: '100px' }}>Shoot Start</th>
              <th style={{ width: '100px' }}>Release Date</th>
              <th style={{ width: '115px' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {data.episodes.map((e) => (
              <tr key={e.id}>
                <td className="num"><b>{e.episodeLabel || String(e.number).padStart(2, '0')}</b></td>
                <td>
                  <b>{e.title}</b>
                  {e.topic ? <div className="pmrep-note">{e.topic}</div> : null}
                </td>
                <td>{e.scopeOfWork || '—'}</td>
                <td className="num">{e.shootStart || '—'}</td>
                <td className="num">{e.releaseDate || '—'}</td>
                <td>
                  <span className="pmrep-badge" style={badgeStyle(e.status)}>
                    {e.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <footer className="pmrep-footer">
        <span>Convengers Bahay Build · www.ConvengersAssemble.com</span>
        <span>Assumes Mon–Sat workweek excluding listed Philippine holidays &amp; Dec 20–Jan 3 stoppage.</span>
      </footer>
    </div>
  );
};
