/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Command Center shell: 12-section navigation, hash routing and module
 * hosting. Existing presentation slides are hosted inside their sections, so
 * nothing from the original dashboard is lost.
 */

import React, { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  Presentation,
  ListChecks,
  HardHat,
  Clapperboard,
  ChartGantt,
  Flag,
  FileText,
  ChartColumn,
  TriangleAlert,
  Archive as ArchiveIcon,
  Settings as SettingsIcon,
  Package,
  FolderOpen,
  Send,
  ExternalLink,
  ChevronDown,
  UserCog,
  ScrollText,
  CalendarClock,
  Box,
  ShieldCheck,
  RefreshCw,
  ClipboardPen,
  Gauge,
  Bell,
  CalendarDays,
  BookOpenText,
  CalendarRange,
  type LucideIcon,
  Link2,
} from 'lucide-react';
import { ROLE_LABEL, canOpenModule, landingModule } from '../auth/roles.ts';
import { Procurement, Manpower } from './Operations.tsx';
import { Documents } from './Documents.tsx';
import { Publishing } from './Publishing.tsx';
import { SummaryReports } from './SummaryReports.tsx';
import { useCommand } from './context.tsx';
import { SectionHeader } from './ui.tsx';
import { CommandCenter } from './CommandCenter.tsx';
import { Tracker } from './Tracker.tsx';
import { ScheduleCalendar, AlignmentView } from './Schedule.tsx';
import { Gantt } from './Gantt.tsx';
import { Milestones } from './Milestones.tsx';
import { ReportsPage } from './Reports.tsx';
import { Analytics, Forecast } from './Analytics.tsx';
import { AttentionList, IssueLog, Accountability } from './Issues.tsx';
import { Archive } from './Archive.tsx';
import { Settings } from './Settings.tsx';
import { ExecutiveDashboard } from './ExecutiveDashboard.tsx';
import { NotificationsPage, useNotifications } from './Notifications.tsx';
import { CalendarPage } from './CalendarPage.tsx';
import { JourneyManagement } from './JourneyManagement.tsx';
import { RolesPermissions, SyncPanel } from './SystemAdmin.tsx';
import { DailyReports } from './DailyReport.tsx';
import { NarrativeReports } from './Narrative.tsx';
import { ProductionCalendarAdmin } from './ProductionCalendarAdmin.tsx';
import { ProductionAlignmentAdmin, ProductionPortalSync } from './ProductionAlignmentAdmin.tsx';

export type SlideKey = 'overview' | 'upcoming' | 'gf' | '2f' | '3f' | 'pours' | 'production' | 'episodes' | 'master' | 'methodology' | 'watch' | 'notes';

export interface Tab {
  id: string;
  label: string;
  slide?: SlideKey;
}
export interface Section {
  id: string;
  num: string;
  group?: string;
  icon?: LucideIcon;
  label: string;
  title: string;
  sub: string;
  tabs?: Tab[];
}

const RAW_SECTIONS: Section[] = [
  {
    id: 'executive',
    num: '00',
    label: 'Executive Dashboard',
    title: 'Executive Dashboard',
    sub: 'Key figures for management: active workstreams, progress, overdue and upcoming targets, project health, milestones, team performance and the 60-day forecast.',
  },
  {
    id: 'notifications',
    num: '00',
    label: 'Notifications',
    title: 'Notifications',
    sub: 'Daily Construction Reports for approval, updated or reviewed reports and missing reports, then overdue and upcoming targets, missing owners, blocked items, recent changes, pending verifications, handover and new documents — derived from the project records.',
  },
  {
    id: 'calendar',
    num: '00',
    label: 'Project Calendar',
    title: 'Project Calendar',
    sub: 'Milestones, construction targets, concrete pours, production dates, inspections, deliveries, handover and calendar entries — with the 60-day forecast.',
    tabs: [
      { id: 'agenda', label: 'Agenda · 60-day forecast' },
      { id: 'month', label: 'Month' },
      { id: 'week', label: 'Week' },
      { id: 'day', label: 'Day' },
    ],
  },
  {
    id: 'procurement',
    num: '00',
    label: 'Procurement & Materials',
    title: 'Procurement & Materials',
    sub: 'Material requirements, procurement status, suppliers, purchase and delivery schedules, pending orders, received materials and delayed deliveries.',
  },
  {
    id: 'documents',
    num: '00',
    label: 'Document Repository',
    title: 'Internal Document Repository',
    sub: 'Site reports, weekly and monthly reports, meeting minutes, construction documents, drawings, procurement records, approvals and attachments.',
  },
  {
    id: 'publishing',
    num: '00',
    label: 'Client Portal Management',
    title: 'Client Portal Management',
    sub: 'Prepare, review, approve and publish client-safe information to the Executive & Client Portal. Only published items are visible to external users.',
    tabs: [
      { id: 'overview', label: 'Overview' },
      { id: 'snapshot', label: 'Project Status Updates' },
      { id: 'considerations', label: 'Updates & Announcements' },
      { id: 'gallery', label: 'Progress Gallery' },
      { id: 'documents', label: 'Documents' },
      { id: 'reports', label: 'Reports' },
    ],
  },
  {
    id: 'command',
    num: '01',
    label: 'Command Center',
    title: 'Command Center',
    sub: 'Where the project stands today: health, progress vs plan, current operations, milestones, production alignment and what needs management attention.',
  },
  {
    id: 'overview',
    num: '02',
    label: 'Project Presentation',
    title: 'Project Presentation',
    sub: 'The established Convengers presentation slides — executive overview, methodology, watch items and schedule notes.',
    tabs: [
      { id: 'slide', label: 'Executive overview', slide: 'overview' },
      { id: 'deck', label: 'Full presentation deck' },
      { id: 'methodology', label: 'Structural methodology', slide: 'methodology' },
      { id: 'watch', label: 'Watch items & holidays', slide: 'watch' },
      { id: 'notes', label: 'Schedule notes', slide: 'notes' },
    ],
  },
  {
    id: 'tracker',
    num: '03',
    label: 'Master Project Tracker',
    title: 'Master Project Tracker',
    sub: 'One register of every activity — construction scopes, concrete pours, milestones, production shoots and added activities — from the central project database.',
    tabs: [
      { id: 'register', label: 'Activity register' },
      { id: 'board', label: 'Upcoming activities board', slide: 'upcoming' },
    ],
  },
  {
    id: 'construction',
    num: '04',
    label: 'Construction Management',
    title: 'Construction Management',
    sub: 'Construction calendar, floor-by-floor scopes of work and concrete pouring milestones.',
    tabs: [
      { id: 'calendar', label: 'Construction calendar' },
      { id: 'manpower', label: 'Manpower & deliveries' },
      { id: 'gf', label: 'Ground floor', slide: 'gf' },
      { id: '2f', label: 'Second floor', slide: '2f' },
      { id: '3f', label: 'Third floor', slide: '3f' },
      { id: 'pours', label: 'Concrete pours', slide: 'pours' },
    ],
  },
  {
    id: 'production',
    num: '05',
    label: 'Production Monitoring',
    title: 'Production Monitoring',
    sub: 'Production calendar, episodes and cross-calendar alignment with construction.',
    tabs: [
      { id: 'calendar', label: 'Production calendar', slide: 'production' },
      { id: 'episodes', label: 'Episodes table', slide: 'episodes' },
      { id: 'alignment', label: 'Schedule alignment' },
    ],
  },
  {
    id: 'palign',
    num: '05',
    label: 'Production Alignment',
    title: 'Production Alignment & Educational Shoot Calendar',
    sub: 'Connecting construction milestones, educational episodes and production schedules: classification, construction links, cast availability, team assignments, readiness, approvals and alerts. Publish it to the client portal for stakeholders.',
    tabs: [
      { id: 'dashboard', label: 'Dashboard' },
      { id: 'episodes', label: 'Episodes' },
      { id: 'history', label: 'Revision History' },
    ],
  },
  {
    id: 'timeline',
    num: '06',
    label: 'Master Gantt & Timeline',
    title: 'Master Gantt & Timeline',
    sub: 'Monthly, weekly and daily timeline synchronized with the master tracker. Baseline vs current vs actual, milestones, delays and critical path.',
    tabs: [
      { id: 'gantt', label: 'Interactive Gantt' },
      { id: 'master', label: 'Master timeline slide', slide: 'master' },
    ],
  },
  {
    id: 'milestones',
    num: '07',
    label: 'Milestone Monitoring',
    title: 'Milestone Monitoring',
    sub: 'Key project milestones and concrete pouring milestones: targets, actuals, variance, ownership and dependencies.',
  },
  {
    id: 'reports',
    num: '08',
    label: 'Weekly & Monthly Reports',
    title: 'Weekly & Monthly Reports',
    sub: 'Data-driven reports consolidated from the master project database. Edit the narrative, approve to lock, export to PDF, CSV or JSON.',
    tabs: [
      { id: 'weekly', label: 'Weekly report' },
      { id: 'monthly', label: 'Monthly report' },
      { id: 'summary', label: 'Summary reports' },
    ],
  },
  {
    id: 'narrative',
    num: '00',
    label: 'Narrative Reports',
    title: 'Automated Narrative Reports',
    sub: 'Daily, weekly, monthly, milestone, activity, status and project summary narratives written from the recorded project data. Review, edit, approve, and export to PDF or Word.',
    tabs: [
      { id: 'generate', label: 'Generate' },
      { id: 'archive', label: 'Report Archive' },
      { id: 'schedule', label: 'Schedule' },
    ],
  },
  {
    id: 'analytics',
    num: '09',
    label: 'Project Performance',
    title: 'Project Performance',
    sub: 'Planned vs actual progress, trends, workstreams, milestones, and construction and production schedule performance.',
  },
  {
    id: 'schedule',
    num: '00',
    label: 'Schedule Monitoring',
    title: 'Schedule Monitoring',
    sub: 'Forecast completion, schedule risks and the next-month outlook, with production and construction alignment.',
    tabs: [
      { id: 'forecast', label: 'Forecast & Outlook' },
      { id: 'alignment', label: 'Production & Construction Alignment' },
    ],
  },
  {
    id: 'site',
    num: '00',
    label: 'Daily Construction Report',
    title: 'Daily Construction Report',
    sub: 'Report the day on site: accomplishments, manpower, materials, equipment, site conditions and photographs stored in Google Drive. Reports are reviewed before approval.',
    tabs: [
      { id: 'new', label: 'New Report' },
      { id: 'history', label: 'Report History' },
    ],
  },
  {
    id: 'prodcal',
    num: '00',
    label: 'Production Calendar',
    title: 'Production Calendar Management',
    sub: 'Construction activities, content production, photo and video shoots, meetings, milestones and announcements. Publish stakeholder-visible events to the client portal; the production team proposes schedules for approval.',
    tabs: [
      { id: 'schedule', label: 'Schedule' },
      { id: 'proposals', label: 'Proposals' },
      { id: 'log', label: 'Change Log' },
    ],
  },
  {
    id: 'journey',
    num: '00',
    label: '3D Construction Journey',
    title: '3D Construction Journey Management',
    sub: 'Configure the construction stages clients see: names, order, descriptions, illustrations and linked activities. Progress is calculated from the Master Project Tracker.',
  },
  {
    id: 'roles',
    num: '00',
    label: 'Roles & Permissions',
    title: 'Roles & Permissions',
    sub: 'What each role can see and do. Access is enforced by the database security rules, not only by the interface.',
  },
  {
    id: 'sync',
    num: '00',
    label: 'Database Synchronization',
    title: 'Database Synchronization',
    sub: 'Shared-database connection status, device-only records and synchronization recovery.',
  },
  {
    id: 'issues',
    num: '10',
    label: 'Issues & Accountability',
    title: 'Issues & Accountability',
    sub: 'Items requiring attention, the issues, risks and decisions log, and ownership of every task.',
    tabs: [
      { id: 'attention', label: 'Items Requiring Attention' },
      { id: 'log', label: 'Issues, risks & decisions' },
      { id: 'owners', label: 'Accountability' },
    ],
  },
  {
    id: 'archive',
    num: '11',
    label: 'Project Records Archive',
    title: 'Project Records Archive',
    sub: 'Historical weekly and monthly reports by year and month, plus progress snapshot history.',
  },
  {
    id: 'settings',
    num: '12',
    label: 'Data & Settings',
    title: 'Data & Settings',
    sub: 'Storage, backup and recovery, baseline, data health, printing and administration.',
  },
];

/** Navigation order and grouping (numbers follow this order). */
const ORDER: [string, string][] = [
  ['command', 'Overview'],
  ['executive', 'Overview'],
  ['notifications', 'Overview'],
  ['tracker', 'Project Management'],
  ['timeline', 'Project Management'],
  ['calendar', 'Project Management'],
  ['milestones', 'Project Management'],
  ['construction', 'Construction Operations'],
  ['production', 'Construction Operations'],
  ['palign', 'Construction Operations'],
  ['site', 'Construction Operations'],
  ['procurement', 'Construction Operations'],
  ['schedule', 'Monitoring & Control'],
  ['issues', 'Monitoring & Control'],
  ['analytics', 'Monitoring & Control'],
  ['reports', 'Reports & Documents'],
  ['narrative', 'Reports & Documents'],
  ['documents', 'Reports & Documents'],
  ['archive', 'Reports & Documents'],
  ['overview', 'Reports & Documents'],
  ['publishing', 'Client Experience'],
  ['prodcal', 'Client Experience'],
  ['journey', 'Client Experience'],
  ['roles', 'System Administration'],
  ['settings', 'System Administration'],
  ['sync', 'System Administration'],
];

export const NAV_GROUPS = ['Overview', 'Project Management', 'Construction Operations', 'Monitoring & Control', 'Reports & Documents', 'Client Experience', 'System Administration'];

export const SECTIONS: Section[] = ORDER.map(([id, group], idx) => {
  const sec = RAW_SECTIONS.find((x) => x.id === id)!;
  return { ...sec, group, num: String(idx + 1).padStart(2, '0') };
});

const ICONS: Record<string, LucideIcon> = {
  command: LayoutDashboard,
  overview: Presentation,
  tracker: ListChecks,
  construction: HardHat,
  production: Clapperboard,
  timeline: ChartGantt,
  milestones: Flag,
  reports: FileText,
  analytics: ChartColumn,
  issues: TriangleAlert,
  archive: ArchiveIcon,
  settings: SettingsIcon,
  procurement: Package,
  documents: FolderOpen,
  publishing: Send,
  executive: Gauge,
  notifications: Bell,
  calendar: CalendarDays,
  schedule: CalendarClock,
  journey: Box,
  roles: ShieldCheck,
  sync: RefreshCw,
  site: ClipboardPen,
  narrative: BookOpenText,
  prodcal: CalendarRange,
  palign: Link2,
};

export function parseRoute(hash: string): { section: string; tab?: string; param?: string } {
  const h = hash.replace(/^#\/?/, '');
  let [section, tab, ...rest] = h.split('/');
  // Addresses from before the 2.0 navigation
  if (section === 'analytics' && tab === 'forecast') {
    section = 'schedule';
  }
  const sec = SECTIONS.find((s) => s.id === section) ? section : 'command';
  return { section: sec, tab: tab || undefined, param: rest.join('/') || undefined };
}

export function useHashRoute() {
  const [route, setRoute] = useState(() => parseRoute(typeof window !== 'undefined' ? window.location.hash : ''));
  useEffect(() => {
    const on = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}


/** Renders a module (shared by the desktop shell and the phone shell). */
export function renderSectionBody(
  section: Section,
  tab: Tab | undefined,
  route: { section: string; tab?: string; param?: string },
  renderSlide: (k: SlideKey) => React.ReactNode,
  renderDeck: () => React.ReactNode
): React.ReactNode {
    if (tab?.slide) return <div className="cv-slidehost">{renderSlide(tab.slide)}</div>;
    switch (section.id) {
      case 'command':
        return <CommandCenter />;
      case 'executive':
        return <ExecutiveDashboard />;
      case 'notifications':
        return <NotificationsPage />;
      case 'calendar':
        return <CalendarPage view={tab?.id} param={route.param} />;
      case 'overview':
        return <div className="cv-slidehost">{renderDeck()}</div>;
      case 'tracker':
        return <Tracker />;
      case 'construction':
        return tab?.id === 'manpower' ? <Manpower /> : <ScheduleCalendar defaultLayers={['construction', 'pours', 'milestones', 'deliveries', 'manpower']} />;
      case 'procurement':
        return <Procurement />;
      case 'documents':
        return <Documents />;
      case 'publishing':
        return <Publishing tab={tab?.id} />;
      case 'production':
        return <AlignmentView />;
      case 'timeline':
        return <Gantt />;
      case 'milestones':
        return <Milestones />;
      case 'reports':
        return tab?.id === 'summary' ? <SummaryReports /> : <ReportsPage key={tab?.id} type={tab?.id === 'monthly' ? 'monthly' : 'weekly'} />;
      case 'analytics':
        return <Analytics />;
      case 'schedule':
        return tab?.id === 'alignment' ? <AlignmentView /> : <Forecast />;
      case 'journey':
        return <JourneyManagement />;
      case 'roles':
        return <RolesPermissions />;
      case 'sync':
        return <SyncPanel />;
      case 'site':
        return <DailyReports key={tab?.id} tab={tab?.id} />;
      case 'prodcal':
        return <ProductionCalendarAdmin key={tab?.id} tab={tab?.id} />;
      case 'palign':
        return <ProductionAlignmentAdmin key={tab?.id} tab={tab?.id} param={route.param} />;
      case 'narrative':
        return <NarrativeReports key={`${tab?.id}:${route.param || ''}`} tab={tab?.id} param={route.param} />;
      case 'issues':
        return tab?.id === 'log' ? <IssueLog /> : tab?.id === 'owners' ? <Accountability /> : <AttentionList />;
      case 'archive':
        return <Archive />;
      case 'settings':
        return <Settings />;
      default:
        return <CommandCenter />;
    }
}

export function resolveSection(route: { section: string; tab?: string }): { section: Section; tab?: Tab } {
  const section = SECTIONS.find((s) => s.id === route.section) || SECTIONS[0];
  const tab = section.tabs ? section.tabs.find((t) => t.id === route.tab) || section.tabs[0] : undefined;
  return { section, tab };
}

export const Shell: React.FC<{ renderSlide: (k: SlideKey) => React.ReactNode; renderDeck: () => React.ReactNode }> = ({ renderSlide, renderDeck }) => {
  const { route, actions, attention, user, metrics, isAdmin, dataSync } = useCommand();
  const [navOpen, setNavOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem('convengers_nav_collapsed') || '{}');
    } catch {
      return {};
    }
  });
  const toggleGroup = (g: string) =>
    setCollapsed((c) => {
      const n = { ...c, [g]: !c[g] };
      try {
        localStorage.setItem('convengers_nav_collapsed', JSON.stringify(n));
      } catch {
        // per-device convenience only
      }
      return n;
    });
  // Modules available to this role (navigation level; data is protected server-side)
  const visible = SECTIONS.filter((s) => canOpenModule(user.role, s.id));
  const allowed = canOpenModule(user.role, route.section);
  const home = landingModule(user.role);
  const section = (allowed ? SECTIONS.find((s) => s.id === route.section) : undefined) || SECTIONS.find((s) => s.id === home) || visible[0] || SECTIONS[0];

  useEffect(() => {
    if (!allowed) {
      window.location.replace(`#/${home}`);
      return;
    }
    // Unknown or removed module in the address (e.g. an old bookmark) → show its real address
    const raw = window.location.hash.replace(/^#\/?/, '').split('/')[0];
    // `portal` belongs to the client portal (Root switches interfaces) — never redirect it
    if (raw && raw !== 'portal' && raw !== route.section) window.location.replace(`#/${route.section}`);
  }, [allowed, home, route]);
  const tab = section.tabs ? section.tabs.find((t) => t.id === route.tab) || section.tabs[0] : undefined;

  useEffect(() => {
    setNavOpen(false);
    window.scrollTo({ top: 0 });
  }, [route.section, route.tab]);

  const critical = attention.filter((a) => a.severity === 'critical').length;
  const { unread } = useNotifications();

  const body = renderSectionBody(section, tab, route, renderSlide, renderDeck);

  return (
    <div className={`cv-shell ${navOpen ? 'nav-open' : ''}`}>
      <div className="cv-backdrop" onClick={() => setNavOpen(false)} />
      <nav className="cv-sidebar" aria-label="Command Center sections">
        <div className="cv-side-title">Master Project Tracker</div>
        {NAV_GROUPS.map((g) => {
          const items = visible.filter((s) => s.group === g);
          const extras =
            g === 'Client Experience'
              ? [{ id: 'portal-preview', label: 'Client Portal Preview', icon: ExternalLink, href: '#/portal/overview' }]
              : g === 'System Administration' && isAdmin
                ? [
                    { id: 'users', label: 'User Management', icon: UserCog, onClick: actions.openAdminPanel },
                    { id: 'audit', label: 'Audit Logs', icon: ScrollText, onClick: actions.openAuditLogs },
                  ]
                : [];
          if (!items.length && !extras.length) return null;
          const hasActive = items.some((s) => s.id === section.id);
          const isOpen = hasActive || !collapsed[g];
          return (
            <div key={g} className={`cv-navgrp ${isOpen ? 'open' : ''}`}>
              <button type="button" className="cv-side-group cv-navgrp-h" aria-expanded={isOpen} onClick={() => !hasActive && toggleGroup(g)}>
                <span>{g}</span>
                <ChevronDown size={14} aria-hidden className="cv-navgrp-chev" />
              </button>
              {isOpen && (
                <div className="cv-navgrp-b">
                  {items.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className={`cv-nav-btn ${s.id === section.id ? 'on' : ''}`}
                      onClick={() => actions.navigate(s.id)}
                      aria-current={s.id === section.id ? 'page' : undefined}
                    >
                      {ICONS[s.id] ? React.createElement(ICONS[s.id], { size: 18, strokeWidth: 1.9, className: 'cv-nav-ico', 'aria-hidden': true }) : null}
                      <span className="cv-nav-label">{s.label}</span>
                      {s.id === 'issues' && critical > 0 && <span className="cv-nav-badge" title="Critical attention items">{critical}</span>}
                      {s.id === 'notifications' && unread > 0 && <span className="cv-nav-badge" title="Unread notifications">{unread > 99 ? '99+' : unread}</span>}
                      {s.id === 'sync' && dataSync.state !== 'live' && <span className="cv-nav-badge warn" title="Not synced">!</span>}
                    </button>
                  ))}
                  {extras.map((x) =>
                    'href' in x ? (
                      <a key={x.id} className="cv-nav-btn cv-portal-link" href={x.href}>
                        <x.icon size={18} strokeWidth={1.9} className="cv-nav-ico" aria-hidden />
                        <span className="cv-nav-label">{x.label}</span>
                      </a>
                    ) : (
                      <button key={x.id} type="button" className="cv-nav-btn" onClick={x.onClick}>
                        <x.icon size={18} strokeWidth={1.9} className="cv-nav-ico" aria-hidden />
                        <span className="cv-nav-label">{x.label}</span>
                      </button>
                    )
                  )}
                </div>
              )}
            </div>
          );
        })}
        <div className="cv-side-foot">
          <div>
            Health: <b>{metrics.health}</b> · {metrics.actualPct}% actual
          </div>
          <div>
            {user.name} · {ROLE_LABEL[user.role]}
          </div>
          <div>www.ConvengersAssemble.com</div>
        </div>
      </nav>
      <ProductionPortalSync />
      <main className="cv-main" id="cv-main">
        <SectionHeader num={section.num} title={section.title} sub={section.sub} onMenu={() => setNavOpen(true)} />
        {section.tabs && (
          <div className="cv-tabs" role="tablist">
            {section.tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={t.id === tab?.id}
                className={`cv-tab ${t.id === tab?.id ? 'on' : ''}`}
                onClick={() => actions.navigate(`${section.id}/${t.id}`)}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
        {body}
      </main>
    </div>
  );
};
