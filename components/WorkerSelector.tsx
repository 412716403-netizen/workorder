import React from 'react';
import { User } from 'lucide-react';
import EntitySelector from './EntitySelector';
import type { EntityOption, EntitySelectorProps } from './EntitySelector';

export type WorkerOption = EntityOption;

type WorkerSelectorProps = Omit<EntitySelectorProps, 'placeholder' | 'icon'> & {
  placeholder?: string;
  icon?: React.ComponentType<{ className?: string }>;
};

const WorkerSelector: React.FC<WorkerSelectorProps> = (props) => (
  <EntitySelector
    placeholder="选择生产人员..."
    icon={User}
    {...props}
  />
);

export default WorkerSelector;
