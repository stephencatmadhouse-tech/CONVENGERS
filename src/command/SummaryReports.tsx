/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Internal summary reports generated live from the master register:
 * construction progress, production–construction coordination, delayed
 * activities and upcoming activities. Printable (A4) and exportable (CSV).
 */

import React, { useMemo, useState } from 'react';
import { useCommand } from './context.tsx';
import { addDays, diffDays, fmtDate, fmtRange } from '../domain/dates.ts';
import { toCsv } from '../domain/reports.ts';
import { buildOutlook } from '../domain/attention.ts';
import { LOGO_SVG } from '../constants/assets.ts';
import { downloadFile, Empty, Pill, StatusPill } from './ui.tsx';
import { ALIGNMENT_COLORS } from '../domain/alignment.ts';

type Kind = 'progress' | 'coordination' | 'delayed' | 'upcoming';
const TITLES: Record<Kind, string> = {
  progress: 'Construction Progress Summary',
  coordination: 'Production & Construction Coordination Report',
  delayed: 'Delayed Activities Report',
  upcoming: 'Upcoming Activities Summary',
};

export const SummaryReports: React.FC = () => {
  const { register, metrics, alignment, today, actions } = useCommand();
  const [kind, setKind] = useState<Kind>('progress');
  const [days, setDays] = useState(14);

  const body = useMemo(() => {
    if (kind === 'progress') {
      const headers = ['Workstream', 'Weight %', 'Actual %', 'Planned %', 'Variance', 'Completed', 'Delayed', 'Activities'];
      const rows = metrics.workstreams.map((w) => [w.label, w.weight, w.actual, w.planned, (w.actual - w.planned).toFixed(1), w.completed, w.delayed, w.count]);
      return { headers, rows, note: `Overall physical accomplishment ${metrics.actualPct}% vs ${metrics.plannedPct}% planned · health ${metrics.health}.` };
    }
    if (kind === 'coordination') {
      const list = alignment.filter((a) => a.classification !== 'Completed' && (a.episode.finish || a.episode.start || '') >= today);
      return {
        headers: ['Episode / shoot', 'Shoot window', 'Classification', 'Linked construction', 'Characters', 'Coordination required'],
        rows: list.map((a) => [
          a.episode.name,
          fmtRange(a.episode.start, a.episode.finish),
          a.classification,
          a.linked.map((l) => `${l.scope.name} (${fmtRange(l.scope.start, l.scope.finish)})`).join('; ') || '—',
          a.episode.characters.length,
          a.alerts.map((x) => x.message).join(' | ') || 'None',
        ]),
        note: `${list.length} upcoming shoot(s). Calendars are compared, never changed automatically.`,
      };
    }
    if (kind === 'delayed') {
      const list = register.filter((r) => r.status === 'Delayed');
      return {
        headers: ['Activity', 'Workstream', 'Responsible', 'Due', 'Days overdue', 'Progress', 'Baseline finish', 'Corrective action'],
        rows: list.map((r) => [r.name, r.workstream, r.owner || 'Unassigned', fmtDate(r.finish), r.finish ? diffDays(r.finish, today) : '', `${r.progress}%`, fmtDate(r.plannedFinish), r.correctiveAction || '—']),
        note: `${list.length} delayed activit${list.length === 1 ? 'y' : 'ies'} as of ${fmtDate(today)}.`,
      };
    }
    const out = buildOutlook(register, alignment, today, addDays(today, days), today);
    return {
      headers: ['Activity', 'Workstream', 'Schedule', 'Commitment / outlook', 'Responsible', 'Risk notes'],
      rows: out.map((o) => [o.activity.name, o.activity.workstream, fmtRange(o.activity.start, o.activity.finish), o.outlook, o.activity.owner || 'Unassigned', o.reasons.join('; ') || '—']),
      note: `${out.length} activit${out.length === 1 ? 'y' : 'ies'} scheduled between ${fmtDate(today)} and ${fmtDate(addDays(today, days))}.`,
    };
  }, [kind, days, register, metrics, alignment, today]);

  const title = `${TITLES[kind]} — ${fmtDate(today)}`;
  const doc = (
    <article className="cv-doc">
      <header className="cv-doc-head">
        <img src={LOGO_SVG} alt="Convengers emblem" />
        <div>
          <div className="cv-kicker">Convengers Bahay Build · Internal report</div>
          <div className="cv-h1" style={{ fontSize: 24 }}>
            {TITLES[kind]}
          </div>
          <div className="cv-dim">Generated {fmtDate(today)} from the master project database</div>
        </div>
      </header>
      <p>{body.note}</p>
      {body.rows.length ? (
        <div className="cv-table-wrap">
          <table className="cv-table">
            <thead>
              <tr>
                {body.headers.map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((c, j) => (
                    <td key={j}>
                      {kind === 'coordination' && j === 2 ? (
                        <Pill label={String(c)} color={ALIGNMENT_COLORS[c as keyof typeof ALIGNMENT_COLORS]} />
                      ) : kind === 'upcoming' && j === 3 ? (
                        <Pill label={String(c)} />
                      ) : (
                        String(c ?? '')
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty>Nothing to report.</Empty>
      )}
    </article>
  );

  return (
    <div className="cv-grid" style={{ gap: 12 }}>
      <div className="cv-filters">
        {(Object.keys(TITLES) as Kind[]).map((k) => (
          <button key={k} type="button" className={`cv-btn sm ${kind === k ? 'purple' : 'ghost'}`} onClick={() => setKind(k)}>
            {TITLES[k].replace(' Report', '').replace(' Summary', '')}
          </button>
        ))}
        {kind === 'upcoming' && (
          <select className="cv-select" value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Horizon">
            <option value={7}>Next 7 days</option>
            <option value={14}>Next 14 days</option>
            <option value={30}>Next 30 days</option>
          </select>
        )}
        <span className="cv-spacer" />
        <button type="button" className="cv-btn sm" onClick={() => actions.printElement(() => doc, title)}>
          🖨 Print / PDF
        </button>
        <button type="button" className="cv-btn sm" onClick={() => downloadFile(`Convengers_${kind}_${today}.csv`, toCsv(body.headers, body.rows), 'text/csv;charset=utf-8')}>
          ⬇ CSV
        </button>
      </div>
      {doc}
    </div>
  );
};

export { StatusPill };
