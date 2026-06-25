/**
 * 待入库面板 (主壳, Phase P7 拆分后)。
 *
 * 拆分对照:
 * - utils/pendingStockRecordBuilders.ts                      — 单条/批量 STOCK_IN records 构造(纯函数)
 * - hooks/usePendingStockState.ts                            — state + handler + 扫码 + 提交集中
 * - views/order-list/pending-stock/PendingStockTable.tsx     — 列表(含 actions + 表格)
 * - views/order-list/pending-stock/PendingStockBatchModal.tsx — 批量入库模态
 * - views/order-list/pending-stock/PendingStockSingleModal.tsx — 单条入库模态(含扫码)
 *
 * 主壳只负责:
 * - props 接收 + hook 装配
 * - 渲染分支:批量模态 / 单条模态 / 列表三选一(均用 DocPhaseModal)
 * - StockInFlowModal 编排
 * - 文件预览
 */
import React from 'react';
import { X } from 'lucide-react';
import {
  ProductionOrder,
  Product,
  GlobalNodeTemplate,
  AppDictionaries,
  BOM,
  ProductionOpRecord,
  Warehouse,
  ProductCategory,
  ProcessSequenceMode,
  ProductMilestoneProgress,
  OrderFormSettings,
  PrintTemplate,
} from '../../types';
import DocPhaseModal from '../../components/DocPhaseModal';
import { usePendingStockState } from '../../hooks/usePendingStockState';
import PendingStockTable from './pending-stock/PendingStockTable';
import PendingStockBatchModal from './pending-stock/PendingStockBatchModal';
import PendingStockSingleModal from './pending-stock/PendingStockSingleModal';
import { StockInFlowModal } from './StockInFlowModal';

interface PendingStockPanelProps {
  open: boolean;
  onClose: () => void;
  orders: ProductionOrder[];
  products: Product[];
  categories: ProductCategory[];
  globalNodes: GlobalNodeTemplate[];
  prodRecords: ProductionOpRecord[];
  warehouses: Warehouse[];
  dictionaries: AppDictionaries;
  boms: BOM[];
  productMilestoneProgresses: ProductMilestoneProgress[];
  productionLinkMode: 'order' | 'product';
  processSequenceMode: ProcessSequenceMode;
  /** 受 SystemSetting.allowExceedMaxStockInQty 控制：true 时入库数量可超过待入库上限 */
  allowExceedMaxStockInQty?: boolean;
  orderFormSettings: OrderFormSettings;
  printTemplates: PrintTemplate[];
  onOpenOrderFormPrintTab?: () => void;
  onAddRecord?: (record: ProductionOpRecord) => void;
  onAddRecordBatch?: (records: ProductionOpRecord[]) => Promise<void>;
  onUpdateRecord?: (record: ProductionOpRecord) => void;
  onDeleteRecord?: (recordId: string) => void;
  userPermissions?: string[];
  tenantRole?: string;
}

const PendingStockPanel: React.FC<PendingStockPanelProps> = ({
  open,
  onClose,
  orders,
  products,
  categories,
  globalNodes,
  prodRecords,
  warehouses,
  dictionaries,
  productMilestoneProgresses,
  productionLinkMode,
  processSequenceMode,
  allowExceedMaxStockInQty = false,
  orderFormSettings,
  printTemplates,
  onOpenOrderFormPrintTab,
  onAddRecord,
  onAddRecordBatch,
  onUpdateRecord,
  onDeleteRecord,
  userPermissions,
  tenantRole,
}) => {
  const stockInCustomFieldDefs = orderFormSettings.stockInCustomFields ?? [];

  const helper = usePendingStockState({
    open,
    onClose,
    orders,
    products,
    categories,
    globalNodes,
    prodRecords,
    warehouses,
    dictionaries,
    productMilestoneProgresses,
    productionLinkMode,
    processSequenceMode,
    allowExceedMaxStockInQty,
    onAddRecord,
    onAddRecordBatch,
  });
  const {
    productMap,
    categoryMap,
    pendingStockOrders,
    stockInOrder,
    batchStockInItems,
    showStockInFlowModal,
    setShowStockInFlowModal,
    stockInFilePreview,
    setStockInFilePreview,
    todayDate,
  } = helper;

  const hasPerm = (perm: string): boolean => {
    if (tenantRole === 'owner') return true;
    if (!userPermissions || userPermissions.length === 0) return true;
    if (userPermissions.includes('production') && !userPermissions.some(p => p.startsWith('production:'))) return true;
    if (userPermissions.includes(perm)) return true;
    return false;
  };

  if (!open) return null;

  return (
    <>
      {batchStockInItems && batchStockInItems.length > 0 ? (
        <PendingStockBatchModal
          helper={helper}
          warehouses={warehouses}
          dictionaries={dictionaries}
          stockInCustomFieldDefs={stockInCustomFieldDefs}
          productionLinkMode={productionLinkMode}
          productMap={productMap}
          categoryMap={categoryMap}
          onAddRecord={onAddRecord}
          onAddRecordBatch={onAddRecordBatch}
        />
      ) : stockInOrder ? (
        <PendingStockSingleModal
          helper={helper}
          warehouses={warehouses}
          dictionaries={dictionaries}
          stockInCustomFieldDefs={stockInCustomFieldDefs}
          productionLinkMode={productionLinkMode}
          productMap={productMap}
          categoryMap={categoryMap}
          onAddRecord={onAddRecord}
          onAddRecordBatch={onAddRecordBatch}
        />
      ) : (
        <DocPhaseModal
          open
          phase="detail"
          editingDocNumber={null}
          maxWidthClass="max-w-4xl"
          zIndexClass="z-[85]"
          detailTitle=""
          editTitle=""
          newTitle={pendingStockOrders.length > 0 ? `待入库清单（${pendingStockOrders.length}）` : '待入库清单'}
          hasPerm={() => false}
          viewPerm=""
          editPerm=""
          onClose={onClose}
          onEnterEdit={() => {}}
          onCancelEdit={() => {}}
          renderContent={() => (
            <PendingStockTable
              helper={helper}
              productionLinkMode={productionLinkMode}
              productMap={productMap}
              categoryMap={categoryMap}
              hasPerm={hasPerm}
            />
          )}
        />
      )}

      <StockInFlowModal
        open={showStockInFlowModal}
        onClose={() => setShowStockInFlowModal(false)}
        todayDate={todayDate}
        orders={orders}
        products={products}
        productMap={productMap}
        categoryMap={categoryMap}
        warehouses={warehouses}
        dictionaries={dictionaries}
        productionLinkMode={productionLinkMode}
        orderFormSettings={orderFormSettings}
        printTemplates={printTemplates}
        onOpenOrderFormPrintTab={onOpenOrderFormPrintTab}
        onAddRecord={onAddRecord}
        onUpdateRecord={onUpdateRecord}
        onDeleteRecord={onDeleteRecord}
        hasPerm={hasPerm}
        onFilePreview={(url, type) => setStockInFilePreview({ url, type })}
      />

      {stockInFilePreview && (
        <div
          className="fixed inset-0 z-[140] flex items-center justify-center p-8 bg-slate-900/80 backdrop-blur-sm"
          onClick={() => setStockInFilePreview(null)}
        >
          <button
            type="button"
            onClick={() => setStockInFilePreview(null)}
            className="absolute right-6 top-6 z-10 rounded-full bg-white/20 p-2 text-white transition-all hover:bg-white/40"
            aria-label="关闭预览"
          >
            <X className="h-8 w-8" />
          </button>
          <div
            className="relative z-10 max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            {stockInFilePreview.type === 'image' ? (
              <img src={stockInFilePreview.url} alt="预览" className="max-h-[85vh] w-full object-contain" />
            ) : (
              <iframe src={stockInFilePreview.url} title="PDF 预览" className="h-[85vh] w-full border-0" sandbox="allow-same-origin" />
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default React.memo(PendingStockPanel);
