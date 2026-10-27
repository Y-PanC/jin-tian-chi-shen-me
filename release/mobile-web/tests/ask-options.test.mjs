import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { FOOD_CATEGORIES, ASK_BUDGETS, DELIVERY_TIMES, askAnswers, askRequest, validAskRequest, matchesAsk, askLabels, selectedCategories } from '../dist/assets/ask-options.js';
import { recommendationPages, allowedDish, latestMeal } from '../dist/assets/domain.js';

const menu = JSON.parse(await readFile(new URL('../dist/assets/data/menu.json', import.meta.url)));
const table = JSON.parse(await readFile(new URL('../dist/assets/data/decision-table.json', import.meta.url)));
const profile = { goal: '营养均衡', tastes: [], restrictions: [], spiceLevel: null, budget: 25 };
const answers = { category: 'any', budgetRange: '20to30', deliveryTime: 'unlimited' };

test('returning to edit preserves all three answers and migrates older question answers', () => {
  const selected = { categories: ['japanese-korean','noodles'], budgetRange: '40to60', deliveryTime: 'under45' };
  assert.deepEqual(askAnswers(askRequest(selected), profile), selected);
  assert.deepEqual(askAnswers({ direction: '米粉面', budgetRange: '15to25', mood: '速战速决', changeTaste: true }, profile),
    { categories: ['noodles'], budgetRange: '20to30', deliveryTime: 'unlimited' });
  assert.deepEqual(askAnswers(null, { budget: null }), { categories: [], budgetRange: 'unlimited', deliveryTime: 'unlimited' });
  assert.deepEqual(askAnswers({ schemaVersion:3, category:'rice', budgetRange:'20to30', deliveryTime:'under30' }, profile), { categories:['rice'], budgetRange:'20to30', deliveryTime:'under30' });
});

test('multiple categories match by OR while price and delivery remain hard limits', () => {
  const request = askRequest({ categories:['rice','noodles'], budgetRange:'20to30', deliveryTime:'under30' });
  assert.deepEqual(selectedCategories(request), ['rice','noodles']);
  assert.deepEqual(askLabels(request), ['中式快餐','粉面米线','20～30元','30分钟内']);
  for (const foodCategory of ['rice','noodles']) assert(matchesAsk({ foodCategory, price:25, deliveryMinutes:30 }, request));
  assert(!matchesAsk({ foodCategory:'burgers', price:25, deliveryMinutes:30 }, request));
  assert(!matchesAsk({ foodCategory:'rice', price:31, deliveryMinutes:30 }, request));
  assert(!matchesAsk({ foodCategory:'noodles', price:25, deliveryMinutes:31 }, request));
  const any = askRequest({ categories:[], budgetRange:'unlimited', deliveryTime:'unlimited' });
  assert(matchesAsk({ foodCategory:'burgers', price:25, deliveryMinutes:60 }, any));
  for (const categories of [['any','rice'],['rice','rice'],['unknown'],null]) assert.throws(() => askRequest({ categories, budgetRange:'20to30', deliveryTime:'under30' }));
});

test('new requests use the declared price and delivery limits and reject invalid option IDs', () => {
  const request = askRequest({ ...answers, budgetRange: 'over100', deliveryTime: 'under30' });
  assert.equal(request.budgetMin, 100); assert.equal(request.budget, null); assert.equal(request.deliveryMinutes, 30);
  assert(validAskRequest(request));
  for (const invalid of [{ category: 'unknown' }, { budgetRange: '15to25' }, { deliveryTime: 'tomorrow' }]) {
    assert.throws(() => askRequest({ ...answers, ...invalid }));
    assert.equal(validAskRequest({ ...request, ...invalid }), false);
  }
});

test('budget ranges enforce both bounds, including unbounded high budgets', () => {
  const dish = { foodCategory: 'rice', deliveryMinutes: 30 };
  const mid = askRequest({ ...answers, budgetRange: '20to30' });
  for (const price of [20, 25, 30]) assert(matchesAsk({ ...dish, price }, mid));
  for (const price of [19.99, 30.01, NaN]) assert(!matchesAsk({ ...dish, price }, mid));
  const high = askRequest({ ...answers, budgetRange: 'over100' });
  assert(!matchesAsk({ ...dish, price: 99 }, high));
  assert(matchesAsk({ ...dish, price: 128 }, high));
});

test('time-limited recommendations exclude unknown or over-limit delivery estimates', () => {
  const request = askRequest({ ...answers, deliveryTime: 'under30' });
  for (const deliveryMinutes of [20, 30]) assert(matchesAsk({ foodCategory: 'rice', price: 25, deliveryMinutes }, request));
  for (const deliveryMinutes of [undefined, null, 0, 31]) assert(!matchesAsk({ foodCategory: 'rice', price: 25, deliveryMinutes }, request));
});

test('every displayed food category has sample dishes with explicit delivery estimates', () => {
  for (const category of FOOD_CATEGORIES.filter(item => item.value !== 'any')) assert(menu.some(item => item.foodCategory === category.value), category.label);
  for (const item of menu) assert(Number.isInteger(item.deliveryMinutes) && item.deliveryMinutes > 0, item.dish);
});

test('all pages obey category, both price bounds, delivery, allergy, spice and last-meal constraints', () => {
  const preferences = { ...profile, restrictions: ['海鲜', '坚果'], spiceLevel: '完全不吃辣' };
  const logs = [{ dish: '黄焖鸡', eatenAt: '2026-10-26T12:00:00+08:00', tags: ['偏咸'], period: '午餐' }];
  for (const category of FOOD_CATEGORIES) for (const budget of ASK_BUDGETS) for (const delivery of DELIVERY_TIMES) {
    const request = askRequest({ category: category.value, budgetRange: budget.value, deliveryTime: delivery.value });
    const pages = recommendationPages(menu, table, request, preferences, logs);
    const actual = pages.flatMap(page => page.items);
    const expected = menu.filter(item => matchesAsk(item, request) && allowedDish(item, preferences, budget.max, latestMeal(logs)));
    assert.deepEqual(new Set(actual.map(item => item.id)), new Set(expected.map(item => item.id)));
    assert.equal(actual.length, expected.length);
    assert(pages.every(page => !page.outsideDirection));
  }
});

test('no matching category or time does not silently fall back to unrelated choices', () => {
  const request = askRequest({ category: 'hotpot', budgetRange: 'under10', deliveryTime: 'under20' });
  assert.deepEqual(recommendationPages(menu, table, request, profile, []), []);
  assert.deepEqual(askLabels(request), ['香锅火锅', '10元以内', '20分钟内']);
});
