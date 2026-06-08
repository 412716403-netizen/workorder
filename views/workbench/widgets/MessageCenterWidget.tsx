import React, { useState } from 'react';
import { ChevronRight, Loader2 } from 'lucide-react';
import WidgetShell from '../WidgetShell';
import MessageDetailModal from './MessageDetailModal';
import { formatTimestamp } from '../../../utils/formatTime';
import { useDashboardNotifications } from '../../../hooks/useDashboardNotifications';
import type { DashboardNotification } from '../../../services/api/dashboard';

interface MessageCenterWidgetProps {
  editing?: boolean;
  onRemove?: () => void;
}

const MessageCenterWidget: React.FC<MessageCenterWidgetProps> = ({ editing, onRemove }) => {
  const { data, isLoading } = useDashboardNotifications(20);
  const [selected, setSelected] = useState<DashboardNotification | null>(null);

  const openDetail = (msg: DashboardNotification) => {
    if (editing) return;
    setSelected(msg);
  };

  return (
    <>
      <WidgetShell title="消息中心" editing={editing} onRemove={onRemove}>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
          </div>
        ) : !data?.length ? (
          <p className="py-8 text-center text-sm text-slate-400">暂无消息</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.map(msg => {
              const isExpiry = msg.type === 'expiry_reminder';
              return (
                <li key={msg.id}>
                  <button
                    type="button"
                    disabled={editing}
                    onClick={() => openDetail(msg)}
                    className={`workbench-no-drag group flex w-full items-center gap-2 px-1 py-2.5 text-left transition ${
                      editing ? 'cursor-default opacity-70' : 'cursor-pointer hover:bg-slate-50/80'
                    } ${isExpiry ? 'bg-amber-50/40 hover:bg-amber-50/70' : ''}`}
                  >
                    <span
                      className={`min-w-0 flex-1 truncate text-xs ${
                        isExpiry ? 'font-bold text-amber-900' : 'text-slate-700'
                      }`}
                      title={msg.title}
                    >
                      {msg.title}
                    </span>
                    <span className="shrink-0 text-[10px] text-slate-400">
                      {formatTimestamp(msg.createdAt)}
                    </span>
                    {!editing && (
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300 transition group-hover:text-slate-400" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </WidgetShell>

      <MessageDetailModal
        open={selected != null}
        message={selected}
        onClose={() => setSelected(null)}
      />
    </>
  );
};

export default MessageCenterWidget;
