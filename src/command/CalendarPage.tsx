/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Calendar: Month / Week / Day views and the Agenda (60-day forecast).
 * Sources: register milestones, scope start / target dates, concrete pours,
 * production dates, inspections, procurement deliveries, handover / turnover
 * and manually added entries (Admin / Manager can add, edit and mark done).
 */

import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, CalendarDays, AlertTriangle, UserX } from 'lucide-react';
import './exec.css';
import { useCommand } from './context.tsx';
import { Card, Empty, Banner, Modal, Field, ConfirmDialog } from './ui.tsx';
import { ChartBox } from './charts.tsx';
import { useStore } from '../firebase/useStore.ts';
import { procurementStore, eventStore } from '../firebase/opsStores.ts';
import { newId } from '../firebase/collectionStore.ts';
import { CAL_TYPES, CAL_COLOR, CalItem, CalType, buildCalendar, buildForecast, inRange, weekLabel } from '../domain/calendarEvents.ts';
import { addDays, diffDays, fmtDate, isValidIso, monthLabel, monthRange, weekRange } from '../domain/dates.ts';
import { CalendarEvent, CalendarEventType } from '../types/index.ts';

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const EVENT_TYPES: CalendarEventType[] = ['Inspection', 'Site visit', 'Delivery', 'Handover / turnover', 'Meeting', 'Other'];

/** Calendar items for the whole project (memoized on the inputs). */
export function useCalendarItems(): { items: CalItem[]; manual: CalendarEvent[]; manualShared: boolean } {
  const { register, today } = useCommand();
  const proc = useStore(procurementStore);
  const ev = useStore(eventStore);
  const items = useMemo(() => buildCalendar({ register, procurement: proc.items, manual: ev.items, today }), [register, proc.items, ev.items, today]);
  return { items, manual: ev.items, manualShared: ev.shared };
}

const TypeDot: React.FC<{ t: CalType }> = ({ t }) => <span className="cv-dot" style={{ background: CAL_COLOR[t] }} aria-hidden />;

const ItemLine: React.FC<{ i: CalItem; onClick: () => void; showDate?: boolean }> = ({ i, onClick, showDate }) => (
  <button type="button" className={`ex-agi ${i.done ? 'done' : ''} ${i.overdue ? 'late' : ''}`} onClick={onClick} style={{ borderLeftColor: CAL_COLOR[i.type] }}>
    {showDate && (
      <span className="ex-agi-d">
        <b>{fmtDate(i.date, false)}</b>
        <em>{DOW[(new Date(i.date + 'T00:00:00').getDay() + 6) % 7]}</em>
      </span>
    )}
    <span className="ex-agi-b">
      <span className="ex-agi-t">
        {i.time && <span className="ex-agi-time">{i.time}</span>}
        {i.title}
      </span>
      <span className="ex-agi-s">
        <TypeDot t={i.type} /> {i.type} · {i.marker}
        {i.owner ? ` · ${i.owner}` : ' · no owner'}
        {i.done ? ' · done' : i.overdue ? ' · overdue' : ''}
      </span>
    </span>
  </button>
);

// ---------------- Forecast (shared with the Executive Dashboard) ----------------
export const ForecastPanel: React.FC<{ items: CalItem[]; onOpen: (i: CalItem) => void }> = ({ items, onOpen }) => {
  const { today } = useCommand();
  const [past, setPast] = useState(false);
  const f = useMemo(() => buildForecast(items, today, past), [items, today, past]);
  const types = CAL_TYPES.filter((t) => f.weeks.some((w) => w.byType[t.id]));

  return (
    <div className="cv-grid" style={{ gap: 14 }}>
      <div className="ex-fc-head">
        <div className="ex-fcts">
          {(
            [
              ['d7', 7],
              ['d14', 14],
              ['d30', 30],
              ['d60', 60],
            ] as const
          ).map(([k, d]) => (
            <div key={k} className="ex-fct">
              <b>{f.counts[k]}</b>
              <span>{past ? `past ${d} days` : `next ${d} days`}</span>
            </div>
          ))}
        </div>
        <label className="ex-toggle">
          <input type="checkbox" checked={past} onChange={(e) => setPast(e.target.checked)} /> Show past 60 days
        </label>
      </div>

      <div className="cv-grid cv-g2 ex-g2">
        <Card title="Workload by week" note={`Monday-start weeks · flagged when a week has ${f.threshold}+ items`}>
          <ChartBox
            label="Calendar items per week by type"
            height={240}
            spec={{
              type: 'bar',
              stacked: true,
              labels: f.weeks.map((w) => `${weekLabel(w)}${w.overloaded ? ' ⚠' : ''}`),
              datasets: types.map((t) => ({ label: t.id, data: f.weeks.map((w) => w.byType[t.id] || 0), color: t.color })),
            }}
          />
          {f.weeks.some((w) => w.overloaded) ? (
            <div className="ex-flags">
              {f.weeks
                .filter((w) => w.overloaded)
                .map((w) => (
                  <span key={w.start} className="ex-flag">
                    <AlertTriangle size={13} aria-hidden /> Overloaded week {fmtDate(w.start, false)}–{fmtDate(w.end, false)}: {w.total} items
                  </span>
                ))}
            </div>
          ) : (
            <div className="cv-dim" style={{ fontSize: 12, marginTop: 6 }}>No overloaded weeks in this window.</div>
          )}
        </Card>
        <Card title={`No owner · ${f.noOwner.length}`} note={`Open items ${past ? 'in the past 60 days' : 'in the next 60 days'} without an assigned owner`}>
          {f.noOwner.length === 0 ? (
            <Empty>Every item in this window has an owner.</Empty>
          ) : (
            <div className="ex-scroll">
              {f.noOwner.slice(0, 40).map((i) => (
                <button key={i.id} type="button" className="ex-noown" onClick={() => onOpen(i)}>
                  <UserX size={14} aria-hidden />
                  <span>
                    <b>{i.title}</b>
                    <em>
                      {fmtDate(i.date)} · {i.type} · add an owner
                    </em>
                  </span>
                </button>
              ))}
              {f.noOwner.length > 40 && <div className="cv-dim" style={{ fontSize: 12, padding: 6 }}>+ {f.noOwner.length - 40} more</div>}
            </div>
          )}
        </Card>
      </div>

      {f.groups.map((g) => (
        <Card key={g.id} title={`${g.label} · ${g.items.length}`} note={g.from === g.to ? fmtDate(g.from) : `${fmtDate(g.from)} – ${fmtDate(g.to)}`}>
          {g.items.length === 0 ? (
            <div className="cv-dim" style={{ fontSize: 13 }}>Nothing scheduled.</div>
          ) : (
            <div className="ex-aglist">
              {g.items.map((i) => (
                <ItemLine key={i.id} i={i} showDate onClick={() => onOpen(i)} />
              ))}
            </div>
          )}
        </Card>
      ))}
    </div>
  );
};

// ---------------- Event details & editor ----------------
export const EventDetail: React.FC<{ item: CalItem; manual?: CalendarEvent; onClose: () => void; onEdit: (e: CalendarEvent) => void }> = ({ item, manual, onClose, onEdit }) => {
  const { isManager, canEdit, actions, user, register, today } = useCommand();
  const [confirmDel, setConfirmDel] = useState(false);
  const act = item.activityId ? register.find((r) => r.id === item.activityId) : undefined;

  const toggleDone = async () => {
    if (!manual) return;
    const now = new Date().toISOString();
    const res = await eventStore.put({ ...manual, done: !manual.done, doneAt: !manual.done ? now : undefined, doneBy: !manual.done ? user.name : undefined, updatedAt: now, updatedBy: user.name });
    actions.toast(manual.done ? 'Marked as not done' : `Marked done${res === 'local' ? ' (saved in this browser only)' : ''}`);
    onClose();
  };

  return (
    <Modal
      title={item.title}
      sub={`${item.type} · ${item.marker} · ${fmtDate(item.date)}${item.time ? ` ${item.time}` : ''}`}
      onClose={onClose}
      width={560}
      footer={
        <>
          {manual && isManager && (
            <>
              <button type="button" className="cv-btn danger" onClick={() => setConfirmDel(true)}>
                Delete
              </button>
              <button type="button" className="cv-btn" onClick={() => onEdit(manual)}>
                Edit
              </button>
              <button type="button" className="cv-btn primary" onClick={toggleDone}>
                {manual.done ? 'Mark not done' : 'Mark done'}
              </button>
            </>
          )}
          {act && (
            <button
              type="button"
              className="cv-btn primary"
              onClick={() => {
                onClose();
                actions.openActivity(act.id);
              }}
            >
              {act.status === 'Completed' || !canEdit ? 'Open activity' : 'Open activity to update / mark complete'}
            </button>
          )}
          {!act && item.route && (
            <button
              type="button"
              className="cv-btn"
              onClick={() => {
                onClose();
                actions.navigate(item.route!);
              }}
            >
              Open page
            </button>
          )}
        </>
      }
    >
      <dl className="ex-dl">
        <dt>Status</dt>
        <dd>{item.done ? 'Done / completed' : item.overdue ? `Overdue by ${diffDays(item.date, today)} days` : 'Scheduled'}</dd>
        <dt>Owner</dt>
        <dd>{item.owner || <span className="ex-missing">Not assigned — add an owner{act ? ' in the activity editor' : ''}</span>}</dd>
        <dt>Details</dt>
        <dd>{item.sub || '—'}</dd>
        {act && (
          <>
            <dt>Schedule</dt>
            <dd>
              {fmtDate(act.start)} → {fmtDate(act.finish)} · {act.status} · {act.progress}%
            </dd>
          </>
        )}
        {manual?.doneBy && (
          <>
            <dt>Done</dt>
            <dd>
              {manual.doneBy} · {manual.doneAt ? fmtDate(manual.doneAt.slice(0, 10)) : ''}
            </dd>
          </>
        )}
        {manual && (
          <>
            <dt>Added by</dt>
            <dd>{manual.createdBy || '—'}</dd>
          </>
        )}
      </dl>
      {!manual && !isManager && <div className="cv-dim" style={{ fontSize: 12, marginTop: 8 }}>Dates of project activities are changed in the activity editor by authorized team members.</div>}
      {manual?.localOnly && <Banner kind="warn">Saved in this browser only — deploy the updated Firestore rules (events) to share calendar entries.</Banner>}
      {confirmDel && manual && (
        <ConfirmDialog
          title="Delete calendar entry?"
          message={`“${manual.title}” on ${fmtDate(manual.date)} will be removed from the calendar. Project activities are not affected.`}
          confirmLabel="Delete"
          danger
          onCancel={() => setConfirmDel(false)}
          onConfirm={async () => {
            try {
              await eventStore.remove(manual.id);
              actions.toast('Calendar entry deleted');
            } catch {
              actions.toast('Could not delete — check your permissions');
            }
            setConfirmDel(false);
            onClose();
          }}
        />
      )}
    </Modal>
  );
};

export const EventEditor: React.FC<{ initial?: CalendarEvent; date: string; onClose: () => void }> = ({ initial, date, onClose }) => {
  const { user, actions, register } = useCommand();
  const [f, setF] = useState<CalendarEvent>(
    () =>
      initial || {
        id: newId('EV'),
        date,
        type: 'Inspection',
        title: '',
        done: false,
        createdAt: '',
        createdBy: user.name,
        updatedAt: '',
        updatedBy: user.name,
      }
  );
  const [err, setErr] = useState('');
  const set = (p: Partial<CalendarEvent>) => setF((x) => ({ ...x, ...p }));

  const save = async () => {
    if (!f.title.trim()) return setErr('Add a title.');
    if (!isValidIso(f.date)) return setErr('Add a valid date.');
    const now = new Date().toISOString();
    const rec: CalendarEvent = {
      ...f,
      title: f.title.trim(),
      createdAt: f.createdAt || now,
      createdBy: f.createdBy || user.name,
      updatedAt: now,
      updatedBy: user.name,
    };
    Object.keys(rec).forEach((k) => ((rec as any)[k] === '' || (rec as any)[k] === undefined) && k !== 'title' && delete (rec as any)[k]);
    try {
      const res = await eventStore.put(rec);
      actions.toast(res === 'local' ? 'Saved in this browser only — deploy the Firestore rules to share it' : initial ? 'Calendar entry updated' : 'Calendar entry added');
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save the entry.');
    }
  };

  return (
    <Modal
      title={initial ? 'Edit calendar entry' : 'Add calendar entry'}
      sub="Inspections, site visits, deliveries, handover / turnover and meetings. Project activity dates are edited in the activity editor."
      onClose={onClose}
      width={560}
      footer={
        <>
          <button type="button" className="cv-btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="cv-btn primary" onClick={save}>
            Save
          </button>
        </>
      }
    >
      <div className="cv-grid cv-g2 ex-g2">
        <Field label="Title" className="cv-span2">
          <input className="cv-input" value={f.title} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. Building official inspection — GF slab" autoFocus />
        </Field>
        <Field label="Type">
          <select className="cv-input" value={f.type} onChange={(e) => set({ type: e.target.value as CalendarEventType })}>
            {EVENT_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Field>
        <Field label="Date (Asia/Manila)">
          <input type="date" className="cv-input" value={f.date} onChange={(e) => set({ date: e.target.value })} />
        </Field>
        <Field label="Time (optional)">
          <input type="time" className="cv-input" value={f.time || ''} onChange={(e) => set({ time: e.target.value || undefined })} />
        </Field>
        <Field label="Owner / responsible (optional)">
          <input className="cv-input" value={f.owner || ''} onChange={(e) => set({ owner: e.target.value })} />
        </Field>
        <Field label="Linked activity (optional)" className="cv-span2">
          <select className="cv-input" value={f.linkedActivityId || ''} onChange={(e) => set({ linkedActivityId: e.target.value || undefined })}>
            <option value="">— none —</option>
            {register.map((r) => (
              <option key={r.id} value={r.id}>
                {r.id} · {r.name.slice(0, 70)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Notes (optional)" className="cv-span2">
          <textarea className="cv-input" rows={3} value={f.notes || ''} onChange={(e) => set({ notes: e.target.value })} />
        </Field>
      </div>
      {err && <Banner kind="error">{err}</Banner>}
    </Modal>
  );
};

// ---------------- Page ----------------
type View = 'agenda' | 'month' | 'week' | 'day';

export const CalendarPage: React.FC<{ view?: string; param?: string }> = ({ view: v, param }) => {
  const { today, isManager, actions } = useCommand();
  const view: View = v === 'month' || v === 'week' || v === 'day' ? v : 'agenda';
  const anchor = isValidIso(param) ? param : today;
  const { items, manual, manualShared } = useCalendarItems();
  const [off, setOff] = useState<Partial<Record<CalType, boolean>>>({});
  const [sel, setSel] = useState<CalItem | null>(null);
  const [editing, setEditing] = useState<{ ev?: CalendarEvent; date: string } | null>(null);

  const shown = useMemo(() => items.filter((i) => !off[i.type]), [items, off]);
  const go = (date: string, vw: View = view) => actions.navigate(`calendar/${vw}/${date}`);

  const step = (dir: 1 | -1) => {
    if (view === 'month') {
      const d = new Date(anchor + 'T00:00:00');
      d.setMonth(d.getMonth() + dir, 1);
      go(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`);
    } else go(addDays(anchor, view === 'week' ? 7 * dir : view === 'day' ? dir : 30 * dir));
  };

  const title =
    view === 'month'
      ? monthLabel(monthRange(anchor).key)
      : view === 'week'
        ? `Week of ${fmtDate(weekRange(anchor).start)}`
        : view === 'day'
          ? fmtDate(anchor)
          : '60-Day Forecast';

  const openItem = (i: CalItem) => setSel(i);

  return (
    <div className="cv-grid" style={{ gap: 14 }}>
      <div className="ex-calbar">
        <div className="cv-row" style={{ gap: 6 }}>
          <button type="button" className="cv-btn sm" onClick={() => go(today)}>
            Today
          </button>
          {view !== 'agenda' && (
            <>
              <button type="button" className="cv-btn sm ghost" onClick={() => step(-1)} aria-label="Previous">
                <ChevronLeft size={16} />
              </button>
              <button type="button" className="cv-btn sm ghost" onClick={() => step(1)} aria-label="Next">
                <ChevronRight size={16} />
              </button>
            </>
          )}
          <b className="ex-caltitle">
            <CalendarDays size={16} aria-hidden /> {title}
          </b>
        </div>
        <div className="cv-row" style={{ gap: 6 }}>
          <span className="cv-dim" style={{ fontSize: 12 }}>Asia/Manila · weeks start Monday</span>
          {isManager && (
            <button type="button" className="cv-btn sm primary" onClick={() => setEditing({ date: view === 'agenda' ? today : anchor })}>
              <Plus size={14} aria-hidden /> Add event
            </button>
          )}
        </div>
      </div>

      <div className="ex-legend" role="group" aria-label="Event types">
        {CAL_TYPES.map((t) => (
          <button key={t.id} type="button" className={`ex-leg ${off[t.id] ? 'off' : ''}`} onClick={() => setOff((o) => ({ ...o, [t.id]: !o[t.id] }))} aria-pressed={!off[t.id]}>
            <span className="cv-dot" style={{ background: t.color }} /> {t.id}
            <em>{items.filter((i) => i.type === t.id).length}</em>
          </button>
        ))}
      </div>

      {!manualShared && manual.some((m) => m.localOnly) && (
        <Banner kind="warn">Some calendar entries are saved in this browser only until the updated Firestore rules (events) are deployed.</Banner>
      )}

      {items.length === 0 && <Empty>No dated activities yet — add start and target dates in the Master Project Tracker, or add a calendar entry.</Empty>}

      {view === 'agenda' && <ForecastPanel items={shown} onOpen={openItem} />}
      {view === 'month' && <MonthView items={shown} anchor={anchor} onOpen={openItem} onDay={(d) => go(d, 'day')} />}
      {view === 'week' && <WeekView items={shown} anchor={anchor} onOpen={openItem} onDay={(d) => go(d, 'day')} />}
      {view === 'day' && (
        <Card title={fmtDate(anchor)} note={anchor === today ? 'Today' : `${diffDays(today, anchor) > 0 ? 'In' : ''} ${Math.abs(diffDays(today, anchor))} days${diffDays(today, anchor) < 0 ? ' ago' : ''}`}>
          {inRange(shown, anchor, anchor).length === 0 ? (
            <Empty>Nothing scheduled on this day.</Empty>
          ) : (
            <div className="ex-aglist">
              {inRange(shown, anchor, anchor).map((i) => (
                <ItemLine key={i.id} i={i} onClick={() => openItem(i)} />
              ))}
            </div>
          )}
        </Card>
      )}

      {sel && (
        <EventDetail
          item={sel}
          manual={sel.manualId ? manual.find((m) => m.id === sel.manualId) : undefined}
          onClose={() => setSel(null)}
          onEdit={(ev) => {
            setSel(null);
            setEditing({ ev, date: ev.date });
          }}
        />
      )}
      {editing && <EventEditor initial={editing.ev} date={editing.date} onClose={() => setEditing(null)} />}
    </div>
  );
};

const MonthView: React.FC<{ items: CalItem[]; anchor: string; onOpen: (i: CalItem) => void; onDay: (d: string) => void }> = ({ items, anchor, onOpen, onDay }) => {
  const { today } = useCommand();
  const m = monthRange(anchor);
  const start = weekRange(m.start).start;
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const weeks = days[35] > m.end ? days.slice(0, 35) : days;
  return (
    <div className="ex-cal" role="grid" aria-label={monthLabel(m.key)}>
      {DOW.map((d) => (
        <div key={d} className="ex-cal-dow" role="columnheader">
          {d}
        </div>
      ))}
      {weeks.map((d) => {
        const list = inRange(items, d, d);
        const outside = d < m.start || d > m.end;
        return (
          <div key={d} className={`ex-cal-c ${outside ? 'out' : ''} ${d === today ? 'today' : ''}`} role="gridcell">
            <button type="button" className="ex-cal-n" onClick={() => onDay(d)} aria-label={`Open ${fmtDate(d)}`}>
              {Number(d.slice(8))}
            </button>
            {list.slice(0, 3).map((i) => (
              <button
                key={i.id}
                type="button"
                className={`ex-cal-ev ${i.done ? 'done' : ''} ${i.overdue ? 'late' : ''}`}
                style={{ background: CAL_COLOR[i.type] }}
                onClick={() => onOpen(i)}
                title={`${i.type} · ${i.marker}: ${i.title}`}
              >
                {i.title}
              </button>
            ))}
            {list.length > 3 && (
              <button type="button" className="ex-cal-more" onClick={() => onDay(d)}>
                +{list.length - 3} more
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
};

const WeekView: React.FC<{ items: CalItem[]; anchor: string; onOpen: (i: CalItem) => void; onDay: (d: string) => void }> = ({ items, anchor, onOpen, onDay }) => {
  const { today } = useCommand();
  const w = weekRange(anchor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(w.start, i));
  return (
    <div className="ex-wk">
      {days.map((d, idx) => {
        const list = inRange(items, d, d);
        return (
          <div key={d} className={`ex-wk-col ${d === today ? 'today' : ''}`}>
            <button type="button" className="ex-wk-h" onClick={() => onDay(d)}>
              <b>{DOW[idx]}</b> {fmtDate(d, false)}
              <em>{list.length}</em>
            </button>
            {list.length === 0 ? (
              <div className="cv-dim" style={{ fontSize: 12, padding: '4px 2px' }}>—</div>
            ) : (
              list.map((i) => <ItemLine key={i.id} i={i} onClick={() => onOpen(i)} />)
            )}
          </div>
        );
      })}
    </div>
  );
};
