/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * CONVENGERS PRODUCTION ALIGNMENT — stakeholder dashboard.
 * Used by the client portal (published copy) and by the internal app (live data).
 * Everything shown is derived from PortalProduction (see domain/productionAlignment.ts).
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clapperboard,
  Clock,
  Diamond,
  Film,
  HardHat,
  Link2,
  ListChecks,
  MapPin,
  Pencil,
  Presentation,
  Printer,
  Users,
  X,
} from 'lucide-react';
import {
  AWAITING,
  CLASS_LABEL,
  LIGHT,
  LIGHTS,
  ALERT_LABEL,
  castMatrix,
  characterProfiles,
  episodesInRange,
  episodesOn,
  kpis,
  monthPlan,
  onTrack,
  productionWindows,
  rangeText,
  seriesMonths,
  teamOverview,
  type PPEpisode,
  type PPMilestone,
  type PortalProduction,
  type ShootStatus,
  type MonthPlan,
} from '../domain/productionAlignment.ts';
import { addDays, diffDays, fmtDate, fmtRange, monthRange, weekRange } from '../domain/dates.ts';
import { monthGrid } from '../domain/productionCalendar.ts';
import { useStore } from '../firebase/useStore.ts';
import { productionPortalStore } from '../firebase/opsStores.ts';
import '../command/prodCalendar.css';
import './productionAlignment.css';

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const VIEW_KEY = 'convengers_pa_view';
type View = 'month' | 'week' | 'agenda';

const STATUS_TONE: Record<ShootStatus, string> = {
  Completed: 'done',
  Confirmed: 'good',
  'Not Scheduled': 'neutral',
  'For Review': 'warn',
  'Awaiting Construction Confirmation': 'info',
  Rescheduled: 'warn',
  Tentative: 'neutral',
};
const ASSIGN_TONE: Record<string, string> = { 'For Assignment': 'bad', 'For Confirmation': 'warn', Confirmed: 'good', Completed: 'done' };
const AVAIL_TONE: Record<string, string> = { Available: 'good', Pending: 'warn', Unavailable: 'bad', 'No upcoming shoots': 'neutral' };
const KIND_LABEL: Record<string, string> = { actual: 'Filmed', confirmed: 'Confirmed', target: 'Target', projected: 'Projected' };

const monthName = (key: string) => {
  const [y, m] = key.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
};
const when = (r?: { start: string; end: string }) => (r ? (r.start === r.end ? fmtDate(r.start) : fmtRange(r.start, r.end)) : AWAITING);
const initials = (name: string) =>
  name
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('') || '?';

export const Status: React.FC<{ s: ShootStatus }> = ({ s }) => <span className={`pc-st ${STATUS_TONE[s]}`}>{s}</span>;
export const LightDot: React.FC<{ e: Pick<PPEpisode, 'light' | 'lightReason'>; label?: boolean }> = ({ e, label }) => (
  <span className={`pa-light ${e.light}`} title={`${LIGHT[e.light].note}: ${e.lightReason}`}>
    <i style={{ background: LIGHT[e.light].color }} aria-hidden />
    {label && LIGHT[e.light].label}
    {!label && <span className="sr-only">{LIGHT[e.light].label}</span>}
  </span>
);
const ClassTag: React.FC<{ e: PPEpisode }> = ({ e }) => (
  <span className={`pa-class ${e.classification}`} title={e.classAuto ? 'Classified automatically from the scope of work — the production team can change it' : undefined}>
    {e.classification === 'time' ? <HardHat size={12} aria-hidden /> : <Film size={12} aria-hidden />}
    {CLASS_LABEL[e.classification]}
  </span>
);
const Avatar: React.FC<{ name: string; size?: number }> = ({ name, size = 34 }) => (
  <span className="pa-av" style={{ width: size, height: size, fontSize: size * 0.38 }} aria-hidden>
    {initials(name)}
  </span>
);
const Bar: React.FC<{ pct: number; tone?: string; label?: string }> = ({ pct, tone, label }) => (
  <span className={`pa-bar ${tone || ''}`} role="img" aria-label={label || `${pct}%`}>
    <i style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
  </span>
);

export interface PAActions {
  /** Internal only: open the production editor for an episode. */
  onManage?: (episodeId: string) => void;
}

// ===========================================================================
// Dashboard
// ===========================================================================
export const ProductionAlignment: React.FC<{ data: PortalProduction; actions?: PAActions; publishedNote?: string; compact?: boolean }> = ({ data, actions, publishedNote, compact }) => {
  const [open, setOpen] = useState<PPEpisode | null>(null);
  const [charFilter, setCharFilter] = useState('');
  const [present, setPresent] = useState(false);
  const months = useMemo(() => seriesMonths(data), [data]);
  const curMonth = data.today.slice(0, 7);
  const [planMonth, setPlanMonth] = useState(months.includes(curMonth) ? curMonth : months.find((m) => m >= curMonth) || months[0]);
  const k = useMemo(() => kpis(data), [data]);
  const track = useMemo(() => onTrack(data), [data]);
  const openId = (id: string) => setOpen(data.episodes.find((e) => e.id === id) || null);
  // keep the open episode in sync with live data
  useEffect(() => {
    if (open) setOpen(data.episodes.find((e) => e.id === open.id) || null);
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const filterChar = (id: string) => {
    setCharFilter(id);
    jump('pa-calendar');
  };

  if (!data.episodes.length)
    return (
      <div className="pa">
        <Header data={data} track={track} publishedNote={publishedNote} onPresent={() => setPresent(true)} onPrint={() => printMonthlySummary(data, planMonth)} />
        <p className="pc-empty">{AWAITING} — no episodes have been recorded yet.</p>
      </div>
    );

  return (
    <div className={`pa ${compact ? 'compact' : ''}`}>
      <Header data={data} track={track} publishedNote={publishedNote} onPresent={() => setPresent(true)} onPrint={() => printMonthlySummary(data, planMonth)} />

      <nav className="pa-jump" aria-label="Dashboard sections">
        {[
          ['pa-kpis', 'Overview'],
          ['pa-calendar', 'Calendar'],
          ['pa-align', 'Construction-to-Content'],
          ['pa-cast', 'Cast & Characters'],
          ['pa-team', 'Production Team'],
          ['pa-month', 'Monthly Planning'],
          ['pa-alerts', `Alerts${data.alerts.length ? ` (${data.alerts.length})` : ''}`],
        ].map(([id, l]) => (
          <button key={id} type="button" onClick={() => jump(id)}>
            {l}
          </button>
        ))}
      </nav>

      <Kpis data={data} k={k} />
      <AnswerStrip data={data} k={k} track={track} onOpen={openId} />
      <AlertsPanel data={data} onOpen={openId} />
      <MasterCalendar data={data} months={months} charFilter={charFilter} setCharFilter={setCharFilter} onOpen={setOpen} />
      <AlignmentSection data={data} onOpen={setOpen} compact={compact} />
      <CastSection data={data} onOpen={openId} onFilter={filterChar} compact={compact} />
      <TeamSection data={data} onOpen={openId} />
      <MonthlySection data={data} months={months} month={planMonth} setMonth={setPlanMonth} onOpen={openId} />

      {open && <EpisodePanel e={open} data={data} onClose={() => setOpen(null)} actions={actions} />}
      {present && <PresentationMode data={data} months={months} start={planMonth} onClose={() => setPresent(false)} onOpen={openId} />}
    </div>
  );
};

const Header: React.FC<{ data: PortalProduction; track: ReturnType<typeof onTrack>; publishedNote?: string; onPresent: () => void; onPrint: () => void }> = ({
  data,
  track,
  publishedNote,
  onPresent,
  onPrint,
}) => (
  <header className="pa-head">
    <div>
      <h1 className="pa-title">CONVENGERS PRODUCTION ALIGNMENT</h1>
      <p className="pa-sub">Connecting Construction Milestones, Educational Content, and Production Schedules.</p>
      <p className="pa-asof">
        <Clock size={13} aria-hidden /> {publishedNote || `Live data as of ${new Date(data.asOf).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}`}
      </p>
    </div>
    <div className="pa-head-r">
      <span className={`pa-track ${track.label === 'On Track' ? 'good' : track.label === 'At Risk' ? 'bad' : 'warn'}`} title={`${track.filmed} of ${track.due} shoots due by today filmed · ${track.risks} episodes need schedule attention`}>
        {track.label}
      </span>
      <button type="button" className="pa-btn" onClick={onPrint}>
        <Printer size={15} aria-hidden /> Print monthly summary
      </button>
      <button type="button" className="pa-btn primary" onClick={onPresent}>
        <Presentation size={15} aria-hidden /> Presentation mode
      </button>
    </div>
  </header>
);

// ---------------------------------------------------------------------------
// 1. KPI cards
// ---------------------------------------------------------------------------
const Kpis: React.FC<{ data: PortalProduction; k: ReturnType<typeof kpis> }> = ({ data, k }) => {
  const monthTotal = k.monthConfirmed + k.monthTentative;
  return (
    <section id="pa-kpis" className="pa-kpis" aria-label="Production overview">
      <article className="pa-kpi">
        <h3>
          <Clapperboard size={15} aria-hidden /> Total Episodes
        </h3>
        <b className="pa-big">{k.total}</b>
        <Bar pct={k.total ? (k.completed / k.total) * 100 : 0} tone="good" label={`${k.completed} of ${k.total} completed`} />
        <p>
          <span>
            <b>{k.completed}</b> completed
          </span>
          <span>
            <b>{k.upcoming}</b> upcoming
          </span>
        </p>
      </article>
      <article className="pa-kpi">
        <h3>
          <CalendarDays size={15} aria-hidden /> Upcoming Shoots · {MONTHS[Number(data.today.slice(5, 7)) - 1]}
        </h3>
        <b className="pa-big">{monthTotal}</b>
        <Bar pct={monthTotal ? (k.monthConfirmed / monthTotal) * 100 : 0} tone="info" label={`${k.monthConfirmed} confirmed of ${monthTotal}`} />
        <p>
          <span>
            <b>{k.monthConfirmed}</b> confirmed
          </span>
          <span>
            <b>{k.monthTentative}</b> tentative
          </span>
        </p>
      </article>
      <article className="pa-kpi">
        <h3>
          <HardHat size={15} aria-hidden /> Construction-Dependent
        </h3>
        <b className="pa-big">{k.timeSensitive}</b>
        <Bar pct={k.timeOpen ? (k.timeCoordination / k.timeOpen) * 100 : 0} tone="warn" label={`${k.timeCoordination} need coordination`} />
        <p>
          <span>
            <b>{k.timeOpen}</b> still to film
          </span>
          <span>
            <b>{k.timeCoordination}</b> need site coordination
          </span>
        </p>
      </article>
      <article className="pa-kpi">
        <h3>
          <Film size={15} aria-hidden /> Non-Time-Sensitive
        </h3>
        <b className="pa-big">{k.flexible}</b>
        <Bar pct={k.total ? (k.flexible / k.total) * 100 : 0} label={`${k.flexible} of ${k.total} episodes`} />
        <p>
          <span>
            <b>{k.flexibleOpen}</b> can be filmed anytime
          </span>
          <span>studio / indoor possible</span>
        </p>
      </article>
      <article className="pa-kpi">
        <h3>
          <ListChecks size={15} aria-hidden /> Production Readiness
        </h3>
        <b className="pa-big">
          {k.avgReadiness}
          <small>%</small>
        </b>
        <Bar pct={k.avgReadiness} tone="good" label={`Average readiness ${k.avgReadiness}%`} />
        <ul className="pa-kpi-l">
          <li>
            <CheckCircle2 size={13} aria-hidden /> <b>{k.ready}</b> ready for filming
          </li>
          <li>
            <Circle size={13} aria-hidden /> <b>{k.awaitingDirector}</b> awaiting director approval
          </li>
          <li>
            <Circle size={13} aria-hidden /> <b>{k.awaitingCast}</b> awaiting character availability
          </li>
          <li>
            <Circle size={13} aria-hidden /> <b>{k.awaitingMilestone}</b> awaiting construction confirmation
          </li>
        </ul>
      </article>
    </section>
  );
};

/** Answers to the key stakeholder questions, at a glance. */
const AnswerStrip: React.FC<{ data: PortalProduction; k: ReturnType<typeof kpis>; track: ReturnType<typeof onTrack>; onOpen: (id: string) => void }> = ({ data, k, track, onOpen }) => {
  const next = data.episodes
    .filter((e) => e.status !== 'Completed' && e.shown && e.shown.end >= data.today)
    .sort((a, b) => a.shown!.start.localeCompare(b.shown!.start))
    .slice(0, 4);
  const urgent = data.episodes.filter((e) => e.status !== 'Completed' && (e.light === 'red' || e.light === 'orange'));
  const counts = LIGHTS.map((l) => ({ ...l, n: data.episodes.filter((e) => e.light === l.id).length }));
  return (
    <section className="pa-card pa-answers" aria-label="At a glance">
      <div className="pa-ans">
        <h3>Next shoots</h3>
        {next.length ? (
          <ul>
            {next.map((e) => (
              <li key={e.id}>
                <button type="button" className="pc-link" onClick={() => onOpen(e.id)}>
                  <LightDot e={e} /> <b>{e.code}</b> {e.title}
                </button>
                <span className="pc-dim">
                  {when(e.shown)} · {KIND_LABEL[e.shown!.kind]}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="pc-dim">No upcoming shoot dates recorded.</p>
        )}
      </div>
      <div className="pa-ans">
        <h3>Needs immediate coordination</h3>
        {urgent.length ? (
          <ul>
            {urgent.slice(0, 4).map((e) => (
              <li key={e.id}>
                <button type="button" className="pc-link" onClick={() => onOpen(e.id)}>
                  <LightDot e={e} /> <b>{e.code}</b> {e.title}
                </button>
                <span className="pc-dim">{e.lightReason}</span>
              </li>
            ))}
            {urgent.length > 4 && <li className="pc-dim">+{urgent.length - 4} more in Alerts</li>}
          </ul>
        ) : (
          <p className="pc-dim">Nothing requires immediate coordination.</p>
        )}
      </div>
      <div className="pa-ans">
        <h3>Alignment status</h3>
        <div className="pa-lights">
          {counts.map((c) => (
            <span key={c.id} title={c.note}>
              <i style={{ background: c.color }} /> {c.label} <b>{c.n}</b>
            </span>
          ))}
        </div>
        <p className="pc-dim">
          {track.filmed} of {track.due} shoots due by today have been filmed. {k.ready} episode{k.ready === 1 ? ' is' : 's are'} ready for filming.
        </p>
      </div>
    </section>
  );
};

// ---------------------------------------------------------------------------
// 8. Alerts
// ---------------------------------------------------------------------------
const AlertsPanel: React.FC<{ data: PortalProduction; onOpen: (id: string) => void }> = ({ data, onOpen }) => {
  const [all, setAll] = useState(false);
  const [type, setType] = useState('');
  const list = data.alerts.filter((a) => !type || a.type === type);
  const shown = all ? list : list.slice(0, 5);
  const types = [...new Set(data.alerts.map((a) => a.type))];
  return (
    <section id="pa-alerts" className="pa-card" aria-label="Schedule alerts">
      <div className="pa-sec-h">
        <h2>
          <AlertTriangle size={18} aria-hidden /> Production Schedule Advisories
        </h2>
        {types.length > 1 && (
          <select className="pa-sel" value={type} onChange={(e) => setType(e.target.value)} aria-label="Filter alerts">
            <option value="">All alerts ({data.alerts.length})</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {ALERT_LABEL[t]} ({data.alerts.filter((a) => a.type === t).length})
              </option>
            ))}
          </select>
        )}
      </div>
      {shown.length ? (
        <ul className="pa-alerts">
          {shown.map((a) => (
            <li key={a.key} className={a.severity}>
              <div className="pa-al-h">
                <span className="pa-al-k">⚠️ {ALERT_LABEL[a.type]}</span>
                <span className={`pa-al-s ${a.severity}`}>Status: {a.status}</span>
              </div>
              <button type="button" className="pc-link pa-al-t" onClick={() => onOpen(a.episodeId)}>
                {a.episode}
              </button>
              <p>
                <b>Impact:</b> {a.impact}
              </p>
              <p>
                <b>Required action:</b> {a.action}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="pc-empty">No production advisories — every episode is aligned with the current construction schedule.</p>
      )}
      {list.length > 5 && (
        <button type="button" className="pa-btn sm" onClick={() => setAll(!all)}>
          {all ? 'Show fewer' : `Show all ${list.length} advisories`}
        </button>
      )}
    </section>
  );
};

// ---------------------------------------------------------------------------
// 2. Master Episode Production Calendar
// ---------------------------------------------------------------------------
const MasterCalendar: React.FC<{
  data: PortalProduction;
  months: string[];
  charFilter: string;
  setCharFilter: (id: string) => void;
  onOpen: (e: PPEpisode) => void;
}> = ({ data, months, charFilter, setCharFilter, onOpen }) => {
  const cur = data.today.slice(0, 7);
  const start = months.includes(cur) ? cur : months.find((m) => m >= cur) || months[0];
  const [anchor, setAnchor] = useState(`${start}-01`);
  const [view, setView] = useState<View>(() => {
    try {
      return (localStorage.getItem(VIEW_KEY) as View) || 'month';
    } catch {
      return 'month';
    }
  });
  const [cls, setCls] = useState('');
  const [showMs, setShowMs] = useState(true);
  const changeView = (v: View) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      // per-device convenience only
    }
  };
  const filtered: PortalProduction = useMemo(
    () => ({ ...data, episodes: data.episodes.filter((e) => (!cls || e.classification === cls) && (!charFilter || e.cast.some((c) => c.id === charFilter))) }),
    [data, cls, charFilter]
  );
  const step = (n: number) => {
    if (view === 'week') setAnchor(addDays(weekRange(anchor).start, 7 * n));
    else {
      const [y, m] = anchor.split('-').map(Number);
      const d = new Date(y, m - 1 + n, 1);
      setAnchor(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`);
    }
  };
  const years = [...new Set([...months.map((m) => m.slice(0, 4)), data.today.slice(0, 4)])].sort();
  const [y, m] = anchor.split('-');
  const title = view === 'week' ? fmtRange(weekRange(anchor).start, weekRange(anchor).end) : view === 'agenda' ? 'Full series agenda' : monthName(`${y}-${m}`);
  return (
    <section id="pa-calendar" className="pa-card" aria-label="Master episode production calendar">
      <div className="pa-sec-h">
        <h2>
          <CalendarDays size={18} aria-hidden /> Master Episode Production Calendar
        </h2>
        <div className="pc-views" role="tablist" aria-label="Calendar view">
          {(
            [
              ['month', 'Month'],
              ['week', 'Week'],
              ['agenda', 'Agenda'],
            ] as [View, string][]
          ).map(([v, l]) => (
            <button key={v} type="button" role="tab" aria-selected={view === v} className={view === v ? 'on' : ''} onClick={() => changeView(v)}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* continuous overview of the whole series */}
      <div className="pa-series" role="group" aria-label="Series months">
        {months.map((mk) => {
          const r = monthRange(`${mk}-01`);
          const eps = episodesInRange(filtered, r.start, r.end);
          const worst = eps.some((e) => e.light === 'red') ? 'red' : eps.some((e) => e.light === 'orange') ? 'orange' : eps.some((e) => e.light === 'yellow') ? 'yellow' : eps.length ? 'green' : 'gray';
          return (
            <button
              key={mk}
              type="button"
              className={`${anchor.startsWith(mk) && view !== 'agenda' ? 'on' : ''} ${mk === cur ? 'cur' : ''}`}
              onClick={() => {
                setAnchor(`${mk}-01`);
                if (view === 'agenda') changeView('month');
              }}
              aria-label={`${monthName(mk)}: ${eps.length} episodes`}
            >
              <span>{MONTHS[Number(mk.slice(5)) - 1].slice(0, 3)}</span>
              <small>{mk.slice(2, 4)}</small>
              <b>{eps.length}</b>
              <i style={{ background: LIGHT[worst as keyof typeof LIGHT].color }} />
            </button>
          );
        })}
      </div>

      <div className="pc-bar">
        {view !== 'agenda' ? (
          <div className="pc-nav">
            <button type="button" className="pc-ib" aria-label="Previous" onClick={() => step(-1)}>
              <ChevronLeft size={18} />
            </button>
            <button type="button" className="pc-today" onClick={() => setAnchor(view === 'week' ? data.today : `${cur}-01`)}>
              Today
            </button>
            <button type="button" className="pc-ib" aria-label="Next" onClick={() => step(1)}>
              <ChevronRight size={18} />
            </button>
            <h3 className="pc-title">{title}</h3>
          </div>
        ) : (
          <h3 className="pc-title">{title}</h3>
        )}
        <div className="pa-filters">
          {view === 'month' && (
            <>
              <select className="pa-sel" aria-label="Month" value={m} onChange={(e) => setAnchor(`${y}-${e.target.value}-01`)}>
                {MONTHS.map((n, i) => (
                  <option key={n} value={String(i + 1).padStart(2, '0')}>
                    {n}
                  </option>
                ))}
              </select>
              <select className="pa-sel" aria-label="Year" value={y} onChange={(e) => setAnchor(`${e.target.value}-${m}-01`)}>
                {years.map((yy) => (
                  <option key={yy}>{yy}</option>
                ))}
              </select>
            </>
          )}
          <select className="pa-sel" aria-label="Filter by character" value={charFilter} onChange={(e) => setCharFilter(e.target.value)}>
            <option value="">All characters</option>
            {data.characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select className="pa-sel" aria-label="Filter by classification" value={cls} onChange={(e) => setCls(e.target.value)}>
            <option value="">All episodes</option>
            <option value="time">Time-sensitive</option>
            <option value="flexible">Non-time-sensitive</option>
          </select>
          <label className="pa-chk">
            <input type="checkbox" checked={showMs} onChange={(e) => setShowMs(e.target.checked)} /> Construction milestones
          </label>
        </div>
      </div>
      <Legend />
      {charFilter && (
        <p className="pa-filter-note">
          Showing episodes with <b>{data.characters.find((c) => c.id === charFilter)?.name}</b>.{' '}
          <button type="button" className="pc-link" onClick={() => setCharFilter('')}>
            Clear filter
          </button>
        </p>
      )}

      {view === 'month' && <PAMonth data={filtered} anchor={anchor} showMs={showMs} onOpen={onOpen} />}
      {view === 'week' && <PAWeek data={filtered} anchor={anchor} showMs={showMs} onOpen={onOpen} />}
      {view === 'agenda' && <PAAgenda data={filtered} months={months} showMs={showMs} onOpen={onOpen} />}
    </section>
  );
};

const Legend: React.FC = () => (
  <div className="pa-legend" aria-label="Legend">
    {LIGHTS.map((l) => (
      <span key={l.id} title={l.note}>
        <i style={{ background: l.color }} /> {l.note}
      </span>
    ))}
    <span>
      <HardHat size={12} aria-hidden /> Time-sensitive
    </span>
    <span>
      <Film size={12} aria-hidden /> Non-time-sensitive
    </span>
    <span>
      <Diamond size={11} aria-hidden /> Construction milestone
    </span>
  </div>
);

const Chip: React.FC<{ e: PPEpisode; onOpen: (e: PPEpisode) => void }> = ({ e, onOpen }) => (
  <button
    type="button"
    className={`pa-chip ${e.shown?.kind === 'projected' ? 'proj' : ''} ${e.status === 'Completed' ? 'done' : ''}`}
    style={{ ['--c' as any]: LIGHT[e.light].color }}
    onClick={() => onOpen(e)}
    title={`${e.code} – ${e.title}\n${KIND_LABEL[e.shown?.kind || 'target']}: ${when(e.shown)}\n${CLASS_LABEL[e.classification]} · ${e.status}\nDirector: ${e.director || AWAITING}`}
  >
    {e.classification === 'time' ? <HardHat size={11} aria-hidden /> : <Film size={11} aria-hidden />}
    <b>{e.code}</b>
    <span>{e.title}</span>
  </button>
);

const MsChip: React.FC<{ m: PPMilestone }> = ({ m }) => (
  <span className={`pa-ms ${m.delayed ? 'late' : ''} ${m.status === 'Completed' ? 'done' : ''}`} title={`${m.name}\n${fmtRange(m.start, m.finish)} · ${m.status}${m.confirmed ? '' : ' · projected'}`}>
    <Diamond size={10} aria-hidden />
    <span>{m.name}</span>
  </span>
);

const PAMonth: React.FC<{ data: PortalProduction; anchor: string; showMs: boolean; onOpen: (e: PPEpisode) => void }> = ({ data, anchor, showMs, onOpen }) => {
  const weeks = monthGrid(anchor);
  const r = monthRange(anchor);
  const [day, setDay] = useState<string | null>(null);
  useEffect(() => setDay(null), [anchor]);
  const linked = useMemo(() => new Set(data.episodes.flatMap((e) => e.milestoneIds)), [data]);
  const msOn = (d: string) => (showMs ? data.milestones.filter((m) => (linked.has(m.id) || m.isMilestone) && m.start === d) : []);
  const dayEps = day ? episodesOn(data, day) : [];
  return (
    <>
      <div className="pc-month pa-month" role="grid" aria-label={monthName(anchor.slice(0, 7))}>
        {DOW.map((d) => (
          <div key={d} className="pc-dow" role="columnheader">
            {d}
          </div>
        ))}
        {weeks.flat().map((d) => {
          const eps = episodesOn(data, d);
          const ms = msOn(d);
          const out = d < r.start || d > r.end;
          return (
            <div key={d} role="gridcell" className={`pc-day ${out ? 'out' : ''} ${d === data.today ? 'today' : ''} ${day === d ? 'sel' : ''}`}>
              <button type="button" className="pc-dn" aria-label={`${fmtDate(d)}: ${eps.length} episodes`} onClick={() => setDay(day === d ? null : d)}>
                {Number(d.slice(8))}
              </button>
              <div className="pc-evs">
                {eps.slice(0, 3).map((e) => (
                  <Chip key={e.id} e={e} onOpen={onOpen} />
                ))}
                {eps.length > 3 && (
                  <button type="button" className="pc-more" onClick={() => setDay(d)}>
                    +{eps.length - 3} more
                  </button>
                )}
                {ms.slice(0, 2).map((m) => (
                  <MsChip key={m.id} m={m} />
                ))}
              </div>
              {(eps.length > 0 || ms.length > 0) && (
                <span className="pc-dots" aria-hidden>
                  {eps.slice(0, 4).map((e) => (
                    <i key={e.id} style={{ background: LIGHT[e.light].color }} />
                  ))}
                  {ms.length > 0 && <i className="pa-dot-ms" />}
                </span>
              )}
            </div>
          );
        })}
      </div>
      {day && (
        <div className="pc-dayl">
          <h3>{new Date(`${day}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</h3>
          {dayEps.length ? (
            <div className="pa-cards">
              {dayEps.map((e) => (
                <EpisodeCard key={e.id} e={e} data={data} onOpen={onOpen} />
              ))}
            </div>
          ) : (
            <p className="pc-empty">No shoots on this day.</p>
          )}
          {msOn(day).map((m) => (
            <p key={m.id} className="pa-ms-line">
              <Diamond size={12} aria-hidden /> <b>{m.name}</b> starts · {fmtRange(m.start, m.finish)} · {m.status}
            </p>
          ))}
        </div>
      )}
    </>
  );
};

const PAWeek: React.FC<{ data: PortalProduction; anchor: string; showMs: boolean; onOpen: (e: PPEpisode) => void }> = ({ data, anchor, showMs, onOpen }) => {
  const w = weekRange(anchor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(w.start, i));
  const linked = new Set(data.episodes.flatMap((e) => e.milestoneIds));
  return (
    <div className="pa-week">
      {days.map((d) => {
        const eps = episodesOn(data, d);
        const ms = showMs ? data.milestones.filter((m) => (linked.has(m.id) || m.isMilestone) && (m.actualStart || m.start)! <= d && (m.actualFinish || m.finish || m.start)! >= d) : [];
        return (
          <div key={d} className={`pa-wd ${d === data.today ? 'today' : ''}`}>
            <h4>
              {DOW[(new Date(`${d}T00:00:00`).getDay() + 6) % 7]} <b>{Number(d.slice(8))}</b>
            </h4>
            {eps.map((e) => (
              <EpisodeCard key={e.id} e={e} data={data} onOpen={onOpen} small />
            ))}
            {ms.map((m) => (
              <MsChip key={m.id} m={m} />
            ))}
            {!eps.length && !ms.length && <span className="pc-dim pa-none">—</span>}
          </div>
        );
      })}
    </div>
  );
};

const PAAgenda: React.FC<{ data: PortalProduction; months: string[]; showMs: boolean; onOpen: (e: PPEpisode) => void }> = ({ data, months, showMs, onOpen }) => {
  const unscheduled = data.episodes.filter((e) => !e.shown);
  return (
    <div className="pa-agenda">
      {months.map((mk) => {
        const r = monthRange(`${mk}-01`);
        const eps = episodesInRange(data, r.start, r.end)
          .filter((e) => e.shown!.start >= r.start || mk === months[0] || e.shown!.start < `${months[0]}-01`)
          .sort((a, b) => a.shown!.start.localeCompare(b.shown!.start));
        const starting = eps.filter((e) => e.shown!.start >= r.start);
        const ms = showMs ? data.milestones.filter((m) => m.start && m.start >= r.start && m.start <= r.end && (m.isMilestone || data.episodes.some((e) => e.milestoneIds.includes(m.id)))) : [];
        return (
          <section key={mk} className="pa-ag-m" aria-label={monthName(mk)}>
            <h3>
              {monthName(mk)} <span className="pc-dim">· {starting.length} shoot{starting.length === 1 ? '' : 's'}</span>
            </h3>
            {ms.length > 0 && (
              <div className="pa-ag-ms">
                {ms.map((m) => (
                  <MsChip key={m.id} m={m} />
                ))}
              </div>
            )}
            {starting.length ? (
              <div className="pa-cards">
                {starting.map((e) => (
                  <EpisodeCard key={e.id} e={e} data={data} onOpen={onOpen} />
                ))}
              </div>
            ) : (
              <p className="pc-dim">No shoots starting this month.</p>
            )}
          </section>
        );
      })}
      {unscheduled.length > 0 && (
        <section className="pa-ag-m">
          <h3>Not yet scheduled</h3>
          <div className="pa-cards">
            {unscheduled.map((e) => (
              <EpisodeCard key={e.id} e={e} data={data} onOpen={onOpen} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

/** Calendar event card — every required field. */
export const EpisodeCard: React.FC<{ e: PPEpisode; data: PortalProduction; onOpen: (e: PPEpisode) => void; small?: boolean }> = ({ e, data, onOpen, small }) => {
  const ms = e.milestoneIds.map((id) => data.milestones.find((m) => m.id === id)?.name).filter(Boolean) as string[];
  const cast = e.cast.map((c) => c.name);
  return (
    <button type="button" className={`pa-ecard ${small ? 'small' : ''}`} style={{ ['--c' as any]: LIGHT[e.light].color }} onClick={() => onOpen(e)}>
      <span className="pa-ec-top">
        <b className="pa-ec-no">{e.code}</b>
        <Status s={e.status} />
        <LightDot e={e} />
      </span>
      <span className="pa-ec-title">{e.title}</span>
      <span className="pa-ec-row">
        <CalendarDays size={12} aria-hidden /> {KIND_LABEL[e.shown?.kind || 'target']}: {when(e.shown)}
      </span>
      {!small && (
        <>
          <span className="pa-ec-row">
            <ClassTag e={e} /> <span className="pc-dim">{e.category}</span>
          </span>
          <span className="pa-ec-row">
            <Users size={12} aria-hidden /> {cast.length ? `${cast.slice(0, 4).join(', ')}${cast.length > 4 ? ` +${cast.length - 4}` : ''}` : AWAITING}
          </span>
          <span className="pa-ec-row">
            <Clapperboard size={12} aria-hidden /> Director: {e.director || AWAITING}
          </span>
          <span className="pa-ec-row">
            <HardHat size={12} aria-hidden /> {ms.length ? ms.join('; ') : e.classification === 'time' ? AWAITING : 'No construction milestone required'}
          </span>
        </>
      )}
    </button>
  );
};

// ---------------------------------------------------------------------------
// 4. Construction-to-content alignment (dual synchronized timelines)
// ---------------------------------------------------------------------------
interface Lane<T> {
  item: T;
  x: number;
  w: number;
  row: number;
}
/** Greedy lane packing: a bar plus its label (drawn to the right) must not overlap the next item. */
function pack<T>(items: { item: T; x: number; w: number; label: string }[]): Lane<T>[] {
  const ends: number[] = [];
  return items
    .sort((a, b) => a.x - b.x)
    .map((it) => {
      const span = it.w + 10 + it.label.length * 6.4;
      let row = ends.findIndex((e) => e <= it.x - 6);
      if (row < 0) {
        row = ends.length;
        ends.push(0);
      }
      ends[row] = it.x + span;
      return { ...it, row };
    });
}

const AlignmentSection: React.FC<{ data: PortalProduction; onOpen: (e: PPEpisode) => void; compact?: boolean }> = ({ data, onOpen, compact }) => {
  const [all, setAll] = useState(false);
  const [focus, setFocus] = useState<string | null>(null);
  const linkedIds = useMemo(() => new Set(data.episodes.flatMap((e) => e.milestoneIds)), [data]);
  const ms = data.milestones.filter((m) => (all ? true : linkedIds.has(m.id) || m.isMilestone) && (m.start || m.actualStart));
  return (
    <section id="pa-align" className="pa-card" aria-label="Construction to content alignment">
      <div className="pa-sec-h">
        <h2>
          <Link2 size={18} aria-hidden /> Construction-to-Content Alignment
        </h2>
        <label className="pa-chk">
          <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Show all construction activities
        </label>
      </div>
      <p className="pc-dim pa-note">
        Top: construction milestones (projected dates unless started). Bottom: CONVENGERS educational episodes. Lines connect each episode to the construction activity it documents. When a
        construction date moves, the linked episodes are flagged for review — shoot dates are never moved automatically.
      </p>
      <div className="pa-desk-only">
        <DualTimeline data={data} ms={ms} onOpen={onOpen} focus={focus} setFocus={setFocus} />
      </div>
      <div className={compact ? '' : 'pa-phone-only'}>
        <AlignmentList data={data} ms={ms} onOpen={onOpen} />
      </div>
    </section>
  );
};

const DualTimeline: React.FC<{ data: PortalProduction; ms: PPMilestone[]; onOpen: (e: PPEpisode) => void; focus: string | null; setFocus: (id: string | null) => void }> = ({
  data,
  ms,
  onOpen,
  focus,
  setFocus,
}) => {
  const months = seriesMonths(data);
  const start = `${months[0]}-01`;
  const end = monthRange(`${months[months.length - 1]}-01`).end;
  const DAY = 7;
  const width = (diffDays(start, end) + 1) * DAY;
  const x = (d: string) => Math.max(0, Math.min(width, diffDays(start, d) * DAY));
  const ROW = 26;
  const msLanes = pack(
    ms.map((m) => {
      const s = m.actualStart || m.start!;
      const f = m.actualFinish || m.finish || s;
      return { item: m, x: x(s), w: Math.max(DAY, x(f) - x(s) + DAY), label: m.name };
    })
  );
  const eps = data.episodes.filter((e) => e.shown || e.projected);
  const epLanes = pack(
    eps.map((e) => {
      const r = e.shown || { start: e.projected!.start, end: e.projected!.end };
      return { item: e, x: x(r.start), w: Math.max(DAY, x(r.end) - x(r.start) + DAY), label: `${e.code} ${e.title}` };
    })
  );
  const msRows = Math.max(1, ...msLanes.map((l) => l.row + 1));
  const epRows = Math.max(1, ...epLanes.map((l) => l.row + 1));
  const GAP = 56;
  const topH = msRows * ROW + 8;
  const H = 24 + topH + GAP + epRows * ROW + 8;
  const epTop = 24 + topH + GAP;
  const msPos = new Map(msLanes.map((l) => [l.item.id, l]));
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // open on the current month
    const el = scroller.current;
    if (el) el.scrollLeft = Math.max(0, x(data.today) - 160);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const dependents = focus ? new Set(data.episodes.filter((e) => e.milestoneIds.includes(focus) || e.id === focus).map((e) => e.id)) : null;
  return (
    <div className="pa-tl-wrap" ref={scroller}>
      <div className="pa-tl" style={{ width, height: H }}>
        {months.map((mk) => (
          <div key={mk} className="pa-tl-m" style={{ left: x(`${mk}-01`) }}>
            {MONTHS[Number(mk.slice(5)) - 1].slice(0, 3)} {mk.slice(0, 4)}
          </div>
        ))}
        <div className="pa-tl-today" style={{ left: x(data.today) }} title={`Today, ${fmtDate(data.today)}`} />
        <div className="pa-tl-lab" style={{ top: 22 }}>
          CONSTRUCTION MILESTONES
        </div>
        <div className="pa-tl-lab" style={{ top: epTop - 18 }}>
          CONVENGERS EDUCATIONAL EPISODES
        </div>
        <svg className="pa-tl-svg" width={width} height={H} aria-hidden>
          {epLanes.flatMap((l) =>
            l.item.milestoneIds.map((id) => {
              const m = msPos.get(id);
              if (!m) return null;
              const x1 = l.x + Math.min(l.w, 40) / 2;
              const y1 = epTop + l.row * ROW;
              const x2 = m.x + Math.min(m.w, 40) / 2;
              const y2 = 24 + 4 + m.row * ROW + 18;
              const dim = dependents && !dependents.has(l.item.id);
              return (
                <path
                  key={`${l.item.id}-${id}`}
                  d={`M${x1},${y1} C${x1},${(y1 + y2) / 2} ${x2},${(y1 + y2) / 2} ${x2},${y2}`}
                  stroke={LIGHT[l.item.light].color}
                  strokeWidth={dim ? 1 : 1.6}
                  strokeOpacity={dim ? 0.15 : 0.75}
                  fill="none"
                  strokeDasharray={l.item.linkAuto ? '4 3' : undefined}
                />
              );
            })
          )}
        </svg>
        {msLanes.map((l) => {
          const m = l.item;
          const dim = focus && !data.episodes.some((e) => e.milestoneIds.includes(m.id) && (e.id === focus || focus === m.id)) && focus !== m.id;
          return (
            <button
              key={m.id}
              type="button"
              className={`pa-tl-ms ${m.delayed ? 'late' : ''} ${m.status === 'Completed' ? 'done' : ''} ${m.confirmed ? '' : 'proj'} ${dim ? 'dim' : ''}`}
              style={{ left: l.x, top: 24 + 4 + l.row * ROW, width: l.w }}
              onClick={() => setFocus(focus === m.id ? null : m.id)}
              title={`${m.name}\n${fmtRange(m.actualStart || m.start, m.actualFinish || m.finish)} · ${m.status}${m.confirmed ? '' : ' · projected'}${m.delayed ? ' · DELAYED' : ''}`}
            >
              <span>{m.name}</span>
            </button>
          );
        })}
        {epLanes.map((l) => {
          const e = l.item;
          const dim = dependents && !dependents.has(e.id);
          return (
            <button
              key={e.id}
              type="button"
              className={`pa-tl-ep ${e.shown?.kind === 'projected' || !e.shown ? 'proj' : ''} ${dim ? 'dim' : ''}`}
              style={{ left: l.x, top: epTop + l.row * ROW, width: l.w, ['--c' as any]: LIGHT[e.light].color }}
              onClick={() => onOpen(e)}
              onMouseEnter={() => setFocus(e.id)}
              onMouseLeave={() => setFocus(null)}
              title={`${e.code} – ${e.title}\n${KIND_LABEL[e.shown?.kind || 'projected']}: ${when(e.shown || e.projected)}\n${LIGHT[e.light].note}: ${e.lightReason}`}
            >
              <span>
                <b>{e.code}</b> {e.title}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

/** Phone / compact version: each construction milestone with the episodes that document it. */
const AlignmentList: React.FC<{ data: PortalProduction; ms: PPMilestone[]; onOpen: (e: PPEpisode) => void }> = ({ data, ms, onOpen }) => {
  const rows = ms
    .map((m) => ({ m, eps: data.episodes.filter((e) => e.milestoneIds.includes(m.id)) }))
    .filter((r) => r.eps.length || r.m.isMilestone)
    .sort((a, b) => (a.m.start || '').localeCompare(b.m.start || ''));
  const flexible = data.episodes.filter((e) => !e.milestoneIds.length);
  return (
    <ol className="pa-al-list">
      {rows.map(({ m, eps }) => (
        <li key={m.id} className={m.delayed ? 'late' : m.status === 'Completed' ? 'done' : ''}>
          <div className="pa-al-ms">
            <Diamond size={13} aria-hidden />
            <div>
              <b>{m.name}</b>
              <span className="pc-dim">
                {fmtRange(m.actualStart || m.start, m.actualFinish || m.finish)} · {m.delayed ? 'Delayed' : m.status}
                {m.confirmed ? '' : ' · projected'}
              </span>
            </div>
          </div>
          {eps.length > 0 && (
            <div className="pa-al-eps">
              {eps.map((e) => (
                <Chip key={e.id} e={e} onOpen={onOpen} />
              ))}
            </div>
          )}
        </li>
      ))}
      {flexible.length > 0 && (
        <li>
          <div className="pa-al-ms">
            <Film size={13} aria-hidden />
            <div>
              <b>Not tied to construction</b>
              <span className="pc-dim">Can be filmed in advance or in a studio</span>
            </div>
          </div>
          <div className="pa-al-eps">
            {flexible.map((e) => (
              <Chip key={e.id} e={e} onOpen={onOpen} />
            ))}
          </div>
        </li>
      )}
    </ol>
  );
};

// ---------------------------------------------------------------------------
// 5. Cast & character alignment
// ---------------------------------------------------------------------------
const CastSection: React.FC<{ data: PortalProduction; onOpen: (id: string) => void; onFilter: (id: string) => void; compact?: boolean }> = ({ data, onOpen, onFilter, compact }) => {
  const profiles = useMemo(() => characterProfiles(data), [data]);
  const [who, setWho] = useState('');
  const [past, setPast] = useState(false);
  const rows = useMemo(() => castMatrix(data, !past).filter((r) => !who || r.charId === who), [data, who, past]);
  const [more, setMore] = useState(false);
  const visible = more ? rows : rows.slice(0, 25);
  return (
    <section id="pa-cast" className="pa-card" aria-label="Cast and character alignment">
      <div className="pa-sec-h">
        <h2>
          <Users size={18} aria-hidden /> CONVENGERS Cast & Character Alignment
        </h2>
      </div>
      {profiles.length ? (
        <div className="pa-people">
          {profiles.map((p) => (
            <article key={p.id} className={`pa-person ${who === p.id ? 'on' : ''}`}>
              <div className="pa-person-h">
                <Avatar name={p.name} />
                <div>
                  <b>{p.name}</b>
                  <span className="pc-dim">{p.roles.length ? p.roles.join(', ') : 'Role: ' + AWAITING}</span>
                </div>
              </div>
              <div className="pa-person-m">
                <span>
                  <b>{p.episodes.length}</b> episode{p.episodes.length === 1 ? '' : 's'}
                </span>
                <span className={`pc-st ${AVAIL_TONE[p.availability]}`}>{p.availability}</span>
              </div>
              <p className="pa-person-n">{p.upcoming[0] ? `Next filming: ${when(p.upcoming[0].when)} (${p.upcoming[0].code})` : 'No upcoming filming dates'}</p>
              <div className="pa-person-a">
                <button type="button" className="pa-btn sm" onClick={() => setWho(who === p.id ? '' : p.id)} aria-pressed={who === p.id}>
                  {who === p.id ? 'Show everyone' : 'Assignments'}
                </button>
                <button type="button" className="pa-btn sm ghost" onClick={() => onFilter(p.id)}>
                  Calendar
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="pc-empty">{AWAITING} — no characters are assigned to episodes yet.</p>
      )}

      <div className="pa-sec-h pa-sub-h">
        <h3>Character availability matrix</h3>
        <div className="pa-filters">
          <select className="pa-sel" aria-label="Character" value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="">All characters</option>
            {data.characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <label className="pa-chk">
            <input type="checkbox" checked={past} onChange={(e) => setPast(e.target.checked)} /> Include completed
          </label>
        </div>
      </div>
      {rows.length ? (
        <>
          <div className={`pa-tablewrap ${compact ? 'pa-hide' : ''}`}>
            <table className="pa-table">
              <thead>
                <tr>
                  <th>Character</th>
                  <th>Episode</th>
                  <th>Target shoot</th>
                  <th>Availability</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={`${r.charId}-${r.episodeId}`}>
                    <td>
                      <span className="pa-who">
                        <Avatar name={r.character} size={24} /> {r.character}
                        {r.role && <span className="pc-dim"> · {r.role}</span>}
                      </span>
                    </td>
                    <td>
                      <button type="button" className="pc-link" onClick={() => onOpen(r.episodeId)}>
                        {r.episode}
                      </button>
                    </td>
                    <td>
                      {when(r.when)}
                      {r.whenKind && <span className="pc-dim"> · {KIND_LABEL[r.whenKind]}</span>}
                    </td>
                    <td>
                      <span className={`pc-st ${AVAIL_TONE[r.availability]}`}>{r.availability}</span>
                    </td>
                    <td>{r.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className={`pa-mcards ${compact ? 'show' : ''}`}>
            {visible.map((r) => (
              <li key={`${r.charId}-${r.episodeId}`}>
                <span className="pa-who">
                  <Avatar name={r.character} size={26} /> <b>{r.character}</b>
                </span>
                <button type="button" className="pc-link" onClick={() => onOpen(r.episodeId)}>
                  {r.episode}
                </button>
                <span className="pc-dim">{when(r.when)}</span>
                <span>
                  <span className={`pc-st ${AVAIL_TONE[r.availability]}`}>{r.availability}</span> {r.status}
                </span>
              </li>
            ))}
          </ul>
          {rows.length > 25 && (
            <button type="button" className="pa-btn sm" onClick={() => setMore(!more)}>
              {more ? 'Show fewer' : `Show all ${rows.length} assignments`}
            </button>
          )}
        </>
      ) : (
        <p className="pc-empty">No character assignments to show.</p>
      )}
    </section>
  );
};

// ---------------------------------------------------------------------------
// 6. Production team alignment
// ---------------------------------------------------------------------------
const TeamSection: React.FC<{ data: PortalProduction; onOpen: (id: string) => void }> = ({ data, onOpen }) => {
  const t = useMemo(() => teamOverview(data), [data]);
  const EpList: React.FC<{ list: PPEpisode[]; empty: string }> = ({ list, empty }) =>
    list.length ? (
      <ul className="pa-elist">
        {list.slice(0, 6).map((e) => (
          <li key={e.id}>
            <button type="button" className="pc-link" onClick={() => onOpen(e.id)}>
              <LightDot e={e} /> <b>{e.code}</b> {e.title}
            </button>
            <span className="pc-dim">{when(e.shown)}</span>
          </li>
        ))}
        {list.length > 6 && <li className="pc-dim">+{list.length - 6} more</li>}
      </ul>
    ) : (
      <p className="pc-dim">{empty}</p>
    );
  const open = data.episodes.filter((e) => e.status !== 'Completed');
  return (
    <section id="pa-team" className="pa-card" aria-label="Production team alignment">
      <div className="pa-sec-h">
        <h2>
          <Clapperboard size={18} aria-hidden /> Production Team Alignment
        </h2>
      </div>
      <div className="pa-q">
        <article>
          <h3>
            <span>1</span> Who is involved in upcoming shoots?
          </h3>
          {t.upcoming.length ? (
            <ul className="pa-elist">
              {t.upcoming.slice(0, 4).map(({ episode: e, people }) => (
                <li key={e.id}>
                  <button type="button" className="pc-link" onClick={() => onOpen(e.id)}>
                    <b>{e.code}</b> {e.title}
                  </button>
                  <span className="pc-dim">{when(e.shown)}</span>
                  <span className="pa-people-s">
                    {people.slice(0, 8).map((p) => (
                      <span key={p.role + p.name} className={p.confirmed ? 'ok' : ''} title={`${p.role}${p.confirmed ? ' · confirmed' : ' · to confirm'}`}>
                        {p.confirmed ? <CheckCircle2 size={11} aria-hidden /> : <Circle size={11} aria-hidden />} {p.name}
                      </span>
                    ))}
                    {people.length > 8 && <span>+{people.length - 8}</span>}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="pc-dim">No shoots in the next 30 days.</p>
          )}
        </article>
        <article>
          <h3>
            <span>2</span> Who still needs to confirm?
          </h3>
          {t.toConfirm.length ? (
            <ul className="pa-elist">
              {t.toConfirm.slice(0, 8).map((p, i) => (
                <li key={i}>
                  <b>{p.name}</b> <span className="pc-dim">· {p.role}</span>
                  <button type="button" className="pc-link pc-dim" onClick={() => onOpen(p.episode.id)}>
                    {p.episode.code}
                  </button>
                </li>
              ))}
              {t.toConfirm.length > 8 && <li className="pc-dim">+{t.toConfirm.length - 8} more</li>}
            </ul>
          ) : (
            <p className="pc-dim">Everyone for the next 30 days has confirmed.</p>
          )}
        </article>
        <article>
          <h3>
            <span>3</span> Awaiting director approval
          </h3>
          <EpList list={t.awaitingDirector} empty="No shoot dates are waiting for approval." />
        </article>
        <article>
          <h3>
            <span>4</span> Requires construction team coordination
          </h3>
          <EpList list={t.constructionCoordination} empty="No construction-dependent shoots ahead." />
        </article>
        <article>
          <h3>
            <span>5</span> Ready for execution
          </h3>
          <EpList list={t.ready} empty="No episode has completed all pre-shoot requirements yet." />
        </article>
      </div>

      <h3 className="pa-h3">Episode progress tracker</h3>
      <ol className="pa-track-l">
        {open.map((e) => (
          <li key={e.id}>
            <button type="button" onClick={() => onOpen(e.id)}>
              <LightDot e={e} />
              <b>{e.code}</b>
              <span className="pa-tr-t">{e.title}</span>
              <Bar pct={e.readiness.pct} tone={e.readiness.ready ? 'good' : e.readiness.pct >= 50 ? 'info' : 'warn'} label={`Readiness ${e.readiness.pct}%`} />
              <span className="pa-tr-p">{e.readiness.pct}%</span>
              <span className={`pc-st ${ASSIGN_TONE[e.assignment]}`}>{e.assignment}</span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
};

// ---------------------------------------------------------------------------
// 7. Monthly production planning
// ---------------------------------------------------------------------------
export function monthSummaryText(p: MonthPlan): string {
  const parts: string[] = [];
  parts.push(
    `${monthName(p.key)}: ${p.shoots.length} shoot${p.shoots.length === 1 ? '' : 's'} on the calendar (${p.confirmed.length} confirmed, ${p.pending.length} pending${p.completed.length ? `, ${p.completed.length} completed` : ''}).`
  );
  parts.push(`${p.time.length} depend on construction progress and ${p.flexible.length} can be filmed independently.`);
  if (p.construction.length) parts.push(`${p.construction.length} construction milestone${p.construction.length === 1 ? '' : 's'} to anticipate.`);
  parts.push(`${p.ready.length} ready for filming; ${p.reschedule.length} need${p.reschedule.length === 1 ? 's' : ''} schedule adjustment.`);
  if (p.characters.length) parts.push(`${p.characters.length} character${p.characters.length === 1 ? '' : 's'} required; ${p.pendingAvailability} availability confirmation${p.pendingAvailability === 1 ? '' : 's'} pending.`);
  if (p.conflicts.length) parts.push(`${p.conflicts.length} schedule conflict${p.conflicts.length === 1 ? '' : 's'} to resolve.`);
  return parts.join(' ');
}

const MonthlySection: React.FC<{ data: PortalProduction; months: string[]; month: string; setMonth: (m: string) => void; onOpen: (id: string) => void }> = ({
  data,
  months,
  month,
  setMonth,
  onOpen,
}) => {
  const p = useMemo(() => monthPlan(data, month), [data, month]);
  const idx = months.indexOf(month);
  const windows = useMemo(() => productionWindows(data, 60), [data]);
  const L: React.FC<{ list: PPEpisode[]; empty: string }> = ({ list, empty }) =>
    list.length ? (
      <ul className="pa-elist">
        {list.map((e) => (
          <li key={e.id}>
            <button type="button" className="pc-link" onClick={() => onOpen(e.id)}>
              <LightDot e={e} /> <b>{e.code}</b> {e.title}
            </button>
            <span className="pc-dim">
              {when(e.shown)} · {e.confirmed ? 'Confirmed' : 'Pending'}
            </span>
          </li>
        ))}
      </ul>
    ) : (
      <p className="pc-dim">{empty}</p>
    );
  return (
    <section id="pa-month" className="pa-card" aria-label="Monthly production planning">
      <div className="pa-sec-h">
        <h2>
          <CalendarDays size={18} aria-hidden /> Monthly Production Planning
        </h2>
        <div className="pc-nav">
          <button type="button" className="pc-ib" aria-label="Previous month" disabled={idx <= 0} onClick={() => setMonth(months[idx - 1])}>
            <ChevronLeft size={18} />
          </button>
          <select className="pa-sel" aria-label="Planning month" value={month} onChange={(e) => setMonth(e.target.value)}>
            {months.map((mk) => (
              <option key={mk} value={mk}>
                {monthName(mk)}
              </option>
            ))}
          </select>
          <button type="button" className="pc-ib" aria-label="Next month" disabled={idx >= months.length - 1} onClick={() => setMonth(months[idx + 1])}>
            <ChevronRight size={18} />
          </button>
          <button type="button" className="pa-btn sm" onClick={() => printMonthlySummary(data, month)}>
            <Printer size={14} aria-hidden /> Print
          </button>
        </div>
      </div>
      <p className="pa-summary">{monthSummaryText(p)}</p>
      <div className="pa-month-grid">
        <article>
          <h3>A · Construction Milestones</h3>
          {p.construction.length ? (
            <ul className="pa-elist">
              {p.construction.map((m) => (
                <li key={m.id}>
                  <b>{m.name}</b>
                  <span className="pc-dim">
                    Target {fmtRange(m.start, m.finish)}
                    {m.baselineFinish && m.baselineFinish !== m.finish ? ` · originally ${fmtDate(m.baselineFinish)}` : ''}
                    {m.actualFinish ? ` · completed ${fmtDate(m.actualFinish)}` : m.actualStart ? ` · started ${fmtDate(m.actualStart)}` : ''} · {m.delayed ? 'Delayed' : m.status}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="pc-dim">No linked construction milestones this month.</p>
          )}
        </article>
        <article>
          <h3>B · Educational Shoot Targets</h3>
          <div className="pa-nums">
            <span>
              <b>{p.shoots.length}</b> planned
            </span>
            <span>
              <b>{p.confirmed.length}</b> confirmed
            </span>
            <span>
              <b>{p.pending.length}</b> pending
            </span>
            <span>
              <b>{p.completed.length}</b> filmed
            </span>
          </div>
          <L list={p.shoots} empty="No shoots this month." />
        </article>
        <article>
          <h3>C · Production Alignment</h3>
          <div className="pa-nums">
            <span>
              <b>{p.time.length}</b> time-sensitive
            </span>
            <span>
              <b>{p.flexible.length}</b> flexible
            </span>
            <span>
              <b>{p.ready.length}</b> ready
            </span>
            <span>
              <b>{p.reschedule.length}</b> to reschedule
            </span>
          </div>
          <L list={p.reschedule} empty="No episodes require rescheduling." />
          {windows.length > 0 && (
            <>
              <h4>Available production windows (next 60 days)</h4>
              <p className="pc-dim">Days with no construction-dependent filming — suitable for batching non-time-sensitive episodes.</p>
              <ul className="pa-win">
                {windows.slice(0, 6).map((w) => (
                  <li key={w.start}>
                    <b>{fmtRange(w.start, w.end)}</b> · {w.days} days{w.note ? ` · ${w.note}` : ''}
                  </li>
                ))}
              </ul>
            </>
          )}
        </article>
        <article>
          <h3>D · Character Involvement</h3>
          <div className="pa-nums">
            <span>
              <b>{p.characters.length}</b> characters
            </span>
            <span>
              <b>{p.pendingAvailability}</b> pending confirmations
            </span>
          </div>
          {p.characters.length ? (
            <ul className="pa-chars">
              {p.characters.map((c) => (
                <li key={c.name}>
                  <Avatar name={c.name} size={22} /> <span>{c.name}</span>
                  <b>
                    {c.days} filming day{c.days === 1 ? '' : 's'}
                  </b>
                  {c.pending > 0 && <span className="pc-st warn">{c.pending} pending</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="pc-dim">No characters required this month.</p>
          )}
        </article>
        <article className="pa-wide">
          <h3>E · Director's Monthly View</h3>
          <div className="pa-dir">
            <div>
              <h4>Production priorities</h4>
              <L list={p.priorities.slice(0, 6)} empty="All episodes this month are aligned." />
            </div>
            <div>
              <h4>Upcoming shoot deadlines</h4>
              {p.deadlines.length ? (
                <ul className="pa-elist">
                  {p.deadlines.slice(0, 6).map((d) => (
                    <li key={d.episode.id}>
                      <b>{fmtDate(d.date)}</b> — {d.episode.code} {d.episode.title}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="pc-dim">No shoot deadlines this month.</p>
              )}
            </div>
            <div>
              <h4>Episodes requiring creative direction</h4>
              <L list={p.creative} empty="Scripts and talking points are ready." />
            </div>
            <div>
              <h4>Schedule conflicts</h4>
              {p.conflicts.length ? (
                <ul className="pa-elist">
                  {p.conflicts.slice(0, 6).map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                  {p.conflicts.length > 6 && <li className="pc-dim">+{p.conflicts.length - 6} more</li>}
                </ul>
              ) : (
                <p className="pc-dim">No schedule conflicts.</p>
              )}
            </div>
          </div>
        </article>
      </div>
    </section>
  );
};

// ---------------------------------------------------------------------------
// 9. Episode detail view
// ---------------------------------------------------------------------------
export const EpisodePanel: React.FC<{ e: PPEpisode; data: PortalProduction; onClose: () => void; actions?: PAActions }> = ({ e, data, onClose, actions }) => {
  useEffect(() => {
    const k = (ev: KeyboardEvent) => ev.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', k);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  const ms = e.milestoneIds.map((id) => data.milestones.find((m) => m.id === id)).filter((m): m is PPMilestone => !!m);
  const R = 30;
  const C = 2 * Math.PI * R;
  return (
    <div className="pc-mbg" onMouseDown={(ev) => ev.target === ev.currentTarget && onClose()}>
      <div className="pc-modal pa-panel" role="dialog" aria-modal="true" aria-label={`${e.code} – ${e.title}`} style={{ ['--c' as any]: LIGHT[e.light].color }}>
        <div className="pc-modal-h">
          <div>
            <span className="pc-modal-k">
              <b className="pa-ec-no">{e.code}</b> <Status s={e.status} /> <ClassTag e={e} /> <LightDot e={e} label />
            </span>
            <h2>{e.title}</h2>
            {e.topic && <p className="pc-dim">{e.topic}</p>}
          </div>
          <div className="pa-panel-a">
            <svg width={76} height={76} viewBox="0 0 76 76" role="img" aria-label={`Production checklist ${e.readiness.pct}% complete`}>
              <circle cx={38} cy={38} r={R} fill="none" stroke="var(--pa-line)" strokeWidth={7} />
              <circle
                cx={38}
                cy={38}
                r={R}
                fill="none"
                stroke={e.readiness.pct === 100 ? '#16a34a' : '#1f2937'}
                strokeWidth={7}
                strokeDasharray={`${(C * e.readiness.pct) / 100} ${C}`}
                strokeLinecap="round"
                transform="rotate(-90 38 38)"
              />
              <text x={38} y={43} textAnchor="middle" fontSize={16} fontWeight={800} fill="currentColor">
                {e.readiness.pct}%
              </text>
            </svg>
            <button type="button" className="pc-ib" aria-label="Close" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
        </div>
        <p className={`pa-reason ${e.light}`}>
          <i style={{ background: LIGHT[e.light].color }} /> {LIGHT[e.light].note} — {e.lightReason}
        </p>
        {actions?.onManage && (
          <button type="button" className="pa-btn primary sm" onClick={() => actions.onManage!(e.id)}>
            <Pencil size={14} aria-hidden /> Manage production details
          </button>
        )}

        <div className="pa-pgrid">
          <section>
            <h3>Episode Information</h3>
            <dl className="pa-dl">
              <dt>Episode number</dt>
              <dd>{e.code}</dd>
              <dt>Educational objective</dt>
              <dd>{e.objective || AWAITING}</dd>
              <dt>Description</dt>
              <dd>{e.description || e.topic || AWAITING}</dd>
              <dt>Content category</dt>
              <dd>
                {e.category} · {CLASS_LABEL[e.classification]}
                {e.classAuto && <span className="pc-dim"> (auto-classified)</span>}
              </dd>
              <dt>Construction milestone</dt>
              <dd>
                {ms.length ? (
                  <ul className="pa-msl">
                    {ms.map((m) => (
                      <li key={m.id} className={m.delayed ? 'late' : ''}>
                        <b>{m.name}</b>
                        <span className="pc-dim">
                          {fmtRange(m.actualStart || m.start, m.actualFinish || m.finish)} · {m.delayed ? 'Delayed' : m.status} · {m.actualStart ? 'actual' : m.confirmed ? 'confirmed' : 'projected'}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : e.classification === 'time' ? (
                  AWAITING
                ) : (
                  'Not required — can be filmed independently of construction progress'
                )}
                {e.linkAuto && <span className="pc-dim"> Linked automatically from the scope of work.</span>}
              </dd>
            </dl>
          </section>
          <section>
            <h3>Production Schedule</h3>
            <dl className="pa-dl">
              <dt>Original target date</dt>
              <dd>{e.original ? when(e.original) : e.target ? when(e.target) : AWAITING}</dd>
              <dt>Revised target date</dt>
              <dd>{e.original && e.target ? when(e.target) : 'No revision'}</dd>
              {e.projected && (
                <>
                  <dt>Projected from construction</dt>
                  <dd>
                    {when(e.projected)} <span className="pc-dim">· {e.projected.commitment === 'Actual' ? 'construction started' : `${e.projected.commitment.toLowerCase()}, not a confirmed shoot date`}</span>
                  </dd>
                </>
              )}
              {e.proposed && (
                <>
                  <dt>Proposed alternative</dt>
                  <dd>
                    {when(e.proposed)} <span className="pc-dim">· awaiting director approval{e.proposed.note ? ` — ${e.proposed.note}` : ''}</span>
                  </dd>
                </>
              )}
              <dt>Confirmed shoot date</dt>
              <dd>{e.confirmed ? when(e.confirmed) : 'Not yet confirmed'}</dd>
              <dt>Actual filming date</dt>
              <dd>{e.actual ? when(e.actual) : 'Not yet filmed'}</dd>
              <dt>Estimated duration</dt>
              <dd>{e.duration || AWAITING}</dd>
              <dt>Production location</dt>
              <dd>
                {e.location ? (
                  <>
                    <MapPin size={13} aria-hidden /> {e.location}
                  </>
                ) : (
                  AWAITING
                )}
              </dd>
            </dl>
          </section>
          <section>
            <h3>Characters</h3>
            {e.cast.length ? (
              <ul className="pa-castl">
                {e.cast.map((c) => (
                  <li key={c.id}>
                    <Avatar name={c.name} size={26} />
                    <span>
                      <b>{c.name}</b>
                      <span className="pc-dim">{c.role || 'Role: ' + AWAITING}</span>
                    </span>
                    <span className={`pc-st ${AVAIL_TONE[c.availability]}`}>{c.availability}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="pc-dim">{AWAITING}</p>
            )}
          </section>
          <section>
            <h3>Production Assignments</h3>
            <ul className="pa-castl">
              <li>
                <Avatar name={e.director || '?'} size={26} />
                <span>
                  <b>{e.director || AWAITING}</b>
                  <span className="pc-dim">Director</span>
                </span>
                <span className={`pc-st ${e.directorConfirmed ? 'good' : 'warn'}`}>{e.directorConfirmed ? 'Confirmed' : 'For confirmation'}</span>
              </li>
              {e.team.map((t) => (
                <li key={t.role}>
                  <Avatar name={t.name || '?'} size={26} />
                  <span>
                    <b>{t.name || (t.required ? 'For assignment' : '—')}</b>
                    <span className="pc-dim">{t.label}</span>
                  </span>
                  {t.name && <span className={`pc-st ${t.confirmed ? 'good' : 'warn'}`}>{t.confirmed ? 'Confirmed' : 'For confirmation'}</span>}
                </li>
              ))}
            </ul>
            <p>
              Assignment status: <span className={`pc-st ${ASSIGN_TONE[e.assignment]}`}>{e.assignment}</span>
            </p>
          </section>
          <section className="pa-wide">
            <h3>Production Checklist</h3>
            <ul className="pa-check">
              {e.checklist.map((c) => (
                <li key={c.id} className={c.done ? 'done' : ''}>
                  {c.done ? <CheckCircle2 size={16} aria-hidden /> : <Circle size={16} aria-hidden />}
                  <span>{c.label}</span>
                  {c.na ? <span className="pc-dim">not applicable</span> : c.auto ? <span className="pc-dim">automatic</span> : null}
                </li>
              ))}
            </ul>
            {e.readiness.awaiting.length > 0 && <p className="pc-dim">Awaiting: {e.readiness.awaiting.join(', ')}.</p>}
          </section>
          {e.history.length > 0 && (
            <section className="pa-wide">
              <h3>Schedule revision history</h3>
              <ul className="pa-hist">
                {e.history.slice(0, 12).map((h, i) => (
                  <li key={i}>
                    <span className="pc-dim">{new Date(h.at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                    <b>{h.action}</b>
                    {(h.from || h.to) && (
                      <span>
                        {h.from || '—'} → {h.to || '—'}
                      </span>
                    )}
                    {h.by && <span className="pc-dim">by {h.by}</span>}
                    {h.note && <span className="pc-dim">“{h.note}”</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// 10. Stakeholder presentation mode
// ---------------------------------------------------------------------------
const PresentationMode: React.FC<{ data: PortalProduction; months: string[]; start: string; onClose: () => void; onOpen: (id: string) => void }> = ({ data, months, start, onClose, onOpen }) => {
  const [month, setMonth] = useState(start);
  const ref = useRef<HTMLDivElement>(null);
  const p = useMemo(() => monthPlan(data, month), [data, month]);
  const k = useMemo(() => kpis(data), [data]);
  const idx = months.indexOf(month);
  useEffect(() => {
    const el = ref.current;
    el?.focus();
    try {
      void el?.requestFullscreen?.().catch(() => undefined);
    } catch {
      // full screen is optional
    }
    const key = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') onClose();
      if (ev.key === 'ArrowRight') setMonth((m) => months[Math.min(months.length - 1, months.indexOf(m) + 1)]);
      if (ev.key === 'ArrowLeft') setMonth((m) => months[Math.max(0, months.indexOf(m) - 1)]);
    };
    window.addEventListener('keydown', key);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', key);
      document.body.style.overflow = prev;
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const r = monthRange(`${month}-01`);
  const weeks = monthGrid(`${month}-01`);
  const upMs = data.milestones
    .filter((m) => m.status !== 'Completed' && m.start && m.start >= data.today && (m.isMilestone || data.episodes.some((e) => e.milestoneIds.includes(m.id))))
    .slice(0, 5);
  const upShoots = data.episodes
    .filter((e) => e.status !== 'Completed' && e.shown && e.shown.end >= data.today)
    .sort((a, b) => a.shown!.start.localeCompare(b.shown!.start))
    .slice(0, 5);
  const totalOpen = p.time.length + p.flexible.length;
  return (
    <div className="pa-pres" ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Presentation mode">
      <header className="pa-pres-h">
        <div>
          <h1>CONVENGERS PRODUCTION ALIGNMENT</h1>
          <p>{monthName(month)} · Construction Milestones → Educational Content → Production Schedule</p>
        </div>
        <div className="pa-pres-nav">
          <button type="button" aria-label="Previous month" disabled={idx <= 0} onClick={() => setMonth(months[idx - 1])}>
            <ChevronLeft size={26} />
          </button>
          <button type="button" aria-label="Next month" disabled={idx >= months.length - 1} onClick={() => setMonth(months[idx + 1])}>
            <ChevronRight size={26} />
          </button>
          <button type="button" onClick={() => printMonthlySummary(data, month)} aria-label="Print monthly summary">
            <Printer size={22} />
          </button>
          <button type="button" onClick={onClose} aria-label="Exit presentation mode">
            <X size={26} />
          </button>
        </div>
      </header>
      <div className="pa-pres-k">
        <div>
          <b>{p.shoots.length}</b>
          <span>
            shoots this month
            <br />
            {p.confirmed.length} confirmed · {p.pending.length} pending
          </span>
        </div>
        <div>
          <b>{p.time.length}</b>
          <span>
            time-sensitive
            <br />
            vs {p.flexible.length} flexible
          </span>
          <span className="pa-split" aria-hidden>
            <i style={{ width: `${totalOpen ? (p.time.length / totalOpen) * 100 : 0}%` }} />
          </span>
        </div>
        <div>
          <b>{p.ready.length}</b>
          <span>
            ready for filming
            <br />
            avg readiness {k.avgReadiness}%
          </span>
        </div>
        <div className={p.conflicts.length ? 'bad' : ''}>
          <b>{p.conflicts.length}</b>
          <span>
            schedule conflicts
            <br />
            {p.reschedule.length} to reschedule
          </span>
        </div>
        <div>
          <b>{p.characters.length}</b>
          <span>
            characters required
            <br />
            {p.pendingAvailability} confirmations pending
          </span>
        </div>
      </div>
      <div className="pa-pres-body">
        <div className="pa-pres-cal">
          <div className="pa-pres-month">
            {DOW.map((d) => (
              <div key={d} className="pa-pdw">
                {d}
              </div>
            ))}
            {weeks.flat().map((d) => {
              const eps = episodesOn(data, d);
              const out = d < r.start || d > r.end;
              return (
                <div key={d} className={`pa-pcell ${out ? 'out' : ''} ${d === data.today ? 'today' : ''}`}>
                  <span className="pa-pn">{Number(d.slice(8))}</span>
                  {eps.slice(0, 3).map((e) => (
                    <button key={e.id} type="button" style={{ ['--c' as any]: LIGHT[e.light].color }} onClick={() => onOpen(e.id)} title={e.title}>
                      {e.code}
                    </button>
                  ))}
                  {eps.length > 3 && <span className="pa-pmore">+{eps.length - 3}</span>}
                </div>
              );
            })}
          </div>
          <div className="pa-legend">
            {LIGHTS.map((l) => (
              <span key={l.id}>
                <i style={{ background: l.color }} /> {l.label}
              </span>
            ))}
          </div>
        </div>
        <div className="pa-pres-side">
          <section>
            <h2>Upcoming construction milestones</h2>
            <ul>
              {upMs.length ? (
                upMs.map((m) => (
                  <li key={m.id}>
                    <b>{fmtDate(m.start, false)}</b> {m.name}
                    {!m.confirmed && <em> projected</em>}
                  </li>
                ))
              ) : (
                <li>None scheduled</li>
              )}
            </ul>
          </section>
          <section>
            <h2>Upcoming educational shoots</h2>
            <ul>
              {upShoots.length ? (
                upShoots.map((e) => (
                  <li key={e.id}>
                    <i className="dot" style={{ background: LIGHT[e.light].color }} />
                    <b>{fmtDate(e.shown!.start, false)}</b> {e.code} {e.title}
                  </li>
                ))
              ) : (
                <li>None scheduled</li>
              )}
            </ul>
          </section>
          <section>
            <h2>Character involvement</h2>
            <ul className="chars">
              {p.characters.length ? (
                p.characters.slice(0, 8).map((c) => (
                  <li key={c.name}>
                    {c.name} <b>{c.days}d</b>
                  </li>
                ))
              ) : (
                <li>No filming this month</li>
              )}
            </ul>
          </section>
          {p.conflicts.length > 0 && (
            <section className="bad">
              <h2>Schedule conflicts</h2>
              <ul>
                {p.conflicts.slice(0, 4).map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
      <footer className="pa-pres-f">
        Use ← → to change month · Esc to exit · Data as of {new Date(data.asOf).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
      </footer>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Printable monthly production summary
// ---------------------------------------------------------------------------
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function monthlySummaryHtml(data: PortalProduction, key: string): string {
  const p = monthPlan(data, key);
  const row = (e: PPEpisode) =>
    `<tr><td><span class="dot" style="background:${LIGHT[e.light].color}"></span>${esc(e.code)}</td><td>${esc(e.title)}</td><td>${esc(when(e.shown))}<br><small>${esc(KIND_LABEL[e.shown?.kind || 'target'])}</small></td><td>${esc(
      CLASS_LABEL[e.classification]
    )}</td><td>${esc(e.cast.map((c) => c.name).join(', ') || AWAITING)}</td><td>${esc(e.director || AWAITING)}</td><td>${esc(
      e.milestoneIds.map((id) => data.milestones.find((m) => m.id === id)?.name || '').filter(Boolean).join('; ') || (e.classification === 'time' ? AWAITING : '—')
    )}</td><td>${esc(e.status)}<br><small>${e.readiness.pct}% ready</small></td></tr>`;
  const list = (items: string[], empty: string) => (items.length ? `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>` : `<p class="dim">${esc(empty)}</p>`);
  return `<!doctype html><html><head><meta charset="utf-8"><title>Production Alignment – ${esc(monthName(key))}</title>
<style>
body{font-family:Inter,Segoe UI,Arial,sans-serif;color:#111827;margin:28px;font-size:12px}
h1{font-size:20px;margin:0;letter-spacing:.02em}h2{font-size:14px;margin:18px 0 6px;border-bottom:1px solid #d1d5db;padding-bottom:4px}
.sub{color:#4b5563;margin:2px 0 14px}.dim{color:#6b7280}table{width:100%;border-collapse:collapse}th,td{border:1px solid #d1d5db;padding:5px 6px;vertical-align:top;text-align:left}
th{background:#f3f4f6;font-size:11px}.dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:5px}.k{display:flex;gap:10px;flex-wrap:wrap}
.k div{border:1px solid #d1d5db;border-radius:8px;padding:8px 12px;min-width:110px}.k b{display:block;font-size:20px}.cols{display:grid;grid-template-columns:1fr 1fr;gap:14px}
ul{margin:4px 0;padding-left:18px}small{color:#6b7280}@media print{body{margin:12mm}}
</style></head><body>
<h1>CONVENGERS PRODUCTION ALIGNMENT</h1>
<p class="sub">Monthly Production Summary · ${esc(monthName(key))} · Data as of ${esc(new Date(data.asOf).toLocaleString('en-US'))}</p>
<p>${esc(monthSummaryText(p))}</p>
<div class="k"><div><b>${p.shoots.length}</b>shoots</div><div><b>${p.confirmed.length}</b>confirmed</div><div><b>${p.pending.length}</b>pending</div><div><b>${p.time.length}</b>time-sensitive</div><div><b>${p.flexible.length}</b>flexible</div><div><b>${p.ready.length}</b>ready</div><div><b>${p.reschedule.length}</b>to reschedule</div></div>
<h2>Educational shoots</h2>
${p.shoots.length ? `<table><thead><tr><th>Episode</th><th>Title</th><th>Shoot date</th><th>Classification</th><th>Characters</th><th>Director</th><th>Construction milestone</th><th>Status</th></tr></thead><tbody>${p.shoots.map(row).join('')}</tbody></table>` : '<p class="dim">No shoots this month.</p>'}
<div class="cols"><div>
<h2>Construction milestones</h2>
${list(
  p.construction.map((m) => `${m.name} — ${fmtRange(m.start, m.finish)} · ${m.delayed ? 'Delayed' : m.status}${m.actualFinish ? ` (completed ${fmtDate(m.actualFinish)})` : ''}`),
  'No linked construction milestones this month.'
)}
<h2>Character involvement</h2>
${list(
  p.characters.map((c) => `${c.name} — ${c.days} filming day${c.days === 1 ? '' : 's'}${c.pending ? ` (${c.pending} pending)` : ''}`),
  'No characters required.'
)}
</div><div>
<h2>Director's priorities</h2>
${list(
  p.priorities.map((e) => `${e.code} ${e.title} — ${e.lightReason}`),
  'All episodes aligned.'
)}
<h2>Schedule conflicts</h2>
${list(p.conflicts, 'No schedule conflicts.')}
<h2>Requiring creative direction</h2>
${list(
  p.creative.map((e) => `${e.code} ${e.title}`),
  'Scripts and talking points ready.'
)}
</div></div>
<script>window.onload=function(){setTimeout(function(){window.print()},250)}</script>
</body></html>`;
}

export function printMonthlySummary(data: PortalProduction, key: string): void {
  const w = window.open('', '_blank');
  if (!w) {
    alert('Allow pop-ups for this site to print the monthly summary.');
    return;
  }
  w.document.open();
  w.document.write(monthlySummaryHtml(data, key));
  w.document.close();
}

// ---------------------------------------------------------------------------
// Client portal page — reads the published copy only (portal record kind "production")
// ---------------------------------------------------------------------------
export const ProductionAlignmentPage: React.FC<{
  audience: string;
  /** Owner / executive / internal: the full portal list is already loaded. */
  fullItems?: PortalRecordLike[];
  onLogin?: () => void;
  compact?: boolean;
}> = ({ audience, fullItems, onLogin, compact }) => {
  const signedIn = audience === 'external' || audience === 'internal';
  const own = useStore(productionPortalStore, signedIn && !fullItems);
  const rec = (fullItems || own.items).filter((r) => r.kind === 'production').sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))[0];
  if (!signedIn)
    return (
      <div className="pa">
        <section className="pa-card pa-locked">
          <h1 className="pa-title">CONVENGERS PRODUCTION ALIGNMENT</h1>
          <p className="pa-sub">Connecting Construction Milestones, Educational Content, and Production Schedules.</p>
          <p>
            {audience === 'pending'
              ? 'Your account is awaiting approval. The production schedule becomes available once an administrator approves your access.'
              : 'The production schedule — episodes, cast and crew assignments — is available to signed-in project stakeholders, directors and production personnel.'}
          </p>
          {audience === 'guest' && onLogin && (
            <button type="button" className="pa-btn primary" onClick={onLogin}>
              Sign in
            </button>
          )}
        </section>
      </div>
    );
  if (!rec)
    return (
      <div className="pa">
        <section className="pa-card pa-locked">
          <h1 className="pa-title">CONVENGERS PRODUCTION ALIGNMENT</h1>
          <p className="pa-sub">Connecting Construction Milestones, Educational Content, and Production Schedules.</p>
          <p>{own.loaded || fullItems ? 'The production schedule has not been published yet.' : 'Loading the production schedule…'}</p>
        </section>
      </div>
    );
  return (
    <ProductionAlignment
      data={rec.content as PortalProduction}
      compact={compact}
      publishedNote={`Published by the production team · updated ${new Date(rec.publishedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}`}
    />
  );
};
type PortalRecordLike = { id: string; kind: string; publishedAt: string; content: any };
