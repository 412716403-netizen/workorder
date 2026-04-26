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
  settingsKey: 'planFormSettings',
  defaultValue: DEFAULT_PLAN_FORM_SETTINGS,
  normalize: v => normalizePlanFormSettings(v as PlanFormSettings | null | undefined),
  tabs: [
    {
      id: 'fields',
      label: '字段配置',
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
                  客户字段
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
                    <span>显示客户</span>
                  </label>
                </div>
              </div>
            );
          },
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
