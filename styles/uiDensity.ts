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

// ── 全站标准表单密度（h-9 / text-xs / font-medium，以新增产品为基准）──

/** 字段标签 */
export const formStandardLabelClass =
  'text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1 ml-0.5';

/** 文本框、下拉等标准控件 */
export const formStandardControlClass =
  'w-full h-9 min-h-9 box-border bg-slate-50 border border-slate-100 rounded-lg px-3 text-xs font-medium text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-200 outline-none transition-all';

/** 左侧带图标的数字输入 */
export const formStandardControlIconClass =
  'w-full h-9 min-h-9 box-border bg-slate-50 border border-slate-100 rounded-lg pl-9 pr-3 text-xs font-medium text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-200 outline-none transition-all';

/** 多行备注等（高度随内容，最小约两行） */
export const formStandardTextareaClass =
  'w-full min-h-[4.5rem] box-border bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 text-xs font-medium text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-200 outline-none transition-all resize-none';

/** 单位/供应商/规格旁的「+」快捷按钮 */
export const formStandardQuickAddBtnClass =
  'shrink-0 inline-flex items-center justify-center w-9 h-9 min-w-9 min-h-9 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 focus:ring-2 focus:ring-indigo-500 outline-none transition-all';

/** 可搜索合作单位/产品下拉触发器 */
export const formStandardPartnerTriggerClass =
  'text-xs w-full max-w-full !min-h-9 !h-9 !font-medium rounded-lg border border-slate-100 bg-slate-50';

/** 颜色/尺码等已选展示触发区 */
export const formStandardSpecPickerClass =
  'flex-1 min-w-0 h-9 min-h-9 flex flex-wrap gap-1 items-center text-left bg-slate-50 rounded-lg px-3 text-xs font-medium text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none hover:bg-slate-100/80 transition-colors border border-slate-100 focus:border-indigo-200';

/** 主白卡片 */
export const formStandardCardClass =
  'bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-sm space-y-4';

/** 双列表单栅格间距 */
export const formStandardGridGapClass = 'gap-4';

/** 吸顶工具条 */
export const formStandardStickyBarClass =
  'flex items-center justify-between sticky top-0 z-40 py-2 bg-slate-50/90 backdrop-blur-md -mx-4 px-4 border-b border-slate-200 gap-2 flex-wrap';

/** 分类/Tab 胶囊 */
export function formStandardCategoryPillClass(active: boolean): string {
  const base = 'px-3 py-1.5 rounded-lg text-xs font-medium transition-all border';
  return active
    ? `${base} bg-indigo-600 text-white border-indigo-600 shadow-sm hover:bg-indigo-700 hover:border-indigo-700`
    : `${base} bg-white/80 text-slate-600 border-slate-200 hover:bg-white hover:text-slate-800 hover:border-slate-300`;
}

// ── 进销存：采购/销售订单与采购/销售单 新建编辑页（紧凑布局，四表单共用）──

/** 页外壳：较窄最大宽度、略减纵向间距与底部留白 */
export const psiOrderBillFormShellClass =
  'max-w-4xl mx-auto space-y-3 animate-in slide-in-from-bottom-4 pb-16';

/** 吸顶工具条 */
export const psiOrderBillFormStickyBarClass =
  'flex items-center justify-between sticky top-0 z-40 py-2.5 bg-slate-50/90 backdrop-blur-md -mx-4 px-4 border-b border-slate-200';

/** 主白卡片容器 */
export const psiOrderBillFormCardClass =
  'bg-white rounded-2xl p-5 sm:p-6 border border-slate-200 shadow-sm space-y-6';

/** 「1. 基础信息」等内容块纵向堆叠 */
export const psiOrderBillFormSectionStackClass = 'space-y-5';

/** 「2. 明细」与基础信息分隔区 */
export const psiOrderBillFormDetailSplitClass = 'pt-6 border-t border-slate-50 space-y-5';

/** 基础信息双列表单栅格间距 */
export const psiOrderBillFormGridGapClass = 'gap-3';

/** 文本/日期/自定义字段等标准控件（全站 h-9，与 formStandardControlClass 一致） */
export const psiOrderBillFormFieldControlClass = formStandardControlClass;

/** 只读单号等展示框 */
export const psiOrderBillFormReadonlyBoxClass =
  'w-full min-w-0 h-9 min-h-9 box-border bg-slate-100 border border-slate-100 rounded-lg py-0 pl-10 pr-3 text-xs font-medium text-slate-800 flex items-center truncate';

/** 小节标题旁图标底（靛蓝） */
export const psiOrderBillFormSectionIconIndigoClass =
  'w-9 h-9 bg-indigo-50 rounded-lg flex items-center justify-center text-indigo-600 shrink-0';

/** 小节标题旁图标底（翠绿，明细区） */
export const psiOrderBillFormSectionIconEmeraldClass =
  'w-9 h-9 bg-emerald-50 rounded-lg flex items-center justify-center text-emerald-600 shrink-0';

/** 合作单位等触发器（与标准控件同高） */
export const psiOrderBillFormPartnerTriggerClass = formStandardPartnerTriggerClass;

/** 与 SearchableProductSelect `compact`、明细行品项选择同密度 */
export const psiOrderBillFormPartnerTriggerClassCompact = formStandardPartnerTriggerClass;

/** 明细行字段标签（与销售单新增一致） */
export const psiOrderBillCompactLineLabelClass =
  'text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1';

/** 明细行数字输入 / 与 `MaterialIssueBatchSelect` default 同高 */
export const psiOrderBillCompactLineInputClass =
  'h-9 min-h-9 w-full box-border rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium leading-tight text-slate-900 tabular-nums outline-none focus:ring-2 focus:ring-indigo-500';

/** 明细行只读金额、总数等 */
export const psiOrderBillCompactLineReadonlyClass =
  'flex h-9 min-h-9 items-center box-border rounded-lg border border-slate-200 bg-white px-2 text-xs font-black leading-tight text-indigo-600';

/** 基础信息只读单号内层（左侧预留给图标 `pl-10`） */
export const psiOrderBillCompactDocReadonlyInnerClass =
  'flex h-9 min-h-9 w-full min-w-0 items-center box-border truncate rounded-lg border border-slate-200 bg-slate-50 py-0 pl-10 pr-2 text-xs font-bold text-slate-800';

/** 入库/出库仓库等原生 `<select>` */
export const psiOrderBillCompactWarehouseSelectClass = `${psiOrderBillCompactLineInputClass} cursor-pointer`;

/** 底部「总量 / 金额」紧凑汇总条 */
export const psiOrderBillCompactSummaryBarClass =
  'flex flex-wrap justify-end gap-x-5 gap-y-1 rounded-lg bg-indigo-600 px-3 py-2 text-white shadow-md shadow-indigo-200/40';

export const psiOrderBillCompactSummaryLabelClass =
  'text-[10px] font-bold uppercase tracking-wide text-white/75';

export const psiOrderBillCompactSummaryValueClass = 'text-base font-black tabular-nums';

export const psiOrderBillCompactSummaryUnitClass = 'ml-0.5 text-[10px] font-semibold text-white/80';

// ── 进销存：四类单据列表页（紧凑，与新建页 max-w 对齐）──

/** 列表纵向间距；宽度随父级/页面铺满，不设 max-w */
export const psiOrderBillListStackClass = 'space-y-3 w-full';

/** 无数据空态容器 */
export const psiOrderBillListEmptyClass =
  'bg-white rounded-2xl border-2 border-dashed border-slate-200 py-14 text-center';

/** 单条单据卡片外壳 */
export const psiOrderBillListCardClass =
  'bg-white border border-slate-200 rounded-2xl shadow-sm hover:shadow-md transition-all overflow-hidden group';

/** 卡片头部（单号/单位/操作） */
export const psiOrderBillListCardHeaderClass =
  'px-4 sm:px-5 py-3 bg-slate-50/50 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3';

/** 卡片内表格区域 */
export const psiOrderBillListTableWrapClass = 'px-4 sm:px-5 py-3 overflow-x-auto';

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

/** 次操作：浅灰底（通用次要；顶栏「表单配置」请用 formConfigToolbarButtonClass） */
export const secondaryToolbarButtonClass =
  'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-200 active:scale-[0.98] transition-all';

/** 顶栏「表单配置」：浅靛蓝底 + 深字（与工单中心等界面参考一致） */
export const formConfigToolbarButtonClass =
  'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border border-indigo-100 bg-indigo-50 text-slate-700 hover:bg-indigo-100/90 hover:border-indigo-200 active:scale-[0.98] transition-all';

/** 次操作：白底描边 */
export const outlineToolbarButtonClass =
  'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 active:scale-[0.98] transition-all';

/** 次操作：强调描边（进销存待发货等） */
export const outlineAccentToolbarButtonClass =
  'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border border-indigo-200 bg-white text-indigo-600 hover:bg-indigo-50 active:scale-[0.98] transition-all';

/** 子模块 Tab 外层（非吸顶）：仅纵向留白，不做负边距全宽背景 */
export const subModuleTabBarInsetClass = 'pt-2.5 pb-1 sm:pt-3 sm:pb-1';

/** 子模块 Tab 吸顶时的纵向内边距 */
export const subModuleTabBarStickyPadClass = 'py-2';

/** Tab 条下方主内容区顶距（与 BasicInfo 子页标题衔接，避免与 Tab 贴太紧） */
export const subModuleMainContentTopClass = 'pt-4 sm:pt-5';

/** 子模块 Tab 条背景 */
export const subModuleTabBarBackdropClass = 'z-20 bg-slate-50/95 backdrop-blur-sm';

/** 子模块 Tab 白色胶囊容器（宽度随内容，不撑满） */
export const subModuleTabPillClass =
  'inline-flex bg-white p-1 rounded-2xl border border-slate-200 shadow-sm w-fit max-w-full overflow-x-auto no-scrollbar';

/** 单个子模块 Tab 按钮（与 BasicInfo 子模块 Tab 一致） */
export function subModuleTabButtonClass(active: boolean): string {
  const base =
    'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all whitespace-nowrap';
  return active
    ? `${base} bg-indigo-50 text-indigo-600 shadow-sm`
    : `${base} text-slate-400 hover:text-slate-600 hover:bg-slate-50/50`;
}

// ── 单据弹窗 / 生产密集表单：与 `psiOrderBill*` 同一套 token 的中性别名（新代码优先用 `docFormCompact*`）──
export const docFormCompactFormShellClass = psiOrderBillFormShellClass;
export const docFormCompactFormStickyBarClass = psiOrderBillFormStickyBarClass;
export const docFormCompactFormCardClass = psiOrderBillFormCardClass;
export const docFormCompactFormSectionStackClass = psiOrderBillFormSectionStackClass;
export const docFormCompactFormDetailSplitClass = psiOrderBillFormDetailSplitClass;
export const docFormCompactFormGridGapClass = psiOrderBillFormGridGapClass;
export const docFormCompactFormFieldControlClass = psiOrderBillFormFieldControlClass;
export const docFormCompactFormReadonlyBoxClass = psiOrderBillFormReadonlyBoxClass;
export const docFormCompactFormSectionIconIndigoClass = psiOrderBillFormSectionIconIndigoClass;
export const docFormCompactFormSectionIconEmeraldClass = psiOrderBillFormSectionIconEmeraldClass;
export const docFormCompactFormPartnerTriggerClass = psiOrderBillFormPartnerTriggerClass;
export const docFormCompactFormPartnerTriggerClassCompact = psiOrderBillFormPartnerTriggerClassCompact;
export const docFormCompactLineLabelClass = psiOrderBillCompactLineLabelClass;
export const docFormCompactLineInputClass = psiOrderBillCompactLineInputClass;
export const docFormCompactLineReadonlyClass = psiOrderBillCompactLineReadonlyClass;
export const docFormCompactDocReadonlyInnerClass = psiOrderBillCompactDocReadonlyInnerClass;
export const docFormCompactWarehouseSelectClass = psiOrderBillCompactWarehouseSelectClass;
export const docFormCompactSummaryBarClass = psiOrderBillCompactSummaryBarClass;
export const docFormCompactSummaryLabelClass = psiOrderBillCompactSummaryLabelClass;
export const docFormCompactSummaryValueClass = psiOrderBillCompactSummaryValueClass;
export const docFormCompactSummaryUnitClass = psiOrderBillCompactSummaryUnitClass;
export const docFormCompactListStackClass = psiOrderBillListStackClass;
export const docFormCompactListEmptyClass = psiOrderBillListEmptyClass;
export const docFormCompactListCardClass = psiOrderBillListCardClass;
export const docFormCompactListCardHeaderClass = psiOrderBillListCardHeaderClass;
export const docFormCompactListTableWrapClass = psiOrderBillListTableWrapClass;

// ── 产品档案：formStandard* 别名（历史 import 兼容）──
export const productArchiveFormLabelClass = formStandardLabelClass;
export const productArchiveFormControlClass = formStandardControlClass;
export const productArchiveFormControlIconClass = formStandardControlIconClass;
export const productArchiveFormQuickAddBtnClass = formStandardQuickAddBtnClass;
export const productArchiveFormPartnerTriggerClass = formStandardPartnerTriggerClass;
export const productArchiveFormSpecPickerClass = formStandardSpecPickerClass;
export const productArchiveFormCardClass = formStandardCardClass;
export const productArchiveFormGridGapClass = formStandardGridGapClass;
export const productArchiveFormStickyBarClass = formStandardStickyBarClass;
export const productArchiveFormCategoryPillClass = formStandardCategoryPillClass;
