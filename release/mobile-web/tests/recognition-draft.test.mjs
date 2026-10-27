import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeRecognition } from '../dist/assets/recognition-draft.js';

const result = { dishes: ['西红柿炒鸡蛋'], tags: ['蔬菜', '蛋白质'] };
const empty = { name: '', tags: [], replaceName: true };

test('photo results automatically fill empty editable fields', () => {
  const merged = mergeRecognition({ name: '', tags: [] }, empty, result);
  assert.equal(merged.name, '西红柿炒鸡蛋');
  assert.deepEqual(merged.tags, ['蔬菜', '蛋白质']);
  assert.equal(merged.filledName, true);
  assert.equal(merged.preservedEdits, false);
});

test('typing during recognition is preserved while untouched tags are filled', () => {
  const merged = mergeRecognition({ name: '自己做的炒蛋', tags: [] }, empty, result);
  assert.equal(merged.name, '自己做的炒蛋');
  assert.deepEqual(merged.tags, result.tags);
  assert.equal(merged.preservedEdits, true);
});

test('tag edits during recognition are preserved independently of the dish name', () => {
  const snapshot = { name: '', tags: ['蔬菜'], replaceName: true };
  const merged = mergeRecognition({ name: '', tags: ['主食'] }, snapshot, result);
  assert.equal(merged.name, '西红柿炒鸡蛋');
  assert.deepEqual(merged.tags, ['主食']);
  assert.equal(merged.preservedEdits, true);
});

test('existing handwritten names are preserved when adding a photo', () => {
  const snapshot = { name: '今日午餐', tags: ['偏咸'], replaceName: false };
  const merged = mergeRecognition(snapshot, snapshot, result);
  assert.equal(merged.name, '今日午餐');
  assert.deepEqual(merged.tags, ['偏咸', '蔬菜', '蛋白质']);
});

test('another photo can update an unchanged automatically filled dish name', () => {
  const snapshot = { name: '西红柿炒鸡蛋', tags: ['蔬菜'], replaceName: true };
  const merged = mergeRecognition(snapshot, snapshot, { dishes: ['西红柿炒鸡蛋', '米饭'], tags: ['蔬菜', '主食'] });
  assert.equal(merged.name, '西红柿炒鸡蛋、米饭');
  assert.deepEqual(merged.tags, ['蔬菜', '主食']);
});

test('tag merging deduplicates results and respects the twelve-tag limit', () => {
  const snapshot = { ...empty, tags: Array.from({ length: 11 }, (_, index) => `标签${index}`) };
  const merged = mergeRecognition(snapshot, snapshot, { ...result, tags: ['标签1', ...result.tags] });
  assert.equal(merged.tags.length, 12);
  assert.equal(new Set(merged.tags).size, 12);
  assert.equal(snapshot.tags.length, 11);
});
