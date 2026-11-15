/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * MOBILE INTERNAL COMMAND CENTER — dedicated phone layout for site personnel
 * and managers: app bar (sync status, notifications), bottom navigation
 * (Home, Daily Report, Schedule, Actions, More) and a compact dashboard with
 * expandable sections. Every module is the same component as on desktop and
 * uses the same database, calculations and role permissions.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Home,
  ClipboardPen,
  CalendarDays,
  ListChecks,
  Menu,
  ChevronDown,
  TrendingUp,
  Plus,
  Camera,
  FileText,
  ShieldAlert,
  RefreshCw,
  CheckSquare,
  CalendarRange,
  ExternalLink,
  LogOut,
  UserCog,
  ScrollText,
} from 'lucide-react';
import '../portal/mobile.css';
import { useCommand } from './context.tsx';
import { SECTIONS, NAV_GROUPS, renderSectionBody, resolveSection, type SlideKey } from './Shell.tsx';
import { HealthBadge, StatusPill, SyncChip, SYNC_LABEL, Banner, Empty, Pill, PRIORITY_HEX } from './ui.tsx';
import { NotificationBell, useNotifications } from './Notifications.tsx';
import { useManagementActions } from './CommandCenter.tsx';
import { canOpenModule, ROLE_LABEL } from '../auth/roles.ts';
import { forecastCompletion } from '../domain/metrics.ts';
import { diffDays, fmtDate } from '../domain/dates.ts';
import { authService } from '../firebase/authService.ts';
import { LOGO_SVG } from '../constants/assets.ts';
import { Sheet, InstallRow } from '../portal/MobilePortal.tsx';
import { useInstallState, applyUpdate } from '../pwa/pwa.ts';
import { plural } from '../utils/plural.ts';

const TABS = [
  { id: 'command', label: 'Home', icon: Home, route: 'command' },
  { id: 'site', label: 'Daily Report', icon: ClipboardPen, route: 'site/new' },
  { id: 'calendar', label: 'Schedule', icon: CalendarDays, route: 'calendar/agenda' },
  { id: 'issues', label: 'Actions', icon: ListChecks, route: 'issues/attention' },
];

/** Phone tables: label every cell so rows can be shown as stacked cards (no sideways scrolling). */
function useStackedTables(ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const label = () => {
      root.querySelectorAll('table').forEach((t) => {
        const heads = Array.from(t.querySelectorAll('thead th')).map((th) => (th.textContent || '').trim());
        if (!heads.length) return;
        t.classList.add('mb-stack');
        t.querySelectorAll('tbody tr').forEach((tr) =>
          Array.from(tr.children).forEach((td, i) => {
            if (heads[i] && (td as HTMLElement).dataset.label !== heads[i]) (td as HTMLElement).dataset.label = heads[i];
          })
        );
      });
    };
    label();
    const mo = new MutationObserver(label);
    mo.observe(root, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [ref]);
}

export const MobileShell: React.FC<{ renderSlide: (k: SlideKey) => React.ReactNode; renderDeck: () => React.ReactNode }> = ({ renderSlide, renderDeck }) => {
  const { route, actions, user, dataSync, isAdmin } = useCommand();
  const { section, tab } = resolveSection(route);
  const [more, setMore] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const install = useInstallState();
  const { mgmt } = useManagementActions();
  useStackedTables(mainRef);
  useEffect(() => {
    window.scrollTo({ top: 0 });
    setMore(false);
  }, [route.section, route.tab]);

  const allowed = SECTIONS.filter((s) => canOpenModule(user.role, s.id));
  const tabs = TABS.filter((t) => canOpenModule(user.role, t.id));
  const active = tabs.some((t) => t.id === section.id) ? section.id : 'more';

  return (
    <div className="mb mb-internal">
      <header className="mb-bar">
        <button type="button" className="mb-brand" onClick={() => actions.navigate('command')} aria-label="Home">
          <img src={LOGO_SVG} alt="" />
          <span>
            <b>{section.id === 'command' ? 'Master Tracker' : section.label}</b>
            <em>{ROLE_LABEL[user.role]}</em>
          </span>
        </button>
        <span className={`mb-sync ${dataSync.state}`} title={SYNC_LABEL[dataSync.state]?.detail} role="status" aria-label={`Data sync: ${SYNC_LABEL[dataSync.state]?.label}`}>
          <i />
          {dataSync.state === 'live' ? 'Live' : 'Not synced'}
        </span>
        <span className="mb-bell">
          <NotificationBell />
        </span>
        <button type="button" className="mb-icon" onClick={() => setMore(true)} aria-label="All modules and settings">
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

      <main className="mb-main" ref={mainRef}>
        {section.id === 'command' ? (
          <MobileDashboard />
        ) : (
          <>
            {section.tabs && section.tabs.length > 1 && (
              <div className="mb-chips" role="tablist">
                {section.tabs.map((t) => (
                  <button key={t.id} type="button" role="tab" aria-selected={t.id === tab?.id} className={t.id === tab?.id ? 'on' : ''} onClick={() => actions.navigate(`${section.id}/${t.id}`)}>
                    {t.label}
                  </button>
                ))}
              </div>
            )}
            {renderSectionBody(section, tab, route, renderSlide, renderDeck)}
          </>
        )}
      </main>

      <nav className="mb-tabs" aria-label="Main">
        {tabs.map((t) => (
          <button key={t.id} type="button" className={active === t.id ? 'on' : ''} aria-current={active === t.id ? 'page' : undefined} onClick={() => actions.navigate(t.route)}>
            <span className="mb-tab-ico">
              <t.icon size={22} strokeWidth={active === t.id ? 2.3 : 1.9} aria-hidden />
              {t.id === 'issues' && mgmt.length > 0 && <span className="mb-badge sm">{mgmt.length > 9 ? '9+' : mgmt.length}</span>}
            </span>
            <span>{t.label}</span>
          </button>
        ))}
        <button type="button" className={active === 'more' ? 'on' : ''} onClick={() => setMore(true)}>
          <Menu size={22} aria-hidden />
          <span>More</span>
        </button>
      </nav>

      {more && (
        <Sheet title="All modules" onClose={() => setMore(false)}>
          <div className="mb-menu">
            {NAV_GROUPS.map((g) => {
              const items = allowed.filter((s) => s.group === g);
              if (!items.length) return null;
              return (
                <React.Fragment key={g}>
                  <div className="mb-menu-group">{g}</div>
                  {items.map((s) => (
                    <button key={s.id} type="button" onClick={() => actions.navigate(s.id)} aria-current={s.id === section.id ? 'page' : undefined} className={s.id === section.id ? 'on' : ''}>
                      {s.label}
                    </button>
                  ))}
                </React.Fragment>
              );
            })}
            <div className="mb-menu-group">App</div>
            <a href="#/portal/overview" className="mb-menu-a">
              <ExternalLink size={20} aria-hidden /> Client Portal Preview
            </a>
            {isAdmin && (
              <>
                <button type="button" onClick={actions.openAdminPanel}>
                  <UserCog size={20} aria-hidden /> User Management
                </button>
                <button type="button" onClick={actions.openAuditLogs}>
                  <ScrollText size={20} aria-hidden /> Audit Logs
                </button>
              </>
            )}
            <InstallRow />
            <div className="mb-menu-user">
              <b>{user.name}</b>
              <span>{ROLE_LABEL[user.role]}</span>
            </div>
            <button type="button" onClick={() => authService.signOut()}>
              <LogOut size={20} aria-hidden /> Sign out
            </button>
            <p className="mb-menu-note">For the full workspace with every table and chart, open the Master Project Tracker on a computer or tablet.</p>
          </div>
        </Sheet>
      )}
    </div>
  );
};

// ---------------- Mobile management dashboard ----------------
const Section: React.FC<{ title: string; count?: number; tone?: 'bad' | 'warn'; open?: boolean; children: React.ReactNode }> = ({ title, count, tone, open, children }) => (
  <details className="mb-card mb-sec" open={open}>
    <summary>
      <span>{title}</span>
      {count !== undefined && <span className={`mb-count ${tone || ''}`}>{count}</span>}
      <ChevronDown size={18} aria-hidden className="mb-chev" />
    </summary>
    <div className="mb-sec-b">{children}</div>
  </details>
);

export const MobileDashboard: React.FC = () => {
  const { metrics: m, register, today, actions, dataSync, user, isManager } = useCommand();
  const { mgmt, pendingApprovals } = useManagementActions();
  const notif = useNotifications();
  const delayed = register.filter((r) => r.status === 'Delayed');
  const milestones = register
    .filter((r) => (r.kind === 'milestone' || r.kind === 'pour') && r.status !== 'Completed')
    .sort((a, b) => (a.finish || '').localeCompare(b.finish || ''))
    .slice(0, 5);
  const forecast = forecastCompletion(m);
  const quick = [
    { label: 'Update Construction Progress', icon: TrendingUp, route: 'tracker' },
    { label: 'Submit Daily Construction Report', icon: ClipboardPen, route: 'site/new' },
    { label: 'Daily Report History', icon: ClipboardPen, route: 'site/history' },
    { label: 'Upload Site Photos', icon: Camera, route: 'site/new' },
    { label: 'Report Site Issues', icon: ShieldAlert, route: 'issues/log/new' },
    { label: 'Add Construction Activity', icon: Plus, route: 'tracker/register/new' },
    { label: 'Update Activity Status', icon: CheckSquare, route: 'tracker/register/status=Ongoing' },
    { label: 'Review Pending Approvals', icon: FileText, route: isManager ? 'publishing/overview' : 'reports/weekly' },
    { label: 'View Project Schedule', icon: CalendarRange, route: 'calendar/agenda' },
  ].filter((q) => canOpenModule(user.role, q.route.split('/')[0]));
  const varTone = m.variancePct < -3 ? 'bad' : m.variancePct < 0 ? 'warn' : 'ok';

  return (
    <div className="mb-dash">
      {dataSync.state !== 'live' && (
        <Banner kind="warn">
          <b>{SYNC_LABEL[dataSync.state]?.label}.</b> Figures may differ from other users until the shared database is reachable.
        </Banner>
      )}
      <section className="mb-card mb-kpi-card">
        <div className="mb-card-h">
          <h2>Project Status</h2>
          <HealthBadge level={m.health} />
        </div>
        <div className="mb-kpis">
          <div>
            <span>Actual Progress</span>
            <b className="accent">{m.actualPct.toFixed(1)}%</b>
          </div>
          <div>
            <span>Planned Progress</span>
            <b>{m.plannedPct.toFixed(1)}%</b>
          </div>
          <div>
            <span>Variance</span>
            <b className={varTone}>
              {m.variancePct >= 0 ? '+' : ''}
              {m.variancePct.toFixed(1)}
            </b>
            <small>percentage points</small>
          </div>
          <div>
            <span>Forecast Completion</span>
            <b className="date">{fmtDate(forecast)}</b>
            <small>Target {fmtDate(m.targetCompletion)}</small>
          </div>
        </div>
        <SyncChip state={dataSync.state} />
      </section>

      <section className="mb-quick" aria-label="Quick actions">
        {quick.map((q) => (
          <button key={q.label} type="button" onClick={() => actions.navigate(q.route)}>
            <q.icon size={22} aria-hidden />
            <span>{q.label}</span>
          </button>
        ))}
      </section>

      <Section title="Delayed Activities" count={delayed.length} tone={delayed.length ? 'bad' : undefined} open={delayed.length > 0}>
        {delayed.length ? (
          <ul className="mb-list">
            {delayed.slice(0, 8).map((r) => (
              <li key={r.id}>
                <button type="button" className="mb-row" onClick={() => actions.openActivity(r.id)}>
                  <b>{r.name}</b>
                  <span>
                    {r.workstream} · {r.finish ? `${plural(diffDays(r.finish, today), 'day')} past ${fmtDate(r.finish)}` : 'no target date'} · {r.owner || 'Unassigned'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No delayed activities.</Empty>
        )}
      </Section>

      <Section title="Pending Management Actions" count={mgmt.length} tone={mgmt.some((a) => a.priority === 'Critical') ? 'bad' : mgmt.length ? 'warn' : undefined}>
        {mgmt.length ? (
          <ul className="mb-list">
            {mgmt.slice(0, 8).map((a) => (
              <li key={a.id}>
                <button type="button" className="mb-row" onClick={a.open}>
                  <span className="mb-row-top">
                    <Pill label={a.priority} color={PRIORITY_HEX[a.priority]} />
                    <em>{a.type}</em>
                  </span>
                  <b>{a.title}</b>
                  <span>
                    {a.responsible || 'Unassigned'}
                    {a.target ? ` · by ${fmtDate(a.target)}` : ''}
                  </span>
                  <span className="mb-act">{a.action}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No pending management actions.</Empty>
        )}
        <button type="button" className="mb-more" onClick={() => actions.navigate('issues/attention')}>
          View All Management Actions
        </button>
      </Section>

      <Section title="Upcoming Milestones" count={milestones.length}>
        <ul className="mb-list">
          {milestones.map((r) => (
            <li key={r.id}>
              <button type="button" className="mb-row" onClick={() => actions.openActivity(r.id)}>
                <span className="mb-row-top">
                  <StatusPill status={r.status} />
                  <em>{r.finish ? (r.finish < today ? `${diffDays(r.finish, today)} days overdue` : `in ${diffDays(today, r.finish)} days`) : ''}</em>
                </span>
                <b>{r.name}</b>
                <span>
                  {fmtDate(r.finish)} · {r.owner || 'Unassigned'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Pending Approvals" count={pendingApprovals.length}>
        {pendingApprovals.length ? (
          <ul className="mb-list">
            {pendingApprovals.map((p) => (
              <li key={p.id}>
                <button type="button" className="mb-row" onClick={() => actions.navigate(p.route)}>
                  <b>{p.title}</b>
                  <span>
                    {p.kind} · {p.by}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>Nothing is waiting for approval.</Empty>
        )}
      </Section>

      <Section title="Notifications" count={notif.unread}>
        <ul className="mb-list">
          {notif.items.slice(0, 5).map((n) => (
            <li key={n.key}>
              <button type="button" className="mb-row" onClick={() => notif.open(n)}>
                <b>{n.title}</b>
                <span>{n.detail}</span>
              </button>
            </li>
          ))}
        </ul>
        <button type="button" className="mb-more" onClick={() => actions.navigate('notifications')}>
          All Notifications
        </button>
      </Section>
    </div>
  );
};
