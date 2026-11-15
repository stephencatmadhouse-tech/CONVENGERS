# Convengers Bahay Build 2.0 — Pre-implementation audit

Audit of the existing application before the 2.0 UX/UI refinement. The 2.0 work is an
improvement project: the architecture, Firebase integration, calculation logic, records and
workflows below are preserved unless a finding says otherwise.

## 1. Application structure

| Layer | Files | Notes |
|---|---|---|
| Entry & routing | `src/main.tsx`, `src/Root.tsx` | Client portal is the default view; internal system after login; role-based landing |
| Internal app | `src/App.tsx` (data state, Firestore subscriptions, write handlers, printing, slides) | One large component; Command Center modules receive data through `CommandProvider` (`src/command/context.tsx`) |
| Internal modules | `src/command/*` | Command Center, Executive Dashboard, Notifications, Calendar, Tracker, Construction (calendar, manpower, floor slides), Production, Gantt, Milestones, Procurement, Issues, Reports (weekly/monthly/summary), Analytics (performance/forecast), Documents, Publishing, Archive, Settings |
| Presentation slides | `src/components/*Slide.tsx` | 12-slide deck (Project Overview); own visual design, not part of the 2.0 design system |
| Client portal | `src/portal/PortalApp.tsx` | Reads only the `portal` collection |
| Domain logic | `src/domain/*` | register, metrics, alignment, attention, reports, validation, portal, notifications, calendar, executive, dates |
| Firebase | `src/firebase/*` | Auth (`authService`), core data (`firestoreData`), control store (reports/issues/snapshots), generic `CollectionStore` (procurement, manpower, documents, publications, events, portal), user notification prefs |

## 2. Database schema (Firestore, named database)

Core project records: `milestones`, `scopes`, `pours`, `episodes`, `activities`, `characters`,
`overrides` (per-activity metadata: owner, dates, priority, revisions …), `settings`.
Control: `reports`, `issues`, `snapshots`. Operations: `procurement`, `manpower`, `documents`,
`events`. Publishing: `publications` (internal workflow), `portal` (published, client-safe).
People: `users`, `userPrefs`, `auditLogs`.

Activity IDs are stable (`SC-`, `PR-`, `MS-`, `EP-`, `AC-`) and derived in `buildRegister()`.

## 3. Progress calculations (single implementation)

`computeMetrics()` in `src/domain/metrics.ts` is the only progress calculation:

* **Actual Progress** = working-day-weighted progress of construction scopes.
* **Planned Progress** = baseline plan of the same scopes as of today.
* **Progress Variance** = actual − planned (percentage points); SPI = actual ÷ planned.
* **Project Status** (On Track / At Risk / Critical) from variance, projected vs target date and delayed critical items.
* **Projected completion** = latest finish in the current (revised) schedule.
* **Pace completion** = indicative date at the current SPI.

The Command Center, Executive Dashboard, reports, print report and the client snapshot all call
this same function.

## 4. Data consistency findings (internal vs client figures)

| # | Finding | Source | Resolution in 2.0 |
|---|---|---|---|
| 1 | **Device-only data shown as project data.** The internal app starts from a copy saved on the device (`convengers_cached_dashboard`, or bundled seed data) and switches to the shared database only when it can be read. While the server rules block reads, every device shows its own copy and nothing says so. | `src/api/client.ts`, `firestoreData.subscribeAll` (errors only logged) | Sync status is now tracked per collection. "Live sync" appears only when the shared database has confirmed the data; otherwise a clear "Device data — not synced" status is shown and publishing to the client portal is blocked. |
| 2 | **Client portal shows a published snapshot.** The portal shows the status as of the last publication; the internal dashboard is live. Differences appear as soon as data changes after publishing. | By design (`publications` → `portal`) | Client Portal Management now compares live figures with the published ones and flags when the portal is out of date. |
| 3 | **Two "completion" forecasts.** Internal showed "Projected completion" (current schedule) and "Indicative at current pace" (SPI); the client showed "Projected completion". Renaming the pace figure to "Forecast Completion" would contradict Project Status, which is computed from the projected (schedule) date. | `metrics.ts` | One authoritative **Forecast Completion** = projected completion from the current schedule (the date Project Status uses), defined once in `forecastCompletion()` and used by the Command Center, Executive Dashboard, print report and client snapshot. The pace date is kept as a secondary "at current pace (indicative)" note. |
| 4 | **Different activity counts.** Command Center counts all register items (scopes, pours, milestones, episodes); the client counts construction activities only. | `metrics.counts` vs `snapshot.counts` | Labels now state what is counted ("construction activities" on the client side). |
| 5 | **Status vocabulary differed** (Upcoming/Ongoing internally, "Scheduled/In progress/Behind schedule" for clients). | `register.ts`, `portal.ts` | One controlled dictionary with display mapping (stored values unchanged). |
| 6 | **Dates** shown as "Nov 15, 2026" in some places and ISO in others. | `fmtDate` / tables | `fmtDate` standardised to "November 15, 2026"; compact chart axes keep short labels. |

No defect was found in the progress calculation itself; it is preserved unchanged.

## 5. Client publishing

Draft → For Review → Approved → Published → Archived (`publications`). Only Published items are
written, sanitised, to `portal`. Server rules: the public can read published client-safe kinds;
documents only for Project Owner, Executives and internal users; internal collections are never
public. Owners, remarks, issues, procurement and production details are never included (unit tested).

## 6. Roles

Internal: System Administrator, Project Manager, Site Engineer, Production Coordinator, Internal
Team Member, Internal Viewer. External: Project Owner, Executive, Client Representative,
Authorized Stakeholder. Pending/revoked accounts have no access. 2.0 adds Project Director,
Construction Manager and Quality Personnel.

## 7. Functional vs presentation-only

Functional (read/write shared data): tracker & activity editor, milestones/pours/scopes/episodes
edits, issues, reports workflow, procurement, manpower, documents, calendar entries, publishing,
notifications state, settings/backup. Presentation-only: the 12 presentation slides (they also
edit core records inline), charts. Not existing (not invented in 2.0): daily construction reports.

## 8. Duplication and terminology

* Two dashboards overlap (Command Center and Executive Dashboard) — kept, with the Command
  Center reorganised into four zones and the Executive Dashboard focused on analysis.
* Terminology varied ("Physical accomplishment", "Schedule variance", "Management attention",
  "Performance Analytics", "Client Portal Publishing", "Project Archive"). 2.0 applies the
  requested label standard; technical reports keep technical terms where needed.
* Action labels varied ("+ Add activity", "+ Log issue / risk / decision", "Save"). 2.0
  standardises: Add New, Edit, View Details, Save Changes, Cancel, Delete, Refresh Data,
  Export PDF, Publish to Client Portal, Unpublish.

---

# 2.0 implementation summary

## Phase 1 — Design system (`src/theme-2.css`, loaded last)
Inter type scale (Regular body, Medium labels, SemiBold headings, Bold figures); navy primary with Convengers purple as the accent; plain white card headers (no banner strips); one style for buttons, forms, tables, badges, tabs, KPI cards. Presentation slides keep their own design. Standards: dates "November 15, 2026" (`fmtDate`), times "8:30 AM" (`fmtTime`), variance "-1.2 percentage points" (`fmtVar`), status dictionary Not Started · Planned · In Progress · Completed · On Hold · Delayed · Cancelled (`statusLabel`, stored values unchanged) and client vocabulary Upcoming · In Progress · Completed · Schedule Update Required (`clientStatus`).

## Phase 2 — Client portal
Navigation: Project Overview · Construction Progress · 3D Construction Journey · Project Timeline · Progress Gallery · Updates & Announcements · Documents & Reports (old addresses redirect). Overview = "Your Home Construction Dashboard" (client, location, start, original target, estimated completion, last updated; progress ring, schedule status, estimated completion; happening now / recently completed / coming next; current journey stage; latest update). Progress by construction category (derived from activity names, overridable per activity; weighted with the existing scope weights so categories add up to Actual Progress). Stage timeline with activities, updates and photos; milestone list as mobile-friendly cards. Updates: client action required, latest updates, weekly summary, announcements, schedule adjustments. Documents: weekly / monthly reports and approved documents (Owner / Executive).

**Construction Journey 3D** (`src/portal/Journey.tsx`, `src/domain/journey.ts`): nine configurable stages; progress, status and dates are calculated from linked activities (default keyword links, explicit links override, no double counting) and published with the project status snapshot — never typed in. Reference vs actual photo comparison (photos can be tagged to a stage). Illustrations: upload the nine-stage sheet (sliced by grid) or one image per stage; until then labelled placeholder drawings are shown. `StageArt` is the single render point for a future rotatable 3D model.

## Phase 3 — Internal Command Center
Command Center zones: A Project Status (Actual Progress, Planned Progress, Progress Variance, Project Status, Original Target Completion, Forecast Completion), B Activity Status + Items Requiring Attention, C Pending Management Actions (title, related activity, responsible, priority, target resolution, status, required action), D Upcoming Milestones; quick actions open the existing workflows (add activity / milestone, update progress, report an issue, upload photos, weekly report). Sidebar: seven collapsible groups (Overview, Project Management, Construction Operations, Monitoring & Control, Reports & Documents, Client Experience, System Administration). New pages: 3D Construction Journey Management, Schedule Monitoring (forecast + alignment, moved from Analytics), Roles & Permissions, Database Synchronization; User Management and Audit Logs open from the sidebar (administrator).

## Phase 4 — Data management
* **Sync status**: "Live sync" only when the server has confirmed the core collections; otherwise "Device data — not synced", "Offline — last synced data" or "Not synced — access refused". Publishing a client status update is blocked unless synced. Database Synchronization lists device-only records and uploads them.
* **Single forecast**: `forecastCompletion()`; pace date shown only as an indicative note.
* **Client portal vs live data** comparison in Client Portal Management; project profile (client name, location, welcome) published with the status update.
* **Roles**: Project Director (manager rights), Construction Manager and Quality Personnel (operations) added to the app, `firestore.rules` and `storage.rules`.
* Activity editor: Construction category, Baseline / Revised / Actual date labels. Standard action labels (Add New, Save Changes, Cancel, Delete, Refresh Data, Export PDF, Publish to Client Portal).

## Deployment
Deploy `firestore.rules` (new `clientConfig` collection and roles) and `storage.rules`. Then, in Client Portal Management: fill in the project profile, then publish a new project status update so clients see categories and the construction journey.
