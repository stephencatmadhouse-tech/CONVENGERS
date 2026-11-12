/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseDateWindow,
  calculateWorkingDays,
  calculateFloorProgress,
  calculateMilestonesCompletion,
  calculateConcreteCompletion,
  isPourOverdue,
  toIsoDate,
  recalculateScopeTimeline,
} from './calculations.ts';
import { ScopeItem, Milestone, ConcretePour } from '../types/index.ts';

test('parseDateWindow correctly parses single and multi-day date strings', () => {
  const r1 = parseDateWindow('October 5–6, 2026');
  assert.ok(r1);
  assert.equal(toIsoDate(r1[0]), '2026-10-05');
  assert.equal(toIsoDate(r1[1]), '2026-10-06');

  const r2 = parseDateWindow('Jan 7–Feb 13, 2027');
  assert.ok(r2);
  assert.equal(toIsoDate(r2[0]), '2027-01-07');
  assert.equal(toIsoDate(r2[1]), '2027-02-13');

  const r3 = parseDateWindow('Nov 27, 2026');
  assert.ok(r3);
  assert.equal(toIsoDate(r3[0]), '2026-11-27');
  assert.equal(toIsoDate(r3[1]), '2026-11-27');

  const rStoppage = parseDateWindow('Dec 20 – Jan 3');
  assert.ok(rStoppage);
  assert.equal(toIsoDate(rStoppage[0]), '2026-12-20');
  assert.equal(toIsoDate(rStoppage[1]), '2027-01-03');
});

test('calculateWorkingDays excludes Sundays, Philippine holidays, and stoppage', () => {
  // Oct 5, 2026 (Mon) to Oct 10, 2026 (Sat): 6 working days (no holidays)
  const days1 = calculateWorkingDays(new Date(2026, 9, 5), new Date(2026, 9, 10));
  assert.equal(days1, 6);

  // Oct 5 to Oct 11 (Sun): Sunday excluded -> still 6
  const days2 = calculateWorkingDays(new Date(2026, 9, 5), new Date(2026, 9, 11));
  assert.equal(days2, 6);

  // Stoppage Dec 20 to Jan 3 -> 0 working days
  const daysStop = calculateWorkingDays(new Date(2026, 11, 20), new Date(2027, 0, 3));
  assert.equal(daysStop, 0);
});

test('calculateFloorProgress weights scopes accurately by working days', () => {
  const dummyScopes: ScopeItem[] = [
    {
      id: '1',
      floor: 'GF',
      phase: 'Structural',
      name: 'Scope A',
      dateText: 'Oct 5–6, 2026',
      workingDays: 2,
      percentComplete: 100,
      sortOrder: 1,
    },
    {
      id: '2',
      floor: 'GF',
      phase: 'Structural',
      name: 'Scope B',
      dateText: 'Oct 7–10, 2026',
      workingDays: 4,
      percentComplete: 50,
      sortOrder: 2,
    },
  ];

  // (2*100 + 4*50) / 6 = (200 + 200)/6 = 400/6 = 67%
  const prog = calculateFloorProgress(dummyScopes, 'GF');
  assert.equal(prog, 67);
});

test('calculateMilestonesCompletion scores Complete as 100% and In progress as 50%', () => {
  const dummyMilestones: Milestone[] = [
    { id: 'm1', index: 0, dateText: 'Oct 5', label: 'Start', status: 'Complete' },
    { id: 'm2', index: 1, dateText: 'Nov 28', label: 'Check', status: 'In progress' },
    { id: 'm3', index: 2, dateText: 'Dec 18', label: 'Slab', status: 'Upcoming' },
    { id: 'm4', index: 3, dateText: 'Apr 30', label: 'Turnover', status: 'Upcoming' },
  ];

  // (1 + 0.5 + 0 + 0) / 4 = 1.5 / 4 = 37.5 -> 38%
  const score = calculateMilestonesCompletion(dummyMilestones);
  assert.equal(score, 38);
});

test('calculateConcreteCompletion and isPourOverdue work as expected', () => {
  const pours: ConcretePour[] = [
    {
      id: 'p1',
      floor: 'GF',
      component: 'Footings',
      activity: 'Footing concrete',
      targetPour: '2026-10-19',
      actualPour: '2026-10-19',
      targetCompletion: '2026-10-20',
      actualCompletion: '2026-10-20',
      prepStatus: 'Completed',
      pourStatus: 'Completed',
      cureStatus: 'Completed',
      inspStatus: 'Approved',
      milestoneStatus: 'Completed / Approved',
      remarks: '',
    },
    {
      id: 'p2',
      floor: 'GF',
      component: 'Tie beams',
      activity: 'Tie beam concrete',
      targetPour: '2026-11-03',
      actualPour: '',
      targetCompletion: '2026-11-06',
      actualCompletion: '',
      prepStatus: 'Ongoing',
      pourStatus: 'Scheduled',
      cureStatus: 'Not started',
      inspStatus: 'Pending',
      milestoneStatus: 'Scheduled for Pouring',
      remarks: '',
    },
  ];

  const stat = calculateConcreteCompletion(pours, 'GF');
  assert.equal(stat.total, 2);
  assert.equal(stat.completed, 1);
  assert.equal(stat.percent, 50);

  // Test overdue when targetPour has passed and actual pour is missing
  const todayPast = new Date(2026, 10, 10);
  assert.equal(isPourOverdue(pours[1], todayPast), true);
  assert.equal(isPourOverdue(pours[0], todayPast), false); // already approved
});

test('recalculateScopeTimeline adjusts working days and timeline positions accordingly', () => {
  const dummyScope: ScopeItem = {
    id: 'sc_gf_s_6',
    floor: 'GF',
    phase: 'Structural',
    name: 'Tie beam reinforcement & formworks',
    dateText: 'November 3-10, 2026',
    workingDays: 4,
    percentComplete: 80,
    sortOrder: 6,
  };

  const updated = recalculateScopeTimeline(dummyScope, 'November 3-10, 2026');
  assert.equal(updated.dateText, 'November 3-10, 2026');
  assert.equal(updated.workingDays, 7); // Mon-Sat, Sunday excluded -> 7 days
  assert.equal(updated.leftPct, 26.85); // 29 days from Oct 5 / 108 = 26.85%
  assert.equal(updated.widthPct, 7.41); // 8 calendar days / 108 = 7.41%

  // Single day pour/scope
  const singleDay = recalculateScopeTimeline(dummyScope, 'November 16, 2026');
  assert.equal(singleDay.workingDays, 1);
  assert.equal(singleDay.leftPct, 38.89);
  assert.equal(singleDay.widthPct, 0.93);
});

