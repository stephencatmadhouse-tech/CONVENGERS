# Command Center — Construction Project Intelligence Dashboard

The Command Center (`#/command`) was redesigned to make the information hierarchy clearer. The previous version showed:
* a KPI strip;
* activity and attention counters;
* an 8-row management actions table;
* milestone and activity tables;
* workstream bars;
* three "pulse" cards;
* the narrative card.

All of these appeared at the same time. No routes, records, permissions or back-end processes changed.

## Important announcements

The **holiday work stoppage** is a project announcement, not a milestone.

**Dates:**
* Stoppage: December 21, 2026 – January 2, 2027.
* Work resumes: Monday, January 4, 2027.

**Where it appears:**
* A pinned banner at the top of the Command Center, on desktop and phone, until work resumes.
* The Project Calendar: an *Announcement* entry on December 21 and on January 4.
* Notifications ("Important announcement"), from 14 days before the stoppage until work resumes.
* The schedule calculations, Gantt shading and presentation slides, all of which use the same dates (`WORK_STOPPAGE_START` / `WORK_STOPPAGE_END`).

**The former milestone records:**
* The milestone records "Work stoppage: work stops after Dec 19, 2026" and "Work resumes" are kept in the database and in backups.
* They no longer appear in any milestone list, count, timeline, report or client snapshot.

**Client portal:**
* **Prepare for Client Portal** (managers) creates a draft in Client Portal Management → Updates & Announcements, with the category *Important announcement*.
* Clients see it only after the usual review and publishing.

## 1. Audit — existing components and data sources

| Existing element | Data source | In the redesign |
|---|---|---|
| Project Status KPIs (actual, planned, variance, status, target, forecast) | `computeMetrics` (register, milestones) | **Executive Overview** KPI cards and the **Construction Progress** ring |
| Quick actions | routes | Kept: compact chip row under the header, plus a **Daily Report** shortcut |
| Narrative Reports card | `narrativeReports`, schedule | Kept, under **More project detail** (collapsed) |
| Activity Status counters | `metrics.counts` | **Timeline** state chips (construction) and **Health** counters |
| Items Requiring Attention counters | issues, reports, publications | **Health** counters |
| Pending Management Actions table | `useManagementActions` (attention, issues, approvals) | **Action Required** list. The full table stays in *Items Requiring Attention*. |
| Upcoming Milestones table | register (milestones, pours) | Interactive **timeline markers** and the milestone KPI |
| Current and upcoming activities | register | Timeline chips (Ongoing / Upcoming) and the Health upcoming deadlines |
| Workstream progress bars | `metrics.workstreams` | **Progress by phase**, which expands to each phase's scopes |
| Blockers — deliveries, Priorities | procurement, outlook | Kept, under **More project detail** |
| Recent updates | register, procurement, documents, publications | The **Recent Activity** feed, now with daily reports, reports and narrative reports |
| Phone dashboard (`MobileDashboard`) | the same | Replaced by the responsive Command Center. Every item is covered, and notifications stay in the header bell. |

## 2. Field mapping

| Dashboard element | Records and fields | Formula |
|---|---|---|
| Overall progress | `scopes` (+ overrides), working-day weights | `computeMetrics.actualPct` — the same figure as the sidebar, Project Performance and the reports |
| Planned / variance / SPI | scope `plannedStart` / `plannedFinish` | `plannedPct`, `variancePct`, `spi` (null before planned work begins → "Not available") |
| Forecast / target | register dates, the turnover milestone | `forecastCompletion`, `targetCompletion` |
| Budget utilization | — | **Not tracked.** The Budget & Expenses module was removed at the owner's request on November 13. No figure is invented. |
| Completed milestones | register `kind = milestone`, status | `milestonesComplete / milestonesTotal`, plus the next open milestone |
| Pending action items | issues (open, Critical), register (status Delayed), approvals | critical + overdue + approvals — the same items as the Action Required list |
| Pending approvals | `dailyReports` (submitted / under review), `reports`, `publications`, `narrativeReports` (review) | count |
| Progress by phase | `metrics.workstreams` (actual, planned) | status: Completed / Ahead / On track / Slightly behind (≤3 pts) / Behind / Not started |
| S-curve | baseline (`plannedCurve`), `snapshots.actualPct`, live `actualPct` | Dates without a snapshot are left blank. The forecast runs from today's actual to 100% at the forecast completion. |
| Weekly progress | snapshots at week ends, register `actualFinish` | Change in points; "Not recorded" when no snapshot exists. Completed activities per week. |
| Timeline | register milestones and pours (`finish`, status) | Marker position by date. States: Completed / Ongoing / Upcoming / Delayed. |
| Site photos | `driveFiles` (photo, uploaded): `reportingDate`, `description`, `activityId`, `uploadedBy`, `driveFileId` | Viewed through `/api/drive/file/{id}`. Drive link for managers. |
| Daily / weekly documentation | `dailyReports`, `narrativeReports` (weekly), `reports` (weekly) | — |
| Before and after | `driveFiles` grouped by `activityId` | Earliest and latest photo of an activity, from different dates |
| Activity feed | register (`actualFinish`, `lastUpdated`, `updatedBy`), `activities.createdAt`, `documents`, `dailyReports.submittedAt`, `reports`, `narrativeReports` | Chronological, filtered by period |

All of these calculations live in `src/domain/commandCenter.ts` and the existing domain modules. The dashboard only reads records; it never writes.

## 3. Component hierarchy

```
CommandCenter
├─ sync banner (when not live) · header: health, as-of date, data refreshed time, live chip · period filter (Today / This Week / This Month / All Time)
├─ quick actions
├─ ExecutiveKpis            — 5 cards: progress ring, SPI gauge, budget (not tracked), milestone ring, pending actions
├─ ProgressAnalytics        — overall ring + stats · progress by phase (expandable) · tabs: S-curve | Weekly progress (click a week)
├─ TimelineSection          — state chips → activity list · timeline with today, target and forecast · milestone card → record
├─ HealthSection            — 4 counters (filters) · Action Required list → each record
├─ SiteDocs | ActivityFeed  — tabs: photos, daily reports, weekly reports, before and after | dated feed
└─ More project detail (collapsed) — NarrativeDashboardCard · OperationsPulse (deliveries, priorities)
```

Charts are pure SVG (`src/command/ccCharts.tsx`), with no new dependencies. Styles are in `src/command/commandCenter.css`, using the existing colour tokens, so dark mode works too.

## 4. Period filter

The period filter applies to:
* completed activities and upcoming starts (timeline chips);
* upcoming deadlines;
* site documentation;
* the activity feed;
* the weekly chart range.

Cumulative figures (KPIs, progress ring, phases, S-curve) are always project-to-date, and the section says so. The selected period is remembered on the device.

## 5. Responsive behaviour

| Width | Layout |
|---|---|
| ≥1360 px | 5 KPI cards in one row; analytics in two columns; documentation and feed side by side |
| 1100–1360 px | 3 + 2 KPI cards |
| 760–1100 px (tablet) | sections stacked |
| Phone | Order: status → progress → timeline / milestones → alerts → site documentation → activity. Two-column KPI grid with the progress card across the full width. Scrollable tabs and quick actions. The timeline scrolls inside its card. |

## 6. Tests

| Suite | Result |
|---|---|
| Unit tests (period ranges, S-curve, weekly progress, phase status, timeline positions) | 4 new (65 in total) |
| Browser — Command Center | 14 / 14 |

The browser checks covered:
* **KPI cards:** five cards; budget shown as "Not tracked" without a figure.
* **Same progress figure everywhere:** the KPI, the ring, the sidebar, Project Performance and the Weekly Report all agree.
* **Counts against the database:** approvals match the database count; the critical-issue count matches; pending actions = critical + overdue + approvals.
* **Overdue matches the tracker:** the overdue count equals the tracker's "Delayed" filter.
* **Drill-downs:**
  * an alert filter, then a record opens;
  * phase scopes open their records;
  * S-curve tooltip and legend;
  * a week opens its weekly report;
  * a milestone marker opens its record;
  * the state chips list activities.
* **Site documentation:** photos load; daily reports match the database; the feed lists reports.
* **Filters:** the period filter applies and is remembered.
* **Header and collapsed detail:** the refresh time shows; the secondary detail is collapsed.
* **Roles:** engineer access, with no Drive links; clients are not let in.
* **Layouts:** laptop, tablet and phone, with no sideways scrolling, and the phone section order checked.
* **Errors and data:** no console errors, and every core collection is unchanged after using the dashboard.
