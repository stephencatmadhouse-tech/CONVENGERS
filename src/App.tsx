/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { api } from './api/client.ts';
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
import { AuthModal, ShareModal, AuditLogModal } from './components/Modals.tsx';

const PAPER_SIZES: Record<string, { size: string; width: number; height: number }> = {
  a4: { size: '297mm 210mm', width: 1122.5, height: 793.7 },
  a3: { size: '420mm 297mm', width: 1587.4, height: 1122.5 },
  letter: { size: '11in 8.5in', width: 1056, height: 816 },
  tabloid: { size: '17in 11in', width: 1632, height: 1056 },
};

export default function App() {
  const [data, setData] = useState<FullDashboardData>(() => api.getInitialDashboard());
  const [loading, setLoading] = useState(false);
  const [isLiveConnected, setIsLiveConnected] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isEditingText, setIsEditingText] = useState(false);
  const isEditingTextRef = useRef(false);
  isEditingTextRef.current = isEditingText;

  // Modals
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isAuditOpen, setIsAuditOpen] = useState(false);

  const toastTimerRef = useRef<NodeJS.Timeout | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 2400);
  }, []);

  // Fetch data
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

  // Real-time SSE synchronization across teammates & phones
  useEffect(() => {
    let eventSource: EventSource | null = null;
    let pollTimer: NodeJS.Timeout | null = null;
    let reconnectTimer: NodeJS.Timeout | null = null;

    const connectSSE = () => {
      try {
        eventSource = new EventSource('/api/events');

        eventSource.onopen = () => {
          setIsLiveConnected(true);
        };

        eventSource.onmessage = (event) => {
          try {
            const payload = JSON.parse(event.data);
            if (payload && (payload.type === 'DASHBOARD_UPDATED' || payload.type === 'CONNECTED') && payload.data) {
              setData((prev) => {
                if (isEditingTextRef.current) return prev;
                const incoming = payload.data as FullDashboardData;
                return {
                  ...incoming,
                  user: prev?.user || incoming.user,
                  settings: {
                    ...incoming.settings,
                    theme: prev?.settings?.theme || incoming.settings.theme,
                    paper: prev?.settings?.paper || incoming.settings.paper,
                  },
                };
              });
            }
          } catch (e) {
            console.error('SSE parse error:', e);
          }
        };

        eventSource.onerror = () => {
          setIsLiveConnected(false);
          eventSource?.close();
          if (reconnectTimer) clearTimeout(reconnectTimer);
          reconnectTimer = setTimeout(connectSSE, 4000);
        };
      } catch {
        setIsLiveConnected(false);
      }
    };

    connectSSE();

    // 5-second polling fallback for mobile devices
    pollTimer = setInterval(() => {
      fetchData();
    }, 5000);

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchData();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      if (eventSource) eventSource.close();
      if (pollTimer) clearInterval(pollTimer);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [fetchData]);

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

  const user = data.user;
  const canEdit = Boolean(user && user.role !== 'viewer');
  const isAdmin = Boolean(user && user.role === 'admin');

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
      showToast('Viewer role is read-only. Please sign in as staff, manager, or admin.');
      return;
    }
    // Optimistic: preserve all existing fields
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        milestones: prev.milestones.map((m) => (m.id === id ? { ...m, status } : m)),
      };
    });
    try {
      const updated = await api.updateMilestone(id, { status });
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          milestones: prev.milestones.map((m) =>
            m.id === id
              ? {
                  ...m,
                  ...updated,
                  label: (updated.label && updated.label.trim()) || m.label,
                  dateText: (updated.dateText && updated.dateText.trim()) || m.dateText,
                }
              : m
          ),
        };
      });
      showToast('Milestone status saved & synced');
    } catch (err: any) {
      showToast(err.message || 'Failed to update milestone');
      fetchData();
    }
  };

  const handleUpdateScopeProgress = async (id: string, percent: number) => {
    if (!canEdit) {
      showToast('Viewer role is read-only. Please sign in as staff, manager, or admin.');
      return;
    }
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        scopes: prev.scopes.map((s) => (s.id === id ? { ...s, percentComplete: percent } : s)),
      };
    });
    try {
      const updated = await api.updateScopeProgress(id, percent);
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          scopes: prev.scopes.map((s) =>
            s.id === id
              ? {
                  ...s,
                  ...updated,
                  name: (updated.name && updated.name.trim()) || s.name,
                }
              : s
          ),
        };
      });
    } catch (err: any) {
      showToast(err.message || 'Failed to update progress');
      fetchData();
    }
  };

  const handleAddScope = async (scope: Omit<ScopeItem, 'id'>) => {
    if (!canEdit) return;
    try {
      const created = await api.addScope(scope);
      setData((prev) => (prev ? { ...prev, scopes: [...prev.scopes, created] } : prev));
      showToast('Scope added and persisted');
    } catch (err: any) {
      showToast(err.message || 'Failed to add scope');
    }
  };

  const handleDeleteScope = async (id: string) => {
    if (!canEdit) return;
    try {
      await api.deleteScope(id);
      setData((prev) => (prev ? { ...prev, scopes: prev.scopes.filter((s) => s.id !== id) } : prev));
      showToast('Scope removed');
    } catch (err: any) {
      showToast(err.message || 'Failed to delete scope');
    }
  };

  // Activities
  const handleAddActivity = async (act: Omit<Activity, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      const created = await api.addActivity(act);
      setData((prev) => (prev ? { ...prev, activities: [...prev.activities, created] } : prev));
      showToast('Activity created and saved');
    } catch (err: any) {
      showToast(err.message || 'Failed to create activity');
    }
  };

  const handleUpdateActivity = async (id: string, updates: Partial<Activity>) => {
    try {
      const updated = await api.updateActivity(id, updates);
      setData((prev) => (prev ? { ...prev, activities: prev.activities.map((a) => (a.id === id ? updated : a)) } : prev));
      showToast('Activity updated');
    } catch (err: any) {
      showToast(err.message || 'Failed to update activity');
    }
  };

  const handleDeleteActivity = async (id: string) => {
    try {
      await api.deleteActivity(id);
      setData((prev) => (prev ? { ...prev, activities: prev.activities.filter((a) => a.id !== id) } : prev));
      showToast('Activity deleted');
    } catch (err: any) {
      showToast(err.message || 'Failed to delete activity');
    }
  };

  // Pours
  const handleAddPour = async (pour: Omit<ConcretePour, 'id'>) => {
    try {
      const created = await api.addPour(pour);
      setData((prev) => (prev ? { ...prev, pours: [...prev.pours, created] } : prev));
      showToast('Pour milestone created');
    } catch (err: any) {
      showToast(err.message || 'Failed to create pour');
    }
  };

  const handleUpdatePour = async (id: string, updates: Partial<ConcretePour>) => {
    try {
      const updated = await api.updatePour(id, updates);
      setData((prev) => (prev ? { ...prev, pours: prev.pours.map((p) => (p.id === id ? updated : p)) } : prev));
    } catch (err: any) {
      showToast(err.message || 'Failed to update pour');
    }
  };

  const handleDeletePour = async (id: string) => {
    try {
      await api.deletePour(id);
      setData((prev) => (prev ? { ...prev, pours: prev.pours.filter((p) => p.id !== id) } : prev));
      showToast('Pour deleted');
    } catch (err: any) {
      showToast(err.message || 'Failed to delete pour');
    }
  };

  // Episodes & Characters
  const handleAddEpisode = async (ep: Omit<Episode, 'id'>) => {
    try {
      const created = await api.addEpisode(ep);
      setData((prev) => (prev ? { ...prev, episodes: [...prev.episodes, created] } : prev));
      showToast('Episode saved to database');
    } catch (err: any) {
      showToast(err.message || 'Failed to create episode');
    }
  };

  const handleUpdateEpisode = async (id: string, updates: Partial<Episode>) => {
    try {
      const updated = await api.updateEpisode(id, updates);
      setData((prev) => (prev ? { ...prev, episodes: prev.episodes.map((e) => (e.id === id ? updated : e)) } : prev));
    } catch (err: any) {
      showToast(err.message || 'Failed to update episode');
    }
  };

  const handleDeleteEpisode = async (id: string) => {
    try {
      await api.deleteEpisode(id);
      setData((prev) => (prev ? { ...prev, episodes: prev.episodes.filter((e) => e.id !== id) } : prev));
      showToast('Episode removed');
    } catch (err: any) {
      showToast(err.message || 'Failed to delete episode');
    }
  };

  const handleAddCharacter = async (name: string) => {
    try {
      const created = await api.addCharacter(name);
      setData((prev) => (prev ? { ...prev, characters: [...prev.characters, created] } : prev));
      showToast(`Character "${name}" added`);
    } catch (err: any) {
      showToast(err.message || 'Failed to add character');
    }
  };

  const handleUpdateCharacter = async (id: string, name: string) => {
    try {
      const updated = await api.updateCharacter(id, name);
      setData((prev) => (prev ? { ...prev, characters: prev.characters.map((c) => (c.id === id ? updated : c)) } : prev));
    } catch (err: any) {
      showToast(err.message || 'Failed to update character');
    }
  };

  const handleDeleteCharacter = async (id: string) => {
    try {
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
    try {
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
        user={data.user}
        settings={data.settings}
        isEditing={isEditingText}
        isLiveConnected={isLiveConnected}
        onToggleEditing={() => setIsEditingText(!isEditingText)}
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
      />

      {/* Intro Header */}
      <header className="intro">
        <h1>Convengers Bahay Build — Scope of Work Timeline</h1>
        <p>
          Interactive full-stack project dashboard for the Convengers Bahay Build: timeline, scopes of work, concrete pouring milestones, upcoming activities, and content calendar. Real-time persistent database with role-based permissions and secure authentication.
        </p>
      </header>

      {/* Main Multi-Slide Stage */}
      <main className="stage" id="stage">
        {/* Slide 1: Executive Overview */}
        <OverviewSlide
          milestones={data.milestones}
          scopes={data.scopes}
          pours={data.pours}
          episodes={data.episodes}
          settings={data.settings}
          canEdit={canEdit}
          onUpdateMilestone={handleUpdateMilestone}
        />

        {/* Slide 2: Upcoming / Next Activities */}
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

        {/* Slide 3: Ground Floor */}
        <FloorScopeSlide
          floor="GF"
          slideNumber="03"
          scopes={data.scopes}
          episodes={data.episodes}
          settings={data.settings}
          canEdit={canEdit}
          onUpdateProgress={handleUpdateScopeProgress}
          onAddScope={handleAddScope}
          onDeleteScope={handleDeleteScope}
        />

        {/* Slide 4: Second Floor */}
        <FloorScopeSlide
          floor="2F"
          slideNumber="04"
          scopes={data.scopes}
          episodes={data.episodes}
          settings={data.settings}
          canEdit={canEdit}
          onUpdateProgress={handleUpdateScopeProgress}
          onAddScope={handleAddScope}
          onDeleteScope={handleDeleteScope}
        />

        {/* Slide 5: Third Floor */}
        <FloorScopeSlide
          floor="3F"
          slideNumber="05"
          scopes={data.scopes}
          episodes={data.episodes}
          settings={data.settings}
          canEdit={canEdit}
          onUpdateProgress={handleUpdateScopeProgress}
          onAddScope={handleAddScope}
          onDeleteScope={handleDeleteScope}
        />

        {/* Slide 6: Structural Methodology */}
        <MethodologySlide settings={data.settings} />

        {/* Slide 7: Watch Items & Philippine Holidays */}
        <HolidaysSlide settings={data.settings} />

        {/* Slide 8: Schedule Notes & Validation Items */}
        <NotesSlide settings={data.settings} />

        {/* Slide 9: Concrete Pouring Milestones */}
        <ConcretePourSlide
          pours={data.pours}
          settings={data.settings}
          canEdit={canEdit}
          onAddPour={handleAddPour}
          onUpdatePour={handleUpdatePour}
          onDeletePour={handleDeletePour}
        />

        {/* Slide 10: Content Calendar & Multiverse Characters */}
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

        {/* Slide 11: 24 Episodes Table */}
        <EpisodesTableSlide
          episodes={data.episodes}
          settings={data.settings}
          canEdit={canEdit}
          onUpdateEpisode={handleUpdateEpisode}
        />
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

        <h2 style={{ fontSize: '16px', fontWeight: 800, marginTop: '16px', borderBottom: '2px solid #333' }}>Content Calendar (24 Episodes)</h2>
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
            showToast(`Welcome back, ${res.user.name}`);
          }}
          onRegister={async (name, email, pass, role) => {
            const res = await api.register(name, email, pass, role);
            setData((prev) => (prev ? { ...prev, user: res.user } : prev));
            showToast(`Account created as ${res.user.role.toUpperCase()}`);
          }}
          onSwitchDemo={async (email) => {
            const res = await api.switchDemo(email);
            setData((prev) => (prev ? { ...prev, user: res.user } : prev));
            showToast(`Switched to ${res.user.role.toUpperCase()} (${res.user.name})`);
          }}
          onLogout={async () => {
            await api.logout();
            setData((prev) => (prev ? { ...prev, user: null } : prev));
            showToast('Signed out');
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
