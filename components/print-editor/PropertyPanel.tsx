import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Trash2, ChevronsUp, ChevronsDown, RectangleHorizontal, RectangleVertical } from 'lucide-react';
import type {
  PrintBodyElement,
  PrintDynamicListColumn,
  PrintDynamicListDataSource,
  PrintDynamicListElementConfig,
  PrintHeaderFooterConfig,
  PrintHeaderFooterItem,
  PrintTableElementConfig,
  PrintTemplate,
} from '../../types';
import type { PrintSelection } from './usePrintEditor';
import { FieldPicker } from './FieldPicker';
import type { PrintFieldOption } from './printFieldOptions';
import { getPaperMarginsMm } from './layoutMetrics';
import { newElementId, PRINT_PAPER_A4_MM, PRINT_PAPER_A5_MM } from '../../utils/printTemplateDefaults';

function fieldOptionsForListSource(options: PrintFieldOption[], src: PrintDynamicListDataSource): PrintFieldOption[] {
  const order =
    src === 'order'
      ? ['工单', '明细行', '系统', '工序', '产品', '计划', '计划自定义']
      : src === 'plan'
        ? ['计划', '计划自定义', '明细行', '系统', '产品', '工序', '工单']
        : ['产品', '明细行', '系统', '工序', '计划', '计划自定义', '工单'];
  return [...options].sort((a, b) => {
    const ia = order.indexOf(a.group);
    const ib = order.indexOf(b.group);
    const sa = ia === -1 ? 999 : ia;
    const sb = ib === -1 ? 999 : ib;
    if (sa !== sb) return sa - sb;
    return a.label.localeCompare(b.label, 'zh');
  });
}

function DynamicListPropertyEditor({
  el,
  c,
  fieldOptions,
  onUpdateElementConfig,
}: {
  el: PrintBodyElement;
  c: PrintDynamicListElementConfig;
  fieldOptions: PrintFieldOption[];
  onUpdateElementConfig: (id: string, config: PrintBodyElement['config']) => void;
}) {
  const [colIdx, setColIdx] = useState(0);
  useEffect(() => setColIdx(0), [el.id]);

  useEffect(() => {
    if (Array.isArray(c.columns) && c.columns.length > 0) return;
    const n = Math.max(1, c.dataColumnCount || 3);
    const columns: PrintDynamicListColumn[] = Array.from({ length: n }, (_, i) => ({
      id: newElementId(),
      headerLabel: `列${i + 1}`,
      contentTemplate: '',
      textAlign: 'left',
      color: '#000000',
    }));
    onUpdateElementConfig(el.id, {
      ...c,
      dataSource: c.dataSource ?? 'order',
      dataColumnCount: n,
      showHeader: c.showHeader ?? true,
      showSerial: c.showSerial ?? true,
      serialHeaderLabel: c.serialHeaderLabel ?? '序号',
      borderStyle: c.borderStyle ?? 'solid',
      borderColor: c.borderColor ?? '#000000',
      headerBackgroundColor: c.headerBackgroundColor ?? '#f1f5f9',
      headerFontSizePt: c.headerFontSizePt ?? 8,
      fontSizePt: c.fontSizePt ?? 8,
      columns,
    });
    // 仅缺列数据时补齐（如历史脏数据），避免依赖整份 c 导致重复写入
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [el.id]);

  const listFieldOptions = useMemo(() => fieldOptionsForListSource(fieldOptions, c.dataSource), [fieldOptions, c.dataSource]);

  const columns = c.columns ?? [];
  const safeIdx = columns.length ? Math.min(colIdx, columns.length - 1) : 0;
  const active = columns[safeIdx];

  const syncColumnCount = (n: number) => {
    const next = Math.min(12, Math.max(1, n));
    let nextCols = [...columns];
    while (nextCols.length < next) {
      nextCols.push({
        id: newElementId(),
        headerLabel: `列${nextCols.length + 1}`,
        contentTemplate: '',
        textAlign: 'left',
        color: '#000000',
      });
    }
    if (nextCols.length > next) nextCols = nextCols.slice(0, next);
    let w = [...(c.dataColumnWidthsMm ?? [])];
    while (w.length < next) w.push(0);
    if (w.length > next) w = w.slice(0, next);
    onUpdateElementConfig(el.id, { ...c, dataColumnCount: next, columns: nextCols, dataColumnWidthsMm: w });
    setColIdx(i => Math.min(i, nextCols.length - 1));
  };

  const patchColumn = (
    idx: number,
    patch: Partial<PrintDynamicListColumn>,
    clearKeys?: (keyof PrintDynamicListColumn)[],
  ) => {
    onUpdateElementConfig(el.id, {
      ...c,
      columns: columns.map((col, i) => {
        if (i !== idx) return col;
        const next = { ...col, ...patch };
        if (clearKeys) {
          for (const k of clearKeys) delete (next as Record<string, unknown>)[k as string];
        }
        return next;
      }),
    });
  };

  const deleteColumn = () => {
    if (columns.length <= 1) return;
    const nextCols = columns.filter((_, i) => i !== safeIdx);
    let w = [...(c.dataColumnWidthsMm ?? [])];
    while (w.length < columns.length) w.push(0);
    w = w.filter((_, i) => i !== safeIdx);
    onUpdateElementConfig(el.id, { ...c, dataColumnCount: nextCols.length, columns: nextCols, dataColumnWidthsMm: w });
    setColIdx(0);
  };

  const patchDataColumnWidth = (idx: number, raw: string) => {
    const arr = [...(c.dataColumnWidthsMm ?? [])];
    while (arr.length < columns.length) arr.push(0);
    const v = Number(raw);
    arr[idx] = raw === '' || Number.isNaN(v) || v <= 0 ? 0 : v;
    onUpdateElementConfig(el.id, { ...c, dataColumnWidthsMm: arr });
  };

  if (!active) {
    return <p className="text-xs text-slate-400">正在初始化列…</p>;
  }

  return (
    <div className="space-y-3">
      <p className="text-[10px] font-black uppercase text-slate-400">组件配置</p>
      <Labeled label="表格数据源">
        <select
          value={c.dataSource}
          onChange={e =>
            onUpdateElementConfig(el.id, { ...c, dataSource: e.target.value as PrintDynamicListDataSource })
          }
          className="w-full rounded-lg border border-slate-200 px-2 py-2 text-xs font-bold"
        >
          <option value="order">工单</option>
          <option value="plan">计划单</option>
          <option value="product">产品</option>
        </select>
      </Labeled>
      <Labeled label="表格列数（不含序号列）">
        <input
          type="number"
          min={1}
          max={12}
          value={c.dataColumnCount}
          onChange={e => syncColumnCount(Number(e.target.value) || 1)}
          className="w-full rounded-lg border border-slate-200 px-2 py-2 text-xs font-bold"
        />
      </Labeled>
      <p className="text-[10px] font-black uppercase text-slate-400">展示配置</p>
      <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
        <input
          type="checkbox"
          checked={!!c.showHeader}
          onChange={e => onUpdateElementConfig(el.id, { ...c, showHeader: e.target.checked })}
        />
        展示表头
      </label>
      <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
        <input
          type="checkbox"
          checked={!!c.showSerial}
          onChange={e => onUpdateElementConfig(el.id, { ...c, showSerial: e.target.checked })}
        />
        展示序号
      </label>
      {c.showSerial ? (
        <Labeled label="序号列表头">
          <input
            type="text"
            value={c.serialHeaderLabel}
            onChange={e => onUpdateElementConfig(el.id, { ...c, serialHeaderLabel: e.target.value })}
            className="w-full rounded-lg border border-slate-200 px-2 py-2 text-xs font-bold"
          />
        </Labeled>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <Labeled label="边框样式">
          <select
            value={c.borderStyle}
            onChange={e =>
              onUpdateElementConfig(el.id, { ...c, borderStyle: e.target.value as PrintDynamicListElementConfig['borderStyle'] })
            }
            className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
          >
            <option value="solid">实线（默认）</option>
            <option value="dashed">虚线</option>
            <option value="none">无</option>
          </select>
        </Labeled>
        <Labeled label="边框色">
          <input
            type="color"
            value={c.borderColor.startsWith('#') ? c.borderColor : '#000000'}
            onChange={e => onUpdateElementConfig(el.id, { ...c, borderColor: e.target.value })}
            className="h-9 w-full cursor-pointer rounded-lg border border-slate-200"
          />
        </Labeled>
      </div>
      <Labeled label="表头背景色">
        <input
          type="color"
          value={c.headerBackgroundColor.startsWith('#') ? c.headerBackgroundColor : '#f1f5f9'}
          onChange={e => onUpdateElementConfig(el.id, { ...c, headerBackgroundColor: e.target.value })}
          className="h-9 w-full cursor-pointer rounded-lg border border-slate-200"
        />
      </Labeled>
      <div className="grid grid-cols-2 gap-2">
        <Labeled label="表头字号 pt">
          <input
            type="number"
            min={6}
            max={24}
            value={c.headerFontSizePt}
            onChange={e => onUpdateElementConfig(el.id, { ...c, headerFontSizePt: Number(e.target.value) || 8 })}
            className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
          />
        </Labeled>
        <Labeled label="单元格字号 pt">
          <input
            type="number"
            min={6}
            max={24}
            value={c.fontSizePt}
            onChange={e => onUpdateElementConfig(el.id, { ...c, fontSizePt: Number(e.target.value) || 8 })}
            className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
          />
        </Labeled>
      </div>
      <p className="text-[10px] font-black uppercase text-slate-400">单元格尺寸 (mm)</p>
      <p className="text-[10px] leading-relaxed text-slate-400">留空表示自动：列宽未填的列均分剩余宽度；数据行高度不填时占满组件内除表头外的区域。</p>
      <Labeled label="表头行高度">
        <input
          type="number"
          min={0}
          step={0.1}
          placeholder="自动"
          value={c.headerRowHeightMm != null && c.headerRowHeightMm > 0 ? c.headerRowHeightMm : ''}
          onChange={e => {
            const v = Number(e.target.value);
            onUpdateElementConfig(el.id, {
              ...c,
              headerRowHeightMm: e.target.value === '' || Number.isNaN(v) || v <= 0 ? undefined : v,
            });
          }}
          className="w-full rounded-lg border border-slate-200 px-2 py-2 text-xs font-bold"
        />
      </Labeled>
      <Labeled label="数据行高度">
        <input
          type="number"
          min={0}
          step={0.1}
          placeholder="自动（填满）"
          value={c.bodyRowHeightMm != null && c.bodyRowHeightMm > 0 ? c.bodyRowHeightMm : ''}
          onChange={e => {
            const v = Number(e.target.value);
            onUpdateElementConfig(el.id, {
              ...c,
              bodyRowHeightMm: e.target.value === '' || Number.isNaN(v) || v <= 0 ? undefined : v,
            });
          }}
          className="w-full rounded-lg border border-slate-200 px-2 py-2 text-xs font-bold"
        />
      </Labeled>
      {c.showSerial ? (
        <Labeled label="序号列宽度">
          <input
            type="number"
            min={0}
            step={0.1}
            placeholder="自动"
            value={c.serialColumnWidthMm != null && c.serialColumnWidthMm > 0 ? c.serialColumnWidthMm : ''}
            onChange={e => {
              const v = Number(e.target.value);
              onUpdateElementConfig(el.id, {
                ...c,
                serialColumnWidthMm: e.target.value === '' || Number.isNaN(v) || v <= 0 ? undefined : v,
              });
            }}
            className="w-full rounded-lg border border-slate-200 px-2 py-2 text-xs font-bold"
          />
        </Labeled>
      ) : null}
      <Labeled label="数据列宽度">
        <div className="max-h-40 space-y-2 overflow-y-auto rounded-xl border border-slate-100 bg-slate-50/80 p-2">
          {columns.map((col, i) => {
            const wArr = c.dataColumnWidthsMm ?? [];
            const mm = wArr[i] ?? 0;
            return (
              <div key={col.id} className="flex items-center gap-2">
                <span className="w-14 shrink-0 text-[10px] font-bold text-slate-500">列{i + 1}</span>
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  placeholder="均分"
                  value={mm > 0 ? mm : ''}
                  onChange={e => patchDataColumnWidth(i, e.target.value)}
                  className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-bold"
                />
              </div>
            );
          })}
        </div>
      </Labeled>
      <p className="text-[10px] font-black uppercase text-slate-400">列配置</p>
      <Labeled label="当前列">
        <select
          value={safeIdx}
          onChange={e => setColIdx(Number(e.target.value))}
          className="w-full rounded-lg border border-slate-200 px-2 py-2 text-xs font-bold"
        >
          {columns.map((col, i) => (
            <option key={col.id} value={i}>
              {i + 1} — {col.headerLabel || `列${i + 1}`}
            </option>
          ))}
        </select>
      </Labeled>
      <Labeled label="列名（表头）">
        <input
          type="text"
          value={active.headerLabel}
          onChange={e => patchColumn(safeIdx, { headerLabel: e.target.value })}
          className="w-full rounded-lg border border-slate-200 px-2 py-2 text-xs font-bold"
        />
      </Labeled>
      <Labeled label="内容">
        <div className="flex gap-1">
          <textarea
            value={active.contentTemplate}
            onChange={e => patchColumn(safeIdx, { contentTemplate: e.target.value })}
            rows={3}
            className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
          />
          <FieldPicker
            options={listFieldOptions}
            onPick={ph => patchColumn(safeIdx, { contentTemplate: active.contentTemplate + ph })}
          />
        </div>
      </Labeled>
      <Labeled label="对齐方式">
        <div className="flex gap-1">
          {(['left', 'center', 'right'] as const).map(a => (
            <button
              key={a}
              type="button"
              onClick={() => patchColumn(safeIdx, { textAlign: a })}
              className={`flex-1 rounded-lg py-1.5 text-xs font-bold ${active.textAlign === a ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}
            >
              {a === 'left' ? '左' : a === 'center' ? '中' : '右'}
            </button>
          ))}
        </div>
      </Labeled>
      <Labeled label="文字颜色">
        <input
          type="color"
          value={active.color.startsWith('#') ? active.color : '#000000'}
          onChange={e => patchColumn(safeIdx, { color: e.target.value })}
          className="h-9 w-full cursor-pointer rounded-lg border border-slate-200"
        />
      </Labeled>
      <p className="text-[10px] font-black uppercase text-slate-400">本列字体（留空则用上方全局表头/单元格字号）</p>
      <div className="grid grid-cols-2 gap-2">
        <Labeled label="表头字号 (pt)">
          <input
            type="number"
            min={1}
            max={48}
            step={0.5}
            placeholder={`默认 ${c.headerFontSizePt}`}
            value={active.headerFontSizePt != null && active.headerFontSizePt > 0 ? active.headerFontSizePt : ''}
            onChange={e => {
              const raw = e.target.value;
              if (raw === '') patchColumn(safeIdx, {}, ['headerFontSizePt']);
              else {
                const n = Number(raw);
                if (Number.isFinite(n) && n > 0) patchColumn(safeIdx, { headerFontSizePt: n });
                else patchColumn(safeIdx, {}, ['headerFontSizePt']);
              }
            }}
            className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-bold"
          />
        </Labeled>
        <Labeled label="数据行字号 (pt)">
          <input
            type="number"
            min={1}
            max={48}
            step={0.5}
            placeholder={`默认 ${c.fontSizePt}`}
            value={active.fontSizePt != null && active.fontSizePt > 0 ? active.fontSizePt : ''}
            onChange={e => {
              const raw = e.target.value;
              if (raw === '') patchColumn(safeIdx, {}, ['fontSizePt']);
              else {
                const n = Number(raw);
                if (Number.isFinite(n) && n > 0) patchColumn(safeIdx, { fontSizePt: n });
                else patchColumn(safeIdx, {}, ['fontSizePt']);
              }
            }}
            className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-bold"
          />
        </Labeled>
      </div>
      <Labeled label="表头字重（本列）">
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => patchColumn(safeIdx, {}, ['headerFontWeight'])}
            className={`flex-1 rounded-lg py-1.5 text-[10px] font-bold ${
              active.headerFontWeight == null ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'
            }`}
          >
            默认
          </button>
          <button
            type="button"
            onClick={() => patchColumn(safeIdx, { headerFontWeight: 'normal' })}
            className={`flex-1 rounded-lg py-1.5 text-[10px] font-bold ${
              active.headerFontWeight === 'normal' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'
            }`}
          >
            常规
          </button>
          <button
            type="button"
            onClick={() => patchColumn(safeIdx, { headerFontWeight: 'bold' })}
            className={`flex-1 rounded-lg py-1.5 text-[10px] font-bold ${
              active.headerFontWeight === 'bold' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'
            }`}
          >
            加粗
          </button>
        </div>
      </Labeled>
      <Labeled label="数据行字重（本列）">
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => patchColumn(safeIdx, {}, ['fontWeight'])}
            className={`flex-1 rounded-lg py-1.5 text-xs font-bold ${active.fontWeight !== 'bold' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}
          >
            常规
          </button>
          <button
            type="button"
            onClick={() => patchColumn(safeIdx, { fontWeight: 'bold' })}
            className={`flex-1 rounded-lg py-1.5 text-xs font-bold ${active.fontWeight === 'bold' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}
          >
            加粗
          </button>
        </div>
      </Labeled>
      <button
        type="button"
        disabled={columns.length <= 1}
        onClick={deleteColumn}
        className="w-full rounded-xl border border-rose-200 bg-rose-50 py-2 text-xs font-bold text-rose-600 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-40"
      >
        删除当前列
      </button>
      <p className="text-[10px] leading-relaxed text-slate-400">
        打印入口传入 <code className="rounded bg-slate-100 px-0.5">printListRows</code> 时按行渲染，并根据组件高度与「数据行高度」自动拆成多页；列内容可用{' '}
        <code className="rounded bg-slate-100 px-0.5">{'{{行.字段名}}'}</code>（如 quantity）。未传明细时仍为 1 行示例。多列表同模板时按各列表可容纳行数的最小值同步分页。
      </p>
    </div>
  );
}

function StaticTablePropertyEditor({
  el,
  c,
  fieldOptions,
  onUpdateElementConfig,
}: {
  el: PrintBodyElement;
  c: PrintTableElementConfig;
  fieldOptions: PrintFieldOption[];
  onUpdateElementConfig: (id: string, config: PrintBodyElement['config']) => void;
}) {
  const [cellIdx, setCellIdx] = useState(0);
  const total = Math.max(0, c.rows * c.cols);
  const safeIdx = total > 0 ? Math.min(cellIdx, total - 1) : 0;
  const row = total > 0 ? Math.floor(safeIdx / c.cols) : 0;
  const col = total > 0 ? safeIdx % c.cols : 0;
  const k = `${row}-${col}`;

  useEffect(() => {
    setCellIdx(i => (total <= 0 ? 0 : Math.min(i, total - 1)));
  }, [el.id, c.rows, c.cols, total]);

  const content = c.cells[k] ?? '';
  const textAlign = c.cellTextAlign?.[k] ?? 'center';
  const color = c.cellColors?.[k] ?? '#000000';
  const fontSizePt = c.cellFontSizePt?.[k];
  const fontWeight = c.cellFontWeight?.[k];

  const patchCell = (
    patch: Partial<{
      content: string;
      textAlign: 'left' | 'center' | 'right';
      color: string;
      fontSizePt: number | null;
      fontWeight: 'normal' | 'bold' | null;
    }>,
  ) => {
    let next: PrintTableElementConfig = { ...c };
    if (patch.content !== undefined) {
      next = { ...next, cells: { ...c.cells, [k]: patch.content } };
    }
    if (patch.textAlign !== undefined) {
      next = { ...next, cellTextAlign: { ...(c.cellTextAlign ?? {}), [k]: patch.textAlign } };
    }
    if (patch.color !== undefined) {
      next = { ...next, cellColors: { ...(c.cellColors ?? {}), [k]: patch.color } };
    }
    if (patch.fontSizePt !== undefined) {
      const m = { ...(c.cellFontSizePt ?? {}) };
      if (patch.fontSizePt == null || patch.fontSizePt <= 0) delete m[k];
      else m[k] = patch.fontSizePt;
      next.cellFontSizePt = Object.keys(m).length ? m : undefined;
    }
    if (patch.fontWeight !== undefined) {
      const m = { ...(c.cellFontWeight ?? {}) };
      if (patch.fontWeight == null) delete m[k];
      else m[k] = patch.fontWeight;
      next.cellFontWeight = Object.keys(m).length ? m : undefined;
    }
    onUpdateElementConfig(el.id, next);
  };

  if (total === 0) {
    return <p className="text-xs text-slate-400">请先设置行数与列数</p>;
  }

  return (
    <div className="space-y-3">
      <p className="text-[10px] font-black uppercase text-slate-400">单元格</p>
      <Labeled label="当前单元格">
        <select
          value={safeIdx}
          onChange={e => setCellIdx(Number(e.target.value))}
          className="w-full rounded-lg border border-slate-200 px-2 py-2 text-xs font-bold"
        >
          {Array.from({ length: total }, (_, i) => {
            const r = Math.floor(i / c.cols);
            const cc = i % c.cols;
            return (
              <option key={`${r}-${cc}`} value={i}>
                第 {r + 1} 行 · 第 {cc + 1} 列
              </option>
            );
          })}
        </select>
      </Labeled>
      <Labeled label="内容">
        <div className="flex gap-1">
          <textarea
            value={content}
            onChange={e => patchCell({ content: e.target.value })}
            rows={3}
            className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
          />
          <FieldPicker options={fieldOptions} onPick={ph => patchCell({ content: content + ph })} />
        </div>
      </Labeled>
      <Labeled label="对齐方式">
        <div className="flex gap-1">
          {(['left', 'center', 'right'] as const).map(a => (
            <button
              key={a}
              type="button"
              onClick={() => patchCell({ textAlign: a })}
              className={`flex-1 rounded-lg py-1.5 text-xs font-bold ${textAlign === a ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}
            >
              {a === 'left' ? '左' : a === 'center' ? '中' : '右'}
            </button>
          ))}
        </div>
      </Labeled>
      <Labeled label="文字颜色">
        <input
          type="color"
          value={color.startsWith('#') ? color : '#000000'}
          onChange={e => patchCell({ color: e.target.value })}
          className="h-9 w-full cursor-pointer rounded-lg border border-slate-200"
        />
      </Labeled>
      <Labeled label="字号 (pt)">
        <input
          type="number"
          min={1}
          max={48}
          step={0.5}
          placeholder="默认 6"
          value={fontSizePt != null && fontSizePt > 0 ? fontSizePt : ''}
          onChange={e => {
            const raw = e.target.value;
            if (raw === '') patchCell({ fontSizePt: null });
            else {
              const n = Number(raw);
              patchCell({ fontSizePt: Number.isFinite(n) && n > 0 ? n : null });
            }
          }}
          className="w-full rounded-lg border border-slate-200 px-2 py-2 text-xs font-bold"
        />
      </Labeled>
      <Labeled label="字重">
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => patchCell({ fontWeight: null })}
            className={`flex-1 rounded-lg py-1.5 text-xs font-bold ${fontWeight !== 'bold' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}
          >
            常规
          </button>
          <button
            type="button"
            onClick={() => patchCell({ fontWeight: 'bold' })}
            className={`flex-1 rounded-lg py-1.5 text-xs font-bold ${fontWeight === 'bold' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}
          >
            加粗
          </button>
        </div>
      </Labeled>
    </div>
  );
}

const PAPER_PRESETS: { label: string; w: number; h: number }[] = [
  { label: 'A4 (210×297 mm)', w: PRINT_PAPER_A4_MM.widthMm, h: PRINT_PAPER_A4_MM.heightMm },
  { label: 'A5 (148×210 mm)', w: PRINT_PAPER_A5_MM.widthMm, h: PRINT_PAPER_A5_MM.heightMm },
  { label: '30×40 mm', w: 30, h: 40 },
  { label: '40×30 mm', w: 40, h: 30 },
  { label: '50×30 mm', w: 50, h: 30 },
  { label: '60×40 mm', w: 60, h: 40 },
  { label: '80×60 mm', w: 80, h: 60 },
  { label: '60×80 mm', w: 60, h: 80 },
  { label: '80×100 mm', w: 80, h: 100 },
  { label: '100×150 mm', w: 100, h: 150 },
];

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</label>
      {children}
    </div>
  );
}

function HeaderFooterEditor({
  title,
  config,
  onChange,
  onDelete,
  fieldOptions,
}: {
  title: string;
  config: PrintHeaderFooterConfig;
  onChange: (c: PrintHeaderFooterConfig) => void;
  onDelete: () => void;
  fieldOptions: PrintFieldOption[];
}) {
  const patchItem = (slot: PrintHeaderFooterItem['slot'], patch: Partial<PrintHeaderFooterItem>) => {
    const items = [...config.items];
    const idx = items.findIndex(i => i.slot === slot);
    const base: PrintHeaderFooterItem = items[idx] ?? {
      slot,
      content: '',
      fontSizePt: 9,
      fontWeight: 'normal',
      textAlign: slot === 'left' ? 'left' : slot === 'right' ? 'right' : 'center',
      color: '#0f172a',
    };
    const next = { ...base, ...patch };
    if (idx >= 0) items[idx] = next;
    else items.push(next);
    onChange({ ...config, items });
  };

  const item = (slot: PrintHeaderFooterItem['slot']) =>
    config.items.find(i => i.slot === slot) ?? {
      slot,
      content: '',
      fontSizePt: 9,
      fontWeight: 'normal',
      textAlign: (slot === 'left' ? 'left' : slot === 'right' ? 'right' : 'center') as 'left' | 'center' | 'right',
      color: '#0f172a',
    };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-black text-slate-800">{title}</h3>
      <Labeled label="高度 (mm)">
        <input
          type="number"
          step={0.1}
          value={config.heightMm}
          onChange={e => onChange({ ...config, heightMm: Number(e.target.value) || 0 })}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold"
        />
      </Labeled>
      <div className="grid grid-cols-2 gap-2">
        <Labeled label="背景色">
          <input
            type="color"
            value={config.backgroundColor.startsWith('#') ? config.backgroundColor : '#f1f5f9'}
            onChange={e => onChange({ ...config, backgroundColor: e.target.value })}
            className="h-10 w-full cursor-pointer rounded-lg border border-slate-200"
          />
        </Labeled>
        <Labeled label="边框色">
          <input
            type="color"
            value={config.borderColor.startsWith('#') ? config.borderColor : '#cbd5e1'}
            onChange={e => onChange({ ...config, borderColor: e.target.value })}
            className="h-10 w-full cursor-pointer rounded-lg border border-slate-200"
          />
        </Labeled>
      </div>
      <Labeled label="边框粗细 (mm)">
        <input
          type="number"
          step={0.1}
          value={config.borderWidthMm}
          onChange={e => onChange({ ...config, borderWidthMm: Number(e.target.value) || 0 })}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold"
        />
      </Labeled>
      {(['left', 'center', 'right'] as const).map(slot => {
        const it = item(slot);
        return (
          <div key={slot} className="rounded-xl border border-slate-100 bg-slate-50/80 p-3 space-y-2">
            <span className="text-[10px] font-black uppercase text-slate-400">{slot === 'left' ? '左侧' : slot === 'center' ? '居中' : '右侧'}</span>
            <div className="flex gap-1">
              <textarea
                value={it.content}
                onChange={e => patchItem(slot, { content: e.target.value })}
                rows={2}
                className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-medium"
              />
              <FieldPicker options={fieldOptions} onPick={ph => patchItem(slot, { content: it.content + ph })} />
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                type="number"
                title="字号 pt"
                value={it.fontSizePt}
                onChange={e => patchItem(slot, { fontSizePt: Number(e.target.value) || 8 })}
                className="w-16 rounded border border-slate-200 px-1 py-1 text-xs"
              />
              <select
                value={it.fontWeight}
                onChange={e => patchItem(slot, { fontWeight: e.target.value as 'normal' | 'bold' })}
                className="rounded border border-slate-200 px-1 py-1 text-xs"
              >
                <option value="normal">常规</option>
                <option value="bold">加粗</option>
              </select>
            </div>
          </div>
        );
      })}
      <button
        type="button"
        onClick={onDelete}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 py-2.5 text-sm font-bold text-rose-600 hover:bg-rose-100"
      >
        <Trash2 className="h-4 w-4" /> 删除{title}
      </button>
    </div>
  );
}

function TemplatePaperSettings({
  template,
  onSetName,
  setPaperSize,
  setPaperMarginsMm,
  setPaperBackgroundColor,
  swapPaperDimensions,
}: {
  template: PrintTemplate;
  onSetName: (name: string) => void;
  setPaperSize: (w: number, h: number) => void;
  setPaperMarginsMm: (patch: Partial<{ top: number; bottom: number; left: number; right: number }>) => void;
  setPaperBackgroundColor: (c: string) => void;
  swapPaperDimensions: () => void;
}) {
  const margins = getPaperMarginsMm(template);
  const { widthMm: w, heightMm: h } = template.paperSize;
  const isLandscape = w > h;
  const presetValue = useMemo(() => {
    const hit = PAPER_PRESETS.find(p => p.w === w && p.h === h);
    return hit ? `${hit.w}x${hit.h}` : 'custom';
  }, [w, h]);
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

      <Labeled label="尺寸及方向">
        <div className="flex gap-2">
          <select
            value={presetValue}
            onChange={e => {
              const v = e.target.value;
              if (v === 'custom') {
                setPaperSize(PRINT_PAPER_A4_MM.widthMm, PRINT_PAPER_A4_MM.heightMm);
                return;
              }
              const [aw, ah] = v.split('x').map(Number);
              if (aw > 0 && ah > 0) setPaperSize(aw, ah);
            }}
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

export function PropertyPanel({
  template,
  selection,
  selectedElement,
  fieldOptions,
  onSetName,
  setPaperSize,
  setPaperMarginsMm,
  setPaperBackgroundColor,
  swapPaperDimensions,
  onUpdateElement,
  onUpdateElementConfig,
  onDeleteElement,
  onUpdateHeader,
  onUpdateFooter,
  onRemoveHeader,
  onRemoveFooter,
  bringToFront,
  sendToBack,
}: {
  template: PrintTemplate;
  selection: PrintSelection;
  selectedElement: PrintBodyElement | null;
  fieldOptions: PrintFieldOption[];
  onSetName: (name: string) => void;
  setPaperSize: (w: number, h: number) => void;
  setPaperMarginsMm: (patch: Partial<{ top: number; bottom: number; left: number; right: number }>) => void;
  setPaperBackgroundColor: (c: string) => void;
  swapPaperDimensions: () => void;
  onUpdateElement: (id: string, patch: Partial<PrintBodyElement>) => void;
  onUpdateElementConfig: (id: string, config: PrintBodyElement['config']) => void;
  onDeleteElement: (id: string) => void;
  onUpdateHeader: (c: PrintHeaderFooterConfig) => void;
  onUpdateFooter: (c: PrintHeaderFooterConfig) => void;
  onRemoveHeader: () => void;
  onRemoveFooter: () => void;
  bringToFront: (id: string) => void;
  sendToBack: (id: string) => void;
}) {
  const imageFileInputRef = useRef<HTMLInputElement>(null);

  if (selection.kind === 'paper') {
    return (
      <TemplatePaperSettings
        template={template}
        onSetName={onSetName}
        setPaperSize={setPaperSize}
        setPaperMarginsMm={setPaperMarginsMm}
        setPaperBackgroundColor={setPaperBackgroundColor}
        swapPaperDimensions={swapPaperDimensions}
      />
    );
  }

  if (selection.kind === 'header' && template.header) {
    return (
      <div className="h-full overflow-y-auto p-4">
        <HeaderFooterEditor
          title="页眉设置"
          config={template.header}
          onChange={onUpdateHeader}
          onDelete={onRemoveHeader}
          fieldOptions={fieldOptions}
        />
      </div>
    );
  }
  if (selection.kind === 'footer' && template.footer) {
    return (
      <div className="h-full overflow-y-auto p-4">
        <HeaderFooterEditor
          title="页脚设置"
          config={template.footer}
          onChange={onUpdateFooter}
          onDelete={onRemoveFooter}
          fieldOptions={fieldOptions}
        />
      </div>
    );
  }

  if (selection.kind !== 'element' || !selectedElement) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-slate-400">
        <p>点击图纸空白区域设置纸张与模板</p>
        <p className="text-xs text-slate-400/90">或选择页眉、页脚、画布上的组件以编辑属性</p>
      </div>
    );
  }

  const el = selectedElement;
  const imageLockedAspectR =
    el.type === 'image'
      ? (() => {
          const ic = el.config as import('../../types').PrintImageElementConfig;
          if (ic.keepAspectRatio === false) return null as number | null;
          if (ic.naturalAspectRatio != null && ic.naturalAspectRatio > 0) return ic.naturalAspectRatio;
          return el.width / Math.max(el.height, 0.01);
        })()
      : null;

  const common = (
    <div className="space-y-3 border-b border-slate-100 pb-4">
      <p className="text-[10px] font-black uppercase text-slate-400">通用配置</p>
      <div className="grid grid-cols-2 gap-2">
        <Labeled label={el.type === 'line' ? '线长 (mm)' : '宽 (mm)'}>
          <input
            type="number"
            step={0.1}
            value={el.width}
            onChange={e => {
              const minW = el.type === 'line' ? 2 : el.type === 'image' ? 2 : 0.5;
              const w = Math.max(minW, Number(e.target.value) || 0);
              if (el.type === 'image' && imageLockedAspectR) {
                const h = w / imageLockedAspectR;
                onUpdateElement(el.id, { width: w, height: Math.max(0.5, h) });
              } else {
                onUpdateElement(el.id, { width: w });
              }
            }}
            className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-bold"
          />
        </Labeled>
        <Labeled label={el.type === 'line' ? '线粗占位 (mm)' : '高 (mm)'}>
          <input
            type="number"
            step={0.1}
            value={el.height}
            onChange={e => {
              const h = Math.max(0.5, Number(e.target.value) || 0);
              if (el.type === 'image' && imageLockedAspectR) {
                const w = h * imageLockedAspectR;
                onUpdateElement(el.id, { width: Math.max(2, w), height: h });
              } else {
                onUpdateElement(el.id, { height: h });
              }
            }}
            className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-bold"
          />
        </Labeled>
        <Labeled label="X (mm)">
          <input
            type="number"
            step={0.1}
            value={el.x}
            onChange={e => onUpdateElement(el.id, { x: Number(e.target.value) || 0 })}
            className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-bold"
          />
        </Labeled>
        <Labeled label="Y (mm)">
          <input
            type="number"
            step={0.1}
            value={el.y}
            onChange={e => onUpdateElement(el.id, { y: Number(e.target.value) || 0 })}
            className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-bold"
          />
        </Labeled>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={() => bringToFront(el.id)} className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-slate-200 py-2 text-xs font-bold hover:bg-slate-50">
          <ChevronsUp className="h-3.5 w-3.5" /> 置顶
        </button>
        <button type="button" onClick={() => sendToBack(el.id)} className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-slate-200 py-2 text-xs font-bold hover:bg-slate-50">
          <ChevronsDown className="h-3.5 w-3.5" /> 置底
        </button>
      </div>
      <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
        <input type="checkbox" checked={!!el.locked} onChange={e => onUpdateElement(el.id, { locked: e.target.checked })} />
        锁定组件
      </label>
      <div>
        <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
          <input type="checkbox" checked={!!el.repeatPerPage} onChange={e => onUpdateElement(el.id, { repeatPerPage: e.target.checked })} />
          每页重复
        </label>
        <p className="mt-1 pl-6 text-[10px] leading-relaxed text-slate-500">存在多页时生效：勾选后该组件在每一页都绘制（如页码、续页表头）。</p>
      </div>
    </div>
  );

  let specific: React.ReactNode = null;
  if (el.type === 'text') {
    const c = el.config as import('../../types').PrintTextElementConfig;
    specific = (
      <div className="space-y-3">
        <p className="text-[10px] font-black uppercase text-slate-400">文本</p>
        <div className="flex gap-1">
          <textarea
            value={c.content}
            onChange={e => onUpdateElementConfig(el.id, { ...c, content: e.target.value })}
            rows={3}
            className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
          />
          <FieldPicker options={fieldOptions} onPick={ph => onUpdateElementConfig(el.id, { ...c, content: c.content + ph })} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Labeled label="字号 pt">
            <input
              type="number"
              value={c.fontSizePt}
              onChange={e => onUpdateElementConfig(el.id, { ...c, fontSizePt: Number(e.target.value) || 8 })}
              className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
            />
          </Labeled>
          <Labeled label="字重">
            <select
              value={c.fontWeight}
              onChange={e => onUpdateElementConfig(el.id, { ...c, fontWeight: e.target.value as 'normal' | 'bold' })}
              className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
            >
              <option value="normal">常规</option>
              <option value="bold">加粗</option>
            </select>
          </Labeled>
        </div>
        <Labeled label="对齐">
          <div className="flex gap-1">
            {(['left', 'center', 'right'] as const).map(a => (
              <button
                key={a}
                type="button"
                onClick={() => onUpdateElementConfig(el.id, { ...c, textAlign: a })}
                className={`flex-1 rounded-lg py-1.5 text-xs font-bold ${c.textAlign === a ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}
              >
                {a === 'left' ? '左' : a === 'center' ? '中' : '右'}
              </button>
            ))}
          </div>
        </Labeled>
        <Labeled label="颜色">
          <input
            type="color"
            value={c.color.startsWith('#') ? c.color : '#111827'}
            onChange={e => onUpdateElementConfig(el.id, { ...c, color: e.target.value })}
            className="h-9 w-full cursor-pointer rounded-lg border border-slate-200"
          />
        </Labeled>
        <label className="flex items-center gap-2 text-xs font-bold">
          <input type="checkbox" checked={!!c.renderAsQr} onChange={e => onUpdateElementConfig(el.id, { ...c, renderAsQr: e.target.checked })} />
          显示为二维码
        </label>
      </div>
    );
  } else if (el.type === 'qrcode') {
    const c = el.config as import('../../types').PrintQRCodeElementConfig;
    specific = (
      <div className="space-y-3">
        <p className="text-[10px] font-black uppercase text-slate-400">二维码内容</p>
        <div className="flex gap-1">
          <textarea
            value={c.content}
            onChange={e => onUpdateElementConfig(el.id, { ...c, content: e.target.value })}
            rows={3}
            className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
          />
          <FieldPicker options={fieldOptions} onPick={ph => onUpdateElementConfig(el.id, { ...c, content: c.content + ph })} />
        </div>
      </div>
    );
  } else if (el.type === 'line') {
    const c = el.config as import('../../types').PrintLineElementConfig;
    specific = (
      <div className="space-y-3">
        <Labeled label="角度 (°)">
          <input
            type="number"
            step={1}
            value={c.angleDeg ?? 0}
            onChange={e => onUpdateElementConfig(el.id, { ...c, angleDeg: Number(e.target.value) || 0 })}
            className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
          />
        </Labeled>
        <Labeled label="粗细 (mm)">
          <input
            type="number"
            step={0.05}
            value={c.thicknessMm}
            onChange={e => onUpdateElementConfig(el.id, { ...c, thicknessMm: Number(e.target.value) || 0.1 })}
            className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
          />
        </Labeled>
        <Labeled label="线型">
          <select
            value={c.lineStyle}
            onChange={e => onUpdateElementConfig(el.id, { ...c, lineStyle: e.target.value as 'solid' | 'dashed' | 'dotted' })}
            className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
          >
            <option value="solid">实线</option>
            <option value="dashed">虚线</option>
            <option value="dotted">点线</option>
          </select>
        </Labeled>
        <Labeled label="颜色">
          <input
            type="color"
            value={c.color.startsWith('#') ? c.color : '#000000'}
            onChange={e => onUpdateElementConfig(el.id, { ...c, color: e.target.value })}
            className="h-9 w-full cursor-pointer rounded-lg border border-slate-200"
          />
        </Labeled>
      </div>
    );
  } else if (el.type === 'image') {
    const c = el.config as import('../../types').PrintImageElementConfig;
    const srcType = c.sourceType ?? 'upload';
    specific = (
      <div className="space-y-3">
        <p className="text-[10px] font-black uppercase text-slate-400">图片配置</p>
        <div>
          <p className="mb-1.5 text-[10px] font-bold text-slate-500">来源类型</p>
          <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-0.5">
            {(['upload', 'url', 'field'] as const).map(t => (
              <button
                key={t}
                type="button"
                onClick={() =>
                  onUpdateElementConfig(el.id, {
                    ...c,
                    sourceType: t,
                    src: t === 'field' && !c.src ? '{{产品.imageUrl}}' : c.src,
                  })
                }
                className={`flex-1 rounded-lg py-2 text-xs font-black transition-colors ${
                  srcType === t ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {t === 'upload' ? '上传' : t === 'url' ? '地址' : '字段'}
              </button>
            ))}
          </div>
        </div>
        {srcType === 'upload' && (
          <div>
            <p className="mb-1.5 text-[10px] font-bold text-slate-500">本地上传</p>
            <input
              ref={imageFileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => {
                  const data = typeof reader.result === 'string' ? reader.result : '';
                  if (!data) return;
                  const img = new Image();
                  img.onload = () => {
                    const naturalAspectRatio = img.naturalWidth / Math.max(img.naturalHeight, 1);
                    onUpdateElementConfig(el.id, { ...c, sourceType: 'upload', src: data, naturalAspectRatio });
                  };
                  img.onerror = () => onUpdateElementConfig(el.id, { ...c, sourceType: 'upload', src: data });
                  img.src = data;
                };
                reader.readAsDataURL(file);
              }}
            />
            <button
              type="button"
              onClick={() => imageFileInputRef.current?.click()}
              className="w-full rounded-xl border border-indigo-200 bg-indigo-50 py-2.5 text-xs font-black text-indigo-700 hover:bg-indigo-100"
            >
              选择图片
            </button>
            {c.src?.startsWith('data:') ? (
              <p className="mt-1.5 text-[10px] text-slate-400">已选择图片（已嵌入模板）</p>
            ) : null}
          </div>
        )}
        {srcType === 'url' && (
          <Labeled label="图片地址">
            <input
              type="text"
              value={c.src}
              onChange={e => onUpdateElementConfig(el.id, { ...c, src: e.target.value })}
              onBlur={() => {
                const u = c.src.trim();
                if (!u || u.includes('{{') || u.includes('${')) return;
                if (!/^https?:\/\//i.test(u) && !u.startsWith('data:') && !u.startsWith('/')) return;
                const img = new Image();
                img.onload = () =>
                  onUpdateElementConfig(el.id, {
                    ...c,
                    src: u,
                    naturalAspectRatio: img.naturalWidth / Math.max(img.naturalHeight, 1),
                  });
                img.src = u;
              }}
              placeholder="https:// 或 /path"
              className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
            />
          </Labeled>
        )}
        {srcType === 'field' && (
          <div className="flex gap-1">
            <textarea
              value={c.src}
              onChange={e => onUpdateElementConfig(el.id, { ...c, src: e.target.value })}
              rows={3}
              placeholder="{{产品.imageUrl}}"
              className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
            />
            <FieldPicker options={fieldOptions} onPick={ph => onUpdateElementConfig(el.id, { ...c, src: c.src + ph })} />
          </div>
        )}
        <Labeled label="透明度 (%)">
          <input
            type="number"
            min={0}
            max={100}
            value={c.opacityPct ?? 100}
            onChange={e => onUpdateElementConfig(el.id, { ...c, opacityPct: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })}
            className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
          />
        </Labeled>
        <label className="flex cursor-pointer items-center gap-2 text-xs font-bold text-slate-700">
          <input
            type="checkbox"
            className="h-4 w-4 rounded text-indigo-600"
            checked={c.keepAspectRatio !== false}
            onChange={e => {
              const checked = e.target.checked;
              if (checked) {
                const r = c.naturalAspectRatio ?? el.width / Math.max(el.height, 0.01);
                onUpdateElementConfig(el.id, { ...c, keepAspectRatio: true });
                onUpdateElement(el.id, { height: Math.max(0.5, el.width / r) });
              } else {
                onUpdateElementConfig(el.id, { ...c, keepAspectRatio: false });
              }
            }}
          />
          保持比例
        </label>
      </div>
    );
  } else if (el.type === 'rect') {
    const c = el.config as import('../../types').PrintRectElementConfig;
    specific = (
      <div className="space-y-3">
        <Labeled label="边框 (mm)">
          <input
            type="number"
            step={0.05}
            value={c.borderWidthMm}
            onChange={e => onUpdateElementConfig(el.id, { ...c, borderWidthMm: Number(e.target.value) || 0 })}
            className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
          />
        </Labeled>
        <Labeled label="圆角 (mm)">
          <input
            type="number"
            step={0.1}
            value={c.cornerRadiusMm}
            onChange={e => onUpdateElementConfig(el.id, { ...c, cornerRadiusMm: Number(e.target.value) || 0 })}
            className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
          />
        </Labeled>
        <Labeled label="线型">
          <select
            value={c.lineStyle}
            onChange={e => onUpdateElementConfig(el.id, { ...c, lineStyle: e.target.value as 'solid' | 'dashed' | 'dotted' })}
            className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
          >
            <option value="solid">实线</option>
            <option value="dashed">虚线</option>
            <option value="dotted">点线</option>
          </select>
        </Labeled>
        <div className="grid grid-cols-2 gap-2">
          <Labeled label="边框色">
            <input
              type="color"
              value={c.borderColor.startsWith('#') ? c.borderColor : '#000'}
              onChange={e => onUpdateElementConfig(el.id, { ...c, borderColor: e.target.value })}
              className="h-9 w-full cursor-pointer rounded-lg border border-slate-200"
            />
          </Labeled>
          <Labeled label="填充色">
            <input
              type="color"
              value={c.fillColor === 'transparent' ? '#ffffff' : c.fillColor.startsWith('#') ? c.fillColor : '#ffffff'}
              onChange={e => onUpdateElementConfig(el.id, { ...c, fillColor: e.target.value })}
              className="h-9 w-full cursor-pointer rounded-lg border border-slate-200"
            />
          </Labeled>
        </div>
        <button
          type="button"
          className="text-xs font-bold text-slate-500 underline"
          onClick={() => onUpdateElementConfig(el.id, { ...c, fillColor: 'transparent' })}
        >
          填充设为透明
        </button>
      </div>
    );
  } else if (el.type === 'dynamicTable') {
    const c = el.config as import('../../types').PrintTableElementConfig;
    specific = (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <Labeled label="行数">
            <input
              type="number"
              min={1}
              max={20}
              value={c.rows}
              onChange={e => {
                const rows = Math.min(20, Math.max(1, Number(e.target.value) || 1));
                const cells = { ...c.cells };
                for (let r = 0; r < rows; r++) {
                  for (let col = 0; col < c.cols; col++) {
                    const k = `${r}-${col}`;
                    if (!(k in cells)) cells[k] = '';
                  }
                }
                onUpdateElementConfig(el.id, { ...c, rows, cells });
              }}
              className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
            />
          </Labeled>
          <Labeled label="列数">
            <input
              type="number"
              min={1}
              max={12}
              value={c.cols}
              onChange={e => {
                const cols = Math.min(12, Math.max(1, Number(e.target.value) || 1));
                const cells = { ...c.cells };
                for (let r = 0; r < c.rows; r++) {
                  for (let col = 0; col < cols; col++) {
                    const k = `${r}-${col}`;
                    if (!(k in cells)) cells[k] = '';
                  }
                }
                onUpdateElementConfig(el.id, { ...c, cols, cells });
              }}
              className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
            />
          </Labeled>
        </div>
        <Labeled label="边框样式">
          <select
            value={c.borderStyle}
            onChange={e => onUpdateElementConfig(el.id, { ...c, borderStyle: e.target.value as 'solid' | 'dashed' | 'none' })}
            className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
          >
            <option value="solid">实线</option>
            <option value="dashed">虚线</option>
            <option value="none">无</option>
          </select>
        </Labeled>
        <Labeled label="边框色">
          <input
            type="color"
            value={c.borderColor.startsWith('#') ? c.borderColor : '#333'}
            onChange={e => onUpdateElementConfig(el.id, { ...c, borderColor: e.target.value })}
            className="h-9 w-full cursor-pointer rounded-lg border border-slate-200"
          />
        </Labeled>
        <StaticTablePropertyEditor el={el} c={c} fieldOptions={fieldOptions} onUpdateElementConfig={onUpdateElementConfig} />
      </div>
    );
  } else if (el.type === 'dynamicList') {
    const c = el.config as PrintDynamicListElementConfig;
    specific = (
      <DynamicListPropertyEditor el={el} c={c} fieldOptions={fieldOptions} onUpdateElementConfig={onUpdateElementConfig} />
    );
  }

  return (
    <div className="h-full space-y-4 overflow-y-auto p-4">
      <h3 className="text-sm font-black text-slate-800">
        {el.type === 'text'
          ? '文本'
          : el.type === 'qrcode'
            ? '二维码'
            : el.type === 'line'
              ? '线条'
              : el.type === 'rect'
                ? '矩形'
                : el.type === 'image'
                  ? '图片'
                  : el.type === 'dynamicList'
                  ? '动态列表'
                  : '表格'}
      </h3>
      {specific}
      {common}
      <button
        type="button"
        onClick={() => onDeleteElement(el.id)}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 py-2.5 text-sm font-bold text-rose-600 hover:bg-rose-100"
      >
        <Trash2 className="h-4 w-4" /> 删除组件
      </button>
    </div>
  );
}
