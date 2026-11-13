/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Consistent date handling for the Command Center. All register dates are
 * stored and compared as local-calendar ISO strings (YYYY-MM-DD) so that
 * timezone offsets can never shift an activity by a day.
 */

import { parseIsoDate, toIsoDate, calculateWorkingDays } from '../utils/calculations.ts';

export { parseIsoDate, toIsoDate, calculateWorkingDays };

export const DAY_MS = 86400000;

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Project time zone: every "today", due-date and calendar comparison uses Manila time. */
export const PROJECT_TZ = 'Asia/Manila';

/** Calendar date (YYYY-MM-DD) of an instant in Asia/Manila, regardless of the device's time zone. */
export function manilaIso(at: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: PROJECT_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(at);
    const get = (t: string) => parts.find((p) => p.type === t)?.value || '';
    const iso = `${get('year')}-${get('month')}-${get('day')}`;
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  } catch {
    // Intl time-zone data unavailable — fall back to the device calendar date
  }
  return toIsoDate(startOfDay(at));
}

/** Today's date in Asia/Manila. */
export function todayIso(now: Date = new Date()): string {
  return manilaIso(now);
}

/** Date part (Manila) of an ISO timestamp such as `2026-11-13T02:15:00.000Z`. */
export function isoDateOf(ts?: string): string | undefined {
  if (!ts) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(ts)) return ts;
  const d = new Date(ts);
  return isNaN(d.getTime()) ? undefined : manilaIso(d);
}

/** Whole calendar days from a to b (alias of diffDays, positive when b is later). */
export function daysBetween(aIso: string, bIso: string): number {
  return diffDays(aIso, bIso);
}

export function addDays(iso: string, days: number): string {
  const d = parseIsoDate(iso);
  if (!d) return iso;
  d.setDate(d.getDate() + days);
  return toIsoDate(d);
}

/** Calendar-day difference b − a (positive when b is later). */
export function diffDays(aIso: string, bIso: string): number {
  const a = parseIsoDate(aIso);
  const b = parseIsoDate(bIso);
  if (!a || !b) return 0;
  return Math.round((b.getTime() - a.getTime()) / DAY_MS);
}

export function isValidIso(s: string | undefined | null): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !!parseIsoDate(s);
}

export function minIso(...vals: Array<string | undefined>): string | undefined {
  const v = vals.filter(isValidIso).sort();
  return v[0];
}

export function maxIso(...vals: Array<string | undefined>): string | undefined {
  const v = vals.filter(isValidIso).sort();
  return v[v.length - 1];
}

/** Monday-based week containing the given date. */
export function weekRange(iso: string): { start: string; end: string } {
  const d = parseIsoDate(iso) || startOfDay(new Date());
  const dow = d.getDay(); // 0 = Sun
  const offset = dow === 0 ? -6 : 1 - dow;
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate() + offset);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
  return { start: toIsoDate(start), end: toIsoDate(end) };
}

export function monthRange(iso: string): { start: string; end: string; key: string } {
  const d = parseIsoDate(iso) || startOfDay(new Date());
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return {
    start: toIsoDate(start),
    end: toIsoDate(end),
    key: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`,
  };
}

export function overlaps(aStart?: string, aEnd?: string, bStart?: string, bEnd?: string): boolean {
  if (!isValidIso(aStart) || !isValidIso(bStart)) return false;
  const ae = isValidIso(aEnd) ? aEnd : aStart;
  const be = isValidIso(bEnd) ? bEnd : bStart;
  return aStart <= be && bStart <= ae;
}

export function workingDaysBetween(startIso?: string, endIso?: string): number {
  const s = parseIsoDate(startIso);
  const e = parseIsoDate(endIso || startIso);
  if (!s || !e) return 0;
  return calculateWorkingDays(s, e);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function fmtDate(iso?: string, withYear = true): string {
  const d = parseIsoDate(iso);
  if (!d) return '—';
  return `${MONTHS[d.getMonth()]} ${d.getDate()}${withYear ? `, ${d.getFullYear()}` : ''}`;
}

export function fmtRange(startIso?: string, endIso?: string): string {
  const s = parseIsoDate(startIso);
  const e = parseIsoDate(endIso);
  if (!s) return '—';
  if (!e || startIso === endIso) return fmtDate(startIso);
  if (s.getFullYear() === e.getFullYear()) {
    if (s.getMonth() === e.getMonth()) {
      return `${MONTHS[s.getMonth()]} ${s.getDate()}–${e.getDate()}, ${s.getFullYear()}`;
    }
    return `${MONTHS[s.getMonth()]} ${s.getDate()} – ${MONTHS[e.getMonth()]} ${e.getDate()}, ${s.getFullYear()}`;
  }
  return `${fmtDate(startIso)} – ${fmtDate(endIso)}`;
}

/** Text form used by scope `dateText` fields so the existing slides keep parsing it. */
export function toScopeDateText(startIso: string, endIso: string): string {
  return fmtRange(startIso, endIso);
}

export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  const names = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${names[(m || 1) - 1]} ${y}`;
}
