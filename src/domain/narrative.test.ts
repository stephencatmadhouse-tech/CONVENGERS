/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Narrative report generator: facts only, "Not Recorded" for gaps, AI guard.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_SCOPES, INITIAL_MILESTONES, INITIAL_CONCRETE_POURS, INITIAL_EPISODES, INITIAL_OVERRIDES, INITIAL_CHARACTERS } from '../db/seedData.ts';
import { buildRegister } from './register.ts';
import { collectFacts, composeSections, defaultPeriod, narrativeId, addsNoNumbers, addsNoNumberWords, duePeriods, upcomingPreparations, figures, type NarrativeSources } from './narrative.ts';
import type { DailyReport } from '../types/index.ts';

const TODAY = '2026-11-12';
const reg = buildRegister(
  { scopes: INITIAL_SCOPES, milestones: INITIAL_MILESTONES, pours: INITIAL_CONCRETE_POURS, episodes: INITIAL_EPISODES, activities: [], overrides: INITIAL_OVERRIDES, characters: INITIAL_CHARACTERS },
  TODAY
);

const dcr = (over: Partial<DailyReport>): DailyReport => ({
  id: 'r1',
  reference: 'DCR-20261110-AAAA',
  projectId: 'p',
  projectName: 'Bahay Build',
  date: '2026-11-10',
  weather: 'Sunny',
  siteLocation: '',
  preparedBy: 'Site Engineer',
  preparedById: 'u1',
  createdAt: '',
  updatedAt: '',
  updatedBy: '',
  status: 'submitted',
  activities: [{ activityId: reg[0].id, category: 'Structural', name: 'Column rebar', workDescription: 'Tied column bars at grid A', accomplishment: '14 columns', progress: 60, workStatus: 'In progress', remarks: '' }],
  manpower: { skilled: 6, general: 9, subcontractor: 0, other: 1 },
  materials: [{ description: 'Deformed bars 16mm', quantity: '120', unit: 'pcs', deliveryDate: '2026-11-10', supplier: 'Steel Depot', remarks: '' }],
  equipment: [],
  site: { observations: '', issues: 'Late delivery of form plywood', delays: '', safety: '', corrective: 'Supplier asked to deliver by Nov 12', recommendations: '' },
  photos: [{ fileId: 'ph1', fileName: 'a.jpg', photoType: 'Progress', activityId: reg[0].id, description: 'Grid A columns', uploadStatus: 'uploaded' }],
  history: [],
  ...over,
});

const base = (reports: DailyReport[]): NarrativeSources => ({
  register: reg,
  milestones: INITIAL_MILESTONES,
  issues: [],
  snapshots: [],
  dailyReports: reports,
  manpower: [],
  procurement: [],
  events: [],
  driveFiles: [],
  documents: [],
  narratives: [],
  today: TODAY,
});

test('narrative: daily report content comes from the submitted record only', () => {
  const r = dcr({});
  const facts = collectFacts({ type: 'daily', start: '2026-11-10', end: '2026-11-10' }, base([r, dcr({ id: 'r2', reference: 'DCR-DRAFT', status: 'draft', manpower: { skilled: 99, general: 0, subcontractor: 0, other: 0 } })]));
  assert.equal(facts.reports.length, 1, 'drafts are not used');
  const text = composeSections(facts).map((s) => s.text).join('\n');
  assert.match(text, /Tied column bars at grid A/);
  assert.match(text, /Manpower recorded on Nov(ember)? 10, 2026: 16 workers \(skilled 6, general 9, subcontractor 0, other 1\)/);
  assert.match(text, /Deformed bars 16mm, 120 pcs from Steel Depot/);
  assert.match(text, /Late delivery of form plywood/);
  assert.match(text, /Supplier asked to deliver by Nov 12/);
  assert.doesNotMatch(text, /99/, 'draft figures never appear');
  assert.match(text, /Equipment: Not Recorded/);
  assert.equal(facts.photos.length, 1);
  assert.equal(facts.photos[0].caption, 'Progress — Grid A columns');
});

test('narrative: no records → "Not Recorded", no invented figures', () => {
  const facts = collectFacts({ type: 'daily', start: '2026-11-08', end: '2026-11-08' }, base([]));
  const s = composeSections(facts);
  const by = Object.fromEntries(s.map((x) => [x.key, x.text]));
  assert.match(by.resources, /Manpower on site: Not Recorded/);
  assert.match(by.photos, /Not Recorded/);
  assert.match(by.summary, /No Daily Construction Reports were submitted/);
  assert.equal(figures(facts).manDays, null);
  assert.equal(s.length, 10);
});

test('narrative: empty report fields are "not recorded" — never zero workers or invented work', () => {
  const blank = dcr({ id: 'r3', reference: 'DCR-20261110-BBBB', activities: [], manpower: { skilled: 0, general: 0, subcontractor: 0, other: 0 }, photos: [] });
  const facts = collectFacts({ type: 'daily', start: '2026-11-10', end: '2026-11-10' }, base([dcr({}), blank]));
  const text = composeSections(facts).map((s) => s.text).join('\n');
  assert.match(text, /DCR-20261110-BBBB, weather: sunny\), no construction activity was recorded in the report/);
  assert.match(text, /Manpower was not recorded in DCR-20261110-BBBB/);
  assert.match(text, /16 workers/, 'blank report adds nothing to the headcount');
  assert.doesNotMatch(text, /general site activities/);
  assert.ok(!facts.ongoing.some((r) => r.kind === 'episode'), 'production shoots are not construction activities');
  assert.ok(!facts.next.activities.some((r) => r.kind === 'episode'));
});

test('narrative: photos are never described as accomplishments', () => {
  const facts = collectFacts({ type: 'daily', start: '2026-11-10', end: '2026-11-10' }, base([dcr({})]));
  const photosText = composeSections(facts).find((x) => x.key === 'photos')!.text;
  assert.match(photosText, /accomplishments are stated only from the reports and the tracker/);
});

test('narrative: periods, ids and schedule', () => {
  assert.deepEqual(defaultPeriod('weekly', '2026-11-12', reg), { start: '2026-11-09', end: '2026-11-15' });
  assert.deepEqual(defaultPeriod('monthly', '2026-11-12', reg), { start: '2026-11-01', end: '2026-11-30' });
  assert.equal(narrativeId('weekly', '2026-11-09', '2026-11-15'), 'NR-W-20261109-20261115');
  const due = duePeriods({ daily: true, weekly: true, monthly: true }, '2026-11-12');
  assert.deepEqual(due, [
    { type: 'daily', start: '2026-11-11', end: '2026-11-11' },
    { type: 'weekly', start: '2026-11-02', end: '2026-11-08' },
    { type: 'monthly', start: '2026-10-01', end: '2026-10-31' },
  ]);
  const up = upcomingPreparations({ daily: false, weekly: true, monthly: true }, '2026-11-12', 20);
  assert.deepEqual(
    up.map((u) => `${u.type}:${u.date}`),
    ['weekly:2026-11-16', 'weekly:2026-11-23', 'weekly:2026-11-30', 'monthly:2026-12-01']
  );
});

test('narrative: AI guard rejects added numbers and number words', () => {
  const src = 'Manpower totalled 16 man-days; progress reached 42.5%.';
  assert.equal(addsNoNumbers(src, 'A total of 16 man-days were recorded and progress stood at 42.5%.').ok, true);
  assert.deepEqual(addsNoNumbers(src, 'Some 18 workers were present.').added, ['18']);
  assert.equal(addsNoNumbers(src, 'Work completed on 2026-11-14.').ok, false);
  assert.equal(addsNoNumberWords(src, 'three crews worked'), false);
  assert.equal(addsNoNumberWords(src, 'crews worked'), true);
});

// ---------------------------------------------------------------- daily → weekly → monthly chain
import { summarizeDailyReports, workingDays } from './dailyCompliance.ts';
import { buildNotifications } from './notifications.ts';
import type { NarrativeReport } from './narrative.ts';

const RICH = { uid: 'u-richard', name: 'Engr. Richard' };

test('chain: working days and daily report coverage for the required reporter', () => {
  // Nov 9–15, 2026: Mon–Sat are working days, Sunday is not
  assert.deepEqual(workingDays('2026-11-09', '2026-11-15'), ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14']);
  const reps = [
    dcr({ id: 'a', reference: 'DCR-A', date: '2026-11-09', preparedById: 'u-richard' }),
    dcr({ id: 'b', reference: 'DCR-B', date: '2026-11-10', preparedById: 'u-other' }),
    dcr({ id: 'c', reference: 'DCR-C', date: '2026-11-11', preparedById: 'u-richard', status: 'draft' }),
  ];
  const s = summarizeDailyReports(reps, '2026-11-09', '2026-11-15', TODAY, RICH);
  assert.deepEqual(s.workDays, ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12'], 'only up to today');
  assert.deepEqual(s.reportedDays, ['2026-11-09'], 'another person and a draft do not count for the required reporter');
  assert.deepEqual(s.missingDays, ['2026-11-10', '2026-11-11', '2026-11-12']);
  assert.equal(s.unverified.length, 1);
  const any = summarizeDailyReports(reps, '2026-11-09', '2026-11-15', TODAY, null);
  assert.deepEqual(any.reportedDays, ['2026-11-09', '2026-11-10']);
});

test('chain: weekly narrative states coverage and lists the missing days', () => {
  const src = { ...base([dcr({ id: 'a', reference: 'DCR-A', date: '2026-11-09', preparedById: 'u-richard' })]), reporter: RICH };
  const facts = collectFacts({ type: 'weekly', start: '2026-11-09', end: '2026-11-15' }, src);
  const text = composeSections(facts).find((x) => x.key === 'summary')!.text;
  assert.match(text, /Daily Construction Reports from Engr\. Richard cover 1 of 4 working days up to November 12, 2026; no report was submitted for November 10, 2026; November 11, 2026; and November 12, 2026\./);
  assert.equal(figures(facts).workDays, 4);
  assert.equal(figures(facts).daysReported, 1);
});

test('chain: monthly report consolidates the weekly reports week by week', () => {
  const r1 = dcr({ id: 'a', reference: 'DCR-A', date: '2026-11-03' });
  const r2 = dcr({ id: 'b', reference: 'DCR-B', date: '2026-11-10' });
  const wFacts = collectFacts({ type: 'weekly', start: '2026-11-02', end: '2026-11-08' }, base([r1, r2]));
  const weekly = {
    id: 'NR-W-20261102-20261108',
    reference: 'NAR-W-20261102-20261108',
    type: 'weekly',
    periodStart: '2026-11-02',
    periodEnd: '2026-11-08',
    status: 'approved',
    sections: composeSections(wFacts),
    figures: figures(wFacts),
    updatedAt: '2026-11-09T01:00:00Z',
  } as unknown as NarrativeReport;
  const src = { ...base([r1, r2]), narratives: [weekly] };
  const facts = collectFacts({ type: 'monthly', start: '2026-11-01', end: '2026-11-30' }, src);
  assert.equal(facts.weeks.length, 6, 'Oct 26 – Dec 6: six Monday–Sunday weeks overlap November');
  assert.equal(facts.weeks.filter((w) => w.report).length, 1);
  const s = composeSections(facts);
  const c = s.find((x) => x.key === 'activities')!.text;
  assert.match(c, /Week of November 2–8, 2026 \(NAR-W-20261102-20261108, approved\): 1 Daily Construction Report recorded work on Column rebar; no activities were completed/);
  assert.match(c, /Approved weekly conclusion \(NAR-W-20261102-20261108\):/);
  assert.match(c, /Week of November 9–15, 2026: 1 Daily Construction Report recorded work on Column rebar; no Weekly Accomplishment Report has been prepared\./);
  assert.match(s.find((x) => x.key === 'summary')!.text, /consolidates 1 Weekly Accomplishment Report covering 1 of 6 weeks of the month \(1 approved\)/);
  // a change to the weekly report (or a daily report) changes the monthly source marker
  const before = facts.sourceStamp;
  const after = collectFacts({ type: 'monthly', start: '2026-11-01', end: '2026-11-30' }, { ...src, narratives: [{ ...weekly, updatedAt: '2026-11-10T00:00:00Z' }] }).sourceStamp;
  assert.notEqual(before, after);
  const afterDaily = collectFacts({ type: 'monthly', start: '2026-11-01', end: '2026-11-30' }, { ...src, dailyReports: [r1, { ...r2, status: 'approved' }] }).sourceStamp;
  assert.notEqual(before, afterDaily);
});

test('chain: missing daily report notification goes to the reporter and managers only', () => {
  const daily = [dcr({ id: 'a', reference: 'DCR-A', date: '2026-11-10', preparedById: 'u-richard' })];
  const rich = buildNotifications({ register: [], dailyReports: daily, dailyReporter: RICH, viewer: { name: 'Engr. Richard', email: 'r@example.com', role: 'engineer', id: 'u-richard' }, today: TODAY });
  const miss = rich.filter((n) => n.type === 'dailyReport').map((n) => n.date);
  assert.deepEqual(miss.sort(), ['2026-11-05', '2026-11-06', '2026-11-07', '2026-11-09', '2026-11-11']);
  const mgr = buildNotifications({ register: [], dailyReports: daily, dailyReporter: RICH, viewer: { name: 'M', email: 'm@example.com', role: 'manager', id: 'u-m' }, today: TODAY });
  assert.equal(mgr.filter((n) => n.type === 'dailyReport').length, 5);
  const other = buildNotifications({ register: [], dailyReports: daily, dailyReporter: RICH, viewer: { name: 'E', email: 'e@example.com', role: 'engineer', id: 'u-e' }, today: TODAY });
  assert.equal(other.filter((n) => n.type === 'dailyReport').length, 0);
});

test('chain: project non-working days (NCR special days Nov 16–18) are not counted as missing', () => {
  const src = { ...base([dcr({ id: 'a', reference: 'DCR-A', date: '2026-11-16', preparedById: 'u-richard' })]), reporter: RICH, today: '2026-11-17' };
  const facts = collectFacts({ type: 'weekly', start: '2026-11-16', end: '2026-11-22' }, src);
  assert.deepEqual(facts.compliance!.workDays, []);
  assert.equal(facts.reports.length, 1, 'a report filed on a non-working day is still used');
  assert.match(composeSections(facts)[0].text, /No working day of this period has passed up to November 17, 2026, so Daily Construction Report coverage for Engr\. Richard is not yet measured\./);
});

test('chain: changing the required reporter changes the source marker (drafts are rebuilt)', () => {
  const reps = [dcr({ id: 'a', reference: 'DCR-A', date: '2026-11-09', preparedById: 'u-richard' })];
  const a = collectFacts({ type: 'weekly', start: '2026-11-09', end: '2026-11-15' }, { ...base(reps), reporter: null }).sourceStamp;
  const b = collectFacts({ type: 'weekly', start: '2026-11-09', end: '2026-11-15' }, { ...base(reps), reporter: RICH }).sourceStamp;
  assert.notEqual(a, b);
});
