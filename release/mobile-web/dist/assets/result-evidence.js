import { requireProfile, readLogs } from './services.js?v=3.0.0';
import { RESULT_VIEW_KEY, resultSignature, restoreRecommendationEvidence, recommendationURL } from './result-state.js?v=3.0.0';
import { readAskDraft } from './ask-draft.js?v=3.0.0';
import { prepareResultRequest } from './result-request.js?v=3.0.0';
import { renderScoreEvidence } from './score-evidence.js?v=3.0.0';

const P = window.MealPreferences;
const profile = requireProfile();
if (profile) {
  const ownerId = window.MealCloud.state.user.id;
  const request = prepareResultRequest(P.read('sessionStorage', 'meal_request'), profile, ownerId, readAskDraft(sessionStorage, ownerId, profile));
  const saved = P.read('sessionStorage', RESULT_VIEW_KEY);
  const evidence = request && restoreRecommendationEvidence(saved, ownerId, resultSignature(request, profile, readLogs()), location.search);
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
