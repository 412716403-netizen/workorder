import React, { useState, useMemo, useCallback } from 'react';
import {
  Plus,
  X,
  ArrowLeft,
  Save,
  Trash2,
  Layers,
  FileText,
  ClipboardList,
  ArrowDownToLine,
  ListFilter,
  CheckSquare,
  Square,
  AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { SearchableProductSelect } from '../../components/SearchableProductSelect';
import { SearchablePartnerSelect } from '../../components/SearchablePartnerSelect';
import { Product, Warehouse, ProductCategory, Partner, PartnerCategory, AppDictionaries, ProductVariant, PurchaseOrderFormSettings, PurchaseBillFormSettings } from '../../types';
import { sortedVariantColorEntries } from '../../utils/sortVariantsByProduct';
import { sectionTitleClass } from '../../styles/uiDensity';
import { useConfirm } from '../../contexts/ConfirmContext';

type FormType = 'PURCHASE_ORDER' | 'PURCHASE_BILL' | 'SALES_ORDER' | 'SALES_BILL';

interface OrderBillFormPageProps {
  formType: FormType;
  products: Product[];
  warehouses: Warehouse[];
  categories: ProductCategory[];
  partners: Partner[];
  partnerCategories: PartnerCategory[];
  dictionaries: AppDictionaries;
  records: any[];
  getStock: (pId: string, whId?: string, excludeDocNumber?: string) => number;
  getVariantDisplayQty: (pId: string, whId: string, variantId: string) => number;
  getNullVariantProdStock: (pId: string, whId?: string) => number;
  productMapPSI: Map<string, Product>;
  warehouseMapPSI: Map<string, Warehouse>;
  categoryMapPSI: Map<string, ProductCategory>;
  getUnitName: (productId: string) => string;
  formatQtyDisplay: (q: number | string | undefined | null) => number;
  onBack: () => void;
  onSave: (records: any[]) => void;
  onSaveBatch: (records: any[]) => Promise<void>;
  onReplaceRecords?: (type: string, docNumber: string, newRecords: any[]) => void;
  onDeleteRecords?: (type: string, docNumber: string) => void;
  editingDocNumber: string | null;
  purchaseOrderFormSettings?: PurchaseOrderFormSettings;
  purchaseBillFormSettings?: PurchaseBillFormSettings;
  userPermissions?: string[];
  tenantRole?: string;
  partnerLabel: string;
}

const OrderBillFormPage: React.FC<OrderBillFormPageProps> = ({
  formType,
  products,
  warehouses,
  categories,
  partners,
  partnerCategories,
  dictionaries,
  records,
  getStock,
  getVariantDisplayQty,
  getNullVariantProdStock,
  productMapPSI,
  warehouseMapPSI,
  categoryMapPSI,
  getUnitName,
  formatQtyDisplay,
  onBack,
  onSave,
  onSaveBatch,
  onReplaceRecords,
  onDeleteRecords,
  editingDocNumber,
  purchaseOrderFormSettings = { standardFields: [], customFields: [] },
  purchaseBillFormSettings = { standardFields: [], customFields: [] },
  userPermissions,
  tenantRole,
  partnerLabel,
}) => {
  const confirm = useConfirm();
  const recordsList = records ?? [];
  const _isOwner = tenantRole === 'owner';
  const hasPsiPerm = (perm: string): boolean => {
    if (_isOwner) return true;
    if (!userPermissions || userPermissions.length === 0) return true;
    if (userPermissions.includes('psi') && !userPermissions.some(p => p.startsWith('psi:'))) return true;
    if (userPermissions.includes(perm)) return true;
    if (userPermissions.some(p => p.startsWith(`${perm}:`))) return true;
    return false;
  };
  const safePurchaseOrderFormSettings = { standardFields: purchaseOrderFormSettings?.standardFields ?? [], customFields: purchaseOrderFormSettings?.customFields ?? [] };
  const safePurchaseBillFormSettings = { standardFields: purchaseBillFormSettings?.standardFields ?? [], customFields: purchaseBillFormSettings?.customFields ?? [] };

  // ── Form state ──
  const [form, setForm] = useState<any>(() => {
    const base: any = {
      productId: '',
      warehouseId: '',
      fromWarehouseId: '',
      toWarehouseId: '',
      quantity: 0,
      actualQuantity: 0,
      purchasePrice: 0,
      partner: '',
      partnerId: '',
      note: '',
      docNumber: '',
      dueDate: '',
      createdAt: new Date().toISOString().split('T')[0],
      customData: {} as Record<string, any>,
    };
    if (editingDocNumber) {
      const existing = recordsList.filter((r: any) => r.type === formType && r.docNumber === editingDocNumber);
      if (existing.length > 0) {
        const first = existing[0];
        base.partner = first.partner ?? '';
        base.partnerId = first.partnerId ?? '';
        base.docNumber = editingDocNumber;
        base.dueDate = first.dueDate ?? '';
        base.note = first.note ?? '';
        base.warehouseId = first.warehouseId ?? '';
        base.createdAt = first.createdAt ?? new Date().toISOString().split('T')[0];
        base.customData = first.customData ?? {};
      }
    }
    return base;
  });

  // ── Purchase order items ──
  const [purchaseOrderItems, setPurchaseOrderItems] = useState<{ id: string; productId: string; quantity?: number; purchasePrice: number; variantQuantities?: Record<string, number>; sourceRecordIds?: string[] }[]>(() => {
    if (formType !== 'PURCHASE_ORDER' || !editingDocNumber) return [];
    const existing = recordsList.filter((r: any) => r.type === 'PURCHASE_ORDER' && r.docNumber === editingDocNumber);
    if (existing.length === 0) return [];
    const lineMap: Record<string, any[]> = {};
    existing.forEach((r: any) => {
      const lg = r.lineGroupId ?? r.id;
      if (!lineMap[lg]) lineMap[lg] = [];
      lineMap[lg].push(r);
    });
    return Object.entries(lineMap).map(([lgId, recs]) => {
      const first = recs[0];
      const hasVar = recs.some((r: any) => r.variantId);
      const vq: Record<string, number> = {};
      if (hasVar) recs.forEach((r: any) => { if (r.variantId) vq[r.variantId] = r.quantity ?? 0; });
      return {
        id: lgId,
        productId: first.productId,
        quantity: hasVar ? undefined : (first.quantity ?? 0),
        purchasePrice: first.purchasePrice ?? 0,
        variantQuantities: hasVar ? vq : undefined,
        sourceRecordIds: recs.map((r: any) => r.id),
      };
    });
  });

  // ── Purchase bill items ──
  const [purchaseBillItems, setPurchaseBillItems] = useState<{ id: string; productId: string; quantity?: number; purchasePrice: number; variantQuantities?: Record<string, number>; batch?: string }[]>(() => {
    if (formType !== 'PURCHASE_BILL' || !editingDocNumber) return [];
    const existing = recordsList.filter((r: any) => r.type === 'PURCHASE_BILL' && r.docNumber === editingDocNumber);
    if (existing.length === 0) return [];
    const lineMap: Record<string, any[]> = {};
    existing.forEach((r: any) => {
      const lg = r.lineGroupId ?? r.id;
      if (!lineMap[lg]) lineMap[lg] = [];
      lineMap[lg].push(r);
    });
    return Object.entries(lineMap).map(([lgId, recs]) => {
      const first = recs[0];
      const hasVar = recs.some((r: any) => r.variantId);
      const vq: Record<string, number> = {};
      if (hasVar) recs.forEach((r: any) => { if (r.variantId) vq[r.variantId] = r.quantity ?? 0; });
      return {
        id: lgId,
        productId: first.productId,
        quantity: hasVar ? undefined : (first.quantity ?? 0),
        purchasePrice: first.purchasePrice ?? 0,
        variantQuantities: hasVar ? vq : undefined,
        batch: first.batch,
      };
    });
  });

  // ── Sales order items ──
  const [salesOrderItems, setSalesOrderItems] = useState<{ id: string; productId: string; quantity?: number; salesPrice: number; variantQuantities?: Record<string, number>; sourceRecordIds?: string[] }[]>(() => {
    if (formType !== 'SALES_ORDER' || !editingDocNumber) return [];
    const existing = recordsList.filter((r: any) => r.type === 'SALES_ORDER' && r.docNumber === editingDocNumber);
    if (existing.length === 0) return [];
    const lineMap: Record<string, any[]> = {};
    existing.forEach((r: any) => {
      const lg = r.lineGroupId ?? r.id;
      if (!lineMap[lg]) lineMap[lg] = [];
      lineMap[lg].push(r);
    });
    return Object.entries(lineMap).map(([lgId, recs]) => {
      const first = recs[0];
      const hasVar = recs.some((r: any) => r.variantId);
      const vq: Record<string, number> = {};
      if (hasVar) recs.forEach((r: any) => { if (r.variantId) vq[r.variantId] = r.quantity ?? 0; });
      return {
        id: lgId,
        productId: first.productId,
        quantity: hasVar ? undefined : (first.quantity ?? 0),
        salesPrice: first.salesPrice ?? 0,
        variantQuantities: hasVar ? vq : undefined,
        sourceRecordIds: recs.map((r: any) => r.id),
      };
    });
  });

  // ── Sales bill items ──
  const [salesBillItems, setSalesBillItems] = useState<{ id: string; productId: string; quantity?: number; salesPrice: number; variantQuantities?: Record<string, number>; sourceRecordIds?: string[] }[]>(() => {
    if (formType !== 'SALES_BILL' || !editingDocNumber) return [];
    const existing = recordsList.filter((r: any) => r.type === 'SALES_BILL' && r.docNumber === editingDocNumber);
    if (existing.length === 0) return [];
    const lineMap: Record<string, any[]> = {};
    existing.forEach((r: any) => {
      const lg = r.lineGroupId ?? r.id;
      if (!lineMap[lg]) lineMap[lg] = [];
      lineMap[lg].push(r);
    });
    return Object.entries(lineMap).map(([lgId, recs]) => {
      const first = recs[0];
      const hasVar = recs.some((r: any) => r.variantId);
      const vq: Record<string, number> = {};
      if (hasVar) recs.forEach((r: any) => { if (r.variantId) vq[r.variantId] = r.quantity ?? 0; });
      return {
        id: lgId,
        productId: first.productId,
        quantity: hasVar ? undefined : (first.quantity ?? 0),
        salesPrice: first.salesPrice ?? 0,
        variantQuantities: hasVar ? vq : undefined,
        sourceRecordIds: recs.map((r: any) => r.id),
      };
    });
  });

  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  const [creationMethod, setCreationMethod] = useState<'MANUAL' | 'FROM_ORDER'>('MANUAL');
  const [selectedPOOrderNums, setSelectedPOOrderNums] = useState<string[]>([]);
  const [selectedPOItemIds, setSelectedPOItemIds] = useState<string[]>([]);
  const [selectedPOItemQuantities, setSelectedPOItemQuantities] = useState<Record<string, number>>({});
  const [selectedPOItemBatches, setSelectedPOItemBatches] = useState<Record<string, string>>({});
  const [allocationModal, setAllocationModal] = useState<{ docNumber: string; lineGroupId: string; product: Product; grp: any[] } | null>(null);
  const [allocationQuantities, setAllocationQuantities] = useState<number | Record<string, number> | null>(null);
  const [allocationWarehouseId, setAllocationWarehouseId] = useState<string>('');

  // ── Doc number generators ──
  const generatePODocNumber = (): string => {
    const partnerCode = (form.partnerId || partners.find(p => p.name === form.partner)?.id || '0').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || '0';
    const existingForPartner = recordsList.filter((r: any) =>
      r.type === 'PURCHASE_ORDER' && (r.partnerId === form.partnerId || r.partner === form.partner)
    );
    const seqNums = existingForPartner.map((r: any) => {
      const m = r.docNumber?.match(new RegExp(`PO-${partnerCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d+)`));
      return m ? parseInt(m[1], 10) : 0;
    });
    const nextSeq = seqNums.length > 0 ? Math.max(...seqNums) + 1 : 1;
    return `PO-${partnerCode}-${String(nextSeq).padStart(3, '0')}`;
  };

  const generatePBDocNumber = (partnerId: string, partnerName: string): string => {
    const partnerCode = (partnerId || partners.find(p => p.name === partnerName)?.id || '0').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || '0';
    const existingForPartner = recordsList.filter((r: any) =>
      r.type === 'PURCHASE_BILL' && (r.partnerId === partnerId || r.partner === partnerName)
    );
    const seqNums = existingForPartner.map((r: any) => {
      const m = r.docNumber?.match(new RegExp(`PB-${partnerCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d+)`));
      return m ? parseInt(m[1], 10) : 0;
    });
    const nextSeq = seqNums.length > 0 ? Math.max(...seqNums) + 1 : 1;
    return `PB-${partnerCode}-${String(nextSeq).padStart(3, '0')}`;
  };

  const generateSODocNumber = (): string => {
    const partnerCode = (form.partnerId || partners.find(p => p.name === form.partner)?.id || '0').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || '0';
    const existingForPartner = recordsList.filter((r: any) =>
      r.type === 'SALES_ORDER' && (r.partnerId === form.partnerId || r.partner === form.partner)
    );
    const seqNums = existingForPartner.map((r: any) => {
      const m = r.docNumber?.match(new RegExp(`SO-${partnerCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d+)`));
      return m ? parseInt(m[1], 10) : 0;
    });
    const nextSeq = seqNums.length > 0 ? Math.max(...seqNums) + 1 : 1;
    return `SO-${partnerCode}-${String(nextSeq).padStart(3, '0')}`;
  };

  const generateSBDocNumber = (): string => {
    const partnerCode = (form.partnerId || partners.find(p => p.name === form.partner)?.id || '0').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || '0';
    const existingForPartner = recordsList.filter((r: any) =>
      r.type === 'SALES_BILL' && (r.partnerId === form.partnerId || r.partner === form.partner)
    );
    const seqNums = existingForPartner.map((r: any) => {
      const m = r.docNumber?.match(new RegExp(`SB-${partnerCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d+)`));
      return m ? parseInt(m[1], 10) : 0;
    });
    const nextSeq = seqNums.length > 0 ? Math.max(...seqNums) + 1 : 1;
    return `SB-${partnerCode}-${String(nextSeq).padStart(3, '0')}`;
  };

  // ── Item CRUD helpers ──
  const addPurchaseOrderItem = () => setPurchaseOrderItems(prev => [...prev, { id: `line-${Date.now()}`, productId: '', quantity: 0, purchasePrice: 0 }]);
  const updatePurchaseOrderItem = (id: string, updates: Partial<{ productId: string; quantity?: number; purchasePrice: number; variantQuantities?: Record<string, number> }>) => {
    setPurchaseOrderItems(prev => prev.map(i => i.id === id ? { ...i, ...updates } : i));
  };
  const updatePurchaseOrderVariantQty = (lineId: string, variantId: string, qty: number) => {
    setPurchaseOrderItems(prev => prev.map(i => {
      if (i.id !== lineId) return i;
      const next = { ...(i.variantQuantities || {}), [variantId]: qty };
      return { ...i, variantQuantities: next };
    }));
  };
  const removePurchaseOrderItem = (id: string) => setPurchaseOrderItems(prev => prev.filter(i => i.id !== id));

  const addSalesOrderItem = () => setSalesOrderItems(prev => [...prev, { id: `so-line-${Date.now()}`, productId: '', quantity: 0, salesPrice: 0 }]);
  const updateSalesOrderItem = (id: string, updates: Partial<{ productId: string; quantity?: number; salesPrice: number; variantQuantities?: Record<string, number> }>) => {
    setSalesOrderItems(prev => prev.map(i => i.id === id ? { ...i, ...updates } : i));
  };
  const updateSalesOrderVariantQty = (lineId: string, variantId: string, qty: number) => {
    setSalesOrderItems(prev => prev.map(i => {
      if (i.id !== lineId) return i;
      const next = { ...(i.variantQuantities || {}), [variantId]: qty };
      return { ...i, variantQuantities: next };
    }));
  };
  const removeSalesOrderItem = (id: string) => setSalesOrderItems(prev => prev.filter(i => i.id !== id));

  const addSalesBillItem = () => setSalesBillItems(prev => [...prev, { id: `sb-line-${Date.now()}`, productId: '', quantity: 0, salesPrice: 0 }]);
  const updateSalesBillItem = (id: string, updates: Partial<{ productId: string; quantity?: number; salesPrice: number; variantQuantities?: Record<string, number> }>) => {
    setSalesBillItems(prev => prev.map(i => i.id === id ? { ...i, ...updates } : i));
  };
  const updateSalesBillVariantQty = (lineId: string, variantId: string, qty: number) => {
    setSalesBillItems(prev => prev.map(i => {
      if (i.id !== lineId) return i;
      const next = { ...(i.variantQuantities || {}), [variantId]: qty };
      return { ...i, variantQuantities: next };
    }));
  };
  const removeSalesBillItem = (id: string) => setSalesBillItems(prev => prev.filter(i => i.id !== id));

  const addPurchaseBillItem = () => setPurchaseBillItems(prev => [...prev, { id: `pb-line-${Date.now()}`, productId: '', quantity: 0, purchasePrice: 0 }]);
  const updatePurchaseBillItem = (id: string, updates: Partial<{ productId: string; quantity?: number; purchasePrice: number; variantQuantities?: Record<string, number>; batch?: string }>) => {
    setPurchaseBillItems(prev => prev.map(i => i.id === id ? { ...i, ...updates } : i));
  };
  const updatePurchaseBillVariantQty = (lineId: string, variantId: string, qty: number) => {
    setPurchaseBillItems(prev => prev.map(i => {
      if (i.id !== lineId) return i;
      const next = { ...(i.variantQuantities || {}), [variantId]: qty };
      return { ...i, variantQuantities: next };
    }));
  };
  const removePurchaseBillItem = (id: string) => setPurchaseBillItems(prev => prev.filter(i => i.id !== id));

  // ── PO received tracking (for PO progress bars and PB from-order) ──
  const receivedByOrderLine = useMemo(() => {
    const map: Record<string, number> = {};
    recordsList.filter(r => r.type === 'PURCHASE_BILL' && r.sourceOrderNumber && r.sourceLineId).forEach(r => {
      const key = `${r.sourceOrderNumber}::${r.sourceLineId}`;
      map[key] = (map[key] ?? 0) + (r.quantity ?? 0);
    });
    return map;
  }, [recordsList]);

  const getReceivedQty = (docNum: string, lineId: string) => receivedByOrderLine[`${docNum}::${lineId}`] ?? 0;

  const allPOByGroups = useMemo(() => {
    const filtered = recordsList.filter(r => r.type === 'PURCHASE_ORDER');
    const groups: Record<string, any[]> = {};
    filtered.forEach(r => {
      const key = r.docNumber;
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    });
    return groups;
  }, [recordsList]);

  const pendingPOs = useMemo(() => {
    return Object.entries(allPOByGroups).filter(([, items]) => {
      return items.some((item: any) => {
        const received = getReceivedQty(item.docNumber, item.id);
        return (item.quantity ?? 0) > received;
      });
    });
  }, [allPOByGroups, receivedByOrderLine]);

  const availableItemsFromSelectedPOs = useMemo(() => {
    const items: any[] = [];
    selectedPOOrderNums.forEach(num => {
      if (allPOByGroups[num]) {
        allPOByGroups[num].forEach((item: any) => {
          const orderQty = item.quantity ?? 0;
          const received = getReceivedQty(item.docNumber, item.id);
          const remaining = Math.max(0, orderQty - received);
          if (remaining > 0) {
            items.push({ ...item, receivedQty: received, remainingQty: remaining });
          }
        });
      }
    });
    return items;
  }, [selectedPOOrderNums, allPOByGroups, receivedByOrderLine]);

  // ── Reset form ──
  const resetForm = () => {
    const t = new Date().toISOString().split('T')[0];
    setForm({ productId: '', warehouseId: '', fromWarehouseId: '', toWarehouseId: '', quantity: 0, actualQuantity: 0, purchasePrice: 0, partner: '', partnerId: '', note: '', docNumber: '', dueDate: '', createdAt: t, customData: {} });
    setPurchaseOrderItems([]);
    setPurchaseBillItems([]);
    setSalesOrderItems([]);
    setSalesBillItems([]);
    setSelectedPOOrderNums([]);
    setSelectedPOItemIds([]);
    setSelectedPOItemQuantities({});
    setSelectedPOItemBatches({});
    setCreationMethod('MANUAL');
  };

  // ── Save handler ──
  const handleSaveManual = async (submitType: string) => {
    if (submitType === 'PURCHASE_ORDER') {
      const hasValidLine = purchaseOrderItems.some(i => {
        if (!i.productId) return false;
        const q = i.variantQuantities ? Object.values(i.variantQuantities).reduce((s, v) => s + v, 0) : (i.quantity ?? 0);
        return q > 0;
      });
      if (!form.partner || purchaseOrderItems.length === 0 || !hasValidLine) return;
      const originalDocNumber = editingDocNumber || '';
      let docNumber = form.docNumber?.trim() || (editingDocNumber ?? generatePODocNumber());
      if (!editingDocNumber) {
        const exists = (n: string) => recordsList.some((r: any) => r.type === 'PURCHASE_ORDER' && (r.docNumber || '').toLowerCase() === n.toLowerCase());
        let attempts = 0;
        while (exists(docNumber) && attempts < 100) {
          const m = docNumber.match(/-(\d+)$/);
          if (m) {
            const next = parseInt(m[1], 10) + 1;
            docNumber = docNumber.replace(/-\d+$/, `-${String(next).padStart(3, '0')}`);
          } else {
            docNumber = `${docNumber}-${Date.now().toString().slice(-6)}`;
          }
          attempts++;
        }
      }
      const timestamp = editingDocNumber
        ? (recordsList.find((r: any) => r.type === 'PURCHASE_ORDER' && r.docNumber === editingDocNumber)?.timestamp ?? new Date().toLocaleString())
        : new Date().toLocaleString();

      const newRecords: any[] = [];
      let recIdx = 0;
      purchaseOrderItems.forEach((item) => {
        if (!item.productId) return;
        const price = item.purchasePrice || 0;
        if (item.variantQuantities && Object.keys(item.variantQuantities).length > 0) {
          Object.entries(item.variantQuantities).forEach(([variantId, qty]) => {
            if (!qty || qty <= 0) return;
            const amount = qty * price;
            newRecords.push({
              id: `psi-po-${Date.now()}-${recIdx++}`,
              type: 'PURCHASE_ORDER',
              docNumber,
              timestamp,
              _savedAtMs: Date.now(),
              partner: form.partner,
              partnerId: form.partnerId,
              productId: item.productId,
              variantId,
              quantity: qty,
              purchasePrice: price,
              amount,
              dueDate: form.dueDate,
              note: form.note,
              operator: '张主管',
              lineGroupId: item.id,
              createdAt: form.createdAt || new Date().toISOString().split('T')[0],
              ...(Object.keys(form.customData || {}).length ? { customData: form.customData } : {})
            });
          });
        } else if ((item.quantity ?? 0) > 0) {
          const amount = item.quantity! * price;
          newRecords.push({
            id: `psi-po-${Date.now()}-${recIdx++}`,
            type: 'PURCHASE_ORDER',
            docNumber,
            timestamp,
            _savedAtMs: Date.now(),
            partner: form.partner,
            partnerId: form.partnerId,
            productId: item.productId,
            quantity: item.quantity,
            purchasePrice: price,
            amount,
            dueDate: form.dueDate,
            note: form.note,
            operator: '张主管',
            lineGroupId: item.id,
            createdAt: form.createdAt || new Date().toISOString().split('T')[0],
            ...(Object.keys(form.customData || {}).length ? { customData: form.customData } : {})
          });
        }
      });

      if (newRecords.length === 0) return;

      if (editingDocNumber && onReplaceRecords) {
        onReplaceRecords('PURCHASE_ORDER', originalDocNumber || docNumber, newRecords);
      } else {
        if (onSaveBatch) await onSaveBatch(newRecords);
        else { for (const r of newRecords) onSave([r]); }
      }

      onBack();
      return;
    }

    if (submitType === 'PURCHASE_BILL') {
      const hasValidBillLine = purchaseBillItems.some(i => {
        if (!i.productId) return false;
        const q = i.variantQuantities ? Object.values(i.variantQuantities || {}).reduce((s, v) => s + v, 0) : (i.quantity ?? 0);
        return q > 0;
      });
      if (!form.partner || !form.warehouseId || purchaseBillItems.length === 0 || !hasValidBillLine) return;
      const originalDocNumber = editingDocNumber || '';
      let docNumber = form.docNumber?.trim() || (editingDocNumber ?? generatePBDocNumber(form.partnerId || '', form.partner || ''));
      if (!editingDocNumber) {
        const exists = (n: string) => recordsList.some((r: any) => r.type === 'PURCHASE_BILL' && (r.docNumber || '').toLowerCase() === n.toLowerCase());
        let attempts = 0;
        while (exists(docNumber) && attempts < 100) {
          const m = docNumber.match(/-(\d+)$/);
          if (m) {
            const next = parseInt(m[1], 10) + 1;
            docNumber = docNumber.replace(/-\d+$/, `-${String(next).padStart(3, '0')}`);
          } else {
            docNumber = `${docNumber}-${Date.now().toString().slice(-6)}`;
          }
          attempts++;
        }
      }
      const timestamp = editingDocNumber
        ? (recordsList.find((r: any) => r.type === 'PURCHASE_BILL' && r.docNumber === editingDocNumber)?.timestamp ?? new Date().toLocaleString())
        : new Date().toLocaleString();
      const newRecords: any[] = [];
      let pbIdx = 0;
      purchaseBillItems.forEach((item) => {
        if (!item.productId) return;
        const price = item.purchasePrice || 0;
        if (item.variantQuantities && Object.keys(item.variantQuantities).length > 0) {
          Object.entries(item.variantQuantities).forEach(([variantId, qty]) => {
            if (!qty || qty <= 0) return;
            newRecords.push({
              id: `psi-pb-${Date.now()}-${pbIdx++}`,
              type: 'PURCHASE_BILL',
              docNumber,
              timestamp,
              _savedAtMs: Date.now(),
              partner: form.partner,
              partnerId: form.partnerId,
              productId: item.productId,
              variantId,
              quantity: qty,
              purchasePrice: price,
              amount: qty * price,
              warehouseId: form.warehouseId,
              note: form.note,
              operator: '张主管',
              lineGroupId: item.id,
              createdAt: form.createdAt || new Date().toISOString().split('T')[0],
              ...(Object.keys(form.customData || {}).length ? { customData: form.customData } : {}),
              ...(item.batch != null && item.batch !== '' && { batch: item.batch })
            });
          });
        } else if ((item.quantity ?? 0) > 0) {
          newRecords.push({
            id: `psi-pb-${Date.now()}-${pbIdx++}`,
            type: 'PURCHASE_BILL',
            docNumber,
            timestamp,
            _savedAtMs: Date.now(),
            partner: form.partner,
            partnerId: form.partnerId,
            productId: item.productId,
            quantity: item.quantity!,
            purchasePrice: price,
            amount: item.quantity! * price,
            warehouseId: form.warehouseId,
            note: form.note,
            operator: '张主管',
            lineGroupId: item.id,
            createdAt: form.createdAt || new Date().toISOString().split('T')[0],
            ...(Object.keys(form.customData || {}).length ? { customData: form.customData } : {}),
            ...(item.batch != null && item.batch !== '' && { batch: item.batch })
          });
        }
      });
      if (editingDocNumber && onReplaceRecords) {
        onReplaceRecords('PURCHASE_BILL', originalDocNumber || docNumber, newRecords);
      } else {
        if (onSaveBatch) await onSaveBatch(newRecords);
        else { for (const r of newRecords) onSave([r]); }
      }
      onBack();
      return;
    }

    if (submitType === 'SALES_ORDER') {
      const hasValidLine = salesOrderItems.some(i => {
        if (!i.productId) return false;
        const q = i.variantQuantities ? Object.values(i.variantQuantities).reduce((s, v) => s + v, 0) : (i.quantity ?? 0);
        return q > 0;
      });
      if (!form.partner || salesOrderItems.length === 0 || !hasValidLine) return;
      const originalDocNumber = editingDocNumber || '';
      let docNumber = form.docNumber?.trim() || (editingDocNumber ?? generateSODocNumber());
      if (!editingDocNumber) {
        const exists = (n: string) => recordsList.some((r: any) => r.type === 'SALES_ORDER' && (r.docNumber || '').toLowerCase() === n.toLowerCase());
        let attempts = 0;
        while (exists(docNumber) && attempts < 100) {
          const m = docNumber.match(/-(\d+)$/);
          if (m) {
            const next = parseInt(m[1], 10) + 1;
            docNumber = docNumber.replace(/-\d+$/, `-${String(next).padStart(3, '0')}`);
          } else {
            docNumber = `${docNumber}-${Date.now().toString().slice(-6)}`;
          }
          attempts++;
        }
      }
      const timestamp = editingDocNumber
        ? (recordsList.find((r: any) => r.type === 'SALES_ORDER' && r.docNumber === editingDocNumber)?.timestamp ?? new Date().toLocaleString())
        : new Date().toLocaleString();
      const newRecords: any[] = [];
      let recIdx = 0;
      salesOrderItems.forEach((item) => {
        if (!item.productId) return;
        const price = item.salesPrice || 0;
        if (item.variantQuantities && Object.keys(item.variantQuantities).length > 0) {
          Object.entries(item.variantQuantities).forEach(([variantId, qty]) => {
            if (!qty || qty <= 0) return;
            const amount = qty * price;
            newRecords.push({
              id: `psi-so-${Date.now()}-${recIdx++}`,
              type: 'SALES_ORDER',
              docNumber,
              timestamp,
              _savedAtMs: Date.now(),
              partner: form.partner,
              partnerId: form.partnerId,
              productId: item.productId,
              variantId,
              quantity: qty,
              salesPrice: price,
              amount,
              dueDate: form.dueDate,
              note: form.note,
              operator: '张主管',
              lineGroupId: item.id,
              createdAt: form.createdAt || new Date().toISOString().split('T')[0],
              ...(Object.keys(form.customData || {}).length ? { customData: form.customData } : {})
            });
          });
        } else if ((item.quantity ?? 0) > 0) {
          const amount = item.quantity! * price;
          newRecords.push({
            id: `psi-so-${Date.now()}-${recIdx++}`,
            type: 'SALES_ORDER',
            docNumber,
            timestamp,
            _savedAtMs: Date.now(),
            partner: form.partner,
            partnerId: form.partnerId,
            productId: item.productId,
            quantity: item.quantity,
            salesPrice: price,
            amount,
            dueDate: form.dueDate,
            note: form.note,
            operator: '张主管',
            lineGroupId: item.id,
            createdAt: form.createdAt || new Date().toISOString().split('T')[0],
            ...(Object.keys(form.customData || {}).length ? { customData: form.customData } : {})
          });
        }
      });
      if (newRecords.length === 0) return;
      if (editingDocNumber && onReplaceRecords) {
        onReplaceRecords('SALES_ORDER', originalDocNumber || docNumber, newRecords);
      } else {
        if (onSaveBatch) await onSaveBatch(newRecords);
        else { for (const r of newRecords) onSave([r]); }
      }
      onBack();
      return;
    }

    if (submitType === 'SALES_BILL') {
      const hasValidLine = salesBillItems.some(i => {
        if (!i.productId) return false;
        const q = i.variantQuantities ? Object.values(i.variantQuantities).reduce((s, v) => s + v, 0) : (i.quantity ?? 0);
        return q !== 0;
      });
      if (!form.partner || !form.warehouseId || salesBillItems.length === 0 || !hasValidLine) return;
      const originalDocNumber = editingDocNumber || '';
      let docNumber = form.docNumber?.trim() || (editingDocNumber ?? generateSBDocNumber());
      if (!editingDocNumber) {
        const exists = (n: string) => recordsList.some((r: any) => r.type === 'SALES_BILL' && (r.docNumber || '').toLowerCase() === n.toLowerCase());
        let attempts = 0;
        while (exists(docNumber) && attempts < 100) {
          const m = docNumber.match(/-(\d+)$/);
          if (m) {
            const next = parseInt(m[1], 10) + 1;
            docNumber = docNumber.replace(/-\d+$/, `-${String(next).padStart(3, '0')}`);
          } else {
            docNumber = `${docNumber}-${Date.now().toString().slice(-6)}`;
          }
          attempts++;
        }
      }
      const timestamp = editingDocNumber
        ? (recordsList.find((r: any) => r.type === 'SALES_BILL' && r.docNumber === editingDocNumber)?.timestamp ?? new Date().toLocaleString())
        : new Date().toLocaleString();
      const newRecords: any[] = [];
      let recIdx = 0;
      salesBillItems.forEach((item) => {
        if (!item.productId) return;
        const price = item.salesPrice || 0;
        if (item.variantQuantities && Object.keys(item.variantQuantities).length > 0) {
          Object.entries(item.variantQuantities).forEach(([variantId, qty]) => {
            if (qty === 0) return;
            newRecords.push({
              id: `psi-sb-${Date.now()}-${recIdx++}`,
              type: 'SALES_BILL',
              docNumber,
              timestamp,
              _savedAtMs: Date.now(),
              partner: form.partner,
              partnerId: form.partnerId,
              warehouseId: form.warehouseId,
              productId: item.productId,
              variantId,
              quantity: qty,
              salesPrice: price,
              amount: qty * price,
              note: form.note,
              operator: '张主管',
              lineGroupId: item.id,
              createdAt: form.createdAt || new Date().toISOString().split('T')[0],
              ...(Object.keys(form.customData || {}).length ? { customData: form.customData } : {})
            });
          });
        } else if ((item.quantity ?? 0) !== 0) {
          newRecords.push({
            id: `psi-sb-${Date.now()}-${recIdx++}`,
            type: 'SALES_BILL',
            docNumber,
            timestamp,
            _savedAtMs: Date.now(),
            partner: form.partner,
            partnerId: form.partnerId,
            warehouseId: form.warehouseId,
            productId: item.productId,
            quantity: item.quantity!,
            salesPrice: price,
            amount: item.quantity! * price,
            note: form.note,
            operator: '张主管',
            lineGroupId: item.id,
            createdAt: form.createdAt || new Date().toISOString().split('T')[0],
            ...(Object.keys(form.customData || {}).length ? { customData: form.customData } : {})
          });
        }
      });
      if (newRecords.length === 0) return;
      if (editingDocNumber && onReplaceRecords) {
        onReplaceRecords('SALES_BILL', originalDocNumber || docNumber, newRecords);
      } else {
        if (onSaveBatch) await onSaveBatch(newRecords);
        else { for (const r of newRecords) onSave([r]); }
      }
      onBack();
      return;
    }
  };

  // ── Convert PO to PB (from-order mode) ──
  const handleConvertPOToBill = () => {
    if (selectedPOItemIds.length === 0 || !form.warehouseId) return;

    const itemsToBill = availableItemsFromSelectedPOs.filter(item => selectedPOItemIds.includes(item.id));
    const todayStr = new Date().toLocaleString();
    const firstItem = itemsToBill[0];
    let pbDocNumber = form.docNumber?.trim() || generatePBDocNumber(firstItem?.partnerId || '', firstItem?.partner || '');
    const exists = (n: string) => recordsList.some((r: any) => r.type === 'PURCHASE_BILL' && r.docNumber === n);
    let attempts = 0;
    while (exists(pbDocNumber) && attempts < 50) {
      pbDocNumber = generatePBDocNumber(firstItem?.partnerId || '', firstItem?.partner || '');
      attempts++;
    }
    const baseId = Date.now();

    let addedCount = 0;
    const newRecords: any[] = [];
    itemsToBill.forEach((item, idx) => {
      const qty = Math.max(0, selectedPOItemQuantities[item.id] ?? item.remainingQty ?? 0);
      if (qty <= 0) return;
      addedCount++;
      const batchVal = selectedPOItemBatches[item.id]?.trim();
      newRecords.push({
        ...item,
        id: `psi-pb-${baseId}-${idx}`,
        type: 'PURCHASE_BILL',
        docNumber: pbDocNumber,
        quantity: qty,
        sourceOrderNumber: item.docNumber,
        sourceLineId: item.id,
        warehouseId: form.warehouseId,
        timestamp: todayStr,
        _savedAtMs: Date.now(),
        note: form.note || `由订单[${item.docNumber}]商品明细转化`,
        operator: '张主管(订单转化)',
        lineGroupId: item.lineGroupId ?? item.id,
        createdAt: form.createdAt || new Date().toISOString().split('T')[0],
        ...(Object.keys(form.customData || {}).length ? { customData: form.customData } : {}),
        ...(batchVal && { batch: batchVal })
      });
    });

    for (const r of newRecords) onSave([r]);
    onBack();
    toast.success(`采购单 ${pbDocNumber} 已成功创建，包含 ${addedCount} 条入库明细`);
  };

  // ── Render ──
  if (formType === 'PURCHASE_ORDER') {
    return (
      <div className="max-w-5xl mx-auto space-y-4 animate-in slide-in-from-bottom-4 pb-24">
        <div className="flex items-center justify-between sticky top-0 z-40 py-4 bg-slate-50/90 backdrop-blur-md -mx-4 px-4 border-b border-slate-200">
          <button type="button" onClick={onBack} className="flex items-center gap-2 text-slate-500 hover:text-slate-800 transition-colors font-bold text-sm">
            <ArrowLeft className="w-4 h-4" /> 返回列表
          </button>
          <div className="flex items-center gap-3">
            {editingDocNumber && onDeleteRecords && hasPsiPerm('psi:purchase_order:delete') && (
              <button
                type="button"
                onClick={() => {
                  void confirm({ message: '确定要删除该采购订单吗？', danger: true }).then((ok) => {
                    if (!ok) return;
                    onDeleteRecords('PURCHASE_ORDER', editingDocNumber);
                    onBack();
                  });
                }}
                className="flex items-center gap-2 px-4 py-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-xl text-sm font-bold transition-all border border-rose-200"
              >
                <Trash2 className="w-4 h-4" /> 删除
              </button>
            )}
            <button
              type="button"
              onClick={() => handleSaveManual('PURCHASE_ORDER')}
              disabled={!form.partner || purchaseOrderItems.length === 0 || !purchaseOrderItems.some(i => {
                if (!i.productId) return false;
                const q = i.variantQuantities ? Object.values(i.variantQuantities || {}).reduce((s, v) => s + v, 0) : (i.quantity ?? 0);
                return q > 0;
              })}
              className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 shadow-lg hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50"
            >
              <Save className="w-4 h-4" /> {editingDocNumber ? '保存修改' : '确认保存采购订单'}
            </button>
          </div>
        </div>

        <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm space-y-10">
          <div className="space-y-8">
            <div className="flex items-center gap-3 border-b border-slate-200 pb-3">
              <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600"><FileText className="w-5 h-5" /></div>
              <h3 className={sectionTitleClass}>1. 采购订单基础信息</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2 space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">{partnerLabel}</label>
                <SearchablePartnerSelect
                  options={partners}
                  categories={partnerCategories}
                  value={form.partner}
                  onChange={(name, id) => setForm({ ...form, partner: name, partnerId: id })}
                  placeholder={`选择${partnerLabel}...`}
                  triggerClassName="text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">单据编号 (选填)</label>
                <div className="relative">
                  <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                  <input type="text" placeholder="留空则自动生成" value={form.docNumber} onChange={e => setForm({ ...form, docNumber: e.target.value })} className="w-full bg-slate-50 border-none rounded-xl py-3 pl-10 pr-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none h-[52px]" />
                </div>
              </div>
              {safePurchaseOrderFormSettings.standardFields.find(f => f.id === 'dueDate')?.showInCreate !== false && (
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">期望到货日期</label>
                  <input type="date" value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })} className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none h-[52px]" />
                </div>
              )}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">添加日期</label>
                <input type="date" value={form.createdAt} onChange={e => setForm({ ...form, createdAt: e.target.value })} className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none h-[52px]" />
              </div>
              {safePurchaseOrderFormSettings.standardFields.find(f => f.id === 'note')?.showInCreate !== false && (
                <div className="md:col-span-2 space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">单据备注</label>
                  <input type="text" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none h-[52px]" placeholder="备注说明..." />
                </div>
              )}
              {safePurchaseOrderFormSettings.customFields.filter(f => f.showInCreate).map(cf => (
                <div key={cf.id} className={cf.type === 'text' || cf.type === undefined ? 'md:col-span-2 space-y-1' : 'space-y-1'}>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">{cf.label}</label>
                  {cf.type === 'date' ? (
                    <input type="date" value={form.customData?.[cf.id] ?? ''} onChange={e => setForm({ ...form, customData: { ...form.customData, [cf.id]: e.target.value } })} className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none h-[52px]" />
                  ) : cf.type === 'number' ? (
                    <input type="number" value={form.customData?.[cf.id] ?? ''} onChange={e => setForm({ ...form, customData: { ...form.customData, [cf.id]: e.target.value === '' ? '' : Number(e.target.value) } })} className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none h-[52px]" />
                  ) : cf.type === 'select' ? (
                    <select value={form.customData?.[cf.id] ?? ''} onChange={e => setForm({ ...form, customData: { ...form.customData, [cf.id]: e.target.value } })} className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none h-[52px]">
                      <option value="">请选择</option>
                      {(cf.options ?? []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  ) : (
                    <input type="text" value={form.customData?.[cf.id] ?? ''} onChange={e => setForm({ ...form, customData: { ...form.customData, [cf.id]: e.target.value } })} className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none h-[52px]" placeholder={`${cf.label}`} />
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="pt-10 border-t border-slate-50 space-y-8">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600"><Layers className="w-5 h-5" /></div>
                <h3 className={sectionTitleClass}>2. 采购明细录入</h3>
              </div>
              <button type="button" onClick={addPurchaseOrderItem} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 shadow-sm hover:bg-indigo-700 active:scale-[0.98] transition-all">
                <Plus className="w-4 h-4 shrink-0" /> 添加明细行
              </button>
            </div>
            <div className="space-y-4">
              {purchaseOrderItems.map((line) => {
                const prod = productMapPSI.get(line.productId);
                const hasVariants = prod?.variants && prod.variants.length > 0;
                const lineQty = hasVariants
                  ? Object.values(line.variantQuantities || {}).reduce((s, q) => s + q, 0)
                  : (line.quantity ?? 0);
                const lineAmount = lineQty * (line.purchasePrice || 0);
                const groupedByColor: Record<string, ProductVariant[]> = {};
                if (prod?.variants) {
                  prod.variants.forEach(v => {
                    if (!groupedByColor[v.colorId]) groupedByColor[v.colorId] = [];
                    groupedByColor[v.colorId].push(v);
                  });
                }
                const poDocNum = editingDocNumber || form.docNumber || '';
                const received = poDocNum && line.sourceRecordIds
                  ? line.sourceRecordIds.reduce((s, rid) => s + (receivedByOrderLine[`${poDocNum}::${rid}`] ?? 0), 0)
                  : (poDocNum ? (receivedByOrderLine[`${poDocNum}::${line.id}`] ?? 0) : 0);
                const progress = lineQty > 0 ? Math.min(1, received / lineQty) : 0;
                return (
                <div key={line.id} className="p-4 bg-slate-50/50 rounded-2xl border border-slate-100 space-y-4 shadow-sm hover:border-indigo-100/80 transition-all">
                  <div className="flex flex-wrap items-end gap-4">
                    <div className="flex-1 min-w-[200px] space-y-2 min-w-0">
                      <label className="text-[9px] font-black text-slate-400 uppercase mb-1 block tracking-widest">目标采购品项 (支持搜索与分类筛选)</label>
                      <SearchableProductSelect
                        compact
                        categories={categories}
                        options={products}
                        value={line.productId}
                        placeholder="搜索并选择产品型号..."
                        onChange={(id) => {
                          const p = productMapPSI.get(id);
                          const hv = p?.variants && p.variants.length > 0;
                          updatePurchaseOrderItem(line.id, {
                            productId: id,
                            purchasePrice: p?.purchasePrice ?? 0,
                            quantity: hv ? undefined : 0,
                            variantQuantities: hv ? {} : undefined
                          });
                        }}
                      />
                    </div>
                    <div className="w-28 space-y-1">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">采购价 (元)</label>
                      <input type="number" min={0} step={0.01} value={line.purchasePrice || ''} onChange={e => updatePurchaseOrderItem(line.id, { purchasePrice: parseFloat(e.target.value) || 0 })} className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500" placeholder="0" />
                    </div>
                    {hasVariants && (
                      <>
                        <div className="w-24 space-y-1">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">总数</label>
                          <div className="py-2.5 px-3 text-sm font-black text-indigo-600 bg-white rounded-xl border border-slate-200">
                            {formatQtyDisplay(lineQty)} {line.productId ? getUnitName(line.productId) : '—'}
                          </div>
                        </div>
                        <div className="w-28 space-y-1">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">金额 (元)</label>
                          <div className="py-2.5 px-3 text-sm font-black text-indigo-600 bg-white rounded-xl border border-slate-200">
                            {lineAmount.toFixed(2)}
                          </div>
                        </div>
                      </>
                    )}
                    {!hasVariants && (
                      <>
                        <div className="w-24 space-y-1">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">数量</label>
                          <div className="flex items-center gap-1.5">
                            <input type="number" min={0} value={line.quantity || ''} onChange={e => updatePurchaseOrderItem(line.id, { quantity: parseInt(e.target.value) || 0 })} className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500" placeholder="0" />
                            <span className="text-[10px] font-bold text-slate-400 shrink-0">{line.productId ? getUnitName(line.productId) : '—'}</span>
                          </div>
                        </div>
                        <div className="w-28 space-y-1">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">金额 (元)</label>
                          <div className="py-2.5 px-3 text-sm font-black text-indigo-600 bg-white rounded-xl border border-slate-200">
                            {lineAmount.toFixed(2)}
                          </div>
                        </div>
                      </>
                    )}
                    {poDocNum && received > 0 && (
                      <div className="w-40 space-y-1 shrink-0">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">入库进度</label>
                        <div className="flex flex-col gap-1">
                          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden flex">
                            {received > lineQty ? (
                              <>
                                <div className="h-full bg-emerald-500" style={{ width: `${(lineQty / received) * 100}%` }} />
                                <div className="h-full bg-rose-500" style={{ width: `${((received - lineQty) / received) * 100}%` }} />
                              </>
                            ) : (
                              <div className={`h-full rounded-full ${progress >= 1 ? 'bg-emerald-500' : 'bg-indigo-500'}`} style={{ width: `${Math.min(100, progress * 100)}%` }} />
                            )}
                          </div>
                          <span className="text-[9px] font-bold text-slate-500">
                            {received > lineQty ? `已收 ${received} / ${lineQty}（已超收）` : `已收 ${received} / ${lineQty}`}
                          </span>
                        </div>
                      </div>
                    )}
                    <button type="button" onClick={() => removePurchaseOrderItem(line.id)} className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all" aria-label="删除明细行"><Trash2 className="w-5 h-5" /></button>
                  </div>
                  {hasVariants && line.productId && (
                    <div className="pt-2 border-t border-slate-100 space-y-3">
                      <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 ml-1">
                        <Layers className="w-3.5 h-3.5" /> 颜色尺码数量
                      </label>
                      {sortedVariantColorEntries(groupedByColor, prod?.colorIds, prod?.sizeIds).map(([colorId, colorVariants]) => {
                        const color = dictionaries.colors.find(c => c.id === colorId);
                        return (
                          <div key={colorId} className="flex flex-wrap items-center gap-4 bg-white/80 p-3 rounded-xl border border-slate-100">
                            <div className="flex items-center gap-2 w-28 shrink-0">
                              <div className="w-4 h-4 rounded-full border border-slate-200 shrink-0" style={{ backgroundColor: (color as any)?.value || '#e2e8f0' }} />
                              <span className="text-xs font-bold text-slate-700">{color?.name || '未命名'}</span>
                            </div>
                            <div className="flex flex-wrap gap-3">
                              {colorVariants.map(v => {
                                const size = dictionaries.sizes.find(s => s.id === v.sizeId);
                                return (
                                  <div key={v.id} className="flex flex-col gap-0.5 w-20">
                                    <span className="text-[9px] font-black text-slate-400 uppercase">{size?.name || v.skuSuffix}</span>
                                    <input
                                      type="number"
                                      min={0}
                                      placeholder="0"
                                      value={line.variantQuantities?.[v.id] ?? ''}
                                      onChange={e => updatePurchaseOrderVariantQty(line.id, v.id, parseInt(e.target.value) || 0)}
                                      className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1.5 px-2 text-sm font-black text-indigo-600 outline-none focus:ring-2 focus:ring-indigo-500 text-center"
                                    />
                                  </div>
                                );
                              })}
                            </div>
                            <div className="ml-auto text-right shrink-0">
                              <span className="text-[9px] font-black text-slate-400">小计</span>
                              <p className="text-sm font-black text-slate-600">{(colorVariants as ProductVariant[]).reduce((s, v) => s + (line.variantQuantities?.[v.id] || 0), 0)}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );})}
              {purchaseOrderItems.length === 0 && (
                <div className="py-12 border-2 border-dashed border-slate-100 rounded-2xl text-center">
                  <Layers className="w-10 h-10 text-slate-200 mx-auto mb-2" />
                  <p className="text-slate-400 text-sm font-medium">点击「添加明细行」开始录入采购明细</p>
                </div>
              )}
            </div>
            <div className="flex justify-end p-5 bg-indigo-600 rounded-2xl text-white shadow-xl shadow-indigo-100 gap-8">
              <div className="flex items-center gap-4">
                <p className="text-xs font-bold opacity-90">采购总量</p>
                <p className="text-xl font-black tabular-nums">{purchaseOrderItems.reduce((s, i) => {
                const q = i.variantQuantities ? Object.values(i.variantQuantities || {}).reduce((a, v) => a + v, 0) : (i.quantity || 0);
                return s + q;
              }, 0)} <span className="text-xs font-semibold opacity-90">PCS</span></p>
              </div>
              <div className="flex items-center gap-4 border-l border-white/30 pl-8">
                <p className="text-xs font-bold opacity-90">订单金额</p>
                <p className="text-xl font-black tabular-nums">¥{purchaseOrderItems.reduce((s, i) => {
                  const q = i.variantQuantities ? Object.values(i.variantQuantities || {}).reduce((a, v) => a + v, 0) : (i.quantity || 0);
                  return s + q * (i.purchasePrice || 0);
                }, 0).toFixed(2)}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (formType === 'SALES_ORDER') {
    return (
      <div className="max-w-6xl mx-auto space-y-4 animate-in slide-in-from-bottom-4 pb-24">
        <div className="flex items-center justify-between sticky top-0 z-40 py-4 bg-slate-50/90 backdrop-blur-md -mx-4 px-4 border-b border-slate-200">
          <button onClick={onBack} className="flex items-center gap-2 text-slate-500 font-bold text-sm hover:text-slate-800 transition-all">
            <ArrowLeft className="w-4 h-4" /> 返回列表
          </button>
          <div className="flex items-center gap-3">
            {editingDocNumber && onDeleteRecords && hasPsiPerm('psi:sales_order:delete') && (
              <button
                type="button"
                onClick={() => {
                  void confirm({ message: '确定要删除该销售订单吗？', danger: true }).then((ok) => {
                    if (!ok) return;
                    onDeleteRecords('SALES_ORDER', editingDocNumber);
                    onBack();
                  });
                }}
                className="flex items-center gap-2 px-4 py-2.5 text-rose-600 font-bold rounded-xl border border-rose-200 bg-white hover:bg-rose-50 transition-all"
              >
                <Trash2 className="w-4 h-4" /> 删除
              </button>
            )}
            <button
              onClick={() => handleSaveManual('SALES_ORDER')}
              disabled={!form.partner || salesOrderItems.length === 0 || !salesOrderItems.some(i => {
                if (!i.productId) return false;
                const q = i.variantQuantities ? Object.values(i.variantQuantities || {}).reduce((s, v) => s + v, 0) : (i.quantity ?? 0);
                return q > 0;
              })}
              className="bg-indigo-600 text-white px-8 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-lg hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50"
            >
              <Save className="w-4 h-4" /> {editingDocNumber ? '保存修改' : '确认保存销售订单'}
            </button>
          </div>
        </div>

        <div className="bg-white rounded-[40px] p-8 border border-slate-200 shadow-sm space-y-10">
          <div className="space-y-8">
            <div className="flex items-center gap-3 border-b border-slate-50 pb-4">
              <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600"><FileText className="w-5 h-5" /></div>
              <h3 className={sectionTitleClass}>1. 销售订单基础信息</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2 space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">{partnerLabel}</label>
                <SearchablePartnerSelect
                  options={partners}
                  categories={partnerCategories}
                  value={form.partner}
                  onChange={(name, id) => setForm({ ...form, partner: name, partnerId: id })}
                  placeholder={`选择${partnerLabel}...`}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">单据编号 (选填)</label>
                <div className="relative">
                  <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                  <input type="text" placeholder="留空则自动生成" value={form.docNumber} onChange={e => setForm({ ...form, docNumber: e.target.value })} className="w-full bg-slate-50 border-none rounded-xl py-3 pl-10 pr-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none h-[52px]" />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">期望交货日期</label>
                <input type="date" value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })} className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none h-[52px]" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">添加日期</label>
                <input type="date" value={form.createdAt} onChange={e => setForm({ ...form, createdAt: e.target.value })} className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none h-[52px]" />
              </div>
              <div className="md:col-span-2 space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">单据备注</label>
                <input type="text" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none h-[52px]" placeholder="备注说明..." />
              </div>
            </div>
          </div>

          <div className="pt-10 border-t border-slate-50 space-y-8">
            <div className="flex items-center justify-between border-b border-slate-50 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600"><Layers className="w-5 h-5" /></div>
                <h3 className={sectionTitleClass}>2. 销售明细录入</h3>
              </div>
              <button onClick={addSalesOrderItem} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-all">
                <Plus className="w-4 h-4" /> 添加明细行
              </button>
            </div>
            <div className="space-y-4">
              {salesOrderItems.map((line) => {
                const prod = productMapPSI.get(line.productId);
                const hasVariants = prod?.variants && prod.variants.length > 0;
                const lineQty = hasVariants
                  ? Object.values(line.variantQuantities || {}).reduce((s, q) => s + q, 0)
                  : (line.quantity ?? 0);
                const lineAmount = lineQty * (line.salesPrice || 0);
                const groupedByColor: Record<string, ProductVariant[]> = {};
                if (prod?.variants) {
                  prod.variants.forEach(v => {
                    if (!groupedByColor[v.colorId]) groupedByColor[v.colorId] = [];
                    groupedByColor[v.colorId].push(v);
                  });
                }
                return (
                <div key={line.id} className="p-5 bg-slate-50/50 rounded-2xl border border-slate-100 space-y-4">
                  <div className="flex flex-wrap items-end gap-4">
                    <div className="flex-1 min-w-[240px] space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">目标商品 (支持搜索与分类筛选)</label>
                      <SearchableProductSelect
                        options={products}
                        categories={categories}
                        value={line.productId}
                        onChange={(id) => {
                          const p = productMapPSI.get(id);
                          const hv = p?.variants && p.variants.length > 0;
                          updateSalesOrderItem(line.id, {
                            productId: id,
                            salesPrice: p?.salesPrice ?? 0,
                            quantity: hv ? undefined : 0,
                            variantQuantities: hv ? {} : undefined
                          });
                        }}
                      />
                    </div>
                    <div className="w-28 space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">销售价 (元)</label>
                      <input type="number" min={0} step={0.01} value={line.salesPrice || ''} onChange={e => updateSalesOrderItem(line.id, { salesPrice: parseFloat(e.target.value) || 0 })} className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500" placeholder="0" />
                    </div>
                    {hasVariants && (
                      <>
                        <div className="w-24 space-y-1">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">总数</label>
                          <div className="py-2.5 px-3 text-sm font-black text-indigo-600 bg-white rounded-xl border border-slate-200">
                            {formatQtyDisplay(lineQty)} {line.productId ? getUnitName(line.productId) : '—'}
                          </div>
                        </div>
                        <div className="w-28 space-y-1">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">金额 (元)</label>
                          <div className="py-2.5 px-3 text-sm font-black text-indigo-600 bg-white rounded-xl border border-slate-200">
                            {lineAmount.toFixed(2)}
                          </div>
                        </div>
                      </>
                    )}
                    {!hasVariants && (
                      <>
                        <div className="w-28 space-y-1">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">销售数量（无颜色尺码）</label>
                          <div className="flex items-center gap-1.5">
                            <input type="number" min={0} value={line.quantity || ''} onChange={e => updateSalesOrderItem(line.id, { quantity: parseInt(e.target.value) || 0 })} className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500" placeholder="0" />
                            <span className="text-[10px] font-bold text-slate-400 shrink-0">{line.productId ? getUnitName(line.productId) : '—'}</span>
                          </div>
                        </div>
                        <div className="w-28 space-y-1">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">金额 (元)</label>
                          <div className="py-2.5 px-3 text-sm font-black text-indigo-600 bg-white rounded-xl border border-slate-200">
                            {lineAmount.toFixed(2)}
                          </div>
                        </div>
                      </>
                    )}
                    <button onClick={() => removeSalesOrderItem(line.id)} className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"><Trash2 className="w-5 h-5" /></button>
                  </div>
                  {hasVariants && line.productId && (
                    <div className="pt-4 border-t border-slate-100 space-y-4">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">数量明细（有颜色尺码）</p>
                      {sortedVariantColorEntries(groupedByColor, prod?.colorIds, prod?.sizeIds).map(([colorId, colorVariants]) => {
                        const color = dictionaries.colors.find(c => c.id === colorId);
                        return (
                          <div key={colorId} className="flex flex-wrap items-center gap-4 bg-white p-4 rounded-[20px] border border-slate-100 shadow-sm">
                            <div className="flex items-center gap-2 w-28 shrink-0">
                              <div className="w-4 h-4 rounded-full border border-slate-200 shrink-0" style={{ backgroundColor: (color as any)?.value || '#e2e8f0' }} />
                              <span className="text-xs font-bold text-slate-700">{color?.name || '未命名'}</span>
                            </div>
                            <div className="flex flex-wrap gap-3">
                              {colorVariants.map(v => {
                                const size = dictionaries.sizes.find(s => s.id === v.sizeId);
                                return (
                                  <div key={v.id} className="flex flex-col gap-0.5 w-20">
                                    <span className="text-[9px] font-black text-slate-400 uppercase">{size?.name || v.skuSuffix}</span>
                                    <input
                                      type="number"
                                      min={0}
                                      placeholder="0"
                                      value={line.variantQuantities?.[v.id] ?? ''}
                                      onChange={e => updateSalesOrderVariantQty(line.id, v.id, parseInt(e.target.value) || 0)}
                                      className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1.5 px-2 text-sm font-black text-indigo-600 outline-none focus:ring-2 focus:ring-indigo-500 text-center"
                                    />
                                  </div>
                                );
                              })}
                            </div>
                            <div className="ml-auto text-right shrink-0 bg-slate-50/80 px-3 py-2 rounded-xl border border-slate-100">
                              <p className="text-[9px] font-black text-slate-400 uppercase">颜色小计</p>
                              <p className="text-sm font-black text-slate-600">{(colorVariants as ProductVariant[]).reduce((s, v) => s + (line.variantQuantities?.[v.id] || 0), 0)}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );})}
              {salesOrderItems.length === 0 && (
                <div className="py-12 border-2 border-dashed border-slate-100 rounded-2xl text-center">
                  <Layers className="w-10 h-10 text-slate-200 mx-auto mb-2" />
                  <p className="text-slate-400 text-sm font-medium">点击「添加明细行」开始录入销售明细</p>
                </div>
              )}
            </div>
            <div className="flex justify-end p-4 bg-indigo-600 rounded-[24px] text-white shadow-xl shadow-indigo-100 gap-8">
              <div className="flex items-center gap-4">
                <p className="text-xs font-bold opacity-80">销售总量:</p>
                <p className="text-xl font-black">{salesOrderItems.reduce((s, i) => {
                const q = i.variantQuantities ? Object.values(i.variantQuantities || {}).reduce((a, v) => a + v, 0) : (i.quantity || 0);
                return s + q;
              }, 0)} <span className="text-xs font-medium">PCS</span></p>
              </div>
              <div className="flex items-center gap-4 border-l border-white/30 pl-8">
                <p className="text-xs font-bold opacity-80">订单金额:</p>
                <p className="text-xl font-black">¥{salesOrderItems.reduce((s, i) => {
                  const q = i.variantQuantities ? Object.values(i.variantQuantities || {}).reduce((a, v) => a + v, 0) : (i.quantity || 0);
                  return s + q * (i.salesPrice || 0);
                }, 0).toFixed(2)}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (formType === 'SALES_BILL') {
    return (
      <div className="max-w-6xl mx-auto space-y-4 animate-in slide-in-from-bottom-4 pb-24">
        <div className="flex items-center justify-between sticky top-0 z-40 py-4 bg-slate-50/90 backdrop-blur-md -mx-4 px-4 border-b border-slate-200">
          <button onClick={onBack} className="flex items-center gap-2 text-slate-500 font-bold text-sm hover:text-slate-800 transition-all">
            <ArrowLeft className="w-4 h-4" /> 返回列表
          </button>
          <div className="flex items-center gap-3">
            {editingDocNumber && onDeleteRecords && hasPsiPerm('psi:sales_bill:delete') && (
              <button
                type="button"
                onClick={() => {
                  void confirm({ message: '确定要删除该销售单吗？', danger: true }).then((ok) => {
                    if (!ok) return;
                    onDeleteRecords('SALES_BILL', editingDocNumber);
                    onBack();
                  });
                }}
                className="flex items-center gap-2 px-4 py-2.5 text-rose-600 font-bold rounded-xl border border-rose-200 bg-white hover:bg-rose-50 transition-all"
              >
                <Trash2 className="w-4 h-4" /> 删除
              </button>
            )}
            <button
              onClick={() => handleSaveManual('SALES_BILL')}
              disabled={!form.partner || !form.warehouseId || salesBillItems.length === 0 || !salesBillItems.some(i => {
                if (!i.productId) return false;
                const q = i.variantQuantities ? Object.values(i.variantQuantities || {}).reduce((s, v) => s + v, 0) : (i.quantity ?? 0);
                return q !== 0;
              })}
              className="bg-indigo-600 text-white px-8 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-lg hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50"
            >
              <Save className="w-4 h-4" /> {editingDocNumber ? '保存修改' : '确认保存销售单'}
            </button>
          </div>
        </div>

        <div className="bg-white rounded-[40px] p-8 border border-slate-200 shadow-sm space-y-10">
          <div className="space-y-8">
            <div className="flex items-center gap-3 border-b border-slate-50 pb-4">
              <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600"><FileText className="w-5 h-5" /></div>
              <h3 className={sectionTitleClass}>1. 销售单基础信息</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2 space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">{partnerLabel}</label>
                <SearchablePartnerSelect
                  options={partners}
                  categories={partnerCategories}
                  value={form.partner}
                  onChange={(name, id) => setForm({ ...form, partner: name, partnerId: id })}
                  placeholder={`选择${partnerLabel}...`}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">出库仓库</label>
                <select value={form.warehouseId} onChange={e => setForm({ ...form, warehouseId: e.target.value })} className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none h-[52px]">
                  <option value="">选择仓库...</option>
                  {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">单据编号 (选填)</label>
                <div className="relative">
                  <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                  <input type="text" placeholder="留空则自动生成" value={form.docNumber} onChange={e => setForm({ ...form, docNumber: e.target.value })} className="w-full bg-slate-50 border-none rounded-xl py-3 pl-10 pr-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none h-[52px]" />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">添加日期</label>
                <input type="date" value={form.createdAt} onChange={e => setForm({ ...form, createdAt: e.target.value })} className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none h-[52px]" />
              </div>
              <div className="md:col-span-2 space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">单据备注</label>
                <input type="text" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none h-[52px]" placeholder="备注说明..." />
              </div>
            </div>
          </div>

          <div className="pt-10 border-t border-slate-50 space-y-8">
            <div className="flex items-center justify-between border-b border-slate-50 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600"><Layers className="w-5 h-5" /></div>
                <h3 className={sectionTitleClass}>2. 销售出库明细</h3>
              </div>
              <button onClick={addSalesBillItem} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-all">
                <Plus className="w-4 h-4" /> 添加明细行
              </button>
            </div>
            <div className="space-y-4">
              {salesBillItems.map((line) => {
                const prod = productMapPSI.get(line.productId);
                const hasVariants = prod?.variants && prod.variants.length > 0;
                const lineQty = hasVariants
                  ? Object.values(line.variantQuantities || {}).reduce((s, q) => s + q, 0)
                  : (line.quantity ?? 0);
                const lineAmount = lineQty * (line.salesPrice || 0);
                const groupedByColor: Record<string, ProductVariant[]> = {};
                if (prod?.variants) {
                  prod.variants.forEach(v => {
                    if (!groupedByColor[v.colorId]) groupedByColor[v.colorId] = [];
                    groupedByColor[v.colorId].push(v);
                  });
                }
                return (
                <div key={line.id} className="p-5 bg-slate-50/50 rounded-2xl border border-slate-100 space-y-4">
                  <div className="flex flex-wrap items-end gap-4">
                    <div className="flex-1 min-w-[240px] space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">目标商品 (支持搜索与分类筛选)</label>
                      <SearchableProductSelect
                        options={products}
                        categories={categories}
                        value={line.productId}
                        onChange={(id) => {
                          const p = productMapPSI.get(id);
                          const hv = p?.variants && p.variants.length > 0;
                          updateSalesBillItem(line.id, {
                            productId: id,
                            salesPrice: p?.salesPrice ?? 0,
                            quantity: hv ? undefined : 0,
                            variantQuantities: hv ? {} : undefined
                          });
                        }}
                      />
                    </div>
                    <div className="w-28 space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">销售价 (元)</label>
                      <input type="number" min={0} step={0.01} value={line.salesPrice || ''} onChange={e => updateSalesBillItem(line.id, { salesPrice: parseFloat(e.target.value) || 0 })} className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500" placeholder="0" />
                    </div>
                    {hasVariants && (
                      <>
                        <div className="w-24 space-y-1">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">总数</label>
                          <div className="py-2.5 px-3 text-sm font-black text-indigo-600 bg-white rounded-xl border border-slate-200">
                            {formatQtyDisplay(lineQty)} {line.productId ? getUnitName(line.productId) : '—'}
                          </div>
                        </div>
                        <div className="w-28 space-y-1">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">金额 (元)</label>
                          <div className="py-2.5 px-3 text-sm font-black text-indigo-600 bg-white rounded-xl border border-slate-200">
                            {lineAmount.toFixed(2)}
                          </div>
                        </div>
                      </>
                    )}
                    {!hasVariants && (
                      <>
                        <div className="w-28 space-y-1">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">出库数量（负数=退货）</label>
                          <div className="flex items-center gap-1.5">
                            <input type="number" value={line.quantity ?? ''} onChange={e => { const v = parseInt(e.target.value, 10); updateSalesBillItem(line.id, { quantity: Number.isNaN(v) ? 0 : v }); }} className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500" placeholder="0" />
                            <span className="text-[10px] font-bold text-slate-400 shrink-0">{line.productId ? getUnitName(line.productId) : '—'}</span>
                          </div>
                        </div>
                        <div className="w-28 space-y-1">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">金额 (元)</label>
                          <div className="py-2.5 px-3 text-sm font-black text-indigo-600 bg-white rounded-xl border border-slate-200">
                            {lineAmount.toFixed(2)}
                          </div>
                        </div>
                      </>
                    )}
                    <button onClick={() => removeSalesBillItem(line.id)} className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"><Trash2 className="w-5 h-5" /></button>
                  </div>
                  {hasVariants && line.productId && (
                    <div className="pt-4 border-t border-slate-100 space-y-4">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">数量明细（有颜色尺码）</p>
                      {sortedVariantColorEntries(groupedByColor, prod?.colorIds, prod?.sizeIds).map(([colorId, colorVariants]) => {
                        const color = dictionaries.colors.find(c => c.id === colorId);
                        return (
                          <div key={colorId} className="flex flex-wrap items-center gap-4 bg-white p-4 rounded-[20px] border border-slate-100 shadow-sm">
                            <div className="flex items-center gap-2 w-28 shrink-0">
                              <div className="w-4 h-4 rounded-full border border-slate-200 shrink-0" style={{ backgroundColor: (color as any)?.value || '#e2e8f0' }} />
                              <span className="text-xs font-bold text-slate-700">{color?.name || '未命名'}</span>
                            </div>
                            <div className="flex flex-wrap gap-3">
                              {colorVariants.map(v => {
                                const size = dictionaries.sizes.find(s => s.id === v.sizeId);
                                return (
                                  <div key={v.id} className="flex flex-col gap-0.5 w-20">
                                    <span className="text-[9px] font-black text-slate-400 uppercase">{size?.name || v.skuSuffix}</span>
                                    <input
                                      type="number"
                                      placeholder="0"
                                      value={line.variantQuantities?.[v.id] ?? ''}
                                      onChange={e => { const vv = parseInt(e.target.value, 10); updateSalesBillVariantQty(line.id, v.id, Number.isNaN(vv) ? 0 : vv); }}
                                      className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1.5 px-2 text-sm font-black text-indigo-600 outline-none focus:ring-2 focus:ring-indigo-500 text-center"
                                    />
                                  </div>
                                );
                              })}
                            </div>
                            <div className="ml-auto text-right shrink-0 bg-slate-50/80 px-3 py-2 rounded-xl border border-slate-100">
                              <p className="text-[9px] font-black text-slate-400 uppercase">颜色小计</p>
                              <p className="text-sm font-black text-slate-600">{(colorVariants as ProductVariant[]).reduce((s, v) => s + (line.variantQuantities?.[v.id] || 0), 0)}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );})}
              {salesBillItems.length === 0 && (
                <div className="py-12 border-2 border-dashed border-slate-100 rounded-2xl text-center">
                  <Layers className="w-10 h-10 text-slate-200 mx-auto mb-2" />
                  <p className="text-slate-400 text-sm font-medium">点击「添加明细行」开始录入销售出库明细（数量可填负数表示退货）</p>
                </div>
              )}
            </div>
            <div className="flex justify-end p-4 bg-indigo-600 rounded-[24px] text-white shadow-xl shadow-indigo-100 gap-8">
              <div className="flex items-center gap-4">
                <p className="text-xs font-bold opacity-80">出库总量:</p>
                <p className="text-xl font-black">{salesBillItems.reduce((s, i) => {
                const q = i.variantQuantities ? Object.values(i.variantQuantities || {}).reduce((a, v) => a + v, 0) : (i.quantity || 0);
                return s + q;
              }, 0)} <span className="text-xs font-medium">PCS</span></p>
              </div>
              <div className="flex items-center gap-4 border-l border-white/30 pl-8">
                <p className="text-xs font-bold opacity-80">单据金额:</p>
                <p className="text-xl font-black">¥{salesBillItems.reduce((s, i) => {
                  const q = i.variantQuantities ? Object.values(i.variantQuantities || {}).reduce((a, v) => a + v, 0) : (i.quantity || 0);
                  return s + q * (i.salesPrice || 0);
                }, 0).toFixed(2)}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (formType === 'PURCHASE_BILL') {
    return (
      <div className="max-w-5xl mx-auto space-y-4 animate-in slide-in-from-bottom-4 pb-24">
        <div className="flex items-center justify-between sticky top-0 z-40 py-4 bg-slate-50/90 backdrop-blur-md -mx-4 px-4 border-b border-slate-200">
          <button
            onClick={() => {
              onBack();
            }}
            className="flex items-center gap-2 text-slate-500 font-bold text-sm hover:text-slate-800 transition-all"
          >
            <ArrowLeft className="w-4 h-4" /> 返回列表
          </button>
          <div className="flex items-center gap-3">
            {editingDocNumber && onDeleteRecords && hasPsiPerm('psi:purchase_bill:delete') && (
              <button
                type="button"
                onClick={() => {
                  void confirm({ message: '确定要删除该采购单吗？', danger: true }).then((ok) => {
                    if (!ok) return;
                    onDeleteRecords('PURCHASE_BILL', editingDocNumber);
                    onBack();
                  });
                }}
                className="flex items-center gap-2 px-4 py-2.5 text-rose-600 font-bold rounded-xl border border-rose-200 bg-white hover:bg-rose-50 transition-all"
              >
                <Trash2 className="w-4 h-4" /> 删除
              </button>
            )}
            {!editingDocNumber && (
            <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-sm">
              <button onClick={() => { setCreationMethod('MANUAL'); setPurchaseBillItems([]); }} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${creationMethod === 'MANUAL' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
                <Plus className="w-3 h-3" /> 直接手动创建
              </button>
              <button onClick={() => { setCreationMethod('FROM_ORDER'); setPurchaseBillItems([]); }} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${creationMethod === 'FROM_ORDER' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
                <ClipboardList className="w-3 h-3" /> 引用采购订单生成
              </button>
            </div>
            )}
            {(!editingDocNumber ? creationMethod === 'MANUAL' : true) ? (
              <button
                onClick={() => handleSaveManual('PURCHASE_BILL')}
                disabled={!form.partner || !form.warehouseId || purchaseBillItems.length === 0 || !purchaseBillItems.some(i => {
                if (!i.productId) return false;
                const q = i.variantQuantities ? Object.values(i.variantQuantities || {}).reduce((s, v) => s + v, 0) : (i.quantity ?? 0);
                return q > 0;
              })}
                className="bg-indigo-600 text-white px-8 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-lg hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50"
              >
                <Save className="w-4 h-4" /> {editingDocNumber ? '保存修改' : '确认保存采购单'}
              </button>
            ) : (
              <button
                onClick={handleConvertPOToBill}
                disabled={!form.warehouseId || selectedPOItemIds.length === 0 || selectedPOItemIds.every(id => (selectedPOItemQuantities[id] ?? 0) <= 0)}
                className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-lg hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50 text-sm"
              >
                <ArrowDownToLine className="w-4 h-4" />
                执行入库 ({selectedPOItemIds.filter(id => (selectedPOItemQuantities[id] ?? 0) > 0).length} 条)
              </button>
            )}
          </div>
        </div>

        <div className="bg-white rounded-[40px] p-8 border border-slate-200 shadow-sm space-y-10">
          {(!editingDocNumber ? creationMethod === 'MANUAL' : true) ? (
            <>
              <div className="space-y-8">
                <div className="flex items-center gap-3 border-b border-slate-50 pb-4">
                  <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600"><FileText className="w-5 h-5" /></div>
                  <h3 className={sectionTitleClass}>1. 采购单基础信息</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">单据编号 (选填)</label>
                    <div className="relative">
                      <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                      <input type="text" placeholder="留空则自动生成" value={form.docNumber} onChange={e => setForm({...form, docNumber: e.target.value})} className="w-full bg-slate-50 border-none rounded-xl py-3 pl-10 pr-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none h-[52px]" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">供应商</label>
                    <SearchablePartnerSelect
                      options={partners}
                      categories={partnerCategories}
                      value={form.partner}
                      onChange={(name, id) => setForm({ ...form, partner: name, partnerId: id })}
                      placeholder="选择供应商..."
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">添加日期</label>
                    <input type="date" value={form.createdAt} onChange={e => setForm({...form, createdAt: e.target.value})} className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none h-[52px]" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">入库仓库</label>
                    <select value={form.warehouseId} onChange={e => setForm({...form, warehouseId: e.target.value})} className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500">
                      <option value="">选择仓库...</option>
                      {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                    </select>
                  </div>
                  {safePurchaseBillFormSettings.standardFields.find(f => f.id === 'note')?.showInCreate !== false && (
                    <div className="md:col-span-2 space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">单据备注</label>
                      <input type="text" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none h-[52px]" placeholder="备注说明..." />
                    </div>
                  )}
                  {safePurchaseBillFormSettings.customFields.filter(f => f.showInCreate).map(cf => (
                    <div key={cf.id} className={cf.type === 'text' || cf.type === undefined ? 'md:col-span-2 space-y-1' : 'space-y-1'}>
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">{cf.label}</label>
                      {cf.type === 'date' ? (
                        <input type="date" value={form.customData?.[cf.id] ?? ''} onChange={e => setForm({ ...form, customData: { ...form.customData, [cf.id]: e.target.value } })} className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none h-[52px]" />
                      ) : cf.type === 'number' ? (
                        <input type="number" value={form.customData?.[cf.id] ?? ''} onChange={e => setForm({ ...form, customData: { ...form.customData, [cf.id]: e.target.value === '' ? '' : Number(e.target.value) } })} className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none h-[52px]" />
                      ) : cf.type === 'select' ? (
                        <select value={form.customData?.[cf.id] ?? ''} onChange={e => setForm({ ...form, customData: { ...form.customData, [cf.id]: e.target.value } })} className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none h-[52px]">
                          <option value="">请选择</option>
                          {(cf.options ?? []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                      ) : (
                        <input type="text" value={form.customData?.[cf.id] ?? ''} onChange={e => setForm({ ...form, customData: { ...form.customData, [cf.id]: e.target.value } })} className="w-full bg-slate-50 border-none rounded-xl py-3 px-4 font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none h-[52px]" placeholder={`${cf.label}`} />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-10 border-t border-slate-50 space-y-8">
                <div className="flex items-center justify-between border-b border-slate-50 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600"><Layers className="w-5 h-5" /></div>
                    <h3 className={sectionTitleClass}>2. 入库明细录入</h3>
                  </div>
                  <button onClick={addPurchaseBillItem} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-all">
                    <Plus className="w-4 h-4" /> 添加明细行
                  </button>
                </div>
                <div className="space-y-4">
                  {purchaseBillItems.map((line) => {
                    const pbProd = productMapPSI.get(line.productId);
                    const pbHasVariants = pbProd?.variants && pbProd.variants.length > 0;
                    const pbLineQty = pbHasVariants
                      ? Object.values(line.variantQuantities || {}).reduce((s, q) => s + q, 0)
                      : (line.quantity ?? 0);
                    const pbLineAmount = pbLineQty * (line.purchasePrice || 0);
                    const pbGroupedByColor: Record<string, ProductVariant[]> = {};
                    if (pbProd?.variants) {
                      pbProd.variants.forEach(v => {
                        if (!pbGroupedByColor[v.colorId]) pbGroupedByColor[v.colorId] = [];
                        pbGroupedByColor[v.colorId].push(v);
                      });
                    }
                    return (
                    <div key={line.id} className="p-4 bg-slate-50/50 rounded-2xl border border-slate-100 space-y-4">
                      <div className="flex flex-wrap items-end gap-4">
                        <div className="flex-1 min-w-[200px] space-y-1">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">目标采购品项 (支持搜索与分类筛选)</label>
                          <SearchableProductSelect options={products} categories={categories} value={line.productId} onChange={(id) => {
                            const p = productMapPSI.get(id);
                            const hv = p?.variants && p.variants.length > 0;
                            updatePurchaseBillItem(line.id, {
                              productId: id,
                              purchasePrice: p?.purchasePrice ?? 0,
                              quantity: hv ? undefined : 0,
                              variantQuantities: hv ? {} : undefined,
                              batch: undefined
                            });
                          }} />
                        </div>
                        <div className="w-28 space-y-1">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">采购价 (元)</label>
                          <input type="number" min={0} step={0.01} value={line.purchasePrice || ''} onChange={e => updatePurchaseBillItem(line.id, { purchasePrice: parseFloat(e.target.value) || 0 })} className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500" placeholder="0" />
                        </div>
                        {pbHasVariants && (
                          <>
                            <div className="w-24 space-y-1">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">总数</label>
                              <div className="py-2.5 px-3 text-sm font-black text-indigo-600 bg-white rounded-xl border border-slate-200">
                                {formatQtyDisplay(pbLineQty)} {line.productId ? getUnitName(line.productId) : '—'}
                              </div>
                            </div>
                            <div className="w-28 space-y-1">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">金额 (元)</label>
                              <div className="py-2.5 px-3 text-sm font-black text-indigo-600 bg-white rounded-xl border border-slate-200">
                                {pbLineAmount.toFixed(2)}
                              </div>
                            </div>
                            {pbProd && categoryMapPSI.get(pbProd.categoryId)?.hasBatchManagement && (
                              <div className="w-28 space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">批次</label>
                                <input type="text" value={line.batch || ''} onChange={e => updatePurchaseBillItem(line.id, { batch: e.target.value.trim() || undefined })} className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500" placeholder="批号" />
                              </div>
                            )}
                          </>
                        )}
                        {!pbHasVariants && (
                          <>
                            <div className="w-24 space-y-1">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">数量</label>
                              <div className="flex items-center gap-1.5">
                                <input type="number" min={0} value={line.quantity || ''} onChange={e => updatePurchaseBillItem(line.id, { quantity: parseInt(e.target.value) || 0 })} className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500" placeholder="0" />
                                <span className="text-[10px] font-bold text-slate-400 shrink-0">{line.productId ? getUnitName(line.productId) : '—'}</span>
                              </div>
                            </div>
                            <div className="w-28 space-y-1">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">金额 (元)</label>
                              <div className="py-2.5 px-3 text-sm font-black text-indigo-600 bg-white rounded-xl border border-slate-200">
                                {pbLineAmount.toFixed(2)}
                              </div>
                            </div>
                            {pbProd && categoryMapPSI.get(pbProd.categoryId)?.hasBatchManagement && (
                              <div className="w-28 space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">批次</label>
                                <input type="text" value={line.batch || ''} onChange={e => updatePurchaseBillItem(line.id, { batch: e.target.value.trim() || undefined })} className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500" placeholder="批号" />
                              </div>
                            )}
                          </>
                        )}
                        <button onClick={() => removePurchaseBillItem(line.id)} className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"><Trash2 className="w-5 h-5" /></button>
                      </div>
                      {pbHasVariants && line.productId && (
                        <div className="pt-2 border-t border-slate-100 space-y-3">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">颜色尺码数量</label>
                          {sortedVariantColorEntries(pbGroupedByColor, pbProd?.colorIds, pbProd?.sizeIds).map(([colorId, colorVariants]) => {
                            const color = dictionaries.colors.find(c => c.id === colorId);
                            return (
                              <div key={colorId} className="flex flex-wrap items-center gap-4 bg-white/80 p-3 rounded-xl border border-slate-100">
                                <div className="flex items-center gap-2 w-28 shrink-0">
                                  <div className="w-4 h-4 rounded-full border border-slate-200 shrink-0" style={{ backgroundColor: (color as any)?.value || '#e2e8f0' }} />
                                  <span className="text-xs font-bold text-slate-700">{color?.name || '未命名'}</span>
                                </div>
                                <div className="flex flex-wrap gap-3">
                                  {colorVariants.map(v => {
                                    const size = dictionaries.sizes.find(s => s.id === v.sizeId);
                                    return (
                                      <div key={v.id} className="flex flex-col gap-0.5 w-20">
                                        <span className="text-[9px] font-black text-slate-400 uppercase">{size?.name || v.skuSuffix}</span>
                                        <input
                                          type="number"
                                          min={0}
                                          placeholder="0"
                                          value={line.variantQuantities?.[v.id] ?? ''}
                                          onChange={e => updatePurchaseBillVariantQty(line.id, v.id, parseInt(e.target.value) || 0)}
                                          className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1.5 px-2 text-sm font-black text-indigo-600 outline-none focus:ring-2 focus:ring-indigo-500 text-center"
                                        />
                                      </div>
                                    );
                                  })}
                                </div>
                                <div className="ml-auto text-right shrink-0">
                                  <span className="text-[9px] font-black text-slate-400">小计</span>
                                  <p className="text-sm font-black text-slate-600">{(colorVariants as ProductVariant[]).reduce((s, v) => s + (line.variantQuantities?.[v.id] || 0), 0)}</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );})}
                  {purchaseBillItems.length === 0 && (
                    <div className="py-12 border-2 border-dashed border-slate-100 rounded-2xl text-center">
                      <Layers className="w-10 h-10 text-slate-200 mx-auto mb-2" />
                      <p className="text-slate-400 text-sm font-medium">点击「添加明细行」开始录入入库明细</p>
                    </div>
                  )}
                </div>
                <div className="flex justify-end p-4 bg-indigo-600 rounded-[24px] text-white shadow-xl shadow-indigo-100 gap-8">
                  <div className="flex items-center gap-4">
                    <p className="text-xs font-bold opacity-80">入库总量:</p>
                    <p className="text-xl font-black">{purchaseBillItems.reduce((s, i) => s + (i.quantity || 0), 0)} <span className="text-xs font-medium">PCS</span></p>
                  </div>
                  <div className="flex items-center gap-4 border-l border-white/30 pl-8">
                    <p className="text-xs font-bold opacity-80">总金额:</p>
                    <p className="text-xl font-black">¥{purchaseBillItems.reduce((s, i) => s + (i.quantity || 0) * (i.purchasePrice || 0), 0).toFixed(2)}</p>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="space-y-8">
              <div className="space-y-4">
                <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><ClipboardList className="w-4 h-4" /> 1. 选择来源订单</h4>
                {pendingPOs.length === 0 ? (
                  <div className="py-12 border-2 border-dashed border-slate-100 rounded-3xl text-center">
                    <AlertCircle className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                    <p className="text-slate-400 font-bold italic text-xs">暂无未入库完成的采购订单</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {pendingPOs.map(([docNum, items]) => {
                      const isSelected = selectedPOOrderNums.includes(docNum);
                      const partnerName = items[0]?.partner;
                      return (
                        <button
                          key={docNum}
                          onClick={() => {
                            if (selectedPOOrderNums.length > 0) {
                              const currentPartner = allPOByGroups[selectedPOOrderNums[0]][0]?.partner;
                              if (partnerName !== currentPartner) {
                                toast.error("不可跨供应商引用订单！");
                                return;
                              }
                            }
                            setSelectedPOOrderNums(prev => prev.includes(docNum) ? prev.filter(n => n !== docNum) : [...prev, docNum]);
                          }}
                          className={`p-4 rounded-[24px] border-2 text-left transition-all flex items-center justify-between ${isSelected ? 'border-indigo-600 bg-indigo-50' : 'border-slate-50 bg-slate-50 hover:border-indigo-200'}`}
                        >
                          <div>
                            <p className="text-sm font-black text-slate-800">{docNum}</p>
                            <p className="text-[10px] text-slate-400 font-bold uppercase">{partnerName}</p>
                          </div>
                          {isSelected ? <CheckSquare className="w-5 h-5 text-indigo-600" /> : <Square className="w-5 h-5 text-slate-200" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {selectedPOOrderNums.length > 0 && (
                <div className="space-y-4 pt-4 border-t border-slate-100">
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><ListFilter className="w-4 h-4" /> 2. 勾选并填写本次入库数量 (支持部分到货)</h4>
                  <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-slate-50/80 border-b border-slate-100">
                          <th className="px-4 py-3 w-10 text-center">
                            <button onClick={(e) => {
                              e.stopPropagation();
                              if (selectedPOItemIds.length === availableItemsFromSelectedPOs.length) {
                                setSelectedPOItemIds([]);
                                setSelectedPOItemQuantities({});
                                setSelectedPOItemBatches({});
                              } else {
                                const ids = availableItemsFromSelectedPOs.map(i => i.id);
                                setSelectedPOItemIds(ids);
                                setSelectedPOItemQuantities(prev => {
                                  const next = { ...prev };
                                  availableItemsFromSelectedPOs.forEach(i => { next[i.id] = i.remainingQty; });
                                  return next;
                                });
                              }
                            }} className="text-slate-400 hover:text-indigo-600">
                              {selectedPOItemIds.length === availableItemsFromSelectedPOs.length ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                            </button>
                          </th>
                          <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">源订单 / 商品</th>
                          <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">采购价</th>
                          <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">订单数量</th>
                          <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">已收</th>
                          <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">待收</th>
                          <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">本次入库数量</th>
                          <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">批次</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {availableItemsFromSelectedPOs.map((item) => {
                          const product = productMapPSI.get(item.productId);
                          const prodCategory = product && categoryMapPSI.get(product.categoryId);
                          const hasBatch = prodCategory?.hasBatchManagement;
                          const isChecked = selectedPOItemIds.includes(item.id);
                          const qty = selectedPOItemQuantities[item.id] ?? item.remainingQty;
                          const handleToggle = () => {
                            if (isChecked) {
                              setSelectedPOItemIds(prev => prev.filter(id => id !== item.id));
                              setSelectedPOItemQuantities(prev => { const n = { ...prev }; delete n[item.id]; return n; });
                              setSelectedPOItemBatches(prev => { const n = { ...prev }; delete n[item.id]; return n; });
                            } else {
                              setSelectedPOItemIds(prev => [...prev, item.id]);
                              setSelectedPOItemQuantities(prev => ({ ...prev, [item.id]: item.remainingQty }));
                            }
                          };
                          return (
                            <tr key={item.id} onClick={() => handleToggle()} className={`cursor-pointer transition-colors ${isChecked ? 'bg-indigo-50/30' : 'hover:bg-slate-50/50'}`}>
                              <td className="px-4 py-3 text-center">
                                {isChecked ? <CheckSquare className="w-4 h-4 text-indigo-600" /> : <Square className="w-4 h-4 text-slate-300" />}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex flex-col">
                                  <span className="text-[9px] font-black text-slate-300 uppercase">{item.docNumber}</span>
                                  <span className="text-xs font-bold text-slate-700">{product?.name}</span>
                                  <span className="text-[8px] text-slate-400 uppercase tracking-tighter">
                                    SKU: {product?.sku}
                                    {item.variantId && product?.variants && (() => {
                                      const v = product.variants.find((x: ProductVariant) => x.id === item.variantId);
                                      if (!v) return '';
                                      const c = dictionaries.colors.find(x => x.id === v.colorId)?.name;
                                      const s = dictionaries.sizes.find(x => x.id === v.sizeId)?.name;
                                      return (c || s) ? ` · ${[c, s].filter(Boolean).join(' / ')}` : '';
                                    })()}
                                  </span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-right"><span className="text-xs font-bold text-slate-500">¥{(item.purchasePrice ?? 0).toFixed(2)}</span></td>
                              <td className="px-4 py-3 text-right"><span className="text-sm font-bold text-slate-600">{formatQtyDisplay(item.quantity)} {item.productId ? getUnitName(item.productId) : 'PCS'}</span></td>
                              <td className="px-4 py-3 text-right"><span className="text-xs font-bold text-slate-400">{item.receivedQty}</span></td>
                              <td className="px-4 py-3 text-right"><span className="text-sm font-black text-indigo-600">{item.remainingQty}</span></td>
                              <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                                {isChecked ? (
                                  <input type="number" min={0} value={qty} onChange={e => {
                                    const v = parseFloat(e.target.value);
                                    const val = Number.isFinite(v) ? Math.max(0, v) : 0;
                                    setSelectedPOItemQuantities(prev => ({ ...prev, [item.id]: val }));
                                  }} className="w-20 text-right py-1.5 px-2 rounded-lg border border-slate-200 text-sm font-black text-indigo-600 focus:ring-2 focus:ring-indigo-500 outline-none" title="允许超过采购订单数量（如超收）" />
                                ) : <span className="text-slate-300">—</span>}
                              </td>
                              <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                                {isChecked && hasBatch ? (
                                  <input type="text" value={selectedPOItemBatches[item.id] ?? ''} onChange={e => setSelectedPOItemBatches(prev => ({ ...prev, [item.id]: e.target.value }))} placeholder="批号" className="w-24 py-1.5 px-2 rounded-lg border border-slate-200 text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none" />
                                ) : <span className="text-slate-300">—</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {selectedPOItemIds.length > 0 && (
                <div className="space-y-4 pt-4 border-t border-slate-100">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">本次入库单号 (选填)</label>
                      <input type="text" placeholder="留空则自动生成" value={form.docNumber} onChange={e => setForm({...form, docNumber: e.target.value})} className="w-full bg-slate-50 border-none rounded-2xl py-3 px-4 text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">添加日期</label>
                      <input type="date" value={form.createdAt} onChange={e => setForm({...form, createdAt: e.target.value})} className="w-full bg-slate-50 border-none rounded-2xl py-3 px-4 text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none" />
                    </div>
                    <div className="space-y-1 md:col-span-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">入库至指定仓库 <span className="text-rose-500">*</span></label>
                      <select value={form.warehouseId} onChange={e => setForm({...form, warehouseId: e.target.value})} className="w-full bg-slate-50 border-none rounded-2xl py-3 px-4 text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none">
                        <option value="">点击选择入库仓...</option>
                        {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {safePurchaseBillFormSettings.standardFields.find(f => f.id === 'note')?.showInCreate !== false && (
                    <div className="space-y-1 md:col-span-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">单据备注</label>
                      <textarea rows={2} value={form.note} onChange={e => setForm({...form, note: e.target.value})} className="w-full bg-slate-50 border-none rounded-2xl py-3 px-4 text-sm font-bold outline-none resize-none" placeholder="记录本次引用入库的特别说明..."></textarea>
                    </div>
                  )}
                  {safePurchaseBillFormSettings.customFields.filter(f => f.showInCreate).map(cf => (
                    <div key={cf.id} className={cf.type === 'text' || cf.type === undefined ? 'space-y-1 md:col-span-2' : 'space-y-1'}>
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{cf.label}</label>
                      {cf.type === 'date' ? (
                        <input type="date" value={form.customData?.[cf.id] ?? ''} onChange={e => setForm({ ...form, customData: { ...form.customData, [cf.id]: e.target.value } })} className="w-full bg-slate-50 border-none rounded-2xl py-3 px-4 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500" />
                      ) : cf.type === 'number' ? (
                        <input type="number" value={form.customData?.[cf.id] ?? ''} onChange={e => setForm({ ...form, customData: { ...form.customData, [cf.id]: e.target.value === '' ? '' : Number(e.target.value) } })} className="w-full bg-slate-50 border-none rounded-2xl py-3 px-4 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500" />
                      ) : cf.type === 'select' ? (
                        <select value={form.customData?.[cf.id] ?? ''} onChange={e => setForm({ ...form, customData: { ...form.customData, [cf.id]: e.target.value } })} className="w-full bg-slate-50 border-none rounded-2xl py-3 px-4 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500">
                          <option value="">请选择</option>
                          {(cf.options ?? []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                      ) : (
                        <input type="text" value={form.customData?.[cf.id] ?? ''} onChange={e => setForm({ ...form, customData: { ...form.customData, [cf.id]: e.target.value } })} className="w-full bg-slate-50 border-none rounded-2xl py-3 px-4 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500" placeholder={`${cf.label}`} />
                      )}
                    </div>
                  ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
};

export default React.memo(OrderBillFormPage);
