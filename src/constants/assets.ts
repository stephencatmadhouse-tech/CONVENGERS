/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import logoUrl from '../assets/images/convengers_emblem_1794278755119.jpg';

export const LOGO_SVG = logoUrl;

/**
 * Status colours. Values are CSS variables defined in src/theme.css so the
 * light theme (default) and the optional dark theme share one source.
 * Light: green = completed, purple = in progress, yellow = attention,
 * red = delayed, gray = pending / not started.
 */
export const STATUS_COLORS: Record<string, [string, string, string]> = {
  'Upcoming': ['var(--st-upcoming-bg)', 'var(--st-upcoming-fg)', 'var(--st-upcoming-bd)'],
  'In progress': ['var(--st-in-progress-bg)', 'var(--st-in-progress-fg)', 'var(--st-in-progress-bd)'],
  'Ongoing': ['var(--st-ongoing-bg)', 'var(--st-ongoing-fg)', 'var(--st-ongoing-bd)'],
  'Complete': ['var(--st-complete-bg)', 'var(--st-complete-fg)', 'var(--st-complete-bd)'],
  'Completed': ['var(--st-completed-bg)', 'var(--st-completed-fg)', 'var(--st-completed-bd)'],
  'Delayed': ['var(--st-delayed-bg)', 'var(--st-delayed-fg)', 'var(--st-delayed-bd)'],
  'Date passed · confirm': ['var(--st-date-passed-confirm-bg)', 'var(--st-date-passed-confirm-fg)', 'var(--st-date-passed-confirm-bd)'],
  'On Hold': ['var(--st-on-hold-bg)', 'var(--st-on-hold-fg)', 'var(--st-on-hold-bd)'],
  'Not started': ['var(--st-not-started-bg)', 'var(--st-not-started-fg)', 'var(--st-not-started-bd)'],
  'On-track': ['var(--st-on-track-bg)', 'var(--st-on-track-fg)', 'var(--st-on-track-bd)'],
  'Planned': ['var(--st-planned-bg)', 'var(--st-planned-fg)', 'var(--st-planned-bd)'],
  'For Confirmation': ['var(--st-for-confirmation-bg)', 'var(--st-for-confirmation-fg)', 'var(--st-for-confirmation-bd)'],
  'Scheduled': ['var(--st-scheduled-bg)', 'var(--st-scheduled-fg)', 'var(--st-scheduled-bd)'],
  'Rescheduled': ['var(--st-rescheduled-bg)', 'var(--st-rescheduled-fg)', 'var(--st-rescheduled-bd)'],
  'Not Yet Started': ['var(--st-not-yet-started-bg)', 'var(--st-not-yet-started-fg)', 'var(--st-not-yet-started-bd)'],
  'Preparation Ongoing': ['var(--st-preparation-ongoing-bg)', 'var(--st-preparation-ongoing-fg)', 'var(--st-preparation-ongoing-bd)'],
  'Ready for Pouring': ['var(--st-ready-for-pouring-bg)', 'var(--st-ready-for-pouring-fg)', 'var(--st-ready-for-pouring-bd)'],
  'Scheduled for Pouring': ['var(--st-scheduled-for-pouring-bg)', 'var(--st-scheduled-for-pouring-fg)', 'var(--st-scheduled-for-pouring-bd)'],
  'Pouring Ongoing': ['var(--st-pouring-ongoing-bg)', 'var(--st-pouring-ongoing-fg)', 'var(--st-pouring-ongoing-bd)'],
  'Pouring Completed': ['var(--st-pouring-completed-bg)', 'var(--st-pouring-completed-fg)', 'var(--st-pouring-completed-bd)'],
  'Curing Ongoing': ['var(--st-curing-ongoing-bg)', 'var(--st-curing-ongoing-fg)', 'var(--st-curing-ongoing-bd)'],
  'Completed / Approved': ['var(--st-completed-approved-bg)', 'var(--st-completed-approved-fg)', 'var(--st-completed-approved-bd)'],
};

export const TYPE_COLORS: Record<string, { label: string; color: string }> = {
  construction: { label: 'Construction', color: '#3A9BFF' },
  production: { label: 'Production', color: '#FF5D8F' },
  milestone: { label: 'Milestone', color: '#F5C518' },
  structural: { label: 'Concrete', color: '#FF9A1F' },
  manual: { label: 'Other', color: '#B58CFF' },
};
