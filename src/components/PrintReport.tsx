/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { FullDashboardData } from '../types/index.ts';
import { BrandLogo } from './BrandLogo.tsx';
import {
  calculateMilestonesCompletion,
  calculateScheduleElapsed,
  calculateConcreteCompletion,
  calculateFloorProgress,
} from '../utils/calculations.ts';

interface PrintReportProps {
  data: FullDashboardData;
}

function badgeStyle(status: string): React.CSSProperties {
  const s = (status || '').toLowerCase();
  if (s.includes('complete') || s.includes('approved')) {
    return { background: '#dcfce7', color: '#14532d', border: '1px solid #86efac' };
  }
  if (s.includes('delay') || s.includes('reject')) {
    return { background: '#fee2e2', color: '#7f1d1d', border: '1px solid #fca5a5' };
  }
  if (s.includes('progress') || s.includes('ongoing') || s.includes('scheduled') || s.includes('on-track')) {
    return { background: '#dbeafe', color: '#1e3a8a', border: '1px solid #93c5fd' };
  }
  if (s.includes('confirm') || s.includes('ready') || s.includes('passed')) {
    return { background: '#fef3c7', color: '#78350f', border: '1px solid #fcd34d' };
  }
  return { background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1' };
}

export const PrintReport: React.FC<PrintReportProps> = ({ data }) => {
  const milestonePct = calculateMilestonesCompletion(data.milestones);
  const elapsed = calculateScheduleElapsed();
  const concrete = calculateConcreteCompletion(data.pours);
  const gfPct = calculateFloorProgress(data.scopes, 'GF');
  const f2Pct = calculateFloorProgress(data.scopes, '2F');
  const f3Pct = calculateFloorProgress(data.scopes, '3F');
  const epDone = data.episodes.filter((e) => e.status === 'Completed').length;

  const reportDate = new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="pmrep-container" id="pmreport">
      {/* Branded Report Header */}
      <div className="pmrep-header">
        <div className="pmrep-brand">
          <BrandLogo variant="report" />
          <div>
            <div className="pmrep-kicker">CONVENGERS CONSTRUCTION MULTIVERSE · FORMAL PROJECT REPORT</div>
            <h1 className="pmrep-title">Convengers Bahay Build — Executive Status Report</h1>
            <div className="pmrep-meta">
              <span>Report Date: <b>{reportDate}</b></span>
              <span>·</span>
              <span>Window: <b>Oct 5, 2026 – Apr 30, 2027</b></span>
              <span>·</span>
              <span>Portal: <b>www.ConvengersAssemble.com</b></span>
              <span>·</span>
              <span>Version <b>{data.settings.version}</b></span>
            </div>
          </div>
        </div>
        <div className="pmrep-stoppage">
          <span className="pmrep-stoppage-tag">HOLIDAY WORK STOPPAGE</span>
          <span>Stops after Dec 19, 2026 · Resumes Jan 4, 2027</span>
        </div>
      </div>

      {/* Executive KPI Summary Grid */}
      <div className="pmrep-kpis">
        <div className="pmrep-kpi">
          <span className="pmrep-kpi-lbl">Schedule Elapsed</span>
          <b className="pmrep-kpi-val">{elapsed.elapsedPercent}%</b>
          <small>{elapsed.elapsedWorkingDays} of {elapsed.totalWorkingDays} working days</small>
        </div>
        <div className="pmrep-kpi">
          <span className="pmrep-kpi-lbl">Milestones Progress</span>
          <b className="pmrep-kpi-val">{milestonePct}%</b>
          <small>{data.milestones.filter((m) => m.status === 'Complete').length}/{data.milestones.length} milestones done</small>
        </div>
        <div className="pmrep-kpi">
          <span className="pmrep-kpi-lbl">Floor Progress (GF / 2F / 3F)</span>
          <b className="pmrep-kpi-val">{gfPct}% · {f2Pct}% · {f3Pct}%</b>
          <small>Weighted by working days</small>
        </div>
        <div className="pmrep-kpi">
          <span className="pmrep-kpi-lbl">Concrete Pours</span>
          <b className="pmrep-kpi-val">{concrete.percent}%</b>
          <small>{concrete.completed}/{concrete.total} pours approved</small>
        </div>
        <div className="pmrep-kpi">
          <span className="pmrep-kpi-lbl">Production Episodes</span>
          <b className="pmrep-kpi-val">{epDone}/{data.episodes.length}</b>
          <small>{data.episodes.length}-item series slate</small>
        </div>
      </div>

      {/* Section 1: Executive Milestones */}
      <section className="pmrep-section">
        <h2 className="pmrep-h2">1. Executive Milestones</h2>
        <table>
          <thead>
            <tr>
              <th style={{ width: '190px' }}>Target Date</th>
              <th>Milestone Description</th>
              <th style={{ width: '130px' }}>Tag</th>
              <th style={{ width: '150px' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {data.milestones.map((m) => (
              <tr key={m.id}>
                <td className="num"><b>{m.dateText}</b></td>
                <td>{m.label}</td>
                <td>{m.badge?.text || '—'}</td>
                <td>
                  <span className="pmrep-badge" style={badgeStyle(m.status)}>
                    {m.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Section 2: Floor Scope Summary */}
      <section className="pmrep-section">
        <h2 className="pmrep-h2">2. Construction Scopes by Floor</h2>
        {(['GF', '2F', '3F'] as const).map((floor) => {
          const floorScopes = data.scopes.filter((s) => s.floor === floor);
          const floorLabel =
            floor === 'GF' ? 'Ground Floor (GF)' : floor === '2F' ? 'Second Floor (2F)' : 'Third Floor (3F)';
          const floorPct = floor === 'GF' ? gfPct : floor === '2F' ? f2Pct : f3Pct;
          return (
            <div key={floor} className="pmrep-subblock">
              <div className="pmrep-subhdr">
                <span>{floorLabel}</span>
                <b>{floorPct}% weighted completion ({floorScopes.length} scopes)</b>
              </div>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: '95px' }}>Phase</th>
                    <th>Scope of Work</th>
                    <th style={{ width: '165px' }}>Scheduled Dates</th>
                    <th style={{ width: '75px' }}>Days</th>
                    <th style={{ width: '90px' }}>Progress</th>
                  </tr>
                </thead>
                <tbody>
                  {floorScopes.map((s) => (
                    <tr key={s.id}>
                      <td>{s.phase}</td>
                      <td>
                        <b>{s.name}</b>
                        {s.subNote ? <div className="pmrep-note">{s.subNote}</div> : null}
                      </td>
                      <td className="num">{s.dateText}</td>
                      <td className="num">{s.workingDays} d</td>
                      <td className="num"><b>{s.percentComplete}%</b></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </section>

      {/* Section 3: Concrete Pouring Status */}
      <section className="pmrep-section">
        <h2 className="pmrep-h2">3. Concrete Pouring Milestones</h2>
        <table>
          <thead>
            <tr>
              <th style={{ width: '50px' }}>Floor</th>
              <th style={{ width: '130px' }}>Component</th>
              <th>Pouring Activity</th>
              <th style={{ width: '92px' }}>Target Pour</th>
              <th style={{ width: '92px' }}>Actual Pour</th>
              <th style={{ width: '150px' }}>Milestone Status</th>
              <th style={{ width: '150px' }}>Remarks</th>
            </tr>
          </thead>
          <tbody>
            {data.pours.map((p) => (
              <tr key={p.id}>
                <td><b>{p.floor}</b></td>
                <td>{p.component}</td>
                <td>{p.activity}</td>
                <td className="num">{p.targetPour || '—'}</td>
                <td className="num">{p.actualPour || '—'}</td>
                <td>
                  <span className="pmrep-badge" style={badgeStyle(p.milestoneStatus)}>
                    {p.milestoneStatus}
                  </span>
                </td>
                <td>{p.remarks || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Section 4: Production Calendar */}
      <section className="pmrep-section">
        <h2 className="pmrep-h2">4. Production Calendar ({data.episodes.length} Episodes)</h2>
        <table>
          <thead>
            <tr>
              <th style={{ width: '42px' }}>Ep</th>
              <th>Title &amp; Topic</th>
              <th style={{ width: '170px' }}>Related Scope</th>
              <th style={{ width: '100px' }}>Shoot Start</th>
              <th style={{ width: '100px' }}>Release Date</th>
              <th style={{ width: '115px' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {data.episodes.map((e) => (
              <tr key={e.id}>
                <td className="num"><b>{e.episodeLabel || String(e.number).padStart(2, '0')}</b></td>
                <td>
                  <b>{e.title}</b>
                  {e.topic ? <div className="pmrep-note">{e.topic}</div> : null}
                </td>
                <td>{e.scopeOfWork || '—'}</td>
                <td className="num">{e.shootStart || '—'}</td>
                <td className="num">{e.releaseDate || '—'}</td>
                <td>
                  <span className="pmrep-badge" style={badgeStyle(e.status)}>
                    {e.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <footer className="pmrep-footer">
        <span>Convengers Bahay Build · www.ConvengersAssemble.com</span>
        <span>Assumes Mon–Sat workweek excluding listed Philippine holidays &amp; Dec 20–Jan 3 stoppage.</span>
      </footer>
    </div>
  );
};
