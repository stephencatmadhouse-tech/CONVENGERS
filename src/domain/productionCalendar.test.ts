/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { categoryOf, statusOf, changeEntry, portalEventRecord, isPublishable, clientEvents, upcomingEvents, recentUpdates, monthGrid, fmtTime12, type PortalEventContent } from './productionCalendar.ts';
import type { CalendarEvent } from '../types/index.ts';
import type { PortalSnapshot } from './portal.ts';

const ev = (o: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: 'EV-1', date: '2026-12-01', type: 'Other', title: 'Drone footage of the roof deck', done: false,
  createdAt: '2026-11-20T00:00:00Z', createdBy: 'M', updatedAt: '2026-11-20T00:00:00Z', updatedBy: 'M',
  category: 'photo', subcategory: 'Drone footage', description: 'Aerial shots', time: '09:00', endTime: '11:00',
  location: 'Site', personnel: ['Juan Dela Cruz'], department: 'Photography & Video', notes: 'Internal: pilot license on file',
  status: 'Confirmed', visibility: 'stakeholder', approval: 'approved', photos: [{ fileId: 'F1', caption: 'Test shot' }],
  attachments: [{ fileId: 'D1', title: 'Flight plan' }, { title: 'External link', url: 'https://example.com/x' }], ...o,
});

test('production calendar: older calendar entries map to categories and statuses', () => {
  assert.equal(categoryOf({ type: 'Meeting' }), 'meeting');
  assert.equal(categoryOf({ type: 'Handover / turnover' }), 'milestone');
  assert.equal(categoryOf({ type: 'Inspection' }), 'construction');
  assert.equal(statusOf({ done: true }), 'Completed');
  assert.equal(statusOf({ done: false }), 'Scheduled');
});

test('production calendar: schedule modifications are recorded with previous and new dates', () => {
  const a = ev();
  assert.equal(changeEntry(a, { ...a, title: 'New title' }, 'M'), null, 'no schedule change');
  const c = changeEntry(a, { ...a, date: '2026-12-03', endDate: '2026-12-03' }, 'Admin')!;
  assert.equal(c.action, 'Rescheduled');
  assert.equal(c.from!.date, '2026-12-01');
  assert.equal(c.to!.date, '2026-12-03');
  assert.equal(c.by, 'Admin');
  assert.equal(changeEntry(a, { ...a, status: 'Postponed' }, 'M')!.action, 'Status: Postponed');
  assert.equal(changeEntry(undefined, { ...a, approval: 'proposed' }, 'P')!.action, 'Proposed');
});

test('production calendar: the client copy has no personnel names, notes or internal files; changes are flagged', () => {
  const r = portalEventRecord(ev(), 'Admin');
  const json = JSON.stringify(r);
  assert.equal(r.kind, 'event');
  assert.ok(!json.includes('Juan Dela Cruz') && !json.includes('pilot license'), 'nothing internal');
  const c = r.content as PortalEventContent;
  assert.equal(c.update!.kind, 'Added');
  assert.deepEqual(c.attachments, [{ title: 'Flight plan', url: '/api/drive/file/D1' }], 'only Drive files (published with the event)');
  const moved = portalEventRecord(ev({ date: '2026-12-04' }), 'Admin', c).content as PortalEventContent;
  assert.equal(moved.update!.kind, 'Rescheduled');
  assert.equal(moved.update!.previous!.start, '2026-12-01');
  assert.equal((portalEventRecord(ev({ status: 'Postponed' }), 'A', c).content as PortalEventContent).update!.kind, 'Postponed');
  assert.equal((portalEventRecord(ev({ status: 'Cancelled' }), 'A', c).content as PortalEventContent).update!.kind, 'Cancelled');
  assert.equal(isPublishable(ev({ visibility: 'internal' })), false);
  assert.equal(isPublishable(ev({ approval: 'proposed' })), false);
});

test('production calendar: client list = published events + schedule from the latest status update, without duplicates', () => {
  const pub = portalEventRecord(ev(), 'A');
  const snap = {
    milestones: [{ label: 'Roof deck pour', target: '2026-12-10', targetText: '', status: 'Upcoming', progress: 0, commitment: 'Target', revised: false }],
    activities: [
      { name: 'Drone footage of the roof deck', phase: '', category: 'Photography', start: '2026-12-01', finish: '2026-12-01', status: 'Upcoming', progress: 0, commitment: '' },
      { name: '2F slab formworks', phase: '2F', category: 'Structural works', start: '2026-11-28', finish: '2026-12-05', status: 'In Progress', progress: 40, commitment: '' },
    ],
  } as unknown as PortalSnapshot;
  const list = clientEvents([pub], snap);
  assert.deepEqual(list.map((e) => e.title), ['2F slab formworks', 'Drone footage of the roof deck', 'Roof deck pour']);
  assert.equal(list.find((e) => e.title === '2F slab formworks')!.status, 'Ongoing');
  const up = upcomingEvents(list, '2026-12-01');
  assert.equal(up[0].when, 'today');
  assert.equal(up.find((e) => e.category === 'milestone')!.countdown, 9);
  assert.equal(recentUpdates(list, '2026-12-01').length, 1);
});

test('production calendar: helpers', () => {
  const g = monthGrid('2026-12-15');
  assert.equal(g[0][0], '2026-11-30');
  assert.equal(g[g.length - 1][6], '2027-01-03');
  assert.equal(fmtTime12('13:05'), '1:05 PM');
  assert.equal(fmtTime12('00:30'), '12:30 AM');
});
