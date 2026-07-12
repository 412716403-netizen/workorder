import React from 'react';
import type { PlanFormFieldConfig, PlanFormSettings } from '../../../types';
import {
  DEFAULT_PLAN_FORM_SETTINGS,
  normalizePlanFormSettings,
} from '../../../contexts/AppDataContext';
import type { FormConfigSchema } from '../formConfigSchema';

function patchPlanCustomerVisibility(fields: PlanFormFieldConfig[], show: boolean): PlanFormFieldConfig[] {
  const hasCustomer = fields.some(f => f.id === 'customer');
  if (hasCustomer) {
    return fields.map(sf =>
      sf.id === 'customer'
        ? { ...sf, showInList: show, showInCreate: show, showInDetail: show }
        : sf,
    );
  }
  const defCustomer = DEFAULT_PLAN_FORM_SETTINGS.standardFields.find(f => f.id === 'customer');
  const row: PlanFormFieldConfig = defCustomer
    ? { ...defCustomer, showInList: show, showInCreate: show, showInDetail: show }
    : { id: 'customer', label: '客户', showInList: show, showInCreate: show, showInDetail: show };
  return [...fields, row];
}

export const planFormConfigSchema: FormConfigSchema<PlanFormSettings> = {
  title: '计划单表单配置',
  subtitle: {
    list: '以下选项影响计划单主列表字段展示方式；交货日期还会影响工单中心 / 外协流水列表中的交期列与打印占位符。',
  },
  settingsKey: 'planFormSettings',
  defaultValue: DEFAULT_PLAN_FORM_SETTINGS,
  normalize: v => normalizePlanFormSettings(v as PlanFormSettings | null | undefined),
  tabs: [
    {
      id: 'fields',
      label: '字段配置',
      sections: [
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
      id: 'list',
      label: '列表显示',
      sections: [
        {
          kind: 'customSlot',
          id: 'planOrderCustomerToggle',
          render: (ctx, extras) => {
            if (extras?.productionLinkMode !== 'order') return null;
            const fields = (ctx.get('standardFields') as PlanFormFieldConfig[] | undefined) ?? [];
            const customer = fields.find(f => f.id === 'customer');
            const checked =
              !!customer && customer.showInList && customer.showInCreate && customer.showInDetail;
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
                        const next = patchPlanCustomerVisibility(fields, e.target.checked);
                        ctx.set('standardFields', next);
                      }}
                    />
                    <span>
                      显示客户
                      <p className="mt-1 text-xs font-medium text-slate-500">
                        开启后，计划单列表显示「客户」列，并同步显示在计划创建与详情区域；关闭后三处同时隐藏。
                      </p>
                    </span>
                  </label>
                </div>
              </div>
            );
          },
        },
        {
          kind: 'customSlot',
          id: 'planOrderDeliveryDateToggle',
          render: (ctx, extras) => {
            // 产品模式不提供交货日期配置（与工单模式交期列语义绑定）
            if (extras?.productionLinkMode === 'product') return null;
            const ld = (ctx.get('listDisplay') as PlanFormSettings['listDisplay']) ?? {};
            const checked = ld.showDeliveryDate === true;
            return (
              <div className="mt-4">
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white px-4 py-4">
                  <label className="flex cursor-pointer items-start gap-3 text-sm font-bold text-slate-800">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 shrink-0 rounded text-indigo-600"
                      checked={checked}
                      onChange={e => {
                        ctx.set('listDisplay', {
                          ...ld,
                          showDeliveryDate: e.target.checked,
                        });
                      }}
                    />
                    <span>
                      显示交货日期
                      <p className="mt-1 text-xs font-medium text-slate-500">
                        开启后，计划单新建与详情可填写交货日期，列表显示该列；打印模版可选用「计划 · 交货日期」；工单模式下工单中心与外协流水列表显示交期（数据由下推工单带出）。
                      </p>
                    </span>
                  </label>
                </div>
              </div>
            );
          },
        },
        {
          kind: 'customSlot',
          id: 'planOrderOnlyNotCompletedToggle',
          render: (ctx, extras) => {
            if (extras?.productionLinkMode !== 'order') return null;
            const ld = (ctx.get('listDisplay') as PlanFormSettings['listDisplay']) ?? {};
            const checked = ld.onlyShowNotCompleted === true;
            return (
              <div className="mt-4">
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
                      仅显示未完成 / 未下单
                      <p className="mt-1 text-xs font-medium text-slate-500">
                        开启后，计划单列表隐藏「已完成」的计划，只保留「未完成」与「未下单」。
                      </p>
                    </span>
                  </label>
                </div>
              </div>
            );
          },
        },
        {
          kind: 'customSlot',
          id: 'planOrderSplitPlanToggle',
          render: (ctx, extras) => {
            const ld = (ctx.get('listDisplay') as PlanFormSettings['listDisplay']) ?? {};
            const checked = ld.splitPlanEnabled === true;
            // 产品模式无「显示客户 / 交货日期」时，由拆单开关承担「列表显示」分区标题
            const showSectionTitle = extras?.productionLinkMode === 'product';
            return (
              <div className={showSectionTitle ? '' : 'mt-4'}>
                {showSectionTitle && (
                  <h4 className="mb-3 text-sm font-black uppercase tracking-widest text-slate-600">列表显示</h4>
                )}
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white px-4 py-4">
                  <label className="flex cursor-pointer items-start gap-3 text-sm font-bold text-slate-800">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 shrink-0 rounded text-indigo-600"
                      checked={checked}
                      onChange={e => {
                        ctx.set('listDisplay', {
                          ...ld,
                          splitPlanEnabled: e.target.checked,
                        });
                      }}
                    />
                    <span>
                      计划单拆单
                      <p className="mt-1 text-xs font-medium text-slate-500">
                        开启后，计划详情底部显示「拆单」按钮，可将当前计划数量拆成多条独立计划单；每次操作仅拆出 1 条新计划，原单保留剩余数量。已下达工单或 BOM 子计划不可拆单。
                      </p>
                    </span>
                  </label>
                </div>
              </div>
            );
          },
        },
        {
          kind: 'customSlot',
          id: 'planOrderMaterialLossToggle',
          render: ctx => {
            const ld = (ctx.get('listDisplay') as PlanFormSettings['listDisplay']) ?? {};
            const checked = ld.materialLossEnabled === true;
            return (
              <div className="mt-4">
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white px-4 py-4">
                  <label className="flex cursor-pointer items-start gap-3 text-sm font-bold text-slate-800">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 shrink-0 rounded text-indigo-600"
                      checked={checked}
                      onChange={e => {
                        ctx.set('listDisplay', {
                          ...ld,
                          materialLossEnabled: e.target.checked,
                        });
                      }}
                    />
                    <span>
                      物料损耗计算
                      <p className="mt-1 text-xs font-medium text-slate-500">
                        开启后，计划详情「用料清单」在物料名称后显示「损耗」列，可按物料填写损耗百分比；理论总需量按 (1 + 损耗%) 放大，并联动缺料数 / 计划用量 / 采购数量。损耗率随计划单保存。
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
          id: 'listPrint',
          title: '列表打印',
          scope: 'planList',
          path: 'listPrint',
          toggle: {
            label: '在计划单列表显示「打印」按钮',
            key: 'showPrintButton',
            defaultChecked: false,
          },
        },
        {
          kind: 'toggle',
          id: 'traceSectionToggle',
          label: '在计划详情中显示「追溯码」区块',
          path: 'labelPrint.showPlanDetailTraceSection',
          defaultChecked: true,
        },
        {
          kind: 'printWhitelist',
          id: 'itemCodeLabelPrint',
          title: '单品码打印',
          scope: 'planItemLabel',
          path: 'labelPrint.itemCodePrint',
        },
        {
          kind: 'printWhitelist',
          id: 'batchLabelPrint',
          title: '批次码打印',
          scope: 'planBatchLabel',
          path: 'labelPrint.batchPrint',
        },
      ],
    },
  ],
};
