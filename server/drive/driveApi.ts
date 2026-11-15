/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Minimal Google Drive v3 REST client (server only). Works with My Drive
 * folders and Shared Drives (supportsAllDrives). Files are never shared
 * publicly; the app streams them through its own authenticated endpoint.
 */

import { GoogleAuth, OAuth2Client } from "google-auth-library";
import type { DriveEnv } from "./config.ts";

const FOLDER = "application/vnd.google-apps.folder";
const ALL = "supportsAllDrives=true&includeItemsFromAllDrives=true";

export class DriveError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}

export class DriveApi {
  private tokenSource!: () => Promise<string>;
  constructor(private env: DriveEnv) {
    // Test hook: only honoured when DRIVE_API_BASE points at a non-Google test server
    if (
      process.env.DRIVE_TEST_ACCESS_TOKEN &&
      !/googleapis\.com/.test(env.apiBase)
    ) {
      const t = process.env.DRIVE_TEST_ACCESS_TOKEN;
      this.tokenSource = async () => t;
      return;
    }
    if (env.mode === "service_account") {
      const auth = new GoogleAuth({
        credentials: env.serviceAccount as any,
        scopes: ["https://www.googleapis.com/auth/drive"],
      });
      this.tokenSource = async () => {
        const t = await auth.getAccessToken();
        if (!t)
          throw new DriveError(
            "Google Drive authentication failed (service account).",
            503,
          );
        return t;
      };
    } else if (env.mode === "oauth" && env.oauth) {
      const client = new OAuth2Client(
        env.oauth.clientId,
        env.oauth.clientSecret,
      );
      client.setCredentials({ refresh_token: env.oauth.refreshToken });
      this.tokenSource = async () => {
        const t = (await client.getAccessToken()).token;
        if (!t)
          throw new DriveError(
            "Google Drive authentication failed (OAuth refresh token).",
            503,
          );
        return t;
      };
    } else {
      this.tokenSource = async () => {
        throw new DriveError(
          "Google Drive storage is not configured on the server.",
          503,
        );
      };
    }
  }

  private async call(url: string, init: RequestInit = {}): Promise<Response> {
    const token = await this.tokenSource();
    const res = await fetch(url, {
      ...init,
      headers: { ...(init.headers as any), Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      let msg = text;
      try {
        msg = JSON.parse(text)?.error?.message || text;
      } catch {
        // not JSON
      }
      throw new DriveError(
        `Google Drive error ${res.status}: ${msg.slice(0, 200)}`,
        res.status === 404 ? 404 : res.status === 403 ? 403 : 502,
      );
    }
    return res;
  }

  async getFolder(id: string): Promise<{ id: string; name: string } | null> {
    try {
      const r = await this.call(
        `${this.env.apiBase}/drive/v3/files/${encodeURIComponent(id)}?fields=id,name,mimeType,trashed&${ALL}`,
      );
      const j: any = await r.json();
      return j.mimeType === FOLDER && !j.trashed
        ? { id: j.id, name: j.name }
        : null;
    } catch (e) {
      if (e instanceof DriveError && e.status === 404) return null;
      throw e;
    }
  }

  async findFolder(name: string, parentId: string): Promise<string | null> {
    const q = `name = '${name.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType = '${FOLDER}' and trashed = false`;
    const r = await this.call(
      `${this.env.apiBase}/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=10&${ALL}`,
    );
    const j: any = await r.json();
    return j.files?.[0]?.id || null;
  }

  async createFolder(name: string, parentId: string): Promise<string> {
    const r = await this.call(
      `${this.env.apiBase}/drive/v3/files?fields=id&supportsAllDrives=true`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, mimeType: FOLDER, parents: [parentId] }),
      },
    );
    return ((await r.json()) as any).id;
  }

  async upload(opts: {
    name: string;
    parentId: string;
    mimeType: string;
    data: Buffer;
    description?: string;
    appProperties: Record<string, string>;
  }) {
    const boundary = `bb${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
    const meta = {
      name: opts.name,
      parents: [opts.parentId],
      description: opts.description || undefined,
      appProperties: opts.appProperties,
    };
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: ${opts.mimeType}\r\n\r\n`,
      ),
      opts.data,
      Buffer.from(`\r\n--${boundary}--`),
    ]);
    const r = await this.call(
      `${this.env.apiBase}/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,mimeType,size,md5Checksum,parents`,
      {
        method: "POST",
        headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
        body,
      },
    );
    return (await r.json()) as {
      id: string;
      name: string;
      mimeType: string;
      size?: string;
      md5Checksum?: string;
      parents?: string[];
    };
  }

  async media(id: string): Promise<Response> {
    return this.call(
      `${this.env.apiBase}/drive/v3/files/${encodeURIComponent(id)}?alt=media&supportsAllDrives=true`,
    );
  }

  async findByAppProperty(
    key: string,
    value: string,
  ): Promise<
    {
      id: string;
      name: string;
      mimeType: string;
      size?: string;
      appProperties?: Record<string, string>;
      parents?: string[];
    }[]
  > {
    const out: any[] = [];
    let pageToken = "";
    for (let i = 0; i < 20; i++) {
      const q = `appProperties has { key='${key}' and value='${value.replace(/'/g, "\\'")}' } and trashed = false`;
      const r = await this.call(
        `${this.env.apiBase}/drive/v3/files?q=${encodeURIComponent(q)}&fields=nextPageToken,files(id,name,mimeType,size,appProperties,parents)&pageSize=200&${ALL}${pageToken ? `&pageToken=${pageToken}` : ""}`,
      );
      const j: any = await r.json();
      out.push(...(j.files || []));
      if (!j.nextPageToken) break;
      pageToken = j.nextPageToken;
    }
    return out;
  }
}
