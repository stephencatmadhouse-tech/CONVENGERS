// Repair Classification Engine (pure functions, no UI).
//
// Two independent outputs:
//   classification: MINOR / MAJOR / CRITICAL  (Critical = safety severity; Minor/Major = repair scope)
//   priority:       P1 Emergency / P2 Urgent / P3 Normal / P4 Cosmetic
// The engine recommends; authorized personnel validate or override with a documented justification.

export const CLASSES = ['Minor', 'Major', 'Critical'];
export const PRIORITIES = {
  P1: { label: 'Emergency', desc: 'Immediate safety or serious property-damage risk.' },
  P2: { label: 'Urgent', desc: 'Significant functional defect or active deterioration.' },
  P3: { label: 'Normal', desc: 'Functional defect without immediate safety concerns.' },
  P4: { label: 'Cosmetic', desc: 'Appearance-related defect.' },
};

export const EMPTY_SCOPE = {
  extent: '', components: '', affectsFunction: '', appearanceOnly: '',
  dismantling: '', replacement: '', reconstruction: '', multipleTrades: '',
};
export const EMPTY_SAFETY = {
  leak: '', leakNearElectrical: '', electrical: '', glass: '', ceiling: '',
  structural: '', occupantRisk: '', propertyDamage: '',
};

// Questions are data so the wizard, the reports and the tests share the same wording.
export const SCOPE_QUESTIONS = [
  ['extent', 'Is the damage localized or extensive?', [['localized', 'Localized'], ['extensive', 'Extensive']]],
  ['components', 'How many components are affected?', [['1', '1'], ['2-5', '2–5'], ['6+', '6 or more']]],
  ['affectsFunction', 'Does the defect affect functionality?', [['yes', 'Yes'], ['no', 'No']]],
  ['appearanceOnly', 'Does the defect affect appearance only?', [['yes', 'Yes'], ['no', 'No']]],
  ['dismantling', 'Does it require dismantling?', [['yes', 'Yes'], ['no', 'No']]],
  ['replacement', 'Does it require component replacement?', [['yes', 'Yes'], ['no', 'No']]],
  ['reconstruction', 'Does it require reconstruction?', [['yes', 'Yes'], ['no', 'No']]],
  ['multipleTrades', 'Are multiple trades required?', [['yes', 'Yes'], ['no', 'No']]],
];
const YNU = [['yes', 'Yes'], ['no', 'No'], ['unsure', 'Not sure']];
export const SAFETY_QUESTIONS = [
  ['leak', 'Is there active water leakage?', [['none', 'No leakage'], ['seepage', 'Seepage / dampness'], ['active', 'Active dripping'], ['flooding', 'Major flow / flooding']]],
  ['leakNearElectrical', 'Is the water near electrical installations (outlets, fixtures, panel)?', YNU],
  ['electrical', 'Is there electrical exposure, sparking or overheating?', YNU],
  ['glass', 'Is there unstable, cracked or shattered glass?', YNU],
  ['ceiling', 'Is there ceiling sagging or potential falling debris?', YNU],
  ['structural', 'Is there suspected structural movement?', YNU],
  ['occupantRisk', 'Does the defect pose an immediate risk to occupants?', YNU],
  ['propertyDamage', 'Is there risk of additional property damage?', YNU],
];

const leakActive = (s) => s.leak === 'active' || s.leak === 'flooding';

export function missingAnswers(scope, safety) {
  const miss = [];
  for (const [k, q] of SCOPE_QUESTIONS) if (!scope[k]) miss.push(q);
  for (const [k, q] of SAFETY_QUESTIONS) {
    if (k === 'leakNearElectrical' && (!safety.leak || safety.leak === 'none')) continue;
    if (!safety[k]) miss.push(q);
  }
  return miss;
}

export function classify(scope, safety, item) {
  const reasons = [];
  const triggers = [];
  const flags = [];

  // ---- 1. Safety screen (Critical) ----
  if (safety.electrical === 'yes') triggers.push('Electrical exposure, sparking or overheating confirmed.');
  if (safety.glass === 'yes') triggers.push('Unstable, cracked or shattered glass confirmed.');
  if (safety.ceiling === 'yes') triggers.push('Ceiling sagging or falling-debris risk confirmed.');
  if (safety.structural === 'yes') triggers.push('Suspected structural movement reported.');
  if (safety.occupantRisk === 'yes') triggers.push('Immediate risk to occupants confirmed.');
  if (safety.leak === 'flooding') triggers.push('Major water flow or flooding.');
  if (leakActive(safety) && safety.leakNearElectrical === 'yes') triggers.push('Active water leakage near electrical installations.');

  const leakAsked = safety.leak && safety.leak !== 'none';
  const unsure = SAFETY_QUESTIONS.filter(([k]) => safety[k] === 'unsure' && (k !== 'leakNearElectrical' || leakAsked))
    .map(([, q]) => q);
  const seepageNearElectrical = safety.leak === 'seepage' && safety.leakNearElectrical === 'yes';
  if (seepageNearElectrical) flags.push('Seepage is near electrical installations. Have an electrician check the affected circuits; escalate to Critical if water reaches live parts.');

  // ---- 2. Scope score (Minor vs Major) ----
  let score = 0;
  const add = (pts, why) => { score += pts; reasons.push(`${why} (+${pts})`); };
  if (scope.extent === 'extensive') add(2, 'Extensive affected area');
  if (scope.components === '2-5') add(1, '2–5 components affected');
  if (scope.components === '6+') add(2, '6 or more components affected');
  if (scope.dismantling === 'yes') add(1, 'Dismantling required');
  if (scope.replacement === 'yes' && scope.components && scope.components !== '1') add(1, 'Replacement of multiple components');
  if (scope.multipleTrades === 'yes') add(1, 'Multiple trades required');
  if (scope.reconstruction === 'yes') add(3, 'Reconstruction required');

  let scopeClass = 'Minor';
  let scopeRule = 'Localized, limited components, no reconstruction: fits Minor Works criteria.';
  if (scope.reconstruction === 'yes') {
    scopeClass = 'Major'; scopeRule = 'Reconstruction is required, which is Major Works by definition.';
  } else if (scope.extent === 'extensive' && (scope.dismantling === 'yes' || scope.replacement === 'yes' || (scope.components && scope.components !== '1'))) {
    scopeClass = 'Major'; scopeRule = 'Extensive damage combined with dismantling, replacement or several components.';
  } else if (score >= 3) {
    scopeClass = 'Major'; scopeRule = `Scope score ${score} reaches the Major threshold of 3.`;
  }
  if (scope.replacement === 'yes' && scope.components === '1' && scopeClass === 'Minor') {
    reasons.push('Isolated single-component replacement (stays within Minor Works)');
  }

  const classification = triggers.length ? 'Critical' : scopeClass;

  if (item && item.classification === 'Critical' && !triggers.length) {
    flags.push(`The library flags "${item.item}" as potentially critical. No hazard was confirmed; verify on site before downgrading.`);
  }
  if (item && item.classification !== 'Critical' && classification !== 'Critical' && item.classification !== scopeClass) {
    flags.push(`Library default for this item is ${item.classification}; the site answers indicate ${scopeClass}.`);
  }
  if (unsure.length) {
    flags.push(`Safety not confirmed for: ${unsure.join(' ')} Specialist inspection required before the classification is finalized.`);
  }

  // ---- 3. Priority (assessed separately) ----
  let priority; let priorityWhy;
  if (triggers.length) {
    priority = 'P1'; priorityWhy = 'Confirmed safety hazard requires immediate make-safe and escalation.';
  } else if (leakActive(safety) || safety.propertyDamage === 'yes' || seepageNearElectrical) {
    priority = 'P2'; priorityWhy = leakActive(safety)
      ? 'Active water leakage is causing ongoing deterioration.'
      : seepageNearElectrical ? 'Seepage near electrical installations needs prompt checking.'
      : 'Risk of additional property damage if not addressed promptly.';
  } else if (unsure.length) {
    priority = 'P2'; priorityWhy = 'Unconfirmed safety condition: treated as urgent until a specialist confirms.';
  } else if (scope.affectsFunction === 'yes' && item && item.priority === 'P2') {
    priority = 'P2'; priorityWhy = 'Functional defect on an item whose default priority is Urgent.';
  } else if (scope.affectsFunction === 'yes' || safety.leak === 'seepage') {
    priority = 'P3'; priorityWhy = safety.leak === 'seepage' && scope.affectsFunction !== 'yes'
      ? 'Seepage without active leakage: normal priority, monitor for deterioration.'
      : 'Functional defect without immediate safety concerns.';
  } else if (scope.appearanceOnly === 'yes') {
    priority = 'P4'; priorityWhy = 'Appearance-only defect with no functional or safety impact.';
  } else {
    priority = 'P3'; priorityWhy = 'Defect is not appearance-only; normal priority applies.';
  }

  // ---- 4. Explanation ----
  let summary;
  if (classification === 'Critical') {
    summary = `CRITICAL WORKS: ${triggers.join(' ')} Critical is a safety severity rating; once the area is made safe, the repair scope itself rates as ${scopeClass}.`;
  } else {
    summary = `${classification.toUpperCase()} WORKS: ${scopeRule} No immediate safety hazard was confirmed.`;
  }

  return {
    classification, scopeClass, score, priority, priorityWhy, triggers, reasons, flags, summary,
    escalate: classification === 'Critical',
    specialist: triggers.length > 0 || unsure.length > 0 || safety.structural === 'yes',
  };
}

// Estimate for an assessed defect, derived from the library item and the engine result.
export function estimateFor(item, result, scope, library) {
  if (!item) return null;
  let ref = item; let basis = `Library range for ${item.id}.`;
  let min = item.costMin; let max = item.costMax;
  if (result.scopeClass === 'Major' && item.classification === 'Minor') {
    const counterpart = item.scaleToId && library.find((x) => x.id === item.scaleToId);
    if (counterpart) {
      ref = counterpart; min = counterpart.costMin; max = counterpart.costMax;
      basis = `Scope assessed as Major: range taken from the major-scope item ${counterpart.id} "${counterpart.item}".`;
    } else {
      const f = scope.components === '6+' ? [3, 6] : [1.5, 3];
      min = Math.round(item.costMin * f[0] / 100) * 100; max = Math.round(item.costMax * f[1] / 100) * 100;
      basis = `Scope assessed as Major with no linked major item: library range scaled ×${f[0]}–×${f[1]} for quantity.`;
    }
  } else if (scope.components === '2-5' && result.scopeClass === 'Minor') {
    min = Math.round(item.costMin * 1.5 / 100) * 100; max = Math.round(item.costMax * 2.5 / 100) * 100;
    basis = `Library range for ${item.id}, scaled ×1.5–×2.5 for 2–5 components.`;
  }
  let trade = ref.trade;
  if (scope.multipleTrades === 'yes' && !trade.includes('/')) trade = `${trade} (lead) with supporting trades`;
  return { min, max, basis, method: ref.method, duration: ref.duration, trade, refId: ref.id };
}

// Part 13 test scenarios. Each lists inputs and what the classification must be.
export const SCENARIOS = [
  { key: 'A', title: 'One broken floor tile', itemName: 'Broken tile replacement',
    scope: { extent: 'localized', components: '1', affectsFunction: 'no', appearanceOnly: 'yes', dismantling: 'no', replacement: 'yes', reconstruction: 'no', multipleTrades: 'no' },
    safety: { leak: 'none', electrical: 'no', glass: 'no', ceiling: 'no', structural: 'no', occupantRisk: 'no', propertyDamage: 'no' },
    expect: { classification: ['Minor'] }, expectText: 'Minor Works, subject to inspection' },
  { key: 'B', title: 'Whole-room tile hollowing requiring removal and reinstallation', itemName: 'Hollow tile replacement (localized)',
    scope: { extent: 'extensive', components: '6+', affectsFunction: 'yes', appearanceOnly: 'no', dismantling: 'yes', replacement: 'yes', reconstruction: 'yes', multipleTrades: 'no' },
    safety: { leak: 'none', electrical: 'no', glass: 'no', ceiling: 'no', structural: 'no', occupantRisk: 'no', propertyDamage: 'no' },
    expect: { classification: ['Major'] }, expectText: 'Major Works' },
  { key: 'C', title: 'Electrical outlet producing sparks', itemName: 'Sparking / burnt outlet isolation and replacement',
    scope: { extent: 'localized', components: '1', affectsFunction: 'yes', appearanceOnly: 'no', dismantling: 'no', replacement: 'yes', reconstruction: 'no', multipleTrades: 'no' },
    safety: { leak: 'none', electrical: 'yes', glass: 'no', ceiling: 'no', structural: 'no', occupantRisk: 'yes', propertyDamage: 'yes' },
    expect: { classification: ['Critical'], priority: ['P1'] }, expectText: 'Critical Works, P1 Emergency' },
  { key: 'D', title: 'Small localized paint peeling', itemName: 'Paint peeling repair',
    scope: { extent: 'localized', components: '1', affectsFunction: 'no', appearanceOnly: 'yes', dismantling: 'no', replacement: 'no', reconstruction: 'no', multipleTrades: 'no' },
    safety: { leak: 'none', electrical: 'no', glass: 'no', ceiling: 'no', structural: 'no', occupantRisk: 'no', propertyDamage: 'no' },
    expect: { classification: ['Minor'], priority: ['P4'] }, expectText: 'Minor Works, P4 Cosmetic' },
  { key: 'E1', title: 'Concealed bathroom pipe leak causing ceiling damage (no hazard)', itemName: 'Concealed pipe leak detection and localized repair',
    scope: { extent: 'extensive', components: '2-5', affectsFunction: 'yes', appearanceOnly: 'no', dismantling: 'yes', replacement: 'yes', reconstruction: 'no', multipleTrades: 'yes' },
    safety: { leak: 'active', leakNearElectrical: 'no', electrical: 'no', glass: 'no', ceiling: 'no', structural: 'no', occupantRisk: 'no', propertyDamage: 'yes' },
    expect: { classification: ['Major'], priority: ['P2'] }, expectText: 'Major Works (no confirmed hazard), P2 Urgent' },
  { key: 'E2', title: 'Concealed bathroom pipe leak with sagging ceiling over light fixtures', itemName: 'Concealed pipe leak detection and localized repair',
    scope: { extent: 'extensive', components: '2-5', affectsFunction: 'yes', appearanceOnly: 'no', dismantling: 'yes', replacement: 'yes', reconstruction: 'no', multipleTrades: 'yes' },
    safety: { leak: 'active', leakNearElectrical: 'yes', electrical: 'no', glass: 'no', ceiling: 'yes', structural: 'no', occupantRisk: 'yes', propertyDamage: 'yes' },
    expect: { classification: ['Critical'], priority: ['P1'] }, expectText: 'Critical Works (hazard confirmed), P1 Emergency' },
  { key: 'F', title: 'Extensive bathroom waterproofing failure with active leak to unit below', itemName: 'Waterproofing repair (bathroom)',
    scope: { extent: 'extensive', components: '6+', affectsFunction: 'yes', appearanceOnly: 'no', dismantling: 'yes', replacement: 'yes', reconstruction: 'yes', multipleTrades: 'yes' },
    safety: { leak: 'active', leakNearElectrical: 'no', electrical: 'no', glass: 'no', ceiling: 'no', structural: 'no', occupantRisk: 'no', propertyDamage: 'yes' },
    expect: { classification: ['Major'], priority: ['P2'] }, expectText: 'Major Works, priority set by active leakage (P2)' },
  { key: 'G', title: 'Broken unstable shower glass', itemName: 'Shattered / unstable shower glass make-safe and replacement',
    scope: { extent: 'localized', components: '1', affectsFunction: 'yes', appearanceOnly: 'no', dismantling: 'yes', replacement: 'yes', reconstruction: 'no', multipleTrades: 'no' },
    safety: { leak: 'none', electrical: 'no', glass: 'yes', ceiling: 'no', structural: 'no', occupantRisk: 'yes', propertyDamage: 'no' },
    expect: { classification: ['Critical'], priority: ['P1'] }, expectText: 'Critical Works, P1 Emergency' },
];

export function runScenarios(library) {
  return SCENARIOS.map((s) => {
    const item = library.find((x) => x.item === s.itemName);
    const r = classify({ ...EMPTY_SCOPE, ...s.scope }, { ...EMPTY_SAFETY, ...s.safety }, item);
    const okC = s.expect.classification.includes(r.classification);
    const okP = !s.expect.priority || s.expect.priority.includes(r.priority);
    return { ...s, item, result: r, pass: okC && okP };
  });
}

// ---- Cost estimator ----
export const COST_COMPONENTS = [
  ['labor', 'Labor'], ['materials', 'Materials'], ['equipment', 'Equipment'],
  ['transport', 'Transportation / Mobilization'], ['specialist', 'Specialist Subcontractor'], ['other', 'Other Approved Expenses'],
];

export function costTotals(lines, opts) {
  const { mode = 'combined', regionFactor = 1, contingencyPct = 0 } = opts || {};
  const use = (k) => mode === 'combined' || (mode === 'labor' && k === 'labor') || (mode === 'materials' && k === 'materials');
  let min = 0; let max = 0;
  const rows = COST_COMPONENTS.map(([k, label]) => {
    const l = lines[k] || { min: 0, max: 0 };
    const factor = k === 'labor' || k === 'transport' ? regionFactor : 1;
    const rmin = use(k) ? (Number(l.min) || 0) * factor : 0;
    const rmax = use(k) ? (Number(l.max) || 0) * factor : 0;
    min += rmin; max += rmax;
    return { key: k, label, min: rmin, max: rmax, included: use(k) };
  });
  const cmin = min * contingencyPct / 100; const cmax = max * contingencyPct / 100;
  return { rows, subtotalMin: min, subtotalMax: max, contingencyMin: cmin, contingencyMax: cmax, totalMin: min + cmin, totalMax: max + cmax };
}

export function variance(budget, actual) {
  const b = Number(budget) || 0; const a = Number(actual) || 0;
  if (!b) return { amount: a - b, pct: null };
  return { amount: a - b, pct: ((a - b) / b) * 100 };
}

// Lines prefilled from a library item: labor/material/equipment split applied to both ends of the range.
export function linesFromItem(item, defaults) {
  const mid = item.laborCost + item.materialCost + item.equipmentCost || 1;
  const share = (v) => v / mid;
  const r = (n) => Math.round(n / 50) * 50;
  const mob = defaults && defaults.mobilization ? defaults.mobilization : 0;
  return {
    labor: { min: r(item.costMin * share(item.laborCost)), max: r(item.costMax * share(item.laborCost)) },
    materials: { min: r(item.costMin * share(item.materialCost)), max: r(item.costMax * share(item.materialCost)) },
    equipment: { min: r(item.costMin * share(item.equipmentCost)), max: r(item.costMax * share(item.equipmentCost)) },
    transport: { min: mob, max: mob },
    specialist: { min: 0, max: 0 },
    other: { min: 0, max: 0 },
  };
}

// Duration buckets for filtering.
export function durationHours(d) {
  if (!d) return 0;
  const nums = (d.match(/[\d.]+/g) || []).map(Number);
  const hi = nums.length ? Math.max(...nums) : 0;
  return /day/i.test(d) ? hi * 8 : hi;
}
export const DURATION_BUCKETS = [
  ['le4h', 'Up to 4 hours', (h) => h <= 4],
  ['day', '4 hours – 1 day', (h) => h > 4 && h <= 8],
  ['2-3d', '2–3 days', (h) => h > 8 && h <= 24],
  ['gt3d', 'More than 3 days', (h) => h > 24],
];
export const COST_BANDS = [
  ['lt5k', 'Under ₱5,000', 0, 5000],
  ['5-10k', '₱5,000–10,000', 5000, 10000],
  ['10-15k', '₱10,000–15,000', 10000, 15000],
  ['15-50k', '₱15,000–50,000', 15000, 50000],
  ['50-100k', '₱50,000–100,000', 50000, 100000],
  ['gt100k', '₱100,000 and above', 100000, Infinity],
];
export const bandOf = (v) => (COST_BANDS.find(([, , lo, hi]) => v >= lo && v < hi) || COST_BANDS[0])[0];
