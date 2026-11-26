# Production Alignment & Educational Shoot Calendar

**CONVENGERS PRODUCTION ALIGNMENT** links construction milestones, the educational episodes that document them, and the production schedule.

* **Stakeholders** open it in the client portal under **Production Alignment**. They must be signed in; see "Who sees it" below.
* **The team** manages it in the internal app under **Construction Operations → Production Alignment**, with three tabs: Dashboard, Episodes and Revision History.

## Where the data comes from (no duplicate records)

| Information | Source |
|---|---|
| Episode number, title, topic, target shoot dates, director, characters, status, location | existing `episodes` records |
| Character names | existing `characters` records |
| Construction milestones: current, original and actual dates, status, commitment | the Master Project Tracker register (scopes, concrete pours, project milestones) |
| Episode → construction links | the episode's **depends on** list, the same field used by the activity editor and the Gantt chart. When nothing is set, the link is matched automatically from the episode's scope of work and labelled "linked automatically". |
| Target-date revision history | the existing activity revision log (every module records it) |
| Production-only details: classification, objective, description, duration, team, character availability and roles, checklist, proposed / confirmed / actual dates, construction reviews, history | **new** `episodeProduction/{episodeId}`, one document per existing episode |

Nothing is invented. A missing value is shown as **"Awaiting Information"**. Characters come only from the character records, and the avatars are initials because the database has no character illustrations.

## Scheduling rules

* **Time-sensitive vs non-time-sensitive.**
  * An episode linked to construction is time-sensitive; one that is not linked is non-time-sensitive.
  * The production team can override the classification. The dashboard says when a classification was set automatically.
* **Projected dates.**
  * A time-sensitive episode's projected date comes from its linked construction activity.
  * **A projected date is never treated as a confirmed shoot date.**
* **Confirming a shoot date.**
  * Only a **director or project manager** confirms a shoot date, either by approving a proposed alternative or by confirming a date directly.
  * The confirmed date becomes the episode's target date in every module, and the episode status becomes *Scheduled*.
  * The construction dates at the moment of confirmation are recorded with it.
* **Construction moves.**
  * When a linked construction activity later moves, every dependent episode is flagged **FOR REVIEW** (orange) and an advisory is raised.
  * **Shoot dates are never moved automatically.**
  * The director either keeps the date ("Reviewed — keep the current shoot date") or confirms a revised one.
* **What the production team (staff) can do.**
  * Plan: classification, team names and confirmations, character roles and availability, checklist, actual filming dates.
  * **Propose** alternative dates. They cannot confirm dates, confirm the director, or review construction changes; the security rules enforce this.
* **Batch filming.** Select several non-time-sensitive episodes and give them one filming day. A director confirms the day; staff propose it.
* **Production windows.** These are days in the next 60 days with no construction-dependent filming, suitable for batching non-time-sensitive episodes.

### Alignment colours

| Colour | Meaning |
|---|---|
| Green | Production aligned, or shoot completed |
| Yellow | Shoot or linked milestone within 14 days, and preparation not finished |
| Orange | Schedule adjustment required. One of: the construction date changed since the last review; the shoot date falls outside the linked construction window; the shoot date passed with no filming date recorded |
| Red | A linked construction milestone is delayed |
| Gray | Not yet scheduled |

### Readiness and assignment

* **Checklist items:** script, talking points, construction milestone confirmed, characters confirmed, director approved, site access, camera team, shoot completed, footage uploaded, documentation.
* Four of these are filled in automatically from the records:
  * construction milestone confirmed: started, completed, or its date confirmed by the construction team;
  * characters confirmed: every character marked available;
  * director approved: shoot date confirmed;
  * shoot completed: actual filming date recorded.
* **Assignment status:**
  * *For Assignment*: the director, production coordinator or camera team is missing.
  * *For Confirmation*: someone has not confirmed yet.
  * *Confirmed* or *Completed*.

## Dashboard sections

1. **KPI cards:**
   * total episodes (completed and upcoming);
   * upcoming shoots this month (confirmed and tentative);
   * construction-dependent episodes;
   * non-time-sensitive episodes;
   * production readiness: ready, awaiting director, awaiting characters, awaiting construction.
2. **At a glance:** next shoots, items needing immediate coordination, alignment colour counts, and whether production is on track.
3. **Production schedule advisories:**
   * milestone approaching, shoot approaching, milestone delayed, schedule affected;
   * characters not confirmed, director approval pending, team incomplete, documentation pending.
   * Each advisory has its impact, the required action and its status. All advisories are derived from the current records.
4. **Master episode calendar:**
   * views: Month (default), Week, and Agenda (the whole series);
   * navigation: previous / next / Today, month and year selectors, and a strip of every month from the first shoot to the projected completion;
   * filters: character, classification, construction milestones on or off.
5. **Construction-to-content alignment:** two synchronized timelines, construction milestones on top and episodes below, joined by connecting lines. Click a milestone to highlight its dependent episodes. Phones show a list of each milestone with its episodes.
6. **Cast & character alignment:** a profile card for each character, plus an availability matrix (character, episode, target shoot, availability, status). Both filter the calendar by character.
7. **Production team alignment:** who is involved in upcoming shoots, who still needs to confirm, what is awaiting director approval, what needs construction coordination, what is ready for execution, and an episode progress tracker.
8. **Monthly production planning:**
   * A — construction milestones;
   * B — shoot targets;
   * C — alignment, with production windows;
   * D — character filming days;
   * E — the director's view: priorities, deadlines, creative direction, conflicts.
   * Includes a one-paragraph summary for stakeholder meetings.
   * **Schedule conflicts** are characters booked on overlapping shoots at different places, plus delayed or misaligned episodes.
9. **Episode detail:** information, schedule (original, revised, projected, proposed, confirmed, actual), characters, assignments, checklist with completion %, and revision history.
10. **Presentation mode:**
    * full screen, with large type;
    * the month calendar, upcoming milestones and shoots, the time-sensitive vs flexible split, readiness, character involvement and conflicts;
    * use ← → to change month and Esc to exit.
11. **Print monthly summary:** a printable page for meetings.

## Who sees it

| Who | Access |
|---|---|
| Directors, project managers, administrators | Everything: confirm dates, review construction changes, publish |
| Production team and other staff | Plan and propose |
| Internal viewers | Read only |
| Signed-in clients, stakeholders, owners and executives | The published copy in the client portal |
| The public (not signed in) | Nothing. The page asks them to sign in, because it contains people's names and availability. |

**Publishing:**
* A manager clicks **Publish to client portal** on the Dashboard tab. This writes `portal/PRODUCTION-ALIGNMENT`, kind `production`.
* While it is published, the copy updates automatically whenever records change, as long as any manager has the app open.
* The client copy leaves out editor names and internal remarks.
* **Unpublish** withdraws it.

Production advisories also appear in the internal **notification center** for directors, managers and the production team.

## Before using it

**Publish the updated `firestore.rules`.** They add:
* the `episodeProduction` collection, where staff plan and managers approve;
* the `production` portal kind, readable by signed-in portal users only.

## Tests

| Suite | Result |
|---|---|
| Unit: sources, classification, projected ≠ confirmed, construction moves flagged without moving dates, delays, readiness / assignment / availability, KPIs, monthly plan, cast matrix, windows | 7 new (81 in total) |
| Security rules: staff plan and propose but cannot confirm or review; client and stakeholder read the published copy; public and pending users cannot | 24 new (150 in total) |
| Browser: Production Alignment | 19 / 19 |

The browser test covered:
* KPI totals match the database;
* a staff proposal followed by a director approval, applied to the episode;
* batch filming;
* construction moved → FOR REVIEW → reviewed;
* milestone linking saved as a dependency;
* the published copy is client-safe and updates automatically;
* client calendar views, filters, detail panel, presentation mode and printing;
* a public visitor is blocked;
* the phone layout has no sideways scrolling;
* notifications appear;
* no page errors.
