/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * DAILY CONSTRUCTION REPORT
 *   Site engineer → report (information, accomplishments, manpower, materials,
 *   equipment, site conditions, photos) → Google Drive (photos) + Firebase
 *   (report, file references) → submission → manager review → approval.
 *
 * Submission sequence (nothing is reported as submitted until confirmed):
 *   1 validate · 2 save the record (Uploading) · 3 upload photos to Google Drive ·
 *   4 save the file references · 5 finalize (Submitted) · 6 confirmation · 7 history
 * Reported progress is NOT applied to the Master Project Tracker on submission;
 * a manager applies it after approval.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  ImagePlus,
  Plus,
  Trash2,
  CheckCircle2,
  CloudOff,
  RefreshCw,
  Eye,
  Save,
  Send,
  FileDown,
  Pencil,
  AlertTriangle,
  ClipboardList,
  Image as ImageIcon,
} from 'lucide-react';
import './dailyReport.css';
import { useCommand } from './context.tsx';
import { Banner, Card, Empty, Field, Modal, SYNC_LABEL } from './ui.tsx';
import { useStore } from '../firebase/useStore.ts';
import { dailyReportStore, siteReportStore, publicationStore } from '../firebase/opsStores.ts';
import { newId } from '../firebase/collectionStore.ts';
import { firestoreData } from '../firebase/firestoreData.ts';
import { isConstructionItem, CONSTRUCTION_CATEGORIES } from '../domain/categories.ts';
import { fmtDate, fmtTime, isValidIso } from '../domain/dates.ts';
import {
  DR_PROJECT,
  DR_STATUS_LABEL,
  DR_STATUS_COLOR,
  PHOTO_TYPES,
  WORK_STATUSES,
  WEATHER,
  blankDailyReport,
  manpowerTotal,
  validateDailyReport,
  canEditReport,
  canReview,
  reviewActions,
} from '../domain/dailyReport.ts';
import { progressEditable } from '../domain/siteReport.ts';
import { newFileId, uploadToDrive, validateFile, driveFileUrl, driveObjectUrl, finishPendingRecords, driveStatus, isRecordPending } from '../drive/driveClient.ts';
import { SecureImg } from '../drive/SecureMedia.tsx';
import type { DailyReport, DailyReportStatus, DailyReportPhoto, DailyReportActivity, Publication } from '../types/index.ts';
import { LOGO_SVG } from '../constants/assets.ts';
import { plural } from '../utils/plural.ts';

const draftKey = (uid: string) => `bb_dcr_draft_${uid}`;
const nowIso = () => new Date().toISOString();

export const DrStatus: React.FC<{ s: DailyReportStatus; local?: boolean }> = ({ s, local }) => (
  <span className="dr-status" style={{ ['--c' as any]: DR_STATUS_COLOR[s] }}>
    {DR_STATUS_LABEL[s]}
    {local ? ' · on this device' : ''}
  </span>
);

// =====================================================================
export const DailyReports: React.FC<{ tab?: string }> = ({ tab }) => {
  const { route, user } = useCommand();
  const [drive, setDrive] = useState<{ configured: boolean } | null | 'loading'>('loading');
  useEffect(() => {
    driveStatus().then((s) => setDrive(s));
    void finishPendingRecords();
  }, []);
  return (
    <div className="cv-grid" style={{ gap: 14 }}>
      {drive !== 'loading' && !drive?.configured && (
        <Banner kind="warn">
          {drive === null
            ? 'The file storage service cannot be reached — photographs cannot be uploaded right now. Reports can still be saved as drafts.'
            : 'Google Drive storage is not configured on the server yet — photographs cannot be uploaded until the administrator completes the setup.'}
        </Banner>
      )}
      {tab === 'history' ? <ReportHistory openId={route.param} /> : <ReportForm key={`${user.id}:${route.param || 'new'}`} editId={route.param} />}
    </div>
  );
};

// =====================================================================
// FORM
// =====================================================================
const ReportForm: React.FC<{ editId?: string }> = ({ editId }) => {
  const { register, today, user, canEdit, actions, dataSync } = useCommand();
  const store = useStore(dailyReportStore);
  const [rep, setRep] = useState<DailyReport>(() => blankDailyReport(today, user));
  const files = useRef<Record<string, File>>({});
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [prog, setProg] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState<'' | 'draft' | 'submit'>('');
  const [errors, setErrors] = useState<string[]>([]);
  const [msg, setMsg] = useState<{
    kind: 'ok' | 'warn' | 'error';
    title: string;
    lines: string[];
    done?: DailyReport;
  } | null>(null);
  const [restored, setRestored] = useState(false);
  const [preview, setPreview] = useState(false);
  const loaded = useRef(false);

  // Load: an existing report (edit / continue submission) or the autosaved unsent draft
  useEffect(() => {
    if (loaded.current) return;
    if (editId) {
      const r = store.items.find((x) => x.id === editId);
      if (!r) return; // wait for the store
      loaded.current = true;
      if (!canEditReport(r, user)) {
        setErrors(['This report can no longer be edited (it is under review or approved).']);
        return;
      }
      setRep(structuredClone(r));
      return;
    }
    loaded.current = true;
    try {
      const raw = localStorage.getItem(draftKey(user.id));
      if (raw) {
        const saved = JSON.parse(raw) as { rep: DailyReport };
        if (saved?.rep?.id) {
          // Photos chosen but not uploaded cannot be restored after closing the page
          saved.rep.photos = saved.rep.photos.map((p) =>
            p.uploadStatus === 'uploaded'
              ? p
              : {
                  ...p,
                  uploadStatus: 'failed',
                  error: 'Select this photo again (it was not uploaded before the page closed).',
                },
          );
          setRep(saved.rep);
          setRestored(true);
        }
      }
    } catch {
      // nothing to restore
    }
  }, [editId, store.items, user]);

  // Autosave unsent changes on this device (cleared after a confirmed submission)
  useEffect(() => {
    if (!loaded.current || msg?.done?.id === rep.id) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(draftKey(user.id), JSON.stringify({ rep, savedAt: nowIso() }));
      } catch {
        // storage full / unavailable
      }
    }, 400);
    return () => clearTimeout(t);
  }, [rep, user.id, msg]);

  const acts = useMemo(() => register.filter(isConstructionItem).sort((a, b) => (a.start || '9999').localeCompare(b.start || '9999')), [register]);
  const set = (p: Partial<DailyReport>) => setRep((r) => ({ ...r, ...p }));
  const setAct = (i: number, p: Partial<DailyReportActivity>) =>
    setRep((r) => ({
      ...r,
      activities: r.activities.map((a, j) => (j === i ? { ...a, ...p } : a)),
    }));
  const setPhoto = (fileId: string, p: Partial<DailyReportPhoto>) =>
    setRep((r) => ({
      ...r,
      photos: r.photos.map((x) => (x.fileId === fileId ? { ...x, ...p } : x)),
    }));
  const locked = !canEdit || busy !== '';

  const addPhotos = (list: FileList | null) => {
    if (!list) return;
    const errs: string[] = [];
    const add: DailyReportPhoto[] = [];
    const pv: Record<string, string> = {};
    Array.from(list).forEach((f) => {
      const e = validateFile(f, true);
      if (e) return errs.push(e);
      const fileId = newFileId();
      files.current[fileId] = f;
      pv[fileId] = URL.createObjectURL(f);
      add.push({
        fileId,
        fileName: f.name,
        fileSize: f.size,
        photoType: PHOTO_TYPES[0],
        activityId: rep.activities[0]?.activityId || undefined,
        description: '',
        uploadStatus: 'pending',
      });
    });
    setPreviews((p) => ({ ...p, ...pv }));
    setRep((r) => ({ ...r, photos: [...r.photos, ...add] }));
    if (errs.length) setErrors(errs);
  };

  const removePhoto = (fileId: string) => {
    delete files.current[fileId];
    setRep((r) => ({
      ...r,
      photos: r.photos.filter((p) => p.fileId !== fileId),
    }));
  };

  /** Upload every photo that is not yet in Google Drive; returns the updated photo list. */
  const uploadPhotos = async (r: DailyReport): Promise<DailyReportPhoto[]> => {
    const out: DailyReportPhoto[] = [];
    for (const p of r.photos) {
      if (p.uploadStatus === 'uploaded') {
        out.push(p);
        continue;
      }
      const f = files.current[p.fileId];
      if (!f) {
        out.push({
          ...p,
          uploadStatus: 'failed',
          error: p.error || 'Select this photo again.',
        });
        continue;
      }
      setPhoto(p.fileId, { uploadStatus: 'uploading', error: undefined });
      try {
        const act = register.find((a) => a.id === p.activityId);
        const res = await uploadToDrive(
          f,
          {
            fileId: p.fileId,
            folderKey: 'daily',
            subfolder: r.reference,
            reportingDate: r.date,
            reportId: r.id,
            activityId: p.activityId,
            category: act?.category,
            photoType: p.photoType,
            description: p.description,
            kind: 'photo',
          },
          (v) => setProg((x) => ({ ...x, [p.fileId]: v })),
        );
        if (!res.recorded && (await finishPendingRecords(), isRecordPending(p.fileId))) {
          // In Google Drive, but the file record is not confirmed: never report it as uploaded
          throw new Error('Stored in Google Drive, but the file record was not confirmed. Press Retry Upload (no duplicate is created).');
        }
        // A deduplicated upload returns the earlier file of the same report: keep that reference
        const ref = res.file
          ? {
              fileId: res.file.id,
              driveFileId: res.file.driveFileId,
              fileSize: res.file.fileSize,
            }
          : {};
        const done: DailyReportPhoto = {
          ...p,
          ...ref,
          uploadStatus: 'uploaded',
          error: undefined,
        };
        setPhoto(p.fileId, done);
        out.push(done);
      } catch (e) {
        const failed: DailyReportPhoto = {
          ...p,
          uploadStatus: 'failed',
          error: e instanceof Error ? e.message : 'Upload failed.',
        };
        setPhoto(p.fileId, failed);
        out.push(failed);
      }
    }
    // Never keep two references to the same file
    const seen = new Set<string>();
    return out.filter((p) => (seen.has(p.fileId) ? false : (seen.add(p.fileId), true)));
  };

  const save = (r: DailyReport) => dailyReportStore.put({ ...r, updatedAt: nowIso(), updatedBy: user.name });

  const saveDraft = async () => {
    if (!isValidIso(rep.date)) return setErrors(['Choose the reporting date.']);
    setErrors([]);
    setMsg(null);
    setBusy('draft');
    try {
      const photos = await uploadPhotos(rep);
      const r = {
        ...rep,
        photos,
        status: (rep.status === 'returned' ? 'returned' : 'draft') as DailyReportStatus,
      };
      const res = await save(r);
      setRep(r);
      const failed = photos.filter((p) => p.uploadStatus === 'failed').length;
      setMsg({
        kind: res === 'shared' && !failed ? 'ok' : 'warn',
        title: res === 'shared' ? 'Draft saved' : 'Draft saved on this device only',
        lines: [
          res === 'shared'
            ? 'The draft is stored in the shared database. Continue editing any time from Report History.'
            : 'The shared database did not confirm the save. The draft stays on this device until it can be synced.',
          ...(failed ? [`${plural(failed, 'photo')} could not be uploaded — retry before submitting.`] : []),
        ],
      });
    } catch (e) {
      setMsg({
        kind: 'error',
        title: 'Draft not saved',
        lines: [e instanceof Error ? e.message : 'Unexpected error.'],
      });
    } finally {
      setBusy('');
    }
  };

  const submit = async () => {
    if (busy) return;
    // STEP 1 — validate (failed photos that can still be retried do not block)
    const forCheck = {
      ...rep,
      photos: rep.photos.map((p) => (p.uploadStatus === 'failed' && files.current[p.fileId] ? { ...p, uploadStatus: 'pending' as const } : p)),
    };
    const errs = validateDailyReport(forCheck, today);
    setErrors(errs);
    if (errs.length) {
      document.getElementById('dr-errors')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setMsg(null);
    setBusy('submit');
    const problems: string[] = [];
    try {
      // STEP 2 — save the report record with a clear initial state
      let r: DailyReport = {
        ...rep,
        status: 'uploading',
        preparedBy: rep.preparedBy || user.name,
        preparedById: rep.preparedById || user.id,
      };
      const s2 = await save(r);
      if (s2 !== 'shared') problems.push('The report record was not confirmed by the shared database.');
      // STEP 3 — upload photographs to Google Drive
      const photos = await uploadPhotos(r);
      const failed = photos.filter((p) => p.uploadStatus !== 'uploaded');
      if (failed.length) problems.push(`${plural(failed.length, 'photo')} failed to upload: ${failed.map((p) => p.fileName).join(', ')}.`);
      // STEP 4 — save the Google Drive file references with the report
      r = { ...r, photos };
      const s4 = await save(r);
      if (s4 !== 'shared') problems.push('The photo references were not confirmed by the shared database.');
      // STEP 5 — finalize only when everything is confirmed
      if (!problems.length) {
        const at = nowIso();
        const fin: DailyReport = {
          ...r,
          status: 'submitted',
          submittedAt: at,
          history: [...r.history, { at, by: user.name, to: 'submitted' }],
        };
        const s5 = await save(fin);
        if (s5 === 'shared') {
          await firestoreData.logAudit(user, 'SUBMIT_DAILY_REPORT', 'DailyReport', fin.id, `${fin.reference} · ${fin.date}`).catch(() => undefined);
          // STEP 6 — confirmation; STEP 7 — the history list updates from the database
          setMsg({
            kind: 'ok',
            title: 'Daily Construction Report successfully submitted.',
            lines: [],
            done: fin,
          });
          try {
            localStorage.removeItem(draftKey(user.id));
          } catch {
            // ignore
          }
          files.current = {};
          setRep(blankDailyReport(today, user));
          setErrors([]);
          window.scrollTo({ top: 0, behavior: 'smooth' });
          return;
        }
        problems.push('The final submission was not confirmed by the shared database.');
      }
      const pend: DailyReport = { ...r, status: 'pending' };
      await save(pend).catch(() => undefined);
      setRep(pend);
      setMsg({
        kind: 'error',
        title: 'Not submitted yet — Pending Submission',
        lines: [...problems, 'Your entries are kept. Fix the items above and press Submit Report again; it will not create a duplicate.'],
      });
    } catch (e) {
      setMsg({
        kind: 'error',
        title: 'Not submitted',
        lines: [e instanceof Error ? e.message : 'Unexpected error.', 'Your entries are kept — press Submit Report again.'],
      });
    } finally {
      setBusy('');
    }
  };

  const startNew = () => {
    try {
      localStorage.removeItem(draftKey(user.id));
    } catch {
      // ignore
    }
    files.current = {};
    setRep(blankDailyReport(today, user));
    setRestored(false);
    setErrors([]);
    setMsg(null);
    actions.navigate('site/new');
  };

  if (!canEdit) return <Banner kind="info">Read-only access: Daily Construction Reports are prepared by site personnel. See Report History.</Banner>;

  const photoUrl = (p: DailyReportPhoto) => previews[p.fileId] || (p.uploadStatus === 'uploaded' ? driveFileUrl(p.fileId) : undefined);

  return (
    <div className="dr-form-wrap">
      {msg?.done && <Confirmation r={msg.done} onHistory={() => actions.navigate(`site/history/${msg.done!.id}`)} />}
      {msg && !msg.done && (
        <div className={`dr-msg ${msg.kind}`} role="status">
          {msg.kind === 'ok' ? (
            <CheckCircle2 size={20} aria-hidden />
          ) : msg.kind === 'warn' ? (
            <CloudOff size={20} aria-hidden />
          ) : (
            <AlertTriangle size={20} aria-hidden />
          )}
          <div>
            <b>{msg.title}</b>
            {msg.lines.map((l) => (
              <div key={l}>{l}</div>
            ))}
          </div>
        </div>
      )}
      {restored && !editId && (
        <Banner kind="info">
          Your unsent report from this device was restored ({rep.reference}).{' '}
          <button type="button" className="cv-linkbtn" onClick={startNew}>
            Start a new report instead
          </button>
        </Banner>
      )}
      {rep.status === 'returned' && rep.review?.remarks && (
        <Banner kind="warn">
          <b>Returned for revision:</b> {rep.review.remarks}
        </Banner>
      )}
      {dataSync.state !== 'live' && (
        <Banner kind="warn">
          {SYNC_LABEL[dataSync.state]?.label}: drafts are kept on this device and the report cannot be submitted until the shared database is reachable.
        </Banner>
      )}

      {/* REPORT INFORMATION */}
      <Card title="Report information" note={`${rep.reference} · ${DR_STATUS_LABEL[rep.status]}`}>
        <div className="dr-grid">
          <Field label="Project">
            <select className="cv-select" value={rep.projectId} disabled>
              <option value={DR_PROJECT.id}>{DR_PROJECT.name}</option>
            </select>
          </Field>
          <Field label="Project ID">
            <input className="cv-input" value={rep.projectId} disabled />
          </Field>
          <Field label="Reporting date *">
            <input type="date" className="cv-input" value={rep.date} max={today} disabled={locked} onChange={(e) => set({ date: e.target.value })} />
          </Field>
          <Field label="Report reference number">
            <input className="cv-input" value={rep.reference} disabled />
          </Field>
          <Field label="Weather conditions">
            <select className="cv-select" value={rep.weather} disabled={locked} onChange={(e) => set({ weather: e.target.value })}>
              <option value="">Not recorded</option>
              {WEATHER.map((w) => (
                <option key={w}>{w}</option>
              ))}
            </select>
          </Field>
          <Field label="Site location / area">
            <input
              className="cv-input"
              value={rep.siteLocation}
              disabled={locked}
              placeholder="e.g. Ground floor, east wing"
              onChange={(e) => set({ siteLocation: e.target.value })}
            />
          </Field>
          <Field label="Prepared by">
            <input className="cv-input" value={rep.preparedBy} disabled />
          </Field>
          <Field label="Submission date">
            <input
              className="cv-input"
              value={rep.submittedAt ? `${fmtDate(rep.submittedAt.slice(0, 10))} ${fmtTime(rep.submittedAt.slice(11, 16))}` : 'Not yet submitted'}
              disabled
            />
          </Field>
        </div>
      </Card>

      {/* CONSTRUCTION ACTIVITIES */}
      <Card
        title={`Construction accomplishments · ${rep.activities.length}`}
        note="Reported progress is recorded for review. It changes the Master Project Tracker only after a manager approves and applies it."
        actions={
          <button
            type="button"
            className="cv-btn sm"
            disabled={locked}
            onClick={() =>
              set({
                activities: [
                  ...rep.activities,
                  {
                    activityId: '',
                    category: '',
                    name: '',
                    workDescription: '',
                    accomplishment: '',
                    progress: null,
                    workStatus: 'In progress',
                    remarks: '',
                  },
                ],
              })
            }
          >
            <Plus size={14} aria-hidden /> Add Activity
          </button>
        }
      >
        {!rep.activities.length && <Empty>No activities yet — add the work done today.</Empty>}
        {rep.activities.map((a, i) => {
          const r = register.find((x) => x.id === a.activityId);
          return (
            <div key={i} className="dr-row-card">
              <div className="dr-row-h">
                <b>Activity {i + 1}</b>
                <button
                  type="button"
                  className="cv-btn ghost sm"
                  disabled={locked}
                  aria-label={`Delete activity ${i + 1}`}
                  onClick={() =>
                    set({
                      activities: rep.activities.filter((_, j) => j !== i),
                    })
                  }
                >
                  <Trash2 size={15} />
                </button>
              </div>
              <div className="dr-grid">
                <Field label="Activity *" className="dr-span2">
                  <select
                    className="cv-select"
                    value={a.activityId}
                    disabled={locked}
                    onChange={(e) => {
                      const x = register.find((y) => y.id === e.target.value);
                      setAct(i, {
                        activityId: e.target.value,
                        name: x?.name || '',
                        category: x?.category || '',
                        progress: x && progressEditable(x) ? x.progress : null,
                      });
                    }}
                  >
                    <option value="">Choose an activity</option>
                    {acts.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name} · {x.workstream}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Construction category">
                  <select className="cv-select" value={a.category} disabled={locked} onChange={(e) => setAct(i, { category: e.target.value })}>
                    <option value="">—</option>
                    {CONSTRUCTION_CATEGORIES.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Work status">
                  <select
                    className="cv-select"
                    value={a.workStatus}
                    disabled={locked}
                    onChange={(e) =>
                      setAct(i, {
                        workStatus: e.target.value as DailyReportActivity['workStatus'],
                      })
                    }
                  >
                    {WORK_STATUSES.map((w) => (
                      <option key={w}>{w}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Work description" className="dr-span2">
                  <textarea
                    className="cv-textarea"
                    rows={2}
                    value={a.workDescription}
                    disabled={locked}
                    onChange={(e) => setAct(i, { workDescription: e.target.value })}
                  />
                </Field>
                <Field label="Actual accomplishment" className="dr-span2">
                  <textarea
                    className="cv-textarea"
                    rows={2}
                    value={a.accomplishment}
                    disabled={locked}
                    placeholder="What was completed today (quantities, areas)"
                    onChange={(e) => setAct(i, { accomplishment: e.target.value })}
                  />
                </Field>
                {r && progressEditable(r) ? (
                  <Field
                    label={`Reported progress: ${a.progress ?? r.progress}%`}
                    hint={`Recorded in the tracker: ${r.progress}% · planned today ${r.plannedProgress}%`}
                    className="dr-span2"
                  >
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      className="dr-range"
                      value={a.progress ?? r.progress}
                      disabled={locked}
                      onChange={(e) => setAct(i, { progress: Number(e.target.value) })}
                      aria-label="Reported progress"
                    />
                  </Field>
                ) : (
                  a.activityId && (
                    <div className="dr-span2 cv-dim" style={{ fontSize: 13 }}>
                      This item is tracked by status, not percentage.
                    </div>
                  )
                )}
                <Field label="Remarks" className="dr-span2">
                  <input className="cv-input" value={a.remarks} disabled={locked} onChange={(e) => setAct(i, { remarks: e.target.value })} />
                </Field>
              </div>
            </div>
          );
        })}
      </Card>

      {/* MANPOWER */}
      <Card title={`Manpower · total ${manpowerTotal(rep)}`}>
        <div className="dr-grid four">
          {(
            [
              ['skilled', 'Skilled workers'],
              ['general', 'General workers'],
              ['subcontractor', 'Subcontractor personnel'],
              ['other', 'Other personnel'],
            ] as const
          ).map(([k, l]) => (
            <Field key={k} label={l}>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                className="cv-input"
                value={rep.manpower[k]}
                disabled={locked}
                onChange={(e) =>
                  set({
                    manpower: {
                      ...rep.manpower,
                      [k]: Math.max(0, Math.round(Number(e.target.value) || 0)),
                    },
                  })
                }
              />
            </Field>
          ))}
        </div>
      </Card>

      {/* MATERIALS */}
      <Card
        title={`Materials and deliveries · ${rep.materials.length}`}
        actions={
          <button
            type="button"
            className="cv-btn sm"
            disabled={locked}
            onClick={() =>
              set({
                materials: [
                  ...rep.materials,
                  {
                    description: '',
                    quantity: '',
                    unit: '',
                    deliveryDate: rep.date,
                    supplier: '',
                    remarks: '',
                  },
                ],
              })
            }
          >
            <Plus size={14} aria-hidden /> Add Material
          </button>
        }
      >
        {rep.materials.map((m, i) => (
          <div key={i} className="dr-row-card">
            <div className="dr-grid">
              <Field label="Material description *" className="dr-span2">
                <input
                  className="cv-input"
                  value={m.description}
                  disabled={locked}
                  onChange={(e) =>
                    set({
                      materials: rep.materials.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)),
                    })
                  }
                />
              </Field>
              <Field label="Quantity">
                <input
                  className="cv-input"
                  inputMode="decimal"
                  value={m.quantity}
                  disabled={locked}
                  onChange={(e) =>
                    set({
                      materials: rep.materials.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)),
                    })
                  }
                />
              </Field>
              <Field label="Unit">
                <input
                  className="cv-input"
                  value={m.unit}
                  placeholder="bags, pcs, m³"
                  disabled={locked}
                  onChange={(e) =>
                    set({
                      materials: rep.materials.map((x, j) => (j === i ? { ...x, unit: e.target.value } : x)),
                    })
                  }
                />
              </Field>
              <Field label="Delivery date">
                <input
                  type="date"
                  className="cv-input"
                  value={m.deliveryDate}
                  disabled={locked}
                  onChange={(e) =>
                    set({
                      materials: rep.materials.map((x, j) => (j === i ? { ...x, deliveryDate: e.target.value } : x)),
                    })
                  }
                />
              </Field>
              <Field label="Supplier">
                <input
                  className="cv-input"
                  value={m.supplier}
                  disabled={locked}
                  onChange={(e) =>
                    set({
                      materials: rep.materials.map((x, j) => (j === i ? { ...x, supplier: e.target.value } : x)),
                    })
                  }
                />
              </Field>
              <Field label="Remarks" className="dr-span2">
                <input
                  className="cv-input"
                  value={m.remarks}
                  disabled={locked}
                  onChange={(e) =>
                    set({
                      materials: rep.materials.map((x, j) => (j === i ? { ...x, remarks: e.target.value } : x)),
                    })
                  }
                />
              </Field>
            </div>
            <button type="button" className="cv-btn ghost sm" disabled={locked} onClick={() => set({ materials: rep.materials.filter((_, j) => j !== i) })}>
              <Trash2 size={14} aria-hidden /> Delete
            </button>
          </div>
        ))}
      </Card>

      {/* EQUIPMENT */}
      <Card
        title={`Equipment · ${rep.equipment.length}`}
        actions={
          <button
            type="button"
            className="cv-btn sm"
            disabled={locked}
            onClick={() =>
              set({
                equipment: [
                  ...rep.equipment,
                  {
                    description: '',
                    quantity: '1',
                    status: 'Operational',
                    remarks: '',
                  },
                ],
              })
            }
          >
            <Plus size={14} aria-hidden /> Add Equipment
          </button>
        }
      >
        {rep.equipment.map((q, i) => (
          <div key={i} className="dr-row-card">
            <div className="dr-grid">
              <Field label="Equipment description *" className="dr-span2">
                <input
                  className="cv-input"
                  value={q.description}
                  disabled={locked}
                  onChange={(e) =>
                    set({
                      equipment: rep.equipment.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)),
                    })
                  }
                />
              </Field>
              <Field label="Quantity">
                <input
                  className="cv-input"
                  inputMode="numeric"
                  value={q.quantity}
                  disabled={locked}
                  onChange={(e) =>
                    set({
                      equipment: rep.equipment.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)),
                    })
                  }
                />
              </Field>
              <Field label="Operational status">
                <select
                  className="cv-select"
                  value={q.status}
                  disabled={locked}
                  onChange={(e) =>
                    set({
                      equipment: rep.equipment.map((x, j) => (j === i ? { ...x, status: e.target.value } : x)),
                    })
                  }
                >
                  {['Operational', 'Idle', 'Under repair', 'Breakdown'].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </Field>
              <Field label="Remarks" className="dr-span2">
                <input
                  className="cv-input"
                  value={q.remarks}
                  disabled={locked}
                  onChange={(e) =>
                    set({
                      equipment: rep.equipment.map((x, j) => (j === i ? { ...x, remarks: e.target.value } : x)),
                    })
                  }
                />
              </Field>
            </div>
            <button type="button" className="cv-btn ghost sm" disabled={locked} onClick={() => set({ equipment: rep.equipment.filter((_, j) => j !== i) })}>
              <Trash2 size={14} aria-hidden /> Delete
            </button>
          </div>
        ))}
      </Card>

      {/* SITE CONDITIONS */}
      <Card title="Site conditions and issues">
        <div className="dr-grid">
          {(
            [
              ['observations', 'Site observations'],
              ['issues', 'Issues encountered'],
              ['delays', 'Delays'],
              ['safety', 'Safety concerns'],
              ['corrective', 'Corrective actions'],
              ['recommendations', 'Recommendations'],
            ] as const
          ).map(([k, l]) => (
            <Field key={k} label={l}>
              <textarea className="cv-textarea" rows={2} value={rep.site[k]} disabled={locked} onChange={(e) => set({ site: { ...rep.site, [k]: e.target.value } })} />
            </Field>
          ))}
        </div>
      </Card>

      {/* PHOTOS */}
      <Card title={`Photo documentation · ${rep.photos.length}`} note="Photos are stored in the project's Google Drive folder and linked to this report.">
        <div className="dr-photo-btns">
          <label className={`cv-btn ${locked ? 'disabled' : ''}`}>
            <Camera size={16} aria-hidden /> Take Photo
            <input type="file" accept="image/*" capture="environment" hidden disabled={locked} onChange={(e) => (addPhotos(e.target.files), (e.target.value = ''))} />
          </label>
          <label className={`cv-btn ${locked ? 'disabled' : ''}`}>
            <ImagePlus size={16} aria-hidden /> Choose Photos
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              multiple
              hidden
              disabled={locked}
              onChange={(e) => (addPhotos(e.target.files), (e.target.value = ''))}
            />
          </label>
        </div>
        {rep.photos.length > 0 && (
          <div className="dr-photos">
            {rep.photos.map((p) => {
              const pr = prog[p.fileId];
              return (
                <div key={p.fileId} className={`dr-photo ${p.uploadStatus}`}>
                  <div className="dr-photo-img">
                    {photoUrl(p) ? (
                      <SecureImg src={photoUrl(p)} alt={p.fileName} />
                    ) : (
                      <span className="dr-img-missing">
                        <ImageIcon size={22} aria-hidden />
                      </span>
                    )}
                    <span className="dr-photo-state">
                      {p.uploadStatus === 'uploaded'
                        ? 'Uploaded'
                        : p.uploadStatus === 'uploading'
                          ? `Uploading ${Math.round((pr || 0) * 100)}%`
                          : p.uploadStatus === 'failed'
                            ? 'Failed'
                            : 'Not uploaded'}
                    </span>
                    {p.uploadStatus === 'uploading' && (
                      <span className="dr-photo-bar">
                        <i style={{ width: `${Math.round((pr || 0) * 100)}%` }} />
                      </span>
                    )}
                  </div>
                  <div className="dr-photo-f">
                    <select
                      className="cv-select"
                      aria-label="Photo type"
                      value={p.photoType}
                      disabled={locked}
                      onChange={(e) => setPhoto(p.fileId, { photoType: e.target.value })}
                    >
                      {PHOTO_TYPES.map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                    <select
                      className="cv-select"
                      aria-label="Related activity"
                      value={p.activityId || ''}
                      disabled={locked}
                      onChange={(e) =>
                        setPhoto(p.fileId, {
                          activityId: e.target.value || undefined,
                        })
                      }
                    >
                      <option value="">No specific activity</option>
                      {rep.activities
                        .filter((a) => a.activityId)
                        .map((a) => (
                          <option key={a.activityId} value={a.activityId}>
                            {a.name}
                          </option>
                        ))}
                    </select>
                    <input
                      className="cv-input"
                      aria-label="Photo description"
                      placeholder="Description"
                      value={p.description}
                      disabled={locked || p.uploadStatus === 'uploaded'}
                      onChange={(e) => setPhoto(p.fileId, { description: e.target.value })}
                    />
                    {p.error && <div className="dr-photo-err">{p.error}</div>}
                    <div className="dr-photo-actions">
                      {p.uploadStatus === 'failed' && files.current[p.fileId] && (
                        <button
                          type="button"
                          className="cv-btn sm"
                          disabled={locked}
                          onClick={async () => {
                            setBusy('draft');
                            const photos = await uploadPhotos({
                              ...rep,
                              photos: rep.photos.filter((x) => x.fileId === p.fileId),
                            });
                            setPhoto(p.fileId, photos[0]);
                            setBusy('');
                          }}
                        >
                          <RefreshCw size={14} aria-hidden /> Retry Upload
                        </button>
                      )}
                      {p.uploadStatus !== 'uploaded' && (
                        <button type="button" className="cv-btn ghost sm" disabled={locked} onClick={() => removePhoto(p.fileId)}>
                          <Trash2 size={14} aria-hidden /> Remove
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* SIGN-OFF */}
      <Card title="Report sign-off">
        <div className="dr-grid">
          <Field label="Prepared by">
            <input className="cv-input" value={rep.preparedBy} disabled />
          </Field>
          <Field label="Reviewed by">
            <input className="cv-input" value={rep.review?.reviewedBy || 'Pending review'} disabled />
          </Field>
          <Field label="Approval status">
            <input className="cv-input" value={DR_STATUS_LABEL[rep.status]} disabled />
          </Field>
          <Field label="Review remarks">
            <input className="cv-input" value={rep.review?.remarks || '—'} disabled />
          </Field>
        </div>
      </Card>

      {errors.length > 0 && (
        <div id="dr-errors">
          <Banner kind="error">
            {errors.map((e) => (
              <div key={e}>{e}</div>
            ))}
          </Banner>
        </div>
      )}

      <div className="dr-actions">
        <button type="button" className="cv-btn" onClick={saveDraft} disabled={!!busy}>
          <Save size={16} aria-hidden /> {busy === 'draft' ? 'Saving…' : 'Save Draft'}
        </button>
        <button type="button" className="cv-btn" onClick={() => setPreview(true)} disabled={!!busy}>
          <Eye size={16} aria-hidden /> Preview Report
        </button>
        <button type="button" className="cv-btn primary" onClick={submit} disabled={!!busy}>
          <Send size={16} aria-hidden /> {busy === 'submit' ? 'Submitting…' : 'Submit Report'}
        </button>
      </div>

      {preview && (
        <Modal title={`Preview · ${rep.reference}`} sub="Exactly what reviewers will see" onClose={() => setPreview(false)} width={980}>
          <DailyReportDocument r={rep} photoSrc={(p) => photoUrl(p)} />
        </Modal>
      )}
    </div>
  );
};

const Confirmation: React.FC<{ r: DailyReport; onHistory: () => void }> = ({ r, onHistory }) => (
  <div className="dr-confirm" role="status">
    <CheckCircle2 size={28} aria-hidden />
    <div>
      <b>Daily Construction Report successfully submitted.</b>
      <dl>
        <dt>Report reference number</dt>
        <dd>{r.reference}</dd>
        <dt>Project</dt>
        <dd>{r.projectName}</dd>
        <dt>Reporting date</dt>
        <dd>{fmtDate(r.date)}</dd>
        <dt>Submission time</dt>
        <dd>
          {fmtDate(r.submittedAt!.slice(0, 10))} ·{' '}
          {new Date(r.submittedAt!).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            timeZone: 'Asia/Manila',
          })}
        </dd>
        <dt>Submission status</dt>
        <dd>
          <DrStatus s="submitted" /> · {plural(r.photos.length, 'photo')} stored in Google Drive
        </dd>
      </dl>
      <button type="button" className="cv-btn sm" onClick={onHistory}>
        View in Report History
      </button>
    </div>
  </div>
);

// =====================================================================
// HISTORY, DETAIL, REVIEW
// =====================================================================
const ReportHistory: React.FC<{ openId?: string }> = ({ openId }) => {
  const { user, actions } = useCommand();
  const store = useStore(dailyReportStore);
  const legacy = useStore(siteReportStore);
  const [f, setF] = useState({ from: '', to: '', status: '', by: '' });
  const people = [...new Set(store.items.map((r) => r.preparedBy))].sort();
  const rows = store.items.filter(
    (r) => (!f.from || r.date >= f.from) && (!f.to || r.date <= f.to) && (!f.status || r.status === f.status) && (!f.by || r.preparedBy === f.by),
  );
  const open = openId ? store.items.find((r) => r.id === openId) : undefined;
  if (openId && open) return <ReportDetail r={open} onBack={() => actions.navigate('site/history')} />;
  return (
    <>
      <Card
        title={`Daily Report History · ${rows.length}`}
        note="Unsent drafts and pending submissions are clearly marked. Device-only records are not yet in the shared database."
      >
        <div className="dr-filters">
          <Field label="Project">
            <select className="cv-select" value={DR_PROJECT.id} disabled>
              <option value={DR_PROJECT.id}>{DR_PROJECT.name}</option>
            </select>
          </Field>
          <Field label="From">
            <input type="date" className="cv-input" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} />
          </Field>
          <Field label="To">
            <input type="date" className="cv-input" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} />
          </Field>
          <Field label="Status">
            <select className="cv-select" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
              <option value="">All statuses</option>
              {Object.entries(DR_STATUS_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Prepared by">
            <select className="cv-select" value={f.by} onChange={(e) => setF({ ...f, by: e.target.value })}>
              <option value="">Everyone</option>
              {people.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </Field>
        </div>
        {rows.length ? (
          <div className="cv-table-wrap">
            <table className="cv-table">
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Reporting Date</th>
                  <th>Project</th>
                  <th>Prepared By</th>
                  <th>Submitted</th>
                  <th>Status</th>
                  <th>Photos</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <b>{r.reference}</b>
                    </td>
                    <td>{fmtDate(r.date)}</td>
                    <td>{r.projectName}</td>
                    <td>{r.preparedBy}</td>
                    <td>{r.submittedAt ? fmtDate(r.submittedAt.slice(0, 10)) : '—'}</td>
                    <td>
                      <DrStatus s={r.status} local={r.localOnly} />
                    </td>
                    <td>{r.photos.filter((p) => p.uploadStatus === 'uploaded').length}</td>
                    <td className="nowrap">
                      <button type="button" className="cv-btn sm" onClick={() => actions.navigate(`site/history/${r.id}`)}>
                        View Details
                      </button>{' '}
                      {canEditReport(r, user) && (
                        <button type="button" className="cv-btn ghost sm" onClick={() => actions.navigate(`site/new/${r.id}`)}>
                          {r.status === 'pending' || r.status === 'uploading' ? 'Continue Submission' : 'Edit'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>
            <ClipboardList size={18} aria-hidden /> No Daily Construction Reports match these filters.
          </Empty>
        )}
      </Card>
      {legacy.items.length > 0 && (
        <Card title={`Earlier quick site updates · ${legacy.items.length}`} note="Submitted with the previous site-report form. Kept read-only.">
          <ul className="dr-legacy">
            {legacy.items.map((s) => (
              <li key={s.id}>
                <b>{s.activityName}</b>
                <span>
                  {fmtDate(s.date)} · {s.submittedBy} · {s.progressBefore}% → {s.progressAfter}%{s.remarks ? ` · ${s.remarks}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
};

const ReportDetail: React.FC<{ r: DailyReport; onBack: () => void }> = ({ r, onBack }) => {
  const { user, actions, register, isManager } = useCommand();
  const [remarks, setRemarks] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const reviewer = canReview(user.role);

  const transition = async (to: DailyReportStatus, needsRemarks?: boolean) => {
    if (needsRemarks && !remarks.trim()) return setNote('Add review remarks explaining what to revise.');
    setBusy(true);
    const at = nowIso();
    const res = await dailyReportStore.put({
      ...r,
      status: to,
      review: {
        reviewedBy: user.name,
        reviewedById: user.id,
        reviewedAt: at,
        remarks: remarks.trim() || r.review?.remarks,
      },
      history: [...r.history, { at, by: user.name, to, note: remarks.trim() || undefined }],
      updatedAt: at,
      updatedBy: user.name,
    });
    await firestoreData.logAudit(user, `DAILY_REPORT_${to.toUpperCase()}`, 'DailyReport', r.id, r.reference).catch(() => undefined);
    setNote(res === 'shared' ? `Report ${DR_STATUS_LABEL[to].toLowerCase()}.` : 'Saved on this device only — not confirmed by the shared database.');
    setRemarks('');
    setBusy(false);
  };

  const applyProgress = async (i: number) => {
    const a = r.activities[i];
    const act = register.find((x) => x.id === a.activityId);
    if (!act || a.progress === null) return;
    setBusy(true);
    const ok = await actions.patchActivity(act, { progress: a.progress });
    if (ok)
      await dailyReportStore.put({
        ...r,
        activities: r.activities.map((x, j) => (j === i ? { ...x, progressApplied: true } : x)),
        updatedAt: nowIso(),
        updatedBy: user.name,
      });
    setNote(ok ? `Approved progress ${a.progress}% applied to ${act.name}.` : 'Progress was not applied.');
    setBusy(false);
  };

  const preparePhoto = async (p: DailyReportPhoto) => {
    const now = nowIso();
    const pub: Publication = {
      id: newId('PHO'),
      kind: 'photo',
      title: p.description || `${p.photoType} — ${fmtDate(r.date)}`,
      status: 'draft',
      sourceId: r.id,
      payload: {
        url: driveFileUrl(p.fileId),
        fileId: p.fileId,
        caption: p.description,
        date: r.date,
        category: 'Site progress',
      },
      history: [
        {
          at: now,
          by: user.name,
          to: 'draft',
          note: `Prepared from approved daily report ${r.reference}`,
        },
      ],
      createdAt: now,
      createdBy: user.name,
      updatedAt: now,
      updatedBy: user.name,
    };
    const res = await publicationStore.put(pub);
    setNote(
      res === 'shared'
        ? 'Photo prepared as a draft in Client Portal Management — it reaches clients only after approval and publishing.'
        : 'Draft saved on this device only.',
    );
  };

  const exportPdf = async () => {
    setBusy(true);
    const urls: Record<string, string> = {};
    await Promise.all(
      r.photos
        .filter((p) => p.uploadStatus === 'uploaded')
        .map(async (p) => {
          try {
            urls[p.fileId] = await driveObjectUrl(p.fileId);
          } catch {
            // printed as "Image not available"
          }
        }),
    );
    setBusy(false);
    actions.printElement(() => <DailyReportDocument r={r} photoSrc={(p) => urls[p.fileId]} print />, `${r.reference} — Daily Construction Report`);
  };

  return (
    <div className="cv-grid" style={{ gap: 14 }}>
      <div className="dr-detail-bar">
        <button type="button" className="cv-btn sm" onClick={onBack}>
          ← Report History
        </button>
        <DrStatus s={r.status} local={r.localOnly} />
        <span className="dr-spacer" />
        {canEditReport(r, user) && (
          <button type="button" className="cv-btn sm" onClick={() => actions.navigate(`site/new/${r.id}`)}>
            <Pencil size={14} aria-hidden /> Edit
          </button>
        )}
        <button type="button" className="cv-btn primary sm" onClick={exportPdf} disabled={busy}>
          <FileDown size={14} aria-hidden /> Export PDF
        </button>
      </div>
      {note && <Banner kind="info">{note}</Banner>}
      {reviewer && reviewActions(r.status).length > 0 && (
        <Card title="Review" note="Approving does not change the Master Project Tracker by itself.">
          <Field label="Review remarks">
            <textarea className="cv-textarea" rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </Field>
          <div className="cv-row" style={{ marginTop: 8 }}>
            {reviewActions(r.status).map((a) => (
              <button
                key={a.to}
                type="button"
                className={`cv-btn sm ${a.to === 'approved' ? 'primary' : a.to === 'returned' ? 'danger' : ''}`}
                disabled={busy}
                onClick={() => transition(a.to, a.needsRemarks)}
              >
                {a.label}
              </button>
            ))}
          </div>
        </Card>
      )}
      {r.status === 'approved' && isManager && r.activities.some((a) => a.progress !== null) && (
        <Card title="Apply approved progress" note="Updates the Master Project Tracker through the activity update path (recorded in the audit log).">
          <ul className="dr-legacy">
            {r.activities.map((a, i) => {
              const act = register.find((x) => x.id === a.activityId);
              if (!act || a.progress === null || !progressEditable(act)) return null;
              return (
                <li key={i}>
                  <b>{a.name}</b>
                  <span>
                    Reported {a.progress}% · tracker {act.progress}%
                  </span>
                  {a.progressApplied || act.progress === a.progress ? (
                    <span className="dr-applied">Applied</span>
                  ) : (
                    <button type="button" className="cv-btn sm" disabled={busy} onClick={() => applyProgress(i)}>
                      Apply {a.progress}% to Tracker
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
      <Card title="Report">
        <DailyReportDocument
          r={r}
          photoSrc={(p) => (p.uploadStatus === 'uploaded' ? driveFileUrl(p.fileId) : undefined)}
          onPreparePhoto={r.status === 'approved' ? preparePhoto : undefined}
        />
      </Card>
    </div>
  );
};

// =====================================================================
// DOCUMENT (preview + PDF)
// =====================================================================
export const DailyReportDocument: React.FC<{
  r: DailyReport;
  photoSrc: (p: DailyReportPhoto) => string | undefined;
  print?: boolean;
  onPreparePhoto?: (p: DailyReportPhoto) => void;
}> = ({ r, photoSrc, print, onPreparePhoto }) => {
  const NP = <span className="dr-np">Not provided</span>;
  const t = (s?: string) => (s && s.trim() ? s : NP);
  const site = r.site;
  return (
    <article className={`dr-doc ${print ? 'print' : ''}`}>
      <header className="dr-doc-h">
        <img src={LOGO_SVG} alt="Convengers" />
        <div>
          <div className="dr-doc-k">Convengers · Bahay Build</div>
          <h1>Daily Construction Report</h1>
          <div className="dr-doc-ref">
            {r.reference} · {DR_STATUS_LABEL[r.status]}
          </div>
        </div>
      </header>
      <section>
        <h2>Project information</h2>
        <dl className="dr-doc-grid">
          <dt>Project</dt>
          <dd>
            {r.projectName} ({r.projectId})
          </dd>
          <dt>Reporting date</dt>
          <dd>{fmtDate(r.date)}</dd>
          <dt>Weather</dt>
          <dd>{t(r.weather)}</dd>
          <dt>Site location</dt>
          <dd>{t(r.siteLocation)}</dd>
          <dt>Prepared by</dt>
          <dd>{r.preparedBy}</dd>
          <dt>Submitted</dt>
          <dd>
            {r.submittedAt
              ? `${fmtDate(r.submittedAt.slice(0, 10))} ${new Date(r.submittedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' })}`
              : 'Not yet submitted'}
          </dd>
        </dl>
      </section>
      <section>
        <h2>Construction accomplishments</h2>
        {r.activities.length ? (
          <table className="dr-doc-table">
            <thead>
              <tr>
                <th>Activity</th>
                <th>Category</th>
                <th>Work / accomplishment</th>
                <th>Progress</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {r.activities.map((a, i) => (
                <tr key={i}>
                  <td>
                    <b>{a.name || NP}</b>
                    {a.remarks && <div className="dr-doc-sm">{a.remarks}</div>}
                  </td>
                  <td>{a.category || '—'}</td>
                  <td>
                    {a.workDescription && <div>{a.workDescription}</div>}
                    {a.accomplishment && <div className="dr-doc-sm">{a.accomplishment}</div>}
                    {!a.workDescription && !a.accomplishment && NP}
                  </td>
                  <td>{a.progress === null ? '—' : `${a.progress}%${a.progressApplied ? ' (applied)' : ''}`}</td>
                  <td>{a.workStatus}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="dr-np">No construction activities were reported.</p>
        )}
      </section>
      <section className="dr-doc-two">
        <div>
          <h2>Manpower summary</h2>
          <dl className="dr-doc-grid">
            <dt>Skilled workers</dt>
            <dd>{r.manpower.skilled}</dd>
            <dt>General workers</dt>
            <dd>{r.manpower.general}</dd>
            <dt>Subcontractor personnel</dt>
            <dd>{r.manpower.subcontractor}</dd>
            <dt>Other personnel</dt>
            <dd>{r.manpower.other}</dd>
            <dt>
              <b>Total manpower</b>
            </dt>
            <dd>
              <b>{manpowerTotal(r)}</b>
            </dd>
          </dl>
        </div>
        <div>
          <h2>Equipment</h2>
          {r.equipment.length ? (
            <ul className="dr-doc-list">
              {r.equipment.map((q, i) => (
                <li key={i}>
                  {q.description} × {q.quantity || '—'} · {q.status}
                  {q.remarks ? ` · ${q.remarks}` : ''}
                </li>
              ))}
            </ul>
          ) : (
            <p className="dr-np">None recorded.</p>
          )}
        </div>
      </section>
      <section>
        <h2>Materials and deliveries</h2>
        {r.materials.length ? (
          <table className="dr-doc-table">
            <thead>
              <tr>
                <th>Material</th>
                <th>Quantity</th>
                <th>Delivery date</th>
                <th>Supplier</th>
                <th>Remarks</th>
              </tr>
            </thead>
            <tbody>
              {r.materials.map((m, i) => (
                <tr key={i}>
                  <td>{m.description}</td>
                  <td>
                    {m.quantity || '—'} {m.unit}
                  </td>
                  <td>{m.deliveryDate ? fmtDate(m.deliveryDate) : '—'}</td>
                  <td>{m.supplier || '—'}</td>
                  <td>{m.remarks || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="dr-np">No deliveries recorded.</p>
        )}
      </section>
      <section>
        <h2>Site conditions and issues</h2>
        <dl className="dr-doc-grid wide">
          <dt>Site observations</dt>
          <dd>{t(site.observations)}</dd>
          <dt>Issues encountered</dt>
          <dd>{t(site.issues)}</dd>
          <dt>Delays</dt>
          <dd>{t(site.delays)}</dd>
          <dt>Safety concerns</dt>
          <dd>{t(site.safety)}</dd>
          <dt>Corrective actions</dt>
          <dd>{t(site.corrective)}</dd>
          <dt>Recommendations</dt>
          <dd>{t(site.recommendations)}</dd>
        </dl>
      </section>
      <section>
        <h2>Photo documentation · {r.photos.length}</h2>
        {r.photos.length ? (
          <div className="dr-doc-photos">
            {r.photos.map((p) => (
              <figure key={p.fileId}>
                {photoSrc(p) ? (
                  <SecureImg src={photoSrc(p)} alt={p.description || p.fileName} />
                ) : (
                  <span className="dr-img-missing">{p.uploadStatus === 'uploaded' ? 'Image not available' : 'Not uploaded'}</span>
                )}
                <figcaption>
                  <b>{p.photoType}</b>
                  {p.description ? ` · ${p.description}` : ''}
                  {p.activityId ? <div className="dr-doc-sm">{r.activities.find((a) => a.activityId === p.activityId)?.name || p.activityId}</div> : null}
                </figcaption>
                {onPreparePhoto && p.uploadStatus === 'uploaded' && (
                  <button type="button" className="cv-btn sm dr-noprint" onClick={() => onPreparePhoto(p)}>
                    Prepare for Client Portal
                  </button>
                )}
              </figure>
            ))}
          </div>
        ) : (
          <p className="dr-np">No photographs attached.</p>
        )}
      </section>
      <section>
        <h2>Sign-off</h2>
        <dl className="dr-doc-grid">
          <dt>Prepared by</dt>
          <dd>{r.preparedBy}</dd>
          <dt>Reviewed by</dt>
          <dd>{r.review?.reviewedBy || 'Pending review'}</dd>
          <dt>Approval status</dt>
          <dd>{DR_STATUS_LABEL[r.status]}</dd>
          <dt>Review date</dt>
          <dd>{r.review?.reviewedAt ? fmtDate(r.review.reviewedAt.slice(0, 10)) : '—'}</dd>
          <dt>Review remarks</dt>
          <dd>{t(r.review?.remarks)}</dd>
        </dl>
      </section>
      <footer className="dr-doc-f">
        Convengers Bahay Build · Daily Construction Report {r.reference} · Generated {fmtDate(new Date().toISOString().slice(0, 10))}
      </footer>
    </article>
  );
};
