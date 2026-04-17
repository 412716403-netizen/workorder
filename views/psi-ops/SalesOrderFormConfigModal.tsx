import React from 'react';
import type {
  PlanOrder,
  PrintTemplate,
  ProductionOrder,
  Product,
  SalesOrderFormSettings,
} from '../../types';
import { BusinessFormConfigModal } from '../../components/form-config/BusinessFormConfigModal';
import { salesOrderFormConfigSchema } from '../../components/form-config/schemas/salesOrderFormConfigSchema';

interface Props {
  open: boolean;
  onClose: () => void;
  defaultTabWhenOpen?: 'fields' | 'print';
  settings: SalesOrderFormSettings;
  onSave: (s: SalesOrderFormSettings) => void | Promise<void>;
  printTemplates: PrintTemplate[];
  onUpdatePrintTemplates: (list: PrintTemplate[]) => void | Promise<void>;
  onRefreshPrintTemplates?: () => void | Promise<void>;
  plans: PlanOrder[];
  orders: ProductionOrder[];
  products: Product[];
}

const SalesOrderFormConfigModal: React.FC<Props> = ({
  open,
  onClose,
  defaultTabWhenOpen,
  settings,
  onSave,
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
    schema={salesOrderFormConfigSchema}
    initialValue={settings}
    onSave={onSave}
    printTemplates={printTemplates}
    onUpdatePrintTemplates={onUpdatePrintTemplates}
    onRefreshPrintTemplates={onRefreshPrintTemplates}
    plans={plans}
    orders={orders}
    products={products}
  />
);

export default React.memo(SalesOrderFormConfigModal);
