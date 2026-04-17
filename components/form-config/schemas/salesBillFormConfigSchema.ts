import type { SalesBillFormSettings } from '../../../types';
import { DEFAULT_SALES_BILL_FORM_SETTINGS, normalizeSalesBillFormSettings } from '../../../contexts/AppDataContext';
import type { FormConfigSchema } from '../formConfigSchema';

export const salesBillFormConfigSchema: FormConfigSchema<SalesBillFormSettings> = {
  title: '销售单表单配置',
  settingsKey: 'salesBillFormSettings',
  subtitle: {
    fields: '自定义单据内容将用于列表、登记与详情及打印；标准字段不在此配置。',
    print: '打印模版请在下方「增加模版」中创建或管理（列表与登记/详情共用）。',
  },
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
          hint: '控制销售单列表是否显示「打印」按钮，并与登记/详情页「打印」共用模版白名单。下方为可选模版白名单；未添加任何项时，打印时仍可使用全部模版。',
          scope: 'salesBillList',
          path: 'listPrint',
          toggle: {
            label: '在销售单列表显示「打印」按钮',
            key: 'showPrintButton',
            defaultChecked: true,
          },
          emptyHint: '尚未加入任何模版；打印时可选全部。请点击「增加模版」选择模版后加入列表。',
        },
      ],
    },
  ],
};
