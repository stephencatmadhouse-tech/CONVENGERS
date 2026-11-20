// Persistence layer.
//
// The app talks only to a StorageAdapter: { id, label, available, load(key), save(key, value) }.
// LocalStorageAdapter is the working prototype store (per browser, per device).
// FirebaseAdapter is a placeholder with the same interface. It is NOT connected: wire it to
// Firestore (collections: library, assessments, settings) and set ACTIVE_ADAPTER to use it.

import { buildLibrary, buildConsolidationLog } from './data/library.js';
import { checklistFor } from './qa.js';
import { SCENARIOS, classify, estimateFor, EMPTY_SCOPE, EMPTY_SAFETY, linesFromItem } from './engine.js';

const NS = 'madhouse-standard.v1.';

export class LocalStorageAdapter {
  constructor() {
    this.id = 'local';
    this.label = 'Browser local storage';
    try { const k = NS + '__probe'; localStorage.setItem(k, '1'); localStorage.removeItem(k); this.available = true; }
    catch (e) { this.available = false; }
  }
  load(key) {
    if (!this.available) return null;
    try { const raw = localStorage.getItem(NS + key); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }
  save(key, value) {
    if (!this.available) return { ok: false, reason: 'unavailable' };
    try { localStorage.setItem(NS + key, JSON.stringify(value)); return { ok: true }; }
    catch (e) { return { ok: false, reason: e && e.name === 'QuotaExceededError' ? 'quota' : 'error' }; }
  }
  remove(key) { try { localStorage.removeItem(NS + key); } catch (e) { /* ignore */ } }
}

export class FirebaseAdapter {
  constructor() { this.id = 'firebase'; this.label = 'Firebase Firestore'; this.available = false; this.connected = false; }
  load() { throw new Error('Firebase is not configured for this prototype.'); }
  save() { throw new Error('Firebase is not configured for this prototype.'); }
}

export const adapter = new LocalStorageAdapter();
export const firebaseAdapter = new FirebaseAdapter();

export const ROLES = ['Quantity and Quality Architect (QQA)', 'Warranty Manager', 'Project Supervisor', 'Customer Experience Specialist', 'General Contractor', 'Management'];
export const AUTH_ROLES = ['Quantity and Quality Architect (QQA)', 'Warranty Manager', 'Management'];
export const canAuthorize = (role) => AUTH_ROLES.includes(role);

export const DEFAULT_SETTINGS = {
  user: { name: 'Ar. Stephen Catabijan', role: 'Quantity and Quality Architect (QQA)' },
  costs: {
    metroFactor: 1.0, provincialFactor: 0.85,
    mobilizationMetro: 1500, mobilizationProvincial: 2500,
    contingencyPct: 10,
    notes: 'Metro Manila labor rates are the base. Provincial factor applies to labor and mobilization only; materials are priced at Metro Manila supplier rates unless a local quotation is available.',
  },
};

export const nowIso = () => new Date().toISOString();
export const todayStr = () => new Date().toISOString().slice(0, 10);

function seedAssessments(library) {
  const statuses = ['Completed', 'Validated', 'Validated', 'For Validation', 'Validated', 'Validated', 'For Reinspection', 'Validated'];
  const rooms = ['Living area', 'Master bedroom', 'Kitchen', 'Common bathroom', 'Master bathroom (ceiling of unit below)', 'Common bathroom', 'Master bathroom', 'Shower area, master bathroom'];
  return SCENARIOS.map((s, i) => {
    const item = library.find((x) => x.item === s.itemName);
    const scope = { ...EMPTY_SCOPE, ...s.scope };
    const safety = { ...EMPTY_SAFETY, ...s.safety };
    const result = classify(scope, safety, item);
    const est = estimateFor(item, result, scope, library);
    const date = new Date(Date.UTC(2026, 9, 6 + i * 4)).toISOString().slice(0, 10);
    const status = statuses[i];
    const validated = status !== 'For Validation';
    const lines = linesFromItem(library.find((x) => x.id === est.refId) || item, { mobilization: 1500 });
    const a = {
      id: `AS-2026-${String(i + 1).padStart(4, '0')}`,
      sample: true,
      project: 'SAMPLE – Training Residence',
      location: rooms[i],
      catCode: item.catCode,
      itemId: item.id,
      title: `Scenario ${s.key}: ${s.title}`,
      description: `Sample record for engine scenario ${s.key}. ${s.title}.`,
      dateReported: date,
      reportedBy: 'Sample data',
      photos: [],
      scope, safety, result, estimate: est,
      validation: validated ? {
        assessedBy: 'Sample Project Supervisor', qqaReview: 'Sample QQA', qqaStatus: 'Endorsed',
        wmReview: 'Sample Warranty Manager', wmStatus: 'Endorsed',
        finalClass: result.classification, finalPriority: result.priority,
        overrideJustification: '', remarks: 'Sample validation.', date, validated: true,
      } : null,
      cost: { region: 'metro', mode: 'combined', lines, contingencyPct: 10, approvedBudget: validated ? Math.round((est.min + est.max) / 2 / 100) * 100 : '', actual: status === 'Completed' ? Math.round((est.min + est.max) / 2 * 1.08 / 100) * 100 : '' },
      qa: null,
      status,
      createdAt: `${date}T02:00:00.000Z`, updatedAt: `${date}T02:00:00.000Z`,
      history: [{ at: `${date}T02:00:00.000Z`, by: 'Sample data', action: 'Created (sample record)' }],
    };
    return a;
  });
}

export function loadState() {
  let library = adapter.load('library');
  let seededLibrary = false;
  if (!Array.isArray(library) || !library.length) {
    const at = nowIso();
    library = buildLibrary().map((it) => ({ ...it, createdAt: at, updatedAt: at, modifiedBy: 'System seed (Madhouse Standard v1)', history: [{ at, by: 'System seed', action: 'Created from consolidated sources' }] }));
    seededLibrary = true;
  }
  let assessments = adapter.load('assessments');
  if (!Array.isArray(assessments)) {
    assessments = seedAssessments(library);
    // One completed sample with a passed QA, one with a failed QA for re-inspection.
    const seedQa = (a, pass) => {
      const item = library.find((x) => x.id === a.itemId);
      const cl = checklistFor(item);
      const checks = {};
      cl.list.forEach((c, i) => { checks[c.key] = pass || i < cl.list.length - 2 ? 'PASS' : (i === cl.list.length - 2 ? 'FOR REINSPECTION' : 'FAIL'); });
      a.qa = { checks, inspector: 'Sample QA Inspector', date: a.dateReported, remarks: pass ? 'All mandatory checks passed.' : 'Seepage recurred at the floor drain during the 48-hour flood test. Re-inspection after membrane spot repair.' };
    };
    seedQa(assessments[0], true);
    seedQa(assessments[6], false);
  }
  const settings = { ...DEFAULT_SETTINGS, ...(adapter.load('settings') || {}) };
  settings.costs = { ...DEFAULT_SETTINGS.costs, ...(settings.costs || {}) };
  settings.user = { ...DEFAULT_SETTINGS.user, ...(settings.user || {}) };
  return { library, assessments, settings, seededLibrary };
}

export function freshLibrary() {
  const at = nowIso();
  return buildLibrary().map((it) => ({ ...it, createdAt: at, updatedAt: at, modifiedBy: 'System seed (Madhouse Standard v1)', history: [{ at, by: 'System seed', action: 'Created from consolidated sources' }] }));
}
export const freshSamples = (library) => seedAssessments(library);
export const consolidationLog = () => buildConsolidationLog(buildLibrary());

// Field-level diff used for record history.
export function diff(prev, next, fields) {
  const changes = [];
  for (const f of fields) {
    const a = prev ? prev[f] : undefined; const b = next[f];
    if (JSON.stringify(a ?? '') !== JSON.stringify(b ?? '')) changes.push({ field: f, from: a ?? '', to: b ?? '' });
  }
  return changes;
}

export const normName = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
