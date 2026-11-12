/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  Episode,
  Character,
  SystemSettings,
  EpisodeProductionStatus,
  EpisodeScopeStatus,
} from '../types/index.ts';
import { STATUS_COLORS } from '../constants/assets.ts';
import { BrandLogo } from './BrandLogo.tsx';
import { parseIsoDate, toIsoDate } from '../utils/calculations.ts';

interface ContentCalendarSlideProps {
  episodes: Episode[];
  characters: Character[];
  settings: SystemSettings;
  canEdit: boolean;
  canEditTimeline?: boolean;
  canDelete?: boolean;
  onAddEpisode: (ep: Omit<Episode, 'id'>) => void;
  onUpdateEpisode: (id: string, updates: Partial<Episode>) => void;
  onDeleteEpisode: (id: string) => void;
  onAddCharacter: (name: string) => void;
  onUpdateCharacter: (id: string, name: string) => void;
  onDeleteCharacter: (id: string) => void;
  onViewerAttemptEdit?: () => void;
}

export const ContentCalendarSlide: React.FC<ContentCalendarSlideProps> = ({
  episodes,
  characters,
  settings,
  canEdit,
  canEditTimeline = canEdit,
  canDelete = canEdit,
  onAddEpisode,
  onUpdateEpisode,
  onDeleteEpisode,
  onAddCharacter,
  onUpdateCharacter,
  onDeleteCharacter,
  onViewerAttemptEdit,
}) => {
  const [view, setView] = useState<'month' | 'week' | 'list'>('month');
  const [currentDate, setCurrentDate] = useState<Date>(new Date(2026, 9, 1)); // Oct 2026
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCharId, setSelectedCharId] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Modals state
  const [isCharModalOpen, setIsCharModalOpen] = useState(false);
  const [isEpisodeModalOpen, setIsEpisodeModalOpen] = useState(false);
  const [editingEpisode, setEditingEpisode] = useState<Episode | null>(null);

  const characterMap = useMemo(() => {
    const map: Record<string, string> = {};
    characters.forEach((c) => {
      map[c.id] = c.name;
    });
    return map;
  }, [characters]);

  const filteredEpisodes = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return episodes.filter((ep) => {
      const charNames = (ep.characters || []).map((id) => characterMap[id] || '').join(' ');
      const matchQ =
        !q ||
        (ep.title + ' ' + ep.topic + ' ' + ep.location + ' ' + ep.director + ' ' + charNames)
          .toLowerCase()
          .includes(q);
      const matchChar = !selectedCharId || (ep.characters || []).includes(selectedCharId);
      const matchStatus = !statusFilter || ep.status === statusFilter;
      return matchQ && matchChar && matchStatus;
    });
  }, [episodes, searchQuery, selectedCharId, statusFilter, characterMap]);

  // Calendar calculations
  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const handleNav = (direction: number) => {
    const next = new Date(currentDate);
    if (direction === 0) {
      setCurrentDate(new Date(2026, 9, 1));
      return;
    }
    if (view === 'month') {
      next.setMonth(next.getMonth() + direction);
    } else if (view === 'week') {
      next.setDate(next.getDate() + direction * 7);
    }
    setCurrentDate(next);
  };

  const navLabel =
    view === 'month'
      ? currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      : view === 'week'
      ? `Week of ${currentDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
      : `${filteredEpisodes.length} Episodes`;

  // Timeline lane calculations
  const laneStart = new Date(2026, 9, 1);
  const laneEnd = new Date(2027, 4, 1);
  const laneDays = (laneEnd.getTime() - laneStart.getTime()) / 86400000;
  const calcLanePct = (d: Date) => {
    return Math.max(0, Math.min(100, ((d.getTime() - laneStart.getTime()) / (86400000 * laneDays)) * 100));
  };

  const stoppageStartPct = calcLanePct(new Date(2026, 11, 20));
  const stoppageEndPct = calcLanePct(new Date(2027, 0, 4));

  return (
    <section className="wrap">
      <div
        className="slide"
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
          <BrandLogo variant="slide" />
          <div className="ttl" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: '30px', lineHeight: 1.1, letterSpacing: '2px', textTransform: 'uppercase' }}>
              Convengers
            </div>
            <div className="h1a" style={{ fontFamily: "'Anton','Barlow Condensed',sans-serif", fontSize: '70px', lineHeight: 1.05, color: '#F5C518', textTransform: 'uppercase', textShadow: '0 4px 0 #7a5a00,0 0 30px rgba(245,197,24,.35)' }}>
              Production Calendar
            </div>
            <div style={{ fontSize: '16px', letterSpacing: '8px', textTransform: 'uppercase', marginTop: '4px' }}>
              Convengers Bahay Build
            </div>
          </div>

          <div style={{ position: 'absolute', top: '16px', right: '56px', display: 'flex', alignItems: 'baseline', gap: '10px' }}>
            <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: '16px', letterSpacing: '3px', color: '#BAC4E2', textTransform: 'uppercase' }}>
              Production calendar
            </span>
            <span style={{ fontFamily: "'Anton',sans-serif", fontSize: '22px', color: '#F5C518' }}>
              07
            </span>
            <span style={{ fontSize: '15px', color: '#BAC4E2' }}>
              / 12
            </span>
          </div>
        </div>

        {/* Toolbar & Filter Bar */}
        <div className="pmp pmnone">
          <div className="pmbar">
            <span className="pmnav">
              <button
                type="button"
                className={`pmb ${view === 'month' ? 'on' : ''}`}
                onClick={() => setView('month')}
              >
                Monthly calendar
              </button>
              <button
                type="button"
                className={`pmb ${view === 'week' ? 'on' : ''}`}
                onClick={() => setView('week')}
              >
                Weekly calendar
              </button>
              <button
                type="button"
                className={`pmb ${view === 'list' ? 'on' : ''}`}
                onClick={() => setView('list')}
              >
                Episode list
              </button>
            </span>

            {view !== 'list' && (
              <span className="pmnav">
                <button type="button" className="pmb sm" onClick={() => handleNav(-1)} aria-label="Previous">
                  ◀
                </button>
                <b style={{ minWidth: '160px', textAlign: 'center', fontFamily: "'Barlow Condensed',sans-serif", fontSize: '17px' }}>
                  {navLabel}
                </b>
                <button type="button" className="pmb sm" onClick={() => handleNav(0)}>
                  Today
                </button>
                <button type="button" className="pmb sm" onClick={() => handleNav(1)} aria-label="Next">
                  ▶
                </button>
              </span>
            )}

            <input
              className="pmi"
              placeholder="Search episodes, topics..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ flex: 1, minWidth: '140px' }}
            />

            <select
              className="pms"
              value={selectedCharId}
              onChange={(e) => setSelectedCharId(e.target.value)}
            >
              <option value="">All characters</option>
              {characters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            <select
              className="pms"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All statuses</option>
              <option value="Planned">Planned</option>
              <option value="For Confirmation">For Confirmation</option>
              <option value="Scheduled">Scheduled</option>
              <option value="Completed">Completed</option>
              <option value="Rescheduled">Rescheduled</option>
            </select>

            {canEditTimeline && (
              <button type="button" className="pmb" onClick={() => setIsCharModalOpen(true)}>
                Manage characters
              </button>
            )}

            {canDelete && (
              <button type="button" className="pmb pri" onClick={() => setIsEpisodeModalOpen(true)}>
                + Add episode
              </button>
            )}
          </div>

          {/* Legend */}
          <div className="pmbar" style={{ paddingTop: 0, gap: '14px', fontSize: '12px', color: '#BAC4E2' }}>
            <span><i className="pmdot" style={{ background: '#5B6BB5' }} />Planned</span>
            <span><i className="pmdot" style={{ background: '#F5C518' }} />For Confirmation</span>
            <span><i className="pmdot" style={{ background: '#1F6FE0' }} />Scheduled</span>
            <span><i className="pmdot" style={{ background: '#4BE08A' }} />Completed</span>
            <span><i className="pmdot" style={{ background: '#B58CFF' }} />Rescheduled</span>
            <span>● shoot · ▶ release</span>
          </div>
        </div>

        {/* Main Display: Month Grid / Week Grid / List */}
        <div className="pmp pmflex" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div className="pmhd2">
            <div className="n">1</div>
            <div className="t">
              <span>Production</span>
              <span style={{ color: '#FF5D8F' }}>CALENDAR</span>
            </div>
            <div className="sl">//</div>
          </div>

          <div className="pmscroll" style={{ flex: 1, overflowY: 'auto' }}>
            {view === 'month' && renderMonthCalendar()}
            {view === 'week' && renderWeekCalendar()}
            {view === 'list' && renderEpisodeList()}
          </div>
        </div>

        {/* Content Timeline at a Glance (Lane) */}
        <div className="pmp pmnone" style={{ height: '180px', display: 'flex', flexDirection: 'column' }}>
          <div className="pmhd2">
            <div className="n">2</div>
            <div className="t">
              <span>Content timeline</span>
              <span style={{ color: '#FF9A1F' }}>AT A GLANCE</span>
            </div>
            <div className="x">
              <span style={{ fontSize: '12px', color: '#BAC4E2' }}>
                bars = shoot windows · ◆ = release · bar outline: red = scope delayed, green = completed
              </span>
            </div>
            <div className="sl">//</div>
          </div>

          <div className="pmlane" style={{ position: 'relative', height: '112px', margin: '10px 20px 12px' }}>
            {/* Ticks */}
            {[0, 1, 2, 3, 4, 5, 6, 7].map((idx) => {
              const d = new Date(2026, 9 + idx, 1);
              const x = calcLanePct(d);
              return (
                <React.Fragment key={idx}>
                  <div style={{ position: 'absolute', left: `${x}%`, top: '18px', bottom: 0, width: '1px', background: 'rgba(255,255,255,.14)' }} />
                  <div style={{ position: 'absolute', left: `calc(${x}% + 5px)`, top: 0, fontSize: '12px', fontWeight: 600, color: '#BAC4E2' }}>
                    {d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                  </div>
                </React.Fragment>
              );
            })}

            {/* Work Stoppage Band */}
            <div
              style={{
                position: 'absolute',
                left: `${stoppageStartPct}%`,
                width: `${stoppageEndPct - stoppageStartPct}%`,
                top: '18px',
                bottom: 0,
                background: 'rgba(224,33,59,.3)',
              }}
            />

            {/* Shoot Bars & Release Diamonds */}
            {episodes.map((ep) => {
              const start = parseIsoDate(ep.shootStart);
              const end = parseIsoDate(ep.shootEnd) || start;
              const rel = parseIsoDate(ep.releaseDate);
              const colors = STATUS_COLORS[ep.status] || STATUS_COLORS['Planned'];

              const outlineColor =
                ep.scopeStatus === 'Delayed'
                  ? '#E0213B'
                  : ep.scopeStatus === 'Completed'
                  ? '#4BE08A'
                  : 'transparent';

              const epLabel = ep.episodeLabel || String(ep.number);

              return (
                <React.Fragment key={ep.id}>
                  {start && end && (
                    <div
                      title={`${ep.episodeLabel ? ep.episodeLabel : `Ep ${ep.number}`} shoot: ${ep.title} (${ep.shootStart} - ${ep.shootEnd || ep.shootStart})`}
                      style={{
                        position: 'absolute',
                        left: `${calcLanePct(start)}%`,
                        width: `${Math.max(calcLanePct(new Date(end.getTime() + 86400000)) - calcLanePct(start), 0.5)}%`,
                        minWidth: '16px',
                        top: `${20 + (ep.number % 4) * 16}px`,
                        height: '14px',
                        borderRadius: '4px',
                        background: colors[0],
                        color: colors[1],
                        boxShadow: `0 0 0 2px ${outlineColor}`,
                        fontSize: '10px',
                        fontWeight: 700,
                        lineHeight: '14px',
                        textAlign: 'center',
                        whiteSpace: 'nowrap',
                        padding: ep.episodeLabel ? '0 4px' : undefined,
                        cursor: 'pointer',
                      }}
                      onClick={() => {
                        if (!canEdit) {
                          onViewerAttemptEdit?.();
                          return;
                        }
                        setEditingEpisode(ep);
                      }}
                    >
                      {epLabel}
                    </div>
                  )}

                  {rel && (
                    <div
                      title={`${ep.episodeLabel ? ep.episodeLabel : `Ep ${ep.number}`} release: ${ep.releaseDate}`}
                      style={{
                        position: 'absolute',
                        left: `${calcLanePct(rel)}%`,
                        top: `${86 + (ep.number % 2) * 13}px`,
                        transform: 'translateX(-50%)',
                        fontSize: '10px',
                        fontWeight: 700,
                        color: '#F5C518',
                        whiteSpace: 'nowrap',
                        cursor: canEdit ? 'pointer' : 'default',
                      }}
                      onClick={() => {
                        if (!canEdit) {
                          onViewerAttemptEdit?.();
                          return;
                        }
                        setEditingEpisode(ep);
                      }}
                    >
                      ◆{epLabel}
                    </div>
                  )}
                </React.Fragment>
              );
            })}
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
            Version {settings.version} · Connected to full-stack database
          </div>
        </div>
      </div>

      {/* Character Manager Modal */}
      {isCharModalOpen && (
        <CharacterManagerModal
          characters={characters}
          episodes={episodes}
          onClose={() => setIsCharModalOpen(false)}
          onAdd={onAddCharacter}
          onUpdate={onUpdateCharacter}
          onDelete={onDeleteCharacter}
          onSelectFilter={(cId) => {
            setSelectedCharId(cId);
            setIsCharModalOpen(false);
          }}
        />
      )}

      {/* Episode Add / Edit Modal */}
      {(isEpisodeModalOpen || editingEpisode) && canEdit && (
        <EpisodeModal
          episode={editingEpisode}
          characters={characters}
          canEditTimeline={canEditTimeline}
          nextNumber={episodes.reduce((m, x) => Math.max(m, x.number), 0) + 1}
          onClose={() => {
            setIsEpisodeModalOpen(false);
            setEditingEpisode(null);
          }}
          onSave={(data) => {
            if (editingEpisode) {
              onUpdateEpisode(editingEpisode.id, data);
            } else {
              onAddEpisode(data);
            }
            setIsEpisodeModalOpen(false);
            setEditingEpisode(null);
          }}
          onDelete={canDelete ? () => {
            if (editingEpisode) {
              onDeleteEpisode(editingEpisode.id);
            }
            setIsEpisodeModalOpen(false);
            setEditingEpisode(null);
          } : undefined}
        />
      )}
    </section>
  );

  function renderMonthCalendar() {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const startDay = new Date(firstDay);
    const dayOfWeek = startDay.getDay(); // 0 = Sun
    startDay.setDate(startDay.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));

    const cells = [];
    for (let i = 0; i < 35; i++) {
      const d = new Date(startDay);
      d.setDate(startDay.getDate() + i);
      const isCurrentMonth = d.getMonth() === month;
      const isoStr = toIsoDate(d);

      // find shooting episodes on this date
      const shootEps = filteredEpisodes.filter((ep) => {
        const s = ep.shootStart;
        const e = ep.shootEnd || s;
        return s && s <= isoStr && e >= isoStr;
      });

      // find release episodes
      const relEps = filteredEpisodes.filter((ep) => ep.releaseDate === isoStr);

      cells.push(
        <div
          key={i}
          className={`pmcell ${!isCurrentMonth ? 'out' : ''}`}
          style={{ minHeight: '96px' }}
        >
          <span className="dn">{d.getDate()}</span>
          {shootEps.map((ep) => {
            const col = (STATUS_COLORS[ep.status] || STATUS_COLORS['Planned'])[0];
            return (
              <button
                key={ep.id}
                type="button"
                className="pmit"
                style={{ borderLeftColor: col, fontSize: '11px', padding: '2px 5px' }}
                onClick={() => {
                  if (!canEdit) {
                    onViewerAttemptEdit?.();
                    return;
                  }
                  setEditingEpisode(ep);
                }}
              >
                ● {ep.episodeLabel ? ep.episodeLabel : `Ep ${ep.number}`} {ep.title}
              </button>
            );
          })}
          {relEps.map((ep) => {
            return (
              <button
                key={ep.id}
                type="button"
                className="pmit"
                style={{ borderLeftColor: '#F5C518', fontSize: '11px', padding: '2px 5px' }}
                onClick={() => {
                  if (!canEdit) {
                    onViewerAttemptEdit?.();
                    return;
                  }
                  setEditingEpisode(ep);
                }}
              >
                ▶ Release {ep.episodeLabel ? ep.episodeLabel : `Ep ${ep.number}`}
              </button>
            );
          })}
        </div>
      );
    }

    return (
      <div className="pmcal">
        {DAYS.map((day) => (
          <div key={day} className="dh">
            {day}
          </div>
        ))}
        {cells}
      </div>
    );
  }

  function renderWeekCalendar() {
    const startOfWeek = new Date(currentDate);
    const day = startOfWeek.getDay();
    startOfWeek.setDate(startOfWeek.getDate() - (day === 0 ? 6 : day - 1));

    return (
      <div className="pmwk" style={{ gridTemplateColumns: 'repeat(7, 1fr)' }}>
        {DAYS.map((dayName, idx) => {
          const d = new Date(startOfWeek);
          d.setDate(startOfWeek.getDate() + idx);
          const isoStr = toIsoDate(d);

          const shootEps = filteredEpisodes.filter((ep) => {
            const s = ep.shootStart;
            const e = ep.shootEnd || s;
            return s && s <= isoStr && e >= isoStr;
          });

          return (
            <div key={idx} className="pmday">
              <div className="pmdh">
                <b>{dayName}</b> {d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </div>
              <div className="pmdb">
                {shootEps.length === 0 ? (
                  <div className="pmempty" style={{ padding: '8px', fontSize: '12px' }}>
                    —
                  </div>
                ) : (
                  shootEps.map((ep) => {
                    const colors = STATUS_COLORS[ep.status] || STATUS_COLORS['Planned'];
                    return (
                      <button
                        key={ep.id}
                        type="button"
                        className="pmit"
                        style={{ borderLeftColor: colors[0] }}
                        onClick={() => {
                          if (!canEdit) {
                            onViewerAttemptEdit?.();
                            return;
                          }
                          setEditingEpisode(ep);
                        }}
                      >
                        <b>{ep.episodeLabel ? ep.episodeLabel : `Ep ${ep.number}`}: {ep.title}</b>
                        <small>
                          Characters: {ep.characters.map((cId) => characterMap[cId]).filter(Boolean).join(', ') || 'None'}
                        </small>
                        <small>{ep.location || 'Location set'}</small>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  function renderEpisodeList() {
    return (
      <div>
        <div className="pmrow ccrow h">
          <div>Ep</div>
          <div>Content title</div>
          <div>Target shoot</div>
          <div>Target release</div>
          <div>Characters involved</div>
          <div>Location / set</div>
          <div>Director</div>
          <div>Status</div>
          <div>Remarks</div>
          <div />
        </div>

        {filteredEpisodes.map((ep) => {
          const colors = STATUS_COLORS[ep.status] || STATUS_COLORS['Planned'];
          const charNames = ep.characters.map((cId) => characterMap[cId]).filter(Boolean).join(', ');

          return (
            <div
              key={ep.id}
              onDoubleClick={!canEdit ? onViewerAttemptEdit : undefined}
              className="pmrow ccrow"
            >
              <div className="pmc" data-l="Ep">
                <b>{ep.episodeLabel || ep.number}</b>
              </div>
              <div className="pmc" data-l="Title">
                <b>{ep.title}</b>
                <small>{ep.topic}</small>
                {ep.updatedBy && (
                  <small className="text-[10px] text-[#BAC4E2]/70 italic block">
                    Last updated by {ep.updatedBy} {ep.updatedAt ? `on ${new Date(ep.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}
                  </small>
                )}
              </div>
              <div className="pmc" data-l="Shoot">
                {ep.shootStart} {ep.shootEnd && ep.shootEnd !== ep.shootStart ? `– ${ep.shootEnd}` : ''}
              </div>
              <div className="pmc" data-l="Release">
                {ep.releaseDate || '—'}
              </div>
              <div className="pmc" data-l="Characters">
                {charNames || <i style={{ color: '#BAC4E2' }}>none</i>}
              </div>
              <div className="pmc" data-l="Location">
                {ep.location || '—'}
              </div>
              <div className="pmc" data-l="Director">
                {ep.director || '—'}
              </div>
              <div className="pmc" data-l="Status">
                <span className="pmchip" style={{ background: colors[0], color: colors[1] }}>
                  {ep.status}
                </span>
              </div>
              <div className="pmc" data-l="Remarks">
                {ep.remarks || '—'}
              </div>
              <div className="pmc act">
                {canEdit && (
                  <button
                    type="button"
                    className="pmb sm"
                    onClick={() => setEditingEpisode(ep)}
                  >
                    Edit
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }
};

// Character Management Modal
const CharacterManagerModal: React.FC<{
  characters: Character[];
  episodes: Episode[];
  onClose: () => void;
  onAdd: (name: string) => void;
  onUpdate: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onSelectFilter: (id: string) => void;
}> = ({ characters, episodes, onClose, onAdd, onUpdate, onDelete, onSelectFilter }) => {
  const [newName, setNewName] = useState('');

  return (
    <div className="shm">
      <div className="shbox" style={{ maxWidth: '600px' }}>
        <div className="shhead">
          <h2>Manage Characters</h2>
          <button type="button" className="shx" onClick={onClose}>
            ×
          </button>
        </div>
        <p style={{ fontSize: '13px', color: '#BAC4E2', margin: '0 0 10px' }}>
          Add, rename or remove Multiverse characters. Characters sync automatically with episodes.
        </p>

        <div className="pmcl" style={{ maxHeight: '280px', overflowY: 'auto' }}>
          {characters.map((c) => {
            const count = episodes.filter((e) => (e.characters || []).includes(c.id)).length;
            return (
              <div key={c.id} style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                <input
                  className="pmi"
                  style={{ flex: 1 }}
                  defaultValue={c.name}
                  onBlur={(e) => onUpdate(c.id, e.target.value)}
                />
                <span style={{ fontSize: '12px', color: '#BAC4E2', whiteSpace: 'nowrap' }}>
                  {count} episode{count === 1 ? '' : 's'}
                </span>
                <button
                  type="button"
                  className="pmb sm"
                  onClick={() => onSelectFilter(c.id)}
                >
                  Filter
                </button>
                <button
                  type="button"
                  className="pmb sm dng"
                  onClick={() => onDelete(c.id)}
                >
                  Remove
                </button>
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
          <input
            className="pmi flex-1"
            placeholder="New character name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <button
            type="button"
            className="pmb pri"
            onClick={() => {
              if (!newName.trim()) return;
              onAdd(newName.trim());
              setNewName('');
            }}
          >
            Add character
          </button>
        </div>

        <div className="shrow" style={{ marginTop: '16px' }}>
          <button type="button" className="shbtn pri" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

// Episode Add / Edit Modal
const EpisodeModal: React.FC<{
  episode: Episode | null;
  characters: Character[];
  canEditTimeline?: boolean;
  nextNumber: number;
  onClose: () => void;
  onSave: (data: any) => void;
  onDelete?: () => void;
}> = ({ episode, characters, canEditTimeline = true, nextNumber, onClose, onSave, onDelete }) => {
  const [number, setNumber] = useState(episode?.number || nextNumber);
  const [title, setTitle] = useState(episode?.title || '');
  const [topic, setTopic] = useState(episode?.topic || '');
  const [status, setStatus] = useState<EpisodeProductionStatus>(episode?.status || 'Planned');
  const [scopeOfWork, setScopeOfWork] = useState(episode?.scopeOfWork || '');
  const [scopeStatus, setScopeStatus] = useState<EpisodeScopeStatus>(episode?.scopeStatus || 'Not started');
  const [shootStart, setShootStart] = useState(episode?.shootStart || '');
  const [shootEnd, setShootEnd] = useState(episode?.shootEnd || '');
  const [releaseDate, setReleaseDate] = useState(episode?.releaseDate || '');
  const [location, setLocation] = useState(episode?.location || '');
  const [director, setDirector] = useState(episode?.director || '');
  const [remarks, setRemarks] = useState(episode?.remarks || '');
  const [selectedChars, setSelectedChars] = useState<string[]>(episode?.characters || []);

  const toggleChar = (id: string) => {
    if (!canEditTimeline) return;
    if (selectedChars.includes(id)) {
      setSelectedChars(selectedChars.filter((x) => x !== id));
    } else {
      setSelectedChars([...selectedChars, id]);
    }
  };

  return (
    <div className="shm">
      <div className="shbox" style={{ maxWidth: '720px' }}>
        <div className="shhead">
          <h2>{episode ? 'Edit Episode / Content' : 'Add Episode / Content'}</h2>
          <button type="button" className="shx" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="pmf">
          <label>
            <span className="pmlbl">Episode number</span>
            <input className="pmi" type="number" disabled={!canEditTimeline} value={number} onChange={(e) => setNumber(parseInt(e.target.value, 10) || 1)} />
          </label>
          <label>
            <span className="pmlbl">Production status</span>
            <select className="pms" value={status} onChange={(e) => setStatus(e.target.value as any)}>
              <option value="Planned">Planned</option>
              <option value="For Confirmation">For Confirmation</option>
              <option value="Scheduled">Scheduled</option>
              <option value="Completed">Completed</option>
              <option value="Rescheduled">Rescheduled</option>
            </select>
          </label>
          <label className="full">
            <span className="pmlbl">Content title *</span>
            <input className="pmi" disabled={!canEditTimeline} value={title} onChange={(e) => setTitle(e.target.value)} required />
          </label>
          <label className="full">
            <span className="pmlbl">Topic / brief</span>
            <input className="pmi" disabled={!canEditTimeline} value={topic} onChange={(e) => setTopic(e.target.value)} />
          </label>
          <label>
            <span className="pmlbl">Target shoot start</span>
            <input className="pmi" type="date" disabled={!canEditTimeline} value={shootStart} onChange={(e) => setShootStart(e.target.value)} />
          </label>
          <label>
            <span className="pmlbl">Target shoot end</span>
            <input className="pmi" type="date" disabled={!canEditTimeline} value={shootEnd} onChange={(e) => setShootEnd(e.target.value)} />
          </label>
          <label>
            <span className="pmlbl">Target release date</span>
            <input className="pmi" type="date" disabled={!canEditTimeline} value={releaseDate} onChange={(e) => setReleaseDate(e.target.value)} />
          </label>
          <label>
            <span className="pmlbl">Location / set</span>
            <input className="pmi" disabled={!canEditTimeline} value={location} onChange={(e) => setLocation(e.target.value)} />
          </label>
          <label className="full">
            <span className="pmlbl">Characters involved</span>
          </label>
          <div className="full pmchars">
            {characters.map((c) => (
              <label key={c.id}>
                <input
                  type="checkbox"
                  disabled={!canEditTimeline}
                  checked={selectedChars.includes(c.id)}
                  onChange={() => toggleChar(c.id)}
                />
                {c.name}
              </label>
            ))}
          </div>
          <label>
            <span className="pmlbl">Director</span>
            <input className="pmi" disabled={!canEditTimeline} value={director} onChange={(e) => setDirector(e.target.value)} />
          </label>
          <label>
            <span className="pmlbl">Related scope of work</span>
            <input className="pmi" disabled={!canEditTimeline} value={scopeOfWork} onChange={(e) => setScopeOfWork(e.target.value)} />
          </label>
          <label>
            <span className="pmlbl">Scope status</span>
            <select className="pms" value={scopeStatus} onChange={(e) => setScopeStatus(e.target.value as any)}>
              <option value="Not started">Not started</option>
              <option value="On-track">On-track</option>
              <option value="Delayed">Delayed</option>
              <option value="Completed">Completed</option>
            </select>
          </label>
          <label className="full">
            <span className="pmlbl">Remarks</span>
            <textarea className="pmta" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </label>
        </div>

        <div className="shrow">
          {episode && onDelete && (
            <button
              type="button"
              className="shbtn"
              style={{ marginRight: 'auto', borderColor: '#E0213B', color: '#FF7A8A' }}
              onClick={onDelete}
            >
              Delete episode
            </button>
          )}
          <button type="button" className="shbtn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="shbtn pri"
            onClick={() => {
              if (!canEditTimeline) {
                onSave({
                  status,
                  scopeStatus,
                  remarks,
                });
                return;
              }
              if (!title.trim()) return;
              onSave({
                number,
                ...(episode?.episodeLabel ? { episodeLabel: episode.episodeLabel } : {}),
                title: title.trim(),
                topic,
                status,
                scopeOfWork,
                scopeStatus,
                shootStart,
                shootEnd: shootEnd || shootStart,
                releaseDate,
                location,
                director,
                remarks,
                characters: selectedChars,
              });
            }}
          >
            Save Episode
          </button>
        </div>
      </div>
    </div>
  );
};
