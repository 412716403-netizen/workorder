import type {
  AppDictionaries,
  PrintBodyElement,
  PrintDynamicListElementConfig,
  PrintListRow,
  PrintRenderContext,
  PrintTemplate,
  Product,
  ProductionOrder,
} from '../types';
import { buildSalesBillPrintListRowsByProductLine, type SalesBillLineInput } from './buildSalesBillPrintContext';
import { dynamicListHasMatrixColumn, matrixVisualSubRowCountForRow } from './dynamicListMatrix';

const EMPTY_DICT: AppDictionaries = { colors: [], sizes: [], units: [] };

/** 与 `printBodyVerticalPush` 中动态列表垂直推挤估算共用 */
export function dynamicListHeaderHeightMm(cfg: PrintDynamicListElementConfig): number {
  if (!cfg.showHeader) return 0;
  const h = cfg.headerRowHeightMm;
  return h != null && h > 0 ? h : 4;
}

/** 未设置 `bodyRowHeightMm` 时，分页与垂直推挤估算共用的默认行高 (mm) */
export const DYNAMIC_LIST_DEFAULT_BODY_ROW_MM = 6;

/** 组件内数据区可容纳的数据行数（至少 1）。
 *  bodyH 非空时以「画布高度 - 组件 y」作为可用高度，使列表尽量填满整页。 */
export function getDynamicListRowsPerPage(
  el: PrintBodyElement,
  bodyH?: number,
  printListRows?: PrintListRow[],
): number {
  if (el.type !== 'dynamicList') return 1;
  const cfg = el.config as PrintDynamicListElementConfig;
  const headerH = dynamicListHeaderHeightMm(cfg);
  const effectiveH = bodyH != null ? Math.max(el.height, bodyH - el.y) : el.height;
  const avail = Math.max(0.1, effectiveH - headerH);
  const rowH =
    cfg.bodyRowHeightMm != null && cfg.bodyRowHeightMm > 0 ? Math.max(0.5, cfg.bodyRowHeightMm) : DYNAMIC_LIST_DEFAULT_BODY_ROW_MM;
  const hasMatrix = dynamicListHasMatrixColumn(cfg);
  if (!hasMatrix || !printListRows?.length) {
    return Math.max(1, Math.floor(avail / rowH));
  }
  const maxSlots = Math.max(1, ...printListRows.map(r => matrixVisualSubRowCountForRow(r, cfg)));
  return Math.max(1, Math.floor(avail / (rowH * maxSlots)));
}

export type ListPaginationSummary = {
  /** 各动态列表取最小值，保证多列表同页切片一致 */
  globalRowsPerPage: number;
  /** 仅由明细行数决定的页数（≥1） */
  listDrivenPages: number;
  rowCount: number;
};

/** 无明细或未启用分页时返回 null */
export function computeListPaginationSummary(
  template: PrintTemplate,
  ctx: PrintRenderContext,
  editorMode: boolean,
  bodyH?: number,
): ListPaginationSummary | null {
  if (editorMode) return null;
  const rows = ctx.printListRows;
  if (!rows?.length) return null;
  const lists = template.elements.filter(e => e.type === 'dynamicList');
  if (!lists.length) return null;
  const rps = lists.map(e => getDynamicListRowsPerPage(e, bodyH, rows));
  const globalRowsPerPage = Math.min(...rps);
  const listDrivenPages = Math.max(1, Math.ceil(rows.length / globalRowsPerPage));
  return { globalRowsPerPage, listDrivenPages, rowCount: rows.length };
}

/** 与 ctx.page.total（若传入）取 max，用于物理页数 */
export function getListDrivenPageCount(template: PrintTemplate, ctx: PrintRenderContext, editorMode: boolean, bodyH?: number): number {
  const s = computeListPaginationSummary(template, ctx, editorMode, bodyH);
  return s ? s.listDrivenPages : 1;
}

export function getListRowsForPrintPage(
  summary: ListPaginationSummary,
  printListRows: PrintListRow[],
  pageIndex1: number,
): { rows: PrintListRow[]; serialStart: number } {
  const start = (pageIndex1 - 1) * summary.globalRowsPerPage;
  const slice = printListRows.slice(start, start + summary.globalRowsPerPage);
  return { rows: slice, serialStart: start + 1 };
}

/** 工单明细 → 动态列表行（列模板可用 {{行.quantity}} 等） */
export function buildPrintListRowsFromOrderItems(order: { items: { variantId?: string; quantity: number; completedQuantity: number }[] }): PrintListRow[] {
  return order.items.map((item, idx) => ({
    index: idx + 1,
    variantId: item.variantId ?? '',
    quantity: item.quantity,
    completedQuantity: item.completedQuantity,
  }));
}

/**
 * 工单打印：与销售单/计划单一致，按产品块输出一行（含 `colorSizeMatrixJson`），并附带工单完成数合计。
 * 无 `product` 时回退为 {@link buildPrintListRowsFromOrderItems}。
 */
export function buildPrintListRowsFromOrderItemsMatrix(
  order: ProductionOrder,
  product: Product | undefined,
  dictionaries?: AppDictionaries,
): PrintListRow[] {
  if (!order?.productId || !product) {
    return buildPrintListRowsFromOrderItems(order);
  }
  const dict = dictionaries ?? EMPTY_DICT;
  const variantQuantities: Record<string, number> = {};
  let qtyNoVariant = 0;
  for (const it of order.items || []) {
    if (it.variantId) {
      variantQuantities[it.variantId] = (variantQuantities[it.variantId] ?? 0) + (Number(it.quantity) || 0);
    } else {
      qtyNoVariant += Number(it.quantity) || 0;
    }
  }
  const completedSum = (order.items || []).reduce((s, it) => s + (Number(it.completedQuantity) || 0), 0);
  const hasVariantQty = Object.values(variantQuantities).some(q => q > 0);
  if (!hasVariantQty && qtyNoVariant <= 0) {
    return [];
  }
  const line: SalesBillLineInput = {
    id: `order-${order.id}`,
    productId: order.productId,
    salesPrice: 0,
    quantity: hasVariantQty ? undefined : qtyNoVariant,
    variantQuantities: hasVariantQty ? variantQuantities : undefined,
  };
  const productMap = new Map<string, Product>([[product.id, product]]);
  const rows = buildSalesBillPrintListRowsByProductLine([line], productMap, dict);
  return rows.map(r => ({
    ...r,
    index: r.lineNo ?? 1,
    completedQuantity: completedSum,
  }));
}
