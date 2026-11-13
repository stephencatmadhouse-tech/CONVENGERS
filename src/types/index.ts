/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Internal roles: admin (System Administrator), manager (Project Manager),
 * engineer (Site Engineer), production (Production Coordinator),
 * staff (Authorized internal team member), viewer (internal read-only).
 * External roles (Executive & Client Portal only): owner (Project Owner),
 * executive, client (Client Representative), stakeholder.
 */
export type UserRole =
  | 'admin'
  | 'manager'
  | 'engineer'
  | 'production'
  | 'staff'
  | 'viewer'
  | 'owner'
  | 'executive'
  | 'client'
  | 'stakeholder'
  | 'pending';
export type UserStatus = 'active' | 'pending' | 'revoked';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status?: UserStatus;
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
  episodeLabel?: string;
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

export type Priority = 'Low' | 'Medium' | 'High' | 'Critical';
export type Commitment = 'Confirmed' | 'Tentative' | 'Target';

export interface ScheduleRevision {
  at: string; // ISO timestamp
  by: string;
  fromStart?: string; // YYYY-MM-DD
  fromFinish?: string;
  toStart?: string;
  toFinish?: string;
}

/**
 * Activity control metadata. One document per activity (keyed by its stable
 * register key, e.g. `sc|<scopeId>`, `p|<pourId>`, `e|<episodeId>|s`).
 * Older documents keyed by the legacy `c|floor|phase|name|date` format are
 * still read and merged, so no existing assignment is lost.
 */
export interface ActivityOverride {
  key: string;
  owner?: string;
  remarks?: string;
  onHold?: boolean;
  updatedAt?: string;
  updatedBy?: string;
  // --- Command Center extensions (all optional, backward compatible) ---
  supporting?: string;
  priority?: Priority;
  commitment?: Commitment;
  dependsOn?: string[]; // register activity IDs (e.g. "SC-sc_gf_s_3")
  actualStart?: string; // YYYY-MM-DD
  actualFinish?: string; // YYYY-MM-DD
  baselineStart?: string; // YYYY-MM-DD — original planned start, preserved on revisions
  baselineFinish?: string; // YYYY-MM-DD
  revisionCount?: number;
  lastRevisedAt?: string;
  revisions?: ScheduleRevision[];
  progress?: number; // manual activities only
  concern?: string;
  correctiveAction?: string;
  resolutionDate?: string; // YYYY-MM-DD
  department?: string;
}

export type IssueType = 'Issue' | 'Risk' | 'Decision';
export type IssueSeverity = 'Low' | 'Medium' | 'High' | 'Critical';
export type IssueStatus = 'Open' | 'In Progress' | 'Resolved' | 'Closed';

export interface ProjectIssue {
  id: string; // ISS-YYYYMMDD-xxxx
  type: IssueType;
  title: string;
  description: string;
  severity: IssueSeverity;
  status: IssueStatus;
  linkedActivityId?: string;
  owner: string;
  supporting?: string;
  raisedDate: string; // YYYY-MM-DD
  dueDate?: string; // resolution deadline
  correctiveAction?: string;
  resolution?: string;
  decisionRequired?: boolean;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  localOnly?: boolean;
}

export interface WorkstreamSnapshot {
  key: string;
  label: string;
  actual: number;
  planned: number;
  weight: number;
}

/** Daily point-in-time record of measured progress, used for trends. */
export interface ProgressSnapshot {
  id: string; // YYYY-MM-DD
  date: string;
  actualPct: number;
  plannedPct: number;
  workstreams: WorkstreamSnapshot[];
  counts: { completed: number; ongoing: number; delayed: number; upcoming: number; onHold: number };
  milestonesComplete: number;
  milestonesTotal: number;
  episodesCompleted: number;
  episodesTotal: number;
  capturedAt: string;
  capturedBy: string;
  localOnly?: boolean;
}

export type ReportType = 'weekly' | 'monthly';
/** Publishing lifecycle: draft → review → approved (frozen) → published (on portal) → archived. */
export type ReportStatus = 'draft' | 'review' | 'approved' | 'published' | 'archived';

export interface ReportNarrative {
  executiveSummary?: string;
  construction?: string;
  production?: string;
  issues?: string;
  correctiveActions?: string;
  nextPeriod?: string;
  recommendations?: string;
}

export interface ProjectReport {
  id: string; // W-2026-11-09 or M-2026-11
  type: ReportType;
  periodStart: string;
  periodEnd: string;
  title: string;
  status: ReportStatus;
  narrative: ReportNarrative;
  /** Frozen computed content (set when approved). Drafts recompute live. */
  frozen?: any;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  approvedAt?: string;
  approvedBy?: string;
  publishedAt?: string;
  publishedBy?: string;
  archivedAt?: string;
  archivedBy?: string;
  localOnly?: boolean;
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

export interface Collaborator {
  clientId: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  userColor: string;
  focusedCellId?: string | null;
  lastActive: number;
  device?: 'mobile' | 'desktop';
}

export interface RemoteFocus {
  clientId: string;
  userId: string;
  userName: string;
  userColor: string;
  cellId: string;
}

export interface CellEditEvent {
  entityType: 'milestone' | 'scope' | 'pour' | 'episode' | 'activity' | 'override';
  entityId: string;
  field: string;
  value: any;
  clientId: string;
  userName: string;
}


// ===================== Operations modules =====================

export type ProcurementStatus = 'Required' | 'For Canvass' | 'Ordered' | 'Partially Delivered' | 'Delivered' | 'Delayed' | 'Cancelled';

export interface ProcurementItem {
  id: string;
  material: string;
  description?: string;
  quantity?: number;
  unit?: string;
  linkedActivityId?: string;
  supplier?: string;
  supplierContact?: string;
  poNumber?: string;
  requiredDate?: string; // YYYY-MM-DD — needed on site
  orderDate?: string;
  expectedDelivery?: string;
  actualDelivery?: string;
  status: ProcurementStatus;
  remarks?: string;
  archived?: boolean;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  localOnly?: boolean;
}

export interface ManpowerPlan {
  id: string;
  trade: string; // e.g. Masons, Steelmen, Electricians
  team?: string; // contractor / crew name
  headcount?: number;
  start: string;
  end: string;
  linkedActivityId?: string;
  notes?: string;
  archived?: boolean;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  localOnly?: boolean;
}

export interface BudgetLine {
  id: string;
  category: string;
  description?: string;
  budget: number; // approved budget
  allocated?: number; // committed / allocated amount
  notes?: string;
  archived?: boolean;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  localOnly?: boolean;
}

export interface Expense {
  id: string;
  date: string;
  budgetLineId?: string;
  description: string;
  amount: number;
  vendor?: string;
  reference?: string; // OR / invoice no.
  linkedProcurementId?: string;
  archived?: boolean;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  localOnly?: boolean;
}

export type DocumentCategory =
  | 'Site report'
  | 'Weekly report'
  | 'Monthly report'
  | 'Meeting minutes'
  | 'Construction document'
  | 'Drawing / plan'
  | 'Procurement record'
  | 'Internal approval'
  | 'Site photo'
  | 'Other attachment';

export interface ProjectDocument {
  id: string;
  title: string;
  category: DocumentCategory;
  date: string;
  url?: string; // download URL (Firebase Storage or external link)
  storagePath?: string;
  fileName?: string;
  contentType?: string;
  size?: number;
  linkedActivityId?: string;
  notes?: string;
  archived?: boolean;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  localOnly?: boolean;
}

// ===================== Publishing (internal → external) =====================

export type PublishStatus = 'draft' | 'review' | 'approved' | 'published' | 'archived';
export type PublicationKind = 'snapshot' | 'photo' | 'document' | 'consideration' | 'update';

export interface PublicationEvent {
  at: string;
  by: string;
  from?: PublishStatus;
  to: PublishStatus;
  note?: string;
}

/** Internal record of something prepared for the external portal. */
export interface Publication {
  id: string;
  kind: PublicationKind;
  title: string;
  status: PublishStatus;
  /** Client-facing content, frozen when the record is created / edited in draft. */
  payload: any;
  sourceId?: string; // e.g. document id or issue id it was prepared from
  periodStart?: string;
  periodEnd?: string;
  history: PublicationEvent[];
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  localOnly?: boolean;
}

// ===================== Calendar events & notifications =====================

/** Manually added calendar entries (inspections, site visits, deliveries, handover, meetings). */
export type CalendarEventType = 'Inspection' | 'Site visit' | 'Delivery' | 'Handover / turnover' | 'Meeting' | 'Other';

export interface CalendarEvent {
  id: string;
  date: string; // YYYY-MM-DD (Asia/Manila)
  endDate?: string;
  time?: string; // HH:MM
  type: CalendarEventType;
  title: string;
  notes?: string;
  owner?: string;
  linkedActivityId?: string;
  done: boolean;
  doneAt?: string;
  doneBy?: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  localOnly?: boolean;
}

export type NotificationType =
  | 'overdue'
  | 'due'
  | 'unassigned'
  | 'blocked'
  | 'changed'
  | 'verification'
  | 'turnover'
  | 'document';

export interface NotificationPrefs {
  /** Notification types this user has switched off. */
  off: Partial<Record<NotificationType, boolean>>;
  /** Lead time (days) for "due soon" notifications. */
  leadDays: number;
}

/** Per-user notification state (read keys + preferences). */
export interface UserNotificationState {
  readKeys: string[];
  prefs: NotificationPrefs;
  updatedAt?: string;
  localOnly?: boolean;
}
