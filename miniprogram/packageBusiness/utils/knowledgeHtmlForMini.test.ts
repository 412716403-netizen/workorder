import { createRequire } from 'module';
import { describe, it, expect } from 'vitest';

const require = createRequire(import.meta.url);
const {
  extractKnowledgeAssetIdsFromHtml,
  replaceKnowledgeAssetUrls,
  convertProductRefsToText,
  prepareKnowledgeHtmlForRichText,
  styleKnowledgeTables,
  styleKnowledgeMarks,
  buildKnowledgeDocBlocks,
  assetBufferToDataUrl,
} = require('./knowledgeHtmlForMini.js');

describe('knowledgeHtmlForMini', () => {
  it('extracts unique asset ids', () => {
    const html =
      '<p><img src="/api/knowledge-base/assets/ka1" /></p><img src="/api/knowledge-base/assets/ka1" /><img src="/api/knowledge-base/assets/ka2" />';
    expect(extractKnowledgeAssetIdsFromHtml(html)).toEqual(['ka1', 'ka2']);
  });

  it('replaces asset urls from map', () => {
    const html = '<img src="/api/knowledge-base/assets/ka1" />';
    expect(
      replaceKnowledgeAssetUrls(html, { ka1: 'data:image/png;base64,AAA' }),
    ).toBe('<img src="data:image/png;base64,AAA" />');
  });

  it('converts product-ref chip to readable text', () => {
    const html =
      '<p>见 <span data-type="product-ref" data-product-id="p1" data-label="毛衣41 (SKU1)">毛衣41</span></p>';
    const out = convertProductRefsToText(html);
    expect(out).toContain('毛衣41 (SKU1)');
    expect(out).not.toContain('data-type="product-ref"');
  });

  it('falls back to chip text when data-label missing', () => {
    const html =
      '<span class="kb-product-ref" data-type="product-ref" data-product-id="p1">上衣（A01）</span>';
    expect(convertProductRefsToText(html)).toContain('上衣（A01）');
  });

  it('injects inline table borders for rich-text', () => {
    const html = '<table><tr><td></td><td>a</td></tr></table>';
    const out = styleKnowledgeTables(html);
    expect(out).toContain('border-collapse:collapse');
    expect(out).toContain('border:1px solid #cbd5e1');
    expect(out).toContain('&nbsp;');
  });

  it('builds blocks with clickable product and image', () => {
    const html =
      '<p>前</p><span data-type="product-ref" data-product-id="p1" data-label="产品A">x</span><p><img src="/api/knowledge-base/assets/a1" /></p>';
    const { blocks, previewUrls } = buildKnowledgeDocBlocks(html, {
      a1: 'data:image/jpeg;base64,BBB',
    });
    expect(blocks.some((b) => b.type === 'product' && b.productId === 'p1' && b.label === '产品A')).toBe(
      true,
    );
    expect(blocks.some((b) => b.type === 'image' && b.src === 'data:image/jpeg;base64,BBB')).toBe(
      true,
    );
    expect(previewUrls).toEqual(['data:image/jpeg;base64,BBB']);
  });

  it('builds document ref blocks', () => {
    const html =
      '<p>见 <span data-type="document-ref" data-document-id="d1" data-label="工艺说明">x</span></p>';
    const { blocks } = buildKnowledgeDocBlocks(html, {});
    expect(
      blocks.some((b) => b.type === 'document' && b.documentId === 'd1' && b.label === '工艺说明'),
    ).toBe(true);
  });

  it('builds native table blocks', () => {
    const html = '<p>x</p><table><tr><td>1</td><td>2</td></tr></table><p>y</p>';
    const { blocks } = buildKnowledgeDocBlocks(html, {});
    const tableBlock = blocks.find((b) => b.type === 'table');
    expect(tableBlock).toBeTruthy();
    expect(tableBlock.rows).toHaveLength(1);
    expect(tableBlock.rows[0].cells).toHaveLength(2);
    expect(tableBlock.rows[0].cells[0].blocks[0].html).toContain('1');
  });

  it('preserves document image width in image blocks', () => {
    const html = '<p><img src="/api/knowledge-base/assets/a1" width="120" /></p>';
    const { blocks } = buildKnowledgeDocBlocks(html, { a1: 'data:image/png;base64,AAA' });
    const img = blocks.find((b) => b.type === 'image');
    expect(img && img.widthPx).toBe(120);
  });

  it('keeps table images clickable', () => {
    const html = '<table><tr><td><img src="x" style="width:80px" /></td></tr></table>';
    const { blocks } = buildKnowledgeDocBlocks(html, {}, { maxContentWidthPx: 300 });
    const tableBlock = blocks.find((b) => b.type === 'table');
    const imgBlock = tableBlock.rows[0].cells[0].blocks.find((b) => b.type === 'image');
    expect(imgBlock.src).toBe('x');
    expect(imgBlock.widthPx).toBe(80);
  });

  it('keeps table product refs clickable', () => {
    const html =
      '<table><tr><td><span data-type="product-ref" data-product-id="p1" data-label="产品A">x</span></td></tr></table>';
    const { blocks } = buildKnowledgeDocBlocks(html, {});
    const tableBlock = blocks.find((b) => b.type === 'table');
    const productBlock = tableBlock.rows[0].cells[0].blocks.find((b) => b.type === 'product');
    expect(productBlock.productId).toBe('p1');
    expect(productBlock.label).toBe('产品A');
  });

  it('prepares rich-text html with asset replacement', () => {
    const html =
      '<p><span data-type="product-ref" data-label="产品A">x</span><img src="/api/knowledge-base/assets/a1" /></p>';
    const out = prepareKnowledgeHtmlForRichText(html, {
      a1: 'data:image/jpeg;base64,BBB',
    });
    expect(out).toContain('产品A');
    expect(out).toContain('data:image/jpeg;base64,BBB');
  });

  it('builds data url from buffer', () => {
    const buf = Uint8Array.from([1, 2, 3]).buffer;
    expect(assetBufferToDataUrl(buf, 'image/png')).toBe(
      `data:image/png;base64,${Buffer.from(buf).toString('base64')}`,
    );
  });

  it('converts mark highlight to inline background span', () => {
    const colored = styleKnowledgeMarks('<p><mark data-color="#bfdbfe" style="background-color: #bfdbfe">蓝</mark></p>');
    expect(colored).toContain('background:#bfdbfe');
    expect(colored).toContain('class="kb-hl"');
    expect(colored).not.toContain('<mark');

    const plain = styleKnowledgeMarks('<p><mark>默认</mark></p>');
    expect(plain).toContain('background:#fef08a');
    expect(plain).toContain('默认');
  });

  it('builds callout block from blockquote (insert menu 高亮块)', () => {
    const html = '<p>前</p><blockquote><p>高亮内容</p></blockquote><p>后</p>';
    const { blocks } = buildKnowledgeDocBlocks(html, {});
    const callout = blocks.find((b) => b.type === 'callout');
    expect(callout).toBeTruthy();
    expect(callout.blocks.some((b) => b.type === 'html' && String(b.html).includes('高亮内容'))).toBe(
      true,
    );
  });

  it('builds callout inside table cells', () => {
    const html =
      '<table><tr><td><p>普通</p><blockquote><p>格内高亮</p></blockquote></td></tr></table>';
    const { blocks } = buildKnowledgeDocBlocks(html, {});
    const tableBlock = blocks.find((b) => b.type === 'table');
    expect(tableBlock).toBeTruthy();
    const cellBlocks = tableBlock.rows[0].cells[0].blocks;
    const callout = cellBlocks.find((b) => b.type === 'callout');
    expect(callout).toBeTruthy();
    expect(
      callout.blocks.some((b) => b.type === 'html' && String(b.html).includes('格内高亮')),
    ).toBe(true);
  });

  it('builds file attachment blocks and keeps asset id after image url replace', () => {
    const html =
      '<p>见附件</p><div data-type="file-attachment" data-asset-url="/api/knowledge-base/assets/ka-file1" data-file-name="BOM.xlsx" data-mime-type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" data-size-bytes="12345"></div><p><img src="/api/knowledge-base/assets/ka-img1" /></p>';
    const { blocks, previewUrls } = buildKnowledgeDocBlocks(html, {
      'ka-img1': 'wxfile://img',
      'ka-file1': 'wxfile://should-not-use',
    });
    const file = blocks.find((b) => b.type === 'file');
    expect(file).toBeTruthy();
    expect(file.assetId).toBe('ka-file1');
    expect(file.fileName).toBe('BOM.xlsx');
    expect(file.kind).toBe('excel');
    expect(file.sizeText).toContain('KB');
    expect(blocks.some((b) => b.type === 'image' && b.src === 'wxfile://img')).toBe(true);
    expect(previewUrls).toEqual(['wxfile://img']);
  });

  it('extractImageAssetIdsFromHtml skips attachment assets', () => {
    const {
      extractImageAssetIdsFromHtml,
    } = require('./knowledgeHtmlForMini.js');
    const html =
      '<div data-type="file-attachment" data-asset-url="/api/knowledge-base/assets/ka-pdf" data-file-name="a.pdf" data-mime-type="application/pdf" data-size-bytes="1"></div><img src="/api/knowledge-base/assets/ka-img" />';
    expect(extractImageAssetIdsFromHtml(html)).toEqual(['ka-img']);
  });

  it('builds video attachment with player localSrc and extracts player ids', () => {
    const {
      extractPlayerVideoAssetIdsFromHtml,
    } = require('./knowledgeHtmlForMini.js');
    const html =
      '<div data-type="file-attachment" data-asset-url="/api/knowledge-base/assets/ka-v1" data-file-name="a.mp4" data-mime-type="video/mp4" data-size-bytes="1024" data-display-mode="player"></div>' +
      '<div data-type="file-attachment" data-asset-url="/api/knowledge-base/assets/ka-v2" data-file-name="b.mp4" data-mime-type="video/mp4" data-size-bytes="2048"></div>';
    expect(extractPlayerVideoAssetIdsFromHtml(html)).toEqual(['ka-v1']);
    const { blocks } = buildKnowledgeDocBlocks(html, { 'ka-v1': 'wxfile://video1' });
    const player = blocks.find((b) => b.type === 'file' && b.assetId === 'ka-v1');
    const tag = blocks.find((b) => b.type === 'file' && b.assetId === 'ka-v2');
    expect(player.kind).toBe('video');
    expect(player.displayMode).toBe('player');
    expect(player.localSrc).toBe('wxfile://video1');
    expect(tag.displayMode).toBe('tag');
    expect(tag.localSrc).toBe('');
  });
});
