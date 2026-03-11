import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Search, X, Check, Wrench } from 'lucide-react';
import { GlobalNodeTemplate } from '../types';

export interface EquipmentOption {
  id: string;
  name: string;
  sub?: string;
  assignedMilestoneIds?: string[];
}

interface EquipmentSelectorProps {
  options: EquipmentOption[];
  processNodes: GlobalNodeTemplate[];
  currentNodeId: string;
  value: string;
  onChange: (equipmentId: string) => void;
  placeholder?: string;
  variant?: 'default' | 'compact';
  icon?: React.ComponentType<{ className?: string }>;
}

const UNASSIGNED_TAB = 'UNASSIGNED';

/** 报工用设备选择器，UI 风格与设备派工一致，单选 */
const EquipmentSelector: React.FC<EquipmentSelectorProps> = ({
  options,
  processNodes,
  currentNodeId,
  value,
  onChange,
  placeholder = '选择设备...',
  variant = 'default',
  icon: Icon = Wrench
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<string>(currentNodeId);
  const containerRef = useRef<HTMLDivElement>(null);

  const visibleProcessNodes = useMemo(
    () => processNodes.filter(n => options.filter(o => o.assignedMilestoneIds?.includes(n.id)).length > 0),
    [processNodes, options]
  );

  const unassignedCount = useMemo(
    () => options.filter(o => !o.assignedMilestoneIds?.length).length,
    [options]
  );

  const filteredByTab = useMemo(() => {
    if (activeTab === 'all') return options;
    if (activeTab === UNASSIGNED_TAB) return options.filter(o => !o.assignedMilestoneIds?.length);
    return options.filter(o => o.assignedMilestoneIds?.includes(activeTab));
  }, [options, activeTab]);

  const filtered = useMemo(
    () =>
      filteredByTab.filter(
        o =>
          o.name.toLowerCase().includes(search.toLowerCase()) ||
          (o.sub?.toLowerCase().includes(search.toLowerCase()) ?? false)
      ),
    [filteredByTab, search]
  );

  const selectEquipment = (id: string) => {
    onChange(value === id ? '' : id);
    if (value !== id) setIsOpen(false);
  };

  useEffect(() => {
    setActiveTab(currentNodeId);
  }, [currentNodeId]);

  useEffect(() => {
    if (activeTab === 'all' || activeTab === UNASSIGNED_TAB) return;
    if (!visibleProcessNodes.some(n => n.id === activeTab)) {
      setActiveTab(visibleProcessNodes.some(n => n.id === currentNodeId) ? currentNodeId : 'all');
    }
  }, [activeTab, visibleProcessNodes, currentNodeId]);

  useEffect(() => {
    if (isOpen) {
      const currentInList = visibleProcessNodes.some(n => n.id === currentNodeId);
      setActiveTab(currentInList ? currentNodeId : 'all');
    }
  }, [isOpen, currentNodeId, visibleProcessNodes]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedEquipment = options.find(o => o.id === value);

  return (
    <div className="relative w-full" ref={containerRef}>
      <div
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full bg-white border border-slate-200 rounded-xl flex flex-wrap gap-1.5 cursor-pointer hover:border-indigo-400 hover:ring-2 hover:ring-indigo-50 transition-all min-h-[46px] ${variant === 'compact' ? 'p-2' : 'p-3'}`}
      >
        {!value ? (
          <span className="text-slate-300 text-[11px] font-bold flex items-center gap-1.5 py-1">
            <Icon className="w-3.5 h-3.5" /> {placeholder}
          </span>
        ) : (
          <span className="bg-indigo-600 text-white px-2 py-0.5 rounded-lg text-[10px] font-black flex items-center gap-1 shadow-sm">
            {selectedEquipment?.name}
            <X
              className="w-3 h-3 hover:text-rose-200"
              onClick={e => {
                e.stopPropagation();
                onChange('');
              }}
            />
          </span>
        )}
      </div>

      {isOpen && (
        <div className="absolute top-full mt-2 left-0 right-0 bg-white border border-slate-200 rounded-2xl shadow-2xl z-[200] p-3 animate-in fade-in zoom-in-95">
          <div className="relative mb-2">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              autoFocus
              type="text"
              className="w-full bg-slate-50 border-none rounded-lg py-1.5 pl-8 pr-3 text-[11px] font-bold outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="搜索..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-1.5 mb-2 overflow-x-auto no-scrollbar pb-1">
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase transition-all whitespace-nowrap ${activeTab === 'all' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
            >
              全部
            </button>
            {unassignedCount > 0 && (
              <button
                type="button"
                onClick={() => setActiveTab(UNASSIGNED_TAB)}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase transition-all whitespace-nowrap ${activeTab === UNASSIGNED_TAB ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
              >
                未分配 ({unassignedCount})
              </button>
            )}
            {visibleProcessNodes.map(n => (
              <button
                key={n.id}
                type="button"
                onClick={() => setActiveTab(n.id)}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase transition-all whitespace-nowrap ${activeTab === n.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
              >
                {n.name} ({options.filter(o => o.assignedMilestoneIds?.includes(n.id)).length})
              </button>
            ))}
          </div>
          <div className="max-h-40 overflow-y-auto custom-scrollbar space-y-0.5">
            {filtered.map(opt => (
              <button
                key={opt.id}
                type="button"
                onClick={() => selectEquipment(opt.id)}
                className={`w-full text-left p-2 rounded-lg transition-all flex items-center justify-between group ${
                  value === opt.id ? 'bg-indigo-600 text-white' : 'hover:bg-slate-50 text-slate-700'
                }`}
              >
                <div>
                  <p className="text-[11px] font-bold">{opt.name}</p>
                  {opt.sub && (
                    <p className={`text-[9px] font-medium ${value === opt.id ? 'text-indigo-200' : 'text-slate-400'}`}>
                      {opt.sub}
                    </p>
                  )}
                </div>
                {value === opt.id && <Check className="w-3.5 h-3.5" />}
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="text-center py-4 text-[10px] text-slate-400 italic">未找到匹配项</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default EquipmentSelector;
