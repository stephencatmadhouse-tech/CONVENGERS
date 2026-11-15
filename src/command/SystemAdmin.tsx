/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * SYSTEM ADMINISTRATION — Roles & Permissions (reference of what each role can
 * see and do; enforced server-side by firestore.rules / storage.rules) and
 * Database Synchronization (shared-database status, device-only records,
 * synchronization recovery).
 */

import React, { useState } from 'react';
import { RefreshCw, UploadCloud, Check, Minus } from 'lucide-react';
import { useCommand } from './context.tsx';
import { Banner, Card, SyncChip, SYNC_LABEL } from './ui.tsx';
import { INTERNAL_ROLES, EXTERNAL_ROLES, ROLE_LABEL, allowedModules, landingModule, isManagerRole, canEditOperations } from '../auth/roles.ts';
import { SECTIONS } from './Shell.tsx';
import { useStore } from '../firebase/useStore.ts';
import { procurementStore, manpowerStore, documentStore, publicationStore, eventStore, clientConfigStore, portalStore } from '../firebase/opsStores.ts';
import { CORE_SYNC_COLLECTIONS } from '../firebase/firestoreData.ts';
import type { UserRole } from '../types/index.ts';

const CAPS: { label: string; test: (r: UserRole) => boolean; server: string }[] = [
  { label: 'View the Master Project Tracker', test: (r) => INTERNAL_ROLES.includes(r), server: 'Internal collections: read only by active internal roles' },
  { label: 'Update activities, issues, procurement, documents', test: (r) => canEditOperations(r), server: 'Staff-level write rule' },
  { label: 'Approve reports, publish to the client portal', test: (r) => isManagerRole(r), server: 'Manager-level write rule on reports, publications and portal' },
  { label: 'Configure the 3D Construction Journey', test: (r) => isManagerRole(r), server: 'clientConfig: manager write' },
  { label: 'Manage users and roles', test: (r) => r === 'admin', server: 'users: administrator only; nobody can change their own role' },
  { label: 'Client portal: published dashboard', test: () => true, server: 'portal: published client-safe records (public)' },
  { label: 'Client portal: approved documents', test: (r) => INTERNAL_ROLES.includes(r) || r === 'owner' || r === 'executive', server: 'portal documents: owner, executive and internal roles' },
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
  };
  const [busy, setBusy] = useState(false);
  const deviceOnly: { name: string; n: number; shared: boolean }[] = [
    { name: 'Weekly & monthly reports', n: reports.filter((r) => r.localOnly).length, shared: true },
    { name: 'Issues, risks & decisions', n: issues.filter((i) => i.localOnly).length, shared: true },
    { name: 'Progress history', n: snapshots.filter((s) => s.localOnly).length, shared: true },
    ...Object.entries(stores).map(([name, st]) => ({ name, n: st.items.filter((x: any) => x.localOnly).length, shared: st.shared })),
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
                  <td style={{ color: d.n ? 'var(--cv-red-text)' : undefined, fontWeight: d.n ? 700 : 400 }}>{d.n}</td>
                  <td>{d.shared ? 'Available' : 'Not available'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};
