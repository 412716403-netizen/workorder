import React, { useMemo } from 'react';
import { RectangleHorizontal, RectangleVertical } from 'lucide-react';
import type { PrintTemplate, PrintTemplateDocumentType } from '../../types';
import { getPaperMarginsMm } from './layoutMetrics';
import { PRINT_PAPER_A4_MM, PRINT_PAPER_A5_MM } from '../../utils/printTemplateDefaults';
import { Labeled } from './Labeled';

const PAPER_PRESETS: { label: string; w: number; h: number }[] = [
  { label: 'A4 (210×297 mm)', w: PRINT_PAPER_A4_MM.widthMm, h: PRINT_PAPER_A4_MM.heightMm },
  { label: 'A5 (148×210 mm)', w: PRINT_PAPER_A5_MM.widthMm, h: PRINT_PAPER_A5_MM.heightMm },
  { label: '241×93 mm（三等分）', w: 241, h: 93 },
  { label: '241×140 mm（二等分）', w: 241, h: 140 },
];

function TemplatePaperSettingsInner({
  template,
  onSetName,
  onSetDocumentType,
  setPaperSize,
  applyPaperPreset,
  setPaperMarginsMm,
  setPaperBackgroundColor,
  swapPaperDimensions,
}: {
  template: PrintTemplate;
  onSetName: (name: string) => void;
  onSetDocumentType: (documentType: PrintTemplateDocumentType) => void;
  setPaperSize: (w: number, h: number) => void;
  applyPaperPreset: (value: string) => void;
  setPaperMarginsMm: (patch: Partial<{ top: number; bottom: number; left: number; right: number }>) => void;
  setPaperBackgroundColor: (c: string) => void;
  swapPaperDimensions: () => void;
}) {
  const margins = getPaperMarginsMm(template);
  const { widthMm: w, heightMm: h } = template.paperSize;
  const isLandscape = w > h;
  const presetValue = useMemo(() => {
    if (template.paperSizeCustom === true) return 'custom';
    const hit = PAPER_PRESETS.find(p => p.w === w && p.h === h);
    return hit ? `${hit.w}x${hit.h}` : 'custom';
  }, [w, h, template.paperSizeCustom]);
  const bg = template.paperBackgroundColor ?? '#FFFFFF';

  return (
    <div className="h-full space-y-4 overflow-y-auto p-4">
      <h3 className="text-sm font-black text-slate-800">模板配置</h3>

      <Labeled label="模板名称">
        <input
          type="text"
          value={template.name}
          onChange={e => onSetName(e.target.value)}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-800"
          placeholder="未命名模板"
        />
      </Labeled>

      <Labeled label="数据源（单据类型）">
        <select
          value={template.documentType ?? 'all'}
          onChange={e => onSetDocumentType(e.target.value as PrintTemplateDocumentType)}
          className="w-full rounded-lg border border-slate-200 px-2 py-2 text-xs font-bold text-slate-800"
        >
          <option value="all">不限制</option>
          <option value="plan">计划单</option>
          <option value="order">工单</option>
          <option value="salesBill">销售单</option>
          <option value="productionMaterial">生产物料</option>
          <option value="outsource">外协管理</option>
          <option value="rework">返工管理</option>
          <option value="purchaseOrder">采购订单</option>
          <option value="salesOrder">销售订单</option>
          <option value="purchaseBill">采购入库</option>
          <option value="receipt">收款单</option>
          <option value="payment">付款单</option>
        </select>
        <p className="mt-1.5 text-[10px] leading-snug text-slate-400">
          决定「插入字段」可选分类，以及动态列表列模板中字段分组的排序依据。选「不限制」时与旧模板行为一致（列表字段分组按工单语义排序）。
        </p>
      </Labeled>

      <Labeled label="尺寸及方向">
        <div className="flex gap-2">
          <select
            value={presetValue}
            onChange={e => applyPaperPreset(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-2 text-xs font-bold"
          >
            {PAPER_PRESETS.map(p => (
              <option key={`${p.w}x${p.h}`} value={`${p.w}x${p.h}`}>
                {p.label}
              </option>
            ))}
            <option value="custom">自定义尺寸</option>
          </select>
          <div className="flex shrink-0 rounded-xl border border-slate-200 bg-slate-50 p-0.5">
            <button
              type="button"
              title="竖版"
              onClick={() => {
                if (isLandscape) swapPaperDimensions();
              }}
              className={`rounded-lg p-2 ${!isLandscape ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500 hover:bg-white'}`}
            >
              <RectangleVertical className="h-4 w-4" />
            </button>
            <button
              type="button"
              title="横版"
              onClick={() => {
                if (!isLandscape && w !== h) swapPaperDimensions();
              }}
              className={`rounded-lg p-2 ${isLandscape ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500 hover:bg-white'}`}
            >
              <RectangleHorizontal className="h-4 w-4" />
            </button>
          </div>
        </div>
      </Labeled>

      <div className="grid grid-cols-2 gap-2">
        <Labeled label="宽度 (mm)">
          <input
            type="number"
            step={0.1}
            min={1}
            value={w}
            onChange={e => setPaperSize(Math.max(1, Number(e.target.value) || 1), h)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold"
          />
        </Labeled>
        <Labeled label="高度 (mm)">
          <input
            type="number"
            step={0.1}
            min={1}
            value={h}
            onChange={e => setPaperSize(w, Math.max(1, Number(e.target.value) || 1))}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold"
          />
        </Labeled>
      </div>

      <Labeled label="纸张边距 (mm)">
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-slate-400">上</span>
            <input
              type="number"
              step={0.1}
              min={0}
              value={margins.top}
              onChange={e => setPaperMarginsMm({ top: Math.max(0, Number(e.target.value) || 0) })}
              className="w-full rounded-lg border border-slate-200 px-2 py-2 text-xs font-bold"
            />
          </div>
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-slate-400">下</span>
            <input
              type="number"
              step={0.1}
              min={0}
              value={margins.bottom}
              onChange={e => setPaperMarginsMm({ bottom: Math.max(0, Number(e.target.value) || 0) })}
              className="w-full rounded-lg border border-slate-200 px-2 py-2 text-xs font-bold"
            />
          </div>
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-slate-400">左</span>
            <input
              type="number"
              step={0.1}
              min={0}
              value={margins.left}
              onChange={e => setPaperMarginsMm({ left: Math.max(0, Number(e.target.value) || 0) })}
              className="w-full rounded-lg border border-slate-200 px-2 py-2 text-xs font-bold"
            />
          </div>
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-slate-400">右</span>
            <input
              type="number"
              step={0.1}
              min={0}
              value={margins.right}
              onChange={e => setPaperMarginsMm({ right: Math.max(0, Number(e.target.value) || 0) })}
              className="w-full rounded-lg border border-slate-200 px-2 py-2 text-xs font-bold"
            />
          </div>
        </div>
      </Labeled>

      <Labeled label="纸张背景颜色">
        <div className="flex gap-2">
          <input
            type="text"
            value={bg}
            onChange={e => setPaperBackgroundColor(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-2 font-mono text-xs font-bold uppercase"
          />
          <input
            type="color"
            value={bg.startsWith('#') && (bg.length === 4 || bg.length === 7) ? bg : '#ffffff'}
            onChange={e => setPaperBackgroundColor(e.target.value)}
            className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-slate-200"
          />
        </div>
      </Labeled>

      <p className="rounded-xl border border-slate-100 bg-slate-50/80 p-3 text-[11px] leading-relaxed text-slate-500">
        提示：用左侧组件库添加元素；选中画布上的组件后，可在此编辑组件属性。点击图纸空白区域可回到本页设置纸张。
        <span className="mt-2 block text-slate-500">
          多页打印由数据决定：动态列表传入明细时会自动分页；也可在打印入口设置总页数（<code className="rounded bg-white/80 px-0.5">ctx.page.total</code>
          ）。未勾选「每页重复」的组件只在第 1 页绘制；页眉、页脚每页都有。
        </span>
      </p>
    </div>
  );
}

export const TemplatePaperSettings = React.memo(TemplatePaperSettingsInner);
