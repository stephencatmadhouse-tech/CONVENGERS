/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  Milestone,
  ScopeItem,
  ConcretePour,
  Episode,
  SystemSettings,
  RemoteFocus,
} from '../types/index.ts';
import { STATUS_COLORS } from '../constants/assets.ts';
import { BrandLogo } from './BrandLogo.tsx';
import { calculateFloorProgress } from '../utils/calculations.ts';

interface OverallProjectTimelineSlideProps {
  milestones: Milestone[];
  scopes: ScopeItem[];
  pours: ConcretePour[];
  episodes: Episode[];
  settings: SystemSettings;
  canEdit: boolean;
  onUpdateMilestone?: (id: string, status: Milestone['status']) => void;
  onUpdateEpisode?: (id: string, updates: Partial<Episode>) => void;
  remoteFocusMap?: Record<string, RemoteFocus>;
  onViewerAttemptEdit?: () => void;
}

// Master synchronized milestone mappings between Construction and Production
interface SyncMilestone {
  id: string;
  phase: string;
  monthRange: string;
  constructionItem: string;
  constructionFloor: 'GF' | '2F' | '3F' | 'ALL';
  constructionDate: string;
  constructionStatus: string;
  constructionProgress: number;
  productionEpisodeNum: number;
  productionEpisodeTitle: string;
  productionShootDate: string;
  productionPostDate: string;
  productionStatus: string;
  syncNote: string;
  startPct: number; // 0 - 100 on the 8-month timeline (Oct 2026 - May 2027)
  durationPct: number;
}

export const OverallProjectTimelineSlide: React.FC<OverallProjectTimelineSlideProps> = ({
  milestones,
  scopes,
  pours,
  episodes,
  settings: _settings,
  canEdit,
  onUpdateMilestone: _onUpdateMilestone,
  onUpdateEpisode: _onUpdateEpisode,
  remoteFocusMap: _remoteFocusMap = {},
  onViewerAttemptEdit,
}) => {
  const [viewFilter, setViewFilter] = useState<'all' | 'construction' | 'production'>('all');
  const [phaseFilter, setPhaseFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSyncId, setSelectedSyncId] = useState<string | null>(null);

  // Compute overall progress metrics
  const constructionStats = useMemo(() => {
    if (!scopes.length) return { avgPct: 0, completedCount: 0, totalCount: 0 };
    const total = scopes.length;
    const completed = scopes.filter((s) => s.percentComplete >= 100).length;
    const sum = scopes.reduce((acc, s) => acc + (s.percentComplete || 0), 0);
    return {
      avgPct: Math.round(sum / total),
      completedCount: completed,
      totalCount: total,
    };
  }, [scopes]);

  const productionStats = useMemo(() => {
    if (!episodes.length) return { completedCount: 0, scheduledCount: 0, totalCount: 24, progressPct: 0 };
    const total = episodes.length;
    const completed = episodes.filter((e) => e.status === 'Completed' || e.scopeStatus === 'Completed').length;
    const scheduled = episodes.filter((e) => e.status === 'Scheduled' || e.status === 'For Confirmation').length;
    return {
      completedCount: completed,
      scheduledCount: scheduled,
      totalCount: total,
      progressPct: Math.round((completed / total) * 100),
    };
  }, [episodes]);

  // Unified synchronized milestones (live-synced with milestones, scopes, pours, and episodes)
  const syncMilestones: SyncMilestone[] = useMemo(() => {
    const gfPct = calculateFloorProgress(scopes, 'GF');
    const f2Pct = calculateFloorProgress(scopes, '2F');
    const f3Pct = calculateFloorProgress(scopes, '3F');

    const epMap = new Map(episodes.map((e) => [e.number, e]));
    const findMilestoneStatus = (keywords: string[], fallback: string): string => {
      const m = milestones.find((item) =>
        keywords.some((kw) => item.label.toLowerCase().includes(kw))
      );
      return m ? m.status : fallback;
    };
    const findPourProgress = (floor: 'GF' | '2F' | '3F', fallbackPct: number): number => {
      const floorPours = pours.filter((p) => p.floor === floor);
      if (!floorPours.length) return fallbackPct;
      const done = floorPours.filter((p) => p.milestoneStatus === 'Completed / Approved').length;
      const active = floorPours.filter((p) =>
        ['Pouring Ongoing', 'Curing Ongoing', 'Preparation Ongoing', 'Pouring Completed', 'Ready for Pouring'].includes(p.milestoneStatus)
      ).length;
      return Math.round(((done + active * 0.5) / floorPours.length) * 100);
    };

    const base: Array<SyncMilestone & { milestoneMatch?: string[] }> = [
      {
        id: 'sync_01',
        phase: 'Mobilization & Layout',
        monthRange: 'Oct 2026',
        constructionItem: 'Site mobilization, excavation & layout begins',
        constructionFloor: 'GF',
        constructionDate: 'Oct 5 – Oct 19, 2026',
        constructionStatus: findMilestoneStatus(['mobilization', 'excavation', 'layout'], 'Complete'),
        constructionProgress: scopes.find((s) => s.floor === 'GF' && s.phase === 'Structural')?.percentComplete ?? 100,
        productionEpisodeNum: 1,
        productionEpisodeTitle: 'Bahay ni Doc: Groundbreaking & Site Clearing',
        productionShootDate: 'Oct 3 – Oct 5, 2026',
        productionPostDate: 'Oct 10, 2026',
        productionStatus: 'Completed',
        syncNote: 'Full crew on site for groundbreaking ceremony & blueprint reveal.',
        startPct: 2,
        durationPct: 6,
      },
      {
        id: 'sync_02',
        phase: 'Substructure & Footings',
        monthRange: 'Oct – Nov 2026',
        constructionItem: 'Column Footing Pedestals & Tie Beam Rebar',
        constructionFloor: 'GF',
        constructionDate: 'Oct 20 – Nov 7, 2026',
        constructionStatus: findMilestoneStatus(['footing', 'tie beam', 'column'], 'In progress'),
        constructionProgress: findPourProgress('GF', 75),
        productionEpisodeNum: 3,
        productionEpisodeTitle: 'Buhos ng Pundasyon: Heavy Equipment Arrival',
        productionShootDate: 'Oct 22 – Oct 24, 2026',
        productionPostDate: 'Oct 31, 2026',
        productionStatus: 'Completed',
        syncNote: 'Filming pumpcrete trucks & slump test verification.',
        startPct: 8,
        durationPct: 8,
      },
      {
        id: 'sync_03',
        phase: 'Ground Floor Slab',
        monthRange: 'Nov 2026',
        constructionItem: 'GF Slab on Grade & Columns Concrete Pouring',
        constructionFloor: 'GF',
        constructionDate: 'Nov 8 – Dec 19, 2026',
        constructionStatus: gfPct >= 100 ? 'Complete' : gfPct > 0 ? 'In progress' : findMilestoneStatus(['ground floor', 'slab'], 'In progress'),
        constructionProgress: gfPct || 60,
        productionEpisodeNum: 5,
        productionEpisodeTitle: 'Ang Unang Buhos: Ground Floor Slab Milestone',
        productionShootDate: 'Nov 12 – Nov 14, 2026',
        productionPostDate: 'Nov 21, 2026',
        productionStatus: 'Scheduled',
        syncNote: 'Timelapse setup of concrete finisher crews overnight.',
        startPct: 16,
        durationPct: 9,
      },
      {
        id: 'sync_04',
        phase: 'Second Floor Framing',
        monthRange: 'Dec 2026',
        constructionItem: '2F Suspended Beam & Slab Formworks / Rebar',
        constructionFloor: '2F',
        constructionDate: 'Nov 14 – Nov 28, 2026',
        constructionStatus: f2Pct >= 100 ? 'Complete' : f2Pct > 0 ? 'In progress' : findMilestoneStatus(['second floor', '2f'], 'Upcoming'),
        constructionProgress: f2Pct || findPourProgress('2F', 20),
        productionEpisodeNum: 9,
        productionEpisodeTitle: 'Umakyat na sa 2nd Floor: Structural Elevation',
        productionShootDate: 'Dec 8 – Dec 12, 2026',
        productionPostDate: 'Dec 19, 2026',
        productionStatus: 'Planned',
        syncNote: 'Capture structural inspection prior to holiday work stoppage.',
        startPct: 25,
        durationPct: 8,
      },
      {
        id: 'sync_holiday',
        phase: 'Mandatory Work Stoppage',
        monthRange: 'Dec 20 – Jan 3',
        constructionItem: 'Holiday Work Stoppage (Site Closed / Curing Period)',
        constructionFloor: 'ALL',
        constructionDate: 'Dec 20, 2026 – Jan 3, 2027',
        constructionStatus: findMilestoneStatus(['stoppage', 'holiday'], 'Scheduled'),
        constructionProgress: 0,
        productionEpisodeNum: 10,
        productionEpisodeTitle: 'Year-End House Check & Holiday Special',
        productionShootDate: 'Dec 18, 2026',
        productionPostDate: 'Dec 26, 2026',
        productionStatus: 'Planned',
        syncNote: 'Site secured; concrete hydration & curing continuous.',
        startPct: 33,
        durationPct: 6,
      },
      {
        id: 'sync_05',
        phase: 'Third Floor Framing',
        monthRange: 'Jan 2027',
        constructionItem: '3F Beam & Slab Pouring / Roof Beam Formworks',
        constructionFloor: '3F',
        constructionDate: 'Jan 4 – Jan 28, 2027',
        constructionStatus: f3Pct >= 100 ? 'Complete' : f3Pct > 0 ? 'In progress' : findMilestoneStatus(['third floor', '3f'], 'Upcoming'),
        constructionProgress: f3Pct || findPourProgress('3F', 10),
        productionEpisodeNum: 14,
        productionEpisodeTitle: 'Abot Kamay ang Rooftop: Third Floor Deck',
        productionShootDate: 'Jan 15 – Jan 18, 2027',
        productionPostDate: 'Jan 23, 2027',
        productionStatus: 'Planned',
        syncNote: 'Drone fly-through of completed reinforced structure.',
        startPct: 39,
        durationPct: 10,
      },
      {
        id: 'sync_06',
        phase: 'Structural Completion',
        monthRange: 'Feb 2027',
        constructionItem: '3F Structural Inspection & Milestone Signoff',
        constructionFloor: '3F',
        constructionDate: 'Feb 3, 2027',
        constructionStatus: findMilestoneStatus(['structural inspection', 'feb 3'], 'Upcoming'),
        constructionProgress: f3Pct >= 100 ? 100 : 0,
        productionEpisodeNum: 16,
        productionEpisodeTitle: 'Buo na ang Bahay! Major Structural Milestone',
        productionShootDate: 'Feb 3 – Feb 5, 2027',
        productionPostDate: 'Feb 13, 2027',
        productionStatus: 'Planned',
        syncNote: 'Key milestone celebration with architects & Convengers team.',
        startPct: 50,
        durationPct: 6,
      },
      {
        id: 'sync_07',
        phase: 'Masonry & Enclosure',
        monthRange: 'Feb – Mar 2027',
        constructionItem: 'CHB Walls, Waterproofing & Exterior Plastering',
        constructionFloor: 'ALL',
        constructionDate: 'Feb 8 – Mar 5, 2027',
        constructionStatus: 'Upcoming',
        constructionProgress: Math.round((gfPct + f2Pct + f3Pct) / 3),
        productionEpisodeNum: 17,
        productionEpisodeTitle: 'Nakatayo Na Ang Mga Pader: Room Walkthrough',
        productionShootDate: 'Feb 18 – Feb 22, 2027',
        productionPostDate: 'Feb 27, 2027',
        productionStatus: 'Planned',
        syncNote: 'First walk-through of designated bedrooms & studio spaces.',
        startPct: 56,
        durationPct: 11,
      },
      {
        id: 'sync_08',
        phase: 'Finishing & MEPF',
        monthRange: 'Mar – Apr 2027',
        constructionItem: 'Tiles, Ceiling, Electrical/Plumbing Fixtures & Paint',
        constructionFloor: 'ALL',
        constructionDate: 'Mar 6 – Apr 6, 2027',
        constructionStatus: 'Upcoming',
        constructionProgress: Math.round((gfPct + f2Pct + f3Pct) / 3),
        productionEpisodeNum: 19,
        productionEpisodeTitle: 'May Ilaw at Tubig Na! Finishing Details Reveal',
        productionShootDate: 'Mar 25 – Mar 28, 2027',
        productionPostDate: 'Apr 3, 2027',
        productionStatus: 'Planned',
        syncNote: 'Interior designer & character reveals during fixture installation.',
        startPct: 67,
        durationPct: 14,
      },
      {
        id: 'sync_09',
        phase: 'Punchlist & Rectification',
        monthRange: 'Apr 2027',
        constructionItem: 'Punchlist Inspection, Defect Rectification & Deep Clean',
        constructionFloor: 'ALL',
        constructionDate: 'Apr 7 – Apr 24, 2027',
        constructionStatus: findMilestoneStatus(['punchlist', 'rectification'], 'Upcoming'),
        constructionProgress: 0,
        productionEpisodeNum: 21,
        productionEpisodeTitle: 'Public Admission: Independent Quality Inspection',
        productionShootDate: 'Apr 10 – Apr 15, 2027',
        productionPostDate: 'Apr 17, 2027',
        productionStatus: 'Planned',
        syncNote: 'Third-party QA inspector walkthrough and checklist audit.',
        startPct: 81,
        durationPct: 8,
      },
      {
        id: 'sync_10',
        phase: 'Handover & Turnover Finale',
        monthRange: 'Late Apr 2027',
        constructionItem: 'Move-in Target, Turnover Ceremony & Project Closeout',
        constructionFloor: 'ALL',
        constructionDate: 'Apr 28 – Apr 30, 2027',
        constructionStatus: findMilestoneStatus(['turnover', 'move-in'], 'Upcoming'),
        constructionProgress: 0,
        productionEpisodeNum: 24,
        productionEpisodeTitle: 'Final Episode: Cinematic Turnover & Key Handover',
        productionShootDate: 'Apr 28 – Apr 30, 2027',
        productionPostDate: 'May 4, 2027',
        productionStatus: 'Planned',
        syncNote: 'Grand cinematic finale episode with full Convengers cast.',
        startPct: 90,
        durationPct: 8,
      },
    ];

    return base.map((item) => {
      const liveEp = epMap.get(item.productionEpisodeNum);
      if (!liveEp) return item;
      const shootRange = liveEp.shootStart
        ? `${liveEp.shootStart}${liveEp.shootEnd && liveEp.shootEnd !== liveEp.shootStart ? ` – ${liveEp.shootEnd}` : ''}`
        : item.productionShootDate;
      return {
        ...item,
        productionEpisodeTitle: liveEp.title || item.productionEpisodeTitle,
        productionShootDate: shootRange,
        productionPostDate: liveEp.releaseDate || item.productionPostDate,
        productionStatus: liveEp.status || item.productionStatus,
      };
    });
  }, [milestones, scopes, pours, episodes]);

  // Filtered list
  const filteredMilestones = useMemo(() => {
    return syncMilestones.filter((m) => {
      if (phaseFilter !== 'all' && m.constructionFloor !== phaseFilter && phaseFilter !== m.phase) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = m.constructionItem.toLowerCase().includes(q) ||
          m.productionEpisodeTitle.toLowerCase().includes(q) ||
          m.phase.toLowerCase().includes(q) ||
          m.syncNote.toLowerCase().includes(q);
        if (!matchTitle) return false;
      }
      return true;
    });
  }, [syncMilestones, phaseFilter, searchQuery]);

  return (
    <section className="wrap">
      <div
        className="slide"
        id="slide-master-timeline"
        data-f="MASTER"
        style={{
          position: 'relative',
          overflow: 'hidden',
          width: '1920px',
          height: '1280px',
          boxSizing: 'border-box',
        background:
          'var(--sx-bg-25)',
        color: 'var(--sx-text-26)',
        fontFamily: "'Barlow', sans-serif",
        padding: '48px 56px 130px',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
      }}
    >
      <div className="stl" />
      <div className="str" />

      {/* Header */}
      <div className="hdr" style={{ display: 'flex', alignItems: 'center', gap: '30px', height: '150px', flex: 'none' }}>
        <BrandLogo variant="slide" />
        <div className="ttl" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: '28px', lineHeight: 1.1, letterSpacing: '2px', textTransform: 'uppercase', color: 'var(--sx-text-2)' }}>
            Master Integrated Calendar
          </div>
          <div className="h1a" style={{ fontFamily: "'Anton','Barlow Condensed',sans-serif", fontSize: '66px', lineHeight: 1.05, color: 'var(--sx-text-3)', textTransform: 'uppercase', textShadow: 'var(--sx-shadow-27)' }}>
            Overall Project Timeline
          </div>
          <div style={{ fontSize: '15px', letterSpacing: '6px', textTransform: 'uppercase', marginTop: '4px', color: 'var(--sx-text-11)', fontWeight: 600 }}>
            Dual-Track Construction &amp; Production Calendar · 2026 – 2027
          </div>
        </div>

        <div style={{ position: 'absolute', top: '16px', right: '56px', display: 'flex', alignItems: 'baseline', gap: '10px' }}>
          <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: '16px', letterSpacing: '3px', color: 'var(--sx-text-2)', textTransform: 'uppercase' }}>
            Overall timeline
          </span>
          <span style={{ fontFamily: "'Anton',sans-serif", fontSize: '22px', color: 'var(--sx-text-3)' }}>
            09
          </span>
          <span style={{ fontSize: '15px', color: 'var(--sx-text-2)' }}>
            / 12
          </span>
        </div>

        {/* Top KPI Summary Cards */}
        <div style={{ display: 'flex', gap: '12px', flex: 'none' }}>
          {/* Construction KPI */}
          <div style={{ background: 'var(--sx-bg-14)', border: 'var(--sxa-border-10)', borderRadius: '12px', padding: '10px 18px', minWidth: '170px', boxShadow: 'var(--sx-shadow-46)' }}>
            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: '12px', fontWeight: 800, letterSpacing: '1px', color: 'var(--sx-text-11)', textTransform: 'uppercase' }}>
              Construction Track
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginTop: '2px' }}>
              <span style={{ fontFamily: "'Anton',sans-serif", fontSize: '32px', color: 'var(--sx-text-26)', lineHeight: 1 }}>
                {constructionStats.avgPct}%
              </span>
              <span style={{ fontSize: '12px', color: 'var(--sx-text-2)' }}>overall</span>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--sx-text-47)', marginTop: '2px' }}>
              {constructionStats.completedCount}/{constructionStats.totalCount} scopes complete
            </div>
          </div>

          {/* Production KPI */}
          <div style={{ background: 'var(--sx-bg-14)', border: 'var(--sxa-border-11)', borderRadius: '12px', padding: '10px 18px', minWidth: '170px', boxShadow: 'var(--sx-shadow-48)' }}>
            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: '12px', fontWeight: 800, letterSpacing: '1px', color: 'var(--sx-text-34)', textTransform: 'uppercase' }}>
              Production Track
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginTop: '2px' }}>
              <span style={{ fontFamily: "'Anton',sans-serif", fontSize: '32px', color: 'var(--sx-text-26)', lineHeight: 1 }}>
                {productionStats.progressPct}%
              </span>
              <span style={{ fontSize: '12px', color: 'var(--sx-text-2)' }}>content</span>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--sx-text-47)', marginTop: '2px' }}>
              {productionStats.completedCount}/{productionStats.totalCount} episodes delivered
            </div>
          </div>

          {/* Target Milestone */}
          <div style={{ background: 'var(--sx-bg-14)', border: 'var(--sx-border-49)', borderRadius: '12px', padding: '10px 18px', minWidth: '200px', boxShadow: 'var(--sx-shadow-50)' }}>
            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: '12px', fontWeight: 800, letterSpacing: '1px', color: 'var(--sx-text-3)', textTransform: 'uppercase' }}>
              Final Turnover Target
            </div>
            <div style={{ fontFamily: "'Anton',sans-serif", fontSize: '24px', color: 'var(--sx-text-3)', lineHeight: 1.2, marginTop: '2px' }}>
              Apr 28 – 30, 2027
            </div>
            <div style={{ fontSize: '11px', color: 'var(--sx-text-2)', marginTop: '2px' }}>
              Ep 24 Grand Turnover &amp; Move-in
            </div>
          </div>
        </div>
      </div>

      {/* Control & Filter Strip */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--sx-bg-51)',
          border: 'var(--sx-border-52)',
          borderRadius: '10px',
          padding: '8px 16px',
          gap: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--sx-text-3)', textTransform: 'uppercase', letterSpacing: '1px' }}>
            Filter Tracks:
          </span>
          <button
            type="button"
            onClick={() => setViewFilter('all')}
            style={{
              padding: '5px 12px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 700,
              background: viewFilter === 'all' ? 'var(--sx-bg-7)' : 'var(--sx-bg-53)',
              color: viewFilter === 'all' ? '#FFFFFF' : 'var(--sx-text-26)',
              border: '1px solid',
              borderColor: viewFilter === 'all' ? '#9E75FF' : 'var(--sx-border-54)',
              cursor: 'pointer',
            }}
          >
            Dual-Track (Both)
          </button>
          <button
            type="button"
            onClick={() => setViewFilter('construction')}
            style={{
              padding: '5px 12px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 700,
              background: viewFilter === 'construction' ? 'var(--sxa-bg-3)' : 'var(--sx-bg-53)',
              color: viewFilter === 'construction' ? '#FFFFFF' : 'var(--sx-text-26)',
              border: '1px solid',
              borderColor: viewFilter === 'construction' ? 'var(--sxa-border-12)' : 'var(--sxa-border-13)',
              cursor: 'pointer',
            }}
          >
            Construction Only
          </button>
          <button
            type="button"
            onClick={() => setViewFilter('production')}
            style={{
              padding: '5px 12px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 700,
              background: viewFilter === 'production' ? 'var(--sxa-bg-14)' : 'var(--sx-bg-53)',
              color: viewFilter === 'production' ? '#FFFFFF' : 'var(--sx-text-26)',
              border: '1px solid',
              borderColor: viewFilter === 'production' ? 'var(--sxa-border-15)' : 'var(--sxa-border-16)',
              cursor: 'pointer',
            }}
          >
            Production (Episodes) Only
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '12px', color: 'var(--sx-text-2)' }}>Floor / Scope:</span>
            <select
              value={phaseFilter}
              onChange={(e) => setPhaseFilter(e.target.value)}
              style={{
                background: 'var(--sx-bg-5)',
                color: 'var(--sx-text-26)',
                border: 'var(--sx-border-52)',
                borderRadius: '6px',
                padding: '4px 8px',
                fontSize: '12px',
              }}
            >
              <option value="all">All Phases &amp; Floors</option>
              <option value="GF">Ground Floor (GF)</option>
              <option value="2F">Second Floor (2F)</option>
              <option value="3F">Third Floor (3F)</option>
              <option value="ALL">Site-Wide / Turnover</option>
            </select>
          </div>

          <input
            type="text"
            placeholder="Search activities or episodes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              background: 'var(--sx-bg-5)',
              color: 'var(--sx-text-26)',
              border: 'var(--sx-border-52)',
              borderRadius: '6px',
              padding: '4px 10px',
              fontSize: '12px',
              width: '220px',
            }}
          />
        </div>
      </div>

      {/* Main Dual-Track Visual Timeline & Gantt Axis */}
      <div
        style={{
          background: 'var(--sx-bg-14)',
          border: 'var(--sx-border-19)',
          borderRadius: '14px',
          boxShadow: 'var(--sx-shadow-36)',
          padding: '16px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: '18px', letterSpacing: '1px', textTransform: 'uppercase' }}>
              Synchronized Dual-Track Timeline <span style={{ color: 'var(--sx-text-3)' }}>at a glance</span>
            </span>
            <span style={{ fontSize: '12px', color: 'var(--sx-text-2)' }}>
              Oct 2026 – May 2027 · Bars = Activity Duration · Red Hatching = Holiday Stoppage (Dec 20 – Jan 3)
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '12px', height: '12px', background: 'var(--sxa-bg-17)', borderRadius: '3px', display: 'inline-block' }} />
              <span>Construction Track</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '12px', height: '12px', background: 'var(--sxa-bg-18)', borderRadius: '3px', display: 'inline-block' }} />
              <span>Production / Episode Shoot</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ color: 'var(--sx-text-3)', fontSize: '14px' }}>◆</span>
              <span>YouTube Post Date</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '12px', height: '12px', background: 'repeating-linear-gradient(45deg, #E0213B, #E0213B 3px, #7A0A17 3px, #7A0A17 6px)', borderRadius: '3px', display: 'inline-block' }} />
              <span>Work Stoppage</span>
            </div>
          </div>
        </div>

        {/* 8-Month Axis Header */}
        <div
          style={{
            position: 'relative',
            height: '28px',
            background: 'var(--sx-bg-53)',
            borderRadius: '6px',
            display: 'grid',
            gridTemplateColumns: 'repeat(8, 1fr)',
            alignItems: 'center',
            textAlign: 'center',
            fontSize: '12px',
            fontWeight: 700,
            color: 'var(--sx-text-2)',
            border: 'var(--sx-border-55)',
          }}
        >
          <div>OCT 2026</div>
          <div>NOV 2026</div>
          <div style={{ color: 'var(--sx-text-13)' }}>DEC 2026</div>
          <div>JAN 2027</div>
          <div>FEB 2027</div>
          <div>MAR 2027</div>
          <div style={{ color: 'var(--sx-text-3)' }}>APR 2027</div>
          <div>MAY 2027</div>

          {/* Holiday Work Stoppage Band Marker */}
          <div
            title="Work Stoppage: Dec 20 – Jan 3 (resume Jan 4)"
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: '33%',
              width: '5.5%',
              background: 'var(--ov-stop-hatch)',
              borderLeft: '1px dashed #E0213B',
              borderRight: '1px dashed #E0213B',
              pointerEvents: 'none',
            }}
          />
        </div>

        {/* Dual-Track Visual Lanes */}
        <div
          style={{
            position: 'relative',
            minHeight: '220px',
            background: 'var(--sx-bg-56)',
            borderRadius: '8px',
            padding: '12px 10px',
            border: 'var(--sx-border-45)',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          {/* Stoppage vertical overlay spanning lanes */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: '33%',
              width: '5.5%',
              background: 'var(--ov-holiday-hatch)',
              borderLeft: '1px dashed rgba(224,33,59,0.6)',
              borderRight: '1px dashed rgba(224,33,59,0.6)',
              zIndex: 1,
              pointerEvents: 'none',
            }}
          >
            <span
              style={{
                position: 'absolute',
                top: '4px',
                left: '50%',
                transform: 'translateX(-50%)',
                fontSize: '9px',
                color: '#FFA1AC',
                fontWeight: 800,
                textTransform: 'uppercase',
                whiteSpace: 'nowrap',
              }}
            >
              Break
            </span>
          </div>

          {/* Construction Track Lane */}
          {(viewFilter === 'all' || viewFilter === 'construction') && (
            <div style={{ position: 'relative', zIndex: 2 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--sx-text-11)', textTransform: 'uppercase', letterSpacing: '1px' }}>
                  Track 1: Construction &amp; Structural Execution
                </span>
                <span style={{ fontSize: '10px', color: 'var(--sx-text-2)' }}>
                  (Footings → Columns → Suspended Slabs → Finishing → Turnover)
                </span>
              </div>

              <div style={{ position: 'relative', height: '64px', background: 'var(--sx-bg-57)', borderRadius: '6px' }}>
                {syncMilestones.map((m) => (
                  <div
                    key={`c_${m.id}`}
                    onClick={() => setSelectedSyncId(m.id === selectedSyncId ? null : m.id)}
                    title={`Construction: ${m.constructionItem}\nDates: ${m.constructionDate}\nProgress: ${m.constructionProgress}%`}
                    style={{
                      position: 'absolute',
                      top: '6px',
                      left: `${m.startPct}%`,
                      width: `${m.durationPct}%`,
                      height: '48px',
                      background:
                        m.constructionStatus === 'Complete'
                          ? 'var(--tl-c-done)'
                          : m.constructionStatus === 'In progress'
                          ? 'var(--tl-c-prog)'
                          : 'var(--tl-c-up)',
                      border: m.id === selectedSyncId ? 'var(--sx-border-49)' : 'var(--sx-border-58)',
                      borderRadius: '5px',
                      padding: '4px 6px',
                      cursor: 'pointer',
                      boxShadow: m.id === selectedSyncId ? 'var(--sx-shadow-59)' : 'none',
                      transition: 'all 0.15s ease',
                      overflow: 'hidden',
                    }}
                  >
                    <div style={{ fontSize: '10px', fontWeight: 800, color: m.constructionStatus === 'Complete' || m.constructionStatus === 'In progress' ? '#FFFFFF' : 'var(--tl-up-fg)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {m.phase}
                    </div>
                    <div style={{ fontSize: '9px', color: m.constructionStatus === 'Complete' || m.constructionStatus === 'In progress' ? 'rgba(255,255,255,0.85)' : 'var(--tl-up-fg2)', whiteSpace: 'nowrap' }}>
                      {m.constructionProgress}% · {m.constructionFloor}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Production Track Lane */}
          {(viewFilter === 'all' || viewFilter === 'production') && (
            <div style={{ position: 'relative', zIndex: 2, marginTop: viewFilter === 'all' ? '12px' : '0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--sx-text-34)', textTransform: 'uppercase', letterSpacing: '1px' }}>
                  Track 2: Production Calendar
                </span>
                <span style={{ fontSize: '10px', color: 'var(--sx-text-2)' }}>
                  (24 YouTube Episodes · Shoot Windows &amp; Post Milestones ◆)
                </span>
              </div>

              <div style={{ position: 'relative', height: '64px', background: 'var(--sx-bg-57)', borderRadius: '6px' }}>
                {syncMilestones.map((m) => (
                  <div
                    key={`p_${m.id}`}
                    onClick={() => setSelectedSyncId(m.id === selectedSyncId ? null : m.id)}
                    title={`Episode ${m.productionEpisodeNum}: ${m.productionEpisodeTitle}\nShoot: ${m.productionShootDate}\nPost: ${m.productionPostDate}`}
                    style={{
                      position: 'absolute',
                      top: '6px',
                      left: `${m.startPct}%`,
                      width: `${m.durationPct}%`,
                      height: '48px',
                      background:
                        m.productionStatus === 'Completed'
                          ? 'var(--tl-p-done)'
                          : m.productionStatus === 'Scheduled'
                          ? 'var(--tl-p-sched)'
                          : 'var(--tl-p-up)',
                      border: m.id === selectedSyncId ? 'var(--sx-border-49)' : 'var(--sxa-border-19)',
                      borderRadius: '5px',
                      padding: '4px 6px',
                      cursor: 'pointer',
                      boxShadow: m.id === selectedSyncId ? 'var(--sx-shadow-59)' : 'none',
                      transition: 'all 0.15s ease',
                      overflow: 'hidden',
                    }}
                  >
                    <div style={{ fontSize: '10px', fontWeight: 800, color: m.productionStatus === 'Completed' || m.productionStatus === 'Scheduled' ? '#FFFFFF' : 'var(--tl-up-fg)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      Ep {m.productionEpisodeNum}
                    </div>
                    <div style={{ fontSize: '9px', color: m.productionStatus === 'Completed' || m.productionStatus === 'Scheduled' ? 'rgba(255,255,255,0.85)' : 'var(--tl-up-fg2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      ◆ {m.productionPostDate.replace(', 2026', '').replace(', 2027', '')}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Synchronized Master Table */}
      <div
        style={{
          background: 'var(--sx-bg-14)',
          border: 'var(--sx-border-19)',
          borderRadius: '14px',
          boxShadow: 'var(--sx-shadow-36)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            height: '36px',
            padding: '0 16px',
            background: 'var(--sx-bg-38)',
            borderBottom: 'var(--sx-border-52)',
          }}
        >
          <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: '16px', letterSpacing: '1px', textTransform: 'uppercase' }}>
            Synchronized Milestones Matrix <span style={{ color: 'var(--sx-text-3)' }}>({filteredMilestones.length} Key Checkpoints)</span>
          </span>
          <span style={{ fontSize: '11px', color: 'var(--sx-text-2)' }}>
            Click any row to highlight on timeline · Real-time sync across both departments
          </span>
        </div>

        {/* Table Header */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '120px 240px 180px 100px 300px 150px 1fr',
            gap: '8px',
            padding: '8px 16px',
            background: 'var(--sx-bg-61)',
            borderBottom: 'var(--sx-border-62)',
            fontSize: '11px',
            fontWeight: 800,
            textTransform: 'uppercase',
            color: 'var(--sx-text-2)',
            letterSpacing: '1px',
          }}
        >
          <div>Timeline Phase</div>
          <div>Construction Activity</div>
          <div>Target Dates</div>
          <div>Progress</div>
          <div>Production Episode &amp; Content</div>
          <div>Shoot Window</div>
          <div>Cross-Department Sync Details</div>
        </div>

        {/* Table Body */}
        <div style={{ overflowY: 'auto', maxHeight: '420px' }}>
          {filteredMilestones.map((m) => {
            const isSelected = m.id === selectedSyncId;
            const statusConfig = STATUS_COLORS[m.constructionStatus] || STATUS_COLORS['Planned'];

            return (
              <div
                key={m.id}
                onClick={() => setSelectedSyncId(isSelected ? null : m.id)}
                onDoubleClick={!canEdit ? onViewerAttemptEdit : undefined}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '120px 240px 180px 100px 300px 150px 1fr',
                  gap: '8px',
                  alignItems: 'center',
                  padding: '7px 16px',
                  borderBottom: 'var(--sx-border-45)',
                  background: isSelected
                    ? 'rgba(123,77,255,0.30)'
                    : m.id === 'sync_holiday'
                    ? 'rgba(224,33,59,0.10)'
                    : 'transparent',
                  cursor: 'pointer',
                  transition: 'background 0.15s ease',
                  fontSize: '12px',
                }}
              >
                {/* Phase */}
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontWeight: 700, color: 'var(--sx-text-3)' }}>{m.phase}</span>
                  <span style={{ fontSize: '10px', color: 'var(--sx-text-2)' }}>{m.monthRange}</span>
                </div>

                {/* Construction Activity */}
                <div style={{ color: 'var(--sx-text-26)', fontWeight: 600 }}>
                  {m.constructionItem}
                </div>

                {/* Construction Dates */}
                <div style={{ fontSize: '11px', color: 'var(--sx-text-2)' }}>
                  {m.constructionDate}
                </div>

                {/* Progress & Badge */}
                <div>
                  <span
                    style={{
                      display: 'inline-block',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '10px',
                      fontWeight: 800,
                      background: statusConfig[0],
                      color: statusConfig[1],
                      border: `1px solid ${statusConfig[2]}`,
                    }}
                  >
                    {m.constructionProgress}% · {m.constructionStatus}
                  </span>
                </div>

                {/* Production Episode */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span
                      style={{
                        background: 'var(--sxa-bg-14)',
                        color: 'var(--sx-text-1)',
                        fontWeight: 800,
                        fontSize: '10px',
                        padding: '1px 6px',
                        borderRadius: '3px',
                      }}
                    >
                      EP {m.productionEpisodeNum}
                    </span>
                    <span style={{ fontWeight: 600, color: 'var(--sx-text-26)', fontSize: '12px' }}>
                      {m.productionEpisodeTitle}
                    </span>
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--sx-text-3)', marginTop: '2px' }}>
                    YouTube Post: {m.productionPostDate}
                  </div>
                </div>

                {/* Shoot Window */}
                <div style={{ fontSize: '11px', color: 'var(--sx-text-2)' }}>
                  {m.productionShootDate}
                </div>

                {/* Sync Note */}
                <div style={{ fontSize: '11px', color: 'var(--sx-text-11)', fontStyle: 'italic' }}>
                  {m.syncNote}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Slide Footer */}
      <div
        className="ftr"
        style={{
          position: 'absolute',
          left: '340px',
          right: '340px',
          bottom: '36px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          alignItems: 'center',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px', width: '100%' }}>
          <div style={{ flex: 1, height: '1px', background: 'var(--sx-bg-32)' }} />
          <div className="wm" style={{ fontSize: '20px', letterSpacing: '8px', fontWeight: 500, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
            Convengers Assemble · Master Integrated Calendar
          </div>
          <div style={{ flex: 1, height: '1px', background: 'var(--sx-bg-32)' }} />
        </div>
        <div style={{ fontSize: '11px', color: 'var(--sx-text-2)', textAlign: 'center' }}>
          Official synchronized schedule: Construction site execution (Mon–Sat) + Multiverse Content Production (Episodes 1–24).
          Visit official portal at <b className="text-[var(--sx-text-3)]">www.ConvengersAssemble.com</b>.
        </div>
        <div className="ver" style={{ fontSize: '11px', fontWeight: 600, color: 'var(--sx-text-3)', textAlign: 'center' }}>
          Slide 09 · Overall Project Timeline (Master Schedule)
        </div>
      </div>
      </div>
    </section>
  );
};
