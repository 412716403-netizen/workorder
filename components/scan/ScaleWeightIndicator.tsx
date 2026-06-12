import React from 'react';
import { Scale, Unplug, Wifi } from 'lucide-react';
import type { SerialScaleProtocol, SerialScaleStatus } from '../../hooks/useSerialScale';
import { formatWeightKg } from '../../utils/scanWeightCheck';

export interface ScaleWeightIndicatorProps {
  status: SerialScaleStatus;
  currentWeightKg: number | null;
  isStable: boolean;
  errorMessage?: string | null;
  isSupported: boolean;
  config: { baudRate: number; protocol: SerialScaleProtocol };
  onConfigChange: (patch: { baudRate?: number; protocol?: SerialScaleProtocol }) => void;
  onConnect: () => void;
  onDisconnect: () => void;
}

export function ScaleWeightIndicator({
  status,
  currentWeightKg,
  isStable,
  errorMessage,
  isSupported,
  config,
  onConfigChange,
  onConnect,
  onDisconnect,
}: ScaleWeightIndicatorProps) {
  if (!isSupported) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2 text-[11px] text-amber-800">
        当前浏览器不支持电子秤直连，请使用 Chrome 或 Edge（需 HTTPS 或 localhost）。
      </div>
    );
  }

  const connected = status === 'connected';
  const connecting = status === 'connecting';

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/90 px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-indigo-600 shadow-sm">
            <Scale className="h-4 w-4" />
          </span>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">电子秤</div>
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-black tabular-nums text-slate-900">
                {currentWeightKg != null ? formatWeightKg(currentWeightKg) : '—'}
              </span>
              <span className="text-[10px] font-bold text-slate-500">kg</span>
              {connected ? (
                <span
                  className={`rounded px-1.5 py-0.5 text-[9px] font-black uppercase ${
                    isStable ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  {isStable ? '稳定' : '未稳定'}
                </span>
              ) : null}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <select
            value={config.protocol}
            onChange={e => onConfigChange({ protocol: e.target.value as SerialScaleProtocol })}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-600"
            title="串口协议"
          >
            <option value="auto">自动识别</option>
            <option value="comma_st">ST,GS 格式</option>
            <option value="plain_kg">纯数字+kg</option>
          </select>
          <select
            value={config.baudRate}
            onChange={e => onConfigChange({ baudRate: Number(e.target.value) })}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-600"
            title="波特率"
          >
            <option value={9600}>9600</option>
            <option value={4800}>4800</option>
            <option value={19200}>19200</option>
          </select>
          {connected ? (
            <button
              type="button"
              onClick={onDisconnect}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-bold text-slate-600 hover:bg-slate-100"
            >
              <Unplug className="h-3 w-3" /> 断开
            </button>
          ) : (
            <button
              type="button"
              onClick={onConnect}
              disabled={connecting}
              className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-[10px] font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              <Wifi className="h-3 w-3" /> {connecting ? '连接中…' : '连接电子秤'}
            </button>
          )}
        </div>
      </div>
      {errorMessage ? (
        <p className="mt-1.5 text-[10px] font-medium text-rose-600">{errorMessage}</p>
      ) : connected ? (
        <p className="mt-1.5 text-[10px] text-slate-500">扫码时将自动快照当前读数并与标准重量比对。</p>
      ) : (
        <p className="mt-1.5 text-[10px] text-slate-500">连接后，每次扫码会记录秤上读数用于重量校验。</p>
      )}
    </div>
  );
}
