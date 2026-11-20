const { useState, useMemo, useRef } = React;
import { useApp } from '../app.jsx';
import { Field, Seg, Select, Icon, PrioBadge, pesoRange, useSvc, cx, DISCLAIMER, PRIORITY_LABEL } from '../ui.jsx';
import { CATEGORIES } from '../data/profiles.js';
import { SCOPE_QUESTIONS, SAFETY_QUESTIONS, EMPTY_SCOPE, EMPTY_SAFETY, classify, estimateFor, missingAnswers, linesFromItem } from '../engine.js';
import { canAuthorize, todayStr } from '../store.js';
const today = todayStr;

const STEPS = ['Defect identification', 'Extent of damage', 'Safety assessment', 'Automatic classification', 'Authorized validation'];

export const ESCALATION_ACTIONS = [
  ['makeSafe', 'Area made safe: cordoned, power or water isolated as needed'],
  ['notified', 'Warranty Manager and QQA notified immediately'],
  ['specialist', 'Specialist assessment arranged (licensed electrician, glazier, structural engineer or plumber)'],
  ['occupants', 'Occupants informed of the hazard and restrictions'],
  ['documented', 'Photos and time of make-safe recorded'],
];

function resizeImage(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = reject;
    fr.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const max = 1100; const s = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        resolve({ name: file.name, data: c.toDataURL('image/jpeg', 0.7) });
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}

export function ResultCard({ result, estimate, item, compact }) {
  if (!result) return null;
  const c = result.classification;
  return (
    <div className={cx('result', 'result-' + c.toLowerCase(), compact && 'compact')}>
      <div className="result-head">
        <div><span className="eyebrow">Recommended classification</span><div className="result-class">{c.toUpperCase()} WORKS</div></div>
        <div className="result-prio"><span className="eyebrow">Priority</span><PrioBadge p={result.priority} /></div>
      </div>
      <p className="result-summary">{result.summary}</p>
      <div className="result-grid">
        <div><span className="eyebrow">Reason for classification</span>
          <ul className="reasons">
            {result.triggers.map((t, i) => <li key={'t' + i} className="trig">{t}</li>)}
            {result.reasons.map((t, i) => <li key={'r' + i}>{t}</li>)}
            {!result.triggers.length && !result.reasons.length && <li>No scope escalators answered yes.</li>}
          </ul>
          <p className="small"><b>Scope score:</b> {result.score} (Major from 3) · <b>Repair scope:</b> {result.scopeClass}</p>
          <p className="small"><b>Priority basis:</b> {result.priorityWhy}</p>
        </div>
        {estimate && <div>
          <dl className="result-dl">
            <dt>Responsible trade</dt><dd>{estimate.trade}</dd>
            <dt>Estimated duration</dt><dd>{estimate.duration}</dd>
            <dt>Estimated cost range</dt><dd className="num"><b>{pesoRange(estimate.min, estimate.max)}</b></dd>
            <dt>Basis</dt><dd className="small">{estimate.basis}</dd>
          </dl>
        </div>}
      </div>
      {estimate && !compact && <div className="result-method"><span className="eyebrow">Recommended repair method</span><p>{estimate.method}</p></div>}
      {result.flags.length > 0 && <ul className="flags">{result.flags.map((f, i) => <li key={i}><Icon name="alert" size={15} /> {f}</li>)}</ul>}
    </div>
  );
}

export function Wizard() {
  const app = useApp();
  const svc = useSvc();
  const existing = app.params.assessmentId ? app.assessments.find((a) => a.id === app.params.assessmentId) : null;
  const preItem = app.params.itemId ? app.library.find((x) => x.id === app.params.itemId) : null;
  const [step, setStep] = useState(existing ? (app.params.step || (existing.validation ? 4 : 3)) : 0);
  const [id, setId] = useState(existing ? existing.id : null);
  const [form, setForm] = useState(() => existing ? {
    project: existing.project, location: existing.location, catCode: existing.catCode, itemId: existing.itemId, title: existing.title || '',
    description: existing.description, dateReported: existing.dateReported, reportedBy: existing.reportedBy, photos: existing.photos || [],
  } : { project: '', location: '', catCode: preItem ? preItem.catCode : '', itemId: preItem ? preItem.id : '', title: '', description: '', dateReported: today(), reportedBy: app.settings.user.name, photos: [] });
  const [scope, setScope] = useState(existing ? { ...EMPTY_SCOPE, ...existing.scope } : { ...EMPTY_SCOPE });
  const [safety, setSafety] = useState(existing ? { ...EMPTY_SAFETY, ...existing.safety } : { ...EMPTY_SAFETY });
  const [escalation, setEscalation] = useState(existing && existing.escalation ? existing.escalation : {});
  const [val, setVal] = useState(() => existing && existing.validation ? { ...existing.validation } : {
    assessedBy: app.settings.user.name, qqaReview: '', qqaStatus: '', wmReview: '', wmStatus: '', finalClass: '', finalPriority: '', overrideJustification: '', remarks: '', date: today(),
  });
  const [errors, setErrors] = useState({});
  const fileRef = useRef(null);

  const item = app.library.find((x) => x.id === form.itemId);
  const items = app.library.filter((x) => !form.catCode || x.catCode === form.catCode);
  const missing = missingAnswers(scope, safety);
  const result = useMemo(() => (missing.length ? null : classify(scope, safety, item)), [scope, safety, item, missing.length]);
  const estimate = useMemo(() => (result && item ? estimateFor(item, result, scope, app.library) : null), [result, item, scope, app.library]);

  const setF = (k) => (e) => setForm((s) => ({ ...s, [k]: e && e.target ? e.target.value : e }));

  const addPhotos = async (files) => {
    const list = [...files].slice(0, Math.max(0, 4 - form.photos.length));
    if (files.length > list.length) svc.toast('Up to 4 photos per assessment', 'warn');
    try {
      const out = await Promise.all(list.filter((f) => f.type.startsWith('image/')).map(resizeImage));
      setForm((s) => ({ ...s, photos: [...s.photos, ...out] }));
    } catch (e) { svc.toast('That file could not be read as an image', 'warn'); }
    if (fileRef.current) fileRef.current.value = '';
  };

  const checkStep = (s) => {
    const e = {};
    if (s === 0) {
      ['project', 'location', 'catCode', 'itemId', 'description', 'dateReported', 'reportedBy'].forEach((k) => { if (!String(form[k] || '').trim()) e[k] = 'Required'; });
      if (form.dateReported && form.dateReported > todayStr()) e.dateReported = 'Date reported cannot be in the future';
    }
    if (s === 1) {
      SCOPE_QUESTIONS.forEach(([k]) => { if (!scope[k]) e[k] = 'Answer required'; });
      if (scope.affectsFunction === 'yes' && scope.appearanceOnly === 'yes') e.appearanceOnly = 'A defect that affects functionality is not appearance-only. Change one answer.';
      if (scope.extent === 'localized' && scope.components === '6+') e.components = 'Six or more components is rarely localized. Confirm the extent.';
    }
    if (s === 2) {
      SAFETY_QUESTIONS.forEach(([k]) => { if (k === 'leakNearElectrical' && (!safety.leak || safety.leak === 'none')) return; if (!safety[k]) e[k] = 'Answer required'; });
    }
    setErrors(e);
    if (Object.keys(e).length) svc.toast('Complete the highlighted answers', 'warn');
    return !Object.keys(e).length;
  };
  const next = () => { if (checkStep(step)) setStep(step + 1); };

  const buildRecord = (extra) => {
    const base = existing || {};
    const lines = base.cost && base.cost.lines ? base.cost.lines : linesFromItem(app.library.find((x) => x.id === (estimate && estimate.refId)) || item, { mobilization: app.settings.costs.mobilizationMetro });
    return {
      ...base, id: id || undefined, sample: base.sample || false,
      ...form, scope, safety, result, estimate, escalation,
      cost: base.cost || { region: 'metro', mode: 'combined', lines, contingencyPct: app.settings.costs.contingencyPct, approvedBudget: '', actual: '' },
      qa: base.qa || null,
      ...extra,
    };
  };

  const saveAssessment = () => {
    if (!result) return;
    const prevRec = existing && existing.result ? existing.result.classification : null;
    const changed = existing && existing.validation && existing.validation.validated && prevRec !== result.classification;
    const rec = buildRecord({
      status: existing && existing.validation && existing.validation.validated && !changed ? existing.status : 'For Validation',
      validation: changed ? { ...existing.validation, validated: false } : (existing ? existing.validation : null),
    });
    const newId = app.saveAssessment(rec, existing ? 'Assessment updated' : 'Assessment created');
    setId(newId);
    if (changed) svc.toast('Recommendation changed. The record needs validation again.', 'warn');
    else svc.toast(`Assessment ${newId} saved`);
    if (result.classification === 'Critical') svc.toast('CRITICAL: start safety escalation now', 'crit');
    setStep(4);
  };

  const recClass = result ? result.classification : '';
  const recPrio = result ? result.priority : '';
  const finalClass = val.finalClass || recClass;
  const finalPriority = val.finalPriority || recPrio;
  const overridden = result && (finalClass !== recClass || finalPriority !== recPrio);
  const authorized = canAuthorize(app.settings.user.role);

  const validate = () => {
    const e = {};
    ['assessedBy', 'qqaReview', 'wmReview', 'date'].forEach((k) => { if (!String(val[k] || '').trim()) e[k] = 'Required'; });
    if (!val.qqaStatus) e.qqaStatus = 'Select the QQA review outcome';
    if (!val.wmStatus) e.wmStatus = 'Select the Warranty Manager review outcome';
    if (overridden && !authorized) e.finalClass = 'Only QQA, Warranty Manager or Management can override the recommendation. Change your role in Settings if you are authorized.';
    if (overridden && String(val.overrideJustification || '').trim().length < 20) e.overrideJustification = 'Overrides need a documented justification (at least 20 characters).';
    if (recClass === 'Critical' && finalClass !== 'Critical' && !e.overrideJustification && !/specialist|engineer|electrician|inspect/i.test(val.overrideJustification)) e.overrideJustification = 'Downgrading a Critical recommendation must cite the specialist inspection that cleared the hazard.';
    if (finalClass === 'Critical' && !ESCALATION_ACTIONS.slice(0, 2).every(([k]) => escalation[k])) e.escalation = 'Critical works: confirm the make-safe and notification actions before validation.';
    setErrors(e);
    return !Object.keys(e).length;
  };
  const saveValidation = () => {
    if (!id) { svc.toast('Save the assessment in step 4 first', 'warn'); return; }
    if (!validate()) { svc.toast('Validation incomplete', 'warn'); return; }
    const anyReturned = val.qqaStatus === 'Returned' || val.wmStatus === 'Returned';
    const rec = buildRecord({
      id, validation: { ...val, finalClass, finalPriority, validated: !anyReturned, overridden: !!overridden, by: app.who },
      status: anyReturned ? 'For Validation' : (existing && ['Completed', 'For Reinspection', 'In Repair'].includes(existing.status) ? existing.status : 'Validated'),
    });
    app.saveAssessment(rec, anyReturned ? 'Returned for revision' : overridden ? `Validated with override (${recClass} → ${finalClass}, ${recPrio} → ${finalPriority})` : 'Validated');
    svc.toast(anyReturned ? 'Saved as returned for revision' : `${id} validated as ${finalClass} / ${finalPriority}`);
  };

  const Q = ({ list, state, setState, danger }) => (
    <div className="questions">
      {list.map(([k, q, opts]) => {
        if (k === 'leakNearElectrical' && (!state.leak || state.leak === 'none')) return null;
        return (
          <div className={cx('question', errors[k] && 'has-error', danger && state[k] === 'yes' && 'q-hazard')} key={k}>
            <span className="q-text">{q}</span>
            <Seg name={q} value={state[k]} options={opts} danger={danger} onChange={(v) => setState((s) => ({ ...s, [k]: v }))} />
            {errors[k] && <span className="field-error">{errors[k]}</span>}
          </div>
        );
      })}
    </div>
  );

  const liveHazard = SAFETY_QUESTIONS.some(([k]) => safety[k] === 'yes' && k !== 'propertyDamage' && k !== 'leakNearElectrical') || safety.leak === 'flooding' || ((safety.leak === 'active') && safety.leakNearElectrical === 'yes');

  return (
    <div className="stack">
      <ol className="steps">
        {STEPS.map((s, i) => (
          <li key={s} className={cx(i === step && 'on', i < step && 'done')}>
            <button onClick={() => { if (i <= step || id) setStep(i); }} disabled={!(i <= step || id)}>
              <span className="step-n">{i + 1}</span><span className="step-l">{s}</span>
            </button>
          </li>
        ))}
      </ol>
      {existing && <p className="note">Editing <b className="mono">{existing.id}</b>{existing.sample ? ' (sample record)' : ''} · status {existing.status}</p>}

      {step === 0 && (
        <div className="card">
          <h3>Step 1 – Defect identification</h3>
          <div className="form-grid">
            <Field label="Project name" required error={errors.project}><input id="w-project" value={form.project} onChange={setF('project')} placeholder="e.g. Unit 12B, Residence name" /></Field>
            <Field label="Location / room" required error={errors.location}><input id="w-location" value={form.location} onChange={setF('location')} placeholder="e.g. Master bathroom" /></Field>
            <Field label="Date reported" required error={errors.dateReported}><input id="w-date" type="date" value={form.dateReported} max={todayStr()} onChange={setF('dateReported')} /></Field>
            <Field label="Defect category" required error={errors.catCode}>
              <Select id="w-cat" value={form.catCode} onChange={(c) => setForm((s) => ({ ...s, catCode: c, itemId: app.library.find((x) => x.id === s.itemId && x.catCode === c) ? s.itemId : '' }))} placeholder="Select category" options={Object.entries(CATEGORIES).map(([k, v]) => [k, `${k}. ${v}`])} />
            </Field>
            <Field label="Specific repair item" required error={errors.itemId} span={2} hint={item ? `${item.id} · library default ${item.classification} / ${item.priority} · ${pesoRange(item.costMin, item.costMax)}` : 'Choose the closest library item; refine the scope in the next steps.'}>
              <Select id="w-item" value={form.itemId} onChange={setF('itemId')} placeholder={form.catCode ? 'Select repair item' : 'Select a category first'} disabled={!form.catCode}
                options={items.map((x) => [x.id, `${x.id} · ${x.subcategory} · ${x.item}`])} />
            </Field>
            <Field label="Defect description" required error={errors.description} span={2}><textarea id="w-desc" rows={3} value={form.description} onChange={setF('description')} placeholder="What was observed, where, and since when" /></Field>
            <Field label="Reported by" required error={errors.reportedBy}><input id="w-by" value={form.reportedBy} onChange={setF('reportedBy')} /></Field>
            <div className="field span-3">
              <span className="field-label">Photo upload / evidence</span>
              <div className="photos">
                {form.photos.map((p, i) => (
                  <figure key={i} className="photo"><img src={p.data} alt={p.name} /><button className="icon-btn" aria-label="Remove photo" onClick={() => setForm((s) => ({ ...s, photos: s.photos.filter((_, j) => j !== i) }))}><Icon name="close" size={14} /></button></figure>
                ))}
                {form.photos.length < 4 && <label className="photo-add"><input ref={fileRef} type="file" accept="image/*" multiple onChange={(e) => addPhotos(e.target.files)} /><Icon name="plus" /><span>Add photos</span></label>}
              </div>
              <span className="field-hint">Up to 4 images, resized and stored in this browser with the record.</span>
            </div>
          </div>
          {item && (
            <details className="ref-details"><summary>Library reference for {item.id}: inspection requirements and criteria</summary>
              <p><b>Inspection:</b> {item.inspection}</p>
              <div className="criteria">
                <div className="crit crit-minor"><b>Minor</b><p>{item.minorCriteria}</p></div>
                <div className="crit crit-major"><b>Major</b><p>{item.majorCriteria}</p></div>
                <div className="crit crit-critical"><b>Critical</b><p>{item.criticalCriteria}</p></div>
              </div>
            </details>
          )}
        </div>
      )}

      {step === 1 && (
        <div className="card">
          <h3>Step 2 – Extent of damage</h3>
          <p className="small muted">These answers decide repair scope (Minor or Major). Isolated single-component replacements stay Minor; reconstruction is always Major.</p>
          {Q({ list: SCOPE_QUESTIONS, state: scope, setState: setScope })}
        </div>
      )}

      {step === 2 && (
        <div className="card">
          <h3>Step 3 – Safety assessment</h3>
          <p className="small muted">Any confirmed immediate hazard makes the defect CRITICAL with P1 Emergency priority, whatever the repair size. Choose <b>Not sure</b> if a specialist must confirm; that raises priority and blocks closure until inspected.</p>
          {liveHazard && <div className="banner banner-crit" role="alert"><Icon name="alert" /> Hazard confirmed. This defect will be classified CRITICAL and needs immediate escalation.</div>}
          {Q({ list: SAFETY_QUESTIONS, state: safety, setState: setSafety, danger: true })}
        </div>
      )}

      {step === 3 && (
        <div className="stack">
          {!item && <div className="banner banner-warn"><Icon name="alert" /> Select a repair item in step 1.</div>}
          {missing.length > 0 && <div className="banner banner-warn"><Icon name="alert" /> {missing.length} question{missing.length > 1 ? 's' : ''} unanswered. Go back to steps 2 and 3.</div>}
          {result && <ResultCard result={result} estimate={estimate} item={item} />}
          {result && result.escalate && <EscalationPanel escalation={escalation} setEscalation={setEscalation} />}
          <p className="disclaimer">{DISCLAIMER}</p>
        </div>
      )}

      {step === 4 && (
        <div className="stack">
          {result && <ResultCard result={result} estimate={estimate} item={item} compact />}
          {result && finalClass === 'Critical' && <EscalationPanel escalation={escalation} setEscalation={setEscalation} error={errors.escalation} />}
          <div className="card">
            <h3>Step 5 – Authorized validation</h3>
            {!id && <div className="banner banner-warn"><Icon name="alert" /> Save the assessment in step 4 before validating.</div>}
            <div className="form-grid">
              <Field label="Assessed by" required error={errors.assessedBy}><input id="v-assessed" value={val.assessedBy} onChange={(e) => setVal({ ...val, assessedBy: e.target.value })} /></Field>
              <Field label="QQA review (name)" required error={errors.qqaReview}><input id="v-qqa" value={val.qqaReview} onChange={(e) => setVal({ ...val, qqaReview: e.target.value })} /></Field>
              <Field label="QQA outcome" required error={errors.qqaStatus}><Seg name="QQA outcome" value={val.qqaStatus} options={[['Endorsed', 'Endorsed'], ['Returned', 'Returned']]} onChange={(v) => setVal({ ...val, qqaStatus: v })} /></Field>
              <Field label="Warranty Manager review (name)" required error={errors.wmReview}><input id="v-wm" value={val.wmReview} onChange={(e) => setVal({ ...val, wmReview: e.target.value })} /></Field>
              <Field label="Warranty Manager outcome" required error={errors.wmStatus}><Seg name="Warranty Manager outcome" value={val.wmStatus} options={[['Endorsed', 'Endorsed'], ['Returned', 'Returned']]} onChange={(v) => setVal({ ...val, wmStatus: v })} /></Field>
              <Field label="Assessment date" required error={errors.date}><input id="v-date" type="date" value={val.date} onChange={(e) => setVal({ ...val, date: e.target.value })} /></Field>
              <Field label="Final approved classification" error={errors.finalClass} hint={recClass ? `Recommended: ${recClass}` : ''}>
                <Select id="v-class" value={finalClass} onChange={(v) => setVal({ ...val, finalClass: v })} options={['Minor', 'Major', 'Critical']} />
              </Field>
              <Field label="Final approved priority" hint={recPrio ? `Recommended: ${recPrio} ${PRIORITY_LABEL[recPrio]}` : ''}>
                <Select id="v-prio" value={finalPriority} onChange={(v) => setVal({ ...val, finalPriority: v })} options={Object.keys(PRIORITY_LABEL).map((p) => [p, `${p} ${PRIORITY_LABEL[p]}`])} />
              </Field>
              <div className="field"><span className="field-label">Authorization</span><span className={cx('small', authorized ? 'ok-text' : 'warn-text')}>{authorized ? `You can override as ${app.settings.user.role}.` : `${app.settings.user.role} cannot override the recommendation.`}</span></div>
              {overridden && <Field label="Override justification" required error={errors.overrideJustification} span={3} hint="State what was found on site and who confirmed it."><textarea id="v-just" rows={3} value={val.overrideJustification} onChange={(e) => setVal({ ...val, overrideJustification: e.target.value })} /></Field>}
              <Field label="Remarks" span={3}><textarea id="v-remarks" rows={2} value={val.remarks} onChange={(e) => setVal({ ...val, remarks: e.target.value })} /></Field>
            </div>
            {overridden && <p className="override-note"><Icon name="alert" size={15} /> Override: {recClass} / {recPrio} → {finalClass} / {finalPriority}. The original recommendation stays on the record.</p>}
          </div>
        </div>
      )}

      <div className="wizard-nav">
        {step > 0 && <button className="btn" onClick={() => setStep(step - 1)}>Back</button>}
        <span className="spacer" />
        {step < 3 && <button className="btn btn-primary" onClick={next}>Continue <Icon name="arrow" /></button>}
        {step === 3 && <button className="btn btn-primary" disabled={!result || !item} onClick={saveAssessment}>{id ? 'Save and continue to validation' : 'Save assessment'} <Icon name="arrow" /></button>}
        {step === 4 && <>
          {id && <button className="btn" onClick={() => app.go('cost', { assessmentId: id })}>Cost estimate</button>}
          {id && <button className="btn" onClick={() => app.go('reports', { type: 'individual', assessmentId: id })}>Assessment report</button>}
          <button className="btn btn-primary" disabled={!id} onClick={saveValidation}>Validate and save</button>
        </>}
      </div>
    </div>
  );
}

function EscalationPanel({ escalation, setEscalation, error }) {
  return (
    <div className="card escalation">
      <h3><Icon name="alert" /> Safety escalation required</h3>
      <p className="small">Critical classification triggers immediate safety escalation and specialist assessment. Record each action as it is done.</p>
      <ul className="esc-list">
        {ESCALATION_ACTIONS.map(([k, l]) => (
          <li key={k}><label className="check"><input type="checkbox" checked={!!escalation[k]} onChange={(e) => setEscalation((s) => ({ ...s, [k]: e.target.checked ? new Date().toISOString() : '' }))} /> {l}</label>
            {escalation[k] && <span className="muted small"> · {new Date(escalation[k]).toLocaleString('en-PH')}</span>}</li>
        ))}
      </ul>
      {error && <span className="field-error">{error}</span>}
    </div>
  );
}
