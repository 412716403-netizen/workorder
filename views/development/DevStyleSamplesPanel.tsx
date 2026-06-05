import React, { useState, useMemo } from 'react';
import { Plus, History, ClipboardCheck } from 'lucide-react';
import type { DevStyleDto, DevSampleDto, DevStageDto } from '../../types';
import { DEV_STAGE_STATUS_LABEL, DevStageStatus } from '../../types';
import DevStageRegisterModal from './DevStageRegisterModal';
import DevAddSampleModal from './DevAddSampleModal';
import { devTemplateFieldsToReportFields } from '../../utils/devStageTemplateFields';
import type { DevStageTemplateDto } from '../../types';

const STATUS_COLOR: Record<string, string> = {
  pending: 'bg-slate-300',
  in_progress: 'bg-blue-600',
  completed: 'bg-emerald-500',
  exception: 'bg-red-500',
};

interface DevStyleSamplesPanelProps {
  style: DevStyleDto;
  templates: DevStageTemplateDto[];
  readOnly?: boolean;
  onAddSample: (data: { name?: string; stageNames?: string[] }) => Promise<void>;
  onUpdateStage: (
    stageId: string,
    data: Parameters<typeof import('../../services/api/development').devStyles.updateStage>[1],
  ) => Promise<void>;
}

const DevStyleSamplesPanel: React.FC<DevStyleSamplesPanelProps> = ({
  style,
  templates,
  readOnly,
  onAddSample,
  onUpdateStage,
}) => {
  const [activeSampleId, setActiveSampleId] = useState(style.samples[0]?.id ?? '');
  const [registerStage, setRegisterStage] = useState<DevStageDto | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [addSampleOpen, setAddSampleOpen] = useState(false);

  const activeSample: DevSampleDto | undefined = style.samples.find((s) => s.id === activeSampleId);

  const templateFieldsForStage = useMemo(() => {
    if (!registerStage) return [];
    const tpl = templates.find((t) => t.name === registerStage.name);
    return tpl ? devTemplateFieldsToReportFields(tpl.fields) : [];
  }, [registerStage, templates]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {style.samples.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setActiveSampleId(s.id)}
            className={`px-4 py-2 rounded-2xl text-xs font-bold border ${
              activeSampleId === s.id ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-200 text-slate-600'
            }`}
          >
            {s.name}
          </button>
        ))}
        {!readOnly && (
          <button
            type="button"
            onClick={() => setAddSampleOpen(true)}
            className="inline-flex items-center gap-1 px-3 py-2 rounded-2xl border border-dashed border-indigo-300 text-xs font-bold text-indigo-600"
          >
            <Plus className="h-3.5 w-3.5" /> 新增轮次
          </button>
        )}
      </div>

      {activeSample && (
        <>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setLogOpen(!logOpen)}
              className="inline-flex items-center gap-1 text-xs font-bold text-slate-500"
            >
              <History className="h-3.5 w-3.5" /> 开发日志 ({activeSample.logs.length})
            </button>
          </div>
          {logOpen && (
            <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4 max-h-48 overflow-y-auto text-xs space-y-2">
              {activeSample.logs.length === 0 ? (
                <p className="text-slate-400">暂无日志</p>
              ) : (
                activeSample.logs.map((l) => (
                  <div key={l.id} className="border-b border-slate-100 pb-2">
                    <span className="font-bold text-slate-700">{l.user}</span>
                    <span className="text-slate-400 ml-2">{new Date(l.time).toLocaleString()}</span>
                    <p className="text-slate-600">{l.action} — {l.detail}</p>
                  </div>
                ))
              )}
            </div>
          )}

          <div className="grid gap-3">
            {activeSample.stages.map((st) => (
              <div
                key={st.id}
                className="flex items-center justify-between rounded-2xl border border-slate-100 bg-white px-5 py-4 shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <span className={`h-3 w-3 rounded-full ${STATUS_COLOR[st.status] ?? 'bg-slate-300'}`} />
                  <div>
                    <p className="text-sm font-black text-slate-800">{st.name}</p>
                    <p className="text-[10px] text-slate-400">
                      {DEV_STAGE_STATUS_LABEL[st.status as DevStageStatus] ?? st.status}
                      {st.fields.length > 0 ? ` · ${st.fields.length} 项参数` : ''}
                      {st.attachments.length > 0 ? ` · ${st.attachments.length} 个附件` : ''}
                    </p>
                  </div>
                </div>
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => setRegisterStage(st)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-indigo-50 text-xs font-bold text-indigo-700"
                  >
                    <ClipboardCheck className="h-3.5 w-3.5" /> 登记
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      <DevAddSampleModal
        open={addSampleOpen}
        existingSamples={style.samples}
        templates={templates}
        onClose={() => setAddSampleOpen(false)}
        onConfirm={(data) => void onAddSample(data)}
      />

      {registerStage && (
        <DevStageRegisterModal
          stage={registerStage}
          open
          templateFields={templateFieldsForStage}
          onClose={() => setRegisterStage(null)}
          onSave={async (payload) => {
            await onUpdateStage(registerStage.id, payload);
            setRegisterStage(null);
          }}
        />
      )}
    </div>
  );
};

export default DevStyleSamplesPanel;
