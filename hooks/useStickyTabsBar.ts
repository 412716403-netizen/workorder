/**
 * 子模块顶部 tab 条的"sticky 化"行为 hook (Phase P8 抽离自 BasicInfoView)。
 *
 * 监听 sentinel 与最近 overflow scroll 容器的交叉,触发 fixed 布局;
 * 同时计算 placeholder 高度以避免内容跳动,并在 fixed 状态下根据 scrollParent 位置同步左/宽。
 *
 * 注:`active=false` 时直接禁用以避免在 PRODUCTS 详情页等隐藏 tabBar 的场景产生无效 observer。
 */
import { useRef, useState, useEffect, useLayoutEffect } from 'react';

interface UseStickyTabsBarOptions {
  /** 当为 false 时禁用 sticky (例如详情视图可见) */
  active: boolean;
}

export function useStickyTabsBar({ active }: UseStickyTabsBarOptions) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const tabsWrapRef = useRef<HTMLDivElement>(null);
  const [isStuck, setIsStuck] = useState(false);
  const [placeholderHeight, setPlaceholderHeight] = useState(0);
  const [barStyle, setBarStyle] = useState<{ left: number; width: number } | null>(null);

  const updateBarPosition = () => {
    const scrollParent = sentinelRef.current?.closest('[class*="overflow-auto"]');
    if (scrollParent) {
      const rect = scrollParent.getBoundingClientRect();
      setBarStyle({ left: rect.left, width: rect.width });
    }
  };

  useEffect(() => {
    if (!active) {
      setIsStuck(false);
      setBarStyle(null);
      return;
    }
    const sentinel = sentinelRef.current;
    const scrollParent = sentinel?.closest('[class*="overflow-auto"]');
    if (!sentinel || !scrollParent) return;
    const observer = new IntersectionObserver(([entry]) => setIsStuck(!entry.isIntersecting), {
      root: scrollParent,
      rootMargin: '0px',
      threshold: 0,
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [active]);

  useLayoutEffect(() => {
    if (isStuck) {
      updateBarPosition();
      window.addEventListener('resize', updateBarPosition);
      return () => window.removeEventListener('resize', updateBarPosition);
    }
    setBarStyle(null);
  }, [isStuck]);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      if (tabsWrapRef.current) setPlaceholderHeight(tabsWrapRef.current.offsetHeight);
    });
    return () => cancelAnimationFrame(id);
  }, []);

  return {
    sentinelRef,
    tabsWrapRef,
    isStuck,
    placeholderHeight,
    barStyle,
  };
}
