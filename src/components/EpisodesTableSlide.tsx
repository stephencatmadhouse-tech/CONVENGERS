/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Episode, SystemSettings } from '../types/index.ts';
import { STATUS_COLORS } from '../constants/assets.ts';
import { BrandLogo } from './BrandLogo.tsx';
import { calculateScheduleElapsed } from '../utils/calculations.ts';

interface EpisodesTableSlideProps {
  episodes: Episode[];
  settings: SystemSettings;
  canEdit: boolean;
  canEditTimeline?: boolean;
  onUpdateEpisode: (id: string, updates: Partial<Episode>) => void;
  onViewerAttemptEdit?: () => void;
}

export const EpisodesTableSlide: React.FC<EpisodesTableSlideProps> = ({
  episodes,
  settings,
  canEdit,
  canEditTimeline = canEdit,
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
              Production
            </div>
            <div className="h1a" style={{ fontFamily: "'Anton','Barlow Condensed',sans-serif", fontSize: '70px', lineHeight: 1.05, color: 'var(--sx-text-3)', textTransform: 'uppercase', textShadow: 'var(--sx-shadow-27)' }}>
              Calendar
            </div>
            <div style={{ fontSize: '16px', letterSpacing: '8px', textTransform: 'uppercase', marginTop: '4px' }}>
              Convengers Bahay Build
            </div>
          </div>

          <div className="rb" style={{ width: '540px', flex: 'none', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ background: 'var(--sx-bg-14)', border: 'var(--sx-border-19)', borderRadius: '14px', boxShadow: 'var(--sx-shadow-36)', overflow: 'hidden' }}>
              <div style={{ padding: '8px 14px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: '17px', letterSpacing: '1.5px', color: 'var(--sx-text-3)' }}>
                    SCHEDULE ELAPSED
                  </span>
                  <span style={{ fontFamily: "'Anton',sans-serif", fontSize: '26px', lineHeight: 1, color: 'var(--sx-text-3)' }}>
                    {elapsed.elapsedPercent}%
                  </span>
                </div>
                <div style={{ height: '10px', borderRadius: '5px', background: 'var(--sx-bg-35)', position: 'relative' }}>
                  <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${Math.max(elapsed.elapsedPercent, 2)}%`, borderRadius: '5px', background: 'var(--sx-bg-37)' }} />
                </div>
                <div style={{ fontSize: '12px', color: 'var(--sx-text-2)', whiteSpace: 'nowrap' }}>
                  Working days: {elapsed.elapsedWorkingDays} of {elapsed.totalWorkingDays} elapsed
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

          <div style={{ position: 'absolute', top: '16px', right: '56px', display: 'flex', alignItems: 'baseline', gap: '10px' }}>
            <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: '16px', letterSpacing: '3px', color: 'var(--sx-text-2)', textTransform: 'uppercase' }}>
              Production calendar
            </span>
            <span style={{ fontFamily: "'Anton',sans-serif", fontSize: '22px', color: 'var(--sx-text-3)' }}>
              08
            </span>
            <span style={{ fontSize: '15px', color: 'var(--sx-text-2)' }}>
              / 12
            </span>
          </div>
        </div>

        {/* 24 Episodes Table */}
        <div className="bodyw" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ background: 'var(--sx-bg-14)', border: 'var(--sx-border-19)', borderRadius: '14px', boxShadow: 'var(--sx-shadow-36)', overflow: 'hidden', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'stretch', height: '52px', flex: 'none', background: 'var(--sx-bg-38)' }}>
              <div style={{ width: '66px', flex: 'none', background: 'var(--sx-bg-12)', clipPath: 'polygon(0 0,100% 0,74% 100%,0 100%)', display: 'flex', alignItems: 'center', paddingLeft: '16px', color: 'var(--sx-text-1)', fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: '30px' }}>
                1
              </div>
              <div className="chd" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px', paddingLeft: '6px', fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: '25px', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                <span>PRODUCTION CALENDAR ·</span>
                <span style={{ color: 'var(--sx-text-8)' }}>{episodes.length} EPISODES</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', paddingRight: '10px', fontSize: '13px', color: 'var(--sx-text-2)', whiteSpace: 'nowrap' }}>
                <b style={{ color: 'var(--sx-text-3)', marginRight: '4px' }}>{postedCount}</b> of {episodes.length} completed · <b style={{ color: 'var(--sx-text-13)', margin: '0 4px' }}>{delayedCount}</b> scopes delayed · dates and scopes are fully editable
              </div>
              <div style={{ display: 'flex', alignItems: 'center', paddingRight: '14px', fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: '30px', color: 'var(--sx-text-3)', letterSpacing: '-4px', fontStyle: 'italic' }}>
                //
              </div>
            </div>

            <div style={{ padding: '8px 16px 8px', flex: 1, minHeight: 0, overflowY: 'auto' }}>
              <div className="hdrow" style={{ display: 'flex', gap: '10px', padding: '2px 8px 4px', fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: '13px', letterSpacing: '1.5px', color: 'var(--sx-text-2)', textTransform: 'uppercase' }}>
                <div style={{ width: '58px', flex: 'none' }}>Ep</div>
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
                const epTag = ep.episodeLabel || String(ep.number).padStart(2, '0');

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
                      borderBottom: 'var(--sx-border-31)',
                      background: idx % 2 === 0 ? 'var(--sx-bg-39)' : 'transparent',
                    }}
                  >
                    <div style={{ width: '58px', flex: 'none', fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: ep.episodeLabel ? '15px' : '20px', lineHeight: '22px', color: 'var(--sx-text-3)', whiteSpace: 'nowrap' }}>
                      {epTag}
                    </div>
                    <div className="eti" style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '13px', lineHeight: '22px' }}>
                      <b>{ep.title}</b> <span style={{ color: 'var(--sx-text-2)' }}>· {ep.topic}</span>
                    </div>
                    {canEdit ? (
                      <>
                        {canEditTimeline ? (
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
                          </>
                        ) : (
                          <>
                            <span style={{ width: '300px' }} className="text-xs text-[var(--sx-text-2)] truncate">
                              {ep.scopeOfWork || '—'}
                            </span>
                            <span style={{ width: '150px' }} className="text-xs text-[var(--sx-ink-90)] truncate font-mono">
                              {ep.shootStart ? `${ep.shootStart} ${ep.shootEnd && ep.shootEnd !== ep.shootStart ? `– ${ep.shootEnd}` : ''}` : '—'}
                            </span>
                            <span style={{ width: '108px' }} className="text-xs text-[var(--sx-text-3)] truncate font-mono">
                              {ep.releaseDate || '—'}
                            </span>
                          </>
                        )}
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
                        className="flex items-center gap-2.5 cursor-default select-none shrink-0"
                        onDoubleClick={onViewerAttemptEdit}
                        title={
                          ep.updatedBy
                            ? `Last updated by ${ep.updatedBy}${ep.updatedAt ? ` on ${new Date(ep.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}`
                            : 'Viewer presentation mode: Double click to sign in'
                        }
                      >
                        <span style={{ width: '300px' }} className="text-xs text-[var(--sx-text-2)] truncate">
                          {ep.scopeOfWork || '—'}
                        </span>
                        <span style={{ width: '150px' }} className="text-xs text-[var(--sx-ink-90)] truncate font-mono tabular-nums">
                          {ep.shootStart ? `${ep.shootStart} ${ep.shootEnd && ep.shootEnd !== ep.shootStart ? `– ${ep.shootEnd}` : ''}` : '—'}
                        </span>
                        <span style={{ width: '108px' }} className="text-xs text-[var(--sx-text-3)] truncate font-mono tabular-nums">
                          {ep.releaseDate || '—'}
                        </span>
                        <span
                          className="ss text-[11px] font-semibold px-2 py-0.5 rounded text-center"
                          style={{ width: '106px', background: scopeColors[0], color: scopeColors[1] }}
                        >
                          {ep.scopeStatus}
                        </span>
                        <span
                          className="est text-[11px] font-bold px-2 py-0.5 rounded text-center"
                          style={{ width: '92px', background: epColors[0], color: epColors[1] }}
                        >
                          {ep.status}
                        </span>
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
            <div style={{ flex: 1, height: '1px', background: 'var(--sx-bg-32)' }} />
            <div className="wm" style={{ fontSize: '22px', letterSpacing: '9px', fontWeight: 500, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
              Convengers Bahay Build
            </div>
            <div style={{ flex: 1, height: '1px', background: 'var(--sx-bg-32)' }} />
          </div>
          <div className="ver" style={{ fontSize: '12px', fontWeight: 600, color: 'var(--sx-text-3)', textAlign: 'center' }}>
            Version {settings.version} · Updated {new Date(settings.updatedAt).toLocaleString()}
          </div>
        </div>
      </div>
    </section>
  );
};
