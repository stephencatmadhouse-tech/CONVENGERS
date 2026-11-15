/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/** "1 day", "3 days", "1 activity", "2 activities" — no "(s)" placeholders in the interface. */
export function plural(n: number, one: string, many?: string): string {
  const other = many ?? (/[^aeiou]y$/.test(one) ? `${one.slice(0, -1)}ies` : /(s|x|ch|sh)$/.test(one) ? `${one}es` : `${one}s`);
  return `${n.toLocaleString('en-US')} ${n === 1 ? one : other}`;
}
