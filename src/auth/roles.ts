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

/** Project Manager level: schedules, approvals, publishing, finance. */
export function isManagerRole(role: UserRole): boolean {
  return role === 'admin' || role === 'manager';
}

export function isAdminRole(role: UserRole): boolean {
  return role === 'admin';
}
