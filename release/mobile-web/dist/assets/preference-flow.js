(() => {
  'use strict';
  const P = window.MealPreferences;
  const $ = id => document.getElementById(id);
  const isGuide = document.body.dataset.flow === 'guide';
  const returningToProfile = isGuide && new URLSearchParams(location.search).get('return') === 'profile';
  const completionDestination = returningToProfile ? 'page5_profile.html' : 'page0_home_old_user.html';
  const rawProfile = P.read('localStorage', 'user_profile');
  if (!isGuide && !P.validProfile(rawProfile)) { location.replace('page1_guide.html'); return; }
  const profile = P.normalizeProfile(rawProfile);
  const context = P.mealContext(P.read('localStorage', 'meal_logs'), P.read('sessionStorage', 'last_recommendation'));
  const state = isGuide ? { ...profile, tastes: [...profile.tastes], restrictions: [...profile.restrictions] } : { mood: '无所谓', direction: '暂无想法', budgetRange: profile.budgetRange, changeTaste: 'no' };
  if (!isGuide && new URLSearchParams(location.search).get('edit') === '1') {
    const previous = P.read('sessionStorage', 'meal_request');
    if (previous) {
      if (['吃点好的', '速战速决', '清淡一点', '无所谓'].includes(previous.mood)) state.mood = previous.mood;
      if (['米粉面', '盖饭简餐', '地方菜系', '汉堡披萨', '特色小吃', '暂无想法'].includes(previous.direction)) state.direction = previous.direction;
      if (P.BUDGETS.some(item => item.value === previous.budgetRange)) state.budgetRange = previous.budgetRange;
      state.changeTaste = previous.changeTaste === true ? 'yes' : 'no';
    }
  }
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
    { key: 'mood', short: '在意', lead: '这一顿，', title: '先听你的想法', icon: 'i-bolt', question: '这一顿最在意什么？', choices: options(['吃点好的', '速战速决', '清淡一点', '无所谓']).map(item => ({ ...item, label: item.value === '无所谓' ? '无所谓（默认）' : item.label })) },
    { key: 'direction', short: '想吃', lead: '今天，', title: '想吃哪一类？', icon: 'i-noodle', question: '想吃哪一类？', choices: options(['米粉面', '盖饭简餐', '地方菜系', '汉堡披萨', '特色小吃', '暂无想法']).map(item => ({ ...item, label: item.value === '暂无想法' ? '暂无想法（默认）' : item.label })) },
    { key: 'budgetRange', short: '预算', lead: '这一顿，', title: '花得刚刚好', icon: 'i-wallet', question: '这顿饭的预算大致在？', choices: P.BUDGETS },
    { key: 'changeTaste', short: '换口味', lead: '这一顿，', title: '换换口味也好', icon: 'i-veg', question: '这顿想换个口味吗？', choices: [{ value: 'yes', label: '换个口味' }, { value: 'no', label: '按平时口味' }] }
  ];
  const steps = isGuide ? guideSteps : askSteps;
  let step = 0;
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
      if (!current.multiple) { state[current.key] = input.value; return; }
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
    progress.querySelectorAll('li').forEach((item, index) => {
      item.className = index === step ? 'current' : index < step ? 'done' : '';
      const control = item.querySelector('button') || item;
      if (index === step) control.setAttribute('aria-current', 'step'); else control.removeAttribute('aria-current');
    });
    $('step-caption').textContent = `${isGuide ? '个人档案' : '问一问这一顿'} · ${step + 1} / ${steps.length}`;
    title(current.lead, current.title);
    $('step-art').setAttribute('href', `#${current.icon}`);
    $('question').textContent = current.question + (current.multiple ? '（多选）' : '');
    const allChoices = [...current.choices];
    if (current.none) allChoices.push({ value: '__none__', label: current.none });
    if (current.other) allChoices.push({ value: '__other__', label: '其他' });
    $('choices').replaceChildren(...allChoices.map(item => makeChoice(item, current)));
    $('other-field').hidden = !current.other || !otherEnabled;
    $('restriction-other').value = otherText;
    $('back').hidden = step === 0;
    $('back').textContent = '上一步';
    $('next').textContent = step === steps.length - 1 ? isGuide ? returningToProfile ? '保存个人档案 →' : '完成，去首页 →' : '看看推荐 →' : '下一步 →';
    $('skip-step').textContent = '跳过';
    document.querySelector('.page').scrollTop = 0;
    if (moveFocus) $('step-title').focus({ preventScroll: true });
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
      const dialog = $('profile-saved-dialog');
      dialog.addEventListener('close', () => { location.href = destination; }, { once: true });
      dialog.showModal();
    } else {
      const request = { ...state, changeTaste: state.changeTaste === 'yes', budget: P.BUDGETS.find(item => item.value === state.budgetRange).max, profile: { goal: profile.goal, tastes: profile.tastes, restrictions: profile.restrictions, spiceLevel: profile.spiceLevel, appetite: profile.appetite }, context, createdAt: new Date().toISOString() };
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
    else state[key] = key === 'budgetRange' ? profile.budgetRange : key === 'mood' ? '无所谓' : key === 'direction' ? '暂无想法' : 'no';
    if (key === 'restrictions') { otherEnabled = false; otherText = ''; }
    if (step < steps.length - 1) { step++; render(); } else finish();
  });
  if (isGuide) {
    $('profile-saved-confirm').addEventListener('click', () => { $('profile-saved-dialog').close(); });
    $('home-link').addEventListener('click', event => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault(); finish('page0_home_old_user.html');
    });
  }
  $('done').addEventListener('click', () => { location.href = 'page0_home_old_user.html'; });
  window.addEventListener('pageshow', event => { if (event.persisted) render(false); });
  render(false);
})();
