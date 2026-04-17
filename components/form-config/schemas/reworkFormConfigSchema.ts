import type { ReworkFormSettings } from '../../../types';
import { normalizeReworkFormSettings } from '../../../contexts/AppDataContext';
import { DEFAULT_REWORK_FORM_SETTINGS } from '../../../types';
import type { FormConfigSchema } from '../formConfigSchema';

export const reworkFormConfigSchema: FormConfigSchema<ReworkFormSettings> = {
  title: '返工管理表单配置',
  settingsKey: 'reworkFormSettings',
  subtitle: {
    fields: '配置处理不良与返工报工登记/详情中的自定义项；打印模版在「打印模版」页签管理。',
    print: '各流水详情「打印」使用的模版请在「增加模版」中创建或管理；下方仅展示已加入的可选模版。',
  },
  defaultValue: DEFAULT_REWORK_FORM_SETTINGS,
  normalize: v => normalizeReworkFormSettings(v as ReworkFormSettings | null | undefined),
  tabs: [
    {
      id: 'fields',
      label: '字段配置',
      sections: [
        {
          kind: 'customFieldsTable',
          id: 'defectTreatmentCustomFields',
          title: '处理不良自定义单据内容',
          subtitle: '对应待处理不良中登记返工/报损及处理不良流水详情；打印占位符为 {{处理不良.custom.<id>}}。',
          path: 'defectTreatmentCustomFields',
          idPrefix: 'rework-defect-cf-',
          columns: ['label', 'type', 'options', 'showInAdd', 'showInDetail', 'remove'],
        },
        {
          kind: 'customFieldsTable',
          id: 'reworkReportCustomFields',
          title: '返工报工自定义单据内容',
          subtitle: '对应返工报工登记与返工报工流水详情；打印占位符为 {{返工报工.custom.<id>}}。',
          path: 'reworkReportCustomFields',
          idPrefix: 'rework-report-cf-',
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
          id: 'defectTreatmentFlowDetail',
          title: '处理不良流水详情打印',
          hint: '用于处理不良品流水 → 详情弹窗；数据源建议选「返工管理」。',
          scope: 'defectTreatmentFlowDetail',
          path: 'reworkCenterPrint.defectTreatmentFlowDetail',
          toggle: {
            label: '在对应详情弹窗显示「打印」按钮',
            key: 'showPrintButton',
            defaultChecked: true,
          },
        },
        {
          kind: 'printWhitelist',
          id: 'reworkReportFlowDetail',
          title: '返工报工流水详情打印',
          hint: '用于返工报工流水 → 详情弹窗；可选用「返工报工」「工单」「产品」等占位符。',
          scope: 'reworkReportFlowDetail',
          path: 'reworkCenterPrint.reworkReportFlowDetail',
          toggle: {
            label: '在对应详情弹窗显示「打印」按钮',
            key: 'showPrintButton',
            defaultChecked: true,
          },
        },
      ],
    },
  ],
};
