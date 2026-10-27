import { api, Cloud, clearSessionData, accountChannel } from './cloud.js?v=3.0.0';
const $ = id => document.getElementById(id);
const home = 'page0_home_old_user.html';
let mode = 'login', busy = false;
function changeMode(value) {
  if (busy) return;
  mode = value; const register = mode === 'register';
  $('loginTab').setAttribute('aria-selected', String(!register)); $('registerTab').setAttribute('aria-selected', String(register));
  $('confirmField').hidden = !register; $('confirmPassword').required = register;
  $('password').autocomplete = register ? 'new-password' : 'current-password';
  $('authSubmit').textContent = register ? '创建账号' : '登录'; $('authError').hidden = true;
}
$('loginTab').onclick = () => changeMode('login'); $('registerTab').onclick = () => changeMode('register');
$('authForm').addEventListener('submit', async event => {
  event.preventDefault(); if (busy) return;
  $('authError').hidden = true;
  if (mode === 'register' && $('password').value !== $('confirmPassword').value) {
    $('authError').textContent = '两次密码不一致'; $('authError').hidden = false; return;
  }
  busy = true; $('authSubmit').disabled = true; $('authSubmit').textContent = mode === 'register' ? '正在创建…' : '正在登录…';
  try {
    await api(`auth/${mode}`, { method: 'POST', body: { username: $('username').value.trim(), password: $('password').value } });
    clearSessionData(); accountChannel?.postMessage('changed');
    location.replace(home);
  } catch (error) {
    $('authError').textContent = error.message; $('authError').hidden = false;
    busy = false; $('authSubmit').disabled = false; changeMode(mode);
    $('authError').hidden = false;
  }
});
try { await Cloud.load(); location.replace(home); } catch (error) {
  if (error.status !== 401) { $('authError').textContent = error.message; $('authError').hidden = false; }
}
