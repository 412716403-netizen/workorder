/**
 * 待入库面板 - 列表 (Phase P7 抽离自 PendingStockPanel)。
 *
 * 含:
 * - 顶部操作区 (批量入库 / 入库流水按钮)
 * - 待入库表格 (含勾选 + 单选入库按钮)
 *
 * 注意: 主壳负责弹窗外壳 (DocPhaseModal),本组件只渲染列表内容。
 */
import React from 'react';
import { History } from 'lucide-react';
import { ScanBatchTrigger } from '../../../components/scan/ScanBatchTrigger';
import type { Product, ProductCategory } from '../../../types';
import { buildStockInFormDefaultsForPending, type PendingStockItem } from '../pendingStockStockInHelpers';
import type { usePendingStockState } from '../../../hooks/usePendingStockState';

type Helper = ReturnType<typeof usePendingStockState>;

interface Props {
  helper: Helper;
  productionLinkMode: 'order' | 'product';
  productMap: Map<string, Product>;
  categoryMap: Map<string, ProductCategory>;
  hasPerm: (perm: string) => boolean;
}

const PendingStockTable: React.FC<Props> = ({ helper, productionLinkMode, productMap, categoryMap, hasPerm }) => {
  const {
    pendingStockOrders,
    selectedPendingRowKeys,
    setSelectedPendingRowKeys,
    togglePendingRowKey,
    setStockInOrder,
    setBatchStockInItems,
    setBatchStockForm,
    batchPendingStockInDefaultWh,
    singlePendingStockInDefaultWh,
    setStockInForm,
    setShowStockInFlowModal,
    getUnitName,
    confirmPendingListScan,
    resolvePendingListScanPreview,
  } = helper;

  const handleBatchSelectedClick = () => {
    const rows = pendingStockOrders.filter(i => selectedPendingRowKeys.has(i.rowKey));
    if (rows.length === 0) return;
    const lines: Record<string, { variantQuantities: Record<string, number>; singleQuantity: number }> = {};
    rows.forEach(it => {
      const pitProduct = productMap.get(it.order.productId);
      lines[it.rowKey] = buildStockInFormDefaultsForPending(
        it,
        pitProduct,
        pitProduct ? categoryMap.get(pitProduct.categoryId) : undefined,
      );
    });
    setStockInOrder(null);
    setBatchStockForm({ warehouseId: batchPendingStockInDefaultWh(), customData: {}, lines });
    setBatchStockInItems(rows);
  };

  const handleSelectSingleClick = (item: PendingStockItem) => {
    setBatchStockInItems(null);
    setBatchStockForm({ warehouseId: '', customData: {}, lines: {} });
    setStockInOrder(item);
    const pRow = productMap.get(item.order.productId);
    const d = buildStockInFormDefaultsForPending(item, pRow, pRow ? categoryMap.get(pRow.categoryId) : undefined);
    setStockInForm({
      warehouseId: singlePendingStockInDefaultWh(),
      variantQuantities: d.variantQuantities,
      singleQuantity: d.singleQuantity,
      customData: {},
    });
  };

  return (
    <>
      <div className="-mx-4 -mt-4 sm:-mx-6 sm:-mt-6 mb-4 px-6 py-3 border-b border-slate-100 flex items-center gap-2 flex-wrap justify-between">
        <p className="text-xs font-bold text-slate-500 tabular-nums">
          {pendingStockOrders.length > 0 ? `共 ${pendingStockOrders.length} 笔待入库` : ''}
        </p>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {hasPerm('production:orders_pending_stock_in:create') && pendingStockOrders.length > 0 && (
            <ScanBatchTrigger
              onApply={confirmPendingListScan}
              resolveRowPreview={resolvePendingListScanPreview}
              hint="扫码入库"
              modalTitle="待入库 · 批量扫码"
              modalHint="在清单中扫入批次码或单品码，确认后进入「确认入库」页核对仓库与数量。"
              showScanIntentToggle
              defaultScanIntent="BATCH"
            />
          )}
          {hasPerm('production:orders_pending_stock_in:create') && pendingStockOrders.length > 0 && (
            <button
              type="button"
              disabled={selectedPendingRowKeys.size === 0}
              onClick={handleBatchSelectedClick}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              批量入库（{selectedPendingRowKeys.size}/{pendingStockOrders.length}）
            </button>
          )}
          {hasPerm('production:orders_pending_stock_in:view') && (
            <button
              onClick={() => setShowStockInFlowModal(true)}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-indigo-600 bg-indigo-50 rounded-xl hover:bg-indigo-100 transition-all"
            >
              <History className="w-4 h-4" /> 入库流水
            </button>
          )}
        </div>
      </div>
      {pendingStockOrders.length === 0 ? (
        <p className="text-slate-500 text-center py-12">暂无待入库工单（有完成数量且待入库&gt;0 的工单将显示在此）</p>
      ) : (
        <div className="border border-slate-200 rounded-2xl overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                {hasPerm('production:orders_pending_stock_in:create') && (
                  <th className="px-2 py-3 w-10 text-center">
                    <input
                      type="checkbox"
                      title="全选"
                      checked={
                        pendingStockOrders.length > 0 &&
                        pendingStockOrders.every(i => selectedPendingRowKeys.has(i.rowKey))
                      }
                      onChange={() => {
                        const all = pendingStockOrders.every(i => selectedPendingRowKeys.has(i.rowKey));
                        if (all) setSelectedPendingRowKeys(new Set());
                        else setSelectedPendingRowKeys(new Set(pendingStockOrders.map(i => i.rowKey)));
                      }}
                      className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                  </th>
                )}
                {productionLinkMode !== 'product' && (
                  <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase">工单号</th>
                )}
                <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase">产品</th>
                <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">
                  {productionLinkMode === 'product' ? '产品工单总数' : '工单总量'}
                </th>
                {productionLinkMode === 'product' && (
                  <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">产品总入库</th>
                )}
                {productionLinkMode !== 'product' && (
                  <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">已入库</th>
                )}
                <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase text-right">
                  {productionLinkMode === 'product' ? '本单待入库' : '待入库'}
                </th>
                <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase w-28"></th>
              </tr>
            </thead>
            <tbody>
              {pendingStockOrders.map(item => {
                const unitName = getUnitName(item.order.productId);
                return (
                  <tr
                    key={item.rowKey}
                    className={`border-b border-slate-100 hover:bg-slate-50/50${
                      hasPerm('production:orders_pending_stock_in:create') ? ' cursor-pointer' : ''
                    }`}
                    onClick={
                      hasPerm('production:orders_pending_stock_in:create')
                        ? () => togglePendingRowKey(item.rowKey)
                        : undefined
                    }
                  >
                    {hasPerm('production:orders_pending_stock_in:create') && (
                      <td className="px-2 py-3 text-center align-middle" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedPendingRowKeys.has(item.rowKey)}
                          onChange={() => togglePendingRowKey(item.rowKey)}
                          className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                      </td>
                    )}
                    {productionLinkMode !== 'product' && (
                      <td className="px-4 py-3 font-bold text-slate-800">{item.order.orderNumber}</td>
                    )}
                    <td className="px-4 py-3 text-slate-700">{item.order.productName}</td>
                    <td className="px-4 py-3 text-slate-600 text-right">
                      {productionLinkMode === 'product' ? item.productBlockOrderTotal : item.orderTotal} {unitName}
                    </td>
                    {productionLinkMode === 'product' && (
                      <td className="px-4 py-3 text-slate-600 text-right">
                        {item.productTotalStockIn ?? 0} {unitName}
                      </td>
                    )}
                    {productionLinkMode !== 'product' && (
                      <td className="px-4 py-3 text-slate-600 text-right">
                        {item.alreadyIn} {unitName}
                      </td>
                    )}
                    <td className="px-4 py-3 font-bold text-indigo-600 text-right">
                      {item.pendingTotal} {unitName}
                    </td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      {hasPerm('production:orders_pending_stock_in:create') && (
                        <button
                          type="button"
                          onClick={() => handleSelectSingleClick(item)}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700"
                        >
                          选择入库
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
};

export default PendingStockTable;
