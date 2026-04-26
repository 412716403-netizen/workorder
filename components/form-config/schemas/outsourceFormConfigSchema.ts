import type { OutsourceFormSettings } from '../../../types';
import { normalizeOutsourceFormSettings } from '../../../contexts/AppDataContext';
import { DEFAULT_OUTSOURCE_FORM_SETTINGS } from '../../../types';
import type { FormConfigSchema } from '../formConfigSchema';

export const outsourceFormConfigSchema: FormConfigSchema<OutsourceFormSettings> = {
  title: '外协管理表单配置',
  subtitle: {
    list: '以下选项影响外协列表中「加工厂往来」区域的展示方式。',
  },
  settingsKey: 'outsourceFormSettings',
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
          path: 'outsourceDispatchCustomFields',
          idPrefix: 'outsource-dispatch-custom-',
          columns: ['label', 'type', 'options', 'showInAdd', 'showInDetail', 'remove'],
        },
        {
          kind: 'customFieldsTable',
          id: 'outsourceReceiveCustomFields',
          title: '外协收回自定义单据内容',
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
            '开启后，列表中加工厂往来将展示逐笔流水；关闭则偏汇总展示（具体以列表实现为准）。',
          path: 'showPartnerFlowDetailOnList',
          defaultChecked: false,
        },
      ],
    },
  ],
};
