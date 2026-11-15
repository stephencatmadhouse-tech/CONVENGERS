/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Narrative report wording service (/api/narrative/*).
 *
 *   GET  /api/narrative/status  → { ai: boolean, model }        (signed-in internal users)
 *   POST /api/narrative/ai      → reword factual sections         (internal staff)
 *
 * The browser sends the factual sections it built from the project records.
 * Gemini only improves the wording. Every reworded section is checked by
 * checkAiSection(); any section that adds a figure, date, quantity word or a
 * name that is not in the factual text is rejected and the factual text kept.
 * The API key stays on the server (GEMINI_API_KEY); it is never sent to browsers.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { GoogleGenAI } from '@google/genai';
import { driveEnv } from '../drive/config.ts';
import { verifyCaller } from '../drive/admin.ts';
import { checkAiSection } from '../../src/domain/narrativeGuard.ts';

const MODEL = () => (process.env.GEMINI_MODEL || '').trim() || 'gemini-2.5-flash';
const KEY = () => (process.env.GEMINI_API_KEY || '').trim();

function send(res: ServerResponse, status: number, body: unknown) {
  if (res.headersSent) return;
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage, limit = 256 * 1024): Promise<any> {
  const pre = (req as any).body;
  if (pre && typeof pre === 'object' && !Buffer.isBuffer(pre)) return pre;
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    const b = Buffer.isBuffer(c) ? c : Buffer.from(c);
    size += b.length;
    if (size > limit) throw Object.assign(new Error('Request is too large.'), { status: 413 });
    chunks.push(b);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    return {};
  }
}

export const SYSTEM_INSTRUCTION = `You edit construction progress reports for a residential building project.
You receive report sections as JSON. Each section was written from verified project records.
Rewrite each section in formal, professional construction-report English:
- chronological, concise, not repetitive;
- clearly distinguish completed work from ongoing work;
- state delays and behind-schedule items plainly.
STRICT RULES:
- Use ONLY the facts in the section text. Do not add, infer, estimate or round any activity, quantity, date, percentage, headcount, name, supplier, location or accomplishment.
- Keep every number, date and percentage exactly as written. Do not write numbers as words.
- Keep the words "Not Recorded" wherever they appear.
- Do not describe photographs as evidence of progress.
- Do not add recommendations, conclusions or opinions that are not in the text.
- Keep reference numbers (e.g. DCR-...) unchanged.
Return JSON only: {"sections":[{"key":"<same key>","text":"<rewritten text>"}]}. Use blank lines between paragraphs.`;

interface InSection {
  key: string;
  title: string;
  text: string;
}

export async function handleNarrativeRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL((req as any).originalUrl || req.url || '/', 'http://x');
  const p = url.pathname.replace(/\/+$/, '');
  try {
    const caller = await verifyCaller(driveEnv(), req.headers.authorization);
    if (!caller) return send(res, 401, { error: 'Sign in required.' });
    if (!caller.internal || !caller.active) return send(res, 403, { error: 'Not permitted.' });

    if (req.method === 'GET' && p === '/api/narrative/status') return send(res, 200, { ai: !!KEY(), model: KEY() ? MODEL() : null });

    if (req.method === 'POST' && p === '/api/narrative/ai') {
      if (!caller.staff) return send(res, 403, { error: 'Only project staff can generate reports.' });
      if (!KEY()) return send(res, 503, { error: 'AI wording is not configured on the server (GEMINI_API_KEY).', code: 'not_configured' });
      const body = await readJson(req);
      const sections: InSection[] = Array.isArray(body.sections)
        ? body.sections
            .filter((s: any) => s && typeof s.key === 'string' && typeof s.text === 'string')
            .slice(0, 12)
            .map((s: any) => ({ key: String(s.key).slice(0, 40), title: String(s.title || '').slice(0, 120), text: String(s.text).slice(0, 12000) }))
        : [];
      if (!sections.length) return send(res, 400, { error: 'No sections to reword.' });
      const reportType = String(body.reportType || 'Construction report').slice(0, 80);
      const period = String(body.period || '').slice(0, 80);

      const ai = new GoogleGenAI({ apiKey: KEY(), ...(process.env.GEMINI_API_BASE ? { httpOptions: { baseUrl: process.env.GEMINI_API_BASE } } : {}) });
      let parsed: { sections?: { key: string; text: string }[] } = {};
      try {
        const r = await ai.models.generateContent({
          model: MODEL(),
          contents: JSON.stringify({ reportType, period, sections }),
          config: { systemInstruction: SYSTEM_INSTRUCTION, responseMimeType: 'application/json', temperature: 0.2 },
        });
        parsed = JSON.parse(r.text || '{}');
      } catch (e) {
        console.error('[narrative] AI request failed', e instanceof Error ? e.message : e);
        return send(res, 502, { error: 'The AI service did not respond. The factual draft is unchanged.' });
      }
      const byKey = new Map((parsed.sections || []).filter((s) => s && typeof s.key === 'string').map((s) => [s.key, String(s.text || '')]));
      const out = sections.map((s) => {
        const candidate = byKey.get(s.key);
        if (candidate === undefined) return { key: s.key, text: s.text, accepted: false, reason: 'not returned' };
        const check = checkAiSection(s.text, candidate);
        return check.ok ? { key: s.key, text: candidate.trim(), accepted: true } : { key: s.key, text: s.text, accepted: false, reason: check.reason };
      });
      return send(res, 200, { model: MODEL(), sections: out });
    }
    send(res, 404, { error: 'Not found' });
  } catch (e: any) {
    if (!e?.status) console.error('[narrative]', e);
    send(res, e?.status || 500, { error: e instanceof Error ? e.message : 'Unexpected error' });
  }
}
