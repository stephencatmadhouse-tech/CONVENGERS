/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Role model shared by routing and UI. These helpers decide WHICH INTERFACE
 * a user sees; they are NOT the security boundary. Access is enforced
 * server-side by firestore.rules / storage.rules (same role names), so an
 * external user cannot read internal collections even by calling the
 * database directly or editing the URL.
 */

import { User, UserRole } from '../types/index.ts';

export const INTERNAL_ROLES: UserRole[] = ['admin', 'director', 'manager', 'construction_manager', 'engineer', 'production', 'quality', 'staff', 'viewer'];
export const EXTERNAL_ROLES: UserRole[] = ['owner', 'executive', 'client', 'stakeholder'];

export const ROLE_LABEL: Record<UserRole, string> = {
  admin: 'System Administrator',
  director: 'Project Director',
  manager: 'Project Manager',
  construction_manager: 'Construction Manager',
  quality: 'Quality Personnel',
  engineer: 'Site Engineer',
  production: 'Production Coordinator',
  staff: 'Internal Team Member',
  viewer: 'Internal Viewer (read-only)',
  owner: 'Project Owner',
  executive: 'Executive',
  client: 'Client Representative',
  stakeholder: 'Authorized Stakeholder',
  pending: 'Pending approval',
};

export type Audience = 'guest' | 'pending' | 'internal' | 'external';

export function isSignedIn(u?: User | null): boolean {
  return !!u && !!u.id && u.id !== 'viewer_guest';
}

export function audienceOf(u?: User | null): Audience {
  if (!isSignedIn(u)) return 'guest';
  if (u!.status === 'revoked') return 'pending';
  if (u!.role === 'pending' || u!.status === 'pending') return 'pending';
  if (EXTERNAL_ROLES.includes(u!.role)) return 'external';
  if (INTERNAL_ROLES.includes(u!.role)) return 'internal';
  return 'pending';
}

/** Can edit operational records (staff level and above). */
export function canEditOperations(role: UserRole): boolean {
  return ['admin', 'director', 'manager', 'construction_manager', 'engineer', 'production', 'quality', 'staff'].includes(role);
}

/** Project Manager level: schedules, approvals and publishing. */
export function isManagerRole(role: UserRole): boolean {
  return role === 'admin' || role === 'director' || role === 'manager';
}

export function isAdminRole(role: UserRole): boolean {
  return role === 'admin';
}

// ---------------- Internal modules per role ----------------
// Navigation level: which Master Project Tracker modules each internal role
// works in, and where they land after signing in. Sensitive data (internal
// records, unpublished content) is additionally protected
// server-side by firestore.rules.

const ALL_MODULES = [
  'site',
  'schedule',
  'journey',
  'roles',
  'sync',
  'command',
  'executive',
  'notifications',
  'calendar',
  'tracker',
  'construction',
  'production',
  'timeline',
  'milestones',
  'procurement',
  'issues',
  'reports',
  'narrative',
  'prodcal',
  'analytics',
  'documents',
  'publishing',
  'archive',
  'overview',
  'settings',
];

const MODULES_BY_ROLE: Partial<Record<UserRole, string[]>> = {
  admin: ALL_MODULES,
  director: ALL_MODULES,
  manager: ALL_MODULES,
  // Construction Manager — construction, schedule and quality modules
  construction_manager: ['command', 'executive', 'notifications', 'calendar', 'tracker', 'site', 'construction', 'timeline', 'milestones', 'procurement', 'schedule', 'issues', 'analytics', 'reports', 'narrative', 'prodcal', 'documents', 'archive', 'overview', 'settings', 'roles', 'sync'],
  // Quality Personnel — inspections, issues and construction records
  quality: ['command', 'notifications', 'calendar', 'tracker', 'site', 'construction', 'milestones', 'issues', 'reports', 'narrative', 'prodcal', 'documents', 'overview', 'settings', 'roles', 'sync'],
  // Site Engineer — construction-related modules
  engineer: ['command', 'notifications', 'calendar', 'tracker', 'site', 'construction', 'timeline', 'milestones', 'procurement', 'schedule', 'issues', 'reports', 'narrative', 'prodcal', 'documents', 'overview', 'settings', 'roles', 'sync'],
  // Production Coordinator — production and integrated scheduling modules
  production: ['command', 'notifications', 'calendar', 'tracker', 'site', 'production', 'timeline', 'milestones', 'schedule', 'issues', 'reports', 'narrative', 'prodcal', 'documents', 'overview', 'settings', 'roles', 'sync'],
  // Authorized team members — their assigned records and supporting modules
  staff: ['command', 'notifications', 'calendar', 'tracker', 'site', 'issues', 'reports', 'narrative', 'prodcal', 'documents', 'overview', 'settings', 'roles', 'sync'],
  // Internal read-only viewer — everything except publishing
  viewer: ALL_MODULES.filter((m) => m !== 'publishing'),
};

const LANDING_BY_ROLE: Partial<Record<UserRole, string>> = {
  admin: 'command',
  director: 'command',
  manager: 'command',
  construction_manager: 'construction',
  quality: 'construction',
  engineer: 'construction',
  production: 'production',
  staff: 'tracker',
  viewer: 'command',
};

export function allowedModules(role: UserRole): string[] {
  return MODULES_BY_ROLE[role] || [];
}

export function canOpenModule(role: UserRole, section: string): boolean {
  return allowedModules(role).includes(section);
}

/** Internal dashboard a role is taken to after signing in. */
export function landingModule(role: UserRole): string {
  return LANDING_BY_ROLE[role] || 'command';
}

/**
 * Portal tiers. Everyone (public, clients, stakeholders) sees the published
 * client-facing dashboard. Approved project documents are additionally
 * available to the Project Owner, Executives and the internal team.
 */
export function canReadPortalDocuments(u?: User | null): boolean {
  if (!isSignedIn(u)) return false;
  const a = audienceOf(u);
  return a === 'internal' || (a === 'external' && (u!.role === 'owner' || u!.role === 'executive'));
}
