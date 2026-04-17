import type { MaterialFormSettings, MaterialPanelSettings } from '../../../types';
import { normalizeMaterialFormSettings } from '../../../contexts/AppDataContext';
import { DEFAULT_MATERIAL_FORM_SETTINGS, DEFAULT_MATERIAL_PANEL_SETTINGS } from '../../../types';
import type { FormConfigSchema } from '../formConfigSchema';

/**
 * 生产物料配置同时管两块 settings：
 * - materialFormSettings（自定义字段 + 打印白名单）
 * - materialPanelSettings（列表显示开关）
 *
 * BusinessFormConfigModal 的 draft 只认一份对象，这里用 `__panel` 临时字段承载 panel settings，
 * 并在 transformOnSave 中剥离；然后通过 sideEffectSaves 把 panel 部分单独写入 `materialPanelSettings`。
 */
export type MaterialFormConfigDraft = MaterialFormSettings & {
  __panel?: MaterialPanelSettings;
};

const DEFAULT_MATERIAL_FORM_CONFIG_DRAFT: MaterialFormConfigDraft = {
  ...DEFAULT_MATERIAL_FORM_SETTINGS,
  __panel: DEFAULT_MATERIAL_PANEL_SETTINGS,
};

export const materialFormConfigSchema: FormConfigSchema<MaterialFormConfigDraft> = {
  title: '生产物料表单配置',
  settingsKey: 'materialFormSettings',
  subtitle: {
    fields:
      '本厂领料/退料与外协加工厂领料/退料各两套自定义字段；带 partner 的外协单据使用外协两套。打印请在「打印模版」页签。',
    print: '本厂与外协领退流水、详情弹窗的「打印」入口与可选模版范围（外协单走外协打印槽）。',
  },
  defaultValue: DEFAULT_MATERIAL_FORM_CONFIG_DRAFT,
  normalize: v => {
    const obj = (v ?? {}) as Partial<MaterialFormConfigDraft>;
    const { __panel, ...rest } = obj;
    const form = normalizeMaterialFormSettings(rest as MaterialFormSettings | null | undefined);
    return { ...form, __panel: __panel ?? DEFAULT_MATERIAL_PANEL_SETTINGS };
  },
  transformOnSave: v => {
    // 写入 materialFormSettings 时剥离 panel；panel 通过 sideEffectSaves 写入 materialPanelSettings
    const { __panel, ...rest } = v;
    void __panel;
    return rest as MaterialFormConfigDraft;
  },
  sideEffectSaves: [
    {
      key: 'materialPanelSettings',
      label: '生产物料面板显示设置',
      build: v => v.__panel ?? DEFAULT_MATERIAL_PANEL_SETTINGS,
    },
  ],
  tabs: [
    {
      id: 'fields',
      label: '字段配置',
      sections: [
        {
          kind: 'customFieldsTable',
          id: 'materialIssueCustomFields',
          title: '领料发出自定义单据内容',
          subtitle: '「新增时」对应确认领料弹窗；「详情中」对应领料单详情。',
          path: 'materialIssueCustomFields',
          idPrefix: 'material-issue-custom-',
          columns: ['label', 'type', 'options', 'showInAdd', 'showInDetail', 'remove'],
        },
        {
          kind: 'customFieldsTable',
          id: 'materialReturnCustomFields',
          title: '生产退料自定义单据内容',
          subtitle: '「新增时」对应确认退料弹窗；「详情中」对应退料单详情。',
          path: 'materialReturnCustomFields',
          idPrefix: 'material-return-custom-',
          columns: ['label', 'type', 'options', 'showInAdd', 'showInDetail', 'remove'],
        },
        {
          kind: 'customFieldsTable',
          id: 'outsourceMaterialIssueCustomFields',
          title: '外协领料发出自定义单据内容',
          subtitle:
            '用于带加工厂的外协领料（生产物料确认领料、单行登记、详情）及外协管理「物料外发」；与「本厂领料发出」配置独立。',
          path: 'outsourceMaterialIssueCustomFields',
          idPrefix: 'outsource-material-issue-custom-',
          columns: ['label', 'type', 'options', 'showInAdd', 'showInDetail', 'remove'],
        },
        {
          kind: 'customFieldsTable',
          id: 'outsourceMaterialReturnCustomFields',
          title: '外协生产退料自定义单据内容',
          subtitle:
            '用于带加工厂的外协退料（生产物料确认退料等）及外协管理「物料退回」；与「本厂生产退料」配置独立。',
          path: 'outsourceMaterialReturnCustomFields',
          idPrefix: 'outsource-material-return-custom-',
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
          id: 'stockOutFlowDetail',
          title: '领料发出详情打印',
          hint: '用于领料退料流水或详情弹窗中领料单（STOCK_OUT）；模版纸张请选择「生产物料」数据源以便插入领料发出/明细占位符。',
          scope: 'materialIssueFlowDetail',
          path: 'materialCenterPrint.stockOutFlowDetail',
          toggle: {
            label: '在对应详情弹窗显示「打印」按钮',
            key: 'showPrintButton',
            defaultChecked: true,
          },
        },
        {
          kind: 'printWhitelist',
          id: 'stockReturnFlowDetail',
          title: '生产退料详情打印',
          hint: '用于领料退料流水或详情弹窗中退料单（STOCK_RETURN）；模版纸张请选择「生产物料」数据源。',
          scope: 'materialReturnFlowDetail',
          path: 'materialCenterPrint.stockReturnFlowDetail',
          toggle: {
            label: '在对应详情弹窗显示「打印」按钮',
            key: 'showPrintButton',
            defaultChecked: true,
          },
        },
        {
          kind: 'printWhitelist',
          id: 'outsourceStockOutFlowDetail',
          title: '外协领料发出详情打印',
          hint: '用于带加工厂的外协领料单（STOCK_OUT + partner）；模版纸张请选择「生产物料」，占位符用「外协领料发出」分组。',
          scope: 'materialOutsourceIssueFlowDetail',
          path: 'materialCenterPrint.outsourceStockOutFlowDetail',
          toggle: {
            label: '在对应详情弹窗显示「打印」按钮',
            key: 'showPrintButton',
            defaultChecked: true,
          },
        },
        {
          kind: 'printWhitelist',
          id: 'outsourceStockReturnFlowDetail',
          title: '外协生产退料详情打印',
          hint: '用于带加工厂的外协退料单（STOCK_RETURN + partner）；模版纸张请选择「生产物料」，占位符用「外协生产退料」分组。',
          scope: 'materialOutsourceReturnFlowDetail',
          path: 'materialCenterPrint.outsourceStockReturnFlowDetail',
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
          id: 'groupByOutsourcePartner',
          label: '按委外加工厂展示',
          description: '开启后列表按 加工厂 → 产品/工单 → 物料 三层结构展示',
          path: '__panel.groupByOutsourcePartner',
          defaultChecked: false,
        },
      ],
    },
  ],
};
