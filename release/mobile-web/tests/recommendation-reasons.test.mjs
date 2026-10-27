import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { scoreRecommendation, distinctRecommendationReasons, recommendationSummary } from '../dist/assets/recommendation-score.js';

const menu = JSON.parse(await readFile(new URL('../dist/assets/data/menu.json', import.meta.url)));
const profile = { goal: '营养均衡', tastes: ['清淡'], restrictions: [], spiceLevel: '微辣', budget: 30 };
const logs = [{ dish: '黄焖鸡', tags: ['偏咸'], eatenAt: '2026-10-26T12:00:00+08:00' }];
const scored = (ids, history = logs, user = profile) => ids.map(id => {
  const item = menu.find(candidate => candidate.id === id);
  return { ...item, evaluation: scoreRecommendation(item, {}, user, history) };
});

test('one page highlights different evidence without changing scores or order', () => {
  const originals = scored(['r05', 'r07', 'r18']);
  const presented = distinctRecommendationReasons(originals);
  assert.deepEqual(presented.map(item => item.id), originals.map(item => item.id));
  assert.deepEqual(presented.map(item => item.evaluation.totalScore), originals.map(item => item.evaluation.totalScore));
  assert.equal(new Set(presented.map(item => item.evaluation.reasons[0].key)).size, 3);
  const texts = presented.flatMap(item => item.evaluation.reasons.map(reason => reason.text));
  assert.equal(new Set(texts).size, texts.length);
  assert(texts.some(text => text.includes('鸡肉')));
  assert(texts.some(text => text.includes('偏咸')));
  assert.deepEqual(distinctRecommendationReasons(originals), presented);
});

test('visible reasons and summary do not invent meal history when no saved meal exists', () => {
  const items = distinctRecommendationReasons(scored(['r05', 'r07', 'r18'], []));
  assert(!items.flatMap(item => item.evaluation.reasons).some(reason => reason.text.includes('上顿')));
  const summary = recommendationSummary(items, profile);
  assert(!summary.includes('上顿'));
  assert(summary.includes('营养均衡'));
});

test('summary reflects saved heavy-taste history and actual current page features', () => {
  const clear = distinctRecommendationReasons(scored(['r05', 'r07']));
  assert.match(recommendationSummary(clear, profile), /^上顿偏咸，这顿优先选清淡口味/);
  const mixed = distinctRecommendationReasons(scored(['r05', 'r19']));
  const summary = recommendationSummary(mixed, profile);
  assert(summary.includes('挑几份清淡选择'));
  assert(!summary.includes('优先选清淡口味'));
});

test('presentation preserves corrections, warnings and evidence for incomplete meals', () => {
  const originals = scored(['c05', 'c06']);
  const presented = distinctRecommendationReasons(originals);
  for (let index = 0; index < presented.length; index++) {
    assert.deepEqual(presented[index].evaluation.adjustments, originals[index].evaluation.adjustments);
    assert.deepEqual(presented[index].evaluation.warnings, originals[index].evaluation.warnings);
    assert.deepEqual(presented[index].evaluation.dimensions, originals[index].evaluation.dimensions);
  }
  assert(presented[0].evaluation.warnings.length > 0);
  assert(!presented[1].evaluation.warnings.some(warning => warning.includes('外卖适配')));
});

test('empty results receive a useful condition-adjustment summary', () => {
  const summary = recommendationSummary([], profile);
  assert(summary.includes('类别、预算或送达时间'));
  assert(!summary.includes('优先选清淡'));
});
