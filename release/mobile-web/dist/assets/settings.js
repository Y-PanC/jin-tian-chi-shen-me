import { MealJournal as J } from './journal.js?v=4.0.0';
import { api, Cloud } from './cloud.js?v=4.0.0';
import { readLocalPhoto } from './meal-media.js?v=4.0.0';
import { recordToDraft, splitDishes } from './meal-records.js?v=4.0.0';

const current = J.getSettings();
const nickname = document.getElementById('nicknameInput');
const userId = document.getElementById('userIdInput');
const photo = document.getElementById('photoPermissionToggle');
const voice = document.getElementById('voicePermissionToggle');
const toast = document.getElementById('toast');
nickname.value = current.nickname || '';
userId.value = current.userId || '';
photo.checked = current.photoInputEnabled !== false;
voice.checked = current.voiceInputEnabled !== false;

function message(text) {
  toast.textContent = text;
  toast.hidden = false;
  setTimeout(() => { toast.hidden = true; }, 2400);
}
document.getElementById('accountName').textContent = `当前账号：${Cloud.state.user.username}`;
const saveButton = document.getElementById('saveSettings');
saveButton.addEventListener('click', async () => {
  saveButton.disabled = true;
  try {
    await J.saveSettings({
      nickname: nickname.value.trim(), userId: userId.value.trim(),
      photoInputEnabled: photo.checked, voiceInputEnabled: voice.checked
    });
    message('设置已保存');
  } catch (error) { message(error.message); }
  finally { saveButton.disabled = false; }
});
document.getElementById('logoutButton').addEventListener('click', async () => {
  try { await Cloud.logout(); } catch (error) { message(error.message); }
});

function isLegacySample(record) {
  return record.source === 'fictional-mixed-dining-sample' || String(record.id || '').startsWith('diary-sample-');
}
function localRecords(includeSamples = false) {
  const raw = JSON.parse(localStorage.getItem('meal_logs') || '[]');
  if (!Array.isArray(raw)) throw new Error('本机记录格式不正确，原数据已保留');
  return raw.filter(record => record && typeof record === 'object' && !Array.isArray(record) && (includeSamples || !isLegacySample(record)));
}
const importButton = document.getElementById('importLocal');
const importStatus = document.getElementById('importStatus');
const includeSamples = document.getElementById('includeLegacySamples');
function pendingRecords(include = includeSamples.checked) {
  return localRecords(include).filter(record => !Cloud.state.importKeys.includes(String(record.id)));
}
function renderImportCount() {
  try {
    const sampleCount = pendingRecords(true).filter(isLegacySample).length;
    document.getElementById('legacySampleOption').hidden = !sampleCount;
    document.getElementById('legacySampleLabel').textContent = `同时导入旧版示例记录（${sampleCount} 条）`;
    const count = pendingRecords().length;
    document.getElementById('localRecordCount').textContent = count ? `当前浏览器有 ${count} 条尚未导入的记录` : '当前浏览器没有待导入的记录';
    importButton.disabled = !count;
  } catch (error) { importStatus.textContent = error.message; importButton.disabled = true; }
}
includeSamples.addEventListener('change', renderImportCount);
renderImportCount();
importButton.addEventListener('click', async () => {
  if (importButton.disabled) return;
  const records = pendingRecords();
  const expectedUserId = Cloud.state.user.id;
  const importSamples = includeSamples.checked;
  if (!confirm(`将 ${records.length} 条本机记录及其照片导入账号「${Cloud.state.user.username}」？${importSamples ? '包含旧版示例记录，' : ''}原浏览器数据会保留`)) return;
  importButton.disabled = true; includeSamples.disabled = true;
  try {
    const photoMap = new Map();
    const prepared = [];
    for (const [index, raw] of records.entries()) {
      importStatus.textContent = `正在准备 ${index + 1} / ${records.length}`;
      const normalized = J.normalize(raw), draft = recordToDraft(normalized);
      const photos = [];
      for (const photo of draft.photos) {
        if (!photoMap.has(photo.id)) {
          const local = await readLocalPhoto(photo.id);
          if (!local?.blob) throw new Error('部分本机照片暂时无法读取，原记录已保留，请稍后重试');
          const uploaded = await Cloud.putPhotos([{ ...photo, ...local, id: crypto.randomUUID() }]);
          photoMap.set(photo.id, uploaded[0]);
        }
        photos.push(photoMap.get(photo.id));
      }
      prepared.push({ ...normalized, dishes: splitDishes(draft.name), remarks: draft.remarks, originalText: raw.originalText || raw.text, photos });
    }
    let imported = 0;
    for (let offset = 0; offset < prepared.length; offset += 200) {
      const result = await api('import', { method: 'POST', body: { records: prepared.slice(offset, offset + 200), includeSamples: importSamples, expectedUserId } });
      imported += result.imported;
    }
    await Cloud.load();
    importStatus.textContent = `已导入 ${imported} 条记录，原浏览器数据已保留`;
    renderImportCount();
  } catch (error) { importStatus.textContent = error.message; importButton.disabled = false; }
  finally { includeSamples.disabled = false; }
});
