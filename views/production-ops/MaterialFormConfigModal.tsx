import React, { useMemo } from 'react';
import type {
  MaterialFormSettings,
  MaterialPanelSettings,
  PlanOrder,
  PrintTemplate,
  ProductionOrder,
  Product,
} from '../../types';
import { BusinessFormConfigModal } from '../../components/form-config/BusinessFormConfigModal';
import {
  materialFormConfigSchema,
  type MaterialFormConfigDraft,
} from '../../components/form-config/schemas/materialFormConfigSchema';

interface MaterialFormConfigModalProps {
  open: boolean;
  onClose: () => void;
  defaultTabWhenOpen?: 'fields' | 'print' | 'list';
  materialFormSettings: MaterialFormSettings;
  onUpdateMaterialFormSettings: (settings: MaterialFormSettings) => void | Promise<void>;
  materialPanelSettings: MaterialPanelSettings;
  onUpdateMaterialPanelSettings: (settings: MaterialPanelSettings) => void | Promise<void>;
  printTemplates: PrintTemplate[];
  onUpdatePrintTemplates: (list: PrintTemplate[]) => void | Promise<void>;
  onRefreshPrintTemplates?: () => void | Promise<void>;
  plans: PlanOrder[];
  orders: ProductionOrder[];
  products: Product[];
}

const MaterialFormConfigModal: React.FC<MaterialFormConfigModalProps> = ({
  open,
  onClose,
  defaultTabWhenOpen,
  materialFormSettings,
  onUpdateMaterialFormSettings,
  materialPanelSettings,
  onUpdateMaterialPanelSettings,
  printTemplates,
  onUpdatePrintTemplates,
  onRefreshPrintTemplates,
  plans,
  orders,
  products,
}) => {
  const initialValue = useMemo<MaterialFormConfigDraft>(
    () => ({ ...materialFormSettings, __panel: materialPanelSettings }),
    [materialFormSettings, materialPanelSettings],
  );
  return (
    <BusinessFormConfigModal
      open={open}
      onClose={onClose}
      defaultTabId={defaultTabWhenOpen}
      schema={materialFormConfigSchema}
      initialValue={initialValue}
      onSave={async next => {
        // transformOnSave 已剥离 __panel，这里的 next 是干净的 MaterialFormSettings
        await onUpdateMaterialFormSettings(next as MaterialFormSettings);
      }}
      onSideSave={async (key, payload) => {
        if (key === 'materialPanelSettings') {
          await onUpdateMaterialPanelSettings(payload as MaterialPanelSettings);
        }
      }}
      printTemplates={printTemplates}
      onUpdatePrintTemplates={onUpdatePrintTemplates}
      onRefreshPrintTemplates={onRefreshPrintTemplates}
      plans={plans}
      orders={orders}
      products={products}
    />
  );
};

export default React.memo(MaterialFormConfigModal);
