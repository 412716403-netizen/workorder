import React, { useState, useEffect, useRef } from 'react';
import { Check, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import * as api from '../../services/api';
import { normalizeAcceptSpecList } from './collabHelpers';

interface CollabAcceptModalProps {
  open: boolean;
  onClose: () => void;
  transfer: any;
  onAccepted: () => Promise<void>;
}

const CollabAcceptModal: React.FC<CollabAcceptModalProps> = ({ open, onClose, transfer, onAccepted }) => {
  const navigate = useNavigate();
  const [acceptNewName, setAcceptNewName] = useState('');
  const [acceptNewSku, setAcceptNewSku] = useState('');
  const [acceptNewDesc, setAcceptNewDesc] = useState('');
  const [acceptNewColors, setAcceptNewColors] = useState<string[]>([]);
  const [acceptNewSizes, setAcceptNewSizes] = useState<string[]>([]);
  const [acceptDispatchIds, setAcceptDispatchIds] = useState<Set<string>>(new Set());
  const [accepting, setAccepting] = useState(false);

  const prevOpenRef = useRef(false);
  useEffect(() => {
    if (open && !prevOpenRef.current && transfer) {
      setAcceptNewName(transfer.senderProductName || '');
      setAcceptNewSku(transfer.senderProductSku || '');
      const pendingDispatches = (transfer.dispatches || []).filter((d: any) => d.status === 'PENDING');
      const firstPayload = pendingDispatches[0]?.payload;
      setAcceptNewDesc(firstPayload?.description || '');
      let colors = normalizeAcceptSpecList(firstPayload?.colorNames);
      let sizes = normalizeAcceptSpecList(firstPayload?.sizeNames);
      if (!colors.length || !sizes.length) {
        const allItems = pendingDispatches.flatMap((d: any) => d.payload?.items ?? []);
        if (!colors.length) colors = [...new Set(allItems.map((i: any) => i.colorName).filter(Boolean))] as string[];
        if (!sizes.length) sizes = [...new Set(allItems.map((i: any) => i.sizeName).filter(Boolean))] as string[];
      }
      setAcceptNewColors(colors);
      setAcceptNewSizes(sizes);
      setAcceptDispatchIds(new Set(pendingDispatches.map((d: any) => d.id)));
    }
    prevOpenRef.current = open;
  }, [open, transfer]);

  if (!open || !transfer) return null;

  const t = transfer;

  const submitAccept = async () => {
    if (!acceptNewName.trim()) { toast.warning('请填写产品名称'); return; }
    if (!acceptNewSku.trim()) { toast.warning('请填写产品编号'); return; }
    const pendingSelected = (t.dispatches || []).filter(
      (d: any) => d.status === 'PENDING' && acceptDispatchIds.has(d.id),
    );
    if (pendingSelected.length === 0) {
      toast.warning('没有待接受的发出批次');
      return;
    }
    const byTransfer = new Map<string, string[]>();
    for (const d of pendingSelected) {
      const tid = (d as any).transferId || t.id;
      const list = byTransfer.get(tid) ?? [];
      list.push(d.id);
      byTransfer.set(tid, list);
    }
    const orderedTids = [...byTransfer.keys()].sort();
    const specColors = normalizeAcceptSpecList(acceptNewColors);
    const specSizes = normalizeAcceptSpecList(acceptNewSizes);
    const createProductBody = {
      name: acceptNewName,
      sku: acceptNewSku,
      description: acceptNewDesc || undefined,
      colorNames: specColors.length ? specColors : undefined,
      sizeNames: specSizes.length ? specSizes : undefined,
    };
    setAccepting(true);
    try {
      let acceptedSum = 0;
      const createdOrders: string[] = [];
      let receiverProductId: string | null = null;
      let pendingProcess = false;
      for (const tid of orderedTids) {
        const ids = byTransfer.get(tid)!;
        const body: any = { dispatchIds: ids, createProduct: createProductBody };
        const res = await api.collaboration.acceptTransfer(tid, body);
        acceptedSum += res.accepted ?? 0;
        if (Array.isArray(res.createdOrders)) createdOrders.push(...res.createdOrders);
        if (res.receiverProductId) receiverProductId = res.receiverProductId;
        if (res.pendingProcess) pendingProcess = true;
      }
      const msg = pendingProcess
        ? `已接受 ${acceptedSum} 条，生成 ${createdOrders.length} 张工单（待配工序）`
        : `已接受 ${acceptedSum} 条，生成 ${createdOrders.length} 张工单`;
      toast.success(msg, {
        duration: 8000,
        action: receiverProductId && pendingProcess
          ? {
              label: '去配置工序 →',
              onClick: () => navigate('/basic', { state: { editProductId: receiverProductId } }),
            }
          : undefined,
      });
      onClose();
      await onAccepted();
    } catch (err: any) {
      toast.error(err.message || '接受失败');
    } finally {
      setAccepting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50" onClick={onClose} aria-hidden />
      <div className="relative bg-white w-full max-w-lg rounded-2xl shadow-xl border border-slate-200 p-4 space-y-4 max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-black text-slate-900 flex items-center gap-2"><Check className="w-5 h-5 text-indigo-600" /> 接受协作单</h3>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"><X className="w-5 h-5" /></button>
        </div>

        <div className="bg-slate-50 rounded-xl p-4 space-y-2">
          <p className="text-[10px] font-black text-slate-400 uppercase">甲方产品信息</p>
          <p className="text-sm font-bold text-slate-800">{t.senderProductName} ({t.senderProductSku})</p>
          {(t.dispatches || []).filter((d: any) => d.status === 'PENDING').slice(0, 1).map((d: any) => (
            <div key={d.id} className="text-xs text-slate-600 space-y-0.5">
              {d.payload?.description && <p>{d.payload.description}</p>}
              {(d.payload?.items || []).map((item: any, i: number) => (
                <p key={i}>{[item.colorName, item.sizeName].filter(Boolean).join('/') || '无规格'}: {item.quantity}</p>
              ))}
            </div>
          ))}
        </div>

        <div className="space-y-3">
          <p className="text-[10px] font-black text-slate-400 uppercase">乙方新建产品（已从甲方信息预填）</p>
          <div className="space-y-2">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase block ml-1">产品名称 *</label>
              <input
                type="text"
                value={acceptNewName}
                onChange={e => setAcceptNewName(e.target.value)}
                placeholder="产品名称"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-4 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase block ml-1">产品编号/SKU *</label>
              <input
                type="text"
                value={acceptNewSku}
                onChange={e => setAcceptNewSku(e.target.value)}
                placeholder="产品编号/SKU"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-4 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase block ml-1">描述</label>
              <input
                type="text"
                value={acceptNewDesc}
                onChange={e => setAcceptNewDesc(e.target.value)}
                placeholder="选填"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-4 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            {acceptNewColors.length > 0 && (
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase block ml-1">颜色（来自甲方）</label>
                <div className="flex flex-wrap gap-1.5">
                  {acceptNewColors.map((c, i) => (
                    <span key={i} className="px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-bold">{c}</span>
                  ))}
                </div>
              </div>
            )}
            {acceptNewSizes.length > 0 && (
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase block ml-1">尺码（来自甲方）</label>
                <div className="flex flex-wrap gap-1.5">
                  {acceptNewSizes.map((s, i) => (
                    <span key={i} className="px-2.5 py-1 bg-amber-50 text-amber-700 rounded-lg text-xs font-bold">{s}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">取消</button>
          <button
            disabled={accepting || !acceptNewName.trim() || !acceptNewSku.trim() || acceptDispatchIds.size === 0}
            onClick={submitAccept}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {accepting ? '处理中...' : '确认接受'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default React.memo(CollabAcceptModal);
