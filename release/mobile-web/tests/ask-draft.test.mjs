import test from 'node:test';
import assert from 'node:assert/strict';
import { askDraftKey, saveAskDraft, readAskDraft, completeAskRound, clearSelectedMeal } from '../dist/assets/ask-draft.js';
import { askRequest } from '../dist/assets/ask-options.js';

function memoryStorage() {
  const data = new Map();
  return { data, getItem:key=>data.get(key)??null, setItem:(key,value)=>data.set(key,String(value)), removeItem:key=>data.delete(key) };
}
const answers = { categories:['rice','noodles'], budgetRange:'30to40', deliveryTime:'under45' };

test('navigation and reload restore the current step and every answer for the same account', () => {
  const store = memoryStorage();
  saveAskDraft(store, 'pan', answers, 1, 'round-a');
  assert.deepEqual(readAskDraft(store, 'pan', {budget:25}), { roundId:'round-a', step:1, answers });
  assert.equal(readAskDraft(store, 'other-account', {budget:25}), null);
  saveAskDraft(store, 'pan', { ...answers, deliveryTime:'under30' }, 2, 'round-a');
  assert.equal(readAskDraft(store, 'pan').answers.deliveryTime, 'under30');
  assert.equal(readAskDraft(store, 'pan').step, 2);
});

test('successful recommended-meal completion clears its round and prevents bfcache from restoring it', () => {
  const store = memoryStorage();
  saveAskDraft(store, 'pan', answers, 2, 'round-a');
  store.setItem('meal_request', JSON.stringify(askRequest(answers, { roundId:'round-a' })));
  store.setItem('meal_result_pages', '{}');
  const selected = { accountId:'pan', askRoundId:'round-a', selectionId:'selection-a' };
  store.setItem('selected_meal', JSON.stringify(selected));
  assert(completeAskRound(store, 'pan', 'round-a'));
  assert(clearSelectedMeal(store, 'pan', selected));
  for (const key of [askDraftKey('pan'),'meal_request','meal_result_pages','selected_meal']) assert.equal(store.getItem(key), null);
  assert.equal(saveAskDraft(store, 'pan', answers, 2, 'round-a'), null);
  assert.equal(readAskDraft(store, 'pan'), null);
  saveAskDraft(store, 'pan', answers, 0, 'round-b');
  assert.equal(readAskDraft(store, 'pan').roundId, 'round-b');
});

test('saving an older editor does not erase a newer selected recommendation', () => {
  const store = memoryStorage();
  const newer = { accountId:'pan', askRoundId:'round-new', selectionId:'selection-new' };
  store.setItem('selected_meal', JSON.stringify(newer));
  assert.equal(clearSelectedMeal(store, 'pan', { accountId:'pan', selectionId:'selection-old' }), false);
  assert.deepEqual(JSON.parse(store.getItem('selected_meal')), newer);
  assert.equal(clearSelectedMeal(store, 'other-account', newer), false);
  assert(clearSelectedMeal(store, 'pan', newer));
  const legacy = { id:'r01', dish:'黄焖鸡', selectedAt:'2026-10-26T12:00:00Z' };
  store.setItem('selected_meal', JSON.stringify(legacy));
  assert.equal(clearSelectedMeal(store, 'pan', { ...legacy, selectedAt:'2026-10-26T11:00:00Z' }), false);
  assert(clearSelectedMeal(store, 'pan', legacy));
});

test('an old selection or another account cannot clear a newer active round', () => {
  const store = memoryStorage();
  saveAskDraft(store, 'pan', answers, 1, 'round-new');
  store.setItem('meal_request', JSON.stringify(askRequest(answers, { roundId:'round-new' })));
  store.setItem('meal_result_pages', '{"new":true}');
  assert.equal(completeAskRound(store, 'pan', 'round-old'), false);
  assert.equal(readAskDraft(store, 'pan').roundId, 'round-new');
  assert.notEqual(store.getItem('meal_result_pages'), null);
  assert.equal(completeAskRound(store, 'other-account', 'round-new'), false);
  assert.equal(readAskDraft(store, 'pan').roundId, 'round-new');
  assert.notEqual(store.getItem('meal_request'), null);
});

test('corrupt drafts are ignored without changing the source and storage failures stay explicit', () => {
  const store = memoryStorage();
  store.setItem(askDraftKey('pan'), '{broken');
  assert.equal(readAskDraft(store, 'pan'), null);
  assert.equal(store.getItem(askDraftKey('pan')), '{broken');
  assert.throws(() => saveAskDraft({setItem(){throw new Error('quota');},getItem(){return null;}}, 'pan', answers, 1, 'round-a'), /quota/);
});
