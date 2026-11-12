/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * 12 — SETTINGS & DATA MANAGEMENT
 */

import React, { useMemo, useRef, useState } from 'react';
import { useCommand } from './context.tsx';
import { dataHealthCheck } from '../domain/validation.ts';
import { fmtDate } from '../domain/dates.ts';
import { Card, Banner, Empty, ConfirmDialog, Pill } from './ui.tsx';

export const Settings: React.FC = () => {
  const { data, register, actions, isManager, isAdmin, canEdit, sharedStorage, snapshots, reports, issues, today, isLive, user, uiTheme } = useCommand();
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirmFreeze, setConfirmFreeze] = useState(false);
  const findings = useMemo(
    () => dataHealthCheck({ scopes: data.scopes, milestones: data.milestones, pours: data.pours, episodes: data.episodes, activities: data.activities, register }),
    [data, register]
  );
  const localCount = [...reports, ...issues, ...snapshots].filter((r: any) => r.localOnly).length;
  const noBaseline = register.filter((r) => (r.kind === 'scope' || r.kind === 'milestone' || r.kind === 'pour' || r.kind === 'episode') && !data.overrides[r.key]?.baselineStart).length;
  const todaySnap = snapshots.find((s) => s.date === today);

  return (
    <div className="cv-grid" style={{ gap: 14 }}>
      <div className="cv-grid cv-g2" style={{ alignItems: 'start' }}>
        <Card title="Data storage & reliability" note="What is shared, what is not">
          <div className="cv-list">
            <div className="cv-li">
              <div className="cv-li-main">
                <div className="cv-li-t">Project database (scopes, pours, milestones, episodes, characters, activities, assignments)</div>
                <div className="cv-li-s">
                  Shared Google Firestore database with real-time listeners: every signed-in team member and device sees edits within seconds. Viewers
                  have read-only access. Writes are enforced by Firestore security rules by role (Admin / Manager / Staff).
                </div>
              </div>
              <Pill label="Shared" color="#22A05A" />
            </div>
            {(['reports', 'issues', 'snapshots'] as const).map((k) => (
              <div className="cv-li" key={k}>
                <div className="cv-li-main">
                  <div className="cv-li-t">{k === 'reports' ? 'Weekly & monthly reports' : k === 'issues' ? 'Issues, risks & decisions log' : 'Daily progress snapshots (trend history)'}</div>
                  <div className="cv-li-s">
                    {sharedStorage[k]
                      ? 'Shared Firestore collection.'
                      : 'Shared collection not reachable (the updated firestore.rules have not been deployed, or the device is offline). New records are kept in this browser only and are flagged “this device only”.'}
                  </div>
                </div>
                <Pill label={sharedStorage[k] ? 'Shared' : 'This device only'} color={sharedStorage[k] ? '#22A05A' : '#E0A800'} />
              </div>
            ))}
            <div className="cv-li">
              <div className="cv-li-main">
                <div className="cv-li-t">Live presence & typing indicators</div>
                <div className="cv-li-s">WebSocket presence server (server.ts). Only available when the app is served by the Node server, not on static hosting.</div>
              </div>
              <Pill label={isLive ? 'Connected' : 'Not connected'} color={isLive ? '#22A05A' : '#A9A5B2'} />
            </div>
          </div>
          {localCount > 0 && (
            <div className="cv-row" style={{ marginTop: 10 }}>
              <Banner kind="warn">{localCount} record(s) exist only on this device.</Banner>
              <button type="button" className="cv-btn sm" onClick={() => actions.syncLocal()}>
                Retry upload to shared database
              </button>
            </div>
          )}
          <details style={{ marginTop: 10 }}>
            <summary className="cv-strong" style={{ cursor: 'pointer' }}>
              Known limitations
            </summary>
            <ul className="cv-sub" style={{ lineHeight: 1.6 }}>
              <li>
                <b>Concurrent editing:</b> the last save of a field wins. Two people editing the same field at the same moment are not merged; the audit log
                (Admins) shows who changed what.
              </li>
              <li>
                <b>Offline:</b> the dashboard opens from a cached copy when offline, but edits require a connection to the shared database.
              </li>
              <li>
                <b>Version history:</b> schedule revisions are kept per activity (baseline + revision log), approved reports are frozen, and daily snapshots
                record progress. Individual field values are not versioned beyond the audit log.
              </li>
              <li>
                <b>Trends:</b> progress history exists only from the first recorded snapshot onward; earlier weeks show “n/a”.
              </li>
            </ul>
          </details>
        </Card>

        <Card title="Display & printing">
          <div className="cv-grid" style={{ gap: 10 }}>
            <div className="cv-row">
              <span className="cv-strong" style={{ minWidth: 120 }}>
                Theme
              </span>
              <button type="button" className="cv-btn sm" onClick={actions.toggleTheme}>
                {uiTheme === 'light' ? 'Light (standard)' : 'Dark (this device)'} — switch
              </button>
            </div>
            <label className="cv-row">
              <span className="cv-strong" style={{ minWidth: 120 }}>
                Slide paper size
              </span>
              <select className="cv-select" value={data.settings.paper} onChange={(e) => actions.changePaper(e.target.value as typeof data.settings.paper)}>
                <option value="a4">A4 landscape</option>
                <option value="a3">A3 landscape</option>
                <option value="letter">Letter landscape</option>
                <option value="tabloid">Tabloid landscape</option>
              </select>
            </label>
            <div className="cv-row">
              <button type="button" className="cv-btn sm" onClick={actions.printSlides}>
                🖨 Print presentation slides (PDF)
              </button>
              <button type="button" className="cv-btn sm" onClick={actions.printExecutiveReport}>
                🖨 Executive status report (A4)
              </button>
              <button type="button" className="cv-btn sm" onClick={actions.downloadHtml}>
                ⬇ Standalone HTML deck
              </button>
            </div>
          </div>
        </Card>
      </div>

      <div className="cv-grid cv-g2" style={{ alignItems: 'start' }}>
        <Card title="Backup, import & export">
          <div className="cv-grid" style={{ gap: 10 }}>
            <div className="cv-sub" style={{ marginTop: 0 }}>
              The JSON backup contains every project record plus reports, issues and snapshots. Import <b>merges</b> reports, issues and snapshots (never
              deletes them; approved reports are never overwritten) and restores project collections using the existing import rules.
            </div>
            <div className="cv-row">
              <button type="button" className="cv-btn primary sm" onClick={actions.exportBackup}>
                ⬇ Export full JSON backup
              </button>
              {isManager && (
                <>
                  <button type="button" className="cv-btn sm" onClick={() => fileRef.current?.click()}>
                    ⬆ Import JSON backup
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".json,application/json"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) actions.importBackup(f);
                      e.target.value = '';
                    }}
                  />
                </>
              )}
              <button type="button" className="cv-btn sm" onClick={() => actions.navigate('tracker/register')}>
                Register CSV (from tracker)
              </button>
            </div>
          </div>
        </Card>

        <Card title="Baseline & history">
          <div className="cv-grid" style={{ gap: 10 }}>
            <div className="cv-sub" style={{ marginTop: 0 }}>
              The baseline is the original plan used for planned-vs-actual. It is captured automatically the first time an activity's dates are revised.
              Freezing records it now for every activity that does not have one yet ({noBaseline} remaining). Existing baselines are never overwritten.
            </div>
            <div className="cv-row">
              <button type="button" className="cv-btn sm" disabled={!isManager || noBaseline === 0} onClick={() => setConfirmFreeze(true)}>
                🔒 Freeze baseline for {noBaseline} activit{noBaseline === 1 ? 'y' : 'ies'}
              </button>
              <button type="button" className="cv-btn sm" disabled={!canEdit} onClick={() => actions.captureSnapshot(true)}>
                📸 {todaySnap ? 'Update' : 'Capture'} today's progress snapshot
              </button>
            </div>
            <div className="cv-dim">
              {snapshots.length} snapshot(s) recorded{snapshots.length ? ` · first ${fmtDate(snapshots[0].date)} · latest ${fmtDate(snapshots[snapshots.length - 1].date)}` : ''}.
              {canEdit ? ' A snapshot is taken automatically once per day while a team member has the dashboard open.' : ' Sign in to record snapshots.'}
            </div>
          </div>
        </Card>
      </div>

      <Card title="Data health check" note={`${findings.length} finding(s) · validation only, nothing is changed`}>
        {findings.length ? (
          <div className="cv-table-wrap" style={{ maxHeight: 360 }}>
            <table className="cv-table">
              <thead>
                <tr>
                  <th>Severity</th>
                  <th>Area</th>
                  <th>Finding</th>
                </tr>
              </thead>
              <tbody>
                {findings.map((f, i) => (
                  <tr key={i} className={f.refId ? 'clickable' : ''} onClick={() => f.refId && actions.openActivity(f.refId)}>
                    <td>
                      <Pill label={f.severity} color={f.severity === 'error' ? '#D92D3F' : f.severity === 'warning' ? '#E0A800' : '#A45BE8'} />
                    </td>
                    <td className="nowrap">{f.area}</td>
                    <td>{f.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>No data problems found.</Empty>
        )}
      </Card>

      <Card title="Administration" note={`Signed in as ${user.name} (${user.role})`}>
        <div className="cv-row">
          <button type="button" className="cv-btn sm" disabled={!isAdmin} onClick={actions.openAuditLogs}>
            📜 Audit log
          </button>
          <button type="button" className="cv-btn sm" disabled={!isAdmin} onClick={actions.openAdminPanel}>
            ⚙️ User management
          </button>
          <button type="button" className="cv-btn sm danger" disabled={!isAdmin} onClick={actions.resetBaseline}>
            Reset project to factory baseline…
          </button>
        </div>
        {!isAdmin && <div className="cv-dim" style={{ marginTop: 6 }}>Administration tools are available to Administrators only.</div>}
        {isAdmin && (
          <div className="cv-dim" style={{ marginTop: 6 }}>
            Reset replaces project records with the original seed data. Export a backup first. Reports, issues and snapshots are not affected by a reset.
          </div>
        )}
      </Card>
      {confirmFreeze && (
        <ConfirmDialog
          title="Freeze the baseline?"
          message={`Records the current planned dates as the baseline for ${noBaseline} activit${noBaseline === 1 ? 'y' : 'ies'} that do not have one. Activities that already have a baseline keep it.`}
          confirmLabel="Freeze baseline"
          onCancel={() => setConfirmFreeze(false)}
          onConfirm={() => {
            setConfirmFreeze(false);
            actions.freezeBaseline();
          }}
        />
      )}
    </div>
  );
};
