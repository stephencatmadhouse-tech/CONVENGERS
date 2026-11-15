/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Guard for AI-reworded narrative sections (used by the server and the app).
 *
 * The AI may only improve the wording of a factual section. A reworded section
 * is rejected, and the factual text kept, when it:
 *   - contains a number (quantity, date, percentage, headcount) not in the factual text;
 *   - uses a number word ("three crews") the factual text did not use;
 *   - introduces a capitalised name or term (activity, supplier, person, place) not in the factual text;
 *   - drops "Not Recorded" where the factual text says it;
 *   - is empty, or far longer than the factual text (added content).
 */

export function numberTokens(text: string): Set<string> {
  const out = new Set<string>();
  (text.match(/\d+(?:[.,]\d+)*/g) || []).forEach((n) => out.add(n.replace(/,/g, '').replace(/\.0+$/, '')));
  return out;
}

/** True when `candidate` introduces no number that is absent from `source`. */
export function addsNoNumbers(source: string, candidate: string): { ok: boolean; added: string[] } {
  const src = numberTokens(source);
  const added = [...numberTokens(candidate)].filter((n) => !src.has(n));
  return { ok: added.length === 0, added };
}

const WORDS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'twenty', 'thirty', 'forty', 'fifty', 'dozen', 'dozens', 'hundred', 'hundreds', 'thousand', 'half', 'quarter', 'single', 'double', 'twice', 'several', 'numerous'];
const re = (w: string) => new RegExp(`\\b${w}\\b`, 'i');

/** Rejects number words (e.g. "three crews", "several workers") unless the factual text used the same word. */
export function addsNoNumberWords(source: string, candidate: string): boolean {
  return WORDS.every((w) => !re(w).test(candidate) || re(w).test(source));
}

// Capitalised words a formal rewrite may legitimately add
const ALLOWED_CAPS = new Set(
  'The This These That Those During In On At As For From With Within Over Under After Before Overall Work Works Construction Activities Activity Progress Project Site Daily Weekly Monthly Report Reports Executive Summary Manpower Resources Equipment Materials Issues Concerns Corrective Actions Action Next Period Plan Photo Photographs Documentation Conclusion It Its A An No Accordingly Furthermore Additionally Moreover However Meanwhile Also Both Each All Of To And Further Similarly Consequently Therefore Thus Notably Planned Actual Status Not Recorded Master Tracker Calendar Construction Daily Reports'.split(
    ' '
  )
);
const capsIn = (t: string) => new Set((t.match(/\b[A-Z][A-Za-z'’-]+\b/g) || []).filter((w) => !ALLOWED_CAPS.has(w)));

export function addsNoNames(source: string, candidate: string): { ok: boolean; added: string[] } {
  const src = new Set((source.match(/\b[A-Za-z][A-Za-z'’-]+\b/g) || []).map((w) => w.toLowerCase()));
  // A month or weekday written in full is allowed when the factual text has its short form (e.g. "Nov" → "November")
  const known = (w: string) => src.has(w.toLowerCase()) || (/^(january|february|march|april|may|june|july|august|september|october|november|december|monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/i.test(w) && src.has(w.slice(0, 3).toLowerCase()));
  const added = [...capsIn(candidate)].filter((w) => !known(w));
  return { ok: added.length === 0, added };
}

export function checkAiSection(source: string, candidate: string): { ok: boolean; reason?: string } {
  const c = (candidate || '').trim();
  if (!c) return { ok: false, reason: 'empty' };
  if (c.length > Math.max(400, source.length * 1.6)) return { ok: false, reason: 'adds content' };
  const n = addsNoNumbers(source, c);
  if (!n.ok) return { ok: false, reason: `adds figures: ${n.added.slice(0, 5).join(', ')}` };
  if (!addsNoNumberWords(source, c)) return { ok: false, reason: 'adds quantity words' };
  const nm = addsNoNames(source, c);
  if (!nm.ok) return { ok: false, reason: `adds names or terms: ${nm.added.slice(0, 5).join(', ')}` };
  if (/not recorded/i.test(source) && !/not recorded/i.test(c)) return { ok: false, reason: 'drops "Not Recorded"' };
  return { ok: true };
}
