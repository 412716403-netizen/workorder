/**
 * 基础信息 - 合作单位 Tab (Phase P8 抽离自 BasicInfoView)。
 *
 * 自包含: 列表 + 单位编辑面板;通过 props 传入 partners / partnerCategories / 操作回调。
 */
import React, { useMemo, useState } from 'react';
import { Building2, Plus, Search, X, Edit2, Trash2, ArrowLeft, Save } from 'lucide-react';
import { toast } from 'sonner';
import type { Partner, PartnerCategory } from '../../../types';
import * as api from '../../../services/api';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';
import { useAsyncSubmitLock } from '../../../hooks/useAsyncSubmitLock';
import { filterPartnersByCategoryAndKeyword } from '../../../utils/basicInfoFilters';
import ReportCustomFieldsEditor from '../../../components/ReportCustomFieldsEditor';
import {
  formStandardControlClass,
  formStandardControlIconClass,
  formStandardLabelClass,
} from '../../../styles/uiDensity';

interface Props {
  partners: Partner[];
  partnerCategories: PartnerCategory[];
  onRefreshPartners: () => Promise<void> | void;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

const PartnersTab: React.FC<Props> = ({ partners, partnerCategories, onRefreshPartners, canCreate, canEdit, canDelete }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebouncedValue(searchTerm);
  const [activePartnerCategoryId, setActivePartnerCategoryId] = useState<string>(partnerCategories[0]?.id || 'all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPartner, setEditPartner] = useState<Partial<Partner>>({});
  const [showModal, setShowModal] = useState(false);
  const partnerSubmit = useAsyncSubmitLock();

  const filteredPartners = useMemo(
    () => filterPartnersByCategoryAndKeyword(partners, activePartnerCategoryId, debouncedSearchTerm),
    [partners, activePartnerCategoryId, debouncedSearchTerm],
  );

  const handleOpenPartner = (p?: Partner) => {
    setEditPartner(
      p || {
        name: '',
        categoryId: activePartnerCategoryId !== 'all' ? activePartnerCategoryId : '',
        contact: '',
        customData: {},
      },
    );
    setEditingId(p?.id || null);
    setShowModal(true);
  };

  const savePartner = async () => {
    if (!editPartner.name?.trim()) {
      toast.warning('请填写单位名称');
      return;
    }
    if (!editingId && !editPartner.categoryId) {
      toast.warning('请选择单位分类');
      return;
    }
    await partnerSubmit.run(async () => {
      try {
        if (editingId) {
          if (editPartner.partnerListNo == null || editPartner.partnerListNo < 1) {
            toast.error('请填写有效的单位编号（1–9999）');
            return;
          }
          await api.partners.update(editingId, editPartner);
        } else {
          const { partnerListNo: _n, ...createPayload } = editPartner;
          void _n;
          await api.partners.create(createPayload);
        }
        setShowModal(false);
        await onRefreshPartners();
      } catch (err) {
        toast.error((err as Error).message || '操作失败');
      }
    });
  };

  if (showModal) {
    return (
      <div className="max-w-4xl mx-auto space-y-6 animate-in slide-in-from-bottom-4 pb-32">
        <div className="flex items-center justify-between sticky top-0 z-40 py-4 bg-slate-50/90 backdrop-blur-md -mx-4 px-4 border-b border-slate-200">
          <button
            onClick={() => setShowModal(false)}
            className="flex items-center gap-2 text-slate-500 font-bold text-sm hover:text-slate-800 transition-all"
          >
            <ArrowLeft className="w-4 h-4" /> 返回列表
          </button>
          <button
            type="button"
            onClick={() => void savePartner()}
            disabled={partnerSubmit.busy}
            className="bg-indigo-600 text-white px-8 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-lg hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="w-4 h-4" /> {partnerSubmit.busy ? '保存中…' : '保存资料'}
          </button>
        </div>

        <div className="bg-white rounded-[40px] p-8 border border-slate-200 shadow-sm space-y-8">
          <div className="flex items-center gap-3 border-b border-slate-50 pb-4">
            <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600">
              <Building2 className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold text-slate-800">单位基础档案</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1">
              <label className={formStandardLabelClass}>单位名称</label>
              <input
                type="text"
                value={editPartner.name}
                onChange={e => setEditPartner({ ...editPartner, name: e.target.value })}
                className={formStandardControlClass}
                placeholder="公司或个人名称"
              />
            </div>
            <div className="space-y-1">
              <label className={formStandardLabelClass}>
                单位分类 (决定扩展字段)
              </label>
              <select
                value={editPartner.categoryId}
                onChange={e => setEditPartner({ ...editPartner, categoryId: e.target.value, customData: {} })}
                className={formStandardControlClass}
              >
                <option value="">点击选择分类...</option>
                {partnerCategories.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            {editingId && (
              <div className="space-y-1 md:col-span-2">
                <label className={formStandardLabelClass}>单位编号</label>
                <input
                  type="number"
                  min={1}
                  max={9999}
                  value={editPartner.partnerListNo ?? ''}
                  onChange={e => {
                    const v = e.target.value;
                    setEditPartner({
                      ...editPartner,
                      partnerListNo: v === '' ? undefined : Math.min(9999, Math.max(1, parseInt(v, 10) || 1)),
                    });
                  }}
                  className={`${formStandardControlClass} max-w-[200px] font-mono tabular-nums`}
                />
                <p className="text-[10px] text-slate-400 font-medium mt-1 ml-1">租户内唯一；中间四位与流水共同组成单号，勿与其他单位重复</p>
              </div>
            )}
          </div>

          {editPartner.categoryId && (
            <div className="pt-8 border-t border-slate-50 animate-in slide-in-from-top-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50/50 p-8 rounded-[32px] border border-slate-100">
                {(() => {
                  const cf =
                    partnerCategories.find(c => c.id === editPartner.categoryId)?.customFields.filter(f => f.showInForm !== false) ?? [];
                  if (cf.length === 0) return null;
                  return (
                    <ReportCustomFieldsEditor
                      fields={cf}
                      values={editPartner.customData ?? {}}
                      onChange={(fieldId, value) =>
                        setEditPartner({
                          ...editPartner,
                          customData: { ...(editPartner.customData || {}), [fieldId]: value },
                        })
                      }
                      inputClassName={formStandardControlClass}
                    />
                  );
                })()}
                {partnerCategories.find(c => c.id === editPartner.categoryId)?.customFields.length === 0 && (
                  <div className="col-span-full py-4 text-center text-[10px] text-slate-300 font-bold uppercase italic">该分类未定义任何扩展属性</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 tracking-tight">合作单位中心</h1>
          <p className="text-slate-500 mt-1 text-sm leading-snug max-w-xl">分类管理外部单位档案及自定义扩展信息</p>
        </div>
        {canCreate && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => handleOpenPartner()}
              className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 shadow-sm hover:bg-indigo-700 active:scale-[0.98] transition-all"
            >
              <Plus className="w-4 h-4 shrink-0" /> 新增单位
            </button>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-1.5 min-w-0">
            <button
              type="button"
              onClick={() => setActivePartnerCategoryId('all')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                activePartnerCategoryId === 'all' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              全部单位 ({partners.length})
            </button>
            {partnerCategories.map(cat => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActivePartnerCategoryId(cat.id)}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                  activePartnerCategoryId === cat.id ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {cat.name} ({partners.filter(p => p.categoryId === cat.id).length})
              </button>
            ))}
          </div>
          <div className="relative w-full sm:max-w-sm sm:shrink-0">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="search"
              placeholder="检索单位名称…"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className={`${formStandardControlIconClass} bg-white pr-10 shadow-sm`}
              aria-label="检索合作单位"
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

        {filteredPartners.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50/50">
            <Building2 className="w-10 h-10 text-slate-200 mb-3" />
            <p className="text-sm font-bold text-slate-600">{searchTerm.trim() ? '未找到匹配的单位' : '该分类下暂无单位数据'}</p>
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
                  <th className="py-3 px-2 w-[4.5rem] text-center">编号</th>
                  <th className="py-3 px-3">单位名称</th>
                  <th className="py-3 px-3 hidden sm:table-cell">联系人</th>
                  <th className="py-3 px-3 hidden md:table-cell">电话</th>
                  <th className="py-3 px-3 hidden lg:table-cell">分类</th>
                  <th className="py-3 px-3 hidden xl:table-cell text-center">协作</th>
                  <th className="py-3 pr-4 pl-2 text-right w-24">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPartners.map(p => {
                  const category = partnerCategories.find(c => c.id === p.categoryId);
                  const phoneFieldId = category?.customFields.find(f => f.label.includes('电话'))?.id;
                  const phoneNumber = phoneFieldId ? p.customData?.[phoneFieldId] : null;
                  const phoneDisplay = phoneNumber != null && String(phoneNumber).trim() !== '' ? String(phoneNumber) : '—';
                  return (
                    <tr
                      key={p.id}
                      className={`group hover:bg-indigo-50/40 transition-colors ${canEdit ? 'cursor-pointer' : ''}`}
                      onClick={() => canEdit && handleOpenPartner(p)}
                    >
                      <td className="py-3 pl-4 pr-2">
                        <div className="w-9 h-9 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                          <Building2 className="w-4 h-4" />
                        </div>
                      </td>
                      <td className="py-3 px-2 text-center">
                        <span className="text-xs font-mono font-bold text-slate-600 tabular-nums">
                          {p.partnerListNo != null ? String(p.partnerListNo).padStart(4, '0') : '—'}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <p className="text-sm font-bold text-slate-800 group-hover:text-indigo-600 transition-colors truncate max-w-[200px]">
                          {p.name}
                        </p>
                        <p className="sm:hidden text-[10px] text-slate-400 font-medium mt-0.5 truncate">{p.contact || '—'}</p>
                      </td>
                      <td className="py-3 px-3 hidden sm:table-cell">
                        <span className="text-xs text-slate-600 font-medium">{p.contact || '—'}</span>
                      </td>
                      <td className="py-3 px-3 hidden md:table-cell">
                        <span className="text-xs text-slate-500 font-medium">{phoneDisplay}</span>
                      </td>
                      <td className="py-3 px-3 hidden lg:table-cell">
                        {category ? (
                          <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold text-white bg-indigo-600">{category.name}</span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="py-3 px-3 hidden xl:table-cell text-center">
                        {p.collaborationTenantId ? (
                          <span className="text-[10px] font-bold text-emerald-600">已关联</span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="py-3 pr-4 pl-2 text-right">
                        <div className="flex items-center justify-end gap-0.5" onClick={e => e.stopPropagation()}>
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => handleOpenPartner(p)}
                              className="p-1.5 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                              aria-label="编辑"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          )}
                          {canDelete && (
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  await api.partners.delete(p.id);
                                  await onRefreshPartners();
                                } catch (err) {
                                  toast.error((err as Error).message || '删除失败');
                                }
                              }}
                              className="p-1.5 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
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

export default PartnersTab;
