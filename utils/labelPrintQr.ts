import type { PrintQRCodeElementConfig, PrintRenderContext, PrintTemplate, PrintTextElementConfig } from '../types';
import { getQrCells } from './qrcodegen';
import { resolvePrintPlaceholders } from './printResolve';

export function resolveLabelQrPayload(contentTemplate: string, ctx: PrintRenderContext): string {
  const raw = resolvePrintPlaceholders(contentTemplate, ctx) || '-';
  return raw.length > 2000 ? raw.slice(0, 2000) : raw;
}

export function collectLabelQrPayloads(template: PrintTemplate, pageContexts: PrintRenderContext[]): string[] {
  const values = new Set<string>();
  const sorted = [...template.elements].sort((a, b) => a.zIndex - b.zIndex);
  for (const pageCtx of pageContexts) {
    for (const el of sorted) {
      if (el.type === 'qrcode') {
        const c = el.config as PrintQRCodeElementConfig;
        values.add(resolveLabelQrPayload(c.content, pageCtx));
      }
      if (el.type === 'text') {
        const c = el.config as PrintTextElementConfig;
        if (c.renderAsQr) {
          values.add(resolveLabelQrPayload(c.content, pageCtx));
        }
      }
    }
  }
  return [...values];
}

/**
 * 解析二维码模块矩阵，按 value 缓存（重复值零成本），用与 PrintPaper 相同的
 * qrcodegen 编码器，保证矢量绘制图案与浏览器打印完全一致。
 */
export function resolveQrCells(value: string, cache: Map<string, boolean[][]>): boolean[][] {
  const payload = value.length > 2000 ? value.slice(0, 2000) : value || '-';
  let cells = cache.get(payload);
  if (!cells) {
    cells = getQrCells(payload);
    cache.set(payload, cells);
  }
  return cells;
}
