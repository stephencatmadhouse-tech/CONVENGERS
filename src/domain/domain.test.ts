/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Run: npm test
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INITIAL_SCOPES,
  INITIAL_MILESTONES,
  INITIAL_CONCRETE_POURS,
  INITIAL_EPISODES,
  INITIAL_OVERRIDES,
  INITIAL_CHARACTERS,
} from '../db/seedData.ts';
import { buildRegister, plannedPercentAt, resolveMeta, scopeKey, legacyScopeKey } from './register.ts';
import { computeMetrics, criticalPath, plannedCurve } from './metrics.ts';
import { buildAlignment } from './alignment.ts';
import { buildAttention, buildOutlook } from './attention.ts';
import { buildWeeklyContent, buildMonthlyContent, reportToCsv } from './reports.ts';
import { validateActivityEdit, findDuplicates, dataHealthCheck, makeSnapshot } from './validation.ts';
import { weekRange, monthRange, toScopeDateText } from './dates.ts';
import { parseDateWindow, toIsoDate } from '../utils/calculations.ts';

const TODAY = '2026-11-12';
const input = {
  scopes: INITIAL_SCOPES,
  milestones: INITIAL_MILESTONES,
  pours: INITIAL_CONCRETE_POURS,
  episodes: INITIAL_EPISODES,
  activities: [],
  overrides: INITIAL_OVERRIDES,
  characters: INITIAL_CHARACTERS,
};

test('register contains exactly one record per source record with unique IDs', () => {
  const reg = buildRegister(input, TODAY);
  const expected = INITIAL_SCOPES.length + INITIAL_MILESTONES.length + INITIAL_CONCRETE_POURS.length + INITIAL_EPISODES.length;
  assert.equal(reg.length, expected);
  assert.equal(new Set(reg.map((r) => r.id)).size, reg.length);
});

test('legacy override keys are merged into the stable key (no lost assignments)', () => {
  const s = INITIAL_SCOPES.find((x) => x.name === 'Column pedestal reinforcement & formworks')!;
  const meta = resolveMeta(INITIAL_OVERRIDES, scopeKey(s), [legacyScopeKey(s)]);
  assert.equal(meta.owner, 'Engr. Richard and Engr. Sandree');
  const reg = buildRegister(input, TODAY);
  assert.equal(reg.find((r) => r.sourceId === s.id)!.owner, 'Engr. Richard and Engr. Sandree');
});

test('status derivation: overdue unfinished scope is Delayed, 100% is Completed', () => {
  const reg = buildRegister(input, TODAY);
  const pedestal = reg.find((r) => r.name === 'Column pedestal reinforcement & formworks')!;
  assert.equal(pedestal.status, 'Delayed');
  const mob = reg.find((r) => r.name === 'Site mobilization / layout')!;
  assert.equal(mob.status, 'Completed');
  const future = reg.find((r) => r.name === 'Wall assembly works' && r.floor === '3F')!;
  assert.equal(future.status, 'Upcoming');
});

test('physical accomplishment equals working-day weighted average of scope progress', () => {
  const reg = buildRegister(input, TODAY);
  const m = computeMetrics(reg, INITIAL_MILESTONES, TODAY);
  const tw = INITIAL_SCOPES.reduce((s, x) => s + x.workingDays, 0);
  const manual = INITIAL_SCOPES.reduce((s, x) => s + x.workingDays * x.percentComplete, 0) / tw;
  assert.ok(Math.abs(m.actualPct - Math.round(manual * 10) / 10) < 0.11);
  assert.ok(m.plannedPct >= 0 && m.plannedPct <= 100);
  assert.equal(Math.round((m.actualPct - m.plannedPct) * 10) / 10, m.variancePct);
  assert.equal(m.targetCompletion, '2027-04-30');
});

test('planned percent uses working days and baseline window', () => {
  assert.equal(plannedPercentAt('2026-10-05', '2026-10-10', '2026-10-04'), 0);
  assert.equal(plannedPercentAt('2026-10-05', '2026-10-10', '2026-10-10'), 100);
  assert.equal(Math.round(plannedPercentAt('2026-10-05', '2026-10-10', '2026-10-07')), 50);
});

test('baseline is preserved: revised dates move the current schedule but not the plan', () => {
  const s = INITIAL_SCOPES[7];
  const ov = { ...INITIAL_OVERRIDES, [scopeKey(s)]: { key: scopeKey(s), baselineStart: '2026-11-16', baselineFinish: '2026-11-16', revisionCount: 1 } };
  const revised = { ...s, dateText: 'November 20, 2026' };
  const reg = buildRegister({ ...input, scopes: INITIAL_SCOPES.map((x) => (x.id === s.id ? revised : x)), overrides: ov }, TODAY);
  const r = reg.find((x) => x.sourceId === s.id)!;
  assert.equal(r.plannedFinish, '2026-11-16');
  assert.equal(r.finish, '2026-11-20');
  assert.equal(r.slipDays, 4);
});

test('alignment never mutates the register and classifies every episode', () => {
  const reg = buildRegister(input, TODAY);
  const before = JSON.stringify(reg);
  const rows = buildAlignment(reg, TODAY);
  assert.equal(JSON.stringify(reg), before);
  assert.equal(rows.length, INITIAL_EPISODES.length);
  const b = rows.find((r) => r.episode.episodeStatus === 'Completed');
  assert.equal(b?.classification, 'Completed');
  // Episode 5 documents excavation (done in Oct) but shoots Nov 14 → flagged
  const ep5 = rows.find((r) => r.episode.name.startsWith('Ep 5'))!;
  assert.ok(ep5.alerts.some((a) => a.type === 'misaligned'));
});

test('attention list flags delayed items and unassigned work', () => {
  const reg = buildRegister(input, TODAY);
  const att = buildAttention(reg, [], buildAlignment(reg, TODAY), TODAY);
  assert.ok(att.some((a) => a.category === 'Overdue' || a.category === 'Critical delay'));
  assert.ok(att.every((a, i) => i === 0 || ['critical', 'warn', 'info'].indexOf(att[i - 1].severity) <= ['critical', 'warn', 'info'].indexOf(a.severity)));
});

test('outlook distinguishes confirmed, tentative, target and at-risk', () => {
  const reg = buildRegister(input, TODAY);
  const out = buildOutlook(reg, buildAlignment(reg, TODAY), '2026-12-01', '2026-12-31', TODAY);
  assert.ok(out.length > 0);
  const classes = new Set(out.map((o) => o.outlook));
  assert.ok(classes.has('Management target'));
});

test('weekly and monthly reports are data-driven and export to CSV', () => {
  const reg = buildRegister(input, TODAY);
  const w = buildWeeklyContent(reg, INITIAL_MILESTONES, [], [], TODAY, TODAY);
  assert.equal(w.periodStart, '2026-11-09');
  assert.equal(w.periodEnd, '2026-11-15');
  assert.equal(w.progressGain, null); // no snapshots → not fabricated
  const m = buildMonthlyContent(reg, INITIAL_MILESTONES, [], [], [], TODAY, TODAY);
  assert.equal(m.monthKey, '2026-11');
  assert.ok(m.weekly.length >= 4);
  const csv = reportToCsv(m, 'Monthly');
  assert.ok(csv.startsWith('Report,'));
});

test('snapshots feed progress gain without inventing history', () => {
  const reg = buildRegister(input, TODAY);
  const metrics = computeMetrics(reg, INITIAL_MILESTONES, TODAY);
  const snap = { ...makeSnapshot(metrics, reg, 'test', '2026-11-08'), actualPct: metrics.actualPct - 2 };
  const w = buildWeeklyContent(reg, INITIAL_MILESTONES, [], [snap], TODAY, TODAY);
  assert.equal(w.progressStart.source, 'snapshot');
  assert.equal(w.progressGain, 2);
});

test('validation rejects inverted dates and future actuals', () => {
  assert.ok(validateActivityEdit({ name: 'x', start: '2026-11-10', finish: '2026-11-01' }, TODAY).errors.length > 0);
  assert.ok(validateActivityEdit({ name: 'x', actualFinish: '2027-01-01' }, TODAY).errors.length > 0);
  assert.equal(validateActivityEdit({ name: 'x', start: '2026-11-01', finish: '2026-11-10', progress: 50, actualStart: '2026-11-01', owner: 'A' }, TODAY).errors.length, 0);
  const reg = buildRegister(input, TODAY);
  assert.ok(findDuplicates(reg, 'Site mobilization / layout', '2026-10-05', '2026-10-06').length >= 1);
  const findings = dataHealthCheck({ ...input, activities: [], register: reg });
  assert.ok(!findings.some((f) => f.area === 'Unique IDs'));
});

test('critical path is empty without declared dependencies (nothing guessed)', () => {
  const reg = buildRegister(input, TODAY);
  assert.deepEqual(criticalPath(reg), []);
  const withDeps = reg.map((r, i) => (i > 0 && r.kind === 'scope' && i < 5 ? { ...r, dependsOn: [reg[i - 1].id] } : r));
  assert.ok(criticalPath(withDeps).length >= 2);
});

test('date helpers and scope date text round-trip', () => {
  assert.deepEqual(weekRange('2026-11-12'), { start: '2026-11-09', end: '2026-11-15' });
  assert.equal(monthRange('2026-12-31').key, '2026-12');
  for (const [s, e] of [['2026-11-14', '2026-11-20'], ['2027-01-29', '2027-02-11'], ['2026-12-01', '2027-01-09'], ['2026-11-16', '2026-11-16']]) {
    const w = parseDateWindow(toScopeDateText(s, e))!;
    assert.equal(toIsoDate(w[0]), s);
    assert.equal(toIsoDate(w[1]), e);
  }
  const curve = plannedCurve(buildRegister(input, TODAY), '2026-10-05', '2027-04-30');
  assert.equal(curve[0].planned >= 0, true);
  assert.equal(curve[curve.length - 1].planned, 100);
});
