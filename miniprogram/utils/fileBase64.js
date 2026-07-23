/**
 * 选图/选文件转 base64 data URL（对齐 Web 自定义 file 字段存法）
 */

const MAX_CUSTOM_FILE_BYTES = 4 * 1024 * 1024;

function guessMime(filePath, hint) {
  if (hint && typeof hint === 'string' && hint.indexOf('/') > 0) return hint;
  const lower = String(filePath || '').toLowerCase();
  if (/\.png$/i.test(lower)) return 'image/png';
  if (/\.gif$/i.test(lower)) return 'image/gif';
  if (/\.webp$/i.test(lower)) return 'image/webp';
  if (/\.jpe?g$/i.test(lower)) return 'image/jpeg';
  if (/\.pdf$/i.test(lower)) return 'application/pdf';
  if (/\.docx$/i.test(lower)) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  if (/\.doc$/i.test(lower)) return 'application/msword';
  if (/\.xlsx$/i.test(lower)) {
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  }
  if (/\.xls$/i.test(lower)) return 'application/vnd.ms-excel';
  if (hint === 'image' || hint === 'png') return hint === 'png' ? 'image/png' : 'image/jpeg';
  return 'application/octet-stream';
}

function readFileAsDataUrl(filePath, mimeType) {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath,
      encoding: 'base64',
      success: (res) => {
        const mime = mimeType || 'application/octet-stream';
        resolve(`data:${mime};base64,${res.data}`);
      },
      fail: reject,
    });
  });
}

function assertFileSize(size) {
  if (size != null && Number(size) > MAX_CUSTOM_FILE_BYTES) {
    const err = new Error('FILE_TOO_LARGE');
    err.code = 'FILE_TOO_LARGE';
    throw err;
  }
}

function chooseProductImage(options) {
  const maxCount = Math.max(1, Math.min(9, (options && options.count) || 1));
  return new Promise((resolve, reject) => {
    wx.chooseMedia({
      count: maxCount,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: async (res) => {
        try {
          const files = (res.tempFiles || []).filter((f) => f && f.tempFilePath);
          if (!files.length) {
            resolve(maxCount > 1 ? [] : null);
            return;
          }
          const results = [];
          for (let i = 0; i < files.length; i += 1) {
            const file = files[i];
            assertFileSize(file.size);
            const mime = guessMime(file.tempFilePath, file.fileType === 'png' ? 'png' : 'image');
            const dataUrl = await readFileAsDataUrl(file.tempFilePath, mime);
            results.push({
              dataUrl,
              tempFilePath: file.tempFilePath,
              size: file.size,
            });
          }
          resolve(maxCount > 1 ? results : results[0] || null);
        } catch (err) {
          reject(err);
        }
      },
      fail: (err) => {
        if (err && err.errMsg && err.errMsg.indexOf('cancel') >= 0) {
          resolve(maxCount > 1 ? [] : null);
          return;
        }
        reject(err);
      },
    });
  });
}

function chooseProductImageAsDataUrl() {
  return chooseProductImage({ count: 1 }).then((picked) => (picked ? picked.dataUrl : null));
}

function chooseProductImages(maxCount) {
  return chooseProductImage({ count: maxCount || 9 }).then((picked) =>
    Array.isArray(picked) ? picked : picked ? [picked] : [],
  );
}

function chooseMessageFileAsDataUrl() {
  return chooseMessageFiles(1).then((list) => (list[0] ? list[0].dataUrl : null));
}

/**
 * 从聊天选取多个文件（不限类型，对齐 Web 开发节点 file 字段）
 * @returns {Promise<Array<{dataUrl:string,tempFilePath:string,size?:number,name?:string}>>}
 */
function chooseMessageFiles(maxCount) {
  const count = Math.max(1, Math.min(9, maxCount || 1));
  return new Promise((resolve, reject) => {
    wx.chooseMessageFile({
      count,
      type: 'all',
      success: async (res) => {
        try {
          const files = (res.tempFiles || []).filter((f) => f && f.path);
          if (!files.length) {
            resolve([]);
            return;
          }
          const results = [];
          for (let i = 0; i < files.length; i += 1) {
            const file = files[i];
            assertFileSize(file.size);
            const mime = guessMime(file.name || file.path, file.type);
            const dataUrl = await readFileAsDataUrl(file.path, mime);
            results.push({
              dataUrl,
              tempFilePath: file.path,
              size: file.size,
              name: file.name || '',
            });
          }
          resolve(results);
        } catch (err) {
          reject(err);
        }
      },
      fail: (err) => {
        if (err && err.errMsg && err.errMsg.indexOf('cancel') >= 0) {
          resolve([]);
          return;
        }
        reject(err);
      },
    });
  });
}

/**
 * 自定义内容 file 字段：图片（相册/拍照）或从聊天选取文件（对齐 Web image/pdf/office）
 * @returns {Promise<string|null>} data URL 或取消时 null
 */
function chooseCustomFieldFileAsDataUrl() {
  return chooseCustomFieldFiles(1).then((list) => (list[0] ? list[0].dataUrl : null));
}

/**
 * 开发节点等多文件字段：相册多选 或 聊天文件多选
 * @returns {Promise<Array<{dataUrl:string,tempFilePath:string,size?:number,name?:string}>>}
 */
function chooseCustomFieldFiles(maxCount) {
  const count = Math.max(1, Math.min(9, maxCount || 9));
  return new Promise((resolve, reject) => {
    wx.showActionSheet({
      itemList: ['拍照或相册（可多选）', '从聊天选择文件（可多选）'],
      success: async (sheetRes) => {
        try {
          if (sheetRes.tapIndex === 0) {
            resolve(await chooseProductImages(count));
            return;
          }
          resolve(await chooseMessageFiles(count));
        } catch (err) {
          reject(err);
        }
      },
      fail: (err) => {
        if (err && err.errMsg && err.errMsg.indexOf('cancel') >= 0) {
          resolve([]);
          return;
        }
        reject(err);
      },
    });
  });
}

function formatCustomFileLabel(dataUrl) {
  const s = String(dataUrl || '');
  if (!s || s.indexOf('data:') !== 0) return '';
  if (s.indexOf('data:image/') === 0) return '图片';
  if (s.indexOf('data:application/pdf') === 0) return 'PDF';
  return '已上传附件';
}

function isImageDataUrl(dataUrl) {
  return typeof dataUrl === 'string' && dataUrl.indexOf('data:image/') === 0;
}

module.exports = {
  MAX_CUSTOM_FILE_BYTES,
  guessMime,
  readFileAsDataUrl,
  chooseProductImage,
  chooseProductImages,
  chooseProductImageAsDataUrl,
  chooseMessageFileAsDataUrl,
  chooseMessageFiles,
  chooseCustomFieldFileAsDataUrl,
  chooseCustomFieldFiles,
  formatCustomFileLabel,
  isImageDataUrl,
};
