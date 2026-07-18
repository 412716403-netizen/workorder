/** 资料库附件：小程序端类型判定与展示（对齐 Web utils/knowledgeAttachment） */

const OPEN_DOCUMENT_EXTS = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'pdf'];

const PREVIEWABLE_IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp']);
const VIDEO_EXTS = new Set(['mp4', 'webm', 'ogg', 'ogv', 'mov', 'm4v']);

function getFileExtension(fileName) {
  const base = String(fileName || '')
    .trim()
    .split(/[\\/]/)
    .pop() || '';
  const i = base.lastIndexOf('.');
  if (i <= 0 || i === base.length - 1) return '';
  return base.slice(i + 1).toLowerCase();
}

function formatFileSize(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return '0B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = n;
  let unitIdx = 0;
  while (value >= 1024 && unitIdx < units.length - 1) {
    value /= 1024;
    unitIdx += 1;
  }
  const rounded = unitIdx === 0 ? String(Math.round(value)) : value.toFixed(2);
  return `${rounded}${units[unitIdx]}`;
}

/**
 * @returns {'excel'|'pdf'|'image'|'video'|'office'|'other'}
 * office = Word/PPT（小程序 openDocument 可开，非表格/PDF 专属预览）
 */
function resolveAttachmentKind(mimeType, fileName) {
  const mime = String(mimeType || '').toLowerCase();
  const ext = getFileExtension(fileName);

  if (mime === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (
    mime.indexOf('spreadsheet') >= 0 ||
    mime === 'application/vnd.ms-excel' ||
    ext === 'xlsx' ||
    ext === 'xls'
  ) {
    return 'excel';
  }
  if (
    (mime.indexOf('image/') === 0 && mime.indexOf('svg') < 0) ||
    PREVIEWABLE_IMAGE_EXT.has(ext)
  ) {
    return 'image';
  }
  if (mime.indexOf('video/') === 0 || VIDEO_EXTS.has(ext)) {
    return 'video';
  }
  if (
    mime.indexOf('word') >= 0 ||
    mime.indexOf('presentation') >= 0 ||
    mime.indexOf('powerpoint') >= 0 ||
    ['doc', 'docx', 'ppt', 'pptx'].indexOf(ext) >= 0
  ) {
    return 'office';
  }
  return 'other';
}

/** 视频：tag 标签卡片 / player 内嵌窗口；非视频强制 tag */
function normalizeAttachmentDisplayMode(mode, mimeType, fileName) {
  if (resolveAttachmentKind(mimeType, fileName) !== 'video') return 'tag';
  return mode === 'player' ? 'player' : 'tag';
}

/** wx.openDocument 的 fileType；不支持则 null */
function resolveOpenDocumentFileType(fileName, mimeType) {
  const ext = getFileExtension(fileName);
  if (OPEN_DOCUMENT_EXTS.indexOf(ext) >= 0) return ext;

  const mime = String(mimeType || '').toLowerCase();
  if (mime === 'application/pdf') return 'pdf';
  if (mime.indexOf('spreadsheetml') >= 0) return 'xlsx';
  if (mime === 'application/vnd.ms-excel') return 'xls';
  if (mime.indexOf('wordprocessingml') >= 0) return 'docx';
  if (mime === 'application/msword') return 'doc';
  if (mime.indexOf('presentationml') >= 0) return 'pptx';
  if (mime.indexOf('powerpoint') >= 0) return 'ppt';
  return null;
}

function formatUnpreviewableMessage(fileName) {
  const ext = getFileExtension(fileName);
  return ext ? `.${ext} 文件类型无法预览` : '该文件类型无法预览';
}

/** 卡片角标文案 */
function resolveAttachmentKindLabel(kind) {
  if (kind === 'pdf') return 'PDF';
  if (kind === 'excel') return 'XLS';
  if (kind === 'image') return 'IMG';
  if (kind === 'video') return 'VID';
  if (kind === 'office') return 'DOC';
  return 'FILE';
}

module.exports = {
  getFileExtension,
  formatFileSize,
  resolveAttachmentKind,
  normalizeAttachmentDisplayMode,
  resolveOpenDocumentFileType,
  formatUnpreviewableMessage,
  resolveAttachmentKindLabel,
  OPEN_DOCUMENT_EXTS,
};
