/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Browser side of the narrative service: shared data sources, report
 * generation (factual draft + optional AI wording) and scheduled preparation.
 */

import { useEffect, useMemo, useRef } from 'react';
import { auth } from '../firebase/config.ts';
import { useStore } from '../firebase/useStore.ts';
import { dailyReportStore, manpowerStore, procurementStore, eventStore, driveFileStore, documentStore, narrativeStore, narrativeConfigStore } from '../firebase/opsStores.ts';
import { useCommand } from './context.tsx';
import {
  NARRATIVE_TYPES,
  collectFacts,
  composeSections,
  duePeriods,
  figures,
  narrativeId,
  narrativeReference,
  periodText,
  type NarrativeReport,
  type NarrativeRequest,
  type NarrativeSchedule,
  type NarrativeSection,
  type NarrativeSources,
  type NarrativeType,
} from '../domain/narrative.ts';
import type { User } from '../types/index.ts';
import { addDays, monthRange, weekRange } from '../domain/dates.ts';
import { VERIFIED_DR } from '../domain/dailyCompliance.ts';

const nowIso = () => new Date().toISOString();

async function authHeaders(): Promise<Record<string, string>> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (auth.currentUser) h.Authorization = `Bearer ${await auth.currentUser.getIdToken()}`;
  return h;
}

/** Whether AI wording is configured on the server (null = service unreachable). */
export async function narrativeAiStatus(): Promise<{ ai: boolean; model: string | null } | null> {
  try {
    const r = await fetch('/api/narrative/status', { headers: await authHeaders() });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

export interface AiResult {
  ok: boolean;
  error?: string;
  model?: string;
  sections: NarrativeSection[];
  rejected: { key: string; title: string; reason: string }[];
  accepted: number;
}

/** Ask the server to improve the wording. Sections it rejects keep the text sent. */
export async function aiReword(sections: NarrativeSection[], reportType: string, period: string): Promise<AiResult> {
  try {
    const r = await fetch('/api/narrative/ai', { method: 'POST', headers: await authHeaders(), body: JSON.stringify({ reportType, period, sections }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: j.error || `AI wording failed (${r.status}).`, sections, rejected: [], accepted: 0 };
    const byKey = new Map<string, { text: string; accepted: boolean; reason?: string }>((j.sections || []).map((s: any) => [s.key, s]));
    const rejected: AiResult['rejected'] = [];
    let accepted = 0;
    const out = sections.map((s) => {
      const res = byKey.get(s.key);
      if (res?.accepted) {
        accepted++;
        return { ...s, text: res.text };
      }
      rejected.push({ key: s.key, title: s.title, reason: res?.reason || 'not returned' });
      return s;
    });
    return { ok: true, model: j.model, sections: out, rejected, accepted };
  } catch {
    return { ok: false, error: 'The AI service cannot be reached. The factual draft is unchanged.', sections, rejected: [], accepted: 0 };
  }
}

/** Everything the generator reads, from the live stores. */
export function useNarrativeSources(): { sources: NarrativeSources; loaded: boolean } {
  const { register, data, issues, snapshots, today } = useCommand();
  const dr = useStore(dailyReportStore);
  const mp = useStore(manpowerStore);
  const pr = useStore(procurementStore);
  const ev = useStore(eventStore);
  const df = useStore(driveFileStore);
  const dc = useStore(documentStore);
  const nr = useStore(narrativeStore);
  const sched = useNarrativeSchedule();
  const sources = useMemo<NarrativeSources>(
    () => ({
      register,
      milestones: data.milestones,
      issues,
      snapshots,
      dailyReports: dr.items,
      manpower: mp.items,
      procurement: pr.items,
      events: ev.items,
      driveFiles: df.items,
      documents: dc.items,
      narratives: nr.items,
      today,
      reporter: sched.dailyReporter || null,
    }),
    [register, data.milestones, issues, snapshots, dr.items, mp.items, pr.items, ev.items, df.items, dc.items, nr.items, today, sched.dailyReporter]
  );
  return { sources, loaded: dr.loaded && mp.loaded && pr.loaded && ev.loaded && df.loaded && dc.loaded && nr.loaded };
}

/** Build a new report record (status Draft) from the records; never submits or approves. */
export function buildReport(req: NarrativeRequest, src: NarrativeSources, user: User, opts: { scheduled?: boolean; ai?: AiResult } = {}): NarrativeReport {
  const facts = collectFacts(req, src);
  const factual = composeSections(facts);
  const sections = opts.ai?.ok ? opts.ai.sections : factual;
  const id = narrativeId(req.type, req.start, req.end, facts.subject?.id);
  const at = nowIso();
  const t = NARRATIVE_TYPES[req.type];
  return {
    id,
    reference: narrativeReference(id),
    type: req.type,
    title: facts.subject ? `${t.label} — ${facts.subject.name}` : t.label,
    periodStart: req.start,
    periodEnd: req.end,
    subjectId: facts.subject?.id,
    subjectName: facts.subject?.name,
    status: 'draft',
    preparedBy: user.name,
    preparedById: user.id,
    sections,
    original: {
      sections,
      factual,
      engine: opts.ai?.ok && opts.ai.accepted > 0 ? 'ai' : 'records',
      ...(opts.ai?.ok && opts.ai.model ? { model: opts.ai.model } : {}),
      ...(opts.ai?.ok && opts.ai.rejected.length ? { aiRejected: opts.ai.rejected.map((r) => `${r.title}: ${r.reason}`) } : {}),
      generatedAt: at,
      generatedBy: user.name,
    },
    photos: facts.photos,
    attachments: facts.attachments,
    figures: figures(facts),
    sources: {
      dailyReports: facts.reports.map((d) => d.id),
      activities: [...new Set([...facts.completed, ...facts.ongoing, ...facts.delayed].map((r) => r.id))].slice(0, 300),
      issues: [...new Set([...facts.issuesRaised, ...facts.issuesOpen, ...facts.issuesResolved].map((i) => i.id))],
      ...(facts.previous ? { previous: facts.previous.id } : {}),
      ...(facts.weeks.length ? { weekly: facts.weeks.filter((w) => w.report).map((w) => w.report!.id) } : {}),
    },
    sourceStamp: facts.sourceStamp,
    ...(opts.scheduled ? { scheduled: true } : {}),
    revisions: [{ at, by: user.name, action: opts.scheduled ? 'Prepared automatically (schedule)' : 'Generated from project records', sections }],
    createdAt: at,
    updatedAt: at,
    updatedBy: user.name,
  };
}

export const DEFAULT_SCHEDULE: NarrativeSchedule = { id: 'schedule', daily: false, weekly: true, monthly: true };

export function useNarrativeSchedule(): NarrativeSchedule {
  const cfg = useStore(narrativeConfigStore);
  return cfg.items.find((c) => c.id === 'schedule') || DEFAULT_SCHEDULE;
}

/** Rebuild a draft's text from the current records (used by the automatic update and by Refresh from Records). */
export function refreshedReport(r: NarrativeReport, src: NarrativeSources, by: string, action: string): NarrativeReport {
  const facts = collectFacts({ type: r.type, start: r.periodStart, end: r.periodEnd, subjectId: r.subjectId }, { ...src, narratives: src.narratives.filter((n) => n.id !== r.id) });
  const sections = composeSections(facts);
  const have = new Set(r.photos.map((p) => p.fileId));
  const at = new Date().toISOString();
  return {
    ...r,
    sections,
    figures: figures(facts),
    photos: [...r.photos, ...facts.photos.filter((p) => !have.has(p.fileId))].sort((a, b) => a.date.localeCompare(b.date)),
    sources: {
      ...r.sources,
      dailyReports: facts.reports.map((d) => d.id),
      ...(facts.weeks.length ? { weekly: facts.weeks.filter((w) => w.report).map((w) => w.report!.id) } : {}),
    },
    sourceStamp: facts.sourceStamp,
    manualEdits: false,
    revisions: [...r.revisions, { at, by, action, sections }].slice(-200),
    updatedAt: at,
    updatedBy: by,
  };
}

/** Current source marker for a report (daily reports, and weekly reports for a monthly report). */
export function currentStamp(r: NarrativeReport, src: NarrativeSources): string {
  return collectFacts({ type: r.type, start: r.periodStart, end: r.periodEnd, subjectId: r.subjectId }, { ...src, narratives: src.narratives.filter((n) => n.id !== r.id) }).sourceStamp;
}

const AUTO_TYPES = ['daily', 'weekly', 'monthly'] as const;

/**
 * Daily → weekly → monthly automation (runs for staff while the app is open):
 *  1. the last complete day / week / month (as enabled) is prepared as a draft;
 *  2. the current week and month are prepared as drafts as soon as a submitted
 *     Daily Construction Report exists for them (the current day, when daily is on);
 *  3. a draft nobody has edited is rebuilt whenever its daily reports change
 *     (submitted, approved, edited) — and a monthly draft whenever one of its
 *     weekly reports changes. Edited drafts are never overwritten (the editor
 *     offers Refresh from Records instead); reports under review, approved or
 *     final are never changed. Nothing is submitted or approved automatically.
 */
export function useAutoPrepare() {
  const { user, canEdit, today } = useCommand();
  const { sources, loaded } = useNarrativeSources();
  const sched = useNarrativeSchedule();
  const cfg = useStore(narrativeConfigStore);
  const tried = useRef(new Set<string>());
  useEffect(() => {
    if (!canEdit || !loaded || !cfg.loaded) return;
    const exists = (id: string) => sources.narratives.some((n) => n.id === id);
    const verifiedIn = (s: string, e: string) => sources.dailyReports.some((d) => d.date >= s && d.date <= e && VERIFIED_DR.includes(d.status));
    const prepare = (type: NarrativeType, start: string, end: string) => {
      const id = narrativeId(type, start, end);
      if (tried.current.has(id) || exists(id)) return;
      tried.current.add(id);
      void narrativeStore.put(buildReport({ type, start, end }, sources, user, { scheduled: true })).catch(() => undefined);
    };
    // 1. last complete periods
    duePeriods(sched, today).forEach((p) => prepare(p.type, p.start, p.end));
    // 2. current periods, once daily reports exist
    if (sched.daily) for (let i = 0; i <= 6; i++) {
      const d = addDays(today, -i);
      if (verifiedIn(d, d)) prepare('daily', d, d);
    }
    if (sched.weekly) {
      const w = weekRange(today);
      if (verifiedIn(w.start, w.end)) prepare('weekly', w.start, w.end);
    }
    if (sched.monthly) {
      const m = monthRange(today);
      if (verifiedIn(m.start, m.end)) prepare('monthly', m.start, m.end);
    }
    // 3. keep untouched drafts up to date (weekly before monthly, so the month sees the new week)
    const order = { daily: 0, weekly: 1, monthly: 2 } as Record<string, number>;
    sources.narratives
      .filter((n) => n.status === 'draft' && !n.manualEdits && !n.subjectId && !n.localOnly && (AUTO_TYPES as readonly string[]).includes(n.type))
      .sort((a, b) => order[a.type] - order[b.type])
      .forEach((n) => {
        const stamp = currentStamp(n, sources);
        if (stamp === n.sourceStamp) return;
        const key = `${n.id}:${stamp}`;
        if (tried.current.has(key)) return;
        tried.current.add(key);
        const what = n.type === 'monthly' ? 'daily or weekly reports changed' : 'daily reports changed';
        void narrativeStore.put(refreshedReport(n, sources, user.name, `Updated automatically (${what})`)).catch(() => undefined);
      });
  }, [canEdit, loaded, cfg.loaded, sched, today, sources, user]);
}

export const periodLabel = (r: Pick<NarrativeReport, 'type' | 'periodStart' | 'periodEnd'>) => periodText(r.type, r.periodStart, r.periodEnd);
