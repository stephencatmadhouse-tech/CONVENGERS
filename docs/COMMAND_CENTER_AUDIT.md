# Convengers Bahay Build — Command Center: Audit, Gap Analysis & Delivery Notes

This document records the audit of the existing dashboard, the gap analysis
against the integrated project-management specification, what was built, how
it was tested, and what still needs a human action.

---

## 1. Audit of the existing system (before this change)

**Stack:** React 19 + Vite + Tailwind, Firebase Auth + **Cloud Firestore**
(shared, real-time), optional Node/Express + WebSocket server for live
presence, Vercel static hosting config.

**Pages (12 fixed-size 1920×1280 "slides" on one scrolling page):**

| # | Slide | Function |
|---|---|---|
| 01 | Overview | Milestone list + status, mini Gantt, "overall status" (milestone completion %) |
| 02 | Upcoming activities | Calendar/list of scopes, milestones, episodes, pours and manual activities, owner assignment |
| 03–05 | GF / 2F / 3F scopes | Progress %, dates, working days, timeline bars |
| 06 | Concrete pours | Prep / pour / cure / inspection statuses, target vs actual pour |
| 07 | Production calendar | Episodes, shoot windows, characters |
| 08 | Episodes table | 24 + B-roll episodes |
| 09 | Master timeline | Construction + production on one slide |
| 10–12 | Methodology, watch items & holidays, schedule notes | Reference |

**Data model (Firestore collections):** `milestones`, `scopes`, `pours`,
`episodes`, `activities`, `characters`, `overrides` (owner / remarks / on-hold
per activity), `settings`, `auditLogs`, `users`.

**Working:** role-based editing (Admin / Manager / Staff / Viewer), real-time
sync, working-day calculations (Sundays, PH holidays, Dec 20–Jan 3 stoppage),
floor progress weighting, JSON backup/import, audit log, slide PDF, executive
A4 report, standalone HTML export.

**Problems found:**

1. **No single activity register.** The Upcoming slide derived a unified list
   internally; no other module could use it.
2. **Fragile owner assignments.** Scope and milestone assignments were keyed
   by `name|date` text, so renaming or re-dating a scope silently orphaned its
   owner and remarks.
3. **No baseline.** Editing a scope's date overwrote the only date. Planned vs
   actual and schedule slippage could not be measured.
4. **No actual start/finish dates** for scopes, milestones or episodes.
5. **"Overall status" was milestone completion** (Complete = 1, In progress = ½),
   not physical accomplishment, and there was no planned accomplishment or
   schedule variance.
6. **No weekly/monthly reporting, history, issue log, forecast or analytics.**
7. **Navigation:** a long single page with a jump bar; poor on mobile.
8. **Toolbar overload:** the toolbar mixed data-management actions with display controls.
9. Minor: React hooks were declared after an unreachable early `return`. The
   `calculations.test.ts` file also could not run under plain `node --test`
   because of a directory import.

## 2. Gap analysis

| Spec area | Status before | Action |
|---|---|---|
| Centralized database | Firestore (good) but no unified register | **Added** derived master register (`src/domain/register.ts`) — no duplicate records |
| Command Center | Overview slide only | **Added** executive Command Center |
| Master tracker | Partial (Upcoming slide) | **Added** sortable/filterable register + editor; slide **preserved** |
| Construction calendar | Slides 03–06 | **Added** month/agenda calendar; slides **preserved** |
| Production calendar | Slides 07–08 | **Preserved**; **added** cross-calendar alignment |
| Master Gantt | Static slide 09 | **Added** interactive Gantt (month/week/day, baseline/current/actual, critical path); slide **preserved** |
| Milestone monitoring | Overview list | **Added** milestones + pour milestones with variance |
| Weekly / monthly reports | Executive report only | **Added** reporting engine with approval lock and archive; executive report **preserved** |
| Analytics | None | **Added** S-curve, trends, workstreams, milestone / construction / production performance |
| Issues & accountability | Owner field only | **Added** issue/risk/decision log, attention list, ownership view |
| Forecast | None | **Added** outlook (Confirmed / Tentative / Management target / At risk) |
| Archive | None | **Added** archive by year/month + snapshot history |
| Settings & data | Toolbar buttons | **Consolidated** into section 12 with health check, baseline, storage status |
| Duplicate navigation | Jump bar + slides | **Consolidated** into a 12-section sidebar (mobile drawer) |

## 3. Architecture delivered

```
Firestore (shared)                         Derived in the browser (pure functions)
-------------------                        ---------------------------------------
scopes, pours, milestones,   ──►  buildRegister()  ──►  RegisterActivity[]  (one record per item, stable IDs)
episodes, activities,                    │
overrides (control metadata)             ├─► computeMetrics()   actual %, planned %, SV, SPI, projected completion, health
                                         ├─► buildAlignment()   production ↔ construction classification & alerts
reports, issues, snapshots ──────────────├─► buildAttention()   management attention list
(new collections)                        ├─► buildOutlook()     forecast / next month
                                         └─► buildWeekly/MonthlyContent()  report content
```

* **One source of truth.** Every module reads the same register. Edits from
  the tracker, Gantt, calendars, milestones or slides write to the **original
  record** (scope / pour / milestone / episode / activity). Owner, priority,
  dependencies, baseline and actual-date metadata go to that activity's
  `overrides` document.
* **Stable IDs.** `SC-<scopeId>`, `PR-<pourId>`, `MS-<milestoneId>`,
  `EP-<episodeId>`, `AC-<activityId>`; metadata keys `sc|<id>`, `ms|<id>`,
  `p|<id>`, `e|<id>|s`, `a|<id>`. Legacy `c|floor|phase|name|date` and
  `m|index|label` documents are still read and merged, and are migrated on
  next write. Nothing is deleted.
* **Baseline preservation.** The first time an activity's dates change, its
  previous dates are stored as the baseline and a revision is logged (who /
  when / from / to). The baseline is never overwritten, and *Freeze baseline*
  (Settings) records it explicitly for all activities.
* **Actual dates.** These are recorded automatically on the day progress first rises above 0%
  and on the day it reaches 100%. Both can be edited.
* **Physical accomplishment.** This is the working-day weighted average of scope
  progress, the same weighting the floor slides already use. Planned accomplishment follows
  each scope's baseline window. Pours, milestones and episodes are tracked by
  status and do not inflate physical progress.
* **Projected completion** is the latest finish in the current schedule.
  Overdue items that have not been re-scheduled are counted and shown instead
  of being assumed. The "at current pace" date (remaining time ÷ SPI) is
  labelled as an indicative projection.
* **Critical path** is calculated only from declared dependencies. With no
  dependencies recorded, the UI says so and does not guess.
* **Cross-calendar alignment never edits either calendar.** It classifies each
  shoot as Confirmed / Tentative / For Coordination / Conflict / Rescheduled /
  Completed and lists the coordination needed. Explicitly linked scopes raise
  conflicts. Text-matched links are marked *auto-matched* and raise
  coordination alerts only.
* **Reports.** Drafts are recomputed live. *Approve & lock* freezes the content.
  Approved reports cannot be edited or deleted, both in the app and in
  Firestore rules. Exports: Print/PDF (Convengers-branded A4), CSV, JSON.
* **History / trends.** One progress snapshot per day is captured automatically
  when a team member has the dashboard open, or manually from Settings. Periods
  with no snapshot are shown as **n/a**; history is never back-filled.

## 4. Data storage, reliability & limitations

* **Shared:** all existing project data is in Firestore with real-time listeners,
  so it syncs across users and devices.
* **New collections `reports`, `issues`, `snapshots`:** the rules for them are
  added in `firestore.rules`. **These rules must be deployed** (see §6). Until
  they are, the app keeps new reports, issues and snapshots **in that browser only**,
  labels them "this device only", and offers *Retry upload* in Settings.
* **Concurrent editing:** the last write to a field wins. There is no merge of
  simultaneous edits to the same field. The audit log records changes.
* **Offline:** read-only from cache. Edits need a connection.
* **Version history:** per-activity revision log, frozen approved reports,
  daily snapshots and the audit log. Field values are not otherwise versioned.
* **Import** asks for confirmation. Project collections in the file are
  restored with the existing import behaviour. Reports, issues and snapshots
  are merged: never deleted, and approved reports are never overwritten.

## 5. Quality assurance performed

* `npm run lint` (TypeScript): passes.
* `npm test`: 20 unit tests pass, including domain tests on the real seed data
  (register uniqueness, legacy-key merge, status derivation, weighted
  accomplishment, baseline preservation, alignment immutability, attention,
  outlook, weekly/monthly content, snapshot-based gain, validation, critical
  path, date round-trips).
* `npm run build`: passes.
* Browser tests (headless Chromium) of all 23 section/tab routes at
  1440×900: no page errors and no horizontal page scroll.
* End-to-end workflow tests ran against an **in-memory fake backend** (the live
  database was blocked during testing). Covered:
  * Editing a scope from the tracker updates the source record, preserves the
    baseline, logs the revision, saves owner/priority/actual start, and keeps
    the legacy assignment record.
  * The edit appears in the tracker, the Gantt (baseline bar), the GF slide and the Upcoming board.
  * Weekly report: auto-draft, save draft, approve & lock; locked report is not
    editable; print view renders.
  * Monthly report has all 10 sections and consolidates the approved weekly report.
  * Archive lists and opens the approved report.
  * Issue logging; critical issue appears on the attention list.
  * Freeze baseline (existing baselines untouched); daily snapshot captured.
  * Slide PDF prints all 12 slides; duplicate activity creation is blocked.
  * Mobile (390 px): Command Center, tracker, Gantt, reports, alignment and
    calendar have no horizontal page scroll; the section drawer opens.
* The monthly report was rendered to an A4 PDF and checked visually.

## 6. Actions required from the project owner

1. **Deploy the updated Firestore security rules** (`firestore.rules`) so that
   reports, issues and snapshots are shared across users and devices. Either
   publish from Google AI Studio, or run
   `firebase deploy --only firestore:rules`. Then open *Settings & Data* and
   click *Retry upload* if any records were created on a single device before
   the deployment.
2. Optionally use *Settings → Freeze baseline* once to lock the current plan as
   the official baseline.
3. Record dependencies (predecessors) in the activity editor where sequencing
   matters. This enables the critical path and dependency-risk alerts.
4. Review the data-health findings in *Settings & Data*. One example is a
   concrete pour target date that falls outside its matching scope's dates;
   this occurs in the repository's seed data for the GF tie-beam pour.

## 7. Visual identity — clean white & Convengers purple (standard)

**White is the foundation. Purple is the identity. Silver is the finishing detail.**
Target balance: ~90% white / neutral surfaces, ~8% purple brand elements,
~2% other accents. No lavender or pastel purple backgrounds, no dark navy or
cosmic sections, no decorative gradients. The original Convengers logo is
preserved.

| Element | Hex |
|---|---|
| Main background — Pure White | `#FFFFFF` |
| Secondary background — Clean White | `#FCFCFC` |
| Primary brand — Convengers Purple | `#7026C8` |
| Secondary purple — Vibrant Violet | `#8B35E8` |
| Accent purple — Electric Purple | `#A34FEA` |
| Magenta accent | `#C02AE0` |
| Metallic accent — Silver | `#C7C7D0` |
| Primary text — Charcoal | `#303030` |
| Secondary text — Gray | `#777777` |
| Borders — Light Gray | `#EAEAEA` |
| Success — Green | `#22A06B` |
| Warning — Orange | `#F5A623` |
| Critical — Red | `#E5484D` |

Application:

* **Surfaces:** white page and cards, light-gray dividers, subtle shadows.
* **Sidebar:** white, purple line icons, charcoal labels, purple active indicator.
* **KPI cards:** white with outlined icon chips and purple figures. The green
  or red trend badge on *Actual physical accomplishment* only appears when a
  recorded snapshot from 7–10 days earlier exists. It is never estimated.
* **Charts and timelines:** purple = actual / in progress; silver gray =
  planned / baseline / not yet started; green = completed; orange =
  attention-required (tentative, needs confirmation, high priority); red =
  delayed / critical. Upcoming Gantt bars stay silver rather than orange so the
  ~2% accent target holds. Orange is reserved for items that need attention.
* **Buttons:** solid purple primary; white secondary with a purple border; purple hover.

Implementation files (visual only — no data, calculation or reporting logic changed):
`src/command/command.css`, `src/theme-palette.css`, `src/theme-status.css`,
`src/utils/themeColors.ts`. The original dark look remains a per-device option
(toolbar *Theme* button), stored in the browser only.

## 8. Integrated system — internal back-end & external client portal

One application, one sign-in, one database, two experiences:

| Audience | Roles | Lands on | Can read |
|---|---|---|---|
| Internal | System Administrator (`admin`), Project Manager (`manager`), Site Engineer (`engineer`), Production Coordinator (`production`), Internal Team Member (`staff`), Internal Viewer (`viewer`) | Project Management System | All internal collections (finance: admin & manager only) |
| External | Project Owner (`owner`), Executive, Client Representative (`client`), Authorized Stakeholder (`stakeholder`) | Executive & Client Portal | **Only** the `portal` collection |
| Not signed in | — | Sign-in page | Nothing |
| Pending / revoked | — | Awaiting-approval page | Their own profile |

The System Administrator assigns roles in **Admin Panel → user list**. New sign-ups are pending.

### Security model (server-side, not front-end checks)

* `firestore.rules` now make every internal collection readable **only by internal roles**. External roles can read only `portal`. The earlier public read access (`read: if true`) has been **removed**, so public "presentation" links stop working once the rules are deployed. Everyone signs in.
* Finance (`budget`, `expenses`) is readable and writable only by `admin` / `manager`.
* `storage.rules`: `documents/**` is for internal roles; `portal/**` (approved photos and documents) is for internal and external roles.
* The UI routing (`src/Root.tsx`) only decides which interface to render. External users never load internal modules, and the database rules refuse their reads even if they edit the URL or call the API directly.

### Publishing (internal → approval → external)

`Draft → For Review → Approved → Published → Archived` for project status updates, weekly and monthly reports, progress photos, documents, major considerations and important updates.

* Staff create drafts and submit them for review. Project Managers approve, publish and archive. The rules enforce the same permissions.
* Publishing writes a **sanitized copy** to `portal`: construction progress, phases, milestones, dates with their commitment (Confirmed / Tentative / Target) and the narratives written for clients. It never includes responsible persons, internal remarks, issues, corrective actions, procurement, budget or production details. This is covered by unit tests.
* Approved reports are frozen. Publishing or archiving changes only their status.
* Every step is recorded in the item's history and in the audit log.

### New internal modules

Procurement & Materials (with delayed-delivery detection), Manpower schedules, Budget & Expenses (restricted), Document Repository (uploads or links, linked to activities), Client Portal Publishing, and Summary reports (construction progress, production/construction coordination, delayed and upcoming activities). The tracker gains department and deadline filters, a department field and attachments. The construction calendar gains layers for material deliveries and manpower. The Command Center gains delivery blockers, priorities and recent updates. All new modules start empty and show "Not yet provided" until the team enters data. Nothing is pre-filled.

### Actions required to go live

1. **Deploy `firestore.rules`.** This is required for the internal/external separation, publishing and all new modules to work across users. With the Firebase CLI, from the repository root (`firebase.json` already targets the project's named database):
   `firebase deploy --only firestore:rules` (add `,storage` to also deploy `storage.rules`).
   Or in the Firebase Console: **Firestore → select database `ai-studio-convengersbahayb-…` → Rules**, paste `firestore.rules`, then **Publish**. Until then:
   * new records stay on the device that created them;
   * the old public-read rules still apply on the server.
2. **Enable Firebase Storage and deploy `storage.rules`** for file uploads. The rules read user roles from the project's named Firestore database. If cross-service rules are not supported for that database, uploads are refused and files can be attached as links instead.
3. **Assign roles** to team members and clients in the Admin Panel.

### Known limitations

* The original seed project data (`src/db/seedData.ts`) is bundled in the app's JavaScript for the baseline-reset feature. Anyone who downloads the app files can read that seed snapshot. Live data is protected by the rules. Remove the seed import from the client bundle if that snapshot is confidential.
* Concurrent edits to the same field: last save wins (the audit log shows who changed what).

## 9. Notifications, Executive Dashboard and Calendar (60-day forecast)

New sidebar pages (Operations group): **Executive Dashboard**, **Notifications**, **Calendar**; bell with unread badge in the top bar.

| Part | Source data | Stored |
|---|---|---|
| Notifications (8 rules) | master register, reports, publications, documents, calendar entries | only each user's read keys + preferences in `userPrefs/{uid}` |
| Executive Dashboard | master register (per workstream), notifications, calendar | nothing |
| Calendar / 60-day forecast | register milestones, scope start/target, pours, episodes, procurement deliveries, manual entries | manual entries in `events` |

- All "today" comparisons use **Asia/Manila** (`manilaIso` / `todayIso` in `src/domain/dates.ts`); weeks start Monday.
- Roles: Admin/Manager see everything and manage calendar entries; Engineer/Production/Staff see notifications only for activities where they are owner/supporting; Viewer gets project notifications read-only.
- Chart.js 4.4.1 loads from cdnjs; if unreachable, charts fall back to plain lists.
- **Deploy the updated `firestore.rules`** (new `events` and `userPrefs` matches). Until then, read state, preferences and calendar entries are kept in the browser and flagged.
- Code: `src/domain/notifications.ts`, `calendarEvents.ts`, `executive.ts`; `src/command/Notifications.tsx`, `ExecutiveDashboard.tsx`, `CalendarPage.tsx`, `charts.tsx`, `exec.css`; `src/firebase/userPrefsStore.ts`.

## 10. Unified Convengers brand layer (reference-based redesign)

Visual only — no data, calculations, schedules or modules changed.

- **Branding header** (`src/components/BrandHeader.tsx`): purple band with the Convengers wordmark (cropped from the existing emblem), "Convengers Assemble / Bahay Build ///", "Project Management System" (portal: "Executive & Client Reporting Portal"), golden stripes. Hidden in print.
- **Toolbar**: same existing controls, reordered (Data & settings, version, sync, user, admin, presentation, notifications, share, theme, edit, print) with one icon set (lucide).
- **All modules** (`src/theme-brand.css`, loaded last): navy section titles with golden `///`, purple banner card headers, white KPI cards with navy figures, solid status badges (green completed · purple ongoing · red delayed · blue upcoming · gray on hold), clean table headers with alternating rows, consistent button heights. Light theme; the optional dark theme keeps working.
- **Command Center**: solid status summary cards (green / purple / red / blue / navy / orange), yellow health-summary strip, management-attention cards showing status, schedule, workstream, owner and dependencies.

- Update: the branding header uses the same deep indigo palette as the left side panel (internal system and portal); all golden diagonal stripes and `///` accents were removed.

## 10. Client-first platform — portal is the default view

| Step | Behaviour |
|---|---|
| Open the website | Everyone (no sign-in) sees the **Executive & Client Reporting Portal** — published, approved content only |
| Header | Small **Internal Login** link (upper-right; in the top bar on phones) |
| After login | Internal roles go to their dashboard: Admin / Project Manager → Command Center · Site Engineer → Construction · Production Coordinator → Production · Team member → Master Tracker. External roles stay on the portal |
| Internal URL without access | Guests are returned to the portal with the login dialog; external accounts are returned to the portal |
| Sign out | Returns to the public portal |

Access (server-enforced in `firestore.rules`):

- **Public / Client / Stakeholder** — portal records of kinds `snapshot`, `report`, `photo`, `consideration`, `update`.
- **Project Owner / Executive** — the above + approved project documents (`document`).
- **Internal roles** — Master Project Tracker; every internal collection remains `isInternal()` (finance: manager only).
- Module navigation per internal role: `allowedModules()` in `src/auth/roles.ts`.

**Deploy `firestore.rules`** — until then visitors cannot read the portal (they see "not available at the moment").
