import React from 'react';
import DocPhaseModal from '../../components/DocPhaseModal';
import { formatPsiDocNumForList } from './psiOpsListFormatting';

export type PsiOrderBillDocRecordType = 'PURCHASE_ORDER' | 'PURCHASE_BILL' | 'SALES_ORDER' | 'SALES_BILL';

export type PsiOrderBillPermSubmodule = 'purchase_order' | 'purchase_bill' | 'sales_order' | 'sales_bill';

export interface PsiOrderBillDocModalProps {
  open: boolean;
  phase: 'detail' | 'edit';
  editingDocNumber: string | null;
  /** 白盒 max-w，销售订单用 max-w-5xl */
  maxWidthClass: 'max-w-4xl' | 'max-w-5xl';
  /** 详情态标题（接在单号 badge 后），如「采购订单详情」 */
  detailTitle: string;
  editTitle: string;
  newTitle: string;
  showPrint: boolean;
  onPrint: () => void;
  permSubmodule: PsiOrderBillPermSubmodule;
  deleteConfirmMessage: string;
  recordType: PsiOrderBillDocRecordType;
  onDeleteRecords?: (type: string, docNumber: string) => void;
  onClose: () => void;
  onEnterEdit: () => void;
  onCancelEdit: () => void;
  hasPsiPerm: (perm: string) => boolean;
  detailContent: React.ReactNode;
  formContent: React.ReactNode;
  /** 详情顶栏「编辑」，默认 true */
  showDetailEditButton?: boolean;
  /** 详情顶栏「删除」，默认 true */
  showDetailDeleteButton?: boolean;
}

const PsiOrderBillDocModal: React.FC<PsiOrderBillDocModalProps> = ({
  open,
  phase,
  editingDocNumber,
  maxWidthClass,
  detailTitle,
  editTitle,
  newTitle,
  showPrint,
  onPrint,
  permSubmodule,
  deleteConfirmMessage,
  recordType,
  onDeleteRecords,
  onClose,
  onEnterEdit,
  onCancelEdit,
  hasPsiPerm,
  detailContent,
  formContent,
  showDetailEditButton = true,
  showDetailDeleteButton = true,
}) => (
  <DocPhaseModal
    open={open}
    phase={phase}
    editingDocNumber={editingDocNumber}
    maxWidthClass={maxWidthClass}
    detailTitle={detailTitle}
    editTitle={editTitle}
    newTitle={newTitle}
    showPrint={showPrint}
    onPrint={onPrint}
    hasPerm={hasPsiPerm}
    viewPerm={`psi:${permSubmodule}:view`}
    editPerm={`psi:${permSubmodule}:edit`}
    deletePerm={onDeleteRecords ? `psi:${permSubmodule}:delete` : undefined}
    deleteConfirmMessage={deleteConfirmMessage}
    onDelete={
      onDeleteRecords && editingDocNumber
        ? async () => {
            onDeleteRecords(recordType, editingDocNumber);
            onClose();
          }
        : undefined
    }
    renderDocBadge={dn => (
      <span className="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider shrink-0">
        {formatPsiDocNumForList(dn)}
      </span>
    )}
    onClose={onClose}
    onEnterEdit={onEnterEdit}
    onCancelEdit={onCancelEdit}
    showDetailEditButton={showDetailEditButton}
    showDetailDeleteButton={showDetailDeleteButton}
    detailContent={detailContent}
    formContent={formContent}
  />
);

export default React.memo(PsiOrderBillDocModal);
