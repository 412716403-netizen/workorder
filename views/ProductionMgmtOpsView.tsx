import React from 'react';
import type {
  ProductionOpRecord,
  ProductionOrder,
  PlanOrder,
  Product,
  ProdOpType,
  Warehouse,
  BOM,
  AppDictionaries,
  GlobalNodeTemplate,
  Partner,
  ProductCategory,
  PartnerCategory,
  Worker,
  ProcessSequenceMode,
  ProductMilestoneProgress,
  MaterialPanelSettings,
  MaterialFormSettings,
  OutsourceFormSettings,
  ReworkFormSettings,
  PrintTemplate,
  PsiRecord,
  PlanFormSettings,
} from '../types';
import { DEFAULT_OUTSOURCE_FORM_SETTINGS } from '../types';
import StockMaterialPanel from './production-ops/StockMaterialPanel';
import OutsourcePanel from './production-ops/OutsourcePanel';
import ReworkPanel from './production-ops/ReworkPanel';

/**
 * Phase 3.E：本组件不再为各 panel 预拉 records（旧版会有 60 页 / 12000 条客户端硬上限）。
 * 各 panel 现在按业务条件（活动工单 ids / status / 今日窗口）独立 useQuery 窄拉自己需要的数据。
 * 这里只做路由 + props 分发。
 */
interface ProductionMgmtOpsViewProps {
  productionLinkMode?: 'order' | 'product';
  productMilestoneProgresses?: ProductMilestoneProgress[];
  plans?: PlanOrder[];
  /** 已废弃：各 panel 自取；仅用于极少数老调用方兜底，本组件不再消费 */
  records?: ProductionOpRecord[];
  orders: ProductionOrder[];
  products: Product[];
  warehouses?: Warehouse[];
  boms?: BOM[];
  dictionaries?: AppDictionaries;
  onAddRecord: (record: ProductionOpRecord) => void;
  onAddRecordBatch?: (records: ProductionOpRecord[]) => Promise<void>;
  onUpdateRecord?: (record: ProductionOpRecord) => void;
  onDeleteRecord?: (recordId: string) => void;
  limitType?: ProdOpType;
  excludeType?: ProdOpType;
  globalNodes?: GlobalNodeTemplate[];
  partners?: Partner[];
  categories?: ProductCategory[];
  partnerCategories?: PartnerCategory[];
  workers?: Worker[];
  equipment?: { id: string; name: string; code?: string; assignedMilestoneIds?: string[] }[];
  processSequenceMode?: ProcessSequenceMode;
  /** 受 SystemSetting.allowExceedMaxOutsourceReceiveQty 控制；仅外协 tab 使用，默认 false */
  allowExceedMaxOutsourceReceiveQty?: boolean;
  materialPanelSettings?: MaterialPanelSettings;
  onUpdateMaterialPanelSettings?: (settings: MaterialPanelSettings) => void;
  materialFormSettings: MaterialFormSettings;
  onUpdateMaterialFormSettings: (settings: MaterialFormSettings) => void;
  outsourceFormSettings?: OutsourceFormSettings;
  onUpdateOutsourceFormSettings?: (settings: OutsourceFormSettings) => void | Promise<void>;
  reworkFormSettings: ReworkFormSettings;
  onUpdateReworkFormSettings: (settings: ReworkFormSettings) => void | Promise<void>;
  printTemplates: PrintTemplate[];
  onUpdatePrintTemplates: (list: PrintTemplate[]) => void | Promise<void>;
  onRefreshPrintTemplates?: () => void | Promise<void>;
  userPermissions?: string[];
  tenantRole?: string;
  /** 生产物料领退料弹窗内合并本地进销存批次余量（可选） */
  psiRecords?: PsiRecord[];
  /** 计划单列表显示（外协流水「交货日期」列等） */
  planFormSettings?: PlanFormSettings;
}

const ProductionMgmtOpsView: React.FC<ProductionMgmtOpsViewProps> = ({
  productionLinkMode = 'order',
  productMilestoneProgresses = [],
  plans = [],
  orders,
  products,
  warehouses = [],
  boms = [],
  dictionaries,
  onAddRecord,
  onAddRecordBatch,
  onUpdateRecord,
  onDeleteRecord,
  limitType,
  globalNodes = [],
  partners = [],
  categories = [],
  partnerCategories = [],
  workers = [],
  equipment = [],
  processSequenceMode = 'sequential',
  allowExceedMaxOutsourceReceiveQty = false,
  materialPanelSettings,
  onUpdateMaterialPanelSettings,
  materialFormSettings,
  onUpdateMaterialFormSettings,
  outsourceFormSettings = DEFAULT_OUTSOURCE_FORM_SETTINGS,
  onUpdateOutsourceFormSettings,
  reworkFormSettings,
  onUpdateReworkFormSettings,
  printTemplates,
  onUpdatePrintTemplates,
  onRefreshPrintTemplates,
  userPermissions,
  tenantRole,
  psiRecords = [],
  planFormSettings,
}) => {
  const panelProps = {
    productionLinkMode,
    productMilestoneProgresses,
    orders,
    products,
    warehouses,
    boms,
    dictionaries,
    onAddRecord,
    onAddRecordBatch,
    onUpdateRecord,
    onDeleteRecord,
    globalNodes,
    partners,
    categories,
    partnerCategories,
    workers,
    equipment,
    processSequenceMode,
    userPermissions,
    tenantRole,
  } as const;

  if (limitType === 'STOCK_OUT')
    return (
      <StockMaterialPanel
        {...panelProps}
        materialPanelSettings={materialPanelSettings}
        onUpdateMaterialPanelSettings={onUpdateMaterialPanelSettings}
        materialFormSettings={materialFormSettings}
        onUpdateMaterialFormSettings={onUpdateMaterialFormSettings}
        printTemplates={printTemplates}
        onUpdatePrintTemplates={onUpdatePrintTemplates}
        onRefreshPrintTemplates={onRefreshPrintTemplates}
        plans={plans}
        psiRecords={psiRecords}
      />
    );
  if (limitType === 'OUTSOURCE')
    return (
      <OutsourcePanel
        {...panelProps}
        plans={plans}
        planFormSettings={planFormSettings}
        materialFormSettings={materialFormSettings}
        outsourceFormSettings={outsourceFormSettings}
        onUpdateOutsourceFormSettings={onUpdateOutsourceFormSettings}
        printTemplates={printTemplates}
        onUpdatePrintTemplates={onUpdatePrintTemplates}
        onRefreshPrintTemplates={onRefreshPrintTemplates}
        psiRecords={psiRecords}
        allowExceedMaxOutsourceReceiveQty={allowExceedMaxOutsourceReceiveQty}
      />
    );
  if (limitType === 'REWORK')
    return (
      <ReworkPanel
        {...panelProps}
        plans={plans}
        reworkFormSettings={reworkFormSettings}
        onUpdateReworkFormSettings={onUpdateReworkFormSettings}
        printTemplates={printTemplates}
        onUpdatePrintTemplates={onUpdatePrintTemplates}
        onRefreshPrintTemplates={onRefreshPrintTemplates}
        psiRecords={psiRecords}
      />
    );

  return null;
};

export default React.memo(ProductionMgmtOpsView);
