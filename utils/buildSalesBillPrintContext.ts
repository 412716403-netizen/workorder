import type {
  AppDictionaries,
  FinanceRecord,
  PrintListRow,
  PrintRenderContext,
  Product,
  ProductVariant,
  SalesBillMatrixColorRow,
  SalesBillMatrixGroup,
  SalesBillPrintDoc,
  Warehouse,
} from '../types';
import { localCalendarYmdStartToIso } from './localDateTime';
import { sortedVariantColorEntries } from './sortVariantsByProduct';
import { computePartnerReceivableBeforeDoc } from './partnerReceivableLedger';
import { flowRecordsEarliestMs } from './flowDocSort';

export type SalesBillLineInput = {
  id: string;
  productId: string;
  quantity?: number;
  salesPrice: number;
  variantQuantities?: Record<string, number>;
};

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
    });
  }
  return groups;
}

export function buildSalesBillPrintRenderContext(opts: {
  form: {
    partner: string;
    partnerId?: string;
    docNumber: string;
    warehouseId: string;
    createdAt: string;
    note: string;
  };
  lines: SalesBillLineInput[];
  productMap: Map<string, Product>;
  warehouseMap: Map<string, Warehouse>;
  dictionaries: AppDictionaries;
  psiRecords: any[];
  financeRecords: FinanceRecord[];
  prodRecords: any[];
  editingDocNumber: string | null;
}): PrintRenderContext {
  const { form, lines, productMap, warehouseMap, dictionaries, psiRecords, financeRecords, prodRecords, editingDocNumber } = opts;
  const salesBillMatrix = buildSalesBillMatrixGroups(lines, productMap, dictionaries);
  const docTotalQty = salesBillMatrix.reduce((s, g) => s + g.totalQty, 0);
  const docTotalAmount = salesBillMatrix.reduce((s, g) => s + g.totalAmount, 0);

  const docNumber = (form.docNumber || '').trim() || (editingDocNumber ?? '') || '—';
  const docKey = `SALES_BILL|${(editingDocNumber || form.docNumber || '').trim() || `__draft_${Date.now()}__`}`;

  let anchorTimeMs = Date.now();
  if (editingDocNumber) {
    const docLines = (psiRecords || []).filter((r: any) => r.type === 'SALES_BILL' && r.docNumber === editingDocNumber);
    const ms = flowRecordsEarliestMs(docLines);
    if (ms > 0) anchorTimeMs = ms;
  } else {
    const iso = localCalendarYmdStartToIso(form.createdAt || '');
    const t = Date.parse(iso);
    if (!Number.isNaN(t)) anchorTimeMs = t;
  }

  const bal = computePartnerReceivableBeforeDoc(
    form.partner || '',
    form.partnerId,
    psiRecords || [],
    financeRecords || [],
    prodRecords || [],
    {
      docKey,
      anchorTimeMs,
      currentSignedAmount: docTotalAmount,
    },
  );

  const wh = warehouseMap.get(form.warehouseId);

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
    previousBalance: Math.round(bal.previousBalance * 100) / 100,
    currentDebt: Math.round(bal.currentDebt * 100) / 100,
    accumulatedDebt: Math.round(bal.accumulatedDebt * 100) / 100,
  };

  return {
    salesBill,
    salesBillMatrix,
    printListRows: [],
    page: { current: 1, total: 1 },
  };
}
