import { askAnswers, askRequest, validAskRequest } from './ask-options.js?v=3.0.0';

export const askDraftKey = ownerId => `meal_draft:ask:${ownerId}`;
const completedKey = ownerId => `meal_draft:ask-completed:${ownerId}`;
function completedRounds(storage, ownerId) {
  try { const value = JSON.parse(storage.getItem(completedKey(ownerId)) || '[]'); return Array.isArray(value) ? value.filter(item => typeof item === 'string') : []; }
  catch { return []; }
}
export function saveAskDraft(storage, ownerId, answers, step, roundId) {
  if (!ownerId || typeof roundId !== 'string' || !roundId || roundId.length > 100 || !Number.isInteger(step) || step < 0 || step > 2) throw new Error('问答草稿暂未保存，请重试');
  if (completedRounds(storage, ownerId).includes(roundId)) return null;
  const draft = { schemaVersion: 1, ownerId, roundId, step, answers: askRequest(answers) };
  storage.setItem(askDraftKey(ownerId), JSON.stringify(draft));
  return draft;
}
export function readAskDraft(storage, ownerId, profile) {
  try {
    const saved = JSON.parse(storage.getItem(askDraftKey(ownerId)) || 'null');
    if (saved?.schemaVersion !== 1 || saved.ownerId !== ownerId || typeof saved.roundId !== 'string' || !saved.roundId || saved.roundId.length > 100 || completedRounds(storage, ownerId).includes(saved.roundId) ||
        !Number.isInteger(saved.step) || saved.step < 0 || saved.step > 2 || !validAskRequest(saved.answers)) return null;
    return { roundId: saved.roundId, step: saved.step, answers: askAnswers(saved.answers, profile) };
  } catch { return null; }
}
export function completeAskRound(storage, ownerId, roundId) {
  if (!ownerId || typeof roundId !== 'string' || !roundId) return false;
  let matched = false;
  try {
    storage.setItem(completedKey(ownerId), JSON.stringify([...new Set([...completedRounds(storage, ownerId), roundId])].slice(-100)));
    const key = askDraftKey(ownerId);
    const saved = JSON.parse(storage.getItem(key) || 'null');
    const ownsDraft = saved?.ownerId === ownerId && saved.roundId === roundId;
    if (ownsDraft) { storage.removeItem(key); matched = true; }
    const request = JSON.parse(storage.getItem('meal_request') || 'null');
    if (request?.roundId === roundId && (request.accountId === ownerId || ownsDraft)) {
      storage.removeItem('meal_request'); storage.removeItem('meal_result_pages'); matched = true;
    }
  } catch { /* 已保存的餐食不受草稿清理失败影响。 */ }
  return matched;
}
export function clearSelectedMeal(storage, ownerId, selected) {
  try {
    const stored = JSON.parse(storage.getItem('selected_meal') || 'null');
    if (!stored || !selected || (stored.accountId && stored.accountId !== ownerId) || (selected.accountId && selected.accountId !== ownerId)) return false;
    const current = stored.selectionId || selected.selectionId ? typeof selected.selectionId === 'string' && !!selected.selectionId && stored.selectionId === selected.selectionId :
      typeof selected.selectedAt === 'string' && !!selected.selectedAt && stored.selectedAt === selected.selectedAt && stored.id === selected.id && stored.dish === selected.dish;
    if (!current) return false;
    storage.removeItem('selected_meal'); return true;
  } catch { return false; }
}
