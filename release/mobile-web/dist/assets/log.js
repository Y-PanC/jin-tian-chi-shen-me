import { MealJournal as J } from './journal.js';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const settings = J.getSettings();
let photoURL = '';
let inputMethod = 'text';
let expanded = false;
let editing = null;
let selected = null;
let messageTimer;

function message(value) {
  clearTimeout(messageTimer);
  $('toast').textContent = value;
  $('toast').hidden = false;
  messageTimer = setTimeout(() => { $('toast').hidden = true; }, 2800);
}

try { J.seedStarter(); } catch (error) { message(error.message); }
$('photoButton').hidden = settings.photoInputEnabled === false;
$('voiceButton').hidden = settings.voiceInputEnabled === false;

function dayKey(log) {
  if (!log.loggedAt) return 'unknown';
  const date = new Date(log.loggedAt);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dayLabel(key) {
  if (key === 'unknown') return { short: '未知', full: '日期未知' };
  const [year, month, day] = key.split('-').map(Number);
  const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][new Date(year, month - 1, day).getDay()];
  return { short: `${month}/${day}`, full: `${month}月${day}日 ${week}` };
}

function renderRecord(log) {
  const parsed = J.analyze(log.text, log.loggedAt);
  const date = log.loggedAt ? J.monthDay(log.loggedAt) : '日期未知';
  const foods = parsed.items.length ? parsed.items : [log.dish];
  const method = { voice: '语音', photo: '照片', text: '文字' }[log.inputMethod];
  return `<article class="record-row"><div class="record-row-head"><span class="record-time">${J.escape(date)} ${J.escape(log.period || '')}</span><div class="record-tools"><button type="button" class="record-edit" data-edit="${J.escape(log.id)}" aria-label="修改${J.escape(log.dish)}的记录">修改</button><span class="record-method">${method}</span></div></div><div class="record-text">${J.escape(log.text)}</div><div class="record-items">${foods.map(item => `<span class="record-item">${J.escape(item)}</span>`).join('')}</div></article>`;
}

function render() {
  const logs = J.read().sort((a, b) => (Date.parse(b.loggedAt) || 0) - (Date.parse(a.loggedAt) || 0));
  $('recordCount').textContent = logs.length ? `${logs.length} 餐` : '';
  const samples = logs.filter(log => log.source === 'fictional-mixed-dining-sample').length;
  $('sampleNotice').hidden = !samples;
  $('sampleNotice').textContent = `含 ${samples} 餐虚构示例，仅供原型演示。`;
  const host = $('mealHistory');
  if (!logs.length) {
    host.className = 'record-list';
    host.innerHTML = '<div class="empty">这里会显示你记录过的饮食。</div>';
  } else if (!expanded) {
    host.className = 'record-list';
    host.innerHTML = logs.slice(0, 3).map(renderRecord).join('');
  } else {
    const groups = new Map();
    for (const log of logs) {
      const key = dayKey(log);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(log);
    }
    const entries = [...groups.entries()];
    host.className = 'history-expanded';
    host.innerHTML = `<nav class="day-timeline" aria-label="按日期浏览饮食">${entries.map(([key], index) => `<button class="day-jump${index ? '' : ' active'}" type="button" data-day-target="day-${key}"><span class="day-dot"></span><span>${J.escape(dayLabel(key).short)}</span></button>`).join('')}</nav><div class="history-groups">${entries.map(([key, items]) => `<section class="history-day" id="day-${key}"><h3 class="history-day-title">${J.escape(dayLabel(key).full)}</h3>${items.map(renderRecord).join('')}</section>`).join('')}</div>`;
    host.querySelectorAll('[data-day-target]').forEach(button => button.addEventListener('click', () => {
      host.querySelectorAll('.day-jump').forEach(item => item.classList.toggle('active', item === button));
      document.getElementById(button.dataset.dayTarget)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
  }
  host.querySelectorAll('[data-edit]').forEach(button => button.addEventListener('click', () => {
    beginEdit(J.read().find(log => log.id === button.dataset.edit));
  }));
  $('historyToggle').hidden = logs.length <= 3;
  $('historyToggle').setAttribute('aria-expanded', String(expanded));
  $('historyToggle').querySelector('span').textContent = expanded ? '收起' : '展开全部';
  $('historyToggle').querySelector('svg').classList.toggle('up', expanded);
}

function beginEdit(log) {
  if (!log) { message('这条记录已不存在。'); return; }
  resetPhoto();
  editing = log;
  selected = null;
  inputMethod = log.inputMethod;
  $('mealText').value = log.text;
  $('saveMealButton').textContent = '保存修改';
  $('inputStatus').textContent = '正在修改这顿记录，保存后保留原用餐时间。';
  $('pageScroll').scrollTop = 0;
  $('mealText').focus();
}

function resetPhoto() {
  if (photoURL) URL.revokeObjectURL(photoURL);
  photoURL = '';
  $('photoInput').value = '';
  $('photoPreview').hidden = true;
}

$('historyToggle').addEventListener('click', () => { expanded = !expanded; render(); });
$('photoButton').addEventListener('click', () => $('photoInput').click());
$('photoInput').addEventListener('change', () => {
  const file = $('photoInput').files[0];
  if (!file) return;
  if (!file.type.startsWith('image/') || file.size > 12 * 1024 * 1024) {
    $('inputStatus').textContent = file.size > 12 * 1024 * 1024 ? '图片请小于 12 MB。' : '请选择图片文件。';
    $('photoInput').value = '';
    return;
  }
  resetPhoto();
  photoURL = URL.createObjectURL(file);
  inputMethod = 'photo';
  $('photoThumb').src = photoURL;
  $('photoName').textContent = file.name;
  $('photoPreview').hidden = false;
  $('inputStatus').textContent = '照片已添加，请在文字框中写下餐食内容。';
  $('mealText').focus();
});
$('photoThumb').addEventListener('error', () => {
  resetPhoto();
  inputMethod = 'text';
  $('inputStatus').textContent = '这张图片无法预览，请换一张或直接用文字记录。';
});
$('removePhoto').addEventListener('click', () => { resetPhoto(); inputMethod = 'text'; $('inputStatus').textContent = ''; });
$('voiceButton').addEventListener('click', () => {
  inputMethod = 'voice';
  $('mealText').focus();
  $('inputStatus').textContent = '可使用设备键盘上的语音输入，将语音转为文字。';
});

$('mealForm').addEventListener('submit', event => {
  event.preventDefault();
  const text = $('mealText').value.trim();
  if (!text) { $('mealText').focus(); return; }
  try {
    const logs = J.read();
    if (editing && !logs.some(log => log.id === editing.id)) throw new Error('这条记录已在其他页面删除，请刷新查看。');
    const loggedAt = editing ? editing.loggedAt : J.parseMealDate(text).toISOString();
    const parsed = J.analyze(text, loggedAt);
    const sameDish = editing && editing.text === text;
    const record = J.normalize({
      ...(selected || {}), ...(editing || {}),
      id: editing?.id || (crypto.randomUUID ? crypto.randomUUID() : `meal-${Date.now()}-${Math.random().toString(36).slice(2)}`),
      text, dish: sameDish ? editing.dish : parsed.items.join('、') || text,
      dish_name: sameDish ? editing.dish_name : null,
      tags: sameDish ? editing.tags : [...new Set([...(selected?.tags || []), ...parsed.tastes])],
      category: selected?.category || editing?.category || null,
      loggedAt, eatenAt: loggedAt,
      period: sameDish ? editing.period : parsed.period,
      inputMethod: photoURL ? 'photo' : inputMethod,
      source: editing?.source === 'fictional-mixed-dining-sample' ? editing.source : inputMethod,
      createdAt: editing?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString()
    });
    J.write([record, ...logs.filter(log => log.id !== record.id)]);
    const wasEditing = !!editing;
    editing = null;
    selected = null;
    inputMethod = 'text';
    $('mealText').value = '';
    $('saveMealButton').textContent = '记录';
    $('inputStatus').textContent = '';
    resetPhoto();
    try { sessionStorage.removeItem('selected_meal'); } catch { /* The meal is already saved. */ }
    history.replaceState(null, '', 'page4_log.html');
    render();
    message(wasEditing ? '这餐记录已更新。' : '已记下这餐。');
    $('recentTitle').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (error) { message(error.message); }
});

render();
if (params.has('edit')) beginEdit(J.read().find(log => log.id === params.get('edit')));
else if (params.get('from') === 'result') {
  try { selected = JSON.parse(sessionStorage.getItem('selected_meal')); } catch { selected = null; }
  if (selected?.dish) {
    $('mealText').value = selected.dish;
    $('inputStatus').textContent = '已填入选中的菜品，吃过后点击“记录”。';
  }
}
window.addEventListener('storage', event => { if (event.key === J.KEY || event.key === null) render(); });
window.addEventListener('pagehide', () => { if (photoURL) URL.revokeObjectURL(photoURL); });
