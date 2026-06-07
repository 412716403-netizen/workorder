import React, { useEffect, useMemo, useRef, useState } from 'react';
import type {
  PrintBodyElement,
  PrintDynamicListColumn,
  PrintDynamicListElementConfig,
  PrintTemplateDocumentType,
} from '../../types';
import { printListDataSourceFromTemplate, type PrintFieldOption } from './printFieldOptions';
import { FieldPicker } from './FieldPicker';
import { FontSizePtInput } from './FontSizePtInput';
import { NumericDraftInput } from '../NumericDraftInput';
import { Labeled } from './Labeled';
import { newElementId } from '../../utils/printTemplateDefaults';

function fieldOptionsForListSource(
  options: PrintFieldOption[],
  src: ReturnType<typeof printListDataSourceFromTemplate>,
): PrintFieldOption[] {
  /**
   * 分组显示顺序键。仅影响同一允许列表内的字段顺序；
   * 不在 FIELD_GROUPS_BY_DOCUMENT 允许集里的分组名会被上游 filter 提前过滤掉，
   * 所以此处残留的「工单/工序/单品码行/批次码」等条目实际不出现，仅作备忘。
   * 真正需要保持同步的是：此处不得出现「字段池中不存在」的 group 名（否则是纯死代码）。
   */
  const order =
    src === 'salesBill'
      ? ['销售单', '销售单明细', '系统', '计划', '产品']
      : src === 'productionMaterial'
        ? [
            '领料发出明细行',
            '生产退料明细行',
            '外协领料发出明细行',
            '外协生产退料明细行',
            '领料发出',
            '生产退料',
            '外协领料发出',
            '外协生产退料',
            '工单',
            '产品',
            '计划',
            '系统',
          ]
      : src === 'outsource'
        ? [
            '外协发出明细行',
            '外协收回明细行',
            '外协发出',
            '外协收回',
            '工单',
            '产品',
            '计划',
            '系统',
          ]
      : src === 'rework'
        ? [
            '处理不良明细行',
            '返工报工明细行',
            '处理不良',
            '返工报工',
            '工单',
            '产品',
            '计划',
            '工序',
            '系统',
          ]
      : src === 'purchaseOrder'
        ? ['采购订单明细', '采购订单', '产品', '系统']
        : src === 'salesOrder'
          ? ['销售订单明细', '销售订单', '产品', '系统']
        : src === 'purchaseBill'
          ? ['采购入库明细', '采购入库', '采购单明细', '采购单', '产品', '系统']
      : src === 'order'
        ? ['工单', '明细行', '系统', '工序', '产品', '计划']
        : src === 'plan'
          ? ['计划', '明细行', '系统', '产品', '工序', '工单']
          : ['产品', '明细行', '系统', '工序', '计划', '工单'];
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
  templateDocumentType,
  onUpdateElementConfig,
}: {
  el: PrintBodyElement;
  c: PrintDynamicListElementConfig;
  fieldOptions: PrintFieldOption[];
  /** 与模版「数据源（单据类型）」一致，用于动态列表插入字段的分组排序 */
  templateDocumentType?: PrintTemplateDocumentType;
  onUpdateElementConfig: (id: string, config: PrintBodyElement['config']) => void;
}) {
  const [colIdx, setColIdx] = useState(0);
  /** 写入配置时始终基于最新模板，避免闭包里的 c 滞后导致覆盖 textAlign 等字段 */
  const cRef = useRef(c);
  cRef.current = c;

  useEffect(() => setColIdx(0), [el.id]);

  const listSrc = useMemo(() => printListDataSourceFromTemplate(templateDocumentType), [templateDocumentType]);

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
    const cfg0 = cRef.current;
    onUpdateElementConfig(el.id, {
      ...cfg0,
      dataColumnCount: n,
      showHeader: cfg0.showHeader ?? true,
      showSerial: cfg0.showSerial ?? true,
      serialHeaderLabel: cfg0.serialHeaderLabel ?? '序号',
      borderStyle: cfg0.borderStyle ?? 'solid',
      borderColor: cfg0.borderColor ?? '#000000',
      headerBackgroundColor: cfg0.headerBackgroundColor ?? '#f1f5f9',
      headerFontSizePt: cfg0.headerFontSizePt ?? 8,
      fontSizePt: cfg0.fontSizePt ?? 8,
      columns,
    });
    // 仅缺列数据时补齐（如历史脏数据），避免依赖整份 c 导致重复写入
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [el.id]);

  const listFieldOptions = useMemo(() => fieldOptionsForListSource(fieldOptions, listSrc), [fieldOptions, listSrc]);

  const columns = c.columns ?? [];
  const safeIdx = columns.length ? Math.min(colIdx, columns.length - 1) : 0;
  const active = columns[safeIdx];
  const activeIsMatrixColumn =
    active.cellKind === 'colorSizeMatrix' || active.cellKind === 'colorMaterialMatrix';

  const syncColumnCount = (n: number) => {
    const cfg = cRef.current;
    const cols = cfg.columns ?? [];
    const next = Math.min(12, Math.max(1, n));
    let nextCols = [...cols];
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
    let w = [...(cfg.dataColumnWidthsMm ?? [])];
    while (w.length < next) w.push(0);
    if (w.length > next) w = w.slice(0, next);
    onUpdateElementConfig(el.id, { ...cfg, dataColumnCount: next, columns: nextCols, dataColumnWidthsMm: w });
    setColIdx(i => Math.min(i, nextCols.length - 1));
  };

  const patchColumn = (
    idx: number,
    patch: Partial<PrintDynamicListColumn>,
    clearKeys?: (keyof PrintDynamicListColumn)[],
  ) => {
    const cfg = cRef.current;
    const cols = cfg.columns ?? [];
    onUpdateElementConfig(el.id, {
      ...cfg,
      columns: cols.map((col, i) => {
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
    const cfg = cRef.current;
    const cols = cfg.columns ?? [];
    if (cols.length <= 1) return;
    const nextCols = cols.filter((_, i) => i !== safeIdx);
    let w = [...(cfg.dataColumnWidthsMm ?? [])];
    while (w.length < cols.length) w.push(0);
    w = w.filter((_, i) => i !== safeIdx);
    onUpdateElementConfig(el.id, { ...cfg, dataColumnCount: nextCols.length, columns: nextCols, dataColumnWidthsMm: w });
    setColIdx(0);
  };

  const patchDataColumnWidth = (idx: number, raw: string) => {
    const cfg = cRef.current;
    const cols = cfg.columns ?? [];
    const arr = [...(cfg.dataColumnWidthsMm ?? [])];
    while (arr.length < cols.length) arr.push(0);
    const v = Number(raw);
    arr[idx] = raw === '' || Number.isNaN(v) || v <= 0 ? 0 : v;
    onUpdateElementConfig(el.id, { ...cfg, dataColumnWidthsMm: arr });
  };

  if (!active) {
    return <p className="text-xs text-slate-400">正在初始化列…</p>;
  }

  return (
    <div className="space-y-3">
      <p className="text-[10px] font-black uppercase text-slate-400">组件配置</p>
      <Labeled label="表格列数（不含序号列）">
        <NumericDraftInput
          id={`${el.id}-col-count`}
          value={c.dataColumnCount}
          min={1}
          max={12}
          emptyFallback={1}
          onCommit={syncColumnCount}
          className="w-full rounded-lg border border-slate-200 px-2 py-2 text-xs font-bold"
        />
      </Labeled>
      <p className="text-[10px] font-black uppercase text-slate-400">展示配置</p>
      <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
        <input
          type="checkbox"
          checked={!!c.showHeader}
          onChange={e => onUpdateElementConfig(el.id, { ...cRef.current, showHeader: e.target.checked })}
        />
        展示表头
      </label>
      <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
        <input
          type="checkbox"
          checked={!!c.showSerial}
          onChange={e => onUpdateElementConfig(el.id, { ...cRef.current, showSerial: e.target.checked })}
        />
        展示序号
      </label>
      {c.showSerial ? (
        <Labeled label="序号列表头">
          <input
            type="text"
            value={c.serialHeaderLabel}
            onChange={e => onUpdateElementConfig(el.id, { ...cRef.current, serialHeaderLabel: e.target.value })}
            className="w-full rounded-lg border border-slate-200 px-2 py-2 text-xs font-bold"
          />
        </Labeled>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <Labeled label="边框样式">
          <select
            value={c.borderStyle}
            onChange={e =>
              onUpdateElementConfig(el.id, { ...cRef.current, borderStyle: e.target.value as PrintDynamicListElementConfig['borderStyle'] })
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
            onChange={e => onUpdateElementConfig(el.id, { ...cRef.current, borderColor: e.target.value })}
            className="h-9 w-full cursor-pointer rounded-lg border border-slate-200"
          />
        </Labeled>
      </div>
      <Labeled label="表头背景色">
        <input
          type="color"
          value={c.headerBackgroundColor.startsWith('#') ? c.headerBackgroundColor : '#f1f5f9'}
          onChange={e => onUpdateElementConfig(el.id, { ...cRef.current, headerBackgroundColor: e.target.value })}
          className="h-9 w-full cursor-pointer rounded-lg border border-slate-200"
        />
      </Labeled>
      <div className="grid grid-cols-2 gap-2">
        <Labeled label="表头字号 pt">
          <FontSizePtInput
            id={`${el.id}-list-hdr`}
            value={c.headerFontSizePt ?? 8}
            min={6}
            max={24}
            className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
            onCommit={n => onUpdateElementConfig(el.id, { ...cRef.current, headerFontSizePt: n })}
          />
        </Labeled>
        <Labeled label="单元格字号 pt">
          <FontSizePtInput
            id={`${el.id}-list-cell`}
            value={c.fontSizePt ?? 8}
            min={6}
            max={24}
            className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
            onCommit={n => onUpdateElementConfig(el.id, { ...cRef.current, fontSizePt: n })}
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
              ...cRef.current,
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
              ...cRef.current,
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
                ...cRef.current,
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
      <p className="text-[10px] leading-relaxed text-slate-400">
        每表仅允许一列为矩阵列（颜色尺码数量或颜色物料数量）：下方「列类型」中选矩阵时会自动取消其它列的矩阵类型。数据分别来自{' '}
        <code className="rounded bg-slate-100 px-0.5">colorSizeMatrixJson</code>（尺码矩阵）与计划单{' '}
        <code className="rounded bg-slate-100 px-0.5">colorMaterialMatrixJson</code>（按工序节点的物料矩阵）。
      </p>
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
      <Labeled label="列类型">
        <select
          value={
            active.cellKind === 'colorMaterialMatrix'
              ? 'colorMaterialMatrix'
              : active.cellKind === 'colorSizeMatrix'
                ? 'colorSizeMatrix'
                : 'text'
          }
          onChange={e => {
            const v = e.target.value;
            const clearOtherMatrix = (col: PrintDynamicListColumn, i: number) =>
              i === safeIdx
                ? col
                : col.cellKind === 'colorSizeMatrix' || col.cellKind === 'colorMaterialMatrix'
                  ? { ...col, cellKind: undefined }
                  : col;

            if (v === 'colorSizeMatrix') {
              const next = columns.map((col, i) =>
                i === safeIdx
                  ? {
                      ...clearOtherMatrix(col, i),
                      cellKind: 'colorSizeMatrix' as const,
                      matrixColorHeader: col.matrixColorHeader ?? '颜色',
                      matrixSizeGroupTitle: '尺码数量',
                      textAlign: 'center' as const,
                    }
                  : clearOtherMatrix(col, i),
              );
              onUpdateElementConfig(el.id, { ...cRef.current, columns: next });
            } else if (v === 'colorMaterialMatrix') {
              const next = columns.map((col, i) =>
                i === safeIdx
                  ? {
                      ...clearOtherMatrix(col, i),
                      cellKind: 'colorMaterialMatrix' as const,
                      matrixColorHeader: col.matrixColorHeader ?? '颜色',
                      matrixSizeGroupTitle: '工序物料',
                      textAlign: 'center' as const,
                    }
                  : clearOtherMatrix(col, i),
              );
              onUpdateElementConfig(el.id, { ...cRef.current, columns: next });
            } else {
              patchColumn(safeIdx, { cellKind: undefined }, ['matrixColorHeader', 'matrixSizeGroupTitle']);
            }
          }}
          className="w-full rounded-lg border border-slate-200 px-2 py-2 text-xs font-bold"
        >
          <option value="text">普通列</option>
          <option value="colorSizeMatrix">颜色尺码数量</option>
          {listSrc === 'plan' ? <option value="colorMaterialMatrix">颜色物料数量</option> : null}
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
      {activeIsMatrixColumn ? (
        <div className="space-y-2 rounded-xl border border-slate-100 bg-slate-50/80 p-2">
          <Labeled label="矩阵表头：颜色">
            <input
              type="text"
              value={active.matrixColorHeader ?? '颜色'}
              onChange={e => patchColumn(safeIdx, { matrixColorHeader: e.target.value })}
              className="w-full rounded-lg border border-slate-200 px-2 py-2 text-xs font-bold"
            />
          </Labeled>
          <Labeled
            label={
              active.cellKind === 'colorMaterialMatrix'
                ? '矩阵表头：工序物料（跨多物料列）'
                : '矩阵表头：尺码数量（跨多尺码列）'
            }
          >
            <input
              type="text"
              value={
                active.matrixSizeGroupTitle ??
                (active.cellKind === 'colorMaterialMatrix' ? '工序物料' : '尺码数量')
              }
              onChange={e => patchColumn(safeIdx, { matrixSizeGroupTitle: e.target.value })}
              className="w-full rounded-lg border border-slate-200 px-2 py-2 text-xs font-bold"
            />
          </Labeled>
        </div>
      ) : null}
      <Labeled label="内容">
        <div className="flex gap-1">
          <textarea
            value={active.contentTemplate}
            onChange={e => patchColumn(safeIdx, { contentTemplate: e.target.value })}
            rows={3}
            disabled={activeIsMatrixColumn}
            className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs disabled:cursor-not-allowed disabled:bg-slate-100"
          />
          {activeIsMatrixColumn ? null : (
            <FieldPicker
              options={listFieldOptions}
              onPick={ph => patchColumn(safeIdx, { contentTemplate: active.contentTemplate + ph })}
            />
          )}
        </div>
      </Labeled>
      {activeIsMatrixColumn ? (
        <p className="text-[10px] leading-relaxed text-slate-400">矩阵列内容由行数据 JSON 渲染，无需填写「内容」。</p>
      ) : null}
      <Labeled label="对齐方式">
        <div className="flex gap-1">
          {(['left', 'center', 'right'] as const).map(a => (
            <button
              key={a}
              type="button"
              onClick={() => patchColumn(safeIdx, { textAlign: a })}
              className={`flex-1 rounded-lg py-1.5 text-xs font-bold ${(active.textAlign ?? 'left') === a ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}
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
