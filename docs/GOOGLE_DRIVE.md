# Google Drive storage and the Daily Construction Report

Google Drive holds the files: construction photographs, daily report photos, progress documents and supporting files.
Firebase (Firestore) stays the database. It holds the records, the file metadata, the Drive file IDs, the upload status and the publication status.
Files are never stored inside database records.

```
Phone / browser ──(Firebase sign-in token)──► /api/drive/*  (this app's server)
                                                  │  verifies the user and role (firebase-admin)
                                                  │  holds the Google credentials (never sent to browsers)
                                                  ├──► Google Drive API  (file bytes, folders)
                                                  └──► Firestore driveFiles/{fileId}  (metadata)
```

## 1. Set up Google Drive (one time)

1. **Create the root folder.** Use a Shared Drive (recommended) or a folder, e.g. `CONVENGERS BAHAY BUILD`. Copy its ID from the URL: `https://drive.google.com/drive/folders/<ROOT_FOLDER_ID>`.
2. **Give the server access.** Choose one of these:
   * **Service account (Google Workspace with a Shared Drive).**
     1. In Google Cloud Console (project `fleet-wallaby-73rp2`), enable the **Google Drive API**.
     2. Create a service account and a JSON key.
     3. Add the service account's e-mail to the Shared Drive as **Content manager**.
     * A service account has no storage quota of its own, so use a Shared Drive. Files it creates in a personal "My Drive" folder fail with a quota error.
   * **OAuth refresh token (personal Gmail accounts).** Shared Drives need Google Workspace, so a personal account uses this method; files use that account's storage.
     1. In Google Cloud Console, enable the **Google Drive API**.
     2. Set up the OAuth consent screen (Audience: External), then **Publish app** to *In production*. In *Testing* status, refresh tokens expire after 7 days.
     3. Create an OAuth client of type **Web application** with the redirect URI `https://developers.google.com/oauthplayground`.
     4. In the OAuth 2.0 Playground, choose *Use your own OAuth credentials*, authorize the scope `https://www.googleapis.com/auth/drive` with the Drive owner's account, and exchange the code for tokens. Copy the **refresh token**.
3. **Set the server environment variables.** Set them in the AI Studio Secrets panel (then redeploy), in Cloud Run, or in the Vercel project settings. Never put them in the frontend or the repository.

| Variable | Required | Value |
|---|---|---|
| `GOOGLE_DRIVE_ROOT_FOLDER_ID` | yes | ID of the root folder or Shared Drive |
| `GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON` | one of the two | Full JSON key of the service account (one line) |
| `GOOGLE_DRIVE_OAUTH_CLIENT_ID` / `GOOGLE_DRIVE_OAUTH_CLIENT_SECRET` / `GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN` | one of the two | OAuth alternative |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | only outside Google Cloud | A Firebase Admin key, used by the server to verify sign-ins and write file records. Not needed on Cloud Run / AI Studio, which use the default service account. |
| `DRIVE_MAX_UPLOAD_MB` | no | Server upload limit (default 20) |

   **Can't set server secrets?** On hosts where you cannot set server secrets (e.g. an AI Studio Starter project), the System Administrator can use **Database Synchronization → Google Drive storage → Connect Google Drive** instead:
   * Paste the Client ID, Client secret, refresh token and the folder ID or link.
   * The server tests them with Google first, then stores them in Firestore `driveSecrets/oauth`.
   * The security rules block every browser from that collection, and the values are never returned.
   * Server environment variables, when present, take precedence.
4. **Deploy `firestore.rules`.** The new collections are `driveFiles`, `driveConfig` and `dailyReports`. The GitHub Action deploys them, or you can paste the rules into the Firebase console.
5. **Check the connection.** Open **Database Synchronization → Google Drive storage → Test Connection**. It should say *Connected · root folder "…"*.

Hosting notes:
* **Cloud Run / AI Studio:** `server.ts` serves `/api/drive/*`.
* **Vercel:** `api/index.ts` serves `/api/drive/*`. Vercel limits a request to about 4.5 MB, so the app compresses photos to under 4 MB before upload. Documents larger than that need the Cloud Run deployment.

## 2. Folder structure

The server creates folders automatically. Their IDs are cached in `driveConfig/folders`, so later uploads reuse them without searching. If someone deletes or moves a cached folder in Drive, the next upload drops the cache and recreates the path.

```
<root>/PROJECT RECORDS/BAHAY BUILD PROJECT/
  01 - CONSTRUCTION PHOTOGRAPHS/<Month Year>/
  02 - DAILY CONSTRUCTION REPORTS/<Month Year>/<report reference>/
  03 - WEEKLY PROGRESS REPORTS/
  04 - MONTHLY PROGRESS REPORTS/
  05 - SITE DOCUMENTATION/
  06 - SUPPORTING DOCUMENTS/
```

An administrator can rename the folders under **Database Synchronization → Google Drive storage → Folder names** (saved in `driveConfig/settings`). New uploads use the new names; existing files stay where they are.

Uploads come from:

| Module | What is uploaded | Folder |
|---|---|---|
| Daily Construction Report | report photos | 02 / Month / report reference |
| Construction Management, Production Monitoring, Master Project Tracker | activity attachments (photos, documents) | 01 (photos) or 06 (documents) |
| Progress Gallery (Client Portal Management) | portal photos | 01 |
| 3D Construction Journey Management | stage illustrations | 06 / Construction Journey Illustrations |
| Document Repository | documents | 06 |

## 3. Upload behaviour

* **Validation:** JPEG, PNG, WebP, HEIC/HEIF, PDF, Word, Excel, TXT and CSV are accepted. Inputs are limited to 25 MB. Photos are resized to 2400 px and saved as JPEG, staying under 4 MB.
* **Feedback:** you see a preview, per-file progress, and an *Uploaded* or *Failed* state with **Retry Upload**.
* **Metadata** on every file:
  * project and reporting date
  * category, activity and report
  * photo type and description
  * uploaded by and upload date
  * upload status and publication status
* **No duplicates:**
  * Every file gets a reference ID before it is uploaded.
  * If an upload is retried, the server first looks for a Drive file that already has that ID (the Drive `appProperties` field `bbFileId`) and reuses it.
  * The same photo added twice to the same report or activity (checked by SHA-256) is stored once.
* **Recovery when Drive succeeds but the database write fails:**
  1. The server answers *recorded: false*, and the browser keeps the file ID in a recovery list.
  2. The record is completed automatically on the next sign-in, or by **Retry**.
  3. A manager can also run **Recover File References**. It rebuilds missing records from the Drive files' own metadata and marks uploads stuck for over an hour as failed.
* **Viewing:**
  * Files are opened only through `/api/drive/file/<id>`.
  * Internal users must be signed in. Clients and anonymous visitors get 401/403 for unpublished files.
  * Drive folder IDs and paths are never sent to the browser.
* **Publication:**
  * Uploaded files are *internal*.
  * A photo reaches the client portal only through Client Portal Management: draft → review → approve → **publish**. Publishing marks the Drive file `published`, and only then can the portal load it.
  * Unpublishing makes it private again.
  * Drive sharing settings are never changed; files are not made public in Drive.

## 4. Daily Construction Report

**Daily Construction Report** (Construction Operations, and *Daily Report* on the phone's bottom bar) has two tabs: **New Report** and **Report History**.

**Form sections:**
1. **Report information:** project, reporting date, reference number, weather, site location, prepared by, submission date.
2. **Construction accomplishments:** one or more activities from the Master Project Tracker, each with category, work description, actual accomplishment, reported progress, work status and remarks.
3. **Manpower:** skilled, general, subcontractor and other workers, with an automatic total.
4. **Materials and deliveries:** description, quantity and unit, delivery date, supplier, remarks.
5. **Equipment:** description, quantity, operational status, remarks.
6. **Site conditions and issues:** observations, issues, delays, safety, corrective actions, recommendations.
7. **Photo documentation:** Take Photo (camera) or Choose Photos (several at a time). Each photo has a type, related activity and description, plus a preview, progress, retry and remove.
8. **Report sign-off:** prepared by, reviewed by, approval status, review remarks.

**Submission sequence.** "Successfully submitted" appears only after every step is confirmed:
1. Validate the form.
2. Save the report record with status *Uploading*.
3. Upload the photos to Google Drive.
4. Save the Drive file references with the report.
5. Set the status to *Submitted*, but only if every photo uploaded and every database write was confirmed.
6. Show the confirmation: reference number, project, reporting date, submission time and status.
7. Report History updates from the database.

**If any step fails:**
* The report becomes **Pending Submission** and the form is **not cleared**.
* The failed photos show **Retry Upload**.
* Pressing **Submit Report** again continues the same report. It does not create a duplicate, because the report ID is fixed when the form is opened.

**Drafts:**
* **Save Draft** uploads the photos and saves the report.
* Unsent changes are also kept on the device, so they survive closing the page.
* Continue a draft from Report History (**Edit** or **Continue Submission**).

**Statuses:**
* *Draft*
* *Uploading*
* *Pending Submission*
* *Submitted*
* *Under Review*
* *Approved*
* *Returned for Revision*

**Review:**
* Administrators, directors and project managers can **Start Review**, **Approve**, or **Return for Revision** (remarks required).
* The preparer can edit until review starts, and can revise a returned report.
* Submitting never approves a report. The database rules also stop preparers from approving or editing review remarks.

**Notifications (bell and Notifications page, listed first):**
* **Daily report for approval:** administrators, directors and managers see every report that is Submitted or Under Review, with reference, date, preparer, submission date and photo count. A resubmission after a return appears again as unread. The item disappears once the report is approved or returned.
* **Daily report updated:** a submitted or approved report changed by someone else in the last 3 days. Each new change shows again as unread.
* **Daily report reviewed:** the preparer is told when their report is approved, or returned for revision with the remarks.
* **Daily report missing:** working days in the last 7 days with no report from the required reporter.
* Opening a notification opens that report.

**Master Project Tracker:**
* Submitting or approving a report does **not** change progress.
* After approval, a manager can press **Apply X% to Tracker** for each activity. This uses the normal activity update path and is recorded in the audit log.

**Output and history:**
* **Preview Report** before submitting. **Export PDF** gives the formatted report with photos (via the browser's Save as PDF).
* After approval, **Prepare for Client Portal** creates a photo draft in Client Portal Management.
* History filters: project, date range, status, prepared by.
* Earlier quick site reports (`siteReports`) are preserved and shown read-only.

## 5. What was tested

All the checks below ran against the Firebase Auth and Firestore emulators with the real `firestore.rules`, the real `/api/drive/*` server code, and a mock Google Drive API:

| Suite | Result |
|---|---|
| Unit tests (`npm test`) | 44 / 44 |
| Firestore rules: Drive metadata, folder settings, daily reports, existing collections | 82 / 82 |
| Drive server: roles; folders and folder reuse; daily report folder path; renamed folders; deleted-folder recovery; duplicate prevention by ID and by content; type and size limits; outage → failed → retry; private vs published viewing; record recovery; reconcile | 22 / 22 |
| Browser, desktop and iPhone: full submission with 3 photos; validation; file limits; Drive failure + retry; double submit; network loss + reconnect; draft save, restore and continue; history filters; review (return, revise, resubmit, approve); tracker unchanged until applied; PDF export with photos; publish to and unpublish from the client portal; client access refused; mobile layout | 22 / 22 |

**Not tested here: the live Google Drive service.** It needs the credentials from section 1, which are not available in the development sandbox. After you configure them, run this check:
1. Press **Test Connection**.
2. Submit one Daily Construction Report with a photo.
3. Confirm the photo is in `02 - DAILY CONSTRUCTION REPORTS/<Month Year>/<reference>` in Drive.

## 6. Local testing with emulators

`VITE_FIREBASE_EMULATOR_HOST=127.0.0.1 npx vite build` builds the app against the Auth (9099) and Firestore (8089) emulators. Never set it for production builds.

On the server side, set these and point it at a test Drive endpoint:
* `FIREBASE_AUTH_EMULATOR_HOST`
* `FIRESTORE_EMULATOR_HOST`
* `DRIVE_API_BASE`
