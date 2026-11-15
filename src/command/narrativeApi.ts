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
} from '../domain/narrative.ts';
import type { User } from '../types/index.ts';

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
    }),
    [register, data.milestones, issues, snapshots, dr.items, mp.items, pr.items, ev.items, df.items, dc.items, nr.items, today]
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
    },
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

/**
 * Scheduled preparation: when a staff member opens the app, any due report
 * (last complete day / week / month, as enabled) that does not exist yet is
 * prepared as a Draft from the records. It is never submitted or approved.
 */
export function useAutoPrepare() {
  const { user, canEdit, today } = useCommand();
  const { sources, loaded } = useNarrativeSources();
  const sched = useNarrativeSchedule();
  const cfg = useStore(narrativeConfigStore);
  const tried = useRef(new Set<string>());
  useEffect(() => {
    if (!canEdit || !loaded || !cfg.loaded) return;
    duePeriods(sched, today).forEach((p) => {
      const id = narrativeId(p.type, p.start, p.end);
      if (tried.current.has(id) || sources.narratives.some((n) => n.id === id)) return;
      tried.current.add(id);
      const rec = buildReport({ type: p.type, start: p.start, end: p.end }, sources, user, { scheduled: true });
      void narrativeStore.put(rec).catch(() => undefined);
    });
  }, [canEdit, loaded, cfg.loaded, sched, today, sources, user]);
}

export const periodLabel = (r: Pick<NarrativeReport, 'type' | 'periodStart' | 'periodEnd'>) => periodText(r.type, r.periodStart, r.periodEnd);
