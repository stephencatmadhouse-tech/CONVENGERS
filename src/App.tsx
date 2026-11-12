/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
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
  ProjectIssue,
  ProjectReport,
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
import { recalculateScopeTimeline, parseDateWindow, toIsoDate } from './utils/calculations.ts';
import { exportDashboardAsHtml } from './utils/htmlExporter.ts';
import { controlStore, ControlState } from './firebase/controlStore.ts';
import {
  buildRegister,
  resolveMeta,
  RegisterActivity,
  scopeKey,
  legacyScopeKey,
  milestoneKey,
  legacyMilestoneKey,
  pourKey,
  episodeKey,
  manualKey,
} from './domain/register.ts';
import { computeMetrics } from './domain/metrics.ts';
import { buildAlignment } from './domain/alignment.ts';
import { buildAttention } from './domain/attention.ts';
import { makeSnapshot } from './domain/validation.ts';
import { todayIso, toScopeDateText, isValidIso } from './domain/dates.ts';
import { CommandProvider, CommandState, ActivityPatch } from './command/context.tsx';
import { sanitizeReport } from './domain/portal.ts';
import { portalStore, procurementStore, manpowerStore, documentStore, publicationStore, budgetStore, expenseStore } from './firebase/opsStores.ts';
import { Shell, SlideKey, useHashRoute } from './command/Shell.tsx';
import { ActivityEditor } from './command/ActivityEditor.tsx';
import { ConfirmDialog } from './command/ui.tsx';
import './command/command.css';

function windowOf(text: string | undefined): [string, string] | [undefined, undefined] {
  const w = parseDateWindow(text || '');
  return w ? [toIsoDate(w[0]), toIsoDate(w[1])] : [undefined, undefined];
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const nextFrames = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

const THEME_KEY = 'convengers_ui_theme';

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
  const [uiTheme, setUiTheme] = useState<'light' | 'dark'>(() => {
    try {
      return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });

  // Command Center state
  const route = useHashRoute();
  const [control, setControl] = useState<ControlState>(() => controlStore.getState());
  const [today, setToday] = useState(() => todayIso());
  const [dbReady, setDbReady] = useState(false);
  const [openActivityId, setOpenActivityId] = useState<string | null>(null);
  const [printNode, setPrintNode] = useState<React.ReactNode>(null);
  const [pendingImport, setPendingImport] = useState<File | null>(null);
  const dataRef = useRef(data);
  dataRef.current = data;

  useEffect(() => controlStore.subscribe(setControl), []);
  useEffect(() => {
    const t = setInterval(() => setToday(todayIso()), 60000);
    return () => clearInterval(t);
  }, []);

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
    // Slides scale to the width of the Command Center main column
    const handleResize = () => {
      const main = document.getElementById('cv-main');
      const w = main ? main.clientWidth - 44 + 32 : window.innerWidth;
      const s = Math.min(1, Math.max((w - 32) / 1920, window.innerWidth < 900 ? 0.42 : 0));
      document.documentElement.style.setProperty('--s', String(s));
      const tb = document.querySelector('.toolbar') as HTMLElement | null;
      if (tb) document.documentElement.style.setProperty('--cv-toolbar-h', `${tb.offsetHeight}px`);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(handleResize) : null;
    const main = document.getElementById('cv-main');
    if (ro && main) ro.observe(main);
    const tb = document.querySelector('.toolbar');
    if (ro && tb) ro.observe(tb);
    return () => {
      window.removeEventListener('resize', handleResize);
      ro?.disconnect();
    };
  }, []);

  // Theme: the Convengers light theme is the standard look for everyone.
  // The original dark look remains available as a per-device preference.
  useEffect(() => {
    document.documentElement.setAttribute('data-eff', uiTheme);
    try {
      localStorage.setItem(THEME_KEY, uiTheme);
    } catch {
      // storage unavailable — preference applies to this session only
    }
  }, [uiTheme]);

  // Dual-mode print style injection: Formal A4 Portrait Report vs Landscape Slide PDF
  useEffect(() => {
    let styleEl = document.getElementById('printstyle') as HTMLStyleElement;
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'printstyle';
      document.head.appendChild(styleEl);
    }

    if (isPrintingReport || printNode) {
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
    const pageBg = uiTheme === 'light' ? '#FFFFFF' : '#03051a';

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
  }, [data?.settings?.paper, uiTheme, isPrintingReport, printNode]);

  // Real-Time Firebase Auth and Firestore Subscriptions
  useEffect(() => {
    const unsubAuth = authService.onUserChange((fbUser) => {
      setData((prev) => (prev ? { ...prev, user: fbUser } : prev));
      if (fbUser && (fbUser.role === 'admin' || fbUser.role === 'manager')) {
        firestoreData.seedInitialDataIfEmpty(fbUser);
      }
    });

    const unsubFirestore = firestoreData.subscribeAll((freshData) => {
      if (freshData.scopes || freshData.milestones) setDbReady(true);
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

  // ===== MASTER PROJECT REGISTER (single derived source of truth) =====
  const register = useMemo(
    () =>
      buildRegister(
        {
          scopes: data.scopes,
          pours: data.pours,
          milestones: data.milestones,
          episodes: data.episodes,
          activities: data.activities,
          overrides: data.overrides,
          characters: data.characters,
        },
        today
      ),
    [data.scopes, data.pours, data.milestones, data.episodes, data.activities, data.overrides, data.characters, today]
  );
  const registerRef = useRef(register);
  registerRef.current = register;
  const metrics = useMemo(() => computeMetrics(register, data.milestones, today), [register, data.milestones, today]);
  const alignment = useMemo(() => buildAlignment(register, today), [register, today]);
  const attention = useMemo(() => buildAttention(register, control.issues, alignment, today), [register, control.issues, alignment, today]);

  /**
   * Write activity control metadata to its stable key. Legacy-keyed values
   * (owner, remarks…) are merged in so nothing is lost when a scope's name
   * or date changes.
   */
  const writeMeta = useCallback(
    async (key: string, patch: Partial<ActivityOverride>, legacyKeys?: string[]) => {
      const legacy = legacyKeys ?? (registerRef.current.find((r) => r.key === key)?.legacyKeys || []);
      const merged = resolveMeta(dataRef.current.overrides, key, legacy);
      const next: ActivityOverride = { ...merged, ...patch, key };
      Object.keys(next).forEach((k) => (next as any)[k] === undefined && delete (next as any)[k]);
      const stamp = new Date().toISOString();
      setData((prev) => ({ ...prev, overrides: { ...prev.overrides, [key]: { ...next, updatedAt: stamp, updatedBy: user.name } } }));
      await firestoreData.setOverride(key, next, user.name);
      await firestoreData.logAudit(user, 'SET_OVERRIDE', 'ActivityOverride', key, Object.keys(patch).join(', '));
    },
    [user]
  );

  /** Preserve the baseline and log a schedule revision when dates change. */
  const recordRevision = useCallback(
    async (key: string, legacyKeys: string[], from: [string | undefined, string | undefined], to: [string | undefined, string | undefined]) => {
      const [fs, ff] = from;
      const [ts, tf] = to;
      if (!fs && !ff) return;
      if (fs === ts && ff === tf) return;
      const meta = resolveMeta(dataRef.current.overrides, key, legacyKeys);
      const now = new Date().toISOString();
      try {
        await writeMeta(
          key,
          {
            baselineStart: meta.baselineStart || fs,
            baselineFinish: meta.baselineFinish || ff,
            revisionCount: (meta.revisionCount || 0) + 1,
            lastRevisedAt: now,
            revisions: [...(meta.revisions || []), { at: now, by: user.name, fromStart: fs, fromFinish: ff, toStart: ts, toFinish: tf }].slice(-12),
          },
          legacyKeys
        );
      } catch {
        // Revision log is best-effort; the schedule change itself is already saved
      }
    },
    [writeMeta, user]
  );

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
  const handleToggleTheme = () => {
    const next = uiTheme === 'light' ? 'dark' : 'light';
    // Apply immediately so display-only colour mapping uses the new theme on this render
    document.documentElement.setAttribute('data-eff', next);
    setUiTheme(next);
    showToast(next === 'light' ? 'Light theme (standard)' : 'Dark theme on this device');
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

    const oldMs = dataRef.current.milestones.find((m) => m.id === id);
    if (oldMs) {
      const legacy = [legacyMilestoneKey(oldMs)];
      if (field === 'dateText') {
        recordRevision(milestoneKey(oldMs), legacy, windowOf(oldMs.dateText), windowOf(trimmed));
      } else if (dataRef.current.overrides[legacy[0]] && !dataRef.current.overrides[milestoneKey(oldMs)]) {
        writeMeta(milestoneKey(oldMs), {}, legacy).catch(() => {});
      }
    }

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
    // Record actual start / finish on the day progress is first reported
    const oldScope = dataRef.current.scopes.find((s) => s.id === id);
    if (oldScope) {
      const legacy = [legacyScopeKey(oldScope)];
      const meta = resolveMeta(dataRef.current.overrides, scopeKey(oldScope), legacy);
      const patch: Partial<ActivityOverride> = {};
      if (percent > 0 && !meta.actualStart) patch.actualStart = todayIso();
      if (percent >= 100 && !meta.actualFinish) patch.actualFinish = todayIso();
      if (Object.keys(patch).length) writeMeta(scopeKey(oldScope), patch, legacy).catch(() => {});
    }
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
    if (targetScope) {
      const legacy = [legacyScopeKey(targetScope)];
      if (field === 'dateText') {
        recordRevision(scopeKey(targetScope), legacy, windowOf(targetScope.dateText), windowOf(trimmed));
      } else if (dataRef.current.overrides[legacy[0]] && !dataRef.current.overrides[scopeKey(targetScope)]) {
        writeMeta(scopeKey(targetScope), {}, legacy).catch(() => {});
      }
    }
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
    const oldAct = dataRef.current.activities.find((a) => a.id === id);
    if (oldAct && (safeUpdates.startDate !== undefined || safeUpdates.endDate !== undefined)) {
      recordRevision(manualKey(oldAct), [], [oldAct.startDate, oldAct.endDate], [safeUpdates.startDate ?? oldAct.startDate, safeUpdates.endDate ?? oldAct.endDate]);
    }
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
    const oldPour = dataRef.current.pours.find((p) => p.id === id);
    if (oldPour && (safeUpdates.targetPour !== undefined || safeUpdates.targetCompletion !== undefined)) {
      recordRevision(
        pourKey(oldPour),
        [],
        [oldPour.targetPour || undefined, oldPour.targetCompletion || oldPour.targetPour || undefined],
        [safeUpdates.targetPour ?? oldPour.targetPour, safeUpdates.targetCompletion ?? oldPour.targetCompletion]
      );
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
    const oldEp = dataRef.current.episodes.find((e) => e.id === id);
    if (oldEp && (safeUpdates.shootStart !== undefined || safeUpdates.shootEnd !== undefined)) {
      recordRevision(
        episodeKey(oldEp),
        [],
        [oldEp.shootStart || undefined, oldEp.shootEnd || oldEp.shootStart || undefined],
        [safeUpdates.shootStart ?? oldEp.shootStart, safeUpdates.shootEnd ?? oldEp.shootEnd]
      );
    }
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
      await writeMeta(key, ov);
      showToast('Assignment & notes saved');
    } catch (err: unknown) {
      showToast(formatErrorForToast(err, 'Failed to save assignment'));
    }
  };

  // Backups and Reset
  const handleExportBackup = () => {
    const backup = {
      app: 'convengers-bahay-build',
      format: 2,
      exportedAt: new Date().toISOString(),
      settings: data.settings,
      milestones: data.milestones,
      scopes: data.scopes,
      activities: data.activities,
      pours: data.pours,
      episodes: data.episodes,
      characters: data.characters,
      overrides: data.overrides,
      // Command Center records (reports, issues, progress snapshots)
      reports: control.reports.map(({ localOnly: _l, ...r }) => r),
      issues: control.issues.map(({ localOnly: _l, ...r }) => r),
      snapshots: control.snapshots.map(({ localOnly: _l, ...r }) => r),
      // Operations & publishing records (finance only for managers)
      operations: {
        procurement: procurementStore.getState().items,
        manpower: manpowerStore.getState().items,
        documents: documentStore.getState().items,
        publications: publicationStore.getState().items,
        ...(isManager ? { budget: budgetStore.getState().items, expenses: expenseStore.getState().items } : {}),
      },
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
      const src: any = json && typeof json === 'object' ? json : {};
      const hasControl = Array.isArray(src.reports) || Array.isArray(src.issues) || Array.isArray(src.snapshots) || (src.report && src.report.id) || !!src.operations;
      let controlMsg = '';
      if (hasControl) {
        const res = await controlStore.importRecords({
          reports: Array.isArray(src.reports) ? src.reports : src.report ? [src.report] : [],
          issues: src.issues,
          snapshots: src.snapshots,
        });
        controlMsg = ` · ${res.imported} report/issue/snapshot record(s) merged, ${res.skipped} kept unchanged`;
      }
      if (src.operations && typeof src.operations === 'object') {
        const ops = src.operations as Record<string, any[]>;
        const pairs: [string, any][] = [
          ['procurement', procurementStore],
          ['manpower', manpowerStore],
          ['documents', documentStore],
          ['publications', publicationStore],
          ...(isManager ? ([['budget', budgetStore], ['expenses', expenseStore]] as [string, any][]) : []),
        ];
        let merged = 0;
        for (const [k, st] of pairs) {
          const existing = new Set(st.getState().items.map((x: any) => x.id));
          for (const rec of Array.isArray(ops[k]) ? ops[k] : []) {
            if (!rec?.id || existing.has(rec.id)) continue; // never overwrite existing records
            const { localOnly: _l, ...clean } = rec;
            await st.put(clean);
            merged++;
          }
        }
        controlMsg += ` · ${merged} operations record(s) added`;
      }
      const PROJECT_KEYS = ['milestones', 'scopes', 'pours', 'episodes', 'activities', 'characters', 'overrides', 'ms', 'pct', 'pm', 'page', 'data', 'dashboard'];
      if (!PROJECT_KEYS.some((k) => src[k] !== undefined)) {
        if (!hasControl) throw new Error('No recognizable project data found in this JSON file.');
        showToast(`Imported${controlMsg}`);
        return;
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
      showToast(`Backup imported and synced to Firestore!${controlMsg}`);
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

  const navigate = useCallback((r: string) => {
    const next = `#/${r.replace(/^#?\/?/, '')}`;
    if (window.location.hash !== next) window.location.hash = next;
  }, []);

  const handleJumpToRow = useCallback(
    (targetKey: string) => {
      const [prefix, id] = targetKey.split('|');
      if (prefix === 'sc') {
        const sc = dataRef.current.scopes.find((x) => x.id === id);
        navigate(`construction/${sc ? sc.floor.toLowerCase() : 'gf'}`);
      } else if (prefix === 'c') navigate(`construction/${(id || 'gf').toLowerCase()}`);
      else if (prefix === 'p') navigate('construction/pours');
      else if (prefix === 'e') navigate('production/calendar');
      else navigate('overview/slide');
    },
    [navigate]
  );

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
  const ensureDeck = async () => {
    if (!(route.section === 'overview' && route.tab === 'deck')) {
      navigate('overview/deck');
      await wait(700);
    }
    await nextFrames();
  };

  const handlePrintPdf = async () => {
    document.body.classList.remove('pmrep-active');
    setIsPrintingReport(false);
    await ensureDeck();
    await waitForImagesAndPrint();
  };

  /** Print any Command Center document (reports) in the Convengers A4 layout. */
  const printElement = useCallback(
    async (render: () => React.ReactNode, title: string) => {
      const prevTitle = document.title;
      document.title = title;
      setPrintNode(render());
      document.body.classList.add('cv-printing');
      const cleanup = () => {
        document.body.classList.remove('cv-printing');
        setPrintNode(null);
        document.title = prevTitle;
        window.removeEventListener('afterprint', cleanup);
      };
      window.addEventListener('afterprint', cleanup);
      await wait(150);
      await waitForImagesAndPrint();
      cleanup();
    },
    [waitForImagesAndPrint]
  );

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

  const handleDownloadHtml = async () => {
    showToast('Preparing standalone HTML presentation...');
    await ensureDeck();
    try {
      exportDashboardAsHtml();
      showToast('Downloaded HTML presentation!');
    } catch (err: unknown) {
      showToast(formatErrorForToast(err, 'Failed to export HTML'));
    }
  };


  // ===== COMMAND CENTER ACTIONS =====
  /** Apply an edit from any Command Center module to the ORIGINAL record. */
  const patchActivity = async (r: RegisterActivity, patch: ActivityPatch): Promise<boolean> => {
    if (!canEdit) {
      handleViewerAttemptEdit();
      return false;
    }
    try {
      const meta: Partial<ActivityOverride> = {};
      (['supporting', 'department', 'priority', 'commitment', 'dependsOn', 'concern', 'correctiveAction', 'resolutionDate', 'onHold'] as const).forEach((k) => {
        if (patch[k] !== undefined) (meta as any)[k] = patch[k];
      });
      if (r.kind !== 'pour') {
        if (patch.actualStart !== undefined) meta.actualStart = patch.actualStart || undefined;
        if (patch.actualFinish !== undefined) meta.actualFinish = patch.actualFinish || undefined;
      }
      if (patch.owner !== undefined && r.kind !== 'episode' && r.kind !== 'manual') meta.owner = patch.owner;
      if (patch.remarks !== undefined && (r.kind === 'scope' || r.kind === 'milestone')) meta.remarks = patch.remarks;
      const datesChanged = patch.start !== undefined || patch.finish !== undefined;
      const newStart = patch.start !== undefined ? patch.start : r.start;
      const newFinish = patch.finish !== undefined ? patch.finish : r.finish;
      if (datesChanged && (!isValidIso(newStart) || (newFinish && !isValidIso(newFinish)))) {
        showToast('Start and finish dates are required.');
        return false;
      }

      switch (r.kind) {
        case 'scope': {
          if (patch.name !== undefined) await handleUpdateScopeField(r.sourceId, 'name', patch.name);
          if (datesChanged) await handleUpdateScopeField(r.sourceId, 'dateText', toScopeDateText(newStart!, newFinish || newStart!));
          if (patch.progress !== undefined) {
            await handleUpdateScopeProgress(r.sourceId, patch.progress);
            // Explicit actual dates in the same edit take precedence over auto-recorded ones
          }
          break;
        }
        case 'pour': {
          const u: Partial<ConcretePour> = {};
          if (patch.start !== undefined) u.targetPour = patch.start;
          if (patch.finish !== undefined) u.targetCompletion = patch.finish;
          if (patch.actualStart !== undefined) u.actualPour = patch.actualStart;
          if (patch.actualFinish !== undefined) u.actualCompletion = patch.actualFinish;
          if (patch.sourceStatus !== undefined) u.milestoneStatus = patch.sourceStatus as ConcretePour['milestoneStatus'];
          if (patch.remarks !== undefined) u.remarks = patch.remarks;
          if (Object.keys(u).length) await handleUpdatePour(r.sourceId, u);
          break;
        }
        case 'milestone': {
          if (patch.name !== undefined) await handleUpdateMilestoneField(r.sourceId, 'label', patch.name);
          if (datesChanged) await handleUpdateMilestoneField(r.sourceId, 'dateText', toScopeDateText(newStart!, newFinish || newStart!));
          if (patch.sourceStatus !== undefined) await handleUpdateMilestone(r.sourceId, patch.sourceStatus as Milestone['status']);
          break;
        }
        case 'episode': {
          const u: Partial<Episode> = {};
          if (patch.start !== undefined) u.shootStart = patch.start;
          if (patch.finish !== undefined) u.shootEnd = patch.finish;
          if (patch.sourceStatus !== undefined) u.status = patch.sourceStatus as Episode['status'];
          if (patch.owner !== undefined) u.director = patch.owner;
          if (patch.remarks !== undefined) u.remarks = patch.remarks;
          if (Object.keys(u).length) await handleUpdateEpisode(r.sourceId, u);
          break;
        }
        case 'manual': {
          const u: Partial<Activity> = {};
          if (patch.name !== undefined) u.title = patch.name;
          if (patch.start !== undefined) u.startDate = patch.start;
          if (patch.finish !== undefined) u.endDate = patch.finish || patch.start;
          if (patch.sourceStatus !== undefined) u.status = patch.sourceStatus as Activity['status'];
          if (patch.owner !== undefined) u.owner = patch.owner;
          if (patch.remarks !== undefined) u.notes = patch.remarks;
          if (patch.progress !== undefined) meta.progress = patch.progress;
          if (Object.keys(u).length) await handleUpdateActivity(r.sourceId, u);
          break;
        }
      }
      if (Object.keys(meta).length) await writeMeta(r.key, meta, r.legacyKeys);
      showToast(`${r.name} updated — reflected in every module`);
      return true;
    } catch (err: unknown) {
      showToast(formatErrorForToast(err, 'Failed to save activity'));
      return false;
    }
  };

  const toastStored = (res: { stored: 'shared' | 'local' }, what: string) =>
    showToast(res.stored === 'shared' ? `${what} saved to the shared project database` : `${what} saved on this device only (shared storage unavailable)`);

  const saveIssue = async (i: ProjectIssue) => {
    try {
      const res = await controlStore.saveIssue(i);
      await firestoreData.logAudit(user, 'SAVE_ISSUE', 'Issue', i.id, i.title);
      toastStored(res, 'Issue');
    } catch (err) {
      showToast(formatErrorForToast(err, 'Failed to save issue'));
    }
  };
  const deleteIssue = async (id: string) => {
    try {
      await controlStore.deleteIssue(id);
      await firestoreData.logAudit(user, 'DELETE_ISSUE', 'Issue', id);
      showToast('Issue deleted');
    } catch (err) {
      showToast(formatErrorForToast(err, 'Failed to delete issue'));
    }
  };
  const saveReport = async (r: ProjectReport) => {
    if (!canEdit) {
      handleViewerAttemptEdit();
      return;
    }
    if (r.status === 'approved' && !isManager) {
      showToast('Only a Project Manager or System Administrator can approve reports.');
      return;
    }
    try {
      const res = await controlStore.saveReport(r);
      await firestoreData.logAudit(user, r.status === 'approved' ? 'APPROVE_REPORT' : 'SAVE_REPORT', 'Report', r.id, r.title);
      toastStored(res, r.status === 'approved' ? 'Approved report' : 'Draft report');
    } catch (err) {
      showToast(formatErrorForToast(err, 'Failed to save report'));
    }
  };
  /** Publish a locked report to the client portal (sanitized copy) or archive it. */
  const setReportPublishing = async (id: string, to: 'published' | 'archived') => {
    if (!isManager) {
      showToast('Only a Project Manager or System Administrator can publish or archive reports.');
      return;
    }
    const report = control.reports.find((r) => r.id === id);
    if (!report) return;
    try {
      if (to === 'published') {
        const content = sanitizeReport(report);
        await portalStore.put({
          id: report.id,
          kind: 'report',
          title: report.title,
          publishedAt: new Date().toISOString(),
          publishedBy: user.name,
          periodStart: report.periodStart,
          periodEnd: report.periodEnd,
          content,
        });
      } else if (report.status === 'published') {
        await portalStore.remove(report.id);
      }
      const res = await controlStore.setReportStatus(id, to, user.name);
      await firestoreData.logAudit(user, to === 'published' ? 'PUBLISH_REPORT' : 'ARCHIVE_REPORT', 'Report', id, report.title);
      toastStored(res, to === 'published' ? 'Report published to the client portal' : 'Report archived');
    } catch (err) {
      showToast(formatErrorForToast(err, 'Failed to update report publishing'));
    }
  };

  const deleteReport = async (id: string) => {
    try {
      await controlStore.deleteReport(id);
      await firestoreData.logAudit(user, 'DELETE_REPORT', 'Report', id);
      showToast('Draft report deleted');
    } catch (err) {
      showToast(formatErrorForToast(err, 'Failed to delete report'));
    }
  };

  const captureSnapshot = useCallback(
    async (manual = false) => {
      try {
        const res = await controlStore.saveSnapshot(makeSnapshot(metrics, register, user.name, today));
        if (manual) toastStored(res, 'Progress snapshot');
      } catch (err) {
        if (manual) showToast(formatErrorForToast(err, 'Failed to save snapshot'));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [metrics, register, user.name, today]
  );

  // Automatic daily snapshot (once live data has loaded; updated if values change that day)
  useEffect(() => {
    if (!canEdit || !dbReady) return;
    const existing = control.snapshots.find((x) => x.id === today);
    if (
      existing &&
      existing.actualPct === metrics.actualPct &&
      existing.plannedPct === metrics.plannedPct &&
      existing.counts.delayed === metrics.counts.delayed &&
      existing.counts.completed === metrics.counts.completed
    )
      return;
    const t = setTimeout(() => captureSnapshot(false), 5000);
    return () => clearTimeout(t);
  }, [canEdit, dbReady, today, metrics.actualPct, metrics.plannedPct, metrics.counts.delayed, metrics.counts.completed, control.snapshots, captureSnapshot]);

  const freezeBaseline = async () => {
    if (!isManager) return;
    const targets = register.filter(
      (r) => (r.kind === 'scope' || r.kind === 'milestone' || r.kind === 'pour' || r.kind === 'episode' || r.kind === 'manual') && !data.overrides[r.key]?.baselineStart && r.plannedStart
    );
    let n = 0;
    for (const r of targets) {
      try {
        await writeMeta(r.key, { baselineStart: r.plannedStart, baselineFinish: r.plannedFinish || r.plannedStart }, r.legacyKeys);
        n++;
      } catch {
        // continue with the rest
      }
    }
    await firestoreData.logAudit(user, 'FREEZE_BASELINE', 'System', 'all', `${n} activities`);
    showToast(`Baseline frozen for ${n} activit${n === 1 ? 'y' : 'ies'}`);
  };

  const commandState: CommandState = {
    data,
    register,
    metrics,
    alignment,
    attention,
    reports: control.reports,
    issues: control.issues,
    snapshots: control.snapshots,
    sharedStorage: control.shared,
    today,
    uiTheme,
    user,
    canEdit,
    isManager,
    isAdmin,
    isLive: isLiveConnected,
    route,
    actions: {
      navigate,
      openActivity: (id) => setOpenActivityId(id),
      toast: showToast,
      patchActivity,
      addActivity: handleAddActivity,
      saveIssue,
      deleteIssue,
      saveReport,
      setReportPublishing,
      deleteReport,
      captureSnapshot,
      freezeBaseline,
      syncLocal: async () => {
        const n = await controlStore.syncLocal();
        showToast(n ? `Uploaded ${n} record(s) to the shared database` : 'Shared storage still unavailable — records remain on this device');
      },
      exportBackup: handleExportBackup,
      importBackup: (f) => setPendingImport(f),
      printSlides: handlePrintPdf,
      printExecutiveReport: handlePrintReport,
      downloadHtml: handleDownloadHtml,
      openAuditLogs: () => setIsAuditOpen(true),
      openAdminPanel: () => setIsAdminPanelOpen(true),
      resetBaseline: handleReset,
      toggleTheme: handleToggleTheme,
      changePaper: handleChangePaper,
      printElement,
    },
  };
  const openActivity = openActivityId ? register.find((r) => r.id === openActivityId) : undefined;

  const slides: Record<SlideKey, () => React.ReactNode> = {
    overview: () => (
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
    ),
    upcoming: () => (
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
    ),
    gf: () => floorSlide('GF', '03'),
    '2f': () => floorSlide('2F', '04'),
    '3f': () => floorSlide('3F', '05'),
    pours: () => (
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
    ),
    production: () => (
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
    ),
    episodes: () => (
      <EpisodesTableSlide
        episodes={data.episodes}
        settings={data.settings}
        canEdit={canEdit}
        canEditTimeline={isManager}
        onUpdateEpisode={handleUpdateEpisode}
        onViewerAttemptEdit={handleViewerAttemptEdit}
      />
    ),
    master: () => (
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
    ),
    methodology: () => <MethodologySlide settings={data.settings} />,
    watch: () => <HolidaysSlide settings={data.settings} />,
    notes: () => <NotesSlide settings={data.settings} />,
  };

  function floorSlide(floor: 'GF' | '2F' | '3F', num: string) {
    return (
      <FloorScopeSlide
        floor={floor}
        slideNumber={num}
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
    );
  }

  const DECK: { id: string; key: SlideKey }[] = [
    { id: 's1', key: 'overview' },
    { id: 's2', key: 'upcoming' },
    { id: 's3', key: 'gf' },
    { id: 's4', key: '2f' },
    { id: 's5', key: '3f' },
    { id: 's6', key: 'pours' },
    { id: 's7', key: 'production' },
    { id: 's8', key: 'episodes' },
    { id: 's9', key: 'master' },
    { id: 's10', key: 'methodology' },
    { id: 's11', key: 'watch' },
    { id: 's12', key: 'notes' },
  ];
  const renderSlide = (k: SlideKey) => (
    <main className="stage" id="stage">
      <div id={DECK.find((d) => d.key === k)?.id}>{slides[k]()}</div>
    </main>
  );
  const renderDeck = () => (
    <main className="stage" id="stage">
      {DECK.map((d) => (
        <div id={d.id} key={d.id}>
          {slides[d.key]()}
        </div>
      ))}
    </main>
  );

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
        onImportBackup={(f) => setPendingImport(f)}
        onOpenAuditLogs={() => setIsAuditOpen(true)}
        onReset={handleReset}
        onOpenAdminPanel={() => setIsAdminPanelOpen(true)}
        isAdminPresentationMode={isAdminPresentationMode}
        compact
        themeLabel={uiTheme}
        onOpenSettings={() => navigate('settings')}
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

      <CommandProvider value={commandState}>
        <Shell renderSlide={renderSlide} renderDeck={renderDeck} />
        {openActivity && <ActivityEditor key={openActivity.id} activity={openActivity} onClose={() => setOpenActivityId(null)} />}
        {printNode && createPortal(<div id="cv-print-root">{printNode}</div>, document.body)}
      </CommandProvider>

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

      {pendingImport && (
        <ConfirmDialog
          title="Import this backup?"
          message={
            <>
              <b>{pendingImport.name}</b>
              <div style={{ marginTop: 8 }}>
                Project collections contained in the file (milestones, scopes, pours, episodes, activities, characters, assignments) will be restored to the
                file's contents. Reports, issues and snapshots are merged and never deleted; approved reports are never overwritten.
              </div>
              <div style={{ marginTop: 8 }} className="cv-late">
                Export a backup of the current data first if you may need to roll back.
              </div>
            </>
          }
          confirmLabel="Import backup"
          onCancel={() => setPendingImport(null)}
          onConfirm={() => {
            const f = pendingImport;
            setPendingImport(null);
            handleImportBackup(f);
          }}
        />
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
