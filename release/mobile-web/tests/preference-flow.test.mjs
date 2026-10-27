import test from 'node:test';
import assert from 'node:assert/strict';

class Element {
  constructor(tag = 'div') { this.tagName = tag; this.children = []; this.handlers = new Map(); this.hidden = false; this.textContent = ''; this.classList = { add() {} }; this.dataset = {}; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { this[name] = value; }
  removeAttribute(name) { delete this[name]; }
  addEventListener(type, callback) { const handlers = this.handlers.get(type) || []; handlers.push(callback); this.handlers.set(type, handlers); }
  async emit(type, extra = {}) { for (const callback of this.handlers.get(type) || []) await callback({ preventDefault() {}, button: 0, ...extra }); }
  querySelectorAll(tag) { return this.children.flatMap(child => child && typeof child === 'object' ? [...(child.tagName === tag ? [child] : []), ...(child.querySelectorAll?.(tag) || [])] : []); }
  querySelector(tag) { return this.querySelectorAll(tag)[0] || null; }
  focus() {}
  scrollIntoView() {}
  showModal() { this.open = true; }
  close() { this.open = false; return this.emit('close'); }
}

async function guideFlow(search, fail = false) {
  const elements = new Map();
  const get = id => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); };
  const page = new Element(); const top = new Element();
  const initial = { goal:'清淡减脂', tastes:['清淡'], restrictions:['海鲜'], spiceLevel:'微辣', budgetRange:'15to25', budget:25, appetite:'一般水平', createdAt:'2026-01-01T00:00:00Z' };
  let saved = null;
  globalThis.location = { search, href:'' };
  globalThis.sessionStorage = { getItem:()=>null, setItem() {}, removeItem() {} };
  globalThis.document = {
    body:{dataset:{flow:'guide'}}, getElementById:get, createElement:tag=>new Element(tag),
    createTextNode:text=>({textContent:text}), querySelector:selector=>selector === '.page' ? page : top
  };
  globalThis.window = {
    addEventListener() {},
    MealCloud:{active:true,state:{user:{id:'guide-test'}},async saveProfile(profile){saved=profile;if(fail)throw new Error('保存服务暂不可用');}},
    MealPreferences:{
      read:(kind,key)=>key === 'user_profile' ? initial : null, validProfile:value=>!!value,
      normalizeProfile:value=>structuredClone(value), mealContext:()=>({source:'none',dish:null}),
      GOALS:['营养均衡','清淡减脂'],TASTES:['清淡','偏甜'],RESTRICTIONS:['海鲜'],SPICE_LEVELS:['完全不吃辣','微辣'],
      BUDGETS:[{value:'15to25',max:25,label:'15～25元'}],APPETITES:['一般水平'],DEFAULTS:{}
    }
  };
  get('guide-return').hidden = true;
  get('home-link').className = 'tab on';
  get('home-link').setAttribute('aria-current', 'page');
  get('profile-link').className = 'tab';
  await import(`../dist/assets/preference-flow.js?guide-test=${encodeURIComponent(search)}-${fail}`);
  return { get, initial, saved:()=>saved, page, top };
}

test('settings preferences keep existing answers and return directly to settings after saving', async () => {
  const flow = await guideFlow('?return=settings');
  assert.equal(flow.get('home-link').className, 'tab');
  assert.equal(flow.get('home-link')['aria-current'], undefined);
  assert.equal(flow.get('profile-link').className, 'tab on');
  assert.equal(flow.get('profile-link')['aria-current'], 'page');
  assert.equal(flow.get('guide-return').hidden, false);
  assert.equal(flow.get('profile-saved-confirm').textContent, '返回设置');
  await flow.get('progress').children[5].children[0].emit('click');
  assert.equal(flow.get('next').textContent, '保存饮食偏好 →');
  await flow.get('preference-form').emit('submit');
  await new Promise(resolve => setImmediate(resolve));
  assert.notEqual(flow.get('profile-saved-dialog').open, true);
  for (const key of ['goal','tastes','restrictions','spiceLevel','budgetRange','appetite','createdAt']) assert.deepEqual(flow.saved()[key], flow.initial[key]);
  assert.equal(location.href, 'page6_settings.html');
});

test('failed preference saves keep the editing page and do not open success navigation', async () => {
  const flow = await guideFlow('?return=settings', true);
  await flow.get('progress').children[5].children[0].emit('click');
  await flow.get('preference-form').emit('submit');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(location.href, '');
  assert.notEqual(flow.get('profile-saved-dialog').open, true);
  assert.match(flow.get('form-error').textContent, /保存服务暂不可用/);
  assert.equal(flow.get('next').disabled, false);
});

test('existing profile and onboarding completion destinations are preserved', async () => {
  for (const [search,destination] of [['?return=profile','page5_profile.html'],['?return=https://example.com','page0_home_old_user.html']]) {
    const flow = await guideFlow(search);
    assert.equal(flow.get('profile-link').className, search === '?return=profile' ? 'tab on' : 'tab');
    assert.equal(flow.get('home-link')['aria-current'], search === '?return=profile' ? undefined : 'page');
    await flow.get('progress').children[5].children[0].emit('click');
    await flow.get('preference-form').emit('submit');
    await new Promise(resolve => setImmediate(resolve));
    await flow.get('profile-saved-confirm').emit('click');
    assert.equal(location.href, destination);
  }
});
