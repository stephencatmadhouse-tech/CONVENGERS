/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * PRODUCTION CALENDAR — client-facing (stakeholder portal)
 *   Month · Week · Timeline views, previous / next / Today, category filter,
 *   event details, Upcoming Activities (today and the next 7 days highlighted,
 *   milestone countdowns) and schedule-update indicators.
 *
 * Shows only what administrators published (portal records of kind "event") plus the
 * construction schedule and milestones from the latest published Project Status Update.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, MapPin, Users, Clock, Paperclip, Layers, BellRing, X } from 'lucide-react';
import '../command/prodCalendar.css';
import type { PortalRecord, PortalSnapshot } from '../domain/portal.ts';
import { CATEGORY, PROD_CATEGORIES, STATUS_TONE, clientEvents, fmtTime12, monthGrid, onDay, overlapsRange, recentUpdates, upcomingEvents, type ClientEvent } from '../domain/productionCalendar.ts';
import { addDays, fmtDate, fmtRange, monthRange, todayIso, weekRange } from '../domain/dates.ts';
import type { ProdCategory } from '../types/index.ts';
import { SecureImg } from '../drive/SecureMedia.tsx';
import { openDriveFile } from '../drive/driveClient.ts';

type View = 'month' | 'week' | 'timeline';
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const VIEW_KEY = 'convengers_pc_view';

const timeText = (e: ClientEvent) => (e.startTime ? `${fmtTime12(e.startTime)}${e.endTime ? ` – ${fmtTime12(e.endTime)}` : ''}` : 'All day');
const dateText = (e: ClientEvent) => (e.end && e.end !== e.start ? fmtRange(e.start, e.end) : fmtDate(e.start));

const Cat: React.FC<{ c: ProdCategory; sub?: string }> = ({ c, sub }) => (
  <span className="pc-cat" style={{ ['--c' as any]: CATEGORY[c].color }}>
    {sub || CATEGORY[c].short}
  </span>
);
const St: React.FC<{ s: ClientEvent['status'] }> = ({ s }) => <span className={`pc-st ${STATUS_TONE[s]}`}>{s}</span>;
const UpdateTag: React.FC<{ e: ClientEvent }> = ({ e }) =>
  e.update && e.update.kind !== 'Added' ? <span className={`pc-upd ${e.update.kind.toLowerCase()}`}>{e.update.kind}</span> : e.update?.kind === 'Added' ? <span className="pc-upd added">New</span> : null;

export const ProductionCalendar: React.FC<{ portal: PortalRecord[]; snapshot?: PortalSnapshot | null }> = ({ portal, snapshot }) => {
  const today = todayIso();
  const all = useMemo(() => clientEvents(portal, snapshot), [portal, snapshot]);
  const [view, setView] = useState<View>(() => {
    try {
      return (localStorage.getItem(VIEW_KEY) as View) || 'month';
    } catch {
      return 'month';
    }
  });
  const [anchor, setAnchor] = useState(today);
  const [off, setOff] = useState<Record<string, boolean>>({});
  const [open, setOpen] = useState<ClientEvent | null>(null);
  const list = all.filter((e) => !off[e.category]);
  const changeView = (v: View) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      // per-device convenience only
    }
  };
  const step = (n: number) => {
    if (view === 'week') setAnchor(addDays(weekRange(anchor).start, 7 * n));
    else {
      const d = new Date(`${anchor.slice(0, 7)}-01T00:00:00`);
      d.setMonth(d.getMonth() + n);
      setAnchor(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`);
    }
  };
  const title =
    view === 'week' ? fmtRange(weekRange(anchor).start, weekRange(anchor).end) : new Date(`${anchor.slice(0, 7)}-01T00:00:00`).toLocaleString('en-US', { month: 'long', year: 'numeric' });
  const updates = recentUpdates(all, today);
  const upcoming = upcomingEvents(all, today, 8);

  return (
    <div className="pc">
      {updates.length > 0 && (
        <section className="pc-updates" aria-label="Schedule updates">
          <BellRing size={18} aria-hidden />
          <div>
            <b>Schedule updates</b>
            <ul>
              {updates.slice(0, 4).map((e) => (
                <li key={e.id}>
                  <button type="button" className="pc-link" onClick={() => setOpen(e)}>
                    {e.title}
                  </button>{' '}
                  — {e.update!.kind === 'Added' ? `added for ${dateText(e)}` : e.update!.kind === 'Rescheduled' ? `moved${e.update!.previous?.start ? ` from ${fmtDate(e.update!.previous.start)}` : ''} to ${dateText(e)}` : e.update!.kind.toLowerCase()}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <section className="pc-card">
        <div className="pc-bar">
          <div className="pc-nav">
            <button type="button" className="pc-ib" aria-label="Previous" onClick={() => step(-1)}>
              <ChevronLeft size={18} />
            </button>
            <button type="button" className="pc-today" onClick={() => setAnchor(today)}>
              Today
            </button>
            <button type="button" className="pc-ib" aria-label="Next" onClick={() => step(1)}>
              <ChevronRight size={18} />
            </button>
            <h2 className="pc-title">{view === 'timeline' ? `From ${new Date(`${anchor.slice(0, 7)}-01T00:00:00`).toLocaleString('en-US', { month: 'long', year: 'numeric' })}` : title}</h2>
          </div>
          <div className="pc-views" role="tablist" aria-label="Calendar view">
            {(
              [
                ['month', 'Month'],
                ['week', 'Week'],
                ['timeline', 'Timeline'],
              ] as [View, string][]
            ).map(([v, l]) => (
              <button key={v} type="button" role="tab" aria-selected={view === v} className={view === v ? 'on' : ''} onClick={() => changeView(v)}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <div className="pc-legend" role="group" aria-label="Categories">
          {PROD_CATEGORIES.map((c) => (
            <button key={c.id} type="button" aria-pressed={!off[c.id]} className={off[c.id] ? 'off' : ''} style={{ ['--c' as any]: c.color }} onClick={() => setOff({ ...off, [c.id]: !off[c.id] })}>
              <i /> {c.short}
            </button>
          ))}
        </div>

        {view === 'month' && <MonthView anchor={anchor} today={today} list={list} onOpen={setOpen} />}
        {view === 'week' && <WeekView anchor={anchor} today={today} list={list} onOpen={setOpen} />}
        {view === 'timeline' && <TimelineView anchor={anchor} today={today} list={list} onOpen={setOpen} />}
        {all.length === 0 && <p className="pc-empty">No schedules have been published yet.</p>}
      </section>

      <section className="pc-card">
        <h2 className="pc-h2">Upcoming Activities</h2>
        {upcoming.length ? (
          <ol className="pc-up">
            {upcoming.map((e) => (
              <li key={e.id} className={e.when}>
                <button type="button" onClick={() => setOpen(e)} style={{ ['--c' as any]: CATEGORY[e.category].color }}>
                  <span className="pc-up-d">
                    <b>{new Date(`${(e.start < today ? today : e.start)}T00:00:00`).getDate()}</b>
                    <span>{new Date(`${(e.start < today ? today : e.start)}T00:00:00`).toLocaleString('en-US', { month: 'short' })}</span>
                  </span>
                  <span className="pc-up-m">
                    <span className="pc-up-t">
                      {e.when === 'today' && <em className="pc-flag today">Today</em>}
                      {e.when === 'week' && <em className="pc-flag week">This week</em>}
                      <b>{e.title}</b>
                    </span>
                    <span className="pc-up-s">
                      <Cat c={e.category} sub={e.subcategory} /> <St s={e.status} /> <UpdateTag e={e} />
                    </span>
                    <span className="pc-dim">
                      {dateText(e)} · {timeText(e)}
                      {e.department ? ` · ${e.department}` : ''}
                    </span>
                    {e.description && <span className="pc-up-desc">{e.description}</span>}
                  </span>
                  {e.countdown !== null && (
                    <span className="pc-count" aria-label={`${e.countdown} days to go`}>
                      <b>{e.countdown}</b>
                      <span>{e.countdown === 1 ? 'day' : 'days'} to go</span>
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <p className="pc-empty">No upcoming activities have been published.</p>
        )}
      </section>

      {open && <EventModal e={open} onClose={() => setOpen(null)} />}
    </div>
  );
};

// ---------------- month
const MonthView: React.FC<{ anchor: string; today: string; list: ClientEvent[]; onOpen: (e: ClientEvent) => void }> = ({ anchor, today, list, onOpen }) => {
  const weeks = monthGrid(anchor);
  const m = monthRange(anchor);
  const [day, setDay] = useState<string | null>(null);
  useEffect(() => setDay(null), [anchor]);
  const dayList = day ? list.filter((e) => onDay(e, day)) : [];
  return (
    <>
      <div className="pc-month" role="grid" aria-label="Month">
        {DOW.map((d) => (
          <div key={d} className="pc-dow" role="columnheader">
            {d}
          </div>
        ))}
        {weeks.flat().map((d) => {
          const evs = list.filter((e) => onDay(e, d));
          const out = d < m.start || d > m.end;
          return (
            <div key={d} role="gridcell" className={`pc-day ${out ? 'out' : ''} ${d === today ? 'today' : ''} ${day === d ? 'sel' : ''}`}>
              <button type="button" className="pc-dn" aria-label={`${fmtDate(d)}: ${evs.length} ${evs.length === 1 ? 'activity' : 'activities'}`} onClick={() => setDay(day === d ? null : d)}>
                {Number(d.slice(8))}
              </button>
              <div className="pc-evs">
                {evs.slice(0, 3).map((e) => (
                  <button key={e.id} type="button" className={`pc-ev ${e.status === 'Cancelled' ? 'x' : ''}`} style={{ ['--c' as any]: CATEGORY[e.category].color }} onClick={() => onOpen(e)} title={e.title}>
                    <i />
                    <span>{e.title}</span>
                  </button>
                ))}
                {evs.length > 3 && (
                  <button type="button" className="pc-more" onClick={() => setDay(d)}>
                    +{evs.length - 3} more
                  </button>
                )}
              </div>
              {evs.length > 0 && (
                <span className="pc-dots" aria-hidden>
                  {evs.slice(0, 4).map((e) => (
                    <i key={e.id} style={{ background: CATEGORY[e.category].color }} />
                  ))}
                </span>
              )}
            </div>
          );
        })}
      </div>
      {day && (
        <div className="pc-dayl">
          <h3>{new Date(`${day}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</h3>
          {dayList.length ? <EventRows list={dayList} onOpen={onOpen} /> : <p className="pc-empty">Nothing scheduled.</p>}
        </div>
      )}
    </>
  );
};

const EventRows: React.FC<{ list: ClientEvent[]; onOpen: (e: ClientEvent) => void }> = ({ list, onOpen }) => (
  <ul className="pc-rows">
    {list.map((e) => (
      <li key={e.id}>
        <button type="button" onClick={() => onOpen(e)} style={{ ['--c' as any]: CATEGORY[e.category].color }}>
          <span className="pc-rows-t">{timeText(e)}</span>
          <span className="pc-rows-m">
            <b>{e.title}</b>
            <span>
              <Cat c={e.category} sub={e.subcategory} /> <St s={e.status} /> <UpdateTag e={e} />
            </span>
          </span>
        </button>
      </li>
    ))}
  </ul>
);

// ---------------- week
const WeekView: React.FC<{ anchor: string; today: string; list: ClientEvent[]; onOpen: (e: ClientEvent) => void }> = ({ anchor, today, list, onOpen }) => {
  const w = weekRange(anchor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(w.start, i));
  return (
    <div className="pc-week">
      {days.map((d) => {
        const evs = list.filter((e) => onDay(e, d));
        return (
          <div key={d} className={`pc-wd ${d === today ? 'today' : ''}`}>
            <div className="pc-wd-h">
              <span>{DOW[days.indexOf(d)]}</span>
              <b>{Number(d.slice(8))}</b>
            </div>
            {evs.length ? <EventRows list={evs} onOpen={onOpen} /> : <span className="pc-wd-none">—</span>}
          </div>
        );
      })}
    </div>
  );
};

// ---------------- timeline
const TimelineView: React.FC<{ anchor: string; today: string; list: ClientEvent[]; onOpen: (e: ClientEvent) => void }> = ({ anchor, today, list, onOpen }) => {
  const from = monthRange(anchor).start;
  const to = monthRange(addDays(monthRange(addDays(monthRange(anchor).end, 1)).end, 1)).end; // three months
  const items = list.filter((e) => overlapsRange(e, from, to));
  const months: string[] = [];
  for (let d = from; d <= to; d = addDays(monthRange(d).end, 1)) months.push(d);
  const span = Math.max(1, (Date.parse(to) - Date.parse(from)) / 86400000 + 1);
  const pos = (d: string) => Math.max(0, Math.min(100, ((Date.parse(d) - Date.parse(from)) / 86400000 / span) * 100));
  return (
    <div className="pc-tl">
      <div className="pc-tl-scale" aria-hidden>
        {months.map((mm) => (
          <span key={mm} style={{ left: `${pos(mm)}%` }}>
            {new Date(`${mm}T00:00:00`).toLocaleString('en-US', { month: 'short', year: 'numeric' })}
          </span>
        ))}
        {today >= from && today <= to && <i className="pc-tl-now" style={{ left: `${pos(today)}%` }} />}
      </div>
      {items.length ? (
        <ul className="pc-tl-rows">
          {items.map((e) => {
            const s = e.start < from ? from : e.start;
            const t = (e.end || e.start) > to ? to : e.end || e.start;
            return (
              <li key={e.id}>
                <button type="button" onClick={() => onOpen(e)} style={{ ['--c' as any]: CATEGORY[e.category].color }}>
                  <span className="pc-tl-l">
                    <b>{e.title}</b>
                    <span className="pc-dim">
                      {dateText(e)} · {CATEGORY[e.category].short}
                    </span>
                  </span>
                  <span className="pc-tl-track">
                    {months.map((mm) => (
                      <i key={mm} className="pc-tl-grid" style={{ left: `${pos(mm)}%` }} />
                    ))}
                    {today >= from && today <= to && <i className="pc-tl-now" style={{ left: `${pos(today)}%` }} />}
                    <span
                      className={`pc-tl-bar ${e.category === 'milestone' || s === t ? 'pt' : ''} ${e.status === 'Cancelled' ? 'x' : ''}`}
                      style={{ left: `${pos(s)}%`, width: s === t ? undefined : `${Math.max(1.2, pos(addDays(t, 1)) - pos(s))}%` }}
                    />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="pc-empty">Nothing scheduled in these three months.</p>
      )}
    </div>
  );
};

// ---------------- details
const EventModal: React.FC<{ e: ClientEvent; onClose: () => void }> = ({ e, onClose }) => {
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
  return (
    <div className="pc-mbg" onMouseDown={(ev) => ev.target === ev.currentTarget && onClose()}>
      <div className="pc-modal" role="dialog" aria-modal="true" aria-label={e.title} style={{ ['--c' as any]: CATEGORY[e.category].color }}>
        <div className="pc-modal-h">
          <div>
            <span className="pc-modal-k">
              <Cat c={e.category} sub={e.subcategory || CATEGORY[e.category].label} /> <St s={e.status} /> <UpdateTag e={e} />
            </span>
            <h2>{e.title}</h2>
          </div>
          <button type="button" className="pc-ib" aria-label="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <dl className="pc-facts">
          <dt>
            <Clock size={15} aria-hidden /> When
          </dt>
          <dd>
            {dateText(e)} · {timeText(e)}
            {e.update?.kind === 'Rescheduled' && e.update.previous?.start && <span className="pc-dim"> (previously {fmtDate(e.update.previous.start)})</span>}
          </dd>
          {e.location && (
            <>
              <dt>
                <MapPin size={15} aria-hidden /> Location
              </dt>
              <dd>{e.location}</dd>
            </>
          )}
          {e.department && (
            <>
              <dt>
                <Users size={15} aria-hidden /> Responsible team
              </dt>
              <dd>{e.department}</dd>
            </>
          )}
          {e.phase && (
            <>
              <dt>
                <Layers size={15} aria-hidden /> Project phase
              </dt>
              <dd>{e.phase}</dd>
            </>
          )}
        </dl>
        {e.description && <p className="pc-desc">{e.description}</p>}
        {e.photos.length > 0 && (
          <div className="pc-photos">
            {e.photos.map((p) => (
              <figure key={p.url}>
                <SecureImg src={p.url} alt={p.caption || e.title} loading="lazy" />
                {p.caption && <figcaption>{p.caption}</figcaption>}
              </figure>
            ))}
          </div>
        )}
        {e.attachments.length > 0 && (
          <ul className="pc-files-l">
            {e.attachments.map((a) => (
              <li key={a.url}>
                <button type="button" className="pc-link" onClick={() => void openDriveFile(a.url)}>
                  <Paperclip size={14} aria-hidden /> {a.title}
                </button>
              </li>
            ))}
          </ul>
        )}
        {e.source === 'schedule' && <p className="pc-dim pc-src">From the latest published project status update.</p>}
      </div>
    </div>
  );
};

/** Production Calendar page (client-facing). */
export const CalendarPage: React.FC<{ events: PortalRecord[]; snap?: PortalSnapshot }> = ({ events, snap }) => (
  <div className="cx">
    <header className="cx-pagehead">
      <h1 className="cx-title">Production Calendar</h1>
      <p className="cx-muted">Upcoming construction work, content production, photo and video shoots, meetings, milestones and announcements — as published by the project team.</p>
    </header>
    <ProductionCalendar portal={events} snapshot={snap} />
  </div>
);

/** Compact "Coming up" list for the portal home pages (next 3 activities). */
export const UpcomingSchedule: React.FC<{ events?: PortalRecord[]; snap?: PortalSnapshot; go: (t: string) => void; className?: string }> = ({ events, snap, go, className }) => {
  const today = todayIso();
  const list = upcomingEvents(clientEvents(events || [], snap), today, 3);
  const changes = recentUpdates(clientEvents(events || [], snap), today).length;
  return (
    <section className={`pc-mini ${className || ''}`} aria-label="Upcoming schedule">
      <div className="pc-mini-h">
        <h2>Upcoming schedule</h2>
        {changes > 0 && <span className="pc-upd rescheduled">{changes} schedule {changes === 1 ? 'update' : 'updates'}</span>}
        <button type="button" className="pc-link" onClick={() => go('calendar')}>
          Production Calendar
        </button>
      </div>
      {list.length ? (
        <ul>
          {list.map((e) => (
            <li key={e.id} style={{ ['--c' as any]: CATEGORY[e.category].color }}>
              <span className="pc-mini-d">{e.when === 'today' ? 'Today' : fmtDate(e.start < today ? today : e.start, false)}</span>
              <b>{e.title}</b>
              <Cat c={e.category} sub={CATEGORY[e.category].short} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="pc-empty">No upcoming activities have been published.</p>
      )}
    </section>
  );
};
