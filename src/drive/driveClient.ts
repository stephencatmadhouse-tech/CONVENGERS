/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Browser side of the Google Drive file service. The browser never sees any
 * Google credential: it sends files to /api/drive/* with the user's Firebase
 * ID token; the server verifies the user and role, stores the file in Google
 * Drive and writes the metadata to Firestore (`driveFiles`).
 */

import { doc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../firebase/config.ts';
import type { DriveFile, DriveFolderKey } from '../types/index.ts';

export const DRIVE_FILE_PREFIX = '/api/drive/file/';
export const driveFileUrl = (fileId: string) => `${DRIVE_FILE_PREFIX}${encodeURIComponent(fileId)}`;
export const isDriveUrl = (u?: string) => !!u && u.startsWith(DRIVE_FILE_PREFIX);
export const driveIdFromUrl = (u: string) => decodeURIComponent(u.slice(DRIVE_FILE_PREFIX.length));

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const DOC_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
];
export const MAX_INPUT_MB = 25;
/** Kept below the 4.5 MB request limit of serverless hosting. */
export const MAX_UPLOAD_MB = 4;

export function newFileId(): string {
  const r =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().replace(/-/g, '') : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `F${r.slice(0, 23)}`;
}

/** Sensible validation before any upload. Returns an error message or null. */
export function validateFile(file: File, imagesOnly = false): string | null {
  const type = (file.type || '').toLowerCase();
  const okType = IMAGE_TYPES.includes(type) || (!imagesOnly && DOC_TYPES.includes(type));
  if (!okType) return imagesOnly ? `${file.name}: choose a JPEG, PNG, WebP or HEIC photo.` : `${file.name}: this file type is not accepted.`;
  if (file.size > MAX_INPUT_MB * 1024 * 1024) return `${file.name}: larger than ${MAX_INPUT_MB} MB.`;
  if (!file.size) return `${file.name}: the file is empty.`;
  return null;
}

/**
 * Resize / compress photos for construction documentation: longest side up to
 * 2400 px, JPEG quality 0.85 (lowered only if needed to stay under the upload
 * limit). Small photos and formats the browser cannot decode are kept as-is.
 */
export async function preparePhoto(file: File): Promise<File> {
  const type = (file.type || '').toLowerCase();
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(type)) return file;
  if (file.size <= 1.2 * 1024 * 1024) return file;
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file);
  } catch {
    return file;
  }
  for (const [maxSide, quality] of [
    [2400, 0.85],
    [2000, 0.8],
    [1600, 0.75],
  ] as const) {
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale);
    const h = Math.round(bmp.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bmp, 0, 0, w, h);
    const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', quality));
    if (blob && blob.size <= MAX_UPLOAD_MB * 1024 * 1024) {
      const name = file.name.replace(/\.(png|webp|jpe?g)$/i, '') + '.jpg';
      return new File([blob], name, {
        type: 'image/jpeg',
        lastModified: file.lastModified,
      });
    }
  }
  return file;
}

async function idToken(): Promise<string> {
  const u = auth.currentUser;
  if (!u) throw new Error('Sign in again to upload files.');
  return u.getIdToken();
}

export interface UploadMeta {
  fileId: string;
  folderKey: DriveFolderKey;
  reportingDate: string;
  kind?: 'photo' | 'document' | 'illustration';
  category?: string;
  photoType?: string;
  activityId?: string;
  reportId?: string;
  description?: string;
  subfolder?: string;
  publish?: boolean;
}

export interface UploadResult {
  file?: DriveFile;
  /** false = stored in Google Drive but the Firestore record still needs to be completed (queued for retry). */
  recorded: boolean;
  deduplicated?: boolean;
}

const PENDING_KEY = 'bb_drive_pending_records';
function readPending(): string[] {
  try {
    return JSON.parse(localStorage.getItem(PENDING_KEY) || '[]');
  } catch {
    return [];
  }
}
function writePending(ids: string[]) {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify([...new Set(ids)]));
  } catch {
    // storage unavailable
  }
}

/** Upload one file to Google Drive through the server, reporting progress (0–1). */
export async function uploadToDrive(file: File, meta: UploadMeta, onProgress?: (p: number) => void): Promise<UploadResult> {
  const token = await idToken();
  const body = file.type.startsWith('image/') && meta.kind !== 'illustration' ? await preparePhoto(file) : file;
  if (body.size > MAX_UPLOAD_MB * 1024 * 1024) throw new Error(`${file.name}: still larger than ${MAX_UPLOAD_MB} MB after compression.`);
  const header = btoa(
    unescape(
      encodeURIComponent(
        JSON.stringify({
          ...meta,
          fileName: body.name || file.name,
          mimeType: body.type || file.type,
          kind: meta.kind || (file.type.startsWith('image/') ? 'photo' : 'document'),
        }),
      ),
    ),
  );
  const res = await new Promise<{ status: number; json: any }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/drive/upload');
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.setRequestHeader('Content-Type', body.type || 'application/octet-stream');
    xhr.setRequestHeader('X-Upload-Meta', header);
    xhr.timeout = 120000;
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.min(0.97, e.loaded / e.total));
    xhr.onload = () => {
      let json: any = {};
      try {
        json = JSON.parse(xhr.responseText || '{}');
      } catch {
        json = {
          error: xhr.status === 404 ? 'The file storage service is not available on this server.' : `Unexpected response (${xhr.status}).`,
        };
      }
      resolve({ status: xhr.status, json });
    };
    xhr.onerror = () => reject(new Error('No connection to the file storage service.'));
    xhr.ontimeout = () => reject(new Error('The upload timed out.'));
    xhr.send(body);
  });
  if (res.status === 202 && res.json?.recorded === false) {
    writePending([...readPending(), meta.fileId]);
    onProgress?.(1);
    return { recorded: false };
  }
  if (res.status < 200 || res.status >= 300 || !res.json?.ok) throw new Error(res.json?.error || `Upload failed (${res.status}).`);
  onProgress?.(1);
  return {
    file: res.json.file as DriveFile,
    recorded: true,
    deduplicated: !!res.json.deduplicated,
  };
}

/** True while a file is in Google Drive but its database record is still waiting to be saved. */
export const isRecordPending = (fileId: string) => readPending().includes(fileId);

// Recover file references left from an earlier session as soon as a user is signed in
let recoveryStarted = false;
auth.onAuthStateChanged((u) => {
  if (u && !recoveryStarted && readPending().length) {
    recoveryStarted = true;
    void finishPendingRecords().finally(() => (recoveryStarted = false));
  }
});

/** Complete Firestore records for files that reached Google Drive while the database write failed. */
export async function finishPendingRecords(): Promise<number> {
  const ids = readPending();
  if (!ids.length || !auth.currentUser) return 0;
  const left: string[] = [];
  let done = 0;
  for (const fileId of ids) {
    try {
      const r = await fetch('/api/drive/record', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${await idToken()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fileId }),
      });
      if (r.ok) done++;
      else if (r.status !== 404) left.push(fileId);
    } catch {
      left.push(fileId);
    }
  }
  writePending(left);
  return done;
}

export async function driveStatus(check = false): Promise<{
  configured: boolean;
  rootAccessible?: boolean;
  rootName?: string;
  error?: string;
  mode?: string | null;
} | null> {
  try {
    const headers: Record<string, string> = {};
    if (check && auth.currentUser) headers.Authorization = `Bearer ${await auth.currentUser.getIdToken()}`;
    const r = await fetch(`/api/drive/status${check ? '?check=1' : ''}`, {
      headers,
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

export async function reconcileDrive(): Promise<{
  scanned: number;
  repaired: number;
  created: number;
  markedFailed: number;
}> {
  const r = await fetch('/api/drive/reconcile', {
    method: 'POST',
    headers: { Authorization: `Bearer ${await idToken()}` },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Recovery failed (${r.status}).`);
  return j;
}

// ---------------- Secure viewing ----------------
const blobCache = new Map<string, Promise<string>>();

/** Object URL for a Drive file: published files load directly; internal files are fetched with the user's token. */
export function driveObjectUrl(fileIdOrUrl: string): Promise<string> {
  const id = isDriveUrl(fileIdOrUrl) ? driveIdFromUrl(fileIdOrUrl) : fileIdOrUrl;
  let p = blobCache.get(id);
  if (!p) {
    p = (async () => {
      const headers: Record<string, string> = {};
      if (auth.currentUser) headers.Authorization = `Bearer ${await auth.currentUser.getIdToken()}`;
      const r = await fetch(driveFileUrl(id), { headers });
      if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? 'You do not have access to this file.' : 'File not available.');
      return URL.createObjectURL(await r.blob());
    })();
    p.catch(() => blobCache.delete(id));
    blobCache.set(id, p);
  }
  return p;
}

export async function openDriveFile(url: string) {
  const w = window.open('', '_blank');
  try {
    const obj = await driveObjectUrl(url);
    if (w) w.location.href = obj;
    else window.location.href = obj;
  } catch (e) {
    w?.close();
    alert(e instanceof Error ? e.message : 'Could not open the file.');
  }
}

/** Manager-only (server rules): mark a Drive file published / internal for the client portal. */
export async function setDrivePublication(fileId: string, published: boolean, by: string) {
  await updateDoc(doc(db, 'driveFiles', fileId), {
    publicationStatus: published ? 'published' : 'internal',
    publishedAt: published ? new Date().toISOString() : null,
    publishedBy: published ? by : null,
  });
}
