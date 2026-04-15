/** 标准生产路线 / 报工页展示：多附件存 JSON 数组，兼容历史单条 data URL */

export function getFileExtFromDataUrl(dataUrl: string): string {
  const m = dataUrl.match(/^data:([^;]+);/);
  if (!m) return 'bin';
  const map: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'application/pdf': 'pdf',
  };
  return map[m[1]] || 'bin';
}

export function parseRouteReportFileUrls(val: string): string[] {
  if (!val) return [];
  const s = val.trim();
  if (s.startsWith('[')) {
    try {
      const arr = JSON.parse(s) as unknown;
      if (Array.isArray(arr)) return arr.filter((x): x is string => typeof x === 'string' && x.startsWith('data:'));
    } catch {
      return [];
    }
  }
  if (s.startsWith('data:')) return [val];
  return [];
}

export function stringifyRouteReportFileUrls(urls: string[]): string {
  return urls.length === 0 ? '' : JSON.stringify(urls);
}

/** 将 data URL 转为 Blob URL，便于在 iframe 中预览 PDF（部分浏览器禁止 data: PDF） */
export function dataUrlToBlobUrl(dataUrl: string): { url: string; revoke: () => void } | null {
  try {
    const comma = dataUrl.indexOf(',');
    if (comma < 0 || !dataUrl.startsWith('data:')) return null;
    const header = dataUrl.slice(0, comma);
    const body = dataUrl.slice(comma + 1);
    const isBase64 = /;base64/i.test(header);
    const mimeMatch = header.match(/data:([^;,]+)/);
    const mime = mimeMatch?.[1] || 'application/octet-stream';
    let bytes: Uint8Array;
    if (isBase64) {
      const binary = atob(body);
      bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    } else {
      bytes = new TextEncoder().encode(decodeURIComponent(body));
    }
    const blob = new Blob([bytes], { type: mime });
    const url = URL.createObjectURL(blob);
    return { url, revoke: () => URL.revokeObjectURL(url) };
  } catch {
    return null;
  }
}
