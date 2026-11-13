/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * 01 — COMMAND CENTER (executive overview)
 */

import React, { useMemo } from 'react';
import { TrendingUp, Target, Activity, CalendarCheck, CalendarClock, Gauge, CircleCheck, Hourglass, CircleAlert, CalendarDays, ShieldAlert, Siren, User as UserIcon, ChevronRight } from 'lucide-react';
import { useCommand } from './context.tsx';
import { Card, Kpi, HealthBadge, StatusPill, ProgressBar, Empty, Pill, pct, kindColor, HEALTH_HEX, tintBg } from './ui.tsx';
import { addDays, diffDays, fmtDate, fmtRange } from '../domain/dates.ts';
import { ALIGNMENT_COLORS, alignmentSummary } from '../domain/alignment.ts';
import { fmtVar } from '../domain/reports.ts';
import { buildOutlook } from '../domain/attention.ts';
import { monthRange } from '../domain/dates.ts';
import { procurementStore, documentStore, publicationStore } from '../firebase/opsStores.ts';
import { useStore } from '../firebase/useStore.ts';
import { isDeliveryLate } from './Operations.tsx';

export const CommandCenter: React.FC = () => {
  const { register, metrics, alignment, attention, today, actions, issues, isLive, sharedStorage, snapshots } = useCommand();
  const m = metrics;
  // Week-on-week change, shown only when a recorded snapshot 7–10 days old exists (never estimated)
  const weekAgo = useMemo(() => {
    const from = addDays(today, -10);
    const to = addDays(today, -7);
    return [...snapshots].filter((s) => s.date >= from && s.date <= to).sort((a, b) => b.date.localeCompare(a.date))[0];
  }, [snapshots, today]);
  const trend = weekAgo ? Math.round((m.actualPct - weekAgo.actualPct) * 10) / 10 : null;

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
              <span className="cv-dot" style={{ background: isLive ? '#22A06B' : '#F5A623' }} /> {isLive ? 'Live collaboration' : 'Shared database (presence offline)'}
            </span>
            <HealthBadge level={m.health} big />
          </>
        }
      >
        <div className="cv-kpis cc-hk">
          <Kpi
            icon={TrendingUp}
            label="Actual physical accomplishment"
            value={pct(m.actualPct)}
            accent
            sub={
              trend !== null ? (
                <span>
                  <span className={`cv-trend ${trend >= 0 ? 'up' : 'down'}`}>
                    {trend >= 0 ? '↑' : '↓'} {trend >= 0 ? '+' : ''}
                    {trend} pts
                  </span>{' '}
                  since {fmtDate(weekAgo!.date, false)}
                </span>
              ) : (
                'Working-day weighted scope progress'
              )
            }
          />
          <Kpi icon={Target} label="Planned accomplishment" value={pct(m.plannedPct)} sub="Baseline plan as of today" />
          <Kpi
            icon={Activity}
            label="Schedule variance"
            value={fmtVar(m.variancePct)}
            color={m.variancePct < -3 ? '#E5484D' : m.variancePct < 0 ? '#F5A623' : '#22A06B'}
            sub={m.spi !== null ? `SPI ${m.spi.toFixed(2)} (actual ÷ planned)` : 'SPI available once planned > 0'}
          />
          <Kpi icon={CalendarCheck} label="Target completion" value={fmtDate(m.targetCompletion)} sub="Turnover ceremony milestone" />
          <Kpi
            icon={CalendarClock}
            label="Projected completion"
            value={fmtDate(m.projectedCompletion)}
            color={m.completionVarianceDays > 0 ? '#E5484D' : undefined}
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
        <div className="cc-chips">
          {m.healthReasons.map((r) => (
            <span key={r} className="cc-chip">
              <i style={{ background: HEALTH_HEX[m.health] }} />
              {r}
            </span>
          ))}
          <span className="cc-chip muted">Schedule elapsed {m.elapsedPct}% · Milestones {m.milestonesComplete}/{m.milestonesTotal} complete · Episodes {m.episodesCompleted}/{m.episodesTotal} completed</span>
        </div>
        {(!sharedStorage.reports || !sharedStorage.snapshots) && (
          <div className="cv-dim" style={{ marginTop: 8 }}>
            Note: report / trend history storage is currently on this device only — see Settings & Data for details.
          </div>
        )}
      </Card>

      {/* Current operations */}
      <div className="cc-stats">
        {[
          { label: 'Completed', v: m.counts.completed, c: 'green', f: 'Completed', i: CircleCheck },
          { label: 'Ongoing', v: m.counts.ongoing, c: 'purple', f: 'Ongoing', i: Hourglass },
          { label: 'Delayed', v: m.counts.delayed, c: 'red', f: 'Delayed', i: CircleAlert },
          { label: 'Upcoming (next 14 days)', v: ops.upcoming.length, c: 'blue', f: 'Upcoming', i: CalendarDays },
          { label: 'Open issues & risks', v: openIssues.length, c: 'navy', f: '', r: 'issues/log', i: ShieldAlert },
          { label: 'Critical pending actions', v: attention.filter((a) => a.severity === 'critical').length, c: 'orange', f: '', r: 'issues/attention', i: Siren },
        ].map((k) => (
          <button
            type="button"
            key={k.label}
            className={`cc-stat ${k.c}`}
            onClick={() => actions.navigate(k.f ? `tracker/register/status=${k.f}` : k.r!)}
            title="Open the filtered list"
          >
            <k.i className="cc-stat-ico" size={34} strokeWidth={1.8} aria-hidden />
            <span className="cc-stat-b">
              <span className="cc-stat-l">{k.label}</span>
              <span className="cc-stat-v">{k.v}</span>
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
            <div className="cc-att-list">
              {topAttention.map((a) => {
                const act = a.activityId ? register.find((x) => x.id === a.activityId) : undefined;
                const deps = act ? act.dependsOn.map((id) => register.find((x) => x.id === id)).filter(Boolean) : [];
                const tone = a.category === 'Unassigned' ? 'warn' : a.severity === 'critical' ? 'crit' : 'high';
                return (
                  <button
                    type="button"
                    key={a.id}
                    className={`cc-att ${tone}`}
                    onClick={() => (a.activityId ? actions.openActivity(a.activityId) : actions.navigate('issues/log'))}
                  >
                    <span className="cc-att-top">
                      <span className={`cc-att-tag ${tone}`}>{a.category}</span>
                      <b className="cc-att-t">{a.title}</b>
                    </span>
                    <span className="cc-att-line">
                      <CalendarDays size={14} aria-hidden />
                      <span>{a.detail}</span>
                      {act && <span className="cc-att-sep">Workstream: {act.workstream}</span>}
                    </span>
                    <span className="cc-att-line">
                      <UserIcon size={14} aria-hidden />
                      <span>Owner: {a.owner || <b className="cv-late">Unassigned</b>}</span>
                      {deps.length > 0 && <span className="cc-att-sep">Dependency: {deps.map((d) => `${d!.name} (${d!.status})`).join('; ')}</span>}
                    </span>
                    <ChevronRight className="cc-att-go" size={16} aria-hidden />
                  </button>
                );
              })}
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
      <OperationsPulse />
    </div>
  );
};

/** Priorities, blockers and recent updates across all modules. */
const OperationsPulse: React.FC = () => {
  const { register, alignment, today, actions } = useCommand();
  const procurement = useStore(procurementStore);
  const docs = useStore(documentStore);
  const pubs = useStore(publicationStore);
  const lateDeliveries = procurement.items.filter((p) => !p.archived && isDeliveryLate(p, today));
  const weekEnd = addDays(today, 7);
  const monthEnd = monthRange(today).end;
  const atRiskWeek = useMemo(() => buildOutlook(register, alignment, today, weekEnd, today).filter((o) => o.outlook === 'At risk'), [register, alignment, today, weekEnd]);
  const monthMilestones = register.filter((r) => (r.kind === 'milestone' || r.kind === 'pour') && r.status !== 'Completed' && r.finish && r.finish >= today && r.finish <= monthEnd);
  const recent = useMemo(() => {
    const out: { at: string; title: string; detail: string; go: () => void }[] = [];
    register.forEach((r) => r.lastUpdated && out.push({ at: r.lastUpdated, title: r.name, detail: `${r.workstream} · ${r.status}${r.updatedBy ? ` · ${r.updatedBy}` : ''}`, go: () => actions.openActivity(r.id) }));
    procurement.items.forEach((p) => out.push({ at: p.updatedAt, title: `Procurement: ${p.material}`, detail: `${p.status} · ${p.updatedBy}`, go: () => actions.navigate('procurement') }));
    docs.items.forEach((d) => out.push({ at: d.updatedAt, title: `Document: ${d.title}`, detail: `${d.category} · ${d.updatedBy}`, go: () => actions.navigate('documents') }));
    pubs.items.forEach((p) => out.push({ at: p.updatedAt, title: `Portal: ${p.title}`, detail: `${p.status} · ${p.updatedBy}`, go: () => actions.navigate('publishing') }));
    return out.filter((x) => x.at).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8);
  }, [register, procurement.items, docs.items, pubs.items, actions]);

  return (
    <div className="cv-grid cv-g3">
      <Card title="Blockers — deliveries" note="Material deliveries past their expected or required date" actions={<button type="button" className="cv-btn sm" onClick={() => actions.navigate('procurement')}>Procurement</button>}>
        {lateDeliveries.length ? (
          <div className="cv-list">
            {lateDeliveries.slice(0, 6).map((p) => (
              <div key={p.id} className="cv-li">
                <span className="cv-sev" style={{ background: '#E5484D' }} />
                <div className="cv-li-main">
                  <div className="cv-li-t">{p.material}</div>
                  <div className="cv-li-s">
                    {p.supplier || 'Supplier not yet provided'} · due {fmtDate(p.expectedDelivery || p.requiredDate)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty>{procurement.items.length ? 'No delayed deliveries.' : 'No procurement records yet.'}</Empty>
        )}
      </Card>
      <Card title="Priorities" note="At-risk work this week · milestones this month">
        {atRiskWeek.length || monthMilestones.length ? (
          <div className="cv-list">
            {atRiskWeek.slice(0, 4).map((o) => (
              <button key={o.activity.id} type="button" className="cv-li clickable" style={{ textAlign: 'left', color: 'inherit' }} onClick={() => actions.openActivity(o.activity.id)}>
                <span className="cv-sev" style={{ background: '#F5A623' }} />
                <div className="cv-li-main">
                  <div className="cv-li-t">{o.activity.name}</div>
                  <div className="cv-li-s">This week · {o.reasons.join(' · ')}</div>
                </div>
              </button>
            ))}
            {monthMilestones.slice(0, 4).map((r) => (
              <button key={r.id} type="button" className="cv-li clickable" style={{ textAlign: 'left', color: 'inherit' }} onClick={() => actions.openActivity(r.id)}>
                <span className="cv-sev" style={{ background: '#7026C8' }} />
                <div className="cv-li-main">
                  <div className="cv-li-t">{r.name}</div>
                  <div className="cv-li-s">This month · due {fmtDate(r.finish)}</div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <Empty>No at-risk work this week and no milestones due this month.</Empty>
        )}
      </Card>
      <Card title="Recent updates" note="Latest changes across modules">
        {recent.length ? (
          <div className="cv-list">
            {recent.map((x, i) => (
              <button key={i} type="button" className="cv-li clickable" style={{ textAlign: 'left', color: 'inherit' }} onClick={x.go}>
                <div className="cv-li-main">
                  <div className="cv-li-t">{x.title}</div>
                  <div className="cv-li-s">
                    {fmtDate(x.at.slice(0, 10))} · {x.detail}
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <Empty>No recorded updates yet.</Empty>
        )}
      </Card>
    </div>
  );
};
