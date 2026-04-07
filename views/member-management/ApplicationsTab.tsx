import React from 'react';
import { Check, X } from 'lucide-react';
import type { Application } from './constants';

interface ApplicationsTabProps {
  applications: Application[];
  onReview: (appId: string, action: 'APPROVED' | 'REJECTED') => void;
}

function ApplicationsTab({ applications, onReview }: ApplicationsTabProps) {
  return (
    <div className="bg-white rounded-[32px] border border-slate-200 w-full overflow-hidden shadow-sm">
      {applications.length === 0 ? (
        <div className="p-8 text-left text-slate-400 font-medium">暂无待审核申请</div>
      ) : (
        <div className="divide-y divide-slate-100">
          {applications.map(app => (
            <div key={app.id} className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 text-left">
              <div>
                <div className="font-medium">{app.user.displayName || app.user.username}</div>
                <div className="text-xs text-gray-400">{app.user.phone} · {new Date(app.createdAt).toLocaleDateString()}</div>
                {app.message && <div className="text-xs text-gray-500 mt-1">留言：{app.message}</div>}
              </div>
              <div className="flex gap-2">
                <button onClick={() => onReview(app.id, 'APPROVED')} className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 flex items-center gap-1">
                  <Check className="w-3 h-3" /> 通过
                </button>
                <button onClick={() => onReview(app.id, 'REJECTED')} className="px-3 py-1.5 bg-red-100 text-red-600 text-sm rounded-lg hover:bg-red-200 flex items-center gap-1">
                  <X className="w-3 h-3" /> 拒绝
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default React.memo(ApplicationsTab);
