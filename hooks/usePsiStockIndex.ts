import { useMemo, useCallback } from 'react';
import { recordDocLineTimeMs } from '../utils/flowDocSort';

type WhBucket = {
  psiIn: number; psiOut: number;
  transferIn: number; transferOut: number;
  prodIn: number; prodOut: number;
  stocktakeAdj: number; stocktakeByDoc: Map<string, number>;
};
type TimedQty = { time: number; qty: number };
type VarBucket = {
  psiIn: number; psiOut: number;
  transferIn: number; transferOut: number;
  prodIn: number; prodOut: number;
  stocktakeRecords: { time: number; qty: number; sysQty: number; id: string }[];
  psiInRecords: TimedQty[]; psiOutRecords: TimedQty[];
  prodInRecords: TimedQty[]; prodOutRecords: TimedQty[];
};

/** 与 `PsiRecord.batchNo` / `ProductionOpRecord.batchNo` 对齐的按仓按批结存桶 */
type BatchBucket = {
  psiIn: number;
  psiOut: number;
  transferIn: number;
  transferOut: number;
  prodIn: number;
  prodOut: number;
  stocktakeAdj: number;
};

function lineBatchNo(r: { batchNo?: string | null; batch?: string | null }): string {
  const raw = r.batchNo ?? r.batch;
  return typeof raw === 'string' ? raw.trim() : '';
}

function buildStockIndex(recordsList: any[], prodRecords: any[]) {
  const whMap = new Map<string, WhBucket>();
  const varMap = new Map<string, VarBucket>();
  const batchMap = new Map<string, BatchBucket>();

  const getBatch = (pId: string, whId: string, batchNo: string): BatchBucket => {
    const k = `${pId}::${whId}::${batchNo}`;
    let b = batchMap.get(k);
    if (!b) {
      b = { psiIn: 0, psiOut: 0, transferIn: 0, transferOut: 0, prodIn: 0, prodOut: 0, stocktakeAdj: 0 };
      batchMap.set(k, b);
    }
    return b;
  };

  const getWh = (pId: string, whId: string): WhBucket => {
    const k = `${pId}::${whId}`;
    let b = whMap.get(k);
    if (!b) { b = { psiIn: 0, psiOut: 0, transferIn: 0, transferOut: 0, prodIn: 0, prodOut: 0, stocktakeAdj: 0, stocktakeByDoc: new Map() }; whMap.set(k, b); }
    return b;
  };
  const getVar = (pId: string, whId: string, vId: string): VarBucket => {
    const k = `${pId}::${whId}::${vId}`;
    let b = varMap.get(k);
    if (!b) { b = { psiIn: 0, psiOut: 0, transferIn: 0, transferOut: 0, prodIn: 0, prodOut: 0, stocktakeRecords: [], psiInRecords: [], psiOutRecords: [], prodInRecords: [], prodOutRecords: [] }; varMap.set(k, b); }
    return b;
  };

  for (const r of recordsList) {
    const pId = r.productId;
    if (!pId) continue;
    const wh = r.warehouseId || '';
    const vId = (r as any).variantId || '';
    const qty = Number(r.quantity) || 0;
    const time = recordDocLineTimeMs(r);
    const bn = lineBatchNo(r);

    if (r.type === 'PURCHASE_BILL') {
      if (wh) {
        const wb = getWh(pId, wh);
        wb.psiIn += qty;
        if (vId) {
          const vb = getVar(pId, wh, vId);
          vb.psiIn += qty;
          vb.psiInRecords.push({ time, qty });
        }
        if (bn) getBatch(pId, wh, bn).psiIn += qty;
      }
    } else if (r.type === 'SALES_BILL') {
      if (wh) {
        const wb = getWh(pId, wh);
        wb.psiOut += qty;
        if (vId) {
          const vb = getVar(pId, wh, vId);
          vb.psiOut += qty;
          vb.psiOutRecords.push({ time, qty });
        }
        if (bn) getBatch(pId, wh, bn).psiOut += qty;
      }
    } else if (r.type === 'TRANSFER') {
      const toWh = (r as any).toWarehouseId as string | undefined;
      const fromWh = (r as any).fromWarehouseId as string | undefined;
      if (toWh) {
        const wb = getWh(pId, toWh);
        wb.transferIn += qty;
        if (vId) {
          const vb = getVar(pId, toWh, vId);
          vb.transferIn += qty;
          vb.psiInRecords.push({ time, qty });
        }
        if (bn) getBatch(pId, toWh, bn).transferIn += qty;
      }
      if (fromWh) {
        const wb = getWh(pId, fromWh);
        wb.transferOut += qty;
        if (vId) {
          const vb = getVar(pId, fromWh, vId);
          vb.transferOut += qty;
          vb.psiOutRecords.push({ time, qty });
        }
        if (bn) getBatch(pId, fromWh, bn).transferOut += qty;
      }
    } else if (r.type === 'STOCKTAKE') {
      if (wh) {
        const wb = getWh(pId, wh);
        const diff = Number(r.diffQuantity) || 0;
        wb.stocktakeAdj += diff;
        const doc = r.docNumber || '';
        wb.stocktakeByDoc.set(doc, (wb.stocktakeByDoc.get(doc) || 0) + diff);
        if (vId && typeof (r as any).systemQuantity === 'number') {
          getVar(pId, wh, vId).stocktakeRecords.push({ time, qty, sysQty: (r as any).systemQuantity, id: r.id });
        }
        if (bn) getBatch(pId, wh, bn).stocktakeAdj += diff;
      }
    }
  }

  for (const r of (prodRecords || []) as any[]) {
    const pId = r.productId;
    if (!pId) continue;
    const wh = r.warehouseId || '';
    const vId = r.variantId || '';
    const qty = Number(r.quantity) || 0;
    const time = recordDocLineTimeMs(r);
    const bn = lineBatchNo(r);

    if (r.type === 'STOCK_IN' || r.type === 'STOCK_RETURN') {
      if (wh) {
        getWh(pId, wh).prodIn += qty;
        const vb = getVar(pId, wh, vId);
        vb.prodIn += qty;
        vb.prodInRecords.push({ time, qty });
        if (bn) getBatch(pId, wh, bn).prodIn += qty;
      }
    } else if (r.type === 'STOCK_OUT') {
      if (wh) {
        getWh(pId, wh).prodOut += qty;
        const vb = getVar(pId, wh, vId);
        vb.prodOut += qty;
        vb.prodOutRecords.push({ time, qty });
        if (bn) getBatch(pId, wh, bn).prodOut += qty;
      }
    }
  }

  return { whMap, varMap, batchMap };
}

export function usePsiStockIndex(recordsList: any[], prodRecords: any[]) {
  const stockIndex = useMemo(
    () => buildStockIndex(recordsList, prodRecords),
    [recordsList, prodRecords],
  );

  const getStock = useCallback((pId: string, whId?: string, excludeDocNumber?: string) => {
    if (!whId) return 0;
    const b = stockIndex.whMap.get(`${pId}::${whId}`);
    if (!b) return 0;
    const ins = b.psiIn + b.transferIn + b.prodIn;
    const outs = b.psiOut + b.transferOut + b.prodOut;
    const adj = b.stocktakeAdj - (excludeDocNumber ? (b.stocktakeByDoc.get(excludeDocNumber) || 0) : 0);
    return ins - outs + adj;
  }, [stockIndex]);

  const getStockVariant = useCallback((pId: string, whId: string | undefined, variantId: string) => {
    if (!whId) return 0;
    const vb = stockIndex.varMap.get(`${pId}::${whId}::${variantId}`);
    if (!vb) return 0;
    return (vb.psiIn + vb.transferIn + vb.prodIn) - (vb.psiOut + vb.transferOut + vb.prodOut);
  }, [stockIndex]);

  const getNullVariantProdStock = useCallback((pId: string, whId?: string) => {
    if (!whId) return 0;
    const vb = stockIndex.varMap.get(`${pId}::${whId}::`);
    if (!vb) return 0;
    return Math.max(0, vb.prodIn - vb.prodOut);
  }, [stockIndex]);

  const getStocktakeAdjust = useCallback((pId: string, whId: string) => {
    const b = stockIndex.whMap.get(`${pId}::${whId}`);
    return b ? b.stocktakeAdj : 0;
  }, [stockIndex]);

  const getVariantDisplayQty = useCallback((pId: string, whId: string, variantId: string) => {
    const vb = stockIndex.varMap.get(`${pId}::${whId}::${variantId}`);
    if (!vb || vb.stocktakeRecords.length === 0) return getStockVariant(pId, whId, variantId);
    const latest = vb.stocktakeRecords.reduce((best, r) => r.time > best.time ? r : best);
    const latestTime = latest.time;
    const insAfter =
      vb.psiInRecords.filter(r => r.time >= latestTime).reduce((s, r) => s + r.qty, 0) +
      vb.prodInRecords.filter(r => r.time >= latestTime).reduce((s, r) => s + r.qty, 0);
    const outsAfter =
      vb.psiOutRecords.filter(r => r.time >= latestTime).reduce((s, r) => s + r.qty, 0) +
      vb.prodOutRecords.filter(r => r.time >= latestTime).reduce((s, r) => s + r.qty, 0);
    const adjustAfter = vb.stocktakeRecords.filter(r => r.id !== latest.id && r.time >= latestTime)
      .reduce((s, r) => s + (r.qty - r.sysQty), 0);
    return latest.qty + insAfter - outsAfter + adjustAfter;
  }, [stockIndex, getStockVariant]);

  const getBatchStock = useCallback((pId: string, whId: string | undefined, batchNo: string) => {
    if (!whId || !batchNo) return 0;
    const b = stockIndex.batchMap.get(`${pId}::${whId}::${batchNo}`);
    if (!b) return 0;
    const ins = b.psiIn + b.transferIn + b.prodIn;
    const outs = b.psiOut + b.transferOut + b.prodOut;
    return Math.max(0, ins - outs + b.stocktakeAdj);
  }, [stockIndex]);

  const listAvailableBatches = useCallback((pId: string, whId: string | undefined) => {
    if (!whId) return [];
    const prefix = `${pId}::${whId}::`;
    const rows: { batchNo: string; stock: number }[] = [];
    for (const [k, b] of stockIndex.batchMap) {
      if (!k.startsWith(prefix)) continue;
      const batchNo = k.slice(prefix.length);
      if (!batchNo) continue;
      const ins = b.psiIn + b.transferIn + b.prodIn;
      const outs = b.psiOut + b.transferOut + b.prodOut;
      const stock = Math.max(0, ins - outs + b.stocktakeAdj);
      if (stock > 0) rows.push({ batchNo, stock });
    }
    rows.sort((a, b) => a.batchNo.localeCompare(b.batchNo, 'zh-CN'));
    return rows;
  }, [stockIndex]);

  return {
    getStock,
    getStockVariant,
    getNullVariantProdStock,
    getStocktakeAdjust,
    getVariantDisplayQty,
    getBatchStock,
    listAvailableBatches,
  };
}
