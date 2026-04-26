import type { PurchaseOrderFormSettings } from '../../../types';
import {
  DEFAULT_PURCHASE_ORDER_FORM_SETTINGS,
  normalizePurchaseOrderFormSettings,
} from '../../../contexts/AppDataContext';
import type { FormConfigSchema } from '../formConfigSchema';

export const purchaseOrderFormConfigSchema: FormConfigSchema<PurchaseOrderFormSettings> = {
  title: '采购订单表单配置',
  subtitle: {
    listDisplay: '以下选项作用于采购订单列表的默认筛选与展示。',
  },
  settingsKey: 'purchaseOrderFormSettings',
  defaultValue: DEFAULT_PURCHASE_ORDER_FORM_SETTINGS,
  normalize: v => normalizePurchaseOrderFormSettings(v as PurchaseOrderFormSettings | null | undefined),
  tabs: [
    {
      id: 'fields',
      label: '字段配置',
      sections: [
        {
          kind: 'toggle',
          id: 'relatedProductEnabled',
          label: '关联产品',
          path: 'relatedProductEnabled',
          defaultChecked: false,
        },
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
          id: 'onlyShowUnsettled',
          label: '只显示未交清',
          description:
            '开启时，列表默认仅展示尚未全部到货或结清的订单；关闭则不在此项上过滤。仍可在列表页使用其它筛选条件。',
          path: 'listDisplay.onlyShowUnsettled',
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
