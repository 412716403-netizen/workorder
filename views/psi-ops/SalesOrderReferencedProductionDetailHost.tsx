import React, { useCallback, useMemo, useState } from 'react';
import { ModalPortal } from '../../components/ModalPortal';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { PlanOrder, PrintTemplate, ProductionOpRecord } from '../../types';
import { DEFAULT_OUTSOURCE_FORM_SETTINGS } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import {
  useAppActions,
  useConfigData,
  useMasterData,
  useOrdersData,
} from '../../contexts/AppDataContext';
import { normalizeDecimals } from '../../contexts/formSettingsDefaults';
import { production as productionApi } from '../../services/api';
import { buildPlanLabelPrintPicker, mergePlanLabelPrintWhitelistInSettings } from '../../utils/planLabelPrintSettings';
import PlanDetailPanel from '../plan-order-list/PlanDetailPanel';
import OrderDetailModal from '../OrderDetailModal';
import { getOrderFamilyIds, hasOpsPerm } from '../production-ops/types';
import ProductImageLightbox, {
  productPreviewFromProduct,
  type ProductImagePreviewTarget,
} from '../../components/ProductImageLightbox';

export interface SalesOrderReferencedProductionDetailHostProps {
  planId: string | null;
  orderId: string | null;
  onPlanIdChange: (id: string | null) => void;
  onOrderIdChange: (id: string | null) => void;
}

const SalesOrderReferencedProductionDetailHost: React.FC<
  SalesOrderReferencedProductionDetailHostProps
> = ({ planId, orderId, onPlanIdChange, onOrderIdChange }) => {
  const { tenantCtx } = useAuth();
  const tenantRole = tenantCtx?.tenantRole;
  const userPermissions = tenantCtx?.permissions;

  const m = useMasterData();
  const c = useConfigData();
  const o = useOrdersData();
  const a = useAppActions();

  const canViewOrderDetail = hasOpsPerm(tenantRole, userPermissions, 'production:orders_detail:view');
  const canEditOrderDetail = hasOpsPerm(tenantRole, userPermissions, 'production:orders_detail:edit');
  const canDeleteOrderDetail = hasOpsPerm(tenantRole, userPermissions, 'production:orders_detail:delete');

  const [imagePreview, setImagePreview] = useState<ProductImagePreviewTarget | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [filePreviewType, setFilePreviewType] = useState<'image' | 'pdf'>('image');
  const [planListPrintRun, setPlanListPrintRun] = useState<{
    template: PrintTemplate;
    plan: PlanOrder;
  } | null>(null);

  const orderDetailFamilyIds = useMemo(() => {
    if (!orderId) return [] as string[];
    return getOrderFamilyIds(o.orders, orderId);
  }, [orderId, o.orders]);

  const orderDetailProdQuery = useQuery({
    queryKey: ['psiSalesOrderRefOrderDetailProd', orderId, orderDetailFamilyIds.join(',')],
    enabled: !!orderId && orderDetailFamilyIds.length > 0,
    queryFn: async (): Promise<ProductionOpRecord[]> => {
      const acc: ProductionOpRecord[] = [];
      let page = 1;
      const pageSize = 200;
      const types = 'REWORK,OUTSOURCE,REWORK_REPORT,STOCK_IN,SCRAP';
      for (;;) {
        const res = await productionApi.listPage({
          page,
          pageSize,
          types,
          orderIds: orderDetailFamilyIds.join(','),
        });
        const chunk = Array.isArray(res)
          ? (res as ProductionOpRecord[])
          : ((res?.data ?? []) as ProductionOpRecord[]);
        acc.push(...chunk);
        const total = Array.isArray(res) ? chunk.length : (res?.total ?? 0);
        if (chunk.length < pageSize || acc.length >= total) break;
        page += 1;
        if (page > 40) break;
      }
      return normalizeDecimals(acc);
    },
    staleTime: 15_000,
  });
  const orderDetailProdRecords = orderDetailProdQuery.data ?? [];

  const openOrderDetail = useCallback(
    (id: string) => {
      if (!canViewOrderDetail) {
        toast.warning('无工单详情查看权限');
        return;
      }
      onOrderIdChange(id);
    },
    [canViewOrderDetail, onOrderIdChange],
  );

  const itemCodeLabelPrintPicker = useMemo(
    () => buildPlanLabelPrintPicker(c.printTemplates, c.planFormSettings.labelPrint, 'itemCode'),
    [c.printTemplates, c.planFormSettings.labelPrint],
  );
  const batchLabelPrintPicker = useMemo(
    () => buildPlanLabelPrintPicker(c.printTemplates, c.planFormSettings.labelPrint, 'batch'),
    [c.printTemplates, c.planFormSettings.labelPrint],
  );

  const mergePlanPrintWhitelist = useCallback(
    (kind: 'itemCode' | 'batch', templateId: string) => {
      void a.onUpdatePlanFormSettings(
        mergePlanLabelPrintWhitelistInSettings(c.planFormSettings, kind, templateId),
      );
    },
    [a, c.planFormSettings],
  );

  const openPlanFormPrintTab = useCallback(() => {
    void a.refreshPrintTemplates?.();
    toast.info('请在「生产管理 → 计划单」中配置标签打印模版');
  }, [a]);

  if (!planId && !orderId && !imagePreview && !filePreviewUrl) return null;

  return (
    <>
      {planId && (
        <PlanDetailPanel
          planId={planId}
          onClose={() => onPlanIdChange(null)}
          plans={o.plans}
          products={m.products}
          categories={m.categories}
          dictionaries={m.dictionaries}
          workers={m.workers}
          equipment={m.equipment}
          globalNodes={m.globalNodes}
          boms={m.boms}
          partners={m.partners}
          partnerCategories={m.partnerCategories}
          planFormSettings={c.planFormSettings}
          orders={o.orders}
          productionLinkMode={c.productionLinkMode}
          onUpdatePlan={a.onUpdatePlan}
          onUpdateOrder={a.onUpdateOrder}
          onDeletePlan={a.onDeletePlan}
          onConvertToOrder={a.onConvertToOrder}
          onUpdateProduct={a.onUpdateProduct}
          onAddPSIRecord={a.onAddPSIRecord}
          onAddPSIRecordBatch={a.onAddPSIRecordBatch}
          onCreateSubPlan={a.onCreateSubPlan}
          onCreateSubPlans={a.onCreateSubPlans}
          onSplitPlan={a.onSplitPlan}
          onOpenOrderDetail={openOrderDetail}
          canViewOrderDetail={canViewOrderDetail}
          onImagePreview={product => setImagePreview(productPreviewFromProduct(product))}
          onFilePreview={(url, type) => {
            setFilePreviewUrl(url);
            setFilePreviewType(type);
          }}
          onPrintRun={setPlanListPrintRun}
          itemCodeLabelPrintPickerTemplates={itemCodeLabelPrintPicker.templates}
          itemCodeLabelPrintPickerHasWhitelist={itemCodeLabelPrintPicker.hasWhitelist}
          batchLabelPrintPickerTemplates={batchLabelPrintPicker.templates}
          batchLabelPrintPickerHasWhitelist={batchLabelPrintPicker.hasWhitelist}
          onOpenLabelPrintConfig={openPlanFormPrintTab}
          printTemplates={c.printTemplates}
          onUpdatePrintTemplates={a.onUpdatePrintTemplates}
          onRefreshPrintTemplates={a.refreshPrintTemplates}
          onMergeLabelPrintWhitelist={mergePlanPrintWhitelist}
          onUpdatePlanFormSettings={a.onUpdatePlanFormSettings}
        />
      )}

      <OrderDetailModal
        orderId={orderId}
        onClose={() => onOrderIdChange(null)}
        orders={o.orders}
        products={m.products}
        boms={m.boms}
        prodRecords={orderDetailProdRecords}
        dictionaries={m.dictionaries}
        categories={m.categories}
        orderFormSettings={c.orderFormSettings}
        printTemplates={c.printTemplates}
        productionLinkMode={c.productionLinkMode}
        productMilestoneProgresses={o.productMilestoneProgresses}
        globalNodes={m.globalNodes}
        outsourceFormSettings={c.outsourceFormSettings ?? DEFAULT_OUTSOURCE_FORM_SETTINGS}
        planFormSettings={c.planFormSettings}
        partners={m.partners}
        partnerCategories={m.partnerCategories}
        userPermissions={userPermissions}
        tenantRole={tenantRole}
        onAddRecord={a.onAddProdRecord}
        onAddRecordBatch={
          a.onAddProdRecordBatch
            ? async records => {
                await a.onAddProdRecordBatch(records);
              }
            : undefined
        }
        onUpdateRecord={a.onUpdateProdRecord}
        onDeleteRecord={a.onDeleteProdRecord}
        onUpdateOrder={canEditOrderDetail ? a.onUpdateOrder : undefined}
        onDeleteOrder={
          canDeleteOrderDetail
            ? id => {
                a.onDeleteOrder(id);
                onOrderIdChange(null);
              }
            : undefined
        }
      />

      <ProductImageLightbox
        target={imagePreview}
        onClose={() => setImagePreview(null)}
        zIndexClass="z-[200]"
      />

      {filePreviewUrl && (
        <ModalPortal>
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6"
          onClick={() => setFilePreviewUrl(null)}
          role="presentation"
        >
          <div className="absolute inset-0 bg-slate-900/70" aria-hidden />
          <div
            className="relative z-10 max-h-[min(92vh,960px)] w-full max-w-4xl overflow-hidden rounded-xl bg-white"
            onClick={e => e.stopPropagation()}
          >
            {filePreviewType === 'image' ? (
              <img src={filePreviewUrl} alt="预览" className="max-h-[85vh] w-full object-contain" />
            ) : (
              <iframe src={filePreviewUrl} title="PDF 预览" className="h-[85vh] w-full border-0" />
            )}
          </div>
        </div>
        </ModalPortal>
      )}

      {/* 计划详情内触发列表打印时占位；完整打印链路请在计划单模块使用 */}
      {planListPrintRun && null}
    </>
  );
};

export default React.memo(SalesOrderReferencedProductionDetailHost);
