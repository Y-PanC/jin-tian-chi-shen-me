// Model results update editable fields only when the user has left them unchanged.
export function mergeRecognition(current, snapshot, result) {
  const name = result.dishes.join('、');
  const fillName = snapshot.replaceName && current.name === snapshot.name;
  const fillTags = current.tags.length === snapshot.tags.length && current.tags.every(tag => snapshot.tags.includes(tag));
  return {
    name: fillName ? name : current.name,
    tags: fillTags ? [...new Set([...current.tags, ...result.tags])].slice(0, 12) : [...current.tags],
    filledName: fillName,
    preservedEdits: (!fillName && current.name !== name) || !fillTags,
  };
}
