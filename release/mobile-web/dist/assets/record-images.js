const localPhoto = /^assets\/images\/dishes\/[a-z0-9-]+\.(?:jpe?g|png|webp)$/;
const legacyNames = {
  '麻辣烫': 'r33', '自选麻辣烫': 'r33', '馄饨': 'r32', '水饺': 'r31',
  '砂锅米线': 'r08', '三鲜米粉': 'r28', '三鲜粉': 'r28',
  '豆腐小锅菜': 'r29', '小锅豆腐菜饭': 'r29', '鸡肉锅仔': 'c06', '锅仔': 'c06'
};
const normalizeName = value => String(value || '').normalize('NFKC').replace(/\s|[（(].*?[）)]/g, '').trim();
let catalogPromise;
export function loadRecordImages() {
  if (!catalogPromise) catalogPromise = Promise.all(['menu', 'record-images'].map(async name => {
    const response = await fetch(`assets/data/${name}.json?v=4.0.0`);
    if (!response.ok) throw new Error('菜式参考图片暂时无法读取');
    return response.json();
  })).then(parts => parts.flat()).catch(() => { catalogPromise = null; return []; });
  return catalogPromise;
}
export function findRecordImage(record, catalog) {
  if (!record || record.photos?.length) return null;
  const images = catalog.filter(item => item.imageKind === 'photo' && localPhoto.test(item.image || ''));
  const names = [...(record.dishes || []), record.dish_name, record.dish].filter(Boolean)
    .flatMap(value => String(value).split(/[、，,；;\n]/)).map(normalizeName);
  for (const name of names) {
    const exact = images.find(item => normalizeName(item.dish) === name);
    if (exact) return exact;
  }
  for (const name of names) {
    const alias = images.find(item => (item.aliases || []).some(alias => normalizeName(alias) === name));
    if (alias) return alias;
    const legacy = images.find(item => item.id === legacyNames[name]);
    if (legacy) return { ...legacy, imageCaption: '菜式参考图', imageAlt: `${name}菜式参考图（${legacy.dish}）` };
  }
  const identifier = record.item_id || record.itemId;
  return identifier && images.find(item => item.id === identifier) || null;
}
export function storedRecordImage(photo, catalog) {
  return photo?.name ? catalog.find(item => localPhoto.test(item.image || '') && item.image.split('/').pop() === photo.name) || null : null;
}
