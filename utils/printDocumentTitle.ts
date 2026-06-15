/** 去掉文件名非法字符，保留空格便于阅读 */
function sanitizePrintDocumentTitlePart(s: string): string {
  return s.replace(/[/\\?*[\]:"|<>]/g, '_').trim().slice(0, 120) || '_';
}

/** 生产计划单浏览器「另存为 PDF」时的建议文件名：计划单号 + 产品名称 */
export function buildPlanListPrintDocumentTitle(
  planNumber: string,
  productName?: string | null,
): string {
  const num = sanitizePrintDocumentTitlePart(planNumber || '计划单');
  const name = productName?.trim();
  if (!name) return num;
  return `${num}-${sanitizePrintDocumentTitlePart(name)}`;
}

/** 计划相关 PDF 下载文件名：计划单号 + 产品名称 + 后缀（如「单品码标签」） */
export function buildPlanPrintPdfFilename(
  planNumber: string,
  productName: string | null | undefined,
  suffix: string,
): string {
  const base = buildPlanListPrintDocumentTitle(planNumber, productName);
  const safeSuffix = sanitizePrintDocumentTitlePart(suffix || '导出');
  return `${base}-${safeSuffix}.pdf`;
}
