import React from 'react';
import { Printer, Pencil, Trash2, X } from 'lucide-react';
import { useConfirm } from '../../contexts/ConfirmContext';
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
}) => {
  const confirm = useConfirm();

  if (!open) return null;

  const editPerm = `psi:${permSubmodule}:edit`;
  const viewPerm = `psi:${permSubmodule}:view`;
  const deletePerm = `psi:${permSubmodule}:delete`;

  return (
    <div className="fixed inset-0 z-[62] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={onClose} aria-hidden />
      <div
        className={`relative bg-white w-full ${maxWidthClass} max-h-[90vh] rounded-[32px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95`}
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0 gap-3">
          <div className="min-w-0">
            {phase === 'detail' && editingDocNumber ? (
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-2 flex-wrap">
                <span className="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider shrink-0">
                  {formatPsiDocNumForList(editingDocNumber)}
                </span>
                {detailTitle}
              </h3>
            ) : (
              <h3 className="text-lg font-black text-slate-900">{editingDocNumber ? editTitle : newTitle}</h3>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {phase === 'detail' && editingDocNumber ? (
              <>
                {showPrint && (
                  <button
                    type="button"
                    onClick={onPrint}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-slate-100 text-slate-600 hover:bg-slate-200"
                  >
                    <Printer className="w-4 h-4" /> 打印
                  </button>
                )}
                {(hasPsiPerm(editPerm) || hasPsiPerm(viewPerm)) && (
                  <button
                    type="button"
                    onClick={onEnterEdit}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-slate-100 text-slate-600 hover:bg-slate-200"
                  >
                    <Pencil className="w-4 h-4" /> 编辑
                  </button>
                )}
                {onDeleteRecords && hasPsiPerm(deletePerm) && (
                  <button
                    type="button"
                    onClick={() => {
                      void confirm({ message: deleteConfirmMessage, danger: true }).then(ok => {
                        if (!ok || !editingDocNumber) return;
                        onDeleteRecords(recordType, editingDocNumber);
                        onClose();
                      });
                    }}
                    className="flex items-center gap-2 px-4 py-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-xl text-sm font-bold"
                  >
                    <Trash2 className="w-4 h-4" /> 删除
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50"
                >
                  <X className="w-5 h-5" />
                </button>
              </>
            ) : (
              <>
                {editingDocNumber && (
                  <button
                    type="button"
                    onClick={onCancelEdit}
                    className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-700"
                  >
                    取消编辑
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50"
                >
                  <X className="w-5 h-5" />
                </button>
              </>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-auto p-4 sm:p-6 min-h-0 bg-slate-50/30">
          {phase === 'detail' && editingDocNumber ? detailContent : formContent}
        </div>
      </div>
    </div>
  );
};

export default React.memo(PsiOrderBillDocModal);
