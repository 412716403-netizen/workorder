import type { PurchaseBillFormSettings } from '../../../types';
import {
  DEFAULT_PURCHASE_BILL_FORM_SETTINGS,
  normalizePurchaseBillFormSettings,
} from '../../../contexts/AppDataContext';
import type { FormConfigSchema } from '../formConfigSchema';

export const purchaseBillFormConfigSchema: FormConfigSchema<PurchaseBillFormSettings> = {
  title: '采购入库表单配置',
  subtitle: {
    listDisplay: '以下选项作用于采购入库列表的展示与关联信息。',
  },
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
      id: 'listDisplay',
      label: '列表显示',
      sections: [
        {
          kind: 'toggle',
          id: 'relatedProductEnabled',
          label: '关联产品',
          description:
            '开启后，可在列表、新建/编辑与详情中填写「关联产品」，用于说明本单入库物料主要服务于哪个成品（与明细「采购品项」不同）；关闭后整单不显示该字段。列表搜索可按关联产品的名称与编号匹配；从采购订单转化生成时可继承来源订单的关联产品。',
          path: 'relatedProductEnabled',
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
          title: '打印模版',
          scope: 'purchaseBillList',
          path: 'listPrint',
          toggle: {
            label: '在采购入库列表显示「打印」按钮',
            key: 'showPrintButton',
            defaultChecked: false,
          },
        },
      ],
    },
  ],
};
