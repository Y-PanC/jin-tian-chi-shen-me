import { requireProfile, readLogs, recommendMealPages, saveSession } from './services.js?v=4.0.0';
import { RESULT_VIEW_KEY, resultSignature, restoreResultView, restoreRecommendationEvidence, recommendationURL, recommendationEvidenceURL } from './result-state.js?v=4.0.0';
import { readAskDraft } from './ask-draft.js?v=4.0.0';
import { prepareResultRequest } from './result-request.js?v=4.0.0';
import { renderScoreEvidence } from './score-evidence.js?v=4.0.0';
import { distinctRecommendationReasons } from './recommendation-score.js?v=4.0.0';

const P = window.MealPreferences;
const profile = requireProfile();
if (profile) {
  const ownerId = window.MealCloud.state.user.id;
  const request = prepareResultRequest(P.read('sessionStorage', 'meal_request'), profile, ownerId, readAskDraft(sessionStorage, ownerId, profile));
  const signature = resultSignature(request, profile, readLogs());
  let saved = P.read('sessionStorage', RESULT_VIEW_KEY);
  let evidence = request && restoreRecommendationEvidence(saved, ownerId, signature, location.search);
  if (request && !restoreResultView(saved, ownerId, signature)) {
    try {
      const id = new URLSearchParams(location.search).get('id');
      const pages = (await recommendMealPages(request)).map(page => ({ ...page, items: distinctRecommendationReasons(page.items) }));
      const pageIndex = pages.findIndex(page => page.items.some(item => item.id === id));
      if (pageIndex >= 0) {
        saved = { schemaVersion: 1, ownerId, signature, pages, pageIndex, scrollTop: 0 };
        saveSession('meal_request', request);
        saveSession(RESULT_VIEW_KEY, saved);
        const url = recommendationEvidenceURL(id, pageIndex);
        evidence = restoreRecommendationEvidence(saved, ownerId, signature, url.slice(url.indexOf('?')));
        history.replaceState(null, '', url);
      }
    } catch (error) {
      document.querySelector('#evidence-unavailable .hint').textContent = error.message || '推荐暂时没有加载成功，请返回重试';
    }
  }
  const page = Number(new URLSearchParams(location.search).get('page'));
  const returnTo = evidence?.returnTo || recommendationURL(Number.isInteger(page) && page > 0 && page <= 500 ? page - 1 : 0);
  document.querySelectorAll('[data-return-results]').forEach(link => { link.href = returnTo; });
  if (evidence) {
    document.title = `${evidence.item.dish}的推荐依据 · 今天吃什么`;
    document.getElementById('evidence-content').replaceChildren(...renderScoreEvidence(evidence.item));
    document.getElementById('evidence-content').hidden = false;
    document.getElementById('evidence-return').hidden = false;
  } else document.getElementById('evidence-unavailable').hidden = false;
}
