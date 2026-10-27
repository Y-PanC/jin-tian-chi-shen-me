import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { scoreRecommendation, scoringWeights, SCORING_VERSION, mealContainsDish } from '../dist/assets/recommendation-score.js';
import { recommendationPages } from '../dist/assets/domain.js';
import { askRequest } from '../dist/assets/ask-options.js';
import { resultSignature, restoreResultView } from '../dist/assets/result-state.js';

const menu = JSON.parse(await readFile(new URL('../dist/assets/data/menu.json', import.meta.url)));
const table = JSON.parse(await readFile(new URL('../dist/assets/data/decision-table.json', import.meta.url)));
const profile = { goal: '营养均衡', tastes: ['清淡'], restrictions: [], spiceLevel: '微辣', budget: 40 };
const request = askRequest({ category: 'any', budgetRange: 'unlimited', deliveryTime: 'unlimited' });
const dish = id => menu.find(item => item.id === id);

test('document cases retain the supplied health, sales, suitability and matching image data', async () => {
  const originals = [[90,320,85],[35,1280,80],[62,480,88],[50,900,82],[88,210,78],[85,260,40]];
  for (const [index, values] of originals.entries()) {
    const item = dish(`c0${index + 1}`);
    assert.deepEqual([item.healthScore,item.monthlySales,item.takeawaySuitability], values);
    assert.equal(item.imageKind, 'photo');
  }
  for (const item of menu) {
    await access(new URL('../dist/' + item.image, import.meta.url));
    assert(item.healthScore >= 0 && item.healthScore <= 100);
  }
});

test('displayed weighted dimensions and adjustments reconcile to the ranking score', () => {
  const logs = [{ dish: '黄焖鸡', tags: ['偏咸'], eatenAt: '2026-10-26T12:00:00+08:00' }];
  for (const goal of ['营养均衡','清淡减脂','生酮饮食','控糖少甜','随心所欲','无所谓']) {
    assert(Math.abs(Object.values(scoringWeights(goal)).reduce((a,b) => a+b, 0) - 1) < .0001);
    for (const item of menu) {
      const result = scoreRecommendation(item, request, { ...profile, goal }, logs);
      assert.equal(result.version, SCORING_VERSION);
      assert.equal(result.healthScore, item.healthScore);
      assert.equal(result.baseScore, Math.round(result.dimensions.reduce((a,b) => a+b.contribution, 0)*10)/10);
      assert.equal(result.adjustmentScore, result.adjustments.reduce((a,b) => a+b.points, 0));
      assert.equal(result.totalScore, Math.round(Math.max(0,Math.min(100,result.baseScore+result.adjustmentScore))*10)/10);
    }
  }
});

test('health references remain distinct from personalized recommendation totals', () => {
  const result = scoreRecommendation(dish('c05'), request, profile, []);
  assert.equal(result.healthScore, 88);
  assert.notEqual(result.totalScore, result.healthScore);
  assert(result.adjustments.some(item => item.key === 'incomplete' && item.points === -15));
  assert(result.warnings.some(message => message.includes('单品')));
  const pot = scoreRecommendation(dish('c06'), request, profile, []);
  assert(pot.adjustments.some(item => item.key === 'takeaway-risk' && item.points === -20));
});

test('history-based reasons only use saved meal facts, and changed taste changes its dimension', () => {
  const clean = dish('c01');
  const empty = scoreRecommendation(clean, request, profile, []);
  assert(!empty.reasons.some(reason => reason.key === 'complement'));
  assert(!empty.adjustments.some(item => item.key === 'recent-repeat'));
  const logs = [{ dish: '羊排萝卜汤', tags: ['偏咸','偏油'], eatenAt: '2026-10-26T12:00:00+08:00' }];
  const withHistory = scoreRecommendation(clean, request, profile, logs);
  assert.equal(withHistory.adjustments.find(item => item.key === 'complement').points, 8);
  assert(withHistory.reasons.some(reason => reason.text.includes('上顿偏咸、偏油')));
  assert(withHistory.adjustments.find(item => item.key === 'complement').detail.includes('羊排萝卜汤'));
  const sweet = scoreRecommendation(clean, request, { ...profile, tastes: ['清淡','偏甜'] }, []);
  assert(sweet.dimensions.find(item => item.key === 'taste').value > empty.dimensions.find(item => item.key === 'taste').value);
});

test('missing monthly sales are explicit and never generate a popularity reason', () => {
  const item = dish('r05');
  const result = scoreRecommendation(item, request, profile, []);
  const sales = result.dimensions.find(item => item.key === 'popularity');
  assert.equal(item.monthlySales, null);
  assert.equal(sales.value, null);
  assert.equal(sales.contribution, 5);
  assert.match(sales.detail, /暂无销量/);
  assert(!result.reasons.some(reason => reason.key === 'popularity'));
});

test('recent duplicate penalties use actual meals and last-meal exclusions also cover multi-dish records', () => {
  const logs = [
    { dish:'黄焖鸡、米饭', dishes:['黄焖鸡','米饭'], tags:[], eatenAt:'2026-10-26T12:00:00+08:00' },
    { dish:'蛤蜊炖蛋', dishes:['蛤蜊炖蛋'], tags:[], eatenAt:'2026-10-25T12:00:00+08:00' }
  ];
  assert(mealContainsDish(logs[0], '黄焖鸡'));
  const recent = scoreRecommendation(dish('c01'), request, profile, logs);
  assert.equal(recent.adjustments.find(item => item.key === 'recent-repeat').points, -10);
  const pages = recommendationPages(menu, table, request, profile, logs);
  assert(!pages.flatMap(page => page.items).some(item => item.dish === '黄焖鸡'));
});

test('new case scores never relax restrictions, selected category, budget or delivery limits', () => {
  const restricted = { ...profile, restrictions:['海鲜','葱'], spiceLevel:'微辣' };
  const local = askRequest({ category:'local', budgetRange:'20to30', deliveryTime:'under45' });
  const items = recommendationPages(menu, table, local, restricted, []).flatMap(page => page.items);
  assert(items.every(item => item.foodCategory === 'local' && item.price >= 20 && item.price <= 30 && item.deliveryMinutes <= 45));
  assert(!items.some(item => ['c01','c02','c03'].includes(item.id)));
  assert(items.every(item => item.evaluation?.version === SCORING_VERSION));
});

test('scored pages and their explanations survive restoration as one consistent snapshot', () => {
  const pages = recommendationPages(menu, table, request, profile, []);
  const signature = resultSignature(request, profile);
  assert(signature.includes(SCORING_VERSION));
  const saved = JSON.parse(JSON.stringify({ schemaVersion:1, ownerId:'test-account', signature, pages, pageIndex:1, scrollTop:240, openDetails:[pages[1].items[0].id] }));
  assert.deepEqual(restoreResultView(saved, 'test-account', signature), saved);
  for (const page of pages) {
    assert(page.items.every(item => item.evaluation.reasons.length > 0));
    assert(page.items.every((item,i) => i === 0 || item.evaluation.totalScore <= page.items[i-1].evaluation.totalScore));
  }
  const scores = pages.flatMap(page => page.items.map(item => item.evaluation.totalScore));
  assert(scores.every((score,index) => index === 0 || score <= scores[index-1]));
});

test('newly saved or edited meals invalidate old history-based reasons without changing the answers', () => {
  const logs = [{ id:'meal-a', revision:1, dish:'黄焖鸡', tags:['偏咸'], eatenAt:'2026-10-26T12:00:00Z' }];
  const initial = resultSignature(request, profile, logs);
  assert.equal(resultSignature(request, profile, JSON.parse(JSON.stringify(logs))), initial);
  assert.notEqual(resultSignature(request, profile, [{...logs[0],revision:2,tags:['清淡']}]), initial);
  assert.notEqual(resultSignature(request, profile, [{id:'meal-b',dish:'米线',tags:[],eatenAt:'2026-10-26T18:00:00Z'},...logs]), initial);
});
