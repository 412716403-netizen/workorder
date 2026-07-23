/**
 * 将开发节点 / 表单自定义上传文件条目转为资料库预览壳入参。
 */
import type { KnowledgeAttachmentInfo } from '../views/knowledge-base/knowledgeFileAttachmentExtension';
import { resolveUploadMimeType } from './knowledgeAttachment';
import type { DevStageFileItem } from './devStageFileValue';
import { resolveDevStageFileDownloadName } from './devStageFileValue';

function mimeFromDataUrl(url: string): string {
  const m = /^data:([^;,]+)/i.exec(url.trim());
  return (m?.[1] ?? '').trim().toLowerCase();
}

function estimateDataUrlBytes(url: string): number {
  const comma = url.indexOf(',');
  if (comma < 0) return 0;
  const meta = url.slice(0, comma);
  const payload = url.slice(comma + 1);
  if (/;base64/i.test(meta)) {
    const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
    return Math.max(0, Math.floor((payload.length * 3) / 4) - padding);
  }
  try {
    return decodeURIComponent(payload).length;
  } catch {
    return payload.length;
  }
}

/** DevStageFileItem → KnowledgeAttachmentInfo（供 KnowledgeFilePreviewOverlay） */
export function toKnowledgeAttachmentInfo(
  item: DevStageFileItem,
  fallbackLabel = '附件',
  index = 0,
): KnowledgeAttachmentInfo {
  const fileName = resolveDevStageFileDownloadName(item, fallbackLabel, index);
  const fromData = mimeFromDataUrl(item.url);
  const mimeType = fromData || resolveUploadMimeType(fileName, '');
  return {
    assetUrl: item.url,
    fileName,
    mimeType,
    sizeBytes: estimateDataUrlBytes(item.url),
  };
}
