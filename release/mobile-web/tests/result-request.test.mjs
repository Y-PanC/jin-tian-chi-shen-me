import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareResultRequest } from '../dist/assets/result-request.js';
import { askRequest } from '../dist/assets/ask-options.js';

const profile = { budget: 25 };
const old = { schemaVersion:3, category:'local', budgetRange:'20to30', deliveryTime:'under45', createdAt:'2026-10-26T12:00:00Z' };

test('legacy single-choice results receive an account-bound round that can complete normally', () => {
  const result = prepareResultRequest(old, profile, 'owner', null, () => 'new-round');
  assert.deepEqual(result.categories, ['local']);
  assert.equal(result.accountId, 'owner'); assert.equal(result.roundId, 'new-round');
  assert.deepEqual(prepareResultRequest(result, profile, 'owner', null, () => 'another-round'), result);
});
test('an existing matching draft supplies its round but a newer different selection stays independent', () => {
  const draft = { roundId:'active-round', answers:{ categories:['local'], budgetRange:'20to30', deliveryTime:'under45' } };
  assert.equal(prepareResultRequest(old, profile, 'owner', draft, () => 'new-round').roundId, 'active-round');
  draft.answers.categories = ['noodles'];
  assert.equal(prepareResultRequest(old, profile, 'owner', draft, () => 'new-round').roundId, 'new-round');
});
test('foreign-account and invalid requests never populate the current account result', () => {
  assert.equal(prepareResultRequest({...old,accountId:'someone-else'},profile,'owner'),null);
  assert.equal(prepareResultRequest({...old,budgetRange:'invalid'},profile,'owner'),null);
  const multi = askRequest({categories:['light','local'],budgetRange:'20to30',deliveryTime:'unlimited'}, {accountId:'owner',roundId:'multi-round'});
  assert.deepEqual(prepareResultRequest(multi,profile,'owner').categories,['light','local']);
});
