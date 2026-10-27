import test from 'node:test';
import assert from 'node:assert/strict';
import { recommendationToDraft, isRecommendationPhoto, prepareRecommendationPhoto, storeDraftPhotos } from '../dist/assets/recommendation-meal.js';
import { makeMealRecord, recordToDraft } from '../dist/assets/meal-records.js';

const item = {
  id: 'r18', dish: '鸡胸时蔬碗', tags: ['清淡', '荤素搭配'],
  tasteLabels: ['清淡', '鲜香'], dietType: '荤素搭配', image: 'assets/images/dishes/web-r18.jpg',
  imageCaption: '菜式参考图', imageAlt: '鸡胸时蔬碗真实菜式参考照片'
};
const time = '2026-10-27T12:00';

test('a selected recommendation supplies its dish, all card tags and a removable reference photo', () => {
  const before = structuredClone(item);
  const draft = recommendationToDraft(item, time);
  assert.equal(draft.name, item.dish);
  assert.equal(draft.time, time);
  assert.deepEqual(draft.tags, ['清淡', '荤素搭配', '鲜香']);
  assert.equal(draft.remarks, '');
  assert.equal(draft.photos.length, 1);
  assert(isRecommendationPhoto(draft.photos[0]));
  assert.equal(draft.photos[0].catalogImage, item.image);
  assert.equal(draft.photos[0].caption, item.imageCaption);
  assert.match(draft.photos[0].id, /^[0-9a-f-]{36}$/i);
  assert.deepEqual(item, before);
  assert.deepEqual(recommendationToDraft(null, time), { name: '', time, tags: [], remarks: '', photos: [] });
});

test('reference photos only use local catalog images, excluding remote URLs and placeholders', async () => {
  for (const image of ['https://example.com/meal.jpg', '../private.jpg', 'assets/images/dishes/../../private.jpg', 'assets/images/dishes/unavailable.svg']) {
    assert.equal(recommendationToDraft({ ...item, image }, time).photos.length, 0);
  }
  let fetched = false;
  await assert.rejects(prepareRecommendationPhoto({ source: 'recommendation', catalogImage: '../private.jpg' }, {
    fetchImage: async () => { fetched = true; }
  }), /推荐图片/);
  assert.equal(fetched, false);
});

test('preparing the catalog image uses its existing draft photo identity and reports read failures', async () => {
  const photo = recommendationToDraft(item, time).photos[0];
  const prepared = await prepareRecommendationPhoto(photo, {
    fetchImage: async path => {
      assert.equal(path, item.image);
      return { ok: true, blob: async () => new Blob(['image'], { type: 'image/jpeg' }) };
    },
    prepare: async file => {
      assert.equal(file.type, 'image/jpeg');
      assert.equal(file.name, 'web-r18.jpg');
      return { id: 'temporary-processor-id', name: file.name, blob: file };
    }
  });
  assert.equal(prepared.id, photo.id);
  await assert.rejects(prepareRecommendationPhoto(photo, { fetchImage: async () => ({ ok: false }) }), /推荐图片暂时无法读取/);
});

test('a saved recommendation retains its photo and user edits through the normal record format', async () => {
  const draft = recommendationToDraft(item, time);
  draft.name = '鸡胸时蔬碗、米饭'; draft.tags = ['清淡', '主食']; draft.remarks = '少酱';
  const photo = draft.photos[0], uploaded = new Set(), pending = new Map();
  const saved = await storeDraftPhotos(draft.photos, uploaded, pending, {
    prepare: async source => ({ id: source.id, name: source.name, blob: new Blob(['photo']) }),
    store: async photos => photos.map(value => ({ id: value.id, name: value.name, mimeType: 'image/jpeg', size: 100, width: 400, height: 300 }))
  });
  const record = makeMealRecord({ ...draft, photos: saved.photos }, null, new Date(2026, 9, 27, 20));
  const reopened = recordToDraft(record);
  assert.equal(reopened.name, draft.name); assert.deepEqual(reopened.tags, draft.tags); assert.equal(reopened.remarks, '少酱');
  assert.equal(reopened.photos[0].id, photo.id); assert.equal(reopened.photos[0].size, 100);
  assert(uploaded.has(photo.id)); assert.equal(saved.photos[0].uploaded, true);
  assert.equal(record.photos[0].catalogImage, undefined);
});

test('failed uploads can be retried without duplicate photos, and removed reference photos stay removed', async () => {
  const photos = recommendationToDraft(item, time).photos;
  const uploaded = new Set(), pending = new Map();
  let preparations = 0, uploads = 0;
  const prepare = async photo => { preparations++; return { id: photo.id, name: photo.name, blob: new Blob(['photo']) }; };
  await assert.rejects(storeDraftPhotos(photos, uploaded, pending, {
    prepare, store: async () => { uploads++; throw new Error('上传失败'); }
  }), /上传失败/);
  assert.equal(uploaded.size, 0);
  const saved = await storeDraftPhotos(photos, uploaded, pending, {
    prepare, store: async additions => { uploads++; return additions.map(photo => ({ id: photo.id, name: photo.name })); }
  });
  assert.equal(preparations, 1); assert.equal(uploads, 2);
  await storeDraftPhotos(JSON.parse(JSON.stringify(saved.photos)), uploaded, pending, {
    prepare: async () => assert.fail('already uploaded'), store: async () => assert.fail('duplicate upload')
  });
  const removed = await storeDraftPhotos([], new Set(), new Map(), {
    prepare: async () => assert.fail('removed photo restored'), store: async () => assert.fail('removed photo uploaded')
  });
  assert.deepEqual(removed.photos, []);
});
