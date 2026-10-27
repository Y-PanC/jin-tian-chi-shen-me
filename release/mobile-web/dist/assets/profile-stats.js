import { MealJournal as J } from './journal.js?v=4.0.0';
import { localDateValue } from './meal-records.js?v=4.0.0';

export function summarizeMeals(records) {
  const dishCounts = new Map();
  const days = new Set();
  for (const record of records) {
    const day = localDateValue(record.eatenAt || record.loggedAt || null).slice(0, 10);
    if (day) days.add(day);
    const parsed = J.analyze(record.text, record.loggedAt);
    const names = Array.isArray(record.dishes) && record.dishes.length ? record.dishes :
      record.dish_name ? [record.dish_name] : parsed.items.length ? parsed.items : record.dish ? [record.dish] : [];
    const uniqueNames = new Set(names.filter(name => typeof name === 'string').map(name => name.trim()).filter(Boolean));
    for (const name of uniqueNames) dishCounts.set(name, (dishCounts.get(name) || 0) + 1);
  }
  return { mealCount: records.length, dayCount: days.size, dishCounts };
}

export const TASTE_AXES = [
  { label: '咸味', tag: '偏咸' },
  { label: '甜味', tag: '偏甜' },
  { label: '酸味', tag: '偏酸' },
  { label: '辣味', tag: '偏辣' },
  { label: '鲜味', tag: '鲜香' },
  { label: '油感', tag: '偏油' }
];

export function summarizeTaste(records) {
  const counts = TASTE_AXES.map(() => 0);
  let taggedMealCount = 0;
  for (const record of records) {
    const tags = new Set(Array.isArray(record.tags) ? record.tags : []);
    let matched = false;
    TASTE_AXES.forEach((axis, index) => {
      if (tags.has(axis.tag)) { counts[index]++; matched = true; }
    });
    if (matched) taggedMealCount++;
  }
  return {
    mealCount: records.length, taggedMealCount, counts,
    rates: counts.map(count => records.length ? count / records.length : 0)
  };
}

export function tasteDisplayScale(rates) {
  const maximum = Math.max(0, ...rates);
  const target = Math.min(1, maximum * 1.1);
  const limit = [0.05, 0.1, 0.2, 0.25, 0.4, 0.5, 0.75, 1].find(value => value >= target) ?? 1;
  return { limit, points: rates.map(rate => rate / limit) };
}
