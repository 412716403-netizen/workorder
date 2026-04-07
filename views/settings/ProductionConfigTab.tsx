import React from 'react';
import {
  Link2,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';
import { ProductionLinkMode, ProcessSequenceMode } from '../../types';

interface ProductionConfigTabProps {
  productionLinkMode: ProductionLinkMode;
  onUpdateProductionLinkMode?: (mode: ProductionLinkMode) => void;
  processSequenceMode: ProcessSequenceMode;
  onUpdateProcessSequenceMode?: (mode: ProcessSequenceMode) => void;
  allowExceedMaxReportQty: boolean;
  onUpdateAllowExceedMaxReportQty?: (value: boolean) => void;
  canEdit: boolean;
}

const ProductionConfigTab: React.FC<ProductionConfigTabProps> = ({
  productionLinkMode,
  onUpdateProductionLinkMode,
  processSequenceMode,
  onUpdateProcessSequenceMode,
  allowExceedMaxReportQty,
  onUpdateAllowExceedMaxReportQty,
  canEdit,
}) => {
  return (
    <div className="max-w-2xl space-y-4">
      <div className="bg-white rounded-[32px] border border-slate-200 shadow-sm p-8">
        <h2 className="font-bold text-slate-800 mb-6 flex items-center gap-2 text-sm uppercase tracking-wider">
          <Link2 className="w-4 h-4 text-indigo-600" />
          生产关联模式
        </h2>
        <p className="text-slate-500 text-sm mb-6">
          决定计划单、工单、领料、报工等生产业务以工单维度还是产品维度进行关联和统计。
        </p>
        <div className="space-y-4">
          {[
            { id: 'order' as const, label: '关联工单', desc: '计划/工单显示客户、交期；领料、报工、外协、返工、入库均关联工单；工单中心按父子分组。' },
            { id: 'product' as const, label: '关联产品', desc: '计划不显示客户；工单扁平化；领料、报工等按产品关联；工单中心按产品分组。' },
          ].map(opt => (
            <label
              key={opt.id}
              className={`flex items-start gap-4 p-5 rounded-2xl border-2 transition-all ${
                !canEdit ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
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
                onChange={() => onUpdateProductionLinkMode?.(opt.id)}
                className="mt-1 w-4 h-4 text-indigo-600"
              />
              <div>
                <span className="font-bold text-slate-800">{opt.label}</span>
                <p className="text-xs text-slate-500 mt-1">{opt.desc}</p>
              </div>
            </label>
          ))}
        </div>
        <p className="text-[10px] text-slate-400 mt-6 italic">
          配置修改后仅影响新产生的数据，历史数据保持不变。
        </p>
      </div>

      <div className="bg-white rounded-[32px] border border-slate-200 shadow-sm p-8">
        <h2 className="font-bold text-slate-800 mb-4 flex items-center gap-2 text-sm uppercase tracking-wider">
          <Link2 className="w-4 h-4 text-indigo-600" />
          工序生产顺序
        </h2>
        <p className="text-slate-500 text-sm mb-6">
          控制工序是否必须按工序路线依次生产，以及报工弹窗中的默认数量提示规则。
        </p>
        <div className="space-y-4">
          {[
            {
              id: 'free' as const,
              label: '不限制工序顺序',
              desc: '所有工序可独立报工，当前工单中心与报工行为保持不变。'
            },
            {
              id: 'sequential' as const,
              label: '按工序顺序生产',
              desc: '前一工序存在报工记录后，后一工序才允许报工；下道工序默认提示数量为上一道工序的已报工数量（按颜色尺码分别提示）。'
            },
          ].map(opt => (
            <label
              key={opt.id}
              className={`flex items-start gap-4 p-5 rounded-2xl border-2 transition-all ${
                !canEdit ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
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
                onChange={() => onUpdateProcessSequenceMode?.(opt.id)}
                className="mt-1 w-4 h-4 text-indigo-600"
              />
              <div>
                <span className="font-bold text-slate-800">{opt.label}</span>
                <p className="text-xs text-slate-500 mt-1">{opt.desc}</p>
              </div>
            </label>
          ))}
        </div>
        <p className="text-[10px] text-slate-400 mt-6 italic">
          工序顺序配置同样仅影响新产生的报工与进度计算，历史数据不会被回溯调整。
        </p>
      </div>

      <div className="bg-white rounded-[32px] border border-slate-200 shadow-sm p-8">
        <h2 className="font-bold text-slate-800 mb-4 flex items-center gap-2 text-sm uppercase tracking-wider">
          <Link2 className="w-4 h-4 text-indigo-600" />
          报工数量上限
        </h2>
        <p className="text-slate-500 text-sm mb-6">
          控制报工时是否允许超过系统计算的"最多"数量（如计划剩余数或上一道工序报工数）。
        </p>
        <div className="bg-slate-50/60 border border-slate-100 rounded-2xl px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-slate-800">
              允许报工数量超过最大可报数量
            </p>
            <p className="text-xs text-slate-500 mt-1">
              关闭后，报工数量将被限制在弹窗中显示的"最多 N"以内，无法录入更大的数值。
            </p>
          </div>
          <button
            type="button"
            disabled={!canEdit}
            onClick={() => onUpdateAllowExceedMaxReportQty?.(!allowExceedMaxReportQty)}
            className={`ml-4 ${!canEdit ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            {allowExceedMaxReportQty ? (
              <ToggleRight className={`w-10 h-10 ${!canEdit ? 'text-slate-400' : 'text-indigo-600'}`} />
            ) : (
              <ToggleLeft className="w-10 h-10 text-slate-300" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default React.memo(ProductionConfigTab);
