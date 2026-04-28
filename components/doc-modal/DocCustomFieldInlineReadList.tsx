import React from 'react';
import type { PlanFormFieldConfig } from '../../types';
import { PlanFormCustomFieldReadonly } from '../PlanFormCustomFieldControls';

export interface DocCustomFieldInlineReadListProps {
  fields: PlanFormFieldConfig[];
  values: Record<string, unknown>;
  hasFilled: (cf: PlanFormFieldConfig, v: unknown) => boolean;
}

/** 摘要区 inline 只读自定义字段（与多处 `PlanFormCustomFieldReadonly variant="inlineMeta"` 块一致） */
export const DocCustomFieldInlineReadList: React.FC<DocCustomFieldInlineReadListProps> = ({
  fields,
  values,
  hasFilled,
}) => (
  <>
    {fields
      .filter(cf => hasFilled(cf, values[cf.id]))
      .map(cf => (
        <span key={cf.id} className="inline-flex max-w-full min-w-0 items-baseline gap-1 normal-case">
          <span className="shrink-0">{cf.label}:</span>
          <span className="min-w-0">
            <PlanFormCustomFieldReadonly variant="inlineMeta" cf={cf} value={values[cf.id]} />
          </span>
        </span>
      ))}
  </>
);
