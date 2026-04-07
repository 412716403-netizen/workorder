import React from 'react';
import { Copy } from 'lucide-react';

interface InviteCodeTabProps {
  tenantInfo: { inviteCode: string; name: string };
  onCopyInviteCode: () => void;
}

function InviteCodeTab({ tenantInfo, onCopyInviteCode }: InviteCodeTabProps) {
  return (
    <div className="bg-white rounded-[32px] border border-slate-200 p-8 shadow-sm w-full">
      <h3 className="font-bold text-lg text-slate-900 mb-1">企业邀请码</h3>
      <p className="text-sm text-slate-500 mb-6">将此邀请码分享给需要加入的成员</p>
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 max-w-2xl">
        <div className="flex-1 min-w-0 px-4 py-3 bg-slate-50 rounded-xl font-mono text-lg font-bold tracking-wider text-slate-900 text-left border border-slate-100">
          {tenantInfo.inviteCode}
        </div>
        <button
          type="button"
          onClick={onCopyInviteCode}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold shadow-sm hover:bg-indigo-700 active:scale-[0.98] transition-all flex items-center justify-center gap-2 shrink-0"
        >
          <Copy className="w-4 h-4 shrink-0" /> 复制
        </button>
      </div>
    </div>
  );
}

export default React.memo(InviteCodeTab);
