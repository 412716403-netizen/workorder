import React, { useState, useMemo, useRef, useCallback } from 'react';
import {
  X, Download, Upload, FileSpreadsheet, ImagePlus, Check, AlertTriangle,
  XCircle, ChevronRight, ChevronLeft, Loader2, Info
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { ProductCategory, AppDictionaries, Product, DictionaryItem } from '../types';
import * as api from '../services/api';
import { toast } from 'sonner';

interface ProductImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: ProductCategory[];
  dictionaries: AppDictionaries;
  products: Product[];
  onRefreshDictionaries: () => Promise<void>;
  onImportComplete: () => void;
}

type ImportStep = 'category' | 'upload' | 'preview';

interface ParsedRow {
  rowNum: number;
  name: string;
  sku: string;
  unit: string;
  imageFileName: string;
  salesPrice: string;
  purchasePrice: string;
  colors: string;
  sizes: string;
  customData: Record<string, string>;
  imageDataUrl?: string;
  status: 'valid' | 'warning' | 'error';
  issues: string[];
  resolvedUnitId?: string;
  resolvedColorIds?: string[];
  resolvedSizeIds?: string[];
  newColors?: string[];
  newSizes?: string[];
  newUnit?: string;
}

function buildTemplateHeaders(category: ProductCategory): string[] {
  const headers = ['产品名称*', '产品编号*', '产品单位', '图片文件名'];
  if (category.hasSalesPrice) headers.push('销售单价');
  if (category.hasPurchasePrice) headers.push('采购单价');
  if (category.hasColorSize) {
    headers.push('颜色(逗号分隔)');
    headers.push('尺码(逗号分隔)');
  }
  for (const f of category.customFields ?? []) {
    const suffix = f.required ? '*' : '';
    headers.push(f.label + suffix);
  }
  return headers;
}

function buildTemplateExample(category: ProductCategory): string[] {
  const row = ['示例产品A', 'SKU001', '件', 'sku001.jpg'];
  if (category.hasSalesPrice) row.push('99.00');
  if (category.hasPurchasePrice) row.push('50.00');
  if (category.hasColorSize) {
    row.push('红色,蓝色');
    row.push('S,M,L');
  }
  for (const f of category.customFields ?? []) {
    if (f.type === 'number') row.push('0');
    else if (f.type === 'boolean') row.push('是');
    else if (f.type === 'select' && f.options?.length) row.push(f.options[0]);
    else row.push('');
  }
  return row;
}

/**
 * 多工作表时不再固定读第一个 sheet，避免「物料 / 半成品」列结构相同却导错分类。
 * 优先级：与所选分类同名 → 与文件名（去扩展名）同名 → 文件名按下划线分段从后往前匹配工作表名 → 第一个工作表。
 */
function pickWorksheetName(sheetNames: string[], categoryName: string, fileName: string): string {
  const cat = categoryName.trim();
  if (sheetNames.length === 0) return '';
  const norm = (s: string) => s.trim();

  const byCat = sheetNames.find(s => norm(s) === cat);
  if (byCat) return byCat;

  const stem = fileName.replace(/\.(xlsx|xls)$/i, '').trim();
  if (stem) {
    const byStem = sheetNames.find(s => norm(s) === stem);
    if (byStem) return byStem;
    const segments = stem.split(/[_\-]/).map(s => s.trim()).filter(Boolean);
    for (let i = segments.length - 1; i >= 0; i--) {
      const seg = segments[i];
      if (seg.length < 2) continue;
      const hit = sheetNames.find(s => norm(s) === seg);
      if (hit) return hit;
    }
  }

  return sheetNames[0];
}

export default function ProductImportModal({
  isOpen, onClose, categories, dictionaries, products, onRefreshDictionaries, onImportComplete,
}: ProductImportModalProps) {
  const [step, setStep] = useState<ImportStep>('category');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [imageFiles, setImageFiles] = useState<Map<string, string>>(new Map());
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: number; failed: number } | null>(null);
  const excelInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [excelFileName, setExcelFileName] = useState('');
  const [autoCreateDict, setAutoCreateDict] = useState(true);

  const selectedCategory = useMemo(
    () => categories.find(c => c.id === selectedCategoryId),
    [categories, selectedCategoryId],
  );

  const resetState = useCallback(() => {
    setStep('category');
    setSelectedCategoryId('');
    setParsedRows([]);
    setImageFiles(new Map());
    setImporting(false);
    setImportResult(null);
    setExcelFileName('');
  }, []);

  const handleClose = () => {
    resetState();
    onClose();
  };

  // ── Template download ──
  const handleDownloadTemplate = () => {
    if (!selectedCategory) return;
    const headers = buildTemplateHeaders(selectedCategory);
    const example = buildTemplateExample(selectedCategory);
    const ws = XLSX.utils.aoa_to_sheet([headers, example]);

    const colWidths = headers.map(h => ({ wch: Math.max(h.length * 2, 14) }));
    ws['!cols'] = colWidths;

    const wb = XLSX.utils.book_new();
    const sheetTitle = selectedCategory.name.slice(0, 31) || '产品导入';
    XLSX.utils.book_append_sheet(wb, ws, sheetTitle);
    XLSX.writeFile(wb, `产品导入模板_${selectedCategory.name}.xlsx`);
    toast.success('模板已下载');
  };

  // ── Parse uploaded Excel ──
  const handleExcelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedCategory) return;
    setExcelFileName(file.name);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const pickedSheet = pickWorksheetName(wb.SheetNames, selectedCategory.name, file.name);
        const ws = wb.Sheets[pickedSheet];
        const jsonRows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 });

        if (wb.SheetNames.length > 1) {
          const hasSheetNamedLikeCategory = wb.SheetNames.some(s => s.trim() === selectedCategory.name.trim());
          if (!hasSheetNamedLikeCategory && pickedSheet === wb.SheetNames[0]) {
            toast.info(
              `工作簿含多个工作表（${wb.SheetNames.join('、')}），未找到与「${selectedCategory.name}」同名的表，已读取「${pickedSheet}」。请将目标数据放在名为「${selectedCategory.name}」的工作表中，或把该表移到第一页。`,
              { duration: 8000 },
            );
          }
        }

        if (jsonRows.length < 2) {
          toast.error('Excel 文件至少需要表头行和一行数据');
          return;
        }

        const headers = (jsonRows[0] ?? []).map(h => String(h ?? '').trim());
        const dataRows = jsonRows.slice(1).filter(row =>
          row.some(cell => cell !== undefined && cell !== null && String(cell).trim() !== ''),
        );

        if (dataRows.length === 0) {
          toast.error('未找到有效数据行');
          return;
        }

        const colIndex = (label: string): number =>
          headers.findIndex(h => h.replace(/\*$/, '').trim() === label.replace(/\*$/, '').trim());

        const iName = colIndex('产品名称');
        const iSku = colIndex('产品编号');
        const iUnit = colIndex('产品单位');
        const iImage = colIndex('图片文件名');
        const iSalesPrice = colIndex('销售单价');
        const iPurchasePrice = colIndex('采购单价');
        const iColors = colIndex('颜色(逗号分隔)');
        const iSizes = colIndex('尺码(逗号分隔)');

        const customFieldIndices: Array<{ fieldDef: typeof selectedCategory.customFields[number]; col: number }> = [];
        for (const f of selectedCategory.customFields ?? []) {
          const idx = colIndex(f.label);
          if (idx >= 0) customFieldIndices.push({ fieldDef: f, col: idx });
        }

        const existingSkus = new Set(products.map(p => p.sku.toLowerCase()));
        const existingNames = new Set(products.map(p => p.name.toLowerCase()));
        const batchSkus = new Set<string>();
        const batchNames = new Set<string>();

        const rows: ParsedRow[] = dataRows.map((row, idx) => {
          const cell = (i: number) => (i >= 0 && row[i] != null ? String(row[i]).trim() : '');
          const name = cell(iName);
          const sku = cell(iSku);
          const unit = cell(iUnit);
          const imageFileName = cell(iImage);
          const salesPrice = cell(iSalesPrice);
          const purchasePrice = cell(iPurchasePrice);
          const colors = cell(iColors);
          const sizes = cell(iSizes);

          const customData: Record<string, string> = {};
          for (const { fieldDef, col } of customFieldIndices) {
            customData[fieldDef.id] = cell(col);
          }

          const issues: string[] = [];
          let status: ParsedRow['status'] = 'valid';

          if (!name) { issues.push('产品名称不能为空'); status = 'error'; }
          if (!sku) { issues.push('产品编号不能为空'); status = 'error'; }

          if (sku && existingSkus.has(sku.toLowerCase())) { issues.push(`编号 "${sku}" 已存在`); status = 'error'; }
          if (name && existingNames.has(name.toLowerCase())) { issues.push(`名称 "${name}" 已存在`); status = 'error'; }
          if (sku && batchSkus.has(sku.toLowerCase())) { issues.push(`编号 "${sku}" 在文件中重复`); status = 'error'; }
          if (name && batchNames.has(name.toLowerCase())) { issues.push(`名称 "${name}" 在文件中重复`); status = 'error'; }

          if (sku) batchSkus.add(sku.toLowerCase());
          if (name) batchNames.add(name.toLowerCase());

          // Resolve unit
          let resolvedUnitId: string | undefined;
          let newUnit: string | undefined;
          if (unit) {
            const found = dictionaries.units.find(u => u.name === unit);
            if (found) {
              resolvedUnitId = found.id;
            } else {
              newUnit = unit;
              if (status !== 'error') status = 'warning';
              issues.push(`单位 "${unit}" 不存在，将自动创建`);
            }
          }

          // Resolve colors
          const resolvedColorIds: string[] = [];
          const newColors: string[] = [];
          if (colors && selectedCategory.hasColorSize) {
            for (const c of colors.split(/[,，]/).map(s => s.trim()).filter(Boolean)) {
              const found = dictionaries.colors.find(d => d.name === c);
              if (found) {
                resolvedColorIds.push(found.id);
              } else {
                newColors.push(c);
                if (status !== 'error') status = 'warning';
                issues.push(`颜色 "${c}" 不存在，将自动创建`);
              }
            }
          }

          // Resolve sizes
          const resolvedSizeIds: string[] = [];
          const newSizes: string[] = [];
          if (sizes && selectedCategory.hasColorSize) {
            for (const s of sizes.split(/[,，]/).map(s => s.trim()).filter(Boolean)) {
              const found = dictionaries.sizes.find(d => d.name === s);
              if (found) {
                resolvedSizeIds.push(found.id);
              } else {
                newSizes.push(s);
                if (status !== 'error') status = 'warning';
                issues.push(`尺码 "${s}" 不存在，将自动创建`);
              }
            }
          }

          // Validate required custom fields
          for (const { fieldDef } of customFieldIndices) {
            if (fieldDef.required && !customData[fieldDef.id]) {
              issues.push(`"${fieldDef.label}" 为必填`);
              status = 'error';
            }
          }

          const imageDataUrl = imageFileName ? imageFiles.get(imageFileName) : undefined;
          if (imageFileName && !imageDataUrl) {
            if (status !== 'error') status = 'warning';
            issues.push(`图片 "${imageFileName}" 未上传`);
          }

          return {
            rowNum: idx + 1, name, sku, unit, imageFileName, salesPrice, purchasePrice,
            colors, sizes, customData, imageDataUrl, status, issues,
            resolvedUnitId, resolvedColorIds, resolvedSizeIds, newColors, newSizes, newUnit,
          };
        });

        setParsedRows(rows);
        const sheetHint =
          wb.SheetNames.length > 1 ? `（工作表：${pickedSheet}）` : '';
        toast.success(`已解析 ${rows.length} 条数据${sheetHint}，请确认后点击下一步`);
      } catch (err: any) {
        toast.error('Excel 解析失败: ' + (err?.message ?? '未知错误'));
      }
    };
    reader.readAsArrayBuffer(file);
    if (excelInputRef.current) excelInputRef.current.value = '';
  };

  // ── Image files upload ──
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newMap = new Map(imageFiles);
    let count = 0;
    const fileArr: File[] = [];
    for (let i = 0; i < files.length; i++) fileArr.push(files[i]);
    fileArr.forEach(file => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
        newMap.set(file.name, evt.target?.result as string);
        count++;
        if (count === fileArr.length) {
          setImageFiles(new Map(newMap));
          toast.success(`已加载 ${newMap.size} 张图片`);
          if (parsedRows.length > 0) {
            setParsedRows(prev => prev.map(row => {
              if (row.imageFileName && !row.imageDataUrl) {
                const dataUrl = newMap.get(row.imageFileName);
                if (dataUrl) {
                  const newIssues = row.issues.filter(i => !i.includes('未上传'));
                  const newStatus: ParsedRow['status'] = newIssues.length === 0 ? 'valid' :
                    newIssues.some(i => !i.includes('将自动创建')) ? 'error' : 'warning';
                  return { ...row, imageDataUrl: dataUrl, issues: newIssues, status: newStatus };
                }
              }
              return row;
            }));
          }
        }
      };
      reader.readAsDataURL(file);
    });
    if (imageInputRef.current) imageInputRef.current.value = '';
  };

  // ── Submit import ──
  const handleImport = async () => {
    if (!selectedCategory) return;
    const validRows = parsedRows.filter(r => r.status !== 'error');
    if (validRows.length === 0) {
      toast.error('没有可导入的有效数据');
      return;
    }

    setImporting(true);
    try {
      // Collect new dictionary items
      const newDictionaryItems: Array<{ type: string; name: string; value: string }> = [];
      const addedDict = new Set<string>();

      if (autoCreateDict) {
        for (const row of validRows) {
          if (row.newUnit && !addedDict.has(`unit:${row.newUnit}`)) {
            newDictionaryItems.push({ type: 'unit', name: row.newUnit, value: row.newUnit });
            addedDict.add(`unit:${row.newUnit}`);
          }
          for (const c of row.newColors ?? []) {
            if (!addedDict.has(`color:${c}`)) {
              newDictionaryItems.push({ type: 'color', name: c, value: c });
              addedDict.add(`color:${c}`);
            }
          }
          for (const s of row.newSizes ?? []) {
            if (!addedDict.has(`size:${s}`)) {
              newDictionaryItems.push({ type: 'size', name: s, value: s });
              addedDict.add(`size:${s}`);
            }
          }
        }
      }

      // Build product payloads
      // After dict creation, the backend will have new ids. We pass name-based references
      // and let the backend resolve them. But our current API expects resolved ids.
      // So we send newDictionaryItems to backend and it creates them first, then we use
      // placeholder names. The backend import API handles this.

      // Actually, for colors/sizes, we need to send ids. The backend creates dict items
      // and returns a map. Let's have the front-end send the products with the names that
      // need resolution. We'll modify our approach: send resolved ids for known items,
      // and for new items, we pass them in newDictionaryItems and use a name-based key.
      // The backend will create them first and then map.

      // Simpler approach: pass color/size NAMES to backend, let it resolve everything.
      // But we already built the API to accept ids. Let's keep it simple:
      // 1. Frontend sends newDictionaryItems
      // 2. Backend creates them and returns a map
      // 3. Frontend then sends products with resolved ids

      // Actually, let's just do it in one shot on the backend.
      // We need to adjust: send color names and size names in the product payload,
      // and let the backend resolve them.

      // For simplicity with the current API design, let's resolve on frontend after
      // creating dict items via existing API, then send products with proper ids.

      // Step 1: Create new dict items via existing API and collect their ids
      const newDictIdMap = new Map<string, string>(); // "type:name" -> id

      for (const item of newDictionaryItems) {
        try {
          const created = await api.dictionaries.create(item) as DictionaryItem & { id: string };
          newDictIdMap.set(`${item.type}:${item.name}`, created.id);
        } catch {
          // May already exist from a prior attempt
        }
      }

      // Refresh dictionaries to get new ids
      if (newDictionaryItems.length > 0) {
        await onRefreshDictionaries();
      }

      // Step 2: Build final product payloads with resolved ids
      const productPayloads = validRows.map(row => {
        const colorIds = [
          ...(row.resolvedColorIds ?? []),
          ...(row.newColors ?? []).map(c => newDictIdMap.get(`color:${c}`)).filter(Boolean) as string[],
        ];
        const sizeIds = [
          ...(row.resolvedSizeIds ?? []),
          ...(row.newSizes ?? []).map(s => newDictIdMap.get(`size:${s}`)).filter(Boolean) as string[],
        ];
        let unitId = row.resolvedUnitId;
        if (!unitId && row.newUnit) {
          unitId = newDictIdMap.get(`unit:${row.newUnit}`);
        }

        const categoryCustomData: Record<string, any> = {};
        for (const [fieldId, rawVal] of Object.entries(row.customData)) {
          const val = String(rawVal);
          const fieldDef = (selectedCategory.customFields ?? []).find(f => f.id === fieldId);
          if (!fieldDef || !val) continue;
          if (fieldDef.type === 'number') categoryCustomData[fieldId] = parseFloat(val) || 0;
          else if (fieldDef.type === 'boolean') categoryCustomData[fieldId] = val === '是' || val === 'true' || val === '1';
          else categoryCustomData[fieldId] = val;
        }

        return {
          name: row.name,
          sku: row.sku,
          unitId: unitId || undefined,
          salesPrice: row.salesPrice ? parseFloat(row.salesPrice) || undefined : undefined,
          purchasePrice: row.purchasePrice ? parseFloat(row.purchasePrice) || undefined : undefined,
          imageUrl: row.imageDataUrl || undefined,
          colorIds,
          sizeIds,
          categoryCustomData,
        };
      });

      const result = await api.products.import({
        categoryId: selectedCategory.id,
        products: productPayloads,
      }) as { success: number; failed: number };

      setImportResult(result);
      toast.success(`成功导入 ${result.success} 个产品${result.failed > 0 ? `，${result.failed} 个失败` : ''}`);

      if (result.success > 0) {
        onImportComplete();
      }
    } catch (err: any) {
      toast.error('导入失败: ' + (err?.message ?? '未知错误'));
    } finally {
      setImporting(false);
    }
  };

  // ── Stats ──
  const stats = useMemo(() => {
    const valid = parsedRows.filter(r => r.status === 'valid').length;
    const warning = parsedRows.filter(r => r.status === 'warning').length;
    const error = parsedRows.filter(r => r.status === 'error').length;
    return { valid, warning, error, total: parsedRows.length, importable: valid + warning };
  }, [parsedRows]);

  const newDictSummary = useMemo(() => {
    const colors = new Set<string>();
    const sizes = new Set<string>();
    const units = new Set<string>();
    for (const row of parsedRows) {
      for (const c of row.newColors ?? []) colors.add(c);
      for (const s of row.newSizes ?? []) sizes.add(s);
      if (row.newUnit) units.add(row.newUnit);
    }
    return { colors: Array.from(colors), sizes: Array.from(sizes), units: Array.from(units) };
  }, [parsedRows]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" onClick={handleClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
              <FileSpreadsheet className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">批量导入产品</h2>
              <p className="text-xs text-slate-400">通过 Excel 模板快速导入产品数据和图片</p>
            </div>
          </div>
          <button onClick={handleClose} className="p-2 rounded-xl hover:bg-slate-100 transition-all">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Steps indicator */}
        <div className="px-8 py-4 bg-slate-50/50 border-b border-slate-100">
          <div className="flex items-center gap-2 text-xs font-bold">
            {[
              { key: 'category', label: '1. 选择分类' },
              { key: 'upload', label: '2. 上传文件' },
              { key: 'preview', label: '3. 预览确认' },
            ].map((s, i) => (
              <React.Fragment key={s.key}>
                {i > 0 && <ChevronRight className="w-3.5 h-3.5 text-slate-300" />}
                <span className={`px-3 py-1.5 rounded-lg transition-all ${
                  step === s.key
                    ? 'bg-indigo-100 text-indigo-700'
                    : (
                        (['category', 'upload', 'preview'].indexOf(step) > ['category', 'upload', 'preview'].indexOf(s.key))
                          ? 'text-indigo-500'
                          : 'text-slate-400'
                      )
                }`}>
                  {s.label}
                </span>
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-8 py-6">
          {/* ── Step: Category ── */}
          {step === 'category' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-bold text-slate-700 mb-1">选择目标产品分类</h3>
                <p className="text-xs text-slate-400">不同分类对应不同的导入模板和字段</p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {categories.map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategoryId(cat.id)}
                    className={`p-4 rounded-xl border-2 text-left transition-all ${
                      selectedCategoryId === cat.id
                        ? 'border-indigo-500 bg-indigo-50 shadow-sm'
                        : 'border-slate-100 bg-white hover:border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-sm text-slate-800">{cat.name}</span>
                      {selectedCategoryId === cat.id && (
                        <Check className="w-4 h-4 text-indigo-600" />
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {cat.hasColorSize && <span className="text-[10px] bg-violet-100 text-violet-600 px-1.5 py-0.5 rounded font-medium">颜色尺码</span>}
                      {cat.hasSalesPrice && <span className="text-[10px] bg-emerald-100 text-emerald-600 px-1.5 py-0.5 rounded font-medium">销售价</span>}
                      {cat.hasPurchasePrice && <span className="text-[10px] bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded font-medium">采购价</span>}
                      {(cat.customFields?.length ?? 0) > 0 && (
                        <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded font-medium">
                          {cat.customFields.length} 个扩展字段
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
              {categories.length === 0 && (
                <div className="text-center py-12 text-slate-400 text-sm">
                  暂无产品分类，请先在系统设置中创建分类
                </div>
              )}
            </div>
          )}

          {/* ── Step: Upload ── */}
          {step === 'upload' && selectedCategory && (
            <div className="space-y-6">
              {/* Download template */}
              <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-5">
                <div className="flex items-start gap-3">
                  <Info className="w-5 h-5 text-indigo-500 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-bold text-indigo-800 mb-1">
                      先下载「{selectedCategory.name}」分类的导入模板
                    </p>
                    <p className="text-xs text-indigo-600/70 mb-3">
                      模板中包含该分类所需的所有字段列，请按模板格式填写产品数据。若一个 Excel 内有多个工作表，系统会优先读取与当前分类同名的表；否则按文件名或「产品导入模板_分类名」中的分类段匹配；均无法匹配时再读第一个工作表。
                    </p>
                    <button
                      onClick={handleDownloadTemplate}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700 active:scale-95 transition-all shadow-sm"
                    >
                      <Download className="w-3.5 h-3.5" /> 下载 Excel 模板
                    </button>
                  </div>
                </div>
              </div>

              {/* Excel upload */}
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-2">上传 Excel 文件</label>
                <div
                  className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center hover:border-indigo-300 hover:bg-indigo-50/30 transition-all cursor-pointer"
                  onClick={() => excelInputRef.current?.click()}
                >
                  <input
                    ref={excelInputRef}
                    type="file"
                    accept=".xlsx,.xls"
                    className="hidden"
                    onChange={handleExcelUpload}
                  />
                  <FileSpreadsheet className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                  {excelFileName ? (
                    <div>
                      <p className="text-sm font-bold text-indigo-600">{excelFileName}</p>
                      {parsedRows.length > 0 && (
                        <p className="text-xs text-emerald-600 mt-1 font-medium">
                          <Check className="w-3 h-3 inline mr-1" />已解析 {parsedRows.length} 条数据，可上传图片后点击下一步
                        </p>
                      )}
                    </div>
                  ) : (
                    <>
                      <p className="text-sm font-bold text-slate-600">点击或拖拽上传 Excel 文件</p>
                      <p className="text-xs text-slate-400 mt-1">支持 .xlsx / .xls 格式</p>
                    </>
                  )}
                </div>
              </div>

              {/* Image upload */}
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-2">
                  上传产品图片 <span className="text-slate-400 font-normal">(可选，文件名需与 Excel 中「图片文件名」列对应)</span>
                </label>
                <div
                  className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center hover:border-indigo-300 hover:bg-indigo-50/30 transition-all cursor-pointer"
                  onClick={() => imageInputRef.current?.click()}
                >
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handleImageUpload}
                  />
                  <ImagePlus className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                  {imageFiles.size > 0 ? (
                    <p className="text-sm font-bold text-indigo-600">已加载 {imageFiles.size} 张图片</p>
                  ) : (
                    <>
                      <p className="text-sm font-bold text-slate-600">点击或拖拽上传产品图片</p>
                      <p className="text-xs text-slate-400 mt-1">支持多选，JPG / PNG / WebP 等格式</p>
                    </>
                  )}
                </div>
                {imageFiles.size > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {Array.from(imageFiles.entries()).map(([name, url]) => (
                      <div key={name} className="relative group">
                        <img src={url} alt={name} className="w-12 h-12 object-cover rounded-lg border border-slate-200" />
                        <div className="absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const m = new Map(imageFiles);
                              m.delete(name);
                              setImageFiles(m);
                            }}
                            className="w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                        <p className="text-[9px] text-slate-400 text-center truncate w-12 mt-0.5">{name}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Step: Preview ── */}
          {step === 'preview' && (
            <div className="space-y-5">
              {importResult ? (
                /* Import result */
                <div className="text-center py-12">
                  <div className={`w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center ${
                    importResult.failed === 0 ? 'bg-emerald-100' : 'bg-amber-100'
                  }`}>
                    {importResult.failed === 0
                      ? <Check className="w-8 h-8 text-emerald-600" />
                      : <AlertTriangle className="w-8 h-8 text-amber-600" />
                    }
                  </div>
                  <h3 className="text-lg font-bold text-slate-800 mb-2">导入完成</h3>
                  <p className="text-sm text-slate-500">
                    成功导入 <span className="font-bold text-emerald-600">{importResult.success}</span> 个产品
                    {importResult.failed > 0 && (
                      <>，<span className="font-bold text-red-500">{importResult.failed}</span> 个失败</>
                    )}
                  </p>
                  <button
                    onClick={handleClose}
                    className="mt-6 px-6 py-2.5 bg-indigo-600 text-white font-bold text-sm rounded-xl hover:bg-indigo-700 active:scale-95 transition-all"
                  >
                    关闭
                  </button>
                </div>
              ) : (
                <>
                  {/* Summary */}
                  <div className="flex flex-wrap gap-3">
                    <div className="px-4 py-2 bg-slate-50 rounded-xl text-xs font-bold text-slate-600">
                      共 {stats.total} 条
                    </div>
                    <div className="px-4 py-2 bg-emerald-50 rounded-xl text-xs font-bold text-emerald-600">
                      <Check className="w-3 h-3 inline mr-1" /> 可导入 {stats.importable} 条
                    </div>
                    {stats.error > 0 && (
                      <div className="px-4 py-2 bg-red-50 rounded-xl text-xs font-bold text-red-600">
                        <XCircle className="w-3 h-3 inline mr-1" /> 错误 {stats.error} 条
                      </div>
                    )}
                    {stats.warning > 0 && (
                      <div className="px-4 py-2 bg-amber-50 rounded-xl text-xs font-bold text-amber-600">
                        <AlertTriangle className="w-3 h-3 inline mr-1" /> 警告 {stats.warning} 条
                      </div>
                    )}
                  </div>

                  {/* New dict items notice */}
                  {(newDictSummary.colors.length > 0 || newDictSummary.sizes.length > 0 || newDictSummary.units.length > 0) && (
                    <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                        <div className="text-xs space-y-1">
                          <p className="font-bold text-amber-800">以下字典项将被自动创建：</p>
                          {newDictSummary.colors.length > 0 && (
                            <p className="text-amber-700">颜色：{newDictSummary.colors.join('、')}</p>
                          )}
                          {newDictSummary.sizes.length > 0 && (
                            <p className="text-amber-700">尺码：{newDictSummary.sizes.join('、')}</p>
                          )}
                          {newDictSummary.units.length > 0 && (
                            <p className="text-amber-700">单位：{newDictSummary.units.join('、')}</p>
                          )}
                          <label className="flex items-center gap-2 mt-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={autoCreateDict}
                              onChange={e => setAutoCreateDict(e.target.checked)}
                              className="rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                            />
                            <span className="font-bold text-amber-700">自动创建不存在的颜色/尺码/单位</span>
                          </label>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Data table */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <div className="overflow-x-auto max-h-[40vh]">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50 sticky top-0 z-10">
                          <tr>
                            <th className="px-3 py-2.5 text-left font-bold text-slate-500 whitespace-nowrap">行</th>
                            <th className="px-3 py-2.5 text-left font-bold text-slate-500 whitespace-nowrap">状态</th>
                            <th className="px-3 py-2.5 text-left font-bold text-slate-500 whitespace-nowrap">图片</th>
                            <th className="px-3 py-2.5 text-left font-bold text-slate-500 whitespace-nowrap">产品名称</th>
                            <th className="px-3 py-2.5 text-left font-bold text-slate-500 whitespace-nowrap">产品编号</th>
                            <th className="px-3 py-2.5 text-left font-bold text-slate-500 whitespace-nowrap">单位</th>
                            {selectedCategory?.hasColorSize && (
                              <>
                                <th className="px-3 py-2.5 text-left font-bold text-slate-500 whitespace-nowrap">颜色</th>
                                <th className="px-3 py-2.5 text-left font-bold text-slate-500 whitespace-nowrap">尺码</th>
                              </>
                            )}
                            <th className="px-3 py-2.5 text-left font-bold text-slate-500 whitespace-nowrap">备注</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {parsedRows.map(row => (
                            <tr key={row.rowNum} className={`${
                              row.status === 'error' ? 'bg-red-50/50' :
                              row.status === 'warning' ? 'bg-amber-50/30' : ''
                            }`}>
                              <td className="px-3 py-2 text-slate-400 font-mono">{row.rowNum}</td>
                              <td className="px-3 py-2">
                                {row.status === 'valid' && <Check className="w-4 h-4 text-emerald-500" />}
                                {row.status === 'warning' && <AlertTriangle className="w-4 h-4 text-amber-500" />}
                                {row.status === 'error' && <XCircle className="w-4 h-4 text-red-500" />}
                              </td>
                              <td className="px-3 py-2">
                                {row.imageDataUrl ? (
                                  <img src={row.imageDataUrl} alt="" className="w-8 h-8 rounded object-cover" />
                                ) : row.imageFileName ? (
                                  <span className="text-slate-300 text-[10px]">未匹配</span>
                                ) : (
                                  <span className="text-slate-200">-</span>
                                )}
                              </td>
                              <td className="px-3 py-2 font-bold text-slate-800 max-w-[160px] truncate">{row.name || '-'}</td>
                              <td className="px-3 py-2 font-mono text-slate-600">{row.sku || '-'}</td>
                              <td className="px-3 py-2 text-slate-600">{row.unit || '-'}</td>
                              {selectedCategory?.hasColorSize && (
                                <>
                                  <td className="px-3 py-2 text-slate-600 max-w-[120px] truncate">{row.colors || '-'}</td>
                                  <td className="px-3 py-2 text-slate-600 max-w-[120px] truncate">{row.sizes || '-'}</td>
                                </>
                              )}
                              <td className="px-3 py-2">
                                {row.issues.length > 0 && (
                                  <span className={`text-[10px] ${row.status === 'error' ? 'text-red-500' : 'text-amber-500'}`}>
                                    {row.issues.join('；')}
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {!importResult && (
          <div className="px-8 py-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
            <div>
              {step !== 'category' && (
                <button
                  onClick={() => {
                    if (step === 'upload') setStep('category');
                    else if (step === 'preview') { setStep('upload'); setParsedRows([]); }
                  }}
                  className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 transition-all"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> 上一步
                </button>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleClose}
                className="px-5 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 transition-all"
              >
                取消
              </button>
              {step === 'category' && (
                <button
                  disabled={!selectedCategoryId}
                  onClick={() => setStep('upload')}
                  className="px-5 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition-all flex items-center gap-1.5"
                >
                  下一步 <ChevronRight className="w-3.5 h-3.5" />
                </button>
              )}
              {step === 'upload' && (
                <button
                  disabled={parsedRows.length === 0}
                  onClick={() => {
                    // Re-match images before entering preview
                    if (imageFiles.size > 0) {
                      setParsedRows(prev => prev.map(row => {
                        if (row.imageFileName) {
                          const dataUrl = imageFiles.get(row.imageFileName);
                          const newIssues = row.issues.filter(i => !i.includes('未上传'));
                          if (dataUrl) {
                            const newStatus: ParsedRow['status'] = newIssues.length === 0 ? 'valid' :
                              newIssues.some(i => !i.includes('将自动创建')) ? 'error' : 'warning';
                            return { ...row, imageDataUrl: dataUrl, issues: newIssues, status: newStatus };
                          } else if (!row.imageDataUrl) {
                            const hasUnmatched = !newIssues.some(i => i.includes('未上传'));
                            const issues = hasUnmatched ? [...newIssues, `图片 "${row.imageFileName}" 未上传`] : row.issues;
                            const status: ParsedRow['status'] = issues.some(i => !i.includes('将自动创建') && !i.includes('未上传')) ? 'error' : 'warning';
                            return { ...row, issues, status };
                          }
                        }
                        return row;
                      }));
                    }
                    setStep('preview');
                  }}
                  className="px-5 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition-all flex items-center gap-1.5"
                >
                  下一步 <ChevronRight className="w-3.5 h-3.5" />
                </button>
              )}
              {step === 'preview' && !importResult && (
                <button
                  disabled={importing || stats.importable === 0}
                  onClick={handleImport}
                  className="px-6 py-2.5 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition-all flex items-center gap-2 shadow-sm"
                >
                  {importing ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin" /> 导入中...</>
                  ) : (
                    <><Upload className="w-3.5 h-3.5" /> 确认导入 ({stats.importable} 条)</>
                  )}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
