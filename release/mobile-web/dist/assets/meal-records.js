import { MealJournal as J } from './journal.js?v=4.0.0';

const pad = value => String(value).padStart(2, '0');
export const MEAL_TAGS = ['清淡', '鲜香', '偏辣', '偏咸', '偏甜', '偏酸', '偏油', '荤素搭配', '蔬菜', '主食', '蛋白质'];
export function localDateValue(value = new Date()) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
export function splitDishes(value) {
  return [...new Set(String(value || '').split(/[、，,；;\n]+/).map(item => item.trim()).filter(Boolean))];
}
export function recordToDraft(record) {
  const names = Array.isArray(record.dishes) && record.dishes.length ? record.dishes : J.analyze(record.text, record.loggedAt).items;
  const name = names.length ? names.join('、') : record.dish_name || record.dish || record.text || '';
  return {
    name, time: localDateValue(record.eatenAt || record.loggedAt), tags: [...(record.tags || [])],
    remarks: typeof record.remarks === 'string' ? record.remarks : record.note || (record.text !== name ? record.text : ''),
    photos: Array.isArray(record.photos) ? record.photos.map(photo => ({ ...photo })) : []
  };
}
export function recordToSummary(record) {
  const draft = recordToDraft(record);
  const note = typeof record.note === 'string' ? record.note.trim() : '';
  return {
    ...draft,
    remarks: typeof record.remarks === 'string' ? record.remarks.trim() :
      note && note !== String(record.text || '').trim() ? note : ''
  };
}
export function makeMealRecord(draft, existing = null, now = new Date()) {
  const dishes = splitDishes(draft.name);
  if (!dishes.length || dishes.length > 8 || dishes.some(name => name.length > 50) || String(draft.name).length > 240) throw new Error('请填写菜品名称，最多 8 道菜，每道不超过 50 字');
  const match = String(draft.time || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) throw new Error('请填写完整的用餐日期和时间');
  const [, year, month, day, hour, minute] = match.map(Number);
  const date = new Date(0);
  date.setFullYear(year, month - 1, day); date.setHours(hour, minute, 0, 0);
  if (year < 1900 || localDateValue(date) !== draft.time) throw new Error('用餐日期或时间不正确，请重新选择');
  if (date.getTime() > now.getTime() + 60000) throw new Error('用餐时间不能晚于现在');
  const tags = [...new Set((Array.isArray(draft.tags) ? draft.tags : []).map(tag => String(tag).trim()).filter(Boolean))];
  if (tags.length > 12 || tags.some(tag => tag.length > 16)) throw new Error('最多选择 12 个标签，每个不超过 16 字');
  const remarks = String(draft.remarks || '').trim();
  if (remarks.length > 1200) throw new Error('备注请控制在 1200 字以内');
  const photos = Array.isArray(draft.photos) ? draft.photos : [];
  if (photos.length > 4 || photos.some(photo => !photo || typeof photo.id !== 'string' || !photo.id)) throw new Error('请保留最多 4 张有效的餐食照片');
  return J.normalize({
    ...(existing || {}), schemaVersion: 3,
    id: existing?.id || globalThis.crypto.randomUUID(),
    dishes, dish: dishes.join('、'), dish_name: dishes.length === 1 ? dishes[0] : null, text: dishes.join('、'),
    ...(existing && !existing.originalText ? { originalText: existing.text } : {}),
    tags, remarks, photos: photos.map(({ id, name, mimeType, size, width, height }) => ({ id, name, mimeType, size, width, height })),
    eatenAt: date.toISOString(), loggedAt: date.toISOString(), period: J.mealPeriod('', date),
    inputMethod: photos.length ? 'photo' : existing?.inputMethod || 'text',
    source: existing?.source === 'fictional-mixed-dining-sample' ? existing.source : photos.length ? 'photo' : 'text',
    createdAt: existing?.createdAt || now.toISOString(), updatedAt: now.toISOString()
  });
}
export function normalizeDateFilters(values = {}) {
  const year = /^(?:19\d{2}|[2-9]\d{3})$/.test(String(values.year)) || values.year === 'unknown' ? String(values.year) : '';
  const month = Number.isInteger(Number(values.month)) && Number(values.month) >= 1 && Number(values.month) <= 12 ? String(Number(values.month)) : '';
  const maxDay = month ? new Date(Number(year) || 2000, Number(month), 0).getDate() : 31;
  const day = Number.isInteger(Number(values.day)) && Number(values.day) >= 1 && Number(values.day) <= maxDay ? String(Number(values.day)) : '';
  return year === 'unknown' ? { year, month: '', day: '' } : { year, month, day };
}
export function filterMeals(records, values = {}) {
  const filters = normalizeDateFilters(values);
  return records.filter(record => {
    const date = new Date(record.eatenAt || record.loggedAt || NaN);
    if (filters.year === 'unknown') return !Number.isFinite(date.getTime());
    if (!filters.year && !filters.month && !filters.day) return true;
    if (!Number.isFinite(date.getTime())) return false;
    return (!filters.year || date.getFullYear() === Number(filters.year)) &&
      (!filters.month || date.getMonth() + 1 === Number(filters.month)) &&
      (!filters.day || date.getDate() === Number(filters.day));
  }).sort((a, b) => (Date.parse(b.eatenAt || b.loggedAt) || 0) - (Date.parse(a.eatenAt || a.loggedAt) || 0));
}
export function filterQuery(values) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(normalizeDateFilters(values))) if (value) params.set(key, value);
  return params.toString();
}
