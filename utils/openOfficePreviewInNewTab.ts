import { renderAsync } from 'docx-preview';
import { toast } from 'sonner';
import { fetchKnowledgeAssetBlob } from '../services/api/knowledgeBase';
import { isDocxOnlinePreviewable } from './knowledgeAttachment';
import { parseExcelPreviewFromBuffer } from './parseExcelPreview';
import type { ExcelPreviewSheetGrid } from './excelXlsGrid';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function writeHtmlDocument(win: Window, html: string) {
  win.document.open();
  win.document.write(html);
  win.document.close();
}

function loadingDocument(title: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>body{margin:24px;font-family:system-ui,-apple-system,sans-serif;color:#64748b}</style>
</head><body>正在生成预览…</body></html>`;
}

async function blobUrlToDataUrl(url: string): Promise<string> {
  if (url.startsWith('data:')) return url;
  const res = await fetch(url);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('读取图片失败'));
    reader.readAsDataURL(blob);
  });
}

/** 把网格里的 blob: 图转成 data:，便于写入独立标签页后仍可显示 */
async function hydrateGridImagesToDataUrls(sheets: ExcelPreviewSheetGrid[]): Promise<ExcelPreviewSheetGrid[]> {
  const cache = new Map<string, string>();
  const convert = async (url: string) => {
    const hit = cache.get(url);
    if (hit) return hit;
    const dataUrl = await blobUrlToDataUrl(url);
    cache.set(url, dataUrl);
    return dataUrl;
  };

  const out: ExcelPreviewSheetGrid[] = [];
  for (const sheet of sheets) {
    const rows = [];
    for (const row of sheet.rows) {
      const nextRow = [];
      for (const cell of row) {
        if (!cell) {
          nextRow.push(null);
          continue;
        }
        const images = [];
        for (const img of cell.images) {
          images.push({ ...img, url: await convert(img.url) });
        }
        nextRow.push({ ...cell, images });
      }
      rows.push(nextRow);
    }
    out.push({ ...sheet, rows });
  }
  return out;
}

function renderGridTableHtml(grid: ExcelPreviewSheetGrid): string {
  const cols = grid.colWidths
    .map((w) => `<col style="width:${w}px;min-width:${Math.min(w, 48)}px" />`)
    .join('');
  const body = grid.rows
    .map((row, r) => {
      const cells = row
        .map((cell) => {
          if (!cell) return '';
          const imgs = cell.images
            .map(
              (img) =>
                `<img src="${img.url}" alt="" style="width:${img.width}px;height:${img.height}px;display:block;object-fit:contain;margin:2px 0" />`,
            )
            .join('');
          const text = escapeHtml(cell.text);
          const cls = cell.images.length ? ' class="has-image"' : '';
          return `<td${cls} rowspan="${cell.rowSpan}" colspan="${cell.colSpan}">${imgs}${text}</td>`;
        })
        .join('');
      return `<tr style="height:${grid.rowHeights[r]}px">${cells}</tr>`;
    })
    .join('');
  return `<table class="grid"><colgroup>${cols}</colgroup><tbody>${body}</tbody></table>`;
}

async function buildDocxHtml(blob: Blob, title: string): Promise<string> {
  const body = document.createElement('div');
  const styleHost = document.createElement('div');
  await renderAsync(blob, body, styleHost, {
    className: 'kb-docx',
    inWrapper: true,
    breakPages: true,
    renderHeaders: true,
    renderFooters: true,
    renderFootnotes: true,
    renderEndnotes: true,
    useBase64URL: true,
  });

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
  body { margin: 0; background: #e5e7eb; font-family: system-ui, -apple-system, sans-serif; }
  .kb-docx-wrapper { padding: 24px 0; display: flex; flex-direction: column; align-items: center; gap: 16px; }
  .kb-docx { background: #fff; box-shadow: 0 4px 24px rgba(15,23,42,.12); }
  .kb-docx img, .kb-docx image { max-width: 100%; }
</style>
${styleHost.innerHTML}
</head><body>${body.innerHTML}</body></html>`;
}

async function buildExcelHtml(buffer: ArrayBuffer, title: string): Promise<string> {
  const objectUrls: string[] = [];
  try {
    const parsed = await parseExcelPreviewFromBuffer(buffer, (url) => objectUrls.push(url));

    let panels: string;
    if (parsed.mode === 'html') {
      panels = parsed.sheets
        .map(
          (sheet, i) =>
            `<section class="panel${i === 0 ? ' active' : ''}" data-i="${i}">${sheet.html}</section>`,
        )
        .join('');
    } else {
      const sheets = await hydrateGridImagesToDataUrls(parsed.sheets);
      panels = sheets
        .map(
          (sheet, i) =>
            `<section class="panel${i === 0 ? ' active' : ''}" data-i="${i}">${renderGridTableHtml(sheet)}</section>`,
        )
        .join('');
    }

    const names = parsed.sheets.map((s) => s.name);
    const tabs = names
      .map((name, i) => {
        const safe = escapeHtml(name || `Sheet${i + 1}`);
        return `<button type="button" class="tab${i === 0 ? ' active' : ''}" data-i="${i}">${safe}</button>`;
      })
      .join('');

    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; background: #f8fafc; font-family: system-ui, -apple-system, sans-serif; color: #0f172a; }
  .bar { position: sticky; top: 0; z-index: 2; display: flex; flex-wrap: wrap; gap: 6px; padding: 10px 12px;
    background: #fff; border-bottom: 1px solid #e2e8f0; }
  .tab { border: 1px solid #e2e8f0; background: #f8fafc; color: #475569; border-radius: 999px;
    padding: 4px 12px; font-size: 12px; font-weight: 600; cursor: pointer; }
  .tab.active { background: #eef2ff; border-color: #c7d2fe; color: #4338ca; }
  .panel { display: none; padding: 16px; overflow: auto; }
  .panel.active { display: block; }
  table { border-collapse: collapse; background: #fff; font-size: 12px; }
  td, th { border: 1px solid #e2e8f0; padding: 4px 8px; white-space: pre-wrap; vertical-align: top; }
  td.has-image { min-width: 80px; }
</style>
</head><body>
  <div class="bar">${tabs}</div>
  ${panels}
  <script>
    document.querySelectorAll('.tab').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var i = btn.getAttribute('data-i');
        document.querySelectorAll('.tab').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-i') === i); });
        document.querySelectorAll('.panel').forEach(function (p) { p.classList.toggle('active', p.getAttribute('data-i') === i); });
      });
    });
  </script>
</body></html>`;
  } finally {
    for (const url of objectUrls) URL.revokeObjectURL(url);
  }
}

/**
 * Excel / Word 无法被浏览器直接渲染（会变成下载），
 * 因此先同步打开空白页，再把解析后的 HTML 预览写入新标签。
 */
export function openOfficePreviewInNewTab(
  assetUrl: string,
  kind: 'excel' | 'word',
  opts?: { mimeType?: string; fileName?: string },
): void {
  const title = (opts?.fileName || '').trim() || (kind === 'excel' ? 'Excel 预览' : 'Word 预览');
  const win = window.open('about:blank', '_blank');
  if (!win) {
    toast.error('无法打开新窗口，请检查浏览器是否拦截了弹窗');
    return;
  }
  try {
    win.opener = null;
  } catch {
    /* ignore */
  }
  writeHtmlDocument(win, loadingDocument(title));

  void (async () => {
    try {
      if (kind === 'word') {
        if (!isDocxOnlinePreviewable(opts?.mimeType ?? '', opts?.fileName)) {
          writeHtmlDocument(
            win,
            `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>
<body style="font-family:system-ui;margin:24px;color:#64748b">
旧版 .doc 暂不支持在线预览，请下载后用 Word 打开，或另存为 .docx 后重新上传。
</body></html>`,
          );
          return;
        }
        const blob = await fetchKnowledgeAssetBlob(assetUrl);
        writeHtmlDocument(win, await buildDocxHtml(blob, title));
        return;
      }

      const blob = await fetchKnowledgeAssetBlob(assetUrl);
      writeHtmlDocument(win, await buildExcelHtml(await blob.arrayBuffer(), title));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '预览失败';
      writeHtmlDocument(
        win,
        `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>
<body style="font-family:system-ui;margin:24px;color:#b91c1c">${escapeHtml(msg)}</body></html>`,
      );
    }
  })();
}
