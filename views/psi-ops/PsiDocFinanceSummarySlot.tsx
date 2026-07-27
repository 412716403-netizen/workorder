import React from 'react';
import type { FinanceRecord, PsiOrderBillDocType } from '../../types';
import { PSI_DOC_FINANCE_OP_TYPE } from '../../types';
import {
  buildPsiDocFinanceNote,
  psiDocQuickFinanceButtonLabel,
  psiDocStagedFinanceShortLabel,
} from '../../utils/psiDocFinanceNote';
import {
  psiOrderBillCompactSummaryLabelClass,
  psiOrderBillCompactSummaryValueClass,
} from '../../styles/uiDensity';
import QuickFinanceRecordButton from '../../components/finance/QuickFinanceRecordButton';

export interface PsiDocFinanceSummarySlotProps {
  docType: PsiOrderBillDocType;
  /** 编辑态已落库单号；新增态为 null（落库仍走暂存 flush） */
  sourceDocNo: string | null;
  /**
   * 备注用单号：编辑态=已保存单号；新增态=已选合作单位后的预览单号。
   * 未选合作单位时为空，按钮不可点。
   */
  noteDocNumber: string | null;
  partner: string;
  partnerLabel?: string;
  /** 已落库关联金额 + 暂存草稿金额之和 */
  linkedAmount: number;
  onStage: (record: FinanceRecord) => void;
  onCreated?: () => void;
}

/**
 * 四单表单合计条右侧：已收/付款金额展示 + 快捷登记按钮。
 */
const PsiDocFinanceSummarySlot: React.FC<PsiDocFinanceSummarySlotProps> = ({
  docType,
  sourceDocNo,
  noteDocNumber,
  partner,
  partnerLabel = '合作单位',
  linkedAmount,
  onStage,
  onCreated,
}) => {
  const financeType = PSI_DOC_FINANCE_OP_TYPE[docType];
  const shortLabel = psiDocStagedFinanceShortLabel(docType);
  const buttonLabel = psiDocQuickFinanceButtonLabel(docType);
  const defaultNote = buildPsiDocFinanceNote(docType, noteDocNumber);
  const partnerReady = (partner || '').trim() !== '';

  return (
    <div className="ml-auto flex flex-wrap items-center gap-3 border-l border-white/25 pl-4">
      {linkedAmount > 0 && (
        <div className="flex items-baseline gap-2">
          <span className={psiOrderBillCompactSummaryLabelClass}>{shortLabel}</span>
          <span className={psiOrderBillCompactSummaryValueClass}>
            ¥{linkedAmount.toFixed(2)}
          </span>
        </div>
      )}
      <QuickFinanceRecordButton
        financeType={financeType}
        sourceDocNo={sourceDocNo}
        partner={partner}
        defaultNote={defaultNote}
        buttonLabel={buttonLabel}
        onStage={onStage}
        onCreated={onCreated}
        requirePartner
        partnerLabel={partnerLabel}
        disabled={!partnerReady}
      />
    </div>
  );
};

export default React.memo(PsiDocFinanceSummarySlot);
