const { useState, useMemo } = React;
import { useApp } from '../app.jsx';
import { Donut, HBars, VBars, Stacked, peso, primaryTrade, Select, PRIORITY_LABEL, DISCLAIMER, Icon } from '../ui.jsx';
import { rowsFromAssessments, rowsFromLibrary } from '../derive.js';
import { CATEGORIES, COMMON_TURNOVER_DEFECTS } from '../data/profiles.js';
import { COST_BANDS, bandOf, DURATION_BUCKETS } from '../engine.js';

export const CLASS_COLORS = { Minor: 'var(--minor)', Major: 'var(--major)', Critical: 'var(--critical)' };
export const PRIO_COLORS = { P1: 'var(--p1)', P2: 'var(--p2)', P3: 'var(--p3)', P4: 'var(--p4)' };

const EMPTY_F = { cat: '', cls: '', prio: '', trade: '', cost: '', dur: '' };

export function applyFilters(rows, f) {
  return rows.filter((r) => (!f.cat || r.cat === f.cat) && (!f.cls || r.cls === f.cls) && (!f.prio || r.prio === f.prio)
    && (!f.trade || primaryTrade(r.trade) === f.trade) && (!f.cost || bandOf(r.cost) === f.cost)
    && (!f.dur || DURATION_BUCKETS.find((b) => b[0] === f.dur)[2](r.hours)));
}

export function FilterBar({ f, setF, rows, show = ['cat', 'cls', 'prio', 'trade', 'cost', 'dur'] }) {
  const trades = useMemo(() => [...new Set(rows.map((r) => primaryTrade(r.trade)))].sort(), [rows]);
  const set = (k) => (v) => setF({ ...f, [k]: v });
  const active = Object.values(f).some(Boolean);
  return (
    <div className="filters">
      {show.includes('cat') && <Select aria-label="Defect category" value={f.cat} onChange={set('cat')} placeholder="All categories" options={Object.values(CATEGORIES)} />}
      {show.includes('cls') && <Select aria-label="Repair classification" value={f.cls} onChange={set('cls')} placeholder="All classifications" options={['Minor', 'Major', 'Critical']} />}
      {show.includes('prio') && <Select aria-label="Priority level" value={f.prio} onChange={set('prio')} placeholder="All priorities" options={Object.keys(PRIORITY_LABEL).map((p) => [p, `${p} ${PRIORITY_LABEL[p]}`])} />}
      {show.includes('trade') && <Select aria-label="Responsible trade" value={f.trade} onChange={set('trade')} placeholder="All trades" options={trades} />}
      {show.includes('cost') && <Select aria-label="Estimated cost range" value={f.cost} onChange={set('cost')} placeholder="Any cost" options={COST_BANDS.map((b) => [b[0], b[1]])} />}
      {show.includes('dur') && <Select aria-label="Repair duration" value={f.dur} onChange={set('dur')} placeholder="Any duration" options={DURATION_BUCKETS.map((b) => [b[0], b[1]])} />}
      {active && <button className="btn btn-ghost btn-sm" onClick={() => setF(EMPTY_F)}>Clear filters</button>}
    </div>
  );
}

function Kpi({ label, value, sub, tone }) {
  return <div className={'kpi' + (tone ? ' kpi-' + tone : '')}><span className="kpi-label">{label}</span><b className="kpi-value num">{value}</b>{sub && <span className="kpi-sub">{sub}</span>}</div>;
}

export function Dashboard() {
  const app = useApp();
  const [source, setSource] = useState('claims');
  const [f, setF] = useState(EMPTY_F);
  const all = useMemo(() => source === 'claims' ? rowsFromAssessments(app.assessments, app.library) : rowsFromLibrary(app.library), [source, app.assessments, app.library]);
  const rows = useMemo(() => applyFilters(all, f), [all, f]);

  const n = rows.length;
  const count = (k, v) => rows.filter((r) => r[k] === v).length;
  const total = rows.reduce((a, r) => a + r.cost, 0);
  const cats = new Set(rows.map((r) => r.cat)).size;
  const hi = rows.filter((r) => r.prio === 'P1' || r.prio === 'P2').length;

  const clsData = ['Minor', 'Major', 'Critical'].map((c) => ({ key: c, label: c, value: count('cls', c), color: CLASS_COLORS[c] }));
  const tradeMap = {}; rows.forEach((r) => { const t = primaryTrade(r.trade); tradeMap[t] = (tradeMap[t] || 0) + 1; });
  const tradeData = Object.entries(tradeMap).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([label, value]) => ({ label, value }));
  const prioData = ['P1', 'P2', 'P3', 'P4'].map((p) => ({ label: p, sub: PRIORITY_LABEL[p], value: count('prio', p), color: PRIO_COLORS[p] }));
  const SHORT_BANDS = { lt5k: '<5k', '5-10k': '5–10k', '10-15k': '10–15k', '15-50k': '15–50k', '50-100k': '50–100k', gt100k: '100k+' };
  const costData = COST_BANDS.map(([k, label]) => ({ label: SHORT_BANDS[k], full: label, value: rows.filter((r) => bandOf(r.cost) === k).length }));
  const catRows = Object.values(CATEGORIES).map((c) => {
    const rs = rows.filter((r) => r.cat === c);
    return { key: c, label: c, values: { Minor: rs.filter((r) => r.cls === 'Minor').length, Major: rs.filter((r) => r.cls === 'Major').length, Critical: rs.filter((r) => r.cls === 'Critical').length } };
  }).filter((r) => r.values.Minor + r.values.Major + r.values.Critical > 0);

  let common;
  if (source === 'claims') {
    const m = {}; rows.forEach((r) => { m[r.label] = (m[r.label] || 0) + 1; });
    common = Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([label, value]) => ({ label, value }));
  } else {
    common = COMMON_TURNOVER_DEFECTS.map((g) => ({ label: g, value: rows.filter((r) => r.common === g).length }));
  }

  return (
    <div className="stack-lg">
      <div className="toolbar">
        <div className="seg" role="radiogroup" aria-label="Data source">
          <button className={'seg-opt' + (source === 'claims' ? ' on' : '')} role="radio" aria-checked={source === 'claims'} onClick={() => setSource('claims')}>Assessed defects ({app.assessments.length})</button>
          <button className={'seg-opt' + (source === 'library' ? ' on' : '')} role="radio" aria-checked={source === 'library'} onClick={() => setSource('library')}>Master library ({app.library.length})</button>
        </div>
        <div className="toolbar-right">
          <button className="btn btn-primary" onClick={() => app.go('assess')}><Icon name="plus" /> New assessment</button>
        </div>
      </div>
      <FilterBar f={f} setF={setF} rows={all} />
      {source === 'claims' && app.assessments.some((a) => a.sample) && <p className="note">Includes sample records (scenarios A–G) marked SAMPLE. Remove them in Settings once live claims are entered.</p>}

      <section className="kpis">
        <Kpi label="Total repair items" value={n} sub={source === 'claims' ? 'assessed defects' : 'library items'} />
        <Kpi label="Minor works" value={count('cls', 'Minor')} tone="minor" />
        <Kpi label="Major works" value={count('cls', 'Major')} tone="major" />
        <Kpi label="Critical works" value={count('cls', 'Critical')} tone="critical" />
        <Kpi label="High-priority defects" value={hi} sub="P1 Emergency + P2 Urgent" tone="prio" />
        <Kpi label="Total estimated repair cost" value={peso(total)} sub={source === 'claims' ? 'approved budget, else mid-range estimate' : 'sum of mid-range references'} />
        <Kpi label="Average estimated repair cost" value={peso(n ? total / n : 0)} sub="per item" />
        <Kpi label="Defect categories" value={`${cats} / 10`} sub="categories represented" />
      </section>

      <section className="grid-charts">
        <div className="card"><h3>Repair classification distribution</h3><Donut data={clsData} centerLabel="items" onSelect={(k) => setF({ ...f, cls: f.cls === k ? '' : k })} /></div>
        <div className="card"><h3>Defects by priority</h3><VBars data={prioData} /></div>
        <div className="card"><h3>Defects by trade</h3><HBars data={tradeData} onSelect={(t) => setF({ ...f, trade: f.trade === t ? '' : t })} /></div>
        <div className="card"><h3>Estimated cost distribution</h3><VBars data={costData} /><p className="chart-note">Count of items by mid-range estimate (₱).</p></div>
        <div className="card"><h3>{source === 'claims' ? 'Most common warranty defects' : 'Common turnover defects in the library'}</h3>
          <HBars data={common} />
          {source === 'library' && <p className="chart-note">The ten most frequent turnover defects listed in the Common Repairs source sheet, which notes they make up 70–80% of residential warranty complaints. Bars show matching library items.</p>}
        </div>
        <div className="card"><h3>Minor vs. Major vs. Critical by category</h3>
          <Stacked rows={catRows} series={['Minor', 'Major', 'Critical'].map((k) => ({ key: k, label: k, color: CLASS_COLORS[k] }))} onSelect={(c) => setF({ ...f, cat: f.cat === c ? '' : c })} />
        </div>
      </section>
      <p className="disclaimer">{DISCLAIMER}</p>
    </div>
  );
}
