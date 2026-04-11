import React, { createContext, useCallback, useContext, useMemo } from 'react';

type MainScrollSegmentContextValue = {
  setScrollSegment: (segment: string) => void;
};

const MainScrollSegmentContext = createContext<MainScrollSegmentContextValue | null>(null);

export function MainScrollSegmentProvider({
  setScrollSegment,
  children,
}: {
  setScrollSegment: React.Dispatch<React.SetStateAction<string>>;
  children: React.ReactNode;
}) {
  const stable = useCallback((s: string) => setScrollSegment(s), [setScrollSegment]);
  const value = useMemo(() => ({ setScrollSegment: stable }), [stable]);
  return (
    <MainScrollSegmentContext.Provider value={value}>{children}</MainScrollSegmentContext.Provider>
  );
}

/** 多 Tab 页面在切换子模块时调用，用于主内容区按「路由 + 子模块」分别记忆滚动位置 */
export function useSetMainScrollSegment(): ((segment: string) => void) | undefined {
  return useContext(MainScrollSegmentContext)?.setScrollSegment;
}
