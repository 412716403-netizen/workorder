import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search, User } from 'lucide-react';
import type { GlobalNodeTemplate, Worker } from '../../types';
import { formStandardControlClass } from '../../styles/uiDensity';

interface WorkerSelectWithTabsProps {
  workers: Worker[];
  processNodes: GlobalNodeTemplate[];
  value: string;
  onChange: (id: string) => void;
  label: string;
  compact?: boolean;
}

function WorkerSelectWithTabs({ workers, processNodes, value, onChange, label, compact }: WorkerSelectWithTabsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<string>('all');
  const containerRef = useRef<HTMLDivElement>(null);
  const UNASSIGNED = 'UNASSIGNED';
  const visibleNodes = useMemo(() => processNodes.filter(n => workers.some(w => w.assignedMilestoneIds?.includes(n.id))), [processNodes, workers]);
  const filteredByTab = useMemo(() => {
    if (activeTab === 'all') return workers;
    if (activeTab === UNASSIGNED) return workers.filter(w => !w.assignedMilestoneIds?.length);
    return workers.filter(w => w.assignedMilestoneIds?.includes(activeTab));
  }, [workers, activeTab]);
  const filtered = useMemo(() => filteredByTab.filter(w => w.name.toLowerCase().includes(search.toLowerCase()) || (w.groupName || '').toLowerCase().includes(search.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN') || a.id.localeCompare(b.id)), [filteredByTab, search]);
  const selected = workers.find(w => w.id === value);
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  const dropdown = (
    <div className={compact ? 'absolute top-full left-0 mt-2 min-w-[300px] w-[300px] bg-white border border-slate-200 rounded-2xl shadow-2xl z-[100] p-4 animate-in fade-in zoom-in-95' : 'absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-2xl shadow-2xl z-[100] p-4 animate-in fade-in zoom-in-95'}>
      <div className="relative mb-3">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input autoFocus type="text" className="w-full min-w-0 bg-slate-50 border-none rounded-xl py-2.5 pl-10 pr-4 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500" placeholder="搜索工人姓名..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">按工序分类</p>
      <div className="flex items-center gap-1.5 mb-3 overflow-x-auto no-scrollbar pb-1">
        <button type="button" onClick={() => setActiveTab('all')} className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase whitespace-nowrap ${activeTab === 'all' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}>全部</button>
        {workers.filter(w => !w.assignedMilestoneIds?.length).length > 0 && (
          <button type="button" onClick={() => setActiveTab(UNASSIGNED)} className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase whitespace-nowrap ${activeTab === UNASSIGNED ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}>未分配</button>
        )}
        {visibleNodes.map(n => (
          <button key={n.id} type="button" onClick={() => setActiveTab(n.id)} className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase whitespace-nowrap ${activeTab === n.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}>{n.name}</button>
        ))}
      </div>
      <div className="max-h-52 overflow-y-auto space-y-1">
        {filtered.map(w => (
          <button key={w.id} type="button" onClick={() => { onChange(w.id); setIsOpen(false); setSearch(''); }} className={`w-full text-left p-3 rounded-xl transition-all border-2 ${w.id === value ? 'bg-indigo-50 border-indigo-600/20 text-indigo-700' : 'bg-white border-transparent hover:bg-slate-50 text-slate-700'}`}>
            <p className="text-sm font-bold truncate">{w.name}</p>
            {w.groupName && <p className="text-[10px] text-slate-400 mt-0.5">{w.groupName}</p>}
          </button>
        ))}
        {filtered.length === 0 && <p className="py-6 text-center text-slate-400 text-sm">未找到匹配工人</p>}
      </div>
    </div>
  );
  if (compact) {
    return (
      <div className="flex items-center gap-2 relative" ref={containerRef}>
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">{label}</span>
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="bg-white border border-slate-200 rounded-xl py-2 pl-3 pr-8 min-w-[120px] text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500 flex items-center justify-between gap-2 transition-all hover:border-slate-300"
        >
          <div className="flex items-center gap-1.5 truncate min-w-0">
            <User className={`w-3.5 h-3.5 flex-shrink-0 ${value ? 'text-indigo-600' : 'text-slate-300'}`} />
            <span className={value ? 'text-slate-800 truncate' : 'text-slate-400'}>{selected ? selected.name : '请选择工人'}</span>
          </div>
          <ChevronDown className={`w-3.5 h-3.5 flex-shrink-0 transition-transform text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 ${isOpen ? 'rotate-180' : ''}`} />
        </button>
        {isOpen && dropdown}
      </div>
    );
  }
  return (
    <div className="space-y-1 relative" ref={containerRef}>
      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{label}</label>
      <button type="button" onClick={() => setIsOpen(!isOpen)} className={`${formStandardControlClass} flex items-center justify-between`}>
        <div className="flex items-center gap-2 truncate">
          <User className={`w-4 h-4 flex-shrink-0 ${value ? 'text-indigo-600' : 'text-slate-300'}`} />
          <span className={value ? 'text-slate-900 truncate' : 'text-slate-400'}>{selected ? selected.name : '搜索并选择工人...'}</span>
        </div>
        <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : 'text-slate-400'}`} />
      </button>
      {isOpen && dropdown}
    </div>
  );
}

export default React.memo(WorkerSelectWithTabs);
