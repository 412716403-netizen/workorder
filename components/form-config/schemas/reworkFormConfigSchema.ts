import type { ReworkFormSettings } from '../../../types';
import { normalizeReworkFormSettings } from '../../../contexts/AppDataContext';
import { DEFAULT_REWORK_FORM_SETTINGS } from '../../../types';
import type { FormConfigSchema } from '../formConfigSchema';

export const reworkFormConfigSchema: FormConfigSchema<ReworkFormSettings> = {
  title: '返工管理表单配置',
  settingsKey: 'reworkFormSettings',
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
          path: 'defectTreatmentCustomFields',
          idPrefix: 'rework-defect-cf-',
          columns: ['label', 'type', 'options', 'showInAdd', 'showInDetail', 'remove'],
        },
        {
          kind: 'customFieldsTable',
          id: 'reworkReportCustomFields',
          title: '返工报工自定义单据内容',
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
          scope: 'defectTreatmentFlowDetail',
          path: 'reworkCenterPrint.defectTreatmentFlowDetail',
          toggle: {
            label: '在对应详情弹窗显示「打印」按钮',
            key: 'showPrintButton',
            defaultChecked: false,
          },
        },
        {
          kind: 'printWhitelist',
          id: 'reworkReportFlowDetail',
          title: '返工报工流水详情打印',
          scope: 'reworkReportFlowDetail',
          path: 'reworkCenterPrint.reworkReportFlowDetail',
          toggle: {
            label: '在对应详情弹窗显示「打印」按钮',
            key: 'showPrintButton',
            defaultChecked: false,
          },
        },
      ],
    },
  ],
};
