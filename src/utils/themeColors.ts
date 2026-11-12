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
  '#3A9BFF': '#7026C8', // construction / structural
  '#FF9A1F': '#A34FEA', // finishing / concrete
  '#F5C518': '#C7C7D0', // highlight
  '#FF5D8F': '#C02AE0', // production
  '#B58CFF': '#A34FEA', // other
};

export function isDarkTheme(): boolean {
  return typeof document !== 'undefined' && document.documentElement.getAttribute('data-eff') === 'dark';
}

export function themed(hex: string): string {
  if (isDarkTheme()) return hex;
  return LIGHT_MAP[(hex || '').toUpperCase()] || hex;
}
