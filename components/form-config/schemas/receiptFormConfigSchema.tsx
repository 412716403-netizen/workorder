import React from 'react';
import { ExternalLink } from 'lucide-react';
import type { ReceiptFormSettings } from '../../../types';
import {
  DEFAULT_RECEIPT_FORM_SETTINGS,
  normalizeReceiptFormSettings,
} from '../../../contexts/AppDataContext';
import type { FormConfigSchema } from '../formConfigSchema';

export function createReceiptFormConfigSchema(opts: {
  onNavigateToFinanceCategories: () => void;
}): FormConfigSchema<ReceiptFormSettings> {
  return {
    title: '收款单表单配置',
    settingsKey: 'receiptFormSettings',
    subtitle: {
      fields:
        '收款单的「单据类型」与「自定义内容」在「系统设置 → 收付款类型设置」中按分类维护；此处仅配置列表打印入口与模版白名单。',
      print: '打印模版请在下方「增加模版」中创建或管理；请将模版数据源选为「收款单」。',
    },
    defaultValue: DEFAULT_RECEIPT_FORM_SETTINGS,
    normalize: v => normalizeReceiptFormSettings(v as ReceiptFormSettings | null | undefined),
    tabs: [
      {
        id: 'fields',
        label: '字段配置',
        sections: [
          {
            kind: 'customSlot',
            id: 'receiptFieldsHint',
            render: ctx => (
              <div className="rounded-2xl border border-indigo-100 bg-indigo-50/40 p-5 space-y-3">
                <p className="text-sm font-bold text-slate-700">
                  收款单的「分类」与「自定义字段」在「系统设置 → 收付款类型设置」中维护
                </p>
                <p className="text-xs text-slate-500 leading-relaxed">
                  每个分类（如预收款、材料款）可独立勾选关联工单、合作单位、收支账户、工人、产品，并配置自定义内容。登记收款单时按所选分类显示对应字段。
                </p>
                <button
                  type="button"
                  onClick={() => {
                    ctx.close();
                    opts.onNavigateToFinanceCategories();
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-50"
                >
                  <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                  去收付款类型设置
                </button>
              </div>
            ),
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
            hint: '控制收款单列表是否显示「打印」按钮。下方为可选模版白名单；未添加任何项时，打印时仍可使用全部模版。',
            scope: 'receiptList',
            path: 'listPrint',
            toggle: {
              label: '在收款单列表显示「打印」按钮',
              key: 'showPrintButton',
              defaultChecked: true,
            },
          },
        ],
      },
    ],
  };
}
