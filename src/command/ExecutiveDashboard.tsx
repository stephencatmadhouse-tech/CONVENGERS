/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Executive Dashboard: solid KPI cards (each opens its filtered list) and
 * pill tabs — Overview, Project Health, Milestone Analysis,
 * Team / Contractor Performance and 60-Day Forecast.
 * Every figure is derived from the master register; nothing is invented.
 */

import React, { useMemo, useState } from 'react';
import {
  FolderKanban,
  Activity as ActivityIcon,
  CheckCircle2,
  AlarmClock,
  CalendarClock,
  CalendarRange,
  PauseCircle,
  Target,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react';
import './exec.css';
import { useCommand } from './context.tsx';
import { Card, Empty, Modal, StatusPill, ProgressBar, STATUS_HEX } from './ui.tsx';
import { ChartBox } from './charts.tsx';
import { useNotifications, PriorityChip } from './Notifications.tsx';
import { ForecastPanel, EventDetail, useCalendarItems } from './CalendarPage.tsx';
import { RegisterActivity } from '../domain/register.ts';
import { execKpis, streamHealth, ownerPerformance, milestoneRows, TIER_HEX, Tier, countBy } from '../domain/executive.ts';
import { CAL_COLOR, CalItem, inRange } from '../domain/calendarEvents.ts';
import { addDays, fmtDate, monthLabel, monthRange, weekRange } from '../domain/dates.ts';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'health', label: 'Project Health' },
  { id: 'milestones', label: 'Milestone Analysis' },
  { id: 'team', label: 'Team / Contractor Performance' },
  { id: 'forecast', label: '60-Day Forecast' },
] as const;

const STATUSES = ['Completed', 'Ongoing', 'Delayed', 'Upcoming', 'On Hold'] as const;

export const TierBadge: React.FC<{ tier: Tier | null }> = ({ tier }) =>
  tier ? (
    <span className="ex-tier" style={{ background: TIER_HEX[tier] }}>
      {tier}
    </span>
  ) : (
    <span className="ex-tier none">No data</span>
  );

interface ListSpec {
  title: string;
  sub?: string;
  list: RegisterActivity[];
}

const ActivityListModal: React.FC<{ spec: ListSpec; onClose: () => void }> = ({ spec, onClose }) => {
  const { actions } = useCommand();
  return (
    <Modal title={`${spec.title} · ${spec.list.length}`} sub={spec.sub} onClose={onClose} width={860}>
      {spec.list.length === 0 ? (
        <Empty>Nothing in this list right now.</Empty>
      ) : (
        <div className="cv-table-wrap">
          <table className="cv-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Activity</th>
                <th>Workstream</th>
                <th>Target</th>
                <th>Status</th>
                <th>Owner</th>
              </tr>
            </thead>
            <tbody>
              {spec.list.map((r) => (
                <tr
                  key={r.id}
                  className="ex-click"
                  onClick={() => {
                    onClose();
                    actions.openActivity(r.id);
                  }}
                >
                  <td className="cv-mono">{r.id}</td>
                  <td>{r.name}</td>
                  <td>{r.workstream}</td>
                  <td>{r.finish ? fmtDate(r.finish) : <span className="ex-missing">add target date</span>}</td>
                  <td>
                    <StatusPill status={r.status} />
                  </td>
                  <td>{r.owner || <span className="ex-missing">add owner</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
};

const KpiCard: React.FC<{ icon: LucideIcon; label: string; value: React.ReactNode; sub: string; color: string; dark?: boolean; onClick?: () => void }> = ({
  icon,
  label,
  value,
  sub,
  color,
  dark,
  onClick,
}) => (
  <button type="button" className={`ex-kpi ${dark ? 'dark' : ''}`} style={{ ['--k' as any]: color }} onClick={onClick} disabled={!onClick}>
    <span className="ex-kpi-ico">{React.createElement(icon, { size: 20, strokeWidth: 2.1, 'aria-hidden': true })}</span>
    <span className="ex-kpi-l">{label}</span>
    <span className="ex-kpi-v">{value}</span>
    <span className="ex-kpi-s">{sub}</span>
  </button>
);

export const ExecutiveDashboard: React.FC = () => {
  const { register, today, route, actions } = useCommand();
  const tab = TABS.find((t) => t.id === route.tab)?.id || 'overview';
  const k = useMemo(() => execKpis(register, today), [register, today]);
  const [list, setList] = useState<ListSpec | null>(null);
  const cal = useCalendarItems();
  const [sel, setSel] = useState<CalItem | null>(null);

  return (
    <div className="cv-grid" style={{ gap: 16 }}>
      <div className="ex-kpis">
        <KpiCard
          icon={FolderKanban}
          label="Active Workstreams"
          value={k.activeStreams.length}
          sub={`of ${k.totalStreams} in Convengers Bahay Build`}
          color="#7026C8"
          onClick={() => setList({ title: 'Open activities', sub: `Active workstreams: ${k.activeStreams.join(', ') || '—'}`, list: k.lists.active })}
        />
        <KpiCard icon={ActivityIcon} label="In Progress" value={k.lists.inprogress.length} sub="activities & milestones ongoing" color="#8B35E8" onClick={() => setList({ title: 'In progress', list: k.lists.inprogress })} />
        <KpiCard
          icon={CheckCircle2}
          label="Completed This Month"
          value={k.lists.completedMonth.length}
          sub={monthLabel(monthRange(today).key)}
          color="#22A06B"
          onClick={() => setList({ title: 'Completed this month', list: k.lists.completedMonth })}
        />
        <KpiCard icon={AlarmClock} label="Overdue" value={k.lists.overdue.length} sub="past target, not completed" color="#E5484D" onClick={() => setList({ title: 'Overdue', list: k.lists.overdue })} />
        <KpiCard icon={CalendarClock} label="Due in 7 Days" value={k.lists.due7.length} sub={`to ${fmtDate(addDays(today, 7), false)}`} color="#F5A623" dark onClick={() => setList({ title: 'Due in the next 7 days', list: k.lists.due7 })} />
        <KpiCard icon={CalendarRange} label="Due in 30 Days" value={k.lists.due30.length} sub={`to ${fmtDate(addDays(today, 30), false)}`} color="#A34FEA" onClick={() => setList({ title: 'Due in the next 30 days', list: k.lists.due30 })} />
        <KpiCard icon={PauseCircle} label="Blocked / On Hold" value={k.lists.blocked.length} sub="flagged on hold" color="#C02AE0" onClick={() => setList({ title: 'Blocked / on hold', list: k.lists.blocked })} />
        <KpiCard
          icon={Target}
          label="On-Time Completion"
          value={k.onTime.pct === null ? '—' : `${k.onTime.pct}%`}
          sub={k.onTime.measured ? `${k.onTime.onTime} of ${k.onTime.measured} finished on or before baseline (recorded dates)` : 'add actual finish dates to measure'}
          color="#303030"
          onClick={() => setList({ title: 'Completed activities', sub: 'On time = actual finish on or before the baseline target', list: register.filter((r) => r.status === 'Completed') })}
        />
      </div>

      <div className="ex-tabs" role="tablist" aria-label="Executive dashboard views">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => actions.navigate(`executive/${t.id}`)}>
            {t.label}
          </button>
        ))}
      </div>

      {register.length === 0 ? (
        <Empty>No activities in the master register yet — add scopes, milestones or activities to populate the dashboard.</Empty>
      ) : tab === 'overview' ? (
        <Overview onList={setList} calItems={cal.items} onOpenCal={setSel} />
      ) : tab === 'health' ? (
        <Health onList={setList} />
      ) : tab === 'milestones' ? (
        <MilestoneAnalysis />
      ) : tab === 'team' ? (
        <Team onList={setList} />
      ) : (
        <ForecastPanel items={cal.items} onOpen={setSel} />
      )}

      {list && <ActivityListModal spec={list} onClose={() => setList(null)} />}
      {sel && (
        <EventDetail
          item={sel}
          manual={sel.manualId ? cal.manual.find((m) => m.id === sel.manualId) : undefined}
          onClose={() => setSel(null)}
          onEdit={() => {
            setSel(null);
            actions.navigate(`calendar/day/${sel.date}`);
          }}
        />
      )}
    </div>
  );
};

// ---------------- Overview ----------------
const Overview: React.FC<{ onList: (s: ListSpec) => void; calItems: CalItem[]; onOpenCal: (i: CalItem) => void }> = ({ onList, calItems, onOpenCal }) => {
  const { register, today, actions } = useCommand();
  const notif = useNotifications();
  const statusCounts = STATUSES.map((s) => ({ s, n: register.filter((r) => r.status === s).length })).filter((x) => x.n > 0);
  const streams = [...new Set(register.map((r) => r.workstream))];
  const attention = notif.items.filter((n) => n.type !== 'changed' && n.type !== 'document').slice(0, 10);
  const health = streamHealth(register, today);
  const leaders = [...health].filter((h) => h.overdue > 0).sort((a, b) => b.overdue - a.overdue);
  const maxOver = Math.max(1, ...leaders.map((l) => l.overdue));
  const upcoming = inRange(calItems, today, addDays(today, 7)).filter((i) => !i.done);

  return (
    <div className="cv-grid ex-ov">
      <Card title="Status of all activities" note={`${register.length} activities & milestones · click a slice to list them`}>
        <ChartBox
          label="Activities by status"
          height={220}
          spec={{
            type: 'doughnut',
            labels: statusCounts.map((x) => `${x.s} (${x.n})`),
            datasets: [{ label: 'Activities', data: statusCounts.map((x) => x.n), color: statusCounts.map((x) => STATUS_HEX[x.s]) }],
            onClick: (i) => onList({ title: statusCounts[i].s, list: register.filter((r) => r.status === statusCounts[i].s) }),
          }}
        />
      </Card>

      <Card title="By workstream / phase" note="Activity count by status · click a bar to list">
        <ChartBox
          label="Activities by workstream and status"
          height={Math.max(220, streams.length * 30)}
          spec={{
            type: 'bar',
            horizontal: true,
            stacked: true,
            labels: streams,
            datasets: STATUSES.filter((s) => register.some((r) => r.status === s)).map((s) => ({
              label: s,
              data: streams.map((ws) => register.filter((r) => r.workstream === ws && r.status === s).length),
              color: STATUS_HEX[s],
            })),
            onClick: (i) => onList({ title: streams[i], list: register.filter((r) => r.workstream === streams[i]) }),
          }}
        />
      </Card>

      <Card title={`Needs attention · ${attention.length}`} note="Sorted by priority · with the recommended next action" className="ex-span2">
        {attention.length === 0 ? (
          <Empty>Nothing needs attention right now.</Empty>
        ) : (
          <div className="ex-nia-list">
            {attention.map((n) => (
              <button key={n.key} type="button" className="ex-nia" onClick={() => notif.open(n)}>
                <PriorityChip p={n.priority} />
                <span className="ex-nia-b">
                  <b>{n.title}</b>
                  <em>{n.detail}</em>
                  <span className="ex-nia-a">→ {n.action}</span>
                </span>
                <ChevronRight size={16} aria-hidden className="cv-dim" />
              </button>
            ))}
          </div>
        )}
      </Card>

      <Card title="Most overdue" note="Workstreams ranked by overdue items">
        {leaders.length === 0 ? (
          <Empty>No overdue items in any workstream.</Empty>
        ) : (
          <div className="ex-lb">
            {leaders.map((l, i) => (
              <button key={l.workstream} type="button" className="ex-lb-r" onClick={() => onList({ title: `Overdue · ${l.workstream}`, list: register.filter((r) => r.workstream === l.workstream && r.status !== 'Completed' && (r.status === 'Delayed' || (!!r.finish && r.finish < today))) })}>
                <span className="ex-lb-n">{i + 1}</span>
                <span className="ex-lb-name">{l.workstream}</span>
                <span className="ex-lb-bar">
                  <i style={{ width: `${(l.overdue / maxOver) * 100}%` }} />
                </span>
                <b>{l.overdue}</b>
              </button>
            ))}
          </div>
        )}
      </Card>

      <Card title={monthLabel(monthRange(today).key)} note="Days with scheduled items" actions={<button type="button" className="cv-btn sm ghost" onClick={() => actions.navigate('calendar/month')}>Open calendar</button>}>
        <MiniCalendar items={calItems} onDay={(d) => actions.navigate(`calendar/day/${d}`)} />
        <div className="ex-upn-h">Upcoming (next 7 days) · {upcoming.length}</div>
        {upcoming.length === 0 ? (
          <div className="cv-dim" style={{ fontSize: 13 }}>Nothing scheduled in the next 7 days.</div>
        ) : (
          <div className="ex-upn">
            {upcoming.slice(0, 8).map((i) => (
              <button key={i.id} type="button" onClick={() => onOpenCal(i)}>
                <span className="cv-dot" style={{ background: CAL_COLOR[i.type] }} />
                <b>{i.date === today ? 'Today' : fmtDate(i.date, false)}</b>
                <span>{i.title}</span>
              </button>
            ))}
            {upcoming.length > 8 && (
              <button type="button" className="cv-dim" onClick={() => actions.navigate('calendar/agenda')}>
                + {upcoming.length - 8} more in the forecast
              </button>
            )}
          </div>
        )}
      </Card>
    </div>
  );
};

const MiniCalendar: React.FC<{ items: CalItem[]; onDay: (d: string) => void }> = ({ items, onDay }) => {
  const { today } = useCommand();
  const m = monthRange(today);
  const start = weekRange(m.start).start;
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i)).filter((d, i) => i < 35 || d <= m.end || addDays(start, 35) <= m.end);
  return (
    <div className="ex-mcal">
      {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
        <span key={i} className="ex-mcal-h">
          {d}
        </span>
      ))}
      {days.map((d) => {
        const n = inRange(items, d, d);
        const out = d < m.start || d > m.end;
        return (
          <button key={d} type="button" className={`ex-mcal-d ${out ? 'out' : ''} ${d === today ? 'today' : ''} ${n.length ? 'has' : ''}`} onClick={() => onDay(d)} title={`${fmtDate(d)} · ${n.length} item${n.length === 1 ? '' : 's'}`}>
            {Number(d.slice(8))}
            {n.length > 0 && <i style={{ background: n.some((x) => x.overdue) ? '#E5484D' : CAL_COLOR[n[0].type] }} />}
          </button>
        );
      })}
    </div>
  );
};

// ---------------- Project health ----------------
const Health: React.FC<{ onList: (s: ListSpec) => void }> = ({ onList }) => {
  const { register, today } = useCommand();
  const rows = streamHealth(register, today);
  return (
    <>
      <div className="cv-dim" style={{ fontSize: 13 }}>
        Convengers Bahay Build is tracked by workstream. Tier = 100 − overdue share (up to 50) − planned-vs-actual gap − on-hold items: Excellent ≥ 85 · Satisfactory ≥ 70 · Needs Attention ≥ 50 · Critical &lt; 50.
      </div>
      <div className="ex-pcards">
        {rows.map((h) => (
          <button key={h.workstream} type="button" className="ex-pc" onClick={() => onList({ title: h.workstream, sub: 'All activities in this workstream', list: register.filter((r) => r.workstream === h.workstream) })}>
            <span className="ex-pc-h">
              <b>{h.workstream}</b>
              <TierBadge tier={h.tier} />
            </span>
            <span className="ex-pc-pct">
              {h.actual}%<em> actual · {h.planned}% planned</em>
            </span>
            <ProgressBar actual={h.actual} planned={h.planned} />
            <span className="ex-pc-stats">
              <span>
                <b>{h.open}</b> open
              </span>
              <span className={h.overdue ? 'bad' : ''}>
                <b>{h.overdue}</b> overdue
              </span>
              <span>
                <b>{h.onHold}</b> on hold
              </span>
              <span>
                <b>{h.completed}</b> done
              </span>
            </span>
            <span className="ex-pc-next">{h.nextTarget ? `Next target: ${fmtDate(h.nextTarget.finish)} · ${h.nextTarget.name}` : h.open ? 'Next target: add target dates' : 'All activities completed'}</span>
            {h.score !== null && <span className="ex-pc-score">Score {h.score}</span>}
          </button>
        ))}
      </div>
    </>
  );
};

// ---------------- Milestone analysis ----------------
const MilestoneAnalysis: React.FC = () => {
  const { register, today, actions } = useCommand();
  const rows = milestoneRows(register, today);
  if (!rows.length) return <Empty>No milestones or concrete pours in the register yet.</Empty>;
  const by = countBy(rows, (x) => x.r.status);
  const slipped = rows.filter((x) => x.slip > 0);
  const next = rows.filter((x) => x.r.status !== 'Completed' && x.r.finish && x.r.finish >= today).slice(0, 12);
  return (
    <div className="cv-grid ex-ov">
      <Card title="Milestones & pours by status" note={`${rows.length} milestones and concrete pours`}>
        <ChartBox
          label="Milestones by status"
          height={220}
          spec={{ type: 'doughnut', labels: by.map(([s, n]) => `${s} (${n})`), datasets: [{ label: 'Milestones', data: by.map(([, n]) => n), color: by.map(([s]) => STATUS_HEX[s] || '#9A9AA3') }] }}
        />
      </Card>
      <Card title="Days to target (next 12)" note="Calendar days from today to each upcoming target">
        {next.length === 0 ? (
          <Empty>No upcoming milestone targets.</Empty>
        ) : (
          <ChartBox
            label="Days to upcoming milestone targets"
            height={Math.max(220, next.length * 26)}
            spec={{ type: 'bar', horizontal: true, labels: next.map((x) => x.r.name.slice(0, 42)), datasets: [{ label: 'Days to target', data: next.map((x) => x.daysToGo || 0), color: next.map((x) => ((x.daysToGo || 0) <= 7 ? '#F5A623' : '#7026C8')) }], legend: false }}
          />
        )}
      </Card>
      <Card title="Milestone register" note={`${slipped.length} moved later than baseline · click a row to open`} className="ex-span2">
        <div className="cv-table-wrap">
          <table className="cv-table">
            <thead>
              <tr>
                <th>Milestone</th>
                <th>Baseline target</th>
                <th>Current target</th>
                <th>Slip</th>
                <th>Days to go</th>
                <th>Status</th>
                <th>Owner</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ r, slip, daysToGo }) => (
                <tr key={r.id} className="ex-click" onClick={() => actions.openActivity(r.id)}>
                  <td>
                    <b>{r.name}</b>
                    <div className="cv-dim cv-mono" style={{ fontSize: 11 }}>
                      {r.id}
                    </div>
                  </td>
                  <td>{fmtDate(r.plannedFinish)}</td>
                  <td>{r.finish ? fmtDate(r.finish) : <span className="ex-missing">add target date</span>}</td>
                  <td style={{ color: slip > 0 ? 'var(--cv-red-text)' : undefined }}>{slip ? `${slip > 0 ? '+' : ''}${slip} d` : '—'}</td>
                  <td>{daysToGo === null ? '—' : daysToGo < 0 ? <b style={{ color: 'var(--cv-red-text)' }}>{-daysToGo} d late</b> : daysToGo === 0 ? <b>Today</b> : `${daysToGo} d`}</td>
                  <td>
                    <StatusPill status={r.status} />
                  </td>
                  <td>{r.owner || <span className="ex-missing">add owner</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

// ---------------- Team / contractor performance ----------------
const Team: React.FC<{ onList: (s: ListSpec) => void }> = ({ onList }) => {
  const { register, today } = useCommand();
  const rows = ownerPerformance(register, today);
  const named = rows.filter((r) => r.owner !== 'Unassigned');
  const depts = countBy(register.filter((r) => r.department), (r) => r.department);
  return (
    <div className="cv-grid ex-ov">
      <Card title="Workload by owner" note="Owner / contractor as recorded on each activity" className="ex-span2">
        <ChartBox
          label="Activities per owner by status"
          height={Math.max(200, rows.length * 34)}
          spec={{
            type: 'bar',
            horizontal: true,
            stacked: true,
            labels: rows.map((r) => r.owner),
            datasets: [
              { label: 'Completed', data: rows.map((r) => r.completed), color: STATUS_HEX.Completed },
              { label: 'Ongoing', data: rows.map((r) => r.ongoing), color: STATUS_HEX.Ongoing },
              { label: 'Overdue', data: rows.map((r) => r.overdue), color: STATUS_HEX.Delayed },
              { label: 'Other open', data: rows.map((r) => Math.max(0, r.assigned - r.completed - r.ongoing - r.overdue)), color: STATUS_HEX.Upcoming },
            ],
            onClick: (i) => onList({ title: rows[i].owner, list: register.filter((r) => (r.owner?.trim() || 'Unassigned') === rows[i].owner) }),
          }}
        />
      </Card>
      <Card title="Performance scorecard" note="Score = 100 − overdue share (up to 60) − late completions · tiers as in Project Health" className="ex-span2">
        {named.length === 0 && <Empty>No owners recorded yet — add an owner to activities in the activity editor.</Empty>}
        <div className="cv-table-wrap">
          <table className="cv-table">
            <thead>
              <tr>
                <th>Owner / contractor</th>
                <th>Assigned</th>
                <th>Completed</th>
                <th>Ongoing</th>
                <th>Overdue</th>
                <th>Due ≤ 14 d</th>
                <th>On-time %</th>
                <th>Tier</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.owner} className="ex-click" onClick={() => onList({ title: o.owner, list: register.filter((r) => (r.owner?.trim() || 'Unassigned') === o.owner) })}>
                  <td>
                    <b>{o.owner === 'Unassigned' ? <span className="ex-missing">Unassigned — add owners</span> : o.owner}</b>
                    <div className="cv-dim" style={{ fontSize: 11 }}>{o.streams.slice(0, 4).join(' · ')}{o.streams.length > 4 ? ` +${o.streams.length - 4}` : ''}</div>
                  </td>
                  <td>{o.assigned}</td>
                  <td>{o.completed}</td>
                  <td>{o.ongoing}</td>
                  <td style={{ color: o.overdue ? 'var(--cv-red-text)' : undefined }}>{o.overdue}</td>
                  <td>{o.dueSoon}</td>
                  <td>{o.onTimePct === null ? '—' : `${o.onTimePct}%`}</td>
                  <td>{o.owner === 'Unassigned' ? '—' : <TierBadge tier={o.tier} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title="By department" className="ex-span2">
        {depts.length === 0 ? (
          <Empty>No departments recorded yet — add a department in the activity editor to compare teams.</Empty>
        ) : (
          <div className="ex-lb">
            {depts.map(([d, n]) => (
              <button key={d} type="button" className="ex-lb-r" onClick={() => onList({ title: d, list: register.filter((r) => r.department === d) })}>
                <span className="ex-lb-name">{d}</span>
                <span className="ex-lb-bar">
                  <i style={{ width: `${(n / depts[0][1]) * 100}%`, background: '#7026C8' }} />
                </span>
                <b>{n}</b>
              </button>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};
