/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Client Command Center (2.0) — homeowner-friendly views of PUBLISHED data only:
 * Project Overview, Construction Progress, Project Timeline, Updates &
 * Announcements, Documents & Reports. Every figure comes from the latest
 * published project status (`snapshot`), which is calculated by the same
 * functions as the internal Command Center at the time of publication.
 */

import React, { useMemo, useState } from 'react';
import {
  Home,
  MapPin,
  CalendarDays,
  Flag,
  CalendarClock,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  Hammer,
  ArrowRight,
  Megaphone,
  ClipboardCheck,
  CalendarRange,
  FileText,
  Download,
  Lock,
  ChevronDown,
  Sparkles,
} from 'lucide-react';
import './client.css';
import type { PortalSnapshot, PortalRecord, PortalReport, ClientStatus, PortalActivity } from '../domain/portal.ts';
import { NOT_PROVIDED } from '../domain/portal.ts';
import { diffDays, fmtDate, fmtRange } from '../domain/dates.ts';
import { Empty, Bar } from './portalUi.tsx';
import { StageArt, StatusBadge } from './Journey.tsx';
import { currentStageIndex } from '../domain/journey.ts';

export interface ClientCtx {
  snap?: PortalSnapshot;
  snapRec?: PortalRecord;
  reports: PortalRecord[];
  photos: PortalRecord[];
  documents: PortalRecord[];
  considerations: PortalRecord[];
  updates: PortalRecord[];
  go: (t: string, p?: string) => void;
  param?: string;
  full: boolean;
  onLogin: () => void;
}

const PENDING = 'Pending update';
const pctTxt = (n: number | null | undefined) => (n === null || n === undefined ? PENDING : `${n.toFixed(1)}%`);

export const NoSnapshot = () => (
  <Empty>The project team has not yet published a project status update. Your home's progress will appear here once it has been reviewed and approved.</Empty>
);

/** Plain-language schedule status for homeowners. */
export function scheduleStatus(status: string): { label: string; tone: 'ok' | 'warn' | 'bad'; Icon: typeof CheckCircle2 } {
  if (status === 'On Track') return { label: 'On schedule', tone: 'ok', Icon: CheckCircle2 };
  if (status === 'At Risk') return { label: 'Slightly behind schedule', tone: 'warn', Icon: AlertTriangle };
  return { label: 'Behind schedule — recovery in progress', tone: 'bad', Icon: AlertTriangle };
}

const forecastOf = (s: PortalSnapshot) => s.forecastCompletion || s.projectedCompletion;

const Ring: React.FC<{ value: number; planned?: number }> = ({ value, planned }) => {
  const r = 54;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value));
  return (
    <svg viewBox="0 0 140 140" className="cx-ring" role="img" aria-label={`${v.toFixed(1)}% of construction completed`}>
      <circle cx="70" cy="70" r={r} fill="none" stroke="#eceef4" strokeWidth="14" />
      <circle cx="70" cy="70" r={r} fill="none" stroke="#7026c8" strokeWidth="14" strokeLinecap="round" strokeDasharray={`${(v / 100) * c} ${c}`} transform="rotate(-90 70 70)" />
      {planned !== undefined && (
        <line
          x1={70 + (r - 11) * Math.sin((planned / 100) * 2 * Math.PI)}
          y1={70 - (r - 11) * Math.cos((planned / 100) * 2 * Math.PI)}
          x2={70 + (r + 11) * Math.sin((planned / 100) * 2 * Math.PI)}
          y2={70 - (r + 11) * Math.cos((planned / 100) * 2 * Math.PI)}
          stroke="#1e1b4b"
          strokeWidth="3"
        />
      )}
      <text x="70" y="70" textAnchor="middle" className="cx-ring-v">
        {v.toFixed(1)}%
      </text>
      <text x="70" y="90" textAnchor="middle" className="cx-ring-l">
        completed
      </text>
    </svg>
  );
};

const MiniList: React.FC<{ items: PortalActivity[] | { name: string; finish?: string; start?: string; status: string }[]; empty: string; mode: 'now' | 'done' | 'next' }> = ({ items, empty, mode }) =>
  items.length ? (
    <ul className="cx-mini">
      {items.map((a, i) => (
        <li key={a.name + i}>
          <span className="cx-mini-t">{a.name}</span>
          <span className="cx-mini-s">
            {mode === 'done' ? `Completed ${fmtDate((a as any).actualFinish || a.finish)}` : mode === 'now' ? `Target ${fmtDate(a.finish)}` : `Starts ${fmtDate(a.start)}`}
          </span>
        </li>
      ))}
    </ul>
  ) : (
    <div className="cx-muted">{empty}</div>
  );

// ======================= A. PROJECT OVERVIEW =======================
export const ClientOverview: React.FC<ClientCtx> = ({ snap, snapRec, updates, considerations, go }) => {
  if (!snap) return <NoSnapshot />;
  const st = scheduleStatus(snap.status);
  const forecast = forecastOf(snap);
  const lateBy = forecast && snap.targetCompletion ? diffDays(snap.targetCompletion, forecast) : 0;
  const acts = snap.activities || [];
  const now = (acts.length ? acts.filter((a) => a.status === 'In Progress' || a.status === 'Schedule Update Required') : snap.ongoing).slice(0, 4);
  const done = (acts.length
    ? acts.filter((a) => a.status === 'Completed').sort((a, b) => (b.actualFinish || b.finish || '').localeCompare(a.actualFinish || a.finish || ''))
    : snap.completed
  ).slice(0, 4);
  const next = (acts.length ? acts.filter((a) => a.status === 'Upcoming' && a.start && a.start >= snap.asOf).sort((a, b) => (a.start || '').localeCompare(b.start || '')) : snap.upcoming).slice(0, 4);
  const stages = snap.journey?.stages || [];
  const cur = stages.length ? stages[currentStageIndex(stages)] : undefined;
  const latestNews = [...considerations.filter((c) => /client action|announcement/i.test(c.content?.category || '')), ...updates][0];

  return (
    <div className="cx">
      <section className="cx-hero">
        <div className="cx-kicker">
          <Home size={14} aria-hidden /> Your Home Construction Dashboard
        </div>
        <h1 className="cx-title">{snap.projectName}</h1>
        {snap.profile?.welcome && <p className="cx-welcome">{snap.profile.welcome}</p>}
        <dl className="cx-facts">
          <div>
            <dt>Client</dt>
            <dd>{snap.profile?.clientName || NOT_PROVIDED}</dd>
          </div>
          <div>
            <dt>
              <MapPin size={13} aria-hidden /> Location
            </dt>
            <dd>{snap.profile?.location || NOT_PROVIDED}</dd>
          </div>
          <div>
            <dt>
              <CalendarDays size={13} aria-hidden /> Construction start
            </dt>
            <dd>{snap.startDate ? fmtDate(snap.startDate) : NOT_PROVIDED}</dd>
          </div>
          <div>
            <dt>
              <Flag size={13} aria-hidden /> Original target completion
            </dt>
            <dd>{snap.targetCompletion ? fmtDate(snap.targetCompletion) : NOT_PROVIDED}</dd>
          </div>
          <div>
            <dt>
              <CalendarClock size={13} aria-hidden /> Current estimated completion
            </dt>
            <dd>{forecast ? fmtDate(forecast) : PENDING}</dd>
          </div>
          <div>
            <dt>
              <RefreshCw size={13} aria-hidden /> Last updated
            </dt>
            <dd>{snapRec ? fmtDate(snapRec.publishedAt.slice(0, 10)) : PENDING}</dd>
          </div>
        </dl>
      </section>

      <section className="cx-big3">
        <div className="cx-card cx-progress">
          <Ring value={snap.actualPct} planned={snap.plannedPct} />
          <div className="cx-progress-b">
            <div className="cx-label">Overall construction progress</div>
            <div className="cx-big">{snap.actualPct.toFixed(1)}%</div>
            <p className="cx-muted">
              of the construction work is complete. The plan for {fmtDate(snap.asOf)} is {snap.plannedPct.toFixed(1)}% (marked on the ring).
            </p>
            <button type="button" className="cx-link" onClick={() => go('progress')}>
              See progress by category <ArrowRight size={14} aria-hidden />
            </button>
          </div>
        </div>
        <div className={`cx-card cx-status ${st.tone}`}>
          <div className="cx-label">Schedule status</div>
          <div className="cx-status-v">
            <st.Icon size={22} aria-hidden /> {st.label}
          </div>
          <p className="cx-muted">{snap.statusNote}</p>
        </div>
        <div className="cx-card">
          <div className="cx-label">Estimated project completion</div>
          <div className="cx-big sm">{forecast ? fmtDate(forecast) : PENDING}</div>
          <p className="cx-muted">
            {forecast && snap.targetCompletion
              ? lateBy > 0
                ? `${lateBy} day${lateBy === 1 ? '' : 's'} later than the original target of ${fmtDate(snap.targetCompletion)}.`
                : lateBy < 0
                  ? `${-lateBy} day${lateBy === -1 ? '' : 's'} ahead of the original target of ${fmtDate(snap.targetCompletion)}.`
                  : `On the original target date.`
              : 'The project team will confirm the completion date.'}
          </p>
        </div>
      </section>

      <section className="cx-three">
        <div className="cx-card">
          <h2 className="cx-h2">
            <Hammer size={16} aria-hidden /> Happening now
          </h2>
          <MiniList items={now} empty="No construction activities are in progress right now." mode="now" />
        </div>
        <div className="cx-card">
          <h2 className="cx-h2">
            <CheckCircle2 size={16} aria-hidden /> Recently completed
          </h2>
          <MiniList items={done} empty="No activities have been completed yet." mode="done" />
        </div>
        <div className="cx-card">
          <h2 className="cx-h2">
            <TrendingUp size={16} aria-hidden /> Coming next
          </h2>
          <MiniList items={next} empty="No upcoming activities published." mode="next" />
          <button type="button" className="cx-link" onClick={() => go('timeline')}>
            View the project timeline <ArrowRight size={14} aria-hidden />
          </button>
        </div>
      </section>

      <section className="cx-two">
        {cur && snap.journey && (
          <button type="button" className="cx-card cx-journey" onClick={() => go('journey')}>
            <span className="cx-journey-art">
              <StageArt stage={cur} journey={snap.journey} />
            </span>
            <span className="cx-journey-b">
              <span className="cx-label">Construction Journey 3D · current stage</span>
              <b>{cur.name}</b>
              <StatusBadge status={cur.status} />
              <span className="cx-link">
                Explore all stages <ArrowRight size={14} aria-hidden />
              </span>
            </span>
          </button>
        )}
        <div className="cx-card">
          <h2 className="cx-h2">
            <Megaphone size={16} aria-hidden /> Latest update
          </h2>
          {latestNews ? (
            <>
              <b className="cx-news-t">{latestNews.title}</b>
              <div className="cx-muted">{fmtDate(latestNews.content?.date || latestNews.publishedAt.slice(0, 10))}</div>
              <p className="cx-news-p">{String(latestNews.content?.text || '').slice(0, 220)}</p>
            </>
          ) : (
            <div className="cx-muted">No announcements have been published yet.</div>
          )}
          <button type="button" className="cx-link" onClick={() => go('updates')}>
            All updates &amp; announcements <ArrowRight size={14} aria-hidden />
          </button>
        </div>
      </section>
    </div>
  );
};

// ======================= B. CONSTRUCTION PROGRESS =======================
export const ClientProgress: React.FC<ClientCtx> = ({ snap }) => {
  const [open, setOpen] = useState<string | null>(null);
  if (!snap) return <NoSnapshot />;
  const cats = snap.categories;
  return (
    <div className="cx">
      <header className="cx-pagehead">
        <h1 className="cx-title">Construction Progress</h1>
        <p className="cx-muted">
          Progress is measured by work completed, weighted by the working days of each activity. The line on each bar shows where the plan expects the work to
          be on {fmtDate(snap.asOf)}.
        </p>
      </header>
      {!cats?.length ? (
        // Older publications: progress by phase
        <div className="cx-card">
          {snap.phases.map((p) => (
            <div key={p.key} className="cx-phase">
              <span>{p.label}</span>
              <Bar value={p.actual} planned={p.planned} />
              <b>{p.actual.toFixed(0)}%</b>
            </div>
          ))}
        </div>
      ) : (
        <div className="cx-cats">
          {cats.map((c) => {
            const acts = (snap.activities || []).filter((a) => a.category === c.name);
            return (
              <article key={c.name} className={`cx-card cx-cat ${open === c.name ? 'open' : ''}`}>
                <div className="cx-cat-h">
                  <h2 className="cx-h2">{c.name}</h2>
                  <StatusBadge status={c.status} />
                </div>
                <div className="cx-cat-v">
                  <b>{pctTxt(c.actual)}</b>
                  {c.planned !== null && <span>planned {c.planned.toFixed(1)}%</span>}
                </div>
                <div className="cx-bar" aria-hidden>
                  <i style={{ width: `${Math.max(0, Math.min(100, c.actual ?? 0))}%` }} />
                  {c.planned !== null && <em style={{ left: `${Math.max(0, Math.min(100, c.planned))}%` }} />}
                </div>
                <dl className="cx-cat-dl">
                  <dt>Latest accomplishment</dt>
                  <dd>{c.latest ? `${c.latest}${c.latestDate ? ` · ${fmtDate(c.latestDate)}` : ''}` : 'Not yet started'}</dd>
                  <dt>Target completion</dt>
                  <dd>{c.target ? fmtDate(c.target) : PENDING}</dd>
                </dl>
                <button type="button" className="cx-link" aria-expanded={open === c.name} onClick={() => setOpen(open === c.name ? null : c.name)}>
                  {open === c.name ? 'Hide details' : `View details (${c.count} activities)`} <ChevronDown size={14} aria-hidden />
                </button>
                {open === c.name && (
                  <ul className="cx-acts">
                    {acts.map((a, i) => (
                      <li key={a.name + i}>
                        <div>
                          <b>{a.name}</b>
                          <span>
                            {a.phase} · {fmtRange(a.start, a.finish)}
                          </span>
                        </div>
                        <StatusBadge status={a.status} />
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ======================= C. PROJECT TIMELINE =======================
export const ClientTimeline: React.FC<ClientCtx> = ({ snap, updates, photos }) => {
  const [open, setOpen] = useState<string | null>(null);
  const stages = useMemo(() => [...(snap?.journey?.stages || [])].sort((a, b) => (a.start || '9999').localeCompare(b.start || '9999')), [snap]);
  if (!snap) return <NoSnapshot />;
  return (
    <div className="cx">
      <header className="cx-pagehead">
        <h1 className="cx-title">Project Timeline</h1>
        <p className="cx-muted">The major stages of your home's construction, in order. Select a stage to see its activities and approved updates.</p>
      </header>
      {stages.length ? (
        <ol className="cx-tl">
          {stages.map((s) => {
            const tone = s.status === 'Completed' ? 'done' : s.status === 'In Progress' ? 'now' : s.status === 'Schedule Update Required' ? 'late' : 'next';
            const inWindow = (d?: string) => !!d && !!s.start && !!s.finish && d >= s.start && d <= (s.actualFinish || s.finish);
            const stUpdates = updates.filter((u) => inWindow(u.content?.date));
            const stPhotos = photos.filter((p) => p.content?.stageId === s.id || (!p.content?.stageId && inWindow(p.content?.date)));
            return (
              <li key={s.id} className={`cx-tl-i ${tone} ${open === s.id ? 'open' : ''}`}>
                <span className="cx-tl-dot" aria-hidden />
                <button type="button" className="cx-tl-h" aria-expanded={open === s.id} onClick={() => setOpen(open === s.id ? null : s.id)}>
                  <span className="cx-tl-name">{s.name}</span>
                  <span className="cx-tl-date">{s.start ? fmtRange(s.start, s.actualFinish || s.finish) : 'Dates pending update'}</span>
                  <StatusBadge status={s.status} />
                  {s.progress !== null && s.status !== 'Upcoming' && <span className="cx-tl-pct">{s.progress.toFixed(0)}%</span>}
                </button>
                {open === s.id && (
                  <div className="cx-tl-b">
                    <p>{s.description}</p>
                    {s.remark && <p className="cx-remark">{s.remark}</p>}
                    {s.activities.length ? (
                      <ul className="cx-acts">
                        {s.activities.map((a, i) => (
                          <li key={a.name + i}>
                            <div>
                              <b>{a.name}</b>
                              {a.finish && <span>Target {fmtDate(a.finish)}</span>}
                            </div>
                            <StatusBadge status={a.status} />
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="cx-muted">No activities are linked to this stage yet.</div>
                    )}
                    {stUpdates.map((u) => (
                      <div key={u.id} className="cx-upd">
                        <b>{u.title}</b> · {fmtDate(u.content.date)}
                        <p>{u.content.text}</p>
                      </div>
                    ))}
                    {stPhotos.length > 0 && (
                      <div className="cx-thumbs">
                        {stPhotos.slice(0, 4).map((p) => (
                          <img key={p.id} src={p.content.url} alt={p.title} loading="lazy" />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      ) : (
        <Empty>The construction stages will appear here once published.</Empty>
      )}

      <section className="cx-card">
        <h2 className="cx-h2">
          <Flag size={16} aria-hidden /> Key milestones
        </h2>
        <ul className="cx-ms">
          {snap.milestones.map((m) => (
            <li key={m.label}>
              <div>
                <b>{m.label}</b>
                <span>
                  {m.targetText}
                  {m.revised && m.baseline ? ` · originally ${fmtDate(m.baseline)}` : ''}
                  {m.actual ? ` · completed ${fmtDate(m.actual)}` : ''}
                </span>
              </div>
              <StatusBadge status={toClient(m.status)} />
            </li>
          ))}
        </ul>
        <div className="cx-muted" style={{ marginTop: 8 }}>
          Confirmed = committed date · Tentative = awaiting confirmation · Target = planned target, not yet a commitment.
        </div>
      </section>
    </div>
  );
};

function toClient(s: string): ClientStatus {
  if (/complete/i.test(s)) return 'Completed';
  if (/progress/i.test(s)) return 'In Progress';
  if (/behind|delay|schedule update/i.test(s)) return 'Schedule Update Required';
  return 'Upcoming';
}

// ======================= F. UPDATES & ANNOUNCEMENTS =======================
export const ClientUpdates: React.FC<ClientCtx> = ({ snap, updates, considerations, reports, go }) => {
  const action = considerations.filter((c) => /client action/i.test(c.content?.category || ''));
  const scheduleNotes = considerations.filter((c) => /schedule/i.test(c.content?.category || ''));
  const announcements = considerations.filter((c) => !action.includes(c) && !scheduleNotes.includes(c));
  const weekly = reports.find((r) => r.content?.type === 'weekly');
  const Note: React.FC<{ r: PortalRecord }> = ({ r }) => (
    <article className="cx-note">
      <div className="cx-note-h">
        <b>{r.title}</b>
        <span>{fmtDate(r.content?.date || r.publishedAt.slice(0, 10))}</span>
      </div>
      <p>{r.content?.text}</p>
      {r.content?.impact && <div className="cx-impact">Schedule impact: {r.content.impact}</div>}
    </article>
  );
  return (
    <div className="cx">
      <header className="cx-pagehead">
        <h1 className="cx-title">Updates &amp; Announcements</h1>
        <p className="cx-muted">News about your home from the project team, newest first.</p>
      </header>

      {action.length > 0 && (
        <section className="cx-card cx-action">
          <h2 className="cx-h2">
            <ClipboardCheck size={16} aria-hidden /> Client action required
          </h2>
          {action.map((r) => (
            <Note key={r.id} r={r} />
          ))}
        </section>
      )}

      <section className="cx-card">
        <h2 className="cx-h2">
          <Sparkles size={16} aria-hidden /> Latest updates
        </h2>
        {updates.length ? updates.slice(0, 8).map((r) => <Note key={r.id} r={r} />) : <div className="cx-muted">No updates have been published yet.</div>}
      </section>

      <section className="cx-card">
        <h2 className="cx-h2">
          <FileText size={16} aria-hidden /> Weekly construction summary
        </h2>
        {weekly ? (
          <>
            <b>{weekly.title}</b>
            <div className="cx-muted">{fmtRange(weekly.periodStart, weekly.periodEnd)}</div>
            <p className="cx-news-p">{(weekly.content as PortalReport).executiveSummary || NOT_PROVIDED}</p>
            <button type="button" className="cx-link" onClick={() => go('weekly', weekly.id)}>
              Read the weekly report <ArrowRight size={14} aria-hidden />
            </button>
          </>
        ) : (
          <div className="cx-muted">No weekly report has been published yet.</div>
        )}
      </section>

      <section className="cx-card">
        <h2 className="cx-h2">
          <Megaphone size={16} aria-hidden /> Important announcements
        </h2>
        {announcements.length ? announcements.map((r) => <Note key={r.id} r={r} />) : <div className="cx-muted">No announcements have been published.</div>}
      </section>

      <section className="cx-card">
        <h2 className="cx-h2">
          <CalendarRange size={16} aria-hidden /> Schedule adjustments
        </h2>
        {scheduleNotes.map((r) => (
          <Note key={r.id} r={r} />
        ))}
        {snap?.scheduleUpdates.length ? (
          <ul className="cx-ms">
            {snap.scheduleUpdates.map((u) => (
              <li key={u.label}>
                <div>
                  <b>{u.label}</b>
                  <span>
                    Moved from {u.from} to {u.to}
                    {u.at ? ` · updated ${fmtDate(u.at)}` : ''}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          !scheduleNotes.length && <div className="cx-muted">No changes to the approved schedule have been published.</div>
        )}
      </section>
    </div>
  );
};

// ======================= G. DOCUMENTS & REPORTS =======================
export const ClientDocuments: React.FC<ClientCtx> = ({ reports, documents, go, full, onLogin }) => {
  const weekly = reports.filter((r) => r.content?.type === 'weekly');
  const monthly = reports.filter((r) => r.content?.type === 'monthly');
  const byCat = new Map<string, PortalRecord[]>();
  documents.forEach((d) => {
    const k = d.content?.category || 'Approved Project Documents';
    byCat.set(k, [...(byCat.get(k) || []), d]);
  });
  const ReportList: React.FC<{ list: PortalRecord[]; type: 'weekly' | 'monthly' }> = ({ list, type }) =>
    list.length ? (
      <ul className="cx-docs">
        {list.map((r) => (
          <li key={r.id}>
            <FileText size={18} aria-hidden />
            <div>
              <b>{r.title}</b>
              <span>
                {fmtRange(r.periodStart, r.periodEnd)} · published {fmtDate(r.publishedAt.slice(0, 10))}
              </span>
            </div>
            <button type="button" className="cx-btn" onClick={() => go(type, r.id)}>
              Open
            </button>
          </li>
        ))}
      </ul>
    ) : (
      <div className="cx-muted">No {type} reports have been published yet.</div>
    );
  return (
    <div className="cx">
      <header className="cx-pagehead">
        <h1 className="cx-title">Documents &amp; Reports</h1>
        <p className="cx-muted">Approved progress reports and project documents. Open a report to read or print it.</p>
      </header>
      <section className="cx-card">
        <h2 className="cx-h2">Weekly progress reports</h2>
        <ReportList list={weekly} type="weekly" />
      </section>
      <section className="cx-card">
        <h2 className="cx-h2">Monthly progress reports</h2>
        <ReportList list={monthly} type="monthly" />
      </section>
      <section className="cx-card">
        <h2 className="cx-h2">Approved project documents</h2>
        {!full ? (
          <div className="cx-locked">
            <Lock size={18} aria-hidden />
            <div>
              Approved project documents, references and turnover documents are available to the Project Owner and Executives.{' '}
              <button type="button" className="pt-linkbtn" onClick={onLogin}>
                Sign in
              </button>{' '}
              to view them.
            </div>
          </div>
        ) : byCat.size ? (
          [...byCat.entries()].map(([cat, list]) => (
            <div key={cat} className="cx-doccat">
              <h3>{cat}</h3>
              <ul className="cx-docs">
                {list.map((d) => (
                  <li key={d.id}>
                    <FileText size={18} aria-hidden />
                    <div>
                      <b>{d.title}</b>
                      <span>
                        {d.content?.description ? `${d.content.description} · ` : ''}
                        {d.content?.date ? fmtDate(d.content.date) : fmtDate(d.publishedAt.slice(0, 10))}
                      </span>
                    </div>
                    {d.content?.url ? (
                      <a className="cx-btn" href={d.content.url} target="_blank" rel="noopener noreferrer">
                        <Download size={14} aria-hidden /> Download
                      </a>
                    ) : (
                      <span className="cx-muted">{NOT_PROVIDED}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))
        ) : (
          <div className="cx-muted">No documents have been published yet.</div>
        )}
      </section>
    </div>
  );
};
