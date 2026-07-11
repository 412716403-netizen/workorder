import React from 'react';
import { SearchablePartnerSelect } from './SearchablePartnerSelect';
import { formStandardPartnerTriggerClass } from '../styles/uiDensity';

type BaseProps = React.ComponentProps<typeof SearchablePartnerSelect>;

/**
 * 财务往来、协作绑定等不限制合作单位分类的场景，等价于 `SearchablePartnerSelect`。
 * 默认开启下拉内「新建」快捷添加；筛选条等只读查询场景可传 `allowQuickCreate={false}`。
 *
 * 样式默认与进销存「采购订单」合作单位一致：`compact` + `psiOrderBillFormPartnerTriggerClassCompact`。
 */
export function PartnerSelect({
  compact = true,
  showCategoryHint = false,
  allowQuickCreate = true,
  triggerClassName = formStandardPartnerTriggerClass,
  ...rest
}: BaseProps) {
  return (
    <SearchablePartnerSelect
      compact={compact}
      showCategoryHint={showCategoryHint}
      allowQuickCreate={allowQuickCreate}
      triggerClassName={triggerClassName}
      {...rest}
    />
  );
}
