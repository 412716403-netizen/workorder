import { Router } from 'express';
import { z } from 'zod';
import * as ctrl from '../controllers/finance.controller.js';
import { validate } from '../middleware/validate.js';
import { requireSubPermission, requireFinanceRead, requireFinanceRecordWrite } from '../middleware/tenant.js';

const router = Router();

const createRecordSchema = z.object({
  type: z.string().min(1, '记录类型不能为空'),
  amount: z.number({ required_error: '金额不能为空' }),
}).passthrough();

const updateRecordSchema = z.object({}).passthrough();

const createTransferSchema = z.object({
  fromAccountId: z.string().min(1, '转出账户不能为空'),
  toAccountId: z.string().min(1, '转入账户不能为空'),
  amount: z.number({ required_error: '转账金额不能为空' }).positive('转账金额必须大于 0'),
  timestamp: z.string().optional(),
  note: z.string().optional(),
  operator: z.string().optional(),
}).passthrough();

const updateTransferSchema = createTransferSchema;

/**
 * 通用 `/finance/records*` 端点：承载收款单/付款单（及对账核销）落库。
 * 历史挂 `finance:records:*`，但权限树无 `records` 子模块，细粒度财务角色（如只勾收款单）
 * 拿不到 → 保存/列表 403。改为：读 → `requireFinanceRead`；写 → `requireFinanceRecordWrite`
 * 按记录 type（RECEIPT→finance:receipt、PAYMENT→finance:payment）映射真实子模块权限。
 */
router.get('/records', requireFinanceRead(), ctrl.listRecords);
router.get('/summary', requireSubPermission('finance:reconciliation:allow'), ctrl.summary);
/** 资金账户余额：按 accountTypeId 实时聚合（期初 + 收 - 付） */
router.get('/account-balances', requireSubPermission('finance:account:view'), ctrl.accountBalances);
/** 账户间转账（内部调拨）：事务内落 PAYMENT + RECEIPT 两条流水 */
router.post(
  '/transfers',
  requireSubPermission('finance:transfer:create'),
  validate(createTransferSchema),
  ctrl.createTransfer,
);
/** 编辑账户转账：成对更新转出/转入两条流水 */
router.put(
  '/transfers/:groupId',
  requireSubPermission('finance:transfer:edit'),
  validate(updateTransferSchema),
  ctrl.updateTransfer,
);
/** 删除账户转账：按 transferGroupId 成对删除两条流水 */
router.delete(
  '/transfers/:groupId',
  requireSubPermission('finance:transfer:delete'),
  ctrl.deleteTransfer,
);
/**
 * Phase 3.D follow-up：销售单打印应收 ledger 窄查；
 * 仅需 PSI 销售单查看权限即可（与打印链路保持一致）。
 */
router.get(
  '/partner-receivable',
  requireSubPermission('psi:sales_bill:view'),
  ctrl.partnerReceivable,
);
/** 合作单位对账「上期余额」窄查；与 partner-receivable 同 controller，权限走对账模块 */
router.get(
  '/reconciliation/partner-opening-balance',
  requireSubPermission('finance:reconciliation:allow'),
  ctrl.partnerReceivable,
);
router.get('/records/:id', requireFinanceRead(), ctrl.getRecord);
router.post(
  '/records',
  requireFinanceRecordWrite('create'),
  validate(createRecordSchema),
  ctrl.createRecord,
);
router.put(
  '/records/:id',
  requireFinanceRecordWrite('edit'),
  validate(updateRecordSchema),
  ctrl.updateRecord,
);
router.delete(
  '/records/:id',
  requireFinanceRecordWrite('delete'),
  ctrl.deleteRecord,
);

export default router;
