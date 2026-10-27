import { FOOD_CATEGORIES, ASK_BUDGETS, DELIVERY_TIMES, askAnswers, askRequest } from './ask-options.js?v=3.0.0';
import { readAskDraft, saveAskDraft } from './ask-draft.js?v=3.0.0';

(() => {
  'use strict';
  const P = window.MealPreferences;
  const $ = id => document.getElementById(id);
  const isGuide = document.body.dataset.flow === 'guide';
  const returnTarget = isGuide ? new URLSearchParams(location.search).get('return') : null;
  const returningToProfile = returnTarget === 'profile';
  const returningToSettings = returnTarget === 'settings';
  const completionDestination = returningToSettings ? 'page6_settings.html' : returningToProfile ? 'page5_profile.html' : 'page0_home_old_user.html';
  const rawProfile = P.read('localStorage', 'user_profile');
  if (!isGuide && !P.validProfile(rawProfile)) { location.replace('page1_guide.html'); return; }
  const profile = P.normalizeProfile(rawProfile);
  const context = P.mealContext(P.read('localStorage', 'meal_logs'), P.read('sessionStorage', 'last_recommendation'));
  const ownerId = window.MealCloud?.state?.user?.id;
  const savedAsk = !isGuide && ownerId ? readAskDraft(sessionStorage, ownerId, profile) : null;
  const previous = !isGuide ? P.read('sessionStorage', 'meal_request') : null;
  const roundId = !isGuide ? savedAsk?.roundId || (typeof previous?.roundId === 'string' && previous.roundId) || crypto.randomUUID() : null;
  const state = isGuide ? { ...profile, tastes: [...profile.tastes], restrictions: [...profile.restrictions] } : savedAsk?.answers || askAnswers(previous, profile);
  const options = items => items.map(value => ({ value, label: value }));
  const goalOptions = options(P.GOALS).map(item => ({ ...item, label: item.value === '营养均衡' ? '营养均衡（默认）' : item.label }));
  const guideSteps = [
    { key: 'goal', short: '目标', lead: '吃好每一顿，', title: '从小目标开始', icon: 'i-pen', question: '最近吃饭主要顾及哪一方面？', choices: goalOptions },
    { key: 'tastes', short: '口味', lead: '下一顿，', title: '更合你的口味', icon: 'i-noodle', question: '平时口味更偏向哪一边？', multiple: true, none: '无特别倾向', choices: options(P.TASTES) },
    { key: 'restrictions', short: '忌口', lead: '先记住，', title: '哪些要避开', icon: 'i-veg', question: '有没有忌口或过敏？', multiple: true, none: '无', other: true, choices: options(P.RESTRICTIONS) },
    { key: 'spiceLevel', short: '辣度', lead: '一点点辣，', title: '还是再辣一点', icon: 'i-chili', question: '有多能吃辣？', choices: options(P.SPICE_LEVELS) },
    { key: 'budgetRange', short: '预算', lead: '这顿的预算，', title: '由你来定', icon: 'i-wallet', question: '一顿饭的预算大致在？', choices: P.BUDGETS },
    { key: 'appetite', short: '饭量', lead: '最后一步，', title: '了解你的饭量', icon: 'i-ruler', question: '饭量怎么样？', choices: options(P.APPETITES) }
  ];
  const askSteps = [
    { key: 'categories', short: '类别', lead: '这一顿，', title: '想吃哪些种类？', icon: 'i-noodle', question: '选出这顿想吃的类别', multiple: true, none: '不限类别', choices: FOOD_CATEGORIES.filter(item => item.value !== 'any'), note: '可以同时选几类，也可以不限类别' },
    { key: 'budgetRange', short: '预算', lead: '这顿的预算，', title: '花得刚刚好', icon: 'i-wallet', question: '每人这一餐，打算花多少？', choices: ASK_BUDGETS, note: '按菜品参考价筛选，不含配送费' },
    { key: 'deliveryTime', short: '配送时间', lead: '想吃的这一顿，', title: '多久送到合适？', icon: 'i-clock', question: '希望多长时间内送到？', choices: DELIVERY_TIMES, note: '当前按示例预计时长筛选，实际送达以商家为准' }
  ];
  const steps = isGuide ? guideSteps : askSteps;
  let step = isGuide ? 0 : savedAsk?.step || 0;
  let finished = false;
  let otherEnabled = state.restrictions?.some(value => !P.RESTRICTIONS.includes(value)) || false;
  let otherText = (state.restrictions || []).filter(value => !P.RESTRICTIONS.includes(value)).join('、');
  const progress = $('progress');
  for (const [index, item] of steps.entries()) {
    const li = document.createElement('li');
    const label = `${String(index + 1).padStart(2, '0')} ${item.short}`;
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.setAttribute('aria-controls', 'preference-form');
    button.addEventListener('click', () => {
      if (index === step || !validate()) return;
      step = index;
      render();
    });
    li.append(button);
    progress.append(li);
  }
  function clearError() { $('form-error').hidden = true; $('form-error').textContent = ''; }
  function showError(message) { $('form-error').textContent = message; $('form-error').hidden = false; $('form-error').scrollIntoView({ block: 'nearest' }); }
  function persistAsk() {
    if (isGuide || !ownerId || !window.MealCloud?.active || window.MealCloud.state?.user?.id !== ownerId) return;
    try { saveAskDraft(sessionStorage, ownerId, state, step, roundId); }
    catch { showError('当前选择暂时无法保留，请允许浏览器保存网站数据后重试'); }
  }
  function updateRestrictions() {
    const selected = Array.from($('choices').querySelectorAll('input:checked')).map(input => input.value).filter(value => !value.startsWith('__'));
    const extra = otherEnabled ? otherText.split(/[、，,；;\n]/).map(value => value.trim()).filter(Boolean) : [];
    state.restrictions = [...new Set([...selected, ...extra])];
  }
  function makeChoice(item, current) {
    const label = document.createElement('label');
    label.className = 'choice';
    const input = document.createElement('input');
    input.type = current.multiple ? 'checkbox' : 'radio';
    input.name = current.key;
    input.value = item.value;
    input.checked = current.multiple ? item.value === '__none__' ? !state[current.key].length && !(current.other && otherEnabled) : item.value === '__other__' ? otherEnabled : state[current.key].includes(item.value) : state[current.key] === item.value;
    const body = document.createElement('span');
    body.className = 'choice-body';
    body.textContent = item.label;
    label.append(input, body);
    input.addEventListener('change', () => {
      clearError();
      if (!current.multiple) { state[current.key] = input.value; persistAsk(); return; }
      const allInputs = Array.from($('choices').querySelectorAll('input'));
      if (input.value === '__none__' && input.checked) {
        allInputs.forEach(item => { if (item !== input) item.checked = false; });
        if (current.other) { otherEnabled = false; otherText = ''; $('restriction-other').value = ''; }
      } else if (input.checked) allInputs.find(item => item.value === '__none__').checked = false;
      if (current.other) {
        otherEnabled = allInputs.find(item => item.value === '__other__').checked;
        $('other-field').hidden = !otherEnabled;
        updateRestrictions();
      } else state[current.key] = allInputs.filter(item => item.checked && !item.value.startsWith('__')).map(item => item.value);
      if (current.key === 'categories' && !state.categories.length) allInputs.find(item => item.value === '__none__').checked = true;
      persistAsk();
    });
    return label;
  }
  function title(lead, emphasis) {
    const span = document.createElement('span'); span.textContent = emphasis;
    $('step-title').replaceChildren(document.createTextNode(lead), document.createElement('br'), span);
  }
  function render(moveFocus = true) {
    clearError(); finished = false;
    $('preference-form').hidden = false;
    $('confirmation').hidden = true;
    progress.hidden = false;
    $('skip-step').hidden = step === steps.length - 1;
    $('next').hidden = false;
    $('done').hidden = true;
    const current = steps[step];
    if (!isGuide) {
      $('choices').className = `choices ${current.key === 'categories' ? 'category-choices' : 'range-choices'}`;
      document.querySelector('.selection-note').textContent = current.note;
    }
    progress.querySelectorAll('li').forEach((item, index) => {
      item.className = index === step ? 'current' : index < step ? 'done' : '';
      const control = item.querySelector('button') || item;
      if (index === step) control.setAttribute('aria-current', 'step'); else control.removeAttribute('aria-current');
    });
    $('step-caption').textContent = `${isGuide ? returningToSettings ? '饮食偏好' : '个人档案' : '问一问这一顿'} · ${step + 1} / ${steps.length}`;
    title(current.lead, current.title);
    $('step-art').setAttribute('href', `#${current.icon}`);
    $('question').textContent = current.question + (current.multiple ? '（多选）' : '');
    const allChoices = [...current.choices];
    if (current.none) allChoices[current.key === 'categories' ? 'unshift' : 'push']({ value: '__none__', label: current.none });
    if (current.other) allChoices.push({ value: '__other__', label: '其他' });
    $('choices').replaceChildren(...allChoices.map(item => makeChoice(item, current)));
    $('other-field').hidden = !current.other || !otherEnabled;
    $('restriction-other').value = otherText;
    $('back').hidden = step === 0;
    $('back').textContent = '上一步';
    $('next').textContent = step === steps.length - 1 ? isGuide ? returningToSettings ? '保存饮食偏好 →' : returningToProfile ? '保存个人档案 →' : '完成，去首页 →' : '看看推荐 →' : '下一步 →';
    $('skip-step').textContent = '跳过';
    document.querySelector('.page').scrollTop = 0;
    if (moveFocus) $('step-title').focus({ preventScroll: true });
    persistAsk();
  }
  function validate() {
    if (steps[step].other && otherEnabled && !otherText.trim()) { showError('请补充其他忌口，或取消“其他”选项'); $('restriction-other').focus(); return false; }
    return true;
  }
  let savingProfile = false;
  async function finish(destination = completionDestination) {
    if (savingProfile) return;
    if (finished) return;
    if (isGuide) {
      const now = new Date().toISOString();
      const savedProfile = { ...state, budget: P.BUDGETS.find(item => item.value === state.budgetRange).max, schemaVersion: 2, onboardingCompleted: true, createdAt: typeof rawProfile?.createdAt === 'string' ? rawProfile.createdAt : now, updatedAt: now };
      savingProfile = true; $('next').disabled = true;
      try {
        if (window.MealCloud?.active) await window.MealCloud.saveProfile(savedProfile);
        else localStorage.setItem('user_profile', JSON.stringify(savedProfile));
      }
      catch (error) { showError(error.message || '档案暂未保存，请重试；你的选择还在'); return; }
      finally { savingProfile = false; $('next').disabled = false; }
      finished = true;
      if (returningToSettings) { location.href = destination; return; }
      const dialog = $('profile-saved-dialog');
      dialog.addEventListener('close', () => { location.href = destination; }, { once: true });
      dialog.showModal();
    } else {
      const request = askRequest(state, { roundId, accountId: ownerId, profile: { goal: profile.goal, tastes: profile.tastes, restrictions: profile.restrictions, spiceLevel: profile.spiceLevel, appetite: profile.appetite }, context, createdAt: new Date().toISOString() });
      try { sessionStorage.setItem('meal_request', JSON.stringify(request)); }
      catch { showError('当前浏览器无法保存这顿偏好，请允许网站存储后重试'); return; }
      finished = true;
      location.href = 'page3_result.html';
    }
  }
  $('restriction-other').addEventListener('input', event => { otherText = event.target.value; updateRestrictions(); clearError(); });
  $('preference-form').addEventListener('submit', event => {
    event.preventDefault(); if (!validate()) return;
    if (step < steps.length - 1) { step++; render(); } else finish();
  });
  $('back').addEventListener('click', () => { if (finished) render(); else if (step > 0) { step--; render(); } });
  $('skip-step').addEventListener('click', () => {
    const key = steps[step].key;
    if (isGuide) state[key] = Array.isArray(P.DEFAULTS[key]) ? [] : P.DEFAULTS[key];
    else state[key] = key === 'categories' ? [] : 'unlimited';
    if (key === 'restrictions') { otherEnabled = false; otherText = ''; }
    if (step < steps.length - 1) { step++; render(); } else finish();
  });
  if (isGuide) {
    if (returningToSettings || returningToProfile) {
      $('home-link').className = 'tab';
      $('home-link').removeAttribute('aria-current');
      $('profile-link').className = 'tab on';
      $('profile-link').setAttribute('aria-current', 'page');
    }
    if (returningToSettings) {
      document.title = '饮食偏好 · 今天吃什么';
      $('guide-return').hidden = false;
      document.querySelector('.top').classList.add('editing-preferences');
      $('profile-saved-title').textContent = '饮食偏好已保存';
      $('profile-saved-description').textContent = '偏好已更新，返回基本设置后可以继续调整其他信息';
      $('profile-saved-confirm').textContent = '返回设置';
      $('done').textContent = '返回设置 →';
    }
    $('profile-saved-confirm').addEventListener('click', () => { $('profile-saved-dialog').close(); });
    $('home-link').addEventListener('click', event => {
      if (returningToSettings) return;
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault(); finish('page0_home_old_user.html');
    });
  }
  $('done').addEventListener('click', () => { location.href = completionDestination; });
  window.addEventListener('pageshow', event => { if (event.persisted) render(false); });
  window.addEventListener('pagehide', persistAsk);
  render(false);
})();
