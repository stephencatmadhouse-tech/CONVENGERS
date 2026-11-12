/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Milestone, ScopeItem, ConcretePour, Episode, SystemSettings, RemoteFocus } from '../types/index.ts';
import { STATUS_COLORS } from '../constants/assets.ts';
import { BrandLogo } from './BrandLogo.tsx';
import { INITIAL_MILESTONES } from '../db/seedData.ts';
import { CollaborativeCell } from './CollaborativeCell.tsx';
import { realtime } from '../utils/realtime.ts';
import {
  calculateMilestonesCompletion,
  calculateScheduleElapsed,
  calculateConcreteCompletion,
  toIsoDate,
  parseIsoDate,
  parseDateWindow,
} from '../utils/calculations.ts';

interface OverviewSlideProps {
  milestones: Milestone[];
  scopes: ScopeItem[];
  pours: ConcretePour[];
  episodes: Episode[];
  settings: SystemSettings;
  canEdit: boolean;
  canEditTimeline?: boolean;
  onUpdateMilestone: (id: string, status: Milestone['status']) => void;
  onUpdateMilestoneField?: (id: string, field: 'label' | 'dateText', value: string) => void;
  remoteFocusMap?: Record<string, RemoteFocus>;
  onViewerAttemptEdit?: () => void;
}

export const OverviewSlide: React.FC<OverviewSlideProps> = ({
  milestones,
  scopes: _scopes,
  pours,
  episodes,
  settings,
  canEdit,
  canEditTimeline = canEdit,
  onUpdateMilestone,
  onUpdateMilestoneField,
  remoteFocusMap = {},
  onViewerAttemptEdit,
}) => {
  const overallMilestonePct = calculateMilestonesCompletion(milestones);
  const elapsed = calculateScheduleElapsed();
  const concreteOverall = calculateConcreteCompletion(pours);

  // Today marker for Gantt
  const today = new Date();
  const ganttStart = new Date(2026, 9, 1); // Oct 1, 2026
  const ganttDays = 212; // Oct 1 to Apr 30
  const todayOffset = (today.getTime() - ganttStart.getTime()) / (86400000 * ganttDays) * 100;
  const isTodayVisible = todayOffset >= 0 && todayOffset <= 100;

  const todayLabel = `Today · ${today.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;

  const calcGanttPct = (d: Date) => {
    return Math.max(0, Math.min(100, ((d.getTime() - ganttStart.getTime()) / (86400000 * ganttDays)) * 100));
  };

  return (
    <section className="wrap">
      <div
        className="slide"
        data-f="OV"
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
          gap: '22px',
        }}
      >
        <div className="stl" />
        <div className="str" />

        {/* Header */}
        <div className="hdr" style={{ display: 'flex', alignItems: 'center', gap: '30px', height: '150px', flex: 'none' }}>
          <BrandLogo variant="slide" />
          <div className="ttl" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: '30px', lineHeight: 1.1, letterSpacing: '2px', textTransform: 'uppercase' }}>
              Scope of work
            </div>
            <div className="h1a" style={{ fontFamily: "'Anton','Barlow Condensed',sans-serif", fontSize: '70px', lineHeight: 1.05, color: 'var(--sx-text-3)', textTransform: 'uppercase', textShadow: 'var(--sx-shadow-27)' }}>
              Timeline
            </div>
            <div style={{ fontSize: '16px', letterSpacing: '8px', textTransform: 'uppercase', marginTop: '4px' }}>
              Convengers Bahay Build
            </div>
          </div>

          {/* Right Top Status Cards */}
          <div className="rb" style={{ width: '540px', flex: 'none', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ background: 'var(--sx-bg-14)', border: 'var(--sx-border-19)', borderRadius: '14px', boxShadow: 'var(--sx-shadow-36)', overflow: 'hidden' }}>
              <div style={{ padding: '8px 14px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: '17px', letterSpacing: '1.5px', color: 'var(--sx-text-3)' }}>
                    OVERALL STATUS
                  </span>
                  <span style={{ fontFamily: "'Anton',sans-serif", fontSize: '26px', lineHeight: 1, color: 'var(--sx-text-3)' }}>
                    {overallMilestonePct}%
                  </span>
                </div>
                <div style={{ height: '10px', borderRadius: '5px', background: 'var(--sx-bg-35)', position: 'relative' }}>
                  <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${Math.max(overallMilestonePct, 2)}%`, borderRadius: '5px', background: 'var(--sx-bg-37)' }} />
                </div>
                <div style={{ fontSize: '12px', color: 'var(--sx-text-2)', whiteSpace: 'nowrap' }}>
                  Milestones complete (in progress = half) · schedule elapsed {elapsed.elapsedPercent}%
                </div>
              </div>
            </div>

            <div style={{ background: 'var(--sx-bg-14)', border: 'var(--sx-border-19)', borderRadius: '14px', boxShadow: 'var(--sx-shadow-36)', overflow: 'hidden' }}>
              <div style={{ padding: '8px 14px', display: 'flex', gap: '10px', alignItems: 'center', whiteSpace: 'nowrap' }}>
                <span style={{ background: '#E0213B', color: '#fff', fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: '17px', letterSpacing: '1.5px', padding: '2px 10px', borderRadius: '4px' }}>
                  WORK STOPPAGE
                </span>
                <span style={{ fontSize: '16px', fontWeight: 700 }}>
                  Stops after Dec 19 · resumes Jan 4, 2027
                </span>
              </div>
            </div>
          </div>

          {/* Section Indicator */}
          <div style={{ position: 'absolute', top: '16px', right: '56px', display: 'flex', alignItems: 'baseline', gap: '10px' }}>
            <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: '16px', letterSpacing: '3px', color: 'var(--sx-text-2)', textTransform: 'uppercase' }}>
              Overview
            </span>
            <span style={{ fontFamily: "'Anton',sans-serif", fontSize: '22px', color: 'var(--sx-text-3)' }}>
              01
            </span>
            <span style={{ fontSize: '15px', color: 'var(--sx-text-2)' }}>
              / 12
            </span>
          </div>
        </div>

        {/* Body */}
        <div className="bodyw" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Quick Facts */}
          <div style={{ background: 'var(--sx-bg-14)', border: 'var(--sx-border-19)', borderRadius: '14px', boxShadow: 'var(--sx-shadow-36)', overflow: 'hidden', flex: 'none' }}>
            <div className="facts" style={{ display: 'flex' }}>
              <div style={{ flex: 1, padding: '14px 22px', borderRight: 'var(--sx-border-31)' }}>
                <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: '18px', letterSpacing: '1px', color: 'var(--sx-text-3)', textTransform: 'uppercase' }}>
                  Work calendar:
                </div>
                <div style={{ fontSize: '25px', fontWeight: 700, lineHeight: 1.2 }}>Monday – Saturday</div>
              </div>
              <div style={{ flex: 1, padding: '14px 22px', borderRight: 'var(--sx-border-31)' }}>
                <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: '18px', letterSpacing: '1px', color: 'var(--sx-text-3)', textTransform: 'uppercase' }}>
                  Work stoppage:
                </div>
                <div style={{ fontSize: '25px', fontWeight: 700, lineHeight: 1.2 }}>Dec 20 – Jan 3 (resume Jan 4)</div>
              </div>
              <div style={{ flex: 1, padding: '14px 22px', borderRight: 'var(--sx-border-31)' }}>
                <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: '18px', letterSpacing: '1px', color: 'var(--sx-text-3)', textTransform: 'uppercase' }}>
                  Punchlist date:
                </div>
                <div style={{ fontSize: '25px', fontWeight: 700, lineHeight: 1.2 }}>Apr 7, 2027</div>
              </div>
              <div style={{ flex: 1, padding: '14px 22px', borderRight: 'var(--sx-border-31)' }}>
                <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: '18px', letterSpacing: '1px', color: 'var(--sx-text-3)', textTransform: 'uppercase' }}>
                  Turnover ceremony:
                </div>
                <div style={{ fontSize: '25px', fontWeight: 700, lineHeight: 1.2 }}>Apr 30, 2027</div>
              </div>
              <div style={{ flex: 1, padding: '14px 22px' }}>
                <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: '18px', letterSpacing: '1px', color: 'var(--sx-text-3)', textTransform: 'uppercase' }}>
                  Concrete Milestones:
                </div>
                <div style={{ fontSize: '25px', fontWeight: 700, lineHeight: 1.2, color: 'var(--sx-text-8)' }}>
                  {concreteOverall.percent}% ({concreteOverall.completed}/{concreteOverall.total})
                </div>
              </div>
            </div>
          </div>

          {/* Section 1: Key Milestone Dates */}
          <div style={{ background: 'var(--sx-bg-14)', border: 'var(--sx-border-19)', borderRadius: '14px', boxShadow: 'var(--sx-shadow-36)', overflow: 'hidden', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'stretch', height: '52px', flex: 'none', background: 'var(--sx-bg-38)' }}>
              <div style={{ width: '66px', flex: 'none', background: 'var(--sx-bg-12)', clipPath: 'polygon(0 0,100% 0,74% 100%,0 100%)', display: 'flex', alignItems: 'center', paddingLeft: '16px', color: 'var(--sx-text-1)', fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: '30px' }}>
                1
              </div>
              <div className="chd" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px', paddingLeft: '6px', fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: '25px', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                <span>KEY</span>
                <span style={{ color: 'var(--sx-text-3)' }}>MILESTONE DATES</span>
              </div>
              <div className="leg" style={{ display: 'flex', gap: '14px', alignItems: 'center', paddingRight: '10px', fontSize: '13px', color: 'var(--sx-text-2)', whiteSpace: 'nowrap' }}>
                <span>Status:</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ width: '9px', height: '9px', borderRadius: '50%', background: 'var(--sx-bg-63)' }} />Upcoming</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ width: '9px', height: '9px', borderRadius: '50%', background: 'var(--sxa-bg-9)' }} />In progress</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ width: '9px', height: '9px', borderRadius: '50%', background: '#4BE08A' }} />Complete</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ width: '9px', height: '9px', borderRadius: '50%', background: '#E0213B' }} />Delayed</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ width: '9px', height: '9px', borderRadius: '50%', background: 'var(--sxa-bg-1)' }} />Date passed · confirm</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', paddingRight: '14px', fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: '30px', color: 'var(--sx-text-3)', letterSpacing: '-4px', fontStyle: 'italic' }}>
                //
              </div>
            </div>

            <div className="mgrid" style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gridTemplateRows: 'repeat(7,1fr)', gridAutoFlow: 'column', gap: '8px 16px', padding: '16px' }}>
              {milestones.map((m) => {
                const colors = STATUS_COLORS[m.status] || STATUS_COLORS['Upcoming'];
                const initial = INITIAL_MILESTONES.find((im) => im.id === m.id);
                const safeDate = (m.dateText && m.dateText.trim()) || initial?.dateText || '—';
                const safeLabel = (m.label && m.label.trim()) || initial?.label || '—';
                const safeBadge = m.badge || initial?.badge;

                const dateFocus = remoteFocusMap?.[`milestone_${m.id}_date`];
                const labelFocus = remoteFocusMap?.[`milestone_${m.id}_label`];
                const statusFocus = remoteFocusMap?.[`milestone_${m.id}_status`];

                return (
                  <div
                    key={m.id}
                    className="mrow"
                    style={{
                      boxSizing: 'border-box',
                      background: 'var(--sx-bg-43)',
                      border: 'var(--sx-border-31)',
                      borderRadius: '10px',
                      padding: '3px 12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '14px',
                      minHeight: 0,
                    }}
                  >
                    <div style={{ width: '215px', flex: 'none', fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: '28px', lineHeight: 1, color: 'var(--sx-text-3)', whiteSpace: 'nowrap' }}>
                      <CollaborativeCell
                        cellId={`milestone_${m.id}_date`}
                        value={safeDate}
                        fallbackValue={initial?.dateText}
                        remoteFocus={dateFocus}
                        canEdit={canEditTimeline}
                        onViewerAttemptEdit={onViewerAttemptEdit}
                        onSave={(val) => {
                          if (onUpdateMilestoneField) {
                            onUpdateMilestoneField(m.id, 'dateText', val);
                          }
                        }}
                        className="mdate"
                      />
                    </div>
                    <div style={{ flex: 1, minWidth: 0, fontSize: '15px', lineHeight: '18px' }}>
                      <CollaborativeCell
                        cellId={`milestone_${m.id}_label`}
                        value={safeLabel}
                        fallbackValue={initial?.label}
                        remoteFocus={labelFocus}
                        canEdit={canEditTimeline}
                        onViewerAttemptEdit={onViewerAttemptEdit}
                        onSave={(val) => {
                          if (onUpdateMilestoneField) {
                            onUpdateMilestoneField(m.id, 'label', val);
                          }
                        }}
                      />
                      {safeBadge && (
                        <span
                          style={{
                            display: 'inline-block',
                            background: safeBadge.type === 'confirmed' || safeBadge.type === 'provided' ? '#4BE08A' : safeBadge.type === 'planned' ? 'var(--sxa-bg-9)' : 'var(--sx-bg-12)',
                            color: safeBadge.type === 'planned' ? '#fff' : 'var(--sx-text-1)',
                            fontSize: '11px',
                            fontWeight: 600,
                            padding: '0 7px',
                            borderRadius: '4px',
                            marginLeft: '6px',
                            verticalAlign: '1px',
                          }}
                        >
                          {safeBadge.text}
                        </span>
                      )}
                      {m.updatedBy && (
                        <div className="text-[10px] text-[var(--sx-text-2)]/70 italic mt-0.5 font-sans">
                          Last updated by {m.updatedBy} {m.updatedAt ? `on ${new Date(m.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}
                        </div>
                      )}
                    </div>
                    <div
                      style={{
                        flex: 'none',
                        position: 'relative',
                        outline: statusFocus ? `2px solid ${statusFocus.userColor}` : undefined,
                        outlineOffset: '2px',
                        borderRadius: '12px',
                      }}
                    >
                      {statusFocus && (
                        <span
                          className="absolute -top-3.5 right-0 z-20 px-1 py-0.2 text-[9px] font-bold rounded shadow pointer-events-none whitespace-nowrap"
                          style={{ background: statusFocus.userColor, color: 'var(--sx-text-1)' }}
                        >
                          {statusFocus.userName}
                        </span>
                      )}
                      {canEdit ? (
                        <select
                          className="mst"
                          value={m.status}
                          onFocus={() => realtime.focusCell(`milestone_${m.id}_status`)}
                          onBlur={() => realtime.blurCell(`milestone_${m.id}_status`)}
                          onChange={(e) => onUpdateMilestone(m.id, e.target.value as any)}
                          style={{ background: colors[0], color: colors[1], borderColor: colors[2] }}
                          aria-label="Milestone status"
                        >
                          <option value="Upcoming">Upcoming</option>
                          <option value="In progress">In progress</option>
                          <option value="Complete">Complete</option>
                          <option value="Delayed">Delayed</option>
                          <option value="Date passed · confirm">Date passed · confirm</option>
                        </select>
                      ) : (
                        <span
                          className="mst inline-flex items-center justify-center font-bold px-3 py-1 text-xs rounded-full border shadow-xs cursor-default"
                          onDoubleClick={onViewerAttemptEdit}
                          style={{ background: colors[0], color: colors[1], borderColor: colors[2] }}
                        >
                          {m.status}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 2: Project Timeline At A Glance (Gantt) */}
          <div style={{ background: 'var(--sx-bg-14)', border: 'var(--sx-border-19)', borderRadius: '14px', boxShadow: 'var(--sx-shadow-36)', overflow: 'hidden', flex: 'none' }}>
            <div style={{ display: 'flex', alignItems: 'stretch', height: '52px', flex: 'none', background: 'var(--sx-bg-38)' }}>
              <div style={{ width: '66px', flex: 'none', background: 'var(--sx-bg-12)', clipPath: 'polygon(0 0,100% 0,74% 100%,0 100%)', display: 'flex', alignItems: 'center', paddingLeft: '16px', color: 'var(--sx-text-1)', fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: '30px' }}>
                2
              </div>
              <div className="chd" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px', paddingLeft: '6px', fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: '25px', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                <span>PROJECT TIMELINE</span>
                <span style={{ color: 'var(--sx-text-8)' }}>AT A GLANCE</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', paddingRight: '14px', fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: '30px', color: 'var(--sx-text-3)', letterSpacing: '-4px', fontStyle: 'italic' }}>
                //
              </div>
            </div>

            <div className="gpad" style={{ padding: '16px 20px 16px 210px' }}>
              <div className="gantt" style={{ position: 'relative', height: '298px' }}>
                {/* Month Grid */}
                <div style={{ position: 'absolute', left: '0.00%', top: '24px', bottom: 0, width: '1px', background: 'var(--sx-bg-35)' }} />
                <div style={{ position: 'absolute', left: 'calc(0.00% + 6px)', top: 0, fontSize: '13px', fontWeight: 600, color: 'var(--sx-text-2)' }}>Oct 2026</div>

                <div style={{ position: 'absolute', left: '14.62%', top: '24px', bottom: 0, width: '1px', background: 'var(--sx-bg-35)' }} />
                <div style={{ position: 'absolute', left: 'calc(14.62% + 6px)', top: 0, fontSize: '13px', fontWeight: 600, color: 'var(--sx-text-2)' }}>Nov 2026</div>

                <div style={{ position: 'absolute', left: '28.77%', top: '24px', bottom: 0, width: '1px', background: 'var(--sx-bg-35)' }} />
                <div style={{ position: 'absolute', left: 'calc(28.77% + 6px)', top: 0, fontSize: '13px', fontWeight: 600, color: 'var(--sx-text-2)' }}>Dec 2026</div>

                <div style={{ position: 'absolute', left: '43.40%', top: '24px', bottom: 0, width: '1px', background: 'var(--sx-bg-35)' }} />
                <div style={{ position: 'absolute', left: 'calc(43.40% + 6px)', top: 0, fontSize: '13px', fontWeight: 600, color: 'var(--sx-text-2)' }}>Jan 2027</div>

                <div style={{ position: 'absolute', left: '58.02%', top: '24px', bottom: 0, width: '1px', background: 'var(--sx-bg-35)' }} />
                <div style={{ position: 'absolute', left: 'calc(58.02% + 6px)', top: 0, fontSize: '13px', fontWeight: 600, color: 'var(--sx-text-2)' }}>Feb 2027</div>

                <div style={{ position: 'absolute', left: '71.23%', top: '24px', bottom: 0, width: '1px', background: 'var(--sx-bg-35)' }} />
                <div style={{ position: 'absolute', left: 'calc(71.23% + 6px)', top: 0, fontSize: '13px', fontWeight: 600, color: 'var(--sx-text-2)' }}>Mar 2027</div>

                <div style={{ position: 'absolute', left: '85.85%', top: '24px', bottom: 0, width: '1px', background: 'var(--sx-bg-35)' }} />
                <div style={{ position: 'absolute', left: 'calc(85.85% + 6px)', top: 0, fontSize: '13px', fontWeight: 600, color: 'var(--sx-text-2)' }}>Apr 2027</div>

                {/* Work Stoppage Band */}
                <div style={{ position: 'absolute', left: '37.74%', width: '7.08%', top: '24px', bottom: 0, background: 'var(--ov-stop-bg)', zIndex: 1 }} />

                {/* Construction Bars */}
                {/* GF Structural */}
                <div style={{ position: 'absolute', left: '-190px', width: '180px', top: '28px', height: '30px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', fontWeight: 600 }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: 'var(--sxa-bg-3)', flex: 'none' }} />GF · Structural
                </div>
                <div style={{ position: 'absolute', left: 0, right: 0, top: '28px', height: '30px', borderBottom: 'var(--sx-border-29)' }}>
                  <div style={{ position: 'absolute', left: '1.89%', width: '35.85%', top: '5px', height: '20px', borderRadius: '4px', background: 'var(--sxa-bg-3)' }} />
                  <div style={{ position: 'absolute', left: '49.06%', width: '3.77%', top: '5px', height: '20px', borderRadius: '4px', background: 'var(--sxa-bg-20)' }} />
                  <div style={{ position: 'absolute', left: 'calc(52.76% + 6px)', top: '7px', fontSize: '13px', color: 'var(--sx-text-2)', whiteSpace: 'nowrap' }}>
                    Oct 5 – Dec 19, 2026 · stair framing Jan 13–20, 2027
                  </div>
                </div>

                {/* GF Finishing */}
                <div style={{ position: 'absolute', left: '-190px', width: '180px', top: '58px', height: '30px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', fontWeight: 600 }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: 'var(--sxa-bg-1)', flex: 'none' }} />GF · Finishing
                </div>
                <div style={{ position: 'absolute', left: 0, right: 0, top: '58px', height: '30px', borderBottom: 'var(--sx-border-29)' }}>
                  <div style={{ position: 'absolute', left: '46.23%', width: '46.23%', top: '5px', height: '20px', borderRadius: '4px', background: 'var(--sxa-bg-1)' }} />
                  <div style={{ position: 'absolute', right: 'calc(53.77% + 8px)', top: '7px', fontSize: '13px', color: 'var(--sx-text-2)', whiteSpace: 'nowrap' }}>
                    Jan 7 – Apr 14, 2027
                  </div>
                </div>

                {/* 2F Structural */}
                <div style={{ position: 'absolute', left: '-190px', width: '180px', top: '88px', height: '30px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', fontWeight: 600 }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: 'var(--sxa-bg-3)', flex: 'none' }} />2F · Structural
                </div>
                <div style={{ position: 'absolute', left: 0, right: 0, top: '88px', height: '30px', borderBottom: 'var(--sx-border-29)' }}>
                  <div style={{ position: 'absolute', left: '20.75%', width: '7.08%', top: '5px', height: '20px', borderRadius: '4px', background: 'var(--sxa-bg-3)' }} />
                  <div style={{ position: 'absolute', left: '52.83%', width: '3.30%', top: '5px', height: '20px', borderRadius: '4px', background: 'var(--sxa-bg-20)' }} />
                  <div style={{ position: 'absolute', left: 'calc(56.06% + 6px)', top: '7px', fontSize: '13px', color: 'var(--sx-text-2)', whiteSpace: 'nowrap' }}>
                    Nov 14 – Nov 28, 2026 · stair framing Jan 21–27, 2027
                  </div>
                </div>

                {/* 2F Finishing */}
                <div style={{ position: 'absolute', left: '-190px', width: '180px', top: '118px', height: '30px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', fontWeight: 600 }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: 'var(--sxa-bg-1)', flex: 'none' }} />2F · Finishing
                </div>
                <div style={{ position: 'absolute', left: 0, right: 0, top: '118px', height: '30px', borderBottom: 'var(--sx-border-29)' }}>
                  <div style={{ position: 'absolute', left: '28.77%', width: '31.60%', top: '5px', height: '20px', borderRadius: '4px', background: 'var(--sxa-bg-1)' }} />
                  <div style={{ position: 'absolute', left: 'calc(60.31% + 6px)', top: '7px', fontSize: '13px', color: 'var(--sx-text-2)', whiteSpace: 'nowrap' }}>
                    Dec 1, 2026 – Feb 5, 2027
                  </div>
                </div>

                {/* 3F Structural */}
                <div style={{ position: 'absolute', left: '-190px', width: '180px', top: '148px', height: '30px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', fontWeight: 600 }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: 'var(--sxa-bg-3)', flex: 'none' }} />3F · Structural
                </div>
                <div style={{ position: 'absolute', left: 0, right: 0, top: '148px', height: '30px', borderBottom: 'var(--sx-border-29)' }}>
                  <div style={{ position: 'absolute', left: '27.36%', width: '32.08%', top: '5px', height: '20px', borderRadius: '4px', background: 'var(--sxa-bg-3)' }} />
                  <div style={{ position: 'absolute', left: 'calc(59.36% + 6px)', top: '7px', fontSize: '13px', color: 'var(--sx-text-2)', whiteSpace: 'nowrap' }}>
                    Nov 28, 2026 – Feb 3, 2027
                  </div>
                </div>

                {/* 3F Finishing */}
                <div style={{ position: 'absolute', left: '-190px', width: '180px', top: '178px', height: '30px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', fontWeight: 600 }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: 'var(--sxa-bg-1)', flex: 'none' }} />3F · Finishing
                </div>
                <div style={{ position: 'absolute', left: 0, right: 0, top: '178px', height: '30px', borderBottom: 'var(--sx-border-29)' }}>
                  <div style={{ position: 'absolute', left: '61.32%', width: '27.83%', top: '5px', height: '20px', borderRadius: '4px', background: 'var(--sxa-bg-1)' }} />
                  <div style={{ position: 'absolute', right: 'calc(38.68% + 8px)', top: '7px', fontSize: '13px', color: 'var(--sx-text-2)', whiteSpace: 'nowrap' }}>
                    Feb 8 – Apr 7, 2027
                  </div>
                </div>

                {/* Closeout */}
                <div style={{ position: 'absolute', left: '-190px', width: '180px', top: '208px', height: '30px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', fontWeight: 600 }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: '#4BE08A', flex: 'none' }} />Closeout
                </div>
                <div style={{ position: 'absolute', left: 0, right: 0, top: '208px', height: '30px', borderBottom: 'var(--sx-border-29)' }}>
                  <div style={{ position: 'absolute', left: '88.68%', width: '0.94%', top: '5px', height: '20px', borderRadius: '4px', background: 'var(--sx-bg-12)' }} />
                  <div style={{ position: 'absolute', left: '89.15%', width: '8.02%', top: '5px', height: '20px', borderRadius: '4px', background: 'var(--sxa-bg-1)' }} />
                  <div style={{ position: 'absolute', left: '97.64%', width: '0.94%', top: '5px', height: '20px', borderRadius: '4px', background: 'var(--sx-bg-33)' }} />
                  <div style={{ position: 'absolute', left: '98.58%', width: '0.94%', top: '5px', height: '20px', borderRadius: '4px', background: '#4BE08A' }} />
                  <div style={{ position: 'absolute', left: '99.53%', width: '0.94%', top: '5px', height: '20px', borderRadius: '4px', background: 'var(--sxa-bg-14)' }} />
                  <div style={{ position: 'absolute', right: 'calc(11.32% + 8px)', top: '7px', fontSize: '13px', color: 'var(--sx-text-2)', whiteSpace: 'nowrap' }}>
                    Punchlist Apr 7 · Rectification Apr 8–24 · Interior styling Apr 26–27 · Move-in Apr 28–29 · Turnover Apr 30
                  </div>
                </div>

                {/* Content Shoots Row */}
                <div style={{ position: 'absolute', left: '-190px', width: '180px', top: '238px', height: '30px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', fontWeight: 600 }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: 'var(--sxa-bg-14)', flex: 'none' }} />Content shoots
                </div>
                <div style={{ position: 'absolute', left: 0, right: 0, top: '238px', height: '30px', borderBottom: 'var(--sx-border-29)' }}>
                  {episodes.map((ep) => {
                    const start = parseIsoDate(ep.shootStart);
                    if (!start) return null;
                    const end = parseIsoDate(ep.shootEnd) || start;
                    const l = calcGanttPct(start);
                    const r = calcGanttPct(new Date(end.getTime() + 86400000));
                    return (
                      <React.Fragment key={ep.id}>
                        <div
                          title={`${ep.episodeLabel ? ep.episodeLabel : `Ep ${ep.number}`}: ${ep.title}`}
                          style={{
                            position: 'absolute',
                            left: `${l}%`,
                            width: `${Math.max(r - l, 0.4)}%`,
                            top: '-214px',
                            height: '214px',
                            background: 'var(--ov-shoot-bg)',
                            borderLeft: 'var(--ov-shoot-bd)',
                            borderRight: 'var(--ov-shoot-bd)',
                            pointerEvents: 'none',
                          }}
                        />
                        <div
                          title={`${ep.episodeLabel ? ep.episodeLabel : `Ep ${ep.number}`}: ${ep.title} (${ep.status})`}
                          style={{
                            position: 'absolute',
                            left: `${(l + r) / 2}%`,
                            top: `${4 + (ep.number % 2) * 12}px`,
                            transform: 'translateX(-50%)',
                            minWidth: '15px',
                            height: '13px',
                            borderRadius: '7px',
                            background: 'var(--sxa-bg-14)',
                            color: 'var(--sx-text-1)',
                            fontSize: '10px',
                            fontWeight: 700,
                            lineHeight: '13px',
                            textAlign: 'center',
                            padding: '0 3px',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {ep.episodeLabel || ep.number}
                        </div>
                      </React.Fragment>
                    );
                  })}
                </div>

                {/* Concrete Pours & Milestones Row */}
                <div style={{ position: 'absolute', left: '-190px', width: '180px', top: '268px', height: '30px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', fontWeight: 600 }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: 'var(--sxa-bg-1)', flex: 'none' }} />Pours &amp; Milestones
                </div>
                <div style={{ position: 'absolute', left: 0, right: 0, top: '268px', height: '30px', borderBottom: 'var(--sx-border-29)' }}>
                  {pours.map((p) => {
                    const d = parseIsoDate(p.actualPour) || parseIsoDate(p.targetPour);
                    if (!d) return null;
                    const col = (STATUS_COLORS[p.milestoneStatus] || STATUS_COLORS['Upcoming'])[0];
                    return (
                      <div
                        key={p.id}
                        title={`${p.floor} · ${p.activity || p.component} (${p.milestoneStatus})`}
                        style={{
                          position: 'absolute',
                          left: `${calcGanttPct(d)}%`,
                          top: '8px',
                          width: '13px',
                          height: '13px',
                          marginLeft: '-6px',
                          transform: 'rotate(45deg)',
                          background: col,
                          border: 'var(--sx-border-64)',
                        }}
                      />
                    );
                  })}
                  {milestones.map((m) => {
                    const win = parseDateWindow(m.dateText);
                    if (!win) return null;
                    return (
                      <div
                        key={m.id}
                        title={`${m.label} (${m.status})`}
                        style={{
                          position: 'absolute',
                          left: `${calcGanttPct(win[0])}%`,
                          top: '10px',
                          width: '8px',
                          height: '8px',
                          marginLeft: '-4px',
                          borderRadius: '50%',
                          background: 'var(--sx-bg-12)',
                        }}
                      />
                    );
                  })}
                </div>

                {/* Live Today Line */}
                {isTodayVisible && (
                  <>
                    <div style={{ position: 'absolute', left: `${todayOffset}%`, top: '20px', bottom: 0, width: '2px', background: 'var(--sx-bg-12)', zIndex: 10 }} />
                    <div style={{ position: 'absolute', left: `calc(${todayOffset}% + 6px)`, top: '2px', fontSize: '12px', fontWeight: 700, color: 'var(--sx-text-3)', whiteSpace: 'nowrap', background: 'var(--sx-bg-14)', padding: '0 4px', zIndex: 11 }}>
                      {todayLabel}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="ftr" style={{ position: 'absolute', left: '340px', right: '340px', bottom: '40px', display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '24px', width: '100%' }}>
            <div style={{ flex: 1, height: '1px', background: 'var(--sx-bg-32)' }} />
            <div className="wm" style={{ fontSize: '22px', letterSpacing: '9px', fontWeight: 500, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
              Convengers Bahay Build
            </div>
            <div style={{ flex: 1, height: '1px', background: 'var(--sx-bg-32)' }} />
          </div>
          <div style={{ fontSize: '12px', color: 'var(--sx-text-2)', textAlign: 'center' }}>
            Source: project schedule. Schedule assumes Monday–Saturday work; Sundays and listed holidays excluded. Changes sync in real-time to persistent database.
          </div>
          <div className="ver" style={{ fontSize: '12px', fontWeight: 600, color: 'var(--sx-text-3)', textAlign: 'center' }}>
            Version {settings.version} · Updated {new Date(settings.updatedAt).toLocaleString()}
          </div>
        </div>
      </div>
    </section>
  );
};
