const { useState, useMemo } = React;
import { useApp } from '../app.jsx';
import { Field, Select, Seg, Icon, peso, pesoRange, useSvc, DISCLAIMER, cx, ClassBadge } from '../ui.jsx';
import { COST_COMPONENTS, costTotals, variance, linesFromItem } from '../engine.js';
import { itemOf, finalClass } from '../derive.js';

const MODES = [['combined', 'Labor and materials'], ['labor', 'Labor only'], ['materials', 'Materials only']];
const REGIONS = [['metro', 'Metro Manila rates'], ['provincial', 'Provincial rates']];

export function CostEstimator() {
  const app = useApp();
  const svc = useSvc();
  const c = app.settings.costs;
  const [src, setSrc] = useState(app.params.itemId ? 'library' : 'assessment');
  const [aid, setAid] = useState(app.params.assessmentId || (app.assessments[0] && app.assessments[0].id) || '');
  const [iid, setIid] = useState(app.params.itemId || (app.library[0] && app.library[0].id));
  const a = src === 'assessment' ? app.assessments.find((x) => x.id === aid) : null;
  const item = src === 'assessment' ? (a && (app.library.find((x) => x.id === (a.estimate && a.estimate.refId)) || itemOf(app.library, a))) : app.library.find((x) => x.id === iid);

  const initFrom = (asmt, it) => {
    if (asmt && asmt.cost) return { ...asmt.cost, lines: { ...asmt.cost.lines } };
    return { region: 'metro', mode: 'combined', lines: it ? linesFromItem(it, { mobilization: c.mobilizationMetro }) : {}, contingencyPct: c.contingencyPct, approvedBudget: '', actual: '' };
  };
  const [est, setEst] = useState(() => initFrom(a, item));
  const [errors, setErrors] = useState({});
  const reload = (asmt, it) => { setEst(initFrom(asmt, it)); setErrors({}); };

  const factor = est.region === 'provincial' ? Number(c.provincialFactor) || 1 : Number(c.metroFactor) || 1;
  const t = useMemo(() => costTotals(est.lines, { mode: est.mode, regionFactor: factor, contingencyPct: Number(est.contingencyPct) || 0 }), [est, factor]);
  const v = variance(est.approvedBudget, est.actual);

  const setLine = (k, end) => (e) => setEst((s) => ({ ...s, lines: { ...s.lines, [k]: { ...(s.lines[k] || { min: 0, max: 0 }), [end]: e.target.value } } }));
  const setRegion = (r) => setEst((s) => {
    const tr = s.lines.transport || { min: 0, max: 0 };
    const from = r === 'metro' ? c.mobilizationProvincial : c.mobilizationMetro;
    const to = r === 'metro' ? c.mobilizationMetro : c.mobilizationProvincial;
    const lines = Number(tr.min) === Number(from) && Number(tr.max) === Number(from) ? { ...s.lines, transport: { min: to, max: to } } : s.lines;
    return { ...s, region: r, lines };
  });

  const check = () => {
    const e = {};
    COST_COMPONENTS.forEach(([k]) => {
      const l = est.lines[k] || {};
      ['min', 'max'].forEach((end) => { const val = l[end]; if (val !== '' && val != null && (Number.isNaN(Number(val)) || Number(val) < 0)) e[`${k}.${end}`] = 'Positive number'; });
      if (!e[`${k}.min`] && !e[`${k}.max`] && Number(l.min || 0) > Number(l.max || 0)) e[`${k}.max`] = 'Max below min';
    });
    ['approvedBudget', 'actual'].forEach((k) => { if (est[k] !== '' && est[k] != null && (Number.isNaN(Number(est[k])) || Number(est[k]) < 0)) e[k] = 'Enter a positive amount'; });
    if (Number(est.contingencyPct) < 0 || Number(est.contingencyPct) > 50) e.contingencyPct = 'Use 0–50%';
    setErrors(e);
    return !Object.keys(e).length;
  };
  const save = () => {
    if (!a) return;
    if (!check()) { svc.toast('Fix the highlighted amounts', 'warn'); return; }
    app.saveAssessment({ ...a, cost: { ...est } }, 'Cost estimate updated');
    svc.toast(`Cost estimate saved to ${a.id}`);
  };

  const budgetOutside = est.approvedBudget !== '' && Number(est.approvedBudget) > 0 && (Number(est.approvedBudget) < t.totalMin || Number(est.approvedBudget) > t.totalMax);

  return (
    <div className="stack">
      <div className="card">
        <div className="form-grid">
          <Field label="Estimate for">
            <Seg name="Estimate source" value={src} onChange={(s) => { setSrc(s); const na = s === 'assessment' ? app.assessments.find((x) => x.id === aid) : null; const ni = s === 'assessment' ? (na && itemOf(app.library, na)) : app.library.find((x) => x.id === iid); reload(na, s === 'assessment' && na ? (app.library.find((x) => x.id === (na.estimate && na.estimate.refId)) || ni) : ni); }}
              options={[['assessment', 'Assessed defect'], ['library', 'Library item']]} />
          </Field>
          {src === 'assessment' ? (
            <Field label="Assessment" span={2}>
              <Select id="c-asmt" value={aid} onChange={(id) => { setAid(id); const na = app.assessments.find((x) => x.id === id); reload(na, na && (app.library.find((x) => x.id === (na.estimate && na.estimate.refId)) || itemOf(app.library, na))); }}
                placeholder={app.assessments.length ? undefined : 'No assessments yet'}
                options={app.assessments.map((x) => [x.id, `${x.id} · ${x.project} · ${x.location}`])} />
            </Field>
          ) : (
            <Field label="Library item" span={2}>
              <Select id="c-item" value={iid} onChange={(id) => { setIid(id); reload(null, app.library.find((x) => x.id === id)); }} options={app.library.map((x) => [x.id, `${x.id} · ${x.item}`])} />
            </Field>
          )}
        </div>
        {item && <p className="small ref-line">Reference: <b className="mono">{item.id}</b> {item.item} · library range {pesoRange(item.costMin, item.costMax)} · {item.trade} · {item.duration}
          {a && <> · classification <ClassBadge c={finalClass(a)} small /></>}</p>}
        {a && a.estimate && <p className="small muted">Assessment estimate basis: {a.estimate.basis}</p>}
      </div>

      <div className="cost-layout">
        <div className="card">
          <div className="toolbar">
            <Seg name="Rate basis" value={est.region} onChange={setRegion} options={REGIONS} />
            <Seg name="Estimate type" value={est.mode} onChange={(m) => setEst((s) => ({ ...s, mode: m }))} options={MODES} />
          </div>
          <div className="table-wrap">
            <table className="tbl cost-tbl">
              <thead><tr><th>Cost component</th><th className="r">Minimum (₱)</th><th className="r">Maximum (₱)</th><th className="r">Applied min</th><th className="r">Applied max</th></tr></thead>
              <tbody>
                {t.rows.map((r) => (
                  <tr key={r.key} className={r.included ? '' : 'excluded'}>
                    <td>{r.label}{(r.key === 'labor' || r.key === 'transport') && factor !== 1 && r.included && <span className="muted small"> ×{factor}</span>}{!r.included && <span className="muted small"> (excluded)</span>}</td>
                    {['min', 'max'].map((end) => (
                      <td key={end} className="r"><input className={cx('num-in', errors[`${r.key}.${end}`] && 'bad')} aria-label={`${r.label} ${end}`} inputMode="numeric" value={(est.lines[r.key] || {})[end] ?? ''} onChange={setLine(r.key, end)} onBlur={check} />
                        {errors[`${r.key}.${end}`] && <div className="field-error">{errors[`${r.key}.${end}`]}</div>}</td>
                    ))}
                    <td className="r num">{peso(r.min)}</td><td className="r num">{peso(r.max)}</td>
                  </tr>
                ))}
                <tr className="sub"><td colSpan={3}>Subtotal</td><td className="r num">{peso(t.subtotalMin)}</td><td className="r num">{peso(t.subtotalMax)}</td></tr>
                <tr className="sub"><td colSpan={3}>Contingency <input className="num-in pct" aria-label="Contingency percent" value={est.contingencyPct} onChange={(e) => setEst((s) => ({ ...s, contingencyPct: e.target.value }))} />%{errors.contingencyPct && <span className="field-error"> {errors.contingencyPct}</span>}</td><td className="r num">{peso(t.contingencyMin)}</td><td className="r num">{peso(t.contingencyMax)}</td></tr>
                <tr className="total"><td colSpan={3}>TOTAL ESTIMATED REPAIR COST</td><td className="r num">{peso(t.totalMin)}</td><td className="r num">{peso(t.totalMax)}</td></tr>
              </tbody>
            </table>
          </div>
          <p className="formula">Total = Labor + Materials + Equipment + Transportation + Specialist + Other, plus contingency. {est.mode !== 'combined' && `Only ${est.mode === 'labor' ? 'labor' : 'materials'} is counted for this estimate type.`}</p>
          <div className="row-actions">
            {item && <button className="btn" onClick={() => setEst((s) => ({ ...s, lines: linesFromItem(item, { mobilization: s.region === 'provincial' ? c.mobilizationProvincial : c.mobilizationMetro }) }))}>Reset lines from library reference</button>}
          </div>
        </div>

        <div className="stack">
          <div className="card">
            <h3>Budget and actuals</h3>
            <div className="form-grid one">
              <Field label="Actual approved budget (₱)" error={errors.approvedBudget} hint={budgetOutside ? 'Outside the estimated range: record the reason in the assessment remarks.' : ''}><input id="c-budget" inputMode="numeric" value={est.approvedBudget} onChange={(e) => setEst((s) => ({ ...s, approvedBudget: e.target.value }))} onBlur={check} /></Field>
              <Field label="Actual expenditure (₱)" error={errors.actual}><input id="c-actual" inputMode="numeric" value={est.actual} onChange={(e) => setEst((s) => ({ ...s, actual: e.target.value }))} onBlur={check} /></Field>
            </div>
            <dl className="variance">
              <dt>Cost variance</dt><dd className={cx('num', v.amount > 0 ? 'over' : v.amount < 0 ? 'under' : '')}>{est.actual === '' ? '—' : (v.amount > 0 ? '+' : '') + peso(v.amount)}</dd>
              <dt>Variance percentage</dt><dd className={cx('num', v.amount > 0 ? 'over' : v.amount < 0 ? 'under' : '')}>{est.actual === '' || v.pct === null ? '—' : `${v.pct > 0 ? '+' : ''}${v.pct.toFixed(1)}%`}</dd>
            </dl>
            <p className="small muted">Variance = actual expenditure − approved budget. Positive means over budget.</p>
            {a ? <button className="btn btn-primary full" onClick={save}>Save estimate to {a.id}</button>
              : <p className="small muted">Library estimates are for reference. Choose an assessed defect to save an estimate.</p>}
          </div>
          <Assumptions />
        </div>
      </div>
      <p className="disclaimer">{DISCLAIMER} Labor and materials are not assumed to be equal for every repair; each library item carries its own split.</p>
    </div>
  );
}

function Assumptions() {
  const app = useApp();
  const svc = useSvc();
  const [c, setC] = useState(app.settings.costs);
  const [open, setOpen] = useState(false);
  const save = () => {
    const bad = ['metroFactor', 'provincialFactor', 'mobilizationMetro', 'mobilizationProvincial', 'contingencyPct'].find((k) => Number.isNaN(Number(c[k])) || Number(c[k]) < 0);
    if (bad) { svc.toast('Assumptions must be positive numbers', 'warn'); return; }
    app.setSettings({ costs: { ...c, metroFactor: Number(c.metroFactor), provincialFactor: Number(c.provincialFactor), mobilizationMetro: Number(c.mobilizationMetro), mobilizationProvincial: Number(c.mobilizationProvincial), contingencyPct: Number(c.contingencyPct) } });
    svc.toast('Costing assumptions saved');
  };
  return (
    <div className="card">
      <div className="card-head"><h3>Costing assumptions</h3><button className="btn btn-sm" onClick={() => setOpen(!open)}>{open ? 'Close' : 'Edit'}</button></div>
      {!open ? (
        <dl className="assume">
          <dt>Metro Manila labor factor</dt><dd className="num">×{app.settings.costs.metroFactor}</dd>
          <dt>Provincial labor factor</dt><dd className="num">×{app.settings.costs.provincialFactor}</dd>
          <dt>Mobilization, Metro Manila</dt><dd className="num">{peso(app.settings.costs.mobilizationMetro)}</dd>
          <dt>Mobilization, provincial</dt><dd className="num">{peso(app.settings.costs.mobilizationProvincial)}</dd>
          <dt>Default contingency</dt><dd className="num">{app.settings.costs.contingencyPct}%</dd>
        </dl>
      ) : (
        <div className="form-grid one">
          {[['metroFactor', 'Metro Manila labor factor'], ['provincialFactor', 'Provincial labor factor'], ['mobilizationMetro', 'Mobilization, Metro Manila (₱)'], ['mobilizationProvincial', 'Mobilization, provincial (₱)'], ['contingencyPct', 'Default contingency (%)']].map(([k, l]) => (
            <Field key={k} label={l}><input id={'as-' + k} inputMode="decimal" value={c[k]} onChange={(e) => setC({ ...c, [k]: e.target.value })} /></Field>
          ))}
          <Field label="Notes"><textarea id="as-notes" rows={3} value={c.notes} onChange={(e) => setC({ ...c, notes: e.target.value })} /></Field>
          <button className="btn btn-primary" onClick={save}>Save assumptions</button>
        </div>
      )}
      <p className="small muted">{app.settings.costs.notes}</p>
    </div>
  );
}
