const { useState, useMemo } = React;
import { useApp } from '../app.jsx';
import { ClassBadge, PrioBadge, StatusBadge, Select, Icon, useSvc, pesoRange, peso, fmtDate, Empty, PRIORITY_LABEL, cx } from '../ui.jsx';
import { runScenarios, PRIORITIES } from '../engine.js';
import { finalClass, finalPriority, itemOf, estMid } from '../derive.js';

export const CLASS_DEFS = [
  { c: 'Minor', title: 'MINOR WORKS', guide: '₱500 – ₱10,000',
    def: 'Localized repairs, adjustments, cosmetic corrections and isolated component replacements without substantial dismantling or reconstruction.',
    traits: ['Localized affected area', 'Limited material requirements', 'Usually one trade', 'Minimal disruption', 'Generally completed within one working day', 'No immediate safety risk', 'No significant damage to surrounding components'],
    examples: ['Hairline wall crack repair', 'Localized paint touch-up', 'Door hinge adjustment', 'Cabinet hinge replacement', 'Localized tile re-grouting', 'Faucet cartridge replacement', 'Localized silicone replacement'] },
  { c: 'Major', title: 'MAJOR WORKS', guide: '₱15,000 – ₱150,000+',
    def: 'Repairs involving extensive deterioration, multiple components, significant dismantling, material replacement or reconstruction.',
    traits: ['Extensive or multiple affected areas', 'Multiple trades may be involved', 'Significant material requirements', 'Requires dismantling or replacement', 'May disrupt normal room usage', 'Usually requires multiple working days'],
    examples: ['Full room repainting', 'Extensive gypsum ceiling replacement', 'Whole-room tile replacement', 'Bathroom waterproofing rehabilitation', 'Built-in cabinet replacement', 'Electrical rewiring', 'Plumbing pipe replacement'] },
  { c: 'Critical', title: 'CRITICAL WORKS', guide: 'Severity rating, not a cost band',
    def: 'Defects that present immediate or potentially serious risks to occupants, property, building systems or safety. Triggers immediate safety escalation and specialist assessment.',
    traits: ['A small defect can be Critical', 'A high-cost repair can stay Major without being Critical', 'Make-safe first, then scope the repair', 'Specialist assessment required'],
    examples: ['Active electrical sparking', 'Exposed live wiring', 'Electrical overheating', 'Major water leakage near electrical installations', 'Unstable or shattered glass', 'Severe ceiling sagging with possible collapse', 'Significant flooding', 'Suspected structural movement'] },
];
const PRIO_EXAMPLES = {
  P1: ['Electrical fire risk', 'Major flooding', 'Unstable glass', 'Severe ceiling collapse risk'],
  P2: ['Active concealed plumbing leak', 'Repeated electrical circuit failure', 'Severe water seepage'],
  P3: ['Loose tiles', 'Defective faucet', 'Door misalignment'],
  P4: ['Paint scratches', 'Minor paint touch-up', 'Small laminate imperfections'],
};
const STATUSES = ['For Validation', 'Validated', 'In Repair', 'For Reinspection', 'Completed'];

export function Classification() {
  const app = useApp();
  const svc = useSvc();
  const [tab, setTab] = useState(app.params.filter ? 'register' : 'register');
  const [fc, setFc] = useState(app.params.filter || '');
  const [fs, setFs] = useState('');
  const [q, setQ] = useState('');
  const tests = useMemo(() => runScenarios(app.library), [app.library]);

  const rows = app.assessments.filter((a) => (!fc || finalClass(a) === fc) && (!fs || a.status === fs)
    && (!q || [a.id, a.project, a.location, a.title, a.description, (itemOf(app.library, a) || {}).item].join(' ').toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => (b.dateReported || '').localeCompare(a.dateReported || '') || b.id.localeCompare(a.id));

  const del = async (a) => {
    const ok = await svc.confirm({ title: 'Delete assessment?', message: `${a.id} (${a.project}, ${a.location}) and its costing and QA records will be deleted.`, confirmLabel: 'Delete assessment', danger: true });
    if (ok) { app.deleteAssessment(a.id); svc.toast(`${a.id} deleted`); }
  };
  const setStatus = (a, s) => {
    if (s === 'Completed') { svc.toast('Completion is set from QA Inspection after all mandatory checks pass.', 'warn'); app.go('qa', { assessmentId: a.id }); return; }
    if (s !== 'For Validation' && !(a.validation && a.validation.validated)) { svc.toast('Validate the classification first (wizard step 5).', 'warn'); return; }
    app.saveAssessment({ ...a, status: s }, `Status changed to ${s}`);
  };

  return (
    <div className="stack">
      <div className="tabs" role="tablist">
        {[['register', `Assessment register (${app.assessments.length})`], ['framework', 'Classification framework'], ['tests', `Engine self-test (${tests.filter((t) => t.pass).length}/${tests.length})`]].map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={cx('tab', tab === k && 'on')} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {tab === 'register' && <>
        <div className="toolbar">
          <div className="search"><Icon name="search" /><input id="reg-search" type="search" placeholder="Search project, room, item, ID…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search assessments" /></div>
          <div className="toolbar-right"><button className="btn btn-primary" onClick={() => app.go('assess')}><Icon name="plus" /> New assessment</button></div>
        </div>
        <div className="filters">
          <Select aria-label="Classification" value={fc} onChange={setFc} placeholder="All classifications" options={['Minor', 'Major', 'Critical']} />
          <Select aria-label="Status" value={fs} onChange={setFs} placeholder="All statuses" options={STATUSES} />
          <span className="count num">{rows.length} of {app.assessments.length}</span>
        </div>
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>ID</th><th>Project / location</th><th>Repair item</th><th>Recommended</th><th>Final</th><th>Priority</th><th className="r">Estimate (₱)</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {rows.map((a) => {
                const it = itemOf(app.library, a);
                const fcl = finalClass(a);
                const over = a.validation && a.validation.overridden;
                return (
                  <tr key={a.id} className={fcl === 'Critical' && a.status !== 'Completed' ? 'row-crit' : ''}>
                    <td className="mono nowrap">{a.id}{a.sample && <div><span className="chip chip-sample">SAMPLE</span></div>}</td>
                    <td><b>{a.project}</b><div className="muted small">{a.location} · {fmtDate(a.dateReported)}</div></td>
                    <td className="small">{it ? <><span className="mono">{it.id}</span> {it.item}</> : <span className="muted">Item removed from library</span>}</td>
                    <td><ClassBadge c={a.result && a.result.classification} small /></td>
                    <td>{a.validation && a.validation.validated ? <><ClassBadge c={fcl} small />{over && <div className="small warn-text">override</div>}</> : <span className="muted small">pending</span>}</td>
                    <td><PrioBadge p={finalPriority(a)} small /></td>
                    <td className="r num nowrap">{a.estimate ? `${a.estimate.min.toLocaleString()} – ${a.estimate.max.toLocaleString()}` : '—'}</td>
                    <td><Select aria-label={`Status of ${a.id}`} className="status-select" value={a.status} onChange={(s) => setStatus(a, s)} options={STATUSES} /></td>
                    <td className="actions nowrap">
                      <button className="btn btn-sm" onClick={() => app.go('assess', { assessmentId: a.id })}>Open</button>
                      <button className="btn btn-sm" onClick={() => app.go('cost', { assessmentId: a.id })}>Cost</button>
                      <button className="btn btn-sm" onClick={() => app.go('qa', { assessmentId: a.id })}>QA</button>
                      <button className="btn btn-sm" onClick={() => app.go('reports', { type: 'individual', assessmentId: a.id })}>Report</button>
                      <button className="icon-btn danger" aria-label={`Delete ${a.id}`} onClick={() => del(a)}><Icon name="trash" size={16} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!rows.length && <Empty title="No assessments yet">Start one from the Assessment Wizard.</Empty>}
        </div>
      </>}

      {tab === 'framework' && <>
        <div className="class-cards">
          {CLASS_DEFS.map((d) => (
            <div key={d.c} className={`card class-card cc-${d.c.toLowerCase()}`}>
              <div className="cc-head"><ClassBadge c={d.c} /><span className="cc-guide num">{d.guide}</span></div>
              <p>{d.def}</p>
              <b className="small">Typical characteristics</b>
              <ul>{d.traits.map((t) => <li key={t}>{t}</li>)}</ul>
              <b className="small">Examples</b>
              <ul className="ex">{d.examples.map((t) => <li key={t}>{t}</li>)}</ul>
            </div>
          ))}
        </div>
        <div className="card">
          <h3>Priority levels (assessed separately from classification)</h3>
          <div className="prio-grid">
            {Object.entries(PRIORITIES).map(([p, d]) => (
              <div key={p} className="prio-card"><PrioBadge p={p} /><p>{d.desc}</p><ul>{PRIO_EXAMPLES[p].map((e) => <li key={e}>{e}</li>)}</ul></div>
            ))}
          </div>
        </div>
        <div className="card">
          <h3>How the engine decides</h3>
          <ol className="logic">
            <li><b>Safety screen first.</b> Confirmed electrical exposure or overheating, unstable glass, ceiling sagging or falling debris, suspected structural movement, an immediate occupant risk, major flooding, or active leakage near electrical installations makes the defect <ClassBadge c="Critical" small /> with <PrioBadge p="P1" small />.</li>
            <li><b>"Not sure" never downgrades.</b> An unconfirmed safety answer raises priority to P2 and requires a specialist inspection before the classification is finalized.</li>
            <li><b>Repair scope.</b> Reconstruction is always Major. Extensive damage with dismantling, replacement or several components is Major. Otherwise a score is added up: extensive area +2, 2–5 components +1, 6 or more +2, dismantling +1, replacement of several components +1, several trades +1. A score of 3 or more is Major; below 3 is Minor.</li>
            <li><b>Priority.</b> P1 for confirmed hazards; P2 for active leakage, risk of further property damage or unconfirmed safety; P3 for functional defects; P4 for appearance-only defects.</li>
            <li><b>Cost does not set the classification.</b> The estimate follows the scope. When a Minor library item is assessed as Major, the range comes from its linked major-scope item.</li>
            <li><b>Professional validation.</b> QQA and the Warranty Manager endorse the result. Overrides are limited to QQA, Warranty Manager and Management, and need a written justification. A Critical recommendation can only be downgraded by citing the specialist inspection.</li>
          </ol>
        </div>
        <div className="card">
          <h3>Classification and priority are independent</h3>
          <div className="table-wrap"><table className="tbl matrix">
            <thead><tr><th></th>{['P1', 'P2', 'P3', 'P4'].map((p) => <th key={p}><PrioBadge p={p} small /> {PRIORITY_LABEL[p]}</th>)}</tr></thead>
            <tbody>
              <tr><th><ClassBadge c="Minor" small /></th><td className="na">Not used: a confirmed hazard is Critical</td><td>Leaking flexible hose; seepage near outlets</td><td>Loose tile; faulty faucet</td><td>Paint touch-up</td></tr>
              <tr><th><ClassBadge c="Major" small /></th><td className="na">Not used: a confirmed hazard is Critical</td><td>Bathroom waterproofing failure with active leak</td><td>Whole-room tile re-laying</td><td>Full room wallpaper replacement</td></tr>
              <tr><th><ClassBadge c="Critical" small /></th><td>Sparking outlet; shattered shower glass</td><td colSpan={3} className="na">Critical always starts at P1 until made safe; the validated priority may be lowered after make-safe with justification.</td></tr>
            </tbody>
          </table></div>
        </div>
      </>}

      {tab === 'tests' && (
        <div className="card">
          <h3>Engine self-test: Part 13 scenarios</h3>
          <p className="small muted">Runs the live classification engine against the required scenarios using the current library. Scenario E is split into its two severity cases.</p>
          <div className="table-wrap"><table className="tbl">
            <thead><tr><th>Scenario</th><th>Expected</th><th>Result</th><th>Priority</th><th>Estimate</th><th>Check</th></tr></thead>
            <tbody>{tests.map((t) => (
              <tr key={t.key}>
                <td><b>{t.key}.</b> {t.title}<div className="muted small">{t.item ? `${t.item.id} ${t.item.item}` : 'Library item missing'}</div></td>
                <td className="small">{t.expectText}</td>
                <td><ClassBadge c={t.result.classification} small /></td>
                <td><PrioBadge p={t.result.priority} small /></td>
                <td className="small num">{t.item ? pesoRange(t.item.costMin, t.item.costMax) : '—'}</td>
                <td>{t.pass ? <span className="pass">PASS</span> : <span className="fail">FAIL</span>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        </div>
      )}
    </div>
  );
}
