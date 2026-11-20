const { useState } = React;
import { useApp } from '../app.jsx';
import { Field, Select, Icon, useSvc, cx, ClassBadge, PrioBadge, StatusBadge, Empty } from '../ui.jsx';
import { checklistFor, qaGate, QA_STATUSES } from '../qa.js';
import { itemOf, finalClass, finalPriority } from '../derive.js';
import { todayStr } from '../store.js';

const SHORT = { PASS: 'Pass', FAIL: 'Fail', 'FOR REINSPECTION': 'Reinspect', 'NOT APPLICABLE': 'N/A' };

export function QAInspection() {
  const app = useApp();
  const svc = useSvc();
  const pick = app.params.assessmentId || (app.assessments.find((a) => a.status !== 'Completed') || app.assessments[0] || {}).id || '';
  const [aid, setAid] = useState(pick);
  const a = app.assessments.find((x) => x.id === aid);
  const item = a && itemOf(app.library, a);
  const cl = checklistFor(item);
  const [qa, setQa] = useState(() => (a && a.qa ? { ...a.qa, checks: { ...a.qa.checks } } : { checks: {}, inspector: app.settings.user.name, date: todayStr(), remarks: '' }));
  const [err, setErr] = useState('');

  const change = (id) => {
    setAid(id);
    const na = app.assessments.find((x) => x.id === id);
    setQa(na && na.qa ? { ...na.qa, checks: { ...na.qa.checks } } : { checks: {}, inspector: app.settings.user.name, date: todayStr(), remarks: '' });
    setErr('');
  };
  if (!a) return <Empty title="No assessments to inspect">Create an assessment first.</Empty>;

  const gate = qaGate(cl, qa.checks);
  const validated = a.validation && a.validation.validated;
  const specialistOpen = a.result && a.result.specialist && finalClass(a) === 'Critical' && !(a.escalation && a.escalation.specialist);
  const setCheck = (k, v) => setQa((s) => ({ ...s, checks: { ...s.checks, [k]: v } }));
  const anyFail = Object.values(qa.checks).some((v) => v === 'FAIL' || v === 'FOR REINSPECTION');

  const save = (complete) => {
    if (!qa.inspector.trim() || !qa.date) { setErr('Enter the inspector name and inspection date.'); return; }
    if (complete) {
      if (!validated) { setErr('The classification must be validated (wizard step 5) before the claim can be completed.'); return; }
      if (specialistOpen) { setErr('Critical works: record the specialist assessment in the escalation checklist before closing.'); return; }
      if (!gate.canComplete) { setErr('Mandatory verification requirements are not met. The claim cannot be marked completed.'); return; }
    }
    const status = complete ? 'Completed' : anyFail ? 'For Reinspection' : a.status === 'Completed' && !gate.canComplete ? 'For Reinspection' : a.status;
    app.saveAssessment({ ...a, qa: { ...qa, completedAt: complete ? new Date().toISOString() : (a.qa && a.qa.completedAt) || '' }, status },
      complete ? 'QA passed: claim completed' : anyFail ? 'QA inspection: re-inspection required' : 'QA inspection saved');
    setErr('');
    svc.toast(complete ? `${a.id} completed` : anyFail ? `${a.id} set to For Reinspection` : 'Inspection saved');
  };

  const done = cl.list.filter((c) => qa.checks[c.key]).length;
  return (
    <div className="stack">
      <div className="card">
        <div className="form-grid">
          <Field label="Assessment" span={2}>
            <Select id="qa-asmt" value={aid} onChange={change} options={app.assessments.map((x) => [x.id, `${x.id} · ${x.project} · ${x.location} · ${x.status}`])} />
          </Field>
          <div className="field"><span className="field-label">Status</span><StatusBadge s={a.status} /></div>
        </div>
        <p className="small ref-line">{item ? <><b className="mono">{item.id}</b> {item.item}</> : 'Library item removed'} · <ClassBadge c={finalClass(a)} small /> <PrioBadge p={finalPriority(a)} small /> · checklist: {cl.label}</p>
        {!validated && <div className="banner banner-warn"><Icon name="alert" /> Classification not yet validated. Inspections can be recorded, but completion is blocked until validation.</div>}
      </div>

      <div className="card">
        <div className="card-head"><h3>Quality verification checklist</h3><span className="muted small num">{done} of {cl.list.length} inspected</span></div>
        <div className="qa-list">
          {cl.list.map((c) => {
            const v = qa.checks[c.key];
            return (
              <div key={c.key} className={cx('qa-row', v && 'qa-' + v.split(' ')[0].toLowerCase())}>
                <div className="qa-label">{c.label}{c.mandatory ? <em className="mand">mandatory</em> : <em className="opt">optional</em>}</div>
                <div className="seg qa-seg" role="radiogroup" aria-label={c.label}>
                  {QA_STATUSES.map((s) => (
                    <button key={s} type="button" role="radio" aria-checked={v === s} disabled={c.mandatory && s === 'NOT APPLICABLE'}
                      title={c.mandatory && s === 'NOT APPLICABLE' ? 'Mandatory checks cannot be marked N/A' : s}
                      className={cx('seg-opt', v === s && 'on', v === s && 'on-' + s.split(' ')[0].toLowerCase())} onClick={() => setCheck(c.key, s)}>{SHORT[s]}</button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <div className="form-grid">
          <Field label="Inspected by" required><input id="qa-by" value={qa.inspector} onChange={(e) => setQa({ ...qa, inspector: e.target.value })} /></Field>
          <Field label="Inspection date" required><input id="qa-date" type="date" value={qa.date} onChange={(e) => setQa({ ...qa, date: e.target.value })} /></Field>
          <Field label="Inspection findings / remarks" span={3}><textarea id="qa-remarks" rows={3} value={qa.remarks} onChange={(e) => setQa({ ...qa, remarks: e.target.value })} /></Field>
        </div>
        <div className={cx('gate', gate.canComplete && validated && !specialistOpen ? 'gate-ok' : 'gate-block')}>
          {gate.canComplete && validated && !specialistOpen
            ? <><Icon name="check" /> All mandatory verification requirements passed. The claim can be marked completed.</>
            : <><Icon name="alert" /> <div><b>Completion blocked.</b>
              <ul>{!validated && <li>Classification not validated.</li>}{specialistOpen && <li>Specialist assessment not recorded for Critical works.</li>}{gate.problems.slice(0, 6).map((p, i) => <li key={i}>{p}</li>)}{gate.problems.length > 6 && <li>…and {gate.problems.length - 6} more</li>}</ul></div></>}
        </div>
        {err && <p className="field-error">{err}</p>}
        <div className="wizard-nav">
          <button className="btn" onClick={() => app.go('reports', { type: 'qa', assessmentId: a.id })}>QA report</button>
          <span className="spacer" />
          <button className="btn" onClick={() => save(false)}>Save inspection</button>
          <button className="btn btn-primary" onClick={() => save(true)}>Mark claim completed</button>
        </div>
      </div>
    </div>
  );
}
