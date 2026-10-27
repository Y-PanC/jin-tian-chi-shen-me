import { requireProfile, recommendMeals, saveSession, element, chipList } from './services.js';
const $ = id => document.getElementById(id);
const P = window.MealPreferences;
const profile = requireProfile();
const request = P.read('sessionStorage', 'meal_request');
const validRequest = request && typeof request === 'object' && P.BUDGETS.some(item => item.value === request.budgetRange);
let current = [];
let batch = 0;
let loading = false;
function showError(message) { $('result-error').textContent = message; $('result-error').hidden = false; }
async function renderBatch() {
  if (loading) return;
  loading = true; $('change-batch').disabled = true; $('loading').hidden = false; $('result-error').hidden = true;
  try {
    const result = await recommendMeals(request, current.map(item => item.id));
    if (!result.items.length) {
      $('recommendations').replaceChildren(); $('result-empty').hidden = false;
      $('empty-message').textContent = '示例库中暂时没有同时满足这些条件的菜品。可以调整这顿预算，或核对个人档案里的忌口。';
      $('results-title').textContent = '暂时没有合适的选择'; $('result-actions').hidden = true;
      return;
    }
    current = result.items; batch++;
    $('result-actions').hidden = false;
    $('result-empty').hidden = true;
    $('results-title').textContent = `给你的${current.length === 3 ? '三个' : current.length + '个'}选择`;
    $('batch-label').textContent = `第 ${batch} 批`;
    $('recommendations').replaceChildren(...current.map((item, index) => {
      const card = element('article', 'card result-card');
      const row = element('div', 'dish-row'); const name = element('div');
      name.append(element('h3', '', item.dish), element('p', 'shop', item.shop));
      const price = element('p', 'price'); price.append(element('small', '', '¥ '), document.createTextNode(item.price));
      row.append(name, price);
      const bottom = element('div', 'card-bottom');
      const choose = element('button', 'pick', '选这份 →'); choose.type = 'button'; choose.setAttribute('aria-label', `选这份：${item.dish}`);
      choose.addEventListener('click', () => {
        $('result-error').hidden = true;
        try { saveSession('selected_meal', { ...item, selectedAt: new Date().toISOString() }); location.href = 'page4_log.html?from=result'; }
        catch (error) { showError(error.message); }
      });
      bottom.append(element('span', 'fine', `选择 ${String(index + 1).padStart(2, '0')}`), choose);
      card.append(row, chipList(item.tags), element('p', 'reason', item.reason), bottom);
      return card;
    }));
    const notes = [];
    if (result.outsideDirection) notes.push('优先保留符合忌口和预算的菜品，也补充了其他种类供你选。');
    if (result.limitedRotation) notes.push('符合条件的示例有限，这一批会保留部分选择。');
    $('fallback-note').textContent = notes.join(''); $('fallback-note').hidden = !notes.length;
    try { saveSession('last_recommendation', { dish: current[0].dish, recommendations: current, createdAt: new Date().toISOString() }); }
    catch (error) { showError(error.message); }
    $('loading').textContent = `已整理第 ${batch} 批，共 ${current.length} 个选择。`;
    $('main-content').scrollTop = 0;
  } catch (error) { showError(error.message || '推荐暂时没有加载成功，请重试。'); }
  finally { loading = false; $('loading').hidden = true; $('change-batch').disabled = false; }
}
if (profile) {
  if (!validRequest) {
    $('loading').hidden = true; $('result-empty').hidden = false; $('result-actions').hidden = true;
    $('results-title').textContent = '从问一问开始'; $('batch-label').hidden = true;
  } else {
    const range = P.BUDGETS.find(item => item.value === request.budgetRange);
    $('result-context').append(...[request.mood, request.direction, range.label].filter(Boolean).map(text => element('span', 'chip', text)));
    $('change-batch').addEventListener('click', renderBatch);
    renderBatch();
  }
}
window.addEventListener('pageshow', event => {
  if (event.persisted && profile && validRequest) { current = []; batch = 0; renderBatch(); }
});
