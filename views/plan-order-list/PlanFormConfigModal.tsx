import React from 'react';
import type {
  PlanFormSettings,
  PlanOrder,
  PrintTemplate,
  ProductionOrder,
  Product,
} from '../../types';
import { BusinessFormConfigModal } from '../../components/form-config/BusinessFormConfigModal';
import { planFormConfigSchema } from '../../components/form-config/schemas/planFormConfigSchema';

interface PlanFormConfigModalProps {
  open: boolean;
  onClose: () => void;
  defaultTabWhenOpen?: 'fields' | 'print';
  settings: PlanFormSettings;
  onSave: (settings: PlanFormSettings) => void;
  productionLinkMode?: 'order' | 'product';
  printTemplates: PrintTemplate[];
  onUpdatePrintTemplates: (list: PrintTemplate[]) => void | Promise<void>;
  onRefreshPrintTemplates?: () => void | Promise<void>;
  plans: PlanOrder[];
  orders: ProductionOrder[];
  products: Product[];
}

const PlanFormConfigModal: React.FC<PlanFormConfigModalProps> = ({
  open,
  onClose,
  defaultTabWhenOpen,
  settings,
  onSave,
  productionLinkMode,
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
    schema={planFormConfigSchema}
    initialValue={settings}
    onSave={onSave}
    productionLinkMode={productionLinkMode}
    printTemplates={printTemplates}
    onUpdatePrintTemplates={onUpdatePrintTemplates}
    onRefreshPrintTemplates={onRefreshPrintTemplates}
    plans={plans}
    orders={orders}
    products={products}
  />
);

export default React.memo(PlanFormConfigModal);
