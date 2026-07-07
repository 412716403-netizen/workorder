/**
 * 小程序选图转 base64 data URL（对齐 Web 产品主图 imageUrl 存法）
 */

function readFileAsDataUrl(filePath, mimeType) {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath,
      encoding: 'base64',
      success: (res) => {
        const mime = mimeType || 'image/jpeg';
        resolve(`data:${mime};base64,${res.data}`);
      },
      fail: reject,
    });
  });
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
          const mime = file.fileType === 'png' ? 'image/png' : 'image/jpeg';
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

module.exports = {
  readFileAsDataUrl,
  chooseProductImageAsDataUrl,
};
