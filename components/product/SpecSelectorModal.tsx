import React, { useState } from 'react';
import { X, Plus, Search, Check } from 'lucide-react';
import type { DictionaryItem } from '../../types';
import { productArchiveFormControlIconClass } from '../../styles/uiDensity';

export interface SpecSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  items: DictionaryItem[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onAddNew: (name: string) => void;
  type: 'color' | 'size';
  stackZClass?: string;
}

/** 与基础信息 → 产品档案中颜色/尺码选择弹窗一致 */
const SpecSelectorModal: React.FC<SpecSelectorModalProps> = ({
  isOpen,
  onClose,
  title,
  items,
  selectedIds,
  onToggle,
  onAddNew,
  type,
  stackZClass = 'z-[10250]',
}) => {
  const [search, setSearch] = useState('');
  const filteredItems = items.filter((item) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return item.name.toLowerCase().includes(q) || (item.value ?? '').toLowerCase().includes(q);
  });
  const exactMatch = items.find((item) => item.name === search.trim());
  if (!isOpen) return null;

  return (
    <div className={`fixed inset-0 ${stackZClass} flex items-center justify-center p-4`}>
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} role="presentation" />
      <div className="relative bg-white w-full max-w-xl rounded-[40px] shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-8 py-6 border-b border-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-slate-800">{title}</h2>
            <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
              已选择 {selectedIds.length} 项
            </span>
          </div>
          <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-full transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-4 flex-1 overflow-y-auto custom-scrollbar">
          <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-100 flex flex-wrap gap-2 min-h-[60px]">
            {selectedIds.map((id) => {
              const item = items.find((i) => i.id === id);
              return (
                <div key={id} className="bg-indigo-600 text-white px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2">
                  {item?.name}
                  <button type="button" onClick={() => onToggle(id)}><X className="w-3 h-3" /></button>
                </div>
              );
            })}
            {selectedIds.length === 0 && (
              <span className="text-slate-300 text-xs italic m-auto">暂未选择任何规格值</span>
            )}
          </div>
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                autoFocus
                type="text"
                placeholder={type === 'color' ? '搜索名称或色值…' : '搜索名称或编码…'}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={`${productArchiveFormControlIconClass} pl-9`}
              />
            </div>
            {search.trim() && !exactMatch && (
              <button
                type="button"
                onClick={() => {
                  onAddNew(search.trim());
                  setSearch('');
                }}
                className="flex items-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-2xl text-xs font-bold hover:bg-black transition-all shadow-lg"
              >
                <Plus className="w-4 h-4" /> 新增 &quot;{search.trim()}&quot;
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 gap-2">
            {filteredItems.map((item) => {
              const isSelected = selectedIds.includes(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onToggle(item.id)}
                  className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all ${
                    isSelected ? 'border-indigo-600 bg-indigo-50 text-indigo-600' : 'border-slate-50 bg-white hover:border-slate-200 text-slate-600'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {type === 'color' && (
                      <div className="w-4 h-4 rounded-full border border-slate-200" style={{ backgroundColor: item.value }} />
                    )}
                    <span className="text-sm font-bold">{item.name}</span>
                  </div>
                  {isSelected && <Check className="w-5 h-5 text-indigo-600" />}
                </button>
              );
            })}
          </div>
        </div>
        <div className="p-8 bg-slate-50/50 border-t border-slate-50">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-4 bg-indigo-600 text-white rounded-[20px] font-black text-sm shadow-xl shadow-indigo-100 hover:bg-indigo-700 active:scale-[0.98] transition-all"
          >
            确认选择 ({selectedIds.length})
          </button>
        </div>
      </div>
    </div>
  );
};

export default SpecSelectorModal;
