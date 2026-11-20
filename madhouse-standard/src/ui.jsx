// Shared UI: formatting, badges, modal, confirm dialog, toasts, form fields, charts, export.
const { useState, useEffect, useRef, useMemo, useCallback, createContext, useContext } = React;

export const peso = (n) => (n === '' || n === null || n === undefined || Number.isNaN(Number(n)) ? '—' : '₱' + Math.round(Number(n)).toLocaleString('en-PH'));
export const pesoRange = (a, b) => `${peso(a)} – ${peso(b)}`;
export const fmtDate = (s) => { if (!s) return '—'; const d = new Date(s); return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }); };
export const fmtDateTime = (s) => { if (!s) return '—'; const d = new Date(s); return Number.isNaN(d.getTime()) ? s : d.toLocaleString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const primaryTrade = (t) => String(t || 'Unassigned').split('/')[0].replace(/\s*\(lead\).*$/, '').trim();
export const cx = (...a) => a.filter(Boolean).join(' ');

export const PRIORITY_LABEL = { P1: 'Emergency', P2: 'Urgent', P3: 'Normal', P4: 'Cosmetic' };

// ---------- Icons ----------
const ICONS = {
  dashboard: 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z',
  library: 'M4 4h4v16H4zM10 4h4v16h-4zM16.5 4.5l3.8 1-4 15.4-3.8-1z',
  wizard: 'M9 4h6M9 4a2 2 0 00-2 2v1h10V6a2 2 0 00-2-2M5 7h14v13H5zM9 12l2 2 4-4',
  classify: 'M12 3l9 4.5-9 4.5-9-4.5zM3 12l9 4.5 9-4.5M3 16.5L12 21l9-4.5',
  cost: 'M5 3h14v18H5zM8 7h8M8 11h2M12 11h2M16 11h0M8 15h2M12 15h2M8 19h0',
  qa: 'M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6zM9 12l2 2 4-4',
  reports: 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5',
  settings: 'M12 9a3 3 0 100 6 3 3 0 000-6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z',
  plus: 'M12 5v14M5 12h14',
  search: 'M11 4a7 7 0 100 14 7 7 0 000-14zM21 21l-4.3-4.3',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  alert: 'M12 3l10 18H2zM12 10v5M12 18v.01',
  close: 'M6 6l12 12M18 6L6 18',
  edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 100 6 3 3 0 000-6z',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  menu: 'M4 6h16M4 12h16M4 18h16',
  check: 'M5 12l5 5L20 7',
  arrow: 'M5 12h14M13 6l6 6-6 6',
};
export function Icon({ name, size = 18 }) {
  return <svg className="ico" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICONS[name] || ''} /></svg>;
}

// ---------- Badges ----------
export const ClassBadge = ({ c, small }) => c ? <span className={cx('cls', 'cls-' + String(c).toLowerCase(), small && 'sm')}>{String(c).toUpperCase()}</span> : <span className="muted">—</span>;
export const PrioBadge = ({ p, small }) => p ? <span className={cx('prio', 'prio-' + p, small && 'sm')}><b>{p}</b>{!small && <span>{PRIORITY_LABEL[p]}</span>}</span> : <span className="muted">—</span>;
const STATUS_CLASS = { 'For Validation': 'st-pending', Validated: 'st-open', 'In Repair': 'st-open', 'For Reinspection': 'st-warn', Completed: 'st-done', Draft: 'st-draft' };
export const StatusBadge = ({ s }) => <span className={cx('status', STATUS_CLASS[s] || 'st-draft')}>{s || 'Draft'}</span>;

// ---------- App-level services (toast, confirm, export) ----------
const Svc = createContext(null);
export const useSvc = () => useContext(Svc);

let downloadsPromise = null;
function getDownloads() {
  if (!downloadsPromise) {
    downloadsPromise = (window.claude && typeof window.claude.use === 'function')
      ? window.claude.use('downloads').catch(() => null)
      : Promise.resolve(null);
  }
  return downloadsPromise;
}

export function ServicesProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [confirmReq, setConfirmReq] = useState(null);
  const [fallback, setFallback] = useState(null);
  const toast = useCallback((msg, kind = 'ok') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);
  const confirm = useCallback((opts) => new Promise((resolve) => setConfirmReq({ ...opts, resolve })), []);
  const exportFile = useCallback(async (filename, content) => {
    const dl = await getDownloads();
    if (dl) {
      try { await dl.save({ filename, data: content }); toast(`${filename} saved`); return; }
      catch (e) {
        if (e && e.code === 'declined') { toast('Download cancelled', 'info'); return; }
        if (e && e.code === 'rate_limited') { toast('A save prompt is already open. Try again in a moment.', 'warn'); return; }
      }
    }
    setFallback({ filename, content });
  }, [toast]);
  const value = useMemo(() => ({ toast, confirm, exportFile }), [toast, confirm, exportFile]);
  return (
    <Svc.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => <div key={t.id} className={cx('toast', 'toast-' + t.kind)}>{t.msg}</div>)}
      </div>
      {confirmReq && (
        <Modal title={confirmReq.title || 'Please confirm'} onClose={() => { confirmReq.resolve(false); setConfirmReq(null); }}
          footer={<>
            <button className="btn" onClick={() => { confirmReq.resolve(false); setConfirmReq(null); }}>Cancel</button>
            <button className={cx('btn', confirmReq.danger ? 'btn-danger' : 'btn-primary')} autoFocus onClick={() => { confirmReq.resolve(true); setConfirmReq(null); }}>{confirmReq.confirmLabel || 'Confirm'}</button>
          </>}>
          <p className="confirm-msg">{confirmReq.message}</p>
        </Modal>
      )}
      {fallback && <ExportFallback {...fallback} onClose={() => setFallback(null)} />}
    </Svc.Provider>
  );
}

function ExportFallback({ filename, content, onClose }) {
  const ref = useRef(null);
  const [copied, setCopied] = useState(false);
  const copy = () => {
    const ok = () => setCopied(true);
    try { navigator.clipboard.writeText(content).then(ok, () => { ref.current.select(); }); } catch (e) { ref.current.select(); }
  };
  return (
    <Modal title={`Export ${filename}`} onClose={onClose} wide
      footer={<><span className="muted small">{copied ? 'Copied to clipboard.' : 'Paste into a new file with this name.'}</span><button className="btn" onClick={onClose}>Close</button><button className="btn btn-primary" onClick={copy}><Icon name="copy" /> Copy contents</button></>}>
      <p className="small">This view cannot save files directly. Copy the contents below and save them as <b className="mono">{filename}</b>. HTML reports open in any browser and print to PDF from there.</p>
      <textarea ref={ref} className="export-box mono" readOnly value={content} onFocus={(e) => e.target.select()} />
    </Modal>
  );
}

// ---------- Modal ----------
export function Modal({ title, onClose, children, footer, wide, xwide }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose && onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose && onClose(); }}>
      <div className={cx('modal', wide && 'modal-wide', xwide && 'modal-xwide')} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head"><h2>{title}</h2><button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="close" /></button></div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

// ---------- Form helpers ----------
export function Field({ label, required, error, hint, children, span }) {
  return (
    <label className={cx('field', error && 'has-error', span && 'span-' + span)}>
      <span className="field-label">{label}{required && <i className="req" aria-label="required">*</i>}</span>
      {children}
      {error ? <span className="field-error">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}
export function Seg({ value, options, onChange, name, danger }) {
  return (
    <div className="seg" role="radiogroup" aria-label={name}>
      {options.map(([v, l]) => (
        <button type="button" key={v} role="radio" aria-checked={value === v}
          className={cx('seg-opt', value === v && 'on', value === v && danger && v === 'yes' && 'on-danger', value === v && v === 'unsure' && 'on-warn')}
          onClick={() => onChange(v)}>{l}</button>
      ))}
    </div>
  );
}
export const Select = ({ value, onChange, options, placeholder, id, ...rest }) => (
  <select id={id} value={value} onChange={(e) => onChange(e.target.value)} {...rest}>
    {placeholder !== undefined && <option value="">{placeholder}</option>}
    {options.map((o) => Array.isArray(o) ? <option key={o[0]} value={o[0]}>{o[1]}</option> : <option key={o} value={o}>{o}</option>)}
  </select>
);

// ---------- Charts (hand-built SVG; colors from CSS tokens) ----------
function useTip() {
  const [tip, setTip] = useState(null);
  const show = (e, text) => {
    const host = e.currentTarget.closest('.chart');
    const r = host.getBoundingClientRect();
    setTip({ x: e.clientX - r.left, y: e.clientY - r.top, text });
  };
  const el = tip ? <div className="tip" style={{ left: Math.min(tip.x + 12, 9999), top: tip.y - 8 }}>{tip.text}</div> : null;
  return { show, hide: () => setTip(null), el };
}

export function Donut({ data, total, centerLabel, onSelect }) {
  const t = useTip();
  const sum = data.reduce((a, d) => a + d.value, 0);
  const R = 70; const r = 46; const C = 90;
  let ang = -Math.PI / 2;
  const arcs = data.filter((d) => d.value > 0).map((d) => {
    const frac = d.value / (sum || 1);
    const a0 = ang; const a1 = ang + frac * Math.PI * 2; ang = a1;
    const gap = data.filter((x) => x.value > 0).length > 1 ? 0.02 : 0;
    const p = (rad, a) => [C + rad * Math.cos(a), C + rad * Math.sin(a)];
    const s0 = a0 + gap; const s1 = Math.max(a1 - gap, s0 + 0.001);
    const large = s1 - s0 > Math.PI ? 1 : 0;
    const full = frac >= 0.9999;
    const path = full
      ? `M${C},${C - R}A${R},${R} 0 1 1 ${C - 0.01},${C - R}L${C - 0.01},${C - r}A${r},${r} 0 1 0 ${C},${C - r}Z`
      : `M${p(R, s0)}A${R},${R} 0 ${large} 1 ${p(R, s1)}L${p(r, s1)}A${r},${r} 0 ${large} 0 ${p(r, s0)}Z`;
    return { ...d, path, frac };
  });
  return (
    <div className="chart donut-wrap">
      <svg viewBox="0 0 180 180" className="donut" role="img" aria-label={data.map((d) => `${d.label} ${d.value}`).join(', ')}>
        {sum === 0 && <circle cx={C} cy={C} r={(R + r) / 2} fill="none" stroke="var(--line)" strokeWidth={R - r} />}
        {arcs.map((a) => <path key={a.label} d={a.path} fill={a.color} className={onSelect ? 'clickable' : ''}
          onMouseMove={(e) => t.show(e, `${a.label}: ${a.value} (${Math.round(a.frac * 100)}%)`)} onMouseLeave={t.hide}
          onClick={() => onSelect && onSelect(a.key)} />)}
        <text x={C} y={C - 2} textAnchor="middle" className="donut-n">{total ?? sum}</text>
        <text x={C} y={C + 16} textAnchor="middle" className="donut-l">{centerLabel}</text>
      </svg>
      <ul className="legend">
        {data.map((d) => <li key={d.label}><i style={{ background: d.color }} />{d.label}<b className="num">{d.value}</b><span className="muted num">{sum ? Math.round(d.value / sum * 100) : 0}%</span></li>)}
      </ul>
      {t.el}
    </div>
  );
}

export function HBars({ data, color = 'var(--accent)', fmt = (v) => v, max, onSelect }) {
  const t = useTip();
  const m = max || Math.max(1, ...data.map((d) => d.value));
  if (!data.length) return <div className="chart empty-chart">No records match the current filters.</div>;
  return (
    <div className="chart hbars">
      {data.map((d) => (
        <div className={cx('hbar-row', onSelect && 'clickable')} key={d.label} onClick={() => onSelect && onSelect(d.key ?? d.label)}
          onMouseMove={(e) => t.show(e, `${d.label}: ${fmt(d.value)}`)} onMouseLeave={t.hide}>
          <span className="hbar-label" title={d.label}>{d.label}</span>
          <span className="hbar-track"><span className="hbar-fill" style={{ width: `${(d.value / m) * 100}%`, background: d.color || color }} /></span>
          <span className="hbar-val num">{fmt(d.value)}</span>
        </div>
      ))}
      {t.el}
    </div>
  );
}

export function VBars({ data, height = 170, fmt = (v) => v }) {
  const t = useTip();
  const m = Math.max(1, ...data.map((d) => d.value));
  const W = 320; const H = height; const pad = { l: 28, r: 6, t: 16, b: 34 };
  const bw = (W - pad.l - pad.r) / data.length;
  const ticks = niceTicks(m);
  const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - v / ticks[ticks.length - 1]);
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} className="vbars" role="img" aria-label={data.map((d) => `${d.label} ${d.value}`).join(', ')}>
        {ticks.map((tk) => <g key={tk}><line x1={pad.l} x2={W - pad.r} y1={y(tk)} y2={y(tk)} className="grid" /><text x={pad.l - 5} y={y(tk) + 3} textAnchor="end" className="axis">{tk}</text></g>)}
        {data.map((d, i) => {
          const x = pad.l + i * bw + bw * 0.18; const w = bw * 0.64; const top = y(d.value); const h = Math.max(0, y(0) - top);
          return (
            <g key={d.label} onMouseMove={(e) => t.show(e, `${d.full || d.label}: ${fmt(d.value)}`)} onMouseLeave={t.hide}>
              <rect x={pad.l + i * bw} y={pad.t} width={bw} height={H - pad.t - pad.b} fill="transparent" />
              {h > 0 && <path d={roundTop(x, top, w, h, 4)} fill={d.color || 'var(--accent)'} />}
              {d.value > 0 && <text x={x + w / 2} y={top - 4} textAnchor="middle" className="bar-val">{fmt(d.value)}</text>}
              <text x={x + w / 2} y={H - pad.b + 14} textAnchor="middle" className="axis-x">{d.label}</text>
              {d.sub && <text x={x + w / 2} y={H - pad.b + 26} textAnchor="middle" className="axis-x muted-fill">{d.sub}</text>}
            </g>
          );
        })}
        <line x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} className="baseline" />
      </svg>
      {t.el}
    </div>
  );
}

export function Stacked({ rows, series, onSelect }) {
  const t = useTip();
  const m = Math.max(1, ...rows.map((r) => series.reduce((a, s) => a + (r.values[s.key] || 0), 0)));
  if (!rows.length) return <div className="chart empty-chart">No records match the current filters.</div>;
  return (
    <div className="chart stacked">
      <ul className="legend inline">{series.map((s) => <li key={s.key}><i style={{ background: s.color }} />{s.label}</li>)}</ul>
      {rows.map((r) => {
        const tot = series.reduce((a, s) => a + (r.values[s.key] || 0), 0);
        return (
          <div className={cx('hbar-row', onSelect && 'clickable')} key={r.label} onClick={() => onSelect && onSelect(r.key)}>
            <span className="hbar-label" title={r.label}>{r.label}</span>
            <span className="hbar-track stackbar" style={{ width: `${(tot / m) * 100}%` }}>
              {series.map((s) => r.values[s.key] ? <span key={s.key} className="seg-fill" style={{ flexGrow: r.values[s.key], background: s.color }}
                onMouseMove={(e) => t.show(e, `${r.label} · ${s.label}: ${r.values[s.key]}`)} onMouseLeave={t.hide} /> : null)}
            </span>
            <span className="hbar-val num">{tot}</span>
          </div>
        );
      })}
      {t.el}
    </div>
  );
}

function niceTicks(max) {
  const step = max <= 5 ? 1 : max <= 10 ? 2 : max <= 25 ? 5 : max <= 50 ? 10 : max <= 100 ? 20 : Math.ceil(max / 5 / 10) * 10;
  const out = []; for (let v = 0; v <= max + step - 0.001; v += step) out.push(v);
  if (out.length < 2) out.push(step);
  return out;
}
function roundTop(x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

// ---------- CSV ----------
export function toCSV(headers, rows) {
  const q = (v) => { const s = String(v ?? ''); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return '﻿' + [headers.map(q).join(','), ...rows.map((r) => r.map(q).join(','))].join('\r\n');
}

export function Empty({ title, children }) {
  return <div className="empty"><b>{title}</b>{children && <p>{children}</p>}</div>;
}

export const DISCLAIMER = 'All costs are indicative budgetary references in Philippine pesos. They are not quotations and are subject to site validation, supplier quotations, location, quantities and contractor rates.';
