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
} from '../types';
import { DEFAULT_OUTSOURCE_FORM_SETTINGS } from '../types';
import StockMaterialPanel from './production-ops/StockMaterialPanel';
import OutsourcePanel from './production-ops/OutsourcePanel';
import ReworkPanel from './production-ops/ReworkPanel';

interface ProductionMgmtOpsViewProps {
  productionLinkMode?: 'order' | 'product';
  productMilestoneProgresses?: ProductMilestoneProgress[];
  plans?: PlanOrder[];
  records: ProductionOpRecord[];
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
}

const ProductionMgmtOpsView: React.FC<ProductionMgmtOpsViewProps> = ({
  productionLinkMode = 'order',
  productMilestoneProgresses = [],
  plans = [],
  records,
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
  processSequenceMode = 'free',
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
}) => {
  const panelProps = {
    productionLinkMode,
    productMilestoneProgresses,
    records,
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
        materialFormSettings={materialFormSettings}
        outsourceFormSettings={outsourceFormSettings}
        onUpdateOutsourceFormSettings={onUpdateOutsourceFormSettings}
        printTemplates={printTemplates}
        onUpdatePrintTemplates={onUpdatePrintTemplates}
        onRefreshPrintTemplates={onRefreshPrintTemplates}
        psiRecords={psiRecords}
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
