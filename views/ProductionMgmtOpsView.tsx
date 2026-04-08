import React from 'react';
import type {
  ProductionOpRecord,
  ProductionOrder,
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
} from '../types';
import StockMaterialPanel from './production-ops/StockMaterialPanel';
import OutsourcePanel from './production-ops/OutsourcePanel';
import ReworkPanel from './production-ops/ReworkPanel';

interface ProductionMgmtOpsViewProps {
  productionLinkMode?: 'order' | 'product';
  productMilestoneProgresses?: ProductMilestoneProgress[];
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
  userPermissions?: string[];
  tenantRole?: string;
}

const ProductionMgmtOpsView: React.FC<ProductionMgmtOpsViewProps> = ({
  productionLinkMode = 'order',
  productMilestoneProgresses = [],
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
  userPermissions,
  tenantRole,
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

  if (limitType === 'STOCK_OUT') return <StockMaterialPanel {...panelProps} materialPanelSettings={materialPanelSettings} onUpdateMaterialPanelSettings={onUpdateMaterialPanelSettings} />;
  if (limitType === 'OUTSOURCE') return <OutsourcePanel {...panelProps} />;
  if (limitType === 'REWORK') return <ReworkPanel {...panelProps} />;

  return null;
};

export default React.memo(ProductionMgmtOpsView);
