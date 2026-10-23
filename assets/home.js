import { readLogs, latestMeal } from './services.js';
const P = window.MealPreferences;
const profile = P.normalizeProfile(P.read('localStorage', 'user_profile'));
document.getElementById('goal-description').textContent = `当前目标：${profile.goal}，已结合你的档案`;
const cards = [...document.querySelectorAll('.know')];
const last = latestMeal(readLogs());
const copy = [
  last ? ['换个搭配试试', `上顿吃了${last.dish}，下一顿换个方向。`, `来自你的档案：${last.period || '用餐'}记录`] : ['口味自己定', '点单时备注少油或酱汁另放，按自己的习惯选择。', '通用小知识'],
  profile.tastes.length ? ['你的口味，记住了', `你填写的口味偏好是${profile.tastes.join('、')}，每顿都可以再调整。`, '来自你的档案：口味偏好'] : ['吃过什么，记一笔', '留下菜名和口味，下次决定时多一点参考。', '通用小知识'],
  ['辣度备注说清楚', '用微辣、中辣等明确备注，点单前和商家确认。', '通用小知识'],
  ['预算留点余地', '除了餐费，点单时也看看配送费和打包费。', '通用小知识']
];
cards.forEach((card, index) => { for (const [part, text] of [['.t', copy[index][0]], ['.s', copy[index][1]], ['.from', copy[index][2]]]) card.querySelector(part).textContent = text; });
document.querySelector('.more').addEventListener('click', () => {
  const wrap = document.getElementById('knowledge-cards');
  wrap.scrollLeft = wrap.scrollLeft >= wrap.scrollWidth - wrap.clientWidth - 1 ? 0 : wrap.scrollWidth;
});
