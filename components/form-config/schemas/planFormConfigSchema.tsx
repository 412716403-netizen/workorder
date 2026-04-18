import React from 'react';
import type { PlanFormSettings } from '../../../types';
import {
  DEFAULT_PLAN_FORM_SETTINGS,
  normalizePlanFormSettings,
} from '../../../contexts/AppDataContext';
import type { FormConfigSchema } from '../formConfigSchema';

const HIDDEN_STANDARD_IDS = [
  'dueDate',
  'createdAt',
  'product',
  'totalQty',
  'status',
  'priority',
  'assignedCount',
  'planNumber',
];

export const planFormConfigSchema: FormConfigSchema<PlanFormSettings> = {
  title: '计划单表单配置',
  settingsKey: 'planFormSettings',
  subtitle: {
    fields: '配置在列表、新增、详情页中显示的字段，可增加自定义项',
    print: '列表与标签模版请在各区域「增加模版」弹窗中创建或管理；下方仅展示已加入的可选模版，可删除。',
  },
  defaultValue: DEFAULT_PLAN_FORM_SETTINGS,
  normalize: v => normalizePlanFormSettings(v as PlanFormSettings | null | undefined),
  tabs: [
    {
      id: 'fields',
      label: '字段配置',
      sections: [
        {
          kind: 'standardFieldsList',
          id: 'standardFields',
          title: '标准字段显示',
          path: 'standardFields',
          hiddenIds: HIDDEN_STANDARD_IDS,
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
      id: 'print',
      label: '打印模版',
      iconPrinter: true,
      onActivate: ctx => void ctx.refreshPrintTemplates(),
      sections: [
        {
          kind: 'printWhitelist',
          id: 'listPrint',
          title: '列表打印',
          hint: '控制计划单列表是否显示「打印」按钮。下方仅列出已加入的列表可选模版；未添加任何项时，打印时仍可使用全部模版。',
          scope: 'planList',
          path: 'listPrint',
          toggle: {
            label: '在计划单列表显示「打印」按钮',
            key: 'showPrintButton',
            defaultChecked: true,
          },
        },
        {
          kind: 'printWhitelist',
          id: 'labelPrint',
          title: '标签打印',
          hint: (
            <>
              用于<strong className="text-slate-600">计划详情 → 单品码一览 → 打印单品码</strong>
              ，以及批次码行的「打印批次标签」。下方仅列出已加入的标签可选模版；未添加任何项时仍可选全部模版。标签模版建议使用小尺寸纸张与单品码/批次码占位符。
            </>
          ),
          scope: 'planLabel',
          path: 'labelPrint',
          toggle: {
            label: '在计划详情中显示「追溯码」区块',
            description: '关闭后隐藏单品码/批次码生成与一览、标签打印入口；不影响已生成的码数据。',
            key: 'showPlanDetailTraceSection',
            defaultChecked: true,
          },
        },
      ],
    },
  ],
};
