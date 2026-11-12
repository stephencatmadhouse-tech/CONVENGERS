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
