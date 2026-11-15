/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Vercel serverless entry point (vercel.json rewrites /api/* here).
 * Serves the Google Drive file service; credentials stay in server env vars.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleDriveRequest } from '../server/drive/handler.ts';

export const config = { api: { bodyParser: false } };

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const url = req.url || '';
  if (url.startsWith('/api/drive/')) return handleDriveRequest(req, res);
  res.statusCode = 404;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ error: 'Not found' }));
}
