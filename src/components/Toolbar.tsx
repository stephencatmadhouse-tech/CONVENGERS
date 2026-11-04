/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { User, SystemSettings, Collaborator } from '../types/index.ts';
import { CollaboratorBar } from './CollaboratorBar.tsx';

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
  onExportBackup: () => void;
  onImportBackup: (file: File) => void;
  onOpenAuditLogs: () => void;
  onReset: () => void;
  isLiveConnected?: boolean;
  collaborators?: Collaborator[];
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
  onExportBackup,
  onImportBackup,
  onOpenAuditLogs,
  onReset,
  isLiveConnected = true,
  collaborators = [],
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
      <b>CONVENGERS BAHAY BUILD</b>

      {/* Google Sheets Live Collaborator Bar */}
      <CollaboratorBar
        collaborators={collaborators}
        currentUser={user}
        isLiveConnected={isLiveConnected}
      />

      {/* Role / Auth badge */}
      <button
        type="button"
        onClick={onOpenAuth}
        className="flex items-center gap-1.5 border border-[#7B4DFF] px-2.5 py-1.5 rounded-md font-semibold text-xs"
        style={{
          borderColor: user ? roleColors[user.role] : '#7B4DFF',
          background: user ? 'rgba(123,77,255,0.25)' : '#121C5A',
        }}
        title="Click to switch user role or sign in/out"
      >
        <span
          className="w-2 h-2 rounded-full inline-block"
          style={{ background: user ? roleColors[user.role] : '#8A8FA8' }}
        />
        <span>{user ? `${user.name} (${user.role.toUpperCase()})` : 'Sign in / Roles'}</span>
      </button>

      <button id="share" type="button" className="on" onClick={onOpenShare}>
        Share
      </button>

      <button id="theme" type="button" onClick={onToggleTheme}>
        Theme: {settings.theme.charAt(0).toUpperCase() + settings.theme.slice(1)}
      </button>

      <button
        id="edit"
        type="button"
        className={isEditing ? 'on' : ''}
        onClick={onToggleEditing}
        title="Toggle in-browser text editing"
      >
        {isEditing ? 'Editing text: on' : 'Edit text: off'}
      </button>

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

      <button id="print" type="button" onClick={onPrintPdf}>
        Print / save PDF
      </button>

      <button id="pmrep" type="button" onClick={onPrintReport}>
        Print report
      </button>

      <button id="pmexp" type="button" onClick={onExportBackup}>
        Export backup
      </button>

      <button id="pmimp" type="button" onClick={() => fileInputRef.current?.click()}>
        Import backup
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {user && (user.role === 'admin' || user.role === 'manager') && (
        <button type="button" onClick={onOpenAuditLogs} className="bg-[#121C5A]">
          Audit Logs
        </button>
      )}

      <button id="reset" type="button" onClick={onReset}>
        Reset
      </button>

      <span id="tver">
        Version {settings.version}
      </span>
      <span>
        Set % complete per scope and status per milestone. Persistent real-time backend &amp; database connected.
      </span>
    </div>
  );
};
