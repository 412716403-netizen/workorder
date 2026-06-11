/**
 * 外协「待收回 → 收货录入」扫码共享 hook。
 *
 * 把扫码 → 解析 token → 校验去重 → 在候选行命中 → 计算 entry key 与数量增量的逻辑统一收口，
 * 供两个调用点共用：
 *
 * 1. {@link OutsourceReceiveQuantityModal} 录入弹窗内的「扫码录入」（基于已勾选行累加数量）。
 * 2. {@link OutsourceReceiveListModal} 待收回清单弹窗的「扫码收货」（先选加工厂、自动锁工序、
 *    扫完跳到录入弹窗）。
 *
 * Hook 本身**不**写入 quantities state；返回 `{ row, key, qty }` 由调用方根据自身上下文 commit。
 *
 * 边界判定（与 plan 一致，详见 docs/01-business-rules.md 外协收货段落）：
 *
 * - 命中 `pendingRows`（pending>0）→ 走常规累加。
 * - 命中失败且 `allAggregates` 中存在 partner+productId 行（即历史上给该加工厂外发过）：
 *   - `allowExceedMaxOutsourceReceiveQty=true` → 特例放行，注入该聚合行 baseKey；
 *   - 否则 toast「该产品在当前加工厂已全部收回」并拒绝。
 * - `allAggregates` 中也无 partner+productId 行 → 永远拒绝（toast「该产品未外发给加工厂 X」）。
 * - 工序锁定：`isNodeAllowed?.(nodeId) === false` → toast「请分批收货」并拒绝。
 */

import { useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { itemCodesApi, planVirtualBatchesApi } from '../services/api';
import { rewriteScanApiErrorForIme, type ScanPayload } from '../utils/scanPayload';
import {
  scanItemResultToRowDetail,
  scanVirtualBatchResultToRowDetail,
  type ScanBatchRowDetail,
} from '../utils/scanBatchRowDetail';
import { productHasColorSizeMatrix } from '../utils/productColorSize';
import { checkExceedMax } from '../utils/scanApplyGuards';
import type { Product, ProductCategory } from '../types';
import {
  RECEIVE_VARIANT_SEP,
  outsourceReceiveBaseKey,
  type OutsourceReceiveRowLike,
} from '../views/production-ops/outsourceReceiveKeys';

export interface ReceiveScanRow extends OutsourceReceiveRowLike {
  /** 仅用于错误文案展示；非必填 */
  productName?: string;
  milestoneName?: string;
  /** 行级 pending；特例聚合行可能为 0 */
  pending: number;
}

export interface UseOutsourceReceiveScanOptions {
  /** pending>0 的候选行（用于实际命中 + 数量累加） */
  pendingRows: ReceiveScanRow[];
  /**
   * 全量聚合行（**不**过滤 pending<=0），用于跨工厂判定 + 特例放行。
   * 不传或为空时退化为仅基于 `pendingRows` 判断（提示文案统一为「不在本次收货列表中」）。
   */
  allAggregates?: ReceiveScanRow[];
  products: Product[];
  categories: ProductCategory[];
  /** 受 `SystemSetting.allowExceedMaxOutsourceReceiveQty` 控制 */
  allowExceedMaxOutsourceReceiveQty?: boolean;
  /**
   * 选填的加工厂过滤；传值后 `pendingRows` / `allAggregates` 会按 partner 二次过滤。
   * 列表弹窗扫码场景必传（一次扫码会话只针对一个加工厂）；录入弹窗已由
   * `receiveSelectedKeys` 保证同工厂，可不传。
   */
  partner?: string;
  /**
   * 工序约束：命中行 nodeId 必须满足此回调返回 true。
   * 列表弹窗扫码场景下，调用方维护「首条命中工序」并据此判断；不满足时 toast「请分批收货」。
   */
  isNodeAllowed?: (nodeId: string) => boolean;
}

export interface ApplyScanInput {
  payload: ScanPayload;
  /**
   * 当前已累加 quantities 快照（key -> qty）。
   * Hook 用它做 `checkExceedMax` 上限校验，但**不**写入；写入由调用方完成。
   */
  currentQuantities: Record<string, number>;
}

export interface ApplyScanResult {
  row: ReceiveScanRow;
  /** 实际写入 `receiveFormQuantities` 用的 key（含 variant 后缀，见 outsourceReceiveKeys.ts） */
  key: string;
  baseKey: string;
  qty: number;
  /** 是否由 allAggregates 特例路径命中（pending=0 但开启允许超额） */
  isFromAllAggregates: boolean;
  /** 用于扫码弹窗列表行展示 */
  detail: ScanBatchRowDetail;
  /** 解析到的 itemCodeId/virtualBatchId（用于 ScanBatchSessionModal 的会话内重叠判定） */
  itemCodeId: string | null;
  virtualBatchId: string | null;
}

export interface UseOutsourceReceiveScanReturn {
  applyScanPayload: (input: ApplyScanInput) => Promise<ApplyScanResult | null>;
  /** 仅取详情用于 ScanBatchSessionModal 行预览；不做命中/上限校验 */
  resolveScanRowPreview: (payload: ScanPayload) => Promise<ScanBatchRowDetail | null>;
  resetSession: () => void;
}

interface ResolvedScan {
  productId: string;
  variantId: string | null;
  /** 单品=1，批次=res.quantity */
  qty: number;
  itemCodeId: string | null;
  virtualBatchId: string | null;
  detail: ScanBatchRowDetail;
}

export function useOutsourceReceiveScan(opts: UseOutsourceReceiveScanOptions): UseOutsourceReceiveScanReturn {
  const {
    pendingRows,
    allAggregates,
    products,
    categories,
    allowExceedMaxOutsourceReceiveQty = false,
    partner,
    isNodeAllowed,
  } = opts;

  /**
   * 会话内「按 token 缓存」的解析+命中+校验结果。
   *
   * 关键：扫码当下（`resolveScanRowPreview`）就把每个码解析、命中候选行、跑持久化去重、算出
   * entry key，并缓存到这里；点「确认应用」时 `applyScanPayload` 直接读缓存（**0 网络请求**），
   * 只补做超额/工序锁校验。这样把网络开销从「确认时瞬时 N 倍爆发」摊到「逐件扫码的几分钟里」，
   * 避免大批量（上千件）一次性把后端限流（200 请求/60s）打爆。
   *
   * 同时它天然充当会话内去重：同一 token 第二次进来直接命中缓存、不再发请求，也不再像旧实现
   * 那样在中途失败后污染一个独立的「已扫过」集合导致整单无法重试。
   */
  const preparedByTokenRef = useRef<Map<string, ApplyScanResult>>(new Map());

  const resetSession = useCallback(() => {
    preparedByTokenRef.current = new Map();
  }, []);

  /**
   * 解析扫码 token；通过 itemCodes/planVirtualBatches API 取回 productId/variantId/quantity。
   * 纯网络解析，不做去重（去重由 `preparedByTokenRef` 缓存 + ScanBatchSessionModal 会话层负责）。
   */
  const resolveScan = useCallback(
    async (payload: ScanPayload): Promise<ResolvedScan | null> => {
      if (!payload.token) return null;
      if (payload.kind === 'ITEM') {
        const res = await itemCodesApi.scan(payload.token);
        if (res.kind !== 'ITEM_CODE') return null;
        if (res.status !== 'ACTIVE') {
          toast.error(res.message || '单品码不可用');
          return null;
        }
        const productId = res.productId ?? '';
        if (!productId) {
          toast.error('扫码结果缺少产品信息');
          return null;
        }
        return {
          productId,
          variantId: res.variantId ?? null,
          qty: 1,
          itemCodeId: res.itemCodeId ?? null,
          virtualBatchId: res.batchId ?? null,
          detail: scanItemResultToRowDetail(res),
        };
      }
      if (payload.kind === 'BATCH') {
        const res = await planVirtualBatchesApi.scan(payload.token);
        if (res.kind !== 'VIRTUAL_BATCH') return null;
        if (res.status !== 'ACTIVE') {
          toast.error(res.message || '批次码不可用');
          return null;
        }
        const productId = res.productId ?? '';
        if (!productId) {
          toast.error('扫码结果缺少产品信息');
          return null;
        }
        return {
          productId,
          variantId: res.variantId ?? null,
          qty: res.quantity ?? 0,
          itemCodeId: null,
          virtualBatchId: res.batchId ?? null,
          detail: scanVirtualBatchResultToRowDetail(res),
        };
      }
      return null;
    },
    [],
  );

  /**
   * 持久化去重：与录入弹窗历史行为一致。任何调用方都会先做这步，
   * 避免同一码跨会话被多次写入收回单。
   */
  const validateUsage = useCallback(
    async (params: { row: ReceiveScanRow; itemCodeId: string | null; virtualBatchId: string | null }) => {
      const { row, itemCodeId, virtualBatchId } = params;
      if (!itemCodeId && !virtualBatchId) return true;
      try {
        const res = await itemCodesApi.validateUsage({
          purpose: 'OUTSOURCE_RECEIVE',
          scope: {
            orderId: row.orderId,
            productId: row.productId,
            partner: row.partner,
          },
          itemCodeId,
          virtualBatchId,
        });
        if (res.code === 'DUPLICATE_SAVED') {
          toast.error(res.message || '该码已在本单收货，不可重复扫码');
          return false;
        }
        return true;
      } catch {
        return true;
      }
    },
    [],
  );

  /** 计算 receiveFormQuantities 的 entry key（含 variant 段，符合 outsourceReceiveKeys.ts 约定） */
  const computeEntryKey = useCallback(
    (row: ReceiveScanRow, variantId: string | null): { key: string; baseKey: string } | { error: string } => {
      const baseKey = outsourceReceiveBaseKey(row);
      const product = products.find((p) => p.id === row.productId);
      const category = categories.find((c) => c.id === product?.categoryId);
      const hasColorSizeMatrix = productHasColorSizeMatrix(product, category);
      const isProductBlockRecv = row.orderId == null;
      let key = baseKey;
      if (hasColorSizeMatrix && variantId) {
        key = isProductBlockRecv
          ? `${baseKey}${RECEIVE_VARIANT_SEP}${variantId}`
          : `${baseKey}|${variantId}`;
      } else if (hasColorSizeMatrix && !variantId) {
        return { error: '当前产品按规格管理，码未带规格' };
      }
      return { key, baseKey };
    },
    [products, categories],
  );

  /**
   * 扫码当下执行的「重活」：解析 token → 命中候选行（含 allAggregates 特例分流）→ 算 entry key →
   * 持久化去重校验。成功后按 token 缓存整个 {@link ApplyScanResult}（不含超额/工序锁校验，那两项
   * 依赖确认时的累计与锁定，留给 `applyScanPayload`）。
   *
   * - 同一 token 第二次进来命中缓存、直接返回，不再发请求（确认应用即走这条 0 网络路径）。
   * - 任一步失败：toast 由各步给出，返回 null，且**不写缓存**——重试时可重新解析，不会被污染。
   */
  const prepareScan = useCallback(
    async (payload: ScanPayload): Promise<ApplyScanResult | null> => {
      if (payload.token) {
        const cached = preparedByTokenRef.current.get(payload.token);
        if (cached) return cached;
      }

      const partnerFilter = partner != null ? String(partner) : null;
      const pendingPool = partnerFilter != null
        ? pendingRows.filter((r) => (r.partner ?? '') === partnerFilter)
        : pendingRows;
      if (pendingPool.length === 0 && !allAggregates?.length) return null;

      const resolved = await resolveScan(payload);
      if (!resolved) return null;
      const { productId, variantId, qty: addQty, itemCodeId, virtualBatchId, detail } = resolved;

      let row = pendingPool.find((r) => r.productId === productId);
      let isFromAllAggregates = false;

      if (!row) {
        // 命中失败时按 allAggregates 分流：未外发 / 已收完 / 特例放行
        const aggregatePool = allAggregates && partnerFilter != null
          ? allAggregates.filter((r) => (r.partner ?? '') === partnerFilter)
          : allAggregates ?? [];
        const aggregateRows = aggregatePool.filter((r) => r.productId === productId);
        if (aggregateRows.length === 0) {
          if (partnerFilter != null) {
            toast.error(`此码对应产品未外发给加工厂「${partnerFilter}」`);
          } else {
            toast.error('此码对应产品不在本次收货列表中');
          }
          return null;
        }
        // 有历史外发但 pending<=0
        if (!allowExceedMaxOutsourceReceiveQty) {
          toast.error(`此码对应产品在加工厂「${partnerFilter ?? ''}」已全部收回`);
          return null;
        }
        // 特例：开启允许超额，注入该聚合行（取 nodeId 最契合工序锁的一行；不行则首条）
        const allowedRow = aggregateRows.find((r) => (isNodeAllowed ? isNodeAllowed(r.nodeId) : true));
        row = allowedRow ?? aggregateRows[0];
        isFromAllAggregates = true;
      }

      if (!row) return null;

      const keyResult = computeEntryKey(row, variantId);
      if ('error' in keyResult) {
        toast.error(keyResult.error);
        return null;
      }
      const { key, baseKey } = keyResult;

      if (!(await validateUsage({ row, itemCodeId, virtualBatchId }))) {
        return null;
      }

      const result: ApplyScanResult = {
        row,
        key,
        baseKey,
        qty: addQty,
        isFromAllAggregates,
        detail,
        itemCodeId,
        virtualBatchId,
      };
      if (payload.token) preparedByTokenRef.current.set(payload.token, result);
      return result;
    },
    [pendingRows, allAggregates, partner, allowExceedMaxOutsourceReceiveQty, isNodeAllowed, resolveScan, computeEntryKey, validateUsage],
  );

  const applyScanPayload = useCallback(
    async (input: ApplyScanInput): Promise<ApplyScanResult | null> => {
      const { payload, currentQuantities } = input;
      try {
        // 扫码阶段已 prepare 过 → 命中缓存、0 网络；未命中（极少）则回退到实时解析，保证不漏单
        const result = await prepareScan(payload);
        if (!result) return null;

        // 工序锁定校验（特例路径也复用同一锁定，避免跨工序混扫）
        if (isNodeAllowed && !isNodeAllowed(result.row.nodeId)) {
          const lockName = result.row.milestoneName || result.row.nodeId;
          toast.error(`该码属于工序「${lockName}」，与首条扫入工序不同；请分批收货`);
          return null;
        }

        // 行级 pending 上限校验：特例路径或开启允许超额时跳过
        if (!allowExceedMaxOutsourceReceiveQty && !result.isFromAllAggregates) {
          const cur = currentQuantities[result.key] ?? 0;
          const ck = checkExceedMax(cur, result.qty, result.row.pending);
          if (ck.exceeds) {
            toast.error(ck.message ?? '本次扫入数量超过该行外协待收上限');
            return null;
          }
        }

        return result;
      } catch (e) {
        toast.error(rewriteScanApiErrorForIme(payload.raw, (e as Error)?.message || '扫码查询失败'));
        return null;
      }
    },
    [prepareScan, isNodeAllowed, allowExceedMaxOutsourceReceiveQty],
  );

  const resolveScanRowPreview = useCallback(
    async (payload: ScanPayload): Promise<ScanBatchRowDetail | null> => {
      try {
        const result = await prepareScan(payload);
        return result?.detail ?? null;
      } catch (e) {
        toast.error(rewriteScanApiErrorForIme(payload.raw, (e as Error)?.message || '扫码查询失败'));
        return null;
      }
    },
    [prepareScan],
  );

  return { applyScanPayload, resolveScanRowPreview, resetSession };
}
