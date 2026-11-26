/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_SCOPES, INITIAL_MILESTONES, INITIAL_CONCRETE_POURS, INITIAL_EPISODES, INITIAL_OVERRIDES, INITIAL_CHARACTERS } from '../db/seedData.ts';
import { buildRegister, episodeActivityId } from './register.ts';
import {
  buildProduction,
  kpis,
  monthPlan,
  castMatrix,
  characterProfiles,
  productionWindows,
  seriesMonths,
  teamOverview,
  alignmentSnapshot,
  onTrack,
} from './productionAlignment.ts';
import type { Episode, EpisodeProduction } from '../types/index.ts';

const TODAY = '2026-11-12';
const base = {
  scopes: INITIAL_SCOPES,
  milestones: INITIAL_MILESTONES,
  pours: INITIAL_CONCRETE_POURS,
  episodes: INITIAL_EPISODES,
  activities: [],
  overrides: INITIAL_OVERRIDES,
  characters: INITIAL_CHARACTERS,
};
const ep = (n: number) => INITIAL_EPISODES.find((e) => e.number === n)!;
const run = (records: EpisodeProduction[] = [], today = TODAY, episodes: Episode[] = INITIAL_EPISODES) => {
  const register = buildRegister({ ...base, episodes }, today);
  return buildProduction({ episodes, characters: INITIAL_CHARACTERS, register, records, overrides: INITIAL_OVERRIDES, today, now: `${today}T08:00:00Z` });
};

test('production alignment: every episode comes from the episode records; cast only from character records', () => {
  const p = run();
  assert.equal(p.episodes.length, INITIAL_EPISODES.length);
  const names = new Set(INITIAL_CHARACTERS.map((c) => c.name));
  p.episodes.forEach((e) => e.cast.forEach((c) => assert.ok(names.has(c.name), `unknown character ${c.name}`)));
  p.characters.forEach((c) => assert.ok(names.has(c.name)));
  // A character ID that no longer exists is not shown as a person
  const known = new Set(INITIAL_CHARACTERS.map((c) => c.id));
  const e1 = p.episodes.find((e) => e.id === ep(1).id)!;
  assert.equal(e1.cast.length, ep(1).characters.filter((id) => known.has(id)).length);
  // No title invented: every title is the stored one
  p.episodes.forEach((e) => assert.equal(e.title, INITIAL_EPISODES.find((x) => x.id === e.id)!.title));
});

test('production alignment: time-sensitive vs non-time-sensitive classification (derived, then explicit)', () => {
  const p = run();
  const e1 = p.episodes.find((e) => e.id === ep(1).id)!; // "Before the schedule"
  assert.equal(e1.classification, 'flexible');
  assert.ok(e1.classAuto);
  const e6 = p.episodes.find((e) => e.id === ep(6).id)!; // footing reinforcement, formworks & concrete
  assert.equal(e6.classification, 'time');
  assert.ok(e6.milestoneIds.length > 0, 'linked to construction');
  const p2 = run([{ id: ep(6).id, classification: 'flexible' }]);
  const e6b = p2.episodes.find((e) => e.id === ep(6).id)!;
  assert.equal(e6b.classification, 'flexible');
  assert.equal(e6b.classAuto, false);
  assert.ok(e6b.checklist.find((c) => c.id === 'milestone')!.na, 'milestone check not applicable to flexible episodes');
});

test('production alignment: a projected date is never treated as a confirmed shoot date', () => {
  const p = run();
  const e8 = p.episodes.find((e) => e.id === ep(8).id)!; // status Planned
  assert.equal(e8.classification, 'time');
  assert.ok(e8.projected, 'projected from the construction schedule');
  assert.equal(e8.confirmed, undefined);
  assert.notEqual(e8.status, 'Confirmed');
  assert.ok(!e8.checklist.find((c) => c.id === 'director')!.done);
  // Director approval confirms the shoot date
  const p2 = run([{ id: ep(8).id, approval: { start: '2026-11-20', end: '2026-11-21', by: 'Direk', at: '2026-11-12T01:00:00Z' } }]);
  const e8b = p2.episodes.find((e) => e.id === ep(8).id)!;
  assert.deepEqual(e8b.confirmed, { start: '2026-11-20', end: '2026-11-21' });
  assert.ok(e8b.checklist.find((c) => c.id === 'director')!.done);
  assert.equal(e8b.shown!.kind, 'confirmed');
});

test('production alignment: construction moves flag dependent episodes for review without moving their dates', () => {
  const p = run();
  const e6 = p.episodes.find((e) => e.id === ep(6).id)!;
  const snap = alignmentSnapshot(p, ep(6).id);
  assert.ok(Object.keys(snap).length > 0);
  // Reviewed against the current dates → not flagged
  const ok = run([{ id: ep(6).id, alignedTo: snap, reviewedAt: '2099-01-01T00:00:00Z' }]).episodes.find((e) => e.id === ep(6).id)!;
  assert.equal(ok.moved.length, 0);
  // Reviewed against older dates → flagged FOR REVIEW, orange or red, alert raised, target date unchanged
  const old = Object.fromEntries(Object.entries(snap).map(([k, v]) => [k, { start: '2026-10-01', finish: v.finish }]));
  const p2 = run([{ id: ep(6).id, alignedTo: old, reviewedAt: '2099-01-01T00:00:00Z' }]);
  const e6b = p2.episodes.find((e) => e.id === ep(6).id)!;
  assert.ok(e6b.moved.length > 0);
  assert.ok(['orange', 'red'].includes(e6b.light));
  assert.deepEqual(e6b.target, e6.target, 'shoot dates are not moved automatically');
  const alert = p2.alerts.find((a) => a.type === 'scheduleAffected' && a.episodeId === ep(6).id)!;
  assert.ok(alert);
  assert.equal(alert.status, 'FOR REVIEW');
  assert.match(alert.action, /Director/);
});

test('production alignment: delayed construction milestones turn dependent shoots red', () => {
  const p = run([], '2027-02-25');
  const e11 = p.episodes.find((e) => e.id === ep(11).id)!; // 3F wall assembly; plumbing works (Feb 8–20)
  const linked = p.milestones.filter((m) => e11.milestoneIds.includes(m.id));
  if (linked.some((m) => m.delayed)) {
    assert.equal(e11.light, 'red');
    assert.ok(p.alerts.some((a) => a.type === 'milestoneDelayed' && a.episodeId === e11.id));
  } else {
    assert.ok(['orange', 'green', 'yellow'].includes(e11.light));
  }
});

test('production alignment: readiness, assignment and character availability', () => {
  const e = ep(9);
  const full: EpisodeProduction = {
    id: e.id,
    classification: 'flexible',
    directorConfirmed: true,
    team: { coordinator: { name: 'Coordinator A', confirmed: true }, camera: { name: 'Camera A', confirmed: true } },
    cast: Object.fromEntries(e.characters.map((c) => [c, { availability: 'Available' as const }])),
    checklist: { script: true, talkingPoints: true, siteAccess: true, camera: true },
    approval: { start: e.shootStart, end: e.shootEnd, by: 'Direk', at: '2026-11-12T00:00:00Z' },
  };
  const ready = run([full]).episodes.find((x) => x.id === e.id)!;
  assert.ok(ready.readiness.ready);
  assert.equal(ready.assignment, 'Confirmed');
  assert.deepEqual(ready.readiness.awaiting, []);
  const firstChar = e.characters.find((id) => INITIAL_CHARACTERS.some((c) => c.id === id))!;
  const pend = run([{ ...full, cast: { ...full.cast, [firstChar]: { availability: 'Unavailable' } } }], '2027-01-05');
  const pe = pend.episodes.find((x) => x.id === e.id)!;
  assert.equal(pe.readiness.ready, false);
  assert.equal(pe.assignment, 'For Confirmation');
  assert.ok(pe.readiness.awaiting.includes('Character availability'));
  const alert = pend.alerts.find((a) => a.type === 'castPending' && a.episodeId === e.id)!;
  assert.equal(alert.severity, 'critical');
  // No team at all → For Assignment
  const bare = run([], '2027-01-05').episodes.find((x) => x.id === e.id)!;
  assert.equal(bare.assignment, 'For Assignment');
  assert.ok(run([], '2027-01-05').alerts.some((a) => a.type === 'teamIncomplete' && a.episodeId === e.id));
});

test('production alignment: completed shoots, KPIs, monthly plan, matrix, windows', () => {
  const p = run();
  const b = p.episodes.find((x) => x.id === INITIAL_EPISODES.find((e) => e.episodeLabel === 'B-ROLLS')!.id)!;
  assert.equal(b.status, 'Completed');
  assert.equal(b.light, 'green');
  assert.ok(p.alerts.some((a) => a.type === 'docsPending' && a.episodeId === b.id));

  const k = kpis(p);
  assert.equal(k.total, INITIAL_EPISODES.length);
  assert.equal(k.completed + k.upcoming, k.total);
  assert.equal(k.timeSensitive + k.flexible, k.total);

  const months = seriesMonths(p);
  assert.ok(months[0] <= '2026-10' && months[months.length - 1] >= '2027-04', `series covers the whole lineup: ${months[0]}…${months.at(-1)}`);
  const nov = monthPlan(p, '2026-11');
  assert.ok(nov.shoots.length > 0);
  assert.equal(nov.time.length + nov.flexible.length, nov.shoots.filter((e) => e.status !== 'Completed').length);
  assert.equal(nov.confirmed.length + nov.pending.length, nov.shoots.filter((e) => e.status !== 'Completed').length);

  const rows = castMatrix(p);
  assert.ok(rows.length > 0);
  assert.ok(rows.every((r) => ['Available', 'Pending', 'Unavailable'].includes(r.availability)));
  const prof = characterProfiles(p);
  assert.equal(prof.length, p.characters.length);

  const win = productionWindows(p, 60);
  win.forEach((w) => assert.ok(w.days >= 2));
  const t = teamOverview(p);
  assert.ok(Array.isArray(t.ready));
  assert.ok(['On Track', 'Needs Attention', 'At Risk'].includes(onTrack(p).label));
  // Register IDs are the ones every other module uses
  assert.ok(p.episodes.every((e) => e.milestoneIds.every((id) => p.milestones.some((m) => m.id === id))));
  assert.ok(episodeActivityId('x').startsWith('EP-'));
});
