/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { ScopeItem, Episode, SystemSettings, RemoteFocus } from '../types/index.ts';
import { LOGO_SVG, STATUS_COLORS } from '../constants/assets.ts';
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
  onUpdateProgress: (id: string, percent: number) => void;
  onUpdateScopeField?: (id: string, field: 'name' | 'dateText', value: string) => void;
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
  onUpdateProgress,
  onUpdateScopeField,
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
      color: phase === 'Structural' ? '#3A9BFF' : '#FF9A1F',
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
              Scope of work timeline
            </div>
            <div className="h1a" style={{ fontFamily: "'Anton','Barlow Condensed',sans-serif", fontSize: '70px', lineHeight: 1.05, color: '#F5C518', textTransform: 'uppercase', textShadow: '0 4px 0 #7a5a00,0 0 30px rgba(245,197,24,.35)' }}>
              {floorTitle}
            </div>
            <div style={{ fontSize: '16px', letterSpacing: '8px', textTransform: 'uppercase', marginTop: '4px' }}>
              Convengers Bahay Build
            </div>
          </div>

          {/* Right Top Floor Progress */}
          <div className="rb" style={{ width: '540px', flex: 'none', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ background: '#0A1140', border: '2px solid #7B4DFF', borderRadius: '14px', boxShadow: '0 0 16px rgba(123,77,255,.55),inset 0 0 26px rgba(40,30,130,.45)', overflow: 'hidden' }}>
              <div style={{ padding: '8px 14px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: '17px', letterSpacing: '1.5px', color: '#F5C518' }}>
                    FLOOR PROGRESS
                  </span>
                  <span style={{ fontFamily: "'Anton',sans-serif", fontSize: '26px', lineHeight: 1, color: '#F5C518' }}>
                    {floorProgress}%
                  </span>
                </div>
                <div style={{ height: '10px', borderRadius: '5px', background: 'rgba(255,255,255,.14)', position: 'relative' }}>
                  <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${Math.max(floorProgress, 2)}%`, borderRadius: '5px', background: 'linear-gradient(90deg,#F5C518,#FF9A1F)' }} />
                </div>
                <div style={{ fontSize: '12px', color: '#BAC4E2', whiteSpace: 'nowrap' }}>
                  Scope % complete, weighted by working days
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
              {floorName}
            </span>
            <span style={{ fontFamily: "'Anton',sans-serif", fontSize: '22px', color: '#F5C518' }}>
              {slideNumber}
            </span>
            <span style={{ fontSize: '15px', color: '#BAC4E2' }}>
              / 12
            </span>
          </div>
        </div>

        {/* 2-Column Panels */}
        <div className="bodyw" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="cols2" style={{ display: 'flex', gap: '24px', flex: 1, minHeight: 0, alignItems: 'stretch' }}>
            {/* Panel 1: Structural Phase */}
            <div className="colpanel" style={{ background: '#0A1140', border: '2px solid #7B4DFF', borderRadius: '14px', boxShadow: '0 0 16px rgba(123,77,255,.55),inset 0 0 26px rgba(40,30,130,.45)', overflow: 'hidden', flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'stretch', height: '52px', flex: 'none', background: 'linear-gradient(90deg,#2A1D9C,#0C1448 75%)' }}>
                <div style={{ width: '66px', flex: 'none', background: '#F5C518', clipPath: 'polygon(0 0,100% 0,74% 100%,0 100%)', display: 'flex', alignItems: 'center', paddingLeft: '16px', color: '#060A24', fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: '30px' }}>
                  1
                </div>
                <div className="chd" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px', paddingLeft: '6px', fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: '25px', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                  <span>STRUCTURAL</span>
                  <span style={{ color: '#F5C518' }}>PHASE</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', paddingRight: '14px', fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: '30px', color: '#F5C518', letterSpacing: '-4px', fontStyle: 'italic' }}>
                  //
                </div>
              </div>

              <div className="rows" style={{ padding: '12px 16px 14px', flex: 1, minHeight: 0, overflowY: 'auto' }}>
                {structuralScopes.map((scope) => renderScopeRow(scope))}

                {/* Add Scope Form / Button */}
                {canEdit && (
                  <div className="addbar">
                    {addingPhase === 'Structural' ? (
                      <div className="flex flex-col gap-2 p-2 bg-[#060A24] rounded-lg border border-[#F5C518]">
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
            <div className="colpanel" style={{ background: '#0A1140', border: '2px solid #7B4DFF', borderRadius: '14px', boxShadow: '0 0 16px rgba(123,77,255,.55),inset 0 0 26px rgba(40,30,130,.45)', overflow: 'hidden', flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'stretch', height: '52px', flex: 'none', background: 'linear-gradient(90deg,#2A1D9C,#0C1448 75%)' }}>
                <div style={{ width: '66px', flex: 'none', background: '#F5C518', clipPath: 'polygon(0 0,100% 0,74% 100%,0 100%)', display: 'flex', alignItems: 'center', paddingLeft: '16px', color: '#060A24', fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: '30px' }}>
                  2
                </div>
                <div className="chd" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px', paddingLeft: '6px', fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: '25px', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                  <span>ARCHITECTURAL /</span>
                  <span style={{ color: '#FF9A1F' }}>FINISHING</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', paddingRight: '14px', fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: '30px', color: '#F5C518', letterSpacing: '-4px', fontStyle: 'italic' }}>
                  //
                </div>
              </div>

              <div className="rows" style={{ padding: '12px 16px 14px', flex: 1, minHeight: 0, overflowY: 'auto' }}>
                {finishingScopes.map((scope) => renderScopeRow(scope))}

                {/* Add Scope Form / Button */}
                {canEdit && (
                  <div className="addbar">
                    {addingPhase === 'Finishing' ? (
                      <div className="flex flex-col gap-2 p-2 bg-[#060A24] rounded-lg border border-[#F5C518]">
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
          <div style={{ background: '#0A1140', border: '2px solid #7B4DFF', borderRadius: '14px', boxShadow: '0 0 16px rgba(123,77,255,.55),inset 0 0 26px rgba(40,30,130,.45)', overflow: 'hidden', flex: 'none' }}>
            <div style={{ padding: '12px 18px', fontSize: '15px', lineHeight: '21px', color: '#E3E8F7' }}>
              {bottomNote}
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
            Source: project schedule. Schedule assumes Monday–Saturday work; Sundays and listed holidays excluded.
          </div>
          <div className="ver" style={{ fontSize: '12px', fontWeight: 600, color: '#F5C518', textAlign: 'center' }}>
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
      : '#F5C518';

    const statusLabel =
      scope.percentComplete >= 100
        ? 'Complete'
        : scope.percentComplete > 0
        ? 'In progress'
        : 'Not started';
    const statusColor = STATUS_COLORS[statusLabel] || STATUS_COLORS['Not started'];

    const dotColor = scope.phase === 'Structural' ? '#3A9BFF' : '#FF9A1F';

    return (
      <div
        key={scope.id}
        className={`srow ${scope.isAdded ? 'added' : ''}`}
        style={{
          padding: '6px 0',
          borderBottom: '1px solid rgba(123,77,255,.38)',
          position: 'relative',
          background: hasHits ? `${hitColor}1F` : undefined,
        }}
        title={hasHits ? `Content shooting: ${hits.map((e) => `Ep ${e.number} ${e.title}`).join(' · ')}` : undefined}
      >
        {scope.isAdded && canEdit && (
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
          <div style={{ flex: 1, fontSize: '16px', fontWeight: 600, lineHeight: '20px', color: '#F5C518' }}>
            <CollaborativeCell
              cellId={`scope_${scope.id}_name`}
              value={scope.name}
              fallbackValue={scope.name}
              remoteFocus={remoteFocusMap[`scope_${scope.id}_name`]}
              canEdit={canEdit}
              onViewerAttemptEdit={onViewerAttemptEdit}
              onSave={(val) => {
                if (onUpdateScopeField) onUpdateScopeField(scope.id, 'name', val);
              }}
            />
            {scope.subNote && (
              <div style={{ fontSize: '13px', fontWeight: 400, color: '#BAC4E2', lineHeight: '17px' }}>
                {scope.subNote}
              </div>
            )}
            {scope.updatedBy && (
              <div style={{ fontSize: '11px', fontStyle: 'italic', color: '#BAC4E2', opacity: 0.75, marginTop: '2px', fontWeight: 400 }}>
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
              canEdit={canEdit}
              onViewerAttemptEdit={onViewerAttemptEdit}
              onSave={(val) => {
                if (onUpdateScopeField) onUpdateScopeField(scope.id, 'dateText', val);
              }}
            />
          </div>
          <div className="dur" style={{ width: '92px', flex: 'none', textAlign: 'right', fontSize: '12px', color: '#BAC4E2', lineHeight: '20px' }}>
            {scope.workingDays} working day{scope.workingDays > 1 ? 's' : ''}
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
                  style={{ background: remoteFocusMap[`scope_${scope.id}_pct`].userColor, color: '#060A24' }}
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
                <span className="font-mono text-sm font-bold text-white mr-1.5">{scope.percentComplete}%</span>
              )}
              <span className="chip" style={{ background: statusColor[0], color: statusColor[1] }}>
                {statusLabel}
              </span>
            </span>
          </div>
        </div>

        {/* Sub-bar */}
        <div style={{ position: 'relative', height: '5px', borderRadius: '3px', background: 'rgba(255,255,255,.09)', margin: '6px 0 0 22px' }}>
          {/* Stoppage overlap for December scopes */}
          {scope.phase === 'Structural' && (
            <div style={{ position: 'absolute', left: '70.37%', width: '13.89%', top: 0, bottom: 0, background: 'rgba(224,33,59,.6)' }} />
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
                background: 'rgba(255,255,255,.72)',
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
            EP {hits.slice(0, 3).map((e) => e.number).join(', ')}
            {hits.length > 3 ? ` +${hits.length - 3}` : ''}
          </span>
        )}
      </div>
    );
  }
};
