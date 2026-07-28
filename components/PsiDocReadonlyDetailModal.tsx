import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { PsiRecord } from '../types';
import { KnowledgeBizDocKind, PSI_ORDER_BILL_DOC_LABEL } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useConfigData, useMasterData } from '../contexts/AppDataContext';
import { psi as psiApi } from '../services/api';
import { formatPsiQtyDisplay } from '../utils/psiOpsAggregators';
import { PSI_DOC_TYPE_AMOUNT_KEY, canViewAmount } from '../utils/canViewAmount';
import { hasModulePerm } from '../utils/hasModulePerm';
import ProductImageLightbox, {
  type ProductImagePreviewTarget,
} from './ProductImageLightbox';
import AddTodoButton from './AddTodoButton';
import PsiOrderBillDocModal from '../views/psi-ops/PsiOrderBillDocModal';
import PsiDocDetailSummary from '../views/psi-ops/PsiDocDetailSummary';

export type PsiReadonlyDocKind =
  | KnowledgeBizDocKind.PURCHASE_BILL
  | KnowledgeBizDocKind.SALES_BILL;

export interface PsiDocReadonlyDetailModalProps {
  docKind: PsiReadonlyDocKind;
  docNumber: string | null;
  onClose: () => void;
  /** 默认抬高到资料库覆盖层之上 */
  zIndexClass?: string;
}

const KIND_META: Record<
  PsiReadonlyDocKind,
  {
    recordType: 'PURCHASE_BILL' | 'SALES_BILL';
    permSubmodule: 'purchase_bill' | 'sales_bill';
    detailTitle: string;
    todoSourceType: 'purchase_bill' | 'sales_bill';
    todoModuleLabel: string;
    todoHrefTab: 'PURCHASE_BILL' | 'SALES_BILL';
  }
> = {
  [KnowledgeBizDocKind.PURCHASE_BILL]: {
    recordType: 'PURCHASE_BILL',
    permSubmodule: 'purchase_bill',
    detailTitle: `${PSI_ORDER_BILL_DOC_LABEL.PURCHASE_BILL}详情`,
    todoSourceType: 'purchase_bill',
    todoModuleLabel: '采购入库',
    todoHrefTab: 'PURCHASE_BILL',
  },
  [KnowledgeBizDocKind.SALES_BILL]: {
    recordType: 'SALES_BILL',
    permSubmodule: 'sales_bill',
    detailTitle: `${PSI_ORDER_BILL_DOC_LABEL.SALES_BILL}详情`,
    todoSourceType: 'sales_bill',
    todoModuleLabel: '销售单',
    todoHrefTab: 'SALES_BILL',
  },
};

const noop = () => undefined;

/** 跨模块只读打开采购入库 / 销售单详情（按 type + docNumber 窄查） */
const PsiDocReadonlyDetailModal: React.FC<PsiDocReadonlyDetailModalProps> = ({
  docKind,
  docNumber,
  onClose,
  zIndexClass = 'z-[12000]',
}) => {
  const { tenantCtx } = useAuth();
  const tenantRole = tenantCtx?.tenantRole;
  const userPermissions = tenantCtx?.permissions;
  const m = useMasterData();
  const c = useConfigData();
  const [imagePreview, setImagePreview] = useState<ProductImagePreviewTarget | null>(null);

  const meta = KIND_META[docKind];
  const open = Boolean(docNumber);

  const hasPsiPerm = (perm: string) =>
    hasModulePerm(tenantRole, userPermissions, 'psi', perm)
    || (perm.endsWith(':view') && hasModulePerm(tenantRole, userPermissions, 'psi', `${perm}_own`));

  const query = useQuery({
    queryKey: ['kbPsiDocReadonly', docKind, docNumber],
    enabled: open && !!docNumber,
    queryFn: async (): Promise<PsiRecord[]> => {
      const rows = await psiApi.list({ type: meta.recordType, docNumber: docNumber! });
      return Array.isArray(rows) ? rows : [];
    },
    staleTime: 15_000,
  });

  const recordsList = query.data ?? [];

  useEffect(() => {
    if (!open || query.isLoading || query.isFetching) return;
    if (query.isError) {
      toast.error('加载单据失败');
      onClose();
      return;
    }
    if (query.isSuccess && recordsList.length === 0) {
      toast.error('未找到该单据，可能已删除');
      onClose();
    }
  }, [open, query.isLoading, query.isFetching, query.isError, query.isSuccess, recordsList.length, onClose]);

  const productMapPSI = useMemo(
    () => new Map(m.products.map(p => [p.id, p])),
    [m.products],
  );
  const warehouseMapPSI = useMemo(
    () => new Map(m.warehouses.map(w => [w.id, w])),
    [m.warehouses],
  );

  const getUnitName = (productId: string) => {
    const p = productMapPSI.get(productId);
    const u = (m.dictionaries.units ?? []).find(x => x.id === p?.unitId);
    return u?.name ?? 'PCS';
  };

  const amountKey = PSI_DOC_TYPE_AMOUNT_KEY[meta.recordType];
  const showAmount = amountKey
    ? canViewAmount(tenantRole, userPermissions, amountKey)
    : true;

  const headerCustomFieldDefs =
    docKind === KnowledgeBizDocKind.PURCHASE_BILL
      ? c.purchaseBillFormSettings.customFields
      : c.salesBillFormSettings.customFields;

  const showPurchaseBillRelatedProduct =
    docKind === KnowledgeBizDocKind.PURCHASE_BILL
    && c.purchaseBillFormSettings.relatedProductEnabled === true;

  if (!open || !docNumber) return null;

  if (query.isLoading || query.isFetching) {
    return (
      <div className={`fixed inset-0 ${zIndexClass} flex items-center justify-center`}>
        <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} aria-hidden />
        <div className="relative flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-medium text-slate-600 shadow-lg">
          <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />
          加载单据…
        </div>
      </div>
    );
  }

  if (recordsList.length === 0) return null;

  const partner = recordsList.find(r => r.docNumber === docNumber)?.partner?.trim();
  const todoTitle = partner ? `${docNumber} · ${partner}` : docNumber;

  return (
    <>
      <PsiOrderBillDocModal
        open
        phase="detail"
        editingDocNumber={docNumber}
        maxWidthClass="max-w-4xl"
        detailTitle={meta.detailTitle}
        editTitle=""
        newTitle=""
        showPrint={false}
        onPrint={noop}
        permSubmodule={meta.permSubmodule}
        deleteConfirmMessage=""
        recordType={meta.recordType}
        onClose={onClose}
        onEnterEdit={noop}
        onCancelEdit={noop}
        hasPsiPerm={hasPsiPerm}
        showDetailEditButton={false}
        showDetailDeleteButton={false}
        zIndexClass={zIndexClass}
        leadingDetailActions={
          <AddTodoButton
            seed={{
              sourceType: meta.todoSourceType,
              sourceId: docNumber,
              sourceDocNo: meta.todoModuleLabel,
              sourceTitle: todoTitle,
              href: `/psi?tab=${meta.todoHrefTab}&psiDoc=${encodeURIComponent(docNumber)}`,
            }}
            modalZIndexClass="z-[12100]"
          />
        }
        detailContent={
          <PsiDocDetailSummary
            docType={meta.recordType}
            docNumber={docNumber}
            recordsList={recordsList}
            productMapPSI={productMapPSI}
            categories={m.categories}
            showPurchaseBillRelatedProduct={showPurchaseBillRelatedProduct}
            warehouseMapPSI={warehouseMapPSI}
            dictionaries={m.dictionaries}
            getUnitName={getUnitName}
            formatQtyDisplay={formatPsiQtyDisplay}
            onProductImagePreview={setImagePreview}
            headerCustomFieldDefs={headerCustomFieldDefs}
            showAmount={showAmount}
          />
        }
        formContent={null}
      />
      <ProductImageLightbox
        target={imagePreview}
        onClose={() => setImagePreview(null)}
        zIndexClass="z-[12100]"
      />
    </>
  );
};

export default React.memo(PsiDocReadonlyDetailModal);
