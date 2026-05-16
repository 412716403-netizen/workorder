/**
 * 基础信息 - 公共数据字典 Tab (Phase P8 抽离自 BasicInfoView)。
 *
 * 自包含: 列表(颜色 / 尺码 / 单位三类) + 添加/编辑面板。
 */
import React, { useMemo, useState } from 'react';
import {
  Library,
  Plus,
  Search,
  X,
  Edit2,
  Trash2,
  ArrowLeft,
  Save,
  Palette,
  Maximize2,
  Package,
} from 'lucide-react';
import { toast } from 'sonner';
import type { AppDictionaries } from '../../../types';
import * as api from '../../../services/api';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';
import { useAsyncSubmitLock } from '../../../hooks/useAsyncSubmitLock';
import { filterAndSortDictionaryRows } from '../../../utils/basicInfoFilters';
import {
  formStandardControlClass,
  formStandardControlIconClass,
  formStandardLabelClass,
} from '../../../styles/uiDensity';

interface Props {
  dictionaries: AppDictionaries;
  onRefreshDictionaries: () => Promise<void> | void;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

type DictRow = { id: string; kind: 'color' | 'size' | 'unit'; name: string; value: string };

const DictionariesTab: React.FC<Props> = ({ dictionaries, onRefreshDictionaries, canCreate, canEdit, canDelete }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebouncedValue(searchTerm);
  const [activeDictKindFilter, setActiveDictKindFilter] = useState<'all' | 'color' | 'size' | 'unit'>('all');

  const [dictEditingId, setDictEditingId] = useState<string | null>(null);
  const [dictAddType, setDictAddType] = useState<'color' | 'size' | 'unit'>('color');
  const [dictAddName, setDictAddName] = useState('');
  const [dictAddValue, setDictAddValue] = useState('');
  const [showModal, setShowModal] = useState(false);
  const dictSubmit = useAsyncSubmitLock();

  const units = dictionaries.units ?? [];
  const dictTotalCount = dictionaries.colors.length + dictionaries.sizes.length + units.length;

  const filteredDictionaryRows = useMemo(() => {
    const rows: DictRow[] = [
      ...dictionaries.colors.map(c => ({ id: c.id, kind: 'color' as const, name: c.name, value: c.value ?? '' })),
      ...dictionaries.sizes.map(s => ({ id: s.id, kind: 'size' as const, name: s.name, value: s.value ?? '' })),
      ...units.map(u => ({ id: u.id, kind: 'unit' as const, name: u.name, value: u.value ?? '' })),
    ];
    return filterAndSortDictionaryRows(rows, {
      kindFilter: activeDictKindFilter,
      keyword: debouncedSearchTerm,
    }) as DictRow[];
  }, [dictionaries.colors, dictionaries.sizes, units, activeDictKindFilter, debouncedSearchTerm]);

  const closeDictionaryModal = () => {
    setShowModal(false);
    setDictEditingId(null);
    setDictAddValue('');
  };

  const handleOpenDictionaryAdd = () => {
    setDictEditingId(null);
    setDictAddType('color');
    setDictAddName('');
    setDictAddValue('');
    setShowModal(true);
  };

  const handleOpenDictionaryEdit = (row: DictRow) => {
    setDictEditingId(row.id);
    setDictAddType(row.kind);
    setDictAddName(row.name);
    setDictAddValue(row.value && row.value !== row.name ? row.value : '');
    setShowModal(true);
  };

  const saveDictionaryItem = async () => {
    const val = dictAddName.trim();
    if (!val) {
      toast.warning('请填写名称');
      return;
    }
    const valuePayload = dictAddValue.trim() || val;
    const typeLabel = dictAddType === 'color' ? '颜色' : dictAddType === 'size' ? '尺码' : '单位';

    if (dictEditingId) {
      const dupColor = dictAddType === 'color' && dictionaries.colors.some(c => c.id !== dictEditingId && c.name === val);
      const dupSize = dictAddType === 'size' && dictionaries.sizes.some(s => s.id !== dictEditingId && s.name === val);
      const dupUnit = dictAddType === 'unit' && units.some(u => u.id !== dictEditingId && u.name === val);
      if (dupColor || dupSize || dupUnit) {
        toast.warning(`${typeLabel}「${val}」已存在`);
        return;
      }
      await dictSubmit.run(async () => {
        try {
          await api.dictionaries.update(dictEditingId, { name: val, value: valuePayload });
          setDictAddName('');
          setDictAddValue('');
          closeDictionaryModal();
          await onRefreshDictionaries();
          toast.success('已保存');
        } catch (err) {
          toast.error((err as Error).message || '操作失败');
        }
      });
      return;
    }

    if (dictAddType === 'color' && dictionaries.colors.some(c => c.name === val)) {
      toast.warning(`${typeLabel}「${val}」已存在`);
      return;
    }
    if (dictAddType === 'size' && dictionaries.sizes.some(s => s.name === val)) {
      toast.warning(`${typeLabel}「${val}」已存在`);
      return;
    }
    if (dictAddType === 'unit' && units.some(u => u.name === val)) {
      toast.warning(`${typeLabel}「${val}」已存在`);
      return;
    }
    await dictSubmit.run(async () => {
      try {
        await api.dictionaries.create({ type: dictAddType, name: val, value: valuePayload });
        setDictAddName('');
        setDictAddValue('');
        closeDictionaryModal();
        await onRefreshDictionaries();
        toast.success('已添加');
      } catch (err) {
        toast.error((err as Error).message || '操作失败');
      }
    });
  };

  const handleDeleteDictionary = async (id: string) => {
    try {
      await api.dictionaries.delete(id);
      await onRefreshDictionaries();
    } catch (err) {
      toast.error((err as Error).message || '操作失败');
    }
  };

  if (showModal) {
    return (
      <div className="max-w-4xl mx-auto space-y-6 animate-in slide-in-from-bottom-4 pb-32">
        <div className="flex items-center justify-between sticky top-0 z-40 py-4 bg-slate-50/90 backdrop-blur-md -mx-4 px-4 border-b border-slate-200">
          <button
            type="button"
            onClick={closeDictionaryModal}
            className="flex items-center gap-2 text-slate-500 font-bold text-sm hover:text-slate-800 transition-all"
          >
            <ArrowLeft className="w-4 h-4" /> 返回列表
          </button>
          <button
            type="button"
            onClick={saveDictionaryItem}
            disabled={dictSubmit.busy || !dictAddName.trim()}
            className="bg-indigo-600 text-white px-8 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-lg hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="w-4 h-4" /> {dictSubmit.busy ? '保存中…' : '保存'}
          </button>
        </div>

        <div className="bg-white rounded-[40px] p-8 border border-slate-200 shadow-sm space-y-8">
          <div className="flex items-center gap-3 border-b border-slate-50 pb-4">
            <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600">
              <Library className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold text-slate-800">{dictEditingId ? '编辑字典项' : '新增字典项'}</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1">
              <label className={formStandardLabelClass}>字典类型</label>
              <select
                value={dictAddType}
                onChange={e => setDictAddType(e.target.value as 'color' | 'size' | 'unit')}
                disabled={!!dictEditingId}
                className={`${formStandardControlClass} disabled:opacity-60 disabled:cursor-not-allowed`}
              >
                <option value="color">颜色</option>
                <option value="size">尺码</option>
                <option value="unit">产品单位</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className={formStandardLabelClass}>名称</label>
              <input
                type="text"
                value={dictAddName}
                onChange={e => setDictAddName(e.target.value)}
                className={formStandardControlClass}
                placeholder={
                  dictAddType === 'color'
                    ? '如：曜石黑、珍珠白'
                    : dictAddType === 'size'
                      ? '如：XL、42'
                      : '如：PCS、公斤'
                }
              />
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className={formStandardLabelClass}>
                色值 / 编码（可选，留空则与名称相同）
              </label>
              <input
                type="text"
                value={dictAddValue}
                onChange={e => setDictAddValue(e.target.value)}
                className={`${formStandardControlClass} font-mono`}
                placeholder={dictAddType === 'color' ? '如 #1a1a1a（十六进制色值）' : '如内部编码，可与名称不同'}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 tracking-tight">公共数据字典</h1>
          <p className="text-slate-500 mt-1 text-sm leading-snug max-w-xl">维护颜色、尺码与产品计量单位，供产品与单据引用</p>
        </div>
        {canCreate && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleOpenDictionaryAdd}
              className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 shadow-sm hover:bg-indigo-700 active:scale-[0.98] transition-all"
            >
              <Plus className="w-4 h-4 shrink-0" /> 新增
            </button>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-1.5 min-w-0">
            {(['all', 'color', 'size', 'unit'] as const).map(kind => {
              const label = kind === 'all' ? '全部' : kind === 'color' ? '颜色' : kind === 'size' ? '尺码' : '产品单位';
              const count =
                kind === 'all'
                  ? dictTotalCount
                  : kind === 'color'
                    ? dictionaries.colors.length
                    : kind === 'size'
                      ? dictionaries.sizes.length
                      : units.length;
              return (
                <button
                  key={kind}
                  type="button"
                  onClick={() => setActiveDictKindFilter(kind)}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                    activeDictKindFilter === kind ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {label} ({count})
                </button>
              );
            })}
          </div>
          <div className="relative w-full sm:max-w-sm sm:shrink-0">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="search"
              placeholder="搜索名称…"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className={`${formStandardControlIconClass} bg-white pr-10 shadow-sm`}
              aria-label="搜索字典项"
            />
            {searchTerm.trim() !== '' && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-all"
                aria-label="清空搜索"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {searchTerm.trim() !== '' && filteredDictionaryRows.length > 0 && (
          <p className="text-xs font-bold text-slate-500">
            找到 <span className="text-indigo-600 tabular-nums">{filteredDictionaryRows.length}</span> 条
          </p>
        )}

        {filteredDictionaryRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50/50">
            <Library className="w-10 h-10 text-slate-200 mb-3" />
            <p className="text-sm font-bold text-slate-600">{searchTerm.trim() ? '未找到匹配的字典项' : '当前筛选下暂无数据'}</p>
            {searchTerm.trim() !== '' && (
              <button type="button" onClick={() => setSearchTerm('')} className="mt-3 text-xs font-bold text-indigo-600 hover:underline">
                清空搜索条件
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/80 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 pl-4 pr-2 w-12"></th>
                  <th className="py-3 px-3 hidden sm:table-cell">类型</th>
                  <th className="py-3 px-3">名称</th>
                  <th className="py-3 pr-4 pl-2 text-right min-w-[5.5rem]">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredDictionaryRows.map(row => {
                  const kindLabel = row.kind === 'color' ? '颜色' : row.kind === 'size' ? '尺码' : '产品单位';
                  const KindIcon = row.kind === 'color' ? Palette : row.kind === 'size' ? Maximize2 : Package;
                  const vTrim = String(row.value || '').trim();
                  const isHexColor = row.kind === 'color' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(vTrim);
                  return (
                    <tr
                      key={`${row.kind}-${row.id}`}
                      className={`group hover:bg-indigo-50/40 transition-colors ${canEdit ? 'cursor-pointer' : ''}`}
                      onClick={() => canEdit && handleOpenDictionaryEdit(row)}
                    >
                      <td className="py-3 pl-4 pr-2">
                        <div className="w-9 h-9 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors overflow-hidden">
                          {isHexColor ? (
                            <span
                              className="w-full h-full block border border-slate-200"
                              style={{ backgroundColor: vTrim }}
                              title={vTrim}
                            />
                          ) : (
                            <KindIcon className="w-4 h-4" />
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-3 hidden sm:table-cell">
                        <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold text-white bg-indigo-600">{kindLabel}</span>
                      </td>
                      <td className="py-3 px-3">
                        <p
                          className={`text-sm font-bold text-slate-800 truncate max-w-[200px] ${
                            canEdit ? 'group-hover:text-indigo-600 transition-colors' : ''
                          }`}
                        >
                          {row.name}
                        </p>
                        <p className="sm:hidden text-[10px] text-slate-400 font-bold mt-0.5">{kindLabel}</p>
                      </td>
                      <td className="py-3 pr-4 pl-2 text-right">
                        <div className="flex items-center justify-end gap-0.5" onClick={ev => ev.stopPropagation()}>
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => handleOpenDictionaryEdit(row)}
                              className="p-1.5 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors inline-flex"
                              aria-label="编辑"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          )}
                          {canDelete && (
                            <button
                              type="button"
                              onClick={() => handleDeleteDictionary(row.id)}
                              className="p-1.5 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors inline-flex"
                              aria-label="删除"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default DictionariesTab;
