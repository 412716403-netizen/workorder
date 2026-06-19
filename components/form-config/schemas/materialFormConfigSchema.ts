import type { MaterialFormSettings, MaterialPanelSettings } from '../../../types';
import { normalizeMaterialFormSettings, normalizeMaterialPanelSettings } from '../../../contexts/AppDataContext';
import { DEFAULT_MATERIAL_FORM_SETTINGS, DEFAULT_MATERIAL_PANEL_SETTINGS } from '../../../types';
import type { FormConfigSchema } from '../formConfigSchema';
import { onlyShowNotCompletedOrderSlot } from '../onlyShowNotCompletedOrderSlot';

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
  subtitle: {
    list: '以下选项写入「生产物料面板显示设置」，影响物料相关列表的分组与展示。',
  },
  settingsKey: 'materialFormSettings',
  defaultValue: DEFAULT_MATERIAL_FORM_CONFIG_DRAFT,
  normalize: v => {
    const obj = (v ?? {}) as Partial<MaterialFormConfigDraft>;
    const { __panel, ...rest } = obj;
    const form = normalizeMaterialFormSettings(rest as MaterialFormSettings | null | undefined);
    return { ...form, __panel: normalizeMaterialPanelSettings(__panel ?? DEFAULT_MATERIAL_PANEL_SETTINGS) };
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
          path: 'materialIssueCustomFields',
          idPrefix: 'material-issue-custom-',
          columns: ['label', 'type', 'options', 'showInAdd', 'showInDetail', 'remove'],
        },
        {
          kind: 'customFieldsTable',
          id: 'materialReturnCustomFields',
          title: '生产退料自定义单据内容',
          path: 'materialReturnCustomFields',
          idPrefix: 'material-return-custom-',
          columns: ['label', 'type', 'options', 'showInAdd', 'showInDetail', 'remove'],
        },
        {
          kind: 'customFieldsTable',
          id: 'outsourceMaterialIssueCustomFields',
          title: '外协领料发出自定义单据内容',
          path: 'outsourceMaterialIssueCustomFields',
          idPrefix: 'outsource-material-issue-custom-',
          columns: ['label', 'type', 'options', 'showInAdd', 'showInDetail', 'remove'],
        },
        {
          kind: 'customFieldsTable',
          id: 'outsourceMaterialReturnCustomFields',
          title: '外协生产退料自定义单据内容',
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
          scope: 'materialIssueFlowDetail',
          path: 'materialCenterPrint.stockOutFlowDetail',
          toggle: {
            label: '在对应详情弹窗显示「打印」按钮',
            key: 'showPrintButton',
            defaultChecked: false,
          },
        },
        {
          kind: 'printWhitelist',
          id: 'stockReturnFlowDetail',
          title: '生产退料详情打印',
          scope: 'materialReturnFlowDetail',
          path: 'materialCenterPrint.stockReturnFlowDetail',
          toggle: {
            label: '在对应详情弹窗显示「打印」按钮',
            key: 'showPrintButton',
            defaultChecked: false,
          },
        },
        {
          kind: 'printWhitelist',
          id: 'outsourceStockOutFlowDetail',
          title: '外协领料发出详情打印',
          scope: 'materialOutsourceIssueFlowDetail',
          path: 'materialCenterPrint.outsourceStockOutFlowDetail',
          toggle: {
            label: '在对应详情弹窗显示「打印」按钮',
            key: 'showPrintButton',
            defaultChecked: false,
          },
        },
        {
          kind: 'printWhitelist',
          id: 'outsourceStockReturnFlowDetail',
          title: '外协生产退料详情打印',
          scope: 'materialOutsourceReturnFlowDetail',
          path: 'materialCenterPrint.outsourceStockReturnFlowDetail',
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
          id: 'groupByOutsourcePartner',
          label: '按委外加工厂展示',
          description:
            '开启后，列表可按委外加工厂维度分组查看，便于按厂对账；关闭则使用默认列表结构。',
          path: '__panel.groupByOutsourcePartner',
          defaultChecked: false,
        },
        onlyShowNotCompletedOrderSlot(
          'materialOnlyShowNotCompletedOrder',
          ctx => (ctx.get('__panel') as MaterialPanelSettings | undefined)?.onlyShowNotCompletedOrder === true,
          (ctx, checked) => {
            const panel = (ctx.get('__panel') as MaterialPanelSettings | undefined) ?? DEFAULT_MATERIAL_PANEL_SETTINGS;
            ctx.set('__panel', { ...panel, onlyShowNotCompletedOrder: checked });
          },
        ),
      ],
    },
  ],
};
