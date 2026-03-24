import React from 'react';
import { Wrench } from 'lucide-react';
import EntitySelector from './EntitySelector';
import type { EntityOption, EntitySelectorProps } from './EntitySelector';

export type EquipmentOption = EntityOption;

type EquipmentSelectorProps = Omit<EntitySelectorProps, 'placeholder' | 'icon'> & {
  placeholder?: string;
  icon?: React.ComponentType<{ className?: string }>;
};

const EquipmentSelector: React.FC<EquipmentSelectorProps> = (props) => (
  <EntitySelector
    placeholder="选择设备..."
    icon={Wrench}
    {...props}
  />
);

export default EquipmentSelector;
