// QA checklist builder shared by the QA module, the reports and the sample seed.
import { QA_TEMPLATES } from './data/profiles.js';

export const QA_STATUSES = ['PASS', 'FAIL', 'FOR REINSPECTION', 'NOT APPLICABLE'];

// Template checks plus any item-specific requirement typed into the library record.
export function checklistFor(item) {
  const tpl = QA_TEMPLATES[(item && item.qaTemplate) || 'carpentry'] || QA_TEMPLATES.carpentry;
  const list = tpl.items.map(([label, m], i) => ({ key: `t${i}`, label, mandatory: !!m }));
  const known = new Set(list.map((x) => x.label.toLowerCase()));
  String((item && item.qaVerification) || '').split(';').map((s) => s.trim()).filter(Boolean).forEach((s, i) => {
    if (!known.has(s.toLowerCase())) list.push({ key: `x${i}`, label: s, mandatory: true });
  });
  return { label: tpl.label, list };
}

// Completion gate: every mandatory check must be PASS; no check may be FAIL or FOR REINSPECTION.
export function qaGate(checklist, checks) {
  const problems = [];
  for (const c of checklist.list) {
    const v = checks[c.key];
    if (c.mandatory && v !== 'PASS') problems.push(`${c.label}: ${v || 'not inspected'}${v === 'NOT APPLICABLE' ? ' (mandatory checks cannot be marked N/A)' : ''}`);
    else if (!c.mandatory && (v === 'FAIL' || v === 'FOR REINSPECTION')) problems.push(`${c.label}: ${v}`);
  }
  return { canComplete: problems.length === 0, problems };
}
