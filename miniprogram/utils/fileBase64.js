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

function chooseProductImageAsDataUrl() {
  return new Promise((resolve, reject) => {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: async (res) => {
        try {
          const file = (res.tempFiles && res.tempFiles[0]) || null;
          if (!file || !file.tempFilePath) {
            resolve(null);
            return;
          }
          assertFileSize(file.size);
          const mime = guessMime(file.tempFilePath, file.fileType === 'png' ? 'png' : 'image');
          const dataUrl = await readFileAsDataUrl(file.tempFilePath, mime);
          resolve(dataUrl);
        } catch (err) {
          reject(err);
        }
      },
      fail: (err) => {
        if (err && err.errMsg && err.errMsg.indexOf('cancel') >= 0) {
          resolve(null);
          return;
        }
        reject(err);
      },
    });
  });
}

function chooseMessageFileAsDataUrl() {
  return new Promise((resolve, reject) => {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'doc', 'docx', 'xls', 'xlsx'],
      success: async (res) => {
        try {
          const file = (res.tempFiles && res.tempFiles[0]) || null;
          if (!file || !file.path) {
            resolve(null);
            return;
          }
          assertFileSize(file.size);
          const mime = guessMime(file.name || file.path);
          const dataUrl = await readFileAsDataUrl(file.path, mime);
          resolve(dataUrl);
        } catch (err) {
          reject(err);
        }
      },
      fail: (err) => {
        if (err && err.errMsg && err.errMsg.indexOf('cancel') >= 0) {
          resolve(null);
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
  return new Promise((resolve, reject) => {
    wx.showActionSheet({
      itemList: ['拍照或相册', '从聊天选择文件'],
      success: async (sheetRes) => {
        try {
          if (sheetRes.tapIndex === 0) {
            resolve(await chooseProductImageAsDataUrl());
            return;
          }
          resolve(await chooseMessageFileAsDataUrl());
        } catch (err) {
          reject(err);
        }
      },
      fail: (err) => {
        if (err && err.errMsg && err.errMsg.indexOf('cancel') >= 0) {
          resolve(null);
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
  chooseProductImageAsDataUrl,
  chooseMessageFileAsDataUrl,
  chooseCustomFieldFileAsDataUrl,
  formatCustomFileLabel,
  isImageDataUrl,
};
