import React from 'react';
import type {
  OutsourceFormSettings,
  PlanOrder,
  PrintTemplate,
  ProductionOrder,
  Product,
} from '../../types';
import { BusinessFormConfigModal } from '../../components/form-config/BusinessFormConfigModal';
import { outsourceFormConfigSchema } from '../../components/form-config/schemas/outsourceFormConfigSchema';

interface OutsourceFormConfigModalProps {
  open: boolean;
  onClose: () => void;
  defaultTabWhenOpen?: 'fields' | 'print';
  outsourceFormSettings: OutsourceFormSettings;
  onUpdateOutsourceFormSettings: (settings: OutsourceFormSettings) => void;
  printTemplates: PrintTemplate[];
  onUpdatePrintTemplates: (list: PrintTemplate[]) => void | Promise<void>;
  onRefreshPrintTemplates?: () => void | Promise<void>;
  plans: PlanOrder[];
  orders: ProductionOrder[];
  products: Product[];
}

const OutsourceFormConfigModal: React.FC<OutsourceFormConfigModalProps> = ({
  open,
  onClose,
  defaultTabWhenOpen,
  outsourceFormSettings,
  onUpdateOutsourceFormSettings,
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
    schema={outsourceFormConfigSchema}
    initialValue={outsourceFormSettings}
    onSave={onUpdateOutsourceFormSettings}
    printTemplates={printTemplates}
    onUpdatePrintTemplates={onUpdatePrintTemplates}
    onRefreshPrintTemplates={onRefreshPrintTemplates}
    plans={plans}
    orders={orders}
    products={products}
  />
);

export default React.memo(OutsourceFormConfigModal);
