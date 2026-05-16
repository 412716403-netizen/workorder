/**
 * 返工/返工报工流水详情弹窗 (主壳, P9 拆分后)。
 *
 * 拆分对照:
 * - hooks/useReworkReportFlowDetail.ts       — editing state + 派生计算 + startEdit/saveEdit/handleDelete
 * - views/production-ops/rework-detail/ReworkProductInfoCell.tsx   — 共用产品 / SKU / 自定义字段标签单元格
 * - views/production-ops/rework-detail/ReworkVariantRowsTable.tsx  — 详情(只读)视图
 * - views/production-ops/rework-detail/ReworkEditFlow.tsx          — 编辑视图(含三种表格分支)
 *
 * 主壳只保留:
 * - props 接收
 * - 顶部保存按钮 portal(编辑模式)
 * - DocPhaseModal 编排 + 打印按钮 wrap
 */
import React, { useContext } from 'react';
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';
import {
  ProductionOpRecord,
  ProductionOrder,
  Product,
  ProductCategory,
  GlobalNodeTemplate,
  AppDictionaries,
  Worker,
  ReworkFormSettings,
  PrintTemplate,
} from '../../types';
import { hasOpsPerm } from './types';
import { OrderCenterDetailPrintBlock } from '../../components/order-print/OrderCenterDetailPrintBlock';
import { useEquipmentFeaturesEffective } from '../../hooks/useEquipmentFeaturesEffective';
import DocPhaseModal, { DocPhaseEditToolbarPortalContext } from '../../components/DocPhaseModal';
import { useAuth } from '../../contexts/AuthContext';
import { useReworkReportFlowDetail } from '../../hooks/useReworkReportFlowDetail';
import ReworkVariantRowsTable from './rework-detail/ReworkVariantRowsTable';
import ReworkEditFlow from './rework-detail/ReworkEditFlow';

function ReworkFlowEditSavePortal({ active, onSave }: { active: boolean; onSave: () => void }) {
  const host = useContext(DocPhaseEditToolbarPortalContext);
  if (!active || !host) return null;
  return createPortal(
    <button
      type="button"
      onClick={onSave}
      className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700"
    >
      <Check className="w-4 h-4" /> 保存
    </button>,
    host,
  );
}

export interface ReworkReportFlowDetailModalProps {
  productionLinkMode: 'order' | 'product';
  reworkFlowDetailRecord: ProductionOpRecord;
  records: ProductionOpRecord[];
  orders: ProductionOrder[];
  products: Product[];
  categories?: ProductCategory[];
  globalNodes: GlobalNodeTemplate[];
  dictionaries?: AppDictionaries;
  workers: Worker[];
  equipment: { id: string; name: string; code?: string; assignedMilestoneIds?: string[] }[];
  userPermissions?: string[];
  tenantRole?: string;
  reworkFormSettings?: ReworkFormSettings;
  printTemplates?: PrintTemplate[];
  onOpenReworkFormPrintTab?: () => void;
  onUpdateRecord?: (record: ProductionOpRecord) => void;
  onDeleteRecord?: (recordId: string) => void;
  /** 编辑补录新规格（返工报工流水 REWORK_REPORT） */
  onAddRecord?: (record: ProductionOpRecord) => void | Promise<void>;
  onClose: () => void;
}

const ReworkReportFlowDetailModal: React.FC<ReworkReportFlowDetailModalProps> = ({
  productionLinkMode,
  reworkFlowDetailRecord,
  records,
  orders,
  products,
  categories = [],
  globalNodes,
  dictionaries,
  workers,
  equipment,
  userPermissions,
  tenantRole,
  reworkFormSettings,
  printTemplates = [],
  onOpenReworkFormPrintTab,
  onUpdateRecord,
  onDeleteRecord,
  onAddRecord,
  onClose,
}) => {
  const { tenantCtx } = useAuth();
  const equipmentFeaturesOn = useEquipmentFeaturesEffective();

  const helper = useReworkReportFlowDetail({
    productionLinkMode,
    reworkFlowDetailRecord,
    records,
    orders,
    products,
    categories,
    globalNodes,
    dictionaries,
    workers,
    equipment,
    reworkFormSettings,
    tenantName: tenantCtx?.tenantName,
    onUpdateRecord,
    onDeleteRecord,
    onAddRecord,
    onClose,
  });

  const {
    editing,
    setEditing,
    first,
    order,
    product,
    isReportDetail,
    buildPrintContext,
    startEdit,
    saveEdit,
    handleDelete,
  } = helper;

  if (!first) return null;

  return (
    <DocPhaseModal
      zIndexClass="z-[90]"
      open
      phase={editing ? 'edit' : 'detail'}
      editingDocNumber={first.docNo || '—'}
      maxWidthClass="max-w-4xl"
      detailTitle={isReportDetail ? '返工报工流水详情' : '返工详情'}
      editTitle={isReportDetail ? '返工报工流水 · 编辑' : '返工 · 编辑'}
      newTitle=""
      leadingDetailActions={
        isReportDetail ? (
          <OrderCenterDetailPrintBlock
            printSlot={reworkFormSettings?.reworkCenterPrint?.reworkReportFlowDetail}
            printTemplates={printTemplates}
            buildContext={buildPrintContext}
            onAddPrintTemplate={onOpenReworkFormPrintTab}
            pickerSubtitle={`返工报工流水 ${first.docNo ?? '—'}`}
          />
        ) : null
      }
      hasPerm={perm => hasOpsPerm(tenantRole, userPermissions, perm)}
      viewPerm="production:rework_records:view"
      editPerm="production:rework_records:edit"
      deletePerm={onDeleteRecord ? 'production:rework_records:delete' : undefined}
      deleteConfirmMessage="确定要删除该返工单的所有记录吗？此操作不可恢复。"
      onDelete={onDeleteRecord ? handleDelete : undefined}
      renderDocBadge={() =>
        productionLinkMode === 'product' ? (
          <span className="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider">
            {product?.name ?? '—'}
          </span>
        ) : (
          <span className="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider">
            {order?.orderNumber ?? '—'}
          </span>
        )
      }
      onClose={onClose}
      onEnterEdit={startEdit}
      onCancelEdit={() => setEditing(null)}
      renderContent={() => (
        <>
          <ReworkFlowEditSavePortal active={!!editing} onSave={saveEdit} />
          <div className="space-y-4 min-h-0">
            {editing ? (
              <ReworkEditFlow
                productionLinkMode={productionLinkMode}
                helper={helper}
                editing={editing}
                setEditing={setEditing}
                globalNodes={globalNodes}
                dictionaries={dictionaries}
                workers={workers}
                equipment={equipment}
                equipmentFeaturesOn={equipmentFeaturesOn}
                first={first}
                order={order}
                product={product}
              />
            ) : (
              <ReworkVariantRowsTable
                productionLinkMode={productionLinkMode}
                helper={helper}
                globalNodes={globalNodes}
                dictionaries={dictionaries}
                first={first}
                order={order}
                product={product}
              />
            )}
          </div>
        </>
      )}
    />
  );
};

export default React.memo(ReworkReportFlowDetailModal);
