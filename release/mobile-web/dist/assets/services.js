import { recommendFromData, recommendationPages, parseMeal, latestMeal, mealTime, MEAL_TAGS, PERIODS } from './domain.js?v=3.0.0';
import { MealJournal as J } from './journal.js?v=3.0.0';
const P = window.MealPreferences;
let catalogPromise;
export function loadCatalog() {
  if (!catalogPromise) catalogPromise = Promise.all(['menu', 'decision-table'].map(async name => {
    const response = await fetch(`assets/data/${name}.json?v=3.0.0`);
    if (!response.ok) throw new Error('示例菜品暂时没有加载成功，请重试');
    return response.json();
  })).catch(error => { catalogPromise = null; throw error; });
  return catalogPromise;
}
export function requireProfile() {
  const raw = P.read('localStorage', 'user_profile');
  if (!P.validProfile(raw)) { location.replace('page1_guide.html'); return null; }
  return P.normalizeProfile(raw);
}
export function saveSession(key, value) {
  try { sessionStorage.setItem(key, JSON.stringify(value)); }
  catch { throw new Error('当前浏览器无法保存这次选择，请允许网站存储后重试'); }
}
export function readLogs() {
  return J.read().sort((a, b) => mealTime(b) - mealTime(a));
}
function writeLogs(logs) {
  J.write(logs);
}
export function saveMeal(meal) {
  if (window.MealCloud?.active) return window.MealCloud.saveMeal(meal, meal.id ? readLogs().find(record => record.id === meal.id) : null);
  const dish = String(meal.dish || '').trim();
  const time = Date.parse(meal.eatenAt);
  if (!dish || dish.length > 50) throw new Error('请填写 1～50 字的菜名');
  if (!Number.isFinite(time) || time > Date.now() + 60000) throw new Error('请填写有效的用餐时间，不能晚于现在');
  const logs = readLogs();
  const existing = meal.id && logs.find(item => item.id === meal.id);
  if (meal.id && !existing) throw new Error('这条记录已在其他页面删除，请返回档案查看');
  const record = {
    ...existing,
    id: existing?.id || (crypto.randomUUID ? crypto.randomUUID() : `meal-${Date.now()}-${Math.random().toString(36).slice(2)}`),
    dish, dish_name: existing?.dish === dish ? existing.dish_name : null, text: meal.text || (existing?.dish === dish ? existing.text : dish),
    tags: [...new Set(meal.tags || [])].filter(tag => MEAL_TAGS.includes(tag)),
    period: PERIODS.includes(meal.period) ? meal.period : '午餐', eatenAt: new Date(time).toISOString(),
    category: meal.category || null, shop: meal.shop || null,
    price: Number.isFinite(meal.price) ? meal.price : null, source: meal.source || 'text',
    loggedAt: new Date(time).toISOString(), inputMethod: meal.inputMethod || meal.source || 'text',
    createdAt: existing?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString()
  };
  writeLogs([record, ...logs.filter(item => item.id !== record.id)]);
  return record;
}
export function deleteMeal(id) { if (window.MealCloud?.active) return window.MealCloud.deleteMeal(id); writeLogs(readLogs().filter(item => item.id !== id)); }
export function clearMeals() { if (window.MealCloud?.active) throw new Error('请逐条管理账号记录'); writeLogs([]); }
// Demo adapters: replace these two functions to connect a future service.
export async function recommendMeals(request, previousIds = []) {
  const [menu, table] = await loadCatalog();
  const profile = P.normalizeProfile(P.read('localStorage', 'user_profile'));
  return recommendFromData(menu, table, request, profile, readLogs(), previousIds);
}
export async function recommendMealPages(request) {
  const [menu, table] = await loadCatalog();
  const profile = P.normalizeProfile(P.read('localStorage', 'user_profile'));
  return recommendationPages(menu, table, request, profile, readLogs());
}
export async function logMeal(input) { const [menu] = await loadCatalog(); return parseMeal(input, menu); }
export function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
export function chipList(tags) {
  const wrap = element('div', 'chips');
  for (const tag of tags) wrap.append(element('span', 'chip', tag));
  return wrap;
}
export function formatMealDate(meal) {
  const stamp = mealTime(meal);
  if (!stamp) return meal.period ? `时间未记录 · ${meal.period}` : '用餐时间未记录';
  const date = new Date(stamp);
  return `${date.getMonth() + 1}月${date.getDate()}日 ${meal.period || ''} · ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
export { latestMeal };
