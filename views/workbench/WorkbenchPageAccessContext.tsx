import React, { createContext, useContext } from 'react';

/**
 * 当前工作台页面对查看者是否「完整授权」。
 *
 * 完整授权（创建者 / 被授予 `workbench:<pageId>` / 裸 `workbench` / owner·admin）时，
 * 该页 widget 不再按模块/金额权限掩码，金额等内容全部展示。
 */
const WorkbenchPageFullAccessContext = createContext<boolean>(false);

export const WorkbenchPageAccessProvider: React.FC<{
  fullAccess: boolean;
  children: React.ReactNode;
}> = ({ fullAccess, children }) => (
  <WorkbenchPageFullAccessContext.Provider value={fullAccess}>
    {children}
  </WorkbenchPageFullAccessContext.Provider>
);

/** 当前页面是否对查看者完整授权（默认 false，即按自身权限掩码） */
export function useWorkbenchPageFullAccess(): boolean {
  return useContext(WorkbenchPageFullAccessContext);
}
