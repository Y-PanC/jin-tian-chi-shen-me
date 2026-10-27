import { preparePhoto, putPhotos } from './meal-media.js?v=4.0.0';

const catalogImage = /^assets\/images\/dishes\/[a-z0-9-]+\.(?:jpe?g|png|webp)$/;

export function isRecommendationPhoto(photo) {
  return photo?.source === 'recommendation' && catalogImage.test(photo.catalogImage || '');
}

export function recommendationToDraft(item, time) {
  const tags = [...new Set([...(item?.tags || []), ...(item?.tasteLabels || []), item?.dietType]
    .filter(tag => typeof tag === 'string' && tag.trim() && tag.trim().length <= 16).map(tag => tag.trim()))].slice(0, 12);
  const photos = [];
  if (catalogImage.test(item?.image || '')) {
    const name = item.image.split('/').pop();
    photos.push({
      id: crypto.randomUUID(), name, source: 'recommendation', catalogImage: item.image,
      caption: item.imageCaption || '菜式参考图', alt: item.imageAlt || `${item.dish}菜式参考图`
    });
  }
  return { name: item?.dish || '', time, tags, remarks: '', photos };
}

export async function prepareRecommendationPhoto(photo, { fetchImage = fetch, prepare = preparePhoto } = {}) {
  if (!isRecommendationPhoto(photo)) throw new Error('推荐图片暂时无法读取，请移除后重新添加');
  const response = await fetchImage(photo.catalogImage);
  if (!response.ok) throw new Error('推荐图片暂时无法读取，请重试或移除后重新添加');
  const blob = await response.blob();
  const extension = photo.catalogImage.split('.').pop();
  const mimeType = blob.type.startsWith('image/') ? blob.type : extension === 'png' ? 'image/png' : extension === 'webp' ? 'image/webp' : 'image/jpeg';
  const prepared = await prepare(new File([blob], photo.name, { type: mimeType }));
  return { ...prepared, id: photo.id };
}

export async function storeDraftPhotos(photos, uploaded, pending, { prepare = prepareRecommendationPhoto, store = putPhotos } = {}) {
  for (const photo of photos.filter(photo => isRecommendationPhoto(photo) && !uploaded.has(photo.id))) {
    if (!pending.has(photo.id)) pending.set(photo.id, await prepare(photo));
  }
  const additions = photos.filter(photo => pending.has(photo.id) && !uploaded.has(photo.id)).map(photo => pending.get(photo.id));
  if (!additions.length) return { photos, additions };
  const metadata = await store(additions);
  const stored = new Map((metadata || additions).map(photo => [photo.id, photo]));
  return {
    additions,
    photos: photos.map(photo => {
      const saved = stored.get(photo.id);
      if (!saved) return photo;
      uploaded.add(photo.id);
      const { id, name, mimeType, size, width, height } = saved;
      return { ...photo, id, name, mimeType, size, width, height, uploaded: true };
    })
  };
}
