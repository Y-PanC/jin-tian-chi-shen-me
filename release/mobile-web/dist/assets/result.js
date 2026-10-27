import { requireProfile, recommendMealPages, saveSession, element, readLogs } from './services.js?v=4.0.0';
import { RESULT_VIEW_KEY, resultSignature, restoreResultView, recommendationURL } from './result-state.js?v=4.0.0';
import { ASK_SCHEMA_VERSION, askLabels } from './ask-options.js?v=4.0.0';
import { readAskDraft } from './ask-draft.js?v=4.0.0';
import { prepareResultRequest } from './result-request.js?v=4.0.0';
import { renderRecommendationCard } from './result-card.js?v=4.0.0';
import { distinctRecommendationReasons, recommendationSummary } from './recommendation-score.js?v=4.0.0';

const $ = id => document.getElementById(id);
const P = window.MealPreferences;
const profile = requireProfile();
const rawRequest = P.read('sessionStorage', 'meal_request');
const ownerId = window.MealCloud.state.user.id;
const request = prepareResultRequest(rawRequest, profile, ownerId, readAskDraft(sessionStorage, ownerId, profile));
const validRequest = !!request;
if (request && JSON.stringify(request) !== JSON.stringify(rawRequest)) saveSession('meal_request', request);
const signature = resultSignature(request, profile, readLogs());
let pages = null, pageIndex = 0, loading = false, scrollTimer;

function showError(message) { $('result-error').textContent = message; $('result-error').hidden = false; }
function rememberView() {
  if (pages === null) return;
  saveSession(RESULT_VIEW_KEY, { schemaVersion: 1, ownerId, signature, pages, pageIndex, scrollTop: $('main-content').scrollTop });
}
function cacheView() { try { rememberView(); } catch (error) { showError(error.message); } }
function beforeEvidence() {
  try { rememberView(); }
  catch (error) { showError(error.message); throw error; }
}
function chooseMeal(item) {
  $('result-error').hidden = true;
  try {
    rememberView();
    saveSession('selected_meal', { ...item, accountId: ownerId, askRoundId: request.roundId, selectionId: crypto.randomUUID(), returnTo: recommendationURL(pageIndex), selectedAt: new Date().toISOString() });
    location.href = 'page4_meal.html?from=result';
  } catch (error) { showError(error.message); }
}
function renderPage(index, scrollTop = 0) {
  if (!pages?.length) return;
  pageIndex = Math.min(pages.length - 1, Math.max(0, index));
  const page = pages[pageIndex];
  $('recommendation-summary').textContent = recommendationSummary(page.items, profile);
  $('result-empty').hidden = true; $('result-actions').hidden = false; $('page-picker').hidden = false;
  $('results-title').textContent = `给你的${page.items.length === 3 ? '三个' : page.items.length + '个'}选择`;
  $('recommendation-page').replaceChildren(...pages.map((_, index) => {
    const option = element('option', '', `第 ${index + 1} / ${pages.length} 页`); option.value = String(index); return option;
  }));
  $('recommendation-page').value = String(pageIndex);
  $('recommendation-page').disabled = pages.length === 1;
  $('previous-page').disabled = pageIndex === 0;
  $('next-page').disabled = pageIndex === pages.length - 1;
  $('pagination-status').textContent = `第 ${pageIndex + 1} 页，共 ${pages.length} 页`;
  $('recommendations').replaceChildren(...page.items.map((item, index) => renderRecommendationCard(item, pageIndex * 3 + index + 1, chooseMeal, beforeEvidence)));
  $('fallback-note').textContent = page.outsideDirection ? '优先保留符合忌口和预算的菜品，也补充了其他种类供你选' : '';
  $('fallback-note').hidden = !page.outsideDirection;
  history.replaceState(null, '', recommendationURL(pageIndex));
  $('main-content').scrollTop = scrollTop;
  const renderedIndex = pageIndex;
  requestAnimationFrame(() => {
    if (pageIndex === renderedIndex) { $('main-content').scrollTop = scrollTop; cacheView(); }
  });
  cacheView();
  try { saveSession('last_recommendation', { dish: page.items[0].dish, recommendations: page.items, createdAt: new Date().toISOString() }); }
  catch (error) { showError(error.message); }
}
async function initialize() {
  if (loading) return;
  loading = true; $('loading').hidden = false; $('result-error').hidden = true; $('retry-results').hidden = true;
  try {
    const cached = restoreResultView(P.read('sessionStorage', RESULT_VIEW_KEY), ownerId, signature);
    pages = cached ? cached.pages : (await recommendMealPages(request)).map(page => ({ ...page, items: distinctRecommendationReasons(page.items) }));
    if (!pages.length) {
      pageIndex = 0; $('recommendations').replaceChildren(); $('result-empty').hidden = false;
      $('empty-message').textContent = request.schemaVersion === ASK_SCHEMA_VERSION ? '暂时没有同时符合类别、预算和配送时间的选择，可以返回调整条件；个人忌口会一直保留' : '示例库中暂时没有同时满足这些条件的菜品；可以调整这顿预算，或核对个人档案里的忌口';
      $('results-title').textContent = '暂时没有合适的选择'; $('result-actions').hidden = true; $('page-picker').hidden = true;
      $('recommendation-summary').textContent = recommendationSummary([], profile);
      cacheView(); return;
    }
    const requestedPage = Number(new URLSearchParams(location.search).get('page'));
    const index = Number.isInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage - 1, pages.length - 1) : cached?.pageIndex || 0;
    renderPage(index, cached?.pageIndex === index ? cached.scrollTop : 0);
  } catch (error) { showError(error.message || '推荐暂时没有加载成功，请重试'); $('retry-results').hidden = false; }
  finally { loading = false; $('loading').hidden = true; }
}
if (profile) {
  if (!validRequest) location.replace('page2_ask.html');
  else {
    const labels = request.schemaVersion === ASK_SCHEMA_VERSION ? askLabels(request) : [request.mood, request.direction, P.BUDGETS.find(item => item.value === request.budgetRange).label];
    $('result-context').append(...labels.filter(Boolean).map(text => element('span', 'chip', text)));
    $('previous-page').addEventListener('click', () => renderPage(pageIndex - 1));
    $('next-page').addEventListener('click', () => renderPage(pageIndex + 1));
    $('recommendation-page').addEventListener('change', event => renderPage(Number(event.target.value)));
    $('retry-results').addEventListener('click', initialize);
    $('main-content').addEventListener('scroll', () => { clearTimeout(scrollTimer); scrollTimer = setTimeout(cacheView, 100); }, { passive: true });
    window.addEventListener('pagehide', () => { clearTimeout(scrollTimer); try { rememberView(); } catch {} });
    initialize();
  }
}
