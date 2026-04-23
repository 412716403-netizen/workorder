import type { SalesOrderFormSettings } from '../../../types';
import {
  DEFAULT_SALES_ORDER_FORM_SETTINGS,
  normalizeSalesOrderFormSettings,
} from '../../../contexts/AppDataContext';
import type { FormConfigSchema } from '../formConfigSchema';

export const salesOrderFormConfigSchema: FormConfigSchema<SalesOrderFormSettings> = {
  title: '销售订单表单配置',
  settingsKey: 'salesOrderFormSettings',
  subtitle: {
    fields: '自定义单据内容将用于列表、登记与详情及打印；标准字段不在此配置。',
    listDisplay: '控制进销存「销售订单」列表默认展示范围。',
    print: '打印模版请在下方「增加模版」中创建或管理（列表与登记/详情共用）。',
  },
  defaultValue: DEFAULT_SALES_ORDER_FORM_SETTINGS,
  normalize: v => normalizeSalesOrderFormSettings(v as SalesOrderFormSettings | null | undefined),
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
      id: 'listDisplay',
      label: '列表显示',
      sections: [
        {
          kind: 'toggle',
          id: 'onlyShowNotFullyShipped',
          label: '只显示未发齐',
          description: '勾选后列表仅保留至少有一行未发齐的销售订单（订货数量大于已发数量）。',
          path: 'listDisplay.onlyShowNotFullyShipped',
          defaultChecked: false,
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
          hint: '控制销售订单列表是否显示「打印」按钮。下方为可选模版白名单；未添加任何项时，打印时仍可使用全部模版。',
          scope: 'salesOrderList',
          path: 'listPrint',
          toggle: {
            label: '在销售订单列表显示「打印」按钮',
            key: 'showPrintButton',
            defaultChecked: true,
          },
        },
      ],
    },
  ],
};
