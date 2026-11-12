/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { themed } from '../utils/themeColors.ts';
import { ScopeItem, Episode, SystemSettings, RemoteFocus } from '../types/index.ts';
import { STATUS_COLORS } from '../constants/assets.ts';
import { BrandLogo } from './BrandLogo.tsx';
import { calculateFloorProgress, parseDateWindow, parseIsoDate } from '../utils/calculations.ts';
import { CollaborativeCell } from './CollaborativeCell.tsx';
import { realtime } from '../utils/realtime.ts';

interface FloorScopeSlideProps {
  floor: 'GF' | '2F' | '3F';
  slideNumber: string;
  scopes: ScopeItem[];
  episodes: Episode[];
  settings: SystemSettings;
  canEdit: boolean;
  canEditTimeline?: boolean;
  canDelete?: boolean;
  onUpdateProgress: (id: string, percent: number) => void;
  onUpdateScopeField?: (id: string, field: 'name' | 'dateText', value: string) => void;
  onUpdateScopeWorkingDays?: (id: string, days: number) => void;
  onAddScope: (scope: Omit<ScopeItem, 'id'>) => void;
  onDeleteScope: (id: string) => void;
  remoteFocusMap?: Record<string, RemoteFocus>;
  onViewerAttemptEdit?: () => void;
}

export const FloorScopeSlide: React.FC<FloorScopeSlideProps> = ({
  floor,
  slideNumber,
  scopes,
  episodes,
  settings,
  canEdit,
  canEditTimeline = canEdit,
  canDelete = canEdit,
  onUpdateProgress,
  onUpdateScopeField,
  onUpdateScopeWorkingDays,
  onAddScope,
  onDeleteScope,
  remoteFocusMap = {},
  onViewerAttemptEdit,
}) => {
  const [addingPhase, setAddingPhase] = useState<'Structural' | 'Finishing' | null>(null);
  const [newScopeName, setNewScopeName] = useState('');
  const [newDateText, setNewDateText] = useState('');
  const [newWorkingDays, setNewWorkingDays] = useState(1);

  const floorTitle = floor === 'GF' ? 'GROUND FLOOR' : floor === '2F' ? 'SECOND FLOOR' : 'THIRD FLOOR';
  const floorName = floor === 'GF' ? 'Ground Floor' : floor === '2F' ? 'Second Floor' : 'Third Floor';

  const floorScopes = scopes.filter((s) => s.floor === floor);
  const structuralScopes = floorScopes.filter((s) => s.phase === 'Structural');
  const finishingScopes = floorScopes.filter((s) => s.phase === 'Finishing');

  const floorProgress = calculateFloorProgress(scopes, floor);

  // Content shoots overlap check
  const getOverlappingEpisodes = (dateText: string) => {
    const scopeWin = parseDateWindow(dateText);
    if (!scopeWin) return [];
    return episodes.filter((ep) => {
      const sStart = parseIsoDate(ep.shootStart);
      if (!sStart) return false;
      const sEnd = parseIsoDate(ep.shootEnd) || sStart;
      return sStart <= scopeWin[1] && sEnd >= scopeWin[0];
    });
  };

  const handleAddSubmit = (phase: 'Structural' | 'Finishing') => {
    if (!newScopeName.trim()) return;
    onAddScope({
      floor,
      phase,
      name: newScopeName.trim(),
      dateText: newDateText.trim() || 'Date to be scheduled',
      workingDays: newWorkingDays > 0 ? newWorkingDays : 1,
      percentComplete: 0,
      color: phase === 'Structural' ? 'var(--sx-text-11)' : 'var(--sx-text-10)',
      sortOrder: floorScopes.length + 1,
    });
    setAddingPhase(null);
    setNewScopeName('');
    setNewDateText('');
    setNewWorkingDays(1);
  };

  const bottomNote =
    floor === 'GF'
      ? 'Proposed offset: Testing & commissioning is 1 working day (test only); the 4 days removed go to Doors & window hardware (+2) and Final plumbing & electrical (+2). Stair / structural framing is a separate activity (milestone inputs), moved to after the stoppage. Ground Floor columns / structural works (Nov 9–13) precede the shared column/post installation to Second Floor.'
      : floor === '2F'
      ? 'Proposed offset: Testing & commissioning is 1 working day (test only); the 3 days removed go to Final MEP / fixtures (+2) and Metal / steel works (+1). Highly compressed sequence: validate with the structural engineer (concrete curing, load transfer, inspection hold points, safe access). Nov 28 inspection is a fixed target; Nov 30 is a holiday with no physical work.'
      : 'Finishing window adjusted to Feb 8 – Apr 7, 2027: scopes are compressed proportionally within the window, Testing & commissioning is 1 working day (Apr 6) and the final punchlist is Apr 7, followed by the Apr 8–24 rectification period. Stair framing Jan 27–Feb 2, 2027 overlaps Second Floor stair framing on Jan 27: confirm workface and safety sequencing. Steel deck / reinforcement extended to Dec 14 to avoid the Dec 8 holiday.';

  return (
    <section className="wrap">
      <div
        className="slide"
        data-f={floor}
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
              Scope of work timeline
            </div>
            <div className="h1a" style={{ fontFamily: "'Anton','Barlow Condensed',sans-serif", fontSize: '70px', lineHeight: 1.05, color: 'var(--sx-text-3)', textTransform: 'uppercase', textShadow: 'var(--sx-shadow-27)' }}>
              {floorTitle}
            </div>
            <div style={{ fontSize: '16px', letterSpacing: '8px', textTransform: 'uppercase', marginTop: '4px' }}>
              Convengers Bahay Build
            </div>
          </div>

          {/* Right Top Floor Progress */}
          <div className="rb" style={{ width: '540px', flex: 'none', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ background: 'var(--sx-bg-14)', border: 'var(--sx-border-19)', borderRadius: '14px', boxShadow: 'var(--sx-shadow-36)', overflow: 'hidden' }}>
              <div style={{ padding: '8px 14px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: '17px', letterSpacing: '1.5px', color: 'var(--sx-text-3)' }}>
                    FLOOR PROGRESS
                  </span>
                  <span style={{ fontFamily: "'Anton',sans-serif", fontSize: '26px', lineHeight: 1, color: 'var(--sx-text-3)' }}>
                    {floorProgress}%
                  </span>
                </div>
                <div style={{ height: '10px', borderRadius: '5px', background: 'var(--sx-bg-35)', position: 'relative' }}>
                  <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${Math.max(floorProgress, 2)}%`, borderRadius: '5px', background: 'var(--sx-bg-37)' }} />
                </div>
                <div style={{ fontSize: '12px', color: 'var(--sx-text-2)', whiteSpace: 'nowrap' }}>
                  Scope % complete, weighted by working days
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
              {floorName}
            </span>
            <span style={{ fontFamily: "'Anton',sans-serif", fontSize: '22px', color: 'var(--sx-text-3)' }}>
              {slideNumber}
            </span>
            <span style={{ fontSize: '15px', color: 'var(--sx-text-2)' }}>
              / 12
            </span>
          </div>
        </div>

        {/* 2-Column Panels */}
        <div className="bodyw" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="cols2" style={{ display: 'flex', gap: '24px', flex: 1, minHeight: 0, alignItems: 'stretch' }}>
            {/* Panel 1: Structural Phase */}
            <div className="colpanel" style={{ background: 'var(--sx-bg-14)', border: 'var(--sx-border-19)', borderRadius: '14px', boxShadow: 'var(--sx-shadow-36)', overflow: 'hidden', flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'stretch', height: '52px', flex: 'none', background: 'var(--sx-bg-38)' }}>
                <div style={{ width: '66px', flex: 'none', background: 'var(--sx-bg-12)', clipPath: 'polygon(0 0,100% 0,74% 100%,0 100%)', display: 'flex', alignItems: 'center', paddingLeft: '16px', color: 'var(--sx-text-1)', fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: '30px' }}>
                  1
                </div>
                <div className="chd" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px', paddingLeft: '6px', fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: '25px', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                  <span>STRUCTURAL</span>
                  <span style={{ color: 'var(--sx-text-3)' }}>PHASE</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', paddingRight: '14px', fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: '30px', color: 'var(--sx-text-3)', letterSpacing: '-4px', fontStyle: 'italic' }}>
                  //
                </div>
              </div>

              <div className="rows" style={{ padding: '12px 16px 14px', flex: 1, minHeight: 0, overflowY: 'auto' }}>
                {structuralScopes.map((scope) => renderScopeRow(scope))}

                {/* Add Scope Form / Button */}
                {canDelete && (
                  <div className="addbar">
                    {addingPhase === 'Structural' ? (
                      <div className="flex flex-col gap-2 p-2 bg-[var(--sx-bg-5)] rounded-lg border border-[var(--sx-border-4)]">
                        <input
                          className="pmi"
                          placeholder="Scope of work title"
                          value={newScopeName}
                          onChange={(e) => setNewScopeName(e.target.value)}
                        />
                        <div className="flex gap-2">
                          <input
                            className="pmi flex-1"
                            placeholder="Date text (e.g. Jan 15–20, 2027)"
                            value={newDateText}
                            onChange={(e) => setNewDateText(e.target.value)}
                          />
                          <input
                            className="pmi w-24"
                            type="number"
                            min="1"
                            placeholder="Days"
                            value={newWorkingDays}
                            onChange={(e) => setNewWorkingDays(parseInt(e.target.value, 10) || 1)}
                          />
                        </div>
                        <div className="flex justify-end gap-2">
                          <button type="button" className="pmb sm" onClick={() => setAddingPhase(null)}>
                            Cancel
                          </button>
                          <button type="button" className="pmb sm pri" onClick={() => handleAddSubmit('Structural')}>
                            Save Scope
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="addrow"
                        onClick={() => {
                          setAddingPhase('Structural');
                          setNewScopeName('');
                        }}
                      >
                        + Add scope of work
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Panel 2: Architectural / Finishing Phase */}
            <div className="colpanel" style={{ background: 'var(--sx-bg-14)', border: 'var(--sx-border-19)', borderRadius: '14px', boxShadow: 'var(--sx-shadow-36)', overflow: 'hidden', flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'stretch', height: '52px', flex: 'none', background: 'var(--sx-bg-38)' }}>
                <div style={{ width: '66px', flex: 'none', background: 'var(--sx-bg-12)', clipPath: 'polygon(0 0,100% 0,74% 100%,0 100%)', display: 'flex', alignItems: 'center', paddingLeft: '16px', color: 'var(--sx-text-1)', fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: '30px' }}>
                  2
                </div>
                <div className="chd" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px', paddingLeft: '6px', fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: '25px', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                  <span>ARCHITECTURAL /</span>
                  <span style={{ color: 'var(--sx-text-10)' }}>FINISHING</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', paddingRight: '14px', fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: '30px', color: 'var(--sx-text-3)', letterSpacing: '-4px', fontStyle: 'italic' }}>
                  //
                </div>
              </div>

              <div className="rows" style={{ padding: '12px 16px 14px', flex: 1, minHeight: 0, overflowY: 'auto' }}>
                {finishingScopes.map((scope) => renderScopeRow(scope))}

                {/* Add Scope Form / Button */}
                {canDelete && (
                  <div className="addbar">
                    {addingPhase === 'Finishing' ? (
                      <div className="flex flex-col gap-2 p-2 bg-[var(--sx-bg-5)] rounded-lg border border-[var(--sx-border-4)]">
                        <input
                          className="pmi"
                          placeholder="Scope of work title"
                          value={newScopeName}
                          onChange={(e) => setNewScopeName(e.target.value)}
                        />
                        <div className="flex gap-2">
                          <input
                            className="pmi flex-1"
                            placeholder="Date text (e.g. Feb 1–10, 2027)"
                            value={newDateText}
                            onChange={(e) => setNewDateText(e.target.value)}
                          />
                          <input
                            className="pmi w-24"
                            type="number"
                            min="1"
                            placeholder="Days"
                            value={newWorkingDays}
                            onChange={(e) => setNewWorkingDays(parseInt(e.target.value, 10) || 1)}
                          />
                        </div>
                        <div className="flex justify-end gap-2">
                          <button type="button" className="pmb sm" onClick={() => setAddingPhase(null)}>
                            Cancel
                          </button>
                          <button type="button" className="pmb sm pri" onClick={() => handleAddSubmit('Finishing')}>
                            Save Scope
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="addrow"
                        onClick={() => {
                          setAddingPhase('Finishing');
                          setNewScopeName('');
                        }}
                      >
                        + Add scope of work
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Bottom Notes */}
          <div style={{ background: 'var(--sx-bg-14)', border: 'var(--sx-border-19)', borderRadius: '14px', boxShadow: 'var(--sx-shadow-36)', overflow: 'hidden', flex: 'none' }}>
            <div style={{ padding: '12px 18px', fontSize: '15px', lineHeight: '21px', color: '#E3E8F7' }}>
              {bottomNote}
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
            Source: project schedule. Schedule assumes Monday–Saturday work; Sundays and listed holidays excluded.
          </div>
          <div className="ver" style={{ fontSize: '12px', fontWeight: 600, color: 'var(--sx-text-3)', textAlign: 'center' }}>
            Version {settings.version} · Updated {new Date(settings.updatedAt).toLocaleString()}
          </div>
        </div>
      </div>
    </section>
  );

  function renderScopeRow(scope: ScopeItem) {
    const hits = getOverlappingEpisodes(scope.dateText);
    const hasHits = hits.length > 0;
    const hitColor = hits.some((e) => e.scopeStatus === 'Delayed')
      ? '#E0213B'
      : hits.every((e) => e.scopeStatus === 'Completed')
      ? '#4BE08A'
      : themed('#F5C518');

    const statusLabel =
      scope.percentComplete >= 100
        ? 'Complete'
        : scope.percentComplete > 0
        ? 'In progress'
        : 'Not started';
    const statusColor = STATUS_COLORS[statusLabel] || STATUS_COLORS['Not started'];

    const dotColor = themed(scope.phase === 'Structural' ? '#3A9BFF' : '#FF9A1F');

    return (
      <div
        key={scope.id}
        className={`srow ${scope.isAdded ? 'added' : ''}`}
        onDoubleClick={!canEdit ? onViewerAttemptEdit : undefined}
        style={{
          padding: '6px 0',
          borderBottom: 'var(--sx-border-31)',
          position: 'relative',
          background: hasHits ? `${hitColor}1F` : undefined,
        }}
        title={hasHits ? `Content shooting: ${hits.map((e) => `${e.episodeLabel || `Ep ${e.number}`} ${e.title}`).join(' · ')}` : undefined}
      >
        {scope.isAdded && canDelete && (
          <button
            type="button"
            className="delrow"
            title="Remove this scope"
            onClick={() => onDeleteScope(scope.id)}
          >
            ×
          </button>
        )}

        <div className="rt" style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
          <div
            style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              background: dotColor,
              flex: 'none',
              marginTop: '5px',
              boxShadow: hasHits ? `0 0 0 3px ${hitColor}` : undefined,
            }}
          />
          <div style={{ flex: 1, fontSize: '16px', fontWeight: 600, lineHeight: '20px', color: 'var(--sx-text-3)' }}>
            <CollaborativeCell
              cellId={`scope_${scope.id}_name`}
              value={scope.name}
              fallbackValue={scope.name}
              remoteFocus={remoteFocusMap[`scope_${scope.id}_name`]}
              canEdit={canEditTimeline}
              onViewerAttemptEdit={onViewerAttemptEdit}
              onSave={(val) => {
                if (onUpdateScopeField) onUpdateScopeField(scope.id, 'name', val);
              }}
            />
            {scope.subNote && (
              <div style={{ fontSize: '13px', fontWeight: 400, color: 'var(--sx-text-2)', lineHeight: '17px' }}>
                {scope.subNote}
              </div>
            )}
            {scope.updatedBy && (
              <div style={{ fontSize: '11px', fontStyle: 'italic', color: 'var(--sx-text-2)', opacity: 0.75, marginTop: '2px', fontWeight: 400 }}>
                Last updated by {scope.updatedBy} {scope.updatedAt ? `on ${new Date(scope.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}
              </div>
            )}
          </div>
          <div className="dt" style={{ width: '205px', flex: 'none', textAlign: 'right', fontSize: '16px', fontWeight: 700, lineHeight: '20px' }}>
            <CollaborativeCell
              cellId={`scope_${scope.id}_date`}
              value={scope.dateText}
              fallbackValue={scope.dateText}
              remoteFocus={remoteFocusMap[`scope_${scope.id}_date`]}
              canEdit={canEditTimeline}
              onViewerAttemptEdit={onViewerAttemptEdit}
              onSave={(val) => {
                if (onUpdateScopeField) onUpdateScopeField(scope.id, 'dateText', val);
              }}
            />
          </div>
          <div className="dur" style={{ width: '92px', flex: 'none', textAlign: 'right', fontSize: '12px', color: 'var(--sx-text-2)', lineHeight: '20px' }}>
            <CollaborativeCell
              cellId={`scope_${scope.id}_days`}
              value={`${scope.workingDays}`}
              fallbackValue={`${scope.workingDays}`}
              remoteFocus={remoteFocusMap[`scope_${scope.id}_days`]}
              canEdit={canEditTimeline}
              onViewerAttemptEdit={onViewerAttemptEdit}
              displayRenderer={() => `${scope.workingDays} working day${scope.workingDays > 1 ? 's' : ''}`}
              onSave={(val) => {
                const num = parseInt(String(val).replace(/\D/g, ''), 10);
                if (num && num > 0 && onUpdateScopeWorkingDays) {
                  onUpdateScopeWorkingDays(scope.id, num);
                }
              }}
            />
          </div>
          <div style={{ width: '136px', flex: 'none', textAlign: 'right', lineHeight: '20px' }}>
            <span
              className="cell"
              style={{
                position: 'relative',
                outline: remoteFocusMap[`scope_${scope.id}_pct`] ? `2px solid ${remoteFocusMap[`scope_${scope.id}_pct`].userColor}` : undefined,
                outlineOffset: '2px',
                borderRadius: '6px',
              }}
            >
              {remoteFocusMap[`scope_${scope.id}_pct`] && (
                <span
                  className="absolute -top-3.5 right-0 z-20 px-1 py-0.2 text-[9px] font-bold rounded shadow pointer-events-none whitespace-nowrap"
                  style={{ background: remoteFocusMap[`scope_${scope.id}_pct`].userColor, color: 'var(--sx-text-1)' }}
                >
                  {remoteFocusMap[`scope_${scope.id}_pct`].userName}
                </span>
              )}
              {canEdit ? (
                <input
                  className="pct"
                  type="number"
                  min="0"
                  max="100"
                  step="5"
                  value={scope.percentComplete}
                  onFocus={() => realtime.focusCell(`scope_${scope.id}_pct`)}
                  onBlur={() => realtime.blurCell(`scope_${scope.id}_pct`)}
                  onChange={(e) => onUpdateProgress(scope.id, parseFloat(e.target.value) || 0)}
                  aria-label="Percent complete"
                />
              ) : (
                <span className="font-mono text-sm font-bold text-[var(--sx-ink)] mr-1.5">{scope.percentComplete}%</span>
              )}
              <span className="chip" style={{ background: statusColor[0], color: statusColor[1] }}>
                {statusLabel}
              </span>
            </span>
          </div>
        </div>

        {/* Sub-bar */}
        <div style={{ position: 'relative', height: '5px', borderRadius: '3px', background: 'var(--sx-bg-40)', margin: '6px 0 0 22px' }}>
          {/* Stoppage overlap for December scopes */}
          {scope.phase === 'Structural' && (
            <div style={{ position: 'absolute', left: '70.37%', width: '13.89%', top: 0, bottom: 0, background: 'var(--ov-stop-strong)' }} />
          )}
          <div
            style={{
              position: 'absolute',
              left: `${scope.leftPct || 0}%`,
              width: `${scope.widthPct || 10}%`,
              top: 0,
              bottom: 0,
              borderRadius: '3px',
              background: dotColor,
              overflow: 'hidden',
            }}
          >
            <div
              className="pf"
              style={{
                height: '100%',
                width: `${scope.percentComplete}%`,
                background: 'var(--sx-bg-41)',
              }}
            />
          </div>
        </div>

        {/* Content Shoot Highlight Badge */}
        {hasHits && (
          <span
            className="cchl"
            style={{
              background: hitColor,
              color: hitColor === '#E0213B' ? '#FFFFFF' : '#060A24',
            }}
          >
            EP {hits.slice(0, 3).map((e) => e.episodeLabel || e.number).join(', ')}
            {hits.length > 3 ? ` +${hits.length - 3}` : ''}
          </span>
        )}
      </div>
    );
  }
};
