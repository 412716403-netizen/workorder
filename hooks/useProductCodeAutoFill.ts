import { useCallback, useEffect, useMemo, useRef } from 'react';
import * as api from '../services/api';
import type { Product, ProductCodeAutoGen, ProductCodeRuleMap } from '../types';
import { buildProductCodePrefix, getProductCodeRule } from '../utils/productCodeRule';
import { useMasterDataOptional } from '../contexts/AppDataContext';
import { buildPartnerNameById, resolveProductPartnerName } from '../utils/productPartnerDisplay';

interface UseProductCodeAutoFillOptions {
  /** 仅未持久化的新建产品启用（编辑已有产品不自动改号） */
  enabled: boolean;
  working: Product;
  setWorking: React.Dispatch<React.SetStateAction<Product>>;
  rules: ProductCodeRuleMap;
}

export interface UseProductCodeAutoFillResult {
  /** 当前分类的编号规则为「自动生成」 */
  autoMode: boolean;
  /** 手动重新取号（无视手改判定，直接覆盖输入框） */
  refreshAutoCode: () => void;
  /**
   * 保存时调用：编号仍是自动生成值（用户没手改）返回取号载荷，
   * 让后端在锁内重新取号覆盖，保证并发不重号；手改过返回 null 按用户输入保存。
   */
  buildCodeAutoGenPayload: () => ProductCodeAutoGen | null;
}

const AUTO_FILL_DEBOUNCE_MS = 400;

/** 最近一次自动填号的完整上下文；与输入框比对判定手改、与当前规则比对判定是否需重取 */
interface LastAutoFill {
  code: string;
  prefix: string;
  serialLength: number;
}

/**
 * 产品编号自动生成：分类规则为 auto 时按规则拼前缀并向后端预取流水号填入 `working.name`。
 * 手改判定：输入框当前值 ≠ 最近一次自动填入值 → 视为手改，停止自动覆盖；
 * 清空输入框可恢复自动取号。分类/参与拼接的字段变化会触发重新取号。
 */
export function useProductCodeAutoFill({
  enabled,
  working,
  setWorking,
  rules,
}: UseProductCodeAutoFillOptions): UseProductCodeAutoFillResult {
  const rule = getProductCodeRule(rules, working.categoryId);
  const autoMode = enabled && rule.mode === 'auto' && Boolean(working.categoryId);

  // 规则可含「合作单位」元素，需把 supplierId 解析成名称后再拼段；换合作单位会触发重新取号
  const masterData = useMasterDataOptional();
  const partnerNameById = useMemo(
    () => buildPartnerNameById(masterData?.partners ?? []),
    [masterData?.partners],
  );
  const category = masterData?.categories.find((c) => c.id === working.categoryId);
  const partnerName = resolveProductPartnerName(working, category, partnerNameById);

  const prefix = autoMode ? buildProductCodePrefix(rule, working, { partnerName }) : '';

  const lastAutoRef = useRef<LastAutoFill | null>(null);
  const fetchSeqRef = useRef(0);

  const fetchAndFill = useCallback(
    (targetPrefix: string, serialLength: number) => {
      const seq = ++fetchSeqRef.current;
      void api.products
        .nextCode({ prefix: targetPrefix, serialLength })
        .then(({ code }) => {
          if (seq !== fetchSeqRef.current) return; // 已有更新的取号请求
          const prevAutoCode = lastAutoRef.current?.code;
          lastAutoRef.current = { code, prefix: targetPrefix, serialLength };
          setWorking((prev) => {
            const cur = (prev.name ?? '').trim();
            // 竞态兜底：请求飞行中被手改则不覆盖
            if (cur && cur !== prevAutoCode && cur !== code) return prev;
            return { ...prev, name: code };
          });
        })
        .catch((err: unknown) => {
          console.warn('产品编号自动取号失败', err);
        });
    },
    [setWorking],
  );

  const currentName = (working.name ?? '').trim();

  useEffect(() => {
    if (!autoMode) return;
    const last = lastAutoRef.current;
    // 手改过（且非空）不自动覆盖；清空后恢复自动取号
    if (currentName && currentName !== last?.code) return;
    // 已是当前规则下的自动号，规则/前缀没变则不重取
    if (currentName && last && last.prefix === prefix && last.serialLength === rule.serialLength) return;
    const timer = window.setTimeout(() => fetchAndFill(prefix, rule.serialLength), AUTO_FILL_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [autoMode, prefix, rule.serialLength, currentName, fetchAndFill]);

  const refreshAutoCode = useCallback(() => {
    if (!autoMode) return;
    fetchAndFill(prefix, rule.serialLength);
  }, [autoMode, prefix, rule.serialLength, fetchAndFill]);

  const buildCodeAutoGenPayload = useCallback((): ProductCodeAutoGen | null => {
    if (!autoMode) return null;
    const name = (working.name ?? '').trim();
    if (!name || name !== lastAutoRef.current?.code) return null;
    return { prefix, serialLength: rule.serialLength };
  }, [autoMode, working.name, prefix, rule.serialLength]);

  return { autoMode, refreshAutoCode, buildCodeAutoGenPayload };
}
