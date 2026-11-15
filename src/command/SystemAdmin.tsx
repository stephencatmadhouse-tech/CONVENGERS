/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * SYSTEM ADMINISTRATION — Roles & Permissions (reference of what each role can
 * see and do; enforced server-side by firestore.rules / storage.rules) and
 * Database Synchronization (shared-database status, device-only records,
 * synchronization recovery).
 */

import React, { useEffect, useState } from 'react';
import { RefreshCw, UploadCloud, Check, Minus, HardDrive } from 'lucide-react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config.ts';
import { driveStatus, reconcileDrive, finishPendingRecords, saveDriveCredentials } from '../drive/driveClient.ts';
import { plural } from '../utils/plural.ts';
import { fmtDate } from '../domain/dates.ts';
import { useCommand } from './context.tsx';
import { Banner, Card, Field, SyncChip, SYNC_LABEL } from './ui.tsx';
import { INTERNAL_ROLES, EXTERNAL_ROLES, ROLE_LABEL, allowedModules, landingModule, isManagerRole, canEditOperations } from '../auth/roles.ts';
import { SECTIONS } from './Shell.tsx';
import { useStore } from '../firebase/useStore.ts';
import {
  procurementStore,
  manpowerStore,
  documentStore,
  publicationStore,
  eventStore,
  clientConfigStore,
  portalStore,
  dailyReportStore,
  driveFileStore,
} from '../firebase/opsStores.ts';
import { CORE_SYNC_COLLECTIONS } from '../firebase/firestoreData.ts';
import type { UserRole } from '../types/index.ts';

const CAPS: {
  label: string;
  test: (r: UserRole) => boolean;
  server: string;
}[] = [
  {
    label: 'View the Master Project Tracker',
    test: (r) => INTERNAL_ROLES.includes(r),
    server: 'Internal collections: read only by active internal roles',
  },
  {
    label: 'Update activities, issues, procurement, documents',
    test: (r) => canEditOperations(r),
    server: 'Staff-level write rule',
  },
  {
    label: 'Approve reports, publish to the client portal',
    test: (r) => isManagerRole(r),
    server: 'Manager-level write rule on reports, publications and portal',
  },
  {
    label: 'Configure the 3D Construction Journey',
    test: (r) => isManagerRole(r),
    server: 'clientConfig: manager write',
  },
  {
    label: 'Manage users and roles',
    test: (r) => r === 'admin',
    server: 'users: administrator only; nobody can change their own role',
  },
  {
    label: 'Client portal: published dashboard',
    test: () => true,
    server: 'portal: published client-safe records (public)',
  },
  {
    label: 'Client portal: approved documents',
    test: (r) => INTERNAL_ROLES.includes(r) || r === 'owner' || r === 'executive',
    server: 'portal documents: owner, executive and internal roles',
  },
];

export const RolesPermissions: React.FC = () => {
  const roles: UserRole[] = [...INTERNAL_ROLES, ...EXTERNAL_ROLES];
  return (
    <div className="cv-grid" style={{ gap: 16 }}>
      <Banner kind="info">
        Access is enforced by the database security rules on the server. The interface only hides what a role cannot use; it is not the security boundary. Roles are
        assigned in User Management by the System Administrator.
      </Banner>
      <Card title="Permissions by role">
        <div className="cv-table-wrap">
          <table className="cv-table">
            <thead>
              <tr>
                <th>Capability</th>
                {roles.map((r) => (
                  <th key={r} style={{ textAlign: 'center' }}>
                    {ROLE_LABEL[r]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CAPS.map((c) => (
                <tr key={c.label}>
                  <td>
                    <b>{c.label}</b>
                    <div className="cv-dim" style={{ fontSize: 12 }}>
                      {c.server}
                    </div>
                  </td>
                  {roles.map((r) => (
                    <td key={r} style={{ textAlign: 'center' }} aria-label={c.test(r) ? 'Allowed' : 'Not allowed'}>
                      {c.test(r) ? <Check size={16} color="#1F9D68" /> : <Minus size={16} color="#B8BAC8" />}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title="Modules and landing page by internal role">
        <div className="cv-table-wrap">
          <table className="cv-table">
            <thead>
              <tr>
                <th>Role</th>
                <th>Opens on</th>
                <th>Modules</th>
              </tr>
            </thead>
            <tbody>
              {INTERNAL_ROLES.map((r) => (
                <tr key={r}>
                  <td>
                    <b>{ROLE_LABEL[r]}</b>
                  </td>
                  <td>{SECTIONS.find((s) => s.id === landingModule(r))?.label}</td>
                  <td style={{ fontSize: 12.5 }}>
                    {allowedModules(r)
                      .map((m) => SECTIONS.find((s) => s.id === m)?.label)
                      .filter(Boolean)
                      .join(' · ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

export const SyncPanel: React.FC = () => {
  const { dataSync, reports, issues, snapshots, actions, canEdit } = useCommand();
  const stores = {
    'Procurement & Materials': useStore(procurementStore),
    Manpower: useStore(manpowerStore),
    'Document Repository': useStore(documentStore),
    'Client publications': useStore(publicationStore),
    'Calendar entries': useStore(eventStore),
    'Client experience settings': useStore(clientConfigStore),
    'Client portal records': useStore(portalStore),
    'Daily Construction Reports': useStore(dailyReportStore),
  };
  const [busy, setBusy] = useState(false);
  const deviceOnly: { name: string; n: number; shared: boolean }[] = [
    {
      name: 'Weekly & monthly reports',
      n: reports.filter((r) => r.localOnly).length,
      shared: true,
    },
    {
      name: 'Issues, risks & decisions',
      n: issues.filter((i) => i.localOnly).length,
      shared: true,
    },
    {
      name: 'Progress history',
      n: snapshots.filter((s) => s.localOnly).length,
      shared: true,
    },
    ...Object.entries(stores).map(([name, st]) => ({
      name,
      n: st.items.filter((x: any) => x.localOnly).length,
      shared: st.shared,
    })),
  ];
  const total = deviceOnly.reduce((a, b) => a + b.n, 0);
  const s = SYNC_LABEL[dataSync.state];
  return (
    <div className="cv-grid" style={{ gap: 16 }}>
      <Card
        title="Project data connection"
        note={s?.detail}
        actions={
          <>
            <SyncChip state={dataSync.state} />
            <button type="button" className="cv-btn sm" onClick={() => window.location.reload()}>
              <RefreshCw size={14} aria-hidden /> Refresh Data
            </button>
          </>
        }
      >
        {dataSync.state !== 'live' && (
          <Banner kind="warn">
            While the status is not <b>Live sync</b>, the figures on this device may differ from other users and from the client portal, and status updates cannot be
            published to clients. If access is refused, deploy the updated firestore.rules.
          </Banner>
        )}
        <div className="cv-table-wrap">
          <table className="cv-table">
            <thead>
              <tr>
                <th>Core project records</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {CORE_SYNC_COLLECTIONS.map((c) => {
                const v = dataSync.collections[c];
                return (
                  <tr key={c}>
                    <td style={{ textTransform: 'capitalize' }}>{c}</td>
                    <td>
                      {v === 'server'
                        ? 'Confirmed by the shared database'
                        : v === 'cache'
                          ? 'Last synced copy (offline)'
                          : v === 'denied'
                            ? 'Access refused by the server'
                            : v === 'error'
                              ? 'Could not be read'
                              : 'Waiting for the server'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      <Card
        title={`Device-only records · ${total}`}
        note="Records saved only in this browser because shared storage was unavailable. They are not shared project data until uploaded."
        actions={
          canEdit && (
            <button
              type="button"
              className="cv-btn primary sm"
              disabled={busy || !total}
              onClick={async () => {
                setBusy(true);
                await actions.syncLocal();
                setBusy(false);
              }}
            >
              <UploadCloud size={14} aria-hidden /> Upload Device-Only Records
            </button>
          )
        }
      >
        <div className="cv-table-wrap">
          <table className="cv-table">
            <thead>
              <tr>
                <th>Records</th>
                <th>Device-only</th>
                <th>Shared storage</th>
              </tr>
            </thead>
            <tbody>
              {deviceOnly.map((d) => (
                <tr key={d.name}>
                  <td>{d.name}</td>
                  <td
                    style={{
                      color: d.n ? 'var(--cv-red-text)' : undefined,
                      fontWeight: d.n ? 700 : 400,
                    }}
                  >
                    {d.n}
                  </td>
                  <td>{d.shared ? 'Available' : 'Not available'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <DriveStorageCard />
    </div>
  );
};

// ---------------------------------------------------------------------
// GOOGLE DRIVE STORAGE — connection status, folder names, recovery
// ---------------------------------------------------------------------
const FOLDER_FIELDS: [string, string, string][] = [
  ['photos', 'Construction photographs', '01 - CONSTRUCTION PHOTOGRAPHS'],
  ['daily', 'Daily construction reports', '02 - DAILY CONSTRUCTION REPORTS'],
  ['weekly', 'Weekly progress reports', '03 - WEEKLY PROGRESS REPORTS'],
  ['monthly', 'Monthly progress reports', '04 - MONTHLY PROGRESS REPORTS'],
  ['site', 'Site documentation', '05 - SITE DOCUMENTATION'],
  ['supporting', 'Supporting documents', '06 - SUPPORTING DOCUMENTS'],
];
type DriveSettings = {
  projectRecords: string;
  projectFolder: string;
  folders: Record<string, string>;
};
const DEFAULT_DRIVE: DriveSettings = {
  projectRecords: 'PROJECT RECORDS',
  projectFolder: 'BAHAY BUILD PROJECT',
  folders: Object.fromEntries(FOLDER_FIELDS.map(([k, , v]) => [k, v])),
};

const DriveStorageCard: React.FC = () => {
  const { isAdmin, isManager, user } = useCommand();
  const files = useStore(driveFileStore);
  const [st, setSt] = useState<Awaited<ReturnType<typeof driveStatus>> | 'loading'>('loading');
  const [cfg, setCfg] = useState<DriveSettings>(DEFAULT_DRIVE);
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState<{
    kind: 'info' | 'warn' | 'error';
    text: string;
  } | null>(null);
  // Last known credential source, kept while a new check runs so the connect form (and its message) stays in place
  const [source, setSource] = useState<'env' | 'app' | null | undefined>(undefined);
  const check = async () => {
    setSt('loading');
    const r = await driveStatus(true);
    setSt(r);
    if (r) setSource(r.source ?? null);
  };
  useEffect(() => {
    void check();
    getDoc(doc(db, 'driveConfig', 'settings'))
      .then((d) => {
        const v = d.data() as Partial<DriveSettings> | undefined;
        if (v)
          setCfg({
            projectRecords: v.projectRecords || DEFAULT_DRIVE.projectRecords,
            projectFolder: v.projectFolder || DEFAULT_DRIVE.projectFolder,
            folders: { ...DEFAULT_DRIVE.folders, ...(v.folders || {}) },
          });
      })
      .catch(() => undefined);
  }, []);
  const counts = {
    uploaded: files.items.filter((f) => f.uploadStatus === 'uploaded').length,
    published: files.items.filter((f) => f.uploadStatus === 'uploaded' && f.publicationStatus === 'published').length,
    failed: files.items.filter((f) => f.uploadStatus === 'failed').length,
    uploading: files.items.filter((f) => f.uploadStatus === 'uploading').length,
  };
  const status =
    st === 'loading'
      ? 'Checking…'
      : st === null
        ? 'Storage service unreachable'
        : !st.configured
          ? 'Not configured on the server'
          : st.rootAccessible === false
            ? `Configured, but the root folder cannot be opened${st.error ? `: ${st.error}` : ''}`
            : `Connected${st.rootName ? ` · root folder “${st.rootName}”` : ''}${st.mode ? ` · ${st.mode === 'service_account' ? 'service account' : 'Google account'}` : ''}${
                st.source === 'app' ? ` · saved in the app${st.savedBy ? ` by ${st.savedBy}` : ''}${st.savedAt ? ` on ${fmtDate(st.savedAt.slice(0, 10))}` : ''}` : ''
              }`;
  const ok = st !== 'loading' && !!st?.configured && st.rootAccessible !== false;
  const recover = async () => {
    setBusy('recover');
    setNote(null);
    try {
      const n = await finishPendingRecords();
      const r = await reconcileDrive();
      setNote({
        kind: 'info',
        text: `Recovery complete: ${plural(n, 'pending reference')} saved, ${plural(r.scanned, 'Drive file')} checked, ${r.repaired} repaired, ${plural(r.created, 'missing reference')} restored, ${plural(r.markedFailed, 'stalled upload')} marked as failed.`,
      });
    } catch (e) {
      setNote({
        kind: 'error',
        text: e instanceof Error ? e.message : 'Recovery failed.',
      });
    }
    setBusy('');
  };
  const save = async () => {
    setBusy('save');
    setNote(null);
    try {
      const clean = (v: string, d: string) => v.replace(/[\\/:*?"<>|]+/g, ' ').trim() || d;
      const v: DriveSettings = {
        projectRecords: clean(cfg.projectRecords, DEFAULT_DRIVE.projectRecords),
        projectFolder: clean(cfg.projectFolder, DEFAULT_DRIVE.projectFolder),
        folders: Object.fromEntries(FOLDER_FIELDS.map(([k, , d]) => [k, clean(cfg.folders[k] || '', d)])),
      };
      await setDoc(doc(db, 'driveConfig', 'settings'), {
        ...v,
        monthly: ['photos', 'daily'],
        updatedAt: new Date().toISOString(),
        updatedBy: user.name,
      });
      setCfg(v);
      setNote({
        kind: 'info',
        text: 'Folder names saved. New uploads use these names; existing files stay where they are.',
      });
    } catch {
      setNote({
        kind: 'error',
        text: 'Folder names were not saved (administrator access is required).',
      });
    }
    setBusy('');
  };
  return (
    <Card
      title="Google Drive storage"
      note="Photographs and project files are stored in Google Drive through the secure server; the database keeps the file references, upload status and publication status."
      actions={
        <>
          <span className="cv-pill" style={{ color: ok ? 'var(--ds-ok)' : 'var(--ds-warn)' }}>
            <HardDrive size={13} aria-hidden /> {ok ? 'Drive connected' : 'Drive unavailable'}
          </span>
          <button type="button" className="cv-btn sm" onClick={check} disabled={st === 'loading'}>
            <RefreshCw size={14} aria-hidden /> Test Connection
          </button>
        </>
      }
    >
      <div className="cv-table-wrap">
        <table className="cv-table">
          <tbody>
            <tr>
              <td>Connection</td>
              <td>{status}</td>
            </tr>
            <tr>
              <td>Files stored</td>
              <td>
                {counts.uploaded} uploaded · {counts.published} published to clients · {counts.failed} failed · {counts.uploading} in progress
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      {st !== 'loading' && !st?.configured && (
        <Banner kind="warn">
          {st?.missing?.length || st?.invalid?.length ? (
            <>
              The running server cannot see these settings:{' '}
              {[...(st.missing || []), ...(st.invalid || []).map((k) => `${k} (not valid JSON)`)].map((k, i) => (
                <React.Fragment key={k}>
                  {i ? ', ' : ''}
                  <code>{k}</code>
                </React.Fragment>
              ))}
              . {isAdmin ? 'Enter them below under “Connect Google Drive”' : 'The System Administrator can enter them under “Connect Google Drive”'}, or add them as
              server secrets and redeploy. See docs/GOOGLE_DRIVE.md.
            </>
          ) : (
            <>
              The server needs Google Drive credentials (an OAuth refresh token for a personal Gmail account, or a service account added to a Shared Drive) and the root
              folder ID. See docs/GOOGLE_DRIVE.md.
            </>
          )}
        </Banner>
      )}
      {note && <Banner kind={note.kind}>{note.text}</Banner>}
      {isManager && (
        <div className="cv-row" style={{ marginTop: 10 }}>
          <button type="button" className="cv-btn sm" onClick={recover} disabled={!!busy || !ok}>
            <UploadCloud size={14} aria-hidden /> {busy === 'recover' ? 'Recovering…' : 'Recover File References'}
          </button>
        </div>
      )}
      {isAdmin && source !== undefined && source !== 'env' && <DriveConnectForm connected={source === 'app'} onDone={check} />}
      {isAdmin && (
        <details style={{ marginTop: 14 }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Folder names</summary>
          <p className="cv-dim" style={{ fontSize: 13 }}>
            Path: {cfg.projectRecords} / {cfg.projectFolder} / [folder] / [Month Year for photos and daily reports] / [report reference]
          </p>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
              gap: 10,
            }}
          >
            <Field label="Records folder">
              <input className="cv-input" value={cfg.projectRecords} onChange={(e) => setCfg({ ...cfg, projectRecords: e.target.value })} />
            </Field>
            <Field label="Project folder">
              <input className="cv-input" value={cfg.projectFolder} onChange={(e) => setCfg({ ...cfg, projectFolder: e.target.value })} />
            </Field>
            {FOLDER_FIELDS.map(([k, l]) => (
              <Field key={k} label={l}>
                <input
                  className="cv-input"
                  value={cfg.folders[k] || ''}
                  onChange={(e) =>
                    setCfg({
                      ...cfg,
                      folders: { ...cfg.folders, [k]: e.target.value },
                    })
                  }
                />
              </Field>
            ))}
          </div>
          <div className="cv-row" style={{ marginTop: 10 }}>
            <button type="button" className="cv-btn primary sm" onClick={save} disabled={!!busy}>
              {busy === 'save' ? 'Saving…' : 'Save Folder Names'}
            </button>
            <button type="button" className="cv-btn ghost sm" onClick={() => setCfg(DEFAULT_DRIVE)} disabled={!!busy}>
              Restore Defaults
            </button>
          </div>
        </details>
      )}
    </Card>
  );
};

/** Administrator form: the four Google Drive values are sent once to the server, tested, and stored where no browser can read them. */
const DriveConnectForm: React.FC<{ connected: boolean; onDone: () => void }> = ({ connected, onDone }) => {
  const [v, setV] = useState({ clientId: '', clientSecret: '', refreshToken: '', rootFolderId: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'info' | 'error'; text: string } | null>(null);
  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await saveDriveCredentials(v);
      setV({ clientId: '', clientSecret: '', refreshToken: '', rootFolderId: '' });
      setMsg({ kind: 'info', text: `Google Drive connected${r.rootName ? ` — files will be stored in “${r.rootName}”` : ''}.` });
      setOpen(false);
      onDone();
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof Error ? e.message : 'Could not connect.' });
    }
    setBusy(false);
  };
  const disconnect = async () => {
    if (!window.confirm('Disconnect Google Drive? Uploads stop until it is connected again. Files already in Drive are not affected.')) return;
    setBusy(true);
    try {
      await saveDriveCredentials({ remove: true });
      setMsg({ kind: 'info', text: 'Google Drive disconnected.' });
      onDone();
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof Error ? e.message : 'Could not disconnect.' });
    }
    setBusy(false);
  };
  const field = (k: keyof typeof v, label: string, secret?: boolean, placeholder?: string) => (
    <Field label={label}>
      <input
        className="cv-input"
        type={secret ? 'password' : 'text'}
        autoComplete="off"
        spellCheck={false}
        value={v[k]}
        placeholder={placeholder}
        onChange={(e) => setV({ ...v, [k]: e.target.value })}
      />
    </Field>
  );
  const complete = Object.values(v).every((x) => x.trim());
  const [open, setOpen] = useState(!connected);
  return (
    <>
      <details open={open} onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)} style={{ marginTop: 14 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>{connected ? 'Google Drive connection' : 'Connect Google Drive'}</summary>
        <p className="cv-dim" style={{ fontSize: 13 }}>
          {connected
            ? 'Connected with values saved in the app. To change them, enter all four again. Saved values are never shown.'
            : 'Paste the four values from the Google Drive setup (docs/GOOGLE_DRIVE.md). They are checked with Google, then stored on the server, where no browser can read them back.'}
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
          {field('clientId', 'Client ID', false, '…apps.googleusercontent.com')}
          {field('clientSecret', 'Client secret', true)}
          {field('refreshToken', 'Refresh token', true)}
          {field('rootFolderId', 'Drive folder ID (or folder link)', false, 'Code after /folders/ in the folder address')}
        </div>
        <div className="cv-row" style={{ marginTop: 10 }}>
          <button type="button" className="cv-btn primary sm" onClick={save} disabled={busy || !complete}>
            {busy ? 'Checking…' : connected ? 'Save and Test New Values' : 'Connect and Test'}
          </button>
          {connected && (
            <button type="button" className="cv-btn ghost sm" onClick={disconnect} disabled={busy}>
              Disconnect
            </button>
          )}
        </div>
      </details>
      {msg && (
        <div style={{ marginTop: 10 }}>
          <Banner kind={msg.kind}>{msg.text}</Banner>
        </div>
      )}
    </>
  );
};
