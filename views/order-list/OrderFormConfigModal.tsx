import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import type {
  GlobalNodeTemplate,
  OrderFormSettings,
  PlanOrder,
  PrintTemplate,
  ProductionOrder,
  Product,
  ReportFieldDefinition,
} from '../../types';
import { BusinessFormConfigModal, type FormConfigSaveStatus } from '../../components/form-config/BusinessFormConfigModal';
import { createOrderFormConfigSchema } from '../../components/form-config/schemas/orderFormConfigSchema';
import * as api from '../../services/api';

interface OrderFormConfigModalProps {
  open: boolean;
  onClose: () => void;
  defaultTabWhenOpen?: 'fields' | 'print' | 'list';
  productionLinkMode?: 'order' | 'product';
  orderFormSettings: OrderFormSettings;
  onUpdateOrderFormSettings: (settings: OrderFormSettings) => void | Promise<void>;
  printTemplates: PrintTemplate[];
  onUpdatePrintTemplates: (list: PrintTemplate[]) => void | Promise<void>;
  onRefreshPrintTemplates?: () => void | Promise<void>;
  plans: PlanOrder[];
  orders: ProductionOrder[];
  products: Product[];
  globalNodes: GlobalNodeTemplate[];
  onRefreshGlobalNodes: () => Promise<void>;
}

function buildNodeReportSnapshot(nodes: GlobalNodeTemplate[]): Record<string, ReportFieldDefinition[]> {
  const snapshot: Record<string, ReportFieldDefinition[]> = {};
  for (const node of nodes) {
    snapshot[node.id] = [...(node.reportTemplate ?? [])];
  }
  return snapshot;
}

function collectDirtyNodeReportUpdates(
  draft: Record<string, ReportFieldDefinition[]>,
  initial: Record<string, ReportFieldDefinition[]>,
): { nodeId: string; reportTemplate: ReportFieldDefinition[] }[] {
  const updates: { nodeId: string; reportTemplate: ReportFieldDefinition[] }[] = [];
  const ids = new Set([...Object.keys(initial), ...Object.keys(draft)]);
  for (const nodeId of ids) {
    const next = draft[nodeId] ?? [];
    const prev = initial[nodeId] ?? [];
    if (JSON.stringify(prev) !== JSON.stringify(next)) {
      updates.push({ nodeId, reportTemplate: next });
    }
  }
  return updates;
}

const NODE_REPORT_AUTOSAVE_MS = 600;

const OrderFormConfigModal: React.FC<OrderFormConfigModalProps> = ({
  open,
  onClose,
  defaultTabWhenOpen,
  productionLinkMode,
  orderFormSettings,
  onUpdateOrderFormSettings,
  printTemplates,
  onUpdatePrintTemplates,
  onRefreshPrintTemplates,
  plans,
  orders,
  products,
  globalNodes,
  onRefreshGlobalNodes,
}) => {
  const initialNodeReportRef = useRef<Record<string, ReportFieldDefinition[]>>({});
  const [nodeReportDraft, setNodeReportDraft] = useState<Record<string, ReportFieldDefinition[]>>({});
  const nodeReportDraftRef = useRef(nodeReportDraft);
  nodeReportDraftRef.current = nodeReportDraft;
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [nodeReportSaveStatus, setNodeReportSaveStatus] = useState<FormConfigSaveStatus>('saved');
  const wasOpenRef = useRef(false);
  const nodeReportSaveQueueRef = useRef(Promise.resolve());

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      const snapshot = buildNodeReportSnapshot(globalNodes);
      initialNodeReportRef.current = snapshot;
      setNodeReportDraft(snapshot);
      setSelectedNodeId(globalNodes[0]?.id ?? null);
      setNodeReportSaveStatus('saved');
    } else if (!open && wasOpenRef.current) {
      initialNodeReportRef.current = {};
      setNodeReportDraft({});
      setSelectedNodeId(null);
      setNodeReportSaveStatus('saved');
    }
    wasOpenRef.current = open;
  }, [open, globalNodes]);

  const persistDirtyNodeReports = useCallback(async (): Promise<boolean> => {
    const draft = nodeReportDraftRef.current;
    const updates = collectDirtyNodeReportUpdates(draft, initialNodeReportRef.current);
    if (updates.length === 0) return true;
    try {
      await api.orders.updateNodeReportTemplates(updates);
      const nextInitial = { ...initialNodeReportRef.current };
      for (const u of updates) {
        nextInitial[u.nodeId] = u.reportTemplate;
      }
      initialNodeReportRef.current = nextInitial;
      await onRefreshGlobalNodes();
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`报工自定义内容保存失败：${msg}`);
      return false;
    }
  }, [onRefreshGlobalNodes]);

  const enqueueNodeReportSave = useCallback((): Promise<boolean> => {
    setNodeReportSaveStatus('saving');
    const task = async () => {
      const ok = await persistDirtyNodeReports();
      const stillDirty = collectDirtyNodeReportUpdates(
        nodeReportDraftRef.current,
        initialNodeReportRef.current,
      );
      if (!ok) {
        setNodeReportSaveStatus('error');
        return false;
      }
      setNodeReportSaveStatus(stillDirty.length > 0 ? 'pending' : 'saved');
      return true;
    };
    const result = nodeReportSaveQueueRef.current.then(task, task);
    nodeReportSaveQueueRef.current = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }, [persistDirtyNodeReports]);

  /** 报工自定义写在独立草稿里，主配置 draft 不变时壳层不会自动保存，需单独 debounce */
  useEffect(() => {
    if (!open) return;
    const dirty = collectDirtyNodeReportUpdates(nodeReportDraft, initialNodeReportRef.current);
    if (dirty.length === 0) return;
    setNodeReportSaveStatus((prev) => (prev === 'saving' ? prev : 'pending'));
    const timer = window.setTimeout(() => {
      void enqueueNodeReportSave();
    }, NODE_REPORT_AUTOSAVE_MS);
    return () => window.clearTimeout(timer);
  }, [nodeReportDraft, open, enqueueNodeReportSave]);

  const handleNodeReportDraftChange = useCallback((nodeId: string, next: ReportFieldDefinition[]) => {
    setNodeReportDraft(prev => ({ ...prev, [nodeId]: next }));
  }, []);

  const schema = useMemo(
    () =>
      createOrderFormConfigSchema({
        globalNodes,
        nodeReportDraft,
        onNodeReportDraftChange: handleNodeReportDraftChange,
        selectedNodeId,
        onSelectNode: setSelectedNodeId,
      }),
    [globalNodes, nodeReportDraft, handleNodeReportDraftChange, selectedNodeId],
  );

  const handleSave = useCallback(
    async (settings: OrderFormSettings) => {
      await onUpdateOrderFormSettings(settings);
      setNodeReportSaveStatus('saving');
      const ok = await persistDirtyNodeReports();
      if (!ok) {
        setNodeReportSaveStatus('error');
        throw new Error('报工自定义内容保存失败');
      }
      setNodeReportSaveStatus('saved');
    },
    [onUpdateOrderFormSettings, persistDirtyNodeReports],
  );

  /** 关闭前 flush 报工草稿，避免只改此项时直接关掉导致丢失 */
  const handleShellClose = useCallback(() => {
    void (async () => {
      await nodeReportSaveQueueRef.current.catch(() => undefined);
      const dirty = collectDirtyNodeReportUpdates(
        nodeReportDraftRef.current,
        initialNodeReportRef.current,
      );
      if (dirty.length > 0) {
        setNodeReportSaveStatus('saving');
        const ok = await persistDirtyNodeReports();
        if (!ok) {
          setNodeReportSaveStatus('error');
          return;
        }
      }
      setNodeReportSaveStatus('saved');
      onClose();
    })();
  }, [onClose, persistDirtyNodeReports]);

  const handleRetryNodeReportSave = useCallback(() => {
    void enqueueNodeReportSave();
  }, [enqueueNodeReportSave]);

  return (
    <BusinessFormConfigModal<OrderFormSettings>
      open={open}
      onClose={handleShellClose}
      defaultTabId={defaultTabWhenOpen}
      schema={schema}
      productionLinkMode={productionLinkMode}
      initialValue={orderFormSettings}
      onSave={handleSave}
      extraSaveStatus={nodeReportSaveStatus}
      onRetryExtraSave={handleRetryNodeReportSave}
      printTemplates={printTemplates}
      onUpdatePrintTemplates={onUpdatePrintTemplates}
      onRefreshPrintTemplates={onRefreshPrintTemplates}
      plans={plans}
      orders={orders}
      products={products}
    />
  );
};

export default React.memo(OrderFormConfigModal);
