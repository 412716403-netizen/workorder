import {
  OWN_SCOPED_FINANCE_TYPE_PERM_BASE,
  PSI_DOC_FINANCE_OP_TYPE,
  PSI_ORDER_BILL_DOC_LABEL,
  canViewDocList,
  type PsiOrderBillDocType,
} from '../shared/types';
import { isTenantElevatedRole } from './hasModulePerm';

/** 快捷收付款备注默认文案：关联{单据类型} {单号}；无单号时仅写关联{单据类型} */
export function buildPsiDocFinanceNote(
  docType: PsiOrderBillDocType,
  docNumber?: string | null,
): string {
  const label = PSI_ORDER_BILL_DOC_LABEL[docType];
  const no = (docNumber ?? '').trim();
  return no ? `关联${label} ${no}` : `关联${label}`;
}

/** 已收/付款金额展示标签 */
export function psiDocLinkedFinanceAmountLabel(docType: PsiOrderBillDocType): string {
  return PSI_DOC_FINANCE_OP_TYPE[docType] === 'PAYMENT' ? '已付款金额' : '已收款金额';
}

/** 快捷按钮文案：登记付款单 / 登记收款单 */
export function psiDocQuickFinanceButtonLabel(docType: PsiOrderBillDocType): string {
  return PSI_DOC_FINANCE_OP_TYPE[docType] === 'PAYMENT' ? '登记付款单' : '登记收款单';
}

/** 表单合计条旁短标签：已付款 / 已收款 */
export function psiDocStagedFinanceShortLabel(docType: PsiOrderBillDocType): string {
  return PSI_DOC_FINANCE_OP_TYPE[docType] === 'PAYMENT' ? '已付款' : '已收款';
}

/**
 * 是否可按 sourceDocNo 反查该单据的关联收/付款。
 * 无对应财务查看权限时不应发起请求（列表接口要求 finance 下任一权限，否则 403）。
 */
export function canReadPsiDocLinkedFinance(
  docType: PsiOrderBillDocType,
  tenantRole: string | undefined,
  userPermissions: string[] | undefined,
): boolean {
  if (isTenantElevatedRole(tenantRole)) return true;
  const permBase = OWN_SCOPED_FINANCE_TYPE_PERM_BASE[PSI_DOC_FINANCE_OP_TYPE[docType]];
  return canViewDocList(userPermissions, permBase);
}
