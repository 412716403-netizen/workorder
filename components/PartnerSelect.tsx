import React from 'react';
import { SearchablePartnerSelect } from './SearchablePartnerSelect';
import { formStandardPartnerTriggerClass } from '../styles/uiDensity';

type BaseProps = React.ComponentProps<typeof SearchablePartnerSelect>;

/**
 * 财务往来、对账合作单位、协作绑定等不限制合作单位分类的场景，等价于 `SearchablePartnerSelect`。
 *
 * 样式默认与进销存「采购订单」合作单位一致：`compact` + `psiOrderBillFormPartnerTriggerClassCompact`。
 */
export function PartnerSelect({
  compact = true,
  showCategoryHint = false,
  triggerClassName = formStandardPartnerTriggerClass,
  ...rest
}: BaseProps) {
  return (
    <SearchablePartnerSelect
      compact={compact}
      showCategoryHint={showCategoryHint}
      triggerClassName={triggerClassName}
      {...rest}
    />
  );
}
