/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { api } from './api/client.ts';
import { realtime } from './utils/realtime.ts';
import {
  FullDashboardData,
  User,
  Milestone,
  ScopeItem,
  Activity,
  ConcretePour,
  Episode,
  ActivityOverride,
  SystemSettings,
  AuditLog,
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
import { authService } from './firebase/authService.ts';
import { firestoreData } from './firebase/firestoreData.ts';

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
  const [isAdminPresentationMode, setIsAdminPresentationMode] = useState(false);

  const toastTimerRef = useRef<NodeJS.Timeout | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 2400);
  }, []);

  // Fetch full data from server
  const fetchData = useCallback(async () => {
    try {
      const full = await api.getFullDashboard();
      if (full) {
        setData((prev) => {
          if (isEditingTextRef.current) return prev;
          return {
            ...full,
            user: prev?.user || full.user,
            settings: {
              ...full.settings,
              theme: prev?.settings?.theme || full.settings.theme,
              paper: prev?.settings?.paper || full.settings.paper,
            },
          };
        });
      }
    } catch (err: any) {
      console.warn('Network sync notice:', err);
    }
  }, []);

  // Real-Time Google Sheets Style Multi-User Collaboration
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

    const unsubDashboard = realtime.onDashboard((freshData) => {
      setData((prev) => {
        if (isEditingTextRef.current) return prev;
        return {
          ...freshData,
          user: prev?.user || freshData.user,
          settings: {
            ...freshData.settings,
            theme: prev?.settings?.theme || freshData.settings.theme,
            paper: prev?.settings?.paper || freshData.settings.paper,
          },
        };
      });
    });

    // 6-second polling fallback
    const pollTimer = setInterval(fetchData, 6000);

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchData();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      unsubConn();
      unsubPresence();
      unsubFocus();
      unsubCellEdit();
      unsubDashboard();
      clearInterval(pollTimer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [fetchData]);

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

  // Paper print style injection
  useEffect(() => {
    const paperKey = data?.settings?.paper || 'a4';
    const paper = PAPER_SIZES[paperKey] || PAPER_SIZES.a4;
    const k = Math.min(paper.width / 1920, paper.height / 1280);

    let styleEl = document.getElementById('printstyle') as HTMLStyleElement;
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'printstyle';
      document.head.appendChild(styleEl);
    }

    styleEl.textContent = `
      @page { size: ${paper.size}; margin: 0; }
      @media print {
        html, body { margin: 0 !important; padding: 0 !important; background: #03051a !important; }
        .wrap { display: flex !important; justify-content: center; align-items: center; width: ${Math.floor(paper.width)}px !important; height: ${Math.floor(paper.height) - 2}px !important; margin: 0 !important; overflow: hidden !important; break-after: auto !important; page-break-after: auto !important; break-inside: avoid; }
        .wrap + .wrap { break-before: page !important; page-break-before: always !important; }
        .slide { flex: none; transform: none !important; position: static !important; zoom: ${k}; }
      }
    `;
  }, [data?.settings?.paper]);

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

  // Real-Time Firebase Auth and Firestore Subscriptions
  useEffect(() => {
    const unsubAuth = authService.onUserChange((fbUser) => {
      setData((prev) => (prev ? { ...prev, user: fbUser } : prev));
    });

    const unsubFirestore = firestoreData.subscribeAll((freshData) => {
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          ...freshData,
          settings: freshData.settings ? { ...prev.settings, ...freshData.settings } : prev.settings,
        };
      });
    });

    firestoreData.seedInitialDataIfEmpty(authService.getCurrentUser());

    return () => {
      unsubAuth();
      unsubFirestore();
    };
  }, []);

  const user = data.user || authService.getCurrentUser();
  const isViewer = !user || user.role === 'viewer' || user.role === 'pending' || isAdminPresentationMode;
  const canEdit = !isViewer;
  const isAdmin = Boolean(user && user.role === 'admin' && !isAdminPresentationMode);
  const isManager = Boolean(user && (user.role === 'admin' || user.role === 'manager') && !isAdminPresentationMode);
  const isStaff = Boolean(user && (user.role === 'admin' || user.role === 'manager' || user.role === 'staff') && !isAdminPresentationMode);

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
    try {
      const updated = await api.updateSettings({ theme: nextTheme });
      setData((prev) => (prev ? { ...prev, settings: updated } : prev));
      showToast(`Theme changed to ${nextTheme}`);
    } catch {
      showToast('Theme update failed');
    }
  };

  const handleChangePaper = async (paper: SystemSettings['paper']) => {
    try {
      const updated = await api.updateSettings({ paper });
      setData((prev) => (prev ? { ...prev, settings: updated } : prev));
      showToast(`Paper size set to ${paper.toUpperCase()}`);
    } catch {
      showToast('Paper update failed');
    }
  };

  const handleUpdateMilestone = async (id: string, status: Milestone['status']) => {
    if (!canEdit) {
      handleViewerAttemptEdit();
      return;
    }
    // Optimistic: preserve all existing fields
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        milestones: prev.milestones.map((m) =>
          m.id === id ? { ...m, status, updatedBy: user.name, updatedAt: new Date().toISOString() } : m
        ),
      };
    });
    // Broadcast instant real-time edit to all teammates' screens
    realtime.editCell('milestone', id, 'status', status);
    try {
      await firestoreData.updateMilestone(id, { status }, user.name);
      await api.updateMilestone(id, { status });
      showToast('Milestone status saved & synced');
    } catch (err: any) {
      showToast(err.message || 'Failed to update milestone');
      fetchData();
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

    // Optimistic local update
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        milestones: prev.milestones.map((m) =>
          m.id === id ? { ...m, [field]: trimmed, updatedBy: user.name, updatedAt: new Date().toISOString() } : m
        ),
      };
    });

    // Realtime broadcast to all teammate screens immediately (<30ms)
    realtime.editCell('milestone', id, field, trimmed);

    try {
      await firestoreData.updateMilestone(id, { [field]: trimmed }, user.name);
      await api.updateMilestone(id, { [field]: trimmed });
    } catch (err: any) {
      console.warn('Milestone field sync error:', err);
    }
  };

  const handleUpdateScopeProgress = async (id: string, percent: number) => {
    if (!canEdit) {
      handleViewerAttemptEdit();
      return;
    }
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        scopes: prev.scopes.map((s) =>
          s.id === id ? { ...s, percentComplete: percent, updatedBy: user.name, updatedAt: new Date().toISOString() } : s
        ),
      };
    });
    // Realtime broadcast to all teammates
    realtime.editCell('scope', id, 'percentComplete', percent);
    try {
      await firestoreData.updateScope(id, { percentComplete: percent }, user.name);
      await api.updateScopeProgress(id, percent);
    } catch (err: any) {
      showToast(err.message || 'Failed to update progress');
      fetchData();
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

    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        scopes: prev.scopes.map((s) =>
          s.id === id ? { ...s, [field]: trimmed, updatedBy: user.name, updatedAt: new Date().toISOString() } : s
        ),
      };
    });

    realtime.editCell('scope', id, field, trimmed);
    try {
      await firestoreData.updateScope(id, { [field]: trimmed }, user.name);
    } catch (err: any) {
      console.warn('Scope field sync error:', err);
    }
  };

  const handleAddScope = async (scope: Omit<ScopeItem, 'id'>) => {
    if (!isAdmin) {
      showToast('Only Administrators can add new scope items.');
      return;
    }
    try {
      const created = await api.addScope(scope);
      await firestoreData.addScope(created, user.name);
      setData((prev) => (prev ? { ...prev, scopes: [...prev.scopes, created] } : prev));
      showToast('Scope added and persisted');
    } catch (err: any) {
      showToast(err.message || 'Failed to add scope');
    }
  };

  const handleDeleteScope = async (id: string) => {
    if (!isAdmin) {
      showToast('Only Administrators can delete scope items.');
      return;
    }
    try {
      await firestoreData.deleteScope(id);
      await api.deleteScope(id);
      setData((prev) => (prev ? { ...prev, scopes: prev.scopes.filter((s) => s.id !== id) } : prev));
      showToast('Scope removed');
    } catch (err: any) {
      showToast(err.message || 'Failed to delete scope');
    }
  };

  // Activities
  const handleAddActivity = async (act: Omit<Activity, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (!canEdit) {
      handleViewerAttemptEdit();
      return;
    }
    try {
      const created = await api.addActivity(act);
      await firestoreData.addActivity(created, user.name);
      setData((prev) => (prev ? { ...prev, activities: [...prev.activities, created] } : prev));
      showToast('Activity created and saved');
    } catch (err: any) {
      showToast(err.message || 'Failed to create activity');
    }
  };

  const handleUpdateActivity = async (id: string, updates: Partial<Activity>) => {
    if (!canEdit) {
      handleViewerAttemptEdit();
      return;
    }
    try {
      await firestoreData.updateActivity(id, updates, user.name);
      const updated = await api.updateActivity(id, updates);
      setData((prev) => (prev ? { ...prev, activities: prev.activities.map((a) => (a.id === id ? { ...a, ...updated, updatedBy: user.name, updatedAt: new Date().toISOString() } : a)) } : prev));
      showToast('Activity updated');
    } catch (err: any) {
      showToast(err.message || 'Failed to update activity');
    }
  };

  const handleDeleteActivity = async (id: string) => {
    if (!isAdmin) {
      showToast('Only Administrators can delete activities.');
      return;
    }
    try {
      await firestoreData.deleteActivity(id);
      await api.deleteActivity(id);
      setData((prev) => (prev ? { ...prev, activities: prev.activities.filter((a) => a.id !== id) } : prev));
      showToast('Activity deleted');
    } catch (err: any) {
      showToast(err.message || 'Failed to delete activity');
    }
  };

  // Pours
  const handleAddPour = async (pour: Omit<ConcretePour, 'id'>) => {
    if (!isManager) {
      showToast('Only Admins and Managers can add pour milestones.');
      return;
    }
    try {
      const created = await api.addPour(pour);
      await firestoreData.addPour(created, user.name);
      setData((prev) => (prev ? { ...prev, pours: [...prev.pours, created] } : prev));
      showToast('Pour milestone created');
    } catch (err: any) {
      showToast(err.message || 'Failed to create pour');
    }
  };

  const handleUpdatePour = async (id: string, updates: Partial<ConcretePour>) => {
    if (!canEdit) {
      handleViewerAttemptEdit();
      return;
    }
    try {
      await firestoreData.updatePour(id, updates, user.name);
      const updated = await api.updatePour(id, updates);
      setData((prev) => (prev ? { ...prev, pours: prev.pours.map((p) => (p.id === id ? { ...p, ...updated, updatedBy: user.name, updatedAt: new Date().toISOString() } : p)) } : prev));
    } catch (err: any) {
      showToast(err.message || 'Failed to update pour');
    }
  };

  const handleDeletePour = async (id: string) => {
    if (!isAdmin) {
      showToast('Only Administrators can delete concrete pour milestones.');
      return;
    }
    try {
      await firestoreData.deletePour(id);
      await api.deletePour(id);
      setData((prev) => (prev ? { ...prev, pours: prev.pours.filter((p) => p.id !== id) } : prev));
      showToast('Pour deleted');
    } catch (err: any) {
      showToast(err.message || 'Failed to delete pour');
    }
  };

  // Episodes & Characters
  const handleAddEpisode = async (ep: Omit<Episode, 'id'>) => {
    if (!isAdmin) {
      showToast('Only Administrators can create new episodes.');
      return;
    }
    try {
      const created = await api.addEpisode(ep);
      await firestoreData.addEpisode(created, user.name);
      setData((prev) => (prev ? { ...prev, episodes: [...prev.episodes, created] } : prev));
      showToast('Episode saved to database');
    } catch (err: any) {
      showToast(err.message || 'Failed to create episode');
    }
  };

  const handleUpdateEpisode = async (id: string, updates: Partial<Episode>) => {
    if (!canEdit) {
      handleViewerAttemptEdit();
      return;
    }
    try {
      await firestoreData.updateEpisode(id, updates, user.name);
      const updated = await api.updateEpisode(id, updates);
      setData((prev) => (prev ? { ...prev, episodes: prev.episodes.map((e) => (e.id === id ? { ...e, ...updated, updatedBy: user.name, updatedAt: new Date().toISOString() } : e)) } : prev));
    } catch (err: any) {
      showToast(err.message || 'Failed to update episode');
    }
  };

  const handleDeleteEpisode = async (id: string) => {
    if (!isAdmin) {
      showToast('Only Administrators can delete episodes.');
      return;
    }
    try {
      await firestoreData.deleteEpisode(id);
      await api.deleteEpisode(id);
      setData((prev) => (prev ? { ...prev, episodes: prev.episodes.filter((e) => e.id !== id) } : prev));
      showToast('Episode removed');
    } catch (err: any) {
      showToast(err.message || 'Failed to delete episode');
    }
  };

  const handleAddCharacter = async (name: string) => {
    if (!canEdit) {
      handleViewerAttemptEdit();
      return;
    }
    try {
      const created = await api.addCharacter(name);
      await firestoreData.addCharacter(created);
      setData((prev) => (prev ? { ...prev, characters: [...prev.characters, created] } : prev));
      showToast(`Character "${name}" added`);
    } catch (err: any) {
      showToast(err.message || 'Failed to add character');
    }
  };

  const handleUpdateCharacter = async (id: string, name: string) => {
    if (!canEdit) {
      handleViewerAttemptEdit();
      return;
    }
    try {
      const updated = await api.updateCharacter(id, name);
      await firestoreData.updateCharacter(id, name);
      setData((prev) => (prev ? { ...prev, characters: prev.characters.map((c) => (c.id === id ? updated : c)) } : prev));
    } catch (err: any) {
      showToast(err.message || 'Failed to update character');
    }
  };

  const handleDeleteCharacter = async (id: string) => {
    if (!isAdmin) {
      showToast('Only Administrators can delete characters.');
      return;
    }
    try {
      await firestoreData.deleteCharacter(id);
      await api.deleteCharacter(id);
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
    } catch (err: any) {
      showToast(err.message || 'Failed to delete character');
    }
  };

  const handleSetOverride = async (key: string, ov: Partial<ActivityOverride>) => {
    if (!canEdit) {
      handleViewerAttemptEdit();
      return;
    }
    try {
      await firestoreData.setOverride(key, ov, user.name);
      await api.setOverride(key, ov);
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
    } catch (err: any) {
      showToast(err.message || 'Failed to save assignment');
    }
  };

  // Backups and Reset
  const handleExportBackup = () => {
    window.location.href = '/api/backup/export';
    showToast('Exporting JSON backup...');
  };

  const handleImportBackup = async (file: File) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const json = JSON.parse(reader.result as string);
        await api.importBackup(json);
        showToast('Backup successfully imported! Reloading...');
        await fetchData();
      } catch (err: any) {
        showToast(err.message || 'Invalid backup file');
      }
    };
    reader.readAsText(file);
  };

  const handleReset = async () => {
    if (!isAdmin) {
      showToast('Only an Administrator can reset the project database.');
      return;
    }
    if (confirm('Are you sure you want to reset all milestones, scopes, pours, and episodes back to the original baseline?')) {
      try {
        await api.resetToBaseline();
        showToast('Project reset to factory baseline');
        await fetchData();
      } catch (err: any) {
        showToast(err.message || 'Reset failed');
      }
    }
  };

  // Print PDF & Formal Report
  const handlePrintPdf = () => {
    window.print();
  };

  const handlePrintReport = () => {
    document.body.classList.add('pmrep-active');
    setTimeout(() => {
      window.print();
      document.body.classList.remove('pmrep-active');
    }, 100);
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
      <nav className="max-w-[1920px] mx-auto px-4 py-2 sticky top-[48px] z-30 flex items-center justify-between gap-2 overflow-x-auto bg-[#0A1140]/95 backdrop-blur border-y border-[#7B4DFF]/60 shadow-[0_4px_16px_rgba(0,0,0,0.5)] mb-4 rounded-b-lg">
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
            onAddActivity={handleAddActivity}
            onUpdateActivity={handleUpdateActivity}
            onDeleteActivity={handleDeleteActivity}
            onSetOverride={handleSetOverride}
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
            onUpdateProgress={handleUpdateScopeProgress}
            onUpdateScopeField={handleUpdateScopeField}
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
            onUpdateProgress={handleUpdateScopeProgress}
            onUpdateScopeField={handleUpdateScopeField}
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
            onUpdateProgress={handleUpdateScopeProgress}
            onUpdateScopeField={handleUpdateScopeField}
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
            onAddEpisode={handleAddEpisode}
            onUpdateEpisode={handleUpdateEpisode}
            onDeleteEpisode={handleDeleteEpisode}
            onAddCharacter={handleAddCharacter}
            onUpdateCharacter={handleUpdateCharacter}
            onDeleteCharacter={handleDeleteCharacter}
          />
        </div>

        {/* Slide 8: 24 Episodes Table */}
        <div id="s8">
          <EpisodesTableSlide
            episodes={data.episodes}
            settings={data.settings}
            canEdit={canEdit}
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
      <div className="pmrep-container" id="pmreport">
        <h1 style={{ fontSize: '24px', fontWeight: 800 }}>Convengers Bahay Build — Status Report</h1>
        <p style={{ fontSize: '13px', color: '#555' }}>Report Date: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>

        <h2 style={{ fontSize: '16px', fontWeight: 800, marginTop: '16px', borderBottom: '2px solid #333' }}>Executive Milestones</h2>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Milestone Target</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {data.milestones.map((m) => (
              <tr key={m.id}>
                <td>{m.dateText}</td>
                <td>{m.label}</td>
                <td>{m.status}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2 style={{ fontSize: '16px', fontWeight: 800, marginTop: '16px', borderBottom: '2px solid #333' }}>Concrete Pouring Status</h2>
        <table>
          <thead>
            <tr>
              <th>Floor</th>
              <th>Component</th>
              <th>Activity</th>
              <th>Target Pour</th>
              <th>Actual Pour</th>
              <th>Milestone Status</th>
            </tr>
          </thead>
          <tbody>
            {data.pours.map((p) => (
              <tr key={p.id}>
                <td>{p.floor}</td>
                <td>{p.component}</td>
                <td>{p.activity}</td>
                <td>{p.targetPour || '—'}</td>
                <td>{p.actualPour || '—'}</td>
                <td>{p.milestoneStatus}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2 style={{ fontSize: '16px', fontWeight: 800, marginTop: '16px', borderBottom: '2px solid #333' }}>Production Calendar (24 Episodes)</h2>
        <table>
          <thead>
            <tr>
              <th>Ep #</th>
              <th>Title</th>
              <th>Topic</th>
              <th>Shoot Window</th>
              <th>Release Date</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {data.episodes.map((e) => (
              <tr key={e.id}>
                <td>{e.number}</td>
                <td>{e.title}</td>
                <td>{e.topic}</td>
                <td>{e.shootStart}</td>
                <td>{e.releaseDate || '—'}</td>
                <td>{e.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modals */}
      {isAuthOpen && (
        <AuthModal
          currentUser={data.user}
          onClose={() => setIsAuthOpen(false)}
          onLogin={async (email, pass) => {
            const res = await api.login(email, pass);
            setData((prev) => (prev ? { ...prev, user: res.user } : prev));
            showToast(`Welcome to Madhouse Team, ${res.user.name} (${res.user.role.toUpperCase()})`);
          }}
          onRegister={async (name, email, pass, role) => {
            const res = await api.register(name, email, pass, role);
            setData((prev) => (prev ? { ...prev, user: res.user } : prev));
            showToast(`Team account created as ${res.user.role.toUpperCase()}`);
          }}
          onSwitchDemo={async (email) => {
            const res = await api.switchDemo(email);
            setData((prev) => (prev ? { ...prev, user: res.user } : prev));
            showToast(`Madhouse Access: ${res.user.name} (${res.user.role.toUpperCase()})`);
          }}
          onLogout={async () => {
            await api.logout();
            setIsEditingText(false);
            const initial = api.getInitialDashboard();
            setData((prev) => (prev ? { ...prev, user: initial.user } : prev));
            showToast('Switched to Viewer (Read-only) presentation mode');
          }}
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

      {/* Toast Notification */}
      {toastMessage && (
        <div id="pmtoast">
          {toastMessage}
        </div>
      )}
    </div>
  );
}
