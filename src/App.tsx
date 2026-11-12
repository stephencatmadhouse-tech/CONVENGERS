/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { api } from './api/client.ts';
import { realtime } from './utils/realtime.ts';
import {
  FullDashboardData,
  Milestone,
  ScopeItem,
  Activity,
  ConcretePour,
  Episode,
  Character,
  ActivityOverride,
  SystemSettings,
  Collaborator,
  RemoteFocus,
} from './types/index.ts';
import { Toolbar } from './components/Toolbar.tsx';
import { OverviewSlide } from './components/OverviewSlide.tsx';
import { UpcomingActivitiesSlide } from './components/UpcomingActivitiesSlide.tsx';
import { FloorScopeSlide } from './components/FloorScopeSlide.tsx';
import { MethodologySlide } from './components/MethodologySlide.tsx';
import { HolidaysSlide } from './components/HolidaysSlide.tsx';
import { NotesSlide } from './components/NotesSlide.tsx';
import { ConcretePourSlide } from './components/ConcretePourSlide.tsx';
import { ContentCalendarSlide } from './components/ContentCalendarSlide.tsx';
import { EpisodesTableSlide } from './components/EpisodesTableSlide.tsx';
import { OverallProjectTimelineSlide } from './components/OverallProjectTimelineSlide.tsx';
import { AuthModal, ShareModal, AuditLogModal } from './components/Modals.tsx';
import { AdminPanelModal } from './components/AdminPanelModal.tsx';
import { PrintReport } from './components/PrintReport.tsx';
import { authService } from './firebase/authService.ts';
import { firestoreData } from './firebase/firestoreData.ts';
import { recalculateScopeTimeline } from './utils/calculations.ts';
import { exportDashboardAsHtml } from './utils/htmlExporter.ts';

const PAPER_SIZES: Record<string, { size: string; width: number; height: number }> = {
  a4: { size: '297mm 210mm', width: 1122.5, height: 793.7 },
  a3: { size: '420mm 297mm', width: 1587.4, height: 1122.5 },
  letter: { size: '11in 8.5in', width: 1056, height: 816 },
  tabloid: { size: '17in 11in', width: 1632, height: 1056 },
};

export default function App() {
  const [data, setData] = useState<FullDashboardData>(() => api.getInitialDashboard());
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [remoteFocusMap, setRemoteFocusMap] = useState<Record<string, RemoteFocus>>({});
  const [loading, setLoading] = useState(false);
  const [isLiveConnected, setIsLiveConnected] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isEditingText, setIsEditingText] = useState(false);
  const isEditingTextRef = useRef(false);
  isEditingTextRef.current = isEditingText;

  // Modals & Admin Presentation Mode
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isAuditOpen, setIsAuditOpen] = useState(false);
  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(false);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [isAdminPresentationMode, setIsAdminPresentationMode] = useState(false);
  const [isPrintingReport, setIsPrintingReport] = useState(false);

  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 3200);
  }, []);

  const formatErrorForToast = useCallback((err: unknown, fallback: string): string => {
    const raw = err instanceof Error ? err.message : String(err || '');
    if (!raw) return fallback;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.error === 'string') {
        if (parsed.error.includes('No document to update')) {
          return 'Cloud baseline record is not initialized yet. Ask an Admin or Manager to open the dashboard once to sync.';
        }
        if (parsed.error.includes('Missing or insufficient permissions')) {
          return 'Permission denied: your role can only update status and progress notes.';
        }
        return parsed.error;
      }
    } catch {
      // Plain string error
    }
    return raw;
  }, []);

  // Real-Time Google Sheets Style Multi-User Collaboration Presence
  useEffect(() => {
    realtime.init(data.user);

    const unsubConn = realtime.onConnection((conn) => {
      setIsLiveConnected(conn);
    });

    const unsubPresence = realtime.onPresence((cols) => {
      setCollaborators(cols);
    });

    const unsubFocus = realtime.onRemoteFocus((focusMap) => {
      setRemoteFocusMap(focusMap);
    });

    const unsubCellEdit = realtime.onCellEdit((editEvent) => {
      // Instant reflection (<30ms) of teammate typing and edits
      setData((prev) => {
        if (!prev) return prev;
        if (editEvent.entityType === 'milestone') {
          return {
            ...prev,
            milestones: prev.milestones.map((m) =>
              m.id === editEvent.entityId ? { ...m, [editEvent.field]: editEvent.value } : m
            ),
          };
        }
        if (editEvent.entityType === 'scope') {
          return {
            ...prev,
            scopes: prev.scopes.map((s) =>
              s.id === editEvent.entityId ? { ...s, [editEvent.field]: editEvent.value } : s
            ),
          };
        }
        if (editEvent.entityType === 'pour') {
          return {
            ...prev,
            pours: prev.pours.map((p) =>
              p.id === editEvent.entityId ? { ...p, [editEvent.field]: editEvent.value } : p
            ),
          };
        }
        return prev;
      });
    });

    return () => {
      unsubConn();
      unsubPresence();
      unsubFocus();
      unsubCellEdit();
    };
  }, []);

  // Update user in realtime client when session changes
  useEffect(() => {
    if (data?.user) {
      realtime.updateUser(data.user);
    }
  }, [data?.user]);

  // Window resize calculation for --s
  useEffect(() => {
    const handleResize = () => {
      const w = window.innerWidth;
      const s = Math.min(1, Math.max((w - 32) / 1920, w < 900 ? 0.42 : 0));
      document.documentElement.style.setProperty('--s', String(s));
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Theme application
  useEffect(() => {
    if (!data?.settings) return;
    const theme = data.settings.theme;
    if (theme === 'light') {
      document.documentElement.setAttribute('data-eff', 'light');
    } else {
      document.documentElement.setAttribute('data-eff', 'dark');
    }
  }, [data?.settings?.theme]);

  // Dual-mode print style injection: Formal A4 Portrait Report vs Landscape Slide PDF
  useEffect(() => {
    let styleEl = document.getElementById('printstyle') as HTMLStyleElement;
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'printstyle';
      document.head.appendChild(styleEl);
    }

    if (isPrintingReport) {
      styleEl.textContent = `
        @page { size: A4 portrait; margin: 12mm 14mm; }
        @media print {
          html, body { margin: 0 !important; padding: 0 !important; background: #ffffff !important; color: #0f172a !important; }
        }
      `;
      return;
    }

    const paperKey = data?.settings?.paper || 'a4';
    const paper = PAPER_SIZES[paperKey] || PAPER_SIZES.a4;
    const k = Math.min(paper.width / 1920, paper.height / 1280);
    const offsetX = Math.max(0, Math.floor((paper.width - 1920 * k) / 2));
    const offsetY = Math.max(0, Math.floor((paper.height - 1280 * k) / 2));
    const pageBg = data?.settings?.theme === 'light' ? '#eceef8' : '#03051a';

    styleEl.textContent = `
      @page { size: ${paper.size}; margin: 0; }
      @media print {
        html, body { margin: 0 !important; padding: 0 !important; background: ${pageBg} !important; }
        .stage { padding: 0 !important; margin: 0 !important; overflow: visible !important; }
        .stage > div { break-inside: avoid !important; page-break-inside: avoid !important; margin: 0 !important; padding: 0 !important; }
        .stage > div + div { break-before: page !important; page-break-before: always !important; }
        .stage > div:last-child { break-after: auto !important; page-break-after: auto !important; }
        .wrap { display: block !important; position: relative !important; width: ${Math.floor(paper.width)}px !important; height: ${Math.floor(paper.height) - 2}px !important; margin: 0 !important; padding: 0 !important; overflow: hidden !important; break-inside: avoid !important; page-break-inside: avoid !important; }
        .slide { position: absolute !important; left: ${offsetX}px !important; top: ${offsetY}px !important; transform: scale(${k}) !important; transform-origin: 0 0 !important; margin: 0 !important; }
      }
    `;
  }, [data?.settings?.paper, data?.settings?.theme, isPrintingReport]);

  // Real-Time Firebase Auth and Firestore Subscriptions
  useEffect(() => {
    const unsubAuth = authService.onUserChange((fbUser) => {
      setData((prev) => (prev ? { ...prev, user: fbUser } : prev));
      if (fbUser && (fbUser.role === 'admin' || fbUser.role === 'manager')) {
        firestoreData.seedInitialDataIfEmpty(fbUser);
      }
    });

    const unsubFirestore = firestoreData.subscribeAll((freshData) => {
      setData((prev) => {
        if (!prev || isEditingTextRef.current) return prev;
        return {
          ...prev,
          ...freshData,
          settings: freshData.settings ? { ...prev.settings, ...freshData.settings } : prev.settings,
        };
      });
    });

    const initialUser = authService.getCurrentUser();
    if (initialUser.role === 'admin' || initialUser.role === 'manager') {
      firestoreData.seedInitialDataIfEmpty(initialUser);
    }

    return () => {
      unsubAuth();
      unsubFirestore();
    };
  }, []);

  const user = data?.user || authService.getCurrentUser();
  const isViewer = !user || user.role === 'viewer' || user.role === 'pending' || isAdminPresentationMode;
  const canEdit = !isViewer;
  const isAdmin = Boolean(user && user.role === 'admin' && !isAdminPresentationMode);
  const isManager = Boolean(user && (user.role === 'admin' || user.role === 'manager') && !isAdminPresentationMode);

  // Subscribe to Firestore audit logs for active admins only
  useEffect(() => {
    if (user?.role !== 'admin') return;
    const unsubAudit = firestoreData.subscribeAuditLogs((logs) => {
      setData((prev) => (prev ? { ...prev, auditLogs: logs } : prev));
    });
    return () => unsubAudit();
  }, [user?.role]);

  const handleViewerAttemptEdit = useCallback(() => {
    showToast('Read-only mode. Sign in as a team member to edit.');
  }, [showToast]);

  // Check URL query parameters for presentation mode (?view=presentation) or team login (?team=login)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const isPresentationMode =
      params.get('view') === 'presentation' ||
      params.get('view') === 'viewer' ||
      params.get('mode') === 'viewer' ||
      params.get('readonly') === 'true';

    const wantsTeamLogin =
      params.get('team') === 'login' ||
      params.get('auth') === 'team' ||
      params.get('action') === 'login';

    if (isPresentationMode) {
      api.clearToken();
      setIsEditingText(false);
      showToast('👁️ Presentation Mode: Read-only access enabled for viewers.');
    } else if (wantsTeamLogin) {
      setIsAuthOpen(true);
    }
  }, [showToast]);

  // Turn off text editing mode immediately if user is a viewer
  useEffect(() => {
    if (!canEdit && isEditingText) {
      setIsEditingText(false);
    }
  }, [canEdit, isEditingText]);

  // Action Handlers
  const handleToggleTheme = async () => {
    const nextTheme: SystemSettings['theme'] =
      data.settings.theme === 'auto'
        ? 'light'
        : data.settings.theme === 'light'
        ? 'dark'
        : 'auto';
    setData((prev) => (prev ? { ...prev, settings: { ...prev.settings, theme: nextTheme } } : prev));
    if (isManager) {
      try {
        await firestoreData.updateSettings({ theme: nextTheme });
      } catch {
        // non-blocking
      }
    }
    showToast(`Theme changed to ${nextTheme}`);
  };

  const handleChangePaper = async (paper: SystemSettings['paper']) => {
    setData((prev) => (prev ? { ...prev, settings: { ...prev.settings, paper } } : prev));
    if (isManager) {
      try {
        await firestoreData.updateSettings({ paper });
      } catch {
        // non-blocking
      }
    }
    showToast(`Paper size set to ${paper.toUpperCase()}`);
  };

  const handleUpdateMilestone = async (id: string, status: Milestone['status']) => {
    if (!canEdit) {
      handleViewerAttemptEdit();
      return;
    }
    const stamp = new Date().toISOString();
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        milestones: prev.milestones.map((m) =>
          m.id === id ? { ...m, status, updatedBy: user.name, updatedAt: stamp } : m
        ),
      };
    });
    realtime.editCell('milestone', id, 'status', status);
    try {
      await firestoreData.updateMilestone(id, { status }, user.name);
      await firestoreData.logAudit(user, 'UPDATE_MILESTONE', 'Milestone', id, `Status -> ${status}`);
      showToast('Milestone status saved & synced');
    } catch (err: unknown) {
      showToast(formatErrorForToast(err, 'Failed to update milestone'));
    }
  };

  const handleUpdateMilestoneField = async (id: string, field: 'label' | 'dateText', value: string) => {
    if (!canEdit) {
      handleViewerAttemptEdit();
      return;
    }
    if (!isManager) {
      showToast('Only Admins and Managers can edit milestone dates and labels.');
      return;
    }
    const trimmed = value.trim();
    if (!trimmed) return;
    const stamp = new Date().toISOString();

    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        milestones: prev.milestones.map((m) =>
          m.id === id ? { ...m, [field]: trimmed, updatedBy: user.name, updatedAt: stamp } : m
        ),
      };
    });

    realtime.editCell('milestone', id, field, trimmed);

    try {
      await firestoreData.updateMilestone(id, { [field]: trimmed }, user.name);
      await firestoreData.logAudit(user, 'UPDATE_MILESTONE', 'Milestone', id, `${field} -> ${trimmed}`);
    } catch (err: unknown) {
      showToast(formatErrorForToast(err, 'Failed to save milestone change'));
    }
  };

  const handleUpdateScopeProgress = async (id: string, percent: number) => {
    if (!canEdit) {
      handleViewerAttemptEdit();
      return;
    }
    const stamp = new Date().toISOString();
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        scopes: prev.scopes.map((s) =>
          s.id === id ? { ...s, percentComplete: percent, updatedBy: user.name, updatedAt: stamp } : s
        ),
      };
    });
    realtime.editCell('scope', id, 'percentComplete', percent);
    try {
      await firestoreData.updateScope(id, { percentComplete: percent }, user.name);
      await firestoreData.logAudit(user, 'UPDATE_SCOPE', 'Scope', id, `Progress -> ${percent}%`);
    } catch (err: unknown) {
      showToast(formatErrorForToast(err, 'Failed to update progress'));
    }
  };

  const handleUpdateScopeField = async (id: string, field: 'name' | 'dateText', value: string) => {
    if (!canEdit) {
      handleViewerAttemptEdit();
      return;
    }
    if (!isManager) {
      showToast('Only Admins and Managers can edit scope titles and dates.');
      return;
    }
    const trimmed = value.trim();
    if (!trimmed) return;
    const stamp = new Date().toISOString();

    const targetScope = data?.scopes?.find((s) => s.id === id);
    let timelineUpdates: Partial<ScopeItem> = { [field]: trimmed };

    if (field === 'dateText' && targetScope) {
      const scopesInPhase = data?.scopes?.filter(
        (s) => s.floor === targetScope.floor && s.phase === targetScope.phase
      );
      const recalculated = recalculateScopeTimeline(targetScope, trimmed, scopesInPhase);
      timelineUpdates = {
        dateText: trimmed,
        workingDays: recalculated.workingDays,
        leftPct: recalculated.leftPct,
        widthPct: recalculated.widthPct,
      };
    }

    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        scopes: prev.scopes.map((s) =>
          s.id === id ? { ...s, ...timelineUpdates, updatedBy: user.name, updatedAt: stamp } : s
        ),
      };
    });

    realtime.editCell('scope', id, field, trimmed);
    try {
      await firestoreData.updateScope(id, timelineUpdates, user.name);
      const logDetail =
        field === 'dateText' && timelineUpdates.workingDays !== undefined
          ? `Date -> ${trimmed} (${timelineUpdates.workingDays} working days, bar left: ${timelineUpdates.leftPct}%, width: ${timelineUpdates.widthPct}%)`
          : `${field} -> ${trimmed}`;
      await firestoreData.logAudit(user, 'UPDATE_SCOPE', 'Scope', id, logDetail);
      if (field === 'dateText' && timelineUpdates.workingDays !== undefined) {
        showToast(`Adjusted: ${trimmed} · ${timelineUpdates.workingDays} working day${timelineUpdates.workingDays > 1 ? 's' : ''}`);
      }
    } catch (err: unknown) {
      showToast(formatErrorForToast(err, 'Failed to save scope update'));
    }
  };

  const handleUpdateScopeWorkingDays = async (id: string, days: number) => {
    if (!canEdit) {
      handleViewerAttemptEdit();
      return;
    }
    if (!isManager) {
      showToast('Only Admins and Managers can edit scope working days.');
      return;
    }
    if (days <= 0) return;
    const stamp = new Date().toISOString();

    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        scopes: prev.scopes.map((s) =>
          s.id === id ? { ...s, workingDays: days, updatedBy: user.name, updatedAt: stamp } : s
        ),
      };
    });

    try {
      await firestoreData.updateScope(id, { workingDays: days }, user.name);
      await firestoreData.logAudit(user, 'UPDATE_SCOPE', 'Scope', id, `Working Days -> ${days}`);
      showToast(`Updated to ${days} working day${days > 1 ? 's' : ''}`);
    } catch (err: unknown) {
      showToast(formatErrorForToast(err, 'Failed to update working days'));
    }
  };

  const handleAddScope = async (scope: Omit<ScopeItem, 'id'>) => {
    if (!isAdmin) {
      showToast('Only Administrators can add new scope items.');
      return;
    }
    const recalculated = recalculateScopeTimeline(
      { ...scope, id: 'temp' } as ScopeItem,
      scope.dateText
    );
    const newScope: ScopeItem = {
      ...scope,
      id: `sc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      workingDays: recalculated.workingDays || scope.workingDays || 1,
      leftPct: recalculated.leftPct,
      widthPct: recalculated.widthPct,
      updatedBy: user.name,
      updatedAt: new Date().toISOString(),
    };
    try {
      await firestoreData.addScope(newScope, user.name);
      await firestoreData.logAudit(user, 'ADD_SCOPE', 'Scope', newScope.id, newScope.name);
      setData((prev) => (prev ? { ...prev, scopes: [...prev.scopes, newScope] } : prev));
      showToast('Scope added and persisted');
    } catch (err: unknown) {
      showToast(formatErrorForToast(err, 'Failed to add scope'));
    }
  };

  const handleDeleteScope = async (id: string) => {
    if (!isAdmin) {
      showToast('Only Administrators can delete scope items.');
      return;
    }
    try {
      await firestoreData.deleteScope(id);
      await firestoreData.logAudit(user, 'DELETE_SCOPE', 'Scope', id);
      setData((prev) => (prev ? { ...prev, scopes: prev.scopes.filter((s) => s.id !== id) } : prev));
      showToast('Scope removed');
    } catch (err: unknown) {
      showToast(formatErrorForToast(err, 'Failed to delete scope'));
    }
  };

  // Activities
  const handleAddActivity = async (act: Omit<Activity, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (!isManager) {
      if (!canEdit) handleViewerAttemptEdit();
      else showToast('Only Admins and Managers can add activities.');
      return;
    }
    const now = new Date().toISOString();
    const newActivity: Activity = {
      ...act,
      id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      createdAt: now,
      updatedAt: now,
    };
    try {
      await firestoreData.addActivity(newActivity, user.name);
      await firestoreData.logAudit(user, 'ADD_ACTIVITY', 'Activity', newActivity.id, newActivity.title);
      setData((prev) => (prev ? { ...prev, activities: [...prev.activities, newActivity] } : prev));
      showToast('Activity created and saved');
    } catch (err: unknown) {
      showToast(formatErrorForToast(err, 'Failed to create activity'));
    }
  };

  const handleUpdateActivity = async (id: string, updates: Partial<Activity>) => {
    if (!canEdit) {
      handleViewerAttemptEdit();
      return;
    }
    const safeUpdates = isManager
      ? updates
      : {
          ...(updates.status !== undefined ? { status: updates.status } : {}),
          ...(updates.notes !== undefined ? { notes: updates.notes } : {}),
        };
    try {
      await firestoreData.updateActivity(id, safeUpdates, user.name);
      await firestoreData.logAudit(user, 'UPDATE_ACTIVITY', 'Activity', id);
      setData((prev) =>
        prev
          ? {
              ...prev,
              activities: prev.activities.map((a) =>
                a.id === id ? { ...a, ...safeUpdates, updatedAt: new Date().toISOString() } : a
              ),
            }
          : prev
      );
      showToast('Activity updated');
    } catch (err: unknown) {
      showToast(formatErrorForToast(err, 'Failed to update activity'));
    }
  };

  const handleDeleteActivity = async (id: string) => {
    if (!isAdmin) {
      showToast('Only Administrators can delete activities.');
      return;
    }
    try {
      await firestoreData.deleteActivity(id);
      await firestoreData.logAudit(user, 'DELETE_ACTIVITY', 'Activity', id);
      setData((prev) => (prev ? { ...prev, activities: prev.activities.filter((a) => a.id !== id) } : prev));
      showToast('Activity deleted');
    } catch (err: unknown) {
      showToast(formatErrorForToast(err, 'Failed to delete activity'));
    }
  };

  // Pours
  const handleAddPour = async (pour: Omit<ConcretePour, 'id'>) => {
    if (!isManager) {
      showToast('Only Admins and Managers can add pour milestones.');
      return;
    }
    const newPour: ConcretePour = {
      ...pour,
      id: `pour_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      updatedBy: user.name,
      updatedAt: new Date().toISOString(),
    };
    try {
      await firestoreData.addPour(newPour, user.name);
      await firestoreData.logAudit(user, 'ADD_POUR', 'ConcretePour', newPour.id, `${newPour.floor} ${newPour.component}`);
      setData((prev) => (prev ? { ...prev, pours: [...prev.pours, newPour] } : prev));
      showToast('Pour milestone created');
    } catch (err: unknown) {
      showToast(formatErrorForToast(err, 'Failed to create pour'));
    }
  };

  const handleUpdatePour = async (id: string, updates: Partial<ConcretePour>) => {
    if (!canEdit) {
      handleViewerAttemptEdit();
      return;
    }
    const safeUpdates: Partial<ConcretePour> = isManager
      ? updates
      : {
          ...(updates.prepStatus !== undefined ? { prepStatus: updates.prepStatus } : {}),
          ...(updates.pourStatus !== undefined ? { pourStatus: updates.pourStatus } : {}),
          ...(updates.cureStatus !== undefined ? { cureStatus: updates.cureStatus } : {}),
          ...(updates.inspStatus !== undefined ? { inspStatus: updates.inspStatus } : {}),
          ...(updates.milestoneStatus !== undefined ? { milestoneStatus: updates.milestoneStatus } : {}),
          ...(updates.remarks !== undefined ? { remarks: updates.remarks } : {}),
        };
    if (Object.keys(safeUpdates).length === 0) {
      showToast('Only Admins and Managers can edit concrete pour dates or components.');
      return;
    }
    try {
      await firestoreData.updatePour(id, safeUpdates, user.name);
      await firestoreData.logAudit(user, 'UPDATE_POUR', 'ConcretePour', id);
      setData((prev) =>
        prev
          ? {
              ...prev,
              pours: prev.pours.map((p) =>
                p.id === id ? { ...p, ...safeUpdates, updatedBy: user.name, updatedAt: new Date().toISOString() } : p
              ),
            }
          : prev
      );
    } catch (err: unknown) {
      showToast(formatErrorForToast(err, 'Failed to update pour'));
    }
  };

  const handleDeletePour = async (id: string) => {
    if (!isAdmin) {
      showToast('Only Administrators can delete concrete pour milestones.');
      return;
    }
    try {
      await firestoreData.deletePour(id);
      await firestoreData.logAudit(user, 'DELETE_POUR', 'ConcretePour', id);
      setData((prev) => (prev ? { ...prev, pours: prev.pours.filter((p) => p.id !== id) } : prev));
      showToast('Pour deleted');
    } catch (err: unknown) {
      showToast(formatErrorForToast(err, 'Failed to delete pour'));
    }
  };

  // Episodes & Characters
  const handleAddEpisode = async (ep: Omit<Episode, 'id'>) => {
    if (!isAdmin) {
      showToast('Only Administrators can create new episodes.');
      return;
    }
    const newEpisode: Episode = {
      ...ep,
      id: `ep_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      updatedBy: user.name,
      updatedAt: new Date().toISOString(),
    };
    try {
      await firestoreData.addEpisode(newEpisode, user.name);
      await firestoreData.logAudit(user, 'ADD_EPISODE', 'Episode', newEpisode.id, `Ep ${newEpisode.number}: ${newEpisode.title}`);
      setData((prev) => (prev ? { ...prev, episodes: [...prev.episodes, newEpisode] } : prev));
      showToast('Episode saved to database');
    } catch (err: unknown) {
      showToast(formatErrorForToast(err, 'Failed to create episode'));
    }
  };

  const handleUpdateEpisode = async (id: string, updates: Partial<Episode>) => {
    if (!canEdit) {
      handleViewerAttemptEdit();
      return;
    }
    const safeUpdates = isManager
      ? updates
      : {
          ...(updates.status !== undefined ? { status: updates.status } : {}),
          ...(updates.scopeStatus !== undefined ? { scopeStatus: updates.scopeStatus } : {}),
          ...(updates.remarks !== undefined ? { remarks: updates.remarks } : {}),
        };
    try {
      await firestoreData.updateEpisode(id, safeUpdates, user.name);
      await firestoreData.logAudit(user, 'UPDATE_EPISODE', 'Episode', id);
      setData((prev) =>
        prev
          ? {
              ...prev,
              episodes: prev.episodes.map((e) =>
                e.id === id ? { ...e, ...safeUpdates, updatedBy: user.name, updatedAt: new Date().toISOString() } : e
              ),
            }
          : prev
      );
    } catch (err: unknown) {
      showToast(formatErrorForToast(err, 'Failed to update episode'));
    }
  };

  const handleDeleteEpisode = async (id: string) => {
    if (!isAdmin) {
      showToast('Only Administrators can delete episodes.');
      return;
    }
    try {
      await firestoreData.deleteEpisode(id);
      await firestoreData.logAudit(user, 'DELETE_EPISODE', 'Episode', id);
      setData((prev) => (prev ? { ...prev, episodes: prev.episodes.filter((e) => e.id !== id) } : prev));
      showToast('Episode removed');
    } catch (err: unknown) {
      showToast(formatErrorForToast(err, 'Failed to delete episode'));
    }
  };

  const handleAddCharacter = async (name: string) => {
    if (!isManager) {
      if (!canEdit) handleViewerAttemptEdit();
      else showToast('Only Admins and Managers can add characters.');
      return;
    }
    const newChar: Character = {
      id: `ch_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name,
      createdAt: new Date().toISOString().split('T')[0],
    };
    try {
      await firestoreData.addCharacter(newChar);
      setData((prev) => (prev ? { ...prev, characters: [...prev.characters, newChar] } : prev));
      showToast(`Character "${name}" added`);
    } catch (err: unknown) {
      showToast(formatErrorForToast(err, 'Failed to add character'));
    }
  };

  const handleUpdateCharacter = async (id: string, name: string) => {
    if (!isManager) {
      if (!canEdit) handleViewerAttemptEdit();
      else showToast('Only Admins and Managers can rename characters.');
      return;
    }
    try {
      await firestoreData.updateCharacter(id, name);
      setData((prev) =>
        prev
          ? { ...prev, characters: prev.characters.map((c) => (c.id === id ? { ...c, name } : c)) }
          : prev
      );
    } catch (err: unknown) {
      showToast(formatErrorForToast(err, 'Failed to update character'));
    }
  };

  const handleDeleteCharacter = async (id: string) => {
    if (!isAdmin) {
      showToast('Only Administrators can delete characters.');
      return;
    }
    try {
      await firestoreData.deleteCharacter(id);
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          characters: prev.characters.filter((c) => c.id !== id),
          episodes: prev.episodes.map((e) => ({
            ...e,
            characters: (e.characters || []).filter((cId) => cId !== id),
          })),
        };
      });
      showToast('Character removed from all episodes');
    } catch (err: unknown) {
      showToast(formatErrorForToast(err, 'Failed to delete character'));
    }
  };

  const handleSetOverride = async (key: string, ov: Partial<ActivityOverride>) => {
    if (!canEdit) {
      handleViewerAttemptEdit();
      return;
    }
    try {
      await firestoreData.setOverride(key, ov, user.name);
      await firestoreData.logAudit(user, 'SET_OVERRIDE', 'ActivityOverride', key);
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          overrides: {
            ...prev.overrides,
            [key]: { ...(prev.overrides[key] || { key }), ...ov },
          },
        };
      });
      showToast('Assignment & notes saved');
    } catch (err: unknown) {
      showToast(formatErrorForToast(err, 'Failed to save assignment'));
    }
  };

  // Backups and Reset
  const handleExportBackup = () => {
    const backup = {
      app: 'convengers-bahay-build',
      format: 1,
      exportedAt: new Date().toISOString(),
      settings: data.settings,
      milestones: data.milestones,
      scopes: data.scopes,
      activities: data.activities,
      pours: data.pours,
      episodes: data.episodes,
      characters: data.characters,
      overrides: data.overrides,
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Convengers_Backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Exported JSON backup');
  };

  const handleImportBackup = async (file: File) => {
    if (!isManager) {
      showToast('Only Admins and Managers can import project backups.');
      return;
    }
    showToast('Importing JSON backup...');
    try {
      const text = await file.text();
      if (!text || !text.trim()) {
        throw new Error('The selected JSON file is empty.');
      }
      const cleanText = text.replace(/^\uFEFF/, '').trim();
      let json: unknown;
      try {
        json = JSON.parse(cleanText);
      } catch {
        throw new Error('Invalid JSON syntax in the selected backup file.');
      }
      const imported = await firestoreData.importBackup(json, user);
      setIsEditingText(false);
      setData((prev) =>
        prev
          ? {
              ...prev,
              ...imported,
              settings: imported.settings ? { ...prev.settings, ...imported.settings } : prev.settings,
              overrides: imported.overrides ?? prev.overrides,
            }
          : prev
      );
      showToast('Backup imported and synced to Firestore!');
    } catch (err: unknown) {
      showToast(formatErrorForToast(err, 'Failed to import JSON backup'));
    }
  };

  const handleReset = () => {
    if (!isAdmin) {
      showToast('Only an Administrator can reset the project database.');
      return;
    }
    setIsResetConfirmOpen(true);
  };

  const executeReset = async () => {
    setIsResetConfirmOpen(false);
    try {
      await firestoreData.resetToBaseline(user);
      showToast('Project reset to factory baseline');
    } catch (err: unknown) {
      showToast(formatErrorForToast(err, 'Reset failed'));
    }
  };

  if (!data) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#03051a] text-white">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-[#F5C518] border-t-transparent rounded-full animate-spin" />
          <b className="font-['Barlow_Condensed'] text-xl tracking-wider text-[#F5C518]">
            LOADING CONVENGERS BAHAY BUILD TIMELINE...
          </b>
        </div>
      </div>
    );
  }

  const handleJumpToRow = useCallback((targetKey: string) => {
    let targetSlide = 's1';
    if (targetKey.startsWith('c|GF|')) targetSlide = 's3';
    else if (targetKey.startsWith('c|2F|')) targetSlide = 's4';
    else if (targetKey.startsWith('c|3F|')) targetSlide = 's5';
    else if (targetKey.startsWith('m|')) targetSlide = 's1';
    else if (targetKey.startsWith('p|')) targetSlide = 's6';
    else if (targetKey.startsWith('e|')) targetSlide = 's7';
    const el = document.getElementById(targetSlide);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const waitForImagesAndPrint = useCallback(async () => {
    const imgs = Array.from(document.images);
    await Promise.all(
      imgs.map(async (img) => {
        if (!img.complete) {
          await new Promise<void>((resolve) => {
            const done = () => resolve();
            img.addEventListener('load', done, { once: true });
            img.addEventListener('error', done, { once: true });
            setTimeout(done, 1500);
          });
        }
        if (typeof img.decode === 'function') {
          await img.decode().catch(() => {});
        }
      })
    );
    window.print();
  }, []);

  // Print PDF & Formal Report
  const handlePrintPdf = async () => {
    document.body.classList.remove('pmrep-active');
    setIsPrintingReport(false);
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    await waitForImagesAndPrint();
  };

  const handlePrintReport = async () => {
    setIsPrintingReport(true);
    document.body.classList.add('pmrep-active');
    const cleanup = () => {
      document.body.classList.remove('pmrep-active');
      setIsPrintingReport(false);
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    await new Promise<void>((r) => setTimeout(r, 140));
    await waitForImagesAndPrint();
    cleanup();
  };

  const handleDownloadHtml = () => {
    showToast('Preparing standalone HTML presentation...');
    try {
      exportDashboardAsHtml();
      showToast('Downloaded HTML presentation!');
    } catch (err: unknown) {
      showToast(formatErrorForToast(err, 'Failed to export HTML'));
    }
  };

  return (
    <div className={isEditingText ? 'editing' : ''}>
      {/* Sticky Toolbar */}
      <Toolbar
        user={user}
        settings={data.settings}
        isEditing={isEditingText}
        isLiveConnected={isLiveConnected}
        collaborators={collaborators}
        onToggleEditing={() => {
          if (!canEdit) {
            handleViewerAttemptEdit();
            return;
          }
          setIsEditingText(!isEditingText);
        }}
        onOpenAuth={() => setIsAuthOpen(true)}
        onOpenShare={() => setIsShareOpen(true)}
        onToggleTheme={handleToggleTheme}
        onChangePaper={handleChangePaper}
        onPrintPdf={handlePrintPdf}
        onPrintReport={handlePrintReport}
        onDownloadHtml={handleDownloadHtml}
        onExportBackup={handleExportBackup}
        onImportBackup={handleImportBackup}
        onOpenAuditLogs={() => setIsAuditOpen(true)}
        onReset={handleReset}
        onOpenAdminPanel={() => setIsAdminPanelOpen(true)}
        isAdminPresentationMode={isAdminPresentationMode}
        onToggleAdminPresentationMode={() => {
          setIsAdminPresentationMode((prev) => {
            const next = !prev;
            if (next) {
              setIsEditingText(false);
              showToast('👁️ Admin Presentation Mode ON: All edit controls hidden for client presentation.');
            } else {
              showToast('✏️ Admin Presentation Mode OFF: Editing controls restored.');
            }
            return next;
          });
        }}
      />

      {/* Intro Header */}
      <header className="intro">
        <h1>Convengers Assemble — Scope of Work Timeline</h1>
        <p>
          Interactive full-stack project dashboard for the Convengers Bahay Build: timeline, scopes of work, concrete pouring milestones, upcoming activities, and production calendar. Official portal at <b className="text-[#F5C518]">www.ConvengersAssemble.com</b>. Real-time persistent database with role-based permissions and secure authentication.
        </p>
      </header>

      {/* Slide Navigation Jump Bar */}
      <nav className="jumpnav max-w-[1920px] mx-auto px-4 py-2 sticky top-[48px] z-30 flex items-center justify-between gap-2 overflow-x-auto bg-[#0A1140]/95 backdrop-blur border-y border-[#7B4DFF]/60 shadow-[0_4px_16px_rgba(0,0,0,0.5)] mb-4 rounded-b-lg">
        <div className="flex items-center gap-2">
          <span className="text-[#F5C518] font-bold text-xs uppercase tracking-wider whitespace-nowrap">
            Jump to Slide:
          </span>
          {[
            { id: 's1', label: '01 Overview' },
            { id: 's2', label: '02 Upcoming' },
            { id: 's3', label: '03 GF' },
            { id: 's4', label: '04 2F' },
            { id: 's5', label: '05 3F' },
            { id: 's6', label: '06 Concrete Pours' },
            { id: 's7', label: '07 Production Calendar' },
            { id: 's8', label: '08 Episodes Table' },
            { id: 's9', label: '★ 09 Master Timeline (Construction + Production)', highlight: true },
            { id: 's10', label: '10 Methodology' },
            { id: 's11', label: '11 Watch Items & Holidays' },
            { id: 's12', label: '12 Schedule Notes' },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                const el = document.getElementById(item.id);
                if (el) {
                  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
              }}
              className={`px-2.5 py-1 rounded text-xs font-semibold whitespace-nowrap transition-all border ${
                item.highlight
                  ? 'bg-[#7B4DFF] text-[#F5C518] border-[#F5C518] shadow-[0_0_12px_rgba(245,197,24,0.5)] font-bold'
                  : 'bg-[#121C5A] text-[#BAC4E2] hover:text-white border-[#7B4DFF]/40 hover:border-[#7B4DFF]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="text-[11px] text-[#BAC4E2] font-mono hidden xl:block">
          Official Portal: <span className="text-[#F5C518]">www.ConvengersAssemble.com</span>
        </div>
      </nav>

      {/* Main Multi-Slide Stage */}
      <main className="stage" id="stage">
        {/* Slide 1: Executive Overview */}
        <div id="s1">
          <OverviewSlide
            milestones={data.milestones}
            scopes={data.scopes}
            pours={data.pours}
            episodes={data.episodes}
            settings={data.settings}
            canEdit={canEdit}
            canEditTimeline={isManager}
            onUpdateMilestone={handleUpdateMilestone}
            onUpdateMilestoneField={handleUpdateMilestoneField}
            onViewerAttemptEdit={handleViewerAttemptEdit}
            remoteFocusMap={remoteFocusMap}
          />
        </div>

        {/* Slide 2: Upcoming / Next Activities */}
        <div id="s2">
          <UpcomingActivitiesSlide
            activities={data.activities}
            scopes={data.scopes}
            milestones={data.milestones}
            episodes={data.episodes}
            pours={data.pours}
            overrides={data.overrides}
            settings={data.settings}
            canEdit={canEdit}
            canEditTimeline={isManager}
            canDelete={isAdmin}
            onAddActivity={handleAddActivity}
            onUpdateActivity={handleUpdateActivity}
            onDeleteActivity={handleDeleteActivity}
            onSetOverride={handleSetOverride}
            onJumpToRow={handleJumpToRow}
            onViewerAttemptEdit={handleViewerAttemptEdit}
          />
        </div>

        {/* Slide 3: Ground Floor */}
        <div id="s3">
          <FloorScopeSlide
            floor="GF"
            slideNumber="03"
            scopes={data.scopes}
            episodes={data.episodes}
            settings={data.settings}
            canEdit={canEdit}
            canEditTimeline={isManager}
            canDelete={isAdmin}
            onUpdateProgress={handleUpdateScopeProgress}
            onUpdateScopeField={handleUpdateScopeField}
            onUpdateScopeWorkingDays={handleUpdateScopeWorkingDays}
            onAddScope={handleAddScope}
            onDeleteScope={handleDeleteScope}
            onViewerAttemptEdit={handleViewerAttemptEdit}
            remoteFocusMap={remoteFocusMap}
          />
        </div>

        {/* Slide 4: Second Floor */}
        <div id="s4">
          <FloorScopeSlide
            floor="2F"
            slideNumber="04"
            scopes={data.scopes}
            episodes={data.episodes}
            settings={data.settings}
            canEdit={canEdit}
            canEditTimeline={isManager}
            canDelete={isAdmin}
            onUpdateProgress={handleUpdateScopeProgress}
            onUpdateScopeField={handleUpdateScopeField}
            onUpdateScopeWorkingDays={handleUpdateScopeWorkingDays}
            onAddScope={handleAddScope}
            onDeleteScope={handleDeleteScope}
            onViewerAttemptEdit={handleViewerAttemptEdit}
            remoteFocusMap={remoteFocusMap}
          />
        </div>

        {/* Slide 5: Third Floor */}
        <div id="s5">
          <FloorScopeSlide
            floor="3F"
            slideNumber="05"
            scopes={data.scopes}
            episodes={data.episodes}
            settings={data.settings}
            canEdit={canEdit}
            canEditTimeline={isManager}
            canDelete={isAdmin}
            onUpdateProgress={handleUpdateScopeProgress}
            onUpdateScopeField={handleUpdateScopeField}
            onUpdateScopeWorkingDays={handleUpdateScopeWorkingDays}
            onAddScope={handleAddScope}
            onDeleteScope={handleDeleteScope}
            onViewerAttemptEdit={handleViewerAttemptEdit}
            remoteFocusMap={remoteFocusMap}
          />
        </div>

        {/* Slide 6: Concrete Pouring Milestones */}
        <div id="s6">
          <ConcretePourSlide
            pours={data.pours}
            settings={data.settings}
            canEdit={canEdit}
            canEditTimeline={isManager}
            canDelete={isAdmin}
            onAddPour={handleAddPour}
            onUpdatePour={handleUpdatePour}
            onDeletePour={handleDeletePour}
            onViewerAttemptEdit={handleViewerAttemptEdit}
          />
        </div>

        {/* Slide 7: Production Calendar & Multiverse Characters */}
        <div id="s7">
          <ContentCalendarSlide
            episodes={data.episodes}
            characters={data.characters}
            settings={data.settings}
            canEdit={canEdit}
            canEditTimeline={isManager}
            canDelete={isAdmin}
            onAddEpisode={handleAddEpisode}
            onUpdateEpisode={handleUpdateEpisode}
            onDeleteEpisode={handleDeleteEpisode}
            onAddCharacter={handleAddCharacter}
            onUpdateCharacter={handleUpdateCharacter}
            onDeleteCharacter={handleDeleteCharacter}
            onViewerAttemptEdit={handleViewerAttemptEdit}
          />
        </div>

        {/* Slide 8: 24 Episodes Table */}
        <div id="s8">
          <EpisodesTableSlide
            episodes={data.episodes}
            settings={data.settings}
            canEdit={canEdit}
            canEditTimeline={isManager}
            onUpdateEpisode={handleUpdateEpisode}
            onViewerAttemptEdit={handleViewerAttemptEdit}
          />
        </div>

        {/* Slide 9: Overall Project Timeline (Construction + Production Master Schedule) */}
        <div id="s9">
          <OverallProjectTimelineSlide
            milestones={data.milestones}
            scopes={data.scopes}
            pours={data.pours}
            episodes={data.episodes}
            settings={data.settings}
            canEdit={canEdit}
            onUpdateMilestone={handleUpdateMilestone}
            onUpdateEpisode={handleUpdateEpisode}
            onViewerAttemptEdit={handleViewerAttemptEdit}
            remoteFocusMap={remoteFocusMap}
          />
        </div>

        {/* Slide 10: Structural Methodology (Moved to last pages) */}
        <div id="s10">
          <MethodologySlide settings={data.settings} />
        </div>

        {/* Slide 11: Watch Items & Philippine Holidays (Moved to last pages) */}
        <div id="s11">
          <HolidaysSlide settings={data.settings} />
        </div>

        {/* Slide 12: Schedule Notes & Validation Items (Moved to last pages) */}
        <div id="s12">
          <NotesSlide settings={data.settings} />
        </div>
      </main>

      {/* Printable Report View (shown during Print Report) */}
      <PrintReport data={data} />

      {/* Modals */}
      {isAuthOpen && (
        <AuthModal
          currentUser={user}
          onClose={() => setIsAuthOpen(false)}
          onLogin={async (email, pass) => {
            const signedInUser = await authService.signIn(email, pass);
            setData((prev) => (prev ? { ...prev, user: signedInUser } : prev));
            setIsAdminPresentationMode(false);
            if (signedInUser.role === 'pending') {
              showToast('Signed in! Your account is awaiting administrator approval.');
            } else {
              showToast(`Welcome to Madhouse Team, ${signedInUser.name} (${signedInUser.role.toUpperCase()})`);
            }
            if (signedInUser.role === 'admin' || signedInUser.role === 'manager') {
              firestoreData.seedInitialDataIfEmpty(signedInUser);
            }
          }}
          onRegister={async (name, email, pass) => {
            const registeredUser = await authService.register(name, email, pass);
            setData((prev) => (prev ? { ...prev, user: registeredUser } : prev));
            setIsAdminPresentationMode(false);
            if (registeredUser.role === 'admin') {
              showToast(`Administrator bootstrapped: Welcome ${registeredUser.name}!`);
              firestoreData.seedInitialDataIfEmpty(registeredUser);
            } else {
              showToast('Account registered as PENDING. Awaiting administrator approval.');
            }
          }}
          onGoogleLogin={async () => {
            const signedInUser = await authService.signInWithGoogle();
            setData((prev) => (prev ? { ...prev, user: signedInUser } : prev));
            setIsAdminPresentationMode(false);
            if (signedInUser.role === 'pending') {
              showToast('Signed in! Your account is awaiting administrator approval.');
            } else {
              showToast(`Welcome to Madhouse Team, ${signedInUser.name} (${signedInUser.role.toUpperCase()})`);
            }
            if (signedInUser.role === 'admin' || signedInUser.role === 'manager') {
              firestoreData.seedInitialDataIfEmpty(signedInUser);
            }
          }}
          onLogout={async () => {
            await authService.signOut();
            setIsEditingText(false);
            setIsAdminPresentationMode(false);
            setIsAdminPanelOpen(false);
            showToast('Signed out · Viewing in Presentation (Read-Only) mode');
          }}
          onOpenAdminPanel={() => setIsAdminPanelOpen(true)}
        />
      )}

      {isAdminPanelOpen && user.role === 'admin' && (
        <AdminPanelModal
          currentUser={user}
          onClose={() => setIsAdminPanelOpen(false)}
          onShowToast={showToast}
        />
      )}

      {isShareOpen && (
        <ShareModal
          onClose={() => setIsShareOpen(false)}
          onPrintPdf={handlePrintPdf}
          onCopyLink={() => {
            navigator.clipboard.writeText(window.location.href);
            showToast('Link copied to clipboard!');
          }}
        />
      )}

      {isAuditOpen && (
        <AuditLogModal
          logs={data.auditLogs}
          onClose={() => setIsAuditOpen(false)}
        />
      )}

      {isResetConfirmOpen && isAdmin && (
        <div className="shm">
          <div className="shbox" style={{ maxWidth: '460px' }}>
            <div className="shhead">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>⚠️</span> Confirm Project Baseline Reset
              </h2>
              <button type="button" className="shx" onClick={() => setIsResetConfirmOpen(false)}>
                ×
              </button>
            </div>
            <p className="text-xs text-[#BAC4E2] leading-relaxed mb-4">
              Are you sure you want to reset all milestones, scopes, concrete pours, and production episodes in Firestore back to the original baseline?
            </p>
            <div className="shrow justify-end">
              <button type="button" className="shbtn" onClick={() => setIsResetConfirmOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="shbtn"
                style={{ borderColor: '#E0213B', background: '#E0213B', color: '#fff' }}
                onClick={executeReset}
              >
                Yes, Reset Baseline
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div id="pmtoast">
          {toastMessage}
        </div>
      )}
    </div>
  );
}
