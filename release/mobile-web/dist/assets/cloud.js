const base = 'api/v1/';
const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai';
export async function api(path, options = {}) {
  const { raw = false, ...init } = options;
  const headers = new Headers(init.headers);
  headers.set('X-Meal-Request', '1');
  if (init.body && !(init.body instanceof FormData)) { headers.set('Content-Type', 'application/json'); init.body = JSON.stringify(init.body); }
  let response;
  try { response = await fetch(base + path, { ...init, headers, credentials: 'same-origin', signal: init.signal || AbortSignal.timeout(30000) }); }
  catch { throw new Error('暂时无法连接服务，当前输入会保留，请稍后重试'); }
  if (!response.ok) {
    let detail;
    try { detail = (await response.json()).detail; } catch {}
    const error = new Error(typeof detail === 'string' ? detail : '服务暂时不可用，请稍后重试'); error.status = response.status; throw error;
  }
  return raw ? response : response.json();
}

const temporaryKeys = ['meal_request', 'last_recommendation', 'selected_meal'];
export function clearSessionData() {
  temporaryKeys.forEach(key => sessionStorage.removeItem(key));
  for (const key of Object.keys(sessionStorage)) if (key.startsWith('meal_draft:') || key.startsWith('meal_recognition:') || key.startsWith('onboarding_backup:')) sessionStorage.removeItem(key);
}
export const accountChannel = 'BroadcastChannel' in window ? new BroadcastChannel('meal-web-account') : null;

export const Cloud = {
  active: false, state: null,
  async load() {
    this.state = await api(`state?tz=${encodeURIComponent(timeZone)}`);
    const previous = sessionStorage.getItem('meal_account_id');
    if (previous !== this.state.user.id) clearSessionData();
    sessionStorage.setItem('meal_account_id', this.state.user.id);
    this.active = true;
    return this.state;
  },
  read(key) {
    if (key === 'user_profile') return this.state.profile;
    if (key === 'user_settings') return this.state.settings;
    if (key === 'meal_logs') return this.state.records;
    if (key === 'knowledge_card_history_v1') return this.state.knowledgeHistory;
    return undefined;
  },
  async saveProfile(profile) {
    const result = await api('preferences', { method: 'PUT', body: { profile, expectedVersion: this.state.version } });
    Object.assign(this.state, result);
  },
  async saveSettings(settings) {
    const result = await api('preferences', { method: 'PUT', body: { settings: { ...this.state.settings, ...settings }, expectedVersion: this.state.version } });
    Object.assign(this.state, result);
  },
  async saveMeal(record, existing = null) {
    const result = await api(existing ? `meals/${encodeURIComponent(existing.id)}` : 'meals', {
      method: existing ? 'PUT' : 'POST', body: { record: { ...record, timeZone }, expectedRevision: existing?.revision }
    });
    this.state.records = [result.record, ...this.state.records.filter(value => value.id !== result.record.id)];
    return result.record;
  },
  async deleteMeal(id) {
    const record = this.state.records.find(value => value.id === id);
    if (!record) throw new Error('这条记录已不存在');
    await api(`meals/${encodeURIComponent(id)}?revision=${record.revision}`, { method: 'DELETE' });
    this.state.records = this.state.records.filter(value => value.id !== id);
  },
  async putPhotos(photos) {
    const results = [];
    for (const photo of photos) {
      const body = new FormData(); body.append('id', photo.id); body.append('file', photo.blob, photo.name || 'meal.jpg');
      results.push(await api('photos', { method: 'POST', body }));
    }
    return results;
  },
  async readPhoto(id) {
    const response = await api(`photos/${encodeURIComponent(id)}`, { raw: true });
    return { id, blob: await response.blob() };
  },
  async removePhotos(ids) {
    for (const id of ids) {
      try { await api(`photos/${encodeURIComponent(id)}`, { method: 'DELETE' }); }
      catch (error) { if (error.status !== 404 && error.status !== 409) throw error; }
    }
  },
  async saveKnowledge(history) {
    this.state.knowledgeHistory = history;
    await api('knowledge-history', { method: 'PUT', body: history });
  },
  async logout() {
    await api('auth/logout', { method: 'POST', body: {} });
    clearSessionData(); sessionStorage.removeItem('meal_account_id');
    this.state = null; this.active = false;
    accountChannel?.postMessage('changed');
    location.replace('page_login.html');
  }
};
window.MealCloud = Cloud;
