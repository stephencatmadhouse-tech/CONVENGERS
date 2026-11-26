# Production Calendar & Stakeholder Scheduling

Stakeholders see upcoming construction work, content production, photo and video shoots, meetings, milestones and announcements in the **client portal → Production Calendar**, without access to the internal system. The project team manages the schedule in **Client Experience → Production Calendar**.

## Architecture: one schedule, no separate database

```
Production team ──propose──► events (existing calendar collection) ◄──create / edit── Administrators
                                   │  approve · publish · reschedule · status · photos · attachments
                                   │  every save of a published, stakeholder-visible event re-publishes it
                                   ▼
                          portal/EVT-<id>  (existing client-portal collection, kind "event", client-safe copy)
                                   ▼
             Client portal → Production Calendar (month · week · timeline · upcoming · update indicators)
```

* **Storage:**
  * Events live in the existing calendar collection `events`, extended with optional fields.
  * Entries already added in the Project Calendar keep working and appear in the module; older entry types map to categories, e.g. *Meeting* → Meetings & Coordination.
* **Publishing:** published events are copied to the existing `portal` collection (kind `event`) by the same mechanism as status updates, photos and reports.
  * The copy carries the title, description, category and type, dates and times, location, responsible department, phase, status, published photos and Drive attachments.
  * **Assigned personnel names and internal notes are never copied.**
* **Event photos and attachments** are stored in Google Drive. When the event is published they are marked *published* in the app, so the portal can show them. Drive sharing settings are not changed.
* **Construction schedule and milestones** from the latest published Project Status Update also appear in the stakeholder calendar, so the schedule is visible even before events are published.

## Categories and types

| Category | Types |
|---|---|
| Construction Activities | Structural works, Concrete pouring, Masonry, Electrical, Plumbing, Roofing, Architectural and finishing works |
| Content Production | Episode filming, B-roll shooting, Site documentation, Interviews, Behind-the-scenes content |
| Photography & Videography | Progress photography, Project documentation, Drone footage, Marketing content shoots |
| Meetings & Coordination | Client meetings, Site meetings, Design coordination, Contractor meetings, Technical discussions |
| Project Milestones | Construction phase completion, Major project accomplishments, Target completion dates, Project turnover |
| Stakeholder Announcements | Important project announcements, Schedule changes, Upcoming activities, Progress releases |

Statuses: Scheduled · Confirmed · Ongoing · Completed · Rescheduled · Postponed · Cancelled.

## Event fields

Every event can hold:
* title, description, category and type;
* start and end date, start and end time;
* location, assigned personnel, responsible department, project phase;
* status, photos, attachments, additional notes;
* visibility (stakeholder-visible or internal only).

## Roles

| Who | Can |
|---|---|
| Administrators, directors, project managers | Create, edit, delete, reschedule, change status, assign personnel, upload photos and attachments, mark stakeholder-visible or internal-only, publish and unpublish, approve proposals |
| Production team and other staff | **Propose** schedules, and edit or withdraw their own proposals until approved. Proposals are never published. |
| Internal viewers | View |
| Clients and the public | See published events in the client portal only |

These permissions are enforced by `firestore.rules`, not only by the interface.

## Schedule changes and indicators

* **Change log:** every reschedule or status change is recorded on the event (previous date and time, new date and time, editor, timestamp). It is listed under **Change Log** and in each event's history.
* **What stakeholders see when a published event is added, rescheduled, postponed or cancelled:**
  * an update tag on the event;
  * a **Schedule updates** panel at the top of the calendar;
  * a count on the *Production Calendar* menu item and a note on the portal home page (14 days).
  * Rescheduled events show the previous date.
* **No new notification service:** the existing portal update indicators are reused. Internally, the Project Calendar shows every entry, including proposals, which are marked "(proposed)".

## Stakeholder calendar

* **Views:**
  * Month, with category colour bars;
  * Week;
  * Timeline: three months, with bars and milestone diamonds.
* **Navigation:** Previous, Next and Today; category filter in the legend; click an event for details.
* **Upcoming Activities:** the next 8 activities in date order, with **Today** and **This week** highlighted and a day countdown on milestones.
* **Phone:** a compact month with category dots (tap a day to list its activities), large touch targets, a scrollable upcoming list, and Calendar in the bottom navigation. *Documents & Reports* moves to the menu.
* **Home pages:** the desktop and phone portal home pages show the next three activities with a link to the calendar.

## Before using it

**Publish the updated `firestore.rules`.** They allow:
* staff proposals in `events`;
* the new public `event` kind in `portal`.

Until they are published, proposals and publishing are refused or kept on the device only.

## Tests

| Suite | Result |
|---|---|
| Unit tests (category mapping, change records, client-safe copy, update indicators, client list and de-duplication, upcoming and countdown, month grid) | 5 new (74 in total) |
| Security rules (proposals, approval, publish, delete, client and public read) | 16 new (126 in total) |
| Browser — Production Calendar | 11 / 11 |

The browser checks covered:
* **Admin create and publish:** an event with a Drive photo, with no personnel or notes in the client copy, and the photo marked published.
* **Internal-only events:** never reach the portal; both events appear in the internal Project Calendar.
* **Client view:** sees only the published event; the details show location, team and time, and the photo loads.
* **Calendar views:** upcoming "this week", the week and timeline views, Previous / Next / Today.
* **Reschedule:** the portal updates, and the change is logged with the previous date and editor.
* **Live update for the client:** the banner, the tag and the menu badge appear.
* **Proposals:** a staff proposal waits for approval, then is approved and published.
* **Status changes:** cancelled shows on the portal; unpublish removes the event.
* **Public visitor on a phone:** compact month, day list and details, no sideways scrolling.
* **Errors:** no page errors.
