import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BarChart3,
  Building2,
  CalendarClock,
  HardDrive,
  Loader2,
  QrCode,
  Search,
  Users,
  X,
} from 'lucide-react';
import { ModalPortal } from '../../components/ModalPortal';
import {
  adminTenants,
  type AdminTenantUsageDetail,
  type AdminTenantUsageResponse,
  type TenantHealth,
} from '../../services/api';
// services/api.ts 未再导出该类型；此处直接从来源模块引入（仅类型，不影响运行时）
import type { PlatformAuditLogRow } from '../../services/api/auth';
import { formatBytes } from '../../utils/formatBytes';

const HEALTH_LABEL: Record<TenantHealth, string> = {
  active: '活跃',
  low: '低活跃',
  silent: '沉默',
  expired: '已过期',
};

const HEALTH_CLASS: Record<TenantHealth, string> = {
  active: 'bg-emerald-50 text-emerald-700',
  low: 'bg-amber-50 text-amber-700',
  silent: 'bg-slate-100 text-slate-600',
  expired: 'bg-red-50 text-red-700',
};

const AUDIT_ACTION_LABEL: Record<string, string> = {
  'user.create': '创建用户',
  'user.update': '更新用户',
  'user.delete': '删除用户',
  'tenant.update': '更新企业',
};

function formatDate(iso: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function formatInt(n: number) {
  return n.toLocaleString('zh-CN');
}

type SortKey =
  | 'name'
  | 'reportCountRecent'
  | 'itemCodeCount'
  | 'knowledgeAssetBytes'
  | 'storageBytesTotal'
  | 'mau'
  | 'lastActivityAt'
  | 'memberCount';

function MetricBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-slate-500 font-medium">{label}</span>
        <span className="text-slate-800 font-bold tabular-nums">{formatInt(value)}</span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div className="h-full rounded-full bg-indigo-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function DayRangeButtons({ days, onChange }: { days: number; onChange: (d: number) => void }) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {[7, 30, 90].map((d) => (
        <button
          key={d}
          type="button"
          onClick={() => onChange(d)}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
            days === d ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
          }`}
        >
          近 {d} 天
        </button>
      ))}
    </div>
  );
}

export default function TenantUsageView() {
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState<AdminTenantUsageResponse | null>(null);
  const [auditLogs, setAuditLogs] = useState<PlatformAuditLogRow[]>([]);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('itemCodeCount');
  const [detailTenantId, setDetailTenantId] = useState<string | null>(null);
  const [detailDays, setDetailDays] = useState(30);
  const [detail, setDetail] = useState<AdminTenantUsageDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [usage, logs] = await Promise.all([adminTenants.usage(days), adminTenants.auditLogs(40)]);
      setData(usage);
      setAuditLogs(logs);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!detailTenantId) {
      setDetail(null);
      setDetailError('');
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    setDetailError('');
    void adminTenants
      .usageDetail(detailTenantId, detailDays)
      .then((row) => {
        if (!cancelled) setDetail(row);
      })
      .catch((e) => {
        if (!cancelled) setDetailError(e instanceof Error ? e.message : '加载详情失败');
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [detailTenantId, detailDays]);

  const openDetail = (tenantId: string) => {
    setDetailDays(days);
    setDetailTenantId(tenantId);
  };

  const closeDetail = () => {
    setDetailTenantId(null);
    setDetail(null);
    setDetailError('');
  };

  const rows = useMemo(() => {
    const list = data?.tenants ?? [];
    const q = search.trim().toLowerCase();
    const filtered = q ? list.filter((t) => t.name.toLowerCase().includes(q)) : list;
    const sorted = [...filtered].sort((a, b) => {
      if (sortKey === 'name') return a.name.localeCompare(b.name, 'zh-CN');
      if (sortKey === 'lastActivityAt') {
        const ta = a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : 0;
        const tb = b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : 0;
        return tb - ta;
      }
      return (b[sortKey] as number) - (a[sortKey] as number);
    });
    return sorted;
  }, [data, search, sortKey]);

  const overview = data?.overview;
  const detailMax = detail
    ? Math.max(
        detail.reportCount,
        detail.itemCodeCount,
        detail.opRecordCount,
        detail.psiRecordCount,
        detail.financeRecordCount,
        detail.planOrderCount,
        detail.productionOrderCount,
        detail.virtualBatchCount,
        detail.knowledgeDocUpdated,
        1,
      )
    : 1;

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{error}</div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <DayRangeButtons days={days} onChange={setDays} />
        <div className="relative w-full sm:w-72 shrink-0">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索企业名称…"
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-800 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      {loading && !data ? (
        <div className="flex items-center justify-center py-24 text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
      ) : overview ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { icon: Building2, label: '企业总数', value: formatInt(overview.tenantTotal), sub: `待审 ${overview.pendingCount} · 已过期 ${overview.expiredCount}` },
              { icon: Users, label: `平台 MAU / DAU`, value: `${formatInt(overview.platformMau)} / ${formatInt(overview.platformDau)}`, sub: `Web ${overview.loginClientWeb} · 小程序 ${overview.loginClientMiniprogram}` },
              { icon: QrCode, label: '单品码总量', value: formatInt(overview.itemCodeTotal), sub: `近 7 日 +${formatInt(overview.itemCodeRecent7d)}` },
              { icon: HardDrive, label: '存储合计', value: formatBytes(overview.storageBytesTotal), sub: `资料库 ${formatBytes(overview.knowledgeAssetBytesTotal)} · 产品图 ${formatBytes(overview.productImageBytesTotal)}` },
            ].map((c) => (
              <div key={c.label} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
                <div className="flex items-center gap-2 text-slate-500 text-xs font-bold mb-2">
                  <c.icon className="w-3.5 h-3.5" />
                  {c.label}
                </div>
                <div className="text-xl font-black text-slate-900 tabular-nums">{c.value}</div>
                <div className="text-[11px] text-slate-400 mt-1">{c.sub}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
              <div className="text-xs font-black text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <CalendarClock className="w-3.5 h-3.5" /> 7 天内到期
              </div>
              {overview.expiringSoon.length === 0 ? (
                <div className="text-sm text-slate-400">暂无</div>
              ) : (
                <ul className="space-y-2">
                  {overview.expiringSoon.map((t) => (
                    <li key={t.tenantId} className="flex justify-between text-sm gap-2">
                      <span className="font-medium text-slate-800 truncate">{t.name}</span>
                      <span className="text-amber-700 font-bold shrink-0">{t.daysLeft} 天</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <TopList title="单品码 Top" icon={QrCode} items={overview.topByItemCode} format={formatInt} />
            <TopList title="存储合计 Top" icon={HardDrive} items={overview.topByStorage} format={formatBytes} />
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {loading && (
              <div className="px-4 py-2 text-xs text-slate-400 flex items-center gap-2 border-b border-slate-100">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> 刷新中…
              </div>
            )}
            {rows.length === 0 ? (
              <div className="py-16 text-center text-slate-400 text-sm">暂无数据</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1180px] text-sm border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-left text-slate-600">
                      <SortTh label="企业" active={sortKey === 'name'} onClick={() => setSortKey('name')} />
                      <th className="px-3 py-3 text-xs font-black uppercase tracking-wide text-slate-500">健康度</th>
                      <SortTh label="MAU" active={sortKey === 'mau'} onClick={() => setSortKey('mau')} center />
                      <SortTh
                        label={`近${days}日报工`}
                        active={sortKey === 'reportCountRecent'}
                        onClick={() => setSortKey('reportCountRecent')}
                        center
                      />
                      <SortTh label="单品码" active={sortKey === 'itemCodeCount'} onClick={() => setSortKey('itemCodeCount')} center />
                      <SortTh
                        label="存储"
                        active={sortKey === 'storageBytesTotal'}
                        onClick={() => setSortKey('storageBytesTotal')}
                        center
                      />
                      <SortTh
                        label="最近活跃"
                        active={sortKey === 'lastActivityAt'}
                        onClick={() => setSortKey('lastActivityAt')}
                      />
                      <th className="px-3 py-3 text-xs font-black uppercase tracking-wide text-slate-500 text-center w-20">详情</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((t) => (
                      <tr key={t.tenantId} className="border-b border-slate-100 hover:bg-slate-50/80 transition-colors">
                        <td className="px-3 py-3 font-semibold text-slate-800">
                          <div>{t.name}</div>
                          <div className="text-[10px] text-slate-400 font-medium mt-0.5">
                            {[
                              t.modules.production && '生产',
                              t.modules.psi && '进销存',
                              t.modules.finance && '财务',
                              t.modules.knowledge && '资料库',
                              t.modules.development && '开发',
                            ]
                              .filter(Boolean)
                              .join(' · ') || '未使用核心模块'}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <span className={`inline-flex px-2 py-0.5 rounded-lg text-xs font-bold ${HEALTH_CLASS[t.health]}`}>
                            {HEALTH_LABEL[t.health]}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-center tabular-nums text-slate-600">
                          {t.mau}
                          <span className="text-[10px] text-slate-400 block">DAU {t.dau}</span>
                        </td>
                        <td className="px-3 py-3 text-center tabular-nums text-slate-600">
                          {formatInt(t.reportCountRecent)}
                          <span className="text-[10px] text-slate-400 block">总 {formatInt(t.reportCount)}</span>
                        </td>
                        <td className="px-3 py-3 text-center tabular-nums text-slate-600">
                          {formatInt(t.itemCodeCount)}
                          {t.itemCodeCountRecent > 0 && (
                            <span className="text-[10px] text-indigo-500 block">+{formatInt(t.itemCodeCountRecent)}</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-center tabular-nums text-slate-600">
                          {formatBytes(t.storageBytesTotal)}
                          <span className="text-[10px] text-slate-400 block">资料库 {formatBytes(t.knowledgeAssetBytes)}</span>
                        </td>
                        <td className="px-3 py-3 text-[13px] text-slate-500 whitespace-nowrap">{formatDate(t.lastActivityAt)}</td>
                        <td className="px-3 py-3 text-center">
                          <button
                            type="button"
                            onClick={() => openDetail(t.tenantId)}
                            className="p-1.5 rounded-lg text-indigo-600 hover:bg-indigo-50 transition-colors"
                            title="用量详情"
                          >
                            <BarChart3 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 text-xs font-black uppercase tracking-wide text-slate-500 flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5" /> 平台操作审计（最近）
            </div>
            {auditLogs.length === 0 ? (
              <div className="py-10 text-center text-slate-400 text-sm">暂无审计记录</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-left text-xs font-black uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-2">时间</th>
                      <th className="px-3 py-2">操作人</th>
                      <th className="px-3 py-2">动作</th>
                      <th className="px-3 py-2">目标</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.map((log) => (
                      <tr key={log.id} className="border-t border-slate-100">
                        <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{formatDate(log.createdAt)}</td>
                        <td className="px-3 py-2 text-slate-700">
                          {log.actorDisplayName || log.actorUsername || log.actorUserId.slice(0, 8)}
                        </td>
                        <td className="px-3 py-2 font-medium text-slate-800">
                          {AUDIT_ACTION_LABEL[log.action] || log.action}
                        </td>
                        <td className="px-3 py-2 text-slate-500 font-mono text-xs">
                          {log.targetType}:{log.targetId.slice(0, 12)}…
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : null}

      {detailTenantId && (
        <ModalPortal>
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" aria-hidden />
          <div className="relative z-10 bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg max-h-[min(92vh,960px)] overflow-y-auto">
            <div className="p-5 border-b border-slate-100 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-lg font-black text-slate-900">{detail?.name ?? '加载中…'}</h2>
                {detail && (
                  <p className="text-xs text-slate-500 mt-1">
                    健康度 {HEALTH_LABEL[detail.health]} · MAU {detail.mau} / DAU {detail.dau} · 最近活跃{' '}
                    {formatDate(detail.lastActivityAt)}
                  </p>
                )}
                <div className="mt-3">
                  <DayRangeButtons days={detailDays} onChange={setDetailDays} />
                </div>
                {detailLoading && (
                  <p className="mt-2 text-[11px] text-slate-400 flex items-center gap-1.5">
                    <Loader2 className="w-3 h-3 animate-spin" /> 正在按近 {detailDays} 天刷新…
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={closeDetail}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-5">
              {detailError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">{detailError}</div>
              )}
              {!detail && detailLoading ? (
                <div className="flex justify-center py-12 text-slate-400">
                  <Loader2 className="w-7 h-7 animate-spin" />
                </div>
              ) : detail ? (
                <>
                  <section className="rounded-xl bg-slate-50 border border-slate-100 p-3 text-sm space-y-1">
                    <div className="flex justify-between">
                      <span className="text-slate-500">登录客户端（近 {detailDays} 天活跃成员）</span>
                      <span className="font-bold tabular-nums">
                        Web {detail.loginClientWeb} · 小程序 {detail.loginClientMiniprogram}
                        {detail.loginClientUnknown > 0 ? ` · 未知 ${detail.loginClientUnknown}` : ''}
                      </span>
                    </div>
                  </section>
                  <section className="space-y-2.5">
                    <h3 className="text-xs font-black uppercase tracking-wide text-slate-500">
                      业务用量（近 {detailDays} 天）
                    </h3>
                    <MetricBar label="计划单" value={detail.planOrderCount} max={detailMax} />
                    <MetricBar label="工单" value={detail.productionOrderCount} max={detailMax} />
                    <MetricBar label="报工" value={detail.reportCount} max={detailMax} />
                    <MetricBar label="进销存单据" value={detail.psiRecordCount} max={detailMax} />
                    <MetricBar label="财务单据" value={detail.financeRecordCount} max={detailMax} />
                    <MetricBar label="新建产品" value={detail.productCount} max={detailMax} />
                    <MetricBar label="新建合作方" value={detail.partnerCount} max={detailMax} />
                    <MetricBar label="新建开发款" value={detail.devStyleCount} max={detailMax} />
                  </section>
                  <section className="space-y-2.5">
                    <h3 className="text-xs font-black uppercase tracking-wide text-slate-500">
                      系统负担（近 {detailDays} 天新增）
                    </h3>
                    <MetricBar label="单品码" value={detail.itemCodeCount} max={detailMax} />
                    <MetricBar label="虚拟批次" value={detail.virtualBatchCount} max={detailMax} />
                    <MetricBar label="生产操作流水" value={detail.opRecordCount} max={detailMax} />
                    <MetricBar label="资料库更新文档" value={detail.knowledgeDocUpdated} max={detailMax} />
                    <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 text-sm space-y-1">
                      <div className="text-[11px] text-slate-400 font-medium mb-1">存储占用（当前快照，不受时间窗影响）</div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">资料库文档 / 资产</span>
                        <span className="font-bold tabular-nums">
                          {detail.knowledgeDocumentCount} / {detail.knowledgeAssetCount}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">资料库字节 / 正文</span>
                        <span className="font-bold tabular-nums">
                          {formatBytes(detail.knowledgeAssetBytes)} / {formatBytes(detail.knowledgeContentBytes)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">产品图</span>
                        <span className="font-bold tabular-nums">
                          {detail.productWithImageCount} · {formatBytes(detail.productImageBytes)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">开发附件</span>
                        <span className="font-bold tabular-nums">
                          {detail.devAttachmentCount} · {formatBytes(detail.devAttachmentBytes)}
                        </span>
                      </div>
                      <div className="flex justify-between border-t border-slate-200 pt-1 mt-1">
                        <span className="text-slate-600 font-medium">存储合计</span>
                        <span className="font-black tabular-nums">{formatBytes(detail.storageBytesTotal)}</span>
                      </div>
                    </div>
                  </section>
                </>
              ) : null}
            </div>
          </div>
        </div>
        </ModalPortal>
      )}
    </div>
  );
}

function SortTh({
  label,
  active,
  onClick,
  center,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  center?: boolean;
}) {
  return (
    <th className={`px-3 py-3 text-xs font-black uppercase tracking-wide ${center ? 'text-center' : 'text-left'}`}>
      <button
        type="button"
        onClick={onClick}
        className={`transition-colors ${active ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
      >
        {label}
      </button>
    </th>
  );
}

function TopList({
  title,
  icon: Icon,
  items,
  format,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  items: Array<{ tenantId: string; name: string; value: number }>;
  format: (n: number) => string;
}) {
  const shown = items.filter((i) => i.value > 0).slice(0, 5);
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
      <div className="text-xs font-black text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
        <Icon className="w-3.5 h-3.5" /> {title}
      </div>
      {shown.length === 0 ? (
        <div className="text-sm text-slate-400">暂无</div>
      ) : (
        <ul className="space-y-2">
          {shown.map((t, idx) => (
            <li key={t.tenantId} className="flex justify-between text-sm gap-2">
              <span className="text-slate-800 truncate">
                <span className="text-slate-400 mr-1.5">{idx + 1}.</span>
                {t.name}
              </span>
              <span className="font-bold tabular-nums shrink-0">{format(t.value)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
