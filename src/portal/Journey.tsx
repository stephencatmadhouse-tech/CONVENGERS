/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * BAHAY BUILD | CONSTRUCTION JOURNEY 3D — stage viewer.
 * Shared by the client portal (published stages) and the internal
 * "3D Construction Journey Management" preview (live stages). The viewer
 * never computes or stores progress; it only presents the stage figures it
 * is given (calculated from the Master Project Tracker).
 *
 * Future expansion: `StageArt` is the single place that renders a stage
 * visual, so a rotatable 3D model can replace it later without touching
 * the data flow.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock3, AlertTriangle, CircleDot, ChevronLeft, ChevronRight, Camera, Layers } from 'lucide-react';
import { IsoHouse } from './IsoHouse.tsx';
import type { PortalJourney, PortalJourneyStage, ClientStatus, PortalRecord } from '../domain/portal.ts';
import { currentStageIndex } from '../domain/journey.ts';
import { fmtDate } from '../domain/dates.ts';
import './journey.css';

export const STATUS_TONE: Record<ClientStatus, { cls: string; label: string; Icon: typeof CheckCircle2 }> = {
  Completed: { cls: 'done', label: 'Completed', Icon: CheckCircle2 },
  'In Progress': { cls: 'now', label: 'In Progress', Icon: CircleDot },
  Upcoming: { cls: 'next', label: 'Upcoming', Icon: Clock3 },
  'Schedule Update Required': { cls: 'late', label: 'Schedule Update Required', Icon: AlertTriangle },
};

function useImageAspect(url?: string, cols = 3, rows = 3): number | null {
  const [ratio, setRatio] = useState<number | null>(null);
  useEffect(() => {
    if (!url) return setRatio(null);
    const img = new Image();
    img.onload = () => setRatio(img.naturalWidth / cols / (img.naturalHeight / rows));
    img.onerror = () => setRatio(null);
    img.src = url;
  }, [url, cols, rows]);
  return ratio;
}

/** One stage visual: own image → tile of the stage sheet → placeholder drawing. */
export const StageArt: React.FC<{ stage: Pick<PortalJourneyStage, 'index' | 'name' | 'imageUrl'>; journey: Pick<PortalJourney, 'sheetUrl' | 'sheetCols' | 'sheetRows'> }> = ({ stage, journey }) => {
  const cols = journey.sheetCols || 3;
  const rows = journey.sheetRows || 3;
  const ratio = useImageAspect(!stage.imageUrl ? journey.sheetUrl : undefined, cols, rows);
  if (stage.imageUrl) return <img className="jr-img" src={stage.imageUrl} alt={`${stage.name} — reference illustration`} loading="lazy" />;
  if (journey.sheetUrl && stage.index < cols * rows) {
    const col = stage.index % cols;
    const row = Math.floor(stage.index / cols);
    return (
      <div
        className="jr-tile"
        role="img"
        aria-label={`${stage.name} — reference illustration`}
        style={{
          backgroundImage: `url("${journey.sheetUrl}")`,
          backgroundSize: `${cols * 100}% ${rows * 100}%`,
          backgroundPosition: `${cols > 1 ? (col / (cols - 1)) * 100 : 0}% ${rows > 1 ? (row / (rows - 1)) * 100 : 0}%`,
          aspectRatio: ratio ? String(ratio) : '4 / 3',
        }}
      />
    );
  }
  return (
    <div className="jr-svg">
      <IsoHouse stage={stage.index + 1} title={`${stage.name} — placeholder reference illustration`} />
    </div>
  );
};

const pctTxt = (n: number | null | undefined) => (n === null || n === undefined ? 'Pending update' : `${n.toFixed(1)}%`);

export const StatusBadge: React.FC<{ status: ClientStatus }> = ({ status }) => {
  const t = STATUS_TONE[status] || STATUS_TONE.Upcoming;
  return (
    <span className={`jr-badge ${t.cls}`}>
      <t.Icon size={13} aria-hidden /> {t.label}
    </span>
  );
};

export interface JourneyViewerProps {
  journey: PortalJourney;
  photos?: PortalRecord[];
  /** Label shown above the illustrations, e.g. "Status as of …". */
  asOf?: string;
  placeholderNote?: boolean;
}

export const JourneyViewer: React.FC<JourneyViewerProps> = ({ journey, photos = [], asOf, placeholderNote = true }) => {
  const stages = journey.stages;
  const current = useMemo(() => currentStageIndex(stages), [stages]);
  const [sel, setSel] = useState(current);
  const [compare, setCompare] = useState(false);
  useEffect(() => setSel(current), [current]);
  if (!stages.length) return <div className="pt-empty">The construction journey has not been published yet.</div>;
  const st = stages[Math.min(sel, stages.length - 1)];
  const usesPlaceholder = !journey.sheetUrl && stages.some((s) => !s.imageUrl);
  const stagePhotos = photos
    .filter((p) => p.content?.stageId === st.id || (!p.content?.stageId && st.start && st.finish && p.content?.date >= st.start && p.content?.date <= (st.actualFinish || st.finish)))
    .slice(0, 6);
  const done = stages.filter((s) => s.status === 'Completed').length;

  return (
    <div className="jr">
      <div className="jr-head">
        <div>
          <div className="jr-kicker">Bahay Build | Construction Journey 3D</div>
          <h1 className="jr-title">Watch your home take shape, one construction stage at a time.</h1>
          <div className="jr-meta">
            {done} of {stages.length} stages completed{asOf ? ` · ${asOf}` : ''}
          </div>
        </div>
      </div>

      {/* Stage strip */}
      <div className="jr-strip" role="tablist" aria-label="Construction stages">
        {stages.map((s, i) => {
          const tone = STATUS_TONE[s.status] || STATUS_TONE.Upcoming;
          return (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={i === sel}
              className={`jr-step ${tone.cls} ${i === sel ? 'sel' : ''} ${i === current ? 'cur' : ''}`}
              onClick={() => setSel(i)}
            >
              <span className="jr-step-art">
                <StageArt stage={s} journey={journey} />
              </span>
              <span className="jr-step-num">{String(i + 1).padStart(2, '0')}</span>
              <span className="jr-step-name">{s.name}</span>
              <span className={`jr-step-dot ${tone.cls}`} aria-label={tone.label} />
              {s.status === 'In Progress' && s.progress !== null && (
                <span className="jr-step-bar">
                  <i style={{ width: `${Math.max(3, s.progress)}%` }} />
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Selected stage */}
      <div className="jr-detail">
        <div className="jr-stage">
          <div className="jr-stage-top">
            <button type="button" className="jr-nav" onClick={() => setSel(Math.max(0, sel - 1))} disabled={sel === 0} aria-label="Previous stage">
              <ChevronLeft size={18} />
            </button>
            <div className="jr-stage-t">
              <span>Stage {String(sel + 1).padStart(2, '0')}</span>
              <b>{st.name}</b>
            </div>
            <button type="button" className="jr-nav" onClick={() => setSel(Math.min(stages.length - 1, sel + 1))} disabled={sel === stages.length - 1} aria-label="Next stage">
              <ChevronRight size={18} />
            </button>
          </div>
          <div className={`jr-compare ${compare ? 'on' : ''}`}>
            <figure className={`jr-figure ${st.status === 'Upcoming' ? 'muted' : ''} ${st.status === 'In Progress' ? 'live' : ''}`}>
              <StageArt stage={st} journey={journey} />
              <figcaption>
                <Layers size={13} aria-hidden /> 3D construction reference
              </figcaption>
            </figure>
            {compare && (
              <figure className="jr-figure actual">
                {stagePhotos.length ? (
                  <img src={stagePhotos[0].content.url} alt={stagePhotos[0].title} />
                ) : (
                  <div className="jr-nophoto">
                    <Camera size={22} aria-hidden />
                    No approved site photographs for this stage yet.
                  </div>
                )}
                <figcaption>
                  <Camera size={13} aria-hidden /> Actual site progress{stagePhotos[0]?.content?.date ? ` · ${fmtDate(stagePhotos[0].content.date)}` : ''}
                </figcaption>
              </figure>
            )}
          </div>
          <label className="jr-toggle">
            <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} /> Compare with actual site photographs
          </label>
          {usesPlaceholder && placeholderNote && <div className="jr-note">Illustrations are visual references, not photographs of your home.</div>}
        </div>

        <div className="jr-info">
          <StatusBadge status={st.status} />
          <p className="jr-desc">{st.description}</p>
          <div className="jr-prog">
            <div className="jr-prog-h">
              <span>Actual progress</span>
              <b>{pctTxt(st.progress)}</b>
            </div>
            <div className="jr-bar" aria-hidden>
              <i style={{ width: `${Math.max(0, Math.min(100, st.progress || 0))}%` }} />
              {st.planned !== null && <em style={{ left: `${Math.max(0, Math.min(100, st.planned))}%` }} />}
            </div>
            {st.planned !== null && <div className="jr-small">Planned for this date: {st.planned.toFixed(1)}%</div>}
          </div>
          <dl className="jr-dl">
            <dt>Target start</dt>
            <dd>{st.start ? fmtDate(st.start) : 'Pending update'}</dd>
            <dt>Target completion</dt>
            <dd>{st.finish ? fmtDate(st.finish) : 'Pending update'}</dd>
            <dt>Actual completion</dt>
            <dd>{st.actualFinish ? fmtDate(st.actualFinish) : st.status === 'Completed' ? 'Pending update' : 'Not yet completed'}</dd>
          </dl>
          {st.remark && (
            <div className="jr-remark">
              <b>Project team note</b>
              <p>{st.remark}</p>
            </div>
          )}
          {st.activities.length > 0 ? (
            <details className="jr-acts">
              <summary>Activities in this stage ({st.activities.length})</summary>
              <ul>
                {st.activities.map((a, i) => (
                  <li key={a.name + i}>
                    <span>{a.name}</span>
                    <StatusBadge status={a.status} />
                  </li>
                ))}
              </ul>
            </details>
          ) : (
            <div className="jr-small">No activities are linked to this stage yet.</div>
          )}
          {stagePhotos.length > 1 && (
            <div className="jr-photos">
              {stagePhotos.slice(0, 4).map((p) => (
                <img key={p.id} src={p.content.url} alt={p.title} loading="lazy" />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
