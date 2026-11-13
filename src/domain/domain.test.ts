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
import { weekRange, monthRange, toScopeDateText, addDays } from './dates.ts';
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

// ---------------- Portal publishing & sanitization ----------------
import { buildPortalSnapshot, sanitizeReport, canTransition, nextTransitions, transitionPublication } from './portal.ts';
import { audienceOf } from '../auth/roles.ts';

test('portal snapshot contains construction data only and no internal fields', () => {
  const reg = buildRegister(input, TODAY);
  const m = computeMetrics(reg, INITIAL_MILESTONES, TODAY);
  const snap = buildPortalSnapshot(reg, INITIAL_MILESTONES, m, TODAY);
  const json = JSON.stringify(snap);
  // No responsible persons, remarks or episode/production content
  assert.ok(!json.includes('Engr. Richard'), 'owner names must not be published');
  assert.ok(!json.includes('Direk'), 'production directors must not be published');
  assert.ok(!/"owner"|"remarks"|"concern"|"correctiveAction"|"supporting"/.test(json));
  assert.ok(!snap.ongoing.concat(snap.upcoming, snap.completed).some((i) => /^Ep \d|B-ROLLS/.test(i.name)));
  assert.equal(snap.actualPct, m.actualPct);
  assert.equal(snap.milestones.length, INITIAL_MILESTONES.length);
  assert.ok(snap.milestones.every((x) => ['Confirmed', 'Tentative', 'Target'].includes(x.commitment)));
});

test('only approved (frozen) reports can be sanitized for the portal, and owners/issues are stripped', () => {
  const reg = buildRegister(input, TODAY);
  const content = buildMonthlyContent(reg, INITIAL_MILESTONES, [], [], [], TODAY, TODAY);
  const base = { id: 'M-2026-11', type: 'monthly' as const, periodStart: content.periodStart, periodEnd: content.periodEnd, title: 'Monthly', narrative: { executiveSummary: 'Summary', recommendations: 'INTERNAL RECO', issues: 'INTERNAL ISSUE' }, createdAt: '', createdBy: '', updatedAt: '', updatedBy: '' };
  assert.throws(() => sanitizeReport({ ...base, status: 'draft' }));
  const pub = sanitizeReport({ ...base, status: 'approved', frozen: content });
  const json = JSON.stringify(pub);
  assert.ok(!json.includes('Engr. Richard'));
  assert.ok(!json.includes('INTERNAL RECO') && !json.includes('INTERNAL ISSUE'));
  assert.ok(!json.includes('Direk'));
  assert.equal(pub.executiveSummary, 'Summary');
});

test('publishing workflow enforces roles and order', () => {
  assert.ok(canTransition('draft', 'review', 'engineer'));
  assert.ok(!canTransition('review', 'approved', 'engineer'));
  assert.ok(canTransition('review', 'approved', 'manager'));
  assert.ok(!canTransition('draft', 'published', 'admin'), 'cannot skip review/approval');
  assert.ok(canTransition('approved', 'published', 'admin'));
  assert.ok(!canTransition('approved', 'published', 'client'));
  assert.deepEqual(nextTransitions('published').map((t) => t.to), ['archived']);
  const p = transitionPublication({ id: 'X', kind: 'update', title: 't', status: 'draft', payload: {}, history: [], createdAt: '', createdBy: '', updatedAt: '', updatedBy: '' }, 'review', 'Ana');
  assert.equal(p.status, 'review');
  assert.equal(p.history[0].from, 'draft');
  assert.equal(p.history[0].by, 'Ana');
});

test('role routing: guests, pending, internal and external audiences', () => {
  const u = (role: any, status: any = 'active', id = 'u1') => ({ id, name: 'x', email: 'x', role, status, createdAt: '' });
  assert.equal(audienceOf(u('viewer', 'active', 'viewer_guest')), 'guest');
  assert.equal(audienceOf(u('pending', 'pending')), 'pending');
  assert.equal(audienceOf(u('client', 'revoked')), 'pending');
  assert.equal(audienceOf(u('engineer')), 'internal');
  assert.equal(audienceOf(u('viewer')), 'internal');
  assert.equal(audienceOf(u('owner')), 'external');
  assert.equal(audienceOf(u('executive')), 'external');
});

// ---------------- Notifications, executive dashboard, calendar forecast ----------------
import { buildNotifications, notifScope, isAssignedTo } from './notifications.ts';
import { buildCalendar, buildForecast } from './calendarEvents.ts';
import { execKpis, streamHealth, ownerPerformance } from './executive.ts';
import { manilaIso, todayIso as todayManila } from './dates.ts';

const reg2 = () => buildRegister(input, TODAY);
const admin = { name: 'Stephen', email: 'stephen@example.com', role: 'admin' as const };

test('dates: "today" is the Asia/Manila calendar date and weeks start on Monday', () => {
  // 2026-11-12 17:30 UTC is already Nov 13 in Manila (UTC+8)
  assert.equal(manilaIso(new Date('2026-11-12T17:30:00Z')), '2026-11-13');
  assert.equal(todayManila(new Date('2026-11-12T15:59:00Z')), '2026-11-12');
  assert.equal(weekRange('2026-11-15').start, '2026-11-09'); // Sunday → previous Monday
});

test('notifications: milestone due today is MEDIUM "due", overdue milestone is CRITICAL', () => {
  const r = reg2();
  const target = r.find((x) => x.kind === 'milestone' && x.status !== 'Completed' && x.finish && x.finish > TODAY)!;
  const dueToday = buildNotifications({ register: r, viewer: admin, today: target.finish! });
  const due = dueToday.find((n) => n.type === 'due' && n.activityId === target.id)!;
  assert.ok(due, 'due-today notification exists');
  assert.equal(due.priority, 'MEDIUM');
  assert.match(due.detail, /Due today/);

  const later = buildNotifications({ register: buildRegister(input, addDays(target.finish!, 2)), viewer: admin, today: addDays(target.finish!, 2) });
  const over = later.find((n) => n.type === 'overdue' && n.activityId === target.id)!;
  assert.ok(over, 'overdue notification exists');
  assert.equal(over.priority, 'CRITICAL');
  // Critical items sort first
  assert.equal(later[0].priority, 'CRITICAL');
});

test('notifications: preferences switch types off and set the lead time', () => {
  const r = reg2();
  const all = buildNotifications({ register: r, viewer: admin, today: TODAY, prefs: { off: {}, leadDays: 30 } });
  const none = buildNotifications({ register: r, viewer: admin, today: TODAY, prefs: { off: { due: true }, leadDays: 30 } });
  assert.ok(all.some((n) => n.type === 'due'));
  assert.ok(!none.some((n) => n.type === 'due'));
  const short = buildNotifications({ register: r, viewer: admin, today: TODAY, prefs: { off: {}, leadDays: 0 } });
  assert.ok(short.filter((n) => n.type === 'due').length <= all.filter((n) => n.type === 'due').length);
});

test('notifications: role scope — viewer read-only sees project items, staff only assigned items', () => {
  const r = reg2();
  assert.equal(notifScope('viewer'), 'readonly');
  assert.equal(notifScope('staff'), 'assigned');
  assert.equal(notifScope('manager'), 'all');
  const viewer = buildNotifications({ register: r, viewer: { name: 'Guest Viewer', email: 'v@example.com', role: 'viewer' }, today: TODAY });
  const adminList = buildNotifications({ register: r, viewer: admin, today: TODAY });
  assert.equal(viewer.filter((n) => n.activityId).length, adminList.filter((n) => n.activityId).length);
  const staff = buildNotifications({ register: r, viewer: { name: 'Richard Santos', email: 'rs@example.com', role: 'engineer' }, today: TODAY });
  assert.ok(staff.every((n) => !n.activityId || isAssignedTo(r.find((x) => x.id === n.activityId)!, { name: 'Richard Santos', email: 'rs@example.com', role: 'engineer' })));
  const nobody = buildNotifications({ register: r, viewer: { name: 'Zed Q', email: 'zq@example.com', role: 'staff' }, today: TODAY });
  assert.equal(nobody.length, 0);
});

test('empty project: dashboard, notifications and forecast handle no records', () => {
  assert.deepEqual(buildNotifications({ register: [], viewer: admin, today: TODAY }), []);
  const k = execKpis([], TODAY);
  assert.equal(k.activeStreams.length, 0);
  assert.equal(k.onTime.pct, null);
  assert.deepEqual(streamHealth([], TODAY), []);
  assert.deepEqual(ownerPerformance([], TODAY), []);
  const f = buildForecast(buildCalendar({ register: [], today: TODAY }), TODAY);
  assert.equal(f.counts.d60, 0);
  assert.equal(f.weeks.length, 9);
  assert.ok(f.weeks.every((w) => !w.overloaded));
});

test('forecast: 60-day window, Monday weeks, counts are cumulative and no-owner items flagged', () => {
  const items = buildCalendar({ register: reg2(), today: TODAY });
  const f = buildForecast(items, TODAY);
  assert.ok(f.counts.d7 <= f.counts.d14 && f.counts.d14 <= f.counts.d30 && f.counts.d30 <= f.counts.d60);
  f.weeks.forEach((w) => assert.equal(new Date(w.start + 'T00:00:00').getDay(), 1));
  const grouped = f.groups.reduce((a, g) => a + g.items.length, 0);
  assert.equal(grouped, f.counts.d60);
  assert.ok(f.noOwner.every((i) => !i.owner));
  const past = buildForecast(items, TODAY, true);
  assert.equal(past.to, TODAY);
});

// ---------------- Client-first platform: roles, modules, portal tiers ----------------
import { canOpenModule, landingModule, canReadPortalDocuments } from '../auth/roles.ts';
import { PUBLIC_PORTAL_KINDS } from './portal.ts';
import { readFileSync } from 'node:fs';

const mkUser = (role: any, id = 'u1') => ({ id, name: 'U', email: 'u@example.com', role, status: 'active' as const, createdAt: '2026-01-01' });

test('roles: internal users land on their dashboard and see only their modules', () => {
  assert.equal(landingModule('admin'), 'command');
  assert.equal(landingModule('manager'), 'command');
  assert.equal(landingModule('engineer'), 'construction');
  assert.equal(landingModule('production'), 'production');
  assert.equal(landingModule('staff'), 'tracker');
  assert.ok(canOpenModule('admin', 'publishing') && canOpenModule('manager', 'publishing'));
  assert.ok(!canOpenModule('engineer', 'production') && canOpenModule('engineer', 'procurement'));
  for (const r of ['admin', 'manager', 'engineer', 'production', 'staff', 'viewer'] as const) assert.ok(!canOpenModule(r, 'finance'), 'Budget & Expenses removed');
  assert.ok(!canOpenModule('production', 'construction') && canOpenModule('production', 'calendar'));
  assert.ok(!canOpenModule('staff', 'publishing'));
  assert.ok(!canOpenModule('viewer', 'publishing'));
  for (const r of ['owner', 'executive', 'client', 'stakeholder', 'pending'] as const) assert.ok(!canOpenModule(r, 'command'));
});

test('portal tiers: public sees dashboard content, Owner/Executive/internal also see documents', () => {
  assert.ok(!PUBLIC_PORTAL_KINDS.includes('document'));
  assert.equal(audienceOf({ ...mkUser('viewer'), id: 'viewer_guest' }), 'guest');
  assert.ok(!canReadPortalDocuments({ ...mkUser('viewer'), id: 'viewer_guest' }));
  assert.ok(!canReadPortalDocuments(mkUser('client')));
  assert.ok(!canReadPortalDocuments(mkUser('stakeholder')));
  assert.ok(canReadPortalDocuments(mkUser('owner')));
  assert.ok(canReadPortalDocuments(mkUser('executive')));
  assert.ok(canReadPortalDocuments(mkUser('engineer')));
  assert.ok(!canReadPortalDocuments({ ...mkUser('owner'), status: 'pending' as any }));
});

test('firestore.rules public portal kinds match the app and internal collections stay private', () => {
  const rules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
  const m = rules.match(/match \/portal\/\{id\} \{\s*allow read: if resource\.data\.kind in \[([^\]]+)\]/);
  assert.ok(m, 'portal read rule found');
  const kinds = m![1].split(',').map((x) => x.trim().replace(/'/g, ''));
  assert.deepEqual([...kinds].sort(), [...PUBLIC_PORTAL_KINDS].sort());
  for (const col of ['procurement', 'documents', 'publications', 'events', 'reports', 'issues']) {
    const block = rules.slice(rules.indexOf(`match /${col}/`));
    const read = block.match(/allow read[^;]*;/)![0];
    assert.ok(!/if true/.test(read), `${col} must not be public`);
  }
});
