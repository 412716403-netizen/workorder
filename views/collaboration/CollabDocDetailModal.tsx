import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Package, Truck, X, Check, RotateCcw, Trash2, RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { useConfirm } from '../../contexts/ConfirmContext';
import * as api from '../../services/api';
import type { Partner, Product, ProductionOpRecord, AppDictionaries, Warehouse, ProductCategory } from '../../types';
import { categoryUsesBatchManagement, COLLAB_DISPATCH_AMENDMENT_PENDING_B_REVIEW, normalizeCollabSpecLabel, type CollabAcceptCategoryDecision } from '../../types';
import { initCollabAcceptCategoryFromPayload, collabAcceptCategoryDisabledForIncomingMatrix } from '../../utils/collabAcceptDecision';
import {
  dispatchStatusLabel, normalizeAcceptSpecList, returnStatusLabel, resolvePreferredCollabMatrixOrder,
} from './collabHelpers';
import QtyMatrixTable from '../../components/variant-matrix/QtyMatrixTable';
import {
  collabPayloadItemsToQtyMatrixProps,
  CollabDocQtyPriceFooter,
  firstFiniteCollabUnitPrice,
  type CollabPayloadItem,
} from './collabDocDisplay';

type DocKind = 'dispatch' | 'return';

interface CollabDocDetailModalProps {
  open: boolean;
  onClose: () => void;
  docKind: DocKind;
  doc: any;
  transfer: any;
  warehouses: Warehouse[];
  products: Product[];
  partners: Partner[];
  prodRecords: ProductionOpRecord[];
  dictionaries: AppDictionaries;
  /** 乙方接受派发时选择本地产品分类（默认按甲方 payload.categoryName 匹配） */
  categories?: ProductCategory[];
  onRefreshList: () => void;
  onRefreshOrders?: () => Promise<void>;
  onRefreshProdRecords?: () => Promise<void>;
  onRefreshPMP?: () => Promise<void>;
  onRefreshProducts?: () => Promise<void>;
  /** 保留 prop 签名以兼容调用方，内部已不再使用（接受/回传/转发入口迁移至右侧栏批量弹窗） */
  onOpenCollabSettings?: () => void;
}

function sumItemsQty(items: any[] | undefined): number {
  if (!Array.isArray(items)) return 0;
  let total = 0;
  for (const it of items) total += Number(it?.quantity) || 0;
  return total;
}

function formatDocNo(doc: any, kind: DocKind): string {
  const p = doc?.payload;
  if (!p) return '';
  if (kind === 'return' && typeof p.stockOutDocNo === 'string' && p.stockOutDocNo) return p.stockOutDocNo;
  const senderRef = p.senderRef;
  if (senderRef && Array.isArray(senderRef.docNos) && senderRef.docNos.length > 0) {
    return senderRef.docNos.join('、');
  }
  return '';
}

const CollabDocDetailModal: React.FC<CollabDocDetailModalProps> = ({
  open, onClose, docKind, doc: initialDoc, transfer: initialTransfer,
  products,
  dictionaries,
  categories: categoriesProp,
  onRefreshList, onRefreshOrders, onRefreshProdRecords, onRefreshPMP, onRefreshProducts,
}) => {
  const categories = categoriesProp ?? [];
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [transfer, setTransfer] = useState<any>(initialTransfer);
  const [doc, setDoc] = useState<any>(initialDoc);
  const [refreshing, setRefreshing] = useState(false);

  const [busy, setBusy] = useState(false);

  /** 乙方接受派发：与批量接受弹窗同一接口，仅针对当前这一条派发 */
  const [acceptName, setAcceptName] = useState('');
  const [acceptSku, setAcceptSku] = useState('');
  const [acceptDesc, setAcceptDesc] = useState('');
  const [acceptColors, setAcceptColors] = useState<string[]>([]);
  const [acceptSizes, setAcceptSizes] = useState<string[]>([]);
  const [acceptCategoryDecision, setAcceptCategoryDecision] = useState<CollabAcceptCategoryDecision>('existing');
  const [acceptCategoryId, setAcceptCategoryId] = useState('');
  const [acceptCategoryNameToCreate, setAcceptCategoryNameToCreate] = useState('');
  /** 打开待接受派发时拉取 getTransfer，以使用后端 _acceptDispatchMode（CREATE / UPDATE_ACK / READY） */
  const [acceptUiLoading, setAcceptUiLoading] = useState(false);

  // 弹窗打开时以入参为准
  const openRef = useRef(false);
  useEffect(() => {
    if (open && !openRef.current) {
      setTransfer(initialTransfer);
      setDoc(initialDoc);
    }
    openRef.current = open;
  }, [open, initialDoc, initialTransfer]);

  const refreshSelf = useCallback(async () => {
    if (!transfer?.id || !doc?.id) return;
    setRefreshing(true);
    try {
      const detail = await api.collaboration.getTransfer(transfer.id);
      setTransfer(detail);
      const pool: any[] = docKind === 'dispatch' ? (detail.dispatches || []) : (detail.returns || []);
      const next = pool.find((x: any) => x.id === doc.id);
      if (next) {
        setDoc(next);
      } else {
        onClose();
      }
    } catch (err: any) {
      toast.error(err?.message || '刷新失败');
    } finally {
      setRefreshing(false);
    }
  }, [transfer?.id, doc?.id, docKind, onClose]);

  const afterMutation = useCallback(async (opts?: { closeAfter?: boolean; refreshProducts?: boolean; refreshOrders?: boolean; refreshProd?: boolean; refreshPMP?: boolean }) => {
    onRefreshList();
    if (opts?.refreshProducts) onRefreshProducts?.();
    if (opts?.refreshOrders) onRefreshOrders?.();
    if (opts?.refreshProd) onRefreshProdRecords?.();
    if (opts?.refreshPMP) onRefreshPMP?.();
    if (opts?.closeAfter) {
      onClose();
    } else {
      await refreshSelf();
    }
  }, [onRefreshList, onRefreshProducts, onRefreshOrders, onRefreshProdRecords, onRefreshPMP, refreshSelf, onClose]);

  // ── Dispatch 动作 ──
  const handleWithdrawDispatch = async () => {
    const ok = await confirm({ message: '确认撤回该发出批次？撤回后对方将无法看到此批次。' });
    if (!ok) return;
    setBusy(true);
    try {
      await api.collaboration.withdrawDispatch(doc.id);
      toast.success('已撤回发出');
      await afterMutation({ refreshProd: true });
    } catch (err: any) {
      toast.error(err?.message || '撤回失败');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteDispatch = async () => {
    const ok = await confirm({ message: '确认删除该发出记录？删除后不可恢复。', danger: true });
    if (!ok) return;
    setBusy(true);
    try {
      await api.collaboration.deleteDispatch(doc.id);
      toast.success('已删除');
      await afterMutation({ closeAfter: true });
    } catch (err: any) {
      toast.error(err?.message || '删除失败');
    } finally {
      setBusy(false);
    }
  };

  const handleWithdrawForward = async () => {
    const ok = await confirm({ message: '确认撤回该转发？撤回后将恢复到转发前的状态，出库记录将被还原。' });
    if (!ok) return;
    setBusy(true);
    try {
      await api.collaboration.withdrawForward(transfer.childTransferId);
      toast.success('已撤回转发');
      await afterMutation({ refreshProd: true });
    } catch (err: any) {
      toast.error(err?.message || '撤回失败');
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmDispatchAmendment = async () => {
    const ok = await confirm({ message: '确认接受甲方的发出修订？修订后将更新对应工单明细。' });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await api.collaboration.confirmDispatchAmendment(doc.id);
      toast.success(res.quantityWarning ? `已确认修订（注意：${res.quantityWarning}）` : '已确认发出修订');
      await afterMutation({ refreshOrders: true });
    } catch (err: any) {
      toast.error(err?.message || '确认失败');
    } finally {
      setBusy(false);
    }
  };

  const handleRejectDispatchAmendment = async () => {
    const ok = await confirm({ message: '拒绝甲方的发出修订？拒绝后将保持原有数据不变。' });
    if (!ok) return;
    setBusy(true);
    try {
      await api.collaboration.rejectDispatchAmendment(doc.id);
      toast.success('已拒绝修订');
      await afterMutation();
    } catch (err: any) {
      toast.error(err?.message || '操作失败');
    } finally {
      setBusy(false);
    }
  };

  const handleAckDispatchPayloadRefresh = async () => {
    setBusy(true);
    try {
      await api.collaboration.ackDispatchPayloadRefresh(doc.id);
      toast.success('已标记为已查看最新明细');
      await afterMutation();
    } catch (err: any) {
      toast.error(err?.message || '操作失败');
    } finally {
      setBusy(false);
    }
  };

  // ── Return 动作 ──
  const handleWithdrawReturn = async () => {
    const ok = await confirm({
      message: '确认撤回该回传？若与同一张出库单号合并提交的多产品回传，将一并撤回并还原对应出库记录。',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = (await api.collaboration.withdrawReturn(doc.id)) as { withdrawnCount?: number };
      const n = res?.withdrawnCount ?? 1;
      toast.success(n > 1 ? `已撤回 ${n} 条关联回传（同一出库单号）` : '已撤回回传');
      await afterMutation({ refreshProd: true });
    } catch (err: any) {
      toast.error(err?.message || '撤回失败');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteReturn = async () => {
    const ok = await confirm({ message: '确认删除该回传记录？删除后不可恢复。', danger: true });
    if (!ok) return;
    setBusy(true);
    try {
      await api.collaboration.deleteReturn(doc.id);
      toast.success('已删除');
      await afterMutation({ closeAfter: true });
    } catch (err: any) {
      toast.error(err?.message || '删除失败');
    } finally {
      setBusy(false);
    }
  };

  /** 甲方：待收回 → 确认收货（与收件箱批量确认收回同一接口） */
  const handleReceiveReturn = async () => {
    const ok = await confirm({
      message: '确认收货该回传？将按明细生成外协「已收回」记录，并更新相关工单与工序进度。',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = (await api.collaboration.receiveReturn(doc.id)) as { receiptDocNo?: string };
      toast.success(res?.receiptDocNo ? `已确认收货，回收单号：${res.receiptDocNo}` : '已确认收货');
      await afterMutation({ refreshProd: true, refreshOrders: true, refreshPMP: true });
    } catch (err: any) {
      toast.error(err?.message || '确认收回失败');
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmReturnAmendment = async () => {
    const ok = await confirm({ message: '确认接受乙方的回传修订？确认后将重建外协收回记录和生产进度。' });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await api.collaboration.confirmReturnAmendment(doc.id);
      toast.success(res.receiptDocNo ? `已确认回传修订，新单号: ${res.receiptDocNo}` : '已确认回传修订');
      await afterMutation({ refreshProd: true, refreshOrders: true, refreshPMP: true });
    } catch (err: any) {
      toast.error(err?.message || '确认失败');
    } finally {
      setBusy(false);
    }
  };

  const handleRejectReturnAmendment = async () => {
    const ok = await confirm({ message: '拒绝乙方的回传修订？拒绝后将保持原有数据不变。' });
    if (!ok) return;
    setBusy(true);
    try {
      await api.collaboration.rejectReturnAmendment(doc.id);
      toast.success('已拒绝修订');
      await afterMutation();
    } catch (err: any) {
      toast.error(err?.message || '操作失败');
    } finally {
      setBusy(false);
    }
  };

  const items: any[] = doc?.payload?.items ?? [];
  const totalQty = sumItemsQty(items);
  const receiverProduct = useMemo(
    () => products.find(p => p.id === transfer?.receiverProductId),
    [products, transfer?.receiverProductId],
  );
  const specMatrix = useMemo(() => {
    const rowItems = (doc?.payload?.items ?? []) as CollabPayloadItem[];
    const ord = resolvePreferredCollabMatrixOrder({
      payload: doc?.payload,
      product: receiverProduct ?? null,
      dictionaries,
    });
    return collabPayloadItemsToQtyMatrixProps(rowItems, { ...ord });
  }, [doc?.payload, receiverProduct, dictionaries]);
  const amendmentMatrix = useMemo(() => {
    const ord = resolvePreferredCollabMatrixOrder({
      payload: doc?.amendmentPayload,
      product: receiverProduct ?? null,
      dictionaries,
    });
    return collabPayloadItemsToQtyMatrixProps((doc?.amendmentPayload?.items ?? []) as CollabPayloadItem[], {
      ...ord,
    });
  }, [doc?.amendmentPayload, receiverProduct, dictionaries]);

  const returnSpecQtyPrice = useMemo(() => {
    if (docKind !== 'return' || specMatrix.rows.length === 0) return null;
    const payloadItems = (doc?.payload?.items ?? []) as CollabPayloadItem[];
    const tq = sumItemsQty(payloadItems as any[]);
    const up = firstFiniteCollabUnitPrice(payloadItems);
    const amt = up != null ? tq * up : null;
    return { lineQty: tq, up, amt };
  }, [docKind, specMatrix.rows.length, doc?.payload?.items]);

  const returnAmendQtyPrice = useMemo(() => {
    if (docKind !== 'return' || doc?.amendmentStatus !== 'PENDING_A_CONFIRM' || amendmentMatrix.rows.length === 0) {
      return null;
    }
    const aitems = (doc?.amendmentPayload?.items ?? []) as CollabPayloadItem[];
    const aq = sumItemsQty(aitems as any[]);
    const up = firstFiniteCollabUnitPrice(aitems);
    const amt = up != null ? aq * up : null;
    return { lineQty: aq, up, amt };
  }, [docKind, doc?.amendmentStatus, doc?.amendmentPayload, amendmentMatrix.rows.length]);

  useEffect(() => {
    if (!open || docKind !== 'dispatch' || !transfer?.id || !doc?.id) {
      setAcceptUiLoading(false);
      return;
    }
    if (transfer.senderTenantName === '本企业') {
      setAcceptUiLoading(false);
      return;
    }
    if (doc.status !== 'PENDING') {
      setAcceptUiLoading(false);
      return;
    }
    const m = transfer._acceptDispatchMode as string | undefined;
    if (m === 'CREATE' || m === 'UPDATE_ACK' || m === 'READY') {
      setAcceptUiLoading(false);
      return;
    }
    let cancelled = false;
    setAcceptUiLoading(true);
    (async () => {
      try {
        const detail = await api.collaboration.getTransfer(transfer.id);
        if (cancelled) return;
        setTransfer(detail);
        const nd = (detail.dispatches || []).find((x: any) => x.id === doc.id);
        if (nd) setDoc(nd);
      } catch {
        if (!cancelled) {
          setTransfer((prev: any) => ({ ...prev, _acceptDispatchMode: 'CREATE', _acceptResolvedReceiverProductId: null }));
        }
      } finally {
        if (!cancelled) setAcceptUiLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, docKind, doc?.id, doc?.status, transfer?.id, transfer?.senderTenantName, transfer?._acceptDispatchMode]);

  /** 派发详情打开时，预填乙方接受产品字段（与批量接受弹窗一致）；按派发 id 去重，避免刷新 doc 引用时冲掉用户正在编辑的内容 */
  const acceptInitKeyRef = useRef('');
  useEffect(() => {
    if (!open) {
      acceptInitKeyRef.current = '';
      return;
    }
    if (docKind !== 'dispatch' || !doc || !transfer) return;
    if (transfer.senderTenantName === '本企业') return;
    if (doc.status !== 'PENDING') return;
    if (transfer._acceptDispatchMode !== 'CREATE') return;
    const key = `${doc.id}|${transfer.id}`;
    if (acceptInitKeyRef.current === key) return;
    acceptInitKeyRef.current = key;
    const payload = doc.payload || {};
    let colors = normalizeAcceptSpecList(payload.colorNames);
    let sizes = normalizeAcceptSpecList(payload.sizeNames);
    const itemList: any[] = payload.items ?? [];
    if (!colors.length) colors = [...new Set(itemList.map(i => i.colorName).filter(Boolean))] as string[];
    if (!sizes.length) sizes = [...new Set(itemList.map(i => i.sizeName).filter(Boolean))] as string[];
    setAcceptName(transfer.senderProductName || '');
    setAcceptSku(transfer.senderProductSku || '');
    setAcceptDesc(typeof payload.description === 'string' ? payload.description : '');
    setAcceptColors(colors);
    setAcceptSizes(sizes);
    const hasIncomingMatrixSpec = colors.length > 0 || sizes.length > 0;
    const catInit = initCollabAcceptCategoryFromPayload(
      typeof payload.categoryName === 'string' ? payload.categoryName : undefined,
      categories,
      { hasIncomingMatrixSpec },
    );
    setAcceptCategoryDecision(catInit.categoryDecision);
    setAcceptCategoryId(catInit.categoryId);
    setAcceptCategoryNameToCreate(catInit.categoryNameToCreate);
  }, [open, docKind, doc, transfer, categories]);

  const acceptIncomingHasMatrixSpec = useMemo(() => {
    const c = normalizeAcceptSpecList(acceptColors);
    const s = normalizeAcceptSpecList(acceptSizes);
    return c.length > 0 || s.length > 0;
  }, [acceptColors, acceptSizes]);

  const linkedProductForAck = useMemo(
    () => (transfer._acceptResolvedReceiverProductId
      ? products.find(p => p.id === transfer._acceptResolvedReceiverProductId)
      : undefined),
    [products, transfer._acceptResolvedReceiverProductId],
  );

  const acceptUpdateAckPreview = useMemo(() => {
    if (docKind !== 'dispatch') return null;
    if ((transfer._acceptDispatchMode as string | undefined) !== 'UPDATE_ACK') return null;
    const p = linkedProductForAck;
    const pl = doc?.payload as Record<string, unknown> | undefined;
    if (!p || !pl) return null;

    const dictColorName = (id: string) => dictionaries.colors.find(c => c.id === id)?.name?.trim() ?? '';
    const dictSizeName = (id: string) => dictionaries.sizes.find(s => s.id === id)?.name?.trim() ?? '';

    const existingColorNames = new Set<string>();
    for (const id of (Array.isArray((p as { colorIds?: string[] }).colorIds) ? (p as { colorIds: string[] }).colorIds : [])) {
      const n = dictColorName(id);
      if (n) existingColorNames.add(n);
    }
    const existingSizeNames = new Set<string>();
    for (const id of (Array.isArray((p as { sizeIds?: string[] }).sizeIds) ? (p as { sizeIds: string[] }).sizeIds : [])) {
      const n = dictSizeName(id);
      if (n) existingSizeNames.add(n);
    }

    const senderColorNames = new Set(normalizeAcceptSpecList(pl.colorNames));
    const senderSizeNames = new Set(normalizeAcceptSpecList(pl.sizeNames));
    for (const it of (Array.isArray(pl.items) ? pl.items : []) as Array<{ colorName?: unknown; sizeName?: unknown }>) {
      const cn = normalizeCollabSpecLabel(it?.colorName);
      const sn = normalizeCollabSpecLabel(it?.sizeName);
      if (cn) senderColorNames.add(cn);
      if (sn) senderSizeNames.add(sn);
    }
    const newColors = [...senderColorNames].filter(c => c && !existingColorNames.has(c));
    const newSizes = [...senderSizeNames].filter(s => s && !existingSizeNames.has(s));

    const cat = p.categoryId ? categories.find(c => c.id === p.categoryId) : undefined;
    const willUpgradeCategory = Boolean(cat && !cat.hasColorSize && (newColors.length > 0 || newSizes.length > 0));
    const hasIncomingSpec = senderColorNames.size > 0 || senderSizeNames.size > 0;
    const batchBlock = Boolean(cat && categoryUsesBatchManagement(cat) && hasIncomingSpec);

    return { newColors, newSizes, catName: cat?.name ?? '—', willUpgradeCategory, batchBlock };
  }, [docKind, transfer._acceptDispatchMode, linkedProductForAck, doc?.payload, dictionaries, categories]);

  const handleAcceptDispatch = async () => {
    if (acceptUiLoading) return;
    const mode = transfer._acceptDispatchMode as string | undefined;
    if (mode !== 'CREATE' && mode !== 'UPDATE_ACK' && mode !== 'READY') {
      toast.warning('正在获取派发绑定状态，请稍后再试');
      return;
    }
    const payload: Record<string, unknown> = { dispatchIds: [doc.id] };
    if (mode === 'CREATE') {
      const name = acceptName.trim();
      const sku = acceptSku.trim();
      if (!name) {
        toast.warning('请填写乙方产品名称');
        return;
      }
      if (!sku) {
        toast.warning('请填写乙方产品编号/SKU');
        return;
      }
      const specColors = normalizeAcceptSpecList(acceptColors);
      const specSizes = normalizeAcceptSpecList(acceptSizes);
      const hasMatrixSpec = specColors.length > 0 || specSizes.length > 0;
      if (acceptCategoryDecision === 'existing') {
        if (!acceptCategoryId.trim()) {
          toast.warning('请选择产品分类');
          return;
        }
        const sel = categories.find(c => c.id === acceptCategoryId);
        if (sel && hasMatrixSpec && !sel.hasColorSize) {
          toast.warning('本次派发含规格明细，请选择已启用规格维度的分类，或改用「新建分类」');
          return;
        }
        if (sel && categoryUsesBatchManagement(sel) && hasMatrixSpec) {
          toast.warning('所选分类已启用批次管理，与规格矩阵互斥，请另选支持规格的分类或改用「新建分类」');
          return;
        }
      }
      if (acceptCategoryDecision === 'create' && !acceptCategoryNameToCreate.trim()) {
        toast.warning('请填写新建分类名称');
        return;
      }
      Object.assign(payload, {
        createProduct: {
          name,
          sku,
          description: acceptDesc.trim() || undefined,
          colorNames: specColors.length ? specColors : undefined,
          sizeNames: specSizes.length ? specSizes : undefined,
          categoryDecision: acceptCategoryDecision,
          ...(acceptCategoryDecision === 'existing' ? { categoryId: acceptCategoryId.trim() } : {}),
          ...(acceptCategoryDecision === 'create' ? { categoryNameToCreate: acceptCategoryNameToCreate.trim() } : {}),
        },
      });
    }
    if (mode === 'UPDATE_ACK' && acceptUpdateAckPreview?.batchBlock) {
      toast.error('当前产品所属分类已启用批次管理，无法接受带规格矩阵的派发修订，请先在「设置 → 产品分类」调整该分类后再试。');
      return;
    }
    const msg =
      mode === 'UPDATE_ACK'
        ? '确认接受该派发？将把甲方本次名称/SKU/描述及规格变更同步到本地已关联产品，并生成或并入工单。'
        : mode === 'READY'
          ? '确认接受该派发？将生成或并入工单。'
          : '确认接受该派发？将创建乙方产品并生成对应工单。';
    const ok = await confirm({ message: msg });
    if (!ok) return;
    setBusy(true);
    try {
      const res: any = await api.collaboration.acceptTransfer(transfer.id, payload);
      const accepted = Number(res?.accepted) || 0;
      const ordersLen = Array.isArray(res?.createdOrders) ? res.createdOrders.length : 0;
      toast.success(
        res?.pendingProcess
          ? `已接受派发 · ${accepted} 条 · 生成 ${ordersLen} 张工单（部分待配工序）`
          : `已接受派发 · ${accepted} 条 · 生成 ${ordersLen} 张工单`,
        {
          duration: 8000,
          action: res?.pendingProcess && res?.receiverProductId
            ? {
                label: '去配置工序 →',
                onClick: () => navigate('/basic', { state: { editProductId: res.receiverProductId } }),
              }
            : undefined,
        },
      );
      if (Array.isArray(res?.productInfoChanges) && res.productInfoChanges.length > 0) {
        const lines: string[] = res.productInfoChanges.map((c: any) =>
          c.skipped ? `· ${c.field}：未同步（${c.reason || '存在冲突'}）` : `· ${c.field}：${c.from || '—'} → ${c.to}`,
        );
        toast.info(`商品信息已根据甲方最新数据同步：\n${lines.join('\n')}`, { duration: 12000 });
      }
      await afterMutation({ refreshOrders: true, refreshProd: true, refreshProducts: true, refreshPMP: true, closeAfter: true });
    } catch (err: any) {
      toast.error(err?.message || '接受失败');
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  const isSender = transfer.senderTenantName === '本企业';
  const peerName = isSender ? transfer.receiverTenantName : transfer.senderTenantName;
  const docNo = formatDocNo(doc, docKind);
  const createdStr = doc?.createdAt ? new Date(doc.createdAt).toLocaleString() : '';
  const kindLabel = docKind === 'dispatch' ? '派发单' : '回传单';
  const KindIcon = docKind === 'dispatch' ? Package : Truck;
  const kindIconCls = docKind === 'dispatch' ? 'text-indigo-600' : 'text-emerald-600';
  const statusNode = docKind === 'dispatch' ? dispatchStatusLabel(doc.status) : returnStatusLabel(doc.status);

  // ── 按条件判定动作按钮（派发「接受」、转发「确认」在详情内；其余批量入口在收件箱右上） ──
  const isMidChainDispatch = transfer._chainTransfers && doc?.transferId
    && (transfer._chainTransfers as any[]).some((ct: any) => ct.id === doc.transferId && ct.chainStep > 0);

  /** 乙方：待接受派发 — 在派发详情弹窗内确认接受（单条 dispatchIds） */
  const canAcceptDispatch = docKind === 'dispatch' && !isSender && doc.status === 'PENDING';
  const acceptMode = transfer._acceptDispatchMode as string | undefined;
  const linkedProduct = transfer._acceptResolvedReceiverProductId
    ? products.find(p => p.id === transfer._acceptResolvedReceiverProductId)
    : undefined;
  const linkedProductLabel =
    linkedProduct?.name?.trim()
    || linkedProduct?.sku?.trim()
    || (transfer._acceptResolvedReceiverProductId ? `产品 ${transfer._acceptResolvedReceiverProductId}` : '—');

  // 派发单
  const canWithdrawDispatch = docKind === 'dispatch' && isSender && doc.status === 'PENDING' && !isMidChainDispatch;
  const canDeleteDispatch = docKind === 'dispatch' && isSender && doc.status === 'WITHDRAWN' && !isMidChainDispatch;
  const canWithdrawForward = docKind === 'dispatch' && !isSender && !!transfer.childTransferId && !transfer.childConfirmed;
  const dispatchAmendmentPending = docKind === 'dispatch' && doc.amendmentStatus === 'PENDING_B_CONFIRM';
  const dispatchPayloadRefreshPending = docKind === 'dispatch'
    && !isSender
    && doc.status === 'PENDING'
    && doc.amendmentStatus === COLLAB_DISPATCH_AMENDMENT_PENDING_B_REVIEW;

  // 回传单
  const canReceiveReturn = docKind === 'return' && isSender && doc.status === 'PENDING_A_RECEIVE';
  const canWithdrawReturn = docKind === 'return' && !isSender && doc.status === 'PENDING_A_RECEIVE';
  const canDeleteReturn = docKind === 'return' && !isSender && doc.status === 'WITHDRAWN';
  const returnAmendmentPending = docKind === 'return' && doc.amendmentStatus === 'PENDING_A_CONFIRM';

  const hasActions = canWithdrawDispatch || canDeleteDispatch
    || canWithdrawForward
    || canWithdrawReturn || canDeleteReturn;

  return (
    <>
      <div className="fixed inset-0 z-[86] flex items-center justify-center p-3 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="collab-doc-modal-title">
        <button
          type="button"
          aria-label="关闭"
          className="absolute inset-0 z-0 bg-slate-900/40 backdrop-blur-sm"
          onClick={onClose}
        />
        <div
          className="relative z-[1] w-full max-w-2xl max-h-[92vh] flex flex-col rounded-2xl shadow-2xl border border-slate-200 bg-white overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          {/* 头部 */}
          <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-slate-200 bg-white shrink-0">
            <h2 id="collab-doc-modal-title" className="text-base font-black text-slate-900 flex items-center gap-2 min-w-0">
              <KindIcon className={`w-5 h-5 shrink-0 ${kindIconCls}`} />
              <span className="shrink-0">{kindLabel}</span>
              <span className="shrink-0">{statusNode}</span>
            </h2>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={refreshSelf}
                disabled={refreshing}
                className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors disabled:opacity-50"
                aria-label="刷新"
                title="刷新"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors"
                aria-label="关闭"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* 主体 */}
          <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">
            <div className="shrink-0 border-b border-slate-100 bg-slate-50/50 px-5 py-4">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">单据基本信息</h4>
              <div className="flex items-start gap-3 mb-4">
                <Package className="w-6 h-6 text-indigo-600 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <h3 className="text-lg font-black text-slate-900 truncate">{transfer.senderProductName || '—'}</h3>
                  {transfer.senderProductSku ? (
                    <p className="text-xs font-semibold text-slate-500 mt-0.5">SKU {transfer.senderProductSku}</p>
                  ) : null}
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-slate-400">对方单位</span>
                  <span className="font-bold text-slate-800 break-all">{peerName || '—'}</span>
                </div>
                <div>
                  <span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-slate-400">数量合计</span>
                  <span className="font-bold text-indigo-700 tabular-nums">{totalQty} 件</span>
                </div>
                <div>
                  <span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-slate-400">创建时间</span>
                  <span className="font-bold text-slate-800 text-xs">{createdStr || '—'}</span>
                </div>
                <div className="min-w-0">
                  <span className="mb-1 block text-[10px] font-black uppercase tracking-wide text-slate-400">单据号</span>
                  <span className="font-bold text-slate-800 text-xs break-all">{docNo || '—'}</span>
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-4 p-5">
            {dispatchPayloadRefreshPending && (
              <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2 py-0.5 bg-sky-600 text-white text-[10px] font-black rounded">明细已更新</span>
                  <span className="text-sm font-bold text-sky-950">甲方已同步修改本批次的数量或规格明细，请核对下方矩阵后再继续。</span>
                </div>
                <button
                  type="button"
                  onClick={handleAckDispatchPayloadRefresh}
                  disabled={busy}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-black text-white bg-sky-600 hover:bg-sky-700 disabled:opacity-50 transition-colors"
                >
                  <Check className="w-4 h-4 shrink-0" />
                  {busy ? '处理中…' : '已查看最新明细'}
                </button>
              </div>
            )}
            <div>
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
                规格明细{items.length > 0 ? `（${items.length}）` : ''}
              </h4>
              {specMatrix.rows.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-8 text-center text-sm text-slate-400">
                  暂无明细
                </div>
              ) : (
                <div>
                  <QtyMatrixTable sizeHeaders={specMatrix.sizeHeaders} rows={specMatrix.rows} />
                  {returnSpecQtyPrice ? (
                    <CollabDocQtyPriceFooter
                      lineQty={returnSpecQtyPrice.lineQty}
                      resolvedUnitPrice={returnSpecQtyPrice.up}
                      lineAmount={returnSpecQtyPrice.amt}
                    />
                  ) : null}
                </div>
              )}
            </div>

            {/* 乙方：派发单详情内确认接受 — CREATE 显示新建表单；UPDATE_ACK 为甲方信息变更确认；READY 为已绑定一键接受 */}
            {canAcceptDispatch && acceptUiLoading && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                正在检测产品绑定与甲方变更…
              </div>
            )}
            {canAcceptDispatch && !acceptUiLoading && acceptMode === 'CREATE' && (
              <div className="rounded-xl border border-indigo-200 bg-indigo-50/90 p-4 space-y-3">
                <p className="text-sm text-indigo-950 font-bold leading-relaxed">
                  该派发为「待接受」，且尚未绑定乙方本地产品。请确认新建产品信息后接受，将创建本企业产品并生成对应工单。
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-500 uppercase block ml-0.5">产品名称 *</label>
                    <input
                      type="text"
                      value={acceptName}
                      onChange={e => setAcceptName(e.target.value)}
                      disabled={busy}
                      className="w-full bg-white border border-slate-200 rounded-lg py-2 px-3 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none disabled:opacity-50"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-500 uppercase block ml-0.5">产品编号/SKU *</label>
                    <input
                      type="text"
                      value={acceptSku}
                      onChange={e => setAcceptSku(e.target.value)}
                      disabled={busy}
                      className="w-full bg-white border border-slate-200 rounded-lg py-2 px-3 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none disabled:opacity-50"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase block ml-0.5">描述</label>
                  <input
                    type="text"
                    value={acceptDesc}
                    onChange={e => setAcceptDesc(e.target.value)}
                    disabled={busy}
                    placeholder="选填"
                    className="w-full bg-white border border-slate-200 rounded-lg py-2 px-3 text-sm font-medium text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none disabled:opacity-50"
                  />
                </div>
                <div className="rounded-lg border border-indigo-100 bg-white/80 p-3 space-y-2">
                  <span className="text-[10px] font-black text-slate-500 uppercase block">产品分类 *</span>
                  <div className="flex flex-wrap gap-3 text-xs font-bold text-slate-700">
                    <label className="inline-flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="accept-cat-decision"
                        checked={acceptCategoryDecision === 'existing'}
                        onChange={() => setAcceptCategoryDecision('existing')}
                        disabled={busy}
                      />
                      既有分类
                    </label>
                    <label className="inline-flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="accept-cat-decision"
                        checked={acceptCategoryDecision === 'create'}
                        onChange={() => setAcceptCategoryDecision('create')}
                        disabled={busy}
                      />
                      新建分类
                    </label>
                  </div>
                  {acceptCategoryDecision === 'existing' && (
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-500 uppercase block ml-0.5">选择分类</label>
                      <select
                        value={acceptCategoryId}
                        onChange={e => setAcceptCategoryId(e.target.value)}
                        disabled={busy}
                        className="w-full bg-white border border-slate-200 rounded-lg py-2 px-3 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none disabled:opacity-50"
                      >
                        <option value="">请选择…</option>
                        {categories.map(cat => {
                          const disabled = collabAcceptCategoryDisabledForIncomingMatrix(cat, acceptIncomingHasMatrixSpec);
                          let reason = '';
                          if (disabled) {
                            if (acceptIncomingHasMatrixSpec && !cat.hasColorSize) reason = '（分类未启用规格）';
                            else if (categoryUsesBatchManagement(cat) && acceptIncomingHasMatrixSpec) reason = '（批次与规格矩阵互斥）';
                          }
                          return (
                            <option key={cat.id} value={cat.id} disabled={disabled}>
                              {(cat.name ?? '').trim() || cat.id}{reason}
                            </option>
                          );
                        })}
                      </select>
                      <p className="text-[11px] text-slate-500">
                        列表与「设置 → 产品分类」名称一致。若甲方本次含规格明细，未启用规格维度的分类不可选；已启用批次管理且不支持规格矩阵的分类亦不可选。
                      </p>
                    </div>
                  )}
                  {acceptCategoryDecision === 'create' && (
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-500 uppercase block ml-0.5">新分类名称</label>
                      <input
                        type="text"
                        value={acceptCategoryNameToCreate}
                        onChange={e => setAcceptCategoryNameToCreate(e.target.value)}
                        disabled={busy}
                        placeholder="填写分类名称"
                        className="w-full bg-white border border-slate-200 rounded-lg py-2 px-3 text-sm font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none disabled:opacity-50"
                      />
                      <p className="text-[11px] text-slate-500">将新建分类并按本次派发明细自动启用分类上的规格相关标志。</p>
                    </div>
                  )}
                </div>
                {(acceptColors.length > 0 || acceptSizes.length > 0) && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {acceptColors.length > 0 && (
                      <div>
                        <span className="text-[10px] font-black text-slate-500 uppercase block ml-0.5 mb-1">颜色（来自甲方）</span>
                        <div className="flex flex-wrap gap-1.5">
                          {acceptColors.map((c, i) => (
                            <span key={i} className="px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded text-xs font-bold">{c}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {acceptSizes.length > 0 && (
                      <div>
                        <span className="text-[10px] font-black text-slate-500 uppercase block ml-0.5 mb-1">规格列（来自甲方）</span>
                        <div className="flex flex-wrap gap-1.5">
                          {acceptSizes.map((s, i) => (
                            <span key={i} className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded text-xs font-bold">{s}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                <button
                  type="button"
                  onClick={handleAcceptDispatch}
                  disabled={busy}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-black text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm"
                >
                  <Check className="w-4 h-4 shrink-0" />
                  {busy ? '处理中…' : '确认接受派发'}
                </button>
              </div>
            )}
            {canAcceptDispatch && !acceptUiLoading && acceptMode === 'UPDATE_ACK' && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/90 p-4 space-y-3">
                <p className="text-sm text-amber-950 font-bold leading-relaxed">
                  已关联本地产品「{linkedProductLabel}」。甲方本次派发的名称、SKU、描述或规格与本地不一致，确认接受后将把甲方数据同步到该产品（若个别字段在本地存在冲突则会跳过并提示）。
                </p>
                {acceptUpdateAckPreview && (
                  <div className="rounded-lg border border-amber-100 bg-white/70 p-3 space-y-2 text-xs text-slate-800">
                    {(acceptUpdateAckPreview.newColors.length > 0 || acceptUpdateAckPreview.newSizes.length > 0) && (
                      <div>
                        <span className="font-black text-amber-900 block mb-1">本次将新增规格字典</span>
                        {acceptUpdateAckPreview.newColors.length > 0 && (
                          <p>
                            <span className="font-bold text-slate-600">颜色：</span>
                            {acceptUpdateAckPreview.newColors.join('、')}
                          </p>
                        )}
                        {acceptUpdateAckPreview.newSizes.length > 0 && (
                          <p>
                            <span className="font-bold text-slate-600">规格列：</span>
                            {acceptUpdateAckPreview.newSizes.join('、')}
                          </p>
                        )}
                      </div>
                    )}
                    {acceptUpdateAckPreview.willUpgradeCategory && (
                      <p className="font-bold text-indigo-900">
                        分类「{acceptUpdateAckPreview.catName}」当前未启用规格维度；接受后将自动启用以容纳甲方派发明细。
                      </p>
                    )}
                    {acceptUpdateAckPreview.batchBlock && (
                      <p className="font-bold text-red-700">
                        当前分类「{acceptUpdateAckPreview.catName}」已启用批次管理，与规格矩阵互斥，无法接受本派发修订。请先到「设置 → 产品分类」关闭批次管理或更换产品分类。
                      </p>
                    )}
                  </div>
                )}
                <button
                  type="button"
                  onClick={handleAcceptDispatch}
                  disabled={busy || Boolean(acceptUpdateAckPreview?.batchBlock)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-black text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 transition-colors shadow-sm"
                >
                  <Check className="w-4 h-4 shrink-0" />
                  {busy ? '处理中…' : '确认接受派发'}
                </button>
              </div>
            )}
            {canAcceptDispatch && !acceptUiLoading && acceptMode === 'READY' && (
              <button
                type="button"
                onClick={handleAcceptDispatch}
                disabled={busy}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-black text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm"
              >
                <Check className="w-4 h-4 shrink-0" />
                {busy ? '处理中…' : '确认接受派发'}
              </button>
            )}

            {/* 甲方：回传单详情内确认收货（与批量确认收回同一接口） */}
            {canReceiveReturn && (
              <div className="rounded-xl border border-indigo-200 bg-indigo-50/90 p-4 space-y-3">
                <p className="text-sm text-indigo-950 font-bold leading-relaxed">
                  该回传单为「待甲方收回」。确认收货后将为上述明细生成外协收回记录，并回写生产进度。
                </p>
                <button
                  type="button"
                  onClick={handleReceiveReturn}
                  disabled={busy}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-black text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm"
                >
                  <Check className="w-4 h-4 shrink-0" />
                  {busy ? '处理中…' : '确认收货'}
                </button>
              </div>
            )}

            {/* 备注 / 回收单号 */}
            {(doc?.payload?.note || doc?.payload?.receiptDocNo) && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 space-y-1 text-xs">
                {doc?.payload?.note && (
                  <p className="text-slate-600"><span className="font-bold text-slate-500">备注：</span>{doc.payload.note}</p>
                )}
                {doc?.payload?.receiptDocNo && (
                  <p className="font-bold text-emerald-700">外协回收单号：{doc.payload.receiptDocNo}</p>
                )}
              </div>
            )}

            {/* 修订区 */}
            {dispatchAmendmentPending && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2 py-0.5 bg-amber-400 text-white text-[10px] font-black rounded">待确认修订</span>
                  {doc.amendmentNote && <span className="text-xs text-amber-700">备注: {doc.amendmentNote}</span>}
                </div>
                <div className="space-y-2">
                  <span className="text-xs font-bold text-amber-900">修订规格明细</span>
                  {amendmentMatrix.rows.length === 0 ? (
                    <p className="text-xs text-amber-800">（无结构化明细）</p>
                  ) : (
                    <QtyMatrixTable sizeHeaders={amendmentMatrix.sizeHeaders} rows={amendmentMatrix.rows} />
                  )}
                </div>
                {!isSender && (
                  <div className="flex items-center gap-2">
                    <button onClick={handleConfirmDispatchAmendment} disabled={busy} className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 disabled:opacity-50 transition-all">
                      <Check className="w-3.5 h-3.5" /> 确认修订
                    </button>
                    <button onClick={handleRejectDispatchAmendment} disabled={busy} className="flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs font-bold hover:bg-slate-50 disabled:opacity-50 transition-all">
                      <X className="w-3.5 h-3.5" /> 拒绝
                    </button>
                  </div>
                )}
                {isSender && (
                  <p className="text-[10px] text-amber-600 font-bold">等待乙方确认修订中...</p>
                )}
              </div>
            )}
            {returnAmendmentPending && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2 py-0.5 bg-amber-400 text-white text-[10px] font-black rounded">待甲方确认修订</span>
                  {doc.amendmentNote && <span className="text-xs text-amber-700">备注: {doc.amendmentNote}</span>}
                </div>
                <div className="space-y-2">
                  <span className="text-xs font-bold text-amber-900">修订规格明细</span>
                  {amendmentMatrix.rows.length === 0 ? (
                    <p className="text-xs text-amber-800">（无结构化明细）</p>
                  ) : (
                    <div>
                      <QtyMatrixTable sizeHeaders={amendmentMatrix.sizeHeaders} rows={amendmentMatrix.rows} />
                      {returnAmendQtyPrice ? (
                        <CollabDocQtyPriceFooter
                          lineQty={returnAmendQtyPrice.lineQty}
                          resolvedUnitPrice={returnAmendQtyPrice.up}
                          lineAmount={returnAmendQtyPrice.amt}
                        />
                      ) : null}
                    </div>
                  )}
                </div>
                {isSender && (
                  <div className="flex items-center gap-2">
                    <button onClick={handleConfirmReturnAmendment} disabled={busy} className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 disabled:opacity-50 transition-all">
                      <Check className="w-3.5 h-3.5" /> 确认修订
                    </button>
                    <button onClick={handleRejectReturnAmendment} disabled={busy} className="flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs font-bold hover:bg-slate-50 disabled:opacity-50 transition-all">
                      <X className="w-3.5 h-3.5" /> 拒绝
                    </button>
                  </div>
                )}
                {!isSender && (
                  <p className="text-[10px] text-amber-600 font-bold">等待甲方确认修订中...</p>
                )}
              </div>
            )}
            </div>
          </div>

          {/* 底部动作按钮（撤回/删除；确认收回已置于回传单正文区） */}
          {hasActions && (
            <div className="flex flex-wrap gap-2 px-5 py-3 border-t border-slate-200 bg-slate-50 shrink-0">
              {canWithdrawForward && (
                <button onClick={handleWithdrawForward} disabled={busy} className="flex items-center gap-2 px-4 py-2 bg-slate-200 text-slate-700 rounded-xl text-sm font-bold hover:bg-slate-300 disabled:opacity-50 transition-all">
                  <RotateCcw className="w-4 h-4" /> {busy ? '撤回中...' : '撤回转发'}
                </button>
              )}
              {canWithdrawDispatch && (
                <button onClick={handleWithdrawDispatch} disabled={busy} className="flex items-center gap-2 px-4 py-2 bg-slate-200 text-slate-700 rounded-xl text-sm font-bold hover:bg-slate-300 disabled:opacity-50 transition-all">
                  <RotateCcw className="w-4 h-4" /> 撤回
                </button>
              )}
              {canDeleteDispatch && (
                <button onClick={handleDeleteDispatch} disabled={busy} className="flex items-center gap-2 px-4 py-2 bg-rose-50 text-rose-600 rounded-xl text-sm font-bold hover:bg-rose-100 disabled:opacity-50 transition-all">
                  <Trash2 className="w-4 h-4" /> 删除
                </button>
              )}
              {canWithdrawReturn && (
                <button onClick={handleWithdrawReturn} disabled={busy} className="flex items-center gap-2 px-4 py-2 bg-slate-200 text-slate-700 rounded-xl text-sm font-bold hover:bg-slate-300 disabled:opacity-50 transition-all">
                  <RotateCcw className="w-4 h-4" /> 撤回
                </button>
              )}
              {canDeleteReturn && (
                <button onClick={handleDeleteReturn} disabled={busy} className="flex items-center gap-2 px-4 py-2 bg-rose-50 text-rose-600 rounded-xl text-sm font-bold hover:bg-rose-100 disabled:opacity-50 transition-all">
                  <Trash2 className="w-4 h-4" /> 删除
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default CollabDocDetailModal;
