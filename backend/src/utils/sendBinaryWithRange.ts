import type { Request, Response } from 'express';

export type BinaryRangeBody = {
  mimeType: string;
  fileName: string;
  data: Buffer;
  /** 强制下载（Content-Disposition: attachment） */
  asDownload?: boolean;
  cacheControl?: string;
};

/** 解析 `bytes=start-end`；非法或缺省时返回 null */
export function parseBytesRangeHeader(
  rangeHeader: string | undefined,
  totalSize: number,
): { start: number; end: number } | null {
  if (!rangeHeader || totalSize <= 0) return null;
  const m = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
  if (!m) return null;
  const startRaw = m[1] ?? '';
  const endRaw = m[2] ?? '';
  let start: number;
  let end: number;
  if (startRaw === '' && endRaw === '') return null;
  if (startRaw === '') {
    const suffix = Number(endRaw);
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    start = Math.max(0, totalSize - suffix);
    end = totalSize - 1;
  } else {
    start = Number(startRaw);
    end = endRaw === '' ? totalSize - 1 : Number(endRaw);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start) return null;
    if (start >= totalSize) return null;
    end = Math.min(end, totalSize - 1);
  }
  return { start, end };
}

function contentDisposition(fileName: string, asDownload: boolean): string {
  const disposition = asDownload ? 'attachment' : 'inline';
  const name = fileName.trim() || 'file';
  const asciiName = name.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(name);
  return `${disposition}; filename="${asciiName}"; filename*=UTF-8''${encoded}`;
}

/** 以二进制响应写出，并支持 HTTP Range（视频拖动进度） */
export function sendBinaryWithRange(req: Request, res: Response, body: BinaryRangeBody): void {
  const total = body.data.length;
  const cacheControl = body.cacheControl ?? 'private, max-age=3600';
  res.setHeader('Content-Type', body.mimeType || 'application/octet-stream');
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', cacheControl);
  res.setHeader('Content-Disposition', contentDisposition(body.fileName, body.asDownload === true));

  const range = parseBytesRangeHeader(
    typeof req.headers.range === 'string' ? req.headers.range : undefined,
    total,
  );

  if (!range) {
    res.status(200);
    res.setHeader('Content-Length', total);
    res.end(body.data);
    return;
  }

  const { start, end } = range;
  const chunk = body.data.subarray(start, end + 1);
  res.status(206);
  res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
  res.setHeader('Content-Length', chunk.length);
  res.end(chunk);
}
