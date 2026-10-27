import test from 'node:test';
import assert from 'node:assert/strict';
import { MealJournal as J } from '../dist/assets/journal.js';
import { makeMealRecord, recordToDraft, recordToSummary, localDateValue, filterMeals, normalizeDateFilters } from '../dist/assets/meal-records.js';

const now = new Date(2026, 9, 25, 20, 0);
const draft = { name: '番茄炒蛋、米饭', time: '2026-10-25T12:30', tags: ['清淡', '蔬菜'], remarks: '少油，很喜欢。', photos: [{ id: 'photo-a', name: 'lunch.jpg', mimeType: 'image/jpeg', size: 1200 }] };

test('structured meals round-trip every editable field and preserve record identity when edited', () => {
  const first = makeMealRecord(draft, null, now);
  assert.deepEqual(first.dishes, ['番茄炒蛋', '米饭']);
  const restored = recordToDraft(J.normalize(JSON.parse(JSON.stringify(first))));
  assert.equal(restored.name, draft.name); assert.equal(restored.time, draft.time);
  assert.equal(restored.remarks, draft.remarks); assert.deepEqual(restored.tags, draft.tags);
  assert.equal(restored.photos[0].id, 'photo-a');
  const edited = makeMealRecord({ ...restored, name: '青菜面', time: '2026-10-24T18:15', tags: ['鲜香'], remarks: '加了一份青菜', photos: [{ id: 'photo-b' }] }, { ...first, custom: 'keep' }, now);
  assert.equal(edited.id, first.id); assert.equal(edited.createdAt, first.createdAt); assert.equal(edited.custom, 'keep');
  assert.equal(edited.period, '晚餐'); assert.equal(localDateValue(edited.eatenAt), '2026-10-24T18:15');
  assert.deepEqual(edited.photos.map(photo => photo.id), ['photo-b']);
  assert.deepEqual(edited.tags, ['鲜香']); assert.equal(edited.remarks, '加了一份青菜');
  const memory = new Map();
  globalThis.localStorage = { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) };
  J.write([first]); J.write([edited, ...J.read().filter(record => record.id !== edited.id)]);
  assert.equal(J.read().length, 1); assert.deepEqual(J.read()[0].dishes, ['青菜面']);
});

test('legacy meals keep their original text in editable remarks and do not acquire invented dates', () => {
  const legacy = J.normalize({ id: 'old', text: '午餐吃了黄焖鸡，口味有点咸', custom: 'keep' });
  const migrated = recordToDraft(legacy);
  assert.equal(migrated.time, ''); assert.equal(migrated.remarks, legacy.text); assert.equal(migrated.name, '黄焖鸡');
  const saved = makeMealRecord({ ...migrated, time: '2026-10-24T12:00', remarks: '改为少盐' }, legacy, now);
  assert.equal(saved.id, 'old'); assert.equal(saved.originalText, legacy.text); assert.equal(saved.custom, 'keep');
  assert.equal(saved.remarks, '改为少盐');
});

test('list summaries omit duplicate source text while editors retain it and independent notes stay visible', () => {
  const text = '10/23 12:35 午餐：黄焖鸡、米饭，偏咸，少酱';
  const legacy = J.normalize({ id: 'old', text, note: text });
  const original = structuredClone(legacy);
  assert.equal(recordToSummary(legacy).name, '黄焖鸡');
  assert.equal(recordToSummary(legacy).remarks, '');
  assert.equal(recordToDraft(legacy).remarks, text);
  assert.equal(recordToSummary({ ...legacy, note: '少酱' }).remarks, '少酱');
  assert.equal(recordToSummary({ ...legacy, remarks: '另外加了一份青菜' }).remarks, '另外加了一份青菜');
  assert.equal(recordToSummary({ ...legacy, note: '少酱', remarks: '' }).remarks, '');
  assert.deepEqual(legacy, original);
});

test('year month and day filters use local meal time, handle undated records, and sort after edits', () => {
  const records = [
    { id: 'midnight', eatenAt: new Date(2026, 9, 25, 0, 30).toISOString() },
    { id: 'yesterday', eatenAt: new Date(2026, 9, 24, 23, 30).toISOString() },
    { id: 'other-year', eatenAt: new Date(2025, 9, 25, 12).toISOString() },
    { id: 'other-month', eatenAt: new Date(2026, 8, 25, 12).toISOString() },
    { id: 'unknown', eatenAt: null }
  ];
  assert.deepEqual(filterMeals(records, { year: '2026', month: '10', day: '25' }).map(record => record.id), ['midnight']);
  assert.equal(filterMeals(records, { month: '10' }).length, 3);
  assert.equal(filterMeals(records, { year: '2026' }).length, 3);
  assert.deepEqual(filterMeals(records, { year: 'unknown' }).map(record => record.id), ['unknown']);
  assert.equal(filterMeals(records).length, 5);
  assert.equal(normalizeDateFilters({ year: 2026, month: 2, day: 29 }).day, '');
  assert.equal(normalizeDateFilters({ year: 2024, month: 2, day: 29 }).day, '29');
  assert.equal(normalizeDateFilters({ month: 1.5, day: 2.5 }).month, '');
});

test('invalid meal details are rejected before persistence, including dates, tags and photo limits', () => {
  for (const time of ['', '2026-02-30T12:00', '2026-10-25T25:00', '2999-01-01T00:00']) {
    assert.throws(() => makeMealRecord({ ...draft, time }, null, now), /日期|时间/);
  }
  assert.throws(() => makeMealRecord({ ...draft, name: '  ' }, null, now), /菜品名称/);
  assert.throws(() => makeMealRecord({ ...draft, tags: Array.from({ length: 13 }, (_, index) => `标签${index}`) }, null, now), /标签/);
  assert.throws(() => makeMealRecord({ ...draft, photos: Array.from({ length: 5 }, (_, index) => ({ id: `photo-${index}` })) }, null, now), /照片/);
});
