/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Episode, SystemSettings } from '../types/index.ts';
import { LOGO_SVG, STATUS_COLORS } from '../constants/assets.ts';
import { calculateScheduleElapsed } from '../utils/calculations.ts';

interface EpisodesTableSlideProps {
  episodes: Episode[];
  settings: SystemSettings;
  canEdit: boolean;
  onUpdateEpisode: (id: string, updates: Partial<Episode>) => void;
  onViewerAttemptEdit?: () => void;
}

export const EpisodesTableSlide: React.FC<EpisodesTableSlideProps> = ({
  episodes,
  settings: _settings,
  canEdit,
  onUpdateEpisode,
  onViewerAttemptEdit,
}) => {
  const elapsed = calculateScheduleElapsed();
  const postedCount = episodes.filter((e) => e.status === 'Completed').length;
  const delayedCount = episodes.filter((e) => e.scopeStatus === 'Delayed').length;

  return (
    <section className="wrap">
      <div
        className="slide"
        data-cc="1"
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
            alt="Logo"
            style={{ width: '176px', height: '150px', flex: 'none', display: 'block', objectFit: 'contain', borderRadius: '12px', filter: 'drop-shadow(0 0 16px rgba(123,77,255,0.65))' }}
          />
          <div className="ttl" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: '30px', lineHeight: 1.1, letterSpacing: '2px', textTransform: 'uppercase' }}>
              Content
            </div>
            <div className="h1a" style={{ fontFamily: "'Anton','Barlow Condensed',sans-serif", fontSize: '70px', lineHeight: 1.05, color: '#F5C518', textTransform: 'uppercase', textShadow: '0 4px 0 #7a5a00,0 0 30px rgba(245,197,24,.35)' }}>
              Calendar
            </div>
            <div style={{ fontSize: '16px', letterSpacing: '8px', textTransform: 'uppercase', marginTop: '4px' }}>
              Convengers Bahay Build
            </div>
          </div>

          <div className="rb" style={{ width: '540px', flex: 'none', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ background: '#0A1140', border: '2px solid #7B4DFF', borderRadius: '14px', boxShadow: '0 0 16px rgba(123,77,255,.55),inset 0 0 26px rgba(40,30,130,.45)', overflow: 'hidden' }}>
              <div style={{ padding: '8px 14px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: '17px', letterSpacing: '1.5px', color: '#F5C518' }}>
                    SCHEDULE ELAPSED
                  </span>
                  <span style={{ fontFamily: "'Anton',sans-serif", fontSize: '26px', lineHeight: 1, color: '#F5C518' }}>
                    {elapsed.elapsedPercent}%
                  </span>
                </div>
                <div style={{ height: '10px', borderRadius: '5px', background: 'rgba(255,255,255,.14)', position: 'relative' }}>
                  <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${Math.max(elapsed.elapsedPercent, 2)}%`, borderRadius: '5px', background: 'linear-gradient(90deg,#F5C518,#FF9A1F)' }} />
                </div>
                <div style={{ fontSize: '12px', color: '#BAC4E2', whiteSpace: 'nowrap' }}>
                  Working days: {elapsed.elapsedWorkingDays} of {elapsed.totalWorkingDays} elapsed
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

          <div style={{ position: 'absolute', top: '16px', right: '56px', display: 'flex', alignItems: 'baseline', gap: '10px' }}>
            <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: '16px', letterSpacing: '3px', color: '#BAC4E2', textTransform: 'uppercase' }}>
              Production calendar
            </span>
            <span style={{ fontFamily: "'Anton',sans-serif", fontSize: '22px', color: '#F5C518' }}>
              08
            </span>
            <span style={{ fontSize: '15px', color: '#BAC4E2' }}>
              / 12
            </span>
          </div>
        </div>

        {/* 24 Episodes Table */}
        <div className="bodyw" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ background: '#0A1140', border: '2px solid #7B4DFF', borderRadius: '14px', boxShadow: '0 0 16px rgba(123,77,255,.55),inset 0 0 26px rgba(40,30,130,.45)', overflow: 'hidden', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'stretch', height: '52px', flex: 'none', background: 'linear-gradient(90deg,#2A1D9C,#0C1448 75%)' }}>
              <div style={{ width: '66px', flex: 'none', background: '#F5C518', clipPath: 'polygon(0 0,100% 0,74% 100%,0 100%)', display: 'flex', alignItems: 'center', paddingLeft: '16px', color: '#060A24', fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: '30px' }}>
                1
              </div>
              <div className="chd" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px', paddingLeft: '6px', fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: '25px', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                <span>PRODUCTION CALENDAR ·</span>
                <span style={{ color: '#4BE08A' }}>24 EPISODES</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', paddingRight: '10px', fontSize: '13px', color: '#BAC4E2', whiteSpace: 'nowrap' }}>
                <b style={{ color: '#F5C518', marginRight: '4px' }}>{postedCount}</b> of 24 completed · <b style={{ color: '#FF7A8A', margin: '0 4px' }}>{delayedCount}</b> scopes delayed · dates and scopes are fully editable
              </div>
              <div style={{ display: 'flex', alignItems: 'center', paddingRight: '14px', fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: '30px', color: '#F5C518', letterSpacing: '-4px', fontStyle: 'italic' }}>
                //
              </div>
            </div>

            <div style={{ padding: '8px 16px 8px', flex: 1, minHeight: 0, overflowY: 'auto' }}>
              <div className="hdrow" style={{ display: 'flex', gap: '10px', padding: '2px 8px 4px', fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: '13px', letterSpacing: '1.5px', color: '#BAC4E2', textTransform: 'uppercase' }}>
                <div style={{ width: '34px', flex: 'none' }}>Ep</div>
                <div style={{ flex: 1 }}>Episode · topic</div>
                <div style={{ width: '300px' }}>Scope of work</div>
                <div style={{ width: '150px' }}>Shoot window</div>
                <div style={{ width: '108px' }}>Post date</div>
                <div style={{ width: '106px' }}>Scope status</div>
                <div style={{ width: '92px' }}>Episode</div>
              </div>

              {episodes.map((ep, idx) => {
                const epColors = STATUS_COLORS[ep.status] || STATUS_COLORS['Planned'];
                const scopeColors = STATUS_COLORS[ep.scopeStatus] || STATUS_COLORS['Not started'];

                return (
                  <div
                    key={ep.id}
                    className="eprow"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '2px 8px',
                      height: '26px',
                      borderBottom: '1px solid rgba(123,77,255,.38)',
                      background: idx % 2 === 0 ? 'rgba(255,255,255,.04)' : 'transparent',
                    }}
                  >
                    <div style={{ width: '34px', flex: 'none', fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: '20px', lineHeight: '22px', color: '#F5C518' }}>
                      {String(ep.number).padStart(2, '0')}
                    </div>
                    <div className="eti" style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '13px', lineHeight: '22px' }}>
                      <b>{ep.title}</b> <span style={{ color: '#BAC4E2' }}>· {ep.topic}</span>
                    </div>
                    {canEdit ? (
                      <>
                        <input
                          className="ed"
                          style={{ width: '300px' }}
                          value={ep.scopeOfWork}
                          onChange={(e) => onUpdateEpisode(ep.id, { scopeOfWork: e.target.value })}
                          aria-label="Scope of work"
                        />
                        <input
                          className="ed"
                          style={{ width: '150px' }}
                          value={ep.shootStart ? `${ep.shootStart} ${ep.shootEnd && ep.shootEnd !== ep.shootStart ? `– ${ep.shootEnd}` : ''}` : ''}
                          placeholder="Shoot window"
                          onChange={(e) => onUpdateEpisode(ep.id, { shootStart: e.target.value })}
                          aria-label="Shoot window"
                        />
                        <input
                          className="ed"
                          style={{ width: '108px' }}
                          value={ep.releaseDate || ''}
                          placeholder="Post date"
                          onChange={(e) => onUpdateEpisode(ep.id, { releaseDate: e.target.value })}
                          aria-label="Post date"
                        />
                        <select
                          className="ss"
                          value={ep.scopeStatus}
                          style={{ background: scopeColors[0], color: scopeColors[1] }}
                          onChange={(e) => onUpdateEpisode(ep.id, { scopeStatus: e.target.value as any })}
                          aria-label="Scope of work status"
                        >
                          <option value="Not started">Not started</option>
                          <option value="On-track">On-track</option>
                          <option value="Delayed">Delayed</option>
                          <option value="Completed">Completed</option>
                        </select>
                        <select
                          className="est"
                          value={ep.status}
                          style={{ background: epColors[0], color: epColors[1] }}
                          onChange={(e) => onUpdateEpisode(ep.id, { status: e.target.value as any })}
                          aria-label="Episode status"
                        >
                          <option value="Planned">Planned</option>
                          <option value="For Confirmation">For Confirmation</option>
                          <option value="Scheduled">Scheduled</option>
                          <option value="Completed">Completed</option>
                          <option value="Rescheduled">Rescheduled</option>
                        </select>
                      </>
                    ) : (
                      <div
                        className="flex items-center gap-2.5 cursor-default select-none"
                        onDoubleClick={onViewerAttemptEdit}
                        title="Viewer presentation mode: Double click to sign in"
                      >
                        <span style={{ width: '300px' }} className="text-xs text-[#BAC4E2] truncate">
                          {ep.scopeOfWork || '—'}
                        </span>
                        <span style={{ width: '150px' }} className="text-xs text-white/90 truncate font-mono">
                          {ep.shootStart ? `${ep.shootStart} ${ep.shootEnd && ep.shootEnd !== ep.shootStart ? `– ${ep.shootEnd}` : ''}` : '—'}
                        </span>
                        <span style={{ width: '108px' }} className="text-xs text-[#F5C518] truncate font-mono">
                          {ep.releaseDate || '—'}
                        </span>
                        <span
                          className="ss text-[11px] font-semibold px-2 py-0.5 rounded text-center"
                          style={{ width: '100px', background: scopeColors[0], color: scopeColors[1] }}
                        >
                          {ep.scopeStatus}
                        </span>
                        <span
                          className="est text-[11px] font-bold px-2 py-0.5 rounded text-center"
                          style={{ width: '110px', background: epColors[0], color: epColors[1] }}
                        >
                          {ep.status}
                        </span>
                        {ep.updatedBy && (
                          <span className="text-[10px] text-[#BAC4E2]/60 italic whitespace-nowrap ml-1">
                            Updated by {ep.updatedBy}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
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
          <div className="ver" style={{ fontSize: '12px', fontWeight: 600, color: '#F5C518', textAlign: 'center' }}>
            Version {settings.version} · Updated {new Date(settings.updatedAt).toLocaleString()}
          </div>
        </div>
      </div>
    </section>
  );
};
