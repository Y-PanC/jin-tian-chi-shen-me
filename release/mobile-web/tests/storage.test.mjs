import test from 'node:test';
import assert from 'node:assert/strict';
const memory = new Map();
globalThis.localStorage = { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) };
globalThis.window = { MealPreferences: { read: (kind, key) => { try { return JSON.parse(globalThis[kind].getItem(key)); } catch { return null; } } } };
const { saveMeal, readLogs, deleteMeal } = await import('../dist/assets/services.js');
const meal = { dish: '黄焖鸡', tags: ['偏咸'], period: '午餐', eatenAt: '2026-01-01T12:00:00+08:00', source: 'text' };
test('saving and editing one meal preserves its identity instead of duplicating it', () => {
  memory.clear(); const original = saveMeal(meal);
  const updated = saveMeal({ ...original, tags: ['清淡'], dish: '番茄鸡蛋面' });
  assert.equal(updated.id, original.id); assert.equal(readLogs().length, 1); assert.equal(readLogs()[0].dish, '番茄鸡蛋面');
  deleteMeal(updated.id); assert.equal(readLogs().length, 0);
  assert.throws(() => saveMeal({ ...updated, dish: '旧页面修改' }), /删除/);
});
test('invalid stored data is preserved and save failures remain explicit', () => {
  memory.clear(); memory.set('meal_logs', '{broken');
  assert.throws(() => saveMeal(meal), /未能保存/); assert.equal(memory.get('meal_logs'), '{broken');
});
test('blank names and future timestamps are rejected before storage changes', () => {
  memory.clear();
  assert.throws(() => saveMeal({ ...meal, dish: '  ' }), /菜名/);
  assert.throws(() => saveMeal({ ...meal, eatenAt: '2999-01-01' }), /用餐时间/);
  assert.equal(memory.size, 0);
});
test('legacy records without dates do not invent a meal time or period', () => {
  memory.clear(); memory.set('meal_logs', JSON.stringify([{ dish: '旧记录', tags: [] }]));
  assert.equal(readLogs()[0].eatenAt, null); assert.equal(readLogs()[0].period, null);
});
