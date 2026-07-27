import React, { useCallback, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Banknote, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import type { FinanceOpType, FinanceRecord } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { useFinanceData, useMasterData, useOrdersData } from '../../contexts/AppDataContext';
import { useFeaturePlugins } from '../../hooks/useFeaturePlugins';
import { hasModulePerm } from '../../utils/hasModulePerm';
import { currentOperatorDisplayName } from '../../utils/currentOperatorDisplayName';
import { defaultEntryDatetimeLocal } from '../../utils/docEntryTime';
import { buildFinanceRecordFromForm } from '../../utils/buildFinanceRecordFromForm';
import * as api from '../../services/api';
import FinanceRecordFormModal, {
  type FinanceRecordFormValues,
} from '../../views/finance/FinanceRecordFormModal';

const emptyForm = (partner: string, note: string): FinanceRecordFormValues => ({
  amount: 0,
  relatedId: '',
  partner: partner || '',
  note: note || '',
  categoryId: '',
  workerId: '',
  productId: '',
  paymentAccount: '',
  customData: {},
  entryTimestamp: defaultEntryDatetimeLocal(),
});

export interface QuickFinanceRecordButtonProps {
  financeType: Extract<FinanceOpType, 'RECEIPT' | 'PAYMENT'>;
  /** 已保存的 PSI 单号；新增态为 null，保存走 onStage */
  sourceDocNo: string | null;
  partner: string;
  defaultNote: string;
  buttonLabel: string;
  onStage?: (record: FinanceRecord) => void;
  onCreated?: () => void;
  disabled?: boolean;
  /** 为 true 时未选合作单位不可打开弹窗 */
  requirePartner?: boolean;
  partnerLabel?: string;
  className?: string;
}

/**
 * PSI 单据表单合计条旁的「登记收款单/付款单」入口。
 * 有 sourceDocNo 时直接 create；无单号时交给父层暂存，随单据保存一并落库。
 */
const QuickFinanceRecordButton: React.FC<QuickFinanceRecordButtonProps> = ({
  financeType,
  sourceDocNo,
  partner,
  defaultNote,
  buttonLabel,
  onStage,
  onCreated,
  disabled = false,
  requirePartner = false,
  partnerLabel = '合作单位',
  className = '',
}) => {
  const { currentUser, tenantCtx } = useAuth();
  const tenantRole = tenantCtx?.tenantRole;
  const userPermissions = tenantCtx?.permissions;
  const hasFinancePerm = (perm: string) => hasModulePerm(tenantRole, userPermissions, 'finance', perm);
  const permModule = financeType === 'RECEIPT' ? 'receipt' : 'payment';
  const canCreate = hasFinancePerm(`finance:${permModule}:create`);

  const { financeCategories, financeAccountTypes } = useFinanceData();
  const { partners, partnerCategories, products, categories, workers, globalNodes } = useMasterData();
  const { orders } = useOrdersData();
  const { isPluginEnabled } = useFeaturePlugins();
  const fundsAccountEnabled = isPluginEnabled('funds_account');
  const qc = useQueryClient();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FinanceRecordFormValues>(() => emptyForm(partner, defaultNote));
  const [saving, setSaving] = useState(false);

  const categoriesForType = useMemo(
    () => financeCategories.filter(c => c.kind === financeType),
    [financeCategories, financeType],
  );
  const selectedCategory = useMemo(
    () => (form.categoryId ? financeCategories.find(c => c.id === form.categoryId) ?? null : null),
    [financeCategories, form.categoryId],
  );

  const needPartner = !selectedCategory || selectedCategory.linkPartner === true;
  const needPaymentAccount = fundsAccountEnabled;
  const canSave =
    form.amount > 0
    && (!needPartner || form.partner.trim() !== '')
    && (!categoriesForType.length || !!form.categoryId)
    && (!needPaymentAccount || form.paymentAccount.trim() !== '')
    && !saving;

  const openModal = useCallback(() => {
    if (requirePartner && !(partner || '').trim()) {
      toast.warning(`请先选择${partnerLabel}`);
      return;
    }
    setForm(emptyForm(partner, defaultNote));
    setOpen(true);
  }, [partner, defaultNote, requirePartner, partnerLabel]);

  const handleSave = useCallback(async () => {
    if (!canSave) return;
    const operator = currentOperatorDisplayName(currentUser);
    const rec = buildFinanceRecordFromForm(form, {
      type: financeType,
      operator,
      isReceiptOrPayment: true,
      sourceDocNo: sourceDocNo || undefined,
    });
    if (!sourceDocNo) {
      onStage?.(rec);
      setOpen(false);
      toast.success(`${buttonLabel.replace(/^登记/, '')}已暂存，保存单据后生效`);
      return;
    }
    setSaving(true);
    try {
      await api.finance.create(rec);
      qc.invalidateQueries({ queryKey: ['finance'] });
      setOpen(false);
      toast.success(`${buttonLabel.replace(/^登记/, '')}已保存`);
      onCreated?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '添加记录失败';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }, [
    canSave,
    currentUser,
    form,
    financeType,
    sourceDocNo,
    onStage,
    qc,
    buttonLabel,
    onCreated,
  ]);

  if (!canCreate) return null;

  const Icon = financeType === 'PAYMENT' ? Wallet : Banknote;
  const blockedByPartner = requirePartner && !(partner || '').trim();
  const title = blockedByPartner ? `请先选择${partnerLabel}` : undefined;

  return (
    <>
      <button
        type="button"
        disabled={disabled || blockedByPartner}
        title={title}
        onClick={openModal}
        className={`inline-flex items-center gap-1.5 rounded-lg border border-white/40 bg-white/15 px-2.5 py-1 text-[11px] font-bold text-white transition-all hover:bg-white/25 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      >
        <Icon className="h-3.5 w-3.5 shrink-0" />
        {buttonLabel}
      </button>
      <FinanceRecordFormModal
        open={open}
        onClose={() => setOpen(false)}
        editingRecordId={null}
        current={{
          partnerLabel: financeType === 'PAYMENT' ? '供应商' : '客户',
          label: financeType === 'PAYMENT' ? '付款单' : '收款单',
        }}
        isReceiptOrPayment
        categoriesForType={categoriesForType}
        selectedCategory={selectedCategory}
        form={form}
        setForm={setForm}
        handleSave={() => { void handleSave(); }}
        canSave={canSave}
        orders={orders}
        products={products}
        partners={partners}
        partnerCategories={partnerCategories}
        categories={categories}
        workers={workers}
        globalNodes={globalNodes}
        financeAccountTypes={financeAccountTypes}
        fundsAccountEnabled={fundsAccountEnabled}
        zIndexClass="z-[80]"
        partnerLocked
      />
    </>
  );
};

export default React.memo(QuickFinanceRecordButton);
