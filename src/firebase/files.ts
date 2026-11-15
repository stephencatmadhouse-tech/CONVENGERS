/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Project file uploads → GOOGLE DRIVE (via the server's Drive service).
 * Google Drive holds the binaries; Firestore (`driveFiles`) holds the file
 * metadata and the Drive file ID. Records created before the Drive
 * integration keep their Firebase Storage URLs and still open.
 *
 *   'documents' → 05 - SITE DOCUMENTATION (photos) / 06 - SUPPORTING DOCUMENTS (other files)
 *   'portal'    → 01 - CONSTRUCTION PHOTOGRAPHS (photos) / 06 - SUPPORTING DOCUMENTS (other files)
 */

import { getStorage, ref, deleteObject } from 'firebase/storage';
import { app } from './config.ts';
import { newFileId, uploadToDrive, driveFileUrl, validateFile, type UploadMeta } from '../drive/driveClient.ts';
import { todayIso } from '../domain/dates.ts';

export async function uploadFile(
  folder: 'documents' | 'portal',
  file: File,
  meta: Partial<UploadMeta> = {},
  onProgress?: (p: number) => void
): Promise<{ url: string; storagePath: string; size: number; contentType: string; fileId: string; recorded: boolean }> {
  const err = validateFile(file);
  if (err) throw new Error(err);
  const isImage = (file.type || '').startsWith('image/');
  const fileId = meta.fileId || newFileId();
  const res = await uploadToDrive(
    file,
    {
      fileId,
      folderKey: meta.folderKey || (isImage ? (folder === 'portal' ? 'photos' : 'site') : 'supporting'),
      reportingDate: meta.reportingDate || todayIso(),
      ...meta,
    },
    onProgress
  );
  const id = res.file?.id || fileId;
  return { url: driveFileUrl(id), storagePath: `drive:${id}`, size: res.file?.fileSize || file.size, contentType: res.file?.fileType || file.type, fileId: id, recorded: res.recorded };
}

/** Google Drive files are never deleted from the app (no accidental data loss); legacy Storage files can be. */
export async function deleteStoredFile(storagePath?: string): Promise<void> {
  if (!storagePath || storagePath.startsWith('drive:')) return;
  try {
    await deleteObject(ref(getStorage(app), storagePath));
  } catch {
    // file may already be gone; record removal still proceeds
  }
}
