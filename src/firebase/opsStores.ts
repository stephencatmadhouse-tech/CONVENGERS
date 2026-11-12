/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Store instances for the operations and publishing collections.
 *
 * Internal-only collections (server rules: internal roles only):
 *   procurement, manpower, documents, publications
 * Restricted finance collections (server rules: admin / project manager only):
 *   budget, expenses
 * External portal collection (server rules: internal + external roles):
 *   portal — ONLY sanitized, approved & published content is ever written here.
 */

import { CollectionStore } from './collectionStore.ts';
import {
  ProcurementItem,
  ManpowerPlan,
  BudgetLine,
  Expense,
  ProjectDocument,
  Publication,
} from '../types/index.ts';
import type { PortalRecord } from '../domain/portal.ts';

const byDateDesc = (k: string) => (a: any, b: any) => String(b[k] || '').localeCompare(String(a[k] || ''));

export const procurementStore = new CollectionStore<ProcurementItem>('procurement', (a, b) =>
  String(a.requiredDate || a.expectedDelivery || '9999').localeCompare(String(b.requiredDate || b.expectedDelivery || '9999'))
);
export const manpowerStore = new CollectionStore<ManpowerPlan>('manpower', (a, b) => a.start.localeCompare(b.start));
export const budgetStore = new CollectionStore<BudgetLine>('budget', (a, b) => a.category.localeCompare(b.category));
export const expenseStore = new CollectionStore<Expense>('expenses', byDateDesc('date'));
export const documentStore = new CollectionStore<ProjectDocument>('documents', byDateDesc('date'));
export const publicationStore = new CollectionStore<Publication>('publications', byDateDesc('updatedAt'));
export const portalStore = new CollectionStore<PortalRecord>('portal', byDateDesc('publishedAt'));

export const INTERNAL_STORES = [procurementStore, manpowerStore, documentStore, publicationStore];
export const FINANCE_STORES = [budgetStore, expenseStore];
