import React from 'react';
import type {
  PlanOrder,
  PrintTemplate,
  ProductionOrder,
  Product,
  PurchaseOrderFormSettings,
  SalesOrderFormSettings,
  PurchaseBillFormSettings,
  SalesBillFormSettings,
} from '../../types';
import { BusinessFormConfigModal } from '../../components/form-config/BusinessFormConfigModal';
import { purchaseOrderFormConfigSchema } from '../../components/form-config/schemas/purchaseOrderFormConfigSchema';
import { salesOrderFormConfigSchema } from '../../components/form-config/schemas/salesOrderFormConfigSchema';
import { purchaseBillFormConfigSchema } from '../../components/form-config/schemas/purchaseBillFormConfigSchema';
import { salesBillFormConfigSchema } from '../../components/form-config/schemas/salesBillFormConfigSchema';
import type { FormConfigSchema } from '../../components/form-config/formConfigSchema';

type PsiDocType = 'PURCHASE_ORDER' | 'SALES_ORDER' | 'PURCHASE_BILL' | 'SALES_BILL';
type AnyPsiSettings = PurchaseOrderFormSettings | SalesOrderFormSettings | PurchaseBillFormSettings | SalesBillFormSettings;

const SCHEMA_MAP: Record<PsiDocType, FormConfigSchema<any>> = {
  PURCHASE_ORDER: purchaseOrderFormConfigSchema,
  SALES_ORDER: salesOrderFormConfigSchema,
  PURCHASE_BILL: purchaseBillFormConfigSchema,
  SALES_BILL: salesBillFormConfigSchema,
};

interface PsiFormConfigModalProps {
  docType: PsiDocType;
  open: boolean;
  onClose: () => void;
  defaultTabWhenOpen?: 'fields' | 'print';
  settings: AnyPsiSettings;
  onSave: (s: any) => void | Promise<void>;
  printTemplates: PrintTemplate[];
  onUpdatePrintTemplates: (list: PrintTemplate[]) => void | Promise<void>;
  onRefreshPrintTemplates?: () => void | Promise<void>;
  plans: PlanOrder[];
  orders: ProductionOrder[];
  products: Product[];
}

const PsiFormConfigModal: React.FC<PsiFormConfigModalProps> = ({
  docType,
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
    schema={SCHEMA_MAP[docType]}
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

export default React.memo(PsiFormConfigModal);
