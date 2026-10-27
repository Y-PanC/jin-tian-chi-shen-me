import { nextKnowledgeBatch } from './knowledge-deck.js';

const P = window.MealPreferences;
const profile = P.normalizeProfile(P.read('localStorage', 'user_profile'));
document.getElementById('goal-description').textContent = `当前目标：${profile.goal}`;

// 内容参考《中国居民膳食指南（2022）》的一般健康饮食建议。
const knowledgeCards = [
  { id: 'vegetables', icon: 'i-broccoli', title: '餐餐添点蔬菜', text: '每天至少300克，深色蔬菜约占一半' },
  { id: 'fruit', icon: 'i-apple', title: '水果优先鲜吃', text: '每天200～350克，果汁不能代替新鲜水果' },
  { id: 'grains', icon: 'i-grain', title: '主食粗细搭配', text: '保留谷类主食，经常搭配全谷物和杂豆' },
  { id: 'water', icon: 'i-water-cup', title: '喝水少量多次', text: '优先白水或茶水，不用含糖饮料代替' },
  { id: 'dairy', icon: 'i-milk', title: '每天来点奶类', text: '奶制品也是日常均衡饮食的一部分' },
  { id: 'protein', icon: 'i-fish', title: '鱼肉蛋换着吃', text: '鱼、禽、蛋、瘦肉，适量搭配着吃' },
  { id: 'salt', icon: 'i-salt', title: '清淡少一点盐', text: '少吃高盐食品，培养清淡口味' },
  { id: 'oil', icon: 'i-oil', title: '油炸适当少吃', text: '少吃油炸食品，让日常饮食更清淡' },
  { id: 'breakfast', icon: 'i-sun', title: '早餐别忘记吃', text: '每天吃早餐，认真安排一日三餐' },
  { id: 'mealtimes', icon: 'i-clock', title: '三餐规律一些', text: '定时定量，不漏餐，饮食适度' },
  { id: 'variety', icon: 'i-plate', title: '食物多样搭配', text: '谷薯、蔬果、鱼肉蛋奶，多样搭配' },
  { id: 'beans', icon: 'i-beans', title: '豆类常上餐桌', text: '经常吃些大豆制品，丰富食物种类' }
];
const cards = document.getElementById('knowledge-cards');
const knowledgeHistoryKey = 'knowledge_card_history_v1';
let knowledgeHistory = P.read('localStorage', knowledgeHistoryKey);

function refreshKnowledge(announce = true) {
  const next = nextKnowledgeBatch(knowledgeCards, knowledgeHistory);
  knowledgeHistory = next.history;
  try {
    if (window.MealCloud?.active) window.MealCloud.saveKnowledge(knowledgeHistory).catch(() => {});
    else localStorage.setItem(knowledgeHistoryKey, JSON.stringify(knowledgeHistory));
  }
  catch { /* 本次页面仍在内存中保留去重记录。 */ }
  const articles = next.cards.map(item => {
    const article = document.createElement('article');
    article.className = 'know';
    const icon = document.createElement('span');
    icon.className = 'ic';
    icon.setAttribute('aria-hidden', 'true');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', `#${item.icon}`);
    svg.append(use);
    icon.append(svg);
    const title = document.createElement('h3');
    title.className = 't';
    title.textContent = item.title;
    const text = document.createElement('p');
    text.className = 's';
    text.textContent = item.text;
    article.append(icon, title, text);
    return article;
  });
  cards.replaceChildren(...articles);
  cards.scrollLeft = 0;
  if (announce) document.getElementById('knowledge-status').textContent = `已换一批：${next.cards.map(item => item.title).join('、')}`;
}

document.getElementById('refresh-knowledge').addEventListener('click', () => refreshKnowledge());
refreshKnowledge(false);
