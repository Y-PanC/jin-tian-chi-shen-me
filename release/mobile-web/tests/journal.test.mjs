import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { MealJournal as J } from '../dist/assets/journal.js';
import { recommendFromData } from '../dist/assets/domain.js';

const memory = new Map();
globalThis.localStorage = {
  getItem: key => memory.get(key) ?? null,
  setItem: (key, value) => memory.set(key, value)
};
globalThis.window = {};
vm.runInNewContext(await readFile(new URL('../dist/assets/data/meal-seed-v3.js', import.meta.url), 'utf8'), { window });

test('V7 journals and existing structured records share one lossless log source', () => {
  memory.clear();
  const records = [
    { id: 'journal', text: '午餐：黄焖鸡，偏咸', loggedAt: '2026-10-22T04:00:00Z', inputMethod: 'voice', custom: 'preserved' },
    { id: 'existing', dish: '番茄鸡蛋面', tags: [], period: '晚餐', eatenAt: '2026-10-21T11:00:00Z', shop: '原店铺', price: 18 }
  ];
  memory.set(J.KEY, JSON.stringify(records));
  const logs = J.read();
  assert.equal(logs[0].dish, '黄焖鸡');
  assert(logs[0].tags.includes('偏咸'));
  assert.equal(logs[0].eatenAt, '2026-10-22T04:00:00.000Z');
  assert.equal(logs[1].text, '番茄鸡蛋面');
  assert.deepEqual(logs[1].tags, []);
  J.write(logs);
  const saved = JSON.parse(memory.get(J.KEY));
  assert.equal(saved.length, 2);
  assert.equal(saved[0].custom, 'preserved');
  assert.equal(saved[0].text, records[0].text);
  assert.equal(saved[0].inputMethod, 'voice');
  assert.equal(saved[1].shop, '原店铺');
  assert.equal(saved[1].price, 18);
});

test('recommendations use the last V7 journal and its inferred taste', async () => {
  memory.clear();
  memory.set(J.KEY, JSON.stringify([{ id: 'last', text: '午餐吃了黄焖鸡，偏咸', loggedAt: '2026-10-22T04:00:00Z' }]));
  const menu = JSON.parse(await readFile(new URL('../dist/assets/data/menu.json', import.meta.url)));
  const table = JSON.parse(await readFile(new URL('../dist/assets/data/decision-table.json', import.meta.url)));
  const result = recommendFromData(menu, table, { mood: '无所谓', direction: '暂无想法', budget: 25 }, { restrictions: [], budget: 25 }, J.read());
  assert.equal(result.items.length, 3);
  for (const item of result.items) {
    assert.notEqual(item.dish, '黄焖鸡');
    assert(item.tags.includes('清淡'));
    assert.match(item.reason, /中午吃了偏咸的黄焖鸡/);
  }
});

test('samples only initialize an untouched browser and never return after clearing', () => {
  memory.clear();
  J.seedStarter();
  assert.equal(J.read().length, 30);
  assert(J.read().every(log => log.source === 'fictional-mixed-dining-sample'));
  J.seedStarter();
  assert.equal(J.read().length, 30);
  J.write([]);
  J.seedStarter();
  assert.equal(J.read().length, 0);
  memory.clear();
  memory.set(J.KEY, '[]');
  J.seedStarter();
  assert.equal(J.read().length, 0);
  memory.set(J.KEY, JSON.stringify([{ dish: '手工记录', text: '手工记录' }]));
  J.seedStarter();
  assert.equal(J.read().length, 1);
});

test('settings merge independently from business preferences and keep extra fields', () => {
  memory.clear();
  memory.set('user_profile', JSON.stringify({ goal: '营养均衡', budget: 25 }));
  memory.set(J.SETTINGS_KEY, JSON.stringify({ nickname: '原昵称', phone: '13800000000', custom: 'keep' }));
  J.saveSettings({ nickname: '新昵称', userId: 'food_001', photoInputEnabled: false });
  assert.equal(J.getSettings().nickname, '新昵称');
  assert.equal(J.getSettings().userId, 'food_001');
  assert.equal(J.getSettings().phone, '13800000000');
  assert.equal(J.getSettings().custom, 'keep');
  assert.equal(J.getSettings().photoInputEnabled, false);
  assert.equal(J.getSettings().voiceInputEnabled, true);
  assert.deepEqual(JSON.parse(memory.get('user_profile')), { goal: '营养均衡', budget: 25 });
});

test('bad dates, corrupt storage and negated tastes are handled without invented facts', () => {
  memory.clear();
  assert.throws(() => J.parseMealDate('2/30 午餐'), /日期/);
  assert.throws(() => J.parseMealDate('昨天 25:90 晚餐'), /时间/);
  const yesterday = J.parseMealDate('昨天 12:30 午餐');
  assert.equal(yesterday.getHours(), 12);
  assert.equal(yesterday.getMinutes(), 30);
  assert(yesterday < new Date());
  assert(!J.analyze('黄焖鸡，不辣不咸').tastes.includes('偏辣'));
  assert(!J.analyze('黄焖鸡，不辣不咸').tastes.includes('偏咸'));
  assert.equal(J.normalize({ text: '旧记录' }).loggedAt, null);
  assert.equal(J.normalize({ text: '旧记录' }).period, null);
  memory.set(J.KEY, '{broken');
  assert.throws(() => J.write([{ text: '新记录' }]), /未能保存/);
  assert.equal(memory.get(J.KEY), '{broken');
  J.seedStarter();
  assert.equal(memory.get(J.KEY), '{broken');
});
