/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * File uploads to Firebase Storage (bucket from firebase-applet-config.json).
 * Access is enforced by storage.rules on the server:
 *   documents/**  — internal roles only
 *   portal/**     — internal roles + external portal roles (approved photos)
 * If Storage is not enabled or the rules are not deployed, the upload fails
 * with a clear message and the user can attach a link instead.
 */

import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { app } from './config.ts';

const MAX_BYTES = 25 * 1024 * 1024;

export async function uploadFile(folder: 'documents' | 'portal', file: File): Promise<{ url: string; storagePath: string; size: number; contentType: string }> {
  if (file.size > MAX_BYTES) throw new Error('File is larger than 25 MB. Compress it or attach a link instead.');
  const safe = file.name.replace(/[^\w.\-]+/g, '_').slice(-80);
  const storagePath = `${folder}/${new Date().toISOString().slice(0, 10)}/${Date.now()}_${safe}`;
  try {
    const storage = getStorage(app);
    const r = ref(storage, storagePath);
    await uploadBytes(r, file, { contentType: file.type || 'application/octet-stream' });
    const url = await getDownloadURL(r);
    return { url, storagePath, size: file.size, contentType: file.type };
  } catch (err: any) {
    const code = err?.code || '';
    if (code === 'storage/unauthorized') throw new Error('Upload not permitted: deploy storage.rules (see docs) or attach a link instead.');
    if (code === 'storage/unknown' || code === 'storage/bucket-not-found' || code === 'storage/project-not-found')
      throw new Error('Firebase Storage is not enabled for this project yet. Attach a link instead.');
    throw new Error(`Upload failed (${code || err?.message || 'network'}). Attach a link instead.`);
  }
}

export async function deleteStoredFile(storagePath?: string): Promise<void> {
  if (!storagePath) return;
  try {
    await deleteObject(ref(getStorage(app), storagePath));
  } catch {
    // file may already be gone; record removal still proceeds
  }
}
