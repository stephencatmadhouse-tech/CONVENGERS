/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Command Center charts (pure SVG, no libraries): progress ring, schedule
 * gauge, interactive S-curve and weekly progress bars. Values that are not
 * recorded (null) are drawn as gaps and labelled "Not recorded" — never as 0.
 */

import React, { useEffect, useRef, useState } from 'react';
import type { SCurvePoint, WeekBar } from '../domain/commandCenter.ts';
import { fmtDate, fmtRange } from '../domain/dates.ts';

export function useWidth<T extends HTMLElement>(fallback = 600): [React.RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((e) => setW(Math.max(220, Math.round(e[0].contentRect.width))));
    ro.observe(el);
    setW(Math.max(220, Math.round(el.getBoundingClientRect().width)));
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

export const C = {
  navy: 'var(--cv-th, #0A1140)',
  actual: '#1F6FE0',
  planned: '#94A3B8',
  forecast: '#D97706',
  good: '#1F9D68',
  warn: '#D97706',
  bad: '#DC3545',
  track: 'var(--cv-track, #E5E7EB)',
};

/** Circular progress (0–100). `marker` draws a tick at the planned value. null = not recorded. */
export const Ring: React.FC<{ value: number | null; size?: number; stroke?: number; color?: string; marker?: number | null; children?: React.ReactNode; label: string }> = ({
  value,
  size = 96,
  stroke = 9,
  color = C.actual,
  marker,
  children,
  label,
}) => {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = value === null ? 0 : Math.max(0, Math.min(100, value));
  const mk = marker === null || marker === undefined ? null : Math.max(0, Math.min(100, marker));
  const ang = mk === null ? 0 : (mk / 100) * 2 * Math.PI - Math.PI / 2;
  return (
    <div className="cc2-ring" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={C.track} strokeWidth={stroke} />
        {value !== null && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${(v / 100) * c} ${c}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            className="cc2-ring-arc"
          />
        )}
        {mk !== null && (
          <line
            x1={size / 2 + Math.cos(ang) * (r - stroke / 1.2)}
            y1={size / 2 + Math.sin(ang) * (r - stroke / 1.2)}
            x2={size / 2 + Math.cos(ang) * (r + stroke / 1.2)}
            y2={size / 2 + Math.sin(ang) * (r + stroke / 1.2)}
            stroke={C.navy}
            strokeWidth={2.5}
          />
        )}
      </svg>
      <div className="cc2-ring-c">{children}</div>
    </div>
  );
};

/** Half-circle gauge for the schedule performance index (0 – 1.5). */
export const SpiGauge: React.FC<{ spi: number | null; size?: number }> = ({ spi, size = 120 }) => {
  const h = size / 2 + 8;
  const r = size / 2 - 8;
  const cx = size / 2;
  const cy = size / 2;
  const arc = (from: number, to: number) => {
    const a0 = Math.PI * (1 - from / 1.5);
    const a1 = Math.PI * (1 - to / 1.5);
    return `M ${cx + r * Math.cos(a0)} ${cy - r * Math.sin(a0)} A ${r} ${r} 0 0 1 ${cx + r * Math.cos(a1)} ${cy - r * Math.sin(a1)}`;
  };
  const v = spi === null ? null : Math.max(0, Math.min(1.5, spi));
  const a = v === null ? 0 : Math.PI * (1 - v / 1.5);
  return (
    <svg width={size} height={h} viewBox={`0 0 ${size} ${h}`} role="img" aria-label={spi === null ? 'Schedule performance index not available' : `Schedule performance index ${spi.toFixed(2)}`}>
      <path d={arc(0, 0.9)} stroke={C.bad} strokeWidth={8} fill="none" opacity={0.85} />
      <path d={arc(0.9, 0.97)} stroke={C.warn} strokeWidth={8} fill="none" opacity={0.85} />
      <path d={arc(0.97, 1.5)} stroke={C.good} strokeWidth={8} fill="none" opacity={0.85} />
      {v !== null && (
        <>
          <line x1={cx} y1={cy} x2={cx + (r - 14) * Math.cos(a)} y2={cy - (r - 14) * Math.sin(a)} stroke={C.navy} strokeWidth={3} strokeLinecap="round" className="cc2-needle" />
          <circle cx={cx} cy={cy} r={5} fill={C.navy} />
        </>
      )}
    </svg>
  );
};

// ------------------------------------------------------------------ S-curve
const SERIES = [
  { k: 'planned', label: 'Planned (baseline)', color: C.planned, dash: '6 5' },
  { k: 'actual', label: 'Actual (recorded)', color: C.actual, dash: '' },
  { k: 'forecast', label: 'Forecast (current schedule)', color: C.forecast, dash: '3 4' },
] as const;

export const SCurveChart: React.FC<{ points: SCurvePoint[]; today: string; target: string; height?: number }> = ({ points, today, target, height = 260 }) => {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const [off, setOff] = useState<Record<string, boolean>>({});
  if (points.length < 2) return <p className="cv-dim">Not enough schedule data to draw the curve.</p>;
  const pad = { l: 36, r: 12, t: 12, b: 26 };
  const W = width;
  const H = height;
  const t0 = Date.parse(points[0].date);
  const t1 = Date.parse(points[points.length - 1].date);
  const x = (d: string) => pad.l + ((Date.parse(d) - t0) / Math.max(1, t1 - t0)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - v / 100) * (H - pad.t - pad.b);
  const path = (k: 'planned' | 'actual' | 'forecast') => {
    let d = '';
    let pen = false;
    points.forEach((p) => {
      const v = p[k];
      if (v === null) {
        pen = k === 'actual' ? false : pen; // actual: gaps where nothing was recorded
        return;
      }
      d += `${pen ? 'L' : 'M'} ${x(p.date).toFixed(1)} ${y(v).toFixed(1)} `;
      pen = true;
    });
    return d;
  };
  const months: string[] = [];
  for (let d = new Date(t0); d.getTime() <= t1; d.setUTCMonth(d.getUTCMonth() + 1, 1)) months.push(d.toISOString().slice(0, 8) + '01');
  const tickEvery = W < 480 ? 2 : 1;
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const px = e.clientX - rect.left;
    let best = 0;
    let bd = Infinity;
    points.forEach((p, i) => {
      const dd = Math.abs(x(p.date) - px);
      if (dd < bd) {
        bd = dd;
        best = i;
      }
    });
    setHover(best);
  };
  const hp = hover !== null ? points[hover] : null;
  const fmt = (v: number | null) => (v === null ? 'Not recorded' : `${v}%`);
  return (
    <div className="cc2-chart" ref={ref}>
      <div className="cc2-legend" role="group" aria-label="Show or hide lines">
        {SERIES.map((s) => (
          <button key={s.k} type="button" aria-pressed={!off[s.k]} className={off[s.k] ? 'off' : ''} onClick={() => setOff({ ...off, [s.k]: !off[s.k] })}>
            <i style={{ borderTopColor: s.color, borderTopStyle: s.dash ? 'dashed' : 'solid' }} /> {s.label}
          </button>
        ))}
      </div>
      <svg width={W} height={H} onPointerMove={onMove} onPointerLeave={() => setHover(null)} role="img" aria-label="Planned versus actual cumulative progress">
        {[0, 25, 50, 75, 100].map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="var(--cv-line)" />
            <text x={pad.l - 6} y={y(v) + 4} textAnchor="end" className="cc2-ax">
              {v}%
            </text>
          </g>
        ))}
        {months.map((d, i) =>
          i % tickEvery === 0 && Date.parse(d) >= t0 ? (
            <text key={d} x={x(d)} y={H - 8} textAnchor="middle" className="cc2-ax">
              {new Date(d + 'T00:00:00').toLocaleString('en-US', { month: 'short' })}
            </text>
          ) : null
        )}
        {Date.parse(target) <= t1 && (
          <g>
            <line x1={x(target)} x2={x(target)} y1={pad.t} y2={H - pad.b} stroke={C.navy} strokeDasharray="2 3" opacity={0.6} />
            <text x={x(target) - 4} y={pad.t + 10} textAnchor="end" className="cc2-ax">
              Target
            </text>
          </g>
        )}
        <line x1={x(today)} x2={x(today)} y1={pad.t} y2={H - pad.b} stroke={C.actual} opacity={0.35} />
        <text x={x(today) + 4} y={pad.t + 10} className="cc2-ax">
          Today
        </text>
        {SERIES.map((s) =>
          off[s.k] ? null : <path key={s.k} d={path(s.k)} fill="none" stroke={s.color} strokeWidth={s.k === 'actual' ? 3 : 2} strokeDasharray={s.dash} strokeLinejoin="round" />
        )}
        {!off.actual &&
          points.map((p) =>
            p.actual !== null ? <circle key={p.date} cx={x(p.date)} cy={y(p.actual)} r={3.5} fill={C.actual} stroke="var(--cv-panel)" strokeWidth={1.5} /> : null
          )}
        {hp && (
          <line x1={x(hp.date)} x2={x(hp.date)} y1={pad.t} y2={H - pad.b} stroke="var(--cv-muted)" strokeDasharray="3 3" />
        )}
      </svg>
      {hp && (
        <div className="cc2-tip" style={{ left: Math.min(Math.max(x(hp.date) - 80, 0), W - 170) }}>
          <b>{fmtDate(hp.date)}</b>
          {!off.planned && <span>Planned: {fmt(hp.planned)}</span>}
          {!off.actual && <span>Actual: {fmt(hp.actual)}</span>}
          {!off.forecast && hp.forecast !== null && <span>Forecast: {hp.forecast}%</span>}
        </div>
      )}
    </div>
  );
};

// ------------------------------------------------------------------ weekly bars
export const WeeklyBars: React.FC<{ bars: WeekBar[]; selected: string | null; onSelect: (start: string) => void; height?: number }> = ({ bars, selected, onSelect, height = 220 }) => {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  if (!bars.length) return <p className="cv-dim">No weeks in this period yet.</p>;
  const pad = { l: 34, r: 8, t: 14, b: 30 };
  const vals = bars.flatMap((b) => [b.gain ?? 0, b.plannedGain]);
  const max = Math.max(1, ...vals.map((v) => Math.abs(v)));
  const top = Math.ceil(max);
  const minV = Math.min(0, ...vals);
  const bottom = Math.floor(minV);
  const H = height;
  const W = width;
  const y = (v: number) => pad.t + ((top - v) / Math.max(0.1, top - bottom)) * (H - pad.t - pad.b);
  const slot = (W - pad.l - pad.r) / bars.length;
  const bw = Math.min(26, slot / 3);
  const labelEvery = slot < 34 ? Math.ceil(34 / slot) : 1;
  const hb = hover !== null ? bars[hover] : null;
  return (
    <div className="cc2-chart" ref={ref}>
      <div className="cc2-legend static">
        <span>
          <i className="sq" style={{ background: C.planned }} /> Planned gain
        </span>
        <span>
          <i className="sq" style={{ background: C.actual }} /> Actual gain (recorded)
        </span>
        <span>
          <i className="sq hatch" /> Not recorded
        </span>
      </div>
      <svg width={W} height={H} role="img" aria-label="Weekly progress in percentage points" onPointerLeave={() => setHover(null)}>
        {[bottom, 0, top].filter((v, i, a) => a.indexOf(v) === i).map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke={v === 0 ? 'var(--cv-muted)' : 'var(--cv-line)'} />
            <text x={pad.l - 6} y={y(v) + 4} textAnchor="end" className="cc2-ax">
              {v > 0 ? '+' : ''}
              {v}
            </text>
          </g>
        ))}
        <defs>
          <pattern id="cc2-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="#94A3B8" strokeWidth="2" />
          </pattern>
        </defs>
        {bars.map((b, i) => {
          const cx = pad.l + slot * i + slot / 2;
          const on = selected === b.start;
          const g = b.gain;
          return (
            <g
              key={b.start}
              className={`cc2-bar ${on ? 'on' : ''}`}
              onPointerEnter={() => setHover(i)}
              onClick={() => onSelect(b.start)}
              role="button"
              tabIndex={0}
              aria-label={`Week of ${fmtRange(b.start, b.end)}: ${g === null ? 'not recorded' : `${g} points`}`}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect(b.start)}
            >
              <rect x={pad.l + slot * i} y={pad.t} width={slot} height={H - pad.t - pad.b} fill={on ? 'var(--cv-panel-2)' : 'transparent'} />
              <rect x={cx - bw - 1} y={Math.min(y(b.plannedGain), y(0))} width={bw} height={Math.max(1, Math.abs(y(b.plannedGain) - y(0)))} fill={C.planned} rx={2} />
              {g === null ? (
                <rect x={cx + 1} y={y(Math.max(1, top * 0.25))} width={bw} height={y(0) - y(Math.max(1, top * 0.25))} fill="url(#cc2-hatch)" stroke="#CBD5E1" rx={2} />
              ) : (
                <rect x={cx + 1} y={Math.min(y(g), y(0))} width={bw} height={Math.max(1, Math.abs(y(g) - y(0)))} fill={g < b.plannedGain ? C.warn : C.actual} rx={2} />
              )}
              {i % labelEvery === 0 && (
                <text x={cx} y={H - 10} textAnchor="middle" className={`cc2-ax ${b.current ? 'b' : ''}`}>
                  {new Date(b.start + 'T00:00:00').toLocaleString('en-US', { month: 'short', day: 'numeric' })}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {hb && (
        <div className="cc2-tip" style={{ left: Math.min(Math.max(pad.l + slot * (hover as number) + slot / 2 - 85, 0), W - 180) }}>
          <b>Week of {fmtRange(hb.start, hb.end)}</b>
          <span>Actual: {hb.gain === null ? 'Not recorded' : `${hb.gain > 0 ? '+' : ''}${hb.gain} pts`}</span>
          <span>Planned: +{hb.plannedGain} pts</span>
          <span>{hb.completed.length} completed</span>
        </div>
      )}
    </div>
  );
};
