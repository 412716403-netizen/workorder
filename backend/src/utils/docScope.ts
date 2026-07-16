/** 列表查询的「仅本人」范围：ownTypes 中的 type 只可见自己创建的单据 */
export interface OwnDocScope {
  userId: string;
  ownTypes: string[];
}

/**
 * 单据「仅本人可见」的列表 where 条件（PsiRecord / FinanceRecord 通用）：
 * - 不在 ownTypes 中的 type 不受影响；
 * - ownTypes 中的 type 仅命中 `createdByUserId = 自己`；
 *   历史存量单（createdByUserId 为空）对仅有 view_own 的用户不可见（口径：仅对新单生效）。
 */
export function ownDocScopeCondition(
  scope: OwnDocScope | null | undefined,
): Record<string, unknown> | null {
  if (!scope || scope.ownTypes.length === 0) return null;
  return {
    OR: [
      { type: { notIn: scope.ownTypes } },
      {
        AND: [
          { type: { in: scope.ownTypes } },
          { createdByUserId: scope.userId },
        ],
      },
    ],
  };
}
