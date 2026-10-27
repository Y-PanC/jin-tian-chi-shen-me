(() => {
  'use strict';
  const GOALS = ['营养均衡', '清淡减脂', '生酮饮食', '控糖少甜', '随心所欲', '无所谓'];
  const TASTES = ['重口', '清淡', '偏甜'];
  const RESTRICTIONS = ['葱', '姜', '蒜', '内脏', '猪肉', '羊肉', '海鲜', '坚果', '乳糖不耐受'];
  const SPICE_LEVELS = ['完全不吃辣', '微辣', '中辣', '辣'];
  const APPETITES = ['吃得较少', '一般水平', '饭量偏大'];
  const BUDGETS = [
    { value: 'under15', label: '15元以内', max: 15 },
    { value: '15to25', label: '15～25元', max: 25 },
    { value: '25to40', label: '25～40元', max: 40 },
    { value: 'unlimited', label: '不设限', max: null }
  ];
  const DEFAULTS = { goal: '营养均衡', tastes: [], restrictions: [], spiceLevel: null, budgetRange: '15to25', appetite: '一般水平' };
  const strings = value => Array.isArray(value) ? [...new Set(value.filter(item => typeof item === 'string').map(item => item.trim()).filter(Boolean))] : [];
  function read(kind, key) {
    if (kind === 'localStorage' && window.MealCloud?.active) {
      const value = window.MealCloud.read(key);
      if (value !== undefined) return value;
    }
    try { return JSON.parse(window[kind].getItem(key) || 'null'); }
    catch { return null; }
  }
  function validProfile(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
  function budgetRange(profile) {
    if (BUDGETS.some(item => item.value === profile?.budgetRange)) return profile.budgetRange;
    if (profile?.budget === null) return 'unlimited';
    const amount = Number(profile?.budget);
    if (!Number.isFinite(amount) || amount <= 0) return DEFAULTS.budgetRange;
    return amount <= 15 ? 'under15' : amount <= 25 ? '15to25' : amount <= 40 ? '25to40' : 'unlimited';
  }
  function normalizeProfile(value) {
    const raw = validProfile(value) ? value : {};
    const oldRestrictions = strings(raw.restrictions);
    const oldTastes = strings(raw.tastes);
    const restrictionAliases = { '不吃葱蒜': ['葱', '蒜'], '不吃羊肉': ['羊肉'], '海鲜过敏': ['海鲜'] };
    const restrictions = [...new Set(oldRestrictions.flatMap(item => item === '不吃辣' || item === 'none' ? [] : restrictionAliases[item] || [item]))];
    const tasteAliases = { '咸鲜': '重口', '浓郁': '重口', '酸甜': '偏甜' };
    const tastes = [...new Set(oldTastes.map(item => tasteAliases[item] || item).filter(item => TASTES.includes(item)))];
    let spiceLevel = SPICE_LEVELS.includes(raw.spiceLevel) ? raw.spiceLevel : null;
    if (oldRestrictions.includes('不吃辣')) spiceLevel = '完全不吃辣';
    else if (!spiceLevel && oldTastes.includes('微辣')) spiceLevel = '微辣';
    else if (!spiceLevel && oldTastes.includes('香辣')) spiceLevel = '辣';
    const goalAliases = { '减脂': '清淡减脂', '控糖': '控糖少甜', '不设': '营养均衡' };
    const goal = GOALS.includes(raw.goal) ? raw.goal : goalAliases[raw.goal] || DEFAULTS.goal;
    const range = budgetRange(raw);
    return { ...raw, goal, tastes, restrictions, spiceLevel, budgetRange: range, budget: BUDGETS.find(item => item.value === range).max, appetite: APPETITES.includes(raw.appetite) ? raw.appetite : DEFAULTS.appetite };
  }
  function latestMeal(logs) {
    const candidates = (Array.isArray(logs) ? logs : []).filter(item => item && typeof (item.dish || item.dish_name || item.text) === 'string' && (item.dish || item.dish_name || item.text).trim());
    return candidates.reduce((latest, item) => {
      if (!latest) return item;
      const currentTime = Date.parse(item.eatenAt || item.loggedAt || item.createdAt || item.timestamp || item.time || '') || 0;
      const latestTime = Date.parse(latest.eatenAt || latest.loggedAt || latest.createdAt || latest.timestamp || latest.time || '') || 0;
      return currentTime >= latestTime ? item : latest;
    }, null);
  }
  function mealContext(logs, recommendation) {
    const meal = latestMeal(logs);
    if (meal) return { source: 'meal', dish: (meal.dish || meal.dish_name || meal.text).trim() };
    const recommendedDish = typeof recommendation?.dish === 'string' ? recommendation.dish : recommendation?.recommendations?.find(item => typeof item?.dish === 'string')?.dish;
    if (typeof recommendedDish === 'string' && recommendedDish.trim()) return { source: 'recommendation', dish: recommendedDish.trim() };
    return { source: 'none', dish: null };
  }
  window.MealPreferences = Object.freeze({ GOALS, TASTES, RESTRICTIONS, SPICE_LEVELS, APPETITES, BUDGETS, DEFAULTS, strings, read, validProfile, budgetRange, normalizeProfile, mealContext });
})();
