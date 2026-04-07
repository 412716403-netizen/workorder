import React from 'react';

function LabeledInner({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</label>
      {children}
    </div>
  );
}

export const Labeled = React.memo(LabeledInner);
