import { element, chipList } from './services.js?v=4.0.0';
import { recommendationEvidenceURL } from './result-state.js?v=4.0.0';
import { healthStars, renderHealthStars } from './rating-stars.js?v=4.0.0';

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
  const health = element('div', 'health-index');
  health.append(element('span', 'health-index-label', '健康指数'), renderHealthStars(item.evaluation.healthScore));
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
    const healthReason = reason.key === 'health';
    const text = healthReason ? reason.text.replace(/健康参考\s+\d+(?:\.\d+)?\s*分/, `${healthStars(item.evaluation.healthScore)} 星`) : reason.text;
    row.append(element('span', 'reason-dimension', healthReason ? '健康指数' : reason.label), element('span', '', text)); reasons.append(row);
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
  evidence.append(element('span', '', '查看推荐依据'), element('span', 'score-total', `推荐指数 ${item.evaluation.totalScore} →`));
  evidence.addEventListener('click', event => {
    try { beforeEvidence(); }
    catch { event.preventDefault(); }
  });
  card.append(evidence, bottom);
  return card;
}
