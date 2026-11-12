/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * 08 — WEEKLY & MONTHLY REPORTS
 * Drafts are recomputed live from the master register. Approving a report
 * freezes its content; approved reports are read-only and archived.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useCommand } from './context.tsx';
import { ProjectReport, ReportNarrative, ReportType } from '../types/index.ts';
import {
  buildWeeklyContent,
  buildMonthlyContent,
  WeeklyContent,
  MonthlyContent,
  ReportContent,
  ReportRow,
  IssueRow,
  weeklyReportId,
  monthlyReportId,
  reportToCsv,
  fmtVar,
} from '../domain/reports.ts';
import { addDays, fmtDate, fmtRange, monthLabel, monthRange, weekRange } from '../domain/dates.ts';
import { Banner, Kpi, StatusPill, Empty, ConfirmDialog, downloadFile, pct, HealthBadge, Pill } from './ui.tsx';
import { parseParams } from './Tracker.tsx';
import { LOGO_SVG } from '../constants/assets.ts';

const WEEKLY_FIELDS: { k: keyof ReportNarrative; label: string }[] = [
  { k: 'executiveSummary', label: 'Executive summary' },
  { k: 'construction', label: 'Construction accomplishments (narrative)' },
  { k: 'production', label: 'Production updates (narrative)' },
  { k: 'issues', label: 'Issues & concerns' },
  { k: 'correctiveActions', label: 'Corrective actions' },
  { k: 'nextPeriod', label: "Next week's focus" },
];
const MONTHLY_FIELDS: { k: keyof ReportNarrative; label: string }[] = [
  { k: 'executiveSummary', label: '1. Executive summary' },
  { k: 'construction', label: '3. Construction performance (narrative)' },
  { k: 'production', label: '4. Production performance (narrative)' },
  { k: 'issues', label: '7. Issues & corrective actions (narrative)' },
  { k: 'nextPeriod', label: "9. Next month's focus" },
  { k: 'recommendations', label: '10. Management recommendations' },
];

export function reportTitle(type: ReportType, periodStart: string, periodEnd: string): string {
  return type === 'weekly' ? `Weekly Accomplishment Report — ${fmtRange(periodStart, periodEnd)}` : `Monthly Project Report — ${monthLabel(periodStart.slice(0, 7))}`;
}

export const ReportsPage: React.FC<{ type: ReportType }> = ({ type }) => {
  const { register, data, issues, snapshots, reports, today, actions, isManager, canEdit, user, route, sharedStorage } = useCommand();
  const params = parseParams(route.param);
  const [anchor, setAnchor] = useState(() => {
    if (params.id) return params.id.replace(/^W-/, '').replace(/^M-/, '') + (params.id.startsWith('M-') ? '-01' : '');
    return today;
  });
  useEffect(() => {
    if (params.id) setAnchor(params.id.replace(/^W-/, '').replace(/^M-/, '') + (params.id.startsWith('M-') ? '-01' : ''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.param]);

  const id = type === 'weekly' ? weeklyReportId(anchor) : monthlyReportId(anchor);
  const range = type === 'weekly' ? weekRange(anchor) : monthRange(anchor);
  const saved = reports.find((r) => r.id === id);
  // Approved, published and archived reports are frozen
  const approved = !!saved && ['approved', 'published', 'archived'].includes(saved.status);

  const live = useMemo<ReportContent>(
    () =>
      type === 'weekly'
        ? buildWeeklyContent(register, data.milestones, issues, snapshots, anchor, today)
        : buildMonthlyContent(register, data.milestones, issues, snapshots, reports, anchor, today),
    [type, register, data.milestones, issues, snapshots, reports, anchor, today]
  );
  const content: ReportContent = approved && saved?.frozen ? (saved.frozen as ReportContent) : live;

  const [narrative, setNarrative] = useState<ReportNarrative>(saved?.narrative || {});
  const [dirty, setDirty] = useState(false);
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState<null | 'published' | 'archived'>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setNarrative(saved?.narrative || {});
    setDirty(false);
  }, [id, saved?.updatedAt]);

  const fields = type === 'weekly' ? WEEKLY_FIELDS : MONTHLY_FIELDS;
  const title = reportTitle(type, range.start, range.end);
  const editable = canEdit && !approved;

  const shift = (n: number) => {
    if (type === 'weekly') setAnchor(addDays(range.start, 7 * n));
    else {
      const d = new Date(+range.start.slice(0, 4), +range.start.slice(5, 7) - 1 + n, 1);
      setAnchor(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`);
    }
  };

  const buildRecord = (status: 'draft' | 'review' | 'approved'): ProjectReport => {
    const now = new Date().toISOString();
    return {
      id,
      type,
      periodStart: range.start,
      periodEnd: range.end,
      title,
      status,
      narrative,
      frozen: status === 'approved' ? { ...live, narrativeAtApproval: narrative } : undefined,
      createdAt: saved?.createdAt || now,
      createdBy: saved?.createdBy || user.name,
      updatedAt: now,
      updatedBy: user.name,
      approvedAt: status === 'approved' ? now : undefined,
      approvedBy: status === 'approved' ? user.name : undefined,
    };
  };

  const saveDraft = async (status: 'draft' | 'review' = 'draft') => {
    setBusy(true);
    await actions.saveReport(buildRecord(status));
    setBusy(false);
    setDirty(false);
  };
  const changePublishing = async (to: 'published' | 'archived') => {
    setConfirmPublish(null);
    setBusy(true);
    await actions.setReportPublishing(id, to);
    setBusy(false);
  };
  const approve = async () => {
    setConfirmApprove(false);
    setBusy(true);
    await actions.saveReport(buildRecord('approved'));
    setBusy(false);
    setDirty(false);
  };
  const autofill = () => {
    const c = live;
    const next: ReportNarrative = { ...narrative };
    if (!next.executiveSummary) next.executiveSummary = c.autoSummary;
    if (c.kind === 'monthly' && !next.recommendations) next.recommendations = c.autoRecommendations.map((r) => `• ${r}`).join('\n');
    if (c.kind === 'weekly' && !next.correctiveActions && c.correctiveActions.length)
      next.correctiveActions = c.correctiveActions.map((a) => `• ${a.title}: ${a.action}${a.owner ? ` (${a.owner})` : ''}`).join('\n');
    setNarrative(next);
    setDirty(true);
  };

  const exportJson = () =>
    downloadFile(`Convengers_${id}.json`, JSON.stringify({ app: 'convengers-bahay-build', kind: 'report', report: saved ? { ...saved } : buildRecord('draft'), content }, null, 2), 'application/json');
  const exportCsv = () => downloadFile(`Convengers_${id}.csv`, reportToCsv(content, title), 'text/csv;charset=utf-8');
  const print = () =>
    actions.printElement(
      () => <ReportDocument content={content} narrative={approved ? saved!.narrative : narrative} title={title} report={saved} printMode />,
      title
    );

  return (
    <div>
      <div className="cv-filters">
        <button type="button" className="cv-btn sm" onClick={() => shift(-1)} aria-label="Previous period">
          ◀
        </button>
        <button type="button" className="cv-btn sm ghost" onClick={() => setAnchor(today)}>
          {type === 'weekly' ? 'This week' : 'This month'}
        </button>
        <button type="button" className="cv-btn sm" onClick={() => shift(1)} aria-label="Next period">
          ▶
        </button>
        <input
          type={type === 'weekly' ? 'date' : 'month'}
          className="cv-input"
          value={type === 'weekly' ? anchor : anchor.slice(0, 7)}
          onChange={(e) => e.target.value && setAnchor(type === 'weekly' ? e.target.value : `${e.target.value}-01`)}
          aria-label="Report period"
        />
        <b style={{ fontFamily: "'Barlow Condensed',sans-serif", fontSize: 18, letterSpacing: 1 }}>{type === 'weekly' ? fmtRange(range.start, range.end) : monthLabel(range.start.slice(0, 7))}</b>
        <ReportStatusStamp report={saved} />
        <span className="cv-spacer" />
        <button type="button" className="cv-btn sm" onClick={print}>
          🖨 Print / PDF
        </button>
        <button type="button" className="cv-btn sm" onClick={exportCsv}>
          ⬇ CSV
        </button>
        <button type="button" className="cv-btn sm" onClick={exportJson}>
          ⬇ JSON
        </button>
      </div>

      {approved ? (
        <Banner kind="ok">
          Approved by {saved!.approvedBy} on {fmtDate(saved!.approvedAt!.slice(0, 10))}. This report is locked: its figures were frozen at approval and will
          not change when the master schedule is updated.
          {saved!.status === 'published' && ` Published to the client portal by ${saved!.publishedBy} on ${fmtDate(saved!.publishedAt!.slice(0, 10))} (client-safe version: no owners, internal notes, issues or production details).`}
          {saved!.status === 'archived' && ' Archived — not visible on the client portal.'}
          {isManager && (
            <span className="cv-row" style={{ marginTop: 8 }}>
              {saved!.status !== 'published' && (
                <button type="button" className="cv-btn sm primary" disabled={busy} onClick={() => setConfirmPublish('published')}>
                  Publish to client portal
                </button>
              )}
              {saved!.status !== 'archived' && (
                <button type="button" className="cv-btn sm" disabled={busy} onClick={() => setConfirmPublish('archived')}>
                  {saved!.status === 'published' ? 'Unpublish & archive' : 'Archive'}
                </button>
              )}
            </span>
          )}
        </Banner>
      ) : (
        <Banner kind="info">
          {saved ? 'Draft report' : 'Not yet generated'} — figures below are computed live from the master register
          {range.end >= today ? ' and will keep updating until the period ends and the report is approved' : ''}. Approve to freeze it into the archive.
        </Banner>
      )}
      {saved?.localOnly && <Banner kind="warn">This report is saved on this device only (shared report storage is not enabled yet). Other users and devices cannot see it.</Banner>}
      {!sharedStorage.reports && !saved && <Banner kind="warn">Shared report storage is unavailable; saving will keep this report on this device only.</Banner>}

      <div className="cv-grid" style={{ gridTemplateColumns: editable ? 'minmax(0,1fr) minmax(280px, 380px)' : 'minmax(0,1fr)', alignItems: 'start' }}>
        <ReportDocument content={content} narrative={approved ? saved!.narrative : narrative} title={title} report={saved} />
        {editable && (
          <div className="cv-card" style={{ position: 'sticky', top: 80 }}>
            <div className="cv-card-h">
              <h3 className="cv-card-t">Narrative editor</h3>
              <button type="button" className="cv-btn sm ghost" onClick={autofill} title="Fill empty sections from the computed data">
                Auto-draft
              </button>
            </div>
            <div className="cv-grid" style={{ gap: 10 }}>
              {fields.map((f) => (
                <label key={f.k} className="cv-field">
                  <span>{f.label}</span>
                  <textarea
                    className="cv-textarea"
                    value={narrative[f.k] || ''}
                    onChange={(e) => {
                      setNarrative({ ...narrative, [f.k]: e.target.value });
                      setDirty(true);
                    }}
                  />
                </label>
              ))}
            </div>
            <div className="cv-row" style={{ marginTop: 12 }}>
              <button type="button" className="cv-btn" disabled={busy || (!dirty && !!saved)} onClick={() => saveDraft(saved?.status === 'review' ? 'review' : 'draft')}>
                {busy ? 'Saving…' : saved ? 'Save' : 'Generate & save draft'}
              </button>
              {saved?.status !== 'review' && (
                <button type="button" className="cv-btn" disabled={busy} onClick={() => saveDraft('review')}>
                  Submit for review
                </button>
              )}
              {isManager && saved?.status === 'review' && (
                <button type="button" className="cv-btn" disabled={busy} onClick={() => saveDraft('draft')}>
                  Return to draft
                </button>
              )}
              {isManager && (
                <button type="button" className="cv-btn primary" disabled={busy} onClick={() => setConfirmApprove(true)}>
                  Approve & lock
                </button>
              )}
            </div>
            <div className="cv-dim" style={{ marginTop: 6 }}>
              Workflow: Draft → For Review → Approved (locked) → Published to client portal → Archived. {isManager ? '' : 'Approval and publishing are done by a Project Manager.'}
            </div>
            {dirty && <div className="cv-dim" style={{ marginTop: 6 }}>Unsaved narrative changes.</div>}
          </div>
        )}
      </div>
      {!canEdit && !approved && <div className="cv-dim" style={{ marginTop: 8 }}>Read-only access.</div>}
      {confirmPublish && (
        <ConfirmDialog
          title={confirmPublish === 'published' ? 'Publish to the client portal?' : 'Archive this report?'}
          message={
            confirmPublish === 'published' ? (
              <>
                A client-safe copy of <b>{title}</b> will appear on the Executive &amp; Client Portal: executive summary, construction narrative, progress figures,
                completed / ongoing / upcoming construction activities and milestones. Responsible persons, internal notes, issues, corrective actions and
                production details are <b>not</b> published.
              </>
            ) : (
              'The report stays locked in the internal archive and is removed from the client portal.'
            )
          }
          confirmLabel={confirmPublish === 'published' ? 'Publish' : 'Archive'}
          onConfirm={() => changePublishing(confirmPublish)}
          onCancel={() => setConfirmPublish(null)}
        />
      )}
      {confirmApprove && (
        <ConfirmDialog
          title="Approve and lock this report?"
          message={
            <>
              The current figures for <b>{title}</b> will be frozen and archived. Approved reports cannot be edited or deleted, and later changes to the master
              schedule will not alter them.
              {range.end > today && (
                <div style={{ marginTop: 8 }} className="cv-late">
                  This period has not ended yet ({fmtDate(range.end)}). Approving now freezes partial-period figures.
                </div>
              )}
            </>
          }
          confirmLabel="Approve & lock"
          onConfirm={approve}
          onCancel={() => setConfirmApprove(false)}
        />
      )}
    </div>
  );
};

export const ReportStatusStamp: React.FC<{ report?: ProjectReport }> = ({ report }) => {
  if (!report) return <span className="cv-stamp" style={{ color: '#9A9AA3', borderColor: '#9A9AA3' }}>Not generated</span>;
  const map: Record<string, [string, string, string]> = {
    draft: ['Draft', '#8A5300', '#F5A623'],
    review: ['For Review', '#8A5300', '#F5A623'],
    approved: ['🔒 Approved', '#1E8E5E', '#22A06B'],
    published: ['🔒 Published', '#7026C8', '#7026C8'],
    archived: ['🔒 Archived', '#777777', '#C7C7D0'],
  };
  const [label, fg, bd] = map[report.status] || map.draft;
  return (
    <span className="cv-stamp" style={{ color: fg, borderColor: bd, background: '#FFFFFF' }}>
      {label}
    </span>
  );
};

// ---------- Report document (screen & print) ----------
const RowsTable: React.FC<{ rows: ReportRow[]; empty: string; showPlanned?: boolean }> = ({ rows, empty, showPlanned = true }) =>
  rows.length ? (
    <div className="cv-table-wrap">
      <table className="cv-table">
        <thead>
          <tr>
            <th>Activity</th>
            <th>Workstream</th>
            <th>Responsible</th>
            <th>Schedule</th>
            <th>Status</th>
            <th className="num">Actual</th>
            {showPlanned && <th className="num">Planned</th>}
            <th>Note</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="cv-strong">{r.name}</td>
              <td className="nowrap">{r.workstream}</td>
              <td>{r.owner}</td>
              <td className="nowrap">{fmtRange(r.start, r.finish)}</td>
              <td>
                <StatusPill status={r.status} />
              </td>
              <td className="num">{r.progress}%</td>
              {showPlanned && <td className="num">{r.planned}%</td>}
              <td className="cv-dim">{r.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <p className="cv-dim">{empty}</p>
  );

const IssuesTable: React.FC<{ rows: IssueRow[]; empty: string }> = ({ rows, empty }) =>
  rows.length ? (
    <div className="cv-table-wrap">
      <table className="cv-table">
        <thead>
          <tr>
            <th>Issue / risk</th>
            <th>Type</th>
            <th>Severity</th>
            <th>Status</th>
            <th>Owner</th>
            <th>Due</th>
            <th>Corrective action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((i) => (
            <tr key={i.id}>
              <td className="cv-strong">{i.title}</td>
              <td>{i.type}</td>
              <td>{i.severity}</td>
              <td>{i.status}</td>
              <td>{i.owner}</td>
              <td className="nowrap">{fmtDate(i.dueDate)}</td>
              <td className="cv-dim">{i.correctiveAction || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <p className="cv-dim">{empty}</p>
  );

const Narr: React.FC<{ text?: string; fallback?: string }> = ({ text, fallback }) =>
  text && text.trim() ? <p>{text}</p> : fallback ? <p className="cv-dim">{fallback}</p> : null;

const ProgressStrip: React.FC<{ c: ReportContent }> = ({ c }) => (
  <div className="cv-kpis">
    <Kpi label="Actual accomplishment" value={pct(c.metrics.actualPct)} accent sub="Weighted physical progress" />
    <Kpi label="Planned accomplishment" value={pct(c.metrics.plannedPct)} sub="Baseline plan" />
    <Kpi label="Variance" value={fmtVar(c.metrics.variancePct)} color={c.metrics.variancePct < 0 ? '#E5484D' : '#22A06B'} sub={c.metrics.spi ? `SPI ${c.metrics.spi}` : ''} />
    <Kpi
      label={c.kind === 'weekly' ? 'Gained this week' : 'Gained this month'}
      value={c.progressGain === null ? 'n/a' : `${c.progressGain >= 0 ? '+' : ''}${c.progressGain} pts`}
      sub={c.progressGain === null ? 'No snapshot at period start' : `${c.progressStart.actual}% → ${c.progressEnd.actual}%`}
    />
    <Kpi label="Projected completion" value={fmtDate(c.metrics.projectedCompletion)} sub={`Target ${fmtDate(c.metrics.targetCompletion)}`} />
  </div>
);

export const ReportDocument: React.FC<{ content: ReportContent; narrative: ReportNarrative; title: string; report?: ProjectReport; printMode?: boolean }> = ({
  content: c,
  narrative: n,
  title,
  report,
}) => (
  <article className="cv-doc">
    <header className="cv-doc-head">
      <img src={LOGO_SVG} alt="Convengers emblem" />
      <div style={{ flex: 1, minWidth: 200 }}>
        <div className="cv-kicker">Convengers Bahay Build · Project Management Command Center</div>
        <div className="cv-h1" style={{ fontSize: 26 }}>
          {title}
        </div>
        <div className="cv-dim">
          Period {fmtRange(c.periodStart, c.periodEnd)} · Generated {fmtDate(c.generatedAt.slice(0, 10))}
          {report?.approvedAt ? ` · Approved by ${report.approvedBy} on ${fmtDate(report.approvedAt.slice(0, 10))}` : report ? ` · ${report.status === 'review' ? 'FOR REVIEW' : 'DRAFT'}` : ' · DRAFT (not saved)'}
        </div>
      </div>
      <HealthBadge level={c.metrics.health} />
    </header>

    {c.kind === 'weekly' ? <WeeklyBody c={c} n={n} /> : <MonthlyBody c={c} n={n} />}

    <p className="cv-dim" style={{ marginTop: 18, borderTop: '1px solid var(--cv-line)', paddingTop: 8 }}>
      Figures are computed from the Convengers master project database. Actual accomplishment is the working-day weighted average of recorded scope
      progress; planned accomplishment follows the preserved baseline schedule. Values marked n/a had no recorded data — nothing is estimated.
    </p>
  </article>
);

const WeeklyBody: React.FC<{ c: WeeklyContent; n: ReportNarrative }> = ({ c, n }) => (
  <>
    <h2>Executive summary</h2>
    <Narr text={n.executiveSummary} fallback={c.autoSummary} />
    <ProgressStrip c={c} />
    <h2>Construction accomplishments</h2>
    <Narr text={n.construction} />
    <RowsTable rows={c.constructionUpdates} empty="No construction progress updates were recorded this week." />
    <h2>Production updates</h2>
    <Narr text={n.production} />
    <RowsTable rows={c.productionUpdates} empty="No production shoots or updates this week." showPlanned={false} />
    <h2>Completed activities</h2>
    <RowsTable rows={c.completed} empty="No activities completed this week." />
    <h2>Ongoing activities</h2>
    <RowsTable rows={c.ongoing} empty="No ongoing activities." />
    <h2>Delayed activities</h2>
    <RowsTable rows={c.delayed} empty="No delayed activities." />
    <h2>Issues & corrective actions</h2>
    <Narr text={n.issues} />
    <IssuesTable rows={c.issuesOpen} empty="No open issues on the log." />
    {(n.correctiveActions || c.correctiveActions.length > 0) && (
      <>
        <Narr text={n.correctiveActions} />
        {!n.correctiveActions && (
          <ul style={{ fontSize: 13 }}>
            {c.correctiveActions.map((a, i) => (
              <li key={i}>
                <b>{a.title}:</b> {a.action} {a.owner && <span className="cv-dim">({a.owner})</span>}
              </li>
            ))}
          </ul>
        )}
      </>
    )}
    <h2>Milestones (this week & next)</h2>
    <RowsTable rows={c.milestones} empty="No milestones due this week or next." />
    <h2>Next week's activities</h2>
    <Narr text={n.nextPeriod} />
    <RowsTable rows={c.nextWeek} empty="No activities scheduled for next week." />
  </>
);

const MonthlyBody: React.FC<{ c: MonthlyContent; n: ReportNarrative }> = ({ c, n }) => (
  <>
    <h2>1. Executive summary</h2>
    <Narr text={n.executiveSummary} fallback={c.autoSummary} />
    <h2>2. Overall project performance</h2>
    <ProgressStrip c={c} />
    <p className="cv-dim">Health: {c.metrics.healthReasons.join(' · ')}</p>
    <h2>3. Construction performance</h2>
    <Narr text={n.construction} />
    <div className="cv-table-wrap">
      <table className="cv-table">
        <thead>
          <tr>
            <th>Workstream</th>
            <th className="num">Weight</th>
            <th className="num">Actual</th>
            <th className="num">Planned</th>
            <th className="num">Variance</th>
            <th className="num">Completed</th>
            <th className="num">Delayed</th>
          </tr>
        </thead>
        <tbody>
          {c.workstreams.map((w) => (
            <tr key={w.key}>
              <td className="cv-strong">{w.label}</td>
              <td className="num">{w.weight}%</td>
              <td className="num">{w.actual}%</td>
              <td className="num">{w.planned}%</td>
              <td className={`num ${w.actual - w.planned < 0 ? 'cv-late' : ''}`}>{(w.actual - w.planned).toFixed(1)}</td>
              <td className="num">
                {w.completed}/{w.count}
              </td>
              <td className="num">{w.delayed}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    <p className="cv-strong">Completed this month</p>
    <RowsTable rows={c.construction.completed} empty="No construction activities completed this month." />
    <p className="cv-strong">Delayed</p>
    <RowsTable rows={c.construction.delayed} empty="No delayed construction activities." />
    <h2>4. Production performance</h2>
    <Narr text={n.production} />
    <div className="cv-row" style={{ marginBottom: 6 }}>
      <Pill label={`Shoot windows: ${c.production.shoots.length}`} color="#7026C8" />
      <Pill label={`Completed: ${c.production.completed}`} color="#22A06B" />
      <Pill label={`Scheduled: ${c.production.scheduled}`} color="#A34FEA" />
      <Pill label={`Tentative: ${c.production.tentative}`} color="#F5A623" />
      <Pill label={`Rescheduled: ${c.production.rescheduled}`} color="#A34FEA" />
    </div>
    <RowsTable rows={c.production.shoots} empty="No shoots this month." showPlanned={false} />
    <h2>5. Weekly accomplishment summary</h2>
    {c.weekly.length ? (
      <div className="cv-table-wrap">
        <table className="cv-table">
          <thead>
            <tr>
              <th>Week</th>
              <th>Report</th>
              <th className="num">Actual at week end</th>
              <th>Summary</th>
            </tr>
          </thead>
          <tbody>
            {c.weekly.map((w) => (
              <tr key={w.id}>
                <td className="nowrap cv-strong">{w.title}</td>
                <td>{w.status}</td>
                <td className="num">{w.actual === null ? 'n/a' : `${w.actual}%`}</td>
                <td className="cv-dim">{w.summary || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : (
      <p className="cv-dim">No weeks in this period.</p>
    )}
    <h2>6. Milestone accomplishments</h2>
    <RowsTable rows={c.milestones} empty="No milestones fell within this month." />
    <h2>7. Issues and corrective actions</h2>
    <Narr text={n.issues} />
    <p className="cv-strong">Raised this month</p>
    <IssuesTable rows={c.issuesRaised} empty="No issues raised this month." />
    <p className="cv-strong">Resolved this month</p>
    <IssuesTable rows={c.issuesResolved} empty="No issues resolved this month." />
    <p className="cv-strong">Still open</p>
    <IssuesTable rows={c.issuesOpen} empty="No open issues." />
    <h2>8. Planned vs. actual progress</h2>
    <div className="cv-table-wrap">
      <table className="cv-table">
        <thead>
          <tr>
            <th>Point</th>
            <th>Date</th>
            <th className="num">Planned</th>
            <th className="num">Actual</th>
            <th>Source</th>
          </tr>
        </thead>
        <tbody>
          {[
            ['Start of month', c.progressStart],
            ['End of month / as of', c.progressEnd],
          ].map(([label, p]: any) => (
            <tr key={label}>
              <td className="cv-strong">{label}</td>
              <td>{fmtDate(p.date)}</td>
              <td className="num">{p.planned}%</td>
              <td className="num">{p.actual === null ? 'n/a' : `${p.actual}%`}</td>
              <td className="cv-dim">{p.source === 'none' ? 'No snapshot recorded' : p.source}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    <h2>9. Next month's projected activities</h2>
    <Narr text={n.nextPeriod} />
    {c.nextMonth.length ? (
      <div className="cv-table-wrap">
        <table className="cv-table">
          <thead>
            <tr>
              <th>Activity</th>
              <th>Workstream</th>
              <th>Schedule</th>
              <th>Commitment</th>
              <th>Responsible</th>
              <th>Risk notes</th>
            </tr>
          </thead>
          <tbody>
            {c.nextMonth.map((r) => (
              <tr key={r.id}>
                <td className="cv-strong">{r.name}</td>
                <td className="nowrap">{r.workstream}</td>
                <td className="nowrap">{fmtRange(r.start, r.finish)}</td>
                <td>
                  <Pill label={r.outlook} color={r.outlook === 'At risk' ? '#E5484D' : r.outlook === 'Confirmed' ? '#22A06B' : r.outlook === 'Tentative' ? '#F5A623' : '#A34FEA'} />
                </td>
                <td>{r.owner}</td>
                <td className="cv-dim">{r.reasons.join('; ') || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : (
      <p className="cv-dim">No activities scheduled next month.</p>
    )}
    <h2>10. Management recommendations</h2>
    {n.recommendations?.trim() ? (
      <p>{n.recommendations}</p>
    ) : c.autoRecommendations.length ? (
      <ul style={{ fontSize: 13 }}>
        {c.autoRecommendations.map((r, i) => (
          <li key={i}>{r}</li>
        ))}
      </ul>
    ) : (
      <p className="cv-dim">No recommendations — no critical items recorded.</p>
    )}
  </>
);

export const ReportsEmpty: React.FC = () => <Empty>No reports.</Empty>;
