import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { PlanOrder, PaymentFormSettings, PrintTemplate, ProductionOrder, Product } from '../../types';
import { BusinessFormConfigModal } from '../../components/form-config/BusinessFormConfigModal';
import { createPaymentFormConfigSchema } from '../../components/form-config/schemas/paymentFormConfigSchema';

interface Props {
  open: boolean;
  onClose: () => void;
  defaultTabWhenOpen?: 'fields' | 'print';
  settings: PaymentFormSettings;
  onSave: (s: PaymentFormSettings) => void | Promise<void>;
  printTemplates: PrintTemplate[];
  onUpdatePrintTemplates: (list: PrintTemplate[]) => void | Promise<void>;
  onRefreshPrintTemplates?: () => void | Promise<void>;
  plans: PlanOrder[];
  orders: ProductionOrder[];
  products: Product[];
}

const PaymentFormConfigModal: React.FC<Props> = ({
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
}) => {
  const navigate = useNavigate();
  const schema = useMemo(
    () =>
      createPaymentFormConfigSchema({
        onNavigateToFinanceCategories: () => {
          navigate('/settings?tab=finance_categories');
        },
      }),
    [navigate],
  );
  return (
    <BusinessFormConfigModal
      open={open}
      onClose={onClose}
      defaultTabId={defaultTabWhenOpen}
      schema={schema}
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
};

export default React.memo(PaymentFormConfigModal);
