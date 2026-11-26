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
  RefreshCw,
  ExternalLink,
  LogOut,
  UserCog,
  ScrollText,
} from 'lucide-react';
import '../portal/mobile.css';
import { useCommand } from './context.tsx';
import { SECTIONS, NAV_GROUPS, renderSectionBody, resolveSection, type SlideKey } from './Shell.tsx';
import { ProductionPortalSync } from './ProductionAlignmentAdmin.tsx';
import { SYNC_LABEL } from './ui.tsx';
import { NotificationBell } from './Notifications.tsx';
import { CommandCenter, useManagementActions } from './CommandCenter.tsx';
import { canOpenModule, ROLE_LABEL } from '../auth/roles.ts';
import { authService } from '../firebase/authService.ts';
import { LOGO_SVG } from '../constants/assets.ts';
import { Sheet, InstallRow } from '../portal/MobilePortal.tsx';
import { useInstallState, applyUpdate } from '../pwa/pwa.ts';

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

      <ProductionPortalSync />
      <main className="mb-main" ref={mainRef}>
        {section.id === 'command' ? (
          <CommandCenter />
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
