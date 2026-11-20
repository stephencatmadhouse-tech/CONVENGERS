// Run: node test/engine.test.mjs
import { buildLibrary } from '../src/data/library.js';
import { runScenarios, classify, EMPTY_SCOPE, EMPTY_SAFETY, costTotals, variance, estimateFor } from '../src/engine.js';
import assert from 'node:assert/strict';

const lib = buildLibrary();
let fails = 0;
for (const s of runScenarios(lib)) {
  const line = `${s.key.padEnd(3)} ${s.pass ? 'PASS' : 'FAIL'}  ${s.result.classification.padEnd(8)} ${s.result.priority}  ${s.title}  [expected: ${s.expectText}]`;
  console.log(line);
  if (!s.item) { console.log('    missing library item', s.itemName); fails++; }
  if (!s.pass) fails++;
}
// Every confirmed hazard alone forces Critical + P1
const base = { ...EMPTY_SCOPE, extent: 'localized', components: '1', affectsFunction: 'no', appearanceOnly: 'yes', dismantling: 'no', replacement: 'no', reconstruction: 'no', multipleTrades: 'no' };
const safe = { ...EMPTY_SAFETY, leak: 'none', electrical: 'no', glass: 'no', ceiling: 'no', structural: 'no', occupantRisk: 'no', propertyDamage: 'no' };
for (const k of ['electrical', 'glass', 'ceiling', 'structural', 'occupantRisk']) {
  const r = classify(base, { ...safe, [k]: 'yes' });
  assert.equal(r.classification, 'Critical', k); assert.equal(r.priority, 'P1', k);
}
assert.equal(classify(base, { ...safe, leak: 'flooding' }).classification, 'Critical');
assert.equal(classify(base, { ...safe, leak: 'active', leakNearElectrical: 'yes' }).classification, 'Critical');
assert.equal(classify(base, { ...safe, leak: 'active', leakNearElectrical: 'no' }).classification, 'Minor');
assert.equal(classify(base, { ...safe, leak: 'active', leakNearElectrical: 'no' }).priority, 'P2');
// Unsure safety answers never auto-escalate to Critical, but raise priority and require a specialist
const u = classify(base, { ...safe, glass: 'unsure' });
assert.equal(u.classification, 'Minor'); assert.equal(u.priority, 'P2'); assert.ok(u.specialist);
// High cost alone does not make a repair Critical
const big = classify({ ...base, extent: 'extensive', components: '6+', reconstruction: 'yes', multipleTrades: 'yes' }, safe);
assert.equal(big.classification, 'Major');
// Cost maths
const t = costTotals({ labor: { min: 1000, max: 2000 }, materials: { min: 500, max: 800 }, equipment: { min: 100, max: 100 }, transport: { min: 300, max: 300 }, specialist: { min: 0, max: 0 }, other: { min: 50, max: 50 } }, { mode: 'combined', regionFactor: 1, contingencyPct: 10 });
assert.equal(t.subtotalMin, 1950); assert.equal(t.subtotalMax, 3250); assert.equal(Math.round(t.totalMax), 3575);
const lo = costTotals({ labor: { min: 1000, max: 2000 }, materials: { min: 500, max: 800 } }, { mode: 'labor', regionFactor: 0.85 });
assert.equal(lo.subtotalMin, 850); assert.equal(lo.subtotalMax, 1700);
assert.deepEqual(variance(10000, 11500), { amount: 1500, pct: 15 });
// Estimate scaling: broken tile assessed as Major uses the room-scale item
const tile = lib.find((x) => x.item === 'Broken tile replacement');
const e = estimateFor(tile, { scopeClass: 'Major' }, { components: '6+' }, lib);
assert.equal(e.min, 20000); assert.equal(e.max, 80000);
console.log(fails ? `\n${fails} scenario failure(s)` : '\nAll scenarios and engine assertions passed.');
process.exit(fails ? 1 : 0);
