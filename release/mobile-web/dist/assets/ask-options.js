export const ASK_SCHEMA_VERSION = 3;
export const FOOD_CATEGORIES = [
  ['any', '不限类别'], ['rice', '中式快餐'], ['noodles', '粉面米线'],
  ['breakfast', '早餐粥铺'], ['dumplings', '饺子馄饨'], ['malatang', '麻辣烫冒菜'],
  ['sichuan', '川湘家常菜'], ['local', '地方特色菜'], ['burgers', '汉堡炸鸡'],
  ['western', '披萨意面'], ['light', '轻食沙拉'], ['japanese-korean', '日韩料理'],
  ['bbq', '烧烤烤肉'], ['hotpot', '香锅火锅'], ['snacks', '小吃卤味'],
  ['dessert-drinks', '甜品饮品']
].map(([value, label]) => ({ value, label }));
export const ASK_BUDGETS = [
  { value: 'under10', label: '10元以内', min: 0, max: 10 },
  { value: '10to15', label: '10～15元', min: 10, max: 15 },
  { value: '15to20', label: '15～20元', min: 15, max: 20 },
  { value: '20to30', label: '20～30元', min: 20, max: 30 },
  { value: '30to40', label: '30～40元', min: 30, max: 40 },
  { value: '40to60', label: '40～60元', min: 40, max: 60 },
  { value: '60to100', label: '60～100元', min: 60, max: 100 },
  { value: 'over100', label: '100元以上', min: 100, max: null },
  { value: 'unlimited', label: '不限预算', min: 0, max: null }
];
export const DELIVERY_TIMES = [
  { value: 'under20', label: '20分钟内', max: 20 },
  { value: 'under30', label: '30分钟内', max: 30 },
  { value: 'under45', label: '45分钟内', max: 45 },
  { value: 'under60', label: '60分钟内', max: 60 },
  { value: 'unlimited', label: '时间不限', max: null }
];
const find = (items, value) => items.find(item => item.value === value);
export function selectedCategories(request) {
  if (Array.isArray(request?.categories)) return [...new Set(request.categories.filter(value => value !== 'any' && find(FOOD_CATEGORIES, value)))];
  return request?.category !== 'any' && find(FOOD_CATEGORIES, request?.category) ? [request.category] : [];
}
function validCategories(request) {
  if (request.categories === undefined) return !!find(FOOD_CATEGORIES, request.category);
  if (!Array.isArray(request.categories) || request.categories.length > FOOD_CATEGORIES.length - 1 ||
      new Set(request.categories).size !== request.categories.length || request.categories.some(value => value === 'any' || !find(FOOD_CATEGORIES, value))) return false;
  const legacy = request.categories.length === 1 ? request.categories[0] : 'any';
  return request.category === undefined || request.category === legacy;
}
export function validAskRequest(request) {
  return request?.schemaVersion === ASK_SCHEMA_VERSION && validCategories(request) &&
    !!find(ASK_BUDGETS, request.budgetRange) && !!find(DELIVERY_TIMES, request.deliveryTime);
}
export function askAnswers(previous, profile = {}) {
  const oldCategories = { 米粉面: 'noodles', 盖饭简餐: 'rice', 地方菜系: 'local', 汉堡披萨: 'burgers', 特色小吃: 'snacks' };
  const oldBudgets = { under15: 15, '15to25': 25, '25to40': 40, unlimited: null };
  const hasOldBudget = previous && Object.hasOwn(oldBudgets, previous.budgetRange);
  const amount = hasOldBudget ? oldBudgets[previous.budgetRange] : profile.budget;
  const fallbackBudget = (!hasOldBudget && find(ASK_BUDGETS, profile.budgetRange)?.value) ||
    (amount === null ? 'unlimited' : ASK_BUDGETS.find(item => item.max !== null && Number.isFinite(amount) && amount <= item.max)?.value || '20to30');
  return {
    categories: previous?.categories !== undefined || find(FOOD_CATEGORIES, previous?.category) ? selectedCategories(previous) : oldCategories[previous?.direction] ? [oldCategories[previous.direction]] : [],
    budgetRange: find(ASK_BUDGETS, previous?.budgetRange)?.value || fallbackBudget,
    deliveryTime: find(DELIVERY_TIMES, previous?.deliveryTime)?.value || 'unlimited'
  };
}
export function askRequest(answers, details = {}) {
  const request = { ...details, ...answers, schemaVersion: ASK_SCHEMA_VERSION };
  if (!validAskRequest(request)) throw new Error('请重新选择类别、预算和配送时间');
  const budget = find(ASK_BUDGETS, request.budgetRange);
  const categories = selectedCategories(request);
  return { ...request, categories, category: categories.length === 1 ? categories[0] : 'any', budgetMin: budget.min, budget: budget.max, deliveryMinutes: find(DELIVERY_TIMES, request.deliveryTime).max };
}
export function matchesAsk(item, request) {
  if (!validAskRequest(request)) return false;
  const budget = find(ASK_BUDGETS, request.budgetRange);
  const delivery = find(DELIVERY_TIMES, request.deliveryTime);
  const categories = selectedCategories(request);
  return (!categories.length || categories.includes(item.foodCategory)) &&
    Number.isFinite(item.price) && item.price >= budget.min && (budget.max === null || item.price <= budget.max) &&
    (delivery.max === null || (Number.isFinite(item.deliveryMinutes) && item.deliveryMinutes > 0 && item.deliveryMinutes <= delivery.max));
}
export function askLabels(request) {
  const categories = selectedCategories(request);
  return [...(categories.length ? categories.map(value => find(FOOD_CATEGORIES, value)) : [find(FOOD_CATEGORIES, 'any')]), find(ASK_BUDGETS, request.budgetRange), find(DELIVERY_TIMES, request.deliveryTime)].filter(Boolean).map(item => item.label);
}
