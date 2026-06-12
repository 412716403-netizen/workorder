import React, { useState } from 'react';
import { ScanLine } from 'lucide-react';
import type { ScanPayload } from '../../utils/scanPayload';
import type { ScanBatchRowDetail } from '../../utils/scanBatchRowDetail';
import type { ScanIntent } from '../../utils/scanBatchIntent';
import { ScanBatchSessionModal } from './ScanBatchSessionModal';
import type { ScanBatchApplyMeta } from './ScanBatchSessionModal';

export interface ScanBatchTriggerProps {
  onApply: (payloads: ScanPayload[], meta?: ScanBatchApplyMeta) => void | Promise<boolean | void>;
  /** 列表行展示：产品名、颜色、尺码、数量（需请求扫码接口） */
  resolveRowPreview?: (payload: ScanPayload) => Promise<ScanBatchRowDetail | null>;
  size?: 'sm' | 'md';
  hint?: string;
  disabled?: boolean;
  className?: string;
  title?: string;
  modalTitle?: string;
  modalHint?: string;
  /** 为 true 时弹窗内可选择「按批累计 / 按件累计」（默认 false） */
  showScanIntentToggle?: boolean;
  /** 每次打开弹窗时的默认累计方式（默认「按批累计」） */
  defaultScanIntent?: ScanIntent;
  /** 透传给 ScanBatchSessionModal 的头部插槽（用于挂业务上下文，如加工厂选择） */
  modalHeaderSlot?: React.ReactNode;
  /** 透传：禁用扫码会话内的扫码输入 + 确认按钮（headerSlot 必填项未满足时使用） */
  modalScanDisabled?: boolean;
  /** 透传：禁用时替换「列表为空」占位文案 */
  modalScanDisabledHint?: string;
  enableWeightCheck?: boolean;
  weightNodeId?: string;
  weightTolerancePercent?: number;
  getUnitWeightKg?: (productId: string, variantId: string, nodeId: string) => number | undefined;
}

/**
 * 打开批量扫码弹窗：先收集列表，确认后调用 onApply。
 */
export function ScanBatchTrigger({
  onApply,
  resolveRowPreview,
  size = 'md',
  hint = '扫码录入',
  disabled,
  className = '',
  title,
  modalTitle,
  modalHint,
  showScanIntentToggle,
  defaultScanIntent,
  modalHeaderSlot,
  modalScanDisabled,
  modalScanDisabledHint,
  enableWeightCheck,
  weightNodeId,
  weightTolerancePercent,
  getUnitWeightKg,
}: ScanBatchTriggerProps) {
  const [open, setOpen] = useState(false);

  const dim = size === 'sm' ? 'h-7 w-7' : 'h-8 w-8';
  const iconDim = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';

  return (
    <>
      <span className={`inline-flex items-center gap-1 ${className}`}>
        <button
          type="button"
          disabled={disabled}
          title={title ?? '打开批量扫码，用扫码枪扫入多条后确认'}
          onClick={() => setOpen(true)}
          className={`${dim} inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-50 hover:text-indigo-600 disabled:opacity-40`}
        >
          <ScanLine className={iconDim} />
        </button>
        {hint ? (
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{hint}</span>
        ) : null}
      </span>
      <ScanBatchSessionModal
        open={open}
        onClose={() => setOpen(false)}
        onApply={onApply}
        resolveRowPreview={resolveRowPreview}
        title={modalTitle}
        hint={modalHint}
        showScanIntentToggle={showScanIntentToggle}
        defaultScanIntent={defaultScanIntent}
        headerSlot={modalHeaderSlot}
        scanDisabled={modalScanDisabled}
        scanDisabledHint={modalScanDisabledHint}
        enableWeightCheck={enableWeightCheck}
        weightNodeId={weightNodeId}
        weightTolerancePercent={weightTolerancePercent}
        getUnitWeightKg={getUnitWeightKg}
      />
    </>
  );
}
