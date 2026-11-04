/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Milestone, ScopeItem, ConcretePour, Episode, SystemSettings, RemoteFocus } from '../types/index.ts';
import { LOGO_SVG, STATUS_COLORS } from '../constants/assets.ts';
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
  onUpdateMilestone: (id: string, status: Milestone['status']) => void;
  onUpdateMilestoneField?: (id: string, field: 'label' | 'dateText', value: string) => void;
  remoteFocusMap?: Record<string, RemoteFocus>;
}

export const OverviewSlide: React.FC<OverviewSlideProps> = ({
  milestones,
  scopes: _scopes,
  pours,
  episodes,
  settings,
  canEdit,
  onUpdateMilestone,
  onUpdateMilestoneField,
  remoteFocusMap = {},
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
            'radial-gradient(900px 520px at 92% 0%,rgba(123,77,255,.42),transparent 65%),radial-gradient(800px 600px at 0% 45%,rgba(60,40,190,.30),transparent 65%),radial-gradient(900px 600px at 100% 80%,rgba(90,50,220,.24),transparent 65%),repeating-linear-gradient(135deg,rgba(255,255,255,.025) 0 2px,transparent 2px 16px),#060A24',
          color: '#FFFFFF',
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
          <img
            className="logo"
            src={LOGO_SVG}
            alt="Convengers Multiverse Logo"
            style={{ width: '176px', height: '150px', flex: 'none', display: 'block', clipPath: 'polygon(0 0,98% 0,81% 100%,0 100%)', borderRadius: '10px 0 0 10px' }}
          />
          <div className="ttl" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: '30px', lineHeight: 1.1, letterSpacing: '2px', textTransform: 'uppercase' }}>
              Scope of work
            </div>
            <div className="h1a" style={{ fontFamily: "'Anton','Barlow Condensed',sans-serif", fontSize: '70px', lineHeight: 1.05, color: '#F5C518', textTransform: 'uppercase', textShadow: '0 4px 0 #7a5a00,0 0 30px rgba(245,197,24,.35)' }}>
              Timeline
            </div>
            <div style={{ fontSize: '16px', letterSpacing: '8px', textTransform: 'uppercase', marginTop: '4px' }}>
              Convengers Bahay Build
            </div>
          </div>

          {/* Right Top Status Cards */}
          <div className="rb" style={{ width: '540px', flex: 'none', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ background: '#0A1140', border: '2px solid #7B4DFF', borderRadius: '14px', boxShadow: '0 0 16px rgba(123,77,255,.55),inset 0 0 26px rgba(40,30,130,.45)', overflow: 'hidden' }}>
              <div style={{ padding: '8px 14px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: '17px', letterSpacing: '1.5px', color: '#F5C518' }}>
                    OVERALL STATUS
                  </span>
                  <span style={{ fontFamily: "'Anton',sans-serif", fontSize: '26px', lineHeight: 1, color: '#F5C518' }}>
                    {overallMilestonePct}%
                  </span>
                </div>
                <div style={{ height: '10px', borderRadius: '5px', background: 'rgba(255,255,255,.14)', position: 'relative' }}>
                  <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${Math.max(overallMilestonePct, 2)}%`, borderRadius: '5px', background: 'linear-gradient(90deg,#F5C518,#FF9A1F)' }} />
                </div>
                <div style={{ fontSize: '12px', color: '#BAC4E2', whiteSpace: 'nowrap' }}>
                  Milestones complete (in progress = half) · schedule elapsed {elapsed.elapsedPercent}%
                </div>
              </div>
            </div>

            <div style={{ background: '#0A1140', border: '2px solid #7B4DFF', borderRadius: '14px', boxShadow: '0 0 16px rgba(123,77,255,.55),inset 0 0 26px rgba(40,30,130,.45)', overflow: 'hidden' }}>
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
            <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: '16px', letterSpacing: '3px', color: '#BAC4E2', textTransform: 'uppercase' }}>
              Overview
            </span>
            <span style={{ fontFamily: "'Anton',sans-serif", fontSize: '22px', color: '#F5C518' }}>
              01
            </span>
            <span style={{ fontSize: '15px', color: '#BAC4E2' }}>
              / 11
            </span>
          </div>
        </div>

        {/* Body */}
        <div className="bodyw" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Quick Facts */}
          <div style={{ background: '#0A1140', border: '2px solid #7B4DFF', borderRadius: '14px', boxShadow: '0 0 16px rgba(123,77,255,.55),inset 0 0 26px rgba(40,30,130,.45)', overflow: 'hidden', flex: 'none' }}>
            <div className="facts" style={{ display: 'flex' }}>
              <div style={{ flex: 1, padding: '14px 22px', borderRight: '1px solid rgba(123,77,255,.38)' }}>
                <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: '18px', letterSpacing: '1px', color: '#F5C518', textTransform: 'uppercase' }}>
                  Work calendar:
                </div>
                <div style={{ fontSize: '25px', fontWeight: 700, lineHeight: 1.2 }}>Monday – Saturday</div>
              </div>
              <div style={{ flex: 1, padding: '14px 22px', borderRight: '1px solid rgba(123,77,255,.38)' }}>
                <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: '18px', letterSpacing: '1px', color: '#F5C518', textTransform: 'uppercase' }}>
                  Work stoppage:
                </div>
                <div style={{ fontSize: '25px', fontWeight: 700, lineHeight: 1.2 }}>Dec 20 – Jan 3 (resume Jan 4)</div>
              </div>
              <div style={{ flex: 1, padding: '14px 22px', borderRight: '1px solid rgba(123,77,255,.38)' }}>
                <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: '18px', letterSpacing: '1px', color: '#F5C518', textTransform: 'uppercase' }}>
                  Punchlist date:
                </div>
                <div style={{ fontSize: '25px', fontWeight: 700, lineHeight: 1.2 }}>Apr 7, 2027</div>
              </div>
              <div style={{ flex: 1, padding: '14px 22px', borderRight: '1px solid rgba(123,77,255,.38)' }}>
                <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: '18px', letterSpacing: '1px', color: '#F5C518', textTransform: 'uppercase' }}>
                  Turnover ceremony:
                </div>
                <div style={{ fontSize: '25px', fontWeight: 700, lineHeight: 1.2 }}>Apr 30, 2027</div>
              </div>
              <div style={{ flex: 1, padding: '14px 22px' }}>
                <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: '18px', letterSpacing: '1px', color: '#F5C518', textTransform: 'uppercase' }}>
                  Concrete Milestones:
                </div>
                <div style={{ fontSize: '25px', fontWeight: 700, lineHeight: 1.2, color: '#4BE08A' }}>
                  {concreteOverall.percent}% ({concreteOverall.completed}/{concreteOverall.total})
                </div>
              </div>
            </div>
          </div>

          {/* Section 1: Key Milestone Dates */}
          <div style={{ background: '#0A1140', border: '2px solid #7B4DFF', borderRadius: '14px', boxShadow: '0 0 16px rgba(123,77,255,.55),inset 0 0 26px rgba(40,30,130,.45)', overflow: 'hidden', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'stretch', height: '52px', flex: 'none', background: 'linear-gradient(90deg,#2A1D9C,#0C1448 75%)' }}>
              <div style={{ width: '66px', flex: 'none', background: '#F5C518', clipPath: 'polygon(0 0,100% 0,74% 100%,0 100%)', display: 'flex', alignItems: 'center', paddingLeft: '16px', color: '#060A24', fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: '30px' }}>
                1
              </div>
              <div className="chd" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px', paddingLeft: '6px', fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: '25px', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                <span>KEY</span>
                <span style={{ color: '#F5C518' }}>MILESTONE DATES</span>
              </div>
              <div className="leg" style={{ display: 'flex', gap: '14px', alignItems: 'center', paddingRight: '10px', fontSize: '13px', color: '#BAC4E2', whiteSpace: 'nowrap' }}>
                <span>Status:</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ width: '9px', height: '9px', borderRadius: '50%', background: '#DCE3F7' }} />Upcoming</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ width: '9px', height: '9px', borderRadius: '50%', background: '#1F6FE0' }} />In progress</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ width: '9px', height: '9px', borderRadius: '50%', background: '#4BE08A' }} />Complete</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ width: '9px', height: '9px', borderRadius: '50%', background: '#E0213B' }} />Delayed</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ width: '9px', height: '9px', borderRadius: '50%', background: '#FF9A1F' }} />Date passed · confirm</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', paddingRight: '14px', fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: '30px', color: '#F5C518', letterSpacing: '-4px', fontStyle: 'italic' }}>
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
                      background: 'rgba(255,255,255,.05)',
                      border: '1px solid rgba(123,77,255,.38)',
                      borderRadius: '10px',
                      padding: '3px 12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '14px',
                      minHeight: 0,
                    }}
                  >
                    <div style={{ width: '215px', flex: 'none', fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: '28px', lineHeight: 1, color: '#F5C518', whiteSpace: 'nowrap' }}>
                      <CollaborativeCell
                        cellId={`milestone_${m.id}_date`}
                        value={safeDate}
                        fallbackValue={initial?.dateText}
                        remoteFocus={dateFocus}
                        canEdit={canEdit}
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
                        canEdit={canEdit}
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
                            background: safeBadge.type === 'confirmed' || safeBadge.type === 'provided' ? '#4BE08A' : safeBadge.type === 'planned' ? '#1F6FE0' : '#F5C518',
                            color: safeBadge.type === 'planned' ? '#fff' : '#060A24',
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
                          style={{ background: statusFocus.userColor, color: '#060A24' }}
                        >
                          {statusFocus.userName}
                        </span>
                      )}
                      <select
                        className="mst"
                        value={m.status}
                        disabled={!canEdit}
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
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 2: Project Timeline At A Glance (Gantt) */}
          <div style={{ background: '#0A1140', border: '2px solid #7B4DFF', borderRadius: '14px', boxShadow: '0 0 16px rgba(123,77,255,.55),inset 0 0 26px rgba(40,30,130,.45)', overflow: 'hidden', flex: 'none' }}>
            <div style={{ display: 'flex', alignItems: 'stretch', height: '52px', flex: 'none', background: 'linear-gradient(90deg,#2A1D9C,#0C1448 75%)' }}>
              <div style={{ width: '66px', flex: 'none', background: '#F5C518', clipPath: 'polygon(0 0,100% 0,74% 100%,0 100%)', display: 'flex', alignItems: 'center', paddingLeft: '16px', color: '#060A24', fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: '30px' }}>
                2
              </div>
              <div className="chd" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px', paddingLeft: '6px', fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: '25px', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                <span>PROJECT TIMELINE</span>
                <span style={{ color: '#4BE08A' }}>AT A GLANCE</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', paddingRight: '14px', fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: '30px', color: '#F5C518', letterSpacing: '-4px', fontStyle: 'italic' }}>
                //
              </div>
            </div>

            <div className="gpad" style={{ padding: '16px 20px 16px 210px' }}>
              <div className="gantt" style={{ position: 'relative', height: '298px' }}>
                {/* Month Grid */}
                <div style={{ position: 'absolute', left: '0.00%', top: '24px', bottom: 0, width: '1px', background: 'rgba(255,255,255,.14)' }} />
                <div style={{ position: 'absolute', left: 'calc(0.00% + 6px)', top: 0, fontSize: '13px', fontWeight: 600, color: '#BAC4E2' }}>Oct 2026</div>

                <div style={{ position: 'absolute', left: '14.62%', top: '24px', bottom: 0, width: '1px', background: 'rgba(255,255,255,.14)' }} />
                <div style={{ position: 'absolute', left: 'calc(14.62% + 6px)', top: 0, fontSize: '13px', fontWeight: 600, color: '#BAC4E2' }}>Nov 2026</div>

                <div style={{ position: 'absolute', left: '28.77%', top: '24px', bottom: 0, width: '1px', background: 'rgba(255,255,255,.14)' }} />
                <div style={{ position: 'absolute', left: 'calc(28.77% + 6px)', top: 0, fontSize: '13px', fontWeight: 600, color: '#BAC4E2' }}>Dec 2026</div>

                <div style={{ position: 'absolute', left: '43.40%', top: '24px', bottom: 0, width: '1px', background: 'rgba(255,255,255,.14)' }} />
                <div style={{ position: 'absolute', left: 'calc(43.40% + 6px)', top: 0, fontSize: '13px', fontWeight: 600, color: '#BAC4E2' }}>Jan 2027</div>

                <div style={{ position: 'absolute', left: '58.02%', top: '24px', bottom: 0, width: '1px', background: 'rgba(255,255,255,.14)' }} />
                <div style={{ position: 'absolute', left: 'calc(58.02% + 6px)', top: 0, fontSize: '13px', fontWeight: 600, color: '#BAC4E2' }}>Feb 2027</div>

                <div style={{ position: 'absolute', left: '71.23%', top: '24px', bottom: 0, width: '1px', background: 'rgba(255,255,255,.14)' }} />
                <div style={{ position: 'absolute', left: 'calc(71.23% + 6px)', top: 0, fontSize: '13px', fontWeight: 600, color: '#BAC4E2' }}>Mar 2027</div>

                <div style={{ position: 'absolute', left: '85.85%', top: '24px', bottom: 0, width: '1px', background: 'rgba(255,255,255,.14)' }} />
                <div style={{ position: 'absolute', left: 'calc(85.85% + 6px)', top: 0, fontSize: '13px', fontWeight: 600, color: '#BAC4E2' }}>Apr 2027</div>

                {/* Work Stoppage Band */}
                <div style={{ position: 'absolute', left: '37.74%', width: '7.08%', top: '24px', bottom: 0, background: 'rgba(224,33,59,.3)', zIndex: 1 }} />

                {/* Construction Bars */}
                {/* GF Structural */}
                <div style={{ position: 'absolute', left: '-190px', width: '180px', top: '28px', height: '30px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', fontWeight: 600 }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: '#3A9BFF', flex: 'none' }} />GF · Structural
                </div>
                <div style={{ position: 'absolute', left: 0, right: 0, top: '28px', height: '30px', borderBottom: '1px solid rgba(255,255,255,.07)' }}>
                  <div style={{ position: 'absolute', left: '1.89%', width: '35.85%', top: '5px', height: '20px', borderRadius: '4px', background: '#3A9BFF' }} />
                  <div style={{ position: 'absolute', left: '49.06%', width: '3.77%', top: '5px', height: '20px', borderRadius: '4px', background: '#9CCBFF' }} />
                  <div style={{ position: 'absolute', left: 'calc(52.76% + 6px)', top: '7px', fontSize: '13px', color: '#BAC4E2', whiteSpace: 'nowrap' }}>
                    Oct 5 – Dec 19, 2026 · stair framing Jan 13–20, 2027
                  </div>
                </div>

                {/* GF Finishing */}
                <div style={{ position: 'absolute', left: '-190px', width: '180px', top: '58px', height: '30px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', fontWeight: 600 }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: '#FF9A1F', flex: 'none' }} />GF · Finishing
                </div>
                <div style={{ position: 'absolute', left: 0, right: 0, top: '58px', height: '30px', borderBottom: '1px solid rgba(255,255,255,.07)' }}>
                  <div style={{ position: 'absolute', left: '46.23%', width: '46.23%', top: '5px', height: '20px', borderRadius: '4px', background: '#FF9A1F' }} />
                  <div style={{ position: 'absolute', right: 'calc(53.77% + 8px)', top: '7px', fontSize: '13px', color: '#BAC4E2', whiteSpace: 'nowrap' }}>
                    Jan 7 – Apr 14, 2027
                  </div>
                </div>

                {/* 2F Structural */}
                <div style={{ position: 'absolute', left: '-190px', width: '180px', top: '88px', height: '30px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', fontWeight: 600 }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: '#3A9BFF', flex: 'none' }} />2F · Structural
                </div>
                <div style={{ position: 'absolute', left: 0, right: 0, top: '88px', height: '30px', borderBottom: '1px solid rgba(255,255,255,.07)' }}>
                  <div style={{ position: 'absolute', left: '20.75%', width: '7.08%', top: '5px', height: '20px', borderRadius: '4px', background: '#3A9BFF' }} />
                  <div style={{ position: 'absolute', left: '52.83%', width: '3.30%', top: '5px', height: '20px', borderRadius: '4px', background: '#9CCBFF' }} />
                  <div style={{ position: 'absolute', left: 'calc(56.06% + 6px)', top: '7px', fontSize: '13px', color: '#BAC4E2', whiteSpace: 'nowrap' }}>
                    Nov 14 – Nov 28, 2026 · stair framing Jan 21–27, 2027
                  </div>
                </div>

                {/* 2F Finishing */}
                <div style={{ position: 'absolute', left: '-190px', width: '180px', top: '118px', height: '30px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', fontWeight: 600 }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: '#FF9A1F', flex: 'none' }} />2F · Finishing
                </div>
                <div style={{ position: 'absolute', left: 0, right: 0, top: '118px', height: '30px', borderBottom: '1px solid rgba(255,255,255,.07)' }}>
                  <div style={{ position: 'absolute', left: '28.77%', width: '31.60%', top: '5px', height: '20px', borderRadius: '4px', background: '#FF9A1F' }} />
                  <div style={{ position: 'absolute', left: 'calc(60.31% + 6px)', top: '7px', fontSize: '13px', color: '#BAC4E2', whiteSpace: 'nowrap' }}>
                    Dec 1, 2026 – Feb 5, 2027
                  </div>
                </div>

                {/* 3F Structural */}
                <div style={{ position: 'absolute', left: '-190px', width: '180px', top: '148px', height: '30px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', fontWeight: 600 }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: '#3A9BFF', flex: 'none' }} />3F · Structural
                </div>
                <div style={{ position: 'absolute', left: 0, right: 0, top: '148px', height: '30px', borderBottom: '1px solid rgba(255,255,255,.07)' }}>
                  <div style={{ position: 'absolute', left: '27.36%', width: '32.08%', top: '5px', height: '20px', borderRadius: '4px', background: '#3A9BFF' }} />
                  <div style={{ position: 'absolute', left: 'calc(59.36% + 6px)', top: '7px', fontSize: '13px', color: '#BAC4E2', whiteSpace: 'nowrap' }}>
                    Nov 28, 2026 – Feb 3, 2027
                  </div>
                </div>

                {/* 3F Finishing */}
                <div style={{ position: 'absolute', left: '-190px', width: '180px', top: '178px', height: '30px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', fontWeight: 600 }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: '#FF9A1F', flex: 'none' }} />3F · Finishing
                </div>
                <div style={{ position: 'absolute', left: 0, right: 0, top: '178px', height: '30px', borderBottom: '1px solid rgba(255,255,255,.07)' }}>
                  <div style={{ position: 'absolute', left: '61.32%', width: '27.83%', top: '5px', height: '20px', borderRadius: '4px', background: '#FF9A1F' }} />
                  <div style={{ position: 'absolute', right: 'calc(38.68% + 8px)', top: '7px', fontSize: '13px', color: '#BAC4E2', whiteSpace: 'nowrap' }}>
                    Feb 8 – Apr 7, 2027
                  </div>
                </div>

                {/* Closeout */}
                <div style={{ position: 'absolute', left: '-190px', width: '180px', top: '208px', height: '30px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', fontWeight: 600 }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: '#4BE08A', flex: 'none' }} />Closeout
                </div>
                <div style={{ position: 'absolute', left: 0, right: 0, top: '208px', height: '30px', borderBottom: '1px solid rgba(255,255,255,.07)' }}>
                  <div style={{ position: 'absolute', left: '88.68%', width: '0.94%', top: '5px', height: '20px', borderRadius: '4px', background: '#F5C518' }} />
                  <div style={{ position: 'absolute', left: '89.15%', width: '8.02%', top: '5px', height: '20px', borderRadius: '4px', background: '#FF9A1F' }} />
                  <div style={{ position: 'absolute', left: '97.64%', width: '0.94%', top: '5px', height: '20px', borderRadius: '4px', background: '#B58CFF' }} />
                  <div style={{ position: 'absolute', left: '98.58%', width: '0.94%', top: '5px', height: '20px', borderRadius: '4px', background: '#4BE08A' }} />
                  <div style={{ position: 'absolute', left: '99.53%', width: '0.94%', top: '5px', height: '20px', borderRadius: '4px', background: '#FF5D8F' }} />
                  <div style={{ position: 'absolute', right: 'calc(11.32% + 8px)', top: '7px', fontSize: '13px', color: '#BAC4E2', whiteSpace: 'nowrap' }}>
                    Punchlist Apr 7 · Rectification Apr 8–24 · Interior styling Apr 26–27 · Move-in Apr 28–29 · Turnover Apr 30
                  </div>
                </div>

                {/* Content Shoots Row */}
                <div style={{ position: 'absolute', left: '-190px', width: '180px', top: '238px', height: '30px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', fontWeight: 600 }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: '#FF5D8F', flex: 'none' }} />Content shoots
                </div>
                <div style={{ position: 'absolute', left: 0, right: 0, top: '238px', height: '30px', borderBottom: '1px solid rgba(255,255,255,.07)' }}>
                  {episodes.map((ep) => {
                    const start = parseIsoDate(ep.shootStart);
                    if (!start) return null;
                    const end = parseIsoDate(ep.shootEnd) || start;
                    const l = calcGanttPct(start);
                    const r = calcGanttPct(new Date(end.getTime() + 86400000));
                    return (
                      <React.Fragment key={ep.id}>
                        <div
                          title={`Ep ${ep.number}: ${ep.title}`}
                          style={{
                            position: 'absolute',
                            left: `${l}%`,
                            width: `${Math.max(r - l, 0.4)}%`,
                            top: '-214px',
                            height: '214px',
                            background: 'rgba(255,93,143,0.18)',
                            borderLeft: '1px solid rgba(255,93,143,0.5)',
                            borderRight: '1px solid rgba(255,93,143,0.5)',
                            pointerEvents: 'none',
                          }}
                        />
                        <div
                          title={`Ep ${ep.number}: ${ep.title} (${ep.status})`}
                          style={{
                            position: 'absolute',
                            left: `${(l + r) / 2}%`,
                            top: `${4 + (ep.number % 2) * 12}px`,
                            transform: 'translateX(-50%)',
                            minWidth: '15px',
                            height: '13px',
                            borderRadius: '7px',
                            background: '#FF5D8F',
                            color: '#060A24',
                            fontSize: '10px',
                            fontWeight: 700,
                            lineHeight: '13px',
                            textAlign: 'center',
                            padding: '0 3px',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {ep.number}
                        </div>
                      </React.Fragment>
                    );
                  })}
                </div>

                {/* Concrete Pours & Milestones Row */}
                <div style={{ position: 'absolute', left: '-190px', width: '180px', top: '268px', height: '30px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', fontWeight: 600 }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: '#FF9A1F', flex: 'none' }} />Pours &amp; Milestones
                </div>
                <div style={{ position: 'absolute', left: 0, right: 0, top: '268px', height: '30px', borderBottom: '1px solid rgba(255,255,255,.07)' }}>
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
                          border: '1px solid #fff',
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
                          background: '#F5C518',
                        }}
                      />
                    );
                  })}
                </div>

                {/* Live Today Line */}
                {isTodayVisible && (
                  <>
                    <div style={{ position: 'absolute', left: `${todayOffset}%`, top: '20px', bottom: 0, width: '2px', background: '#F5C518', zIndex: 10 }} />
                    <div style={{ position: 'absolute', left: `calc(${todayOffset}% + 6px)`, top: '2px', fontSize: '12px', fontWeight: 700, color: '#F5C518', whiteSpace: 'nowrap', background: '#0A1140', padding: '0 4px', zIndex: 11 }}>
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
            <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,.4)' }} />
            <div className="wm" style={{ fontSize: '22px', letterSpacing: '9px', fontWeight: 500, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
              Convengers Bahay Build
            </div>
            <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,.4)' }} />
          </div>
          <div style={{ fontSize: '12px', color: '#BAC4E2', textAlign: 'center' }}>
            Source: project schedule. Schedule assumes Monday–Saturday work; Sundays and listed holidays excluded. Changes sync in real-time to persistent database.
          </div>
          <div className="ver" style={{ fontSize: '12px', fontWeight: 600, color: '#F5C518', textAlign: 'center' }}>
            Version {settings.version} · Updated {new Date(settings.updatedAt).toLocaleString()}
          </div>
        </div>
      </div>
    </section>
  );
};
