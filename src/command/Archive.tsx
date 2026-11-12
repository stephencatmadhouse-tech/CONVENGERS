/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * 11 — PROJECT ARCHIVE: historical reports by year & month + snapshots.
 */

import React, { useMemo, useState } from 'react';
import { useCommand } from './context.tsx';
import { ProjectReport } from '../types/index.ts';
import { ReportContent, reportToCsv } from '../domain/reports.ts';
import { fmtDate, fmtRange, monthLabel } from '../domain/dates.ts';
import { Card, Empty, Banner, downloadFile, Modal, pct } from './ui.tsx';
import { ReportDocument, ReportStatusStamp } from './Reports.tsx';

export const Archive: React.FC = () => {
  const { reports, snapshots, actions, isAdmin } = useCommand();
  const [onlyApproved, setOnlyApproved] = useState(false);
  const [viewing, setViewing] = useState<ProjectReport | null>(null);
  const list = reports.filter((r) => !onlyApproved || r.status === 'approved');

  const tree = useMemo(() => {
    const years = new Map<string, Map<string, ProjectReport[]>>();
    list.forEach((r) => {
      const y = r.periodEnd.slice(0, 4);
      const m = r.periodEnd.slice(0, 7);
      if (!years.has(y)) years.set(y, new Map());
      const ym = years.get(y)!;
      ym.set(m, [...(ym.get(m) || []), r]);
    });
    return Array.from(years.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([y, ms]) => ({
        year: y,
        months: Array.from(ms.entries())
          .sort((a, b) => b[0].localeCompare(a[0]))
          .map(([m, rs]) => ({ key: m, reports: rs.sort((a, b) => (a.type === b.type ? b.periodStart.localeCompare(a.periodStart) : a.type === 'monthly' ? -1 : 1)) })),
      }));
  }, [list]);

  const exportAll = () => {
    downloadFile(
      `Convengers_Report_Archive_${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify({ app: 'convengers-bahay-build', kind: 'archive', exportedAt: new Date().toISOString(), reports, snapshots }, null, 2),
      'application/json'
    );
  };

  const printReport = (r: ProjectReport) => {
    if (!r.frozen) {
      actions.navigate(`reports/${r.type}/id=${r.id}`);
      return;
    }
    actions.printElement(() => <ReportDocument content={r.frozen as ReportContent} narrative={r.narrative} title={r.title} report={r} printMode />, r.title);
  };

  return (
    <div className="cv-grid" style={{ gap: 14 }}>
      <Banner kind="info">
        Approved reports are frozen at approval and cannot be edited or deleted, so later changes to the master schedule never alter them. Drafts are listed
        for reference and open in the live report editor.
      </Banner>
      <div className="cv-filters">
        <label className="cv-row" style={{ fontSize: 13 }}>
          <input type="checkbox" checked={onlyApproved} onChange={(e) => setOnlyApproved(e.target.checked)} /> Approved reports only
        </label>
        <span className="cv-spacer" />
        <button type="button" className="cv-btn sm" onClick={exportAll}>
          ⬇ Export archive (JSON)
        </button>
      </div>
      {tree.length ? (
        tree.map((y) => (
          <Card key={y.year} title={`${y.year}`} note={`${y.months.reduce((s, m) => s + m.reports.length, 0)} report(s)`}>
            {y.months.map((m) => (
              <div key={m.key} style={{ marginBottom: 12 }}>
                <div className="cv-kpi-l" style={{ marginBottom: 6 }}>
                  {monthLabel(m.key)}
                </div>
                <div className="cv-list">
                  {m.reports.map((r) => (
                    <div key={r.id} className="cv-li">
                      <div className="cv-li-main">
                        <div className="cv-li-t">{r.title}</div>
                        <div className="cv-li-s">
                          {r.type === 'weekly' ? 'Weekly' : 'Monthly'} · {fmtRange(r.periodStart, r.periodEnd)} ·{' '}
                          {r.status === 'approved' ? `approved ${fmtDate(r.approvedAt?.slice(0, 10))} by ${r.approvedBy}` : `draft updated ${fmtDate(r.updatedAt.slice(0, 10))}`}
                          {r.frozen ? ` · actual ${pct((r.frozen as ReportContent).metrics.actualPct)}` : ''}
                          {r.localOnly ? ' · this device only' : ''}
                        </div>
                      </div>
                      <div className="cv-row" style={{ gap: 4 }}>
                        <ReportStatusStamp report={r} />
                        {r.frozen ? (
                          <button type="button" className="cv-btn sm" onClick={() => setViewing(r)}>
                            View
                          </button>
                        ) : (
                          <button type="button" className="cv-btn sm" onClick={() => actions.navigate(`reports/${r.type}/id=${r.id}`)}>
                            Open draft
                          </button>
                        )}
                        <button type="button" className="cv-btn sm ghost" onClick={() => printReport(r)}>
                          🖨
                        </button>
                        {r.frozen && (
                          <button type="button" className="cv-btn sm ghost" onClick={() => downloadFile(`Convengers_${r.id}.csv`, reportToCsv(r.frozen as ReportContent, r.title), 'text/csv;charset=utf-8')}>
                            CSV
                          </button>
                        )}
                        <button
                          type="button"
                          className="cv-btn sm ghost"
                          onClick={() => downloadFile(`Convengers_${r.id}.json`, JSON.stringify({ app: 'convengers-bahay-build', kind: 'report', report: r }, null, 2), 'application/json')}
                        >
                          JSON
                        </button>
                        {isAdmin && r.status !== 'approved' && (
                          <button type="button" className="cv-btn sm danger" onClick={() => actions.deleteReport(r.id)}>
                            Delete draft
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </Card>
        ))
      ) : (
        <Empty>No reports have been saved yet. Generate a weekly or monthly report in “Weekly & Monthly Reports”.</Empty>
      )}

      <Card title="Progress snapshot history" note="Daily point-in-time records used for trends. Read-only.">
        {snapshots.length ? (
          <div className="cv-table-wrap" style={{ maxHeight: 360 }}>
            <table className="cv-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th className="num">Actual</th>
                  <th className="num">Planned</th>
                  <th className="num">Completed</th>
                  <th className="num">Ongoing</th>
                  <th className="num">Delayed</th>
                  <th>Captured by</th>
                </tr>
              </thead>
              <tbody>
                {[...snapshots].reverse().map((s) => (
                  <tr key={s.id}>
                    <td className="nowrap cv-strong">{fmtDate(s.date)}</td>
                    <td className="num">{s.actualPct}%</td>
                    <td className="num">{s.plannedPct}%</td>
                    <td className="num">{s.counts.completed}</td>
                    <td className="num">{s.counts.ongoing}</td>
                    <td className="num">{s.counts.delayed}</td>
                    <td className="cv-dim">
                      {s.capturedBy}
                      {s.localOnly ? ' · this device only' : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>No snapshots yet.</Empty>
        )}
      </Card>
      {viewing && (
        <Modal
          title={viewing.title}
          onClose={() => setViewing(null)}
          width={1100}
          footer={
            <button type="button" className="cv-btn" onClick={() => printReport(viewing)}>
              🖨 Print / PDF
            </button>
          }
        >
          <ReportDocument content={viewing.frozen as ReportContent} narrative={viewing.narrative} title={viewing.title} report={viewing} />
        </Modal>
      )}
    </div>
  );
};
