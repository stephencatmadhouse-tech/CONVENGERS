/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { User, SystemSettings, Collaborator } from '../types/index.ts';
import { CollaboratorBar } from './CollaboratorBar.tsx';
import { BrandLogo } from './BrandLogo.tsx';

interface ToolbarProps {
  user: User | null;
  settings: SystemSettings;
  isEditing: boolean;
  onToggleEditing: () => void;
  onOpenAuth: () => void;
  onOpenShare: () => void;
  onToggleTheme: () => void;
  onChangePaper: (paper: SystemSettings['paper']) => void;
  onPrintPdf: () => void;
  onPrintReport: () => void;
  onDownloadHtml?: () => void;
  onExportBackup: () => void;
  onImportBackup: (file: File) => void;
  onOpenAuditLogs: () => void;
  onReset: () => void;
  isLiveConnected?: boolean;
  collaborators?: Collaborator[];
  onOpenAdminPanel?: () => void;
  isAdminPresentationMode?: boolean;
  onToggleAdminPresentationMode?: () => void;
  /** Compact mode: data-management controls live in "12 — Settings & Data". */
  compact?: boolean;
  onOpenSettings?: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  user,
  settings,
  isEditing,
  onToggleEditing,
  onOpenAuth,
  onOpenShare,
  onToggleTheme,
  onChangePaper,
  onPrintPdf,
  onPrintReport,
  onDownloadHtml,
  onExportBackup,
  onImportBackup,
  onOpenAuditLogs,
  onReset,
  isLiveConnected = true,
  collaborators = [],
  onOpenAdminPanel,
  isAdminPresentationMode = false,
  onToggleAdminPresentationMode,
  compact = false,
  onOpenSettings,
}) => {
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const roleColors: Record<string, string> = {
    admin: '#E0213B',
    manager: '#F5C518',
    staff: '#3A9BFF',
    viewer: '#BAC4E2',
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onImportBackup(file);
      e.target.value = '';
    }
  };

  return (
    <div className="toolbar">
      <div className="flex items-center gap-2.5 mr-2">
        <BrandLogo variant="toolbar" />
        <b>CONVENGERS ASSEMBLE</b>
        <span
          className="hidden md:inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono tracking-wide text-[#F5C518] bg-[#060A24] border border-[#7B4DFF]/60 select-all"
          title="Custom website address: www.ConvengersAssemble.com"
        >
          www.ConvengersAssemble.com
        </span>
      </div>

      {/* Google Sheets Live Collaborator Bar */}
      <CollaboratorBar
        collaborators={collaborators}
        currentUser={user}
        isLiveConnected={isLiveConnected}
      />

      {/* Role / Auth badge & Admin Controls */}
      {user && user.role !== 'viewer' && user.role !== 'pending' ? (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onOpenAuth}
            className="flex items-center gap-1.5 border px-2.5 py-1.5 rounded-md font-semibold text-xs shadow-sm hover:brightness-110 transition-all"
            style={{
              borderColor: roleColors[user.role] || '#7B4DFF',
              background: 'rgba(123,77,255,0.25)',
            }}
            title="Signed in to Madhouse Team - click to view profile or sign out"
          >
            <span
              className="w-2 h-2 rounded-full inline-block"
              style={{ background: roleColors[user.role] || '#4BE08A' }}
            />
            <span>{user.name} ({user.role.toUpperCase()})</span>
          </button>

          {/* Admin Panel Button (Visible only to Admins) */}
          {user.role === 'admin' && onOpenAdminPanel && (
            <button
              type="button"
              onClick={onOpenAdminPanel}
              className="flex items-center gap-1 border border-[#E0213B] bg-[#E0213B]/20 hover:bg-[#E0213B]/35 text-[#FF7A8A] px-2.5 py-1.5 rounded-md font-bold text-xs shadow-sm transition-all"
              title="Open Admin User Management Panel to approve and assign roles"
            >
              <span>⚙️</span>
              <span>Admin Panel</span>
            </button>
          )}

          {/* Presentation Mode Toggle for Admins */}
          {user.role === 'admin' && onToggleAdminPresentationMode && (
            <button
              type="button"
              onClick={onToggleAdminPresentationMode}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md font-bold text-xs border transition-all ${
                isAdminPresentationMode
                  ? 'bg-[#7B4DFF] text-[#F5C518] border-[#F5C518] shadow-[0_0_10px_rgba(245,197,24,0.5)]'
                  : 'bg-[#121C5A] text-[#BAC4E2] hover:text-white border-[#7B4DFF]/50'
              }`}
              title="Temporarily hide all editing controls to present to clients without signing out"
            >
              <span>👁️</span>
              <span>Presentation Mode: {isAdminPresentationMode ? 'ON' : 'OFF'}</span>
            </button>
          )}
        </div>
      ) : user && user.role === 'pending' ? (
        <div className="flex items-center gap-2">
          <span
            className="flex items-center gap-1.5 border border-[#BAC4E2]/50 bg-[#060A24] text-[#BAC4E2] px-2.5 py-1 rounded-md font-bold text-xs uppercase tracking-wider"
            title="Viewing in presentation mode. Timeline cells, milestone statuses, and production dates are locked to prevent accidental edits."
          >
            <span className="w-2 h-2 rounded-full inline-block bg-[#BAC4E2]" />
            <span>VIEWER (READ-ONLY)</span>
          </span>
          <button
            type="button"
            onClick={onOpenAuth}
            className="flex items-center gap-1.5 border border-[#FF9A1F] bg-[#FF9A1F]/15 hover:bg-[#FF9A1F]/25 text-[#FF9A1F] px-2.5 py-1.5 rounded-md font-bold text-xs transition-all"
            title="Signed in as Pending Approval - click to check status or switch to Administrator account"
          >
            <span>⏳ {user.name} (PENDING)</span>
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span
            className="flex items-center gap-1.5 border border-[#BAC4E2]/50 bg-[#060A24] text-[#BAC4E2] px-2.5 py-1 rounded-md font-bold text-xs uppercase tracking-wider"
            title="Viewing in presentation mode. Timeline cells, milestone statuses, and production dates are locked to prevent accidental edits."
          >
            <span className="w-2 h-2 rounded-full inline-block bg-[#BAC4E2]" />
            <span>VIEWER (READ-ONLY)</span>
          </span>
          <button
            type="button"
            onClick={onOpenAuth}
            className="flex items-center gap-1 border border-[#F5C518] bg-[#F5C518]/20 hover:bg-[#F5C518]/35 text-[#F5C518] px-2.5 py-1.5 rounded-md font-bold text-xs transition-all shadow-[0_0_8px_rgba(245,197,24,0.35)]"
            title="Sign in as a Madhouse team member or administrator"
          >
            <span>🛡️ Admin Sign In</span>
          </button>
        </div>
      )}

      <button id="share" type="button" className="on" onClick={onOpenShare} title="Generate presentation or team links">
        Share
      </button>

      <button id="theme" type="button" onClick={onToggleTheme}>
        Theme: {settings.theme.charAt(0).toUpperCase() + settings.theme.slice(1)}
      </button>

      {/* In-browser text editing toggle - completely HIDDEN in viewer mode or admin presentation mode */}
      {user && user.role !== 'viewer' && user.role !== 'pending' && !isAdminPresentationMode && (
        <button
          id="edit"
          type="button"
          className={isEditing ? 'on' : ''}
          onClick={onToggleEditing}
          title="Toggle in-browser text editing"
        >
          {isEditing ? 'Editing text: on' : 'Edit text: off'}
        </button>
      )}

      {!compact && (
      <label style={{ fontSize: '13px', color: '#BAC4E2', display: 'flex', alignItems: 'center', gap: '6px' }}>
        Paper{' '}
        <select
          id="paper"
          value={settings.paper}
          onChange={(e) => onChangePaper(e.target.value as any)}
          style={{
            font: '600 13px Barlow, sans-serif',
            padding: '6px',
            borderRadius: '6px',
            background: '#121C5A',
            color: '#fff',
            border: '1px solid #7B4DFF',
          }}
        >
          <option value="a4">A4 landscape</option>
          <option value="a3">A3 landscape</option>
          <option value="letter">Letter landscape</option>
          <option value="tabloid">Tabloid 11×17 landscape</option>
        </select>
      </label>
      )}

      <button id="print" type="button" onClick={onPrintPdf}>
        Print / save PDF
      </button>

      <button id="pmrep" type="button" onClick={onPrintReport}>
        Print report
      </button>

      {compact && onOpenSettings && (
        <button type="button" onClick={onOpenSettings} title="Backup, import, export, baseline, audit log and administration">
          Data & settings
        </button>
      )}

      {!compact && onDownloadHtml && (
        <button
          id="dlhtml"
          type="button"
          onClick={onDownloadHtml}
          className="border border-[#F5C518]/70 hover:border-[#F5C518] text-[#F5C518] font-bold"
          title="Download the full 12-slide presentation as a standalone offline HTML file"
        >
          Download HTML
        </button>
      )}

      {!compact && (
      <button id="pmexp" type="button" onClick={onExportBackup}>
        Export backup
      </button>
      )}

      {/* Backup Import: Hidden in viewer/presentation mode */}
      {!compact && user && (user.role === 'admin' || user.role === 'manager') && !isAdminPresentationMode && (
        <>
          <button id="pmimp" type="button" onClick={() => fileInputRef.current?.click()}>
            Import backup
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.JSON,application/json,text/json"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
        </>
      )}

      {!compact && user && user.role === 'admin' && !isAdminPresentationMode && (
        <button type="button" onClick={onOpenAuditLogs} className="bg-[#121C5A]">
          Audit Logs
        </button>
      )}

      {/* Reset: Administrator Only, Hidden in presentation mode */}
      {!compact && user && user.role === 'admin' && !isAdminPresentationMode && (
        <button id="reset" type="button" onClick={onReset} className="border border-[#E0213B]/70 hover:border-[#E0213B] text-[#FF7A8A]">
          Reset
        </button>
      )}

      <span id="tver">
        Version {settings.version}
      </span>
      <span className={`text-[12px] leading-tight ${compact ? 'hidden 2xl:inline' : ''}`}>
        {user && user.role !== 'viewer' && user.role !== 'pending' && !isAdminPresentationMode
          ? `Madhouse ${user.role.toUpperCase()} Editor Active · Real-time sync.`
          : 'Viewing in presentation mode. Timeline cells, milestone statuses, and production dates are locked to prevent accidental edits.'}
      </span>
    </div>
  );
};
