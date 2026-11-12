/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Command Center context: one place where every module reads the derived
 * register / metrics and calls the same write actions.
 */

import React, { createContext, useContext } from 'react';
import {
  ActivityOverride,
  FullDashboardData,
  ProjectIssue,
  ProjectReport,
  ProgressSnapshot,
  User,
  Activity,
} from '../types/index.ts';
import { RegisterActivity } from '../domain/register.ts';
import { ProjectMetrics } from '../domain/metrics.ts';
import { AlignmentRow } from '../domain/alignment.ts';
import { AttentionItem } from '../domain/attention.ts';

export interface ActivityPatch {
  name?: string;
  start?: string;
  finish?: string;
  progress?: number;
  sourceStatus?: string; // milestone status / pour milestoneStatus / episode status / activity status
  actualStart?: string;
  actualFinish?: string;
  owner?: string;
  supporting?: string;
  priority?: ActivityOverride['priority'];
  commitment?: ActivityOverride['commitment'];
  dependsOn?: string[];
  remarks?: string;
  concern?: string;
  correctiveAction?: string;
  resolutionDate?: string;
  onHold?: boolean;
}

export interface CommandActions {
  navigate: (route: string) => void;
  openActivity: (id: string) => void;
  toast: (msg: string) => void;
  patchActivity: (r: RegisterActivity, patch: ActivityPatch) => Promise<boolean>;
  addActivity: (a: Omit<Activity, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  saveIssue: (i: ProjectIssue) => Promise<void>;
  deleteIssue: (id: string) => Promise<void>;
  saveReport: (r: ProjectReport) => Promise<void>;
  deleteReport: (id: string) => Promise<void>;
  captureSnapshot: (manual?: boolean) => Promise<void>;
  freezeBaseline: () => Promise<void>;
  syncLocal: () => Promise<void>;
  exportBackup: () => void;
  importBackup: (file: File) => void;
  printSlides: () => void;
  printExecutiveReport: () => void;
  downloadHtml: () => void;
  openAuditLogs: () => void;
  openAdminPanel: () => void;
  resetBaseline: () => void;
  toggleTheme: () => void;
  changePaper: (p: FullDashboardData['settings']['paper']) => void;
  printElement: (render: () => React.ReactNode, title: string) => void;
}

export interface CommandState {
  data: FullDashboardData;
  register: RegisterActivity[];
  metrics: ProjectMetrics;
  alignment: AlignmentRow[];
  attention: AttentionItem[];
  reports: ProjectReport[];
  issues: ProjectIssue[];
  snapshots: ProgressSnapshot[];
  sharedStorage: { reports: boolean; issues: boolean; snapshots: boolean };
  today: string;
  uiTheme: 'light' | 'dark';
  user: User;
  canEdit: boolean;
  isManager: boolean;
  isAdmin: boolean;
  isLive: boolean;
  route: { section: string; tab?: string; param?: string };
  actions: CommandActions;
}

const Ctx = createContext<CommandState | null>(null);

export const CommandProvider: React.FC<{ value: CommandState; children: React.ReactNode }> = ({ value, children }) => (
  <Ctx.Provider value={value}>{children}</Ctx.Provider>
);

export function useCommand(): CommandState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useCommand must be used inside CommandProvider');
  return v;
}
