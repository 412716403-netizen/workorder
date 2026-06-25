import React, { useState, useMemo, useRef, useCallback } from 'react';
import {
  X, Download, Upload, FileSpreadsheet, Check, AlertTriangle,
  XCircle, ChevronRight, ChevronLeft, Loader2, Info,
} from 'lucide-react';
import { Partner, PartnerCategory, ReportFieldDefinition } from '../types';
import * as api from '../services/api';
import { toast } from 'sonner';
import { effectiveCustomDocFieldType } from '../utils/reportCustomDocField';
import { partnerNameKey } from '../utils/partnerNormalize';

interface PartnerImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  partnerCategories: PartnerCategory[];
  partners: Partner[];
  onImportComplete: () => void;
}

type ImportStep = 'category' | 'upload' | 'preview';

interface ParsedRow {
  rowNum: number;
  name: string;
  customData: Record<string, string>;
  status: 'valid' | 'warning' | 'error';
  issues: string[];
}

function formFields(category: PartnerCategory): ReportFieldDefinition[] {
  return (category.customFields ?? []).filter(f => f.showInForm !== false);
}

/** 单位编号（partnerListNo）由系统自动分配，不参与导入 */
function isPartnerSystemNoLabel(label: string): boolean {
  const t = label.replace(/\*$/, '').trim();
  return t === '单位编号' || t === '编号';
}

function importableFormFields(category: PartnerCategory): ReportFieldDefinition[] {
  return formFields(category).filter(f => !isPartnerSystemNoLabel(f.label));
}

function buildCustomFieldExample(field: ReportFieldDefinition): string {
  const eff = effectiveCustomDocFieldType(field);
  const label = field.label.replace(/\*$/, '').trim();
  if (eff === 'select' && field.options?.length) return field.options[0];
  if (eff === 'date') return '2026-01-01';
  if (label.includes('电话') || label.includes('手机')) return '13800000000';
  if (label.includes('联系人')) return '张三';
  if (label.includes('地址')) return '示例地址';
  if (eff === 'text') return '请填写';
  return '';
}

function buildTemplateHeaders(category: PartnerCategory): string[] {
  const headers = ['单位名称*'];
  for (const f of importableFormFields(category)) {
    headers.push(f.label + (f.required ? '*' : ''));
  }
  return headers;
}

function buildTemplateExample(category: PartnerCategory): string[] {
  const row = ['示例单位A'];
  for (const f of importableFormFields(category)) {
    row.push(buildCustomFieldExample(f));
  }
  return row;
}

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

export default function PartnerImportModal({
  isOpen, onClose, partnerCategories, partners, onImportComplete,
}: PartnerImportModalProps) {
  const [step, setStep] = useState<ImportStep>('category');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: number; failed: number } | null>(null);
  const excelInputRef = useRef<HTMLInputElement>(null);
  const [excelFileName, setExcelFileName] = useState('');

  const selectedCategory = useMemo(
    () => partnerCategories.find(c => c.id === selectedCategoryId),
    [partnerCategories, selectedCategoryId],
  );

  const resetState = useCallback(() => {
    setStep('category');
    setSelectedCategoryId('');
    setParsedRows([]);
    setImporting(false);
    setImportResult(null);
    setExcelFileName('');
  }, []);

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleDownloadTemplate = () => {
    if (!selectedCategory) return;
    const headers = buildTemplateHeaders(selectedCategory);
    const example = buildTemplateExample(selectedCategory);
    void import('xlsx')
      .then((XLSX) => {
        const ws = XLSX.utils.aoa_to_sheet([headers, example]);
        ws['!cols'] = headers.map(h => ({ wch: Math.max(h.length * 2, 14) }));
        const wb = XLSX.utils.book_new();
        const sheetTitle = selectedCategory.name.slice(0, 31) || '合作单位导入';
        XLSX.utils.book_append_sheet(wb, ws, sheetTitle);
        XLSX.writeFile(wb, `合作单位导入模板_${selectedCategory.name}.xlsx`);
        toast.success('模板已下载');
      })
      .catch(() => toast.error('模板生成失败'));
  };

  const handleExcelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedCategory) return;
    setExcelFileName(file.name);

    const reader = new FileReader();
    reader.onload = (evt) => {
      void (async () => {
        try {
          const XLSX = await import('xlsx');
          const data = new Uint8Array(evt.target?.result as ArrayBuffer);
          const wb = XLSX.read(data, { type: 'array' });
          const pickedSheet = pickWorksheetName(wb.SheetNames, selectedCategory.name, file.name);
          const ws = wb.Sheets[pickedSheet];
          const jsonRows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 });

          if (wb.SheetNames.length > 1) {
            const hasSheetNamedLikeCategory = wb.SheetNames.some(s => s.trim() === selectedCategory.name.trim());
            if (!hasSheetNamedLikeCategory && pickedSheet === wb.SheetNames[0]) {
              toast.info(
                `工作簿含多个工作表（${wb.SheetNames.join('、')}），未找到与「${selectedCategory.name}」同名的表，已读取「${pickedSheet}」。`,
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

          const iName = colIndex('单位名称');
          const customFieldIndices: Array<{ fieldDef: ReportFieldDefinition; col: number }> = [];
          for (const f of importableFormFields(selectedCategory)) {
            const idx = colIndex(f.label);
            if (idx >= 0) customFieldIndices.push({ fieldDef: f, col: idx });
          }

          const existingNames = new Set(partners.map(p => partnerNameKey(p.name)));
          const batchNames = new Set<string>();

          const rows: ParsedRow[] = dataRows.map((row, idx) => {
            const cell = (i: number) => (i >= 0 && row[i] != null ? String(row[i]).trim() : '');
            const name = cell(iName);

            const customData: Record<string, string> = {};
            for (const { fieldDef, col } of customFieldIndices) {
              customData[fieldDef.id] = cell(col);
            }

            const issues: string[] = [];
            let status: ParsedRow['status'] = 'valid';

            if (!name) {
              issues.push('单位名称不能为空');
              status = 'error';
            }

            if (name) {
              const key = partnerNameKey(name);
              if (existingNames.has(key)) {
                issues.push(`名称 "${name}" 已存在`);
                status = 'error';
              }
              if (batchNames.has(key)) {
                issues.push(`名称 "${name}" 在文件中重复`);
                status = 'error';
              }
              batchNames.add(key);
            }

            for (const { fieldDef } of customFieldIndices) {
              const val = customData[fieldDef.id];
              const eff = effectiveCustomDocFieldType(fieldDef);
              if (fieldDef.required && !val) {
                issues.push(`"${fieldDef.label}" 为必填`);
                status = 'error';
              }
              if (val && (eff === 'file' || eff === 'knowledge')) {
                issues.push(`"${fieldDef.label}" 不支持通过 Excel 导入`);
                if (status !== 'error') status = 'warning';
              }
            }

            return { rowNum: idx + 1, name, customData, status, issues };
          });

          setParsedRows(rows);
          const sheetHint = wb.SheetNames.length > 1 ? `（工作表：${pickedSheet}）` : '';
          toast.success(`已解析 ${rows.length} 条数据${sheetHint}，请确认后点击下一步`);
        } catch (err: unknown) {
          toast.error('Excel 解析失败: ' + (err instanceof Error ? err.message : '未知错误'));
        }
      })();
    };
    reader.readAsArrayBuffer(file);
    if (excelInputRef.current) excelInputRef.current.value = '';
  };

  const handleImport = async () => {
    if (!selectedCategory) return;
    const validRows = parsedRows.filter(r => r.status !== 'error');
    if (validRows.length === 0) {
      toast.error('没有可导入的有效数据');
      return;
    }

    setImporting(true);
    try {
      const payloads = validRows.map(row => {
        const customData: Record<string, string> = {};
        for (const [fieldId, rawVal] of Object.entries(row.customData)) {
          const val = String(rawVal);
          const fieldDef = importableFormFields(selectedCategory).find(f => f.id === fieldId);
          if (!fieldDef || !val) continue;
          const eff = effectiveCustomDocFieldType(fieldDef);
          if (eff === 'file' || eff === 'knowledge') continue;
          customData[fieldId] = val;
        }
        return {
          name: row.name,
          categoryId: selectedCategory.id,
          customData,
        };
      });

      const result = await api.partners.import({
        categoryId: selectedCategory.id,
        partners: payloads,
      }) as { success: number; failed: number };

      setImportResult(result);
      toast.success(`成功导入 ${result.success} 个单位${result.failed > 0 ? `，${result.failed} 个失败` : ''}`);

      if (result.success > 0) {
        onImportComplete();
      }
    } catch (err: unknown) {
      toast.error('导入失败: ' + (err instanceof Error ? err.message : '未知错误'));
    } finally {
      setImporting(false);
    }
  };

  const stats = useMemo(() => {
    const valid = parsedRows.filter(r => r.status === 'valid').length;
    const warning = parsedRows.filter(r => r.status === 'warning').length;
    const error = parsedRows.filter(r => r.status === 'error').length;
    return { valid, warning, error, total: parsedRows.length, importable: valid + warning };
  }, [parsedRows]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" onClick={handleClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-8 py-5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
              <FileSpreadsheet className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">批量导入合作单位</h2>
              <p className="text-xs text-slate-400">通过 Excel 模板快速导入单位档案</p>
            </div>
          </div>
          <button onClick={handleClose} className="p-2 rounded-xl hover:bg-slate-100 transition-all">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

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

        <div className="flex-1 overflow-y-auto px-8 py-6">
          {step === 'category' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-bold text-slate-700 mb-1">选择目标单位分类</h3>
                <p className="text-xs text-slate-400">不同分类对应不同的导入模板和扩展字段</p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {partnerCategories.map(cat => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCategoryId(cat.id)}
                    className={`p-4 rounded-xl border-2 text-left transition-all ${
                      selectedCategoryId === cat.id
                        ? 'border-indigo-500 bg-indigo-50 shadow-sm'
                        : 'border-slate-100 bg-white hover:border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-sm text-slate-800">{cat.name}</span>
                      {selectedCategoryId === cat.id && <Check className="w-4 h-4 text-indigo-600" />}
                    </div>
                    {(cat.customFields?.length ?? 0) > 0 && (
                      <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded font-medium">
                        {cat.customFields.length} 个扩展字段
                      </span>
                    )}
                  </button>
                ))}
              </div>
              {partnerCategories.length === 0 && (
                <div className="text-center py-12 text-slate-400 text-sm">
                  暂无合作单位分类，请先在系统设置中创建分类
                </div>
              )}
            </div>
          )}

          {step === 'upload' && selectedCategory && (
            <div className="space-y-6">
              <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-5">
                <div className="flex items-start gap-3">
                  <Info className="w-5 h-5 text-indigo-500 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-bold text-indigo-800 mb-1">
                      先下载「{selectedCategory.name}」分类的导入模板
                    </p>
                    <p className="text-xs text-indigo-600/70 mb-3">
                      模板包含单位名称及该分类的扩展字段列；<strong className="font-bold">单位编号由系统自动分配，无需填写、也不支持导入</strong>。示例行中的「请填写」等文字仅为格式参考，不是编号。多工作表时优先读取与分类同名的表。
                    </p>
                    <button
                      type="button"
                      onClick={handleDownloadTemplate}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700 active:scale-95 transition-all shadow-sm"
                    >
                      <Download className="w-3.5 h-3.5" /> 下载 Excel 模板
                    </button>
                  </div>
                </div>
              </div>

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
                  {excelFileName ? (
                    <div className="flex items-center justify-center gap-2 text-sm font-bold text-indigo-600">
                      <FileSpreadsheet className="w-5 h-5" />
                      {excelFileName}
                    </div>
                  ) : (
                    <>
                      <Upload className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <p className="text-sm font-bold text-slate-600">点击选择 Excel 文件</p>
                      <p className="text-xs text-slate-400 mt-1">支持 .xlsx / .xls</p>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-5">
              {importResult ? (
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
                    成功导入 <span className="font-bold text-emerald-600">{importResult.success}</span> 个单位
                    {importResult.failed > 0 && (
                      <>，<span className="font-bold text-red-500">{importResult.failed}</span> 个失败</>
                    )}
                  </p>
                  <button
                    type="button"
                    onClick={handleClose}
                    className="mt-6 px-6 py-2.5 bg-indigo-600 text-white font-bold text-sm rounded-xl hover:bg-indigo-700 active:scale-95 transition-all"
                  >
                    关闭
                  </button>
                </div>
              ) : (
                <>
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

                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <div className="overflow-x-auto max-h-[40vh]">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50 sticky top-0 z-10">
                          <tr>
                            <th className="px-3 py-2.5 text-left font-bold text-slate-500 whitespace-nowrap">行</th>
                            <th className="px-3 py-2.5 text-left font-bold text-slate-500 whitespace-nowrap">状态</th>
                            <th className="px-3 py-2.5 text-left font-bold text-slate-500 whitespace-nowrap">单位名称</th>
                            <th className="px-3 py-2.5 text-left font-bold text-slate-500 whitespace-nowrap">问题</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {parsedRows.map(row => (
                            <tr key={row.rowNum} className={row.status === 'error' ? 'bg-red-50/30' : row.status === 'warning' ? 'bg-amber-50/20' : ''}>
                              <td className="px-3 py-2 text-slate-500 font-mono">{row.rowNum}</td>
                              <td className="px-3 py-2">
                                {row.status === 'valid' && <span className="text-emerald-600 font-bold">正常</span>}
                                {row.status === 'warning' && <span className="text-amber-600 font-bold">警告</span>}
                                {row.status === 'error' && <span className="text-red-600 font-bold">错误</span>}
                              </td>
                              <td className="px-3 py-2 font-bold text-slate-800">{row.name || '—'}</td>
                              <td className="px-3 py-2 text-slate-500">{row.issues.join('；') || '—'}</td>
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

        {!importResult && (
          <div className="px-8 py-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div>
              {step !== 'category' && (
                <button
                  type="button"
                  onClick={() => setStep(step === 'preview' ? 'upload' : 'category')}
                  className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 flex items-center gap-1 transition-all"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> 上一步
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleClose}
                className="px-5 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 transition-all"
              >
                取消
              </button>
              {step === 'category' && (
                <button
                  type="button"
                  disabled={!selectedCategoryId}
                  onClick={() => setStep('upload')}
                  className="px-5 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition-all flex items-center gap-1.5"
                >
                  下一步 <ChevronRight className="w-3.5 h-3.5" />
                </button>
              )}
              {step === 'upload' && (
                <button
                  type="button"
                  disabled={parsedRows.length === 0}
                  onClick={() => setStep('preview')}
                  className="px-5 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition-all flex items-center gap-1.5"
                >
                  下一步 <ChevronRight className="w-3.5 h-3.5" />
                </button>
              )}
              {step === 'preview' && (
                <button
                  type="button"
                  disabled={importing || stats.importable === 0}
                  onClick={() => void handleImport()}
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
