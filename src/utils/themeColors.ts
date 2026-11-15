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

export function isDarkTheme(): boolean {
  return typeof document !== 'undefined' && document.documentElement.getAttribute('data-eff') === 'dark';
}

export function themed(hex: string): string {
  if (isDarkTheme()) return hex;
  return LIGHT_MAP[(hex || '').toUpperCase()] || hex;
}
