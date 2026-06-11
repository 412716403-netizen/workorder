import React from 'react';

interface WorkbenchIconGridProps {
  children: React.ReactNode;
  className?: string;
}

/** 随工作台组件宽度自动增减列数（非视口断点） */
const WorkbenchIconGrid: React.FC<WorkbenchIconGridProps> = ({ children, className = '' }) => (
  <div
    className={`grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,6rem),1fr))] ${className}`}
  >
    {children}
  </div>
);

export default WorkbenchIconGrid;
