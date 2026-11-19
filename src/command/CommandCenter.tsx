/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * 01 — COMMAND CENTER · Construction Project Intelligence Dashboard
 *
 *   Header (period filter, data refresh time, sync) · quick actions
 *   1 Executive overview — five KPI cards
 *   2 Construction progress analytics — overall ring, phases, S-curve, weekly progress
 *   3 Timeline and milestones — interactive milestone markers, activity states
 *   4 Project health and alerts — counters and the Action Required list
 *   5 Site documentation — photos, daily reports, weekly reports, before / after
 *   6 Recent project activity — chronological feed
 *   More project detail (collapsed) — narrative reports, deliveries, priorities
 *
 * Every figure comes from the existing records through the shared domain
 * functions (computeMetrics, plannedCurve, progress snapshots); nothing here
 * writes to the database. Missing data is shown as "Not recorded", not zero.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  TrendingUp,
  Wallet,
  Flag,
  ListTodo,
  Plus,
  ShieldAlert,
  Camera,
  FileText,
  ChevronDown,
  ChevronRight,
  ClipboardPen,
  AlertOctagon,
  Clock,
  CheckSquare,
  CalendarClock,
  ExternalLink,
  Image as ImageIcon,
  Columns2,
  History,
  Megaphone,
} from 'lucide-react';
import './commandCenter.css';
import { useCommand } from './context.tsx';
import { Card, Empty, HealthBadge, Banner, SyncChip, SYNC_LABEL, StatusPill, statusLabel } from './ui.tsx';
import { forecastCompletion, projectStartDate } from '../domain/metrics.ts';
import { canOpenModule } from '../auth/roles.ts';
import { addDays, diffDays, fmtDate, fmtRange, isValidIso, monthRange } from '../domain/dates.ts';
import { buildOutlook } from '../domain/attention.ts';
import { procurementStore, documentStore, publicationStore, dailyReportStore, driveFileStore, narrativeStore } from '../firebase/opsStores.ts';
import { useStore } from '../firebase/useStore.ts';
import { isDeliveryLate } from './Operations.tsx';
import { plural } from '../utils/plural.ts';
import { NarrativeDashboardCard } from './Narrative.tsx';
import { PERIOD_LABEL, lookAhead, monthTicks, periodRange, phaseStatus, sCurve, timelinePos, timelineState, weeklyProgress, type PeriodFilter, type TimelineState } from '../domain/commandCenter.ts';
import { Ring, SpiGauge, SCurveChart, WeeklyBars, C } from './ccCharts.tsx';
import { driveFileUrl, openDriveFile } from '../drive/driveClient.ts';
import { SecureImg } from '../drive/SecureMedia.tsx';
import { weeklyReportId } from '../domain/reports.ts';
import { DR_STATUS_LABEL } from '../domain/dailyReport.ts';
import { NARRATIVE_STATUS_LABEL } from '../domain/narrative.ts';
import type { RegisterActivity } from '../domain/register.ts';
import { activeNotices, noticeDate, noticePublicationId, type ProjectNotice } from '../domain/announcements.ts';
import type { Publication } from '../types/index.ts';

const PERIOD_KEY = 'convengers_cc_period';
const fmtTimeOf = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' });
const dayOf = (iso?: string) => (iso ? iso.slice(0, 10) : '');
const inRange = (iso: string | undefined, r: { start: string; end: string }) => !!iso && dayOf(iso) >= r.start && dayOf(iso) <= r.end;
const isConstruction = (r: RegisterActivity) => r.kind !== 'episode' && r.stream !== 'Production';

const STATE_COLOR: Record<TimelineState, string> = { Completed: C.good, Ongoing: C.actual, Upcoming: '#94A3B8', Delayed: C.bad };

function usePeriod(): [PeriodFilter, (p: PeriodFilter) => void] {
  const [p, setP] = useState<PeriodFilter>(() => {
    try {
      const v = localStorage.getItem(PERIOD_KEY) as PeriodFilter | null;
      return v && v in PERIOD_LABEL ? v : 'week';
    } catch {
      return 'week';
    }
  });
  const set = (v: PeriodFilter) => {
    setP(v);
    try {
      localStorage.setItem(PERIOD_KEY, v);
    } catch {
      // per-device convenience only
    }
  };
  return [p, set];
}

/** Section heading with an optional collapse toggle (secondary sections start collapsed on small screens). */
const Section: React.FC<{ id: string; title: string; sub?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode; collapsible?: boolean; defaultOpen?: boolean }> = ({
  id,
  title,
  sub,
  right,
  children,
  collapsible,
  defaultOpen = true,
}) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="cc2-sec" id={id} aria-labelledby={`${id}-h`}>
      <div className="cc2-sec-h">
        {collapsible ? (
          <button type="button" className="cc2-sec-t" aria-expanded={open} onClick={() => setOpen(!open)} id={`${id}-h`}>
            {open ? <ChevronDown size={16} aria-hidden /> : <ChevronRight size={16} aria-hidden />} {title}
          </button>
        ) : (
          <h2 className="cc2-sec-t" id={`${id}-h`}>
            {title}
          </h2>
        )}
        {sub && <span className="cc2-sec-sub">{sub}</span>}
        <span className="cc2-sp" />
        {right}
      </div>
      {(!collapsible || open) && children}
    </section>
  );
};

const Tone: React.FC<{ tone: 'good' | 'warn' | 'bad' | 'muted'; children: React.ReactNode }> = ({ tone, children }) => <span className={`cc2-tone ${tone}`}>{children}</span>;

// =====================================================================
export const CommandCenter: React.FC = () => {
  const { register, metrics: m, today, actions, issues, reports, snapshots, canEdit, dataSync, user } = useCommand();
  const [period, setPeriod] = usePeriod();
  const pStart = projectStartDate();
  const range = periodRange(period, today, pStart);
  const ahead = lookAhead(period, today);

  // Last data refresh: the moment the shared records last changed on this screen
  const [refreshed, setRefreshed] = useState(() => new Date());
  useEffect(() => setRefreshed(new Date()), [register, issues, reports, snapshots]);

  const { pendingApprovals } = useManagementActions();
  const openIssues = issues.filter((i) => i.status !== 'Resolved' && i.status !== 'Closed');
  const criticalIssues = openIssues.filter((i) => i.severity === 'Critical');
  const overdue = useMemo(() => register.filter((r) => r.status === 'Delayed').sort((a, b) => (a.finish || '').localeCompare(b.finish || '')), [register]);
  const upcomingDeadlines = useMemo(
    () => register.filter((r) => r.status !== 'Completed' && r.status !== 'Delayed' && r.finish && r.finish >= ahead.start && r.finish <= ahead.end).sort((a, b) => (a.finish || '').localeCompare(b.finish || '')),
    [register, ahead.start, ahead.end]
  );

  const quick = [
    { label: 'Daily Report', icon: ClipboardPen, route: 'site/new', show: canEdit },
    { label: 'Update Progress', icon: TrendingUp, route: 'tracker/register/status=Ongoing', show: canEdit },
    { label: 'Add Activity', icon: Plus, route: 'tracker/register/new', show: canEdit },
    { label: 'Add Milestone', icon: Flag, route: 'tracker/register/new-milestone', show: canEdit },
    { label: 'Report an Issue', icon: ShieldAlert, route: 'issues/log/new', show: canEdit },
    { label: 'Upload Progress Photos', icon: Camera, route: 'publishing/gallery/new', show: canEdit },
    { label: 'Generate Weekly Report', icon: FileText, route: 'reports/weekly', show: true },
  ].filter((q) => q.show && canOpenModule(user.role, q.route.split('/')[0]));

  const healthRef = useRef<HTMLDivElement | null>(null);
  const [alertFilter, setAlertFilter] = useState<AlertGroup | ''>('');
  const goAlerts = (g: AlertGroup | '') => {
    setAlertFilter(g);
    healthRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="cc2">
      {dataSync.state !== 'live' && (
        <Banner kind="warn">
          <b>{SYNC_LABEL[dataSync.state]?.label}.</b> {SYNC_LABEL[dataSync.state]?.detail}{' '}
          <button type="button" className="cv-linkbtn" onClick={() => actions.navigate('sync')}>
            Database Synchronization
          </button>
        </Banner>
      )}

      {/* IMPORTANT ANNOUNCEMENTS — pinned until they are over */}
      {activeNotices(today).map((n) => (
        <NoticeBanner key={n.id} n={n} />
      ))}

      {/* HEADER — status line, period filter, data refresh time */}
      <div className="cc2-head">
        <div className="cc2-head-l">
          <HealthBadge level={m.health} />
          <div>
            <div className="cc2-head-t">Bahay Build · {m.health}</div>
            <div className="cc2-head-s">
              As of {fmtDate(today)} · data refreshed {fmtTimeOf(refreshed)} <SyncChip state={dataSync.state} compact />
            </div>
          </div>
        </div>
        <div className="cc2-period" role="radiogroup" aria-label="Period">
          {(Object.keys(PERIOD_LABEL) as PeriodFilter[]).map((p) => (
            <button key={p} type="button" role="radio" aria-checked={period === p} className={period === p ? 'on' : ''} onClick={() => setPeriod(p)}>
              {PERIOD_LABEL[p]}
            </button>
          ))}
        </div>
      </div>
      {quick.length > 0 && (
        <div className="cc2-quick" role="group" aria-label="Quick actions">
          {quick.map((q) => (
            <button key={q.label} type="button" onClick={() => actions.navigate(q.route)}>
              <q.icon size={15} aria-hidden /> {q.label}
            </button>
          ))}
        </div>
      )}

      {/* 1 — EXECUTIVE OVERVIEW */}
      <ExecutiveKpis criticalIssues={criticalIssues.length} overdue={overdue.length} approvals={pendingApprovals.length} onActions={() => goAlerts('')} />

      {/* 2 — CONSTRUCTION PROGRESS ANALYTICS */}
      <ProgressAnalytics period={period} range={range} />

      {/* 3 — TIMELINE AND MILESTONES */}
      <TimelineSection range={range} ahead={ahead} period={period} />

      {/* 4 — PROJECT HEALTH AND ALERTS */}
      <div ref={healthRef}>
        <HealthSection critical={criticalIssues} overdue={overdue} approvals={pendingApprovals} upcoming={upcomingDeadlines} filter={alertFilter} setFilter={setAlertFilter} period={period} />
      </div>

      {/* 5 + 6 — SITE DOCUMENTATION · RECENT ACTIVITY */}
      <div className="cc2-two">
        <SiteDocs range={range} period={period} />
        <ActivityFeed range={range} period={period} />
      </div>

      {/* SECONDARY — collapsed by default */}
      <Section id="cc-more" title="More project detail" sub="Narrative reports, delivery blockers and priorities" collapsible defaultOpen={false}>
        <div className="cc2-more">
          {canOpenModule(user.role, 'narrative') && <NarrativeDashboardCard />}
          <OperationsPulse />
        </div>
      </Section>
      <p className="cc2-foot">
        All figures are calculated from the project records (Master Project Tracker, progress snapshots, issues, reports and Google Drive files). Actual progress is the
        working-day weighted average of the construction scopes; “Not recorded” means no record exists — it is not the same as zero.
      </p>
    </div>
  );
};

// =====================================================================
// IMPORTANT ANNOUNCEMENT
// =====================================================================
const NoticeBanner: React.FC<{ n: ProjectNotice }> = ({ n }) => {
  const { today, actions, isManager, user } = useCommand();
  const pubs = useStore(publicationStore);
  const pubId = noticePublicationId(n);
  const pub = pubs.items.find((p) => p.id === pubId);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const state = today < n.start ? `Starts in ${plural(diffDays(today, n.start), 'day')}` : today <= n.end ? 'In effect now' : `Work resumes ${today === n.resume ? 'today' : `in ${plural(diffDays(today, n.resume), 'day')}`}`;
  const prepare = async () => {
    setBusy(true);
    const at = new Date().toISOString();
    const rec: Publication = {
      id: pubId,
      kind: 'consideration',
      title: n.title,
      status: 'draft',
      payload: { text: n.message, date: n.start, category: n.category, impact: `No site work from ${fmtDate(n.start)} to ${fmtDate(n.end)}; work resumes ${fmtDate(n.resume)}.` },
      periodStart: n.start,
      periodEnd: n.end,
      history: [{ at, by: user.name, to: 'draft', note: 'Prepared from the Command Center announcement' }],
      createdAt: at,
      createdBy: user.name,
      updatedAt: at,
      updatedBy: user.name,
    };
    try {
      const where = await publicationStore.put(rec);
      setMsg(where === 'shared' ? 'Draft prepared in Client Portal Management. Clients see it only after review and publishing.' : 'Draft saved on this device only.');
    } catch (e) {
      setMsg(`Not prepared: ${e instanceof Error ? e.message : 'the database refused the change'}.`);
    }
    setBusy(false);
  };
  return (
    <section className="cc2-notice" role="region" aria-label="Important announcement">
      <div className="cc2-notice-ico" aria-hidden>
        <Megaphone size={22} />
      </div>
      <div className="cc2-notice-b">
        <span className="cc2-notice-k">Important announcement · {state}</span>
        <h2>{n.title}</h2>
        <p>{n.message}</p>
        <div className="cc2-notice-d">
          <span>
            <b>Work stoppage</b> {fmtDate(n.start)} – {fmtDate(n.end)}
          </span>
          <span>
            <b>Work resumes</b> {noticeDate(n.resume)}
          </span>
        </div>
        {msg && <p className="cc2-notice-msg">{msg}</p>}
      </div>
      <div className="cc2-notice-a">
        <button type="button" className="cv-btn sm" onClick={() => actions.navigate(`calendar/month/${n.start}`)}>
          Project Calendar
        </button>
        {isManager &&
          (pub ? (
            <button type="button" className="cv-btn sm" onClick={() => actions.navigate('publishing/considerations')}>
              Client portal: {pub.status === 'published' ? 'Published' : pub.status === 'review' ? 'For review' : pub.status === 'approved' ? 'Approved' : 'Draft'}
            </button>
          ) : (
            <button type="button" className="cv-btn sm primary" disabled={busy || !pubs.loaded} onClick={prepare}>
              Prepare for Client Portal
            </button>
          ))}
      </div>
    </section>
  );
};

// =====================================================================
// 1 — EXECUTIVE OVERVIEW
// =====================================================================
const ExecutiveKpis: React.FC<{ criticalIssues: number; overdue: number; approvals: number; onActions: () => void }> = ({ criticalIssues, overdue, approvals, onActions }) => {
  const { metrics: m, register, today, actions } = useCommand();
  const forecast = forecastCompletion(m);
  const late = m.completionVarianceDays;
  const spi = m.spi;
  const spiTone = spi === null ? 'muted' : spi >= 0.97 ? 'good' : spi >= 0.9 ? 'warn' : 'bad';
  const varTone = m.variancePct < -3 ? 'bad' : m.variancePct < 0 ? 'warn' : 'good';
  const nextMs = register
    .filter((r) => r.kind === 'milestone' && r.status !== 'Completed' && r.finish)
    .sort((a, b) => (a.finish || '').localeCompare(b.finish || ''))[0];
  const msPct = m.milestonesTotal ? (m.milestonesComplete / m.milestonesTotal) * 100 : null;
  const pending = criticalIssues + overdue + approvals;
  return (
    <div className="cc2-kpis" role="list" aria-label="Executive overview">
      <button type="button" role="listitem" className="cc2-kpi" onClick={() => document.getElementById('cc-progress')?.scrollIntoView({ behavior: 'smooth' })}>
        <Ring value={m.actualPct} marker={m.plannedPct} size={60} stroke={7} label={`Actual progress ${m.actualPct.toFixed(1)} percent, planned ${m.plannedPct.toFixed(1)} percent`}>
          <TrendingUp size={18} aria-hidden />
        </Ring>
        <div className="cc2-kpi-b">
          <span className="cc2-kpi-l">Overall Project Progress</span>
          <b className="cc2-kpi-v">{m.actualPct.toFixed(1)}%</b>
          <Tone tone={varTone}>
            {m.variancePct >= 0 ? '+' : ''}
            {m.variancePct.toFixed(1)} pts vs plan
          </Tone>
          <span className="cc2-kpi-c">Planned {m.plannedPct.toFixed(1)}% today</span>
        </div>
      </button>

      <button type="button" role="listitem" className="cc2-kpi" onClick={() => actions.navigate('schedule/forecast')}>
        <div className="cc2-kpi-vis">
          <SpiGauge spi={spi} size={72} />
        </div>
        <div className="cc2-kpi-b">
          <span className="cc2-kpi-l">Schedule Performance</span>
          <b className="cc2-kpi-v">{spi === null ? 'Not available' : `SPI ${spi.toFixed(2)}`}</b>
          <Tone tone={spiTone}>{spi === null ? 'No planned work yet' : spi >= 0.97 ? 'On schedule' : spi >= 0.9 ? 'Slightly behind' : 'Behind schedule'}</Tone>
          <span className="cc2-kpi-c">
            Forecast {fmtDate(forecast)}
            {late > 0 ? ` · ${plural(late, 'day')} late` : ' · on target'}
          </span>
        </div>
      </button>

      <div role="listitem" className="cc2-kpi na" title="Budget and expense records are not kept in this system.">
        <div className="cc2-kpi-ico">
          <Wallet size={26} aria-hidden />
        </div>
        <div className="cc2-kpi-b">
          <span className="cc2-kpi-l">Budget Utilization</span>
          <b className="cc2-kpi-v">Not tracked</b>
          <Tone tone="muted">No budget records</Tone>
          <span className="cc2-kpi-c">Not recorded in this system (the Budget &amp; Expenses module was removed on November 13).</span>
        </div>
      </div>

      <button type="button" role="listitem" className="cc2-kpi" onClick={() => (nextMs ? actions.openActivity(nextMs.id) : actions.navigate('milestones'))}>
        <Ring value={msPct} size={60} stroke={7} color={C.good} label={`${m.milestonesComplete} of ${m.milestonesTotal} milestones completed`}>
          <Flag size={18} aria-hidden />
        </Ring>
        <div className="cc2-kpi-b">
          <span className="cc2-kpi-l">Completed Milestones</span>
          <b className="cc2-kpi-v">{m.milestonesTotal ? `${m.milestonesComplete} / ${m.milestonesTotal}` : 'Not recorded'}</b>
          <Tone tone={nextMs && nextMs.finish! < today ? 'bad' : 'good'}>{nextMs ? (nextMs.finish! < today ? 'Next milestone overdue' : `Next in ${plural(diffDays(today, nextMs.finish!), 'day')}`) : 'All complete'}</Tone>
          <span className="cc2-kpi-c">{nextMs ? `${nextMs.name} · ${fmtDate(nextMs.finish)}` : 'No open milestones'}</span>
        </div>
      </button>

      <button type="button" role="listitem" className="cc2-kpi" onClick={onActions}>
        <div className="cc2-kpi-ico" style={{ color: pending ? C.bad : C.good }}>
          <ListTodo size={26} aria-hidden />
        </div>
        <div className="cc2-kpi-b">
          <span className="cc2-kpi-l">Pending Action Items</span>
          <b className="cc2-kpi-v">{pending}</b>
          <Tone tone={criticalIssues ? 'bad' : pending ? 'warn' : 'good'}>{criticalIssues ? `${criticalIssues} critical` : pending ? 'Action needed' : 'Nothing pending'}</Tone>
          <span className="cc2-kpi-c">
            {overdue} overdue · {approvals} {approvals === 1 ? 'approval' : 'approvals'} · {criticalIssues} critical {criticalIssues === 1 ? 'issue' : 'issues'}
          </span>
        </div>
      </button>
    </div>
  );
};

// =====================================================================
// 2 — CONSTRUCTION PROGRESS ANALYTICS
// =====================================================================
const ProgressAnalytics: React.FC<{ period: PeriodFilter; range: { start: string; end: string } }> = ({ period, range }) => {
  const { metrics: m, register, snapshots, today, actions } = useCommand();
  const [tab, setTab] = useState<'scurve' | 'weekly'>('scurve');
  const [openWs, setOpenWs] = useState<string | null>(null);
  const [week, setWeek] = useState<string | null>(null);
  const curve = useMemo(() => sCurve(register, snapshots, m, projectStartDate(), today), [register, snapshots, m, today]);
  const weeksFrom = period === 'today' || period === 'week' ? addDays(today, -7 * 7) : range.start;
  const bars = useMemo(() => weeklyProgress(register, snapshots, m.actualPct, today, weeksFrom, range.end < today ? range.end : today), [register, snapshots, m.actualPct, today, weeksFrom, range.end]);
  const selWeek = bars.find((b) => b.start === week) || null;
  const recorded = snapshots.filter((s) => s.date < today).length;
  const varTone = m.variancePct < -3 ? 'bad' : m.variancePct < 0 ? 'warn' : 'good';
  return (
    <Section id="cc-progress" title="Construction Progress" sub="Cumulative project figures (not affected by the period filter)">
      <div className="cc2-ana">
        <div className="cc2-card">
          <div className="cc2-overall">
            <Ring value={m.actualPct} marker={m.plannedPct} size={150} stroke={14} label={`Actual ${m.actualPct.toFixed(1)}%, planned ${m.plannedPct.toFixed(1)}%`}>
              <b className="cc2-big">{m.actualPct.toFixed(1)}%</b>
              <span className="cc2-dim">actual</span>
            </Ring>
            <dl className="cc2-stats">
              <dt>Planned today</dt>
              <dd>{m.plannedPct.toFixed(1)}%</dd>
              <dt>Actual</dt>
              <dd>{m.actualPct.toFixed(1)}%</dd>
              <dt>Variance</dt>
              <dd>
                <Tone tone={varTone}>
                  {m.variancePct >= 0 ? '+' : ''}
                  {m.variancePct.toFixed(1)} pts
                </Tone>
              </dd>
              <dt>Elapsed time</dt>
              <dd>{m.elapsedPct.toFixed(0)}%</dd>
            </dl>
          </div>
          <h3 className="cc2-h3">Progress by phase</h3>
          <ul className="cc2-phases">
            {m.workstreams.map((w) => {
              const st = phaseStatus(w.actual, w.planned);
              const items = register.filter((r) => r.kind === 'scope' && r.workstream === w.label);
              const open = openWs === w.key;
              return (
                <li key={w.key} className={open ? 'open' : ''}>
                  <button type="button" className="cc2-phase" aria-expanded={open} onClick={() => setOpenWs(open ? null : w.key)}>
                    <span className="cc2-phase-n">
                      {open ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}
                      {w.label}
                    </span>
                    <span className={`cc2-pst ${st.replace(/\s/g, '').toLowerCase()}`}>{st}</span>
                    <span className="cc2-bar" title={`Actual ${w.actual.toFixed(1)}% · planned ${w.planned.toFixed(1)}%`}>
                      <b style={{ width: `${Math.min(100, w.actual)}%` }} />
                      <i style={{ left: `calc(${Math.min(100, w.planned)}% - 1px)` }} />
                    </span>
                    <span className="cc2-phase-p">
                      {w.actual.toFixed(0)}% <span className="cc2-dim">/ {w.planned.toFixed(0)}%</span>
                    </span>
                  </button>
                  {open && (
                    <ul className="cc2-phase-items">
                      {items.map((r) => (
                        <li key={r.id}>
                          <button type="button" onClick={() => actions.openActivity(r.id)}>
                            <span>{r.name}</span>
                            <span className="cc2-dim">{fmtRange(r.start, r.finish)}</span>
                            <span className="cc2-mini-bar">
                              <b style={{ width: `${r.progress}%` }} />
                            </span>
                            <span className="cc2-num">{r.progress}%</span>
                            <StatusPill status={r.status} />
                          </button>
                        </li>
                      ))}
                      {!items.length && <li className="cc2-dim">No scopes recorded in this phase.</li>}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="cc2-note">Bar = actual · marker = planned today. Click a phase to see its scopes of work.</p>
        </div>

        <div className="cc2-card">
          <div className="cc2-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === 'scurve'} className={tab === 'scurve' ? 'on' : ''} onClick={() => setTab('scurve')}>
              Planned vs Actual (S-curve)
            </button>
            <button type="button" role="tab" aria-selected={tab === 'weekly'} className={tab === 'weekly' ? 'on' : ''} onClick={() => setTab('weekly')}>
              Weekly Progress
            </button>
          </div>
          {tab === 'scurve' ? (
            <>
              <SCurveChart points={curve} today={today} target={m.targetCompletion} />
              <p className="cc2-note">
                Actual points are recorded progress snapshots ({recorded} so far) plus today’s live figure; dates without a snapshot are left blank. The forecast runs from
                today’s actual to 100% at the forecast completion ({fmtDate(forecastCompletion(m))}).
              </p>
            </>
          ) : (
            <>
              <WeeklyBars bars={bars} selected={week} onSelect={(s) => setWeek(week === s ? null : s)} />
              {selWeek ? (
                <div className="cc2-week">
                  <div className="cc2-week-h">
                    <b>Week of {fmtRange(selWeek.start, selWeek.end)}</b>
                    <span>
                      Actual {selWeek.gain === null ? 'Not recorded' : `${selWeek.gain > 0 ? '+' : ''}${selWeek.gain} pts`} · planned +{selWeek.plannedGain} pts
                    </span>
                    <button type="button" className="cv-linkbtn" onClick={() => actions.navigate(`reports/weekly/id=${weeklyReportId(selWeek.start)}`)}>
                      Open weekly report
                    </button>
                  </div>
                  {selWeek.completed.length ? (
                    <ul>
                      {selWeek.completed.map((r) => (
                        <li key={r.id}>
                          <button type="button" className="cv-linkbtn" onClick={() => actions.openActivity(r.id)}>
                            {r.name}
                          </button>{' '}
                          <span className="cc2-dim">· {r.workstream}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="cc2-dim">No activities were completed this week.</p>
                  )}
                </div>
              ) : (
                <p className="cc2-note">
                  {period === 'today' || period === 'week' ? 'Last 8 weeks. ' : `${PERIOD_LABEL[period]}. `}Weekly change in overall progress, from recorded snapshots. Click a week for its
                  completed activities.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </Section>
  );
};

// =====================================================================
// 3 — TIMELINE AND MILESTONES
// =====================================================================
const TimelineSection: React.FC<{ range: { start: string; end: string }; ahead: { start: string; end: string }; period: PeriodFilter }> = ({ range, ahead, period }) => {
  const { register, metrics: m, today, actions } = useCommand();
  const [sel, setSel] = useState<string | null>(null);
  const [state, setState] = useState<TimelineState | null>(null);
  const start = projectStartDate();
  const fc = forecastCompletion(m);
  const end = [m.targetCompletion, fc].filter(isValidIso).sort().pop() || today;
  const markers = useMemo(
    () => register.filter((r) => (r.kind === 'milestone' || r.kind === 'pour') && isValidIso(r.finish)).sort((a, b) => (a.finish || '').localeCompare(b.finish || '')),
    [register]
  );
  const acts = register.filter(isConstruction);
  const groups: Record<TimelineState, RegisterActivity[]> = {
    Completed: acts.filter((r) => r.status === 'Completed' && inRange(r.actualFinish || r.finish, range)),
    Ongoing: acts.filter((r) => timelineState(r, today) === 'Ongoing'),
    Upcoming: acts.filter((r) => timelineState(r, today) === 'Upcoming' && r.start && r.start <= (period === 'all' ? addDays(today, 30) : ahead.end)),
    Delayed: acts.filter((r) => r.status === 'Delayed'),
  };
  const chipNote: Record<TimelineState, string> = {
    Completed: `construction · ${period === 'all' ? 'to date' : PERIOD_LABEL[period].toLowerCase()}`,
    Ongoing: 'construction · now',
    Upcoming: `construction · ${period === 'all' ? 'next 30 days' : period === 'today' ? 'starting today' : `starting ${PERIOD_LABEL[period].toLowerCase()}`}`,
    Delayed: 'construction · past target',
  };
  const selected = sel ? register.find((r) => r.id === sel) : null;
  const ticks = monthTicks(start, end);
  // stagger close markers into two rows
  const rows: number[] = [];
  markers.forEach((r, i) => {
    const pos = timelinePos(r.finish!, start, end);
    const prev = i ? timelinePos(markers[i - 1].finish!, start, end) : -100;
    rows.push(pos - prev < 3.2 && rows[i - 1] === 0 ? 1 : 0);
  });
  return (
    <Section id="cc-timeline" title="Timeline and Milestones" sub={`${fmtDate(start)} – ${fmtDate(end)}`} right={
      <button type="button" className="cv-btn sm" onClick={() => actions.navigate('timeline')}>
        Master Gantt
      </button>
    }>
      <div className="cc2-card">
        <div className="cc2-chips" role="group" aria-label="Activities by state">
          {(['Completed', 'Ongoing', 'Upcoming', 'Delayed'] as TimelineState[]).map((s) => (
            <button key={s} type="button" aria-pressed={state === s} className={state === s ? 'on' : ''} onClick={() => setState(state === s ? null : s)} style={{ ['--c' as any]: STATE_COLOR[s] }}>
              <b>{groups[s].length}</b>
              <span>
                {s}
                <em>{chipNote[s]}</em>
              </span>
            </button>
          ))}
        </div>
        <div className="cc2-tl-wrap">
          <div className="cc2-tl" role="list" aria-label="Milestones and concrete pours">
            <div className="cc2-tl-track" />
            <div className="cc2-tl-done" style={{ width: `${timelinePos(today, start, end)}%` }} />
            {ticks.map((t) => (
              <span key={t} className="cc2-tl-tick" style={{ left: `${timelinePos(t, start, end)}%` }}>
                {new Date(t + 'T00:00:00').toLocaleString('en-US', { month: 'short' })}
              </span>
            ))}
            <span className="cc2-tl-today" style={{ left: `${timelinePos(today, start, end)}%` }}>
              <em>Today</em>
            </span>
            <span className="cc2-tl-target" style={{ left: `${timelinePos(m.targetCompletion, start, end)}%` }} title={`Target completion ${fmtDate(m.targetCompletion)}`}>
              <em>Target</em>
            </span>
            {fc !== m.targetCompletion && (
              <span className="cc2-tl-target fc" style={{ left: `${timelinePos(fc, start, end)}%` }} title={`Forecast completion ${fmtDate(fc)}`}>
                <em>Forecast</em>
              </span>
            )}
            {markers.map((r, i) => {
              const st = timelineState(r, today);
              return (
                <button
                  key={r.id}
                  type="button"
                  role="listitem"
                  className={`cc2-ms ${r.kind} ${sel === r.id ? 'on' : ''} row${rows[i]}`}
                  style={{ left: `${timelinePos(r.finish!, start, end)}%`, ['--c' as any]: STATE_COLOR[st] }}
                  aria-label={`${r.name}, ${fmtDate(r.finish)}, ${st}`}
                  title={`${r.name} · ${fmtDate(r.finish)} · ${st}`}
                  onClick={() => setSel(sel === r.id ? null : r.id)}
                />
              );
            })}
          </div>
        </div>
        <div className="cc2-tl-legend">
          {(['Completed', 'Ongoing', 'Upcoming', 'Delayed'] as TimelineState[]).map((s) => (
            <span key={s}>
              <i style={{ background: STATE_COLOR[s] }} /> {s}
            </span>
          ))}
          <span>
            <i className="dia" /> Concrete pour
          </span>
          <span>
            <i className="cir" /> Milestone
          </span>
        </div>
        {selected && (
          <div className="cc2-ms-card" role="dialog" aria-label={selected.name}>
            <div>
              <b>{selected.name}</b>
              <span className="cc2-dim">
                {selected.kind === 'pour' ? 'Concrete pour' : 'Milestone'} · target {fmtDate(selected.finish)}
                {selected.actualFinish ? ` · completed ${fmtDate(selected.actualFinish)}` : ''} · {selected.owner || 'No owner'}
              </span>
            </div>
            <StatusPill status={selected.status} />
            <button type="button" className="cv-btn sm primary" onClick={() => actions.openActivity(selected.id)}>
              Open record
            </button>
            <button type="button" className="cv-btn sm" onClick={() => actions.navigate('milestones')}>
              Milestone Monitoring
            </button>
          </div>
        )}
        {state && (
          <ul className="cc2-list">
            {groups[state].slice(0, 30).map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => actions.openActivity(r.id)}>
                  <span className="cc2-dot" style={{ background: STATE_COLOR[state] }} />
                  <span className="cc2-li-t">{r.name}</span>
                  <span className="cc2-dim">{r.workstream}</span>
                  <span className="cc2-dim">{state === 'Completed' ? `done ${fmtDate(r.actualFinish || r.finish)}` : fmtRange(r.start, r.finish)}</span>
                  <span className="cc2-num">{r.progress}%</span>
                </button>
              </li>
            ))}
            {!groups[state].length && <li className="cc2-dim">None.</li>}
            {groups[state].length > 30 && <li className="cc2-dim">…and {groups[state].length - 30} more in the Master Project Tracker.</li>}
          </ul>
        )}
      </div>
    </Section>
  );
};

// =====================================================================
// 4 — PROJECT HEALTH AND ALERTS
// =====================================================================
type AlertGroup = 'critical' | 'overdue' | 'approvals' | 'upcoming';
interface AlertItem {
  id: string;
  group: AlertGroup;
  title: string;
  sub: string;
  when: string;
  open: () => void;
}
const GROUPS: { k: AlertGroup; label: string; icon: React.FC<any>; color: string }[] = [
  { k: 'critical', label: 'Critical Issues', icon: AlertOctagon, color: C.bad },
  { k: 'overdue', label: 'Overdue Activities', icon: Clock, color: C.warn },
  { k: 'approvals', label: 'Pending Approvals', icon: CheckSquare, color: '#7B4DFF' },
  { k: 'upcoming', label: 'Upcoming Deadlines', icon: CalendarClock, color: C.actual },
];

const HealthSection: React.FC<{
  critical: { id: string; title: string; owner?: string; dueDate?: string; raisedDate?: string; type: string }[];
  overdue: RegisterActivity[];
  approvals: ReturnType<typeof useManagementActions>['pendingApprovals'];
  upcoming: RegisterActivity[];
  filter: AlertGroup | '';
  setFilter: (g: AlertGroup | '') => void;
  period: PeriodFilter;
}> = ({ critical, overdue, approvals, upcoming, filter, setFilter, period }) => {
  const { metrics: m, today, actions } = useCommand();
  const [all, setAll] = useState(false);
  const items: AlertItem[] = [
    ...critical.map((i) => ({
      id: `i-${i.id}`,
      group: 'critical' as const,
      title: i.title,
      sub: `Critical ${i.type.toLowerCase()} · ${i.owner || 'no owner'}`,
      when: i.dueDate ? (i.dueDate < today ? `${plural(diffDays(i.dueDate, today), 'day')} past due` : `due ${fmtDate(i.dueDate)}`) : `raised ${fmtDate(i.raisedDate)}`,
      open: () => actions.navigate(`issues/log/${i.id}`),
    })),
    ...overdue.map((r) => ({
      id: `o-${r.id}`,
      group: 'overdue' as const,
      title: r.name,
      sub: `${r.workstream} · ${r.progress}% · ${r.owner || 'no owner'}`,
      when: r.finish ? `${plural(diffDays(r.finish, today), 'day')} overdue` : 'overdue',
      open: () => actions.openActivity(r.id),
    })),
    ...approvals.map((p) => ({
      id: `a-${p.kind}-${p.id}`,
      group: 'approvals' as const,
      title: p.title,
      sub: `${p.kind}${p.by ? ` · ${p.by}` : ''}`,
      when: p.since ? `waiting since ${fmtDate(p.since.slice(0, 10))}` : 'waiting',
      open: () => actions.navigate(p.route),
    })),
    ...upcoming.map((r) => ({
      id: `u-${r.id}`,
      group: 'upcoming' as const,
      title: r.name,
      sub: `${r.workstream} · ${r.progress}% · ${r.owner || 'no owner'}`,
      when: r.finish === today ? 'due today' : `due ${fmtDate(r.finish)}`,
      open: () => actions.openActivity(r.id),
    })),
  ];
  const counts = Object.fromEntries(GROUPS.map((g) => [g.k, items.filter((i) => i.group === g.k).length])) as Record<AlertGroup, number>;
  const shown = items.filter((i) => (filter ? i.group === filter : i.group !== 'upcoming' || !items.some((x) => x.group !== 'upcoming')));
  const list = all ? shown : shown.slice(0, 6);
  return (
    <Section id="cc-health" title="Project Health and Alerts" sub={m.healthReasons[0] || `Project health: ${m.health}`}>
      <div className="cc2-card">
        <div className="cc2-alerts" role="group" aria-label="Alert counters">
          {GROUPS.map((g) => (
            <button key={g.k} type="button" aria-pressed={filter === g.k} className={`${filter === g.k ? 'on' : ''} ${counts[g.k] ? '' : 'zero'}`} style={{ ['--c' as any]: g.color }} onClick={() => setFilter(filter === g.k ? '' : g.k)}>
              <g.icon size={20} aria-hidden />
              <b>{counts[g.k]}</b>
              <span>
                {g.label}
                {g.k === 'upcoming' && <em>all workstreams · {period === 'all' ? 'next 30 days' : PERIOD_LABEL[period].toLowerCase()}</em>}
                {g.k === 'overdue' && <em>all workstreams</em>}
                {g.k === 'critical' && <em>open, issues log</em>}
                {g.k === 'approvals' && <em>reports and publications</em>}
              </span>
            </button>
          ))}
        </div>
        <div className="cc2-ar-h">
          <h3 className="cc2-h3">Action Required{filter ? ` · ${GROUPS.find((g) => g.k === filter)!.label}` : ''}</h3>
          {filter && (
            <button type="button" className="cv-linkbtn" onClick={() => setFilter('')}>
              Show all
            </button>
          )}
          <span className="cc2-sp" />
          <button type="button" className="cv-btn sm" onClick={() => actions.navigate('issues/attention')}>
            Items Requiring Attention
          </button>
        </div>
        {list.length ? (
          <ul className="cc2-ar">
            {list.map((a) => {
              const g = GROUPS.find((x) => x.k === a.group)!;
              return (
                <li key={a.id}>
                  <button type="button" onClick={a.open} style={{ ['--c' as any]: g.color }}>
                    <g.icon size={16} aria-hidden />
                    <span className="cc2-ar-m">
                      <b>{a.title}</b>
                      <span className="cc2-dim">{a.sub}</span>
                    </span>
                    <span className="cc2-ar-w">{a.when}</span>
                    <ChevronRight size={16} aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <Empty>{filter ? 'Nothing in this group.' : 'No critical issues, overdue activities or pending approvals.'}</Empty>
        )}
        {shown.length > 6 && (
          <button type="button" className="cc2-more-btn" onClick={() => setAll(!all)}>
            {all ? 'Show fewer' : `Show all ${shown.length}`}
          </button>
        )}
      </div>
    </Section>
  );
};

// =====================================================================
// 5 — SITE DOCUMENTATION
// =====================================================================
const SiteDocs: React.FC<{ range: { start: string; end: string }; period: PeriodFilter }> = ({ range, period }) => {
  const { register, reports, actions, isManager, canEdit, today } = useCommand();
  const files = useStore(driveFileStore);
  const daily = useStore(dailyReportStore);
  const narr = useStore(narrativeStore);
  const [tab, setTab] = useState<'photos' | 'daily' | 'weekly' | 'compare'>('photos');
  const photos = files.items.filter((f) => f.kind === 'photo' && f.uploadStatus === 'uploaded');
  const inP = photos.filter((f) => inRange(f.reportingDate, range)).sort((a, b) => (b.uploadedAt || '').localeCompare(a.uploadedAt || ''));
  const latest = (inP.length ? inP : period === 'all' ? [] : []).slice(0, 8);
  const actName = (id?: string | null) => (id ? register.find((r) => r.id === id)?.name : undefined);
  const dReps = daily.items.filter((d) => d.status !== 'draft' && inRange(d.date, range)).slice(0, 8);
  const weekly = [
    ...narr.items.filter((n) => n.type === 'weekly' && !n.subjectId).map((n) => ({ id: n.id, title: n.title, ref: n.reference, period: fmtRange(n.periodStart, n.periodEnd), status: NARRATIVE_STATUS_LABEL[n.status], end: n.periodEnd, route: `narrative/archive/${n.id}` })),
    ...reports.filter((r) => r.type === 'weekly').map((r) => ({ id: r.id, title: r.title, ref: r.id, period: fmtRange(r.periodStart, r.periodEnd), status: statusLabel(r.status), end: r.periodEnd, route: `reports/weekly/id=${r.id}` })),
  ]
    .filter((w) => period === 'all' || w.end >= range.start)
    .sort((a, b) => b.end.localeCompare(a.end))
    .slice(0, 6);
  // before / after: activities with at least two photos on different dates
  const byAct = new Map<string, typeof photos>();
  photos.forEach((p) => p.activityId && byAct.set(p.activityId, [...(byAct.get(p.activityId) || []), p]));
  const comparable = [...byAct.entries()].filter(([, ps]) => new Set(ps.map((p) => p.reportingDate)).size >= 2);
  const [cmpAct, setCmpAct] = useState('');
  const cmp = comparable.find(([id]) => id === cmpAct) || comparable[0];
  const pair = cmp ? [...cmp[1]].sort((a, b) => a.reportingDate.localeCompare(b.reportingDate) || a.uploadedAt.localeCompare(b.uploadedAt)) : [];
  const [mix, setMix] = useState(50);
  const driveLink = (id?: string) => (isManager && id ? `https://drive.google.com/file/d/${encodeURIComponent(id)}/view` : null);
  return (
    <Section
      id="cc-docs"
      title="Site Documentation"
      sub={PERIOD_LABEL[period]}
      right={
        canEdit ? (
          <button type="button" className="cv-btn sm" onClick={() => actions.navigate('site/new')}>
            <Camera size={14} aria-hidden /> New Daily Report
          </button>
        ) : undefined
      }
    >
      <div className="cc2-card">
        <div className="cc2-tabs" role="tablist">
          {(
            [
              ['photos', 'Latest Photos', ImageIcon],
              ['daily', 'Daily Reports', ClipboardPen],
              ['weekly', 'Weekly Reports', FileText],
              ['compare', 'Before & After', Columns2],
            ] as const
          ).map(([k, l, I]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
              <I size={14} aria-hidden /> {l}
            </button>
          ))}
        </div>
        {tab === 'photos' &&
          (latest.length ? (
            <div className="cc2-photos">
              {latest.map((f) => (
                <figure key={f.id}>
                  <button type="button" className="cc2-ph" onClick={() => void openDriveFile(driveFileUrl(f.id))} aria-label={`Open photo: ${f.description || f.fileName}`}>
                    <SecureImg src={driveFileUrl(f.id)} alt={f.description || f.photoType || 'Site photograph'} loading="lazy" />
                  </button>
                  <figcaption>
                    <b>{f.description || f.photoType || f.category || 'Site photograph'}</b>
                    <span>{actName(f.activityId) || f.category || 'No activity linked'}</span>
                    <span className="cc2-dim">
                      {fmtDate(f.reportingDate)} · {f.uploadedBy}
                    </span>
                    {driveLink(f.driveFileId) && (
                      <a href={driveLink(f.driveFileId)!} target="_blank" rel="noopener noreferrer" className="cc2-ext">
                        Google Drive <ExternalLink size={12} aria-hidden />
                      </a>
                    )}
                  </figcaption>
                </figure>
              ))}
            </div>
          ) : (
            <Empty>{files.loaded ? `No photos uploaded ${period === 'all' ? 'yet' : `for ${PERIOD_LABEL[period].toLowerCase()}`}.` : 'Loading…'}</Empty>
          ))}
        {tab === 'daily' &&
          (dReps.length ? (
            <ul className="cc2-list">
              {dReps.map((d) => (
                <li key={d.id}>
                  <button type="button" onClick={() => actions.navigate(`site/history/${d.id}`)}>
                    <ClipboardPen size={15} aria-hidden />
                    <span className="cc2-li-t">
                      {d.reference} · {fmtDate(d.date)}
                    </span>
                    <span className="cc2-dim">{d.preparedBy}</span>
                    <span className="cc2-dim">
                      {plural(d.photos.filter((p) => p.uploadStatus === 'uploaded').length, 'photo')} · {d.activities.filter((a) => a.name).map((a) => a.name).slice(0, 2).join(', ') || 'no activities listed'}
                    </span>
                    <span className="cc2-tag">{DR_STATUS_LABEL[d.status]}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>{daily.loaded ? `No daily reports ${period === 'all' ? 'yet' : `for ${PERIOD_LABEL[period].toLowerCase()}`}.` : 'Loading…'}</Empty>
          ))}
        {tab === 'weekly' &&
          (weekly.length ? (
            <ul className="cc2-list">
              {weekly.map((w) => (
                <li key={w.id}>
                  <button type="button" onClick={() => actions.navigate(w.route)}>
                    <FileText size={15} aria-hidden />
                    <span className="cc2-li-t">{w.title}</span>
                    <span className="cc2-dim">{w.period}</span>
                    <span className="cc2-tag">{w.status}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No weekly reports {period === 'all' ? 'yet' : 'for this period'}.</Empty>
          ))}
        {tab === 'compare' &&
          (pair.length >= 2 ? (
            <div className="cc2-cmp">
              <label className="cc2-cmp-sel">
                <span>Activity</span>
                <select className="cv-select" value={cmp![0]} onChange={(e) => setCmpAct(e.target.value)}>
                  {comparable.map(([id, ps]) => (
                    <option key={id} value={id}>
                      {actName(id) || id} ({ps.length} photos)
                    </option>
                  ))}
                </select>
              </label>
              <div className="cc2-cmp-view" style={{ ['--mix' as any]: `${mix}%` }}>
                <SecureImg src={driveFileUrl(pair[pair.length - 1].id)} alt={`Current: ${fmtDate(pair[pair.length - 1].reportingDate)}`} />
                <div className="cc2-cmp-prev">
                  <SecureImg src={driveFileUrl(pair[0].id)} alt={`Previous: ${fmtDate(pair[0].reportingDate)}`} />
                </div>
                <span className="cc2-cmp-l">Previous · {fmtDate(pair[0].reportingDate)}</span>
                <span className="cc2-cmp-r">Current · {fmtDate(pair[pair.length - 1].reportingDate)}</span>
              </div>
              <input type="range" min={0} max={100} value={mix} onChange={(e) => setMix(Number(e.target.value))} aria-label="Compare previous and current photo" className="cc2-cmp-range" />
              <p className="cc2-note">
                Earliest and latest uploaded photos of the activity ({diffDays(pair[0].reportingDate, pair[pair.length - 1].reportingDate)} days apart). Photos illustrate the site; progress
                figures come from the tracker.
              </p>
            </div>
          ) : (
            <Empty>Before-and-after needs at least two photos of the same activity taken on different dates. Link photos to activities when uploading them.</Empty>
          ))}
        <p className="cc2-note">
          Files are opened through the secure file service. {isManager ? 'Google Drive links open the original in Drive (Drive access required).' : ''} Today: {fmtDate(today)}.
        </p>
      </div>
    </Section>
  );
};

// =====================================================================
// 6 — RECENT PROJECT ACTIVITY
// =====================================================================
interface FeedItem {
  at: string;
  kind: 'completed' | 'status' | 'new' | 'milestone' | 'document' | 'daily' | 'report';
  title: string;
  detail: string;
  go: () => void;
}
const FEED_LABEL: Record<FeedItem['kind'], string> = {
  completed: 'Completed',
  status: 'Status update',
  new: 'New activity',
  milestone: 'Milestone updated',
  document: 'Document',
  daily: 'Daily report',
  report: 'Report',
};
const FEED_COLOR: Record<FeedItem['kind'], string> = {
  completed: C.good,
  status: C.actual,
  new: '#7B4DFF',
  milestone: '#F5C518',
  document: '#64748B',
  daily: '#0B7A75',
  report: C.navy,
};

const ActivityFeed: React.FC<{ range: { start: string; end: string }; period: PeriodFilter }> = ({ range, period }) => {
  const { register, data, reports, actions } = useCommand();
  const docs = useStore(documentStore);
  const daily = useStore(dailyReportStore);
  const narr = useStore(narrativeStore);
  const [n, setN] = useState(12);
  const items = useMemo(() => {
    const out: FeedItem[] = [];
    const created = new Map(data.activities.map((a) => [a.id, a]));
    register.forEach((r) => {
      if (r.status === 'Completed' && r.actualFinish && inRange(r.actualFinish, range)) {
        out.push({ at: r.lastUpdated && dayOf(r.lastUpdated) === r.actualFinish ? r.lastUpdated : `${r.actualFinish}T12:00:00`, kind: 'completed', title: r.name, detail: `${r.workstream}${r.updatedBy ? ` · ${r.updatedBy}` : ''}`, go: () => actions.openActivity(r.id) });
        return;
      }
      if (r.lastUpdated && inRange(r.lastUpdated, range))
        out.push({
          at: r.lastUpdated,
          kind: r.kind === 'milestone' || r.kind === 'pour' ? 'milestone' : 'status',
          title: r.name,
          detail: `${statusLabel(r.status)} · ${r.progress}%${r.updatedBy ? ` · ${r.updatedBy}` : ''}`,
          go: () => actions.openActivity(r.id),
        });
    });
    data.activities.forEach((a) => {
      if (a.createdAt && inRange(a.createdAt, range) && created.has(a.id)) {
        const r = register.find((x) => x.sourceId === a.id || x.id === a.id);
        out.push({ at: a.createdAt, kind: 'new', title: a.title || r?.name || 'New activity', detail: r ? r.workstream : 'Master Project Tracker', go: () => (r ? actions.openActivity(r.id) : actions.navigate('tracker')) });
      }
    });
    docs.items.forEach((d) => d.createdAt && inRange(d.createdAt, range) && out.push({ at: d.createdAt, kind: 'document', title: d.title, detail: `${d.category}${d.createdBy ? ` · ${d.createdBy}` : ''}`, go: () => actions.navigate('documents') }));
    daily.items.forEach((d) => d.submittedAt && inRange(d.submittedAt, range) && out.push({ at: d.submittedAt, kind: 'daily', title: `${d.reference} · ${fmtDate(d.date)}`, detail: `${DR_STATUS_LABEL[d.status]} · ${d.preparedBy}`, go: () => actions.navigate(`site/history/${d.id}`) }));
    reports.forEach((r) => r.updatedAt && inRange(r.updatedAt, range) && out.push({ at: r.updatedAt, kind: 'report', title: r.title, detail: `${statusLabel(r.status)} · ${r.updatedBy}`, go: () => actions.navigate(`reports/${r.type}/id=${r.id}`) }));
    narr.items.forEach((x) => x.updatedAt && inRange(x.updatedAt, range) && out.push({ at: x.updatedAt, kind: 'report', title: `${x.reference} · ${x.title}`, detail: `${NARRATIVE_STATUS_LABEL[x.status]} · ${x.updatedBy}`, go: () => actions.navigate(`narrative/archive/${x.id}`) }));
    return out.sort((a, b) => b.at.localeCompare(a.at));
  }, [register, data.activities, docs.items, daily.items, reports, narr.items, range.start, range.end, actions]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = items.slice(0, n);
  let lastDay = '';
  return (
    <Section id="cc-activity" title="Recent Activity" sub={PERIOD_LABEL[period]}>
      <div className="cc2-card">
        {shown.length ? (
          <ol className="cc2-feed">
            {shown.map((x, i) => {
              const day = dayOf(x.at);
              const head = day !== lastDay;
              lastDay = day;
              return (
                <React.Fragment key={i}>
                  {head && <li className="cc2-feed-day">{fmtDate(day)}</li>}
                  <li>
                    <button type="button" onClick={x.go}>
                      <span className="cc2-feed-dot" style={{ background: FEED_COLOR[x.kind] }} />
                      <span className="cc2-feed-k">{FEED_LABEL[x.kind]}</span>
                      <span className="cc2-feed-t">{x.title}</span>
                      <span className="cc2-dim">{x.detail}</span>
                    </button>
                  </li>
                </React.Fragment>
              );
            })}
          </ol>
        ) : (
          <Empty>No recorded activity {period === 'all' ? 'yet' : `for ${PERIOD_LABEL[period].toLowerCase()}`}.</Empty>
        )}
        {items.length > n && (
          <button type="button" className="cc2-more-btn" onClick={() => setN(n + 15)}>
            <History size={14} aria-hidden /> Show older ({items.length - n} more)
          </button>
        )}
      </div>
    </Section>
  );
};


/** Pending management actions (shared by the desktop Command Center and the phone dashboard). */
export function useManagementActions() {
  const { register, attention, issues, reports, actions } = useCommand();
  const pubs = useStore(publicationStore);
  const daily = useStore(dailyReportStore);
  const narr = useStore(narrativeStore);
  const openIssues = issues.filter((i) => i.status !== 'Resolved' && i.status !== 'Closed');
  const criticalIssues = openIssues.filter((i) => i.severity === 'Critical');
  const pendingApprovals = [
    ...reports.filter((r) => r.status === 'review').map((r) => ({ id: r.id, title: r.title || 'Report for review', kind: 'Report', since: r.updatedAt, by: r.updatedBy, route: `reports/${r.type === 'monthly' ? 'monthly' : 'weekly'}` })),
    ...pubs.items.filter((p) => p.status === 'review').map((p) => ({ id: p.id, title: p.title, kind: 'Client publication', since: p.updatedAt, by: p.updatedBy, route: 'publishing' })),
    ...daily.items
      .filter((d) => d.status === 'submitted' || d.status === 'under_review')
      .map((d) => ({ id: d.id, title: `${d.reference} · ${fmtDate(d.date)}`, kind: 'Daily Construction Report', since: d.submittedAt || d.updatedAt, by: d.preparedBy, route: `site/history/${d.id}` })),
    ...narr.items.filter((n) => n.status === 'review').map((n) => ({ id: n.id, title: `${n.reference} · ${n.title}`, kind: 'Narrative report', since: n.updatedAt, by: n.preparedBy, route: `narrative/archive/${n.id}` })),
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

/** Delivery blockers and priorities (recent updates are in the Recent Activity feed). */
const OperationsPulse: React.FC = () => {
  const { register, alignment, today, actions } = useCommand();
  const procurement = useStore(procurementStore);
  const lateDeliveries = procurement.items.filter((p) => !p.archived && isDeliveryLate(p, today));
  const weekEnd = addDays(today, 7);
  const monthEnd = monthRange(today).end;
  const atRiskWeek = useMemo(() => buildOutlook(register, alignment, today, weekEnd, today).filter((o) => o.outlook === 'At risk'), [register, alignment, today, weekEnd]);
  const monthMilestones = register.filter((r) => (r.kind === 'milestone' || r.kind === 'pour') && r.status !== 'Completed' && r.finish && r.finish >= today && r.finish <= monthEnd);

  return (
    <div className="cv-grid cv-g2">
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
    </div>
  );
};
