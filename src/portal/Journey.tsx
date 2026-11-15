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

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Clock3, AlertTriangle, CircleDot, ChevronLeft, ChevronRight, Camera, Layers, X, Maximize2 } from 'lucide-react';
import { IsoHouse } from './IsoHouse.tsx';
import type { PortalJourney, PortalJourneyStage, ClientStatus, PortalRecord } from '../domain/portal.ts';
import { builtinArt, currentStageIndex, sheetTile } from '../domain/journey.ts';
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
export const StageArt: React.FC<{
  stage: Pick<PortalJourneyStage, 'index' | 'name' | 'imageUrl' | 'sheetIndex'> & Partial<Pick<PortalJourneyStage, 'id' | 'rule'>>;
  journey: Pick<PortalJourney, 'sheetUrl' | 'sheetCols' | 'sheetRows'>;
  /** Number of stages shown (decides whether the sheet has a picture for every stage). */
  stageCount: number;
}> = ({ stage, journey, stageCount }) => {
  const cols = journey.sheetCols || 3;
  const rows = journey.sheetRows || 3;
  const ratio = useImageAspect(!stage.imageUrl ? journey.sheetUrl : undefined, cols, rows);
  if (stage.imageUrl) return <img className="jr-img" src={stage.imageUrl} alt={`${stage.name} — reference illustration`} loading="lazy" decoding="async" />;
  // An uploaded sheet with a picture for every stage → that picture; otherwise the built-in twelve-stage illustration
  const fullSheet = !!journey.sheetUrl && cols * rows >= stageCount;
  const builtin = fullSheet ? undefined : builtinArt(stage, stageCount);
  if (builtin) return <img className="jr-img" src={builtin} alt={`${stage.name} — reference illustration`} loading="lazy" decoding="async" />;
  const tile = journey.sheetUrl ? sheetTile(stage, stageCount, cols, rows) : null;
  if (journey.sheetUrl && tile !== null) {
    const col = tile % cols;
    const row = Math.floor(tile / cols);
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
      <IsoHouse stage={(sheetTile(stage, stageCount, 3, 3) ?? stage.index) + 1} title={`${stage.name} — placeholder reference illustration`} />
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

/** Client-facing stage classes: COMPLETED · ONGOING · UPCOMING (a stage behind schedule is ongoing, with a note). */
type CardTone = { cls: 'done' | 'now' | 'next'; label: 'Completed' | 'Ongoing' | 'Upcoming'; Icon: typeof CheckCircle2 };
export function cardStatus(status: ClientStatus): CardTone {
  if (status === 'Completed') return { cls: 'done', label: 'Completed', Icon: CheckCircle2 };
  if (status === 'In Progress' || status === 'Schedule Update Required') return { cls: 'now', label: 'Ongoing', Icon: CircleDot };
  return { cls: 'next', label: 'Upcoming', Icon: Clock3 };
}

const CardStatus: React.FC<{ status: ClientStatus }> = ({ status }) => {
  const t = cardStatus(status);
  return (
    <span className={`jr-chip ${t.cls}`}>
      <t.Icon size={12} aria-hidden /> {t.label}
    </span>
  );
};

/** Stage progress for a card: a bar when progress is recorded, "Pending" otherwise (never an invented figure). */
const CardProgress: React.FC<{ s: PortalJourneyStage }> = ({ s }) => {
  if (s.progress === null || s.progress === undefined || (s.status === 'Upcoming' && !s.progress))
    return <span className="jr-card-pending">{s.status === 'Upcoming' ? 'Pending' : 'Pending update'}</span>;
  const v = Math.max(0, Math.min(100, s.progress));
  return (
    <span className="jr-card-prog" aria-label={`Progress ${v.toFixed(1)}%`}>
      <span className="jr-card-bar">
        <i style={{ width: `${Math.max(2, v)}%` }} />
      </span>
      <b>{v.toFixed(0)}%</b>
    </span>
  );
};

/** Plays the subtle illustration motion only while a card is on screen (Intersection Observer). */
function useInViewClass(): (el: HTMLElement | null) => void {
  const io = useRef<IntersectionObserver | null>(null);
  useEffect(() => () => io.current?.disconnect(), []);
  return useCallback((el: HTMLElement | null) => {
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      el.classList.add('seen', 'inview');
      return;
    }
    if (!io.current)
      io.current = new IntersectionObserver(
        (entries) =>
          entries.forEach((e) => {
            e.target.classList.toggle('inview', e.isIntersecting);
            if (e.isIntersecting) e.target.classList.add('seen');
          }),
        { rootMargin: '40px 0px', threshold: 0.15 },
      );
    io.current.observe(el);
  }, []);
}

const saveData = () => {
  try {
    return !!(navigator as any).connection?.saveData;
  } catch {
    return false;
  }
};

export const JourneyViewer: React.FC<JourneyViewerProps> = ({ journey, photos = [], asOf, placeholderNote = true }) => {
  const stages = journey.stages;
  const current = useMemo(() => currentStageIndex(stages), [stages]);
  const [open, setOpen] = useState<number | null>(null);
  const observe = useInViewClass();
  const staticArt = useMemo(saveData, []);
  if (!stages.length) return <div className="pt-empty">The construction journey has not been published yet.</div>;
  const done = stages.filter((s) => s.status === 'Completed').length;

  return (
    <section className={`jr ${staticArt ? 'jr-static' : ''}`} aria-labelledby="jr-title">
      <header className="jr-head">
        <div className="jr-kicker">Bahay Build · Construction Journey</div>
        <h1 className="jr-title" id="jr-title">
          Construction Journey
        </h1>
        <p className="jr-sub">Watch your home take shape, one construction stage at a time.</p>
        <div className="jr-meta">
          <span>
            <b>{done}</b> of {stages.length} stages completed
          </span>
          {asOf && <span>· {asOf}</span>}
          <span className="jr-legend" aria-hidden>
            <i className="done" /> Completed <i className="now" /> Ongoing <i className="next" /> Upcoming
          </span>
        </div>
      </header>

      <ol className="jr-grid">
        {stages.map((s, i) => {
          const tone = cardStatus(s.status);
          const isCur = i === current && s.status !== 'Completed';
          return (
            <li key={s.id} ref={observe} className={`jr-card ${tone.cls} ${isCur ? 'cur' : ''}`} style={{ ['--i' as string]: i } as React.CSSProperties}>
              <button type="button" className="jr-card-btn" onClick={() => setOpen(i)} aria-label={`Stage ${i + 1}: ${s.name}, ${tone.label}. Open larger view`}>
                <span className="jr-art">
                  <StageArt stage={s} journey={journey} stageCount={stages.length} />
                  <span className="jr-zoom" aria-hidden>
                    <Maximize2 size={14} />
                  </span>
                </span>
                <span className="jr-card-body">
                  <span className="jr-card-top">
                    <span className="jr-num">{String(i + 1).padStart(2, '0')}</span>
                    {isCur && <span className="jr-curtag">Current stage</span>}
                  </span>
                  <span className="jr-name">{s.name}</span>
                  <span className="jr-card-foot">
                    <CardStatus status={s.status} />
                    <CardProgress s={s} />
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      {placeholderNote && <p className="jr-note">Illustrations are visual references of the construction sequence, not photographs of your home.</p>}

      {open !== null && <StageLightbox journey={journey} photos={photos} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />}
    </section>
  );
};

/** Larger view of one stage: illustration, status, progress, dates and approved notes; previous / next navigation. */
const StageLightbox: React.FC<{ journey: PortalJourney; photos: PortalRecord[]; index: number; onIndex: (i: number) => void; onClose: () => void }> = ({
  journey,
  photos,
  index,
  onIndex,
  onClose,
}) => {
  const stages = journey.stages;
  const st = stages[Math.min(index, stages.length - 1)];
  const [compare, setCompare] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const prev = () => index > 0 && onIndex(index - 1);
  const next = () => index < stages.length - 1 && onIndex(index + 1);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
      before?.focus?.();
    };
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  const tone = cardStatus(st.status);
  const stagePhotos = photos
    .filter(
      (p) =>
        p.content?.stageId === st.id ||
        (!p.content?.stageId && st.start && st.finish && p.content?.date >= st.start && p.content?.date <= (st.actualFinish || st.finish)),
    )
    .slice(0, 6);
  return (
    <div className="jr-lb" role="dialog" aria-modal="true" aria-labelledby="jr-lb-title" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="jr-lb-panel">
        <div className="jr-lb-top">
          <button type="button" className="jr-nav" onClick={prev} disabled={index === 0} aria-label="Previous stage">
            <ChevronLeft size={18} />
          </button>
          <div className="jr-lb-t">
            <span>
              Stage {String(index + 1).padStart(2, '0')} of {stages.length}
            </span>
            <b id="jr-lb-title">{st.name}</b>
          </div>
          <button type="button" className="jr-nav" onClick={next} disabled={index === stages.length - 1} aria-label="Next stage">
            <ChevronRight size={18} />
          </button>
          <button type="button" className="jr-lb-close" ref={closeRef} onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="jr-lb-body" key={st.id}>
          <div className="jr-lb-art">
            <div className={`jr-compare ${compare ? 'on' : ''}`}>
              <figure className={`jr-figure ${tone.cls}`}>
                <StageArt stage={st} journey={journey} stageCount={stages.length} />
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
          </div>
          <div className="jr-info">
            <div className="cv-row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <CardStatus status={st.status} />
              {st.status === 'Schedule Update Required' && (
                <span className="jr-chip late">
                  <AlertTriangle size={12} aria-hidden /> Schedule update required
                </span>
              )}
            </div>
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
                <summary>Work in this stage ({st.activities.length})</summary>
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
              <div className="jr-small">Progress for this stage will appear once the related work is scheduled.</div>
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
    </div>
  );
};
