/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * 01 — COMMAND CENTER (executive overview)
 */

import React, { useMemo } from 'react';
import { TrendingUp, Target, Activity, CalendarCheck, CalendarClock, Gauge, CircleCheck, Hourglass, CircleAlert, CalendarDays, ShieldAlert, Siren } from 'lucide-react';
import { useCommand } from './context.tsx';
import { Card, Kpi, HealthBadge, StatusPill, ProgressBar, Empty, Pill, pct, kindColor, HEALTH_HEX, tintBg } from './ui.tsx';
import { addDays, diffDays, fmtDate, fmtRange } from '../domain/dates.ts';
import { ALIGNMENT_COLORS, alignmentSummary } from '../domain/alignment.ts';
import { fmtVar } from '../domain/reports.ts';

export const CommandCenter: React.FC = () => {
  const { register, metrics, alignment, attention, today, actions, issues, isLive, sharedStorage } = useCommand();
  const m = metrics;

  const thisWeekEnd = addDays(today, 7);
  const ops = useMemo(() => {
    const completedRecent = register
      .filter((r) => r.status === 'Completed')
      .sort((a, b) => (b.actualFinish || b.lastUpdated || b.finish || '').localeCompare(a.actualFinish || a.lastUpdated || a.finish || ''))
      .slice(0, 5);
    const ongoing = register.filter((r) => r.status === 'Ongoing');
    const delayed = register.filter((r) => r.status === 'Delayed');
    const upcoming = register.filter((r) => r.status === 'Upcoming' && r.start && r.start <= addDays(today, 14));
    return { completedRecent, ongoing, delayed, upcoming };
  }, [register, today]);

  const nextMilestones = useMemo(
    () =>
      register
        .filter((r) => (r.kind === 'milestone' || r.kind === 'pour') && r.status !== 'Completed')
        .sort((a, b) => (a.finish || a.start || '').localeCompare(b.finish || b.start || ''))
        .slice(0, 6),
    [register]
  );

  const windowEnd = addDays(today, 21);
  const upcomingShoots = alignment.filter((a) => a.episode.status !== 'Completed' && a.episode.start && a.episode.start <= windowEnd && (a.episode.finish || a.episode.start) >= today);
  const upcomingConstruction = register.filter((r) => r.stream === 'Construction' && r.status !== 'Completed' && r.start && r.start <= windowEnd && (r.finish || r.start) >= today).slice(0, 8);
  const summary = alignmentSummary(alignment);
  const topAttention = attention.filter((a) => a.severity !== 'info').slice(0, 8);
  const decisions = attention.filter((a) => a.category === 'Decision required');
  const openIssues = issues.filter((i) => i.status !== 'Resolved' && i.status !== 'Closed');

  return (
    <div className="cv-grid" style={{ gap: 16 }}>
      {/* Project health */}
      <Card
        title="Project health"
        note={`As of ${fmtDate(today)} · computed from ${register.filter((r) => r.kind === 'scope').length} weighted scopes of work`}
        actions={
          <>
            <span className="cv-chip" title={isLive ? 'Connected to the shared Firestore project database' : 'Realtime presence server not connected'}>
              <span className="cv-dot" style={{ background: isLive ? '#22A05A' : '#E0A800' }} /> {isLive ? 'Live collaboration' : 'Shared database (presence offline)'}
            </span>
            <HealthBadge level={m.health} big />
          </>
        }
      >
        <div className="cv-kpis">
          <Kpi icon={TrendingUp} label="Actual physical accomplishment" value={pct(m.actualPct)} accent sub="Working-day weighted scope progress" />
          <Kpi icon={Target} label="Planned accomplishment" value={pct(m.plannedPct)} sub="Baseline plan as of today" />
          <Kpi
            icon={Activity}
            label="Schedule variance"
            value={fmtVar(m.variancePct)}
            color={m.variancePct < -3 ? '#D92D3F' : m.variancePct < 0 ? '#E0A800' : '#22A05A'}
            sub={m.spi !== null ? `SPI ${m.spi.toFixed(2)} (actual ÷ planned)` : 'SPI available once planned > 0'}
          />
          <Kpi icon={CalendarCheck} label="Target completion" value={fmtDate(m.targetCompletion)} sub="Turnover ceremony milestone" />
          <Kpi
            icon={CalendarClock}
            label="Projected completion"
            value={fmtDate(m.projectedCompletion)}
            color={m.completionVarianceDays > 0 ? '#D92D3F' : undefined}
            sub={
              m.completionVarianceDays > 0
                ? `${m.completionVarianceDays} day(s) late · from current schedule`
                : m.unrescheduledOverdue
                ? `Current schedule · ${m.unrescheduledOverdue} overdue item(s) not yet re-scheduled`
                : 'From current schedule'
            }
          />
          <Kpi
            icon={Gauge}
            label="Indicative at current pace"
            value={m.paceCompletion ? fmtDate(m.paceCompletion) : '—'}
            sub={m.paceCompletion ? 'Projection only: remaining time ÷ SPI' : 'Not computed (on/above plan or no plan yet)'}
          />
        </div>
        <div className="cv-row" style={{ marginTop: 12, gap: 6 }}>
          {m.healthReasons.map((r) => (
            <span key={r} className="cv-chip" style={{ borderColor: HEALTH_HEX[m.health], color: 'inherit' }}>
              {r}
            </span>
          ))}
          <span className="cv-dim">Schedule elapsed {m.elapsedPct}% · Milestones {m.milestonesComplete}/{m.milestonesTotal} complete · Episodes {m.episodesCompleted}/{m.episodesTotal} completed</span>
        </div>
        {(!sharedStorage.reports || !sharedStorage.snapshots) && (
          <div className="cv-dim" style={{ marginTop: 8 }}>
            Note: report / trend history storage is currently on this device only — see Settings & Data for details.
          </div>
        )}
      </Card>

      {/* Current operations */}
      <div className="cv-kpis">
        {[
          { label: 'Completed', v: m.counts.completed, c: '#22A05A', f: 'Completed', i: CircleCheck },
          { label: 'Ongoing', v: m.counts.ongoing, c: '#8746D6', f: 'Ongoing', i: Hourglass },
          { label: 'Delayed', v: m.counts.delayed, c: '#D92D3F', f: 'Delayed', i: CircleAlert },
          { label: 'Upcoming (next 14 days)', v: ops.upcoming.length, c: '#A45BE8', f: 'Upcoming', i: CalendarDays },
          { label: 'Open issues & risks', v: openIssues.length, c: '#B98BEA', f: '', i: ShieldAlert },
          { label: 'Critical pending actions', v: attention.filter((a) => a.severity === 'critical').length, c: '#D92D3F', f: '', i: Siren },
        ].map((k) => (
          <button
            type="button"
            key={k.label}
            className="cv-kpi has-ico"
            style={{ textAlign: 'left', cursor: 'pointer', color: 'inherit' }}
            onClick={() => actions.navigate(k.f ? `tracker/register/status=${k.f}` : 'issues/attention')}
            title="Open the filtered list"
          >
            <span className="cv-kpi-ico" style={{ color: k.c, background: tintBg(k.c) }} aria-hidden>
              <k.i size={22} strokeWidth={1.9} />
            </span>
            <span style={{ minWidth: 0 }}>
              <div className="cv-kpi-l">{k.label}</div>
              <div className="cv-kpi-v" style={{ color: k.c }}>
                {k.v}
              </div>
              <div className="cv-kpi-s">View list →</div>
            </span>
          </button>
        ))}
      </div>

      <div className="cv-grid cv-g2">
        {/* Management attention */}
        <Card
          title="Management attention"
          note="Critical delays, overdue work, unresolved issues, decisions and conflicts"
          actions={
            <button type="button" className="cv-btn sm" onClick={() => actions.navigate('issues/attention')}>
              Full list ({attention.length})
            </button>
          }
        >
          {topAttention.length ? (
            <div className="cv-list">
              {topAttention.map((a) => (
                <button
                  type="button"
                  key={a.id}
                  className="cv-li clickable"
                  style={{ textAlign: 'left', color: 'inherit' }}
                  onClick={() => (a.activityId ? actions.openActivity(a.activityId) : actions.navigate('issues/log'))}
                >
                  <span className="cv-sev" style={{ background: a.severity === 'critical' ? '#D92D3F' : '#E0A800' }} />
                  <div className="cv-li-main">
                    <div className="cv-li-t">
                      <span className="cv-chip" style={{ marginRight: 6 }}>
                        {a.category}
                      </span>
                      {a.title}
                    </div>
                    <div className="cv-li-s">{a.detail}</div>
                    <div className="cv-li-s">Owner: {a.owner || <b className="cv-late">Unassigned</b>}</div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <Empty>No critical or warning items. Everything recorded is on schedule.</Empty>
          )}
          {decisions.length > 0 && (
            <div style={{ marginTop: 10 }} className="cv-dim">
              {decisions.length} decision(s) awaiting management approval.
            </div>
          )}
        </Card>

        {/* Upcoming milestones */}
        <Card
          title="Upcoming critical milestones"
          actions={
            <button type="button" className="cv-btn sm" onClick={() => actions.navigate('milestones')}>
              Milestone monitoring
            </button>
          }
        >
          {nextMilestones.length ? (
            <div className="cv-table-wrap">
              <table className="cv-table">
                <thead>
                  <tr>
                    <th>Milestone</th>
                    <th>Target</th>
                    <th>Status</th>
                    <th>Responsible</th>
                    <th>Dependencies</th>
                  </tr>
                </thead>
                <tbody>
                  {nextMilestones.map((r) => (
                    <tr key={r.id} className="clickable" onClick={() => actions.openActivity(r.id)}>
                      <td>
                        <div className="cv-strong">{r.name}</div>
                        {r.badge && <span className="cv-chip">{r.badge}</span>}
                      </td>
                      <td className="nowrap">
                        {fmtRange(r.start, r.finish)}
                        <div className={r.finish && r.finish < today ? 'cv-late' : 'cv-dim'}>
                          {r.finish ? (r.finish < today ? `${diffDays(r.finish, today)} day(s) overdue` : `in ${diffDays(today, r.finish)} day(s)`) : ''}
                        </div>
                      </td>
                      <td>
                        <StatusPill status={r.status} />
                      </td>
                      <td>{r.owner || <span className="cv-late">Unassigned</span>}</td>
                      <td className="cv-dim">
                        {r.dependsOn.length
                          ? r.dependsOn
                              .map((id) => register.find((x) => x.id === id))
                              .filter(Boolean)
                              .map((d) => `${d!.name} (${d!.status})`)
                              .join('; ')
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>All milestones are complete.</Empty>
          )}
        </Card>
      </div>

      {/* Production & construction alignment */}
      <Card
        title="Production & construction alignment — next 21 days"
        note="Shoot windows compared with the construction schedule. Calendars are never changed automatically."
        actions={
          <button type="button" className="cv-btn sm" onClick={() => actions.navigate('production/alignment')}>
            Schedule alignment
          </button>
        }
      >
        <div className="cv-row" style={{ marginBottom: 10, gap: 6 }}>
          {Object.entries(summary).map(([k, v]) => (
            <Pill key={k} label={`${k}: ${v}`} color={ALIGNMENT_COLORS[k as keyof typeof ALIGNMENT_COLORS]} />
          ))}
        </div>
        <div className="cv-grid cv-g2">
          <div>
            <div className="cv-kpi-l" style={{ marginBottom: 6 }}>
              Upcoming shoots
            </div>
            {upcomingShoots.length ? (
              <div className="cv-list">
                {upcomingShoots.map((a) => (
                  <button type="button" key={a.episode.id} className="cv-li clickable" style={{ textAlign: 'left', color: 'inherit' }} onClick={() => actions.openActivity(a.episode.id)}>
                    <span className="cv-sev" style={{ background: ALIGNMENT_COLORS[a.classification] }} />
                    <div className="cv-li-main">
                      <div className="cv-li-t">{a.episode.name}</div>
                      <div className="cv-li-s">
                        {fmtRange(a.episode.start, a.episode.finish)} · {a.episode.location || 'Location TBC'} · {a.episode.characters.length} character(s)
                      </div>
                      {a.alerts[0] && <div className="cv-li-s">{a.alerts[0].message}</div>}
                    </div>
                    <Pill label={a.classification} color={ALIGNMENT_COLORS[a.classification]} />
                  </button>
                ))}
              </div>
            ) : (
              <Empty>No shoots scheduled in the next 21 days.</Empty>
            )}
          </div>
          <div>
            <div className="cv-kpi-l" style={{ marginBottom: 6 }}>
              Construction activities in the same window
            </div>
            {upcomingConstruction.length ? (
              <div className="cv-list">
                {upcomingConstruction.map((r) => (
                  <button type="button" key={r.id} className="cv-li clickable" style={{ textAlign: 'left', color: 'inherit' }} onClick={() => actions.openActivity(r.id)}>
                    <span className="cv-sev" style={{ background: kindColor(r.kind, r.stream) }} />
                    <div className="cv-li-main">
                      <div className="cv-li-t">{r.name}</div>
                      <div className="cv-li-s">
                        {r.workstream} · {fmtRange(r.start, r.finish)} · {r.commitment}
                      </div>
                    </div>
                    <StatusPill status={r.status} />
                  </button>
                ))}
              </div>
            ) : (
              <Empty>No construction activities in this window.</Empty>
            )}
          </div>
        </div>
      </Card>

      <div className="cv-grid cv-g2">
        <Card
          title="Workstream progress"
          note="Bar = actual · marker = planned today"
          actions={
            <button type="button" className="cv-btn sm" onClick={() => actions.navigate('analytics/performance')}>
              Analytics
            </button>
          }
        >
          {m.workstreams.map((w) => (
            <div key={w.key} className="cv-hbar">
              <span className="cv-strong">{w.label}</span>
              <ProgressBar actual={w.actual} planned={w.planned} />
              <span className="cv-dim" style={{ textAlign: 'right' }}>
                {w.actual.toFixed(0)}% / {w.planned.toFixed(0)}%
              </span>
            </div>
          ))}
        </Card>

        <Card
          title="This week & next"
          note={`${fmtDate(today)} – ${fmtDate(thisWeekEnd)}`}
          actions={
            <button type="button" className="cv-btn sm" onClick={() => actions.navigate('analytics/forecast')}>
              Forecast
            </button>
          }
        >
          {[...ops.ongoing, ...ops.delayed, ...ops.upcoming].filter((r) => r.start && r.start <= thisWeekEnd).length ? (
            <div className="cv-list">
              {[...ops.delayed, ...ops.ongoing, ...ops.upcoming]
                .filter((r) => r.start && r.start <= thisWeekEnd)
                .slice(0, 8)
                .map((r) => (
                  <button type="button" key={r.id} className="cv-li clickable" style={{ textAlign: 'left', color: 'inherit' }} onClick={() => actions.openActivity(r.id)}>
                    <span className="cv-sev" style={{ background: kindColor(r.kind, r.stream) }} />
                    <div className="cv-li-main">
                      <div className="cv-li-t">{r.name}</div>
                      <div className="cv-li-s">
                        {r.workstream} · {fmtRange(r.start, r.finish)} · {r.owner || 'Unassigned'}
                      </div>
                    </div>
                    <StatusPill status={r.status} />
                  </button>
                ))}
            </div>
          ) : (
            <Empty>Nothing scheduled this week.</Empty>
          )}
          {ops.completedRecent.length > 0 && (
            <div className="cv-dim" style={{ marginTop: 10 }}>
              Recently completed: {ops.completedRecent.map((r) => r.name).join(' · ')}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};
