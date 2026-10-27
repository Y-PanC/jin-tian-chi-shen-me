export function nextKnowledgeBatch(items, history = {}, random = Math.random) {
  const ids = new Set(items.map(item => item.id));
  const validIds = values => Array.isArray(values) ? values.filter(id => ids.has(id)) : [];
  const seen = new Set(validIds(history?.seen));
  const previous = new Set(validIds(history?.previous));
  const batch = [];
  const selected = new Set();

  while (batch.length < Math.min(4, items.length)) {
    let candidates = items.filter(item => !seen.has(item.id) && !selected.has(item.id));
    if (!candidates.length) {
      seen.clear();
      candidates = items.filter(item => !selected.has(item.id));
    }
    const lessRecent = candidates.filter(item => !previous.has(item.id));
    if (lessRecent.length) candidates = lessRecent;
    const item = candidates[Math.floor(random() * candidates.length)];
    batch.push(item);
    selected.add(item.id);
    seen.add(item.id);
  }

  return { cards: batch, history: { seen: [...seen], previous: [...selected] } };
}
