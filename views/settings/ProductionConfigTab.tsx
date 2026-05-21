import React from 'react';
import {
  Link2,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';
import { ProductionLinkMode, ProcessSequenceMode } from '../../types';
import { useConfirm } from '../../contexts/ConfirmContext';

interface ProductionConfigTabProps {
  productionLinkMode: ProductionLinkMode;
  onUpdateProductionLinkMode?: (mode: ProductionLinkMode) => void;
  processSequenceMode: ProcessSequenceMode;
  onUpdateProcessSequenceMode?: (mode: ProcessSequenceMode) => void;
  allowExceedMaxReportQty: boolean;
  onUpdateAllowExceedMaxReportQty?: (value: boolean) => void;
  allowExceedMaxOutsourceReceiveQty: boolean;
  onUpdateAllowExceedMaxOutsourceReceiveQty?: (value: boolean) => void;
  canEdit: boolean;
}

/** 本页统一字号：区块标题 / 正文 / 辅助说明 */
const SECTION_TITLE =
  'mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-800';
const SECTION_INTRO = 'mb-6 text-sm text-slate-500';
const OPTION_LABEL = 'text-sm font-bold text-slate-800';
const OPTION_DESC = 'mt-1 text-sm text-slate-500';
const FOOTNOTE = 'mt-6 text-xs text-slate-400';
const TOGGLE_ROW =
  'flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50/60 px-4 py-3';

/**
 * 关联模式切换会改变进度数据的归属语义（详见 docs/05-production-link-mode.md）：
 * - order → product：旧 milestone 进度仍可见（视图层做了 PMP+milestone 双路合并），但新报工不再绑工单。
 * - product → order：旧 PMP 上的进度因 PMP 没有 orderId 字段，只能按工单数量比例摊回展示，**不是真值**。
 * 所以两个方向都要弹窗确认；工序顺序模式同理（影响新报工的"前一道完成"门禁口径）。
 */
const PRODUCTION_LINK_MODE_SWITCH_MESSAGE: Record<ProductionLinkMode, string> = {
  order: [
    '切换为「关联工单」模式后：',
    '• 历史产品池 (PMP) 上累积的进度仍可见，但因为产品池没有工单归属，工单卡片上的「已报」会按工单数量比例摊回展示，**不是真值**。',
    '• 新报工将精确绑定到具体工单。',
    '',
    '建议在切换前导出当前数据备份。确定要切换吗？',
  ].join('\n'),
  product: [
    '切换为「关联产品」模式后：',
    '• 历史工单上的报工进度仍可见，会与新产品池进度合并展示。',
    '• 新报工将写入产品维度，不再绑定具体工单。',
    '• 反向切换回「关联工单」时，新增的产品池数据无法精确归回具体工单。',
    '',
    '确定要切换吗？',
  ].join('\n'),
};

const PROCESS_SEQUENCE_MODE_SWITCH_MESSAGE: Record<ProcessSequenceMode, string> = {
  free: [
    '切换为「不限制工序顺序」后：',
    '• 所有工序均可独立报工，不再校验前一道工序是否已完成。',
    '• 历史报工记录不会被修改。',
    '',
    '确定要切换吗？',
  ].join('\n'),
  sequential: [
    '切换为「按工序顺序生产」后：',
    '• 后一道工序必须等前一道工序产生报工后才允许报工。',
    '• 已存在的"跳序"历史报工不会被回溯调整，但会影响新工序的可报最多数量计算口径。',
    '',
    '确定要切换吗？',
  ].join('\n'),
};

const ProductionConfigTab: React.FC<ProductionConfigTabProps> = ({
  productionLinkMode,
  onUpdateProductionLinkMode,
  processSequenceMode,
  onUpdateProcessSequenceMode,
  allowExceedMaxReportQty,
  onUpdateAllowExceedMaxReportQty,
  allowExceedMaxOutsourceReceiveQty,
  onUpdateAllowExceedMaxOutsourceReceiveQty,
  canEdit,
}) => {
  const confirm = useConfirm();

  const handleSwitchLinkMode = async (next: ProductionLinkMode) => {
    if (!onUpdateProductionLinkMode) return;
    if (next === productionLinkMode) return;
    const ok = await confirm({
      title: '切换生产关联模式',
      message: PRODUCTION_LINK_MODE_SWITCH_MESSAGE[next],
      confirmText: '确认切换',
      cancelText: '取消',
      danger: true,
    });
    if (!ok) return;
    onUpdateProductionLinkMode(next);
  };

  const handleSwitchSequenceMode = async (next: ProcessSequenceMode) => {
    if (!onUpdateProcessSequenceMode) return;
    if (next === processSequenceMode) return;
    const ok = await confirm({
      title: '切换工序顺序模式',
      message: PROCESS_SEQUENCE_MODE_SWITCH_MESSAGE[next],
      confirmText: '确认切换',
      cancelText: '取消',
    });
    if (!ok) return;
    onUpdateProcessSequenceMode(next);
  };

  return (
    <div className="max-w-2xl space-y-4 text-sm text-slate-800">
      <div className="rounded-[32px] border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className={SECTION_TITLE}>
          <Link2 className="h-4 w-4 text-indigo-600" />
          生产关联模式
        </h2>
        <p className={SECTION_INTRO}>
          决定计划单、工单、领料、报工等生产业务以工单维度还是产品维度进行关联和统计。
        </p>
        <div className="space-y-4">
          {[
            { id: 'order' as const, label: '关联工单', desc: '计划/工单显示客户、交期；领料、报工、外协、返工、入库均关联工单；工单中心按父子分组。' },
            { id: 'product' as const, label: '关联产品', desc: '计划不显示客户；工单扁平化；领料、报工等按产品关联；工单中心按产品分组。' },
          ].map(opt => (
            <label
              key={opt.id}
              className={`flex items-start gap-4 rounded-2xl border-2 p-5 transition-all ${
                !canEdit ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
              } ${
                productionLinkMode === opt.id
                  ? 'border-indigo-600 bg-indigo-50/50 shadow-sm'
                  : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50/30'
              }`}
            >
              <input
                type="radio"
                name="productionLinkMode"
                checked={productionLinkMode === opt.id}
                disabled={!canEdit}
                onChange={() => { void handleSwitchLinkMode(opt.id); }}
                className="mt-1 h-4 w-4 text-indigo-600"
              />
              <div>
                <span className={OPTION_LABEL}>{opt.label}</span>
                <p className={OPTION_DESC}>{opt.desc}</p>
              </div>
            </label>
          ))}
        </div>
        <p className={FOOTNOTE}>配置修改后仅影响新产生的数据，历史数据保持不变。</p>
      </div>

      <div className="rounded-[32px] border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className={SECTION_TITLE}>
          <Link2 className="h-4 w-4 text-indigo-600" />
          工序生产顺序
        </h2>
        <p className={SECTION_INTRO}>
          控制工序是否必须按工序路线依次生产，以及报工弹窗中的默认数量提示规则。
        </p>
        <div className="space-y-4">
          {[
            {
              id: 'free' as const,
              label: '不限制工序顺序',
              desc: '所有工序可独立报工，当前工单中心与报工行为保持不变。',
            },
            {
              id: 'sequential' as const,
              label: '按工序顺序生产',
              desc: '前一工序存在报工记录后，后一工序才允许报工；下道工序默认提示数量为上一道工序的已报工数量（按颜色尺码分别提示）。',
            },
          ].map(opt => (
            <label
              key={opt.id}
              className={`flex items-start gap-4 rounded-2xl border-2 p-5 transition-all ${
                !canEdit ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
              } ${
                processSequenceMode === opt.id
                  ? 'border-indigo-600 bg-indigo-50/50 shadow-sm'
                  : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50/30'
              }`}
            >
              <input
                type="radio"
                name="processSequenceMode"
                checked={processSequenceMode === opt.id}
                disabled={!canEdit}
                onChange={() => { void handleSwitchSequenceMode(opt.id); }}
                className="mt-1 h-4 w-4 text-indigo-600"
              />
              <div>
                <span className={OPTION_LABEL}>{opt.label}</span>
                <p className={OPTION_DESC}>{opt.desc}</p>
              </div>
            </label>
          ))}
        </div>
        <p className={FOOTNOTE}>工序顺序配置同样仅影响新产生的报工与进度计算，历史数据不会被回溯调整。</p>
      </div>

      <div className="rounded-[32px] border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className={SECTION_TITLE}>
          <Link2 className="h-4 w-4 text-indigo-600" />
          数量上限
        </h2>
        <div className="space-y-4">
          <div className={TOGGLE_ROW}>
            <div>
              <p className={OPTION_LABEL}>允许报工数量超过最大可报数量</p>
              <p className={OPTION_DESC}>
                关闭后，报工数量将被限制在弹窗中显示的「最多 N」以内，无法录入更大的数值（如计划剩余数或上一道工序报工数）。
              </p>
            </div>
            <button
              type="button"
              disabled={!canEdit}
              onClick={() => onUpdateAllowExceedMaxReportQty?.(!allowExceedMaxReportQty)}
              className={`ml-4 shrink-0 ${!canEdit ? 'cursor-not-allowed opacity-60' : ''}`}
            >
              {allowExceedMaxReportQty ? (
                <ToggleRight className={`h-10 w-10 ${!canEdit ? 'text-slate-400' : 'text-indigo-600'}`} />
              ) : (
                <ToggleLeft className="h-10 w-10 text-slate-300" />
              )}
            </button>
          </div>
          <div className={TOGGLE_ROW}>
            <div>
              <p className={OPTION_LABEL}>允许外协收货数量超过最大可收货数量</p>
              <p className={OPTION_DESC}>
                关闭后，外协收货录入与扫码累加将被限制在每行的「最多 N」以内，无法录入更大的数值（待收回数量 = 已派 − 已收）。
              </p>
            </div>
            <button
              type="button"
              disabled={!canEdit}
              onClick={() => onUpdateAllowExceedMaxOutsourceReceiveQty?.(!allowExceedMaxOutsourceReceiveQty)}
              className={`ml-4 shrink-0 ${!canEdit ? 'cursor-not-allowed opacity-60' : ''}`}
            >
              {allowExceedMaxOutsourceReceiveQty ? (
                <ToggleRight className={`h-10 w-10 ${!canEdit ? 'text-slate-400' : 'text-indigo-600'}`} />
              ) : (
                <ToggleLeft className="h-10 w-10 text-slate-300" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default React.memo(ProductionConfigTab);
