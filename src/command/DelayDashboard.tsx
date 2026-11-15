/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Schedule Delay & Target Projection Dashboard:
 * Shows exact delay of Target vs Projected Completion (and pace/overdue exposure)
 * in Days, Weeks, Months, and Working Days, plus per-workstream, milestone,
 * and activity-level delay breakdowns.
 */

import React, { useMemo, useState } from 'react';
import {
  CalendarClock,
  CalendarDays,
  CalendarRange,
  Clock,
  Gauge,
  AlertTriangle,
  Search,
  Flag,
} from 'lucide-react';
import './exec.css';
import { useCommand } from './context.tsx';
import { Card, Empty, StatusPill, Banner } from './ui.tsx';
import { ChartBox } from './charts.tsx';
import { fmtDate } from '../domain/dates.ts';
import { buildDelayReport, DelayCategory, DelayDuration } from '../domain/delays.ts';

type DelayTab = 'overview' | 'activities' | 'milestones';
type CompareMode = 'projected' | 'pace' | 'overdue';

const CATEGORY_STYLE: Record<DelayCategory, { bg: string; fg: string }> = {
  'Overdue now': { bg: '#E0213B', fg: '#FFFFFF' },
  'Rescheduled slip': { bg: '#FF9A1F', fg: '#0A1140' },
  'Finished late': { bg: '#1F6FE0', fg: '#FFFFFF' },
  'On / ahead': { bg: '#4BE08A', fg: '#0A1140' },
};

function signed(n: number, unit: string, pluralUnit?: string): string {
  const abs = Math.abs(n);
  const label = abs === 1 ? unit : pluralUnit || `${unit}s`;
  if (n === 0) return `0 ${pluralUnit || `${unit}s`}`;
  return `${n > 0 ? '+' : '-'}${abs} ${label}`;
}

export const DelayDashboard: React.FC = () => {
  const { register, metrics, today, actions } = useCommand();
  const report = useMemo(() => buildDelayReport(register, metrics, today), [register, metrics, today]);
  const [tab, setTab] = useState<DelayTab>('overview');
  const [mode, setMode] = useState<CompareMode>('projected');
  const [catFilter, setCatFilter] = useState<DelayCategory | ''>('');
  const [wsFilter, setWsFilter] = useState('');
  const [q, setQ] = useState('');

  const activeDuration: DelayDuration = useMemo(() => {
    if (mode === 'pace' && report.targetVsPace) return report.targetVsPace;
    if (mode === 'overdue' && report.maxOpenOverdue) return report.maxOpenOverdue;
    return report.targetVsProjected;
  }, [mode, report]);

  const activeSubtitle = useMemo(() => {
    if (mode === 'pace' && report.paceCompletion) {
      return `Baseline Target ${fmtDate(report.targetCompletion)} → Pace Forecast ${fmtDate(report.paceCompletion)} (SPI ${metrics.spi?.toFixed(2) ?? '—'})`;
    }
    if (mode === 'overdue') {
      return report.maxOpenOverdue
        ? `Longest active overdue activity as of ${fmtDate(today)} across ${report.overdueCount} delayed item(s)`
        : 'No currently overdue items';
    }
    return `Baseline Target ${fmtDate(report.targetCompletion)} → Current Projected ${fmtDate(report.projectedCompletion)}`;
  }, [mode, report, metrics.spi, today]);

  const delayColor = activeDuration.days > 14 ? '#E0213B' : activeDuration.days > 0 ? '#FF9A1F' : '#117A42';
  const delayTopBorder = activeDuration.days > 14 ? '#E0213B' : activeDuration.days > 0 ? '#FF9A1F' : '#4BE08A';

  const workstreamOptions = useMemo(() => Array.from(new Set(register.map((r) => r.workstream))).sort(), [register]);

  const filteredRows = useMemo(() => {
    const query = q.trim().toLowerCase();
    return report.rows.filter((row) => {
      if (catFilter && row.category !== catFilter) return false;
      if (wsFilter && row.activity.workstream !== wsFilter) return false;
      if (query) {
        const hay = `${row.activity.id} ${row.activity.name} ${row.activity.workstream} ${row.activity.owner}`.toLowerCase();
        if (!hay.includes(query)) return false;
      }
      return true;
    });
  }, [report.rows, catFilter, wsFilter, q]);

  const delayedWorkstreams = useMemo(() => report.workstreams.filter((w) => (w.maxItemDelay?.days || 0) > 0 || (w.endDelay?.days || 0) > 0), [report.workstreams]);

  return (
    <div className="cv-grid" style={{ gap: 16 }}>
      {/* Comparison Mode Switcher + Summary Strip */}
      <Card
        title="Target vs. Projected Completion Delay"
        note={activeSubtitle}
        actions={
          <div className="ex-seg" role="group" aria-label="Delay measurement basis">
            <button type="button" className={mode === 'projected' ? 'on' : ''} onClick={() => setMode('projected')}>
              Schedule Projection
            </button>
            <button
              type="button"
              className={mode === 'pace' ? 'on' : ''}
              onClick={() => setMode('pace')}
              disabled={!report.targetVsPace}
              title={report.targetVsPace ? 'Compare baseline target against current SPI pace projection' : 'Available when SPI is below 1.00'}
            >
              SPI Pace
            </button>
            <button
              type="button"
              className={mode === 'overdue' ? 'on' : ''}
              onClick={() => setMode('overdue')}
              disabled={!report.maxOpenOverdue}
              title={report.maxOpenOverdue ? 'Longest open overdue activity as of today' : 'No open overdue items'}
            >
              Active Overdue
            </button>
          </div>
        }
      >
        <div className="ex-delay-dates">
          <div className="ex-delay-datebox">
            <span>Baseline Target Completion</span>
            <b>{fmtDate(report.targetCompletion)}</b>
            <em>Turnover ceremony milestone</em>
          </div>
          <div className="ex-delay-datebox">
            <span>Current Projected Completion</span>
            <b style={{ color: report.targetVsProjected.days > 0 ? '#E0213B' : '#0A1140' }}>{fmtDate(report.projectedCompletion)}</b>
            <em>{report.targetVsProjected.days > 0 ? `${report.targetVsProjected.breakdownLabel} past target` : report.targetVsProjected.days < 0 ? report.targetVsProjected.breakdownLabel : 'Matches baseline target'}</em>
          </div>
          <div className="ex-delay-datebox">
            <span>Indicative at Current Pace</span>
            <b style={{ color: report.targetVsPace && report.targetVsPace.days > 0 ? '#B45309' : undefined }}>
              {report.paceCompletion ? fmtDate(report.paceCompletion) : 'On / above plan'}
            </b>
            <em>
              {report.targetVsPace
                ? `${report.targetVsPace.breakdownLabel} · SPI ${metrics.spi?.toFixed(2)}`
                : metrics.spi !== null
                  ? `SPI ${metrics.spi.toFixed(2)} (on schedule)`
                  : 'Planned progress pending'}
            </em>
          </div>
          <div className="ex-delay-datebox">
            <span>Combined Breakdown</span>
            <b style={{ color: delayColor }}>{activeDuration.breakdownLabel}</b>
            <em>
              {report.overdueCount} overdue now · {report.slippedCount} rescheduled · {report.finishedLateCount} finished late
            </em>
          </div>
        </div>
      </Card>

      {/* 4 Unit KPI Cards: Days, Weeks, Months, Working Days */}
      <div className="ex-kpis">
        <div className="ex-kpi" style={{ ['--k' as any]: delayTopBorder, ['--k-fg' as any]: delayColor, cursor: 'default' }}>
          <span className="ex-kpi-ico">
            <Clock size={20} strokeWidth={2.1} aria-hidden />
          </span>
          <span className="ex-kpi-l">Days Delayed</span>
          <span className="ex-kpi-v" style={{ color: delayColor }}>
            {signed(activeDuration.days, 'day')}
          </span>
          <span className="ex-kpi-s">Calendar days variance</span>
        </div>

        <div className="ex-kpi" style={{ ['--k' as any]: '#7B4DFF', ['--k-fg' as any]: '#7B4DFF', cursor: 'default' }}>
          <span className="ex-kpi-ico">
            <CalendarRange size={20} strokeWidth={2.1} aria-hidden />
          </span>
          <span className="ex-kpi-l">Weeks Delayed</span>
          <span className="ex-kpi-v">
            {activeDuration.weeks > 0 ? `+${activeDuration.weeks}` : activeDuration.weeks} wks
          </span>
          <span className="ex-kpi-s">
            {activeDuration.days === 0 ? '0 wks 0 days' : `${Math.trunc(Math.abs(activeDuration.days) / 7)} wk(s), ${Math.abs(activeDuration.days) % 7} day(s)`}
          </span>
        </div>

        <div className="ex-kpi dark" style={{ ['--k' as any]: '#F5C518', ['--k-fg' as any]: '#0A1140', cursor: 'default' }}>
          <span className="ex-kpi-ico">
            <CalendarClock size={20} strokeWidth={2.1} aria-hidden />
          </span>
          <span className="ex-kpi-l">Months Delayed</span>
          <span className="ex-kpi-v">
            {activeDuration.months > 0 ? `+${activeDuration.months}` : activeDuration.months} mos
          </span>
          <span className="ex-kpi-s">
            {activeDuration.calendarMonths > 0
              ? `${activeDuration.calendarMonths} cal mo(s), ${activeDuration.calendarRemDays} day(s)`
              : `${Math.abs(activeDuration.days)} day(s) (< 1 cal mo)`}
          </span>
        </div>

        <div className="ex-kpi" style={{ ['--k' as any]: '#1F6FE0', ['--k-fg' as any]: '#1F6FE0', cursor: 'default' }}>
          <span className="ex-kpi-ico">
            <CalendarDays size={20} strokeWidth={2.1} aria-hidden />
          </span>
          <span className="ex-kpi-l">Working Days Impact</span>
          <span className="ex-kpi-v">{signed(activeDuration.workingDays, 'wd', 'wds')}</span>
          <span className="ex-kpi-s">Excludes Sundays, PH holidays &amp; stoppage</span>
        </div>
      </div>

      {report.targetVsProjected.days === 0 && (report.overdueCount > 0 || (report.targetVsPace && report.targetVsPace.days > 0)) && (
        <Banner kind="warn">
          Current projected turnover date still shows <b>{fmtDate(report.targetCompletion)}</b> because {report.overdueCount} overdue item(s) have not had their future target dates revised yet
          {report.targetVsPace && report.targetVsPace.days > 0 ? `, while current SPI (${metrics.spi?.toFixed(2)}) projects +${report.targetVsPace.days} days (${report.targetVsPace.weeks} wks / ${report.targetVsPace.months} mos)` : ''}. Switch the basis above to <b>SPI Pace</b> or <b>Active Overdue</b> to inspect full delay exposure.
        </Banner>
      )}

      {/* Sub-tabs */}
      <div className="ex-tabs" role="tablist" aria-label="Delay dashboard views">
        <button type="button" role="tab" aria-selected={tab === 'overview'} className={tab === 'overview' ? 'on' : ''} onClick={() => setTab('overview')}>
          Overview &amp; Workstream Delays
        </button>
        <button type="button" role="tab" aria-selected={tab === 'activities'} className={tab === 'activities' ? 'on' : ''} onClick={() => setTab('activities')}>
          Delayed &amp; Slipped Activities ({report.totalImpactedCount})
        </button>
        <button type="button" role="tab" aria-selected={tab === 'milestones'} className={tab === 'milestones' ? 'on' : ''} onClick={() => setTab('milestones')}>
          Milestones &amp; Pours Variance ({report.milestones.length})
        </button>
      </div>

      {tab === 'overview' && (
        <div className="cv-grid" style={{ gap: 14 }}>
          <div className="cv-grid cv-g2 ex-g2">
            <Card title="Max delay by workstream (days)" note="Worst active overdue or slipped target within each workstream">
              {delayedWorkstreams.length === 0 ? (
                <Empty>No delayed or slipped activities in any workstream.</Empty>
              ) : (
                <ChartBox
                  label="Workstream max delay in days"
                  height={Math.max(220, delayedWorkstreams.length * 36)}
                  spec={{
                    type: 'bar',
                    horizontal: true,
                    labels: delayedWorkstreams.map((w) => w.workstream),
                    datasets: [
                      {
                        label: 'Max delay (days)',
                        data: delayedWorkstreams.map((w) => Math.max(w.maxItemDelay?.days || 0, w.endDelay?.days || 0)),
                        color: '#E0213B',
                      },
                    ],
                    onClick: (i) => {
                      const ws = delayedWorkstreams[i]?.workstream;
                      if (ws) {
                        setWsFilter(ws);
                        setTab('activities');
                      }
                    },
                  }}
                />
              )}
            </Card>

            <Card title="Top delayed & slipped items" note="Click any row to open and revise schedule dates">
              {report.rows.length === 0 ? (
                <Empty>All scheduled activities are on or ahead of their target dates.</Empty>
              ) : (
                <div className="ex-scroll" style={{ maxHeight: 280 }}>
                  {report.rows.slice(0, 12).map((row) => {
                    const st = CATEGORY_STYLE[row.category];
                    return (
                      <button
                        key={row.activity.id}
                        type="button"
                        className="ex-nia"
                        onClick={() => actions.openActivity(row.activity.id)}
                      >
                        <span className="ex-pr" style={{ background: st.bg, color: st.fg }}>
                          {row.category}
                        </span>
                        <span className="ex-nia-b">
                          <b>{row.activity.name}</b>
                          <em>
                            {row.activity.workstream} · Baseline {fmtDate(row.baselineDate)} → {fmtDate(row.effectiveDate)}
                          </em>
                          <span className="ex-nia-a" style={{ color: '#E0213B' }}>
                            +{row.effectiveDelay.days}d · +{row.effectiveDelay.weeks}w · +{row.effectiveDelay.months}m ({row.effectiveDelay.breakdownLabel})
                          </span>
                        </span>
                        <Gauge size={15} className="cv-dim" aria-hidden />
                      </button>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>

          <Card title="Workstream delay summary (Days · Weeks · Months)" note="Compares each workstream's baseline end date against its current/effective end date">
            {report.workstreams.length === 0 ? (
              <Empty>No workstreams found in the register.</Empty>
            ) : (
              <div className="cv-table-wrap">
                <table className="cv-table">
                  <thead>
                    <tr>
                      <th className="sticky">Workstream</th>
                      <th className="num">Items</th>
                      <th className="num">Overdue now</th>
                      <th className="num">Rescheduled</th>
                      <th className="num">Finished late</th>
                      <th>Baseline end</th>
                      <th>Projected end</th>
                      <th className="num">End variance (Days / Wks / Mos)</th>
                      <th className="num">Worst item delay</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.workstreams.map((w) => (
                      <tr
                        key={w.workstream}
                        className="ex-click"
                        onClick={() => {
                          setWsFilter(w.workstream);
                          setTab('activities');
                        }}
                      >
                        <td className="sticky cv-strong">{w.workstream}</td>
                        <td className="num">{w.total}</td>
                        <td className={`num ${w.delayedCount ? 'cv-late' : ''}`}>{w.delayedCount}</td>
                        <td className="num">{w.slippedCount}</td>
                        <td className="num">{w.finishedLateCount}</td>
                        <td className="nowrap">{fmtDate(w.baselineEnd)}</td>
                        <td className="nowrap">{fmtDate(w.projectedEnd)}</td>
                        <td className="num nowrap">
                          {w.endDelay ? (
                            w.endDelay.days > 0 ? (
                              <span className="cv-late">
                                +{w.endDelay.days}d · +{w.endDelay.weeks}w · +{w.endDelay.months}m
                              </span>
                            ) : w.endDelay.days < 0 ? (
                              <span className="cv-good">{w.endDelay.days}d</span>
                            ) : (
                              '0d (On target)'
                            )
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="num nowrap">
                          {w.maxItemDelay ? (
                            <span className="cv-late">
                              +{w.maxItemDelay.days}d ({w.maxItemDelay.breakdownLabel})
                            </span>
                          ) : (
                            <span className="cv-good">On target</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === 'activities' && (
        <Card title={`Delayed & Slipped Activities · ${filteredRows.length}`} note="Click any activity to open its editor and update progress or revise dates">
          <div className="cv-filters" style={{ marginBottom: 12 }}>
            {(['', 'Overdue now', 'Rescheduled slip', 'Finished late'] as const).map((c) => (
              <button
                key={c || 'all'}
                type="button"
                className={`cv-btn sm ${catFilter === c ? 'purple' : 'ghost'}`}
                onClick={() => setCatFilter(c)}
              >
                {c || 'All'}
              </button>
            ))}
            <select className="cv-select" value={wsFilter} onChange={(e) => setWsFilter(e.target.value)} aria-label="Filter by workstream">
              <option value="">All workstreams</option>
              {workstreamOptions.map((w) => (
                <option key={w}>{w}</option>
              ))}
            </select>
            <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
              <Search size={14} style={{ position: 'absolute', left: 9, color: 'var(--cv-muted)' }} aria-hidden />
              <input
                className="cv-input"
                style={{ paddingLeft: 28, width: 220 }}
                placeholder="Search activity or owner..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
          </div>

          {filteredRows.length === 0 ? (
            <Empty>No delayed or slipped activities match the selected filters.</Empty>
          ) : (
            <div className="cv-table-wrap">
              <table className="cv-table">
                <thead>
                  <tr>
                    <th className="sticky">Activity</th>
                    <th>Workstream</th>
                    <th>Baseline target</th>
                    <th>Current / Effective</th>
                    <th className="num">Days delayed</th>
                    <th className="num">Weeks</th>
                    <th className="num">Months</th>
                    <th>Breakdown</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Owner</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => {
                    const st = CATEGORY_STYLE[row.category];
                    return (
                      <tr key={row.activity.id} className="ex-click" onClick={() => actions.openActivity(row.activity.id)}>
                        <td className="sticky" style={{ minWidth: 220 }}>
                          <div className="cv-strong">{row.activity.name}</div>
                          <div className="cv-dim cv-mono">{row.activity.id}</div>
                        </td>
                        <td className="nowrap">{row.activity.workstream}</td>
                        <td className="nowrap">{fmtDate(row.baselineDate)}</td>
                        <td className="nowrap">{fmtDate(row.effectiveDate)}</td>
                        <td className="num nowrap cv-late">+{row.effectiveDelay.days} d</td>
                        <td className="num nowrap">+{row.effectiveDelay.weeks} wks</td>
                        <td className="num nowrap">+{row.effectiveDelay.months} mos</td>
                        <td className="nowrap cv-dim">
                          {row.effectiveDelay.breakdownLabel} · {row.effectiveDelay.workingDays} wds
                        </td>
                        <td>
                          <span className="ex-pr" style={{ background: st.bg, color: st.fg }}>
                            {row.category}
                          </span>
                        </td>
                        <td>
                          <StatusPill status={row.activity.status} />
                        </td>
                        <td>{row.activity.owner || <span className="ex-missing">Unassigned</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === 'milestones' && (
        <Card title={`Milestones & Concrete Pours Variance · ${report.milestones.length}`} note="Tracks baseline target vs current/actual completion across all milestones and pours">
          {report.milestones.length === 0 ? (
            <Empty>No milestones or concrete pours in the register.</Empty>
          ) : (
            <div className="cv-table-wrap">
              <table className="cv-table">
                <thead>
                  <tr>
                    <th className="sticky">Milestone / Pour</th>
                    <th>Kind</th>
                    <th>Baseline target</th>
                    <th>Current / Actual</th>
                    <th className="num">Days</th>
                    <th className="num">Weeks</th>
                    <th className="num">Months</th>
                    <th>Breakdown</th>
                    <th>Status</th>
                    <th>Owner</th>
                  </tr>
                </thead>
                <tbody>
                  {report.milestones.map((row) => (
                    <tr key={row.activity.id} className="ex-click" onClick={() => actions.openActivity(row.activity.id)}>
                      <td className="sticky cv-strong" style={{ minWidth: 220 }}>
                        <Flag size={13} style={{ marginRight: 6, verticalAlign: 'middle', color: row.effectiveDelay.days > 0 ? '#E0213B' : '#7B4DFF' }} aria-hidden />
                        {row.activity.name}
                      </td>
                      <td className="nowrap">{row.activity.kind === 'pour' ? 'Concrete pour' : 'Milestone'}</td>
                      <td className="nowrap">{fmtDate(row.baselineDate)}</td>
                      <td className="nowrap">{fmtDate(row.effectiveDate)}</td>
                      <td className={`num nowrap ${row.effectiveDelay.days > 0 ? 'cv-late' : row.effectiveDelay.days < 0 ? 'cv-good' : ''}`}>
                        {signed(row.effectiveDelay.days, 'd', 'd')}
                      </td>
                      <td className="num nowrap">{row.effectiveDelay.weeks > 0 ? `+${row.effectiveDelay.weeks}` : row.effectiveDelay.weeks} w</td>
                      <td className="num nowrap">{row.effectiveDelay.months > 0 ? `+${row.effectiveDelay.months}` : row.effectiveDelay.months} m</td>
                      <td className="nowrap cv-dim">{row.effectiveDelay.breakdownLabel}</td>
                      <td>
                        <StatusPill status={row.activity.status} />
                      </td>
                      <td>{row.activity.owner || <span className="ex-missing">Unassigned</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {report.totalImpactedCount === 0 && report.targetVsProjected.days <= 0 && (
        <Banner kind="info">
          <AlertTriangle size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} aria-hidden />
          No delays detected relative to recorded baseline dates as of {fmtDate(today)}.
        </Banner>
      )}
    </div>
  );
};
