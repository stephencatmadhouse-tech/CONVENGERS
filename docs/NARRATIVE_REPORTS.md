# Automated Narrative Report Generator

**Reports & Documents → Narrative Reports** turns the recorded project data into formal construction narrative reports. You can review, edit, approve and archive them, and export them as PDF or Word in the CONVENGERS layout.

## End-to-end flow

```
Site personnel submit Daily Construction Reports (photos → Google Drive)
        │  stored in Firestore `dailyReports`, photos in `driveFiles`
        ▼
Generate (by hand, or prepared on schedule)
        │  collectFacts()     records for the period (see "Data sources")
        │  composeSections()  factual narrative B–K; gaps say "Not Recorded"
        │  optional AI wording (server) — every section is checked against the facts
        ▼
Draft → Submit for Review → Approve → Generate Final Report (locked)
        │  every save is a revision; the generated original never changes
        ▼
Export PDF / print or DOCX (CONVENGERS template) · Archive (search, filter, compare)
        └─ linked back to the daily reports, tracker, issues and the previous report
```

## Daily → weekly → monthly chain

```
Daily Construction Report (required reporter, every working day: Monday–Saturday except holidays)
   │  submitted / edited / approved
   ▼
Weekly Accomplishment Report  — draft created automatically when the first daily report of the week is submitted,
   │                             and rebuilt each time a daily report of that week changes
   ▼
Monthly Construction Progress Report — consolidated week by week from the weekly reports (and their daily reports),
                                       rebuilt whenever a weekly or daily report of the month changes
```

* **Required daily reporter** (Narrative Reports → Schedule, managers):
  * Choose the person who must submit the Daily Construction Report, for example the site engineer.
  * Administrators see every staff account. Managers see everyone who has submitted daily reports.
* **Coverage:**
  * Weekly and monthly reports state how many working days up to the report date have a submitted report from that person, and list the days without one.
  * Working days follow the project calendar: Monday–Saturday, excluding Philippine holidays, the NCR special non-working days and the December stoppage.
  * Reports filed on non-working days are still included.
* **Reminders:** a working day in the last 7 days without a report appears in **Notifications** ("Daily report missing"). The required reporter and managers see it.
* **Automatic updates:**
  * They apply only to **drafts nobody has edited**. Each update is a revision ("Updated automatically …"), and the generated original never changes.
  * If someone edited the draft, it is not overwritten. The editor shows a notice with **Refresh from Records**, and the edited text stays in the revision history.
  * Reports **For Review, Approved or Final never change by themselves**. If their records change afterwards, the editor shows a notice.
* **Monthly report content:**
  * a paragraph per week: its weekly report reference and status, the activities recorded in that week's daily reports, completed activities, and progress at week end;
  * the conclusion of each approved weekly report;
  * links to the weekly reports.
* **Weekly & Monthly Reports (the tracker-based reports):** they now include a **Daily Construction Reports** section. It shows coverage, missing days, worker-days, and each report's reference (linked), preparer, status, activities, manpower, photos and concerns. The section is also in the CSV export. Reports approved before this change keep their frozen content.
* **Where it runs:** the automation runs in the app for signed-in staff, so updates happen as soon as anyone on the team has the app open.

## Report types

| Type | Default period |
|---|---|
| Daily Narrative Report | one day |
| Weekly Accomplishment Report | Monday – Sunday |
| Monthly Construction Progress Report | calendar month |
| Project Milestone Report | calendar month (milestones and concrete pours) |
| Construction Activity Report | one Master Project Tracker activity, from project start |
| Project Status Report | project start to the chosen date |
| Overall Project Summary | project start to the chosen date |

All periods can be changed before generating. One report exists per type, period and activity (fixed ID `NR-<type>-<start>-<end>`, shown as `NAR-…`). Generating the same period again opens the existing report. Use **Refresh from Records** to rebuild its text.

## Structure

A. Project information · B. Executive summary · C. Construction activities · D. Work accomplishments · E. Manpower and resource utilisation · F. Project progress (planned vs actual table) · G. Issues and concerns · H. Corrective actions · I. Next period work plan · J. Photo documentation · K. Conclusion · References and attachments.

## Data sources (recorded data only)

* **Daily Construction Reports** with status *Submitted*, *Under Review* or *Approved*. Drafts and pending reports are not used. The narrative uses each report's:
  * activities, work descriptions and reported accomplishments;
  * reported progress, worded as "reported", because it does not change the tracker until a manager applies it;
  * manpower, materials and equipment;
  * observations, issues, delays, safety notes, corrective actions and recommendations;
  * uploaded photos.
* **Master Project Tracker:** completed, ongoing and delayed activities, milestones, concrete pours, inspections and corrective actions. Production shoots are excluded from construction narratives.
* **Progress figures:** planned vs actual and the schedule performance index come from the same formulas as the dashboards. Progress gained in the period comes from recorded progress snapshots; without a snapshot it is "Not Recorded".
* **Other records:**
  * the issues, risks and decisions log;
  * manpower plans;
  * procurement deliveries;
  * Project Calendar entries;
  * Document Repository files;
  * the previous approved report of the same type.

**Rules applied by the generator:**
* It never invents activities, quantities, dates, percentages, manpower figures or accomplishments.
* Missing information is written as **Not Recorded**.
* A report with no manpower entered is listed as "manpower not recorded", never as zero workers.
* A report with no activities is described as such.
* Photographs are described only by their own metadata: date, type, caption, source report and activity. The text never treats a photo as proof of progress.

## AI wording (optional)

When the server has `GEMINI_API_KEY`, **Improve the wording with AI** is available. It appears when generating, and as **Improve Wording (AI)** in the editor.

* The browser sends the factual sections to `/api/narrative/ai`. Only signed-in internal staff can call it. The key stays on the server.
* Gemini is instructed to rewrite in a formal, chronological tone, using only the given facts.
* The server checks every returned section and **rejects** it, keeping the factual text, if it:
  * adds a number or date that is not in the factual text;
  * adds a quantity word ("three", "several", …);
  * adds a capitalised name or term (an activity, supplier, person or place);
  * drops "Not Recorded";
  * is much longer than the factual text.
* Rejected sections and reasons are kept with the original version (**Original Version** shows them).
* Without the key, reports are written from the records only and everything else works the same.

| Server variable | Required | Value |
|---|---|---|
| `GEMINI_API_KEY` | for AI wording only | Gemini API key (AI Studio Secrets panel). Never put it in frontend code. |
| `GEMINI_MODEL` | no | default `gemini-2.5-flash` |

## Review, approval and revisions

| Status | Who | What |
|---|---|---|
| Draft | any staff member | edit paragraphs, attach photos and documents, edit captions, Refresh from Records, Submit for Review |
| For Review | managers, directors, administrators | edit, **Approve**, or **Return for Revision** (a note is required) |
| Approved | managers, directors, administrators | **Generate Final Report**, or return for revision |
| Final | — | locked; only an administrator can correct it |

* Reports are **never submitted, approved or published automatically**. Narrative reports are internal; nothing reaches the client portal.
* `original` holds the version produced by the generator, plus the factual draft it came from. The database rules refuse any change to it.
* Every save and status change adds a revision (who, when, action, note). The latest 25 revisions keep the full text.
* Delete: an administrator, or the preparer of a draft.

## Scheduled preparation

**Schedule** tab. Managers turn daily, weekly or monthly preparation on or off; weekly and monthly are on by default.

* When a staff member opens the system after a period ends, the report for the last complete period is prepared as a **draft** if it does not exist yet. Daily reports cover yesterday, weekly reports the previous Monday–Sunday, and monthly reports the previous month.
* The fixed report ID prevents duplicates.
* Preparation dates and prepared reports appear in the **Project Calendar** (type *Report*) and on the Command Center card.
* A browser app cannot run on a timer while nobody has it open. Preparation therefore happens on the first visit after the period ends. If unattended preparation is needed later, the same `buildReport` code can run from a scheduled server job.

## Export

* **PDF / Print:**
  * A4, with the CONVENGERS header (logo, title, reference, period, status).
  * Numbered sections, planned-vs-actual table, and a two-column photo grid with captions.
  * Sign-off block (prepared, reviewed and approved by).
  * Every page has the footer "Page X of Y" and the reference.
  * Choose *Save as PDF* in the print dialog.
* **DOCX:** a native Word file built in the browser, with no extra libraries:
  * header with the logo and reference;
  * footer with the PAGE / NUMPAGES fields;
  * Title and Heading styles in the CONVENGERS navy and violet;
  * tables and the embedded photos.

## Archive

* **Report Archive:**
  * search across reference, title, preparer and text;
  * filter by type, status and period;
  * open any report to review or download it.
* **Compare (tick two reports):**
  * key figures side by side with the change: progress, variance, completed and delayed activities, daily reports, worker-days, open issues and photos;
  * every section side by side.
* **Links:** each report keeps the IDs of its source daily reports, activities, issues and previous report. The References section links to them.

## Database

| Collection | Rules |
|---|---|
| `narrativeReports/{id}` | internal read. Staff create their own drafts and edit drafts; managers review, approve and finalise; `original`, period, type and preparer are unchangeable; final reports are locked except for administrators; client roles have no access |
| `narrativeConfig/schedule` | internal read; managers write |

**After deploying, publish `firestore.rules`.** These are new collections. Until the rules are published, reports save on the device only.

## Tests

| Suite | Result |
|---|---|
| Unit tests: facts only, "Not Recorded", blank reports, production excluded, periods and IDs, schedule dates, AI guard | 12 narrative and chain tests (59 in total) |
| AI endpoint (emulators + mock Gemini): not configured, access by role, accepted rewrite, fabricated figures / names / quantity words rejected per section, outage, input limits | 6 / 6 |
| Security rules: create / edit / submit / approve / finalise / delete by role, original protected, period protected, final locked, client and public denied, schedule config | 25 new (110 in total) |
| Browser, desktop and iPhone: generate from real submitted daily reports (figures checked against the database, drafts excluded); edit, save and reload; original preserved; submit; return with note; approve; final; PDF with photos and page numbers; DOCX validated (zip, XML, images, PAGE field) and rendered; AI accepted / fabrication rejected / outage; photo and document attachments; activity report; scheduled drafts; schedule permissions; calendar entries; archive search, filters and compare; Command Center card; client denied; no sideways scrolling on the phone | 17 / 17 |
| Daily → weekly → monthly, in the browser: required reporter (admin sees all staff); weekly and monthly drafts created automatically from submitted daily reports; coverage text; monthly consolidation and links; a daily report edit flows into the weekly and then the monthly draft; edited drafts not overwritten (notice + Refresh from Records, edits kept in history); approved weekly unchanged with a notice; the monthly shows the weekly as approved; daily section in the tracker-based weekly / monthly reports; missing-report notifications for the reporter; Schedule tab | 10 / 10 |
