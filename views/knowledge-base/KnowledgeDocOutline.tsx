import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, ListTree } from 'lucide-react';
import type { KnowledgeOutlineItem } from '../../utils/knowledgeDocOutline';

interface KnowledgeDocOutlineProps {
  items: KnowledgeOutlineItem[];
  activeId: string | null;
  onJump: (item: KnowledgeOutlineItem) => void;
  className?: string;
}

const KnowledgeDocOutline: React.FC<KnowledgeDocOutlineProps> = ({
  items,
  activeId,
  onJump,
  className = '',
}) => {
  const [collapsed, setCollapsed] = useState(false);

  if (items.length === 0) return null;

  if (collapsed) {
    return (
      <aside className={`kb-doc-outline kb-doc-outline-collapsed shrink-0 ${className}`.trim()}>
        <button
          type="button"
          className="kb-doc-outline-expand"
          title="展开目录"
          aria-label="展开目录"
          onClick={() => setCollapsed(false)}
        >
          <ChevronLeft className="h-4 w-4" />
          <ListTree className="h-3.5 w-3.5" />
        </button>
      </aside>
    );
  }

  return (
    <aside className={`kb-doc-outline shrink-0 ${className}`.trim()}>
      <div className="kb-doc-outline-inner">
        <div className="kb-doc-outline-title">
          <ListTree className="h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 flex-1">目录</span>
          <button
            type="button"
            className="kb-doc-outline-toggle"
            title="收起目录"
            aria-label="收起目录"
            onClick={() => setCollapsed(true)}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
        <nav className="kb-doc-outline-nav" aria-label="文档目录">
          {items.map(item => (
            <button
              key={item.id}
              type="button"
              className={`kb-doc-outline-item kb-doc-outline-level-${item.level}${
                activeId === item.id ? ' is-active' : ''
              }`}
              title={item.text}
              onClick={() => onJump(item)}
            >
              <span className="truncate">{item.text}</span>
            </button>
          ))}
        </nav>
      </div>
    </aside>
  );
};

export default KnowledgeDocOutline;
