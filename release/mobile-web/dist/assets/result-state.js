import { SCORING_VERSION, recentMeals } from './recommendation-score.js?v=3.0.0';

export const RESULT_VIEW_KEY = 'meal_result_pages';

export function resultSignature(request, profile, logs) {
  const history = Array.isArray(logs) ? recentMeals(logs).map(meal => ({ id: meal.id, revision: meal.revision, dish: meal.dish, dishes: meal.dishes, tags: meal.tags, category: meal.category, foodCategory: meal.foodCategory, eatenAt: meal.eatenAt || meal.loggedAt || meal.createdAt || meal.time })) : undefined;
  return JSON.stringify({ rulesVersion: SCORING_VERSION, request, profile, history });
}

export function restoreResultView(value, ownerId, signature) {
  if (!value || value.schemaVersion !== 1 || value.ownerId !== ownerId || value.signature !== signature ||
      !Array.isArray(value.pages) || value.pages.length > 500) return null;
  const ids = new Set();
  for (const page of value.pages) {
    if (!page || !Array.isArray(page.items) || !page.items.length || page.items.length > 3) return null;
    for (const item of page.items) {
      if (!item || typeof item.id !== 'string' || !item.id || ids.has(item.id) ||
          !['dish', 'shop', 'reason'].every(key => typeof item[key] === 'string') ||
          !Number.isFinite(item.price) || !Array.isArray(item.tags) || item.tags.some(tag => typeof tag !== 'string')) return null;
      ids.add(item.id);
    }
  }
  if (!Number.isInteger(value.pageIndex) || value.pageIndex < 0 || value.pageIndex >= Math.max(1, value.pages.length)) return null;
  if (!Number.isFinite(value.scrollTop) || value.scrollTop < 0) return null;
  if (value.openDetails !== undefined && (!Array.isArray(value.openDetails) || value.openDetails.length > 3 || value.openDetails.some(id => typeof id !== 'string' || !value.pages[value.pageIndex]?.items.some(item => item.id === id)))) return null;
  return value;
}

export function recommendationURL(pageIndex) {
  return `page3_result.html?page=${pageIndex + 1}`;
}

export function recommendationEvidenceURL(id, pageIndex) {
  return `page3_evidence.html?id=${encodeURIComponent(id)}&page=${pageIndex + 1}`;
}

export function restoreRecommendationEvidence(value, ownerId, signature, search) {
  const view = restoreResultView(value, ownerId, signature);
  const params = new URLSearchParams(search);
  const page = Number(params.get('page'));
  if (!view || !Number.isInteger(page) || page < 1 || page > view.pages.length) return null;
  const item = view.pages[page - 1].items.find(item => item.id === params.get('id'));
  const evaluation = item?.evaluation;
  if (!evaluation || evaluation.version !== SCORING_VERSION ||
      ![evaluation.totalScore, evaluation.baseScore].every(Number.isFinite) ||
      !(evaluation.healthScore === null || Number.isFinite(evaluation.healthScore)) ||
      !Array.isArray(evaluation.dimensions) || evaluation.dimensions.length !== 5 ||
      evaluation.dimensions.some(part => !part || typeof part.label !== 'string' || typeof part.detail !== 'string' ||
        !(part.value === null || Number.isFinite(part.value)) || !Number.isFinite(part.weight) || !Number.isFinite(part.contribution)) ||
      !Array.isArray(evaluation.adjustments) || evaluation.adjustments.some(part => !part ||
        typeof part.label !== 'string' || typeof part.detail !== 'string' || !Number.isFinite(part.points))) return null;
  return { item, pageIndex: page - 1, returnTo: recommendationURL(page - 1) };
}

export function recommendationReturnURL(selected) {
  return /^page3_result\.html(?:\?page=[1-9]\d*)?$/.test(selected?.returnTo || '') ? selected.returnTo : 'page3_result.html';
}
