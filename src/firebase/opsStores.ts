/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Store instances for the operations and publishing collections.
 *
 * Internal-only collections (server rules: internal roles only):
 *   procurement, manpower, documents, publications
 * External portal collection (server rules: internal + external roles):
 *   portal — ONLY sanitized, approved & published content is ever written here.
 */

import { where } from 'firebase/firestore';
import { CollectionStore } from './collectionStore.ts';
import {
  ProcurementItem,
  ManpowerPlan,
  ProjectDocument,
  Publication,
  CalendarEvent,
  SiteReport,
  DriveFile,
  DailyReport,
  EpisodeProduction,
} from '../types/index.ts';
import { PUBLIC_PORTAL_KINDS, type PortalRecord } from '../domain/portal.ts';
import type { ClientConfigDoc } from '../domain/journey.ts';
import type { NarrativeReport, NarrativeSchedule } from '../domain/narrative.ts';

const byDateDesc = (k: string) => (a: any, b: any) => String(b[k] || '').localeCompare(String(a[k] || ''));

export const procurementStore = new CollectionStore<ProcurementItem>('procurement', (a, b) =>
  String(a.requiredDate || a.expectedDelivery || '9999').localeCompare(String(b.requiredDate || b.expectedDelivery || '9999'))
);
export const manpowerStore = new CollectionStore<ManpowerPlan>('manpower', (a, b) => a.start.localeCompare(b.start));
export const documentStore = new CollectionStore<ProjectDocument>('documents', byDateDesc('date'));
export const publicationStore = new CollectionStore<Publication>('publications', byDateDesc('updatedAt'));
/** Manually added calendar entries (server rules: internal read; admin / manager write). */
export const eventStore = new CollectionStore<CalendarEvent>('events', (a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
/** Client experience configuration: construction journey stages and the project profile (server rules: internal read; admin / manager write). */
export const clientConfigStore = new CollectionStore<ClientConfigDoc>('clientConfig');
export const portalStore = new CollectionStore<PortalRecord>('portal', byDateDesc('publishedAt'));
/** Public client-facing dashboard: published records of the public kinds only (readable without sign-in). */
export const publicPortalStore = new CollectionStore<PortalRecord>('portal', byDateDesc('publishedAt'), [where('kind', 'in', PUBLIC_PORTAL_KINDS)]);
/** Production Alignment published for signed-in stakeholders (server rules: internal and external portal roles, not the public). */
export const productionPortalStore = new CollectionStore<PortalRecord>('portal', byDateDesc('publishedAt'), [where('kind', '==', 'production')]);
/** Production details for existing episodes — one document per episode ID (server rules: internal read; staff plan; managers approve). */
export const episodeProductionStore = new CollectionStore<EpisodeProduction>('episodeProduction');

/** Daily site reports submitted from the field (server rules: internal read; staff-level create / update of their own reports). */
export const siteReportStore = new CollectionStore<SiteReport>('siteReports', (a, b) => (b.date + b.submittedAt).localeCompare(a.date + a.submittedAt));

/** Google Drive file metadata (written by the server's Drive service; read-only in the app except publication). */
export const driveFileStore = new CollectionStore<DriveFile>('driveFiles', (a, b) => String(b.uploadedAt || '').localeCompare(String(a.uploadedAt || '')));
/** Daily Construction Reports (server rules: internal read; preparer edits until review; managers review). */
export const dailyReportStore = new CollectionStore<DailyReport>('dailyReports', (a, b) => (b.date + (b.submittedAt || b.updatedAt)).localeCompare(a.date + (a.submittedAt || a.updatedAt)));

/** Narrative reports (server rules: internal read; staff create drafts; managers approve and finalise; the generated original never changes). */
export const narrativeStore = new CollectionStore<NarrativeReport>('narrativeReports', (a, b) => (b.periodEnd + b.createdAt).localeCompare(a.periodEnd + a.createdAt));
/** Narrative preparation schedule — one document `schedule` (server rules: internal read; managers write). */
export const narrativeConfigStore = new CollectionStore<NarrativeSchedule>('narrativeConfig');

export const INTERNAL_STORES = [procurementStore, manpowerStore, documentStore, publicationStore, eventStore, siteReportStore, dailyReportStore, narrativeStore, narrativeConfigStore, episodeProductionStore];
