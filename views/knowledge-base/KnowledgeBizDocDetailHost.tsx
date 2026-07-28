import React, { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { KnowledgeBizDocKind } from '../../shared/types';
import { useAuth } from '../../contexts/AuthContext';
import { useAppActions, useOrdersData } from '../../contexts/AppDataContext';
import { hasModulePerm } from '../../utils/hasModulePerm';
import PlanOrderDetailHost from '../../components/PlanOrderDetailHost';
import PsiDocReadonlyDetailModal from '../../components/PsiDocReadonlyDetailModal';
import type { KnowledgeBizDocRefResolved } from './knowledgeEditorBizDocRef';

export interface KnowledgeBizDocDetailHostProps {
  target: KnowledgeBizDocRefResolved | null;
  onClose: () => void;
}

function canViewBizDoc(
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

/** 资料库点击关联单据芯片后的详情分发 */
const KnowledgeBizDocDetailHost: React.FC<KnowledgeBizDocDetailHostProps> = ({
  target,
  onClose,
}) => {
  const { tenantCtx } = useAuth();
  const tenantRole = tenantCtx?.tenantRole;
  const perms = tenantCtx?.permissions;
  const { ensureDeferredLoaded } = useAppActions();
  const { plans } = useOrdersData();

  const [planReady, setPlanReady] = useState(false);
  const [planLoading, setPlanLoading] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);

  useEffect(() => {
    setPlanReady(false);
    setPlanLoading(false);
    setOrderId(null);
    if (!target) return;

    if (!canViewBizDoc(tenantRole, perms, target.docKind)) {
      toast.warning('无该单据查看权限');
      onClose();
      return;
    }

    if (target.docKind !== KnowledgeBizDocKind.PLAN) return;

    let cancelled = false;
    setPlanLoading(true);
    void (async () => {
      try {
        await ensureDeferredLoaded();
        if (cancelled) return;
        setPlanReady(true);
      } catch {
        if (!cancelled) {
          toast.error('加载计划数据失败');
          onClose();
        }
      } finally {
        if (!cancelled) setPlanLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [target, tenantRole, perms, ensureDeferredLoaded, onClose]);

  useEffect(() => {
    if (!target || target.docKind !== KnowledgeBizDocKind.PLAN || !planReady) return;
    const found = plans.some(p => p.id === target.docId);
    if (!found) {
      toast.error('未找到该计划单，可能已删除');
      onClose();
    }
  }, [target, planReady, plans, onClose]);

  const handlePlanIdChange = useCallback(
    (id: string | null) => {
      if (!id) onClose();
    },
    [onClose],
  );

  if (!target) return null;

  if (target.docKind === KnowledgeBizDocKind.PLAN) {
    if (planLoading) {
      return (
        <div className="fixed inset-0 z-[12000] flex items-center justify-center">
          <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} aria-hidden />
          <div className="relative flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-medium text-slate-600 shadow-lg">
            <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />
            加载计划单…
          </div>
        </div>
      );
    }
    if (!planReady || !plans.some(p => p.id === target.docId)) return null;
    return (
      <PlanOrderDetailHost
        planId={target.docId}
        orderId={orderId}
        onPlanIdChange={handlePlanIdChange}
        onOrderIdChange={setOrderId}
        readOnly
      />
    );
  }

  return (
    <PsiDocReadonlyDetailModal
      docKind={target.docKind}
      docNumber={target.docNumber}
      onClose={onClose}
      zIndexClass="z-[12000]"
    />
  );
};

export default React.memo(KnowledgeBizDocDetailHost);
