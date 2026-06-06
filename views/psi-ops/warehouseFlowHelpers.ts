/**
 * 仓库流水（采购入库 / 销售出库 / 调拨 / 盘点 / 生产入库/退料/领料发出）的纯聚合工具。
 * 从 WarehousePanel.tsx 抽出（S11 工程性整理）。
 *
 * - `computeWarehouseFlowRows`：把 PSI 记录 + 生产记录拍平成统一行结构，
 *   按 `type|docNumber|productId` 三元组聚合后按"组内最早时间"倒序。
 * - 类型/标签/日期辅助函数同步抽出，便于单测覆盖。
 */
import type { Product, Warehouse } from '../../types';

export const WAREHOUSE_FLOW_TYPES = [
  'PURCHASE_BILL',
  'SALES_BILL',
  'TRANSFER',
  'STOCKTAKE',
  'STOCK_IN',
  'STOCK_RETURN',
  'STOCK_OUT',
] as const;

export const warehouseFlowTypeLabel: Record<string, string> = {
  PURCHASE_BILL: '采购入库',
  SALES_BILL: '销售出库',
  SALES_RETURN: '销售退货',
  TRANSFER: '调拨',
  STOCKTAKE: '盘点',
  STOCK_IN: '生产入库',
  STOCK_RETURN: '生产退料',
  STOCK_OUT: '领料发出',
};

export function formatFlowDateTime(ts: string): string {
  if (!ts || !ts.toString().trim()) return '—';
  const d = new Date(ts.toString());
  if (isNaN(d.getTime())) return ts.toString();
  const hasTime =
    d.getHours() !== 0 ||
    d.getMinutes() !== 0 ||
    d.getSeconds() !== 0 ||
    (ts.toString().length > 10 && /[T\s]/.test(ts.toString()));
  return hasTime
    ? d.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      })
    : d.toLocaleDateString('zh-CN');
}

export function toFlowDateStr(ts: string): string {
  if (!ts || !ts.toString().trim()) return '';
  const d = new Date(ts.toString());
  if (isNaN(d.getTime())) return ts.toString().slice(0, 10);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export interface WarehouseFlowRow {
  id: string;
  type: string;
  typeLabel: string;
  docNumber: string;
  dateStr: string;
  displayDateTime: string;
  productId: string;
  productName: string;
  productSku: string;
  quantity: number;
  warehouseId?: string;
  warehouseName: string;
  isOutbound: boolean;
  partner: string;
  // 业务行带 any 是因为 PSI/Production 记录形状高度异构（schema 在迁移中），
  // 调用方仅用于打印/详情透传，不做强类型解构。
  record: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  _sortTs?: number;
}

export interface ComputeWarehouseFlowRowsInput {
  // 同样原因，PSI 与 Production 记录都用宽口径接收。
  recordsList: any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
  prodRecords: any[] | null | undefined; // eslint-disable-line @typescript-eslint/no-explicit-any
  productMapPSI: Map<string, Product>;
  warehouseMapPSI: Map<string, Warehouse>;
  ordersList: { id: string; orderNumber?: string }[];
  parseRecordTime: (r: any) => number; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export function computeWarehouseFlowRows(input: ComputeWarehouseFlowRowsInput): WarehouseFlowRow[] {
  const { recordsList, prodRecords, productMapPSI, warehouseMapPSI, ordersList, parseRecordTime } = input;
  const list = recordsList.filter(r => WAREHOUSE_FLOW_TYPES.includes(r.type));
  const psiRows: WarehouseFlowRow[] = list.map(r => {
    const product = productMapPSI.get(r.productId);
    const dateStr =
      toFlowDateStr((r.createdAt || r.timestamp || '').toString()) ||
      (r.createdAt || r.timestamp || '').toString().slice(0, 10);
    const dateOnly = dateStr;
    const displayDate = dateOnly || (r.timestamp || '—');
    const displayDateTime = formatFlowDateTime(r.timestamp || r.createdAt || '');
    const inboundWarehouseId = r.type === 'TRANSFER' ? r.toWarehouseId : r.warehouseId;
    const warehouseName =
      r.type === 'SALES_BILL'
        ? warehouseMapPSI.get(r.warehouseId)?.name ?? '—'
        : r.type === 'TRANSFER'
          ? r.toWarehouseId
            ? warehouseMapPSI.get(r.toWarehouseId)?.name ?? '—'
            : '—'
          : warehouseMapPSI.get(r.warehouseId)?.name ?? '—';
    const qty = r.quantity ?? 0;
    const isSalesReturn = r.type === 'SALES_BILL' && qty < 0;
    return {
      id: r.id,
      type: r.type,
      typeLabel: isSalesReturn ? '销售退货' : warehouseFlowTypeLabel[r.type] || r.type,
      docNumber: r.docNumber || '—',
      dateStr: displayDate,
      displayDateTime,
      productId: r.productId,
      productName: product?.name ?? '—',
      productSku: product?.sku ?? '—',
      quantity: qty,
      warehouseId: inboundWarehouseId || r.warehouseId,
      warehouseName,
      isOutbound: r.type === 'SALES_BILL',
      partner: r.partner ?? '—',
      record: r,
    };
  });

  const buildProdRow = (
    type: 'STOCK_IN' | 'STOCK_RETURN' | 'STOCK_OUT',
    typeLabel: string,
    fallbackDocPrefix: string,
    isOutbound: boolean,
  ): WarehouseFlowRow[] => {
    const filtered = (prodRecords || []).filter(r => r.type === type);
    return filtered.map(r => {
      const product = productMapPSI.get(r.productId);
      const order = ordersList.find(o => o.id === r.orderId);
      const dateStr =
        toFlowDateStr((r.timestamp || '').toString()) || (r.timestamp || '').toString().slice(0, 10);
      const displayDate = dateStr || '—';
      const docNumber =
        r.docNo ||
        (order?.orderNumber ? `${fallbackDocPrefix}-${order.orderNumber}` : `${fallbackDocPrefix.slice(0, 2)}-${r.id}`);
      return {
        id: r.id,
        type,
        typeLabel,
        docNumber,
        dateStr: displayDate,
        displayDateTime: formatFlowDateTime(r.timestamp || ''),
        productId: r.productId,
        productName: product?.name ?? '—',
        productSku: product?.sku ?? '—',
        quantity: r.quantity ?? 0,
        warehouseId: r.warehouseId,
        warehouseName: warehouseMapPSI.get(r.warehouseId)?.name ?? '—',
        isOutbound,
        partner: '—',
        record: r,
      };
    });
  };

  const stockInRows = buildProdRow('STOCK_IN', '生产入库', '工单入库', false);
  const stockReturnRows = buildProdRow('STOCK_RETURN', '生产退料', '退料', false);
  const stockOutRows = buildProdRow('STOCK_OUT', '领料发出', '领料', true);

  const allRows = [...psiRows, ...stockInRows, ...stockReturnRows, ...stockOutRows];
  const groups = new Map<string, WarehouseFlowRow[]>();
  allRows.forEach(r => {
    const key = `${r.type}|${r.docNumber}|${r.productId}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  });
  return Array.from(groups.entries())
    .map(([key, rows]) => {
      const tsList = rows.map(r => parseRecordTime(r.record)).filter(t => !Number.isNaN(t) && t > 0);
      const minTs = tsList.length ? Math.min(...tsList) : 0;
      const displayRow = rows.reduce((best, cur) => {
        const tb = parseRecordTime(best.record);
        const tc = parseRecordTime(cur.record);
        if (Number.isNaN(tc) || tc <= 0) return best;
        if (Number.isNaN(tb) || tb <= 0) return cur;
        return tc < tb ? cur : best;
      }, rows[0]);
      const totalQty = rows.reduce((s, r) => s + r.quantity, 0);
      return { ...displayRow, id: key, quantity: totalQty, _sortTs: minTs };
    })
    .sort(
      (a, b) => (b._sortTs ?? 0) - (a._sortTs ?? 0) || String(a.id).localeCompare(String(b.id)),
    );
}

export interface WarehouseFlowTotals {
  inboundTotal: number;
  outboundTotal: number;
  netChange: number;
}

/** 流水数量展示：保留至多 2 位小数，去掉无意义尾零。 */
export function formatWarehouseFlowQty(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/\.?0+$/, '');
}

/**
 * 对仓库流水展示行按库存口径汇总「入库 / 出库 / 净变化」。
 * 与 `docs/01-business-rules.md` 库存方向一致；盘点用 `diffQuantity`（非实盘数量）。
 */
export function computeWarehouseFlowTotals(
  rows: ReadonlyArray<Pick<WarehouseFlowRow, 'type' | 'quantity' | 'record'>>,
): WarehouseFlowTotals {
  let inboundTotal = 0;
  let outboundTotal = 0;

  for (const row of rows) {
    const qty = Number(row.quantity) || 0;
    switch (row.type) {
      case 'PURCHASE_BILL':
      case 'STOCK_IN':
      case 'STOCK_RETURN':
      case 'TRANSFER':
        inboundTotal += Math.abs(qty);
        break;
      case 'STOCK_OUT':
        outboundTotal += Math.abs(qty);
        break;
      case 'SALES_BILL':
        if (qty >= 0) outboundTotal += qty;
        else inboundTotal += Math.abs(qty);
        break;
      case 'STOCKTAKE': {
        const rec = row.record as { diffQuantity?: number | string | null; diff_quantity?: number | string | null };
        const diff = Number(rec?.diffQuantity ?? rec?.diff_quantity ?? 0);
        if (diff > 0) inboundTotal += diff;
        else if (diff < 0) outboundTotal += Math.abs(diff);
        break;
      }
      default:
        break;
    }
  }

  return {
    inboundTotal,
    outboundTotal,
    netChange: inboundTotal - outboundTotal,
  };
}
