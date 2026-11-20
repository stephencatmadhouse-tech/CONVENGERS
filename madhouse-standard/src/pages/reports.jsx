const { useState, useMemo } = React;
import { useApp } from '../app.jsx';
import { Field, Select, Icon, useSvc, esc, peso, pesoRange, fmtDate, toCSV, primaryTrade, DISCLAIMER, PRIORITY_LABEL } from '../ui.jsx';
import { finalClass, finalPriority, itemOf, estMid } from '../derive.js';
import { SCOPE_QUESTIONS, SAFETY_QUESTIONS, costTotals, variance } from '../engine.js';
import { checklistFor, qaGate } from '../qa.js';
import { CATEGORIES } from '../data/profiles.js';
import { libraryCSV } from './library.jsx';
import { ESCALATION_ACTIONS } from './wizard.jsx';

export const REPORT_TYPES = [
  ['individual', 'Individual Defect Assessment Report', 'one'],
  ['minor', 'Minor Works Summary', 'all'],
  ['major', 'Major Works Summary', 'all'],
  ['critical', 'Critical Works Incident Report', 'optional'],
  ['cost', 'Repair Cost Estimate', 'one'],
  ['trade', 'Trade-Based Repair Summary', 'all'],
  ['qa', 'QA Inspection Report', 'one'],
  ['matrix', 'Master Repair Classification Matrix', 'none'],
];

export const REPORT_CSS = `
.rpt{font-family:'IBM Plex Sans',system-ui,sans-serif;color:#14202e;background:#fff;font-size:12.5px;line-height:1.5}
.rpt *{box-sizing:border-box}
.rpt .r-head{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;border-bottom:3px solid #0e2a47;padding-bottom:10px;margin-bottom:14px}
.rpt .r-brand b{display:block;font-family:Archivo,'Arial Narrow',sans-serif;font-weight:800;letter-spacing:.14em;font-size:20px;color:#0e2a47}
.rpt .r-brand span{display:block;font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:#2f7fc1}
.rpt .r-meta{text-align:right;font-size:11px;color:#4d5d6e}
.rpt h1{font-family:Archivo,'Arial Narrow',sans-serif;font-size:19px;margin:0 0 2px;color:#0e2a47;text-wrap:balance}
.rpt h2{font-family:Archivo,'Arial Narrow',sans-serif;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#0e2a47;border-bottom:1px solid #d5dee8;padding-bottom:3px;margin:18px 0 8px}
.rpt table{width:100%;border-collapse:collapse;margin:4px 0 8px;font-size:11.5px}
.rpt th,.rpt td{border:1px solid #d5dee8;padding:5px 7px;text-align:left;vertical-align:top}
.rpt th{background:#eef3f8;color:#0e2a47;font-weight:600}
.rpt td.r,.rpt th.r{text-align:right;font-variant-numeric:tabular-nums}
.rpt .kv{display:grid;grid-template-columns:170px 1fr;gap:3px 12px;margin:0}
.rpt .kv dt{color:#4d5d6e}.rpt .kv dd{margin:0}
.rpt .tag{display:inline-block;padding:1px 7px;border-radius:3px;font-size:10.5px;font-weight:700;letter-spacing:.04em;color:#fff}
.rpt .t-minor{background:#23804f}.rpt .t-major{background:#c4620e}.rpt .t-critical{background:#b82a26}
.rpt .t-p{background:#fff;border:1.5px solid #4a2a9c;color:#4a2a9c}
.rpt .callout{border:1.5px solid #b82a26;background:#fdf1f0;padding:8px 10px;border-radius:4px;margin:8px 0}
.rpt .note{font-size:10.5px;color:#4d5d6e}
.rpt .sign{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-top:26px}
.rpt .sign div{border-top:1px solid #14202e;padding-top:4px;font-size:10.5px;min-height:46px}
.rpt .sign b{display:block;font-size:11px}
.rpt .r-foot{margin-top:18px;border-top:1px solid #d5dee8;padding-top:6px;display:flex;justify-content:space-between;gap:12px;font-size:10px;color:#4d5d6e}
.rpt .pass{color:#23804f;font-weight:700}.rpt .fail{color:#b82a26;font-weight:700}.rpt .re{color:#c4620e;font-weight:700}
.rpt img.ph{width:150px;height:110px;object-fit:cover;border:1px solid #d5dee8;margin:0 6px 6px 0}
.rpt .tot td{font-weight:700;background:#eef3f8}
.rpt td.id{white-space:nowrap;font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:10.5px}
@media (max-width:640px){.rpt .sign{grid-template-columns:1fr 1fr}.rpt .kv{grid-template-columns:1fr}}
`;

const tag = (c) => c ? `<span class="tag t-${esc(String(c).toLowerCase())}">${esc(String(c).toUpperCase())}</span>` : '—';
const ptag = (p) => p ? `<span class="tag t-p">${esc(p)} ${esc(PRIORITY_LABEL[p] || '')}</span>` : '—';
const ans = (list, state, k) => { const q = list.find((x) => x[0] === k); const o = q && q[2].find((x) => x[0] === state[k]); return o ? o[1] : '—'; };

function shell({ title, ref, body }) {
  const gen = new Date();
  return `<div class="rpt">
  <div class="r-head"><div class="r-brand"><b>MADHOUSE</b><span>Madhouse Standard · Interior Fit-Out Defect &amp; Repair Classification System</span></div>
  <div class="r-meta">Ref: ${esc(ref)}<br>Generated: ${esc(gen.toLocaleString('en-PH'))}<br>Prepared by: Ar. Stephen Catabijan / QQA</div></div>
  <h1>${esc(title)}</h1>
  ${body}
  <h2>Approval</h2>
  <div class="sign"><div><b>Prepared by</b>Ar. Stephen Catabijan / QQA</div><div><b>Reviewed by</b>Quantity and Quality Architect</div><div><b>Endorsed by</b>Warranty Manager</div><div><b>Approved by</b>Management (COO / Director)</div></div>
  <p class="note" style="margin-top:14px">${esc(DISCLAIMER)} Warranty coverage is subject to the contract, Certificate of Completion and warranty terms, and excludes owner misuse, alterations by others, normal wear and tear and external events.</p>
  <div class="r-foot"><span>MADHOUSE STANDARD · Quality Assurance | Warranty Management | Repair Cost Assessment</span><span>Created by Ar. Stephen Catabijan / QQA</span></div>
</div>`;
}

function assessmentRows(list, library) {
  return `<table><thead><tr><th>ID</th><th>Project / location</th><th>Repair item</th><th>Class</th><th>Priority</th><th>Trade</th><th class="r">Estimate (₱)</th><th>Status</th></tr></thead><tbody>
  ${list.map((a) => { const it = itemOf(library, a); return `<tr><td class="id">${esc(a.id)}${a.sample ? ' (sample)' : ''}</td><td>${esc(a.project)}<br>${esc(a.location)}</td><td>${esc(it ? it.id + ' ' + it.item : '—')}</td><td>${tag(finalClass(a))}</td><td>${ptag(finalPriority(a))}</td><td>${esc(a.estimate ? a.estimate.trade : '')}</td><td class="r">${a.estimate ? esc(pesoRange(a.estimate.min, a.estimate.max)) : '—'}</td><td>${esc(a.status)}</td></tr>`; }).join('')}
  </tbody></table>`;
}

function costTable(a, settings) {
  if (!a.cost || !a.cost.lines) return '<p class="note">No cost estimate recorded.</p>';
  const factor = a.cost.region === 'provincial' ? settings.costs.provincialFactor : settings.costs.metroFactor;
  const t = costTotals(a.cost.lines, { mode: a.cost.mode, regionFactor: factor, contingencyPct: Number(a.cost.contingencyPct) || 0 });
  const v = variance(a.cost.approvedBudget, a.cost.actual);
  return `<p class="note">Rate basis: ${a.cost.region === 'provincial' ? 'Provincial' : 'Metro Manila'} (labor and mobilization ×${esc(factor)}) · Estimate type: ${esc({ combined: 'Labor and materials', labor: 'Labor only', materials: 'Materials only' }[a.cost.mode] || a.cost.mode)}</p>
  <table><thead><tr><th>Cost component</th><th class="r">Minimum</th><th class="r">Maximum</th></tr></thead><tbody>
  ${t.rows.map((r) => `<tr><td>${esc(r.label)}${r.included ? '' : ' (excluded)'}</td><td class="r">${esc(peso(r.min))}</td><td class="r">${esc(peso(r.max))}</td></tr>`).join('')}
  <tr><td>Contingency ${esc(a.cost.contingencyPct)}%</td><td class="r">${esc(peso(t.contingencyMin))}</td><td class="r">${esc(peso(t.contingencyMax))}</td></tr>
  <tr class="tot"><td>Total estimated repair cost</td><td class="r">${esc(peso(t.totalMin))}</td><td class="r">${esc(peso(t.totalMax))}</td></tr></tbody></table>
  <dl class="kv"><dt>Approved budget</dt><dd>${esc(peso(a.cost.approvedBudget))}</dd><dt>Actual expenditure</dt><dd>${esc(peso(a.cost.actual))}</dd>
  <dt>Cost variance</dt><dd>${a.cost.actual === '' || a.cost.actual == null ? '—' : esc(peso(v.amount)) + (v.pct === null ? '' : ` (${v.pct > 0 ? '+' : ''}${v.pct.toFixed(1)}%)`)}</dd></dl>`;
}

function qaTable(a, library) {
  const it = itemOf(library, a);
  const cl = checklistFor(it);
  if (!a.qa) return '<p class="note">No QA inspection recorded yet.</p>';
  const gate = qaGate(cl, a.qa.checks || {});
  const cls = (v) => (v === 'PASS' ? 'pass' : v === 'FAIL' ? 'fail' : v === 'FOR REINSPECTION' ? 're' : '');
  return `<dl class="kv"><dt>Inspected by</dt><dd>${esc(a.qa.inspector)}</dd><dt>Inspection date</dt><dd>${esc(fmtDate(a.qa.date))}</dd><dt>Checklist</dt><dd>${esc(cl.label)}</dd>
  <dt>Result</dt><dd>${gate.canComplete ? '<span class="pass">All mandatory checks passed</span>' : '<span class="fail">Mandatory requirements not met: claim cannot be completed</span>'}</dd></dl>
  <table><thead><tr><th>Verification item</th><th>Requirement</th><th>Result</th></tr></thead><tbody>
  ${cl.list.map((c) => { const v = (a.qa.checks || {})[c.key]; return `<tr><td>${esc(c.label)}</td><td>${c.mandatory ? 'Mandatory' : 'Optional'}</td><td class="${cls(v)}">${esc(v || 'Not inspected')}</td></tr>`; }).join('')}
  </tbody></table>${a.qa.remarks ? `<p><b>Findings:</b> ${esc(a.qa.remarks)}</p>` : ''}`;
}

function individual(a, app) {
  const it = itemOf(app.library, a);
  const r = a.result || {};
  const v = a.validation || {};
  const body = `
  <h2>Assessment information</h2>
  <dl class="kv"><dt>Assessment ID</dt><dd>${esc(a.id)}${a.sample ? ' (sample record)' : ''}</dd><dt>Project</dt><dd>${esc(a.project)}</dd><dt>Location / room</dt><dd>${esc(a.location)}</dd>
  <dt>Date reported</dt><dd>${esc(fmtDate(a.dateReported))}</dd><dt>Reported by</dt><dd>${esc(a.reportedBy)}</dd><dt>Status</dt><dd>${esc(a.status)}</dd></dl>
  <h2>Defect details</h2>
  <dl class="kv"><dt>Category</dt><dd>${esc(CATEGORIES[a.catCode] || '')}</dd><dt>Repair item</dt><dd>${esc(it ? `${it.id} · ${it.subcategory} · ${it.item}` : '—')}</dd><dt>Description</dt><dd>${esc(a.description)}</dd></dl>
  ${(a.photos || []).length ? `<div>${a.photos.map((p) => `<img class="ph" src="${p.data}" alt="${esc(p.name)}">`).join('')}</div>` : ''}
  <h2>Extent of damage and safety</h2>
  <table><tbody>${SCOPE_QUESTIONS.map(([k, q]) => `<tr><td>${esc(q)}</td><td>${esc(ans(SCOPE_QUESTIONS, a.scope || {}, k))}</td></tr>`).join('')}
  ${SAFETY_QUESTIONS.filter(([k]) => !(k === 'leakNearElectrical' && (!a.safety || !a.safety.leak || a.safety.leak === 'none'))).map(([k, q]) => `<tr><td>${esc(q)}</td><td>${esc(ans(SAFETY_QUESTIONS, a.safety || {}, k))}</td></tr>`).join('')}</tbody></table>
  <h2>Classification</h2>
  <dl class="kv"><dt>Recommended</dt><dd>${tag(r.classification)} ${ptag(r.priority)}</dd>
  <dt>Final approved</dt><dd>${v.validated ? `${tag(v.finalClass)} ${ptag(v.finalPriority)}${v.overridden ? ' (override)' : ''}` : 'Pending validation'}</dd>
  <dt>Reason</dt><dd>${esc(r.summary || '')}</dd>
  <dt>Factors</dt><dd>${esc([...(r.triggers || []), ...(r.reasons || [])].join('; ') || '—')}</dd>
  <dt>Priority basis</dt><dd>${esc(r.priorityWhy || '')}</dd>
  ${v.overridden ? `<dt>Override justification</dt><dd>${esc(v.overrideJustification)}</dd>` : ''}
  ${(r.flags || []).length ? `<dt>Flags</dt><dd>${esc(r.flags.join(' '))}</dd>` : ''}</dl>
  ${r.classification === 'Critical' ? `<div class="callout"><b>Critical works: safety escalation.</b> ${ESCALATION_ACTIONS.map(([k, l]) => `${a.escalation && a.escalation[k] ? '☑' : '☐'} ${esc(l)}`).join('<br>')}</div>` : ''}
  <h2>Repair methodology</h2>
  <dl class="kv"><dt>Responsible trade</dt><dd>${esc(a.estimate ? a.estimate.trade : '')}</dd><dt>Method</dt><dd>${esc(a.estimate ? a.estimate.method : '')}</dd><dt>Estimated duration</dt><dd>${esc(a.estimate ? a.estimate.duration : '')}</dd>
  <dt>Inspection requirements</dt><dd>${esc(it ? it.inspection : '')}</dd></dl>
  <h2>Estimated costing</h2>
  <p>Indicative range: <b>${a.estimate ? esc(pesoRange(a.estimate.min, a.estimate.max)) : '—'}</b>. ${esc(a.estimate ? a.estimate.basis : '')}</p>
  ${costTable(a, app.settings)}
  <h2>Inspection findings</h2>${qaTable(a, app.library)}
  <h2>Validation</h2>
  <dl class="kv"><dt>Assessed by</dt><dd>${esc(v.assessedBy || '—')}</dd><dt>QQA review</dt><dd>${esc(v.qqaReview || '—')} ${v.qqaStatus ? '(' + esc(v.qqaStatus) + ')' : ''}</dd>
  <dt>Warranty Manager review</dt><dd>${esc(v.wmReview || '—')} ${v.wmStatus ? '(' + esc(v.wmStatus) + ')' : ''}</dd><dt>Assessment date</dt><dd>${esc(fmtDate(v.date))}</dd><dt>Remarks</dt><dd>${esc(v.remarks || '—')}</dd></dl>
  <h2>Warranty applicability</h2><p>${esc(it ? it.warrantyNotes : '')}</p>`;
  return body;
}

function build(type, app, aid, trade) {
  const A = app.assessments;
  const a = A.find((x) => x.id === aid);
  const name = REPORT_TYPES.find((r) => r[0] === type)[1];
  const stamp = new Date().toISOString().slice(0, 10);
  const asmtCSVHead = ['ID', 'Sample', 'Project', 'Location', 'Category', 'Repair item ID', 'Repair item', 'Recommended class', 'Final class', 'Priority', 'Trade', 'Estimate min', 'Estimate max', 'Approved budget', 'Actual', 'Status', 'Date reported'];
  const asmtCSV = (list) => toCSV(asmtCSVHead, list.map((x) => { const it = itemOf(app.library, x); return [x.id, x.sample ? 'yes' : '', x.project, x.location, CATEGORIES[x.catCode], it && it.id, it && it.item, x.result && x.result.classification, finalClass(x), finalPriority(x), x.estimate && x.estimate.trade, x.estimate && x.estimate.min, x.estimate && x.estimate.max, x.cost && x.cost.approvedBudget, x.cost && x.cost.actual, x.status, x.dateReported]; }));

  if (type === 'individual' || type === 'cost' || type === 'qa') {
    if (!a) return { empty: 'Choose an assessment.' };
    if (type === 'individual') return { title: `${name} – ${a.id}`, html: shell({ title: name, ref: a.id, body: individual(a, app) }), csv: asmtCSV([a]), file: `madhouse-assessment-${a.id}` };
    if (type === 'cost') {
      const it = itemOf(app.library, a);
      const body = `<h2>Assessment</h2><dl class="kv"><dt>Assessment</dt><dd>${esc(a.id)} · ${esc(a.project)} · ${esc(a.location)}</dd><dt>Repair item</dt><dd>${esc(it ? it.id + ' ' + it.item : '—')}</dd><dt>Classification</dt><dd>${tag(finalClass(a))} ${ptag(finalPriority(a))}</dd>
      <dt>Library reference</dt><dd>${it ? esc(pesoRange(it.costMin, it.costMax)) : '—'}</dd><dt>Estimate basis</dt><dd>${esc(a.estimate ? a.estimate.basis : '')}</dd></dl><h2>Cost build-up</h2>${costTable(a, app.settings)}`;
      const factor = a.cost && a.cost.region === 'provincial' ? app.settings.costs.provincialFactor : app.settings.costs.metroFactor;
      const t = a.cost && a.cost.lines ? costTotals(a.cost.lines, { mode: a.cost.mode, regionFactor: factor, contingencyPct: Number(a.cost.contingencyPct) || 0 }) : null;
      const csv = t ? toCSV(['Component', 'Minimum', 'Maximum', 'Included'], [...t.rows.map((r) => [r.label, r.min, r.max, r.included ? 'yes' : 'no']), ['Contingency', t.contingencyMin, t.contingencyMax, ''], ['TOTAL', t.totalMin, t.totalMax, ''], ['Approved budget', a.cost.approvedBudget, '', ''], ['Actual expenditure', a.cost.actual, '', '']]) : asmtCSV([a]);
      return { title: `${name} – ${a.id}`, html: shell({ title: name, ref: a.id, body }), csv, file: `madhouse-cost-estimate-${a.id}` };
    }
    const it = itemOf(app.library, a); const cl = checklistFor(it);
    const body = `<h2>Assessment</h2><dl class="kv"><dt>Assessment</dt><dd>${esc(a.id)} · ${esc(a.project)} · ${esc(a.location)}</dd><dt>Repair item</dt><dd>${esc(it ? it.id + ' ' + it.item : '—')}</dd><dt>Classification</dt><dd>${tag(finalClass(a))} ${ptag(finalPriority(a))}</dd><dt>Status</dt><dd>${esc(a.status)}</dd></dl><h2>Inspection findings</h2>${qaTable(a, app.library)}`;
    const csv = toCSV(['Verification item', 'Mandatory', 'Result'], cl.list.map((c) => [c.label, c.mandatory ? 'yes' : 'no', (a.qa && a.qa.checks[c.key]) || 'Not inspected']));
    return { title: `${name} – ${a.id}`, html: shell({ title: name, ref: a.id, body }), csv, file: `madhouse-qa-inspection-${a.id}` };
  }
  if (type === 'minor' || type === 'major') {
    const cls = type === 'minor' ? 'Minor' : 'Major';
    const list = A.filter((x) => finalClass(x) === cls);
    const total = list.reduce((s, x) => s + estMid(x), 0);
    const body = `<h2>Summary</h2><dl class="kv"><dt>${cls} works records</dt><dd>${list.length}</dd><dt>Total estimated cost</dt><dd>${esc(peso(total))} (approved budget where set, otherwise mid-range)</dd>
    <dt>Open</dt><dd>${list.filter((x) => x.status !== 'Completed').length}</dd><dt>Completed</dt><dd>${list.filter((x) => x.status === 'Completed').length}</dd></dl><h2>Records</h2>${list.length ? assessmentRows(list, app.library) : '<p class="note">No records.</p>'}`;
    return { title: name, html: shell({ title: name, ref: `${cls.toUpperCase()}-${stamp}`, body }), csv: asmtCSV(list), file: `madhouse-${type}-works-summary-${stamp}` };
  }
  if (type === 'critical') {
    const list = aid ? A.filter((x) => x.id === aid && finalClass(x) === 'Critical') : A.filter((x) => finalClass(x) === 'Critical');
    const body = list.length ? list.map((x) => {
      const it = itemOf(app.library, x);
      return `<h2>${esc(x.id)} · ${esc(x.project)} · ${esc(x.location)}</h2>
      <div class="callout"><b>Hazard:</b> ${esc((x.result && x.result.triggers || []).join(' ') || 'Classified Critical at validation.')}</div>
      <dl class="kv"><dt>Repair item</dt><dd>${esc(it ? it.id + ' ' + it.item : '—')}</dd><dt>Reported</dt><dd>${esc(fmtDate(x.dateReported))} by ${esc(x.reportedBy)}</dd><dt>Priority</dt><dd>${ptag(finalPriority(x))}</dd><dt>Status</dt><dd>${esc(x.status)}</dd>
      <dt>Description</dt><dd>${esc(x.description)}</dd><dt>Make-safe and repair</dt><dd>${esc(x.estimate ? x.estimate.method : '')}</dd><dt>Specialist trade</dt><dd>${esc(x.estimate ? x.estimate.trade : '')}</dd>
      <dt>Escalation actions</dt><dd>${ESCALATION_ACTIONS.map(([k, l]) => `${x.escalation && x.escalation[k] ? '☑ ' + esc(l) + ' (' + esc(new Date(x.escalation[k]).toLocaleString('en-PH')) + ')' : '☐ ' + esc(l)}`).join('<br>')}</dd>
      <dt>Estimate</dt><dd>${x.estimate ? esc(pesoRange(x.estimate.min, x.estimate.max)) : '—'}</dd></dl>`;
    }).join('') : '<p class="note">No Critical Works records.</p>';
    return { title: name, html: shell({ title: name, ref: aid || `CRITICAL-${stamp}`, body }), csv: asmtCSV(list), file: `madhouse-critical-incident-report-${aid || stamp}` };
  }
  if (type === 'trade') {
    const groups = {};
    A.forEach((x) => { const tr = primaryTrade(x.estimate ? x.estimate.trade : (itemOf(app.library, x) || {}).trade); if (trade && tr !== trade) return; (groups[tr] = groups[tr] || []).push(x); });
    const rows = Object.entries(groups).sort((p, q) => q[1].length - p[1].length);
    const body = `<h2>Summary by trade</h2><table><thead><tr><th>Trade</th><th class="r">Records</th><th class="r">Minor</th><th class="r">Major</th><th class="r">Critical</th><th class="r">P1/P2</th><th class="r">Est. cost</th><th class="r">Open</th></tr></thead><tbody>
    ${rows.map(([tr, l]) => `<tr><td>${esc(tr)}</td><td class="r">${l.length}</td><td class="r">${l.filter((x) => finalClass(x) === 'Minor').length}</td><td class="r">${l.filter((x) => finalClass(x) === 'Major').length}</td><td class="r">${l.filter((x) => finalClass(x) === 'Critical').length}</td><td class="r">${l.filter((x) => ['P1', 'P2'].includes(finalPriority(x))).length}</td><td class="r">${esc(peso(l.reduce((s, x) => s + estMid(x), 0)))}</td><td class="r">${l.filter((x) => x.status !== 'Completed').length}</td></tr>`).join('')}</tbody></table>
    ${rows.map(([tr, l]) => `<h2>${esc(tr)}</h2>${assessmentRows(l, app.library)}`).join('')}`;
    return { title: name, html: shell({ title: name, ref: `TRADE-${stamp}`, body }), csv: asmtCSV(rows.flatMap((r) => r[1])), file: `madhouse-trade-summary-${stamp}` };
  }
  // matrix
  const body = `<p class="note">${app.library.length} standardized repair items. Sources: Madhouse Warranty Repair Matrix (WRM) and Common Repairs with Costing (CRC), consolidated, plus Madhouse Standard additions (MS-NEW).</p>
  ${Object.entries(CATEGORIES).map(([k, n]) => { const l = app.library.filter((x) => x.catCode === k); if (!l.length) return ''; return `<h2>${esc(k)}. ${esc(n)} (${l.length})</h2>
  <table><thead><tr><th>ID</th><th>Subcategory</th><th>Repair item</th><th>Class</th><th>Priority</th><th>Trade</th><th class="r">Min (₱)</th><th class="r">Max (₱)</th><th>Duration</th><th>Source</th></tr></thead><tbody>
  ${l.map((x) => `<tr><td class="id">${esc(x.id)}</td><td>${esc(x.subcategory)}</td><td>${esc(x.item)}</td><td>${tag(x.classification)}</td><td>${esc(x.priority)}</td><td>${esc(x.trade)}</td><td class="r">${Number(x.costMin).toLocaleString()}</td><td class="r">${Number(x.costMax).toLocaleString()}</td><td>${esc(x.duration)}</td><td>${esc(x.sourceRef)}</td></tr>`).join('')}</tbody></table>`; }).join('')}`;
  return { title: name, html: shell({ title: name, ref: `MATRIX-${stamp}`, body }), csv: libraryCSV(app.library), file: `madhouse-repair-classification-matrix-${stamp}` };
}

export function standaloneHtml(title, inner) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@600;800&family=IBM+Plex+Sans:wght@400;600&display=swap">
<style>body{margin:0;background:#e9eef3}.page{max-width:1000px;margin:24px auto;background:#fff;padding:32px 36px;box-shadow:0 1px 4px rgba(0,0,0,.12)}.bar{max-width:1000px;margin:16px auto 0;text-align:right}.bar button{font:600 13px system-ui;padding:8px 14px;border:0;border-radius:4px;background:#0e2a47;color:#fff;cursor:pointer}
@media print{body{background:#fff}.page{margin:0;box-shadow:none;padding:0;max-width:none}.bar{display:none}@page{size:A4;margin:14mm}.rpt h2{break-after:avoid}.rpt tr{break-inside:avoid}}${REPORT_CSS}</style></head>
<body><div class="bar"><button onclick="window.print()">Print / Save as PDF</button></div><div class="page">${inner}</div></body></html>`;
}

export function Reports() {
  const app = useApp();
  const svc = useSvc();
  const [type, setType] = useState(app.params.type || 'individual');
  const [aid, setAid] = useState(app.params.assessmentId || (app.assessments[0] && app.assessments[0].id) || '');
  const [trade, setTrade] = useState('');
  const mode = REPORT_TYPES.find((r) => r[0] === type)[2];
  const firstId = app.assessments[0] ? app.assessments[0].id : '';
  const pickAid = mode === 'one' ? (app.assessments.some((x) => x.id === aid) ? aid : firstId) : mode === 'optional' ? aid : '';
  const rep = useMemo(() => build(type, app, pickAid, trade), [type, pickAid, trade, app.assessments, app.library, app.settings]);
  const trades = [...new Set(app.assessments.map((x) => primaryTrade(x.estimate ? x.estimate.trade : '')))].sort();
  const critList = app.assessments.filter((x) => finalClass(x) === 'Critical');

  return (
    <div className="reports">
      <div className="card report-side">
        <h3>Report type</h3>
        <ul className="report-types">
          {REPORT_TYPES.map(([k, l]) => <li key={k}><button className={k === type ? 'on' : ''} onClick={() => { setType(k); if (k === 'critical') setAid(''); else if (REPORT_TYPES.find((r) => r[0] === k)[2] === 'one' && !app.assessments.some((x) => x.id === aid)) setAid(firstId); }}>{l}</button></li>)}
        </ul>
        {mode === 'one' && <Field label="Assessment"><Select id="r-asmt" value={pickAid} onChange={setAid} options={app.assessments.map((x) => [x.id, `${x.id} · ${x.location}`])} /></Field>}
        {mode === 'optional' && <Field label="Critical record"><Select id="r-crit" value={aid} onChange={setAid} placeholder={`All critical records (${critList.length})`} options={critList.map((x) => [x.id, `${x.id} · ${x.location}`])} /></Field>}
        {type === 'trade' && <Field label="Trade"><Select id="r-trade" value={trade} onChange={setTrade} placeholder="All trades" options={trades} /></Field>}
        <div className="stack-sm">
          <button className="btn btn-primary full" disabled={!rep.html} onClick={() => svc.exportFile(`${rep.file}.html`, standaloneHtml(rep.title, rep.html))}><Icon name="download" /> Download printable report (HTML)</button>
          <button className="btn full" disabled={!rep.csv} onClick={() => svc.exportFile(`${rep.file}.csv`, rep.csv)}><Icon name="download" /> Export CSV</button>
        </div>
        <p className="small muted">Printing is not available inside this viewer. The downloaded HTML report opens in any browser, where its Print button prints it or saves it as a PDF on A4.</p>
      </div>
      <div className="report-preview">
        <style>{REPORT_CSS}</style>
        {rep.html ? <div className="paper" dangerouslySetInnerHTML={{ __html: rep.html }} /> : <div className="card"><p>{rep.empty}</p></div>}
      </div>
    </div>
  );
}
