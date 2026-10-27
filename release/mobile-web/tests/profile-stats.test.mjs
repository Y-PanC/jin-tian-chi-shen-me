import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeMeals, summarizeTaste, tasteDisplayScale, TASTE_AXES } from '../dist/assets/profile-stats.js';

// Pin the app's local calendar so midnight cases cannot silently use UTC days.
process.env.TZ = 'Asia/Shanghai';

test('profile counts meals, distinct dishes, and local meal days across old and new records', () => {
  const records = [
    { dishes: [' 黄焖鸡 ', '番茄炒蛋', '黄焖鸡', ''], eatenAt: '2026-10-22T16:15:00Z' },
    { dish_name: '黄焖鸡', loggedAt: '2026-10-23T15:45:00Z' },
    { text: '午餐：番茄炒蛋，清淡', loggedAt: '2026-10-24T04:00:00Z' },
    { dish: '自家炒菜', loggedAt: null },
    { dishes: ['番茄炒蛋'], loggedAt: 'invalid' }
  ];
  const original = structuredClone(records);
  const stats = summarizeMeals(records);
  assert.equal(stats.mealCount, 5);
  assert.equal(stats.dayCount, 2);
  assert.equal(stats.dishCounts.size, 3);
  assert.equal(stats.dishCounts.get('黄焖鸡'), 2);
  assert.equal(stats.dishCounts.get('番茄炒蛋'), 3);
  assert.deepEqual(records, original);
});

test('empty and undated journals do not invent record days or dishes', () => {
  const empty = summarizeMeals([]);
  assert.equal(empty.mealCount, 0);
  assert.equal(empty.dayCount, 0);
  assert.equal(empty.dishCounts.size, 0);
  const undated = summarizeMeals([{ dishes: ['清炒茼蒿'] }, { dishes: ['清炒茼蒿'], loggedAt: '' }]);
  assert.equal(undated.mealCount, 2);
  assert.equal(undated.dayCount, 0);
  assert.equal(undated.dishCounts.size, 1);
});

test('taste axes separate sweet and savory tags without inferring components from a light meal', () => {
  const stats = summarizeTaste([
    { tags: ['清淡'] },
    { tags: ['偏甜'] },
    { tags: ['鲜香'] },
    { tags: ['偏咸', '偏油', '偏油'] },
    { tags: ['偏酸', '偏辣', '鲜香'] },
    {}
  ]);
  assert.deepEqual(TASTE_AXES.map(axis => axis.label), ['咸味', '甜味', '酸味', '辣味', '鲜味', '油感']);
  assert.deepEqual(stats.counts, [1, 1, 1, 1, 2, 1]);
  assert.equal(stats.taggedMealCount, 4);
  assert.equal(stats.mealCount, 6);
  assert.deepEqual(stats.rates, [1/6, 1/6, 1/6, 1/6, 2/6, 1/6]);
  assert.deepEqual(summarizeTaste([{ tags: ['清淡'] }]).rates, [0, 0, 0, 0, 0, 0]);
  assert.deepEqual(summarizeTaste([]).rates, [0, 0, 0, 0, 0, 0]);
});

test('radar display uses one adaptive linear scale without changing reported rates or inventing zero values', () => {
  const rates = [6/31, 4/31, 3/31, 5/31, 4/31, 1/31];
  const original = [...rates];
  const display = tasteDisplayScale(rates);
  assert.equal(display.limit, 0.25);
  assert(display.points[0] > 0.75 && display.points[0] < 0.9);
  display.points.forEach((point, index) => assert.equal(point, rates[index] / display.limit));
  assert.deepEqual(rates, original);
  assert.deepEqual(tasteDisplayScale([0, 0]).points, [0, 0]);
  const fullRange = tasteDisplayScale([1, 0.5, 0]);
  assert.equal(fullRange.limit, 1);
  assert.deepEqual(fullRange.points, [1, 0.5, 0]);
});
