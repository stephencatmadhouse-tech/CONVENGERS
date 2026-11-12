/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Shared Command Center UI primitives in the Convengers visual identity.
 */

import React, { useEffect } from 'react';
import { HealthLevel } from '../domain/metrics.ts';
import { STATUS_COLORS } from '../constants/assets.ts';

/**
 * Convengers status language (light theme):
 * green = completed / on track · purple = in progress · yellow = attention ·
 * red = delayed / critical · gray = pending / not started.
 */
export const STATUS_HEX: Record<string, string> = {
  Completed: '#22A05A',
  Ongoing: '#7041C8',
  Delayed: '#D92D3F',
  Upcoming: '#9A9AAD',
  'On Hold': '#B5B5C5',
};

export const HEALTH_HEX: Record<HealthLevel, string> = {
  'On Track': '#22A05A',
  'At Risk': '#E8B800',
  Critical: '#D92D3F',
};

export const STREAM_HEX: Record<string, string> = {
  Construction: '#3A7BEF',
  Production: '#D9488A',
  Milestone: '#FFC21A',
  Concrete: '#E8862A',
};

export const PRIORITY_HEX: Record<string, string> = {
  Critical: '#D92D3F',
  High: '#E8862A',
  Medium: '#7041C8',
  Low: '#9A9AAD',
};

/** Readable text colour for a status/category colour (mixes toward the ink colour). */
export const tintText = (c: string) => `color-mix(in srgb, ${c} 72%, var(--cv-ink))`;
export const tintBg = (c: string) => `color-mix(in srgb, ${c} 13%, transparent)`;

export function kindColor(kind: string, stream?: string): string {
  if (kind === 'pour') return STREAM_HEX.Concrete;
  if (kind === 'milestone') return STREAM_HEX.Milestone;
  if (kind === 'episode') return STREAM_HEX.Production;
  return STREAM_HEX[stream || 'Construction'] || '#B58CFF';
}

export const Pill: React.FC<{ label: string; color?: string; title?: string }> = ({ label, color, title }) => {
  const pal = !color ? STATUS_COLORS[label] : undefined;
  if (pal) {
    return (
      <span className="cv-pill" style={{ background: pal[0], color: pal[1], borderColor: pal[2] }} title={title}>
        {label}
      </span>
    );
  }
  const c = color || '#9A9AAD';
  return (
    <span className="cv-pill" style={{ background: tintBg(c), color: tintText(c), borderColor: `color-mix(in srgb, ${c} 45%, transparent)` }} title={title}>
      {label}
    </span>
  );
};

export const StatusPill: React.FC<{ status: string }> = ({ status }) => {
  const c = STATUS_HEX[status] || '#9A9AAD';
  const solid = status === 'Delayed' || status === 'Completed' || status === 'Ongoing';
  return (
    <span className="cv-pill" style={solid ? { background: c, color: '#fff', borderColor: c } : { background: tintBg(c), color: tintText(c), borderColor: `color-mix(in srgb, ${c} 45%, transparent)` }}>
      {status}
    </span>
  );
};

export const HealthBadge: React.FC<{ level: HealthLevel; big?: boolean }> = ({ level, big }) => (
  <span
    className="cv-health"
    style={{
      color: level === 'At Risk' ? '#252336' : '#FFFFFF',
      border: `1px solid ${level === 'At Risk' ? '#FFD43B' : HEALTH_HEX[level]}`,
      background: level === 'At Risk' ? '#FFD43B' : HEALTH_HEX[level],
      fontSize: big ? 16 : undefined,
    }}
    aria-label={`Project health: ${level}`}
  >
    <i /> {level}
  </span>
);

export const Card: React.FC<{
  title?: React.ReactNode;
  note?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
  id?: string;
}> = ({ title, note, actions, className = '', children, id }) => (
  <section className={`cv-card ${className}`} id={id}>
    {(title || actions) && (
      <div className="cv-card-h">
        <div>
          {title && <h3 className="cv-card-t">{title}</h3>}
          {note && <div className="cv-card-note">{note}</div>}
        </div>
        {actions && <div className="cv-row">{actions}</div>}
      </div>
    )}
    {children}
  </section>
);

export const Kpi: React.FC<{ label: string; value: React.ReactNode; sub?: React.ReactNode; accent?: boolean; color?: string; title?: string }> = ({
  label,
  value,
  sub,
  accent,
  color,
  title,
}) => (
  <div className="cv-kpi" title={title}>
    <div className="cv-kpi-l">{label}</div>
    <div className={`cv-kpi-v ${accent ? 'y' : ''}`} style={color ? { color } : undefined}>
      {value}
    </div>
    {sub && <div className="cv-kpi-s">{sub}</div>}
  </div>
);

export const ProgressBar: React.FC<{ actual: number; planned?: number; color?: string; title?: string }> = ({ actual, planned, color, title }) => (
  <div className="cv-bar" title={title || `Actual ${Math.round(actual)}%${planned !== undefined ? ` · Planned ${Math.round(planned)}%` : ''}`}>
    <b style={{ width: `${Math.max(0, Math.min(100, actual))}%`, background: color }} />
    {planned !== undefined && <i style={{ left: `calc(${Math.max(0, Math.min(100, planned))}% - 1px)` }} />}
  </div>
);

export const Empty: React.FC<{ children: React.ReactNode }> = ({ children }) => <div className="cv-empty">{children}</div>;

export const Banner: React.FC<{ kind?: 'info' | 'warn' | 'error' | 'ok'; children: React.ReactNode }> = ({ kind = 'info', children }) => (
  <div className={`cv-banner ${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
    <span aria-hidden>{kind === 'error' ? '⛔' : kind === 'warn' ? '⚠️' : kind === 'ok' ? '✅' : 'ℹ️'}</span>
    <div>{children}</div>
  </div>
);

export const Modal: React.FC<{
  title: React.ReactNode;
  sub?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: number;
}> = ({ title, sub, onClose, children, footer, width }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return (
    <div className="cv-modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cv-modal" role="dialog" aria-modal="true" style={width ? { maxWidth: width } : undefined}>
        <div className="cv-modal-h">
          <div>
            <div className="cv-card-t" style={{ fontSize: 18 }}>
              {title}
            </div>
            {sub && <div className="cv-dim" style={{ marginTop: 2 }}>{sub}</div>}
          </div>
          <button type="button" className="cv-x" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="cv-modal-b">{children}</div>
        {footer && <div className="cv-modal-f">{footer}</div>}
      </div>
    </div>
  );
};

export const ConfirmDialog: React.FC<{
  title: string;
  message: React.ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ title, message, confirmLabel, danger, onConfirm, onCancel }) => (
  <Modal
    title={title}
    onClose={onCancel}
    width={480}
    footer={
      <>
        <button type="button" className="cv-btn ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className={`cv-btn ${danger ? 'danger' : 'primary'}`} onClick={onConfirm}>
          {confirmLabel}
        </button>
      </>
    }
  >
    <div style={{ fontSize: 14, lineHeight: 1.5 }}>{message}</div>
  </Modal>
);

export const Field: React.FC<{ label: string; children: React.ReactNode; className?: string; hint?: string }> = ({ label, children, className = '', hint }) => (
  <label className={`cv-field ${className}`}>
    <span>{label}</span>
    {children}
    {hint && <em className="cv-dim" style={{ fontStyle: 'normal' }}>{hint}</em>}
  </label>
);

export function SectionHeader({
  num,
  title,
  sub,
  actions,
  onMenu,
}: {
  num: string;
  title: string;
  sub?: React.ReactNode;
  actions?: React.ReactNode;
  onMenu?: () => void;
}) {
  return (
    <div className="cv-sec-head">
      <div style={{ minWidth: 0 }}>
        <div className="cv-row" style={{ gap: 10 }}>
          {onMenu && (
            <button type="button" className="cv-btn sm cv-menu-btn" onClick={onMenu} aria-label="Open sections menu">
              ☰ Sections
            </button>
          )}
          <span className="cv-kicker">{num} — Convengers Bahay Build</span>
        </div>
        <h1 className="cv-h1">{title}</h1>
        {sub && <div className="cv-sub">{sub}</div>}
      </div>
      {actions && <div className="cv-row">{actions}</div>}
    </div>
  );
}

// ---------- Charts (pure SVG; no extra libraries) ----------
export interface Series {
  name: string;
  color: string;
  points: { x: string; y: number | null }[];
  dashed?: boolean;
}

export const LineChart: React.FC<{ series: Series[]; height?: number; yMax?: number; markX?: string; labelEvery?: number }> = ({
  series,
  height = 260,
  yMax = 100,
  markX,
  labelEvery = 4,
}) => {
  const xs = Array.from(new Set(series.flatMap((s) => s.points.map((p) => p.x)))).sort();
  const W = 900;
  const H = height;
  const L = 44;
  const R = 14;
  const T = 14;
  const B = 34;
  if (xs.length < 2) return <Empty>Not enough data points to draw this chart yet.</Empty>;
  const xPos = (x: string) => L + (xs.indexOf(x) / (xs.length - 1)) * (W - L - R);
  const yPos = (y: number) => T + (1 - y / yMax) * (H - T - B);
  const markIdx = markX ? xs.findIndex((x) => x >= markX) : -1;
  return (
    <svg className="cv-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Line chart">
      {[0, 25, 50, 75, 100].filter((v) => v <= yMax).map((v) => (
        <g key={v}>
          <line className="grid" x1={L} x2={W - R} y1={yPos(v)} y2={yPos(v)} />
          <text x={L - 6} y={yPos(v) + 4} textAnchor="end">
            {v}%
          </text>
        </g>
      ))}
      {xs.map((x, i) =>
        i % labelEvery === 0 || i === xs.length - 1 ? (
          <text key={x} x={xPos(x)} y={H - 12} textAnchor="middle">
            {shortDate(x)}
          </text>
        ) : null
      )}
      {markIdx >= 0 && (
        <g>
          <line x1={xPos(xs[markIdx])} x2={xPos(xs[markIdx])} y1={T} y2={H - B} stroke="#FFC21A" strokeWidth={2} strokeDasharray="4 3" />
          <text x={xPos(xs[markIdx]) + 4} y={T + 10} style={{ fill: 'var(--cv-accent)' }}>
            Today
          </text>
        </g>
      )}
      {series.map((s) => {
        const pts = s.points.filter((p) => p.y !== null) as { x: string; y: number }[];
        if (!pts.length) return null;
        const d = pts.map((p, i) => `${i ? 'L' : 'M'}${xPos(p.x).toFixed(1)},${yPos(p.y).toFixed(1)}`).join(' ');
        return (
          <g key={s.name}>
            <path d={d} fill="none" stroke={s.color} strokeWidth={2.5} strokeDasharray={s.dashed ? '6 4' : undefined} />
            {pts.length <= 40 &&
              pts.map((p) => (
                <circle key={p.x} cx={xPos(p.x)} cy={yPos(p.y)} r={3.2} fill={s.color}>
                  <title>{`${s.name} · ${shortDate(p.x)}: ${p.y.toFixed(1)}%`}</title>
                </circle>
              ))}
          </g>
        );
      })}
    </svg>
  );
};

export const BarChart: React.FC<{ bars: { label: string; value: number; color?: string; title?: string }[]; height?: number; signed?: boolean; unit?: string }> = ({
  bars,
  height = 220,
  signed,
  unit = '',
}) => {
  if (!bars.length) return <Empty>No data recorded for this chart yet.</Empty>;
  const W = 900;
  const H = height;
  const L = 40;
  const T = 16;
  const B = 34;
  const max = Math.max(1, ...bars.map((b) => Math.abs(b.value)));
  const zeroY = signed ? T + (H - T - B) / 2 : H - B;
  const scale = signed ? (H - T - B) / 2 / max : (H - T - B) / max;
  const bw = Math.min(60, ((W - L - 10) / bars.length) * 0.65);
  const step = (W - L - 10) / bars.length;
  return (
    <svg className="cv-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Bar chart">
      <line className="grid" x1={L} x2={W - 10} y1={zeroY} y2={zeroY} />
      {bars.map((b, i) => {
        const h = Math.abs(b.value) * scale;
        const x = L + i * step + (step - bw) / 2;
        const y = b.value >= 0 ? zeroY - h : zeroY;
        return (
          <g key={b.label + i}>
            <rect x={x} y={y} width={bw} height={Math.max(1, h)} rx={3} fill={b.color || (b.value < 0 ? '#D92D3F' : '#7041C8')}>
              <title>{b.title || `${b.label}: ${b.value}${unit}`}</title>
            </rect>
            <text x={x + bw / 2} y={b.value >= 0 ? y - 4 : y + h + 12} textAnchor="middle" style={{ fill: 'currentColor' }}>
              {Number.isInteger(b.value) ? b.value : b.value.toFixed(1)}
              {unit}
            </text>
            {(bars.length <= 16 || i % Math.ceil(bars.length / 16) === 0) && (
              <text x={x + bw / 2} y={H - 12} textAnchor="middle">
                {b.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
};

export function shortDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[+m[2] - 1]} ${+m[3]}`;
}

export function downloadFile(name: string, content: string, type: string) {
  const blob = new Blob([type.includes('csv') ? '﻿' + content : content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function pct(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return `${n.toFixed(digits)}%`;
}
