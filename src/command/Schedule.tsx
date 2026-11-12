/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Construction calendar, unified schedule view and cross-calendar alignment.
 * All read from the same master register.
 */

import React, { useMemo, useState } from 'react';
import { useCommand } from './context.tsx';
import { RegisterActivity } from '../domain/register.ts';
import { addDays, fmtDate, fmtRange, monthLabel, monthRange, isValidIso } from '../domain/dates.ts';
import { ALIGNMENT_COLORS, AlignmentClass, alignmentSummary } from '../domain/alignment.ts';
import { PHILIPPINE_HOLIDAYS_SET, WORK_STOPPAGE_START, WORK_STOPPAGE_END, toIsoDate } from '../utils/calculations.ts';
import { StatusPill, Pill, Empty, Card, Modal, kindColor, STREAM_HEX } from './ui.tsx';

type Layer = 'construction' | 'pours' | 'milestones' | 'production';

const LAYER_META: Record<Layer, { label: string; color: string }> = {
  construction: { label: 'Construction', color: STREAM_HEX.Construction },
  pours: { label: 'Concrete pours', color: STREAM_HEX.Concrete },
  milestones: { label: 'Milestones', color: STREAM_HEX.Milestone },
  production: { label: 'Production shoots', color: STREAM_HEX.Production },
};

function layerOf(r: RegisterActivity): Layer {
  if (r.kind === 'pour') return 'pours';
  if (r.kind === 'milestone') return 'milestones';
  if (r.kind === 'episode' || r.stream === 'Production') return 'production';
  return 'construction';
}

const STOP_S = toIsoDate(WORK_STOPPAGE_START);
const STOP_E = toIsoDate(WORK_STOPPAGE_END);

export const ScheduleCalendar: React.FC<{ defaultLayers: Layer[]; title?: string }> = ({ defaultLayers }) => {
  const { register, today, actions, alignment } = useCommand();
  const [month, setMonth] = useState(today.slice(0, 7) + '-01');
  const [layers, setLayers] = useState<Set<Layer>>(new Set(defaultLayers));
  const [workstream, setWorkstream] = useState('');
  const [statusF, setStatusF] = useState('');
  const [view, setView] = useState<'month' | 'agenda'>('month');
  const [dayOpen, setDayOpen] = useState<string | null>(null);

  const classByEp = useMemo(() => new Map(alignment.map((a) => [a.episode.id, a.classification])), [alignment]);
  const workstreams = useMemo(() => Array.from(new Set(register.map((r) => r.workstream))).sort(), [register]);
  const items = useMemo(
    () =>
      register.filter(
        (r) => isValidIso(r.start) && layers.has(layerOf(r)) && (!workstream || r.workstream === workstream) && (!statusF || r.status === statusF)
      ),
    [register, layers, workstream, statusF]
  );

  const { start: mStart, end: mEnd, key } = monthRange(month);
  // Grid from Monday before month start to Sunday after month end
  const first = new Date(+mStart.slice(0, 4), +mStart.slice(5, 7) - 1, 1);
  const lead = (first.getDay() + 6) % 7;
  const gridStart = addDays(mStart, -lead);
  const days: string[] = [];
  for (let i = 0; i < 42; i++) {
    const d = addDays(gridStart, i);
    if (i >= 35 && d > mEnd) break;
    days.push(d);
  }

  const onDay = (d: string) => items.filter((r) => r.start! <= d && (r.finish || r.start)! >= d);
  const shift = (n: number) => {
    const d = new Date(+month.slice(0, 4), +month.slice(5, 7) - 1 + n, 1);
    setMonth(toIsoDate(d));
  };
  const toggle = (l: Layer) =>
    setLayers((prev) => {
      const next = new Set(prev);
      if (next.has(l)) next.delete(l);
      else next.add(l);
      return next;
    });

  const agenda = items.filter((r) => r.start! <= mEnd && (r.finish || r.start)! >= mStart);

  return (
    <div>
      <div className="cv-filters">
        <button type="button" className="cv-btn sm" onClick={() => shift(-1)} aria-label="Previous month">
          ◀
        </button>
        <button type="button" className="cv-btn sm ghost" onClick={() => setMonth(today.slice(0, 7) + '-01')}>
          Today
        </button>
        <button type="button" className="cv-btn sm" onClick={() => shift(1)} aria-label="Next month">
          ▶
        </button>
        <b style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 20, letterSpacing: 1.5, textTransform: 'uppercase' }}>{monthLabel(key)}</b>
        <span className="cv-spacer" />
        {(Object.keys(LAYER_META) as Layer[]).map((l) => (
          <label key={l} className="cv-chip" style={{ cursor: 'pointer', borderColor: layers.has(l) ? LAYER_META[l].color : undefined }}>
            <input type="checkbox" checked={layers.has(l)} onChange={() => toggle(l)} />
            <span className="cv-dot" style={{ background: LAYER_META[l].color }} /> {LAYER_META[l].label}
          </label>
        ))}
        <select className="cv-select" value={workstream} onChange={(e) => setWorkstream(e.target.value)} aria-label="Workstream filter">
          <option value="">All workstreams</option>
          {workstreams.map((w) => (
            <option key={w}>{w}</option>
          ))}
        </select>
        <select className="cv-select" value={statusF} onChange={(e) => setStatusF(e.target.value)} aria-label="Status filter">
          <option value="">All statuses</option>
          {['Upcoming', 'Ongoing', 'Delayed', 'Completed', 'On Hold'].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <div className="cv-row" style={{ gap: 4 }}>
          <button type="button" className={`cv-btn sm ${view === 'month' ? 'purple' : 'ghost'}`} onClick={() => setView('month')}>
            Month
          </button>
          <button type="button" className={`cv-btn sm ${view === 'agenda' ? 'purple' : 'ghost'}`} onClick={() => setView('agenda')}>
            Agenda
          </button>
        </div>
      </div>

      {view === 'month' ? (
        <div className="cv-cal" role="grid" aria-label={`Calendar ${monthLabel(key)}`}>
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
            <div key={d} className="cv-cal-dow">
              {d}
            </div>
          ))}
          {days.map((d) => {
            const evs = onDay(d);
            const dt = new Date(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
            const off = dt.getDay() === 0 || PHILIPPINE_HOLIDAYS_SET.has(d) || (d >= STOP_S && d <= STOP_E);
            const shown = evs.slice(0, 4);
            return (
              <div key={d} className={`cv-cal-cell ${d < mStart || d > mEnd ? 'out' : ''} ${d === today ? 'today' : ''} ${off ? 'off' : ''}`} role="gridcell">
                <div className="cv-cal-d">
                  <span>{+d.slice(8, 10)}</span>
                  {PHILIPPINE_HOLIDAYS_SET.has(d) && <span title="Holiday">🎌</span>}
                </div>
                {shown.map((r) => {
                  const cls = r.kind === 'episode' ? classByEp.get(r.id) : undefined;
                  return (
                    <button
                      type="button"
                      key={r.id}
                      className="cv-cal-ev"
                      style={{ borderLeftColor: kindColor(r.kind, r.stream), outline: r.status === 'Delayed' ? '1px solid #D92D3F' : cls === 'Conflict' ? '1px solid #D92D3F' : undefined }}
                      title={`${r.name} · ${r.workstream} · ${fmtRange(r.start, r.finish)} · ${r.status}${cls ? ` · ${cls}` : ''}`}
                      onClick={() => actions.openActivity(r.id)}
                    >
                      {r.status === 'Completed' ? '✓ ' : r.status === 'Delayed' ? '! ' : ''}
                      {r.name}
                    </button>
                  );
                })}
                {evs.length > shown.length && (
                  <button type="button" className="cv-cal-more" onClick={() => setDayOpen(d)}>
                    +{evs.length - shown.length} more
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ) : agenda.length ? (
        <AgendaList items={agenda} classByEp={classByEp} />
      ) : (
        <Empty>No activities in {monthLabel(key)} for the selected layers.</Empty>
      )}
      <div className="cv-legend">
        <span>
          <span className="cv-sw" style={{ background: 'repeating-linear-gradient(135deg,rgba(224,33,59,.35) 0 4px,transparent 4px 8px)' }} /> Non-working (Sunday, holiday, stoppage)
        </span>
        <span>✓ completed</span>
        <span style={{ color: '#D92D3F' }}>! delayed / conflict (red outline)</span>
      </div>
      {dayOpen && (
        <Modal title={`Activities on ${fmtDate(dayOpen)}`} onClose={() => setDayOpen(null)} width={640}>
          <AgendaList items={onDay(dayOpen)} classByEp={classByEp} onPick={() => setDayOpen(null)} />
        </Modal>
      )}
    </div>
  );
};

const AgendaList: React.FC<{ items: RegisterActivity[]; classByEp: Map<string, AlignmentClass>; onPick?: () => void }> = ({ items, classByEp, onPick }) => {
  const { actions } = useCommand();
  return (
    <div className="cv-list">
      {items.map((r) => {
        const cls = classByEp.get(r.id);
        return (
          <button
            type="button"
            key={r.id}
            className="cv-li clickable"
            style={{ textAlign: 'left', color: 'inherit' }}
            onClick={() => {
              onPick?.();
              actions.openActivity(r.id);
            }}
          >
            <span className="cv-sev" style={{ background: kindColor(r.kind, r.stream) }} />
            <div className="cv-li-main">
              <div className="cv-li-t">{r.name}</div>
              <div className="cv-li-s">
                {r.workstream} · {fmtRange(r.start, r.finish)} · {r.owner || 'Unassigned'}
                {r.kind === 'episode' && r.characters.length ? ` · ${r.characters.length} character(s)` : ''}
              </div>
              {r.dependsOn.length > 0 && <div className="cv-li-s">Depends on {r.dependsOn.length} activit{r.dependsOn.length === 1 ? 'y' : 'ies'}</div>}
            </div>
            <div className="cv-row" style={{ flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
              <StatusPill status={r.status} />
              {cls && <Pill label={cls} color={ALIGNMENT_COLORS[cls]} />}
            </div>
          </button>
        );
      })}
    </div>
  );
};

// ---------- Cross-calendar alignment ----------
export const AlignmentView: React.FC = () => {
  const { alignment, actions, today } = useCommand();
  const [cls, setCls] = useState<string>('');
  const [showPast, setShowPast] = useState(false);
  const summary = alignmentSummary(alignment);
  const rows = alignment
    .filter((a) => !cls || a.classification === cls)
    .filter((a) => showPast || a.classification !== 'Completed' || (a.episode.finish || '') >= addDays(today, -14))
    .sort((a, b) => (a.episode.start || '').localeCompare(b.episode.start || ''));

  return (
    <div className="cv-grid" style={{ gap: 14 }}>
      <Card title="How alignment works" note="Production and construction calendars stay independent">
        <div className="cv-sub" style={{ marginTop: 0 }}>
          Each shoot window is compared with the construction schedule. When a date changes in one calendar, the other is <b>never overwritten</b>; instead
          this view raises a coordination or conflict alert. Links between an episode and the construction scope it documents are taken from the episode's
          declared dependencies, otherwise auto-matched from its “scope of work” text (marked <i>auto-matched</i> — confirm or set dependencies in the editor).
        </div>
        <div className="cv-row" style={{ marginTop: 10, gap: 6 }}>
          <button type="button" className={`cv-btn sm ${cls === '' ? 'purple' : 'ghost'}`} onClick={() => setCls('')}>
            All ({alignment.length})
          </button>
          {(Object.keys(summary) as AlignmentClass[]).map((k) => (
            <button
              type="button"
              key={k}
              className={`cv-btn sm ${cls === k ? 'purple' : 'ghost'}`}
              style={{ borderColor: ALIGNMENT_COLORS[k] }}
              onClick={() => setCls(cls === k ? '' : k)}
            >
              <span className="cv-dot" style={{ background: ALIGNMENT_COLORS[k] }} /> {k} ({summary[k]})
            </button>
          ))}
          <label className="cv-row" style={{ fontSize: 13 }}>
            <input type="checkbox" checked={showPast} onChange={(e) => setShowPast(e.target.checked)} /> Show older completed shoots
          </label>
        </div>
      </Card>
      {rows.length ? (
        <div className="cv-table-wrap">
          <table className="cv-table">
            <thead>
              <tr>
                <th className="sticky">Episode / shoot</th>
                <th>Shoot window</th>
                <th>Class</th>
                <th>Construction linked / overlapping</th>
                <th>Characters</th>
                <th>Alerts & required coordination</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.episode.id} className="clickable" onClick={() => actions.openActivity(a.episode.id)}>
                  <td className="sticky" style={{ minWidth: 200 }}>
                    <div className="cv-strong">{a.episode.name}</div>
                    <div className="cv-dim">
                      {a.episode.episodeStatus} · {a.episode.location || 'Location TBC'} · {a.episode.owner || 'No director'}
                    </div>
                  </td>
                  <td className="nowrap">
                    {fmtRange(a.episode.start, a.episode.finish)}
                    {a.episode.revisionCount > 0 && <div className="cv-late">Re-scheduled {a.episode.revisionCount}×</div>}
                  </td>
                  <td>
                    <Pill label={a.classification} color={ALIGNMENT_COLORS[a.classification]} />
                  </td>
                  <td style={{ minWidth: 220 }}>
                    {a.linked.length ? (
                      a.linked.map((l) => (
                        <div key={l.scope.id}>
                          <span className={l.overlapping ? 'cv-good' : 'cv-late'}>{l.overlapping ? '●' : '○'}</span> {l.scope.name}{' '}
                          <span className="cv-dim">
                            ({l.scope.workstream}, {fmtRange(l.scope.start, l.scope.finish)}
                            {l.explicit ? '' : ', auto'})
                          </span>
                        </div>
                      ))
                    ) : (
                      <span className="cv-dim">No linked scope</span>
                    )}
                    {a.overlappingConstruction.length > 0 && (
                      <div className="cv-dim">{a.overlappingConstruction.length} construction activit{a.overlappingConstruction.length === 1 ? 'y' : 'ies'} on site during shoot</div>
                    )}
                  </td>
                  <td style={{ maxWidth: 200 }} className="cv-dim">
                    {a.episode.characters.length ? a.episode.characters.join(', ') : '—'}
                  </td>
                  <td style={{ minWidth: 260 }}>
                    {a.alerts.length ? (
                      a.alerts.map((al, i) => (
                        <div key={i} style={{ fontSize: 12, marginBottom: 3, color: al.severity === 'critical' ? '#D92D3F' : al.severity === 'warn' ? '#9A6A00' : undefined }}>
                          {al.severity === 'critical' ? '⛔' : al.severity === 'warn' ? '⚠️' : 'ℹ️'} {al.message}
                        </div>
                      ))
                    ) : (
                      <span className="cv-good">No coordination needed</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty>No shoots in this classification.</Empty>
      )}
      <Card title="Unified schedule view" note="Construction, concrete pours, milestones and production shoots on one calendar">
        <ScheduleCalendar defaultLayers={['construction', 'pours', 'milestones', 'production']} />
      </Card>
    </div>
  );
};
