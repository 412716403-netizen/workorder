import React from 'react';
import type {
  PlanOrder,
  PrintTemplate,
  ProductionOrder,
  Product,
  ReworkFormSettings,
} from '../../types';
import { BusinessFormConfigModal } from '../../components/form-config/BusinessFormConfigModal';
import { reworkFormConfigSchema } from '../../components/form-config/schemas/reworkFormConfigSchema';

interface ReworkFormConfigModalProps {
  open: boolean;
  onClose: () => void;
  defaultTabWhenOpen?: 'fields' | 'print' | 'list';
  productionLinkMode?: 'order' | 'product';
  reworkFormSettings: ReworkFormSettings;
  onUpdateReworkFormSettings: (settings: ReworkFormSettings) => void;
  printTemplates: PrintTemplate[];
  onUpdatePrintTemplates: (list: PrintTemplate[]) => void | Promise<void>;
  onRefreshPrintTemplates?: () => void | Promise<void>;
  plans: PlanOrder[];
  orders: ProductionOrder[];
  products: Product[];
}

const ReworkFormConfigModal: React.FC<ReworkFormConfigModalProps> = ({
  open,
  onClose,
  defaultTabWhenOpen,
  productionLinkMode = 'order',
  reworkFormSettings,
  onUpdateReworkFormSettings,
  printTemplates,
  onUpdatePrintTemplates,
  onRefreshPrintTemplates,
  plans,
  orders,
  products,
}) => (
  <BusinessFormConfigModal
    open={open}
    onClose={onClose}
    defaultTabId={defaultTabWhenOpen}
    schema={reworkFormConfigSchema}
    initialValue={reworkFormSettings}
    onSave={onUpdateReworkFormSettings}
    printTemplates={printTemplates}
    onUpdatePrintTemplates={onUpdatePrintTemplates}
    onRefreshPrintTemplates={onRefreshPrintTemplates}
    productionLinkMode={productionLinkMode}
    plans={plans}
    orders={orders}
    products={products}
  />
);

export default React.memo(ReworkFormConfigModal);
