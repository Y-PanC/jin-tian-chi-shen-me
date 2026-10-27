import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = {};
const session = new Map();
globalThis.sessionStorage = {
  getItem: key => session.get(key) ?? null,
  setItem: (key, value) => session.set(key, String(value)),
  removeItem: key => session.delete(key)
};
const legacy = new Map([['meal_logs', '[{"text":"原记录"}]']]);
globalThis.localStorage = { getItem: key => legacy.get(key) ?? null, setItem: (key, value) => legacy.set(key, value) };
const { api, Cloud } = await import('../dist/assets/cloud.js');
const { MealJournal: J } = await import('../dist/assets/journal.js');
const reply = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });

test('API requests use same-origin cookies and explicit mutation headers without browser secrets', async () => {
  globalThis.fetch = async (path, options) => {
    assert.equal(path, 'api/v1/preferences');
    assert.equal(options.credentials, 'same-origin');
    assert.equal(options.headers.get('X-Meal-Request'), '1');
    assert.equal(options.headers.has('Authorization'), false);
    assert.deepEqual(JSON.parse(options.body), { profile: { goal: '营养均衡' } });
    return reply({ ok: true });
  };
  assert.deepEqual(await api('preferences', { method: 'PUT', body: { profile: { goal: '营养均衡' } } }), { ok: true });
});

test('failed cloud writes retain the current state and never overwrite legacy local records', async () => {
  const profile = { goal: '营养均衡' };
  Cloud.active = true; Cloud.state = { profile, settings: {}, records: [], version: 2 };
  globalThis.MealCloud = Cloud;
  globalThis.fetch = async () => reply({ detail: '资料已在其他页面更新' }, 409);
  await assert.rejects(Cloud.saveProfile({ goal: '清淡减脂' }), /其他页面/);
  assert.equal(Cloud.state.profile, profile); assert.equal(Cloud.state.version, 2);
  await assert.rejects(Cloud.saveMeal({ id: 'draft-id', dishes: ['米饭'] }), /其他页面/);
  assert.deepEqual(Cloud.state.records, []);
  assert.throws(() => J.write([]), /保存接口/);
  assert.equal(legacy.get('meal_logs'), '[{"text":"原记录"}]');
});

test('successful meal writes keep server revisions and replace a meal rather than duplicating it', async () => {
  Cloud.state = { records: [{ id: 'one', revision: 1, dishes: ['面'] }] };
  const saved = { id: 'one', revision: 2, dishes: ['青菜面'] };
  globalThis.fetch = async (path, options) => {
    assert.equal(path, 'api/v1/meals/one');
    assert.equal(JSON.parse(options.body).expectedRevision, 1);
    return reply({ record: saved });
  };
  await Cloud.saveMeal(saved, Cloud.state.records[0]);
  assert.deepEqual(Cloud.state.records, [saved]);
});

test('cloud reads isolate account records from untouched local browser data', () => {
  Cloud.active = true; Cloud.state = { records: [{ id: 'cloud-one', text: '青菜面', eatenAt: null, tags: [] }], settings: { nickname: '账号昵称' } };
  assert.equal(J.read()[0].id, 'cloud-one');
  assert.equal(J.getSettings().nickname, '账号昵称');
  J.seedStarter();
  assert.equal(legacy.get('meal_logs'), '[{"text":"原记录"}]');
  Cloud.active = false;
});
