import React from 'react';
import type { FormConfigCustomSlotExtras, FormConfigSection, FormConfigSlotContext } from './formConfigSchema';

const DESCRIPTION =
  '开启后，主列表隐藏派发状态为「已完成」的工单；外协「待发清单」、返工「待处理不良」同步隐藏。「待收回清单」始终展示全部待收回项，避免漏收外协。';

/** 关联工单模式「列表显示」：仅显示工单未完成 */
export function onlyShowNotCompletedOrderSlot(
  id: string,
  readChecked: (ctx: FormConfigSlotContext) => boolean,
  writeChecked: (ctx: FormConfigSlotContext, checked: boolean) => void,
): FormConfigSection {
  return {
    kind: 'customSlot',
    id,
    render: (ctx, extras: FormConfigCustomSlotExtras | undefined) => {
      if (extras?.productionLinkMode !== 'order') return null;
      const checked = readChecked(ctx);
      return (
        <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 shrink-0 rounded text-indigo-600"
            checked={checked}
            onChange={e => writeChecked(ctx, e.target.checked)}
          />
          <span className="min-w-0 flex-1 leading-relaxed">
            <span className="font-bold">仅显示工单未完成</span>
            <span className="ml-2 text-xs font-medium text-slate-500">{DESCRIPTION}</span>
          </span>
        </label>
      );
    },
  };
}
