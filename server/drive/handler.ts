/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * GOOGLE DRIVE FILE SERVICE — HTTP handler (framework-agnostic: mounted in
 * server.ts for Express / Cloud Run and exported as a Vercel function in
 * api/index.ts).
 *
 *   GET  /api/drive/status          configuration check (no secrets)
 *   POST /api/drive/upload          upload one file (raw body + X-Upload-Meta)
 *   GET  /api/drive/file/:fileId    stream a file (internal users; public only when published)
 *   POST /api/drive/record          finish metadata after a Drive-success / Firestore-failure
 *   POST /api/drive/reconcile       managers: repair metadata from Drive (recovery)
 *
 * Firestore `driveFiles/{fileId}` holds the metadata and the Drive file ID;
 * binaries live only in Google Drive. Every Drive file carries the app's file
 * ID in its appProperties, so an upload can always be matched back to its
 * record (no orphaned files, no duplicate uploads on retry).
 */

import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { FieldValue } from 'firebase-admin/firestore';
import { driveEnv, folderPath, safeName, ALLOWED_TYPES, DEFAULT_FOLDERS, type FolderKey, type FolderSettings } from './config.ts';
import { DriveApi, DriveError } from './driveApi.ts';
import { adminDb, verifyCaller, type Caller } from './admin.ts';

const PROJECT_ID = 'bahay-build';
const PROJECT_NAME = 'Convengers Bahay Build';
const FOLDER_KEYS: FolderKey[] = ['photos', 'daily', 'weekly', 'monthly', 'site', 'supporting'];

function send(res: ServerResponse, status: number, body: unknown) {
  if (res.headersSent) return;
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  const pre = (req as any).body;
  if (Buffer.isBuffer(pre)) return pre;
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    const b = Buffer.isBuffer(c) ? c : Buffer.from(c);
    size += b.length;
    if (size > limit) throw Object.assign(new Error('File is too large.'), { status: 413 });
    chunks.push(b);
  }
  return Buffer.concat(chunks);
}

async function readJson(req: IncomingMessage): Promise<any> {
  const pre = (req as any).body;
  if (pre && typeof pre === 'object' && !Buffer.isBuffer(pre)) return pre;
  const buf = await readBody(req, 1024 * 64);
  try {
    return JSON.parse(buf.toString('utf8') || '{}');
  } catch {
    return {};
  }
}

const isIso = (s: unknown) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const isId = (s: unknown) => typeof s === 'string' && /^[A-Za-z0-9_-]{8,80}$/.test(s);

// In-process lock so simultaneous uploads do not create the same month folder twice
const folderLocks = new Map<string, Promise<string>>();

async function settings(): Promise<FolderSettings> {
  const env = driveEnv();
  const snap = await adminDb(env).collection('driveConfig').doc('settings').get();
  const s = (snap.exists ? snap.data() : {}) as Partial<FolderSettings>;
  return {
    projectRecords: safeName(s.projectRecords || '') || DEFAULT_FOLDERS.projectRecords,
    projectFolder: safeName(s.projectFolder || '') || DEFAULT_FOLDERS.projectFolder,
    folders: { ...DEFAULT_FOLDERS.folders, ...(s.folders || {}) },
    monthly: Array.isArray(s.monthly) ? (s.monthly.filter((k) => FOLDER_KEYS.includes(k)) as FolderKey[]) : DEFAULT_FOLDERS.monthly,
  };
}

/** Resolve (find or create) a folder path below the root, caching folder IDs in Firestore. */
export async function ensureFolder(drive: DriveApi, rootId: string, segments: string[]): Promise<string> {
  const env = driveEnv();
  const cacheRef = adminDb(env).collection('driveConfig').doc('folders');
  const cache = ((await cacheRef.get()).data()?.paths || {}) as Record<string, string>;
  let parent = rootId;
  let key = '';
  for (const seg of segments) {
    key = key ? `${key}/${seg}` : seg;
    const cacheKey = `${rootId}:${key}`;
    if (cache[cacheKey]) {
      parent = cache[cacheKey];
      continue;
    }
    const parentNow = parent;
    let p = folderLocks.get(cacheKey);
    if (!p) {
      p = (async () => (await drive.findFolder(seg, parentNow)) || (await drive.createFolder(seg, parentNow)))();
      folderLocks.set(cacheKey, p);
    }
    try {
      parent = await p;
    } finally {
      folderLocks.delete(cacheKey);
    }
    cache[cacheKey] = parent;
    await cacheRef.set({ paths: { [cacheKey]: parent }, updatedAt: new Date().toISOString() }, { merge: true });
  }
  return parent;
}

async function clearFolderCache() {
  await adminDb(driveEnv()).collection('driveConfig').doc('folders').set({ paths: {}, updatedAt: new Date().toISOString() });
}

async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 250 * (i + 1)));
    }
  }
  throw last;
}

function publicFile(d: any) {
  const { sha256: _s, folderPathText: _p, ...rest } = d || {};
  return rest;
}

// ---------------- routes ----------------
async function status(req: IncomingMessage, res: ServerResponse) {
  const env = driveEnv();
  const out: any = {
    configured: !!env.mode && !!env.rootFolderId,
    mode: env.mode,
    rootFolder: !!env.rootFolderId,
  };
  const url = new URL((req as any).originalUrl || req.url || '/', 'http://x');
  if (url.searchParams.get('check')) {
    const caller = await verifyCaller(env, req.headers.authorization).catch(() => null);
    if (caller?.manager && !out.configured) {
      // Names only (never values), so an administrator can see which setting the server is missing
      const has = (k: string) => !!(process.env[k] || '').trim();
      const oauthKeys = ['GOOGLE_DRIVE_OAUTH_CLIENT_ID', 'GOOGLE_DRIVE_OAUTH_CLIENT_SECRET', 'GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN'];
      const missing: string[] = [];
      if (!env.mode) {
        if (has('GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON')) out.invalid = ['GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON'];
        else missing.push(...oauthKeys.filter((k) => !has(k)));
      }
      if (!env.rootFolderId) missing.push('GOOGLE_DRIVE_ROOT_FOLDER_ID');
      out.missing = missing;
    }
    if (caller?.manager && out.configured) {
      try {
        const f = await new DriveApi(env).getFolder(env.rootFolderId!);
        out.rootAccessible = !!f;
        out.rootName = f?.name;
      } catch (e) {
        out.rootAccessible = false;
        out.error = e instanceof Error ? e.message : String(e);
      }
    }
  }
  send(res, 200, out);
}

async function upload(req: IncomingMessage, res: ServerResponse) {
  const env = driveEnv();
  const caller = await verifyCaller(env, req.headers.authorization);
  if (!caller)
    return send(res, 401, {
      error: 'Sign in again to upload files.',
      code: 'unauthenticated',
    });
  if (!caller.staff)
    return send(res, 403, {
      error: 'Your role cannot upload project files.',
      code: 'forbidden',
    });
  if (!env.mode || !env.rootFolderId)
    return send(res, 503, {
      error: 'Google Drive storage is not configured on the server yet.',
      code: 'not_configured',
    });

  let meta: any;
  try {
    meta = JSON.parse(Buffer.from(String(req.headers['x-upload-meta'] || ''), 'base64').toString('utf8'));
  } catch {
    return send(res, 400, {
      error: 'Upload details are missing.',
      code: 'bad_meta',
    });
  }
  const fileId = meta.fileId;
  const mimeType = String(meta.mimeType || req.headers['content-type'] || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  const folderKey: FolderKey = FOLDER_KEYS.includes(meta.folderKey) ? meta.folderKey : 'photos';
  const reportingDate = isIso(meta.reportingDate) ? meta.reportingDate : new Date().toISOString().slice(0, 10);
  if (!isId(fileId)) return send(res, 400, { error: 'Invalid file reference.', code: 'bad_id' });
  if (!ALLOWED_TYPES.includes(mimeType))
    return send(res, 415, {
      error: `File type ${mimeType || 'unknown'} is not accepted.`,
      code: 'bad_type',
    });
  const publishNow = meta.publish === true && caller.manager && meta.kind === 'illustration';
  if (meta.kind === 'illustration' && !caller.manager)
    return send(res, 403, {
      error: 'Only managers upload construction journey illustrations.',
      code: 'forbidden',
    });

  let data: Buffer;
  try {
    data = await readBody(req, env.maxUploadBytes);
  } catch (e: any) {
    return send(res, e?.status || 400, {
      error: e?.message || 'Could not read the file.',
      code: 'too_large',
    });
  }
  if (!data.length) return send(res, 400, { error: 'The file is empty.', code: 'empty' });
  const sha256 = crypto.createHash('sha256').update(data).digest('hex');

  const db = adminDb(env);
  const ref = db.collection('driveFiles').doc(fileId);
  const existing = await ref.get();
  if (existing.exists) {
    const d: any = existing.data();
    if (d.uploadedById !== caller.uid && !caller.manager)
      return send(res, 409, {
        error: 'This file reference belongs to another upload.',
        code: 'conflict',
      });
    if (d.uploadStatus === 'uploaded')
      return send(res, 200, {
        ok: true,
        deduplicated: true,
        file: publicFile(d),
      });
  }
  // Same content already uploaded for the same report / activity → reuse it (no duplicate)
  const same = await db.collection('driveFiles').where('sha256', '==', sha256).limit(20).get();
  const dup = same.docs
    .map((x) => x.data() as any)
    .find((d) => d.uploadStatus === 'uploaded' && (d.reportId || '') === (meta.reportId || '') && (d.activityId || '') === (meta.activityId || ''));
  if (dup)
    return send(res, 200, {
      ok: true,
      deduplicated: true,
      file: publicFile(dup),
    });

  const now = new Date().toISOString();
  const name = safeName(meta.fileName || `${fileId}`) || fileId;
  const base: any = {
    id: fileId,
    projectId: PROJECT_ID,
    projectName: PROJECT_NAME,
    fileName: name,
    fileType: mimeType,
    fileSize: data.length,
    sha256,
    kind: ['photo', 'document', 'illustration'].includes(meta.kind) ? meta.kind : mimeType.startsWith('image/') ? 'photo' : 'document',
    reportingDate,
    category: safeName(meta.category || '') || null,
    photoType: safeName(meta.photoType || '') || null,
    activityId: isId(meta.activityId) || /^[A-Za-z]{2}-/.test(meta.activityId || '') ? String(meta.activityId).slice(0, 80) : null,
    reportId: isId(meta.reportId) ? meta.reportId : null,
    description: String(meta.description || '').slice(0, 1000),
    folderKey,
    uploadedBy: caller.name,
    uploadedById: caller.uid,
    uploadedAt: existing.exists ? (existing.data() as any).uploadedAt || now : now,
    updatedAt: now,
    uploadStatus: 'uploading',
    publicationStatus: publishNow ? 'published' : 'internal',
  };
  await ref.set(base, { merge: true });

  const drive = new DriveApi(env);
  let driveFile: {
    id: string;
    mimeType?: string;
    size?: string;
    parents?: string[];
  };
  let folderId = '';
  const rootId = env.rootFolderId;
  try {
    const s = await settings();
    const segments = folderPath(s, folderKey, reportingDate, meta.subfolder);
    // A previous attempt may have reached Drive already → reuse it instead of uploading twice
    const prior = (await drive.findByAppProperty('bbFileId', fileId))[0];
    const put = async () => {
      folderId = await ensureFolder(drive, rootId, segments);
      return drive.upload({
        name,
        parentId: folderId,
        mimeType,
        data,
        description: base.description || undefined,
        appProperties: {
          bbFileId: fileId,
          bbProject: PROJECT_ID,
          ...(base.reportId ? { bbReportId: base.reportId } : {}),
          ...(base.activityId ? { bbActivityId: base.activityId } : {}),
        },
      });
    };
    if (prior) {
      driveFile = prior;
      folderId = prior.parents?.[0] || (await ensureFolder(drive, rootId, segments));
    } else {
      try {
        driveFile = await put();
      } catch (e) {
        // A cached folder was deleted or moved in Drive: forget the cached IDs and resolve the path again once
        if (!(e instanceof DriveError) || e.status !== 404) throw e;
        await clearFolderCache();
        driveFile = await put();
      }
    }
    base.folderPathText = segments.join(' / ');
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await ref
      .set(
        {
          uploadStatus: 'failed',
          error: msg.slice(0, 300),
          updatedAt: new Date().toISOString(),
        },
        { merge: true },
      )
      .catch(() => undefined);
    return send(res, e instanceof DriveError ? e.status : 502, {
      error: msg,
      code: 'drive_failed',
    });
  }

  const done = {
    ...base,
    driveFileId: driveFile.id,
    folderId,
    uploadStatus: 'uploaded',
    uploadedToDriveAt: new Date().toISOString(),
    error: FieldValue.delete(),
  };
  try {
    await withRetry(() => ref.set(done, { merge: true }));
  } catch {
    // Drive has the file but the record could not be finished: tell the client how to recover
    return send(res, 202, {
      ok: true,
      recorded: false,
      fileId,
      driveFileId: driveFile.id,
      error: 'Uploaded to Google Drive; the file record will be completed on retry.',
    });
  }
  const { error: _e, ...clean } = done as any;
  send(res, 200, { ok: true, recorded: true, file: publicFile(clean) });
}

async function file(req: IncomingMessage, res: ServerResponse, fileId: string) {
  const env = driveEnv();
  if (!isId(fileId)) return send(res, 404, { error: 'Not found' });
  const snap = await adminDb(env).collection('driveFiles').doc(fileId).get();
  const d: any = snap.exists ? snap.data() : null;
  if (!d || d.uploadStatus !== 'uploaded' || !d.driveFileId) return send(res, 404, { error: 'File not found.' });
  const isPublic = d.publicationStatus === 'published';
  if (!isPublic) {
    const caller = await verifyCaller(env, req.headers.authorization);
    if (!caller?.internal)
      return send(res, caller ? 403 : 401, {
        error: 'This file is not published.',
      });
  }
  try {
    const r = await new DriveApi(env).media(d.driveFileId);
    res.statusCode = 200;
    res.setHeader('Content-Type', d.fileType || r.headers.get('content-type') || 'application/octet-stream');
    res.setHeader('Cache-Control', isPublic ? 'public, max-age=86400' : 'private, max-age=600');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(d.fileName || fileId)}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (r.body) Readable.fromWeb(r.body as any).pipe(res);
    else res.end();
  } catch (e) {
    send(res, e instanceof DriveError ? e.status : 502, {
      error: e instanceof Error ? e.message : 'Could not read the file from Google Drive.',
    });
  }
}

async function record(req: IncomingMessage, res: ServerResponse) {
  const env = driveEnv();
  const caller = await verifyCaller(env, req.headers.authorization);
  if (!caller?.staff) return send(res, caller ? 403 : 401, { error: 'Not allowed.' });
  const { fileId } = await readJson(req);
  if (!isId(fileId)) return send(res, 400, { error: 'Invalid file reference.' });
  const ref = adminDb(env).collection('driveFiles').doc(fileId);
  const snap = await ref.get();
  const d: any = snap.exists ? snap.data() : null;
  if (d && d.uploadedById !== caller.uid && !caller.manager) return send(res, 403, { error: 'Not allowed.' });
  if (d?.uploadStatus === 'uploaded') return send(res, 200, { ok: true, file: publicFile(d) });
  const found = (await new DriveApi(env).findByAppProperty('bbFileId', fileId))[0];
  if (!found)
    return send(res, 404, {
      error: 'The file is not in Google Drive — upload it again.',
      code: 'not_in_drive',
    });
  const done = {
    ...(d || {}),
    id: fileId,
    driveFileId: found.id,
    folderId: found.parents?.[0] || d?.folderId || null,
    uploadStatus: 'uploaded',
    updatedAt: new Date().toISOString(),
  };
  await withRetry(() => ref.set(done, { merge: true }));
  send(res, 200, { ok: true, file: publicFile(done) });
}

async function reconcile(req: IncomingMessage, res: ServerResponse) {
  const env = driveEnv();
  const caller = await verifyCaller(env, req.headers.authorization);
  if (!caller?.manager)
    return send(res, caller ? 403 : 401, {
      error: 'Only managers can run file recovery.',
    });
  if (!env.mode || !env.rootFolderId)
    return send(res, 503, {
      error: 'Google Drive storage is not configured on the server yet.',
    });
  const db = adminDb(env);
  const files = await new DriveApi(env).findByAppProperty('bbProject', PROJECT_ID);
  let repaired = 0;
  let created = 0;
  const seen = new Set<string>();
  for (const f of files) {
    const id = f.appProperties?.bbFileId;
    if (!isId(id)) continue;
    seen.add(id!);
    const ref = db.collection('driveFiles').doc(id!);
    const snap = await ref.get();
    const d: any = snap.exists ? snap.data() : null;
    if (d?.uploadStatus === 'uploaded' && d.driveFileId === f.id) continue;
    await ref.set(
      {
        id,
        projectId: PROJECT_ID,
        projectName: PROJECT_NAME,
        driveFileId: f.id,
        folderId: f.parents?.[0] || null,
        fileName: d?.fileName || f.name,
        fileType: d?.fileType || f.mimeType,
        fileSize: d?.fileSize || Number(f.size || 0),
        reportId: d?.reportId || f.appProperties?.bbReportId || null,
        activityId: d?.activityId || f.appProperties?.bbActivityId || null,
        uploadStatus: 'uploaded',
        publicationStatus: d?.publicationStatus || 'internal',
        recoveredAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );
    d ? repaired++ : created++;
  }
  // Records left "uploading" for over an hour with no Drive file are marked failed (the user can retry)
  const stale = await db.collection('driveFiles').where('uploadStatus', '==', 'uploading').get();
  let failed = 0;
  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  for (const s of stale.docs) {
    const d: any = s.data();
    if (!seen.has(s.id) && (d.updatedAt || '') < hourAgo) {
      await s.ref.set(
        {
          uploadStatus: 'failed',
          error: 'Upload did not complete — retry from the report.',
          updatedAt: new Date().toISOString(),
        },
        { merge: true },
      );
      failed++;
    }
  }
  send(res, 200, {
    ok: true,
    scanned: files.length,
    repaired,
    created,
    markedFailed: failed,
  });
}

/** Entry point for every /api/drive/* request. */
export async function handleDriveRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL((req as any).originalUrl || req.url || '/', 'http://x');
  const p = url.pathname.replace(/\/+$/, '');
  try {
    if (req.method === 'GET' && p === '/api/drive/status') return await status(req, res);
    if (req.method === 'POST' && p === '/api/drive/upload') return await upload(req, res);
    if (req.method === 'POST' && p === '/api/drive/record') return await record(req, res);
    if (req.method === 'POST' && p === '/api/drive/reconcile') return await reconcile(req, res);
    const m = /^\/api\/drive\/file\/([^/]+)$/.exec(p);
    if (req.method === 'GET' && m) return await file(req, res, decodeURIComponent(m[1]));
    send(res, 404, { error: 'Not found' });
  } catch (e) {
    console.error('[drive]', e);
    send(res, 500, {
      error: e instanceof Error ? e.message : 'Unexpected error',
    });
  }
}

export type { Caller };
