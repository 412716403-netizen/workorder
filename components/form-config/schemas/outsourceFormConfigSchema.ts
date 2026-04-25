import type { OutsourceFormSettings } from '../../../types';
import { normalizeOutsourceFormSettings } from '../../../contexts/AppDataContext';
import { DEFAULT_OUTSOURCE_FORM_SETTINGS } from '../../../types';
import type { FormConfigSchema } from '../formConfigSchema';

export const outsourceFormConfigSchema: FormConfigSchema<OutsourceFormSettings> = {
  title: '外协管理表单配置',
  settingsKey: 'outsourceFormSettings',
  subtitle: {
    fields: '外协发出与收回的自定义单据字段；打印模版请在「打印模版」页签管理。',
    print: '外协流水详情弹窗的「打印」入口与可选模版范围。',
    listDisplay: '控制外协列表文档图标：开启后打开加工厂往来数量明细；关闭则打开外协流水。',
  },
  defaultValue: DEFAULT_OUTSOURCE_FORM_SETTINGS,
  normalize: v => normalizeOutsourceFormSettings(v as OutsourceFormSettings | null | undefined),
  tabs: [
    {
      id: 'fields',
      label: '字段配置',
      sections: [
        {
          kind: 'customFieldsTable',
          id: 'outsourceDispatchCustomFields',
          title: '外协发出自定义单据内容',
          subtitle: '「新增时」对应外协发出录入弹窗；「详情中」对应外协流水详情。',
          path: 'outsourceDispatchCustomFields',
          idPrefix: 'outsource-dispatch-custom-',
          columns: ['label', 'type', 'options', 'showInAdd', 'showInDetail', 'remove'],
        },
        {
          kind: 'customFieldsTable',
          id: 'outsourceReceiveCustomFields',
          title: '外协收回自定义单据内容',
          subtitle: '「新增时」对应待收回清单录入弹窗；「详情中」对应外协流水收回单详情。',
          path: 'outsourceReceiveCustomFields',
          idPrefix: 'outsource-receive-custom-',
          columns: ['label', 'type', 'options', 'showInAdd', 'showInDetail', 'remove'],
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
          id: 'dispatchFlowDetail',
          title: '外协发出详情打印',
          hint: '用于外协流水 → 外协发出单详情弹窗；模版纸张请选择「外协管理」数据源以便插入外协发出/明细占位符。',
          scope: 'outsourceDispatchFlowDetail',
          path: 'outsourceCenterPrint.dispatchFlowDetail',
          toggle: {
            label: '在对应详情弹窗显示「打印」按钮',
            key: 'showPrintButton',
            defaultChecked: true,
          },
        },
        {
          kind: 'printWhitelist',
          id: 'receiveFlowDetail',
          title: '外协收回详情打印',
          hint: '用于外协流水 → 外协收回单详情弹窗；模版纸张请选择「外协管理」数据源。',
          scope: 'outsourceReceiveFlowDetail',
          path: 'outsourceCenterPrint.receiveFlowDetail',
          toggle: {
            label: '在对应详情弹窗显示「打印」按钮',
            key: 'showPrintButton',
            defaultChecked: true,
          },
        },
      ],
    },
    {
      id: 'list',
      label: '列表显示',
      sections: [
        {
          kind: 'toggle',
          id: 'showPartnerFlowDetailOnList',
          label: '加工厂往来显示明细',
          description:
            '开启后，主列表加工厂旁的文档图标打开「加工厂往来数量明细」弹窗（按日期、类型、数量及规格分列；可按开始/结束时间与单据类型筛选；表尾为外协发出、外协收回及剩余的数量与规格合计）。关闭时与原先一致：打开外协流水并带上该产品/工单、工序、加工厂的筛选。',
          path: 'showPartnerFlowDetailOnList',
          defaultChecked: false,
        },
      ],
    },
  ],
};
