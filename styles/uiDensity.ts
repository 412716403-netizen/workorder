/**
 * 与 BasicInfoView 列表/工具栏对齐的全站密度与标题层级（仅 class 字符串，供各视图 import）。
 * 布局结构（grid 列数、flex 方向）不在此约束。
 */
export const pageTitleClass = 'text-xl font-semibold text-slate-900 tracking-tight';

export const pageSubtitleClass = 'text-slate-500 mt-1 text-sm leading-snug max-w-xl';

/** 表单/单据内「1. xxx 基础信息」等小节标题 */
export const sectionTitleClass = 'text-base font-semibold text-slate-900 tracking-tight';

export const stackLoose = 'space-y-4';

export const stackTight = 'space-y-2';

/** 两列表单栅格 */
export const formGridGap = 'gap-4';

/** 详情侧栏、弹窗内可滚动主区域 */
export const scrollPanelPadding = 'p-4';

/** 主按钮（与基础信息「新增」一致量级） */
export const primaryButtonClass =
  'px-4 py-2 rounded-lg text-sm font-semibold shadow-sm hover:opacity-95 active:scale-[0.98] transition-all';

/** 模块页顶栏容器（与 BasicInfo 合作单位一致） */
export const moduleHeaderRowClass =
  'flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3';

/** 模块页右上角主操作（实心靛蓝） */
export const primaryToolbarButtonClass =
  'bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 shadow-sm hover:bg-indigo-700 active:scale-[0.98] transition-all';

/** 次操作：浅灰底（如「表单配置」） */
export const secondaryToolbarButtonClass =
  'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-200 active:scale-[0.98] transition-all';

/** 次操作：白底描边 */
export const outlineToolbarButtonClass =
  'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 active:scale-[0.98] transition-all';

/** 次操作：强调描边（进销存待发货等） */
export const outlineAccentToolbarButtonClass =
  'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border border-indigo-200 bg-white text-indigo-600 hover:bg-indigo-50 active:scale-[0.98] transition-all';

/** 子模块 Tab 外层（非吸顶）：略收紧下边距，便于与下方标题贴近 */
export const subModuleTabBarInsetClass = '-mx-12 px-12 pt-2.5 pb-1 sm:pt-3 sm:pb-1';

/** 子模块 Tab 吸顶时的纵向内边距 */
export const subModuleTabBarStickyPadClass = 'py-2';

/** Tab 条下方主内容区顶距（与 BasicInfo 子页标题衔接，避免与 Tab 贴太紧） */
export const subModuleMainContentTopClass = 'pt-4 sm:pt-5';

/** 子模块 Tab 条背景 */
export const subModuleTabBarBackdropClass = 'z-20 bg-slate-50/95 backdrop-blur-sm';

/** 子模块 Tab 白色胶囊容器（略紧凑） */
export const subModuleTabPillClass =
  'flex bg-white p-1 rounded-2xl border border-slate-200 shadow-sm w-full lg:w-fit overflow-x-auto no-scrollbar';

/** 单个子模块 Tab 按钮（与 BasicInfo 子模块 Tab 一致） */
export function subModuleTabButtonClass(active: boolean): string {
  const base =
    'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all whitespace-nowrap';
  return active
    ? `${base} bg-indigo-50 text-indigo-600 shadow-sm`
    : `${base} text-slate-400 hover:text-slate-600 hover:bg-slate-50/50`;
}
