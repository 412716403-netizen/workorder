import React, { useEffect, useState } from 'react';
import { Printer, Pencil, Trash2, X } from 'lucide-react';
import { useConfirm } from '../contexts/ConfirmContext';

/** 编辑态顶栏「取消编辑」左侧挂载点（如保存），供 `renderContent` 内 `createPortal` 使用 */
export const DocPhaseEditToolbarPortalContext = React.createContext<HTMLElement | null>(null);

export interface DocPhaseModalProps {
  open: boolean;
  phase: 'detail' | 'edit';
  editingDocNumber: string | null;
  maxWidthClass?: 'max-w-2xl' | 'max-w-3xl' | 'max-w-4xl' | 'max-w-5xl' | 'max-w-6xl';
  /** 详情态副标题（接在单号 badge 后），如「采购订单详情」 */
  detailTitle: string;
  editTitle: string;
  newTitle: string;
  showPrint?: boolean;
  onPrint?: () => void;
  /** 整串权限键，如 `production:outsource_records:view` */
  hasPerm: (perm: string) => boolean;
  viewPerm: string;
  editPerm: string;
  deletePerm?: string;
  deleteConfirmMessage?: string;
  onDelete?: () => void | Promise<void>;
  /** 详情标题旁单号展示；不传则仅展示 `editingDocNumber` 文本 */
  renderDocBadge?: (docNumber: string) => React.ReactNode;
  /** 详情态、在「打印」按钮之前插入的控件（如外协 `OrderCenterDetailPrintBlock`） */
  leadingDetailActions?: React.ReactNode;
  /** 详情顶栏是否显示「编辑」，默认 true */
  showDetailEditButton?: boolean;
  /** 详情顶栏是否显示「删除」，默认 true */
  showDetailDeleteButton?: boolean;
  onClose: () => void;
  onEnterEdit: () => void;
  onCancelEdit: () => void;
  /** 与进销存一致：详情 / 编辑 两块切换 */
  detailContent?: React.ReactNode;
  formContent?: React.ReactNode;
  /**
   * 单根内容区（详情与编辑共用一棵 React 树，由子组件按 `phase` 自行切换）。
   * 传入时忽略 `detailContent` / `formContent`。
   */
  renderContent?: () => React.ReactNode;
  /** 遮罩与弹窗 z-index，默认与进销存单证弹窗一致 */
  zIndexClass?: string;
}

/**
 * 进销存单证 / 生产外协等：详情 ⇄ 编辑 共用的圆角大弹窗外壳（与 PsiOrderBillDocModal 视觉一致）。
 */
const DocPhaseModal: React.FC<DocPhaseModalProps> = ({
  open,
  phase,
  editingDocNumber,
  maxWidthClass = 'max-w-4xl',
  detailTitle,
  editTitle,
  newTitle,
  showPrint = false,
  onPrint,
  hasPerm,
  viewPerm,
  editPerm,
  deletePerm,
  deleteConfirmMessage,
  onDelete,
  renderDocBadge,
  leadingDetailActions,
  showDetailEditButton = true,
  showDetailDeleteButton = true,
  onClose,
  onEnterEdit,
  onCancelEdit,
  detailContent,
  formContent,
  renderContent,
  zIndexClass = 'z-[62]',
}) => {
  const confirm = useConfirm();
  const [editToolbarHost, setEditToolbarHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (phase !== 'edit') setEditToolbarHost(null);
  }, [phase]);

  if (!open) return null;

  const body = renderContent
    ? renderContent()
    : phase === 'detail' && editingDocNumber
      ? detailContent
      : formContent;

  return (
    <div className={`fixed inset-0 ${zIndexClass} flex items-center justify-center p-4`}>
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={onClose} aria-hidden />
      <div
        className={`relative bg-white w-full ${maxWidthClass} max-h-[90vh] rounded-[32px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95`}
        onClick={e => e.stopPropagation()}
      >
        <DocPhaseEditToolbarPortalContext.Provider value={editToolbarHost}>
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0 gap-3">
          <div className="min-w-0">
            {phase === 'detail' && editingDocNumber ? (
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-2 flex-wrap">
                {renderDocBadge ? (
                  <span className="shrink-0">{renderDocBadge(editingDocNumber)}</span>
                ) : (
                  <span className="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider shrink-0">
                    {editingDocNumber}
                  </span>
                )}
                {detailTitle}
              </h3>
            ) : (
              <h3 className="text-lg font-black text-slate-900">{editingDocNumber ? editTitle : newTitle}</h3>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {phase === 'detail' && editingDocNumber ? (
              <>
                {leadingDetailActions}
                {showPrint && onPrint && (
                  <button
                    type="button"
                    onClick={onPrint}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-slate-100 text-slate-600 hover:bg-slate-200"
                  >
                    <Printer className="w-4 h-4" /> 打印
                  </button>
                )}
                {showDetailEditButton && (hasPerm(editPerm) || hasPerm(viewPerm)) && (
                  <button
                    type="button"
                    onClick={onEnterEdit}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-slate-100 text-slate-600 hover:bg-slate-200"
                  >
                    <Pencil className="w-4 h-4" /> 编辑
                  </button>
                )}
                {showDetailDeleteButton && onDelete && deletePerm && hasPerm(deletePerm) && (
                  <button
                    type="button"
                    onClick={() => {
                      if (!deleteConfirmMessage) return;
                      void confirm({ message: deleteConfirmMessage, danger: true }).then(ok => {
                        if (!ok) return;
                        void Promise.resolve(onDelete());
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
                {editingDocNumber ? (
                  <div ref={setEditToolbarHost} className="flex min-h-0 shrink-0 items-center gap-2" />
                ) : null}
                {editingDocNumber && (
                  <button type="button" onClick={onCancelEdit} className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-700">
                    取消编辑
                  </button>
                )}
                <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50">
                  <X className="w-5 h-5" />
                </button>
              </>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-auto p-4 sm:p-6 min-h-0 bg-slate-50/30">{body}</div>
        </DocPhaseEditToolbarPortalContext.Provider>
      </div>
    </div>
  );
};

export default React.memo(DocPhaseModal);
