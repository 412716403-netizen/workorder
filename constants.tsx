import { OrderStatus, MilestoneStatus } from './types';

export const STATUS_COLORS: Record<string, string> = {
  [MilestoneStatus.PENDING]: 'bg-gray-100 text-gray-600',
  [MilestoneStatus.IN_PROGRESS]: 'bg-blue-100 text-blue-600',
  [MilestoneStatus.COMPLETED]: 'bg-emerald-100 text-emerald-600',
  [MilestoneStatus.DELAYED]: 'bg-red-100 text-red-600',
  [OrderStatus.PLANNING]: 'bg-gray-100 text-gray-600',
  [OrderStatus.PRODUCING]: 'bg-blue-100 text-blue-600',
  [OrderStatus.QC]: 'bg-amber-100 text-amber-600',
  [OrderStatus.SHIPPED]: 'bg-emerald-100 text-emerald-600',
  [OrderStatus.ON_HOLD]: 'bg-red-100 text-red-600',
};

export const ORDER_STATUS_MAP = {
  [OrderStatus.PLANNING]: { label: '待排产', color: 'text-gray-500' },
  [OrderStatus.PRODUCING]: { label: '生产中', color: 'text-blue-500' },
  [OrderStatus.QC]: { label: '质检中', color: 'text-amber-500' },
  [OrderStatus.SHIPPED]: { label: '已发货', color: 'text-emerald-500' },
  [OrderStatus.ON_HOLD]: { label: '暂停', color: 'text-red-500' },
};
