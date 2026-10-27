import { MealJournal as J } from './journal.js?v=4.0.0';
import { MEAL_TAGS, localDateValue, recordToDraft, makeMealRecord, filterQuery, filterMeals } from './meal-records.js?v=4.0.0';
import { preparePhoto, readPhoto, putPhotos, removePhotos } from './meal-media.js?v=4.0.0';
import { api, Cloud } from './cloud.js?v=4.0.0';
import { mergeRecognition } from './recognition-draft.js?v=4.0.0';
import { recommendationReturnURL } from './result-state.js?v=4.0.0';
import { completeAskRound, clearSelectedMeal } from './ask-draft.js?v=4.0.0';
import { recommendationToDraft, isRecommendationPhoto, storeDraftPhotos } from './recommendation-meal.js?v=4.0.0';
import { loadRecordImages, findRecordImage, storedRecordImage } from './record-images.js?v=4.0.0';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const id = params.get('id');
const original = id ? J.read().find(log => log.id === id) : null;
const originalFilters = Object.fromEntries(params);
const listQuery = filterQuery(originalFilters);
const listURL = `page4_log.html${listQuery ? '?' + listQuery : ''}`;
let selected = null;
const fromResult = !id && params.get('from') === 'result';
if (fromResult) {
  try {
    const value = JSON.parse(sessionStorage.getItem('selected_meal'));
    if (value && typeof value.dish === 'string' && Array.isArray(value.tags) && (!value.accountId || value.accountId === Cloud.state.user.id)) selected = value;
  } catch { /* 手动填写仍可使用。 */ }
}
const returnURL = fromResult ? recommendationReturnURL(selected) : listURL;
let draft = original ? recordToDraft(original) : recommendationToDraft(selected, localDateValue());
const recordCatalog = original ? await loadRecordImages() : [];
const recordReference = original ? findRecordImage({ ...original, dishes: draft.name.split('、') }, recordCatalog) || storedRecordImage(draft.photos[0], recordCatalog) : null;
if (recordReference && !draft.photos.length) draft.photos = recommendationToDraft(recordReference, draft.time).photos;
else if (recordReference) draft.photos[0] = { ...draft.photos[0], source: 'recommendation', catalogImage: recordReference.image, caption: '菜式参考图', alt: recordReference.imageAlt, uploaded: true };
let draftRecordId = id || crypto.randomUUID();
const draftScope = selected ? `selection:${selected.selectionId || selected.selectedAt || selected.id}` : 'new';
const draftKey = `meal_draft:${Cloud.state.user.id}:${id || draftScope}`;
let restored = false, pendingRecognition = null, autoFilledName = '';
try {
  const saved = JSON.parse(sessionStorage.getItem(draftKey));
  const validDraft = saved?.draft && ['name', 'time', 'remarks'].every(key => typeof saved.draft[key] === 'string') &&
    Array.isArray(saved.draft.tags) && saved.draft.tags.every(tag => typeof tag === 'string') &&
    Array.isArray(saved.draft.photos) && saved.draft.photos.length <= 4 && saved.draft.photos.every(photo => photo && typeof photo.id === 'string');
  if (validDraft && saved.baseRevision === (original?.revision || null)) {
    draft = saved.draft;
    autoFilledName = typeof saved.autoFilledName === 'string' ? saved.autoFilledName : '';
    if (/^[0-9a-f-]{36}$/i.test(saved.recordId || '')) draftRecordId = saved.recordId;
    pendingRecognition = saved.recognition?.id && Array.isArray(saved.recognition.photoIds) ? saved.recognition : null; restored = true;
  }
} catch { /* 已保存记录仍可读取。 */ }
const settings = J.getSettings();
let photos = [...draft.photos];
let selectedTags = [...draft.tags];
let customTags = selectedTags.filter(tag => !MEAL_TAGS.includes(tag));
let dirty = restored;
let saving = false;
let processingPhotos = false;
const pendingPhotos = new Map();
const photoURLs = new Map();
const uploadedPhotos = new Set(photos.filter(photo => !isRecommendationPhoto(photo) || photo.uploaded).map(photo => photo.id));
let recognitionRun = 0, recognizing = false, recognitionFailed = false;
$('backToMeals').href = returnURL;
if (fromResult) $('backToMeals').setAttribute('aria-label', '返回推荐结果');
$('mealName').value = draft.name; $('mealTime').value = draft.time; $('mealRemarks').value = draft.remarks;
$('mealTime').max = localDateValue();
if (original) {
  document.title = '餐食详情｜今天吃什么'; $('detailTitle').textContent = '餐食详情';
  $('detailCaption').hidden = true; $('detailIntro').textContent = '这一顿的细节，都在这里';
  $('saveMealButton').textContent = '保存修改';
}
if (id && !original) {
  $('missingRecord').hidden = false; $('mealForm').hidden = true; $('saveMealButton').hidden = true;
}
if (settings.photoInputEnabled === false) {
  $('addPhotos').hidden = true;
  $('photoHint').textContent = '照片选择已关闭，可在“我的 → 基本设置”中开启';
}
if (settings.photoInputEnabled !== false && !Cloud.state.capabilities.photoRecognition) {
  $('photoHint').textContent = '最多 4 张，请手动填写菜名和标签';
}
$('voiceInput').hidden = settings.voiceInputEnabled === false;
$('voiceInput').addEventListener('click', () => {
  $('mealRemarks').focus();
  $('voiceStatus').textContent = '可使用设备键盘上的语音输入填写备注';
});
function error(message) {
  $('formError').textContent = message; $('formError').hidden = false;
  $('formError').scrollIntoView({ block: 'nearest' });
}
function clearError() { $('formError').hidden = true; }
function persistDraft() {
  try {
    sessionStorage.setItem(draftKey, JSON.stringify({ baseRevision: original?.revision || null, recordId: draftRecordId,
      draft: { name: $('mealName').value, time: $('mealTime').value, remarks: $('mealRemarks').value, tags: selectedTags, photos: photos.filter(photo => uploadedPhotos.has(photo.id) || isRecommendationPhoto(photo)) },
      recognition: pendingRecognition, autoFilledName }));
  } catch { /* 保存接口仍可使用。 */ }
}
function markDirty() { dirty = true; clearError(); persistDraft(); }
function clearDraft() { sessionStorage.removeItem(draftKey); }
function renderTags() {
  $('mealTags').replaceChildren(...[...new Set([...MEAL_TAGS, ...customTags])].map(tag => {
    const label = document.createElement('label'); label.className = 'meal-tag';
    const input = document.createElement('input'); input.type = 'checkbox'; input.name = 'tags'; input.value = tag; input.checked = selectedTags.includes(tag);
    const text = document.createElement('span'); text.textContent = tag;
    input.addEventListener('change', () => {
      if (input.checked && selectedTags.length >= 12) { input.checked = false; error('最多选择 12 个标签'); return; }
      selectedTags = input.checked ? [...selectedTags, tag] : selectedTags.filter(value => value !== tag); markDirty();
    });
    label.append(input, text); return label;
  }));
}
function addTag() {
  const tag = $('customTag').value.trim();
  if (!tag) { $('customTag').focus(); return; }
  if (tag.length > 16) { error('每个标签请控制在 16 字以内'); return; }
  if (!selectedTags.includes(tag) && selectedTags.length >= 12) { error('最多选择 12 个标签'); return; }
  if (!MEAL_TAGS.includes(tag) && !customTags.includes(tag)) customTags.push(tag);
  if (!selectedTags.includes(tag)) selectedTags.push(tag);
  $('customTag').value = ''; renderTags(); markDirty();
}
function renderPhotos() {
  const credit = $('referencePhotoCredit');
  const showCredit = recordReference && photos.some(photo => photo.catalogImage === recordReference.image);
  credit.hidden = !showCredit;
  if (showCredit && recordReference.imageSourceUrl) {
    const source = document.createElement('a');
    source.href = recordReference.imageSourceUrl; source.target = '_blank'; source.rel = 'noopener noreferrer';
    source.textContent = `图片来源：${recordReference.imageAuthor || 'Wikimedia Commons'} · ${recordReference.imageLicense || ''}`;
    credit.replaceChildren(source);
  } else if (showCredit) credit.textContent = recordReference.imageSourceLabel || '菜式参考图';
  $('photoCount').textContent = `${photos.length} / 4`;
  $('addPhotos').disabled = photos.length >= 4 || processingPhotos;
  $('photoGrid').replaceChildren(...photos.map((photo, index) => {
    const tile = document.createElement('figure'); tile.className = 'meal-photo';
    if (photoURLs.has(photo.id)) {
      const image = document.createElement('img'); image.src = photoURLs.get(photo.id); image.alt = photo.alt || `餐食照片 ${index + 1}`; tile.append(image);
    } else {
      const note = document.createElement('span'); note.className = 'photo-unavailable'; note.textContent = '照片暂无法读取'; tile.append(note);
    }
    if (photo.caption) {
      const caption = document.createElement('figcaption'); caption.className = 'meal-photo-caption'; caption.textContent = photo.caption; tile.append(caption);
    }
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'photo-remove'; remove.textContent = '移除'; remove.setAttribute('aria-label', `移除照片 ${index + 1}`);
    remove.addEventListener('click', () => {
      recognitionRun++; recognizing = false; recognitionFailed = false; pendingRecognition = null;
      $('photoStatus').textContent = '';
      photos = photos.filter(value => value.id !== photo.id); pendingPhotos.delete(photo.id);
      if (photoURLs.has(photo.id)) { URL.revokeObjectURL(photoURLs.get(photo.id)); photoURLs.delete(photo.id); }
      renderPhotos(); markDirty();
      if (uploadedPhotos.has(photo.id)) removePhotos([photo.id]).catch(() => {});
    });
    tile.append(remove); return tile;
  }));
  $('photoStatus').classList.toggle('is-recognizing', recognizing);
  $('retryRecognition').hidden = !recognitionFailed || !photos.some(photo => !isRecommendationPhoto(photo)) || !Cloud.state.capabilities.photoRecognition;
  $('retryRecognition').disabled = recognizing || processingPhotos;
}
async function loadPhotos() {
  if (!photos.length) return;
  $('photoStatus').textContent = '正在读取照片…';
  let missing = false;
  await Promise.all(photos.map(async photo => {
    if (isRecommendationPhoto(photo) && !uploadedPhotos.has(photo.id)) {
      photoURLs.set(photo.id, photo.catalogImage); return;
    }
    try {
      const saved = await readPhoto(photo.id);
      if (saved?.blob && photos.some(value => value.id === photo.id)) photoURLs.set(photo.id, URL.createObjectURL(saved.blob));
      else missing = true;
    } catch { missing = true; }
  }));
  renderPhotos(); $('photoStatus').textContent = missing ? '部分照片暂时无法读取，你可以保留或重新添加' : '';
}
$('addPhotos').addEventListener('click', () => $('photoInput').click());
$('photoInput').addEventListener('change', async () => {
  const files = Array.from($('photoInput').files); $('photoInput').value = '';
  if (!files.length) return;
  if (files.length + photos.length > 4) { error('每顿最多添加 4 张照片，请重新选择'); return; }
  recognitionRun++; recognizing = false; recognitionFailed = false; pendingRecognition = null;
  const previousPhotoCount = photos.length;
  processingPhotos = true; $('saveMealButton').disabled = true; $('addPhotos').disabled = true; $('photoStatus').textContent = '正在添加照片…';
  renderPhotos();
  try {
    for (const file of files) {
      const photo = await preparePhoto(file);
      const metadata = (await putPhotos([photo]))[0]; uploadedPhotos.add(photo.id);
      pendingPhotos.set(photo.id, photo); photos.push(metadata || photo); photoURLs.set(photo.id, URL.createObjectURL(photo.blob));
      markDirty();
    }
    $('photoStatus').textContent = Cloud.state.capabilities.photoRecognition ? '照片已添加' : '照片识别暂未启用，请手动确认菜名和标签';
  } catch (problem) { $('photoStatus').textContent = problem.message; }
  finally {
    processingPhotos = false; $('saveMealButton').disabled = false; renderPhotos();
    if (photos.length > previousPhotoCount && Cloud.state.capabilities.photoRecognition) recognizePhotos();
  }
});
$('addTag').addEventListener('click', addTag);
$('customTag').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); addTag(); } });
$('mealForm').addEventListener('input', markDirty);
$('backToMeals').addEventListener('click', event => { if (dirty) { event.preventDefault(); $('discardDialog').showModal(); } });
$('keepEditing').addEventListener('click', () => $('discardDialog').close());
$('discardChanges').addEventListener('click', async () => {
  dirty = false; clearDraft(); recognitionRun++;
  await removePhotos(photos.filter(photo => uploadedPhotos.has(photo.id) && !(original?.photos || []).some(old => old.id === photo.id)).map(photo => photo.id)).catch(() => {});
  location.href = returnURL;
});
$('mealForm').addEventListener('submit', async event => {
  event.preventDefault(); if (saving || processingPhotos || (id && !original)) return;
  clearError();
  if ($('customTag').value.trim()) { addTag(); if ($('customTag').value.trim()) return; }
  let record;
  try {
    record = makeMealRecord({ name: $('mealName').value, time: $('mealTime').value, tags: selectedTags, photos, remarks: $('mealRemarks').value }, original);
    record.id = draftRecordId;
  } catch (problem) { error(problem.message); return; }
  if (selected && !original) {
    for (const key of ['shop', 'price', 'category']) if (selected[key] !== undefined) record[key] = selected[key];
    record.item_id = selected.id;
  }
  recognitionRun++; recognizing = false; pendingRecognition = null; persistDraft();
  saving = true; $('mealForm').inert = true; $('saveMealButton').disabled = true; $('saveMealButton').textContent = '正在保存…';
  let persisted = false, additions = [];
  try {
    const stored = await storeDraftPhotos(photos, uploadedPhotos, pendingPhotos);
    photos = stored.photos; additions = stored.additions; persisted = true;
    record.photos = photos.map(({ id, name, mimeType, size, width, height }) => ({ id, name, mimeType, size, width, height }));
    persistDraft();
    record = await Cloud.saveMeal(record, original);
  } catch (problem) {
    if (persisted && !Cloud.active) await removePhotos(additions.map(photo => photo.id)).catch(() => {});
    error(problem.message); saving = false; $('mealForm').inert = false; $('saveMealButton').disabled = false; $('saveMealButton').textContent = original ? '保存修改' : '保存这一顿'; return;
  }
  dirty = false; clearDraft(); recognitionRun++;
  if (fromResult && selected) completeAskRound(sessionStorage, Cloud.state.user.id, selected.askRoundId);
  const removed = (original?.photos || []).filter(photo => !photos.some(value => value.id === photo.id)).map(photo => photo.id);
  await removePhotos(removed).catch(() => {});
  if (selected) clearSelectedMeal(sessionStorage, Cloud.state.user.id, selected);
  let query = filterQuery(originalFilters);
  if (!original || !filterMeals([record], originalFilters).length) {
    const date = new Date(record.loggedAt);
    query = filterQuery({ year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() });
  }
  location.replace(`page4_log.html?${query ? query + '&' : ''}saved=1`);
});
async function recognizePhotos(resume = null) {
  const photoIds = photos.filter(photo => !isRecommendationPhoto(photo) && uploadedPhotos.has(photo.id)).map(photo => photo.id);
  if (!photoIds.length || processingPhotos || saving || !Cloud.state.capabilities.photoRecognition) return;
  const run = ++recognitionRun;
  const savedSnapshot = resume?.snapshot;
  const snapshot = savedSnapshot && typeof savedSnapshot.name === 'string' && Array.isArray(savedSnapshot.tags) &&
    savedSnapshot.tags.every(tag => typeof tag === 'string') && typeof savedSnapshot.replaceName === 'boolean'
    ? savedSnapshot : { name: $('mealName').value, tags: [...selectedTags], replaceName: !$('mealName').value.trim() || $('mealName').value === autoFilledName };
  recognizing = true; recognitionFailed = false;
  $('photoStatus').textContent = '正在识别照片，你可以继续填写其他内容'; renderPhotos();
  try {
    const job = resume || await api('recognitions', { method: 'POST', body: { photoIds } });
    if (run !== recognitionRun) return;
    pendingRecognition = { id: job.id, photoIds, snapshot }; persistDraft();
    const deadline = Date.now() + 180000;
    while (run === recognitionRun) {
      const result = await api(`recognitions/${encodeURIComponent(job.id)}`);
      if (run !== recognitionRun) return;
      if (result.status === 'failed') {
        pendingRecognition = null; persistDraft();
        throw new Error(result.error || '识别未完成，请重试或手动填写');
      }
      if (result.status === 'succeeded') {
        pendingRecognition = null;
        if (!result.result?.dishes?.length) { persistDraft(); $('photoStatus').textContent = '没有识别到清晰的菜品，请手动填写或换张照片'; break; }
        const merged = mergeRecognition({ name: $('mealName').value, tags: selectedTags }, snapshot, result.result);
        $('mealName').value = merged.name; selectedTags = merged.tags;
        if (merged.filledName) autoFilledName = merged.name;
        renderTags(); markDirty();
        $('photoStatus').textContent = merged.preservedEdits ? '识别完成，已保留你填写的内容' : '已自动填入菜名和标签，可继续修改';
        break;
      }
      if (Date.now() > deadline) throw new Error('识别仍在进行，可稍后重试或手动填写');
      await new Promise(resolve => setTimeout(resolve, 900));
    }
  } catch (problem) {
    if (run === recognitionRun) {
      recognitionFailed = true;
      $('photoStatus').textContent = problem.message;
      if (!pendingRecognition) persistDraft();
    }
  }
  finally { if (run === recognitionRun) { recognizing = false; renderPhotos(); } }
}
$('retryRecognition').addEventListener('click', () => recognizePhotos(pendingRecognition));
for (const photo of photos.filter(isRecommendationPhoto)) photoURLs.set(photo.id, photo.catalogImage);
renderTags(); renderPhotos();
if ((selected || recordReference) && !restored) persistDraft();
loadPhotos().then(() => {
  if (restored) $('photoStatus').textContent = '已恢复尚未保存的内容';
  if (pendingRecognition && pendingRecognition.photoIds.join() === photos.filter(photo => !isRecommendationPhoto(photo)).map(photo => photo.id).join()) recognizePhotos(pendingRecognition);
});
window.addEventListener('beforeunload', event => { if (dirty && !saving) { event.preventDefault(); event.returnValue = ''; } });
window.addEventListener('pagehide', event => { if (!event.persisted) photoURLs.forEach(url => URL.revokeObjectURL(url)); });
