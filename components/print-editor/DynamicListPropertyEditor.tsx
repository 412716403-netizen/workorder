import React, { useEffect, useMemo, useState } from 'react';
import type {
  PrintBodyElement,
  PrintDynamicListColumn,
  PrintDynamicListDataSource,
  PrintDynamicListElementConfig,
} from '../../types';
import type { PrintFieldOption } from './printFieldOptions';
import { FieldPicker } from './FieldPicker';
import { Labeled } from './Labeled';
import { newElementId } from '../../utils/printTemplateDefaults';

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

function DynamicListPropertyEditorInner({
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

export const DynamicListPropertyEditor = React.memo(DynamicListPropertyEditorInner);
