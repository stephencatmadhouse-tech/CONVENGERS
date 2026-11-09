/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { ConcretePour, SystemSettings } from '../types/index.ts';
import { LOGO_SVG, STATUS_COLORS } from '../constants/assets.ts';
import {
  calculateConcreteCompletion,
  isPourOverdue,
  parseIsoDate,
  toIsoDate,
} from '../utils/calculations.ts';

interface ConcretePourSlideProps {
  pours: ConcretePour[];
  settings: SystemSettings;
  canEdit: boolean;
  onAddPour: (pour: Omit<ConcretePour, 'id'>) => void;
  onUpdatePour: (id: string, updates: Partial<ConcretePour>) => void;
  onDeletePour: (id: string) => void;
}

export const ConcretePourSlide: React.FC<ConcretePourSlideProps> = ({
  pours,
  settings,
  canEdit,
  onAddPour,
  onUpdatePour,
  onDeletePour,
}) => {
  const [addingFloor, setAddingFloor] = useState<'GF' | '2F' | '3F' | null>(null);
  const [newComponent, setNewComponent] = useState('');
  const [newActivity, setNewActivity] = useState('');
  const [newTargetPour, setNewTargetPour] = useState('');

  const overall = calculateConcreteCompletion(pours);
  const gfStat = calculateConcreteCompletion(pours, 'GF');
  const f2Stat = calculateConcreteCompletion(pours, '2F');
  const f3Stat = calculateConcreteCompletion(pours, '3F');

  const today = new Date();
  const normalizedToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const overdueCount = pours.filter((p) => isPourOverdue(p, normalizedToday)).length;
  const next14DaysCount = pours.filter((p) => {
    if (p.milestoneStatus === 'Completed / Approved') return false;
    const tp = parseIsoDate(p.targetPour);
    if (!tp) return false;
    const diff = Math.round((tp.getTime() - normalizedToday.getTime()) / 86400000);
    return diff >= 0 && diff <= 14;
  }).length;

  const handleAddSubmit = (floor: 'GF' | '2F' | '3F') => {
    if (!newActivity.trim() && !newComponent.trim()) return;
    onAddPour({
      floor,
      component: newComponent.trim() || 'Concrete element',
      activity: newActivity.trim() || 'Pouring works',
      targetPour: newTargetPour || toIsoDate(new Date()),
      actualPour: '',
      targetCompletion: '',
      actualCompletion: '',
      prepStatus: 'Not started',
      pourStatus: 'Not poured',
      cureStatus: 'Not started',
      inspStatus: 'Pending',
      milestoneStatus: 'Not Yet Started',
      remarks: '',
    });
    setAddingFloor(null);
    setNewComponent('');
    setNewActivity('');
    setNewTargetPour('');
  };

  // Timeline points calculation
  const timelineStart = new Date(2026, 9, 1);
  const timelineDays = 212; // Oct 1, 2026 - Apr 30, 2027
  const calcTimelinePct = (d: Date) => {
    return Math.max(0, Math.min(100, ((d.getTime() - timelineStart.getTime()) / (86400000 * timelineDays)) * 100));
  };

  const sortedPoursForTimeline = [...pours]
    .filter((p) => p.targetPour || p.actualPour)
    .sort((a, b) => {
      const da = (a.actualPour || a.targetPour);
      const db = (b.actualPour || b.targetPour);
      return da.localeCompare(db);
    });

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
          <img
            className="logo"
            src={LOGO_SVG}
            alt="Logo"
            style={{ width: '176px', height: '150px', flex: 'none', display: 'block', objectFit: 'contain', borderRadius: '12px', filter: 'drop-shadow(0 0 16px rgba(123,77,255,0.65))' }}
          />
          <div className="ttl" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: '30px', lineHeight: 1.1, letterSpacing: '2px', textTransform: 'uppercase' }}>
              Structural
            </div>
            <div className="h1a" style={{ fontFamily: "'Anton','Barlow Condensed',sans-serif", fontSize: '70px', lineHeight: 1.05, color: '#F5C518', textTransform: 'uppercase', textShadow: '0 4px 0 #7a5a00,0 0 30px rgba(245,197,24,.35)' }}>
              Concrete Pouring
            </div>
            <div style={{ fontSize: '16px', letterSpacing: '8px', textTransform: 'uppercase', marginTop: '4px' }}>
              Convengers Bahay Build
            </div>
          </div>

          <div style={{ position: 'absolute', top: '16px', right: '56px', display: 'flex', alignItems: 'baseline', gap: '10px' }}>
            <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: '16px', letterSpacing: '3px', color: '#BAC4E2', textTransform: 'uppercase' }}>
              Concrete pouring
            </span>
            <span style={{ fontFamily: "'Anton',sans-serif", fontSize: '22px', color: '#F5C518' }}>
              06
            </span>
            <span style={{ fontSize: '15px', color: '#BAC4E2' }}>
              / 12
            </span>
          </div>
        </div>

        {/* Top KPIs */}
        <div className="pmp pmnone">
          <div className="pmk4" style={{ padding: '12px 14px' }}>
            <div className="pmk">
              <b style={{ color: '#4BE08A' }}>{overall.percent}%</b>
              <span>Overall concrete milestones complete ({overall.completed}/{overall.total})</span>
            </div>
            <div className="pmk">
              <b>{gfStat.percent}%</b>
              <span>Ground Floor ({gfStat.completed}/{gfStat.total})</span>
            </div>
            <div className="pmk">
              <b>{f2Stat.percent}%</b>
              <span>Second Floor ({f2Stat.completed}/{f2Stat.total})</span>
            </div>
            <div className="pmk">
              <b>{f3Stat.percent}%</b>
              <span>Third Floor ({f3Stat.completed}/{f3Stat.total})</span>
            </div>
            <div className="pmk">
              <b style={{ color: '#FF7A8A' }}>{overdueCount}</b>
              <span>Overdue pours</span>
            </div>
            <div className="pmk">
              <b style={{ color: '#F5C518' }}>{next14DaysCount}</b>
              <span>Pours in next 14 days</span>
            </div>
            <div className="pmk">
              <b>{pours.length}</b>
              <span>Pours tracked</span>
            </div>
          </div>
        </div>

        {/* 3 Floor Tables */}
        {(['GF', '2F', '3F'] as const).map((floor, fIdx) => {
          const floorPours = pours.filter((p) => p.floor === floor);
          const floorName = floor === 'GF' ? 'GROUND FLOOR' : floor === '2F' ? 'SECOND FLOOR' : 'THIRD FLOOR';
          const stat = floor === 'GF' ? gfStat : floor === '2F' ? f2Stat : f3Stat;

          return (
            <div key={floor} className="pmp pmflex" style={{ display: 'flex', flexDirection: 'column', flex: `${floorPours.length + 1.6} 1 0` }}>
              <div className="pmhd2">
                <div className="n">{fIdx + 1}</div>
                <div className="t">
                  <span>{floorName}</span>
                  <span style={{ color: '#FF9A1F' }}>CONCRETE POURS</span>
                </div>
                <div className="x">
                  <span style={{ fontSize: '14px', color: '#F5C518', fontWeight: 700 }}>
                    {stat.percent}% complete
                  </span>
                  {canEdit && (
                    <button
                      type="button"
                      className="pmb sm pri"
                      onClick={() => setAddingFloor(floor)}
                    >
                      + Add pour
                    </button>
                  )}
                </div>
                <div className="sl">//</div>
              </div>

              {/* Add Pour Inline Form */}
              {addingFloor === floor && canEdit && (
                <div className="flex gap-2 p-2 bg-[#060A24] border-b border-[#F5C518]">
                  <input
                    className="pmi flex-1"
                    placeholder="Component / Area (e.g. Columns, Footings, Slab)"
                    value={newComponent}
                    onChange={(e) => setNewComponent(e.target.value)}
                  />
                  <input
                    className="pmi flex-1"
                    placeholder="Pouring Activity Description"
                    value={newActivity}
                    onChange={(e) => setNewActivity(e.target.value)}
                  />
                  <input
                    className="pmi w-36"
                    type="date"
                    value={newTargetPour}
                    onChange={(e) => setNewTargetPour(e.target.value)}
                  />
                  <button type="button" className="pmb sm" onClick={() => setAddingFloor(null)}>
                    Cancel
                  </button>
                  <button type="button" className="pmb sm pri" onClick={() => handleAddSubmit(floor)}>
                    Save Pour
                  </button>
                </div>
              )}

              <div className="pmscroll" style={{ flex: 1, overflowY: 'auto' }}>
                <div className="pmrow cmrow h">
                  <div>Component / area</div>
                  <div>Pouring activity</div>
                  <div>Target pour</div>
                  <div>Actual pour</div>
                  <div>Target compl.</div>
                  <div>Actual compl.</div>
                  <div>Preparation</div>
                  <div>Pouring</div>
                  <div>Curing</div>
                  <div>Inspection</div>
                  <div>Milestone status</div>
                  <div>Remarks</div>
                  <div />
                </div>

                {floorPours.length === 0 ? (
                  <div className="pmempty">No pours recorded for this floor yet.</div>
                ) : (
                  floorPours.map((p) => {
                    const isOver = isPourOverdue(p, normalizedToday);
                    const isDone = p.milestoneStatus === 'Completed / Approved';

                    return (
                      <div
                        key={p.id}
                        className={`pmrow cmrow ${isOver ? 'od' : isDone ? 'ok' : ''}`}
                      >
                        <div className="pmc" data-l="Component / area">
                          {canEdit ? (
                            <input
                              className="pmi"
                              value={p.component}
                              onChange={(e) => onUpdatePour(p.id, { component: e.target.value })}
                              placeholder="Component / area"
                            />
                          ) : (
                            <span className="font-semibold text-white text-xs">{p.component}</span>
                          )}
                        </div>
                        <div className="pmc" data-l="Pouring activity">
                          {canEdit ? (
                            <input
                              className="pmi"
                              value={p.activity}
                              onChange={(e) => onUpdatePour(p.id, { activity: e.target.value })}
                              placeholder="Pouring activity"
                            />
                          ) : (
                            <span className="text-[#BAC4E2] text-xs">{p.activity}</span>
                          )}
                          {p.updatedBy && (
                            <div className="text-[10px] text-[#BAC4E2]/70 italic mt-0.5">
                              Updated by {p.updatedBy} {p.updatedAt ? `on ${new Date(p.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}
                            </div>
                          )}
                        </div>
                        <div className="pmc" data-l="Target pour">
                          {canEdit ? (
                            <input
                              className="pmi"
                              type="date"
                              value={p.targetPour}
                              onChange={(e) => onUpdatePour(p.id, { targetPour: e.target.value })}
                            />
                          ) : (
                            <span className="font-mono text-xs text-white">{p.targetPour || '—'}</span>
                          )}
                        </div>
                        <div className="pmc" data-l="Actual pour">
                          {canEdit ? (
                            <input
                              className="pmi"
                              type="date"
                              value={p.actualPour}
                              onChange={(e) => onUpdatePour(p.id, { actualPour: e.target.value })}
                            />
                          ) : (
                            <span className="font-mono text-xs text-[#4BE08A]">{p.actualPour || '—'}</span>
                          )}
                        </div>
                        <div className="pmc" data-l="Target compl.">
                          {canEdit ? (
                            <input
                              className="pmi"
                              type="date"
                              value={p.targetCompletion}
                              onChange={(e) => onUpdatePour(p.id, { targetCompletion: e.target.value })}
                            />
                          ) : (
                            <span className="font-mono text-xs text-white">{p.targetCompletion || '—'}</span>
                          )}
                        </div>
                        <div className="pmc" data-l="Actual compl.">
                          {canEdit ? (
                            <input
                              className="pmi"
                              type="date"
                              value={p.actualCompletion}
                              onChange={(e) => onUpdatePour(p.id, { actualCompletion: e.target.value })}
                            />
                          ) : (
                            <span className="font-mono text-xs text-[#4BE08A]">{p.actualCompletion || '—'}</span>
                          )}
                        </div>
                        <div className="pmc" data-l="Preparation">
                          {canEdit ? (
                            <select
                              className="pms"
                              value={p.prepStatus}
                              onChange={(e) => onUpdatePour(p.id, { prepStatus: e.target.value as any })}
                            >
                              <option value="Not started">Not started</option>
                              <option value="Ongoing">Ongoing</option>
                              <option value="Ready">Ready</option>
                              <option value="Completed">Completed</option>
                            </select>
                          ) : (
                            <span className="text-xs text-[#BAC4E2] font-semibold">{p.prepStatus}</span>
                          )}
                        </div>
                        <div className="pmc" data-l="Pouring">
                          {canEdit ? (
                            <select
                              className="pms"
                              value={p.pourStatus}
                              onChange={(e) => onUpdatePour(p.id, { pourStatus: e.target.value as any })}
                            >
                              <option value="Not poured">Not poured</option>
                              <option value="Scheduled">Scheduled</option>
                              <option value="Ongoing">Ongoing</option>
                              <option value="Completed">Completed</option>
                            </select>
                          ) : (
                            <span className="text-xs text-[#BAC4E2] font-semibold">{p.pourStatus}</span>
                          )}
                        </div>
                        <div className="pmc" data-l="Curing">
                          {canEdit ? (
                            <select
                              className="pms"
                              value={p.cureStatus}
                              onChange={(e) => onUpdatePour(p.id, { cureStatus: e.target.value as any })}
                            >
                              <option value="Not started">Not started</option>
                              <option value="Ongoing">Ongoing</option>
                              <option value="Completed">Completed</option>
                            </select>
                          ) : (
                            <span className="text-xs text-[#BAC4E2] font-semibold">{p.cureStatus}</span>
                          )}
                        </div>
                        <div className="pmc" data-l="Inspection">
                          {canEdit ? (
                            <select
                              className="pms"
                              value={p.inspStatus}
                              onChange={(e) => onUpdatePour(p.id, { inspStatus: e.target.value as any })}
                            >
                              <option value="Pending">Pending</option>
                              <option value="For inspection">For inspection</option>
                              <option value="Approved">Approved</option>
                              <option value="Rejected">Rejected</option>
                            </select>
                          ) : (
                            <span className="text-xs text-[#BAC4E2] font-semibold">{p.inspStatus}</span>
                          )}
                        </div>
                        <div className="pmc" data-l="Milestone status">
                          {canEdit ? (
                            <select
                              className="pms"
                              value={p.milestoneStatus}
                              onChange={(e) => onUpdatePour(p.id, { milestoneStatus: e.target.value as any })}
                            >
                              <option value="Not Yet Started">Not Yet Started</option>
                              <option value="Preparation Ongoing">Preparation Ongoing</option>
                              <option value="Ready for Pouring">Ready for Pouring</option>
                              <option value="Scheduled for Pouring">Scheduled for Pouring</option>
                              <option value="Pouring Ongoing">Pouring Ongoing</option>
                              <option value="Pouring Completed">Pouring Completed</option>
                              <option value="Curing Ongoing">Curing Ongoing</option>
                              <option value="Completed / Approved">Completed / Approved</option>
                              <option value="Delayed">Delayed</option>
                            </select>
                          ) : (
                            <span className="font-bold text-xs text-[#F5C518]">{p.milestoneStatus}</span>
                          )}
                          {isOver && (
                            <span className="pmtag" style={{ background: '#E0213B', color: '#fff', marginLeft: '4px' }}>
                              OVERDUE
                            </span>
                          )}
                        </div>
                        <div className="pmc" data-l="Remarks">
                          {canEdit ? (
                            <input
                              className="pmi"
                              value={p.remarks}
                              onChange={(e) => onUpdatePour(p.id, { remarks: e.target.value })}
                              placeholder="Remarks"
                            />
                          ) : (
                            <span className="text-xs text-[#BAC4E2] italic">{p.remarks || '—'}</span>
                          )}
                        </div>
                        <div className="pmc act">
                          {canEdit && (
                            <button
                              type="button"
                              className="pmb sm dng"
                              title="Delete this pour"
                              onClick={() => onDeletePour(p.id)}
                            >
                              ×
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}

        {/* Chronological Pouring Timeline & Schedule */}
        <div className="pmp pmnone" style={{ height: '220px', display: 'flex', flexDirection: 'column' }}>
          <div className="pmhd2">
            <div className="n">4</div>
            <div className="t">
              <span>CHRONOLOGICAL</span>
              <span style={{ color: '#4BE08A' }}>POURING TIMELINE</span>
            </div>
            <div className="x">
              <span style={{ fontSize: '12px', color: '#BAC4E2' }}>
                ◇ target · ◆ actual · line = today
              </span>
            </div>
            <div className="sl">//</div>
          </div>

          <div style={{ display: 'flex', gap: '14px', padding: '10px 12px', flex: 1, minHeight: 0 }}>
            {/* Timeline Visual Graphic */}
            <div style={{ flex: 1.6, minWidth: 0, position: 'relative', overflowX: 'auto' }}>
              <div style={{ position: 'relative', height: '112px', margin: '0 14px 0 28px' }}>
                {/* Month Ticks */}
                {[
                  { m: 'Oct 26', d: new Date(2026, 9, 1) },
                  { m: 'Nov 26', d: new Date(2026, 10, 1) },
                  { m: 'Dec 26', d: new Date(2026, 11, 1) },
                  { m: 'Jan 27', d: new Date(2027, 0, 1) },
                  { m: 'Feb 27', d: new Date(2027, 1, 1) },
                  { m: 'Mar 27', d: new Date(2027, 2, 1) },
                  { m: 'Apr 27', d: new Date(2027, 3, 1) },
                ].map((tick, tIdx) => {
                  const x = calcTimelinePct(tick.d);
                  return (
                    <div
                      key={tIdx}
                      style={{
                        position: 'absolute',
                        left: `${x}%`,
                        top: 0,
                        bottom: 0,
                        borderLeft: '1px solid rgba(255,255,255,.14)',
                      }}
                    >
                      <span style={{ position: 'absolute', left: '4px', top: 0, fontSize: '11px', color: '#BAC4E2', whiteSpace: 'nowrap' }}>
                        {tick.m}
                      </span>
                    </div>
                  );
                })}

                {/* Floor Rows */}
                {(['GF', '2F', '3F'] as const).map((fl, rIdx) => {
                  const y = 20 + rIdx * 30;
                  const flPours = pours.filter((p) => p.floor === fl);

                  return (
                    <React.Fragment key={fl}>
                      <div
                        style={{
                          position: 'absolute',
                          left: 0,
                          right: 0,
                          top: `${y}px`,
                          height: '26px',
                          borderBottom: '1px solid rgba(255,255,255,.07)',
                        }}
                      />
                      <div
                        style={{
                          position: 'absolute',
                          left: 0,
                          top: `${y + 4}px`,
                          font: "800 13px 'Barlow Condensed',sans-serif",
                          color: '#F5C518',
                          background: '#0A1140',
                          padding: '0 4px',
                          zIndex: 3,
                        }}
                      >
                        {fl}
                      </div>

                      {flPours.map((p) => {
                        const targetD = parseIsoDate(p.targetPour);
                        const actualD = parseIsoDate(p.actualPour);
                        const statusColor = (STATUS_COLORS[p.milestoneStatus] || STATUS_COLORS['Not Yet Started'])[0];

                        return (
                          <React.Fragment key={p.id}>
                            {targetD && (
                              <div
                                title={`${fl} · ${p.activity} (Target: ${toIsoDate(targetD)})`}
                                style={{
                                  position: 'absolute',
                                  left: `${calcTimelinePct(targetD)}%`,
                                  top: `${y + 6}px`,
                                  width: '13px',
                                  height: '13px',
                                  marginLeft: '-6px',
                                  transform: 'rotate(45deg)',
                                  border: `2px solid ${statusColor}`,
                                  background: '#0A1140',
                                }}
                              />
                            )}
                            {actualD && (
                              <div
                                title={`${fl} · ${p.activity} (Actual: ${toIsoDate(actualD)})`}
                                style={{
                                  position: 'absolute',
                                  left: `${calcTimelinePct(actualD)}%`,
                                  top: `${y + 6}px`,
                                  width: '13px',
                                  height: '13px',
                                  marginLeft: '-6px',
                                  transform: 'rotate(45deg)',
                                  background: statusColor,
                                  boxShadow: '0 0 6px rgba(75,224,138,0.7)',
                                }}
                              />
                            )}
                          </React.Fragment>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>

            {/* Chronological List */}
            <div className="pmscroll" style={{ flex: 1, borderLeft: '1px solid rgba(123,77,255,.38)', overflowY: 'auto' }}>
              {sortedPoursForTimeline.length === 0 ? (
                <div className="pmempty">Enter pour dates above to populate the timeline.</div>
              ) : (
                sortedPoursForTimeline.map((p) => {
                  const d = p.actualPour || p.targetPour;
                  const isActual = Boolean(p.actualPour);
                  const statusColors = STATUS_COLORS[p.milestoneStatus] || STATUS_COLORS['Not Yet Started'];

                  return (
                    <div
                      key={p.id}
                      className="pmrow"
                      style={{
                        gridTemplateColumns: '100px 40px 1fr auto',
                        padding: '4px 10px',
                        fontSize: '12px',
                        alignItems: 'center',
                      }}
                    >
                      <span>{d}</span>
                      <b>{p.floor}</b>
                      <span className="truncate">
                        {p.activity || p.component} {isActual ? '(Actual)' : '(Target)'}
                      </span>
                      <span
                        className="pmchip"
                        style={{ background: statusColors[0], color: statusColors[1] }}
                      >
                        {p.milestoneStatus}
                      </span>
                    </div>
                  );
                })
              )}
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
