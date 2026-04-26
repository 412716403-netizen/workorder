import type { SalesBillFormSettings } from '../../../types';
import { DEFAULT_SALES_BILL_FORM_SETTINGS, normalizeSalesBillFormSettings } from '../../../contexts/AppDataContext';
import type { FormConfigSchema } from '../formConfigSchema';

export const salesBillFormConfigSchema: FormConfigSchema<SalesBillFormSettings> = {
  title: '销售单表单配置',
  settingsKey: 'salesBillFormSettings',
  defaultValue: DEFAULT_SALES_BILL_FORM_SETTINGS,
  normalize: v => normalizeSalesBillFormSettings(v as SalesBillFormSettings | null | undefined),
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
          scope: 'salesBillList',
          path: 'listPrint',
          toggle: {
            label: '在销售单列表显示「打印」按钮',
            key: 'showPrintButton',
            defaultChecked: true,
          },
        },
      ],
    },
  ],
};
