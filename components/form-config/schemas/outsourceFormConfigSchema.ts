import type { OutsourceFormSettings } from '../../../types';
import { normalizeOutsourceFormSettings } from '../../../contexts/AppDataContext';
import { DEFAULT_OUTSOURCE_FORM_SETTINGS } from '../../../types';
import type { FormConfigSchema } from '../formConfigSchema';
import { onlyShowNotCompletedOrderSlot } from '../onlyShowNotCompletedOrderSlot';

export const outsourceFormConfigSchema: FormConfigSchema<OutsourceFormSettings> = {
  title: '外协管理表单配置',
  subtitle: {
    list: '以下选项影响外协列表、加工厂往来区域及外协发出交货日期的展示方式。',
  },
  settingsKey: 'outsourceFormSettings',
  defaultValue: DEFAULT_OUTSOURCE_FORM_SETTINGS,
  normalize: v => normalizeOutsourceFormSettings(v as OutsourceFormSettings | null | undefined),
  transformOnSave: v => normalizeOutsourceFormSettings(v),
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
            defaultChecked: false,
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
            defaultChecked: false,
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
          id: 'showOutsourceDispatchDeliveryDate',
          label: '外协发出显示交货日期',
          description:
            '勾选后，外协发出新增/详情/编辑页显示交货日期（与自定义单据内容同区）；加工厂往来数量明细在「单据类型」后增加交货日期列。',
          path: 'showOutsourceDispatchDeliveryDate',
          defaultChecked: false,
        },
        {
          kind: 'toggle',
          id: 'hideZeroPendingPartnerOnList',
          label: '加工厂剩余为 0 时不显示',
          description:
            '勾选后，外协主列表中某加工厂「剩余」为 0（已全部收回）时隐藏该小卡；若工单/产品下加工厂均被隐藏，则整行也不显示。',
          path: 'hideZeroPendingPartnerOnList',
          defaultChecked: false,
        },
        onlyShowNotCompletedOrderSlot(
          'outsourceOnlyShowNotCompletedOrder',
          ctx => ctx.get<boolean>('onlyShowNotCompletedOrder') === true,
          (ctx, checked) => {
            ctx.set('onlyShowNotCompletedOrder', checked);
          },
        ),
      ],
    },
  ],
};
