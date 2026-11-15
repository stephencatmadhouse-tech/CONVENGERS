/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * AUTOMATED NARRATIVE REPORTS
 *   Generate → (optional AI wording, checked) → review / edit → approve →
 *   final → PDF / DOCX (CONVENGERS template) → archive (search, filter, compare).
 *
 * Reports are written only from recorded project data (see domain/narrative.ts).
 * The generated original is stored with the report and never changes; every
 * later edit is a revision. Scheduled reports are prepared as drafts only.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { FileText, FileDown, Sparkles, Save, Send, CheckCircle2, Lock, RotateCcw, History, GitCompare, ImagePlus, Paperclip, Trash2, RefreshCw, CalendarClock, Eye } from 'lucide-react';
import './narrative.css';
import { useCommand } from './context.tsx';
import { Banner, Card, ConfirmDialog, Empty, Field, Kpi, Modal } from './ui.tsx';
import { useStore } from '../firebase/useStore.ts';
import { narrativeStore, narrativeConfigStore, driveFileStore, documentStore } from '../firebase/opsStores.ts';
import {
  NARRATIVE_TYPES,
  NARRATIVE_STATUS_LABEL,
  SECTION_TITLES,
  collectFacts,
  composeSections,
  defaultPeriod,
  figures as factFigures,
  narrativeId,
  upcomingPreparations,
  duePeriods,
  type NarrativeReport,
  type NarrativeSection,
  type NarrativeStatus,
  type NarrativeType,
  type NarrativePhoto,
} from '../domain/narrative.ts';
import { DR_PROJECT } from '../domain/dailyReport.ts';
import { fmtDate, isValidIso, todayIso } from '../domain/dates.ts';
import { aiReword, buildReport, narrativeAiStatus, periodLabel, useAutoPrepare, useNarrativeSchedule, useNarrativeSources, type AiResult } from './narrativeApi.ts';
import { driveFileUrl, driveObjectUrl, openDriveFile } from '../drive/driveClient.ts';
import { SecureImg } from '../drive/SecureMedia.tsx';
import { LOGO_SVG } from '../constants/assets.ts';
import { buildDocx, imageForDocx, type DocxBlock } from '../utils/docx.ts';
import { plural } from '../utils/plural.ts';

const nowIso = () => new Date().toISOString();
const STATUS_COLOR: Record<NarrativeStatus, string> = { draft: '#68738A', review: '#B45309', approved: '#1F9D68', final: '#0A1140' };
const TYPE_ORDER: NarrativeType[] = ['daily', 'weekly', 'monthly', 'milestone', 'activity', 'status', 'summary'];
const MAX_REV_SNAPSHOTS = 25;

export const NrStatus: React.FC<{ s: NarrativeStatus; local?: boolean }> = ({ s, local }) => (
  <span className="nr-status" style={{ ['--c' as any]: STATUS_COLOR[s] }}>
    {NARRATIVE_STATUS_LABEL[s]}
    {local ? ' · on this device' : ''}
  </span>
);

const fmtStamp = (iso?: string) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
};

/** Add a revision; only the newest snapshots keep full section text (document size). */
function withRevision(r: NarrativeReport, by: string, action: string, note?: string, sections?: NarrativeSection[]): NarrativeReport['revisions'] {
  const revs = [...r.revisions, { at: nowIso(), by, action, ...(note ? { note } : {}), ...(sections ? { sections } : {}) }];
  let kept = 0;
  for (let i = revs.length - 1; i >= 0; i--) {
    if (revs[i].sections) {
      kept++;
      if (kept > MAX_REV_SNAPSHOTS && i > 0) {
        const { sections: _drop, ...rest } = revs[i];
        void _drop;
        revs[i] = rest;
      }
    }
  }
  return revs.slice(-200);
}

// =====================================================================
export const NarrativeReports: React.FC<{ tab?: string; param?: string }> = ({ tab, param }) => {
  useAutoPrepare();
  if (param) return <ReportEditor key={param} id={param} back="narrative/archive" />;
  if (tab === 'archive') return <ArchivePanel />;
  if (tab === 'schedule') return <SchedulePanel />;
  return <GeneratePanel />;
};

// =====================================================================
// GENERATE
// =====================================================================
const GeneratePanel: React.FC = () => {
  const { today, register, user, canEdit, actions } = useCommand();
  const { sources, loaded } = useNarrativeSources();
  const [type, setType] = useState<NarrativeType>('weekly');
  const [start, setStart] = useState(() => defaultPeriod('weekly', today, register).start);
  const [end, setEnd] = useState(() => defaultPeriod('weekly', today, register).end);
  const [subject, setSubject] = useState('');
  const [useAi, setUseAi] = useState(false);
  const [ai, setAi] = useState<{ ai: boolean; model: string | null } | null | 'loading'>('loading');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'warn' | 'error'; text: React.ReactNode } | null>(null);
  const [preview, setPreview] = useState<NarrativeSection[] | null>(null);

  useEffect(() => {
    void narrativeAiStatus().then((s) => {
      setAi(s);
      if (s?.ai) setUseAi(true);
    });
  }, []);

  const pickType = (t: NarrativeType) => {
    setType(t);
    const p = defaultPeriod(t, today, register);
    setStart(p.start);
    setEnd(p.end);
    setPreview(null);
  };

  const valid = isValidIso(start) && isValidIso(end) && start <= end && (type !== 'activity' || !!subject);
  const req = { type, start, end, subjectId: type === 'activity' ? subject : undefined };
  const facts = useMemo(() => (valid && loaded ? collectFacts(req, sources) : null), [valid, loaded, sources, type, start, end, subject]); // eslint-disable-line react-hooks/exhaustive-deps
  const id = valid ? narrativeId(type, start, end, facts?.subject?.id) : '';
  const existing = sources.narratives.find((n) => n.id === id);
  const activities = useMemo(() => register.filter((r) => r.kind !== 'episode').sort((a, b) => a.name.localeCompare(b.name)), [register]);

  const generate = async () => {
    if (!valid || !facts || !canEdit) return;
    if (existing) {
      actions.navigate(`narrative/archive/${existing.id}`);
      return;
    }
    setBusy(true);
    setMsg(null);
    let aiRes: AiResult | undefined;
    if (useAi && ai && ai !== 'loading' && ai.ai) {
      aiRes = await aiReword(composeSections(facts), NARRATIVE_TYPES[type].label, periodLabel({ type, periodStart: start, periodEnd: end }));
      if (!aiRes.ok) setMsg({ kind: 'warn', text: `${aiRes.error} The report was generated from the records without AI wording.` });
    }
    const rec = buildReport(req, sources, user, { ai: aiRes });
    try {
      const where = await narrativeStore.put(rec);
      setBusy(false);
      actions.toast(where === 'shared' ? `${rec.reference} saved as a draft` : `${rec.reference} saved on this device only — it will sync when the connection returns`);
      actions.navigate(`narrative/archive/${rec.id}`);
    } catch (e) {
      setBusy(false);
      setMsg({ kind: 'error', text: `The report could not be saved: ${e instanceof Error ? e.message : 'unknown error'}.` });
    }
  };

  const fg = facts ? factFigures(facts) : null;
  return (
    <div className="cv-grid" style={{ gap: 14 }}>
      {msg && <Banner kind={msg.kind}>{msg.text}</Banner>}
      <Card title="Generate a narrative report" note="Written only from recorded project data. Missing information is shown as “Not Recorded”.">
        <div className="nr-types" role="radiogroup" aria-label="Report type">
          {TYPE_ORDER.map((t) => (
            <button key={t} type="button" role="radio" aria-checked={type === t} className={`nr-type ${type === t ? 'on' : ''}`} onClick={() => pickType(t)}>
              <b>{NARRATIVE_TYPES[t].label}</b>
              <span>{NARRATIVE_TYPES[t].note}</span>
            </button>
          ))}
        </div>
        <fieldset className="cv-fieldset" style={{ marginTop: 12 }} disabled={!canEdit}>
          <legend>Reporting period</legend>
          <Field label="From">
            <input type="date" className="cv-input" value={start} max={type === 'daily' ? undefined : end} onChange={(e) => (setStart(e.target.value), type === 'daily' && setEnd(e.target.value))} />
          </Field>
          {type !== 'daily' && (
            <Field label="To">
              <input type="date" className="cv-input" value={end} min={start} onChange={(e) => setEnd(e.target.value)} />
            </Field>
          )}
          {type === 'activity' && (
            <Field label="Activity" className="full">
              <select className="cv-select" value={subject} onChange={(e) => setSubject(e.target.value)}>
                <option value="">Choose an activity…</option>
                {activities.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} — {a.workstream}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <label className="nr-check full">
            <input type="checkbox" checked={useAi} disabled={!ai || ai === 'loading' || !ai.ai} onChange={(e) => setUseAi(e.target.checked)} />
            <span>
              Improve the wording with AI
              <em className="cv-dim">
                {ai === 'loading'
                  ? ' Checking…'
                  : ai?.ai
                    ? ' Formal tone only. Any section where the AI adds a figure, date or name that is not in the records is rejected automatically and the factual text is kept.'
                    : ai === null
                      ? ' The report service cannot be reached; reports are written from the records only.'
                      : ' Not configured on the server (GEMINI_API_KEY). Reports are written from the records only.'}
              </em>
            </span>
          </label>
        </fieldset>
        {!valid && <p className="cv-dim" style={{ marginTop: 8 }}>{type === 'activity' && !subject ? 'Choose an activity.' : 'Enter a valid period (the start must not be after the end).'}</p>}
        {fg && (
          <div className="nr-coverage" aria-label="Records found for this period">
            <span>
              <b>{fg.dailyReports}</b> {fg.dailyReports === 1 ? 'daily report' : 'daily reports'}
            </span>
            <span>
              <b>{fg.completed}</b> completed
            </span>
            <span>
              <b>{fg.ongoing}</b> ongoing
            </span>
            <span>
              <b>{fg.delayed}</b> delayed
            </span>
            <span>
              <b>{facts!.issuesRaised.length}</b> issues raised
            </span>
            <span>
              <b>{fg.photos}</b> {fg.photos === 1 ? 'photo' : 'photos'}
            </span>
            <span>
              <b>{fg.manDays ?? 'Not Recorded'}</b> worker-days
            </span>
          </div>
        )}
        {fg && fg.dailyReports === 0 && type !== 'summary' && type !== 'status' && (
          <Banner kind="info">No submitted Daily Construction Reports fall in this period. The report will use the tracker, milestones, issues and calendar, and mark daily site information as “Not Recorded”.</Banner>
        )}
        {existing && (
          <Banner kind="info">
            {existing.reference} already exists for this period ({NARRATIVE_STATUS_LABEL[existing.status]}). Generating opens it — use <b>Refresh from Records</b> in the editor to rebuild the text.
          </Banner>
        )}
        <div className="cv-row" style={{ marginTop: 12 }}>
          <button type="button" className="cv-btn ghost" disabled={!facts} onClick={() => setPreview(facts ? composeSections(facts) : null)}>
            <Eye size={15} aria-hidden /> Preview Factual Draft
          </button>
          {canEdit ? (
            <button type="button" className="cv-btn primary nr-generate" disabled={!valid || !facts || busy} onClick={generate}>
              <FileText size={16} aria-hidden /> {busy ? 'Generating…' : existing ? 'Open Report' : 'Generate Report'}
            </button>
          ) : (
            <span className="cv-dim">Your role can read narrative reports but not generate them.</span>
          )}
        </div>
      </Card>
      {preview && (
        <Card title="Factual draft preview" note="Not saved. This is the text the generator writes from the records.">
          <div className="nr-preview">
            {preview.map((s) => (
              <section key={s.key}>
                <h4>{SECTION_TITLES.find((t) => t.key === s.key)?.letter}. {s.title}</h4>
                {s.text.split(/\n{2,}/).map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </section>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
};

// =====================================================================
// EDITOR
// =====================================================================
const ReportEditor: React.FC<{ id: string; back: string }> = ({ id, back }) => {
  const { user, canEdit, isManager, isAdmin, actions } = useCommand();
  const store = useStore(narrativeStore);
  const { sources } = useNarrativeSources();
  const r = store.items.find((x) => x.id === id);
  const [sections, setSections] = useState<NarrativeSection[] | null>(null);
  const [photos, setPhotos] = useState<NarrativePhoto[] | null>(null);
  const [attachments, setAttachments] = useState<NarrativeReport['attachments'] | null>(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'warn' | 'error' | 'info'; text: React.ReactNode } | null>(null);
  const [note, setNote] = useState('');
  const [modal, setModal] = useState<'' | 'photos' | 'docs' | 'history' | 'original' | 'delete' | 'refresh' | 'final'>('');
  const [viewRev, setViewRev] = useState<number | null>(null);
  const [ai, setAi] = useState<{ ai: boolean } | null>(null);

  useEffect(() => {
    void narrativeAiStatus().then(setAi);
  }, []);
  useEffect(() => {
    if (r && sections === null) {
      setSections(r.sections);
      setPhotos(r.photos);
      setAttachments(r.attachments);
    }
  }, [r, sections]);

  if (!store.loaded) return <Empty>Loading…</Empty>;
  if (!r || !sections || !photos || !attachments)
    return (
      <Empty>
        This report was not found.{' '}
        <button type="button" className="cv-linkbtn" onClick={() => actions.navigate(back)}>
          Report Archive
        </button>
      </Empty>
    );

  const staff = canEdit;
  const editable = (r.status === 'draft' && staff) || (r.status === 'review' && isManager);
  const dirty = JSON.stringify(sections) !== JSON.stringify(r.sections) || JSON.stringify(photos) !== JSON.stringify(r.photos) || JSON.stringify(attachments) !== JSON.stringify(r.attachments);
  const canDelete = isAdmin || (staff && r.preparedById === user.id && r.status === 'draft');

  const save = async (patch: Partial<NarrativeReport>, action: string, okText: string, withSnapshot = true) => {
    setBusy(action);
    setMsg(null);
    const next: NarrativeReport = {
      ...r,
      sections,
      photos,
      attachments,
      ...patch,
      revisions: withRevision(r, user.name, action, note.trim() || undefined, withSnapshot ? (patch.sections as NarrativeSection[]) || sections : undefined),
      updatedAt: nowIso(),
      updatedBy: user.name,
    };
    try {
      const where = await narrativeStore.put(next);
      setNote('');
      if (patch.sections) setSections(patch.sections);
      setMsg(where === 'shared' ? { kind: 'ok', text: okText } : { kind: 'warn', text: `${okText} Saved on this device only — it will sync when the connection returns.` });
    } catch (e) {
      setMsg({ kind: 'error', text: `Not saved: ${e instanceof Error ? e.message : 'the database refused the change'}. Your edits are still on screen.` });
    }
    setBusy('');
  };

  const improve = async () => {
    setBusy('ai');
    const res = await aiReword(sections, NARRATIVE_TYPES[r.type].label, periodLabel(r));
    setBusy('');
    if (!res.ok) return setMsg({ kind: 'warn', text: res.error });
    setSections(res.sections);
    setMsg({
      kind: res.rejected.length ? 'warn' : 'ok',
      text: (
        <>
          AI wording applied to {plural(res.accepted, 'section')}. Review the text, then press <b>Save Draft</b>.
          {res.rejected.length > 0 && (
            <>
              {' '}
              Kept the original text in: {res.rejected.map((x) => `${x.title} (${x.reason})`).join('; ')}.
            </>
          )}
        </>
      ),
    });
  };

  const refresh = () => {
    const facts = collectFacts({ type: r.type, start: r.periodStart, end: r.periodEnd, subjectId: r.subjectId }, { ...sources, narratives: sources.narratives.filter((n) => n.id !== r.id) });
    const fresh = composeSections(facts);
    setModal('');
    void save(
      { sections: fresh, figures: factFigures(facts), photos: mergePhotos(photos, facts.photos), sources: { ...r.sources, dailyReports: facts.reports.map((d) => d.id) } },
      'Refreshed from project records',
      'The text was rebuilt from the current records. The original generated version is unchanged.'
    );
    setPhotos(mergePhotos(photos, facts.photos));
  };

  const exportPdf = async () => {
    setBusy('pdf');
    const urls: Record<string, string> = {};
    await Promise.all(
      photos
        .filter((p) => p.include)
        .map(async (p) => {
          try {
            urls[p.fileId] = await driveObjectUrl(p.fileId);
          } catch {
            // printed as "Image not available"
          }
        })
    );
    setBusy('');
    const view = { ...r, sections, photos, attachments };
    actions.printElement(() => <NarrativeDocument r={view} photoSrc={(p) => urls[p.fileId]} print />, `${r.reference} — ${r.title}`);
  };

  const exportWord = async () => {
    setBusy('docx');
    try {
      const blob = await narrativeDocx({ ...r, sections, photos, attachments });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${r.reference}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch (e) {
      setMsg({ kind: 'error', text: `The Word file could not be created: ${e instanceof Error ? e.message : 'unknown error'}.` });
    }
    setBusy('');
  };

  const setText = (key: string, text: string) => setSections((ss) => ss!.map((s) => (s.key === key ? { ...s, text } : s)));
  const factualOf = (key: string) => r.original.factual.find((s) => s.key === key)?.text || '';
  const rev = viewRev !== null ? r.revisions[viewRev] : null;

  return (
    <div className="cv-grid" style={{ gap: 14 }}>
      <div className="nr-bar">
        <button type="button" className="cv-btn sm" onClick={() => actions.navigate(back)}>
          ← Report Archive
        </button>
        <NrStatus s={r.status} local={r.localOnly} />
        {r.scheduled && <span className="nr-tag">Prepared automatically</span>}
        {r.original.engine === 'ai' && <span className="nr-tag">AI wording (checked)</span>}
        <span className="cv-spacer" />
        <button type="button" className="cv-btn sm" onClick={() => setModal('history')}>
          <History size={14} aria-hidden /> Revisions ({r.revisions.length})
        </button>
        <button type="button" className="cv-btn sm" onClick={() => setModal('original')}>
          <GitCompare size={14} aria-hidden /> Original Version
        </button>
        <button type="button" className="cv-btn sm" onClick={exportWord} disabled={!!busy}>
          <FileDown size={14} aria-hidden /> {busy === 'docx' ? 'Preparing…' : 'Export DOCX'}
        </button>
        <button type="button" className="cv-btn primary sm" onClick={exportPdf} disabled={!!busy}>
          <FileDown size={14} aria-hidden /> {busy === 'pdf' ? 'Preparing…' : 'Export PDF / Print'}
        </button>
      </div>
      {msg && <Banner kind={msg.kind}>{msg.text}</Banner>}
      {r.status !== 'final' && r.status !== 'approved' && (
        <Banner kind="info">
          This report is a <b>{NARRATIVE_STATUS_LABEL[r.status].toLowerCase()}</b>. It is not submitted, approved or shared with anyone until an authorized user does so.
        </Banner>
      )}

      <Card title="Workflow" note={workflowNote(r.status)}>
        {(editable || isManager) && r.status !== 'final' && (
          <Field label="Revision note (optional)">
            <input className="cv-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What changed, or remarks for the preparer" maxLength={300} />
          </Field>
        )}
        <div className="cv-row nr-actions">
          {editable && (
            <button type="button" className="cv-btn" disabled={!!busy || !dirty} onClick={() => save({}, 'Edited', 'Draft saved.')}>
              <Save size={14} aria-hidden /> Save Draft
            </button>
          )}
          {editable && ai?.ai && (
            <button type="button" className="cv-btn" disabled={!!busy} onClick={improve}>
              <Sparkles size={14} aria-hidden /> {busy === 'ai' ? 'Improving…' : 'Improve Wording (AI)'}
            </button>
          )}
          {editable && (
            <button type="button" className="cv-btn" disabled={!!busy} onClick={() => setModal('refresh')}>
              <RefreshCw size={14} aria-hidden /> Refresh from Records
            </button>
          )}
          {r.status === 'draft' && staff && (
            <button type="button" className="cv-btn primary" disabled={!!busy} onClick={() => save({ status: 'review' }, 'Submitted for review', 'Submitted for review.')}>
              <Send size={14} aria-hidden /> Submit for Review
            </button>
          )}
          {isManager && (r.status === 'review' || r.status === 'draft') && (
            <button type="button" className="cv-btn primary" disabled={!!busy} onClick={() => save({ status: 'approved', approvedBy: user.name, approvedAt: nowIso(), reviewedBy: user.name }, 'Approved', 'Report approved.')}>
              <CheckCircle2 size={14} aria-hidden /> Approve
            </button>
          )}
          {isManager && (r.status === 'review' || r.status === 'approved') && (
            <button
              type="button"
              className="cv-btn danger"
              disabled={!!busy}
              onClick={() => (note.trim() ? save({ status: 'draft', approvedBy: undefined, approvedAt: undefined }, 'Returned for revision', 'Returned to the preparer as a draft.') : setMsg({ kind: 'warn', text: 'Enter a revision note explaining what needs to change.' }))}
            >
              <RotateCcw size={14} aria-hidden /> Return for Revision
            </button>
          )}
          {isManager && r.status === 'approved' && (
            <button type="button" className="cv-btn primary" disabled={!!busy} onClick={() => setModal('final')}>
              <Lock size={14} aria-hidden /> Generate Final Report
            </button>
          )}
          {canDelete && (
            <button type="button" className="cv-btn ghost" disabled={!!busy} onClick={() => setModal('delete')}>
              <Trash2 size={14} aria-hidden /> Delete
            </button>
          )}
        </div>
        {dirty && editable && <p className="nr-dirty">Unsaved changes.</p>}
      </Card>

      <Card title={`${r.reference} · ${r.title}`} note={periodLabel(r)}>
        <InfoBlock r={r} />
        {sections.map((s) => {
          const meta = SECTION_TITLES.find((t) => t.key === s.key);
          const changed = s.text !== factualOf(s.key);
          return (
            <section key={s.key} className="nr-sec">
              <div className="nr-sec-h">
                <h3>
                  {meta?.letter}. {s.title}
                </h3>
                {changed && <span className="nr-tag">Edited</span>}
                {editable && changed && (
                  <button type="button" className="cv-linkbtn" onClick={() => setText(s.key, factualOf(s.key))}>
                    Restore factual text
                  </button>
                )}
              </div>
              {editable ? (
                <textarea className="cv-textarea nr-text" aria-label={s.title} rows={Math.min(18, Math.max(3, Math.ceil(s.text.length / 110) + s.text.split('\n').length))} value={s.text} onChange={(e) => setText(s.key, e.target.value)} />
              ) : (
                s.text.split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>)
              )}
              {s.key === 'progress' && <FiguresTable r={r} />}
              {s.key === 'photos' && (
                <PhotoEditor
                  photos={photos}
                  editable={editable}
                  onChange={setPhotos}
                  onAdd={() => setModal('photos')}
                />
              )}
            </section>
          );
        })}
        <section className="nr-sec">
          <div className="nr-sec-h">
            <h3>References and attachments</h3>
            {editable && (
              <button type="button" className="cv-btn sm" onClick={() => setModal('docs')}>
                <Paperclip size={14} aria-hidden /> Attach Documents
              </button>
            )}
          </div>
          <References r={{ ...r, attachments }} sources={sources} onRemove={editable ? (aid) => setAttachments(attachments.filter((a) => a.id !== aid)) : undefined} />
        </section>
      </Card>

      {modal === 'photos' && (
        <PhotoPicker
          r={r}
          have={photos}
          onClose={() => setModal('')}
          onAdd={(add) => {
            setPhotos([...photos, ...add].sort((a, b) => a.date.localeCompare(b.date)));
            setModal('');
          }}
        />
      )}
      {modal === 'docs' && (
        <DocPicker
          have={attachments}
          onClose={() => setModal('')}
          onAdd={(add) => {
            setAttachments([...attachments, ...add]);
            setModal('');
          }}
        />
      )}
      {modal === 'history' && (
        <Modal title="Revision history" sub={`${r.reference} · the original generated version is preserved separately`} onClose={() => (setModal(''), setViewRev(null))} width={860}>
          {rev ? (
            <>
              <button type="button" className="cv-btn sm" onClick={() => setViewRev(null)}>
                ← All revisions
              </button>
              <h4 style={{ margin: '12px 0 4px' }}>
                {rev.action} · {fmtStamp(rev.at)} · {rev.by}
              </h4>
              {rev.sections?.map((s) => (
                <div key={s.key} className="nr-rev-sec">
                  <b>{s.title}</b>
                  <p>{s.text}</p>
                </div>
              ))}
            </>
          ) : (
            <ol className="nr-revs">
              {[...r.revisions].map((v, i) => ({ v, i })).reverse().map(({ v, i }) => (
                <li key={i}>
                  <span>
                    <b>{v.action}</b> · {v.by}
                    {v.note ? ` — “${v.note}”` : ''}
                  </span>
                  <span className="cv-dim">{fmtStamp(v.at)}</span>
                  {v.sections && (
                    <button type="button" className="cv-linkbtn" onClick={() => setViewRev(i)}>
                      View text
                    </button>
                  )}
                </li>
              ))}
            </ol>
          )}
        </Modal>
      )}
      {modal === 'original' && (
        <Modal title="Original generated version" sub={`Generated ${fmtStamp(r.original.generatedAt)} by ${r.original.generatedBy} · ${r.original.engine === 'ai' ? `records + AI wording (${r.original.model || 'AI'}), checked against the records` : 'written from the records'}`} onClose={() => setModal('')} width={1000}>
          {r.original.aiRejected && r.original.aiRejected.length > 0 && <Banner kind="info">AI wording rejected and the factual text kept for: {r.original.aiRejected.join('; ')}.</Banner>}
          <div className="nr-compare">
            <div className="nr-compare-h">Original</div>
            <div className="nr-compare-h">Current</div>
            {r.original.sections.map((s) => {
              const cur = sections.find((x) => x.key === s.key)?.text || '';
              return (
                <React.Fragment key={s.key}>
                  <div className={cur !== s.text ? 'diff' : ''}>
                    <b>{s.title}</b>
                    <p>{s.text}</p>
                  </div>
                  <div className={cur !== s.text ? 'diff' : ''}>
                    <b>{s.title}</b>
                    <p>{cur}</p>
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        </Modal>
      )}
      {modal === 'refresh' && (
        <ConfirmDialog
          title="Refresh from records?"
          message="The section text is rebuilt from the current project records and saved as a new revision. Your edits remain in the revision history, and the original generated version is not changed."
          confirmLabel="Refresh"
          onCancel={() => setModal('')}
          onConfirm={refresh}
        />
      )}
      {modal === 'final' && (
        <ConfirmDialog
          title="Generate the final report?"
          message="The approved report is locked as the final version. It can no longer be edited, except by an administrator."
          confirmLabel="Generate Final Report"
          onCancel={() => setModal('')}
          onConfirm={() => {
            setModal('');
            void save({ status: 'final', finalizedBy: user.name, finalizedAt: nowIso() }, 'Final report generated', 'Final report generated and locked.');
          }}
        />
      )}
      {modal === 'delete' && (
        <ConfirmDialog
          title="Delete this report?"
          message={`${r.reference} and its revision history will be permanently deleted. The project records it was built from are not affected.`}
          confirmLabel="Delete"
          danger
          onCancel={() => setModal('')}
          onConfirm={async () => {
            setModal('');
            try {
              await narrativeStore.remove(r.id);
              actions.toast(`${r.reference} deleted`);
              actions.navigate('narrative/archive');
            } catch (e) {
              setMsg({ kind: 'error', text: `Not deleted: ${e instanceof Error ? e.message : 'the database refused the change'}.` });
            }
          }}
        />
      )}
    </div>
  );
};

function workflowNote(s: NarrativeStatus): string {
  if (s === 'draft') return 'Draft → Submit for Review → Approve → Generate Final Report. Nothing is submitted or published automatically.';
  if (s === 'review') return 'Awaiting approval by a project manager, director or administrator.';
  if (s === 'approved') return 'Approved. A manager can lock it as the final report, or return it for revision.';
  return 'Final and locked. Export it as PDF or DOCX for distribution.';
}

const mergePhotos = (have: NarrativePhoto[], fresh: NarrativePhoto[]) => {
  const ids = new Set(have.map((p) => p.fileId));
  return [...have, ...fresh.filter((p) => !ids.has(p.fileId))].sort((a, b) => a.date.localeCompare(b.date));
};

const InfoBlock: React.FC<{ r: NarrativeReport }> = ({ r }) => (
  <section className="nr-sec">
    <div className="nr-sec-h">
      <h3>A. Project Information</h3>
    </div>
    <dl className="nr-info">
      <dt>Project</dt>
      <dd>{DR_PROJECT.name}</dd>
      <dt>Report</dt>
      <dd>{r.title}</dd>
      <dt>Reporting period</dt>
      <dd>{periodLabel(r)}</dd>
      <dt>Reference no.</dt>
      <dd>{r.reference}</dd>
      <dt>Prepared by</dt>
      <dd>
        {r.preparedBy}
        {r.scheduled ? ' (prepared automatically on schedule)' : ''}
      </dd>
      <dt>Date generated</dt>
      <dd>{fmtStamp(r.original.generatedAt)}</dd>
      <dt>Status</dt>
      <dd>
        {NARRATIVE_STATUS_LABEL[r.status]}
        {r.approvedBy ? ` · approved by ${r.approvedBy}, ${fmtStamp(r.approvedAt)}` : ''}
        {r.finalizedBy ? ` · final, ${fmtStamp(r.finalizedAt)}` : ''}
      </dd>
    </dl>
  </section>
);

const FiguresTable: React.FC<{ r: NarrativeReport }> = ({ r }) => {
  const f = r.figures;
  return (
    <div className="cv-table-wrap nr-fig">
      <table className="cv-table">
        <thead>
          <tr>
            <th>Measure (as of {fmtDate(f.asOf)})</th>
            <th>Planned</th>
            <th>Actual</th>
            <th>Variance</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Overall physical accomplishment</td>
            <td>{f.plannedPct}%</td>
            <td>{f.actualPct}%</td>
            <td>
              {f.variancePct >= 0 ? '+' : ''}
              {f.variancePct} pts
            </td>
          </tr>
          <tr>
            <td>Activities completed / ongoing / delayed in the period</td>
            <td colSpan={3}>
              {f.completed} / {f.ongoing} / {f.delayed}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};

const PhotoEditor: React.FC<{ photos: NarrativePhoto[]; editable: boolean; onChange: (p: NarrativePhoto[]) => void; onAdd: () => void }> = ({ photos, editable, onChange, onAdd }) => {
  const set = (id: string, patch: Partial<NarrativePhoto>) => onChange(photos.map((p) => (p.fileId === id ? { ...p, ...patch } : p)));
  return (
    <div className="nr-photos-wrap">
      {editable && (
        <div className="cv-row" style={{ marginBottom: 8 }}>
          <button type="button" className="cv-btn sm" onClick={onAdd}>
            <ImagePlus size={14} aria-hidden /> Attach Photos
          </button>
          <span className="cv-dim">Captions describe the photo only; they are not treated as proof of an accomplishment.</span>
        </div>
      )}
      {photos.length === 0 ? (
        <p className="cv-dim">No photographs attached.</p>
      ) : (
        <div className="nr-photos">
          {photos.map((p) => (
            <figure key={p.fileId} className={p.include ? '' : 'off'}>
              <SecureImg src={driveFileUrl(p.fileId)} alt={p.caption || 'Site photograph'} loading="lazy" />
              <figcaption>
                {editable ? (
                  <input className="cv-input" value={p.caption} aria-label="Caption" onChange={(e) => set(p.fileId, { caption: e.target.value })} maxLength={240} />
                ) : (
                  <span>{p.caption || 'Site photograph'}</span>
                )}
                <span className="cv-dim">
                  {fmtDate(p.date)} · {p.source}
                  {p.activity ? ` · ${p.activity}` : ''}
                </span>
                {editable && (
                  <label className="nr-check">
                    <input type="checkbox" checked={p.include} onChange={(e) => set(p.fileId, { include: e.target.checked })} /> Include in the report
                  </label>
                )}
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </div>
  );
};

const PhotoPicker: React.FC<{ r: NarrativeReport; have: NarrativePhoto[]; onClose: () => void; onAdd: (p: NarrativePhoto[]) => void }> = ({ r, have, onClose, onAdd }) => {
  const files = useStore(driveFileStore);
  const { register } = useCommand();
  const [all, setAll] = useState(false);
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const ids = new Set(have.map((p) => p.fileId));
  const list = files.items
    .filter((f) => f.kind === 'photo' && f.uploadStatus === 'uploaded' && !ids.has(f.id))
    .filter((f) => all || (f.reportingDate >= r.periodStart && f.reportingDate <= r.periodEnd))
    .sort((a, b) => b.reportingDate.localeCompare(a.reportingDate))
    .slice(0, 120);
  const chosen = list.filter((f) => sel[f.id]);
  return (
    <Modal
      title="Attach photos"
      sub="Uploaded project photographs (Google Drive). Only the photo's own date and description are used."
      onClose={onClose}
      width={900}
      footer={
        <>
          <button type="button" className="cv-btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="cv-btn primary"
            disabled={!chosen.length}
            onClick={() =>
              onAdd(
                chosen.map((f) => ({
                  fileId: f.id,
                  url: driveFileUrl(f.id),
                  caption: [f.photoType || f.category || 'Site photograph', f.description?.trim()].filter(Boolean).join(' — '),
                  date: f.reportingDate,
                  activity: f.activityId ? register.find((x) => x.id === f.activityId)?.name : undefined,
                  source: f.reportId ? 'Daily report photo' : 'Site photo',
                  include: true,
                }))
              )
            }
          >
            Attach {chosen.length ? plural(chosen.length, 'Photo') : 'Photos'}
          </button>
        </>
      }
    >
      <label className="nr-check" style={{ marginBottom: 10 }}>
        <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Show photos from outside the reporting period
      </label>
      {list.length === 0 ? (
        <Empty>No other uploaded photos{all ? '' : ' in this period'}.</Empty>
      ) : (
        <div className="nr-pick">
          {list.map((f) => (
            <label key={f.id} className={sel[f.id] ? 'on' : ''}>
              <input type="checkbox" checked={!!sel[f.id]} onChange={(e) => setSel({ ...sel, [f.id]: e.target.checked })} />
              <SecureImg src={driveFileUrl(f.id)} alt={f.description || f.fileName} loading="lazy" />
              <span>
                {fmtDate(f.reportingDate)} · {f.photoType || f.category || 'Photo'}
              </span>
            </label>
          ))}
        </div>
      )}
    </Modal>
  );
};

const DocPicker: React.FC<{ have: NarrativeReport['attachments']; onClose: () => void; onAdd: (a: NarrativeReport['attachments']) => void }> = ({ have, onClose, onAdd }) => {
  const docs = useStore(documentStore);
  const files = useStore(driveFileStore);
  const ids = new Set(have.map((a) => a.id));
  const list = [
    ...docs.items.filter((d) => !d.archived).map((d) => ({ id: d.id, title: d.title, url: d.url, date: d.date, kind: d.category || 'Document' })),
    ...files.items.filter((f) => f.kind === 'document' && f.uploadStatus === 'uploaded').map((f) => ({ id: f.id, title: f.description || f.fileName, url: driveFileUrl(f.id), date: f.reportingDate, kind: f.category || 'Drive document' })),
  ].filter((d) => !ids.has(d.id));
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const chosen = list.filter((d) => sel[d.id]);
  return (
    <Modal
      title="Attach documents"
      sub="Documents from the Document Repository and Google Drive. They are listed as references in the report."
      onClose={onClose}
      width={760}
      footer={
        <>
          <button type="button" className="cv-btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="cv-btn primary" disabled={!chosen.length} onClick={() => onAdd(chosen.map(({ id, title, url, date }) => ({ id, title, url, date })))}>
            Attach {chosen.length ? plural(chosen.length, 'Document') : 'Documents'}
          </button>
        </>
      }
    >
      {list.length === 0 ? (
        <Empty>No other documents in the repository.</Empty>
      ) : (
        <ul className="nr-doclist">
          {list.map((d) => (
            <li key={d.id}>
              <label className="nr-check">
                <input type="checkbox" checked={!!sel[d.id]} onChange={(e) => setSel({ ...sel, [d.id]: e.target.checked })} />
                <span>
                  <b>{d.title}</b> <span className="cv-dim">· {d.kind}{d.date ? ` · ${fmtDate(d.date)}` : ''}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
};

const References: React.FC<{ r: NarrativeReport; sources: ReturnType<typeof useNarrativeSources>['sources']; onRemove?: (id: string) => void }> = ({ r, sources, onRemove }) => {
  const { actions } = useCommand();
  const dcr = r.sources.dailyReports.map((id) => sources.dailyReports.find((d) => d.id === id)).filter(Boolean);
  const prev = r.sources.previous ? sources.narratives.find((n) => n.id === r.sources.previous) : undefined;
  return (
    <div className="nr-refs">
      <div>
        <b>Source records</b>
        <ul>
          <li>
            Daily Construction Reports:{' '}
            {dcr.length
              ? dcr.map((d, i) => (
                  <React.Fragment key={d!.id}>
                    {i ? ', ' : ''}
                    <button type="button" className="cv-linkbtn" onClick={() => actions.navigate(`site/history/${d!.id}`)}>
                      {d!.reference}
                    </button>
                  </React.Fragment>
                ))
              : 'none in this period'}
          </li>
          <li>
            Master Project Tracker: {plural(r.sources.activities.length, 'activity', 'activities')} ·{' '}
            <button type="button" className="cv-linkbtn" onClick={() => actions.navigate('tracker')}>
              open
            </button>
          </li>
          <li>
            Issues log: {plural(r.sources.issues.length, 'issue')} ·{' '}
            <button type="button" className="cv-linkbtn" onClick={() => actions.navigate('issues/log')}>
              open
            </button>
          </li>
          {prev && (
            <li>
              Previous report:{' '}
              <button type="button" className="cv-linkbtn" onClick={() => actions.navigate(`narrative/archive/${prev.id}`)}>
                {prev.reference}
              </button>
            </li>
          )}
        </ul>
      </div>
      <div>
        <b>Attachments</b>
        {r.attachments.length === 0 ? (
          <p className="cv-dim">None.</p>
        ) : (
          <ul>
            {r.attachments.map((a) => (
              <li key={a.id}>
                {a.url ? (
                  <button type="button" className="cv-linkbtn" onClick={() => (a.url!.startsWith('/api/drive/') ? openDriveFile(a.url!) : window.open(a.url, '_blank', 'noopener'))}>
                    {a.title}
                  </button>
                ) : (
                  a.title
                )}
                {a.date ? <span className="cv-dim"> · {fmtDate(a.date)}</span> : null}
                {onRemove && (
                  <button type="button" className="cv-linkbtn" style={{ marginLeft: 8 }} onClick={() => onRemove(a.id)} aria-label={`Remove ${a.title}`}>
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

// =====================================================================
// DOCUMENT (screen preview + PDF)
// =====================================================================
export const NarrativeDocument: React.FC<{ r: NarrativeReport; photoSrc: (p: NarrativePhoto) => string | undefined; print?: boolean }> = ({ r, photoSrc, print }) => {
  const included = r.photos.filter((p) => p.include);
  return (
    <article className={`nr-doc ${print ? 'print' : ''}`}>
      {print && (
        <style>{`@page { @bottom-left { content: "${r.reference.replace(/"/g, '')} · Convengers Bahay Build"; font: 8pt Inter, Arial, sans-serif; color: #68738A; } @bottom-right { content: "Page " counter(page) " of " counter(pages); font: 8pt Inter, Arial, sans-serif; color: #68738A; } }`}</style>
      )}
      <header className="nr-doc-h">
        <img src={LOGO_SVG} alt="Convengers" />
        <div>
          <div className="nr-doc-k">Convengers · Bahay Build</div>
          <h1>{r.title}</h1>
          <div className="nr-doc-ref">
            {r.reference} · {periodLabel(r)} · {NARRATIVE_STATUS_LABEL[r.status]}
          </div>
        </div>
      </header>
      <section>
        <h2>A. Project Information</h2>
        <table className="nr-doc-info">
          <tbody>
            {[
              ['Project', DR_PROJECT.name],
              ['Reporting period', periodLabel(r)],
              ['Reference no.', r.reference],
              ['Prepared by', r.preparedBy],
              ['Date generated', fmtStamp(r.original.generatedAt)],
              ['Status', `${NARRATIVE_STATUS_LABEL[r.status]}${r.approvedBy ? ` — approved by ${r.approvedBy} (${fmtStamp(r.approvedAt)})` : ''}`],
            ].map(([k, v]) => (
              <tr key={k}>
                <th>{k}</th>
                <td>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {r.sections.map((s) => (
        <section key={s.key}>
          <h2>
            {SECTION_TITLES.find((t) => t.key === s.key)?.letter}. {s.title}
          </h2>
          {s.text.split(/\n{2,}/).map((p, i) => (
            <p key={i}>{p}</p>
          ))}
          {s.key === 'progress' && (
            <table className="nr-doc-table">
              <thead>
                <tr>
                  <th>Measure (as of {fmtDate(r.figures.asOf)})</th>
                  <th>Planned</th>
                  <th>Actual</th>
                  <th>Variance</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Overall physical accomplishment</td>
                  <td>{r.figures.plannedPct}%</td>
                  <td>{r.figures.actualPct}%</td>
                  <td>
                    {r.figures.variancePct >= 0 ? '+' : ''}
                    {r.figures.variancePct} pts
                  </td>
                </tr>
              </tbody>
            </table>
          )}
          {s.key === 'photos' && included.length > 0 && (
            <div className="nr-doc-photos">
              {included.map((p, i) => {
                const src = photoSrc(p);
                return (
                  <figure key={p.fileId}>
                    {src ? <img src={src} alt={p.caption || 'Site photograph'} /> : <div className="nr-img-missing">Image not available</div>}
                    <figcaption>
                      <b>Photo {i + 1}.</b> {p.caption || 'Site photograph'} — {fmtDate(p.date)} ({p.source}
                      {p.activity ? `, ${p.activity}` : ''})
                    </figcaption>
                  </figure>
                );
              })}
            </div>
          )}
        </section>
      ))}
      <section>
        <h2>References</h2>
        <p className="nr-doc-sm">
          Prepared from the project records of the Convengers Bahay Build Master Project Tracker
          {r.sources.dailyReports.length ? ` and ${plural(r.sources.dailyReports.length, 'Daily Construction Report')}` : ''}.
          {r.attachments.length ? ` Attachments: ${r.attachments.map((a) => a.title).join('; ')}.` : ''}
        </p>
      </section>
      <footer className="nr-doc-f">
        <div>
          <span>Prepared by</span>
          <b>{r.preparedBy}</b>
        </div>
        <div>
          <span>Reviewed by</span>
          <b>{r.reviewedBy || '—'}</b>
        </div>
        <div>
          <span>Approved by</span>
          <b>{r.approvedBy || '—'}</b>
        </div>
      </footer>
    </article>
  );
};

async function blobToBytes(url: string): Promise<{ data: Uint8Array; type: 'jpeg'; width: number; height: number } | null> {
  return imageForDocx(url);
}

/** Word export with the CONVENGERS template (logo header, numbered pages, headings, tables, photo grid). */
export async function narrativeDocx(r: NarrativeReport): Promise<Blob> {
  const logo = await blobToBytes(LOGO_SVG);
  const photos: { data: Uint8Array; type: 'jpeg' | 'png'; width: number; height: number; caption: string }[] = [];
  let n = 0;
  for (const p of r.photos.filter((x) => x.include)) {
    n++;
    try {
      const img = await imageForDocx(await driveObjectUrl(p.fileId));
      if (img) photos.push({ ...img, caption: `Photo ${n}. ${p.caption || 'Site photograph'} — ${fmtDate(p.date)} (${p.source}${p.activity ? `, ${p.activity}` : ''})` });
    } catch {
      // not available: listed without image
    }
  }
  const blocks: DocxBlock[] = [
    { kind: 'title', text: r.title, sub: `${DR_PROJECT.name} · ${periodLabel(r)}` },
    { kind: 'h1', text: 'A. Project Information' },
    {
      kind: 'table',
      widths: [1, 2.4],
      rows: [
        ['Project', DR_PROJECT.name],
        ['Reporting period', periodLabel(r)],
        ['Reference no.', r.reference],
        ['Prepared by', r.preparedBy],
        ['Date generated', fmtStamp(r.original.generatedAt)],
        ['Status', `${NARRATIVE_STATUS_LABEL[r.status]}${r.approvedBy ? ` — approved by ${r.approvedBy} (${fmtStamp(r.approvedAt)})` : ''}`],
      ],
    },
  ];
  r.sections.forEach((s) => {
    blocks.push({ kind: 'h1', text: `${SECTION_TITLES.find((t) => t.key === s.key)?.letter}. ${s.title}` });
    blocks.push({ kind: 'p', text: s.text });
    if (s.key === 'progress')
      blocks.push({
        kind: 'table',
        header: true,
        widths: [2.4, 1, 1, 1],
        rows: [
          [`Measure (as of ${fmtDate(r.figures.asOf)})`, 'Planned', 'Actual', 'Variance'],
          ['Overall physical accomplishment', `${r.figures.plannedPct}%`, `${r.figures.actualPct}%`, `${r.figures.variancePct >= 0 ? '+' : ''}${r.figures.variancePct} pts`],
        ],
      });
    if (s.key === 'photos' && photos.length) blocks.push({ kind: 'photos', items: photos });
    if (s.key === 'photos' && r.photos.filter((x) => x.include).length > photos.length) blocks.push({ kind: 'p', small: true, text: `${plural(r.photos.filter((x) => x.include).length - photos.length, 'photo')} could not be loaded for this file.` });
  });
  blocks.push({ kind: 'h1', text: 'References' });
  blocks.push({
    kind: 'p',
    small: true,
    text: `Prepared from the project records of the Convengers Bahay Build Master Project Tracker${r.sources.dailyReports.length ? ` and ${plural(r.sources.dailyReports.length, 'Daily Construction Report')}` : ''}.${r.attachments.length ? ` Attachments: ${r.attachments.map((a) => a.title).join('; ')}.` : ''}`,
  });
  blocks.push({ kind: 'table', header: true, rows: [['Prepared by', 'Reviewed by', 'Approved by'], [r.preparedBy, r.reviewedBy || '—', r.approvedBy || '—']] });
  return buildDocx({ title: `${r.reference} — ${r.title}`, headerText: `${r.reference} · ${r.title}`, footerText: 'Convengers Bahay Build · www.ConvengersAssemble.com', logo: logo || undefined, blocks });
}

// =====================================================================
// ARCHIVE
// =====================================================================
const ArchivePanel: React.FC = () => {
  const { actions } = useCommand();
  const store = useStore(narrativeStore);
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [cmp, setCmp] = useState<string[]>([]);
  const [showCmp, setShowCmp] = useState(false);
  const list = store.items.filter((r) => {
    if (type && r.type !== type) return false;
    if (status && r.status !== status) return false;
    if (from && r.periodEnd < from) return false;
    if (to && r.periodStart > to) return false;
    if (q.trim()) {
      const s = q.trim().toLowerCase();
      const hay = `${r.reference} ${r.title} ${r.preparedBy} ${r.subjectName || ''} ${r.sections.map((x) => x.text).join(' ')}`.toLowerCase();
      if (!hay.includes(s)) return false;
    }
    return true;
  });
  const toggle = (id: string) => setCmp((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c.slice(-1), id]));
  const pair = cmp.map((id) => store.items.find((r) => r.id === id)).filter(Boolean) as NarrativeReport[];
  return (
    <div className="cv-grid" style={{ gap: 12 }}>
      <div className="cv-filters">
        <input type="search" className="cv-input" placeholder="Search reports…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search reports" />
        <select className="cv-select" value={type} onChange={(e) => setType(e.target.value)} aria-label="Report type">
          <option value="">All report types</option>
          {TYPE_ORDER.map((t) => (
            <option key={t} value={t}>
              {NARRATIVE_TYPES[t].label}
            </option>
          ))}
        </select>
        <select className="cv-select" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="">All statuses</option>
          {(['draft', 'review', 'approved', 'final'] as NarrativeStatus[]).map((s) => (
            <option key={s} value={s}>
              {NARRATIVE_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <input type="date" className="cv-input" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Period from" title="Period from" />
        <input type="date" className="cv-input" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Period to" title="Period to" />
        <span className="cv-spacer" />
        <button type="button" className="cv-btn sm" disabled={pair.length !== 2} onClick={() => setShowCmp(true)} title="Tick two reports to compare">
          <GitCompare size={14} aria-hidden /> Compare ({pair.length}/2)
        </button>
        <button type="button" className="cv-btn primary sm" onClick={() => actions.navigate('narrative/generate')}>
          <FileText size={14} aria-hidden /> Generate Report
        </button>
      </div>
      {!store.loaded ? (
        <Empty>Loading…</Empty>
      ) : list.length === 0 ? (
        <Empty>{store.items.length ? 'No reports match these filters.' : 'No narrative reports yet. Generate the first one from the Generate tab.'}</Empty>
      ) : (
        <div className="cv-table-wrap">
          <table className="cv-table nr-arch">
            <thead>
              <tr>
                <th aria-label="Compare" />
                <th>Reference</th>
                <th>Report</th>
                <th>Period</th>
                <th>Status</th>
                <th>Progress</th>
                <th>Prepared by</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id}>
                  <td data-label="Compare">
                    <input type="checkbox" checked={cmp.includes(r.id)} onChange={() => toggle(r.id)} aria-label={`Compare ${r.reference}`} />
                  </td>
                  <td data-label="Reference">
                    <button type="button" className="cv-linkbtn" onClick={() => actions.navigate(`narrative/archive/${r.id}`)}>
                      {r.reference}
                    </button>
                  </td>
                  <td data-label="Report">{r.title}</td>
                  <td data-label="Period">{periodLabel(r)}</td>
                  <td data-label="Status">
                    <NrStatus s={r.status} local={r.localOnly} />
                  </td>
                  <td data-label="Progress">
                    {r.figures.actualPct}% <span className="cv-dim">/ {r.figures.plannedPct}%</span>
                  </td>
                  <td data-label="Prepared by">
                    {r.preparedBy}
                    {r.scheduled ? <span className="cv-dim"> (scheduled)</span> : null}
                  </td>
                  <td data-label="Updated">{fmtStamp(r.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {showCmp && pair.length === 2 && <CompareModal a={pair[0]} b={pair[1]} onClose={() => setShowCmp(false)} />}
    </div>
  );
};

const CompareModal: React.FC<{ a: NarrativeReport; b: NarrativeReport; onClose: () => void }> = ({ a: x, b: y, onClose }) => {
  const [a, b] = x.periodEnd <= y.periodEnd ? [x, y] : [y, x];
  const row = (label: string, va: number | null, vb: number | null, unit = '') => {
    const d = va !== null && vb !== null ? Math.round((vb - va) * 10) / 10 : null;
    return (
      <tr key={label}>
        <td>{label}</td>
        <td>{va === null ? 'Not Recorded' : `${va}${unit}`}</td>
        <td>{vb === null ? 'Not Recorded' : `${vb}${unit}`}</td>
        <td>{d === null ? '—' : `${d > 0 ? '+' : ''}${d}${unit}`}</td>
      </tr>
    );
  };
  return (
    <Modal title="Compare reporting periods" sub={`${a.reference} (${periodLabel(a)}) → ${b.reference} (${periodLabel(b)})`} onClose={onClose} width={1040}>
      <div className="cv-table-wrap">
        <table className="cv-table">
          <thead>
            <tr>
              <th>Measure</th>
              <th>{periodLabel(a)}</th>
              <th>{periodLabel(b)}</th>
              <th>Change</th>
            </tr>
          </thead>
          <tbody>
            {row('Actual progress', a.figures.actualPct, b.figures.actualPct, '%')}
            {row('Planned progress', a.figures.plannedPct, b.figures.plannedPct, '%')}
            {row('Variance (pts)', a.figures.variancePct, b.figures.variancePct)}
            {row('Activities completed in period', a.figures.completed, b.figures.completed)}
            {row('Activities delayed', a.figures.delayed, b.figures.delayed)}
            {row('Daily reports', a.figures.dailyReports, b.figures.dailyReports)}
            {row('Worker-days recorded', a.figures.manDays, b.figures.manDays)}
            {row('Open issues', a.figures.issuesOpen, b.figures.issuesOpen)}
            {row('Photos', a.figures.photos, b.figures.photos)}
          </tbody>
        </table>
      </div>
      <div className="nr-compare" style={{ marginTop: 14 }}>
        <div className="nr-compare-h">{a.reference}</div>
        <div className="nr-compare-h">{b.reference}</div>
        {SECTION_TITLES.map((t) => (
          <React.Fragment key={t.key}>
            <div>
              <b>
                {t.letter}. {t.title}
              </b>
              <p>{a.sections.find((s) => s.key === t.key)?.text || '—'}</p>
            </div>
            <div>
              <b>
                {t.letter}. {t.title}
              </b>
              <p>{b.sections.find((s) => s.key === t.key)?.text || '—'}</p>
            </div>
          </React.Fragment>
        ))}
      </div>
    </Modal>
  );
};

// =====================================================================
// SCHEDULE
// =====================================================================
const SchedulePanel: React.FC = () => {
  const { today, isManager, user, actions } = useCommand();
  const sched = useNarrativeSchedule();
  const store = useStore(narrativeStore);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'warn' | 'error'; text: string } | null>(null);
  // shown immediately; reverted if the save fails
  const [view, setView] = useState(sched);
  useEffect(() => setView(sched), [sched]);
  const set = async (k: 'daily' | 'weekly' | 'monthly', v: boolean) => {
    setBusy(true);
    const next = { ...view, [k]: v };
    setView(next);
    try {
      const where = await narrativeConfigStore.put({ ...next, id: 'schedule', updatedAt: nowIso(), updatedBy: user.name });
      setMsg(where === 'shared' ? { kind: 'ok', text: 'Schedule saved.' } : { kind: 'warn', text: 'Saved on this device only — it will sync when the connection returns.' });
    } catch (e) {
      setView(sched);
      setMsg({ kind: 'error', text: `Not saved: ${e instanceof Error ? e.message : 'the database refused the change'}.` });
    }
    setBusy(false);
  };
  const due = duePeriods(view, today);
  const upcoming = upcomingPreparations(view, today, 45).slice(0, 10);
  return (
    <div className="cv-grid" style={{ gap: 14 }}>
      {msg && <Banner kind={msg.kind}>{msg.text}</Banner>}
      <Card title="Automatic preparation" note="When a team member opens the system after a period ends, its report is prepared as a draft from the records. Drafts are never submitted, approved or published automatically.">
        <div className="nr-sched">
          {(['daily', 'weekly', 'monthly'] as const).map((k) => (
            <label key={k} className="nr-check">
              <input type="checkbox" checked={view[k]} disabled={!isManager || busy} onChange={(e) => set(k, e.target.checked)} />
              <span>
                <b>{NARRATIVE_TYPES[k].label}</b>
                <em className="cv-dim">
                  {k === 'daily' ? ' Prepared the next day for the previous day.' : k === 'weekly' ? ' Prepared on Monday for the previous week (Monday–Sunday).' : ' Prepared on the 1st for the previous month.'}
                </em>
              </span>
            </label>
          ))}
        </div>
        {!isManager && <p className="cv-dim">Only a project manager, director or administrator can change the schedule.</p>}
        {sched.updatedBy && <p className="cv-dim">Last changed by {sched.updatedBy}, {fmtStamp(sched.updatedAt)}.</p>}
      </Card>
      <div className="cv-grid cv-g2">
        <Card title="Latest scheduled periods">
          {due.length === 0 ? (
            <Empty>No automatic preparation is enabled.</Empty>
          ) : (
            <ul className="nr-due">
              {due.map((d) => {
                const id = narrativeId(d.type, d.start, d.end);
                const rec = store.items.find((x) => x.id === id);
                return (
                  <li key={id}>
                    <span>
                      <b>{NARRATIVE_TYPES[d.type].label}</b> · {periodLabel({ type: d.type, periodStart: d.start, periodEnd: d.end })}
                    </span>
                    {rec ? (
                      <button type="button" className="cv-linkbtn" onClick={() => actions.navigate(`narrative/archive/${rec.id}`)}>
                        {rec.reference} · {NARRATIVE_STATUS_LABEL[rec.status]}
                      </button>
                    ) : (
                      <span className="cv-dim">Preparing…</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
        <Card title="Upcoming preparation dates" note="Also shown in the Project Calendar.">
          {upcoming.length === 0 ? (
            <Empty>None scheduled.</Empty>
          ) : (
            <ul className="nr-due">
              {upcoming.map((u) => (
                <li key={u.type + u.date}>
                  <span>
                    <CalendarClock size={14} aria-hidden /> {fmtDate(u.date)}
                  </span>
                  <span>
                    {NARRATIVE_TYPES[u.type].label} · {u.period}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
};

// =====================================================================
// COMMAND CENTER CARD
// =====================================================================
export const NarrativeDashboardCard: React.FC = () => {
  const { actions, today, canEdit } = useCommand();
  useAutoPrepare();
  const store = useStore(narrativeStore);
  const sched = useNarrativeSchedule();
  const items = store.items;
  const latest = [...items].sort((a, b) => b.periodEnd.localeCompare(a.periodEnd))[0];
  const next = upcomingPreparations(sched, today, 40).slice(0, 3);
  return (
    <Card
      title="Automated Narrative Reports"
      note="Daily, weekly and monthly narratives written from the project records"
      className="nr-card"
      actions={
        <button type="button" className="cv-btn sm" onClick={() => actions.navigate('narrative/archive')}>
          Archive
        </button>
      }
    >
      <div className="cv-kpis">
        <Kpi label="Total reports" value={items.length} />
        <Kpi label="Drafts" value={items.filter((r) => r.status === 'draft').length} />
        <Kpi label="Pending approval" value={items.filter((r) => r.status === 'review').length} color={items.some((r) => r.status === 'review') ? '#B45309' : undefined} />
        <Kpi label="Approved" value={items.filter((r) => r.status === 'approved' || r.status === 'final').length} />
        <Kpi label="Latest period" value={<span className="nr-kpi-text">{latest ? periodLabel(latest) : '—'}</span>} sub={latest ? `${latest.reference} · ${NARRATIVE_STATUS_LABEL[latest.status]}` : 'No reports yet'} />
      </div>
      <div className="nr-card-f">
        <div>
          <b>Upcoming scheduled reports</b>
          {next.length ? (
            <ul>
              {next.map((u) => (
                <li key={u.type + u.date}>
                  {fmtDate(u.date)} — {NARRATIVE_TYPES[u.type].label} ({u.period})
                </li>
              ))}
            </ul>
          ) : (
            <p className="cv-dim">Automatic preparation is off.</p>
          )}
        </div>
        {canEdit && (
          <button type="button" className="cv-btn primary nr-generate" onClick={() => actions.navigate('narrative/generate')}>
            <FileText size={18} aria-hidden /> Generate Report
          </button>
        )}
      </div>
    </Card>
  );
};

/** Calendar feed: upcoming scheduled preparation and prepared reports. */
export function useNarrativeCalendar(): { id: string; date: string; title: string; sub: string; done: boolean; route?: string }[] {
  const { today } = useCommand();
  const store = useStore(narrativeStore);
  const sched = useNarrativeSchedule();
  return useMemo(
    () => [
      ...upcomingPreparations(sched, today, 120).map((u) => ({ id: `${u.type}-${u.date}`, date: u.date, title: `${NARRATIVE_TYPES[u.type].label} prepared`, sub: `Automatic draft · period ${u.period}`, done: false, route: 'narrative/schedule' })),
      ...store.items.map((r) => ({
        id: r.id,
        date: todayIso(new Date(r.approvedAt || r.createdAt)),
        title: `${r.reference} · ${r.title}`,
        sub: `${NARRATIVE_STATUS_LABEL[r.status]} · period ${periodLabel(r)}`,
        done: r.status === 'approved' || r.status === 'final',
        route: `narrative/archive/${r.id}`,
      })),
    ],
    [sched, today, store.items]
  );
}
