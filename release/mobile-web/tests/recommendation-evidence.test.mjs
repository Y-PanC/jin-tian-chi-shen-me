import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { scoreRecommendation } from '../dist/assets/recommendation-score.js';
import { recommendationEvidenceURL, restoreRecommendationEvidence, resultSignature } from '../dist/assets/result-state.js';

const menu = JSON.parse(await readFile(new URL('../dist/assets/data/menu.json', import.meta.url)));
const profile = { goal: '营养均衡', tastes: ['清淡'], restrictions: [] };
const request = { roundId: 'round-a' };
const signature = resultSignature(request, profile, []);
const scored = menu.slice(0, 6).map(item => ({ ...item, reason: '本轮推荐', evaluation: scoreRecommendation(item, request, profile, []) }));
const savedView = () => structuredClone({ schemaVersion: 1, ownerId: 'account-a', signature,
  pages: [{ items: scored.slice(0, 3) }, { items: scored.slice(3) }], pageIndex: 1, scrollTop: 416 });

test('evidence uses the exact saved dish and scores, preserving the recommendation page and position', () => {
  const saved = savedView();
  const original = structuredClone(saved);
  const detail = restoreRecommendationEvidence(saved, 'account-a', signature, `?id=${scored[4].id}&page=2`);
  assert.deepEqual(detail.item, saved.pages[1].items[1]);
  assert.equal(detail.returnTo, 'page3_result.html?page=2');
  assert.equal(detail.pageIndex, 1);
  assert.deepEqual(saved, original);
});

test('stale recommendations, another account, unknown dishes and unrelated pages cannot expose evidence', () => {
  const saved = savedView();
  const search = `?id=${scored[4].id}&page=2`;
  assert.equal(restoreRecommendationEvidence(saved, 'account-b', signature, search), null);
  assert.equal(restoreRecommendationEvidence(saved, 'account-a', resultSignature(request, { ...profile, goal: '控糖少甜' }, []), search), null);
  for (const invalid of [`?id=${scored[4].id}&page=1`, '?id=unknown&page=2', '?id=x&page=999', '?id=x&page=0', '?id=x&page=1.5', '?id=x']) {
    assert.equal(restoreRecommendationEvidence(saved, 'account-a', signature, invalid), null);
  }
});

test('missing or incomplete score data falls back instead of rendering a broken detail page', () => {
  for (const mutate of [item => { delete item.evaluation; }, item => { item.evaluation.dimensions = []; }, item => { item.evaluation.adjustments = null; }, item => { item.evaluation.totalScore = null; }]) {
    const saved = savedView(); mutate(saved.pages[1].items[1]);
    assert.equal(restoreRecommendationEvidence(saved, 'account-a', signature, `?id=${scored[4].id}&page=2`), null);
  }
});

test('evidence routes encode dish identifiers and keep page numbers relative to the app', () => {
  const route = recommendationEvidenceURL('dish&next=https://example.com', 2);
  assert(route.startsWith('page3_evidence.html?'));
  const query = new URLSearchParams(route.split('?')[1]);
  assert.equal(query.get('id'), 'dish&next=https://example.com');
  assert.equal(query.get('page'), '3');
  assert.equal(query.get('next'), null);
});

class Element {
  constructor(tag) { this.tagName = tag; this.children = []; this.handlers = new Map(); this.classList = { add() {} }; this.dataset = {}; this.value = ''; }
  set textContent(value) { this.value = String(value); }
  get textContent() { return this.value + this.children.map(child => child.textContent).join(''); }
  append(...children) { this.children.push(...children); }
  setAttribute(name, value) { this[name] = value; }
  addEventListener(type, handler) { this.handlers.set(type, handler); }
  descendants(tag) { return this.children.flatMap(child => child instanceof Element ? [...(child.tagName === tag ? [child] : []), ...child.descendants(tag)] : []); }
}
globalThis.window = { MealPreferences: {} };
globalThis.document = { createElement: tag => new Element(tag), createTextNode: text => ({ textContent: text }) };
const { renderScoreEvidence } = await import('../dist/assets/score-evidence.js');
const { renderRecommendationCard } = await import('../dist/assets/result-card.js');

test('the second-level page shows all scoring dimensions, adjustments and image attribution directly', () => {
  const item = scored[0];
  const sections = renderScoreEvidence(item);
  const text = sections.map(section => section.textContent).join('');
  assert(text.includes(item.dish));
  assert(text.includes(String(item.evaluation.totalScore)));
  for (const part of [...item.evaluation.dimensions, ...item.evaluation.adjustments]) {
    assert(text.includes(part.label)); assert(text.includes(part.detail));
  }
  const table = sections.flatMap(section => section.descendants('table'))[0];
  assert.equal(table.descendants('tbody')[0].descendants('tr').length, 5);
  assert.equal(sections.flatMap(section => section.descendants('details')).length, 0);
  assert(sections.flatMap(section => section.descendants('a')).some(link => link.textContent === '图片来源' && link.rel === 'noopener noreferrer'));
});

test('card evidence navigation flushes the current view and prevents leaving if saving that view fails', () => {
  let flushed = false;
  const card = renderRecommendationCard(scored[4], 5, () => {}, () => { flushed = true; });
  assert.equal(card.descendants('details').length, 0);
  assert.equal(card.descendants('table').length, 0);
  const link = card.descendants('a')[0];
  assert.equal(link.href, recommendationEvidenceURL(scored[4].id, 1));
  link.handlers.get('click')({ preventDefault() { assert.fail('valid navigation must proceed'); } });
  assert(flushed);
  let prevented = false;
  const failed = renderRecommendationCard(scored[4], 5, () => {}, () => { throw new Error('storage full'); });
  failed.descendants('a')[0].handlers.get('click')({ preventDefault() { prevented = true; } });
  assert(prevented);
});
