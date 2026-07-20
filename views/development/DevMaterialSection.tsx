import React, { useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, History, Package } from 'lucide-react';
import type {
  DevMaterialRecordsResponse,
  Product,
  ProductCategory,
  Warehouse,
} from '../../types';
import {
  outlineToolbarButtonClass,
  primaryToolbarButtonClass,
  sectionTitleClass,
} from '../../styles/uiDensity';
import DevMaterialOperationModal from './DevMaterialOperationModal';
import DevMaterialHistoryModal from './DevMaterialHistoryModal';

export interface DevMaterialPerms {
  canViewRecords: boolean;
  canIssue: boolean;
  canReturn: boolean;
}

interface DevMaterialSectionProps {
  styleId: string;
  styleCode: string;
  styleName: string;
  data: DevMaterialRecordsResponse | undefined;
  loading?: boolean;
  products: Product[];
  categories: ProductCategory[];
  warehouses: Warehouse[];
  perms: DevMaterialPerms;
  /** 款式是否允许领料（developing）；归档/发布仅退料 */
  styleAllowsIssue: boolean;
  onRefresh: () => Promise<void> | void;
  /** 嵌入弹窗时去掉外层卡片与大标题 */
  embedded?: boolean;
}

const thClass =
  'px-4 py-2.5 text-[10px] font-black text-slate-400 uppercase tracking-wider whitespace-nowrap align-middle';
const tdNumClass =
  'px-4 py-2.5 text-right text-xs font-semibold tabular-nums align-middle whitespace-nowrap';

function formatQty(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const rounded = Math.round(n * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

const DevMaterialSection: React.FC<DevMaterialSectionProps> = ({
  styleId,
  styleCode,
  styleName,
  data,
  loading,
  products,
  categories,
  warehouses,
  perms,
  styleAllowsIssue,
  onRefresh,
  embedded = false,
}) => {
  const [opMode, setOpMode] = useState<'issue' | 'return' | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const productMap = new Map(products.map((p) => [p.id, p]));
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  const summary = data?.summary ?? [];
  const bomIds = data?.bomProductIds ?? [];
  const showSection = perms.canViewRecords || perms.canIssue || perms.canReturn;
  if (!showSection) return null;

  const canOpenIssue = perms.canIssue && styleAllowsIssue && (data?.canIssue ?? styleAllowsIssue) && bomIds.length > 0;
  const canOpenReturn = perms.canReturn && (data?.canReturn ?? false);

  const actions = (
    <div className="flex flex-wrap items-center gap-2">
      {perms.canIssue && (
        <button
          type="button"
          disabled={!canOpenIssue}
          title={
            !styleAllowsIssue
              ? '归档/已发布款式不可继续领料'
              : bomIds.length === 0
                ? '请先配置试制 BOM'
                : undefined
          }
          onClick={() => setOpMode('issue')}
          className={`${primaryToolbarButtonClass} disabled:cursor-not-allowed disabled:opacity-40`}
        >
          <ArrowUpFromLine className="h-3.5 w-3.5" />
          开发领料
        </button>
      )}
      {perms.canReturn && (
        <button
          type="button"
          disabled={!canOpenReturn}
          onClick={() => setOpMode('return')}
          className={`${outlineToolbarButtonClass} disabled:cursor-not-allowed disabled:opacity-40`}
        >
          <ArrowDownToLine className="h-3.5 w-3.5" />
          开发退料
        </button>
      )}
      {perms.canViewRecords && (
        <button
          type="button"
          onClick={() => setHistoryOpen(true)}
          className={outlineToolbarButtonClass}
        >
          <History className="h-3.5 w-3.5" />
          流水
        </button>
      )}
    </div>
  );

  const body = (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {embedded ? (
          <>
            <p className="text-xs font-medium text-slate-400">本厂领料 / 退料，关联当前款式试制 BOM</p>
            {actions}
          </>
        ) : (
          <>
            <div>
              <h3 className={`${sectionTitleClass} flex items-center gap-2`}>
                <Package className="h-4 w-4 text-indigo-500" />
                开发物料
              </h3>
              <p className="mt-1 text-xs font-medium text-slate-400">本厂领料 / 退料，关联当前款式试制 BOM</p>
            </div>
            {actions}
          </>
        )}
      </div>

      {loading && !data ? (
        <p className="py-6 text-center text-xs font-medium text-slate-400">加载中…</p>
      ) : summary.length === 0 ? (
        <p className="py-6 text-center text-xs font-medium text-slate-400">
          {bomIds.length === 0 ? '暂无试制 BOM 物料，配置后可领料' : '暂无领退料记录'}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-100">
          <table className="w-full min-w-[520px] table-fixed border-collapse text-left">
            <colgroup>
              <col className="w-[46%]" />
              <col className="w-[18%]" />
              <col className="w-[18%]" />
              <col className="w-[18%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/80">
                <th className={`${thClass} text-left`}>物料</th>
                <th className={`${thClass} text-right`}>累计领料</th>
                <th className={`${thClass} text-right`}>累计退料</th>
                <th className={`${thClass} text-right`}>净领用</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {summary.map((row) => (
                <tr key={row.productId} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-2.5 align-middle min-w-0">
                    <p className="truncate text-xs font-semibold text-slate-800" title={row.productName}>
                      {row.productName}
                    </p>
                    {row.productSku ? (
                      <p className="mt-0.5 truncate text-[10px] font-medium text-slate-400" title={row.productSku}>
                        {row.productSku}
                      </p>
                    ) : null}
                  </td>
                  <td className={`${tdNumClass} text-slate-700`}>{formatQty(row.issuedQty)}</td>
                  <td className={`${tdNumClass} text-slate-700`}>{formatQty(row.returnedQty)}</td>
                  <td className={`${tdNumClass} text-indigo-600`}>{formatQty(row.netQty)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {opMode && data && (
        <DevMaterialOperationModal
          mode={opMode}
          styleId={styleId}
          styleCode={styleCode}
          styleName={styleName}
          data={data}
          productMap={productMap}
          categoryById={categoryById}
          warehouses={warehouses}
          onClose={() => setOpMode(null)}
          onSaved={async () => {
            await onRefresh();
            setOpMode(null);
          }}
        />
      )}

      {historyOpen && data && (
        <DevMaterialHistoryModal
          styleCode={styleCode}
          styleName={styleName}
          docs={data.docs}
          warehouses={warehouses}
          onClose={() => setHistoryOpen(false)}
        />
      )}
    </>
  );

  if (embedded) {
    return <div>{body}</div>;
  }

  return (
    <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
      {body}
    </section>
  );
};

export default DevMaterialSection;
