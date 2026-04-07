import React, { useState, useMemo } from 'react';
import { Product, Warehouse, ProductCategory, Partner, PartnerCategory, AppDictionaries, PurchaseOrderFormSettings, PurchaseBillFormSettings } from '../../types';
import PurchaseOrderFormSection from './PurchaseOrderFormSection';
import SalesOrderFormSection from './SalesOrderFormSection';
import SalesBillFormSection from './SalesBillFormSection';
import PurchaseBillFormSection from './PurchaseBillFormSection';

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

  // ── Reset form ──
  const resetForm = () => {
    const t = new Date().toISOString().split('T')[0];
    setForm({ productId: '', warehouseId: '', fromWarehouseId: '', toWarehouseId: '', quantity: 0, actualQuantity: 0, purchasePrice: 0, partner: '', partnerId: '', note: '', docNumber: '', dueDate: '', createdAt: t, customData: {} });
    setPurchaseOrderItems([]);
    setPurchaseBillItems([]);
    setSalesOrderItems([]);
    setSalesBillItems([]);
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

  // ── Render ──
  if (formType === 'PURCHASE_ORDER') {
    return (
      <PurchaseOrderFormSection
        form={form}
        setForm={setForm}
        purchaseOrderItems={purchaseOrderItems}
        onAddItem={addPurchaseOrderItem}
        onUpdateItem={updatePurchaseOrderItem}
        onUpdateVariantQty={updatePurchaseOrderVariantQty}
        onRemoveItem={removePurchaseOrderItem}
        onSave={() => handleSaveManual('PURCHASE_ORDER')}
        onBack={onBack}
        onDeleteRecords={onDeleteRecords}
        editingDocNumber={editingDocNumber}
        hasPsiPerm={hasPsiPerm}
        products={products}
        categories={categories}
        partners={partners}
        partnerCategories={partnerCategories}
        dictionaries={dictionaries}
        productMapPSI={productMapPSI}
        formatQtyDisplay={formatQtyDisplay}
        getUnitName={getUnitName}
        formSettings={safePurchaseOrderFormSettings}
        partnerLabel={partnerLabel}
        receivedByOrderLine={receivedByOrderLine}
      />
    );
  }

  if (formType === 'SALES_ORDER') {
    return (
      <SalesOrderFormSection
        form={form}
        setForm={setForm}
        salesOrderItems={salesOrderItems}
        onAddItem={addSalesOrderItem}
        onUpdateItem={updateSalesOrderItem}
        onUpdateVariantQty={updateSalesOrderVariantQty}
        onRemoveItem={removeSalesOrderItem}
        onSave={() => handleSaveManual('SALES_ORDER')}
        onBack={onBack}
        onDeleteRecords={onDeleteRecords}
        editingDocNumber={editingDocNumber}
        hasPsiPerm={hasPsiPerm}
        products={products}
        categories={categories}
        partners={partners}
        partnerCategories={partnerCategories}
        dictionaries={dictionaries}
        productMapPSI={productMapPSI}
        formatQtyDisplay={formatQtyDisplay}
        getUnitName={getUnitName}
        partnerLabel={partnerLabel}
      />
    );
  }

  if (formType === 'SALES_BILL') {
    return (
      <SalesBillFormSection
        form={form}
        setForm={setForm}
        salesBillItems={salesBillItems}
        onAddItem={addSalesBillItem}
        onUpdateItem={updateSalesBillItem}
        onUpdateVariantQty={updateSalesBillVariantQty}
        onRemoveItem={removeSalesBillItem}
        onSave={() => handleSaveManual('SALES_BILL')}
        onBack={onBack}
        onDeleteRecords={onDeleteRecords}
        editingDocNumber={editingDocNumber}
        hasPsiPerm={hasPsiPerm}
        products={products}
        categories={categories}
        partners={partners}
        partnerCategories={partnerCategories}
        dictionaries={dictionaries}
        warehouses={warehouses}
        productMapPSI={productMapPSI}
        formatQtyDisplay={formatQtyDisplay}
        getUnitName={getUnitName}
        partnerLabel={partnerLabel}
      />
    );
  }

  if (formType === 'PURCHASE_BILL') {
    return (
      <PurchaseBillFormSection
        form={form}
        setForm={setForm}
        purchaseBillItems={purchaseBillItems}
        onAddItem={addPurchaseBillItem}
        onUpdateItem={updatePurchaseBillItem}
        onUpdateVariantQty={updatePurchaseBillVariantQty}
        onRemoveItem={removePurchaseBillItem}
        onResetItems={() => setPurchaseBillItems([])}
        onSaveManual={() => handleSaveManual('PURCHASE_BILL')}
        onBack={onBack}
        onSaveRecord={onSave}
        onDeleteRecords={onDeleteRecords}
        editingDocNumber={editingDocNumber}
        hasPsiPerm={hasPsiPerm}
        products={products}
        categories={categories}
        partners={partners}
        partnerCategories={partnerCategories}
        dictionaries={dictionaries}
        warehouses={warehouses}
        productMapPSI={productMapPSI}
        categoryMapPSI={categoryMapPSI}
        formatQtyDisplay={formatQtyDisplay}
        getUnitName={getUnitName}
        formSettings={safePurchaseBillFormSettings}
        partnerLabel={partnerLabel}
        recordsList={recordsList}
        receivedByOrderLine={receivedByOrderLine}
        generatePBDocNumber={generatePBDocNumber}
      />
    );
  }

  return null;
};

export default React.memo(OrderBillFormPage);
