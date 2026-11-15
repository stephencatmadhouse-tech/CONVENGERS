/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * EXECUTIVE & CLIENT REPORTING PORTAL — the default, client-facing view.
 * Reads ONLY the `portal` collection — sanitized content that an authorized
 * internal user has Approved and Published. Nothing here is computed from
 * internal records, so unpublished or draft information can never appear.
 *
 * Tiers (enforced by firestore.rules):
 *   public / client / stakeholder → published dashboard content (no documents)
 *   project owner / executive / internal → + approved project documents
 */

import React, { useEffect, useMemo, useState } from 'react';
import { BrandHeader } from '../components/BrandHeader.tsx';
import { Pill, Bar, Empty, PhotoGrid } from './portalUi.tsx';
import { ClientOverview, ClientProgress, ClientTimeline, ClientUpdates, ClientDocuments, NoSnapshot } from './ClientViews.tsx';
import { JourneyViewer } from './Journey.tsx';
import { MobilePortal } from './MobilePortal.tsx';
import { useIsPhone } from '../pwa/pwa.ts';
import { User } from '../types/index.ts';
import { portalStore, publicPortalStore } from '../firebase/opsStores.ts';
import { useStore } from '../firebase/useStore.ts';
import { authService } from '../firebase/authService.ts';
import { ROLE_LABEL, audienceOf, canReadPortalDocuments, landingModule } from '../auth/roles.ts';
import { LOGO_SVG } from '../constants/assets.ts';
import { PortalRecord, PortalSnapshot, PortalReport, PortalReportRow, NOT_PROVIDED, PUBLIC_PORTAL_KINDS, fmtOrPending } from '../domain/portal.ts';
import { addDays, diffDays, fmtDate, fmtRange, monthLabel, todayIso } from '../domain/dates.ts';
import {
  LayoutDashboard,
  HardHat,
  ChartGantt,
  Flag,
  CalendarCheck,
  CalendarDays,
  Images,
  MessageSquareWarning,
  FileDown,
  Box,
  Megaphone,
  LogOut,
  Lock,
  ArrowRight,
  type LucideIcon,
} from 'lucide-react';

const TAB_ICONS: Record<string, LucideIcon> = {
  overview: LayoutDashboard,
  progress: HardHat,
  journey: Box,
  timeline: ChartGantt,
  gallery: Images,
  updates: Megaphone,
  documents: FileDown,
};

/** Client navigation (2.0): seven sections. */
const TABS = [
  { id: 'overview', label: 'Project Overview' },
  { id: 'progress', label: 'Construction Progress' },
  { id: 'journey', label: '3D Construction Journey' },
  { id: 'timeline', label: 'Project Timeline' },
  { id: 'gallery', label: 'Progress Gallery' },
  { id: 'updates', label: 'Updates & Announcements' },
  { id: 'documents', label: 'Documents & Reports' },
];

/** Earlier portal addresses keep working. */
const TAB_ALIAS: Record<string, string> = {
  milestones: 'timeline',
  considerations: 'updates',
  reports: 'documents',
  monthly: 'documents',
  weekly: 'updates',
};

const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  'On Track': { bg: '#22A06B', fg: '#FFFFFF' },
  'At Risk': { bg: '#F5A623', fg: '#303030' },
  Critical: { bg: '#E5484D', fg: '#FFFFFF' },
};
function usePortalRoute(): [string, string | undefined, (t: string, p?: string) => void] {
  const parse = () => {
    const parts = window.location.hash.replace(/^#\/?/, '').split('/');
    return [parts[1] || 'overview', parts[2]] as [string, string | undefined];
  };
  const [r, setR] = useState(parse);
  useEffect(() => {
    const on = () => setR(parse());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const go = (t: string, p?: string) => {
    window.location.hash = `#/portal/${t}${p ? `/${p}` : ''}`;
    window.scrollTo({ top: 0 });
  };
  return [r[0], r[1], go];
}

export const PortalApp: React.FC<{ user: User; authReady: boolean; onLogin: () => void }> = ({ user, authReady, onLogin }) => {
  const audience = audienceOf(user);
  const internal = audience === 'internal';
  const full = canReadPortalDocuments(user);
  const portal = useStore(full ? portalStore : publicPortalStore);
  const [rawTab, param, go] = usePortalRoute();
  // weekly / monthly report pages are opened from Updates and Documents
  const reportView = (rawTab === 'weekly' || rawTab === 'monthly') && !!param ? rawTab : null;
  const tab = TABS.some((t) => t.id === rawTab) ? rawTab : TAB_ALIAS[rawTab] || 'overview';
  const navTab = reportView === 'weekly' ? 'updates' : reportView === 'monthly' ? 'documents' : tab;

  const byKind = useMemo(() => {
    const items = portal.items.filter((r) => (!r.localOnly || internal) && (full || PUBLIC_PORTAL_KINDS.includes(r.kind)));
    const sort = (a: PortalRecord, b: PortalRecord) => b.publishedAt.localeCompare(a.publishedAt);
    return {
      snapshot: items.filter((r) => r.kind === 'snapshot').sort(sort)[0],
      reports: items.filter((r) => r.kind === 'report').sort((a, b) => (b.periodEnd || '').localeCompare(a.periodEnd || '')),
      photos: items.filter((r) => r.kind === 'photo').sort((a, b) => (b.content?.date || '').localeCompare(a.content?.date || '')),
      documents: items.filter((r) => r.kind === 'document').sort(sort),
      considerations: items.filter((r) => r.kind === 'consideration').sort(sort),
      updates: items.filter((r) => r.kind === 'update').sort((a, b) => (b.content?.date || '').localeCompare(a.content?.date || '')),
    };
  }, [portal.items, internal, full]);

  const snap = byKind.snapshot?.content as PortalSnapshot | undefined;
  const ctx = { snap, snapRec: byKind.snapshot, ...byKind, go, param, full, onLogin };
  const isPhone = useIsPhone();
  if (isPhone) {
    const unavailable =
      portal.error === 'unreachable' && !portal.items.length
        ? 'The project database cannot be reached right now. Check your internet connection and try again.'
        : portal.error === 'permission-denied' && !internal && !portal.items.length
          ? 'Published project information is not available at the moment. Please check back later.'
          : null;
    return (
      <MobilePortal
        user={user}
        authReady={authReady}
        onLogin={onLogin}
        tab={tab}
        navTab={navTab === 'timeline' || navTab === 'gallery' ? '' : navTab}
        reportView={reportView}
        ctx={ctx}
        renderReport={() => <ReportsView {...ctx} type={reportView || 'weekly'} />}
        renderGallery={() => <Gallery {...ctx} />}
        loading={!portal.loaded}
        unavailable={unavailable}
      />
    );
  }

  // Small, secondary header controls (upper-right)
  const headerRight = !authReady ? null : audience === 'guest' ? (
    <button type="button" className="cb-login" onClick={onLogin} title="Internal login for authorized users">
      <Lock size={13} strokeWidth={2.2} aria-hidden /> Internal Login
    </button>
  ) : (
    <>
      <span className="cb-user">
        <b>{user.name}</b> · {audience === 'pending' ? (user.status === 'revoked' ? 'Access revoked' : 'Awaiting approval') : ROLE_LABEL[user.role]}
      </span>
      {internal && (
        <a className="cb-login" href={`#/${landingModule(user.role)}`} title="Open the Convengers Overall Master Project Tracker">
          Master Tracker <ArrowRight size={13} aria-hidden />
        </a>
      )}
      <button type="button" className="cb-login" onClick={() => authService.signOut()}>
        <LogOut size={13} aria-hidden /> Sign out
      </button>
    </>
  );

  return (
    <div className="pt pt-layout">
      <aside className="pt-side pt-noprint" aria-label="Portal navigation">
        <div className="pt-side-brand">
          <img src={LOGO_SVG} alt="Convengers emblem" />
          <div>
            <div className="pt-side-name">Convengers</div>
            <div className="pt-side-sub">Bahay Build · Client Portal</div>
          </div>
          {/* Phones: the brand header is hidden, so the discreet login sits here */}
          {headerRight && <div className="pt-side-actions">{headerRight}</div>}
        </div>
        <nav className="pt-side-nav" aria-label="Portal sections">
          {TABS.map((t) => (
            <button key={t.id} type="button" className={`pt-side-btn ${navTab === t.id ? 'on' : ''}`} onClick={() => go(t.id)} aria-current={navTab === t.id ? 'page' : undefined}>
              {React.createElement(TAB_ICONS[t.id], { size: 19, strokeWidth: 1.9, 'aria-hidden': true })}
              <span>{t.label}</span>
            </button>
          ))}
        </nav>
        <div className="pt-side-foot">
          <div className="pt-side-user">
            <b>Official project portal</b>
            <span>Approved &amp; published information</span>
          </div>
        </div>
      </aside>
      <div className="pt-body">
      <div className="pt-header pt-header-brand">
        <BrandHeader subtitle="Executive & Client Reporting Portal" right={headerRight} />
      </div>
      <main className="pt-main">
        {!portal.loaded ? (
          <Empty>Loading published project information…</Empty>
        ) : portal.error === 'unreachable' && !portal.items.length ? (
          <Empty>The project database cannot be reached right now. Check your internet connection and refresh the page.</Empty>
        ) : portal.error === 'permission-denied' && !internal && !portal.items.length ? (
          <Empty>Published project information is not available at the moment. Please check back later.</Empty>
        ) : (
          <>
            {internal && portal.error === 'permission-denied' && (
              <div className="pt-note pt-noprint" style={{ borderLeftColor: '#F5A623', marginBottom: 16 }}>
                <b>Shared portal storage is not active yet.</b> The database security rules on the server have not been updated, so the shared{' '}
                <code>portal</code> collection cannot be read. Deploy the updated <code>firestore.rules</code> (see <i>docs/COMMAND_CENTER_AUDIT.md</i>). Until then
                this view shows only items published from this device, and visitors cannot see any published content.
              </div>
            )}
            {reportView ? (
              <ReportsView {...ctx} type={reportView} />
            ) : (
              <>
                {tab === 'overview' && <ClientOverview {...ctx} />}
                {tab === 'progress' && <ClientProgress {...ctx} />}
                {tab === 'journey' &&
                  (snap?.journey ? (
                    <JourneyViewer journey={snap.journey} photos={byKind.photos} asOf={`status as of ${fmtDate(snap.asOf)}`} />
                  ) : (
                    <NoSnapshot />
                  ))}
                {tab === 'timeline' && <ClientTimeline {...ctx} />}
                {tab === 'gallery' && <Gallery {...ctx} />}
                {tab === 'updates' && <ClientUpdates {...ctx} />}
                {tab === 'documents' && <ClientDocuments {...ctx} />}
              </>
            )}
          </>
        )}
      </main>
      <footer className="pt-footer">
        Information on this portal is published by the Convengers Bahay Build project team after review and approval.
        {byKind.snapshot ? ` Project status last published ${fmtDate(byKind.snapshot.publishedAt.slice(0, 10))}.` : ''} Dates marked “Tentative” or “Target” are not yet confirmed
        commitments.
      </footer>
      </div>
    </div>
  );
};

type Ctx = {
  snap?: PortalSnapshot;
  snapRec?: PortalRecord;
  reports: PortalRecord[];
  photos: PortalRecord[];
  documents: PortalRecord[];
  considerations: PortalRecord[];
  updates: PortalRecord[];
  go: (t: string, p?: string) => void;
  param?: string;
  /** Owner / Executive / internal: approved documents are visible. */
  full: boolean;
  onLogin: () => void;
};

const RowsTable: React.FC<{ rows: PortalReportRow[]; empty: string }> = ({ rows, empty }) =>
  rows.length ? (
    <div className="pt-table-wrap">
      <table className="pt-table">
        <thead>
          <tr>
            <th>Activity</th>
            <th>Phase</th>
            <th>Dates</th>
            <th>Status</th>
            <th style={{ textAlign: 'right' }}>Progress</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.name + i}>
              <td style={{ fontWeight: 700 }}>{r.name}</td>
              <td>{r.phase}</td>
              <td style={{ whiteSpace: 'nowrap' }}>{r.dates}</td>
              <td>
                <Pill label={r.status} />
              </td>
              <td style={{ textAlign: 'right' }}>{r.progress}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <Empty>{empty}</Empty>
  );

const ReportsView: React.FC<Ctx & { type: 'weekly' | 'monthly' }> = ({ reports, photos, updates, param, go, type }) => {
  const list = reports.filter((r) => r.content?.type === type);
  const rec = list.find((r) => r.id === param) || list[0];
  if (!rec) return <Empty>No {type} report has been published yet.</Empty>;
  const r = rec.content as PortalReport;
  const periodPhotos = photos.filter((p) => p.content?.date && p.content.date >= r.periodStart && p.content.date <= r.periodEnd);
  const periodUpdates = updates.filter((u) => u.content?.date && u.content.date >= r.periodStart && u.content.date <= r.periodEnd);
  return (
    <div className="pt-grid">
      <div className="pt-row" style={{ justifyContent: 'space-between' }}>
        <div>
          <div className="pt-kicker">{type === 'weekly' ? 'Weekly highlights' : 'Monthly accomplishments'}</div>
          <h1 className="pt-h1">{r.title}</h1>
          <div className="pt-muted">Published {fmtDate(rec.publishedAt.slice(0, 10))}</div>
        </div>
        <div className="pt-row pt-noprint">
          <select className="pt-select" value={rec.id} onChange={(e) => go(type, e.target.value)} aria-label="Reporting period">
            {list.map((l) => (
              <option key={l.id} value={l.id}>
                {fmtRange(l.periodStart, l.periodEnd)}
              </option>
            ))}
          </select>
          <button type="button" className="pt-btn sm" onClick={() => window.print()}>
            Export PDF
          </button>
        </div>
      </div>
      <div className="pt-card">
        <h2 className="pt-h2">Summary</h2>
        <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{r.executiveSummary || NOT_PROVIDED}</p>
      </div>
      <div className="pt-kpis">
        <div className="pt-card">
          <div className="pt-kpi-l">Overall progress</div>
          <div className="pt-kpi-v p">{r.metrics.actualPct.toFixed(1)}%</div>
          <div className="pt-kpi-s">Planned {r.metrics.plannedPct.toFixed(1)}%</div>
        </div>
        <div className="pt-card">
          <div className="pt-kpi-l">Progress this {type === 'weekly' ? 'week' : 'month'}</div>
          <div className="pt-kpi-v">{r.progressGain === null ? 'Pending update' : `${r.progressGain >= 0 ? '+' : ''}${r.progressGain} pts`}</div>
        </div>
        <div className="pt-card">
          <div className="pt-kpi-l">Projected completion</div>
          <div className="pt-kpi-v">{fmtOrPending(r.metrics.projectedCompletion)}</div>
          <div className="pt-kpi-s">Target {fmtOrPending(r.metrics.targetCompletion)}</div>
        </div>
      </div>
      {r.constructionNarrative && (
        <div className="pt-card">
          <h2 className="pt-h2">{type === 'weekly' ? 'Significant developments' : 'Major construction accomplishments'}</h2>
          <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{r.constructionNarrative}</p>
        </div>
      )}
      {periodUpdates.length > 0 && (
        <div className="pt-card">
          <h2 className="pt-h2">Important updates</h2>
          <div className="pt-list">
            {periodUpdates.map((u) => (
              <div key={u.id} className="pt-li">
                <div className="pt-li-main">
                  <div className="pt-li-t">{u.title}</div>
                  <div className="pt-li-s">
                    {fmtDate(u.content.date)} · {u.content.text}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="pt-card">
        <h2 className="pt-h2">Completed {type === 'weekly' ? 'this week' : 'this month'}</h2>
        <RowsTable rows={r.completed} empty="No activities were completed in this period." />
      </div>
      <div className="pt-card">
        <h2 className="pt-h2">{type === 'weekly' ? 'Current site activities' : 'Ongoing activities'}</h2>
        <RowsTable rows={r.ongoing} empty="No ongoing activities in this period." />
      </div>
      {r.phases && (
        <div className="pt-card">
          <h2 className="pt-h2">Progress by phase (end of period)</h2>
          {r.phases.map((p) => (
            <div key={p.label} className="pt-phase">
              <span>{p.label}</span>
              <Bar value={p.actual} planned={p.planned} />
              <span className="pt-muted" style={{ textAlign: 'right' }}>
                {p.actual.toFixed(0)}% / {p.planned.toFixed(0)}%
              </span>
            </div>
          ))}
        </div>
      )}
      <div className="pt-card">
        <h2 className="pt-h2">Milestones</h2>
        <RowsTable rows={r.milestones} empty="No milestones fell within this period." />
      </div>
      <div className="pt-card">
        <h2 className="pt-h2">{type === 'weekly' ? 'Upcoming activities (next week)' : "Next month's planned activities"}</h2>
        {r.nextPeriodNarrative && <p style={{ whiteSpace: 'pre-wrap', marginTop: 0 }}>{r.nextPeriodNarrative}</p>}
        <RowsTable rows={r.next} empty="No activities scheduled." />
      </div>
      {type === 'monthly' && (
        <div className="pt-card">
          <h2 className="pt-h2">Photographs &amp; documentation</h2>
          {periodPhotos.length ? <PhotoGrid photos={periodPhotos} /> : <Empty>No approved photographs for this period.</Empty>}
        </div>
      )}
    </div>
  );
};

const Gallery: React.FC<Ctx> = ({ photos }) => {
  const [cat, setCat] = useState('');
  const cats = Array.from(new Set(photos.map((p) => p.content?.category).filter(Boolean))) as string[];
  const shown = photos.filter((p) => !cat || p.content?.category === cat);
  const byMonth = new Map<string, PortalRecord[]>();
  shown.forEach((p) => {
    const k = String(p.content?.date || '').slice(0, 7) || 'Undated';
    byMonth.set(k, [...(byMonth.get(k) || []), p]);
  });
  return (
    <div className="pt-grid">
      <div className="pt-row" style={{ justifyContent: 'space-between' }}>
        <h1 className="pt-h1">Progress gallery</h1>
        {cats.length > 0 && (
          <select className="pt-select" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category">
            <option value="">All categories</option>
            {cats.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        )}
      </div>
      {shown.length ? (
        Array.from(byMonth.entries()).map(([k, ps]) => (
          <div key={k} className="pt-card">
            <h2 className="pt-h2">{k === 'Undated' ? k : monthLabel(k)}</h2>
            <PhotoGrid photos={ps} />
          </div>
        ))
      ) : (
        <Empty>No approved progress photographs have been published yet.</Empty>
      )}
    </div>
  );
};

export const _portalHelpers = { addDays, todayIso };
