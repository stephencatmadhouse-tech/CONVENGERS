/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * MOBILE CLIENT COMMAND CENTER — dedicated phone layout of the client portal
 * (not a shrunken desktop): app bar, bottom navigation (Home, Progress,
 * 3D Journey, Updates, Documents), a secondary menu and a "What's new" panel.
 * It reads exactly the same published records as the desktop portal.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  Home,
  HardHat,
  Box,
  Megaphone,
  FileDown,
  Menu,
  Bell,
  X,
  ChartGantt,
  Images,
  Lock,
  LogOut,
  ArrowRight,
  Download,
  Share,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import './mobile.css';
import { User } from '../types/index.ts';
import { LOGO_SVG } from '../constants/assets.ts';
import { audienceOf, ROLE_LABEL, landingModule } from '../auth/roles.ts';
import { authService } from '../firebase/authService.ts';
import type { PortalRecord, PortalSnapshot } from '../domain/portal.ts';
import { fmtDate } from '../domain/dates.ts';
import { currentStageIndex } from '../domain/journey.ts';
import { ClientCtx, ClientProgress, ClientTimeline, ClientUpdates, ClientDocuments, NoSnapshot, scheduleStatus } from './ClientViews.tsx';
import { JourneyViewer, StageArt, StatusBadge } from './Journey.tsx';
import { useInstallState, promptInstall, applyUpdate } from '../pwa/pwa.ts';

const BOTTOM = [
  { id: 'overview', label: 'Home', icon: Home },
  { id: 'progress', label: 'Progress', icon: HardHat },
  { id: 'journey', label: '3D Journey', icon: Box },
  { id: 'updates', label: 'Updates', icon: Megaphone },
  { id: 'documents', label: 'Documents', icon: FileDown },
];

interface Props {
  user: User;
  authReady: boolean;
  onLogin: () => void;
  tab: string;
  navTab: string;
  reportView: 'weekly' | 'monthly' | null;
  ctx: ClientCtx;
  renderReport: () => React.ReactNode;
  renderGallery: () => React.ReactNode;
  loading: boolean;
  unavailable: string | null;
}

// ---------------- Client notifications ("What's new") ----------------
const SEEN_KEY = 'bb_client_seen_at';
interface NewsItem {
  id: string;
  at: string;
  kind: string;
  title: string;
  go: string;
}
function newsFrom(ctx: ClientCtx): NewsItem[] {
  const out: NewsItem[] = [];
  if (ctx.snapRec) out.push({ id: ctx.snapRec.id, at: ctx.snapRec.publishedAt, kind: 'Progress update', title: 'Construction progress was updated', go: 'overview' });
  ctx.updates.forEach((u) => out.push({ id: u.id, at: u.publishedAt, kind: 'Construction update', title: u.title, go: 'updates' }));
  ctx.considerations.forEach((c) => {
    const cat = c.content?.category || '';
    const kind = /client action/i.test(cat) ? 'Client action required' : /schedule/i.test(cat) ? 'Schedule adjustment' : 'Announcement';
    out.push({ id: c.id, at: c.publishedAt, kind, title: c.title, go: 'updates' });
  });
  ctx.reports
    .filter((r) => r.content?.type === 'weekly' || r.content?.type === 'monthly')
    .forEach((r) => out.push({ id: r.id, at: r.publishedAt, kind: r.content?.type === 'weekly' ? 'Weekly progress report' : 'Monthly progress report', title: r.title, go: 'documents' }));
  ctx.photos.slice(0, 5).forEach((p) => out.push({ id: p.id, at: p.publishedAt, kind: 'New photo', title: p.title, go: 'gallery' }));
  return out.sort((a, b) => b.at.localeCompare(a.at));
}
function readSeen(): string {
  try {
    return localStorage.getItem(SEEN_KEY) || '';
  } catch {
    return '';
  }
}

export const MobilePortal: React.FC<Props> = ({ user, authReady, onLogin, tab, navTab, reportView, ctx, renderReport, renderGallery, loading, unavailable }) => {
  const [menu, setMenu] = useState(false);
  const [news, setNews] = useState(false);
  const [seen, setSeen] = useState(readSeen);
  const audience = audienceOf(user);
  const install = useInstallState();
  const items = useMemo(() => newsFrom(ctx), [ctx]);
  const unread = items.filter((i) => i.at > seen).length;

  useEffect(() => {
    window.scrollTo({ top: 0 });
    setMenu(false);
  }, [tab, reportView]);

  const openNews = () => {
    setNews(true);
    const now = new Date().toISOString();
    try {
      localStorage.setItem(SEEN_KEY, now);
    } catch {
      // per-device convenience only
    }
    // keep badges visible inside the panel until it is closed
    setTimeout(() => setSeen(now), 400);
  };

  const body = loading ? (
    <div className="pt-empty">Loading published project information…</div>
  ) : unavailable ? (
    <div className="pt-empty">{unavailable}</div>
  ) : reportView ? (
    renderReport()
  ) : tab === 'overview' ? (
    <MobileHome ctx={ctx} />
  ) : tab === 'progress' ? (
    <ClientProgress {...ctx} />
  ) : tab === 'journey' ? (
    ctx.snap?.journey ? <JourneyViewer journey={ctx.snap.journey} photos={ctx.photos} asOf={`status as of ${fmtDate(ctx.snap.asOf)}`} /> : <NoSnapshot />
  ) : tab === 'timeline' ? (
    <ClientTimeline {...ctx} />
  ) : tab === 'gallery' ? (
    renderGallery()
  ) : tab === 'updates' ? (
    <ClientUpdates {...ctx} />
  ) : (
    <ClientDocuments {...ctx} />
  );

  return (
    <div className="mb mb-client">
      <header className="mb-bar">
        <button type="button" className="mb-brand" onClick={() => ctx.go('overview')} aria-label="Home">
          <img src={LOGO_SVG} alt="" />
          <span>
            <b>Bahay Build</b>
            <em>Client Command Center</em>
          </span>
        </button>
        <button type="button" className="mb-icon" onClick={openNews} aria-label={`What's new${unread ? `, ${unread} new` : ''}`}>
          <Bell size={21} aria-hidden />
          {unread > 0 && <span className="mb-badge">{unread > 9 ? '9+' : unread}</span>}
        </button>
        <button type="button" className="mb-icon" onClick={() => setMenu(true)} aria-label="Menu">
          <Menu size={22} aria-hidden />
        </button>
      </header>
      {install.updateReady && (
        <div className="mb-update">
          <RefreshCw size={15} aria-hidden /> A new version is available.
          <button type="button" onClick={applyUpdate}>
            Reload
          </button>
        </div>
      )}

      <main className="mb-main">{body}</main>

      <nav className="mb-tabs" aria-label="Main">
        {BOTTOM.map((t) => (
          <button key={t.id} type="button" className={navTab === t.id ? 'on' : ''} aria-current={navTab === t.id ? 'page' : undefined} onClick={() => ctx.go(t.id)}>
            <t.icon size={22} strokeWidth={navTab === t.id ? 2.3 : 1.9} aria-hidden />
            <span>{t.label}</span>
          </button>
        ))}
      </nav>

      {menu && (
        <Sheet title="Menu" onClose={() => setMenu(false)}>
          <div className="mb-menu">
            <button type="button" onClick={() => ctx.go('timeline')}>
              <ChartGantt size={20} aria-hidden /> Project Timeline
            </button>
            <button type="button" onClick={() => ctx.go('gallery')}>
              <Images size={20} aria-hidden /> Progress Gallery
            </button>
            <InstallRow />
            <div className="mb-menu-sep" />
            {!authReady ? null : audience === 'guest' ? (
              <button type="button" onClick={() => (setMenu(false), onLogin())}>
                <Lock size={20} aria-hidden /> Internal Login
              </button>
            ) : (
              <>
                <div className="mb-menu-user">
                  <b>{user.name}</b>
                  <span>{audience === 'pending' ? 'Awaiting approval' : ROLE_LABEL[user.role]}</span>
                </div>
                {audience === 'internal' && (
                  <a href={`#/${landingModule(user.role)}`} className="mb-menu-a">
                    <ArrowRight size={20} aria-hidden /> Open Master Project Tracker
                  </a>
                )}
                <button type="button" onClick={() => authService.signOut()}>
                  <LogOut size={20} aria-hidden /> Sign out
                </button>
              </>
            )}
            <p className="mb-menu-note">Information is published by the Convengers Bahay Build project team after review and approval.</p>
          </div>
        </Sheet>
      )}

      {news && (
        <Sheet title="What's new" onClose={() => setNews(false)}>
          {items.length ? (
            <ul className="mb-news">
              {items.slice(0, 20).map((i) => (
                <li key={i.kind + i.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setNews(false);
                      ctx.go(i.go);
                    }}
                  >
                    {i.at > seen && <span className="mb-dot" aria-label="New" />}
                    <span>
                      <em>{i.kind}</em>
                      <b>{i.title}</b>
                      <small>{fmtDate(i.at.slice(0, 10))}</small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="pt-empty">Nothing has been published yet.</div>
          )}
          <p className="mb-menu-note">New items are marked on this device. Push notifications are not enabled for this portal.</p>
        </Sheet>
      )}
    </div>
  );
};

export const InstallRow: React.FC = () => {
  const st = useInstallState();
  const [hint, setHint] = useState(false);
  if (st.installed) {
    return (
      <div className="mb-menu-info">
        <CheckCircle2 size={20} aria-hidden /> Installed on this device
      </div>
    );
  }
  if (st.canPrompt) {
    return (
      <button type="button" onClick={() => promptInstall()}>
        <Download size={20} aria-hidden /> Add to Home Screen
      </button>
    );
  }
  return (
    <>
      <button type="button" onClick={() => setHint((v) => !v)} aria-expanded={hint}>
        <Download size={20} aria-hidden /> Add to Home Screen
      </button>
      {hint && (
        <div className="mb-menu-hint">
          {st.iosHint ? (
            <>
              In Safari, tap <Share size={14} aria-label="Share" /> <b>Share</b>, then <b>Add to Home Screen</b>.
            </>
          ) : (
            <>Open your browser menu and choose <b>Install app</b> or <b>Add to Home screen</b>.</>
          )}
        </div>
      )}
    </>
  );
};

export const Sheet: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', k);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return (
    <div className="mb-sheet-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="mb-sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="mb-sheet-h">
          <b>{title}</b>
          <button type="button" className="mb-icon" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <div className="mb-sheet-b">{children}</div>
      </div>
    </div>
  );
};

// ---------------- Mobile home ----------------
const MobileHome: React.FC<{ ctx: ClientCtx }> = ({ ctx }) => {
  const { snap, snapRec, updates, considerations, photos, go } = ctx;
  if (!snap) return <NoSnapshot />;
  return <MobileHomeBody snap={snap} snapRec={snapRec} updates={updates} considerations={considerations} photos={photos} go={go} />;
};

const MobileHomeBody: React.FC<{
  snap: PortalSnapshot;
  snapRec?: PortalRecord;
  updates: PortalRecord[];
  considerations: PortalRecord[];
  photos: PortalRecord[];
  go: (t: string, p?: string) => void;
}> = ({ snap, snapRec, updates, considerations, photos, go }) => {
  const st = scheduleStatus(snap.status);
  const forecast = snap.forecastCompletion || snap.projectedCompletion;
  const stages = snap.journey?.stages || [];
  const cur = stages.length ? stages[currentStageIndex(stages)] : undefined;
  const upcoming = (snap.activities || [])
    .filter((a) => a.status === 'Upcoming' && a.start && a.start >= snap.asOf)
    .sort((a, b) => (a.start || '').localeCompare(b.start || ''))
    .slice(0, 4);
  const announcements = [
    ...considerations.filter((c) => /client action/i.test(c.content?.category || '')),
    ...considerations.filter((c) => !/client action/i.test(c.content?.category || '')),
  ].slice(0, 3);
  const pctV = Math.max(0, Math.min(100, snap.actualPct));
  return (
    <div className="mb-home">
      {/* 1. Project name & welcome */}
      <section className="mb-hello">
        <h1>{snap.projectName}</h1>
        <p>{snap.profile?.welcome || `Welcome${snap.profile?.clientName ? `, ${snap.profile.clientName}` : ''}. Here is how your home is progressing.`}</p>
      </section>

      {/* 2–4. Progress, status, completion */}
      <section className="mb-hero">
        <div className="mb-ring" style={{ ['--p' as any]: `${pctV * 3.6}deg` }} role="img" aria-label={`${pctV.toFixed(1)}% of construction completed`}>
          <div>
            <b>{pctV.toFixed(1)}%</b>
            <span>completed</span>
          </div>
        </div>
        <div className="mb-hero-b">
          <div className={`mb-status ${st.tone}`}>
            <st.Icon size={17} aria-hidden /> {st.label}
          </div>
          <dl>
            <dt>Target completion</dt>
            <dd>{snap.targetCompletion ? fmtDate(snap.targetCompletion) : 'Pending update'}</dd>
            {forecast && forecast !== snap.targetCompletion && (
              <>
                <dt>Current estimate</dt>
                <dd>{fmtDate(forecast)}</dd>
              </>
            )}
          </dl>
          <small>Planned for today: {snap.plannedPct.toFixed(1)}% · updated {snapRec ? fmtDate(snapRec.publishedAt.slice(0, 10)) : '—'}</small>
        </div>
      </section>

      {/* 5. 3D Construction Journey */}
      {cur && snap.journey && (
        <button type="button" className="mb-card mb-journey" onClick={() => go('journey')}>
          <span className="mb-journey-art">
            <StageArt stage={cur} journey={snap.journey} />
          </span>
          <span className="mb-journey-b">
            <em>3D Construction Journey</em>
            <b>{cur.name}</b>
            <StatusBadge status={cur.status} />
            <span className="mb-steps" aria-hidden>
              {stages.map((s) => (
                <i key={s.id} className={s.status === 'Completed' ? 'done' : s.id === cur.id ? 'now' : ''} />
              ))}
            </span>
          </span>
        </button>
      )}

      {/* 6. Latest construction updates */}
      <section className="mb-card">
        <div className="mb-card-h">
          <h2>Latest construction updates</h2>
          <button type="button" onClick={() => go('updates')}>
            See all
          </button>
        </div>
        {updates.length ? (
          updates.slice(0, 2).map((u) => (
            <article key={u.id} className="mb-upd">
              <b>{u.title}</b>
              <small>{fmtDate(u.content?.date || u.publishedAt.slice(0, 10))}</small>
              <p>{String(u.content?.text || '').slice(0, 160)}</p>
            </article>
          ))
        ) : (
          <p className="mb-muted">No construction updates have been published yet.</p>
        )}
        {photos.length > 0 && (
          <div className="mb-thumbs">
            {photos.slice(0, 3).map((p) => (
              <button key={p.id} type="button" onClick={() => go('gallery')} aria-label={p.title}>
                <img src={p.content.url} alt={p.title} loading="lazy" />
              </button>
            ))}
          </div>
        )}
      </section>

      {/* 7. Upcoming activities */}
      <section className="mb-card">
        <div className="mb-card-h">
          <h2>Coming next</h2>
          <button type="button" onClick={() => go('timeline')}>
            Timeline
          </button>
        </div>
        {upcoming.length ? (
          <ul className="mb-list">
            {upcoming.map((a, i) => (
              <li key={a.name + i}>
                <b>{a.name}</b>
                <span>
                  {a.category} · starts {fmtDate(a.start)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-muted">No upcoming activities published.</p>
        )}
      </section>

      {/* 8. Important announcements */}
      <section className="mb-card">
        <div className="mb-card-h">
          <h2>Important announcements</h2>
        </div>
        {announcements.length ? (
          announcements.map((c) => (
            <article key={c.id} className={`mb-upd ${/client action/i.test(c.content?.category || '') ? 'action' : ''}`}>
              {/client action/i.test(c.content?.category || '') && <em className="mb-flag">Client action required</em>}
              <b>{c.title}</b>
              <p>{String(c.content?.text || '').slice(0, 160)}</p>
            </article>
          ))
        ) : (
          <p className="mb-muted">No announcements at the moment.</p>
        )}
      </section>
    </div>
  );
};
