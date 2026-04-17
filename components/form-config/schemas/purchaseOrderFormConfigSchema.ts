import type { PurchaseOrderFormSettings } from '../../../types';
import {
  DEFAULT_PURCHASE_ORDER_FORM_SETTINGS,
  normalizePurchaseOrderFormSettings,
} from '../../../contexts/AppDataContext';
import type { FormConfigSchema } from '../formConfigSchema';

export const purchaseOrderFormConfigSchema: FormConfigSchema<PurchaseOrderFormSettings> = {
  title: '采购订单表单配置',
  settingsKey: 'purchaseOrderFormSettings',
  subtitle: {
    fields: '自定义单据内容将用于列表、登记与详情及打印；标准字段不在此配置。',
    print: '打印模版请在下方「增加模版」中创建或管理（列表与登记/详情共用）。',
  },
  defaultValue: DEFAULT_PURCHASE_ORDER_FORM_SETTINGS,
  normalize: v => normalizePurchaseOrderFormSettings(v as PurchaseOrderFormSettings | null | undefined),
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
          title: '列表打印',
          hint: '控制采购订单列表是否显示「打印」按钮。下方为可选模版白名单；未添加任何项时，打印时仍可使用全部模版。',
          scope: 'purchaseOrderList',
          path: 'listPrint',
          toggle: {
            label: '在采购订单列表显示「打印」按钮',
            key: 'showPrintButton',
            defaultChecked: true,
          },
        },
      ],
    },
  ],
};
