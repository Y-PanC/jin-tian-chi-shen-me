let database;
function openDatabase() {
  if (!database) database = new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error('当前浏览器暂时无法保存照片，请允许网站存储后重试')); return; }
    const request = indexedDB.open('meal_journal_media_v2', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('photos', { keyPath: 'id' });
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); database = undefined; };
      resolve(db);
    };
    request.onerror = () => reject(new Error('照片存储未能打开，请检查浏览器的网站存储设置'));
    request.onblocked = () => reject(new Error('请关闭其他旧版页面后，再试一次照片保存'));
  }).catch(error => { database = undefined; throw error; });
  return database;
}
async function changePhotos(mode, callback) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('photos', mode);
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(new Error('照片未能保存，请检查可用存储空间后重试'));
    callback(tx.objectStore('photos'));
  });
}
export async function putPhotos(photos) {
  if (globalThis.MealCloud?.active) return globalThis.MealCloud.putPhotos(photos);
  if (photos.length) await changePhotos('readwrite', store => photos.forEach(photo => store.put(photo)));
}
export async function removePhotos(ids) {
  if (globalThis.MealCloud?.active) return globalThis.MealCloud.removePhotos(ids);
  if (ids.length) await changePhotos('readwrite', store => ids.forEach(id => store.delete(id)));
}
export async function readPhoto(id) {
  if (globalThis.MealCloud?.active) return globalThis.MealCloud.readPhoto(id);
  return readLocalPhoto(id);
}
export async function readLocalPhoto(id) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction('photos').objectStore('photos').get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(new Error('照片暂时无法读取，请稍后再试'));
  });
}
export async function preparePhoto(file) {
  if (!file.type.startsWith('image/')) throw new Error('请选择图片文件');
  if (file.size > 12 * 1024 * 1024) throw new Error('每张照片请小于 12 MB');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = url;
    await image.decode();
    const ratio = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * ratio));
    const height = Math.max(1, Math.round(image.naturalHeight * ratio));
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    canvas.getContext('2d').drawImage(image, 0, 0, width, height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .86));
    if (!blob) throw new Error('无法处理这张照片');
    return { id: crypto.randomUUID(), name: file.name, mimeType: blob.type, size: blob.size, width, height, blob };
  } catch { throw new Error('这张照片暂时无法打开，请换一张 JPG、PNG 或其他浏览器支持的图片'); }
  finally { URL.revokeObjectURL(url); }
}
