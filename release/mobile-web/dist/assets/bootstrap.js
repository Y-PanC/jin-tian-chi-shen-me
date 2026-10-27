import { Cloud, accountChannel } from './cloud.js?v=2.0.0';

const modulePath = document.querySelector('script[data-page-module]')?.dataset.pageModule;
const loading = document.createElement('div'); loading.className = 'app-loading'; loading.setAttribute('role', 'status');
const note = document.createElement('p'); note.textContent = '正在读取你的饮食档案…'; loading.append(note);
document.body.append(loading);
const phone = document.querySelector('.phone'); if (phone) phone.inert = true;
const next = location.pathname.split('/').pop() + location.search;
try {
  await Cloud.load();
  if (!Cloud.state.profile && modulePath?.split('?')[0] === './home.js') location.replace('page1_guide.html');
  else await import(modulePath);
  loading.remove(); if (phone) phone.inert = false;
} catch (error) {
  if (error.status === 401) location.replace(`page_login.html?next=${encodeURIComponent(next)}`);
  else {
    note.textContent = error.message;
    const retry = document.createElement('button'); retry.className = 'btn btn-primary'; retry.textContent = '重新连接';
    retry.onclick = () => location.reload(); loading.append(retry);
  }
}
accountChannel?.addEventListener('message', () => { location.replace('page_login.html'); });
window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
