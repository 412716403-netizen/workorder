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
  subtitle: {
    fields:
      '生产为「关联工单」时可选择是否在新增、列表与详情中显示客户；可增加自定义字段。打印请切至「打印模版」页签。',
    print: '列表与标签模版请在各区域「增加模版」弹窗中创建或管理；下方仅展示已加入的可选模版，可删除。',
  },
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
                    <span>
                      显示客户
                      <span className="mt-1 block text-xs font-medium font-normal text-slate-500">
                        勾选后，计划单新增、列表与详情页均显示客户；取消勾选则上述位置均不显示。
                      </span>
                    </span>
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
          hint: '控制计划单列表是否显示「打印」按钮。下方仅列出已加入的列表可选模版；未添加任何项时，打印时仍可使用全部模版。',
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
          hint: (
            <>
              用于<strong className="text-slate-600">计划详情 → 单品码一览 → 打印单品码</strong>
              ，以及批次码行的「打印批次标签」。下方仅列出已加入的标签可选模版；未添加任何项时仍可选全部模版。标签模版建议使用小尺寸纸张与单品码/批次码占位符。
            </>
          ),
          scope: 'planLabel',
          path: 'labelPrint',
          toggle: {
            label: '在计划详情中显示「追溯码」区块',
            description: '关闭后隐藏单品码/批次码生成与一览、标签打印入口；不影响已生成的码数据。',
            key: 'showPlanDetailTraceSection',
            defaultChecked: true,
          },
        },
      ],
    },
  ],
};
