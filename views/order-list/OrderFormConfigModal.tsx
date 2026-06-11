import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  GlobalNodeTemplate,
  OrderFormSettings,
  PlanOrder,
  PrintTemplate,
  ProductionOrder,
  Product,
  ReportFieldDefinition,
} from '../../types';
import { BusinessFormConfigModal } from '../../components/form-config/BusinessFormConfigModal';
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
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      const snapshot = buildNodeReportSnapshot(globalNodes);
      initialNodeReportRef.current = snapshot;
      setNodeReportDraft(snapshot);
      setSelectedNodeId(globalNodes[0]?.id ?? null);
    } else if (!open && wasOpenRef.current) {
      initialNodeReportRef.current = {};
      setNodeReportDraft({});
      setSelectedNodeId(null);
    }
    wasOpenRef.current = open;
  }, [open, globalNodes]);

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
      const updates = collectDirtyNodeReportUpdates(nodeReportDraft, initialNodeReportRef.current);
      if (updates.length > 0) {
        await api.orders.updateNodeReportTemplates(updates);
        await onRefreshGlobalNodes();
      }
    },
    [onUpdateOrderFormSettings, nodeReportDraft, onRefreshGlobalNodes],
  );

  return (
    <BusinessFormConfigModal
      open={open}
      onClose={onClose}
      defaultTabId={defaultTabWhenOpen}
      schema={schema}
      productionLinkMode={productionLinkMode}
      initialValue={orderFormSettings}
      onSave={handleSave}
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
