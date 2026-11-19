/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_SCOPES, INITIAL_MILESTONES, INITIAL_CONCRETE_POURS, INITIAL_EPISODES, INITIAL_OVERRIDES, INITIAL_CHARACTERS } from '../db/seedData.ts';
import { buildRegister } from './register.ts';
import { computeMetrics, projectStartDate } from './metrics.ts';
import { periodRange, lookAhead, sCurve, weeklyProgress, phaseStatus, timelineState, timelinePos, monthTicks } from './commandCenter.ts';
import type { ProgressSnapshot } from '../types/index.ts';

const TODAY = '2026-11-12';
const reg = buildRegister({ scopes: INITIAL_SCOPES, milestones: INITIAL_MILESTONES, pours: INITIAL_CONCRETE_POURS, episodes: INITIAL_EPISODES, activities: [], overrides: INITIAL_OVERRIDES, characters: INITIAL_CHARACTERS }, TODAY);
const m = computeMetrics(reg, INITIAL_MILESTONES, TODAY);
const snap = (date: string, actualPct: number) => ({ id: date, date, actualPct, plannedPct: 0 }) as unknown as ProgressSnapshot;

test('command center: period ranges', () => {
  assert.deepEqual(periodRange('today', TODAY, '2026-10-05'), { start: TODAY, end: TODAY });
  assert.deepEqual(periodRange('week', TODAY, '2026-10-05'), { start: '2026-11-09', end: '2026-11-15' });
  assert.deepEqual(periodRange('month', TODAY, '2026-10-05'), { start: '2026-11-01', end: '2026-11-30' });
  assert.deepEqual(periodRange('all', TODAY, '2026-10-05'), { start: '2026-10-05', end: TODAY });
  assert.deepEqual(lookAhead('week', TODAY), { start: TODAY, end: '2026-11-15' });
  assert.deepEqual(lookAhead('all', TODAY), { start: TODAY, end: '2026-12-12' });
});

test('command center: S-curve uses the baseline, recorded snapshots and the live figure — gaps stay null', () => {
  const pts = sCurve(reg, [snap('2026-11-02', 3.1)], m, projectStartDate(), TODAY);
  const todayPt = pts.find((p) => p.date === TODAY)!;
  assert.equal(todayPt.actual, Math.round(m.actualPct * 10) / 10, 'today = live actual (same as the KPI)');
  assert.equal(pts.find((p) => p.date === '2026-11-02')!.actual, 3.1);
  assert.ok(pts.filter((p) => p.date < TODAY && p.date !== '2026-11-02').every((p) => p.actual === null), 'no invented history');
  assert.ok(pts.every((p, i) => i === 0 || p.date > pts[i - 1].date), 'sorted');
  const planned = pts.map((p) => p.planned!).filter((x) => x !== null);
  assert.ok(planned.every((v, i) => i === 0 || v >= planned[i - 1] - 0.05), 'planned curve is cumulative');
  const fc = pts.filter((p) => p.forecast !== null);
  assert.equal(fc[0].date, TODAY);
  if (fc.length > 1) assert.equal(fc[fc.length - 1].forecast, 100);
});

test('command center: weekly progress from snapshots only (null when not recorded)', () => {
  const bars = weeklyProgress(reg, [snap('2026-11-01', 2), snap('2026-11-08', 3.5)], m.actualPct, TODAY, '2026-10-26', TODAY);
  assert.deepEqual(bars.map((b) => b.start), ['2026-10-26', '2026-11-02', '2026-11-09']);
  assert.equal(bars[0].gain, null, 'no snapshot before Oct 26');
  assert.equal(bars[1].gain, 1.5);
  assert.equal(bars[2].gain, Math.round((m.actualPct - 3.5) * 10) / 10, 'current week ends at the live figure');
  assert.equal(bars[2].current, true);
});

test('command center: phase status, timeline state and positions', () => {
  assert.equal(phaseStatus(100, 80), 'Completed');
  assert.equal(phaseStatus(0, 0), 'Not started');
  assert.equal(phaseStatus(30, 33), 'Slightly behind');
  assert.equal(phaseStatus(20, 33), 'Behind');
  assert.equal(phaseStatus(40, 33), 'Ahead');
  const r = reg.find((x) => x.kind === 'milestone')!;
  assert.equal(timelineState({ ...r, status: 'Completed' }, TODAY), 'Completed');
  assert.equal(timelineState({ ...r, status: 'Upcoming', start: '2026-10-01', finish: '2026-10-02' }, TODAY), 'Delayed');
  assert.equal(timelineState({ ...r, status: 'Upcoming', start: '2026-12-01', finish: '2026-12-02' }, TODAY), 'Upcoming');
  assert.equal(timelinePos('2026-10-05', '2026-10-05', '2026-10-15'), 0);
  assert.equal(timelinePos('2026-10-10', '2026-10-05', '2026-10-15'), 50);
  assert.deepEqual(monthTicks('2026-10-05', '2027-01-10'), ['2026-11-01', '2026-12-01', '2027-01-01']);
});

// ---------------------------------------------------------------- announcements
import { isNoticeMilestone, workStoppageNotice, activeNotices } from './announcements.ts';
import { buildNotifications } from './notifications.ts';
import { buildCalendar } from './calendarEvents.ts';
import { workingDaysBetween } from './dates.ts';

test('announcements: work stoppage / resume records are notices, not milestones', () => {
  const notices = INITIAL_MILESTONES.filter((x) => isNoticeMilestone(x)).map((x) => x.id);
  assert.deepEqual(notices.sort(), ['m_3', 'm_4']);
  assert.equal(INITIAL_MILESTONES.filter((x) => !isNoticeMilestone(x)).length, INITIAL_MILESTONES.length - 2);
  const regMs = buildRegister({ scopes: INITIAL_SCOPES, milestones: INITIAL_MILESTONES.filter((x) => !isNoticeMilestone(x)), pours: INITIAL_CONCRETE_POURS, episodes: INITIAL_EPISODES, activities: [], overrides: INITIAL_OVERRIDES, characters: INITIAL_CHARACTERS }, TODAY);
  assert.ok(!regMs.some((r) => /work stoppage|work resumes/i.test(r.name)));
});

test('announcements: holiday stoppage December 21, 2026 – January 2, 2027; work resumes January 4, 2027', () => {
  const n = workStoppageNotice();
  assert.equal(n.start, '2026-12-21');
  assert.equal(n.end, '2027-01-02');
  assert.equal(n.resume, '2027-01-04');
  assert.match(n.message, /from Monday, December 21, 2026 to Saturday, January 2, 2027\. Work resumes on Monday, January 4, 2027\./);
  assert.equal(workingDaysBetween('2026-12-21', '2027-01-02'), 0, 'no working days during the stoppage');
  assert.equal(workingDaysBetween('2027-01-04', '2027-01-04'), 1);
  assert.equal(activeNotices('2026-11-19').length, 1);
  assert.equal(activeNotices('2027-01-05').length, 0, 'gone once work has resumed');
  const viewer = { name: 'A', email: 'a@example.com', role: 'admin' as const, id: 'x' };
  assert.equal(buildNotifications({ register: [], viewer, today: '2026-11-19' }).filter((x) => x.type === 'announcement').length, 0, 'not yet (more than 14 days ahead)');
  const near = buildNotifications({ register: reg, viewer, today: '2026-12-10' });
  assert.equal(near[0].type, 'announcement', 'listed first');
  const cal = buildCalendar({ register: [], notices: [n], today: TODAY });
  assert.deepEqual(cal.filter((c) => c.type === 'Announcement').map((c) => c.date), ['2026-12-21', '2027-01-04']);
});
