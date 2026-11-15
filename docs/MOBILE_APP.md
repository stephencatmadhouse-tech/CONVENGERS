# Bahay Build — mobile app experience

Bahay Build is an **installable web app (PWA)**. It is not a native iOS / Android app; it runs in the phone's browser and can be added to the home screen. The project database, business logic, calculations and permissions are shared with the desktop platform, so a native app can be added later on top of the same Firebase backend.

## Install on a phone
* **Android (Chrome / Edge / Samsung Internet):** open the site → menu → *Install app* (or *Add to Home screen*). The app menu also offers **Add to Home Screen** when the browser allows it.
* **iPhone / iPad (Safari):** open the site → *Share* → **Add to Home Screen**.

Files: `public/manifest.webmanifest`, `public/icons/*`, `public/sw.js`, `src/pwa/pwa.ts`.
The service worker caches only the application shell (HTML, JS, CSS, icons). Project data is never cached by it; Firestore keeps its own on-device copy (persistent cache) and the app labels anything not confirmed by the server. When a new version is deployed, phones show “A new version is available · Reload”.

## Phone layouts (≤ 760px wide)
| | Client Command Center | Internal Command Center |
|---|---|---|
| Top bar | Brand · **What's new** · menu | Module title · sync status · notifications · menu |
| Bottom navigation | Home · Progress · 3D Journey · Updates · Documents | Home · Daily Report · Schedule · Actions · More |
| Secondary menu | Project Timeline · Progress Gallery · Add to Home Screen · login / sign out | All permitted modules (grouped) · client portal preview · user management / audit logs (admin) · Add to Home Screen · sign out |
| Home | Project + welcome · progress ring · status · target completion · 3D Journey · latest updates · coming next · announcements | Project Status · Actual / Planned / Variance / Forecast · 8 quick actions · expandable Delayed Activities, Pending Management Actions, Upcoming Milestones, Pending Approvals, Notifications |

Tables inside modules turn into stacked cards on phones (no sideways scrolling); forms and dialogs open as full-height sheets with 44px touch targets and 16px inputs.

## Daily Construction Report (`#/site/new`, `#/site/history`)
Replaced the earlier quick site report. See [GOOGLE_DRIVE.md](GOOGLE_DRIVE.md#daily-construction-report) for the full workflow. On phones: camera capture or gallery selection, per-photo upload progress and retry, a sticky Save Draft / Preview / Submit bar, and history as stacked cards. Earlier quick site reports (`siteReports`) are kept and shown read-only in Report History.

## Notifications
* **Internal:** the existing role-based notifications (bell and dashboard section).
* **Clients:** “What's new” lists newly published progress updates, construction updates, announcements, client action required, schedule adjustments, weekly / monthly reports and photos; new items are marked per device.
* **Push notifications are not enabled.** They need a push service (e.g. Firebase Cloud Messaging), a VAPID key, a server to send messages and per-user opt-in; this can be added later.

## Security
Mobile uses the same authentication, roles and `firestore.rules` / `storage.rules` as desktop. On sign-out of an internal account the on-device project cache is cleared once all pending changes have reached the server.
