import React, { useMemo, useState } from 'react';
import { ChevronRight, Loader2 } from 'lucide-react';
import WidgetShell from '../WidgetShell';
import MessageDetailModal from './MessageDetailModal';
import { formatTimestamp } from '../../../utils/formatTime';
import { useDashboardNotifications } from '../../../hooks/useDashboardNotifications';
import { useDashboardNotificationRead } from '../../../hooks/useDashboardNotificationRead';
import type { DashboardNotification } from '../../../services/api/dashboard';

interface MessageCenterWidgetProps {
  editing?: boolean;
  layoutLocked?: boolean;
  onRemove?: () => void;
}

const MessageCenterWidget: React.FC<MessageCenterWidgetProps> = ({ editing, layoutLocked, onRemove }) => {
  const { data, isLoading } = useDashboardNotifications(20);
  const { isRead, markRead } = useDashboardNotificationRead();
  const [selected, setSelected] = useState<DashboardNotification | null>(null);

  const hasUnread = useMemo(
    () => (data ?? []).some(msg => !isRead(msg.id)),
    [data, isRead],
  );

  const openDetail = (msg: DashboardNotification) => {
    if (editing) return;
    setSelected(msg);
    markRead(msg.id);
  };

  return (
    <>
      <WidgetShell title="消息中心" titleDot={hasUnread} editing={editing} layoutLocked={layoutLocked} onRemove={onRemove}>
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
              const unread = !isRead(msg.id);
              return (
                <li key={msg.id}>
                  <button
                    type="button"
                    disabled={editing}
                    onClick={() => openDetail(msg)}
                    className={`workbench-no-drag group flex w-full items-center gap-2.5 px-1 py-3 text-left transition ${
                      editing ? 'cursor-default opacity-70' : 'cursor-pointer hover:bg-slate-50/80'
                    } ${isExpiry ? 'bg-amber-50/40 hover:bg-amber-50/70' : ''}`}
                  >
                    <span className="flex h-2 w-2 shrink-0 items-center justify-center">
                      {unread && (
                        <span
                          className="h-2 w-2 rounded-full bg-rose-500"
                          aria-label="未读"
                        />
                      )}
                    </span>
                    <span
                      className={`min-w-0 flex-1 truncate text-sm ${
                        unread
                          ? 'font-bold text-slate-900'
                          : isExpiry
                            ? 'font-bold text-amber-900'
                            : 'text-slate-700'
                      }`}
                      title={msg.title}
                    >
                      {msg.title}
                    </span>
                    <span className="shrink-0 text-xs text-slate-400">
                      {formatTimestamp(msg.createdAt)}
                    </span>
                    {!editing && (
                      <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:text-slate-400" />
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
