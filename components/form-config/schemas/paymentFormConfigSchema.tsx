import React from 'react';
import { ExternalLink } from 'lucide-react';
import type { PaymentFormSettings } from '../../../types';
import {
  DEFAULT_PAYMENT_FORM_SETTINGS,
  normalizePaymentFormSettings,
} from '../../../contexts/AppDataContext';
import type { FormConfigSchema } from '../formConfigSchema';

export function createPaymentFormConfigSchema(opts: {
  onNavigateToFinanceCategories: () => void;
}): FormConfigSchema<PaymentFormSettings> {
  return {
    title: '付款单表单配置',
    settingsKey: 'paymentFormSettings',
    defaultValue: DEFAULT_PAYMENT_FORM_SETTINGS,
    normalize: v => normalizePaymentFormSettings(v as PaymentFormSettings | null | undefined),
    tabs: [
      {
        id: 'fields',
        label: '字段配置',
        sections: [
          {
            kind: 'customSlot',
            id: 'paymentFieldsHint',
            render: ctx => (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    ctx.close();
                    opts.onNavigateToFinanceCategories();
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50/40 px-3 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-50"
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
            scope: 'paymentList',
            path: 'listPrint',
            toggle: {
              label: '在付款单列表显示「打印」按钮',
              key: 'showPrintButton',
              defaultChecked: true,
            },
          },
        ],
      },
    ],
  };
}
