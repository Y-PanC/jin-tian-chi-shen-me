import { MealJournal as J } from './journal.js?v=2.0.0';
import { filterMeals, normalizeDateFilters, filterQuery, localDateValue, recordToSummary } from './meal-records.js?v=2.0.0';
import { readPhoto } from './meal-media.js?v=2.0.0';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
let filters = normalizeDateFilters(Object.fromEntries(params));
let visibleCount = 10;
let renderNumber = 0;
let toastTimer;
const photoURLs = new Set();
function message(text) {
  clearTimeout(toastTimer); $('toast').textContent = text; $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3000);
}
function releasePhotos() { photoURLs.forEach(url => URL.revokeObjectURL(url)); photoURLs.clear(); }
function options(select, values, empty, selected) {
  select.replaceChildren(new Option(empty, ''), ...values.map(([value, label]) => new Option(label, value)));
  select.value = selected;
}
function renderFilters(logs) {
  const years = new Set([new Date().getFullYear()]);
  logs.forEach(log => { const date = new Date(log.loggedAt || NaN); if (Number.isFinite(date.getTime())) years.add(date.getFullYear()); });
  if (filters.year && filters.year !== 'unknown') years.add(Number(filters.year));
  const yearOptions = [...years].sort((a, b) => b - a).map(year => [String(year), `${year} 年`]);
  if (logs.some(log => !log.loggedAt)) yearOptions.push(['unknown', '日期未记录']);
  options($('filterYear'), yearOptions, '全部年份', filters.year);
  options($('filterMonth'), Array.from({ length: 12 }, (_, i) => [String(i + 1), `${i + 1} 月`]), '全部月份', filters.month);
  const days = filters.month ? new Date(Number(filters.year) || 2000, Number(filters.month), 0).getDate() : 31;
  options($('filterDay'), Array.from({ length: days }, (_, i) => [String(i + 1), `${i + 1} 日`]), '全部日期', filters.day);
  $('filterMonth').disabled = $('filterDay').disabled = filters.year === 'unknown';
  const query = filterQuery(filters);
  $('filterSummary').hidden = !query;
  $('filterSummary').querySelector('span').textContent = filters.year === 'unknown' ? '日期未记录' : [filters.year ? `${filters.year} 年` : '所有年份', filters.month ? `${filters.month} 月` : '', filters.day ? `${filters.day} 日` : ''].filter(Boolean).join(' · ');
  $('newMealLink').href = `page4_meal.html${query ? '?' + query : ''}`;
}
function dayLabel(log) {
  if (!log.loggedAt) return '日期未记录';
  const date = new Date(log.loggedAt);
  return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日`;
}
function recordHTML(log) {
  const query = new URLSearchParams(filterQuery(filters)); query.set('id', log.id);
  const draft = recordToSummary(log);
  const name = draft.name.trim() || '菜名未记录';
  const time = localDateValue(log.eatenAt || log.loggedAt || null).slice(11);
  const photoId = draft.photos[0]?.id;
  return `<a class="meal-record" href="page4_meal.html?${J.escape(query)}" aria-label="查看餐食：${J.escape(name)}">
    <div class="meal-record-media" aria-hidden="true"><span class="meal-record-photo-placeholder"><svg><use href="#i-camera"/></svg><span>${photoId ? '照片暂不可用' : '暂无照片'}</span></span>${photoId ? `<img class="meal-record-photo" data-photo-id="${J.escape(photoId)}" alt="" loading="lazy" hidden>` : ''}</div>
    <div class="meal-record-body"><div class="meal-record-top"><span>${J.escape(log.period || '餐食记录')} · ${J.escape(time || '时间未记录')}</span></div><h3>${J.escape(name)}</h3>
    <div class="meal-record-tags">${draft.tags.length ? draft.tags.slice(0, 3).map(tag => `<span>${J.escape(tag)}</span>`).join('') + (draft.tags.length > 3 ? `<span>+${draft.tags.length - 3}</span>` : '') : '<span class="meal-record-tag-empty">未添加标签</span>'}</div>
    ${draft.remarks ? `<p class="meal-record-remark">备注：${J.escape(draft.remarks)}</p>` : ''}</div><span class="meal-record-arrow" aria-hidden="true">›</span></a>`;
}
async function render() {
  const currentRender = ++renderNumber;
  releasePhotos();
  const logs = J.read();
  renderFilters(logs);
  const filtered = filterMeals(logs, filters);
  $('recordCount').textContent = filterQuery(filters) ? `筛选 ${filtered.length} 餐` : `${logs.length} 餐`;
  let previousDay;
  $('mealHistory').innerHTML = filtered.length ? filtered.slice(0, visibleCount).map(log => {
    const label = dayLabel(log);
    const heading = label === previousDay ? '' : `<h3 class="meal-day-title">${label}</h3>`;
    previousDay = label;
    return heading + recordHTML(log);
  }).join('') : `<div class="empty">${filterQuery(filters) ? '这个日期范围还没有记录，试试其他日期吧' : '记下第一顿，这里就会有你的饮食回忆'}</div>`;
  $('loadMore').hidden = filtered.length <= visibleCount;
  $('loadMore').textContent = `查看更多记录（还有 ${Math.max(0, filtered.length - visibleCount)} 餐）`;
  for (const image of $('mealHistory').querySelectorAll('[data-photo-id]')) {
    readPhoto(image.dataset.photoId).then(photo => {
      if (!photo?.blob || currentRender !== renderNumber || !image.isConnected) return;
      const url = URL.createObjectURL(photo.blob); photoURLs.add(url); image.src = url; image.hidden = false;
      image.onerror = () => { image.hidden = true; };
    }).catch(() => { /* 餐食文字仍可正常查看。 */ });
  }
}
function updateFilters() {
  filters = normalizeDateFilters({ year: $('filterYear').value, month: $('filterMonth').value, day: $('filterDay').value });
  visibleCount = 10;
  const query = filterQuery(filters);
  history.replaceState(null, '', `page4_log.html${query ? '?' + query : ''}`);
  render();
}
if (params.has('edit') || params.get('from') === 'result') {
  const query = new URLSearchParams();
  if (params.has('edit')) query.set('id', params.get('edit'));
  else query.set('from', 'result');
  location.replace(`page4_meal.html?${query}`);
} else {
  try { J.seedStarter(); } catch (error) { message(error.message); }
  ['filterYear', 'filterMonth', 'filterDay'].forEach(id => $(id).addEventListener('change', updateFilters));
  $('resetFilters').addEventListener('click', () => { filters = normalizeDateFilters({}); visibleCount = 10; history.replaceState(null, '', 'page4_log.html'); render(); });
  $('loadMore').addEventListener('click', () => { visibleCount += 10; render(); });
  render();
  if (params.get('saved') === '1') {
    message('这顿记录已保存');
    const query = filterQuery(filters); history.replaceState(null, '', `page4_log.html${query ? '?' + query : ''}`);
  }
  window.addEventListener('storage', event => { if (event.key === J.KEY || event.key === null) render(); });
  window.addEventListener('pageshow', event => { if (event.persisted) render(); });
  window.addEventListener('pagehide', event => { if (!event.persisted) releasePhotos(); });
}
