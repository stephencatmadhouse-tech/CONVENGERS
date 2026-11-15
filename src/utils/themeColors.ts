/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Display-only colour mapping for hard-coded category colours that are
 * combined in code (e.g. `${color}22`) and therefore cannot be CSS variables.
 * Light theme: official Convengers palette. Dark theme: original colours.
 * Data is never changed — this only affects how a colour is drawn.
 */

const LIGHT_MAP: Record<string, string> = {
  '#3A9BFF': '#1F6FE0', // construction / structural
  '#FF9A1F': '#FF9A1F', // finishing / concrete
  '#F5C518': '#F5C518', // highlight
  '#FF5D8F': '#7B4DFF', // production
  '#B58CFF': '#0A1140', // other
};

/** Text drawn in a category colour on a light tint: bright brand colours get a darker shade that stays readable. */
const LIGHT_TEXT_MAP: Record<string, string> = {
  '#F5C518': '#8A6400',
  '#FF9A1F': '#B45309',
  '#4BE08A': '#117A42',
};
export function themedText(hex: string): string {
  const c = themed(hex);
  if (isDarkTheme()) return c;
  return LIGHT_TEXT_MAP[(c || '').toUpperCase()] || c;
}

export function isDarkTheme(): boolean {
  return typeof document !== 'undefined' && document.documentElement.getAttribute('data-eff') === 'dark';
}

export function themed(hex: string): string {
  if (isDarkTheme()) return hex;
  return LIGHT_MAP[(hex || '').toUpperCase()] || hex;
}
