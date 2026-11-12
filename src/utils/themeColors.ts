/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Display-only colour mapping for hard-coded category colours that are
 * combined in code (e.g. `${color}22`) and therefore cannot be CSS variables.
 * Light theme: Convengers purple family. Dark theme: original colours.
 * Data is never changed — this only affects how a colour is drawn.
 */

const LIGHT_MAP: Record<string, string> = {
  '#3A9BFF': '#8746D6', // construction / structural
  '#FF9A1F': '#D58BEA', // finishing / concrete
  '#F5C518': '#D58BEA', // highlight
  '#FF5D8F': '#C455B8', // production
  '#B58CFF': '#A45BE8', // other
};

export function isDarkTheme(): boolean {
  return typeof document !== 'undefined' && document.documentElement.getAttribute('data-eff') === 'dark';
}

export function themed(hex: string): string {
  if (isDarkTheme()) return hex;
  return LIGHT_MAP[(hex || '').toUpperCase()] || hex;
}
