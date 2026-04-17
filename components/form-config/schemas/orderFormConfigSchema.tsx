import React from 'react';
import { ExternalLink } from 'lucide-react';
import type { OrderFormSettings } from '../../../types';
import {
  DEFAULT_ORDER_FORM_SETTINGS,
  normalizeOrderFormSettings,
} from '../../../contexts/AppDataContext';
import type { FormConfigSchema } from '../formConfigSchema';

/**
 * 工单表单 schema —— 额外携带「去工序节点库」按钮。
 *
 * `canNavigateToSettingsNodes` + `onNavigateToSettingsNodes` 由调用站点通过 factory 注入。
 */
export function createOrderFormConfigSchema(opts: {
  canNavigateToSettingsNodes: boolean;
  onNavigateToSettingsNodes: () => void;
}): FormConfigSchema<OrderFormSettings> {
  return {
    title: '工单表单配置',
    settingsKey: 'orderFormSettings',
    subtitle: {
      fields: '入库相关自定义项与列表/登记/详情显示开关；报工填报项请在「系统设置 → 工序节点库」按工序配置。',
      print: '各详情「打印」使用的模版请在「增加模版」中创建或管理；下方仅展示已加入的可选模版。',
    },
    defaultValue: DEFAULT_ORDER_FORM_SETTINGS,
    normalize: v => normalizeOrderFormSettings(v as OrderFormSettings | null | undefined),
    transformOnSave: v => ({
      // 工单表单不编辑 customFields：
      // - 报工自定义字段在「系统设置 → 工序节点库」的报工模板里按工序维护
      // - 入库自定义字段使用 stockInCustomFields
      // 本 Modal 中无 customFields 编辑区；保存时强制清空，清理历史迁移到 stockInCustomFields 前的残留。
      ...v,
      customFields: [],
      stockInCustomFields: v.stockInCustomFields ?? [],
    }),
    tabs: [
      {
        id: 'fields',
        label: '字段配置',
        sections: [
          {
            kind: 'customFieldsTable',
            id: 'stockInCustomFields',
            title: '入库自定义单据内容',
            subtitle:
              '「新增时」对应选择入库/批量入库登记；「详情中」对应入库流水详情。报工自定义请在「系统设置 → 工序节点库」配置。',
            path: 'stockInCustomFields',
            idPrefix: 'stock-in-custom-',
            columns: ['label', 'type', 'options', 'showInAdd', 'showInDetail', 'remove'],
            renderHeaderExtra: ctx =>
              opts.canNavigateToSettingsNodes ? (
                <button
                  type="button"
                  onClick={() => {
                    ctx.close();
                    opts.onNavigateToSettingsNodes();
                  }}
                  className="flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-50"
                >
                  <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                  去工序节点库
                </button>
              ) : null,
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
            id: 'orderDetail',
            title: '工单详情打印',
            hint: '用于工单列表或工单流水中打开的工单详情弹窗；建议使用「工单」类型打印模版。',
            scope: 'orderDetail',
            path: 'orderCenterPrint.orderDetail',
            toggle: {
              label: '在对应详情弹窗显示「打印」按钮',
              key: 'showPrintButton',
              defaultChecked: true,
            },
          },
          {
            kind: 'printWhitelist',
            id: 'reportBatchDetail',
            title: '报工详情打印',
            hint: '用于报工流水 → 报工批次详情弹窗；可选用报工、工单、产品等占位符。',
            scope: 'reportBatchDetail',
            path: 'orderCenterPrint.reportBatchDetail',
            toggle: {
              label: '在对应详情弹窗显示「打印」按钮',
              key: 'showPrintButton',
              defaultChecked: true,
            },
          },
          {
            kind: 'printWhitelist',
            id: 'stockInFlowDetail',
            title: '入库详情打印',
            hint: '用于待入库清单 → 入库流水 → 入库详情弹窗；可选用入库、工单等占位符。',
            scope: 'stockInFlowDetail',
            path: 'orderCenterPrint.stockInFlowDetail',
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
}
