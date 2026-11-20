# Madhouse Standard – Interior Fit-Out Defect & Repair Classification System

Quality Assurance | Warranty Management | Repair Cost Assessment

A single-page React tool for classifying, estimating and verifying interior fit-out defect repairs
(residential, Philippines). Built as one self-contained HTML file (`dist/madhouse-standard.html`)
that runs as a Claude Artifact or opens directly in a browser.

Created by Ar. Stephen Catabijan / QQA.

## Modules

| Page | What it does |
|---|---|
| Dashboard | 8 KPIs and 6 charts over assessed defects or the master library, with 6 filters |
| Defect & Repair Library | 210 standardized items (22 fields each); search, filter, sort, add / edit / delete, duplicate detection, field-level history, CSV export, source consolidation register |
| Assessment Wizard | 5 steps: identification (with photos), extent of damage, safety screen, automatic classification, authorized validation with override justification |
| Repair Classification | Assessment register, classification framework, and a built-in self-test of scenarios A–G |
| Cost Estimator | Six cost components, Metro Manila / provincial rates, labor-only / materials-only / combined, contingency, budget vs actual variance |
| QA Inspection | Trade checklists with PASS / FAIL / FOR REINSPECTION / NOT APPLICABLE; completion is blocked until every mandatory check passes |
| Reports | 8 reports, previewed in-page, downloadable as print-ready HTML and CSV |
| Settings | User and role, storage status, JSON backup / restore, sample data controls |

## Source data

The library consolidates two tabs of the *WARRANTY DATA MANAGEMENT SYSTEM* workbook:

- **Copy of Warranty Repair Matrix** – 50 items (`WRM-01`…`WRM-50`), all preserved with their names, classification, trade, cost range and duration.
- **COMMON REPAIRS WITH COSTING (POST-CON)** – 32 entries (`CRC-m01`…`CRC-m17`, `CRC-M01`…`CRC-M15`), each a duplicate of a matrix item and merged into it.

Changes are listed in the in-app *Source consolidation* register: 3 cost ranges widened to cover both
sources (WRM-04, WRM-06, WRM-08), 15 source priorities mapped to the P1–P4 scale, and 10 observations
where the source classifies an item Major below the ₱15,000 guide. 160 items are Madhouse Standard additions (`MS-NEW`).

All costs are indicative budgetary references, not quotations.

## Classification engine (`src/engine.js`)

- **Critical** = confirmed safety hazard (electrical exposure / overheating, unstable glass, ceiling sag, structural movement, immediate occupant risk, flooding, or active leak near electrical). Always P1.
- **Major / Minor** = repair scope. Reconstruction → Major; extensive + dismantling / replacement / several components → Major; otherwise a score ≥ 3 → Major.
- **Priority** is assessed separately (P1 Emergency, P2 Urgent, P3 Normal, P4 Cosmetic).
- "Not sure" safety answers never auto-escalate but raise priority to P2 and require specialist inspection.

## Storage

`src/store.js` exposes a `StorageAdapter` interface. `LocalStorageAdapter` (browser local storage, per device)
is active. `FirebaseAdapter` is a placeholder with the same interface and is **not connected**.

## Build and test

```bash
npm install
npm run build   # writes dist/madhouse-standard.html
npm test        # engine scenarios A–G and cost maths
```
