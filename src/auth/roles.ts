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

export const INTERNAL_ROLES: UserRole[] = ['admin', 'manager', 'engineer', 'production', 'staff', 'viewer'];
export const EXTERNAL_ROLES: UserRole[] = ['owner', 'executive', 'client', 'stakeholder'];

export const ROLE_LABEL: Record<UserRole, string> = {
  admin: 'System Administrator',
  manager: 'Project Manager',
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
  return ['admin', 'manager', 'engineer', 'production', 'staff'].includes(role);
}

/** Project Manager level: schedules, approvals and publishing. */
export function isManagerRole(role: UserRole): boolean {
  return role === 'admin' || role === 'manager';
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
  'analytics',
  'documents',
  'publishing',
  'archive',
  'overview',
  'settings',
];

const MODULES_BY_ROLE: Partial<Record<UserRole, string[]>> = {
  admin: ALL_MODULES,
  manager: ALL_MODULES,
  // Site Engineer — construction-related modules
  engineer: ['command', 'notifications', 'calendar', 'tracker', 'construction', 'timeline', 'milestones', 'procurement', 'issues', 'reports', 'documents', 'overview', 'settings'],
  // Production Coordinator — production and integrated scheduling modules
  production: ['command', 'notifications', 'calendar', 'tracker', 'production', 'timeline', 'milestones', 'issues', 'reports', 'documents', 'overview', 'settings'],
  // Authorized team members — their assigned records and supporting modules
  staff: ['command', 'notifications', 'calendar', 'tracker', 'issues', 'reports', 'documents', 'overview', 'settings'],
  // Internal read-only viewer — everything except publishing
  viewer: ALL_MODULES.filter((m) => m !== 'publishing'),
};

const LANDING_BY_ROLE: Partial<Record<UserRole, string>> = {
  admin: 'command',
  manager: 'command',
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
