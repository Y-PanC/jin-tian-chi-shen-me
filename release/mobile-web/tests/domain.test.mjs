import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { recommendFromData, allowedDish, parseMeal, tastePortrait, latestMeal } from '../dist/assets/domain.js';
const menu = JSON.parse(await readFile(new URL('../dist/assets/data/menu.json', import.meta.url)));
const table = JSON.parse(await readFile(new URL('../dist/assets/data/decision-table.json', import.meta.url)));
const profile = { goal: '清淡减脂', tastes: [], restrictions: [], spiceLevel: null, budget: 25, appetite: '一般水平' };
const request = { mood: '无所谓', direction: '暂无想法', budgetRange: '15to25', budget: 25, changeTaste: false };
test('every declared decision-table ID exists and has complete fields', () => {
  assert.equal(new Set(menu.map(item => item.id)).size, menu.length);
  for (const ids of Object.values(table)) for (const id of ids) assert(menu.some(item => item.id === id), id);
  for (const item of menu) { assert(item.shop && item.dish && item.category); assert(item.ingredients.length); assert(item.tags.length); assert(item.price > 0); }
});
test('all supported combinations return two disjoint batches within hard constraints', () => {
  const restrictions = [[], ['海鲜'], ['乳糖不耐受', '坚果'], ['葱', '姜', '蒜'], ['葱', '姜', '蒜', '内脏', '猪肉', '羊肉', '海鲜', '坚果', '乳糖不耐受', '鸡蛋']];
  for (const blocked of restrictions) for (const budget of [15, 25, 40, null]) for (const spiceLevel of [null, '完全不吃辣', '微辣', '中辣', '辣']) {
    for (const mood of ['无所谓', '吃点好的', '速战速决', '清淡一点']) for (const direction of ['暂无想法', '米粉面', '盖饭简餐', '地方菜系', '汉堡披萨', '特色小吃']) {
      const p = { ...profile, restrictions: blocked, spiceLevel }; const r = { ...request, mood, direction, budget };
      const first = recommendFromData(menu, table, r, p, []);
      const second = recommendFromData(menu, table, r, p, [], first.items.map(item => item.id));
      assert.equal(first.items.length, 3); assert.equal(second.items.length, 3);
      assert(!second.items.some(item => first.items.some(other => item.id === other.id)));
      for (const item of [...first.items, ...second.items]) assert(allowedDish(item, p, budget, null));
    }
  }
});
test('the demo chain excludes the salty previous meal and cites its actual record', () => {
  const first = recommendFromData(menu, table, request, profile, []);
  assert(first.items.some(item => item.dish === '黄焖鸡'));
  const logs = [{ dish: '黄焖鸡', tags: ['偏咸'], period: '午餐', eatenAt: '2026-10-22T12:00:00+08:00' }];
  const next = recommendFromData(menu, table, request, profile, logs);
  assert.equal(next.items.length, 3);
  for (const item of next.items) {
    assert.notEqual(item.dish, '黄焖鸡'); assert(item.tags.includes('清淡')); assert.match(item.reason, /你中午吃了偏咸的黄焖鸡/);
  }
});
test('free-text custom restrictions and impossible budgets do not bypass exclusions', () => {
  const result = recommendFromData(menu, table, { ...request, budget: 1 }, { ...profile, restrictions: ['鸡肉'] }, []);
  assert.equal(result.items.length, 0);
  const chickenFree = recommendFromData(menu, table, request, { ...profile, restrictions: ['鸡肉', '鸡蛋'] }, []);
  assert(chickenFree.items.every(item => !item.ingredients.includes('鸡肉') && !item.ingredients.includes('鸡蛋')));
});
test('photo, voice and text adapters can share parsing; user corrections override inferred tags', () => {
  for (const type of ['photo', 'voice', 'text']) {
    const value = parseMeal({ type, text: '中午吃了黄焖鸡，有点咸' }, menu);
    assert.equal(value.dish, '黄焖鸡'); assert.equal(value.period, '午餐'); assert(value.tags.includes('偏咸'));
  }
  const corrected = parseMeal({ text: '黄焖鸡，这次不咸不辣' }, menu);
  assert(!corrected.tags.includes('偏咸')); assert(!corrected.tags.includes('偏辣')); assert(corrected.tags.includes('清淡'));
  assert.equal(parseMeal({ text: '晚饭吃了自家青菜汤，很清淡' }, menu).dish, '自家青菜汤');
  assert.throws(() => parseMeal({ text: '  ' }, menu));
});
test('backdated edits do not become the latest eaten meal; portrait counts confirmed tags once', () => {
  const logs = [{ dish: '旧餐', eatenAt: '2026-10-20', createdAt: '2026-10-23', tags: ['偏咸', '偏咸'] }, { dish: '新餐', eatenAt: '2026-10-22', tags: ['清淡'] }];
  assert.equal(latestMeal(logs).dish, '新餐');
  assert.deepEqual(tastePortrait(logs), [['清淡', 1], ['偏咸', 1]]);
});
test('a real saved meal takes precedence over a stale recommendation in the ask question', async () => {
  const sandbox = { window: {} }; vm.createContext(sandbox);
  vm.runInContext(await readFile(new URL('../dist/assets/preferences.js', import.meta.url), 'utf8'), sandbox);
  const context = sandbox.window.MealPreferences.mealContext([{ dish: '黄焖鸡', eatenAt: '2026-10-22' }], { dish: '旧推荐' });
  assert.equal(context.source, 'meal'); assert.equal(context.dish, '黄焖鸡');
});
