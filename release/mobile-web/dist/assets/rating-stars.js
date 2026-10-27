import { element } from './services.js?v=4.0.0';

export function healthStars(score) {
  return Number.isFinite(score) && score >= 0 && score <= 100 ? Math.round(score / 10) / 2 : null;
}

export function renderHealthStars(score) {
  const value = healthStars(score);
  if (value === null) return element('span', 'rating-unavailable', '暂无数据');
  const stars = element('span', 'rating-stars');
  stars.setAttribute('role', 'img');
  stars.setAttribute('aria-label', `健康指数 ${value} 星，满星 5 星`);
  for (let index = 0; index < 5; index++) {
    const star = element('span', 'rating-star');
    star.setAttribute('aria-hidden', 'true');
    const filled = element('span', 'rating-star-fill', '★');
    filled.style.width = `${Math.max(0, Math.min(1, value - index)) * 100}%`;
    star.append(element('span', 'rating-star-empty', '★'), filled);
    stars.append(star);
  }
  return stars;
}
