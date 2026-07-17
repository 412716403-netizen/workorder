const { request } = require('../../utils/request.js');

function buildQs(params) {
  const parts = [];
  Object.keys(params || {}).forEach((key) => {
    const v = params[key];
    if (v === undefined || v === null || v === '') return;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
  });
  return parts.length ? `?${parts.join('&')}` : '';
}

function fetchKnowledgeTree() {
  return request({ path: '/knowledge-base/tree', method: 'GET' }).then((body) => ({
    folders: (body && body.folders) || [],
    documents: (body && body.documents) || [],
  }));
}

function listKnowledgeDocuments(params) {
  const qs = buildQs(params || {});
  return request({ path: `/knowledge-base/documents${qs}`, method: 'GET' }).then((body) =>
    Array.isArray(body) ? body : [],
  );
}

function getKnowledgeDocument(id) {
  if (!id) return Promise.resolve(null);
  return request({
    path: `/knowledge-base/documents/${encodeURIComponent(id)}`,
    method: 'GET',
  });
}

/**
 * 鉴权下载资料库图片资源（BYTEA），返回 ArrayBuffer + Content-Type
 * @returns {Promise<{ buffer: ArrayBuffer, mimeType: string }>}
 */
function fetchKnowledgeAssetBuffer(id) {
  if (!id) {
    return Promise.reject(new Error('缺少资源 id'));
  }
  return request({
    path: `/knowledge-base/assets/${encodeURIComponent(id)}`,
    method: 'GET',
    responseType: 'arraybuffer',
    returnFullResponse: true,
    timeout: 60000,
  }).then((res) => {
    const header = res.header || {};
    const mimeType =
      header['Content-Type'] ||
      header['content-type'] ||
      'application/octet-stream';
    return {
      buffer: res.data,
      mimeType: String(mimeType).split(';')[0].trim() || 'application/octet-stream',
    };
  });
}

function mimeToExt(mimeType) {
  const m = String(mimeType || '').toLowerCase();
  if (m.indexOf('png') >= 0) return 'png';
  if (m.indexOf('gif') >= 0) return 'gif';
  if (m.indexOf('webp') >= 0) return 'webp';
  if (m.indexOf('jpeg') >= 0 || m.indexOf('jpg') >= 0) return 'jpg';
  if (m === 'application/pdf' || m.indexOf('pdf') >= 0) return 'pdf';
  if (m.indexOf('spreadsheetml') >= 0) return 'xlsx';
  if (m === 'application/vnd.ms-excel') return 'xls';
  if (m.indexOf('wordprocessingml') >= 0) return 'docx';
  if (m === 'application/msword') return 'doc';
  if (m.indexOf('presentationml') >= 0) return 'pptx';
  if (m.indexOf('powerpoint') >= 0) return 'ppt';
  if (m.indexOf('zip') >= 0) return 'zip';
  return 'bin';
}

function extFromFileName(fileName) {
  const base = String(fileName || '')
    .trim()
    .split(/[\\/]/)
    .pop() || '';
  const i = base.lastIndexOf('.');
  if (i <= 0 || i === base.length - 1) return '';
  return base.slice(i + 1).toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * 将资源写入本地临时文件，避免 base64 塞进 setData（易超 1MB）
 * @param {string} [fileName] 可选：用扩展名写入正确后缀（openDocument 依赖）
 * @returns {Promise<string>} 本地文件路径
 */
function writeKnowledgeAssetTempFile(assetId, buffer, mimeType, fileName) {
  const id = String(assetId || 'x').replace(/[^a-zA-Z0-9_-]/g, '');
  const fromName = extFromFileName(fileName);
  const ext = fromName || mimeToExt(mimeType);
  const base =
    (typeof wx !== 'undefined' && wx.env && wx.env.USER_DATA_PATH) ||
    '';
  const filePath = `${base}/kb-asset-${id}.${ext}`;
  return new Promise((resolve, reject) => {
    if (!base || !buffer) {
      reject(new Error('无法写入临时文件'));
      return;
    }
    wx.getFileSystemManager().writeFile({
      filePath,
      data: buffer,
      success: () => resolve(filePath),
      fail: reject,
    });
  });
}

function removeKnowledgeAssetTempFiles(paths) {
  const list = Array.isArray(paths) ? paths : [];
  const fs = typeof wx !== 'undefined' ? wx.getFileSystemManager() : null;
  if (!fs) return;
  list.forEach((filePath) => {
    if (!filePath) return;
    try {
      fs.unlinkSync(filePath);
    } catch {
      // ignore
    }
  });
}

module.exports = {
  fetchKnowledgeTree,
  listKnowledgeDocuments,
  getKnowledgeDocument,
  fetchKnowledgeAssetBuffer,
  writeKnowledgeAssetTempFile,
  removeKnowledgeAssetTempFiles,
};
