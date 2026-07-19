/** 资料库附件：类型判定与展示格式化（纯函数，供卡片与预览壳共用） */

export type KnowledgeAttachmentKind = 'excel' | 'pdf' | 'image' | 'video' | 'word' | 'other';

/** 视频在正文中的展示方式：标签卡片 / 内嵌播放器 */
export type KnowledgeAttachmentDisplayMode = 'tag' | 'player';

const EXCEL_MIME = new Set([
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

const WORD_MIME = new Set([
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

/** 可在线预览的图片 MIME（不含 SVG，避免作为 img 渲染带来 XSS 风险） */
const PREVIEWABLE_IMAGE_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
]);

/** 浏览器可直接播放的常见视频 MIME */
const PREVIEWABLE_VIDEO_MIME = new Set([
  'video/mp4',
  'video/webm',
  'video/ogg',
  'video/quicktime',
]);

const VIDEO_EXTS = new Set(['mp4', 'webm', 'ogg', 'ogv', 'mov', 'm4v']);

const EXT_TO_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  mp4: 'video/mp4',
  webm: 'video/webm',
  ogg: 'video/ogg',
  ogv: 'video/ogg',
  mov: 'video/quicktime',
  m4v: 'video/mp4',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  zip: 'application/zip',
  rar: 'application/vnd.rar',
  txt: 'text/plain',
  csv: 'text/csv',
  dwg: 'application/acad',
};

/** 从文件名取扩展名（小写、无点）；无则空串 */
export function getFileExtension(fileName?: string): string {
  const base = (fileName || '').trim().split(/[\\/]/).pop() ?? '';
  const i = base.lastIndexOf('.');
  if (i <= 0 || i === base.length - 1) return '';
  return base.slice(i + 1).toLowerCase();
}

/** 根据 MIME（必要时回退到文件名后缀）判定附件可预览类型 */
export function resolveAttachmentKind(mimeType: string, fileName?: string): KnowledgeAttachmentKind {
  const mime = (mimeType || '').toLowerCase();
  if (mime === 'application/pdf') return 'pdf';
  if (EXCEL_MIME.has(mime)) return 'excel';
  if (WORD_MIME.has(mime) || mime.includes('wordprocessingml')) return 'word';
  if (PREVIEWABLE_IMAGE_MIME.has(mime)) return 'image';
  if (PREVIEWABLE_VIDEO_MIME.has(mime) || mime.startsWith('video/')) return 'video';

  const ext = getFileExtension(fileName);
  if (ext === 'pdf') return 'pdf';
  if (ext === 'xlsx' || ext === 'xls') return 'excel';
  if (ext === 'docx' || ext === 'doc') return 'word';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) return 'image';
  if (VIDEO_EXTS.has(ext)) return 'video';
  return 'other';
}

/**
 * 是否可用浏览器在线预览：仅 .docx（OOXML）。
 * 旧版 .doc 二进制格式浏览器端无法可靠解析。
 */
export function isDocxOnlinePreviewable(mimeType: string, fileName?: string): boolean {
  if (resolveAttachmentKind(mimeType, fileName) !== 'word') return false;
  const ext = getFileExtension(fileName);
  if (ext === 'docx') return true;
  if (ext === 'doc') return false;
  const mime = (mimeType || '').toLowerCase();
  return mime.includes('wordprocessingml');
}

/** 规范化展示模式；非视频强制 tag */
export function normalizeAttachmentDisplayMode(
  mode: unknown,
  mimeType: string,
  fileName?: string,
): KnowledgeAttachmentDisplayMode {
  if (resolveAttachmentKind(mimeType, fileName) !== 'video') return 'tag';
  return mode === 'player' ? 'player' : 'tag';
}

/**
 * 解析上传文件的 MIME：优先取浏览器给的 `file.type`，
 * 为空时按扩展名兜底；仍未知则用 `application/octet-stream`（任意文件均可上传）。
 */
export function resolveUploadMimeType(fileName: string, fileType: string): string {
  const type = (fileType || '').trim().toLowerCase();
  if (type) return type;
  const ext = getFileExtension(fileName);
  return EXT_TO_MIME[ext] ?? 'application/octet-stream';
}

/** 「.dwg 文件类型无法预览」类文案；无扩展名时用通用句 */
export function formatUnpreviewableMessage(fileName?: string): string {
  const ext = getFileExtension(fileName);
  return ext ? `.${ext} 文件类型无法预览` : '该文件类型无法预览';
}

/** 人类可读文件大小：347.09KB / 24.81MB */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIdx = 0;
  while (value >= 1024 && unitIdx < units.length - 1) {
    value /= 1024;
    unitIdx += 1;
  }
  const rounded = unitIdx === 0 ? String(Math.round(value)) : value.toFixed(2);
  return `${rounded}${units[unitIdx]}`;
}
