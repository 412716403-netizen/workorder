import React from 'react';
import { SearchablePartnerSelect } from './SearchablePartnerSelect';
import { formStandardPartnerTriggerClass } from '../styles/uiDensity';
import type { Partner, PartnerCategory } from '../types';

type BaseProps = React.ComponentProps<typeof SearchablePartnerSelect>;

export type SupplierSelectProps = Omit<BaseProps, 'placeholder'> & {
  options: Partner[];
  categories?: PartnerCategory[];
  /** 覆盖默认「选择供应商…」；外协等场景可传「搜索并选择外协工厂…」 */
  placeholder?: string;
};

/**
 * 采购/外协/产品档案默认供应商等场景入口：列表与 `PartnerSelect` 相同，**展示全部分类的合作单位**（下拉里「全部 + 各分类」Tab）。
 * 需要仅某一分类时，可给底层传 `onlyCategoryId`。
 * `allowQuickCreate` 时可在下拉内快捷新建；分类由用户在弹窗内手动选择（除非显式传入 `quickCreateCategoryId`）。
 *
 * 样式默认与进销存「采购订单」合作单位一致：`compact` + `psiOrderBillFormPartnerTriggerClassCompact`。
 */
export function SupplierSelect({
  options,
  categories = [],
  allowQuickCreate = true,
  quickCreateCategoryId,
  placeholder,
  compact = true,
  showCategoryHint = false,
  triggerClassName = formStandardPartnerTriggerClass,
  ...rest
}: SupplierSelectProps) {
  return (
    <SearchablePartnerSelect
      options={options}
      categories={categories}
      allowQuickCreate={allowQuickCreate}
      quickCreateCategoryId={quickCreateCategoryId}
      placeholder={placeholder ?? '选择供应商…'}
      compact={compact}
      showCategoryHint={showCategoryHint}
      triggerClassName={triggerClassName}
      {...rest}
    />
  );
}
