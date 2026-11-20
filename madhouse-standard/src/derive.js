// Derived values shared by the dashboard, registers and reports.
import { durationHours } from './engine.js';
import { CATEGORIES } from './data/profiles.js';

export const finalClass = (a) => (a.validation && a.validation.finalClass) || (a.result && a.result.classification) || '';
export const finalPriority = (a) => (a.validation && a.validation.finalPriority) || (a.result && a.result.priority) || '';
export const estMid = (a) => {
  if (a.cost && a.cost.approvedBudget !== '' && a.cost.approvedBudget != null && !Number.isNaN(Number(a.cost.approvedBudget)) && Number(a.cost.approvedBudget) > 0) return Number(a.cost.approvedBudget);
  return a.estimate ? (a.estimate.min + a.estimate.max) / 2 : 0;
};
export const itemOf = (library, a) => library.find((x) => x.id === a.itemId);

// Normalized rows for dashboard charts and filters.
export function rowsFromAssessments(assessments, library) {
  return assessments.map((a) => {
    const it = itemOf(library, a);
    return {
      key: a.id, label: it ? it.item : a.title || a.id,
      cat: CATEGORIES[a.catCode] || (it && it.category) || 'Uncategorized',
      cls: finalClass(a), prio: finalPriority(a),
      trade: (a.estimate && a.estimate.trade) || (it && it.trade) || 'Unassigned',
      cost: estMid(a), min: a.estimate ? a.estimate.min : 0, max: a.estimate ? a.estimate.max : 0,
      hours: durationHours((a.estimate && a.estimate.duration) || (it && it.duration)),
      common: it ? it.commonGroup : '',
    };
  });
}
export function rowsFromLibrary(library) {
  return library.map((it) => ({
    key: it.id, label: it.item, cat: it.category, cls: it.classification, prio: it.priority, trade: it.trade,
    cost: (Number(it.costMin) + Number(it.costMax)) / 2, min: Number(it.costMin), max: Number(it.costMax),
    hours: durationHours(it.duration), common: it.commonGroup,
  }));
}
