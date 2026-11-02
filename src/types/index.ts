/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type UserRole = 'admin' | 'manager' | 'staff' | 'viewer';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: string;
}

export interface UserWithCredentials extends User {
  passwordHash: string;
  salt: string;
}

export type MilestoneStatus = 
  | 'Upcoming'
  | 'In progress'
  | 'Complete'
  | 'Delayed'
  | 'Date passed · confirm';

export interface Milestone {
  id: string;
  index: number;
  dateText: string;
  label: string;
  badge?: {
    text: string;
    type: 'fixed' | 'confirmed' | 'planned' | 'provided';
  };
  status: MilestoneStatus;
  updatedAt?: string;
  updatedBy?: string;
}

export type ScopeStatus = 'Not started' | 'In progress' | 'Complete';

export interface ScopeItem {
  id: string;
  floor: 'GF' | '2F' | '3F';
  phase: 'Structural' | 'Finishing';
  name: string;
  dateText: string;
  workingDays: number;
  percentComplete: number;
  subNote?: string;
  isAdded?: boolean;
  color?: string;
  leftPct?: number;
  widthPct?: number;
  sortOrder: number;
  updatedAt?: string;
  updatedBy?: string;
}

export type ActivityStatus = 'Upcoming' | 'Ongoing' | 'Completed' | 'Delayed' | 'On Hold';
export type ActivityCategory = 'Construction' | 'Production' | 'Milestone' | 'Concrete' | 'Other';

export interface Activity {
  id: string;
  title: string;
  description: string;
  category: ActivityCategory;
  status: ActivityStatus;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  owner: string;
  notes: string;
  sourceRef?: string;
  isManual?: boolean;
  createdAt: string;
  updatedAt: string;
  updatedBy?: string;
}

export type PrepStatus = 'Not started' | 'Ongoing' | 'Ready' | 'Completed';
export type PourState = 'Not poured' | 'Scheduled' | 'Ongoing' | 'Completed';
export type CureStatus = 'Not started' | 'Ongoing' | 'Completed';
export type InspStatus = 'Pending' | 'For inspection' | 'Approved' | 'Rejected';
export type PourMilestoneStatus = 
  | 'Not Yet Started'
  | 'Preparation Ongoing'
  | 'Ready for Pouring'
  | 'Scheduled for Pouring'
  | 'Pouring Ongoing'
  | 'Pouring Completed'
  | 'Curing Ongoing'
  | 'Completed / Approved'
  | 'Delayed';

export interface ConcretePour {
  id: string;
  floor: 'GF' | '2F' | '3F';
  component: string;
  activity: string;
  targetPour: string; // YYYY-MM-DD
  actualPour: string; // YYYY-MM-DD
  targetCompletion: string; // YYYY-MM-DD
  actualCompletion: string; // YYYY-MM-DD
  prepStatus: PrepStatus;
  pourStatus: PourState;
  cureStatus: CureStatus;
  inspStatus: InspStatus;
  milestoneStatus: PourMilestoneStatus;
  remarks: string;
  sourceRef?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export type EpisodeProductionStatus = 
  | 'Planned'
  | 'For Confirmation'
  | 'Scheduled'
  | 'Completed'
  | 'Rescheduled';

export type EpisodeScopeStatus = 'Not started' | 'On-track' | 'Delayed' | 'Completed';

export interface Episode {
  id: string;
  number: number;
  title: string;
  topic: string;
  scopeOfWork: string;
  shootStart: string; // YYYY-MM-DD
  shootEnd: string; // YYYY-MM-DD
  releaseDate: string; // YYYY-MM-DD
  location: string;
  director: string;
  status: EpisodeProductionStatus;
  scopeStatus: EpisodeScopeStatus;
  remarks: string;
  characters: string[]; // character IDs
  updatedAt?: string;
  updatedBy?: string;
}

export interface Character {
  id: string;
  name: string;
  createdAt: string;
}

export interface ActivityOverride {
  key: string;
  owner?: string;
  remarks?: string;
  onHold?: boolean;
  updatedAt?: string;
  updatedBy?: string;
}

export interface SystemSettings {
  version: number;
  updatedAt: string;
  theme: 'auto' | 'dark' | 'light';
  paper: 'a4' | 'a3' | 'letter' | 'tabloid';
}

export interface AuditLog {
  id: string;
  userId: string;
  userEmail: string;
  action: string;
  entityType: string;
  entityId: string;
  details?: string;
  timestamp: string;
}

export interface FullDashboardData {
  user: User | null;
  settings: SystemSettings;
  milestones: Milestone[];
  scopes: ScopeItem[];
  activities: Activity[];
  pours: ConcretePour[];
  episodes: Episode[];
  characters: Character[];
  overrides: Record<string, ActivityOverride>;
  auditLogs: AuditLog[];
}
