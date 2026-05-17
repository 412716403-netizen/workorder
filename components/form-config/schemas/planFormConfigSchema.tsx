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
            const ld = (ctx.get('listDisplay') as PlanFormSettings['listDisplay']) ?? {};
            const checked = ld.showDeliveryDate === true;
            const isOrderMode = extras?.productionLinkMode !== 'product';
            return (
              <div className={isOrderMode ? 'mt-4' : ''}>
                {!isOrderMode && (
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
          kind: 'printWhitelist',
          id: 'labelPrint',
          title: '标签打印',
          scope: 'planLabel',
          path: 'labelPrint',
          toggle: {
            label: '在计划详情中显示「追溯码」区块',
            key: 'showPlanDetailTraceSection',
            defaultChecked: true,
          },
        },
      ],
    },
  ],
};
