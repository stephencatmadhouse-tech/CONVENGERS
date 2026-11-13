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
} from '../types/index.ts';
import { PUBLIC_PORTAL_KINDS, type PortalRecord } from '../domain/portal.ts';

const byDateDesc = (k: string) => (a: any, b: any) => String(b[k] || '').localeCompare(String(a[k] || ''));

export const procurementStore = new CollectionStore<ProcurementItem>('procurement', (a, b) =>
  String(a.requiredDate || a.expectedDelivery || '9999').localeCompare(String(b.requiredDate || b.expectedDelivery || '9999'))
);
export const manpowerStore = new CollectionStore<ManpowerPlan>('manpower', (a, b) => a.start.localeCompare(b.start));
export const documentStore = new CollectionStore<ProjectDocument>('documents', byDateDesc('date'));
export const publicationStore = new CollectionStore<Publication>('publications', byDateDesc('updatedAt'));
/** Manually added calendar entries (server rules: internal read; admin / manager write). */
export const eventStore = new CollectionStore<CalendarEvent>('events', (a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
export const portalStore = new CollectionStore<PortalRecord>('portal', byDateDesc('publishedAt'));
/** Public client-facing dashboard: published records of the public kinds only (readable without sign-in). */
export const publicPortalStore = new CollectionStore<PortalRecord>('portal', byDateDesc('publishedAt'), [where('kind', 'in', PUBLIC_PORTAL_KINDS)]);

export const INTERNAL_STORES = [procurementStore, manpowerStore, documentStore, publicationStore, eventStore];
