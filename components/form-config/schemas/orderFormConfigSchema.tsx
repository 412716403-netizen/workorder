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
    subtitle: {
      list: '以下选项影响工单中心主列表默认筛选（仅关联工单模式显示）。',
    },
    settingsKey: 'orderFormSettings',
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
        id: 'list',
        label: '列表显示',
        sections: [
          {
            kind: 'customSlot',
            id: 'orderListOnlyNotCompletedToggle',
            render: (ctx, extras) => {
              if (extras?.productionLinkMode !== 'order') return null;
              const ld = (ctx.get('listDisplay') as OrderFormSettings['listDisplay']) ?? {};
              const checked = ld.onlyShowNotCompleted === true;
              return (
                <div>
                  <h4 className="mb-3 text-sm font-black uppercase tracking-widest text-slate-600">
                    列表显示
                  </h4>
                  <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white px-4 py-4">
                    <label className="flex cursor-pointer items-start gap-3 text-sm font-bold text-slate-800">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 shrink-0 rounded text-indigo-600"
                        checked={checked}
                        onChange={e => {
                          ctx.set('listDisplay', {
                            ...ld,
                            onlyShowNotCompleted: e.target.checked,
                          });
                        }}
                      />
                      <span>
                        仅显示未完成
                        <p className="mt-1 text-xs font-medium text-slate-500">
                          开启后，工单中心列表隐藏「已完成」的工单，只显示「进行中」。
                        </p>
                      </span>
                    </label>
                  </div>
                </div>
              );
            },
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
            scope: 'orderDetail',
            path: 'orderCenterPrint.orderDetail',
            toggle: {
              label: '在对应详情弹窗显示「打印」按钮',
              key: 'showPrintButton',
              defaultChecked: false,
            },
          },
          {
            kind: 'printWhitelist',
            id: 'reportBatchDetail',
            title: '报工详情打印',
            scope: 'reportBatchDetail',
            path: 'orderCenterPrint.reportBatchDetail',
            toggle: {
              label: '在对应详情弹窗显示「打印」按钮',
              key: 'showPrintButton',
              defaultChecked: false,
            },
          },
          {
            kind: 'printWhitelist',
            id: 'stockInFlowDetail',
            title: '入库详情打印',
            scope: 'stockInFlowDetail',
            path: 'orderCenterPrint.stockInFlowDetail',
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
}
