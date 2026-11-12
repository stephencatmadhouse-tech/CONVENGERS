/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Command Center shell: 12-section navigation, hash routing and module
 * hosting. Existing presentation slides are hosted inside their sections, so
 * nothing from the original dashboard is lost.
 */

import React, { useEffect, useState } from 'react';
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

export type SlideKey = 'overview' | 'upcoming' | 'gf' | '2f' | '3f' | 'pours' | 'production' | 'episodes' | 'master' | 'methodology' | 'watch' | 'notes';

interface Tab {
  id: string;
  label: string;
  slide?: SlideKey;
}
interface Section {
  id: string;
  num: string;
  label: string;
  title: string;
  sub: string;
  tabs?: Tab[];
}

export const SECTIONS: Section[] = [
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
    label: 'Project Overview',
    title: 'Project Overview',
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
      { id: 'gf', label: 'Ground floor', slide: 'gf' },
      { id: '2f', label: 'Second floor', slide: '2f' },
      { id: '3f', label: 'Third floor', slide: '3f' },
      { id: 'pours', label: 'Concrete pours', slide: 'pours' },
    ],
  },
  {
    id: 'production',
    num: '05',
    label: 'Production Management',
    title: 'Production Management',
    sub: 'Production calendar, episodes and cross-calendar alignment with construction.',
    tabs: [
      { id: 'calendar', label: 'Production calendar', slide: 'production' },
      { id: 'episodes', label: 'Episodes table', slide: 'episodes' },
      { id: 'alignment', label: 'Schedule alignment' },
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
    ],
  },
  {
    id: 'analytics',
    num: '09',
    label: 'Performance Analytics',
    title: 'Performance Analytics',
    sub: 'Planned vs actual, trends, workstreams, milestones, construction and production schedule performance — and the forward outlook.',
    tabs: [
      { id: 'performance', label: 'Performance' },
      { id: 'forecast', label: 'Forecast & next-month outlook' },
    ],
  },
  {
    id: 'issues',
    num: '10',
    label: 'Issues & Accountability',
    title: 'Issues & Accountability',
    sub: 'Management attention list, issues / risks / decisions log and ownership of every task.',
    tabs: [
      { id: 'attention', label: 'Management attention' },
      { id: 'log', label: 'Issues, risks & decisions' },
      { id: 'owners', label: 'Accountability' },
    ],
  },
  {
    id: 'archive',
    num: '11',
    label: 'Project Archive',
    title: 'Project Archive',
    sub: 'Historical weekly and monthly reports by year and month, plus progress snapshot history.',
  },
  {
    id: 'settings',
    num: '12',
    label: 'Settings & Data',
    title: 'Settings & Data Management',
    sub: 'Storage, backup and recovery, baseline, data health, printing and administration.',
  },
];

export function parseRoute(hash: string): { section: string; tab?: string; param?: string } {
  const h = hash.replace(/^#\/?/, '');
  const [section, tab, ...rest] = h.split('/');
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

export const Shell: React.FC<{ renderSlide: (k: SlideKey) => React.ReactNode; renderDeck: () => React.ReactNode }> = ({ renderSlide, renderDeck }) => {
  const { route, actions, attention, user, metrics } = useCommand();
  const [navOpen, setNavOpen] = useState(false);
  const section = SECTIONS.find((s) => s.id === route.section) || SECTIONS[0];
  const tab = section.tabs ? section.tabs.find((t) => t.id === route.tab) || section.tabs[0] : undefined;

  useEffect(() => {
    setNavOpen(false);
    window.scrollTo({ top: 0 });
  }, [route.section, route.tab]);

  const critical = attention.filter((a) => a.severity === 'critical').length;

  const body = (() => {
    if (tab?.slide) return <div className="cv-slidehost">{renderSlide(tab.slide)}</div>;
    switch (section.id) {
      case 'command':
        return <CommandCenter />;
      case 'overview':
        return <div className="cv-slidehost">{renderDeck()}</div>;
      case 'tracker':
        return <Tracker />;
      case 'construction':
        return <ScheduleCalendar defaultLayers={['construction', 'pours', 'milestones']} />;
      case 'production':
        return <AlignmentView />;
      case 'timeline':
        return <Gantt />;
      case 'milestones':
        return <Milestones />;
      case 'reports':
        return <ReportsPage key={tab?.id} type={tab?.id === 'monthly' ? 'monthly' : 'weekly'} />;
      case 'analytics':
        return tab?.id === 'forecast' ? <Forecast /> : <Analytics />;
      case 'issues':
        return tab?.id === 'log' ? <IssueLog /> : tab?.id === 'owners' ? <Accountability /> : <AttentionList />;
      case 'archive':
        return <Archive />;
      case 'settings':
        return <Settings />;
      default:
        return <CommandCenter />;
    }
  })();

  return (
    <div className={`cv-shell ${navOpen ? 'nav-open' : ''}`}>
      <div className="cv-backdrop" onClick={() => setNavOpen(false)} />
      <nav className="cv-sidebar" aria-label="Command Center sections">
        <div className="cv-side-title">Command Center</div>
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`cv-nav-btn ${s.id === section.id ? 'on' : ''}`}
            onClick={() => actions.navigate(s.id)}
            aria-current={s.id === section.id ? 'page' : undefined}
          >
            <span className="cv-nav-num">{s.num}</span>
            <span>{s.label}</span>
            {s.id === 'issues' && critical > 0 && <span className="cv-nav-badge" title="Critical attention items">{critical}</span>}
          </button>
        ))}
        <div className="cv-side-foot">
          <div>
            Health: <b>{metrics.health}</b> · {metrics.actualPct}% actual
          </div>
          <div>{user.role === 'viewer' || user.role === 'pending' ? 'Read-only viewer' : `Signed in: ${user.name}`}</div>
          <div>www.ConvengersAssemble.com</div>
        </div>
      </nav>
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
