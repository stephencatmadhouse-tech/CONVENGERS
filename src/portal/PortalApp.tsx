/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * EXECUTIVE & CLIENT PORTAL
 * Reads ONLY the `portal` collection — sanitized content that an authorized
 * internal user has Approved and Published. Nothing here is computed from
 * internal records, so unpublished or draft information can never appear.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { User } from '../types/index.ts';
import { portalStore } from '../firebase/opsStores.ts';
import { useStore } from '../firebase/useStore.ts';
import { authService } from '../firebase/authService.ts';
import { ROLE_LABEL } from '../auth/roles.ts';
import { LOGO_SVG } from '../constants/assets.ts';
import { PortalRecord, PortalSnapshot, PortalReport, PortalReportRow, NOT_PROVIDED, fmtOrPending } from '../domain/portal.ts';
import { addDays, diffDays, fmtDate, fmtRange, monthLabel, todayIso } from '../domain/dates.ts';

const TABS = [
  { id: 'overview', label: 'Executive Overview' },
  { id: 'progress', label: 'Construction Progress' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'milestones', label: 'Milestones' },
  { id: 'monthly', label: 'Monthly Accomplishments' },
  { id: 'weekly', label: 'Weekly Highlights' },
  { id: 'gallery', label: 'Gallery' },
  { id: 'considerations', label: 'Considerations' },
  { id: 'reports', label: 'Reports' },
];

const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  'On Track': { bg: '#22A06B', fg: '#FFFFFF' },
  'At Risk': { bg: '#F5A623', fg: '#303030' },
  Critical: { bg: '#E5484D', fg: '#FFFFFF' },
};
const ITEM_STATUS: Record<string, string> = {
  Completed: '#22A06B',
  'In progress': '#7026C8',
  'Behind schedule': '#E5484D',
  Scheduled: '#777777',
  'On hold': '#777777',
  Target: '#777777',
  Confirmed: '#22A06B',
  Tentative: '#F5A623',
  'At risk': '#E5484D',
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

const Pill: React.FC<{ label: string }> = ({ label }) => {
  const c = ITEM_STATUS[label] || '#777777';
  return (
    <span className="pt-pill" style={{ color: c, borderColor: c }}>
      {label}
    </span>
  );
};

const Bar: React.FC<{ value: number; planned?: number }> = ({ value, planned }) => (
  <div className="pt-bar" title={`Actual ${Math.round(value)}%${planned !== undefined ? ` · planned ${Math.round(planned)}%` : ''}`}>
    <b style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    {planned !== undefined && <i style={{ left: `calc(${Math.max(0, Math.min(100, planned))}% - 1px)` }} />}
  </div>
);

const Empty: React.FC<{ children: React.ReactNode }> = ({ children }) => <div className="pt-empty">{children}</div>;

export const PortalApp: React.FC<{ user: User; mode: 'external' | 'preview' }> = ({ user, mode }) => {
  const portal = useStore(portalStore);
  const [tab, param, go] = usePortalRoute();

  const byKind = useMemo(() => {
    const items = portal.items.filter((r) => !r.localOnly || mode === 'preview');
    const sort = (a: PortalRecord, b: PortalRecord) => b.publishedAt.localeCompare(a.publishedAt);
    return {
      snapshot: items.filter((r) => r.kind === 'snapshot').sort(sort)[0],
      reports: items.filter((r) => r.kind === 'report').sort((a, b) => (b.periodEnd || '').localeCompare(a.periodEnd || '')),
      photos: items.filter((r) => r.kind === 'photo').sort((a, b) => (b.content?.date || '').localeCompare(a.content?.date || '')),
      documents: items.filter((r) => r.kind === 'document').sort(sort),
      considerations: items.filter((r) => r.kind === 'consideration').sort(sort),
      updates: items.filter((r) => r.kind === 'update').sort((a, b) => (b.content?.date || '').localeCompare(a.content?.date || '')),
    };
  }, [portal.items, mode]);

  const snap = byKind.snapshot?.content as PortalSnapshot | undefined;
  const ctx = { snap, snapRec: byKind.snapshot, ...byKind, go, param };

  return (
    <div className="pt">
      {mode === 'preview' && (
        <div className="pt-preview pt-noprint">
          <b>Internal preview of the Executive &amp; Client Portal.</b> External users see exactly this — only Published content.
          <a className="pt-btn sm" href="#/command">
            ← Back to Project Management System
          </a>
        </div>
      )}
      <header className="pt-header">
        <div className="pt-header-in">
          <div className="pt-brand">
            <img src={LOGO_SVG} alt="Convengers emblem" />
            <div>
              <div className="pt-brand-name">Convengers Bahay Build</div>
              <div className="pt-brand-sub">Executive &amp; Client Reporting Portal</div>
            </div>
            <div className="pt-user">
              <span>
                {user.name} · {ROLE_LABEL[user.role]}
              </span>
              {mode === 'external' && (
                <button type="button" className="pt-btn sm" onClick={() => authService.signOut()}>
                  Sign out
                </button>
              )}
            </div>
          </div>
          <nav className="pt-nav" aria-label="Portal sections">
            {TABS.map((t) => (
              <button key={t.id} type="button" className={`pt-tab ${tab === t.id ? 'on' : ''}`} onClick={() => go(t.id)} aria-current={tab === t.id ? 'page' : undefined}>
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      </header>
      <main className="pt-main">
        {!portal.loaded ? (
          <Empty>Loading published project information…</Empty>
        ) : portal.error === 'unreachable' && !portal.items.length ? (
          <Empty>The project database cannot be reached right now. Check your internet connection and refresh the page.</Empty>
        ) : portal.error === 'permission-denied' && mode === 'external' ? (
          <Empty>
            The client portal could not be loaded because the server refused access. If your access was granted recently, sign out and sign in again;
            otherwise please contact the project&apos;s System Administrator.
          </Empty>
        ) : (
          <>
            {mode === 'preview' && portal.error === 'permission-denied' && (
              <div className="pt-note pt-noprint" style={{ borderLeftColor: '#F5A623', marginBottom: 16 }}>
                <b>Shared portal storage is not active yet.</b> The database security rules on the server have not been updated, so the shared{' '}
                <code>portal</code> collection cannot be read — by anyone, including administrators. Deploy the updated <code>firestore.rules</code> (see{' '}
                <i>docs/COMMAND_CENTER_AUDIT.md</i>, section 8). Until then this preview shows only items published from this device, and external users
                cannot see any published content.
              </div>
            )}
            {tab === 'overview' && <Overview {...ctx} />}
            {tab === 'progress' && <Progress {...ctx} />}
            {tab === 'timeline' && <Timeline {...ctx} />}
            {tab === 'milestones' && <Milestones {...ctx} />}
            {tab === 'monthly' && <ReportsView {...ctx} type="monthly" />}
            {tab === 'weekly' && <ReportsView {...ctx} type="weekly" />}
            {tab === 'gallery' && <Gallery {...ctx} />}
            {tab === 'considerations' && <Considerations {...ctx} />}
            {tab === 'reports' && <Downloads {...ctx} />}
          </>
        )}
      </main>
      <footer className="pt-footer">
        Information on this portal is published by the Convengers Bahay Build project team after review and approval.
        {byKind.snapshot ? ` Project status last published ${fmtDate(byKind.snapshot.publishedAt.slice(0, 10))}.` : ''} Dates marked “Tentative” or “Target” are not yet confirmed
        commitments.
      </footer>
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
};

const NoSnapshot = () => (
  <Empty>
    The project team has not yet published a project status update. Progress information will appear here once it has been reviewed and approved.
  </Empty>
);

const Overview: React.FC<Ctx> = ({ snap, snapRec, reports, considerations, go }) => {
  if (!snap) return <NoSnapshot />;
  const st = STATUS_STYLE[snap.status] || { bg: '#777777', fg: '#FFFFFF' };
  const nextMs = snap.milestones.filter((m) => m.status !== 'Completed' && m.target && m.target >= snap.asOf).slice(0, 4);
  const latestWeekly = reports.find((r) => r.content?.type === 'weekly');
  return (
    <div className="pt-grid">
      <div className="pt-row" style={{ justifyContent: 'space-between' }}>
        <div>
          <div className="pt-kicker">Reporting period · {snap.reportingPeriod}</div>
          <h1 className="pt-h1">{snap.projectName}</h1>
          <div className="pt-muted">
            Status as of {fmtDate(snap.asOf)} · published {fmtDate(snapRec!.publishedAt.slice(0, 10))}
          </div>
        </div>
        <span className="pt-status" style={{ background: st.bg, color: st.fg }}>
          {snap.status}
        </span>
      </div>
      <div className="pt-note">{snap.statusNote}</div>
      <div className="pt-kpis">
        <div className="pt-card">
          <div className="pt-kpi-l">Overall construction progress</div>
          <div className="pt-kpi-v p">{snap.actualPct.toFixed(1)}%</div>
          <div className="pt-kpi-s">Planned for this date: {snap.plannedPct.toFixed(1)}%</div>
        </div>
        <div className="pt-card">
          <div className="pt-kpi-l">Activities completed</div>
          <div className="pt-kpi-v">
            {snap.counts.completed} / {snap.counts.total}
          </div>
          <div className="pt-kpi-s">{snap.counts.ongoing} in progress</div>
        </div>
        <div className="pt-card">
          <div className="pt-kpi-l">Target completion</div>
          <div className="pt-kpi-v">{fmtOrPending(snap.targetCompletion)}</div>
          <div className="pt-kpi-s">Turnover</div>
        </div>
        <div className="pt-card">
          <div className="pt-kpi-l">Projected completion</div>
          <div className="pt-kpi-v">{fmtOrPending(snap.projectedCompletion)}</div>
          <div className="pt-kpi-s">Based on the current approved schedule</div>
        </div>
      </div>
      <div className="pt-grid pt-g2">
        <div className="pt-card">
          <h2 className="pt-h2">Progress by construction phase</h2>
          {snap.phases.map((p) => (
            <div key={p.key} className="pt-phase">
              <span>{p.label}</span>
              <Bar value={p.actual} planned={p.planned} />
              <span className="pt-muted" style={{ textAlign: 'right' }}>
                {p.actual.toFixed(0)}%
              </span>
            </div>
          ))}
          <div className="pt-small">Bar = actual progress · line = planned progress for this date</div>
        </div>
        <div className="pt-card">
          <h2 className="pt-h2">Upcoming milestones</h2>
          {nextMs.length ? (
            <div className="pt-list">
              {nextMs.map((m) => (
                <div key={m.label} className="pt-li">
                  <div className="pt-li-main">
                    <div className="pt-li-t">{m.label}</div>
                    <div className="pt-li-s">
                      {m.targetText} · {m.target ? `${diffDays(snap.asOf, m.target)} days` : ''}
                    </div>
                  </div>
                  <Pill label={m.commitment === 'Target' ? 'Target' : m.commitment} />
                </div>
              ))}
            </div>
          ) : (
            <Empty>No upcoming milestones published.</Empty>
          )}
          <button type="button" className="pt-btn sm" style={{ marginTop: 10 }} onClick={() => go('milestones')}>
            All milestones
          </button>
        </div>
      </div>
      <div className="pt-grid pt-g2">
        <div className="pt-card">
          <h2 className="pt-h2">Latest weekly highlights</h2>
          {latestWeekly ? (
            <>
              <div className="pt-li-t">{latestWeekly.title}</div>
              <p className="pt-muted" style={{ whiteSpace: 'pre-wrap', marginTop: 6 }}>
                {(latestWeekly.content as PortalReport).executiveSummary}
              </p>
              <button type="button" className="pt-btn sm" style={{ marginTop: 10 }} onClick={() => go('weekly', latestWeekly.id)}>
                Read weekly highlights
              </button>
            </>
          ) : (
            <Empty>No weekly report published yet.</Empty>
          )}
        </div>
        <div className="pt-card">
          <h2 className="pt-h2">Major considerations</h2>
          {considerations.length ? (
            <div className="pt-list">
              {considerations.slice(0, 3).map((c) => (
                <div key={c.id} className="pt-li">
                  <div className="pt-li-main">
                    <div className="pt-li-t">{c.title}</div>
                    <div className="pt-li-s">{String(c.content?.text || '').slice(0, 160)}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty>No major considerations published.</Empty>
          )}
        </div>
      </div>
    </div>
  );
};

const ItemList: React.FC<{ items: PortalSnapshot['completed']; empty: string; mode: 'done' | 'now' | 'next' }> = ({ items, empty, mode }) =>
  items.length ? (
    <div className="pt-list">
      {items.map((i, idx) => (
        <div key={i.name + idx} className="pt-li">
          <div className="pt-li-main">
            <div className="pt-li-t">{i.name}</div>
            <div className="pt-li-s">
              {i.phase} ·{' '}
              {mode === 'done'
                ? `completed ${i.actualFinish ? fmtDate(i.actualFinish) : fmtDate(i.finish)}`
                : mode === 'now'
                ? `${fmtRange(i.start, i.finish)} · ${i.progress}%`
                : `${fmtRange(i.start, i.finish)}`}
            </div>
          </div>
          <Pill label={mode === 'next' ? (i.commitment === 'Target' ? 'Target' : i.commitment) : i.status} />
        </div>
      ))}
    </div>
  ) : (
    <Empty>{empty}</Empty>
  );

const Progress: React.FC<Ctx> = ({ snap, reports }) => {
  if (!snap) return <NoSnapshot />;
  const monthly = reports.find((r) => r.content?.type === 'monthly');
  const pctDeg = Math.max(0, Math.min(100, snap.actualPct)) * 3.6;
  return (
    <div className="pt-grid">
      <h1 className="pt-h1">Construction progress</h1>
      <div className="pt-grid pt-g2">
        <div className="pt-card" style={{ display: 'flex', gap: 22, alignItems: 'center', flexWrap: 'wrap' }}>
          <div
            role="img"
            aria-label={`Overall progress ${snap.actualPct}%`}
            style={{
              width: 150,
              height: 150,
              borderRadius: '50%',
              background: `conic-gradient(#7026C8 ${pctDeg}deg, #EFEFF2 0deg)`,
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <div style={{ width: 112, height: 112, borderRadius: '50%', background: '#fff', display: 'grid', placeItems: 'center' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ font: "700 26px 'Barlow'", color: '#7026C8' }}>{snap.actualPct.toFixed(1)}%</div>
                <div className="pt-small" style={{ margin: 0 }}>
                  overall
                </div>
              </div>
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 180 }}>
            <div className="pt-kpi-l">Planned for {fmtDate(snap.asOf)}</div>
            <div className="pt-kpi-v">{snap.plannedPct.toFixed(1)}%</div>
            <div className="pt-kpi-s">
              {snap.counts.completed} completed · {snap.counts.ongoing} in progress · {snap.counts.upcoming} scheduled
            </div>
          </div>
        </div>
        <div className="pt-card">
          <h2 className="pt-h2">By construction phase</h2>
          {snap.phases.map((p) => (
            <div key={p.key} className="pt-phase">
              <span>{p.label}</span>
              <Bar value={p.actual} planned={p.planned} />
              <span className="pt-muted" style={{ textAlign: 'right' }}>
                {p.actual.toFixed(0)}% / {p.planned.toFixed(0)}%
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="pt-grid pt-g3">
        <div className="pt-card">
          <h2 className="pt-h2">Completed (last 30 days)</h2>
          <ItemList items={snap.completed} empty="No activities completed in the last 30 days." mode="done" />
        </div>
        <div className="pt-card">
          <h2 className="pt-h2">Ongoing</h2>
          <ItemList items={snap.ongoing} empty="No activities currently in progress." mode="now" />
        </div>
        <div className="pt-card">
          <h2 className="pt-h2">Upcoming (next 30 days)</h2>
          <ItemList items={snap.upcoming} empty="No activities scheduled in the next 30 days." mode="next" />
        </div>
      </div>
      <div className="pt-card">
        <h2 className="pt-h2">Key construction accomplishments</h2>
        {monthly && (monthly.content as PortalReport).constructionNarrative ? (
          <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{(monthly.content as PortalReport).constructionNarrative}</p>
        ) : (
          <Empty>{NOT_PROVIDED} — published with the next monthly report.</Empty>
        )}
      </div>
    </div>
  );
};

const Timeline: React.FC<Ctx> = ({ snap }) => {
  if (!snap) return <NoSnapshot />;
  const dates = [
    ...snap.phases.flatMap((p) => [p.plannedStart, p.plannedFinish, p.start, p.finish]),
    ...snap.milestones.map((m) => m.target),
  ].filter(Boolean) as string[];
  const start = dates.sort()[0];
  const end = dates.sort().slice(-1)[0];
  if (!start || !end) return <Empty>{NOT_PROVIDED}</Empty>;
  const span = Math.max(1, diffDays(start, end));
  const x = (iso?: string) => (iso ? `${(diffDays(start, iso) / span) * 100}%` : '0%');
  const w = (a?: string, b?: string) => (a && b ? `${Math.max(0.6, ((diffDays(a, b) + 1) / span) * 100)}%` : '0%');
  const months: string[] = [];
  let m = start.slice(0, 7) + '-01';
  while (m <= end && months.length < 24) {
    months.push(m);
    const d = new Date(+m.slice(0, 4), +m.slice(5, 7), 1);
    m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  }
  return (
    <div className="pt-grid">
      <h1 className="pt-h1">Project timeline</h1>
      <div className="pt-card">
        <div className="pt-row pt-small" style={{ marginBottom: 8 }}>
          <span>
            <span style={{ display: 'inline-block', width: 18, height: 6, background: '#d7d7de', borderRadius: 3, marginRight: 4 }} /> Original plan
          </span>
          <span>
            <span style={{ display: 'inline-block', width: 18, height: 8, background: '#7026C8', borderRadius: 3, marginRight: 4 }} /> Current schedule
          </span>
          <span>◆ Milestone</span>
          <span>
            <span style={{ display: 'inline-block', width: 2, height: 12, background: '#A34FEA', marginRight: 4 }} /> Status date
          </span>
        </div>
        <div className="pt-tl-row pt-small" style={{ fontWeight: 700 }}>
          <span />
          <div className="pt-tl-track" style={{ height: 18 }}>
            {months.map((mm) => (
              <span key={mm} style={{ position: 'absolute', left: x(mm), whiteSpace: 'nowrap' }}>
                {monthLabel(mm.slice(0, 7)).slice(0, 3)} ’{mm.slice(2, 4)}
              </span>
            ))}
          </div>
        </div>
        {snap.phases.map((p) => (
          <div key={p.key} className="pt-tl-row">
            <span>{p.label}</span>
            <div className="pt-tl-track">
              {p.plannedStart && <div className="pt-tl-plan" style={{ left: x(p.plannedStart), width: w(p.plannedStart, p.plannedFinish) }} />}
              {p.start && <div className="pt-tl-cur" style={{ left: x(p.start), width: w(p.start, p.finish) }} title={`${fmtRange(p.start, p.finish)} · ${p.actual}% complete`} />}
              <div className="pt-tl-today" style={{ left: x(snap.asOf) }} />
            </div>
          </div>
        ))}
        <div className="pt-tl-row">
          <span>Key milestones</span>
          <div className="pt-tl-track">
            {snap.milestones
              .filter((mm) => mm.target)
              .map((mm) => (
                <div key={mm.label} className="pt-tl-ms" style={{ left: x(mm.target) }} title={`${mm.label} · ${mm.targetText}`} />
              ))}
            <div className="pt-tl-today" style={{ left: x(snap.asOf) }} />
          </div>
        </div>
      </div>
      <div className="pt-card">
        <h2 className="pt-h2">Important schedule updates</h2>
        {snap.scheduleUpdates.length ? (
          <div className="pt-list">
            {snap.scheduleUpdates.map((u) => (
              <div key={u.label} className="pt-li">
                <div className="pt-li-main">
                  <div className="pt-li-t">{u.label}</div>
                  <div className="pt-li-s">
                    Moved from {u.from} to {u.to}
                    {u.at ? ` · updated ${fmtDate(u.at)}` : ''}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty>No schedule changes to the approved plan have been published.</Empty>
        )}
      </div>
    </div>
  );
};

const Milestones: React.FC<Ctx> = ({ snap }) => {
  if (!snap) return <NoSnapshot />;
  return (
    <div className="pt-grid">
      <h1 className="pt-h1">Key milestones</h1>
      <div className="pt-table-wrap">
        <table className="pt-table">
          <thead>
            <tr>
              <th>Milestone</th>
              <th>Target date</th>
              <th>Date status</th>
              <th>Actual completion</th>
              <th>Status</th>
              <th style={{ minWidth: 120 }}>Progress</th>
            </tr>
          </thead>
          <tbody>
            {snap.milestones.map((m) => (
              <tr key={m.label}>
                <td style={{ fontWeight: 700 }}>{m.label}</td>
                <td>
                  {m.targetText}
                  {m.revised && m.baseline && <div className="pt-small">Originally {fmtDate(m.baseline)}</div>}
                </td>
                <td>
                  <Pill label={m.commitment === 'Target' ? 'Target' : m.commitment} />
                </td>
                <td>{m.actual ? fmtDate(m.actual) : m.status === 'Completed' ? NOT_PROVIDED : '—'}</td>
                <td>
                  <Pill label={m.status} />
                </td>
                <td>
                  <Bar value={m.progress} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="pt-small">Confirmed = committed date · Tentative = awaiting confirmation · Target = planned target, not yet a commitment.</div>
    </div>
  );
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
            Print / PDF
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

const PhotoGrid: React.FC<{ photos: PortalRecord[] }> = ({ photos }) => {
  const [open, setOpen] = useState<PortalRecord | null>(null);
  return (
    <>
      <div className="pt-gallery">
        {photos.map((p) => (
          <button key={p.id} type="button" className="pt-photo" onClick={() => setOpen(p)}>
            <img src={p.content.url} alt={p.title} loading="lazy" />
            <div>
              <b>{p.title}</b>
              <div className="pt-small" style={{ margin: 0 }}>
                {fmtDate(p.content.date)}
                {p.content.category ? ` · ${p.content.category}` : ''}
              </div>
            </div>
          </button>
        ))}
      </div>
      {open && (
        <div className="pt-lightbox" onClick={() => setOpen(null)} role="dialog" aria-modal="true">
          <img src={open.content.url} alt={open.title} />
          <div>
            <b>{open.title}</b> · {fmtDate(open.content.date)}
          </div>
          {open.content.caption && <div style={{ maxWidth: 700, textAlign: 'center' }}>{open.content.caption}</div>}
        </div>
      )}
    </>
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

const Considerations: React.FC<Ctx> = ({ considerations }) => (
  <div className="pt-grid">
    <h1 className="pt-h1">Major considerations</h1>
    <div className="pt-muted">Approved project concerns and schedule considerations that may affect the project.</div>
    {considerations.length ? (
      considerations.map((c) => (
        <div key={c.id} className="pt-card">
          <div className="pt-row" style={{ justifyContent: 'space-between' }}>
            <h2 className="pt-h2" style={{ margin: 0 }}>
              {c.title}
            </h2>
            {c.content?.category && <Pill label={c.content.category} />}
          </div>
          <p style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>{c.content?.text}</p>
          {c.content?.impact && <div className="pt-note" style={{ marginTop: 10 }}>Schedule impact: {c.content.impact}</div>}
          <div className="pt-small">Published {fmtDate(c.publishedAt.slice(0, 10))}</div>
        </div>
      ))
    ) : (
      <Empty>No major considerations have been published.</Empty>
    )}
  </div>
);

const Downloads: React.FC<Ctx> = ({ reports, documents, go }) => (
  <div className="pt-grid">
    <h1 className="pt-h1">Reports &amp; downloads</h1>
    <div className="pt-card">
      <h2 className="pt-h2">Published reports</h2>
      {reports.length ? (
        <div className="pt-list">
          {reports.map((r) => (
            <div key={r.id} className="pt-li">
              <div className="pt-li-main">
                <div className="pt-li-t">{r.title}</div>
                <div className="pt-li-s">
                  {r.content?.type === 'weekly' ? 'Weekly report' : 'Monthly report'} · {fmtRange(r.periodStart, r.periodEnd)} · published {fmtDate(r.publishedAt.slice(0, 10))}
                </div>
              </div>
              <button type="button" className="pt-btn sm" onClick={() => go(r.content?.type === 'weekly' ? 'weekly' : 'monthly', r.id)}>
                Open / print
              </button>
            </div>
          ))}
        </div>
      ) : (
        <Empty>No reports have been published yet.</Empty>
      )}
    </div>
    <div className="pt-card">
      <h2 className="pt-h2">Project documentation</h2>
      {documents.length ? (
        <div className="pt-list">
          {documents.map((d) => (
            <div key={d.id} className="pt-li">
              <div className="pt-li-main">
                <div className="pt-li-t">{d.title}</div>
                <div className="pt-li-s">
                  {d.content?.category || 'Document'} · {fmtDate(d.content?.date)}
                  {d.content?.description ? ` · ${d.content.description}` : ''}
                </div>
              </div>
              {d.content?.url ? (
                <a className="pt-btn sm" href={d.content.url} target="_blank" rel="noopener noreferrer">
                  Download
                </a>
              ) : (
                <span className="pt-small">{NOT_PROVIDED}</span>
              )}
            </div>
          ))}
        </div>
      ) : (
        <Empty>No documents have been published yet.</Empty>
      )}
    </div>
  </div>
);

export const _portalHelpers = { addDays, todayIso };
