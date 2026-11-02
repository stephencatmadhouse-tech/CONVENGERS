/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  Activity,
  ScopeItem,
  Milestone,
  Episode,
  ConcretePour,
  ActivityOverride,
  SystemSettings,
  ActivityStatus,
  ActivityCategory,
} from '../types/index.ts';
import { LOGO_SVG, STATUS_COLORS, TYPE_COLORS } from '../constants/assets.ts';
import {
  parseDateWindow,
  parseIsoDate,
  toIsoDate,
  isPourOverdue,
} from '../utils/calculations.ts';

interface UnifiedItem {
  key: string;
  type: 'construction' | 'production' | 'milestone' | 'structural' | 'manual';
  title: string;
  sub: string;
  start: Date;
  end: Date;
  status: ActivityStatus;
  owner: string;
  remarks: string;
  overdue: boolean;
  kind: 'scope' | 'milestone' | 'episode' | 'pour' | 'manual';
  refId?: string;
}

interface UpcomingActivitiesSlideProps {
  activities: Activity[];
  scopes: ScopeItem[];
  milestones: Milestone[];
  episodes: Episode[];
  pours: ConcretePour[];
  overrides: Record<string, ActivityOverride>;
  settings: SystemSettings;
  canEdit: boolean;
  onAddActivity: (act: Omit<Activity, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onUpdateActivity: (id: string, updates: Partial<Activity>) => void;
  onDeleteActivity: (id: string) => void;
  onSetOverride: (key: string, ov: Partial<ActivityOverride>) => void;
  onJumpToRow?: (targetKey: string) => void;
}

export const UpcomingActivitiesSlide: React.FC<UpcomingActivitiesSlideProps> = ({
  activities,
  scopes,
  milestones,
  episodes,
  pours,
  overrides,
  settings,
  canEdit,
  onAddActivity,
  onUpdateActivity,
  onDeleteActivity,
  onSetOverride,
  onJumpToRow,
}) => {
  const [view, setView] = useState<'monthly' | 'weekly' | 'all'>('monthly');
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [assigningItem, setAssigningItem] = useState<UnifiedItem | null>(null);

  const today = new Date();
  const normalizedToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  // Aggregate all items
  const allItems: UnifiedItem[] = useMemo(() => {
    const list: UnifiedItem[] = [];

    // 1. Scopes
    scopes.forEach((s) => {
      const win = parseDateWindow(s.dateText);
      if (!win) return;
      const [start, end] = win;
      const key = `c|${s.floor}|${s.phase}|${s.name}|${s.dateText}`;
      const ov = overrides[key] || {};
      let status: ActivityStatus =
        s.percentComplete >= 100
          ? 'Completed'
          : end < normalizedToday
          ? 'Delayed'
          : start <= normalizedToday || s.percentComplete > 0
          ? 'Ongoing'
          : 'Upcoming';

      if (ov.onHold && status !== 'Completed') status = 'On Hold';
      const isOverdue = status !== 'Completed' && status !== 'On Hold' && end < normalizedToday;

      list.push({
        key,
        type: 'construction',
        title: s.name,
        sub: `${s.floor} · ${s.phase} · ${s.percentComplete}% done`,
        start,
        end,
        status,
        owner: ov.owner || '',
        remarks: ov.remarks || '',
        overdue: isOverdue,
        kind: 'scope',
        refId: s.id,
      });
    });

    // 2. Milestones
    milestones.forEach((m) => {
      const win = parseDateWindow(m.dateText);
      if (!win) return;
      const [start, end] = win;
      const key = `m|${m.index}|${m.label}`;
      const ov = overrides[key] || {};
      let status: ActivityStatus =
        m.status === 'Complete'
          ? 'Completed'
          : m.status === 'Delayed'
          ? 'Delayed'
          : m.status === 'In progress'
          ? 'Ongoing'
          : end < normalizedToday
          ? 'Delayed'
          : start <= normalizedToday
          ? 'Ongoing'
          : 'Upcoming';

      if (ov.onHold && status !== 'Completed') status = 'On Hold';
      const isOverdue = status !== 'Completed' && status !== 'On Hold' && end < normalizedToday;

      list.push({
        key,
        type: 'milestone',
        title: m.label,
        sub: `Key milestone · ${m.dateText}`,
        start,
        end,
        status,
        owner: ov.owner || '',
        remarks: ov.remarks || '',
        overdue: isOverdue,
        kind: 'milestone',
        refId: m.id,
      });
    });

    // 3. Episodes
    episodes.forEach((e) => {
      const shootStart = parseIsoDate(e.shootStart);
      const shootEnd = parseIsoDate(e.shootEnd) || shootStart;
      if (shootStart) {
        const key = `e|${e.id}|s`;
        const ov = overrides[key] || {};
        let status: ActivityStatus =
          e.status === 'Completed'
            ? 'Completed'
            : shootEnd && shootEnd < normalizedToday
            ? 'Delayed'
            : shootStart <= normalizedToday
            ? 'Ongoing'
            : 'Upcoming';

        if (ov.onHold && status !== 'Completed') status = 'On Hold';
        const isOverdue = status !== 'Completed' && status !== 'On Hold' && shootEnd! < normalizedToday;

        list.push({
          key,
          type: 'production',
          title: `Ep ${e.number}: ${e.title} (shoot)`,
          sub: `${e.location || 'Location set'} · Director: ${e.director || 'Unassigned'}`,
          start: shootStart,
          end: shootEnd || shootStart,
          status,
          owner: e.director || ov.owner || '',
          remarks: e.remarks || ov.remarks || '',
          overdue: isOverdue,
          kind: 'episode',
          refId: e.id,
        });
      }
    });

    // 4. Concrete Pours
    pours.forEach((p) => {
      const start = parseIsoDate(p.targetPour) || parseIsoDate(p.actualPour);
      const end = parseIsoDate(p.targetCompletion) || start;
      if (!start) return;
      const key = `p|${p.id}`;
      const ov = overrides[key] || {};
      let status: ActivityStatus =
        p.milestoneStatus === 'Completed / Approved'
          ? 'Completed'
          : p.milestoneStatus === 'Delayed' || isPourOverdue(p, normalizedToday)
          ? 'Delayed'
          : ['Pouring Ongoing', 'Curing Ongoing', 'Preparation Ongoing'].includes(p.milestoneStatus)
          ? 'Ongoing'
          : 'Upcoming';

      if (ov.onHold && status !== 'Completed') status = 'On Hold';
      const isOverdue = status !== 'Completed' && status !== 'On Hold' && isPourOverdue(p, normalizedToday);

      list.push({
        key,
        type: 'structural',
        title: `${p.floor} · ${p.activity || p.component}`,
        sub: `Concrete pour · ${p.milestoneStatus}`,
        start,
        end: end || start,
        status,
        owner: ov.owner || '',
        remarks: p.remarks || ov.remarks || '',
        overdue: isOverdue,
        kind: 'pour',
        refId: p.id,
      });
    });

    // 5. Manual Activities
    activities.forEach((a) => {
      const start = parseIsoDate(a.startDate);
      const end = parseIsoDate(a.endDate) || start;
      if (!start) return;
      const key = `a|${a.id}`;
      const isOverdue = a.status !== 'Completed' && a.status !== 'On Hold' && end! < normalizedToday;

      list.push({
        key,
        type: a.category === 'Construction' ? 'construction' : a.category === 'Production' ? 'production' : 'manual',
        title: a.title,
        sub: a.description || 'Custom activity',
        start,
        end: end || start,
        status: a.status,
        owner: a.owner || '',
        remarks: a.notes || '',
        overdue: isOverdue,
        kind: 'manual',
        refId: a.id,
      });
    });

    list.sort((a, b) => a.start.getTime() - b.start.getTime());
    return list;
  }, [scopes, milestones, episodes, pours, activities, overrides, normalizedToday]);

  // View scoping
  const scopedItems = useMemo(() => {
    let startLimit: Date;
    let endLimit: Date;

    if (view === 'monthly') {
      startLimit = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      endLimit = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59);
    } else if (view === 'weekly') {
      const day = currentDate.getDay();
      const diff = currentDate.getDate() - day + (day === 0 ? -6 : 1);
      startLimit = new Date(currentDate.setDate(diff));
      endLimit = new Date(startLimit.getTime() + 6 * 86400000);
    } else {
      return allItems;
    }

    return allItems.filter((i) => i.start <= endLimit && i.end >= startLimit);
  }, [allItems, view, currentDate]);

  // Filtering
  const filteredItems = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return scopedItems.filter((i) => {
      const matchQ = !q || (i.title + ' ' + i.sub + ' ' + i.owner + ' ' + i.remarks).toLowerCase().includes(q);
      const matchSt = !statusFilter || i.status === statusFilter;
      const matchTy = !typeFilter || i.type === typeFilter;
      return matchQ && matchSt && matchTy;
    });
  }, [scopedItems, searchQuery, statusFilter, typeFilter]);

  // Needs Attention Items (Overdue, Today, Soon)
  const attentionItems = useMemo(() => {
    return allItems
      .filter((i) => {
        if (i.status === 'Completed' || i.status === 'On Hold') return false;
        const diffDays = Math.round((i.start.getTime() - normalizedToday.getTime()) / 86400000);
        return i.overdue || (i.start <= normalizedToday && i.end >= normalizedToday) || (diffDays > 0 && diffDays <= 3);
      })
      .slice(0, 30);
  }, [allItems, normalizedToday]);

  // Navigation handlers
  const handleNav = (direction: number) => {
    const next = new Date(currentDate);
    if (direction === 0) {
      setCurrentDate(new Date());
      return;
    }
    if (view === 'monthly') {
      next.setMonth(next.getMonth() + direction);
    } else if (view === 'weekly') {
      next.setDate(next.getDate() + direction * 7);
    }
    setCurrentDate(next);
  };

  const navLabel =
    view === 'monthly'
      ? currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      : view === 'weekly'
      ? `Week of ${currentDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
      : 'All Activities';

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
            style={{ width: '176px', height: '150px', flex: 'none', display: 'block', clipPath: 'polygon(0 0,98% 0,81% 100%,0 100%)', borderRadius: '10px 0 0 10px' }}
          />
          <div className="ttl" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: '30px', lineHeight: 1.1, letterSpacing: '2px', textTransform: 'uppercase' }}>
              Upcoming /
            </div>
            <div className="h1a" style={{ fontFamily: "'Anton','Barlow Condensed',sans-serif", fontSize: '70px', lineHeight: 1.05, color: '#F5C518', textTransform: 'uppercase', textShadow: '0 4px 0 #7a5a00,0 0 30px rgba(245,197,24,.35)' }}>
              Next Activities
            </div>
            <div style={{ fontSize: '16px', letterSpacing: '8px', textTransform: 'uppercase', marginTop: '4px' }}>
              Convengers Bahay Build
            </div>
          </div>

          <div style={{ position: 'absolute', top: '16px', right: '56px', display: 'flex', alignItems: 'baseline', gap: '10px' }}>
            <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: '16px', letterSpacing: '3px', color: '#BAC4E2', textTransform: 'uppercase' }}>
              Upcoming activities
            </span>
            <span style={{ fontFamily: "'Anton',sans-serif", fontSize: '22px', color: '#F5C518' }}>
              02
            </span>
            <span style={{ fontSize: '15px', color: '#BAC4E2' }}>
              / 11
            </span>
          </div>
        </div>

        {/* Controls Toolbar Panel */}
        <div className="pmp pmnone">
          <div className="pmbar">
            <span className="pmnav">
              <button
                type="button"
                className={`pmb ${view === 'monthly' ? 'on' : ''}`}
                onClick={() => setView('monthly')}
              >
                Monthly
              </button>
              <button
                type="button"
                className={`pmb ${view === 'weekly' ? 'on' : ''}`}
                onClick={() => setView('weekly')}
              >
                Weekly
              </button>
              <button
                type="button"
                className={`pmb ${view === 'all' ? 'on' : ''}`}
                onClick={() => setView('all')}
              >
                All activities
              </button>
            </span>

            {view !== 'all' && (
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
              placeholder="Search activities, owners..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ flex: 1, minWidth: '160px' }}
            />

            <select
              className="pms"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All statuses</option>
              <option value="Upcoming">Upcoming</option>
              <option value="Ongoing">Ongoing</option>
              <option value="Completed">Completed</option>
              <option value="Delayed">Delayed</option>
              <option value="On Hold">On Hold</option>
            </select>

            <select
              className="pms"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <option value="">All types</option>
              <option value="construction">Construction</option>
              <option value="production">Production</option>
              <option value="milestone">Milestone</option>
              <option value="structural">Concrete</option>
              <option value="manual">Other</option>
            </select>

            {canEdit && (
              <button type="button" className="pmb pri" onClick={() => setIsAddModalOpen(true)}>
                + Add activity
              </button>
            )}
          </div>

          {/* KPI Summary Cards */}
          <div className="pmk4">
            <div className="pmk">
              <b style={{ color: '#5B6BB5' }}>{filteredItems.filter((i) => i.status === 'Upcoming').length}</b>
              <span>Upcoming</span>
            </div>
            <div className="pmk">
              <b style={{ color: '#1F6FE0' }}>{filteredItems.filter((i) => i.status === 'Ongoing').length}</b>
              <span>Ongoing</span>
            </div>
            <div className="pmk">
              <b style={{ color: '#4BE08A' }}>{filteredItems.filter((i) => i.status === 'Completed').length}</b>
              <span>Completed</span>
            </div>
            <div className="pmk">
              <b style={{ color: '#E0213B' }}>{filteredItems.filter((i) => i.status === 'Delayed').length}</b>
              <span>Delayed</span>
            </div>
            <div className="pmk">
              <b style={{ color: '#8A8FA8' }}>{filteredItems.filter((i) => i.status === 'On Hold').length}</b>
              <span>On Hold</span>
            </div>
            <div className="pmk">
              <b style={{ color: '#FF7A8A' }}>{filteredItems.filter((i) => i.overdue).length}</b>
              <span>Overdue</span>
            </div>
            <div className="pmk">
              <b style={{ color: '#F5C518' }}>
                {filteredItems.filter((i) => i.status !== 'Completed' && i.start <= normalizedToday && i.end >= normalizedToday).length}
              </b>
              <span>Active today</span>
            </div>
            <div className="pmk">
              <b>{filteredItems.length}</b>
              <span>In this view</span>
            </div>
          </div>
        </div>

        {/* Main Section */}
        <div className="pmmain2" style={{ flex: 1, minHeight: 0, display: 'flex', gap: '14px' }}>
          {/* Left: Activities List / Grid */}
          <div className="pmp pmflex" style={{ flex: 2.3, display: 'flex', flexDirection: 'column' }}>
            <div className="pmhd2">
              <div className="n">1</div>
              <div className="t">
                <span>Activities</span>
                <span style={{ color: '#4BE08A' }}>LIST</span>
              </div>
              <div className="sl">//</div>
            </div>

            <div className="pmscroll" style={{ flex: 1, overflowY: 'auto' }}>
              <div className="pmrow uarow h">
                <div>Dates</div>
                <div>Activity</div>
                <div>Type</div>
                <div>Responsible</div>
                <div>Status</div>
                <div />
              </div>

              {filteredItems.length === 0 ? (
                <div className="pmempty">No activities match your filters.</div>
              ) : (
                filteredItems.map((item) => {
                  const statusColors = STATUS_COLORS[item.status] || STATUS_COLORS['Upcoming'];
                  const typeInfo = TYPE_COLORS[item.type] || TYPE_COLORS.manual;

                  return (
                    <div
                      key={item.key}
                      className={`pmrow uarow ${item.overdue ? 'od' : ''} ${
                        item.status !== 'Completed' && item.start <= normalizedToday && item.end >= normalizedToday ? 'td' : ''
                      }`}
                    >
                      <div className="pmc" data-l="Dates">
                        {toIsoDate(item.start)} {item.start.getTime() !== item.end.getTime() ? `– ${toIsoDate(item.end)}` : ''}
                      </div>

                      <div className="pmc" data-l="Activity">
                        <b>{item.title}</b>
                        {item.overdue && (
                          <span className="pmtag" style={{ background: '#E0213B', color: '#fff' }}>
                            OVERDUE
                          </span>
                        )}
                        {item.status !== 'Completed' && item.start <= normalizedToday && item.end >= normalizedToday && (
                          <span className="pmtag" style={{ background: '#F5C518', color: '#060A24' }}>
                            TODAY
                          </span>
                        )}
                        <small>{item.sub}</small>
                        {item.remarks && <small style={{ color: '#F5C518' }}>Note: {item.remarks}</small>}
                      </div>

                      <div className="pmc" data-l="Type">
                        <span
                          className="pmchip"
                          style={{
                            background: `${typeInfo.color}22`,
                            color: typeInfo.color,
                            border: `1px solid ${typeInfo.color}`,
                          }}
                        >
                          {typeInfo.label}
                        </span>
                      </div>

                      <div className="pmc" data-l="Responsible">
                        {item.owner || '—'}
                      </div>

                      <div className="pmc" data-l="Status">
                        {item.kind === 'manual' && canEdit ? (
                          <select
                            className="pms"
                            value={item.status}
                            onChange={(e) => onUpdateActivity(item.refId!, { status: e.target.value as any })}
                            style={{ padding: '3px 6px', fontSize: '12px' }}
                          >
                            <option value="Upcoming">Upcoming</option>
                            <option value="Ongoing">Ongoing</option>
                            <option value="Completed">Completed</option>
                            <option value="Delayed">Delayed</option>
                            <option value="On Hold">On Hold</option>
                          </select>
                        ) : (
                          <span
                            className="pmchip"
                            style={{ background: statusColors[0], color: statusColors[1] }}
                          >
                            {item.status}
                          </span>
                        )}
                      </div>

                      <div className="pmc act">
                        {item.kind === 'manual' ? (
                          <>
                            {canEdit && (
                              <button
                                type="button"
                                className="pmb sm"
                                onClick={() => {
                                  const act = activities.find((a) => a.id === item.refId);
                                  if (act) setEditingActivity(act);
                                }}
                              >
                                Edit
                              </button>
                            )}
                            {canEdit && (
                              <button
                                type="button"
                                className="pmb sm dng"
                                onClick={() => onDeleteActivity(item.refId!)}
                              >
                                Delete
                              </button>
                            )}
                          </>
                        ) : (
                          <>
                            {onJumpToRow && (
                              <button
                                type="button"
                                className="pmb sm"
                                onClick={() => onJumpToRow(item.key)}
                              >
                                Open
                              </button>
                            )}
                            {canEdit && (
                              <button
                                type="button"
                                className="pmb sm"
                                onClick={() => setAssigningItem(item)}
                              >
                                Assign
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right: Needs Immediate Attention */}
          <div className="pmp pmflex" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div className="pmhd2">
              <div className="n">2</div>
              <div className="t">
                <span>Needs</span>
                <span style={{ color: '#FF9A1F' }}>ATTENTION</span>
              </div>
              <div className="sl">//</div>
            </div>

            <div className="pmdb" style={{ padding: '10px', flex: 1, overflowY: 'auto' }}>
              {attentionItems.length === 0 ? (
                <div className="pmempty">Nothing needs immediate attention.</div>
              ) : (
                attentionItems.map((item) => {
                  const typeInfo = TYPE_COLORS[item.type] || TYPE_COLORS.manual;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      className={`pmit ${item.overdue ? 'od' : ''}`}
                      style={{ borderLeftColor: typeInfo.color, width: '100%', textAlign: 'left', marginBottom: '6px' }}
                      onClick={() => onJumpToRow?.(item.key)}
                    >
                      <span
                        className="pmtag"
                        style={{
                          margin: '0 6px 0 0',
                          background: item.overdue ? '#E0213B' : '#F5C518',
                          color: item.overdue ? '#fff' : '#060A24',
                        }}
                      >
                        {item.overdue ? 'OVERDUE' : 'TODAY'}
                      </span>
                      <b>{item.title}</b>
                      <small>
                        {toIsoDate(item.start)} {item.owner ? `· ${item.owner}` : ''}
                      </small>
                    </button>
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
          <div style={{ fontSize: '12px', color: '#BAC4E2', textAlign: 'center' }}>
            Version {settings.version} · Connected to full-stack database
          </div>
        </div>
      </div>

      {/* Add / Edit Activity Modal */}
      {(isAddModalOpen || editingActivity) && (
        <ActivityModal
          activity={editingActivity}
          onClose={() => {
            setIsAddModalOpen(false);
            setEditingActivity(null);
          }}
          onSave={(data) => {
            if (editingActivity) {
              onUpdateActivity(editingActivity.id, data);
            } else {
              onAddActivity(data);
            }
            setIsAddModalOpen(false);
            setEditingActivity(null);
          }}
        />
      )}

      {/* Assign / Override Modal */}
      {assigningItem && (
        <AssignOverrideModal
          item={assigningItem}
          override={overrides[assigningItem.key]}
          onClose={() => setAssigningItem(null)}
          onSave={(ov) => {
            onSetOverride(assigningItem.key, ov);
            setAssigningItem(null);
          }}
        />
      )}
    </section>
  );
};

// Activity Sub-modal
const ActivityModal: React.FC<{
  activity: Activity | null;
  onClose: () => void;
  onSave: (data: any) => void;
}> = ({ activity, onClose, onSave }) => {
  const [title, setTitle] = useState(activity?.title || '');
  const [description, setDescription] = useState(activity?.description || '');
  const [category, setCategory] = useState<ActivityCategory>(activity?.category || 'Construction');
  const [status, setStatus] = useState<ActivityStatus>(activity?.status || 'Upcoming');
  const [startDate, setStartDate] = useState(activity?.startDate || toIsoDate(new Date()));
  const [endDate, setEndDate] = useState(activity?.endDate || toIsoDate(new Date()));
  const [owner, setOwner] = useState(activity?.owner || '');
  const [notes, setNotes] = useState(activity?.notes || '');

  return (
    <div className="shm">
      <div className="shbox" style={{ maxWidth: '640px' }}>
        <div className="shhead">
          <h2>{activity ? 'Edit Activity' : 'Add Activity'}</h2>
          <button type="button" className="shx" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="pmf">
          <label className="full">
            <span className="pmlbl">Activity title *</span>
            <input className="pmi" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </label>
          <label className="full">
            <span className="pmlbl">Description</span>
            <textarea className="pmta" value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <label>
            <span className="pmlbl">Type</span>
            <select className="pms" value={category} onChange={(e) => setCategory(e.target.value as any)}>
              <option value="Construction">Construction</option>
              <option value="Production">Production</option>
              <option value="Other">Other</option>
            </select>
          </label>
          <label>
            <span className="pmlbl">Status</span>
            <select className="pms" value={status} onChange={(e) => setStatus(e.target.value as any)}>
              <option value="Upcoming">Upcoming</option>
              <option value="Ongoing">Ongoing</option>
              <option value="Completed">Completed</option>
              <option value="Delayed">Delayed</option>
              <option value="On Hold">On Hold</option>
            </select>
          </label>
          <label>
            <span className="pmlbl">Start date</span>
            <input className="pmi" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </label>
          <label>
            <span className="pmlbl">End date</span>
            <input className="pmi" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </label>
          <label className="full">
            <span className="pmlbl">Responsible person / team</span>
            <input className="pmi" value={owner} onChange={(e) => setOwner(e.target.value)} />
          </label>
          <label className="full">
            <span className="pmlbl">Notes</span>
            <textarea className="pmta" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
        </div>
        <div className="shrow">
          <button type="button" className="shbtn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="shbtn pri"
            onClick={() => {
              if (!title.trim()) return;
              onSave({
                title,
                description,
                category,
                status,
                startDate,
                endDate: endDate || startDate,
                owner,
                notes,
              });
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

// Override Sub-modal
const AssignOverrideModal: React.FC<{
  item: UnifiedItem;
  override?: ActivityOverride;
  onClose: () => void;
  onSave: (ov: Partial<ActivityOverride>) => void;
}> = ({ item, override, onClose, onSave }) => {
  const [owner, setOwner] = useState(override?.owner || item.owner || '');
  const [remarks, setRemarks] = useState(override?.remarks || item.remarks || '');
  const [onHold, setOnHold] = useState(override?.onHold || false);

  return (
    <div className="shm">
      <div className="shbox" style={{ maxWidth: '540px' }}>
        <div className="shhead">
          <h2>Assign / Remarks</h2>
          <button type="button" className="shx" onClick={onClose}>
            ×
          </button>
        </div>
        <p style={{ fontSize: '13px', color: '#BAC4E2', margin: '0 0 14px' }}>
          Assign owner, set hold status, or attach remarks for: <b>{item.title}</b>
        </p>
        <div className="pmf">
          <label className="full">
            <span className="pmlbl">Responsible person / team</span>
            <input className="pmi" value={owner} onChange={(e) => setOwner(e.target.value)} />
          </label>
          <label className="full">
            <span className="pmlbl">Remarks</span>
            <textarea className="pmta" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </label>
          <label className="full" style={{ flexDirection: 'row', alignItems: 'center', gap: '8px' }}>
            <input
              type="checkbox"
              checked={onHold}
              onChange={(e) => setOnHold(e.target.checked)}
              style={{ width: '16px', height: '16px', accentColor: '#F5C518' }}
            />
            <span>Put this activity On Hold</span>
          </label>
        </div>
        <div className="shrow">
          <button type="button" className="shbtn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="shbtn pri"
            onClick={() => onSave({ owner, remarks, onHold })}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};
