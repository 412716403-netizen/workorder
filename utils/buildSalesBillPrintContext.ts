import type {
  AppDictionaries,
  PrintListRow,
  PrintRenderContext,
  Product,
  ProductVariant,
  PsiRecord,
  SalesBillMatrixColorRow,
  SalesBillMatrixGroup,
  SalesBillPrintDoc,
  Warehouse,
} from '../types';
import {
  COLOR_SIZE_MATRIX_JSON_KEY,
  matrixGroupToColorSizePayload,
  serializeColorSizeMatrixPayload,
} from './colorSizeMatrixPrint';
import { BATCH_NO_UNTAGGED } from '../shared/types';
import { sortedVariantColorEntries } from './sortVariantsByProduct';
import { groupPsiDocLines } from './psiPrintShared';
import {
  relatedProductNameForPrint,
  relatedProductSkuForPrint,
} from './purchaseBillRelatedProductPrint';

export type SalesBillLineInput = {
  id: string;
  productId: string;
  quantity?: number;
  salesPrice: number;
  variantQuantities?: Record<string, number>;
  /** 采购单打印等场景复用销售明细行结构时携带批次 */
  batchNo?: string;
  /** 与 PSI `batch` 入参一致（销售单保存常用 `batch`） */
  batch?: string;
  /** 采购入库行级关联成品 id */
  relatedProductId?: string;
};

function lineBatchForPrint(line: SalesBillLineInput): string {
  const raw = line.batchNo ?? line.batch;
  // 与 BATCH_NO_UNTAGGED 对齐：空批号统一渲染为"无批号"，避免打印列出现空白。
  if (typeof raw !== 'string') return BATCH_NO_UNTAGGED;
  const trimmed = raw.trim();
  return trimmed === '' ? BATCH_NO_UNTAGGED : trimmed;
}

function formatYmdChinese(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((ymd || '').trim());
  if (!m) return ymd || '';
  return `${m[1]}年${m[2]}月${m[3]}日`;
}

function fmtMoney(n: number): string {
  if (!Number.isFinite(n)) return '0';
  const s = n.toFixed(2);
  return s.endsWith('.00') ? String(Math.round(n)) : s;
}

export function buildSalesBillPrintListRows(
  items: SalesBillLineInput[],
  productMap: Map<string, Product>,
  dictionaries: AppDictionaries,
): PrintListRow[] {
  const rows: PrintListRow[] = [];
  let lineNo = 0;
  for (const line of items) {
    if (!line.productId) continue;
    const prod = productMap.get(line.productId);
    const price = Number(line.salesPrice) || 0;
    const hasVariants = prod?.variants && prod.variants.length > 0;
    if (hasVariants && line.variantQuantities) {
      const groupedByColor: Record<string, import('../types').ProductVariant[]> = {};
      prod!.variants!.forEach(v => {
        if (!groupedByColor[v.colorId]) groupedByColor[v.colorId] = [];
        groupedByColor[v.colorId].push(v);
      });
      const sorted = sortedVariantColorEntries(groupedByColor, prod?.colorIds, prod?.sizeIds);
      for (const [, colorVariants] of sorted) {
        for (const v of colorVariants) {
          const qty = Number(line.variantQuantities[v.id]) || 0;
          if (qty === 0) continue;
          lineNo += 1;
          const color = dictionaries.colors?.find(c => c.id === v.colorId);
          const size = dictionaries.sizes?.find(s => s.id === v.sizeId);
          const amount = qty * price;
          rows.push({
            lineNo,
            sku: prod?.sku ?? '',
            productName: prod?.name ?? '',
            colorName: color?.name ?? '',
            sizeName: size?.name ?? v.skuSuffix ?? '',
            qty,
            unitPrice: fmtMoney(price),
            amount: fmtMoney(amount),
            remark: '',
            batchNo: lineBatchForPrint(line),
          });
        }
      }
    } else {
      const qty = Number(line.quantity) || 0;
      if (qty === 0) continue;
      lineNo += 1;
      const amount = qty * price;
      rows.push({
        lineNo,
        sku: prod?.sku ?? '',
        productName: prod?.name ?? '',
        colorName: '',
        sizeName: '',
        qty,
        unitPrice: fmtMoney(price),
        amount: fmtMoney(amount),
        remark: '',
        batchNo: lineBatchForPrint(line),
      });
    }
  }
  return rows;
}

/** 销售单矩阵：按录入行聚合为「货号块」（颜色 × 尺码列 + rowspan） */
export function buildSalesBillMatrixGroups(
  items: SalesBillLineInput[],
  productMap: Map<string, Product>,
  dictionaries: AppDictionaries,
): SalesBillMatrixGroup[] {
  const groups: SalesBillMatrixGroup[] = [];
  let lineNo = 0;
  for (const line of items) {
    if (!line.productId) continue;
    const prod = productMap.get(line.productId);
    const price = Number(line.salesPrice) || 0;
    if (!prod?.variants?.length || !line.variantQuantities) {
      const q = Number(line.quantity) || 0;
      if (q === 0) continue;
      lineNo += 1;
      groups.push({
        lineNo,
        sku: prod?.sku ?? '',
        productName: prod?.name ?? '',
        sizes: ['均码'],
        colorRows: [{ colorName: '—', quantities: [q] }],
        totalQty: q,
        unitPrice: price,
        totalAmount: q * price,
        remark: '',
        batchNo: lineBatchForPrint(line) || undefined,
        ...(line.relatedProductId ? { relatedProductId: line.relatedProductId } : {}),
      });
      continue;
    }

    const sizeOrder: string[] = [];
    const pushSize = (sid: string) => {
      if (!sizeOrder.includes(sid)) sizeOrder.push(sid);
    };
    for (const sid of prod.sizeIds || []) {
      let has = false;
      for (const v of prod.variants!) {
        if (v.sizeId === sid && (Number(line.variantQuantities[v.id]) || 0) !== 0) has = true;
      }
      if (has) pushSize(sid);
    }
    if (sizeOrder.length === 0) {
      for (const v of prod.variants!) {
        if ((Number(line.variantQuantities[v.id]) || 0) !== 0) pushSize(v.sizeId);
      }
    }

    const sizeLabels = sizeOrder.map(sid => dictionaries.sizes?.find(s => s.id === sid)?.name || sid);

    const groupedByColor: Record<string, ProductVariant[]> = {};
    prod.variants!.forEach(v => {
      if (!groupedByColor[v.colorId]) groupedByColor[v.colorId] = [];
      groupedByColor[v.colorId].push(v);
    });
    const sortedColors = sortedVariantColorEntries(groupedByColor, prod.colorIds, prod.sizeIds);

    const colorRows: SalesBillMatrixColorRow[] = [];
    for (const [colorId, colorVariants] of sortedColors) {
      const quantities = sizeOrder.map(sid => {
        const v = colorVariants.find(cv => cv.sizeId === sid);
        if (!v) return 0;
        return Number(line.variantQuantities[v.id]) || 0;
      });
      if (quantities.every(q => q === 0)) continue;
      const colorName = dictionaries.colors?.find(c => c.id === colorId)?.name || '—';
      colorRows.push({ colorName, quantities });
    }

    if (colorRows.length === 0) continue;
    lineNo += 1;
    const totalQty = colorRows.reduce((s, cr) => s + cr.quantities.reduce((a, b) => a + b, 0), 0);
    const totalAmount = totalQty * price;
    groups.push({
      lineNo,
      sku: prod.sku ?? '',
      productName: prod.name ?? '',
      sizes: sizeLabels,
      colorRows,
      totalQty,
      unitPrice: price,
      totalAmount,
      remark: '',
      batchNo: lineBatchForPrint(line) || undefined,
      ...(line.relatedProductId ? { relatedProductId: line.relatedProductId } : {}),
    });
  }
  return groups;
}

/** 销售单动态列表：每行明细（货号块）一条 PrintListRow，含 colorSizeMatrixJson */
export function buildSalesBillPrintListRowsByProductLine(
  items: SalesBillLineInput[],
  productMap: Map<string, Product>,
  dictionaries: AppDictionaries,
): PrintListRow[] {
  const groups = buildSalesBillMatrixGroups(items, productMap, dictionaries);
  return groups.map(g => ({
    lineNo: g.lineNo,
    sku: g.sku,
    productName: g.productName,
    qty: g.totalQty,
    unitPrice: fmtMoney(g.unitPrice),
    amount: fmtMoney(g.totalAmount),
    remark: g.remark ?? '',
    ...(g.batchNo ? { batchNo: g.batchNo } : {}),
    ...(g.relatedProductId
      ? {
          relatedProductName: relatedProductNameForPrint(g.relatedProductId, productMap),
          relatedProductSku: relatedProductSkuForPrint(g.relatedProductId, productMap),
        }
      : {}),
    [COLOR_SIZE_MATRIX_JSON_KEY]: serializeColorSizeMatrixPayload(matrixGroupToColorSizePayload(g)),
  }));
}

/**
 * 单条成品明细（无单价语义时用 salesPrice=0）：由规格数量汇总矩阵 JSON 与总件数。
 * 供外协、返工、入库等 builder 复用，避免复制矩阵逻辑。
 */
export function buildMatrixJsonAndTotalQtyFromVariantLine(opts: {
  productId: string;
  productMap: Map<string, Product>;
  dictionaries: AppDictionaries;
  variantQuantities?: Record<string, number>;
  quantity?: number;
}): { colorSizeMatrixJson: string; totalQty: number } | null {
  const { productId, productMap, dictionaries, variantQuantities, quantity } = opts;
  if (!productId) return null;
  const line: SalesBillLineInput = {
    id: '__matrix_slice__',
    productId,
    salesPrice: 0,
    quantity,
    variantQuantities,
  };
  const groups = buildSalesBillMatrixGroups([line], productMap, dictionaries);
  const g = groups[0];
  if (!g) return null;
  return {
    colorSizeMatrixJson: serializeColorSizeMatrixPayload(matrixGroupToColorSizePayload(g)),
    totalQty: g.totalQty,
  };
}

/**
 * Phase 3.D follow-up：销售单打印 builder。
 *
 * 改造前：接收 `psiRecords / financeRecords / prodRecords` 三个全量数组，在 builder 内
 * 通过 `computePartnerReceivableBeforeDoc` 在前端扫表算应收 ledger，违反"builder 纯函数 + 无副作用"
 * 的同时也强迫调用方持有 context 中三大全量数组。
 *
 * 改造后：builder 接收**已经算好的** `preBalance: { previousBalance, anchorTimeMs }`；
 * 调用方（PSIOpsView 打印入口）负责异步调 `api.finance.partnerReceivable` 拿到 `previousBalance`，
 * 然后把本单签名净额（`docTotalAmount`）加上 `previousBalance` 即为 `accumulatedDebt`。
 */
export function buildSalesBillPrintRenderContext(opts: {
  form: {
    partner: string;
    partnerId?: string;
    docNumber: string;
    warehouseId: string;
    createdAt: string;
    note: string;
    customData?: Record<string, unknown>;
  };
  lines: SalesBillLineInput[];
  productMap: Map<string, Product>;
  warehouseMap: Map<string, Warehouse>;
  dictionaries: AppDictionaries;
  /** 已由后端 `api.finance.partnerReceivable` 算好的应收 ledger 截至本单时刻的余额 */
  preBalance: { previousBalance: number };
  editingDocNumber: string | null;
}): PrintRenderContext {
  const { form, lines, productMap, warehouseMap, dictionaries, preBalance, editingDocNumber } = opts;
  const groupsForTotals = buildSalesBillMatrixGroups(lines, productMap, dictionaries);
  const docTotalQty = groupsForTotals.reduce((s, g) => s + g.totalQty, 0);
  const docTotalAmount = groupsForTotals.reduce((s, g) => s + g.totalAmount, 0);

  const docNumber = (form.docNumber || '').trim() || (editingDocNumber ?? '') || '—';

  const previousBalance = Number.isFinite(preBalance.previousBalance) ? preBalance.previousBalance : 0;
  const currentDebt = docTotalAmount;
  const accumulatedDebt = previousBalance + currentDebt;

  const wh = warehouseMap.get(form.warehouseId);

  const custom =
    form.customData && typeof form.customData === 'object' && Object.keys(form.customData).length > 0
      ? { ...form.customData }
      : undefined;

  const salesBill: SalesBillPrintDoc = {
    title: '销售单',
    docNumber,
    partner: form.partner || '',
    partnerId: form.partnerId,
    warehouseName: wh?.name ?? '',
    createdAtDisplay: formatYmdChinese((form.createdAt || '').trim().slice(0, 10)),
    note: form.note || '',
    docTotalQty,
    docTotalAmount,
    previousBalance: Math.round(previousBalance * 100) / 100,
    currentDebt: Math.round(currentDebt * 100) / 100,
    accumulatedDebt: Math.round(accumulatedDebt * 100) / 100,
    custom,
  };

  const firstProductId = lines.find(l => l.productId)?.productId;
  const product = firstProductId ? productMap.get(firstProductId) : undefined;

  return {
    salesBill,
    printListRows: buildSalesBillPrintListRowsByProductLine(lines, productMap, dictionaries),
    product,
    page: { current: 1, total: 1 },
  };
}

/** 从同一销售单下的 PSI 行记录聚合为打印行输入 */
export function buildSalesBillLinesFromPsiRecords(docItems: PsiRecord[]): SalesBillLineInput[] {
  return groupPsiDocLines<SalesBillLineInput>(docItems, (lgId, first, _recs, hasVar, vq, lineQtyNoVar) => ({
    id: lgId,
    productId: first.productId,
    quantity: hasVar ? undefined : lineQtyNoVar,
    salesPrice: Number(first.salesPrice) || 0,
    variantQuantities: hasVar ? vq : undefined,
  }));
}

/**
 * Phase 3.D follow-up：从 PSI 同单据明细生成打印上下文；同样改为接收已算好的 `preBalance`。
 */
export function buildSalesBillPrintContextFromPsiDoc(params: {
  docNumber: string;
  docItems: PsiRecord[];
  productMap: Map<string, Product>;
  warehouseMap: Map<string, Warehouse>;
  dictionaries: AppDictionaries;
  preBalance: { previousBalance: number };
}): PrintRenderContext {
  const { docNumber, docItems, productMap, warehouseMap, dictionaries, preBalance } = params;
  const main = docItems[0] ?? {};
  const lines = buildSalesBillLinesFromPsiRecords(docItems);
  const createdAtRaw = (main.createdAt as string | undefined) ?? '';
  const createdAtYmd =
    typeof createdAtRaw === 'string' && createdAtRaw.includes('T')
      ? createdAtRaw.slice(0, 10)
      : String(createdAtRaw).trim().slice(0, 10);
  return buildSalesBillPrintRenderContext({
    form: {
      partner: String(main.partner ?? ''),
      partnerId: main.partnerId,
      docNumber,
      warehouseId: String(main.warehouseId ?? ''),
      createdAt: createdAtYmd,
      note: String(main.note ?? '').trim(),
      customData: main.customData,
    },
    lines,
    productMap,
    warehouseMap,
    dictionaries,
    preBalance,
    editingDocNumber: docNumber,
  });
}
