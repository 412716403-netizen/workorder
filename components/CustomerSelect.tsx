import React from 'react';
import { SearchablePartnerSelect } from './SearchablePartnerSelect';
import { psiOrderBillFormPartnerTriggerClassCompact } from '../styles/uiDensity';
import type { Partner, PartnerCategory } from '../types';

type BaseProps = React.ComponentProps<typeof SearchablePartnerSelect>;

export type CustomerSelectProps = Omit<BaseProps, 'placeholder'> & {
  options: Partner[];
  categories?: PartnerCategory[];
  /** 覆盖默认「选择客户…」 */
  placeholder?: string;
};

/**
 * 销售/计划客户等：列表与 `PartnerSelect` 相同，**展示全部分类的合作单位**；命名强调「客户」场景，可通过 Tab 切到任意分类。
 * 需要仅「客户」分类时，可给底层传 `onlyCategoryId={getCustomerCategoryId(categories)}` 等。
 *
 * 样式默认与进销存「采购订单」合作单位一致：`compact` + `psiOrderBillFormPartnerTriggerClassCompact`。
 */
export function CustomerSelect({
  options,
  categories = [],
  placeholder,
  compact = true,
  showCategoryHint = false,
  triggerClassName = psiOrderBillFormPartnerTriggerClassCompact,
  ...rest
}: CustomerSelectProps) {
  return (
    <SearchablePartnerSelect
      options={options}
      categories={categories}
      placeholder={placeholder ?? '选择客户…'}
      compact={compact}
      showCategoryHint={showCategoryHint}
      triggerClassName={triggerClassName}
      {...rest}
    />
  );
}
