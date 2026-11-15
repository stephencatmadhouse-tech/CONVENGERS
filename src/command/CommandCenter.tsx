/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * 01 — COMMAND CENTER (executive overview)
 */

import React, { useMemo } from 'react';
import { TrendingUp, Target, Activity, CalendarCheck, CalendarClock, Gauge, CalendarDays, ShieldAlert, ChevronRight, Plus, Flag, Camera, FileText } from 'lucide-react';
import { useCommand } from './context.tsx';
import { Card, Kpi, HealthBadge, StatusPill, ProgressBar, Empty, Pill, pct, kindColor, HEALTH_HEX, tintBg, Banner, SyncChip, SYNC_LABEL, PRIORITY_HEX, statusLabel } from './ui.tsx';
import { forecastCompletion } from '../domain/metrics.ts';
import { canOpenModule } from '../auth/roles.ts';
import { addDays, diffDays, fmtDate, fmtRange } from '../domain/dates.ts';
import { ALIGNMENT_COLORS, alignmentSummary } from '../domain/alignment.ts';
import { fmtVar } from '../domain/reports.ts';
import { buildOutlook } from '../domain/attention.ts';
import { monthRange } from '../domain/dates.ts';
import { procurementStore, documentStore, publicationStore } from '../firebase/opsStores.ts';
import { useStore } from '../firebase/useStore.ts';
import { isDeliveryLate } from './Operations.tsx';
import { plural } from '../utils/plural.ts';
import { NarrativeDashboardCard } from './Narrative.tsx';

export const CommandCenter: React.FC = () => {
  const { register, metrics, attention, today, actions, issues, reports, snapshots, canEdit, isManager, dataSync, user } = useCommand();
  const m = metrics;
  // Week-on-week change, shown only when a recorded snapshot 7–10 days old exists (never estimated)
  const weekAgo = useMemo(() => {
    const from = addDays(today, -10);
    const to = addDays(today, -7);
    return [...snapshots].filter((s) => s.date >= from && s.date <= to).sort((a, b) => b.date.localeCompare(a.date))[0];
  }, [snapshots, today]);
  const trend = weekAgo ? Math.round((m.actualPct - weekAgo.actualPct) * 10) / 10 : null;
  const thisWeekEnd = addDays(today, 7);
  const forecast = forecastCompletion(m);

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
        .slice(0, 5),
    [register]
  );

  const { mgmt, openIssues, criticalIssues, pendingApprovals } = useManagementActions();

  const quick = [
    { label: 'Add Activity', icon: Plus, route: 'tracker/register/new', show: canEdit },
    { label: 'Update Progress', icon: TrendingUp, route: 'tracker/register/status=Ongoing', show: canEdit },
    { label: 'Report an Issue', icon: ShieldAlert, route: 'issues/log/new', show: canEdit },
    { label: 'Add Milestone', icon: Flag, route: 'tracker/register/new-milestone', show: canEdit },
    { label: 'Upload Progress Photos', icon: Camera, route: 'publishing/gallery/new', show: canEdit },
    { label: 'Generate Weekly Report', icon: FileText, route: 'reports/weekly', show: true },
  ].filter((q) => q.show && canOpenModule(user.role, q.route.split('/')[0]));

  const varColor = m.variancePct < -3 ? '#DC3545' : m.variancePct < 0 ? '#D97706' : '#1F9D68';

  return (
    <div className="cv-grid" style={{ gap: 16 }}>
      {dataSync.state !== 'live' && (
        <Banner kind="warn">
          <b>{SYNC_LABEL[dataSync.state]?.label}.</b> {SYNC_LABEL[dataSync.state]?.detail}{' '}
          <button type="button" className="cv-linkbtn" onClick={() => actions.navigate('sync')}>
            Database Synchronization
          </button>
        </Banner>
      )}

      {/* ZONE A — PROJECT STATUS */}
      <Card
        title="Project Status"
        note={`As of ${fmtDate(today)} · calculated from ${register.filter((r) => r.kind === 'scope').length} weighted scopes of work`}
        actions={
          <>
            <SyncChip state={dataSync.state} />
            <HealthBadge level={m.health} big />
          </>
        }
      >
        <div className="cv-kpis cc-hk">
          <Kpi
            icon={TrendingUp}
            label="Actual Progress"
            value={pct(m.actualPct)}
            accent
            sub={trend !== null ? `${trend >= 0 ? '+' : ''}${trend.toFixed(1)} percentage points since ${fmtDate(weekAgo!.date, false)}` : 'Weighted by working days'}
          />
          <Kpi icon={Target} label="Planned Progress" value={pct(m.plannedPct)} sub="Baseline plan as of today" />
          <Kpi
            icon={Activity}
            label="Progress Variance"
            value={`${m.variancePct >= 0 ? '+' : ''}${m.variancePct.toFixed(1)}`}
            color={varColor}
            sub={`percentage points${m.spi !== null ? ` · SPI ${m.spi.toFixed(2)}` : ''}`}
          />
          <Kpi icon={Gauge} label="Project Status" value={m.health} color={m.health === 'At Risk' ? '#B45309' : HEALTH_HEX[m.health]} sub={m.healthReasons[0]} />
          <Kpi icon={CalendarCheck} label="Original Target Completion" value={fmtDate(m.targetCompletion)} sub="Turnover ceremony milestone" />
          <Kpi
            icon={CalendarClock}
            label="Forecast Completion"
            value={fmtDate(forecast)}
            color={m.completionVarianceDays > 0 ? '#DC3545' : undefined}
            sub={
              <>
                {m.completionVarianceDays > 0 ? `${plural(m.completionVarianceDays, 'day')} after target · ` : 'Current schedule · '}
                {m.paceCompletion ? `at current pace ${fmtDate(m.paceCompletion)} (indicative)` : 'pace on or above plan'}
              </>
            }
          />
        </div>
      </Card>

      {/* QUICK ACTIONS */}
      {quick.length > 0 && (
        <div className="cc-quick" role="group" aria-label="Quick actions">
          {quick.map((q) => (
            <button key={q.label} type="button" className="cc-quick-b" onClick={() => actions.navigate(q.route)}>
              <q.icon size={16} aria-hidden /> {q.label}
            </button>
          ))}
        </div>
      )}

      {/* AUTOMATED NARRATIVE REPORTS */}
      {canOpenModule(user.role, 'narrative') && <NarrativeDashboardCard />}

      {/* ZONE B — ACTIVITY SUMMARY */}
      <div className="cc-zoneb">
        <Card title="Activity Status" note={`All ${m.counts.total} register items`}>
          <div className="cc-mini">
            {[
              { label: 'Completed', v: m.counts.completed, f: 'Completed', tone: 'ok' },
              { label: 'In Progress', v: m.counts.ongoing, f: 'Ongoing', tone: '' },
              { label: 'Delayed', v: m.counts.delayed, f: 'Delayed', tone: m.counts.delayed ? 'bad' : '' },
              { label: 'Upcoming (14 days)', v: ops.upcoming.length, f: 'Upcoming', tone: '' },
            ].map((k) => (
              <button key={k.label} type="button" className={`cc-mini-b ${k.tone}`} onClick={() => actions.navigate(`tracker/register/status=${k.f}`)}>
                <b>{k.v}</b>
                <span>{k.label}</span>
              </button>
            ))}
          </div>
        </Card>
        <Card title="Items Requiring Attention" note="Issues and approvals">
          <div className="cc-mini three">
            {[
              { label: 'Open Issues', v: openIssues.length, r: 'issues/log', tone: '' },
              { label: 'Critical Issues', v: criticalIssues.length, r: 'issues/log', tone: criticalIssues.length ? 'bad' : '' },
              { label: 'Pending Approvals', v: pendingApprovals.length, r: isManager ? 'publishing' : 'reports/weekly', tone: pendingApprovals.length ? 'warn' : '' },
            ].map((k) => (
              <button key={k.label} type="button" className={`cc-mini-b ${k.tone}`} onClick={() => actions.navigate(k.r)}>
                <b>{k.v}</b>
                <span>{k.label}</span>
              </button>
            ))}
          </div>
        </Card>
      </div>

      {/* ZONE C — PENDING MANAGEMENT ACTIONS */}
      <Card
        title={`Pending Management Actions · ${mgmt.length}`}
        note="Critical delays, overdue activities, open issues, pending approvals, schedule conflicts and outstanding decisions"
        actions={
          <button type="button" className="cv-btn sm" onClick={() => actions.navigate('issues/attention')}>
            View All Management Actions
          </button>
        }
      >
        {mgmt.length ? (
          <div className="cv-table-wrap">
            <table className="cv-table cc-mgmt">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Related Activity</th>
                  <th>Responsible</th>
                  <th>Priority</th>
                  <th>Target Resolution</th>
                  <th>Status</th>
                  <th>Required Action</th>
                </tr>
              </thead>
              <tbody>
                {mgmt.slice(0, 8).map((a) => (
                  <tr key={a.id} className="clickable" onClick={a.open}>
                    <td>
                      <b>{a.title}</b>
                      <div className="cv-dim" style={{ fontSize: 12 }}>
                        {a.type}
                      </div>
                    </td>
                    <td className="cv-dim">{a.related}</td>
                    <td>{a.responsible || <span className="cv-late">Unassigned</span>}</td>
                    <td>
                      <Pill label={a.priority} color={PRIORITY_HEX[a.priority]} />
                    </td>
                    <td className="nowrap">{a.target ? fmtDate(a.target) : '—'}</td>
                    <td>{a.status}</td>
                    <td>{a.action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>No pending management actions. Everything recorded is on schedule.</Empty>
        )}
      </Card>

      <div className="cv-grid cv-g2">
        {/* ZONE D — UPCOMING MILESTONES */}
        <Card
          title="Upcoming Milestones"
          note="Next five milestones and concrete pours"
          actions={
            <button type="button" className="cv-btn sm" onClick={() => actions.navigate('milestones')}>
              Milestone Monitoring
            </button>
          }
        >
          {nextMilestones.length ? (
            <div className="cv-table-wrap">
              <table className="cv-table">
                <thead>
                  <tr>
                    <th>Milestone</th>
                    <th>Target Date</th>
                    <th>Status</th>
                    <th>Responsible</th>
                  </tr>
                </thead>
                <tbody>
                  {nextMilestones.map((r) => (
                    <tr key={r.id} className="clickable" onClick={() => actions.openActivity(r.id)}>
                      <td>
                        <b>{r.name}</b>
                      </td>
                      <td className="nowrap">
                        {fmtDate(r.finish)}
                        <div className={r.finish && r.finish < today ? 'cv-late' : 'cv-dim'} style={{ fontSize: 12 }}>
                          {r.finish ? (r.finish < today ? `${plural(diffDays(r.finish, today), 'day')} overdue` : `in ${plural(diffDays(today, r.finish), 'day')}`) : ''}
                        </div>
                      </td>
                      <td>
                        <StatusPill status={r.status} />
                      </td>
                      <td>{r.owner || <span className="cv-late">Unassigned</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>All milestones are complete.</Empty>
          )}
        </Card>

        <Card
          title="Current and Upcoming Activities"
          note={`${fmtDate(today)} – ${fmtDate(thisWeekEnd)}`}
          actions={
            <button type="button" className="cv-btn sm" onClick={() => actions.navigate('schedule/forecast')}>
              Schedule Monitoring
            </button>
          }
        >
          {[...ops.delayed, ...ops.ongoing, ...ops.upcoming].filter((r) => r.start && r.start <= thisWeekEnd).length ? (
            <div className="cv-list">
              {[...ops.delayed, ...ops.ongoing, ...ops.upcoming]
                .filter((r) => r.start && r.start <= thisWeekEnd)
                .slice(0, 7)
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
        </Card>
      </div>

      <Card
        title="Workstream Progress"
        note="Bar = actual · marker = planned today"
        actions={
          <button type="button" className="cv-btn sm" onClick={() => actions.navigate('analytics')}>
            Project Performance
          </button>
        }
      >
        <div className="cc-ws">
          {m.workstreams.map((w) => (
            <div key={w.key} className="cv-hbar">
              <span className="cv-strong">{w.label}</span>
              <ProgressBar actual={w.actual} planned={w.planned} />
              <span className="cv-dim" style={{ textAlign: 'right' }}>
                {w.actual.toFixed(0)}% / {w.planned.toFixed(0)}%
              </span>
            </div>
          ))}
        </div>
      </Card>
      <OperationsPulse />
    </div>
  );
};


/** Pending management actions (shared by the desktop Command Center and the phone dashboard). */
export function useManagementActions() {
  const { register, attention, issues, reports, actions } = useCommand();
  const pubs = useStore(publicationStore);
  const openIssues = issues.filter((i) => i.status !== 'Resolved' && i.status !== 'Closed');
  const criticalIssues = openIssues.filter((i) => i.severity === 'Critical');
  const pendingApprovals = [
    ...reports.filter((r) => r.status === 'review').map((r) => ({ id: r.id, title: r.title || 'Report for review', kind: 'Report', since: r.updatedAt, by: r.updatedBy, route: `reports/${r.type === 'monthly' ? 'monthly' : 'weekly'}` })),
    ...pubs.items.filter((p) => p.status === 'review').map((p) => ({ id: p.id, title: p.title, kind: 'Client publication', since: p.updatedAt, by: p.updatedBy, route: 'publishing' })),
  ];

  // ZONE C — consolidated management actions
  const mgmt: MgmtAction[] = useMemo(() => {
    const out: MgmtAction[] = [];
    attention
      .filter((a) => a.severity !== 'info')
      .forEach((a) => {
        const act = a.activityId ? register.find((x) => x.id === a.activityId) : undefined;
        out.push({
          id: a.id,
          title: a.title,
          type: a.category,
          related: act ? (act.category ? `${act.workstream} · ${act.category}` : act.workstream) : '—',
          responsible: a.owner || '',
          priority: a.severity === 'critical' ? 'Critical' : 'High',
          target: a.due || act?.finish,
          status: act ? statusLabel(act.status) : 'Open',
          action: REQUIRED_ACTION[a.category] || 'Review and decide the next step',
          open: () => (a.activityId ? actions.openActivity(a.activityId) : actions.navigate('issues/log')),
        });
      });
    openIssues.forEach((i) => {
      if (out.some((o) => o.id === `att-iss-${i.id}`)) return;
      out.push({
        id: `iss-${i.id}`,
        title: i.title,
        type: i.type === 'Decision' ? 'Outstanding decision' : `Open ${i.type.toLowerCase()}`,
        related: i.linkedActivityId || '—',
        responsible: i.owner,
        priority: i.severity === 'Critical' ? 'Critical' : i.severity === 'High' ? 'High' : i.severity === 'Medium' ? 'Medium' : 'Low',
        target: i.dueDate,
        status: i.status,
        action: i.correctiveAction || (i.type === 'Decision' ? 'Record the management decision' : 'Agree and record the corrective action'),
        open: () => actions.navigate('issues/log'),
      });
    });
    pendingApprovals.forEach((p) =>
      out.push({
        id: `apr-${p.id}`,
        title: p.title,
        type: 'Pending approval',
        related: p.kind,
        responsible: 'Project Manager',
        priority: 'Medium',
        target: undefined,
        status: 'For Review',
        action: 'Review and approve, or return to draft',
        open: () => actions.navigate(p.route),
      })
    );
    const rank: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };
    return out.sort((a, b) => rank[a.priority] - rank[b.priority] || String(a.target || '9999').localeCompare(String(b.target || '9999')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attention, openIssues, pendingApprovals.length, register]);

  return { mgmt, openIssues, criticalIssues, pendingApprovals };
}

interface MgmtAction {
  id: string;
  title: string;
  type: string;
  related: string;
  responsible: string;
  priority: 'Critical' | 'High' | 'Medium' | 'Low';
  target?: string;
  status: string;
  action: string;
  open: () => void;
}

const REQUIRED_ACTION: Record<string, string> = {
  'Critical delay': 'Agree a recovery plan and revised date',
  Overdue: 'Agree a recovery date and update the schedule',
  Unassigned: 'Assign a responsible person',
  'Delayed milestone': 'Confirm the recovery plan for the milestone',
  'Repeatedly postponed': 'Review the root cause before re-scheduling',
  'Critical issue': 'Resolve the issue and record the corrective action',
  'Decision required': 'Record the management decision',
  'Upcoming deadline': 'Confirm manpower and materials',
  'Schedule conflict': 'Resolve the schedule conflict',
  'Dependency risk': 'Confirm the predecessor finishes on time',
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
