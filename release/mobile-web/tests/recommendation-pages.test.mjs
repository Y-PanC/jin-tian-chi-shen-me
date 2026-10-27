import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { recommendationPages, recommendFromData, allowedDish, latestMeal } from '../dist/assets/domain.js';
import { resultSignature, restoreResultView, recommendationURL, recommendationReturnURL } from '../dist/assets/result-state.js';

const menu = JSON.parse(await readFile(new URL('../dist/assets/data/menu.json', import.meta.url)));
const table = JSON.parse(await readFile(new URL('../dist/assets/data/decision-table.json', import.meta.url)));
const profile = { goal: '营养均衡', tastes: [], restrictions: [], spiceLevel: null, budget: 25, appetite: '一般水平' };
const request = { mood: '无所谓', direction: '暂无想法', budgetRange: '15to25', budget: 25, changeTaste: false, createdAt: '2026-10-26T08:00:00Z' };

test('all recommendation pages cover eligible dishes once and retain the original first choices', () => {
  const pages = recommendationPages(menu, table, request, profile, []);
  const items = pages.flatMap(page => page.items);
  assert.deepEqual(pages[0].items, recommendFromData(menu, table, request, profile, []).items);
  assert(items.length > 3);
  assert.equal(new Set(items.map(item => item.id)).size, items.length);
  const eligible = menu.filter(item => allowedDish(item, profile, request.budget, null));
  assert.deepEqual(new Set(items.map(item => item.id)), new Set(eligible.map(item => item.id)));
  assert(pages.slice(0, -1).every(page => page.items.length === 3));
  assert.equal(pages.length, Math.ceil(eligible.length / 3));
});

test('later pages keep allergy, spice, budget and previous-meal exclusions', () => {
  const logs = [{ dish: '黄焖鸡', eatenAt: '2026-10-25T12:00:00+08:00', tags: ['偏咸'], period: '午餐' }];
  for (const budget of [15, 25, 40, null]) {
    const preferences = { ...profile, restrictions: ['海鲜', '坚果'], spiceLevel: '完全不吃辣' };
    const pages = recommendationPages(menu, table, { ...request, budget }, preferences, logs);
    const items = pages.flatMap(page => page.items);
    const eligible = menu.filter(item => allowedDish(item, preferences, budget, latestMeal(logs)));
    assert.equal(items.length, eligible.length);
    assert(items.every(item => allowedDish(item, preferences, budget, latestMeal(logs))));
    assert.equal(new Set(items.map(item => item.id)).size, items.length);
  }
});

test('empty and short result sets have finite pages without repeating dishes', () => {
  assert.deepEqual(recommendationPages(menu, table, { ...request, budget: 1 }, profile, []), []);
  const short = recommendationPages(menu.slice(0, 2), table, { ...request, budget: null }, profile, []);
  assert.equal(short.length, 1);
  assert.equal(short[0].items.length, 2);
});

function savedView() {
  return { schemaVersion: 1, ownerId: 'account-a', signature: resultSignature(request, profile),
    pages: recommendationPages(menu, table, request, profile, []), pageIndex: 1, scrollTop: 327 };
}

test('saved results retain the exact page, dishes, reasons and scroll position across a reload', () => {
  const saved = JSON.parse(JSON.stringify(savedView()));
  const restored = restoreResultView(saved, 'account-a', resultSignature(request, profile));
  assert.deepEqual(restored, saved);
  assert.equal(restored.pageIndex, 1);
  assert.equal(restored.scrollTop, 327);
  assert.deepEqual(restored.pages[1].items, saved.pages[1].items);
});

test('another account, new answers or changed long-term preferences cannot reuse a saved result', () => {
  const saved = savedView();
  assert.equal(restoreResultView(saved, 'account-b', saved.signature), null);
  assert.equal(restoreResultView(saved, 'account-a', resultSignature({ ...request, createdAt: '2026-10-26T09:00:00Z' }, profile)), null);
  assert.equal(restoreResultView(saved, 'account-a', resultSignature(request, { ...profile, restrictions: ['鸡蛋'] })), null);
});

test('corrupt saved pages and invalid positions are regenerated instead of rendered', () => {
  for (const mutate of [
    value => { value.pageIndex = 999; },
    value => { value.scrollTop = -1; },
    value => { value.pages[0].items[0].price = null; },
    value => { value.pages[1].items[0] = value.pages[0].items[0]; },
  ]) {
    const value = savedView(); mutate(value);
    assert.equal(restoreResultView(value, 'account-a', value.signature), null);
  }
});

test('meal return targets keep the chosen page and reject external or unrelated routes', () => {
  assert.equal(recommendationReturnURL({ returnTo: recommendationURL(2) }), 'page3_result.html?page=3');
  for (const returnTo of ['https://example.com', '//example.com', 'page4_log.html', 'page3_result.html?page=0', 'page3_result.html?next=elsewhere']) {
    assert.equal(recommendationReturnURL({ returnTo }), 'page3_result.html');
  }
});
