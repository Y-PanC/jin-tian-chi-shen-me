import test from 'node:test';
import assert from 'node:assert/strict';
import { nextKnowledgeBatch } from '../dist/assets/knowledge-deck.js';

const items = Array.from({ length: 12 }, (_, id) => ({ id: `card-${id}` }));
const seededRandom = seed => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);

test('knowledge covers every card before repeating and keeps consecutive batches disjoint', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const random = seededRandom(seed);
    let history = null;
    let previous = [];
    for (let cycle = 0; cycle < 10; cycle++) {
      const cycleIds = [];
      for (let batch = 0; batch < 3; batch++) {
        const result = nextKnowledgeBatch(items, history, random);
        const ids = result.cards.map(item => item.id);
        assert.equal(ids.length, 4);
        assert.equal(new Set(ids).size, 4);
        assert(ids.every(id => !previous.includes(id)));
        cycleIds.push(...ids);
        previous = ids;
        history = JSON.parse(JSON.stringify(result.history));
      }
      assert.equal(new Set(cycleIds).size, items.length);
    }
  }
});

test('random batches mix cards rather than retaining fixed groups', () => {
  const selections = new Set();
  for (let seed = 1; seed <= 30; seed++) {
    const result = nextKnowledgeBatch(items, {}, seededRandom(seed));
    selections.add(result.cards.map(item => item.id).sort().join(','));
  }
  assert(selections.size > 10);
});

test('knowledge tolerates stale history and a small or empty card pool', () => {
  for (const history of [null, { seen: 'bad', previous: 1 }, { seen: ['retired-card'], previous: ['retired-card'] }]) {
    const result = nextKnowledgeBatch(items, history, seededRandom(3));
    assert.equal(result.cards.length, 4);
    assert(result.cards.every(item => items.includes(item)));
  }
  const small = nextKnowledgeBatch(items.slice(0, 3), { seen: ['card-0', 'card-1', 'card-2'] });
  assert.equal(new Set(small.cards.map(item => item.id)).size, 3);
  assert.deepEqual(nextKnowledgeBatch([]).cards, []);
});
