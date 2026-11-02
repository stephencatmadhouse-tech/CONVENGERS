/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const LOGO_SVG = `data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A//www.w3.org/2000/svg%27%20viewBox%3D%270%200%20180%20150%27%3E%3Cdefs%3E%3ClinearGradient%20id%3D%27g%27%20x1%3D%270%27%20y1%3D%270%27%20x2%3D%271%27%20y2%3D%271%27%3E%3Cstop%20offset%3D%270%25%27%20stop-color%3D%27%237B4DFF%27/%3E%3Cstop%20offset%3D%27100%25%27%20stop-color%3D%27%23121C5A%27/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect%20width%3D%27180%27%20height%3D%27150%27%20fill%3D%27url(%23g)%27/%3E%3Cpolygon%20points%3D%2720,130%2090,25%20160,130%27%20fill%3D%27none%27%20stroke%3D%27%23F5C518%27%20stroke-width%3D%2710%27%20stroke-linejoin%3D%27round%27/%3E%3Cpath%20d%3D%27M60,120%20L90,65%20L120,120%20Z%27%20fill%3D%27%23F5C518%27/%3E%3Ctext%20x%3D%2790%27%20y%3D%27142%27%20font-family%3D%27Barlow%20Condensed,sans-serif%27%20font-size%3D%2713%27%20font-weight%3D%27800%27%20letter-spacing%3D%272%27%20fill%3D%27%23BAC4E2%27%20text-anchor%3D%27middle%27%3ECONVENGERS%3C/text%3E%3C/svg%3E`;

export const STATUS_COLORS: Record<string, [string, string, string]> = {
  'Upcoming': ['rgba(255,255,255,.12)', '#DCE3F7', 'rgba(255,255,255,.3)'],
  'In progress': ['#1F6FE0', '#FFFFFF', '#1F6FE0'],
  'Ongoing': ['#1F6FE0', '#FFFFFF', '#1F6FE0'],
  'Complete': ['#4BE08A', '#060A24', '#4BE08A'],
  'Completed': ['#4BE08A', '#060A24', '#4BE08A'],
  'Delayed': ['#E0213B', '#FFFFFF', '#E0213B'],
  'Date passed · confirm': ['#FF9A1F', '#060A24', '#FF9A1F'],
  'On Hold': ['#8A8FA8', '#060A24', '#8A8FA8'],
  'Not started': ['rgba(255,255,255,.16)', '#DCE3F7', '#F5C518'],
  'On-track': ['#1F6FE0', '#FFFFFF', '#F5C518'],
  'Planned': ['#5B6BB5', '#FFFFFF', '#5B6BB5'],
  'For Confirmation': ['#F5C518', '#060A24', '#F5C518'],
  'Scheduled': ['#1F6FE0', '#FFFFFF', '#1F6FE0'],
  'Rescheduled': ['#B58CFF', '#060A24', '#B58CFF'],
  'Not Yet Started': ['#5B6BB5', '#FFFFFF', '#5B6BB5'],
  'Preparation Ongoing': ['#B58CFF', '#060A24', '#B58CFF'],
  'Ready for Pouring': ['#F5C518', '#060A24', '#F5C518'],
  'Scheduled for Pouring': ['#1F6FE0', '#FFFFFF', '#1F6FE0'],
  'Pouring Ongoing': ['#FF9A1F', '#060A24', '#FF9A1F'],
  'Pouring Completed': ['#3AC9C9', '#060A24', '#3AC9C9'],
  'Curing Ongoing': ['#6FA8FF', '#060A24', '#6FA8FF'],
  'Completed / Approved': ['#4BE08A', '#060A24', '#4BE08A'],
};

export const TYPE_COLORS: Record<string, { label: string; color: string }> = {
  construction: { label: 'Construction', color: '#3A9BFF' },
  production: { label: 'Production', color: '#FF5D8F' },
  milestone: { label: 'Milestone', color: '#F5C518' },
  structural: { label: 'Concrete', color: '#FF9A1F' },
  manual: { label: 'Other', color: '#B58CFF' },
};
