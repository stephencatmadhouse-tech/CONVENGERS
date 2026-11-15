# Convengers Bahay Build — Full System Audit (November 15, 2026)

**Scope.** I inspected the whole application, fixed the defects I found, and tested the real workflows in a browser. The browser tests ran against:
* Firebase Auth and Firestore emulators enforcing the real `firestore.rules`.
* The real production server (`server.ts`).
* A mock Google Drive API.

**Status codes used below:**
* **PASS:** works, and was tested.
* **FIXED:** was defective; repaired and tested.
* **NEEDS CONFIGURATION:** requires credentials or settings outside this environment.
* **NOT TESTED:** could not be verified here.

## Architecture (as found)

| Layer | Implementation |
|---|---|
| Client portal (default view) | React SPA, `#/portal/*`, reads published client-safe records only |
| Internal Master Project Tracker | React SPA behind Firebase sign-in, role-based modules |
| Database | Cloud Firestore (named database), real-time listeners, offline cache; access enforced by `firestore.rules` |
| Files | Google Drive through the server (`/api/drive/*`); metadata in Firestore `driveFiles` |
| Server | Express (`server.ts`, AI Studio / Cloud Run), Vercel function (`api/index.ts`) for Drive only |
| Live presence | WebSocket `/ws` ("teammates live", who is editing which cell) |

## A. System audit report — defects found and fixed

| # | Severity | Module | Defect | Root cause | Fix | Status |
|---|---|---|---|---|---|---|
| 1 | Critical | Server / security | Anyone could create an **admin** account through `POST /api/auth/register` (role in the request body). They could then write to the server's file database through the old REST API (scopes, activities, pours, episodes, settings, backup import, factory reset). | The original prototype REST backend (file database `data/database.json`, its own login) was still running beside Firebase, although the app no longer used it. | Removed the old REST API, its login and its file database from the server. The server now serves only the app, `/api/drive/*` and presence. Any other `/api/*` path returns 404. | FIXED (all old endpoints return 404) |
| 2 | High | Server / privacy | Project data (owners, remarks, schedules) was readable **without sign-in** through `GET /api/data/all`, the `/api/events` stream and the WebSocket greeting. | Same old backend. | Removed. The presence channel carries no project data. | FIXED |
| 3 | High | Presence / integrity | Anyone could connect to `/ws`, appear as a teammate, read staff names, and push fake cell values. Those values were applied to every signed-in user's screen, and could be saved by accident. | Unauthenticated WebSocket with an edit-broadcast path. | Joining now requires a Firebase ID token, verified on the server, from an **active internal** user. Edits are no longer broadcast or applied from this channel; Firestore listeners carry all data. Message size is limited (16 KB) and text fields are clipped. | FIXED (anonymous, forged-token and client-account joins are refused; staff see "2 teammates live") |
| 4 | High | Privacy | A full project backup (`Convengers_Backup_2026-11-09…json`) and an exported timeline HTML were **publicly downloadable** from `/assets/aistudio/`. | Files placed in `public/`. | Moved to `archive/aistudio/` (kept, not served). | FIXED (not in the build output) |
| 5 | Medium | Repository | `data/database.json` (password hashes of demo accounts, the owner's e-mail) was committed. | Old backend. | Removed from the codebase; it remains only in git history. | FIXED |
| 6 | High | Data safety | Deleting a scope of work, concrete pour, episode, activity or character in the presentation slides, a manpower plan, or a client-portal draft happened with **one click, without confirmation**. | No confirmation step in those handlers. | In-app confirmation dialog for every permanent deletion. Browser pop-ups were avoided because they can be blocked inside embedded previews. Disconnecting Google Drive uses the same dialog. | FIXED (Cancel keeps the record, Delete removes it) |
| 7 | Medium | Dependencies | Known advisories: `@grpc/grpc-js` (high, low) and `uuid` (moderate), pulled in by the Firebase libraries. | Old versions resolved by the Firebase libraries. | Pinned patched versions (`overrides`). `bun audit` reports **0 vulnerabilities**. | FIXED (Drive and Firebase server suites pass) |
| 8 | Medium | Performance | Client visitors downloaded the whole internal Command Center: one 1.77 MB script (485 KB compressed). | No code splitting. | The internal app loads only after an internal sign-in. Client portal script: **1.03 MB (307 KB compressed)**. | FIXED |
| 9 | Medium | Performance | The header banner was a 977 KB PNG loaded on every page. The favicon was a 343 KB 1024 px icon. | Unoptimised assets. | Banner re-encoded as WebP (112 KB). Favicon reduced to 16/32/48 px (5 KB). | FIXED |
| 10 | Low | UI consistency | Button labels "Save changes" and "Create activity" broke the "Save Changes" style used elsewhere. | Inconsistent casing. | Unified. | FIXED |
| 11 | Low | Hardening | The server advertised its framework (`X-Powered-By`). | Express default. | Disabled. | FIXED |

These issues were found and fixed earlier in this engagement and re-verified in this audit:
* Daily Construction Report submission and uploads (rebuilt).
* Google Drive integration.
* The client portal showing an outdated status update.
* Calendar chips that were unreadable.
* Phone overflow in stacked tables.
* Broken calendar links.
* Plurals and wording.
* Raw record IDs shown to users.
* Missing legend styles.
* Low-contrast colours.

## B. Functionality report

**Repaired in this audit:** items 1–11 above.

**Optimised:**
* Client portal bundle size (item 8).
* Header and icon assets (item 9).
* The presence channel, which now carries presence only.
* Fewer network calls: presence no longer sends REST fallback requests on every focus, blur and heartbeat.

**Removed at the owner's request (November 13), not re-added:** the Budget and Expenses / financial monitoring module.

**Requires external configuration:**
* Live Google Drive credentials.
* Automatic deployment of the security rules (see C).

## C. Database and integration report

| Area | Result |
|---|---|
| Firestore data integrity | Every create and edit in the tested modules writes the expected record and survives a page reload. Duplicate activity names are blocked. Daily reports use one fixed ID per report, so retries never duplicate. Deletes now require confirmation. Timestamps (`createdAt` / `updatedAt` / `updatedBy`) are written on every write. **PASS** |
| Security rules | 85 / 85 emulator checks pass. Roles cannot be self-assigned; client roles cannot read internal collections; Drive credentials and folder cache are unreadable from any browser. **PASS** |
| Google Drive (server code) | 22 / 22 server checks: upload, folders, de-duplication, outage, retry, recovery, private vs published files, reconcile. Plus 8 / 8 checks for the in-app connection form. Document upload from the UI writes to Drive and saves the reference. **PASS** against a mock Drive API |
| Google Drive (live account) | Not testable here: the real Google credentials are not available in this environment. Setup is in progress through **Database Synchronization → Google Drive storage → Connect Google Drive**. **NEEDS CONFIGURATION** |
| Security rules deployment | The GitHub Action skips deployment because the repository secret `FIREBASE_SERVICE_ACCOUNT` is not set. Rules are published manually in the Firebase console. **NEEDS CONFIGURATION** (to automate) |
| Live presence | Verified on the real server with Firebase tokens. On Vercel (no WebSocket support) presence is simply unavailable; the app works normally. **PASS** |
| Data synchronisation | Firestore real-time listeners: edits by one user appear for others. The presence channel no longer carries data. **PASS** |

## D. Quality assurance report

| Suite | Result |
|---|---|
| Unit tests (`npm test`) | 47 / 47 |
| Firestore security rules (emulator) | 85 / 85 |
| Drive server (emulators + mock Drive) | 22 / 22 |
| In-app Drive connection | 8 / 8 |
| Daily Construction Report workflows: create, draft, submit, photos, failure + retry, offline, duplicates, review, approve, PDF, client publication, mobile | 19 / 19 |
| Client-portal photo publication | 3 / 3 |
| Module workflows: tracker search, filter, add, edit and duplicate guard; calendar add, delete and navigation; issues add, edit and search; procurement; manpower; documents with Drive upload; notifications; weekly report; backup export; engineer / client / admin permissions; admin role change; mobile issue entry | 20 / 20 |
| Production and milestones: episode status edit reflected in the production calendar; milestone status update | 3 / 3 |
| Delete confirmations (activity, manpower) | 2 / 2 |
| Real-server checks: old endpoints return 404; Drive status; presence access control (anonymous, forged, client refused; engineer accepted) | all pass |
| Construction Journey, desktop / laptop / tablet / phone: 12 illustrations, grid, animation only while on screen, larger view, keyboard, reduced motion, no internal data | 16 / 16 |
| Page crawl, all 57 internal pages plus the client portal: administrator, engineer, client and visitor, desktop and phone | 0 script errors, 0 sideways overflow, 0 broken images, 0 "undefined/NaN" text |

**Failed tests:** none outstanding. The failures seen while building the tests were selectors and test data carried over from earlier runs; each was investigated, and none was an application fault.

## E. Performance report

| Measure | Before | After |
|---|---|---|
| Script downloaded by a client visitor | 1.77 MB (485 KB gz) | 1.03 MB (307 KB gz) |
| Internal Command Center | in the initial download | loaded on internal sign-in (744 KB, 178 KB gz) |
| Header banner | 977 KB PNG | 112 KB WebP |
| Favicon | 343 KB | 5 KB |
| Journey illustrations | — | 12 × 18–41 KB, lazy-loaded; animated only while on screen |
| Presence network calls | WebSocket + REST call on every focus / blur / heartbeat | WebSocket only |

The rest of the client bundle is mainly the Firebase SDK and React, which the portal needs.

## F. Final system status

| Area | Status |
|---|---|
| Client portal (default view), Construction Journey, published updates, gallery, documents | PASS |
| Internal login, role-based access, user management | PASS |
| Master Project Tracker: search, filters, add, edit, duplicates, persistence | PASS |
| Construction and production calendars, milestones, episodes | PASS |
| Daily Construction Report | PASS (FIXED earlier) |
| Issues, procurement, manpower, documents, notifications, reports, backup | PASS |
| Dashboards and analytics (calculated from records; unit-tested formulas) | PASS |
| Security: old backend, presence channel, public data files, dependency advisories | FIXED |
| Delete confirmations | FIXED |
| Performance: bundle splitting, image weight | FIXED |
| Google Drive with the live Google account | NEEDS CONFIGURATION |
| Automatic deployment of security rules | NEEDS CONFIGURATION (`FIREBASE_SERVICE_ACCOUNT` secret) |
| Real phones and tablets (tested with device emulation only) | NOT TESTED |
| Live Google Drive behaviour (quotas, sharing, very large folders) | NOT TESTED |

**Remaining risks and recommendations:**
* Finish the Google Drive connection, then submit one daily report with a photo to confirm the live path.
* Add the `FIREBASE_SERVICE_ACCOUNT` secret so rule changes deploy automatically. Until then, publish `firestore.rules` from the main branch after each rules change.
* The removed file database is still in git history. If those demo passwords were ever reused anywhere, change them.
* Unused template packages (`@google/genai`, `dotenv`, `motion`) are not shipped to browsers. They can be removed later if AI Studio does not need them.
* All collections are loaded in full. That is appropriate for one project; add paging if the system grows to many projects or years of daily reports.
