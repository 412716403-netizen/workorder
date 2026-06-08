import React, { useState } from 'react';
import { Loader2, Megaphone, Plus, Trash2 } from 'lucide-react';
import MessagePublishModal from './MessagePublishModal';
import { formatTimestamp } from '../../utils/formatTime';
import { usePlatformAnnouncementsAdmin } from '../../hooks/usePlatformAnnouncementsAdmin';
import { useConfirm } from '../../contexts/ConfirmContext';

const AnnouncementPublishView: React.FC = () => {
  const confirm = useConfirm();
  const [publishOpen, setPublishOpen] = useState(false);
  const {
    messages,
    isLoading,
    publish,
    isPublishing,
    deleteMessage,
    isDeleting,
  } = usePlatformAnnouncementsAdmin();

  const handleDelete = async (id: string, title: string) => {
    const ok = await confirm({ title: '删除消息', message: `确定删除「${title}」？` });
    if (ok) deleteMessage(id);
  };

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-black tracking-tight text-slate-900">信息发布</h1>
          <p className="mt-1 text-sm text-slate-500">
            向全部企业发布系统通知，各租户消息中心均可收到，发布人显示为「系统」
          </p>
        </div>
        <button
          type="button"
          onClick={() => setPublishOpen(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" /> 发布消息
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/80 px-5 py-3">
          <Megaphone className="h-4 w-4 text-indigo-600" />
          <span className="text-sm font-bold text-slate-800">已发布消息</span>
          <span className="text-xs text-slate-400">（{messages.length} 条）</span>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-7 w-7 animate-spin text-indigo-400" />
          </div>
        ) : messages.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <p className="text-sm text-slate-500">暂无已发布消息</p>
            <button
              type="button"
              onClick={() => setPublishOpen(true)}
              className="mt-4 text-sm font-bold text-indigo-600 hover:underline"
            >
              发布第一条消息
            </button>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {messages.map(msg => (
              <li key={msg.id} className="group px-5 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-black text-slate-900">{msg.title}</h2>
                      <span className="text-[10px] text-slate-400">
                        {formatTimestamp(msg.createdAt)}
                      </span>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-600">
                      {msg.body}
                    </p>
                    <p className="mt-2 text-xs text-slate-400">发布人：{msg.publisherName}</p>
                  </div>
                  <button
                    type="button"
                    disabled={isDeleting}
                    onClick={() => void handleDelete(msg.id, msg.title)}
                    className="shrink-0 rounded-lg p-2 text-slate-400 opacity-0 transition hover:bg-rose-50 hover:text-rose-500 group-hover:opacity-100"
                    aria-label="删除"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <MessagePublishModal
        open={publishOpen}
        isSaving={isPublishing}
        onClose={() => setPublishOpen(false)}
        onPublish={payload => {
          publish(payload, {
            onSuccess: () => setPublishOpen(false),
          });
        }}
      />
    </div>
  );
};

export default AnnouncementPublishView;
