/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * 06 — MASTER GANTT & TIMELINE. Synchronized with the master register.
 * Shows baseline (thin grey) vs current schedule (bar) vs actual (green
 * line), milestone diamonds, today line, stoppage and critical path.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useCommand } from './context.tsx';
import { RegisterActivity } from '../domain/register.ts';
import { criticalPath, scheduleWindow } from '../domain/metrics.ts';
import { addDays, diffDays, fmtRange, isValidIso, todayIso } from '../domain/dates.ts';
import { WORK_STOPPAGE_START, WORK_STOPPAGE_END, toIsoDate } from '../utils/calculations.ts';
import { Banner, Empty, STATUS_HEX, kindColor } from './ui.tsx';

type Zoom = 'month' | 'week' | 'day';
const PX: Record<Zoom, number> = { month: 4, week: 16, day: 44 };
const LABEL_W = 280;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const Gantt: React.FC = () => {
  const { register, actions, today } = useCommand();
  const [zoom, setZoom] = useState<Zoom>('week');
  const [workstream, setWorkstream] = useState('');
  const [stream, setStream] = useState('');
  const [q, setQ] = useState('');
  const [delayedOnly, setDelayedOnly] = useState(false);
  const [critOnly, setCritOnly] = useState(false);
  const [group, setGroup] = useState(true);
  const scroller = useRef<HTMLDivElement>(null);

  const crit = useMemo(() => new Set(criticalPath(register)), [register]);
  const workstreams = useMemo(() => Array.from(new Set(register.map((r) => r.workstream))).sort(), [register]);
  const win = useMemo(() => scheduleWindow(register), [register]);
  const start = addDays(win.start, -3);
  const end = addDays(win.end, 7);
  const totalDays = diffDays(start, end) + 1;
  const px = PX[zoom];
  const width = totalDays * px;
  const x = (iso: string) => diffDays(start, iso) * px;

  const rows = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return register.filter(
      (r) =>
        (isValidIso(r.start) || isValidIso(r.plannedStart)) &&
        (!workstream || r.workstream === workstream) &&
        (!stream || r.stream === stream) &&
        (!ql || `${r.name} ${r.owner} ${r.id}`.toLowerCase().includes(ql)) &&
        (!delayedOnly || r.status === 'Delayed' || r.slipDays > 0) &&
        (!critOnly || crit.has(r.id) || r.priority === 'Critical')
    );
  }, [register, workstream, stream, q, delayedOnly, critOnly, crit]);

  const grouped = useMemo(() => {
    if (!group) return [{ name: '', items: rows }];
    const order = ['Milestones', 'GF · Structural', '2F · Structural', '3F · Structural', 'Concrete pours', 'GF · Finishing', '2F · Finishing', '3F · Finishing', 'Production'];
    const map = new Map<string, RegisterActivity[]>();
    rows.forEach((r) => map.set(r.workstream, [...(map.get(r.workstream) || []), r]));
    return Array.from(map.entries())
      .sort((a, b) => {
        const ia = order.indexOf(a[0]);
        const ib = order.indexOf(b[0]);
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a[0].localeCompare(b[0]);
      })
      .map(([name, items]) => ({ name, items }));
  }, [rows, group]);

  // Scroll to today on zoom change
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const t = todayIso();
    el.scrollLeft = Math.max(0, x(t) - el.clientWidth / 3);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, start]);

  // Header ticks
  const ticks: { left: number; label: string; major: boolean }[] = [];
  for (let i = 0; i < totalDays; i++) {
    const iso = addDays(start, i);
    const d = new Date(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
    if (zoom === 'month' && d.getDate() === 1) ticks.push({ left: i * px, label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}`, major: true });
    if (zoom === 'week' && d.getDay() === 1) ticks.push({ left: i * px, label: `${MONTHS[d.getMonth()]} ${d.getDate()}`, major: d.getDate() <= 7 });
    if (zoom === 'day') ticks.push({ left: i * px, label: `${['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'][d.getDay()]} ${d.getDate()}${d.getDate() === 1 ? ` ${MONTHS[d.getMonth()]}` : ''}`, major: d.getDate() === 1 });
  }
  const stopL = x(toIsoDate(WORK_STOPPAGE_START));
  const stopW = (diffDays(toIsoDate(WORK_STOPPAGE_START), toIsoDate(WORK_STOPPAGE_END)) + 1) * px;
  const todayX = x(today);
  const hasDeps = register.some((r) => r.dependsOn.length);

  return (
    <div>
      <div className="cv-filters">
        <div className="cv-row" style={{ gap: 4 }} role="group" aria-label="Zoom">
          {(['month', 'week', 'day'] as Zoom[]).map((z) => (
            <button key={z} type="button" className={`cv-btn sm ${zoom === z ? 'purple' : 'ghost'}`} onClick={() => setZoom(z)}>
              {z === 'month' ? 'Monthly' : z === 'week' ? 'Weekly' : 'Daily'}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="cv-btn sm ghost"
          onClick={() => {
            const el = scroller.current;
            if (el) el.scrollLeft = Math.max(0, todayX - el.clientWidth / 3);
          }}
        >
          Go to today
        </button>
        <input type="search" className="cv-input" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search Gantt" />
        <select className="cv-select" value={stream} onChange={(e) => setStream(e.target.value)} aria-label="Stream">
          <option value="">All streams</option>
          <option>Construction</option>
          <option>Production</option>
          <option>Milestone</option>
        </select>
        <select className="cv-select" value={workstream} onChange={(e) => setWorkstream(e.target.value)} aria-label="Workstream">
          <option value="">All workstreams</option>
          {workstreams.map((w) => (
            <option key={w}>{w}</option>
          ))}
        </select>
        <label className="cv-row" style={{ fontSize: 13 }}>
          <input type="checkbox" checked={delayedOnly} onChange={(e) => setDelayedOnly(e.target.checked)} /> Delayed / slipped only
        </label>
        <label className="cv-row" style={{ fontSize: 13 }}>
          <input type="checkbox" checked={critOnly} onChange={(e) => setCritOnly(e.target.checked)} /> Critical only
        </label>
        <label className="cv-row" style={{ fontSize: 13 }}>
          <input type="checkbox" checked={group} onChange={(e) => setGroup(e.target.checked)} /> Group by workstream
        </label>
      </div>
      {!hasDeps && (
        <Banner kind="info">
          Critical path: no activity dependencies are recorded yet, so a true critical path cannot be calculated (nothing is guessed). Add predecessors in
          the activity editor; until then, “Critical only” shows activities marked Critical priority (e.g. the 2F controlling milestone).
        </Banner>
      )}
      <div className="cv-legend">
        <span>
          <span className="cv-sw" style={{ background: '#8746D6' }} /> Ongoing
        </span>
        <span>
          <span className="cv-sw" style={{ background: '#22A05A' }} /> Completed
        </span>
        <span>
          <span className="cv-sw" style={{ background: '#D92D3F' }} /> Delayed
        </span>
        <span>
          <span className="cv-sw" style={{ background: '#D9D8E0' }} /> Upcoming
        </span>
        <span>
          <span className="cv-sw" style={{ height: 4, background: 'var(--cv-baseline)' }} /> Baseline (original plan)
        </span>
        <span>
          <span className="cv-sw" style={{ height: 3, background: '#22A05A' }} /> Actual
        </span>
        <span>◆ Milestone / pour</span>
        <span>
          <span className="cv-sw" style={{ outline: '2px solid #D58BEA' }} /> Critical path
        </span>
        <span>
          <span className="cv-sw" style={{ width: 2, background: '#A45BE8' }} /> Today
        </span>
      </div>
      {rows.length === 0 ? (
        <Empty>No activities match the current filters.</Empty>
      ) : (
        <div className="cv-gantt" ref={scroller}>
          <div className="cv-g-inner" style={{ width: LABEL_W + width }}>
            <div className="cv-g-head" style={{ height: 30 }}>
              <div className="cv-g-labelcol" style={{ width: LABEL_W }}>
                Activity ({rows.length})
              </div>
              <div className="cv-g-scale" style={{ width }}>
                {ticks.map((t) => (
                  <div key={t.left} className="cv-g-tick" style={{ left: t.left, width: zoom === 'day' ? px : undefined, color: t.major ? 'var(--cv-accent)' : undefined }}>
                    {t.label}
                  </div>
                ))}
              </div>
            </div>
            <div style={{ position: 'relative' }}>
              <div className="cv-g-off" style={{ left: LABEL_W + stopL, width: stopW }} title="Holiday work stoppage" />
              {todayX >= 0 && todayX <= width && <div className="cv-g-today" style={{ left: LABEL_W + todayX }} />}
              {grouped.map((g) => (
                <React.Fragment key={g.name || 'all'}>
                  {g.name && (
                    <div className="cv-g-row group">
                      <div className="cv-g-labelcol cv-g-label" style={{ width: LABEL_W }}>
                        {g.name} · {g.items.length}
                      </div>
                      <div className="cv-g-track" style={{ width }} />
                    </div>
                  )}
                  {g.items.map((r) => (
                    <GanttRow key={r.id} r={r} x={x} width={width} px={px} crit={crit.has(r.id)} onOpen={() => actions.openActivity(r.id)} />
                  ))}
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const GanttRow: React.FC<{ r: RegisterActivity; x: (iso: string) => number; width: number; px: number; crit: boolean; onOpen: () => void }> = ({
  r,
  x,
  width,
  px,
  crit,
  onOpen,
}) => {
  const isPoint = r.kind === 'milestone' || r.kind === 'pour';
  const s = r.start || r.plannedStart!;
  const f = r.finish || r.start || r.plannedFinish || s;
  const color = r.status === 'Completed' ? STATUS_HEX.Completed : r.status === 'Delayed' ? STATUS_HEX.Delayed : r.status === 'Ongoing' ? STATUS_HEX.Ongoing : r.status === 'On Hold' ? '#C4C2CC' : '#D9D8E0';
  const tip = `${r.name}\n${r.workstream} · ${r.status}\nBaseline: ${fmtRange(r.plannedStart, r.plannedFinish)}\nCurrent: ${fmtRange(r.start, r.finish)}\nActual: ${fmtRange(r.actualStart, r.actualFinish || (r.actualStart ? todayIso() : undefined))}\nProgress ${r.progress}% (planned ${r.plannedProgress}%)\nOwner: ${r.owner || 'Unassigned'}`;
  return (
    <div className="cv-g-row">
      <div className="cv-g-labelcol cv-g-label" style={{ width: LABEL_W }} onClick={onOpen} title={tip}>
        <span className="cv-dot" style={{ background: kindColor(r.kind, r.stream) }} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</span>
        {r.slipDays > 0 && <span className="cv-late" style={{ fontSize: 11 }}>+{r.slipDays}d</span>}
      </div>
      <div className="cv-g-track" style={{ width }}>
        {r.plannedStart && r.revisionCount > 0 && (
          <div className="cv-g-base" style={{ left: x(r.plannedStart), width: Math.max(px, (diffDays(r.plannedStart, r.plannedFinish || r.plannedStart) + 1) * px) }} title="Baseline" />
        )}
        {isPoint ? (
          <>
            {f !== s && <div className="cv-g-bar" style={{ left: x(s), width: (diffDays(s, f) + 1) * px, background: `${color}66`, top: 12, height: 6 }} />}
            <div className={`cv-g-diamond ${crit ? 'cv-g-crit' : ''}`} style={{ left: x(f) + px / 2, background: r.kind === 'pour' ? '#6C63E0' : r.status === 'Completed' ? '#22A05A' : r.status === 'Delayed' ? '#D92D3F' : '#D58BEA' }} title={tip} onClick={onOpen} />
          </>
        ) : (
          <div className={`cv-g-bar ${crit ? 'cv-g-crit' : ''}`} style={{ left: x(s), width: Math.max(4, (diffDays(s, f) + 1) * px), background: color }} title={tip} onClick={onOpen}>
            <b style={{ width: `${r.progress}%` }} />
          </div>
        )}
        {r.actualStart && (
          <div className="cv-g-actual" style={{ left: x(r.actualStart), width: Math.max(3, (diffDays(r.actualStart, r.actualFinish || todayIso()) + 1) * px) }} title={`Actual ${fmtRange(r.actualStart, r.actualFinish)}`} />
        )}
      </div>
    </div>
  );
};
