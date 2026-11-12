/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import logoUrl from '../assets/images/convengers_emblem_1794278755119.jpg';

export const LOGO_SVG = logoUrl;

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
