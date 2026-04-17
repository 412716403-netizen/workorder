import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type {
  OrderFormSettings,
  PlanOrder,
  PrintTemplate,
  ProductionOrder,
  Product,
} from '../../types';
import { BusinessFormConfigModal } from '../../components/form-config/BusinessFormConfigModal';
import { createOrderFormConfigSchema } from '../../components/form-config/schemas/orderFormConfigSchema';

interface OrderFormConfigModalProps {
  open: boolean;
  onClose: () => void;
  defaultTabWhenOpen?: 'fields' | 'print';
  orderFormSettings: OrderFormSettings;
  onUpdateOrderFormSettings: (settings: OrderFormSettings) => void;
  printTemplates: PrintTemplate[];
  onUpdatePrintTemplates: (list: PrintTemplate[]) => void | Promise<void>;
  onRefreshPrintTemplates?: () => void | Promise<void>;
  plans: PlanOrder[];
  orders: ProductionOrder[];
  products: Product[];
  canNavigateToSettingsNodes?: boolean;
}

const OrderFormConfigModal: React.FC<OrderFormConfigModalProps> = ({
  open,
  onClose,
  defaultTabWhenOpen,
  orderFormSettings,
  onUpdateOrderFormSettings,
  printTemplates,
  onUpdatePrintTemplates,
  onRefreshPrintTemplates,
  plans,
  orders,
  products,
  canNavigateToSettingsNodes = false,
}) => {
  const navigate = useNavigate();
  const schema = useMemo(
    () =>
      createOrderFormConfigSchema({
        canNavigateToSettingsNodes,
        onNavigateToSettingsNodes: () => navigate('/settings?tab=nodes'),
      }),
    [canNavigateToSettingsNodes, navigate],
  );
  return (
    <BusinessFormConfigModal
      open={open}
      onClose={onClose}
      defaultTabId={defaultTabWhenOpen}
      schema={schema}
      initialValue={orderFormSettings}
      onSave={onUpdateOrderFormSettings}
      printTemplates={printTemplates}
      onUpdatePrintTemplates={onUpdatePrintTemplates}
      onRefreshPrintTemplates={onRefreshPrintTemplates}
      plans={plans}
      orders={orders}
      products={products}
    />
  );
};

export default React.memo(OrderFormConfigModal);
