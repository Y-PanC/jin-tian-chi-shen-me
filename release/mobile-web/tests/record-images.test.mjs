import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { findRecordImage, storedRecordImage } from '../dist/assets/record-images.js';
import { recommendationToDraft } from '../dist/assets/recommendation-meal.js';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const catalog = [...JSON.parse(await read('../dist/assets/data/menu.json')), ...JSON.parse(await read('../dist/assets/data/record-images.json'))];
const seed = JSON.parse((await read('../dist/assets/data/meal-seed-v3.js')).split('=').slice(1).join('=').trim().replace(/;$/, ''));

test('all original imported meal names resolve to local, real reference photos', async () => {
  for (const record of seed) {
    const image = findRecordImage(record, catalog);
    assert(image, record.dish_name);
    assert.equal(image.imageKind, 'photo');
    assert((await stat(new URL('../dist/' + image.image, import.meta.url))).size > 1000);
    assert(image.imageSourceKind === 'workbook' ? image.imageSourceLabel : image.imageSourceUrl && image.imageAuthor && image.imageLicense, record.dish_name);
  }
});

test('personal photos remain first choice and unrelated text does not get a guessed image', () => {
  const record = { dishes: ['桂林卤菜粉'], photos: [{ id: 'personal-photo' }] };
  const original = structuredClone(record);
  assert.equal(findRecordImage(record, catalog), null);
  assert.equal(storedRecordImage({ name: 'web-r01.jpg' }, catalog).id, 'r01');
  assert.equal(storedRecordImage({ name: 'my-camera-photo.jpg' }, catalog), null);
  assert.deepEqual(record, original);
  for (const dish of ['出餐快', '不知名新菜', '']) assert.equal(findRecordImage({ dish }, catalog), null);
});

test('aliases and multi-dish meals match known foods while record details remain intact', () => {
  const record = { dishes: ['米饭', '黄焖鸡米饭'], remarks: '少酱', tags: ['偏咸'] };
  const before = structuredClone(record);
  assert.equal(findRecordImage(record, catalog).id, 'r01');
  assert.equal(findRecordImage({ dish: '番茄炒蛋' }, catalog).id, 'record-tomato-egg');
  assert.equal(findRecordImage({ dish: '炸鸡', item_id: 'r06' }, catalog).id, 'record-fried-chicken');
  const image = findRecordImage({ dish_name: '桂林卤菜粉' }, catalog);
  assert.equal(recommendationToDraft(image, '2026-10-27T12:00').photos[0].catalogImage, image.image);
  assert.deepEqual(record, before);
});

test('non-photo assets and external paths cannot be used as record photos', () => {
  for (const image of ['https://example.com/meal.jpg', '../private.jpg', 'assets/images/dishes/unavailable.svg']) {
    assert.equal(findRecordImage({ dish:'test' }, [{ dish:'test', imageKind:'photo', image }]), null);
  }
});
