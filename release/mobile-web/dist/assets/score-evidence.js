import { element } from './services.js?v=4.0.0';
import { renderHealthStars } from './rating-stars.js?v=4.0.0';

function sourceLink(value, label, license = false) {
  try {
    const url = new URL(value);
    const allowed = license ? ['creativecommons.org', 'www.creativecommons.org', 'commons.wikimedia.org'] : ['commons.wikimedia.org', 'en.wikipedia.org', 'zh.wikipedia.org', 'www.flickr.com', 'unsplash.com', 'www.pexels.com'];
    if (license && url.protocol === 'http:' && allowed.includes(url.hostname)) url.protocol = 'https:';
    if (url.protocol !== 'https:' || !allowed.includes(url.hostname) || url.username || url.password) return null;
    const link = element('a', '', label); link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer'; return link;
  } catch { return null; }
}

function imageCredit(item) {
  const credit = element('p', 'image-credit');
  const source = sourceLink(item.imageSourceUrl, '图片来源');
  if (!source) { credit.textContent = item.healthSource === 'workbook' ? '图片：用户文档「C组 1023 v1」配图' : '图片：菜品示例素材'; return credit; }
  credit.append(source);
  if (item.imageAuthor) credit.append(document.createTextNode(` · ${item.imageAuthor}`));
  if (item.imageLicense) {
    const license = sourceLink(item.imageLicenseUrl, item.imageLicense, true);
    credit.append(document.createTextNode(' · '), license || document.createTextNode(item.imageLicense));
  }
  if (item.imageReferenceDish) credit.append(document.createTextNode(`；参考菜式：${item.imageReferenceDish}`));
  if (item.imageModifications) credit.append(document.createTextNode(`；${item.imageModifications}`));
  return credit;
}

function section(title) {
  const card = element('section', 'card evidence-card');
  card.append(element('h2', '', title));
  return card;
}

export function renderScoreEvidence(item) {
  const evaluation = item.evaluation;
  const overview = element('section', 'evidence-overview');
  overview.append(element('h2', '', item.dish), element('p', 'evidence-shop', item.shop));
  const metrics = element('dl', 'evidence-metrics');
  for (const [label, value] of [['推荐指数', evaluation.totalScore], ['健康指数', evaluation.healthScore]]) {
    const metric = element('div');
    const score = element('dd');
    if (label === '健康指数') score.append(renderHealthStars(value));
    else score.append(element('strong', '', value), element('span', '', '/ 100'));
    metric.append(element('dt', '', label), score); metrics.append(metric);
  }
  overview.append(metrics);

  const dimensions = section('评分构成');
  const table = element('table', 'score-table');
  table.setAttribute('aria-label', `${item.dish}的推荐评分明细`);
  const head = element('thead'); const headings = element('tr');
  for (const label of ['评分维度', '原分', '权重', '折算分']) { const cell = element('th', '', label); cell.scope = 'col'; headings.append(cell); }
  head.append(headings);
  const body = element('tbody');
  for (const part of evaluation.dimensions) {
    const row = element('tr');
    const label = element('th', '', part.label); label.scope = 'row';
    row.append(label, element('td', '', part.value === null ? part.key === 'reviews' ? '暂无数据' : '—' : part.value), element('td', '', `${Math.round(part.weight * 100)}%`), element('td', '', part.contribution)); body.append(row);
  }
  table.append(head, body); dimensions.append(table);

  const corrections = section('分数调整');
  const base = element('p', 'score-adjustment'); base.append(element('span', '', '加权基础分'), element('strong', '', evaluation.baseScore)); corrections.append(base);
  for (const adjustment of evaluation.adjustments) {
    const row = element('div', 'score-adjustment-block');
    const heading = element('p', 'score-adjustment');
    heading.append(element('span', '', adjustment.label), element('strong', '', `${adjustment.points > 0 ? '+' : ''}${adjustment.points}`));
    row.append(heading, element('p', 'score-adjustment-note', adjustment.detail)); corrections.append(row);
  }
  if (!evaluation.adjustments.length) corrections.append(element('p', 'score-adjustment-note', '本次没有额外加减分'));
  const final = element('p', 'score-adjustment score-final'); final.append(element('span', '', '推荐指数'), element('strong', '', `${evaluation.totalScore} / 100`)); corrections.append(final);
  corrections.append(element('p', 'score-footnote', '推荐指数结合个人偏好与历史记录排序，范围为 0～100；健康指数以 5 星展示，每半星一档，明细保留原始分值'));

  const notes = section('各维度说明');
  const list = element('dl', 'score-notes');
  for (const part of evaluation.dimensions) list.append(element('dt', '', part.label), element('dd', '', part.detail));
  notes.append(list);
  const sources = section('参考说明');
  sources.append(element('p', 'score-footnote', '菜品与评分为示例参考，缺失数据以中性分参与计算；参考图片不代表示例店铺实拍或实际配料'), imageCredit(item));
  return [overview, dimensions, corrections, notes, sources];
}
