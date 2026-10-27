import { element, chipList } from './services.js?v=3.0.0';
import { recommendationEvidenceURL } from './result-state.js?v=3.0.0';

export function renderRecommendationCard(item, order, chooseMeal, beforeEvidence = () => {}) {
  const card = element('article', 'card result-card scored-card');
  const overview = element('div', 'recommendation-overview');
  const visual = element('figure', 'dish-visual');
  const photo = element('img', 'dish-photo');
  photo.src = /^assets\/images\/dishes\/[a-z0-9-]+\.(?:jpe?g|png|webp|svg)$/.test(item.image || '') ? item.image : 'assets/images/dishes/unavailable.svg';
  photo.alt = item.imageAlt || `${item.dish}${item.imageKind === 'illustration' ? '示意图' : '菜品照片'}`;
  photo.width = 112; photo.height = 112; photo.loading = order % 3 === 1 ? 'eager' : 'lazy'; photo.decoding = 'async';
  photo.addEventListener('error', () => { photo.src = 'assets/images/dishes/unavailable.svg'; photo.alt = `${item.dish}图片暂未加载`; }, { once: true });
  visual.append(photo);
  if (item.imageCaption || item.imageKind === 'illustration') visual.append(element('figcaption', 'image-kind', item.imageCaption || '示意图'));
  const intro = element('div', 'dish-intro');
  const title = element('div', 'dish-title-price');
  title.append(element('h3', '', item.dish));
  const price = element('p', 'price'); price.append(element('small', '', '¥'), document.createTextNode(item.price)); title.append(price);
  intro.append(title, element('p', 'shop', item.shop));
  const facts = element('p', 'dish-facts');
  const meta = [];
  if (Number.isFinite(item.monthlySales)) meta.push(`月售 ${item.monthlySales}`);
  if (Number.isFinite(item.deliveryMinutes)) meta.push(`预计 ${item.deliveryMinutes} 分钟`);
  facts.textContent = meta.join(' · '); intro.append(facts);
  const health = element('div', `health-score${item.evaluation.healthScore !== null && item.evaluation.healthScore < 60 ? ' health-score-low' : ''}`);
  health.append(element('span', '', '健康分'), element('strong', '', item.evaluation.healthScore ?? '—'), element('small', '', '/ 100'));
  intro.append(health);
  overview.append(visual, intro);
  const tastes = item.tasteLabels || (item.tags || []).filter(tag => !item.dietType || !['荤素搭配', '主食为主'].includes(tag));
  const tags = [...new Set([...tastes, item.dietType].filter(Boolean))];
  const chips = chipList(tags); chips.classList.add('recommendation-tags');
  const reasons = element('section', 'recommendation-reasons');
  reasons.setAttribute('aria-label', `${item.dish}的推荐理由`);
  reasons.append(element('h4', '', '推荐理由'));
  for (const reason of item.evaluation.reasons) {
    const row = element('p', 'recommendation-reason');
    row.append(element('span', 'reason-dimension', reason.label), element('span', '', reason.text)); reasons.append(row);
  }
  const bottom = element('div', 'card-bottom');
  const choose = element('button', 'pick', '选这份 →'); choose.type = 'button'; choose.setAttribute('aria-label', `选这份：${item.dish}`);
  choose.addEventListener('click', () => chooseMeal(item));
  bottom.append(choose);
  card.append(overview, chips, reasons);
  if (item.evaluation.warnings.length) card.append(element('p', 'recommendation-warning', item.evaluation.warnings.join('；')));
  const evidence = element('a', 'score-evidence-link');
  evidence.href = recommendationEvidenceURL(item.id, Math.floor((order - 1) / 3));
  evidence.setAttribute('aria-label', `查看推荐依据：${item.dish}`);
  evidence.append(element('span', '', '查看推荐依据'), element('span', 'score-total', `综合 ${item.evaluation.totalScore} 分 →`));
  evidence.addEventListener('click', event => {
    try { beforeEvidence(); }
    catch { event.preventDefault(); }
  });
  card.append(evidence, bottom);
  return card;
}
