import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, Search } from 'lucide-react';
import {
  KnowledgeBizDocKind,
  KNOWLEDGE_BIZ_DOC_KIND_LABEL,
  PlanStatus,
} from '../../shared/types';
import type { PlanOrder, PsiRecord } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { useMasterData } from '../../contexts/AppDataContext';
import { plans as plansApi, psi as psiApi } from '../../services/api';
import { hasModulePerm } from '../../utils/hasModulePerm';
import { groupRecordsByDocNumber } from '../../utils/psiOpsAggregators';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { formatKnowledgeBizDocRefLabel } from './knowledgeEditorBizDocRef';

export interface BizDocLinkInsertConfirmPayload {
  docKind: KnowledgeBizDocKind;
  docId: string;
  docNumber: string;
  label: string;
}

interface BizDocLinkInsertDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (payload: BizDocLinkInsertConfirmPayload) => void;
}

const PLAN_STATUS_LABEL: Partial<Record<string, string>> = {
  [PlanStatus.DRAFT]: '草稿',
  [PlanStatus.APPROVED]: '已审批',
  [PlanStatus.CONVERTED]: '已转工单',
};

function canViewKind(
  tenantRole: string | undefined,
  perms: string[] | undefined,
  kind: KnowledgeBizDocKind,
): boolean {
  if (kind === KnowledgeBizDocKind.PLAN) {
    return hasModulePerm(tenantRole, perms, 'production', 'production:plans:view');
  }
  const base =
    kind === KnowledgeBizDocKind.PURCHASE_BILL
      ? 'psi:purchase_bill:view'
      : 'psi:sales_bill:view';
  return (
    hasModulePerm(tenantRole, perms, 'psi', base)
    || hasModulePerm(tenantRole, perms, 'psi', `${base}_own`)
  );
}

/** 资料库插入「关联单据」：选择生产计划 / 采购入库 / 销售单 */
const BizDocLinkInsertDialog: React.FC<BizDocLinkInsertDialogProps> = ({
  open,
  onClose,
  onConfirm,
}) => {
  const { tenantCtx } = useAuth();
  const tenantRole = tenantCtx?.tenantRole;
  const perms = tenantCtx?.permissions;
  const { products } = useMasterData();

  const allowedKinds = useMemo(
    () =>
      ([
        KnowledgeBizDocKind.PLAN,
        KnowledgeBizDocKind.PURCHASE_BILL,
        KnowledgeBizDocKind.SALES_BILL,
      ] as KnowledgeBizDocKind[]).filter(k => canViewKind(tenantRole, perms, k)),
    [tenantRole, perms],
  );

  const [docKind, setDocKind] = useState<KnowledgeBizDocKind>(KnowledgeBizDocKind.PLAN);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [selectedKey, setSelectedKey] = useState('');

  useEffect(() => {
    if (!open) return;
    setSearch('');
    setSelectedKey('');
    setDocKind(allowedKinds[0] ?? KnowledgeBizDocKind.PLAN);
  }, [open, allowedKinds]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    setSelectedKey('');
  }, [docKind, debouncedSearch]);

  const planQuery = useQuery({
    queryKey: ['kbBizDocPickerPlans', debouncedSearch],
    enabled: open && docKind === KnowledgeBizDocKind.PLAN && allowedKinds.includes(KnowledgeBizDocKind.PLAN),
    queryFn: async () => {
      const res = await plansApi.listPaginated({
        page: '1',
        pageSize: '20',
        search: debouncedSearch.trim() || undefined,
      });
      return (res?.data ?? []) as PlanOrder[];
    },
    staleTime: 10_000,
  });

  const psiQuery = useQuery({
    queryKey: ['kbBizDocPickerPsi', docKind, debouncedSearch],
    enabled:
      open
      && (docKind === KnowledgeBizDocKind.PURCHASE_BILL || docKind === KnowledgeBizDocKind.SALES_BILL)
      && allowedKinds.includes(docKind),
    queryFn: async () => {
      const type =
        docKind === KnowledgeBizDocKind.PURCHASE_BILL ? 'PURCHASE_BILL' : 'SALES_BILL';
      const res = await psiApi.listPaginated({
        type,
        page: '1',
        pageSize: '200',
        search: debouncedSearch.trim() || undefined,
      });
      return (res?.data ?? []) as PsiRecord[];
    },
    staleTime: 10_000,
  });

  const productNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of products) {
      const name = (p.name || '').trim();
      const sku = (p.sku || '').trim();
      map.set(p.id, sku ? `${name}（${sku}）` : name || p.id);
    }
    return map;
  }, [products]);

  type ListRow = {
    key: string;
    docId: string;
    docNumber: string;
    title: string;
    subtitle: string;
  };

  const rows: ListRow[] = useMemo(() => {
    if (docKind === KnowledgeBizDocKind.PLAN) {
      return (planQuery.data ?? []).map(p => ({
        key: p.id,
        docId: p.id,
        docNumber: p.planNumber,
        title: p.planNumber,
        subtitle: [
          productNameById.get(p.productId) || p.productId,
          p.customer || '',
          PLAN_STATUS_LABEL[p.status] || p.status,
          p.dueDate ? `交期 ${String(p.dueDate).slice(0, 10)}` : '',
        ]
          .filter(Boolean)
          .join(' · '),
      }));
    }
    const type =
      docKind === KnowledgeBizDocKind.PURCHASE_BILL ? 'PURCHASE_BILL' : 'SALES_BILL';
    const groups = groupRecordsByDocNumber(psiQuery.data ?? [], type);
    return Object.entries(groups)
      .filter(([docNum]) => !docNum.startsWith('UNGROUPED-'))
      .map(([docNum, items]) => {
        const first = items[0];
        const created = first?.createdAt ? String(first.createdAt).slice(0, 10) : '';
        return {
          key: docNum,
          docId: '',
          docNumber: docNum,
          title: docNum,
          subtitle: [
            first?.partner || '—',
            created,
            `${items.length} 行`,
          ]
            .filter(Boolean)
            .join(' · '),
        };
      })
      .slice(0, 40);
  }, [docKind, planQuery.data, psiQuery.data, productNameById]);

  const listLoading =
    docKind === KnowledgeBizDocKind.PLAN ? planQuery.isLoading : psiQuery.isLoading;
  const listError =
    docKind === KnowledgeBizDocKind.PLAN ? planQuery.isError : psiQuery.isError;

  const handleConfirm = () => {
    const row = rows.find(r => r.key === selectedKey);
    if (!row) {
      toast.error('请选择单据');
      return;
    }
    onConfirm({
      docKind,
      docId: row.docId,
      docNumber: row.docNumber,
      label: formatKnowledgeBizDocRefLabel(docKind, row.docNumber),
    });
    onClose();
  };

  if (!open) return null;

  return createPortal(
    <div
      className="kb-link-insert-overlay"
      onMouseDown={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="kb-link-insert-dialog kb-biz-doc-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="关联单据"
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="kb-link-insert-body">
          {allowedKinds.length === 0 ? (
            <p className="text-center text-sm text-slate-500 py-8">暂无可关联的单据权限</p>
          ) : (
            <>
              <div className="kb-biz-doc-tabs">
                {allowedKinds.map(k => (
                  <button
                    key={k}
                    type="button"
                    className={`kb-biz-doc-tab${docKind === k ? ' is-active' : ''}`}
                    onClick={() => setDocKind(k)}
                  >
                    {KNOWLEDGE_BIZ_DOC_KIND_LABEL[k]}
                  </button>
                ))}
              </div>

              <div className="kb-biz-doc-search">
                <Search className="kb-biz-doc-search-icon" aria-hidden />
                <input
                  type="search"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder={
                    docKind === KnowledgeBizDocKind.PLAN
                      ? '搜索计划单号、客户…'
                      : '输入单号可精确筛选'
                  }
                  className="kb-link-insert-input kb-biz-doc-search-input"
                  autoFocus
                />
              </div>

              {(docKind === KnowledgeBizDocKind.PURCHASE_BILL
                || docKind === KnowledgeBizDocKind.SALES_BILL) && !debouncedSearch.trim() ? (
                <p className="kb-biz-doc-hint">空搜索仅展示最近若干张；输入单号可更精确筛选</p>
              ) : null}

              <div className="kb-biz-doc-list">
                {listLoading ? (
                  <div className="kb-biz-doc-list-empty">
                    <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />
                    加载中…
                  </div>
                ) : listError ? (
                  <div className="kb-biz-doc-list-empty text-rose-600">加载失败，请稍后重试</div>
                ) : rows.length === 0 ? (
                  <div className="kb-biz-doc-list-empty">暂无匹配单据</div>
                ) : (
                  rows.map(row => (
                    <button
                      key={row.key}
                      type="button"
                      className={`kb-biz-doc-row${selectedKey === row.key ? ' is-selected' : ''}`}
                      onClick={() => setSelectedKey(row.key)}
                    >
                      <span className="kb-biz-doc-row-title">{row.title}</span>
                      <span className="kb-biz-doc-row-sub">{row.subtitle}</span>
                    </button>
                  ))
                )}
              </div>

              <button
                type="button"
                className="kb-link-insert-confirm"
                onClick={handleConfirm}
                disabled={!selectedKey}
              >
                确定
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default BizDocLinkInsertDialog;
