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
