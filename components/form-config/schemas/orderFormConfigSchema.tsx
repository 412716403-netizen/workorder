import React from 'react';
import type { GlobalNodeTemplate, OrderFormSettings, ReportFieldDefinition } from '../../../types';
import {
  DEFAULT_ORDER_FORM_SETTINGS,
  normalizeOrderFormSettings,
} from '../../../contexts/AppDataContext';
import type { FormConfigSchema } from '../formConfigSchema';
import NodeReportTemplateFieldsSection from '../NodeReportTemplateFieldsSection';

export function createOrderFormConfigSchema(opts: {
  globalNodes: GlobalNodeTemplate[];
  nodeReportDraft: Record<string, ReportFieldDefinition[]>;
  onNodeReportDraftChange: (nodeId: string, next: ReportFieldDefinition[]) => void;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
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
      // - 报工自定义字段在「字段配置 → 报工自定义单据内容」按工序维护（写入工序节点库 reportTemplate）
      // - 入库自定义字段使用 stockInCustomFields
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
          },
          {
            kind: 'customSlot',
            id: 'nodeReportTemplates',
            render: () => (
              <NodeReportTemplateFieldsSection
                globalNodes={opts.globalNodes}
                draft={opts.nodeReportDraft}
                onDraftChange={opts.onNodeReportDraftChange}
                selectedNodeId={opts.selectedNodeId}
                onSelectNode={opts.onSelectNode}
              />
            ),
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
