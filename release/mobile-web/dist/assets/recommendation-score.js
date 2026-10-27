export const SCORING_VERSION = '2026-10-26-score-4';
const clamp = value => Math.max(0, Math.min(100, value));
const round = value => Math.round(value * 10) / 10;
const knownScore = value => Number.isFinite(value) && value >= 0 && value <= 100;
const normalizedName = value => String(value || '').replace(/[（(].*?[）)]/g, '').replace(/套餐|盖饭|配饭|米饭|一份|一碗|\s/g, '').trim();
export function mealContainsDish(meal, dish) {
  const names = Array.isArray(meal?.dishes) && meal.dishes.length ? meal.dishes : String(meal?.dish || '').split(/[、，,]/);
  return names.some(name => normalizedName(name) && normalizedName(name) === normalizedName(dish));
}
export function recentMeals(logs) {
  const timestamp = meal => Date.parse(meal.eatenAt || meal.loggedAt || meal.createdAt || meal.time || '') || 0;
  return (Array.isArray(logs) ? [...logs] : []).filter(meal => meal && (meal.dish || meal.dishes?.length)).sort((a, b) => timestamp(b) - timestamp(a)).slice(0, 3);
}
export function scoringWeights(goal) {
  if (goal === '清淡减脂') return { health: .4, taste: .2, completeness: .15, takeaway: .15, popularity: .1 };
  if (goal === '控糖少甜' || goal === '生酮饮食') return { health: .35, taste: .2, completeness: .2, takeaway: .15, popularity: .1 };
  if (goal === '随心所欲' || goal === '无所谓') return { health: .2, taste: .35, completeness: .2, takeaway: .15, popularity: .1 };
  return { health: .3, taste: .25, completeness: .2, takeaway: .15, popularity: .1 };
}
export function mealParts(item) {
  const text = [...(item.ingredients || []), item.dish || ''].join('、');
  return {
    protein: /鸡肉|鸡腿|鸡胸|牛肉|猪肉|羊肉|鱼|虾|蛤蜊|贝|鸡蛋|豆腐|牛奶|奶酪/.test(text),
    staple: /大米|米饭|配饭|盖饭|饭团|拌饭|杂粮|小米|燕麦|小麦|面条|米线|米粉|意面|披萨|汉堡|水饺|馄饨|土豆|红薯|紫薯|玉米|山药/.test(text),
    vegetables: /青菜|白菜|生菜|西兰花|胡萝卜|黄瓜|青椒|豆芽|番茄|冬瓜|萝卜|茼蒿|香菇|蘑菇|菌菇|海带|南瓜/.test(text)
  };
}
export function scoreRecommendation(item, request, profile, logs = []) {
  const weights = scoringWeights(profile.goal);
  const tags = item.tags || [];
  const tastes = profile.tastes || [];
  const parts = mealParts(item);
  const dimensions = [];
  const adjustments = [];
  const reasons = [];
  const warnings = [];
  const addReason = (key, label, text) => reasons.push({ key, label, text });
  const adjust = (key, label, points, detail) => adjustments.push({ key, label, points, detail });
  const dimension = (key, label, value, detail, known = true) => {
    const weight = weights[key];
    dimensions.push({ key, label, value: known ? round(value) : null, weight, contribution: round((known ? value : 50) * weight), detail });
  };

  const healthKnown = knownScore(item.healthScore);
  dimension('health', '健康参考', item.healthScore, healthKnown ? `${item.healthSource === 'workbook' ? '文档示例' : '按示例食材与口味规则估算'}，${item.healthScore}/100` : '缺少健康数据，按中性 50 分参与排序', healthKnown);

  let taste = 60;
  const hits = [];
  if (tastes.includes('清淡') && tags.includes('清淡')) hits.push('清淡');
  if (tastes.includes('重口') && tags.some(tag => ['偏咸', '偏辣'].includes(tag))) hits.push('重口');
  if (tastes.includes('偏甜') && tags.includes('偏甜')) hits.push('偏甜');
  taste += hits.length * 15;
  const tasteConflict = tastes.includes('清淡') && tags.some(tag => ['偏油', '偏咸'].includes(tag));
  if (tasteConflict) taste -= 20;
  dimension('taste', '口味匹配', clamp(taste), !tastes.length ? '未设置口味偏好，按中性底分 60 计算' : hits.length ? `命中你的${hits.join('、')}偏好${tasteConflict ? '；偏油或偏咸扣 20' : ''}` : tasteConflict ? '偏好清淡，这份偏油或偏咸，扣 20' : '未命中已设置的口味偏好，保留底分 60');

  const completeness = (parts.protein ? 40 : 0) + (parts.staple ? 30 : 0) + (parts.vegetables ? 30 : 0);
  const partNames = [parts.protein && '蛋白质食材', parts.staple && '主食', parts.vegetables && '蔬菜'].filter(Boolean);
  dimension('completeness', '单餐搭配', completeness, partNames.length ? `示例包含${partNames.join('、')}，分别按 40/30/30 分计` : '未标注完整食材结构');

  const takeawayKnown = knownScore(item.takeawaySuitability);
  dimension('takeaway', '外卖适配', item.takeawaySuitability, takeawayKnown ? `${item.takeawaySuitability}/100，${item.takeawayNote || '按示例餐品的出餐和携带便利度评估'}` : '缺少适配度，按中性 50 分参与排序', takeawayKnown);
  const salesKnown = Number.isFinite(item.monthlySales) && item.monthlySales >= 0;
  const popularity = salesKnown ? clamp(item.monthlySales / 1500 * 100) : 50;
  dimension('popularity', '月售参考', popularity, salesKnown ? `示例月售 ${item.monthlySales}，以 1500 单对应 100 分，最高 100` : '暂无销量数据，按中性 50 分参与排序', salesKnown);

  if (profile.goal === '营养均衡' && parts.protein && parts.staple && parts.vegetables) {
    adjust('goal', '目标匹配', 6, '同时包含蛋白质食材、主食和蔬菜');
    addReason('goal', '饮食目标', '蛋白质、主食和蔬菜搭配较完整');
  } else if (profile.goal === '清淡减脂' && item.light && tags.includes('清淡')) {
    adjust('goal', '目标匹配', 6, '示例标注清淡，且标记为轻食搭配');
    addReason('goal', '饮食目标', '这份标注清淡，贴合你的清淡减脂目标');
  } else if (profile.goal === '生酮饮食' && item.lowCarb) {
    adjust('goal', '目标匹配', 6, '示例目录标记为低碳水搭配');
    addReason('goal', '饮食目标', '目录标记为低碳水，贴合已选目标');
  } else if (profile.goal === '控糖少甜' && !tags.includes('偏甜')) {
    adjust('goal', '目标匹配', 4, '目录未标记偏甜口味');
    addReason('goal', '饮食目标', '这份未标记偏甜，贴合少甜偏好');
  }
  if (profile.goal === '清淡减脂' && (tags.includes('偏油') || /炸/.test(item.dish))) {
    adjust('goal-conflict', '目标冲突', -8, '偏油或油炸，与清淡减脂目标有冲突');
    warnings.push('这份偏油或油炸，与清淡减脂目标有冲突');
  } else if (profile.goal === '控糖少甜' && tags.includes('偏甜')) {
    adjust('goal-conflict', '目标冲突', -8, '偏甜口味，与控糖少甜目标有冲突');
    warnings.push('这份偏甜，与少甜目标有冲突');
  } else if (profile.goal === '生酮饮食' && !item.lowCarb && parts.staple) {
    adjust('goal-conflict', '目标冲突', -8, '包含主食，目录未标记为低碳水');
    warnings.push('包含主食，目录未标记为低碳水搭配');
  }

  const recent = recentMeals(logs);
  const last = recent[0];
  const lastHeavy = last?.tags?.filter(tag => ['偏咸', '偏油'].includes(tag)) || [];
  if (lastHeavy.length && tags.includes('清淡')) {
    adjust('complement', '上顿互补', 8, `上顿${last.dish || last.dishes.join('、')}标记${lastHeavy.join('、')}，这份标记清淡`);
    reasons.unshift({ key: 'complement', label: '与上顿互补', text: `上顿${lastHeavy.join('、')}，这份换成清淡口味` });
  } else if (lastHeavy.some(tag => tags.includes(tag))) {
    adjust('same-taste', '连续重口', -5, `上顿与本次均标记${lastHeavy.filter(tag => tags.includes(tag)).join('、')}`);
    warnings.push('与上顿同样偏咸或偏油，互补性较低');
  }
  if (last && (last.foodCategory ? last.foodCategory === item.foodCategory : last.category && last.category === item.category)) {
    adjust('same-category', '连续同类', -6, `上顿与本次同类，保留本次所选类别并降低重复优先级`);
  }
  if (recent.slice(1).some(meal => mealContainsDish(meal, item.dish))) {
    adjust('recent-repeat', '近期重复', -10, '最近三条实际饮食记录里出现过这道菜');
    warnings.push('最近三顿里吃过这道菜，已降低推荐优先级');
  }
  if (!parts.protein && !parts.staple) {
    adjust('incomplete', '单餐不完整', -15, '示例食材未包含蛋白质食材和主食');
    warnings.push('这是蔬菜或饮品单品，可另配主食与蛋白质食材');
  } else if (!parts.staple && item.foodCategory !== 'dessert-drinks') warnings.push('这份未包含主食，可按需要另配');
  if (takeawayKnown && item.takeawaySuitability < 60) {
    adjust('takeaway-risk', '配送适配修正', -20, item.takeawayNote || '示例外卖适配度偏低');
    warnings.push(item.takeawayNote || '这份外卖适配度偏低');
  }

  if (hits.length) addReason('taste', '口味偏好', `命中你档案里的${hits.join('、')}偏好`);
  if (completeness === 100 && !reasons.some(reason => reason.key === 'goal')) addReason('completeness', '单餐搭配', '蛋白质食材、主食和蔬菜都有');
  if (takeawayKnown && item.takeawaySuitability >= 85) addReason('takeaway', '外卖适配', '出餐与携带方便，外卖适配度较高');
  if (salesKnown && popularity >= 60) addReason('popularity', '月售参考', `示例月售 ${item.monthlySales}，热度较高`);
  if (!reasons.length) addReason('completeness', '单餐搭配', partNames.length ? `示例食材含${partNames.join('、')}` : '按已知菜品信息综合排序');

  const baseScore = round(dimensions.reduce((total, part) => total + part.contribution, 0));
  const adjustmentScore = adjustments.reduce((total, adjustment) => total + adjustment.points, 0);
  return { version: SCORING_VERSION, healthScore: healthKnown ? item.healthScore : null, totalScore: round(clamp(baseScore + adjustmentScore)), baseScore, adjustmentScore,
    dimensions, adjustments, reasons: reasons.slice(0, 3), warnings: [...new Set(warnings)], weights,
    context: { goal: profile.goal || '', matchedTastes: hits, lastHeavy, lastDish: last?.dish || last?.dishes?.join('、') || '' } };
}

function meaningfulIngredients(item) {
  return [...new Set((item.ingredients || []).filter(name => !['葱', '姜', '蒜', '辣椒', '白糖', '小麦'].includes(name)))]
    .map(name => ['大米', '米饭'].includes(name) ? '米饭' : name);
}

function reasonCandidates(item) {
  const evaluation = item.evaluation;
  const context = evaluation.context || {};
  const ingredients = meaningfulIngredients(item);
  const parts = mealParts(item);
  const protein = ingredients.find(name => /肉|鸡腿|鸡胸|鱼|虾|蛤蜊|贝|鸡蛋|豆腐|牛奶|奶酪/.test(name));
  const vegetables = ingredients.filter(name => /青菜|白菜|生菜|西兰花|胡萝卜|黄瓜|青椒|豆芽|番茄|冬瓜|萝卜|茼蒿|香菇|蘑菇|菌菇|海带|南瓜/.test(name));
  const staple = ingredients.find(name => /米饭|小米|燕麦|面条|米线|米粉|土豆|红薯|紫薯|玉米|山药/.test(name));
  const cooking = (item.tasteLabels || []).find(label => /蒸|炖|烤|炒|汤|锅/.test(label)) ||
    ['清蒸', '清炒', '炖', '烤', '汤', '粥'].find(word => item.dish.includes(word));
  const flavors = (item.tasteLabels || item.tags || []).filter(tag => !['荤素搭配', '主食为主', '素菜'].includes(tag));
  const adjustment = key => evaluation.adjustments.find(part => part.key === key);
  const dimension = key => evaluation.dimensions.find(part => part.key === key);
  const candidates = [];
  const add = (key, label, text, priority) => candidates.push({ key, label, text, priority });

  if (adjustment('goal')) {
    if (context.goal === '营养均衡' && protein && parts.staple && vegetables.length) {
      add('goal', '饮食目标', `${protein}配${vegetables[0]}和${staple || '主食'}，搭配较完整`, 96);
    } else if (context.goal === '清淡减脂') {
      add('goal', '饮食目标', `${cooking || flavors[0] || item.dish}搭配，贴合你的清淡减脂目标`, 96);
    } else if (context.goal === '生酮饮食') {
      add('goal', '饮食目标', `${ingredients.slice(0, 2).join('配') || item.dish}，目录标记为低碳水`, 96);
    } else if (context.goal === '控糖少甜') {
      add('goal', '饮食目标', `${item.dish}未标记偏甜，贴合少甜偏好`, 96);
    }
  }
  if (adjustment('complement') && context.lastHeavy?.length) {
    const previous = context.lastHeavy.join('、');
    add('complement', '与上顿互补', `上顿${previous}，这次换${cooking ? cooking + '类' : item.dish}的清淡口味`, 92);
  }
  if (context.matchedTastes?.length) {
    add('taste', '口味偏好', `${flavors.slice(0, 2).join('、') || context.matchedTastes.join('、')}，命中你的${context.matchedTastes.join('、')}偏好`, 88);
  }
  if (ingredients.length) {
    const description = parts.protein && parts.staple && parts.vegetables ? '蛋白质食材、主食与蔬菜都有' : `食材有${ingredients.slice(0, 3).join('、')}`;
    add('ingredients', '食材搭配', description === '蛋白质食材、主食与蔬菜都有' ? `${ingredients.slice(0, 3).join('、')}，一餐搭配较完整` : description, 84);
  }
  if (Number.isFinite(evaluation.healthScore) && evaluation.healthScore >= 80) {
    add('health', '健康参考', `${cooking ? cooking + '做法，' : ''}健康参考 ${evaluation.healthScore} 分`, 78);
  }
  const takeaway = dimension('takeaway');
  if (takeaway?.value >= 85) {
    add('takeaway', '外卖适配', `外卖适配 ${takeaway.value} 分${Number.isFinite(item.deliveryMinutes) ? `，预计 ${item.deliveryMinutes} 分钟` : ''}`, 72);
  }
  const popularity = dimension('popularity');
  if (Number.isFinite(popularity?.value) && Number.isFinite(item.monthlySales)) {
    add('popularity', '月售参考', `示例月售 ${item.monthlySales}，热度折算 ${popularity.value} 分`, 68);
  }
  if (!candidates.length) for (const reason of evaluation.reasons) add(reason.key, reason.label, reason.text, 50);
  return candidates;
}

export function distinctRecommendationReasons(items) {
  const leadUsage = new Map();
  const reasonUsage = new Map();
  const usedText = new Set();
  return items.map(item => {
    const candidates = reasonCandidates(item);
    const rank = (candidate, lead) => candidate.priority - (lead ? leadUsage.get(candidate.key) || 0 : reasonUsage.get(candidate.key) || 0) * 35;
    const lead = [...candidates].sort((a, b) => rank(b, true) - rank(a, true)).find(candidate => !usedText.has(candidate.text)) || candidates[0];
    leadUsage.set(lead.key, (leadUsage.get(lead.key) || 0) + 1);
    const selected = [lead];
    usedText.add(lead.text);
    reasonUsage.set(lead.key, (reasonUsage.get(lead.key) || 0) + 1);
    const extras = [...candidates].filter(candidate => candidate.key !== lead.key && !usedText.has(candidate.text))
      .sort((a, b) => rank(b, false) - rank(a, false));
    for (const extra of extras) {
      if (selected.length === 2) break;
      selected.push(extra); usedText.add(extra.text); reasonUsage.set(extra.key, (reasonUsage.get(extra.key) || 0) + 1);
    }
    const reasons = selected.map(({ key, label, text }) => ({ key, label, text }));
    return { ...item, reason: reasons[0].text, evaluation: { ...item.evaluation, reasons } };
  });
}

export function recommendationSummary(items, profile) {
  if (!items.length) return '先保留你的忌口，再一起调整类别、预算或送达时间';
  const evaluations = items.map(item => item.evaluation);
  const contexts = evaluations.map(evaluation => evaluation.context || {});
  const history = contexts.find(context => context.lastHeavy?.length);
  const clearCount = items.filter(item => item.tags?.includes('清淡')).length;
  const completeCount = evaluations.filter(evaluation => evaluation.dimensions.some(part => part.key === 'completeness' && part.value === 100)).length;
  const allClear = clearCount === items.length;
  if (history && clearCount > 0) {
    return `上顿${history.lastHeavy.join('、')}，这顿${allClear ? '优先选清淡口味' : '挑几份清淡选择换着吃'}${completeCount >= Math.ceil(items.length / 2) ? '，也兼顾一餐搭配' : ''}`;
  }
  if (profile.goal === '清淡减脂') return `结合你的清淡减脂目标，按健康参考、口味与外卖适配综合挑选${allClear ? '清淡的一餐' : '这几份选择'}`;
  if (profile.goal === '营养均衡' && completeCount > 0) return `按你的营养均衡偏好，${completeCount === items.length ? '优先挑蛋白质、主食和蔬菜搭配完整的一餐' : '兼顾食材搭配与口味，挑好这几份选择'}`;
  const matchedTastes = [...new Set(contexts.flatMap(context => context.matchedTastes || []))];
  if (matchedTastes.length) return `结合你偏好的${matchedTastes.join('、')}口味，再按健康参考、单餐搭配与外卖适配排序`;
  if (profile.goal === '控糖少甜') return '结合你的少甜目标，兼顾单餐搭配和外卖适配，选好这一顿';
  if (profile.goal === '生酮饮食') return '结合目录的低碳水标记与已选条件，综合口味和外卖适配挑选';
  return '在你选定的类别、预算和送达时间内，按健康、口味与搭配综合排序';
}
