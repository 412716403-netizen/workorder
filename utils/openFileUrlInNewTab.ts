import { toast } from 'sonner';
import { resolveAttachmentKind, type KnowledgeAttachmentKind } from './knowledgeAttachment';
import { dataUrlToBlobUrl } from './routeReportFileUrls';
import { openOfficePreviewInNewTab } from './openOfficePreviewInNewTab';

export type OpenFileInTabOptions = {
  mimeType?: string;
  fileName?: string;
};

function resolveKind(url: string, opts?: OpenFileInTabOptions): KnowledgeAttachmentKind {
  const mime = opts?.mimeType ?? '';
  const name = opts?.fileName ?? '';
  if (mime || name) return resolveAttachmentKind(mime, name);

  // 无元数据时从 URL 路径猜扩展名（data: 则从 mime 段猜）
  if (url.startsWith('data:')) {
    const m = url.slice(5).split(';', 1)[0]?.toLowerCase() ?? '';
    return resolveAttachmentKind(m, '');
  }
  try {
    const path = url.startsWith('blob:') ? '' : new URL(url, window.location.origin).pathname;
    const base = path.split('/').pop() ?? '';
    return resolveAttachmentKind('', base);
  } catch {
    return 'other';
  }
}

/**
 * 在浏览器新标签打开文件 URL。
 * - PDF/图片等：直接打开（data: 先转 blob:）
 * - Excel/Word：浏览器会下载原文件，改为写入 HTML 预览页
 */
export function openFileUrlInNewTab(url: string, opts?: OpenFileInTabOptions): (() => void) | null {
  const raw = (url ?? '').trim();
  if (!raw) {
    toast.error('无法打开：文件地址为空');
    return null;
  }

  const kind = resolveKind(raw, opts);
  if (kind === 'excel' || kind === 'word') {
    openOfficePreviewInNewTab(raw, kind, opts);
    return null;
  }

  let openUrl = raw;
  let revoke: (() => void) | undefined;

  if (raw.startsWith('data:')) {
    const conv = dataUrlToBlobUrl(raw);
    if (!conv) {
      toast.error('无法打开：文件解析失败');
      return null;
    }
    openUrl = conv.url;
    revoke = conv.revoke;
  }

  // 不要带 noopener 特性串：部分浏览器会因此让 window.open 恒返回 null
  const win = window.open(openUrl, '_blank');
  if (!win) {
    revoke?.();
    toast.error('无法打开新窗口，请检查浏览器是否拦截了弹窗');
    return null;
  }
  try {
    win.opener = null;
  } catch {
    /* ignore */
  }

  if (revoke) {
    window.setTimeout(revoke, 60_000);
    return revoke;
  }
  return null;
}
