import type { PurchaseBillFormSettings } from '../../../types';
import {
  DEFAULT_PURCHASE_BILL_FORM_SETTINGS,
  normalizePurchaseBillFormSettings,
} from '../../../contexts/AppDataContext';
import type { FormConfigSchema } from '../formConfigSchema';

export const purchaseBillFormConfigSchema: FormConfigSchema<PurchaseBillFormSettings> = {
  title: '采购单表单配置',
  settingsKey: 'purchaseBillFormSettings',
  subtitle: {
    fields: '自定义单据内容将用于列表、登记与详情及打印；标准字段不在此配置。',
    print: '打印模版请在下方「增加模版」中创建或管理（列表与登记/详情共用）。',
  },
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
          hint: '控制采购单列表是否显示「打印」按钮，并与登记/详情页「打印」共用模版白名单。下方为可选模版白名单；未添加任何项时，打印时仍可使用全部模版。',
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
