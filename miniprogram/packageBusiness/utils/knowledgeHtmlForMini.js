/** 资料库正文 → 小程序可渲染块（纯函数，便于单测） */

const ASSET_URL_RE = /\/api\/knowledge-base\/assets\/([a-zA-Z0-9_-]+)/g;
const PRODUCT_REF_RE =
  /<span\b[^>]*\bdata-type=(["'])product-ref\1[^>]*>[\s\S]*?<\/span>/gi;
const TABLE_RE = /<table\b[\s\S]*?<\/table>/gi;
const BLOCKQUOTE_RE = /<blockquote\b[\s\S]*?<\/blockquote>/gi;
const TOP_BLOCK_RE = /<(table|blockquote)\b[\s\S]*?<\/\1>/gi;
const IMG_RE = /<img\b[^>]*>/gi;

const TABLE_STYLE =
  'border-collapse:collapse;width:max-content;min-width:100%;border:1px solid #cbd5e1;table-layout:auto;';
const CELL_STYLE =
  'border:1px solid #cbd5e1;padding:8px;word-break:break-word;vertical-align:top;min-width:72px;';

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function decodeHtmlAttr(value) {
  return String(value || '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function extractKnowledgeAssetIdsFromHtml(html) {
  if (!html) return [];
  const ids = new Set();
  const re = new RegExp(ASSET_URL_RE.source, 'g');
  let m = re.exec(html);
  while (m) {
    const id = (m[1] || '').trim();
    if (id) ids.add(id);
    m = re.exec(html);
  }
  return Array.from(ids);
}

function replaceKnowledgeAssetUrls(html, urlById) {
  const map = urlById && typeof urlById === 'object' ? urlById : {};
  return String(html || '').replace(ASSET_URL_RE, (match, id) => {
    const next = map[id];
    return next ? next : match;
  });
}

function mergeInlineStyle(attrs, styleToAdd) {
  const raw = attrs == null ? '' : String(attrs);
  const m = raw.match(/\sstyle\s*=\s*(["'])([\s\S]*?)\1/i);
  if (m) {
    const q = m[1];
    const merged = `${m[2]}${/;?\s*$/.test(m[2]) ? '' : ';'}${styleToAdd}`;
    return raw.replace(m[0], ` style=${q}${merged}${q}`);
  }
  return `${raw} style="${styleToAdd}"`;
}

/** rich-text 外部 CSS 不生效，表格边框必须写行内 style */
function styleKnowledgeTables(html) {
  return String(html || '')
    .replace(/<table(\s[^>]*)?>/gi, (_, attrs) => `<table${mergeInlineStyle(attrs, TABLE_STYLE)}>`)
    .replace(/<(td|th)(\s[^>]*)?>/gi, (_, tag, attrs) => `<${tag}${mergeInlineStyle(attrs, CELL_STYLE)}>`)
    .replace(/<(td|th)([^>]*)>\s*<\/(td|th)>/gi, '<$1$2>&nbsp;</$3>');
}

function parseProductRefTag(tag) {
  const idMatch = tag.match(/\bdata-product-id=(["'])([\s\S]*?)\1/i);
  const labelMatch = tag.match(/\bdata-label=(["'])([\s\S]*?)\1/i);
  let label = labelMatch ? decodeHtmlAttr(labelMatch[2]).trim() : '';
  if (!label) {
    const inner = tag.match(/>([\s\S]*?)<\/span\s*>/i);
    label = inner ? String(inner[1] || '').replace(/<[^>]+>/g, '').trim() : '';
    label = decodeHtmlAttr(label).trim();
  }
  return {
    productId: idMatch ? decodeHtmlAttr(idMatch[2]).trim() : '',
    label: label || '关联产品',
  };
}

function convertProductRefsToText(html) {
  return String(html || '').replace(PRODUCT_REF_RE, (tag) => {
    const { label } = parseProductRefTag(tag);
    return `<span style="display:inline-block;padding:2px 8px;border-radius:999px;background:#dbeafe;color:#1d4ed8;font-size:13px;">${escapeHtml(label)}</span>`;
  });
}

function stripUnsupportedAttrs(html) {
  return String(html || '')
    .replace(/\s(?:contenteditable|draggable|spellcheck)=(["'])[^"']*\1/gi, '')
    .replace(/\s(?:on\w+)=(["'])[^"']*\1/gi, '');
}

const DEFAULT_HIGHLIGHT_BG = '#fef08a';

function extractAttr(attrs, name) {
  const re = new RegExp(`\\b${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, 'i');
  const m = String(attrs || '').match(re);
  return m ? decodeHtmlAttr(m[2]).trim() : '';
}

function extractStyleProp(style, prop) {
  const re = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, 'i');
  const m = String(style || '').match(re);
  return m ? m[1].trim() : '';
}

/**
 * 行内 mark 高亮：转 span + 行内背景（rich-text 不吃外部 CSS）
 * 插入菜单「高亮块」是 blockquote，另走 callout 原生块。
 */
function styleKnowledgeMarks(html) {
  return String(html || '').replace(/<mark(\s[^>]*)?>([\s\S]*?)<\/mark>/gi, (_, attrs, inner) => {
    const style = extractAttr(attrs, 'style');
    const dataColor = extractAttr(attrs, 'data-color');
    const bg =
      extractStyleProp(style, 'background-color') ||
      extractStyleProp(style, 'background') ||
      dataColor ||
      DEFAULT_HIGHLIGHT_BG;
    const safeBg = String(bg).replace(/"/g, '').replace(/;/g, '');
    return `<span class="kb-hl" style="background:${safeBg};padding:1px 3px;">${inner}</span>`;
  });
}

function extractImgSrc(tag) {
  const m = String(tag || '').match(/\bsrc=(["'])([\s\S]*?)\1/i);
  return m ? decodeHtmlAttr(m[2]).trim() : '';
}

/** 从 img 标签解析文档内设定宽度（px），用于小程序按原尺寸展示 */
function parseImgWidthPx(tag, maxWidthPx) {
  const max = Number.isFinite(maxWidthPx) && maxWidthPx > 0 ? maxWidthPx : 9999;
  const raw = String(tag || '');

  const attrW = raw.match(/\bwidth=(["']?)(\d+(?:\.\d+)?)\1/i);
  if (attrW) {
    const n = Number(attrW[2]);
    if (Number.isFinite(n) && n > 0) return Math.min(max, n);
  }

  const styleM = raw.match(/\bstyle=(["'])([\s\S]*?)\1/i);
  if (styleM) {
    const style = styleM[2];
    const wPx = style.match(/(?:^|;)\s*width\s*:\s*(\d+(?:\.\d+)?)px/i);
    if (wPx) {
      const n = Number(wPx[1]);
      if (Number.isFinite(n) && n > 0) return Math.min(max, n);
    }
    const wPct = style.match(/(?:^|;)\s*width\s*:\s*(\d+(?:\.\d+)?)%/i);
    if (wPct) {
      const n = Number(wPct[1]);
      if (Number.isFinite(n) && n > 0) return Math.min(max, (max * n) / 100);
    }
  }
  return null;
}

function normalizeImgTagForRichText(tag, maxWidthPx) {
  const src = extractImgSrc(tag);
  if (!src) return '';
  const w = parseImgWidthPx(tag, maxWidthPx);
  const safeSrc = src.replace(/"/g, '&quot;');
  if (w) {
    const dw = Math.round(Math.min(maxWidthPx, w));
    return `<img src="${safeSrc}" style="width:${dw}px;height:auto;max-width:100%;display:block;" />`;
  }
  return `<img src="${safeSrc}" style="max-width:100%;height:auto;display:block;" />`;
}

/** rich-text 内 img：保留文档宽度，且不超过容器 */
function styleKnowledgeImages(html, maxWidthPx) {
  const max = Number.isFinite(maxWidthPx) && maxWidthPx > 0 ? maxWidthPx : 9999;
  return String(html || '').replace(IMG_RE, (tag) => normalizeImgTagForRichText(tag, max));
}

function pxToRpx(px, windowWidthPx) {
  const win = Number(windowWidthPx) || 375;
  return Math.round((Number(px) || 0) * (750 / win));
}

/** 为 image 块补充展示宽度（rpx），不超过页面内容区；递归 table / callout */
function applyImageBlockLayout(blocks, windowWidthPx, contentPaddingPx) {
  const win = Number(windowWidthPx) || 375;
  const pad = Number(contentPaddingPx) || 48;
  const maxContentPx = Math.max(160, win - pad);
  return (blocks || []).map((block) => {
    if (block.type === 'table') {
      return {
        ...block,
        rows: (block.rows || []).map((row) => ({
          ...row,
          cells: (row.cells || []).map((cell) => ({
            ...cell,
            blocks: applyImageBlockLayout(cell.blocks || [], windowWidthPx, contentPaddingPx),
          })),
        })),
      };
    }
    if (block.type === 'callout') {
      return {
        ...block,
        blocks: applyImageBlockLayout(block.blocks || [], windowWidthPx, contentPaddingPx),
      };
    }
    if (block.type !== 'image') return block;
    const wPx = block.widthPx;
    if (wPx && wPx > 0) {
      const displayPx = Math.min(maxContentPx, wPx);
      const widthRpx = pxToRpx(displayPx, win);
      return {
        ...block,
        widthRpx,
        imageStyle: `width:${widthRpx}rpx;max-width:100%;`,
      };
    }
    return {
      ...block,
      widthRpx: 0,
      imageStyle: 'max-width:100%;width:auto;',
    };
  });
}

function isBlankHtml(html) {
  const s = String(html || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/<br\s*\/?>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, '');
  return !s;
}

/**
 * 非表格流：拆成 html / image / product 块，便于原生点击
 * （不含 blockquote；由 splitFlowIntoBlocks 先拆高亮块）
 */
function splitInlineFlowIntoBlocks(flowHtml, previewUrls, keyPrefix, maxContentWidthPx) {
  const products = [];
  const images = [];
  let s = String(flowHtml || '');

  s = s.replace(PRODUCT_REF_RE, (tag) => {
    const idx = products.length;
    products.push(parseProductRefTag(tag));
    return `\u0001KBPROD${idx}\u0001`;
  });

  s = s.replace(IMG_RE, (tag) => {
    const src = extractImgSrc(tag);
    if (!src) return '';
    const idx = images.length;
    images.push({ src, widthPx: parseImgWidthPx(tag, maxContentWidthPx) });
    return `\u0001KBIMG${idx}\u0001`;
  });

  const parts = s.split(/(\u0001KB(?:PROD|IMG)\d+\u0001)/);
  const blocks = [];

  parts.forEach((part, i) => {
    if (!part) return;
    const prodM = part.match(/^\u0001KBPROD(\d+)\u0001$/);
    const imgM = part.match(/^\u0001KBIMG(\d+)\u0001$/);
    if (prodM) {
      const p = products[Number(prodM[1])];
      if (!p) return;
      blocks.push({
        type: 'product',
        key: `${keyPrefix}-p${i}`,
        productId: p.productId,
        label: p.label,
      });
      return;
    }
    if (imgM) {
      const img = images[Number(imgM[1])];
      if (!img || !img.src) return;
      const previewIndex = previewUrls.length;
      previewUrls.push(img.src);
      blocks.push({
        type: 'image',
        key: `${keyPrefix}-i${i}`,
        src: img.src,
        widthPx: img.widthPx || null,
        previewIndex,
      });
      return;
    }
    if (isBlankHtml(part)) return;
    blocks.push({
      type: 'html',
      key: `${keyPrefix}-h${i}`,
      html: styleKnowledgeImages(part, maxContentWidthPx),
      isTable: false,
    });
  });

  return blocks;
}

/** 插入菜单「高亮块」= blockquote，用原生 view 渲染浅蓝底+左边线 */
function buildCalloutBlock(blockquoteHtml, previewUrls, keyPrefix, maxContentWidthPx) {
  const inner = String(blockquoteHtml || '')
    .replace(/^<blockquote\b[^>]*>/i, '')
    .replace(/<\/blockquote>\s*$/i, '');
  const innerBlocks = splitInlineFlowIntoBlocks(inner, previewUrls, `${keyPrefix}-in`, maxContentWidthPx);
  return {
    type: 'callout',
    key: keyPrefix,
    blocks: innerBlocks.length
      ? innerBlocks
      : [{ type: 'html', key: `${keyPrefix}-empty`, html: '<p></p>' }],
  };
}

/**
 * 流式内容：先拆高亮块（blockquote），再拆图/关联产品。
 * 表格单元格内的高亮块也走此路径（rich-text 无法可靠渲染 blockquote）。
 */
function splitFlowIntoBlocks(flowHtml, previewUrls, keyPrefix, maxContentWidthPx) {
  const s = String(flowHtml || '');
  const bqRe = new RegExp(BLOCKQUOTE_RE.source, 'gi');
  const blocks = [];
  let last = 0;
  let seg = 0;
  let m = bqRe.exec(s);

  while (m) {
    if (m.index > last) {
      blocks.push(
        ...splitInlineFlowIntoBlocks(
          s.slice(last, m.index),
          previewUrls,
          `${keyPrefix}-f${seg}`,
          maxContentWidthPx,
        ),
      );
      seg += 1;
    }
    blocks.push(buildCalloutBlock(m[0], previewUrls, `${keyPrefix}-q${seg}`, maxContentWidthPx));
    seg += 1;
    last = m.index + m[0].length;
    m = bqRe.exec(s);
  }

  if (last < s.length) {
    blocks.push(
      ...splitInlineFlowIntoBlocks(s.slice(last), previewUrls, `${keyPrefix}-f${seg}`, maxContentWidthPx),
    );
  } else if (last === 0 && !s) {
    // empty
  }

  return blocks;
}

function parseIntAttr(attrs, name) {
  const re = new RegExp(`\\b${name}=([\"']?)(\\d+)\\1`, 'i');
  const m = String(attrs || '').match(re);
  const n = m ? Number(m[2]) : 1;
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function buildTableBlock(tableHtml, previewUrls, keyPrefix, maxContentWidthPx) {
  const rows = [];
  const rowRe = /<tr\b[^>]*>[\s\S]*?<\/tr>/gi;
  let rowMatch = rowRe.exec(tableHtml);
  let rowIndex = 0;

  while (rowMatch) {
    const rowHtml = rowMatch[0];
    const cells = [];
    const cellRe = /<(td|th)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
    let cellMatch = cellRe.exec(rowHtml);
    let cellIndex = 0;

    while (cellMatch) {
      const tag = String(cellMatch[1] || '').toLowerCase();
      const attrs = cellMatch[2] || '';
      const cellHtml = cellMatch[3] || '';
      const cellBlocks = splitFlowIntoBlocks(
        cellHtml,
        previewUrls,
        `${keyPrefix}-r${rowIndex}-c${cellIndex}`,
        maxContentWidthPx,
      );
      cells.push({
        key: `${keyPrefix}-r${rowIndex}-c${cellIndex}`,
        isHeader: tag === 'th',
        colspan: parseIntAttr(attrs, 'colspan'),
        rowspan: parseIntAttr(attrs, 'rowspan'),
        blocks: cellBlocks.length
          ? cellBlocks
          : [{ type: 'html', key: `${keyPrefix}-r${rowIndex}-c${cellIndex}-empty`, html: '&nbsp;' }],
      });
      cellIndex += 1;
      cellMatch = cellRe.exec(rowHtml);
    }

    if (cells.length) {
      rows.push({ key: `${keyPrefix}-r${rowIndex}`, cells });
      rowIndex += 1;
    }
    rowMatch = rowRe.exec(tableHtml);
  }

  return {
    type: 'table',
    key: keyPrefix,
    rows,
  };
}

/**
 * 预处理正文为渲染块
 * @param {string} html
 * @param {Record<string, string>} [urlById]
 * @param {{ maxContentWidthPx?: number }} [opts]
 */
function buildKnowledgeDocBlocks(html, urlById, opts) {
  const maxContentWidthPx =
    opts && Number.isFinite(opts.maxContentWidthPx) && opts.maxContentWidthPx > 0
      ? opts.maxContentWidthPx
      : 9999;
  let s = String(html || '');
  if (urlById) s = replaceKnowledgeAssetUrls(s, urlById);
  s = styleKnowledgeTables(s);
  s = styleKnowledgeMarks(s);
  s = stripUnsupportedAttrs(s);

  const previewUrls = [];
  const blocks = [];
  const topRe = new RegExp(TOP_BLOCK_RE.source, 'gi');
  let last = 0;
  let m = topRe.exec(s);
  let seg = 0;

  while (m) {
    if (m.index > last) {
      blocks.push(...splitFlowIntoBlocks(s.slice(last, m.index), previewUrls, `s${seg}`, maxContentWidthPx));
      seg += 1;
    }
    const tag = String(m[1] || '').toLowerCase();
    if (tag === 'table') {
      blocks.push(buildTableBlock(m[0], previewUrls, `t${seg}`, maxContentWidthPx));
    } else if (tag === 'blockquote') {
      blocks.push(buildCalloutBlock(m[0], previewUrls, `q${seg}`, maxContentWidthPx));
    }
    seg += 1;
    last = m.index + m[0].length;
    m = topRe.exec(s);
  }

  if (last < s.length) {
    blocks.push(...splitFlowIntoBlocks(s.slice(last), previewUrls, `s${seg}`, maxContentWidthPx));
  }

  return { blocks, previewUrls };
}

/** @deprecated 保留给旧调用；详情页改用 buildKnowledgeDocBlocks */
function prepareKnowledgeHtmlForRichText(html, urlById) {
  let out = String(html || '');
  out = convertProductRefsToText(out);
  if (urlById) out = replaceKnowledgeAssetUrls(out, urlById);
  out = styleKnowledgeTables(out);
  out = styleKnowledgeMarks(out);
  out = stripUnsupportedAttrs(out);
  return out;
}

function arrayBufferToBase64(buffer) {
  if (typeof wx !== 'undefined' && typeof wx.arrayBufferToBase64 === 'function') {
    return wx.arrayBufferToBase64(buffer);
  }
  return Buffer.from(buffer).toString('base64');
}

function assetBufferToDataUrl(buffer, mimeType) {
  const mime = String(mimeType || 'application/octet-stream').split(';')[0].trim();
  const b64 = arrayBufferToBase64(buffer);
  return `data:${mime || 'application/octet-stream'};base64,${b64}`;
}

module.exports = {
  extractKnowledgeAssetIdsFromHtml,
  replaceKnowledgeAssetUrls,
  convertProductRefsToText,
  stripUnsupportedAttrs,
  styleKnowledgeTables,
  styleKnowledgeImages,
  styleKnowledgeMarks,
  parseImgWidthPx,
  pxToRpx,
  applyImageBlockLayout,
  buildKnowledgeDocBlocks,
  prepareKnowledgeHtmlForRichText,
  assetBufferToDataUrl,
  escapeHtml,
  parseProductRefTag,
};
