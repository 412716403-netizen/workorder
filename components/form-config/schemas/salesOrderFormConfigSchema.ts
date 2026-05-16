import type { SalesOrderFormSettings } from '../../../types';
import {
  DEFAULT_SALES_ORDER_FORM_SETTINGS,
  normalizeSalesOrderFormSettings,
} from '../../../contexts/AppDataContext';
import type { FormConfigSchema } from '../formConfigSchema';

export const salesOrderFormConfigSchema: FormConfigSchema<SalesOrderFormSettings> = {
  title: '销售订单表单配置',
  subtitle: {
    listDisplay: '以下选项作用于销售订单列表的默认筛选与展示。',
  },
  settingsKey: 'salesOrderFormSettings',
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
          description:
            '开启时，列表默认仅展示尚未全部发货的订单；关闭则不在此项上过滤。仍可在列表页使用其它筛选条件。',
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
          scope: 'salesOrderList',
          path: 'listPrint',
          toggle: {
            label: '在销售订单列表显示「打印」按钮',
            key: 'showPrintButton',
            defaultChecked: false,
          },
        },
      ],
    },
  ],
};
