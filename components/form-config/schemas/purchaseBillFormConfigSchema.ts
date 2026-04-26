import type { PurchaseBillFormSettings } from '../../../types';
import {
  DEFAULT_PURCHASE_BILL_FORM_SETTINGS,
  normalizePurchaseBillFormSettings,
} from '../../../contexts/AppDataContext';
import type { FormConfigSchema } from '../formConfigSchema';

export const purchaseBillFormConfigSchema: FormConfigSchema<PurchaseBillFormSettings> = {
  title: '采购单表单配置',
  settingsKey: 'purchaseBillFormSettings',
  defaultValue: DEFAULT_PURCHASE_BILL_FORM_SETTINGS,
  normalize: v => normalizePurchaseBillFormSettings(v as PurchaseBillFormSettings | null | undefined),
  tabs: [
    {
      id: 'fields',
      label: '字段配置',
      sections: [
        {
          kind: 'customFieldsTable',
          id: 'customFields',
          title: '自定义单据内容',
          path: 'customFields',
          columns: ['label', 'type', 'options', 'showInList', 'showInAdd', 'showInDetail', 'remove'],
        },
      ],
    },
    {
      id: 'print',
      label: '打印模版',
      iconPrinter: true,
      onActivate: ctx => void ctx.refreshPrintTemplates(),
      sections: [
        {
          kind: 'printWhitelist',
          id: 'listPrint',
          title: '打印模版',
          scope: 'purchaseBillList',
          path: 'listPrint',
          toggle: {
            label: '在采购单列表显示「打印」按钮',
            key: 'showPrintButton',
            defaultChecked: true,
          },
        },
      ],
    },
  ],
};
