// Pure functions shared by the demo adapters and their constraint tests.
export const MEAL_TAGS = ['清淡', '偏咸', '偏油', '偏辣', '偏甜', '荤素搭配', '主食为主'];
export const PERIODS = ['早餐', '午餐', '晚餐', '加餐', '下午茶', '夜宵'];
const aliases = {
  海鲜: ['鱼', '虾', '蟹', '贝', '鱿鱼'], 坚果: ['花生', '核桃', '腰果', '芝麻', '杏仁'],
  乳糖不耐受: ['牛奶', '奶油', '奶酪', '酸奶'], 鸡蛋: ['鸡蛋', '蛋液'],
  麸质: ['小麦', '面条', '面包'], 素食: ['鸡肉', '牛肉', '猪肉', '羊肉', '鱼', '虾'],
  荤: ['鸡肉', '牛肉', '猪肉', '羊肉', '鱼', '虾']
};
export function mealTime(meal) { return Date.parse(meal?.eatenAt || meal?.loggedAt || meal?.createdAt || meal?.timestamp || meal?.time || '') || 0; }
export function latestMeal(logs) { return [...logs].sort((a, b) => mealTime(b) - mealTime(a))[0] || null; }
export function normalizeDish(value) { return String(value || '').replace(/[（(].*?[）)]/g, '').replace(/套餐|盖饭|配饭|米饭|一份|一碗|\s/g, '').trim(); }
export function allowedDish(item, profile, cap, last) {
  if (!Number.isFinite(item.price) || (cap !== null && item.price > cap)) return false;
  if (last && normalizeDish(item.dish) === normalizeDish(last.dish)) return false;
  if (profile.spiceLevel === '完全不吃辣' && item.spice > 0) return false;
  if (profile.spiceLevel === '微辣' && item.spice > 1) return false;
  if (profile.spiceLevel === '中辣' && item.spice > 2) return false;
  const ingredients = [...item.ingredients, item.dish].join('、');
  return !(profile.restrictions || []).some(raw => {
    const restriction = raw.replace(/^不吃|过敏|不耐受|不含/g, '').trim();
    const terms = aliases[raw] || aliases[restriction] || [restriction];
    return terms.some(term => term && ingredients.includes(term));
  });
}
function scoreDish(item, request, profile, last, priority) {
  let score = Math.max(0, 12 - priority.indexOf(item.id));
  if (!priority.includes(item.id)) score = 0;
  if (request.direction !== '暂无想法' && item.category === request.direction) score += 35;
  if (request.mood === '清淡一点' && item.tags.includes('清淡')) score += 24;
  if (request.mood === '速战速决' && item.quick) score += 20;
  if (request.mood === '吃点好的' && item.special) score += 16;
  if (profile.goal === '清淡减脂' && item.light) score += 22;
  if (profile.goal === '营养均衡' && item.tags.includes('荤素搭配')) score += 12;
  if (profile.goal === '生酮饮食' && item.lowCarb) score += 16;
  if (profile.goal === '控糖少甜' && !item.tags.includes('偏甜')) score += 8;
  if (last?.tags?.some(tag => ['偏咸', '偏油'].includes(tag)) && item.tags.includes('清淡')) score += 50;
  if (profile.tastes?.includes('清淡') && item.tags.includes('清淡')) score += 10;
  if (profile.tastes?.includes('重口') && item.tags.some(tag => ['偏辣', '偏咸'].includes(tag))) score += 8;
  if (profile.tastes?.includes('偏甜') && item.tags.includes('偏甜')) score += 8;
  if (request.changeTaste && last?.category && item.category !== last.category) score += 12;
  return score;
}
function reasonFor(item, request, profile, last) {
  if (last?.tags?.some(tag => ['偏咸', '偏油'].includes(tag)) && item.tags.includes('清淡')) {
    const period = { 早餐: '早上', 午餐: '中午', 晚餐: '晚上', 加餐: '加餐时' }[last.period] || '上顿';
    const taste = last.tags.includes('偏咸') ? '偏咸' : '偏油';
    return `你${period}吃了${taste}的${normalizeDish(last.dish)}，这顿清淡一点`;
  }
  if (last) return `上顿吃过${normalizeDish(last.dish)}，这次换成${item.dish}`;
  if (request.mood === '速战速决' && item.quick) return '你想速战速决，选一份方便吃的';
  if (request.mood === '清淡一点' && item.tags.includes('清淡')) return '这顿想清淡一点，少油做法更合心意';
  if (profile.goal === '清淡减脂' && item.light) return '结合你的清淡减脂目标，选少油搭配';
  if (profile.tastes?.includes('清淡') && item.tags.includes('清淡')) return '你在档案里偏好清淡，这份口味更接近';
  if (request.direction && request.direction !== '暂无想法' && item.category === request.direction) return `你想吃${request.direction}，这份在本次预算内`;
  return `按你的${profile.goal || '营养均衡'}偏好，换一种搭配`;
}
export function recommendFromData(menu, table, request, profile, logs, previousIds = []) {
  const cap = request.budget === null ? null : Number.isFinite(request.budget) ? request.budget : profile.budget;
  const last = latestMeal(logs);
  const key = `${request.mood || '无所谓'}|${request.direction || '暂无想法'}`;
  const priority = table[key] || table[request.mood] || table.default;
  const eligible = menu.filter(item => allowedDish(item, profile, cap, last));
  const sorted = eligible.map((item, index) => ({ item, index, score: scoreDish(item, request, profile, last, priority) }))
    .sort((a, b) => b.score - a.score || a.index - b.index).map(entry => entry.item);
  let pool = sorted.filter(item => !previousIds.includes(item.id));
  const limitedRotation = pool.length < 3 && previousIds.length > 0;
  if (limitedRotation) pool = [...pool, ...sorted.filter(item => previousIds.includes(item.id))];
  const picks = [];
  // Prefer distinct shops and categories without relaxing exclusions or budget.
  for (const item of pool) if (!picks.some(p => p.shop === item.shop || p.category === item.category)) { picks.push(item); if (picks.length === 3) break; }
  for (const item of pool) if (picks.length < 3 && !picks.includes(item) && !picks.some(p => p.shop === item.shop)) picks.push(item);
  for (const item of pool) if (picks.length < 3 && !picks.includes(item)) picks.push(item);
  const items = picks.map(item => ({ ...item, reason: reasonFor(item, request, profile, last) }));
  const outsideDirection = request.direction && request.direction !== '暂无想法' && items.some(item => item.category !== request.direction);
  return { items, limitedRotation, outsideDirection, eligibleCount: eligible.length };
}
export function parseMeal(input, menu) {
  const text = String(input.text || '').trim();
  if (!text) throw new Error('先写下吃了什么，或选一句示例');
  const match = menu.filter(item => [item.dish, ...(item.aliases || [])].some(word => text.includes(word)))
    .sort((a, b) => b.dish.length - a.dish.length)[0];
  let dish = match?.dish || text.replace(/^.*?(?:吃了|吃的是|吃的|午饭是|晚饭是|早餐是)/, '').split(/[，,。；;\n（(]/)[0].trim();
  if (!dish) dish = text;
  const tags = new Set(match?.tags || []);
  if (/偏咸|有点咸|太咸|咸了/.test(text)) tags.add('偏咸');
  if (/偏油|有点油|太油|油腻/.test(text)) tags.add('偏油');
  if (/偏辣|有点辣|太辣/.test(text)) tags.add('偏辣');
  if (/偏甜|有点甜|太甜/.test(text)) tags.add('偏甜');
  if (/清淡|不油|不咸/.test(text)) { tags.add('清淡'); tags.delete('偏油'); tags.delete('偏咸'); }
  if (/不辣|没有辣|无辣/.test(text)) tags.delete('偏辣');
  const period = /中午|午餐|午饭/.test(text) ? '午餐' : /晚上|晚餐|晚饭/.test(text) ? '晚餐' : /早上|早餐|早饭/.test(text) ? '早餐' : null;
  return { dish: dish.slice(0, 50), tags: [...tags].filter(tag => MEAL_TAGS.includes(tag)), period, category: match?.category || null };
}
export function tastePortrait(logs) {
  const counts = new Map();
  for (const meal of [...logs].sort((a, b) => mealTime(b) - mealTime(a)).slice(0, 30)) {
    for (const tag of new Set(meal.tags || [])) if (MEAL_TAGS.includes(tag)) counts.set(tag, (counts.get(tag) || 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1]);
}
