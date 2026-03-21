import { ProductionOrder, OrderStatus, MilestoneStatus, Product, GlobalNodeTemplate, ProductCategory, BOM, AppDictionaries, Partner, Worker, Equipment, PartnerCategory } from './types';

export const MOCK_DICTIONARIES: AppDictionaries = {
  colors: [
    { id: 'c-1', name: '曜石黑', value: '#1a1a1a' },
    { id: 'c-2', name: '珍珠白', value: '#f9f9f9' },
    { id: 'c-3', name: '太空灰', value: '#7d7d7d' },
    { id: 'c-4', name: '极光蓝', value: '#0047ab' },
    { id: 'c-5', name: '极地蓝', value: '#3b82f6' },
    { id: 'c-6', name: '落日橙', value: '#f97316' }
  ],
  sizes: [
    { id: 's-1', name: 'XS', value: 'Extra Small' },
    { id: 's-2', name: 'S', value: 'Small' },
    { id: 's-3', name: 'M', value: 'Medium' },
    { id: 's-4', name: 'L', value: 'Large' },
    { id: 's-5', name: 'XL', value: 'Extra Large' },
    { id: 's-6', name: 'XXL', value: 'Double Extra Large' }
  ],
  units: [
    { id: 'u-1', name: 'PCS', value: '件' },
    { id: 'u-2', name: 'KG', value: '公斤' },
    { id: 'u-3', name: 'M', value: '米' },
    { id: 'u-4', name: 'BOX', value: '箱' }
  ]
};

export const MOCK_PARTNER_CATEGORIES: PartnerCategory[] = [
  {
    id: 'pc-1',
    name: '原料供应商',
    customFields: [
      { id: 'biz_type', label: '业务类型', type: 'select', options: ['独家供应', '合作供应', '临时采购'] },
      { id: 'phone', label: '联系电话', type: 'text' },
      { id: 'level', label: '信用等级', type: 'select', options: ['AAA', 'AA', 'A', 'B'] },
      { id: 'tax_id', label: '纳税人识别号', type: 'text' }
    ]
  },
  {
    id: 'pc-2',
    name: '零售/大客户',
    customFields: [
      { id: 'phone', label: '联系电话', type: 'text' },
      { id: 'level', label: 'VIP等级', type: 'select', options: ['战略客户', '核心客户', '普通客户'] },
      { id: 'region', label: '覆盖区域', type: 'select', options: ['华东', '华南', '华北', '西部'] }
    ]
  }
];

export const MOCK_CATEGORIES: ProductCategory[] = [
  { 
    id: 'cat-material', 
    name: '物料', 
    color: 'bg-slate-500', 
    hasProcess: false, 
    hasSalesPrice: false,
    hasPurchasePrice: true,
    hasColorSize: false,
    hasBatchManagement: true,
    customFields: [
      { id: 'brand', label: '品牌', type: 'text' },
      { id: 'spec', label: '规格型号', type: 'text' }
    ]
  },
  { 
    id: 'cat-semi', 
    name: '半成品', 
    color: 'bg-amber-500', 
    hasProcess: true, 
    hasSalesPrice: false, 
    hasPurchasePrice: false, 
    hasColorSize: true,
    hasBatchManagement: false,
    customFields: [
      { id: 'stage', label: '生产阶段', type: 'select', options: ['初加工', '精加工', '组装中'] }
    ]
  },
  { 
    id: 'cat-finished', 
    name: '成品', 
    color: 'bg-indigo-600', 
    hasProcess: true, 
    hasSalesPrice: true, 
    hasPurchasePrice: false, 
    hasColorSize: true,
    hasBatchManagement: false,
    customFields: [
      { id: 'warranty', label: '保修期限', type: 'number' }
    ]
  }
];

// 辅助函数：快速生成变体
const generateTestVariants = (productId: string, skuPrefix: string, colorIds: string[], sizeIds: string[]) => {
  const variants = [];
  for (const cId of colorIds) {
    for (const sId of sizeIds) {
      const cName = MOCK_DICTIONARIES.colors.find(c => c.id === cId)?.name || '';
      const sName = MOCK_DICTIONARIES.sizes.find(s => s.id === sId)?.name || '';
      variants.push({
        id: `v-${productId}-${cId}-${sId}`,
        colorId: cId,
        sizeId: sId,
        skuSuffix: `${skuPrefix}-${cName}-${sName}`,
        nodeBoms: {} as Record<string, string>
      });
    }
  }
  return variants;
};

// 预定义物料 ID
const MAT_FABRIC = 'm1';
const MAT_ZIPPER = 'm2';
const MAT_CHIP = 'm3';
const MAT_BOX = 'm4';

export const MOCK_PRODUCTS: Product[] = [
  // 原材料
  {
    id: MAT_FABRIC,
    sku: 'RAW-FAB-001',
    name: 'Gore-Tex 超细纤维面料',
    categoryId: 'cat-material',
    purchasePrice: 45.5,
    unitId: 'u-3',
    colorIds: [],
    sizeIds: [],
    variants: [],
    milestoneNodeIds: []
  },
  {
    id: MAT_ZIPPER,
    sku: 'RAW-ZIP-YKK',
    name: 'YKK 防水拉链 (40cm)',
    categoryId: 'cat-material',
    purchasePrice: 12.8,
    unitId: 'u-1',
    colorIds: [],
    sizeIds: [],
    variants: [],
    milestoneNodeIds: []
  },
  {
    id: MAT_CHIP,
    sku: 'COMP-CHIP-T1',
    name: 'SmartHeat 温控传感器芯片',
    categoryId: 'cat-material',
    purchasePrice: 88.0,
    unitId: 'u-1',
    colorIds: [],
    sizeIds: [],
    variants: [],
    milestoneNodeIds: []
  },
  {
    id: MAT_BOX,
    sku: 'PKG-BOX-PRO',
    name: 'Pro 系列加厚精品包装盒',
    categoryId: 'cat-material',
    purchasePrice: 5.2,
    unitId: 'u-4',
    colorIds: [],
    sizeIds: [],
    variants: [],
    milestoneNodeIds: []
  },
  // 成品夹克
  {
    id: 'p3',
    sku: 'JKT-2025',
    name: 'Pro-G1 智能防护夹克 (2025款)',
    categoryId: 'cat-finished',
    salesPrice: 1299,
    unitId: 'u-1',
    colorIds: ['c-1', 'c-5'], // 曜石黑, 极地蓝
    sizeIds: ['s-3', 's-4'], // M, L
    variants: generateTestVariants('p3', 'G1', ['c-1', 'c-5'], ['s-3', 's-4']).map(v => ({
        ...v,
        // 为每个变体绑定 BOM 关系：在 gn-1(物料核对) 使用 bom-1，在 gn-4(包装入库) 使用 bom-pkg
        nodeBoms: { 'gn-1': 'bom-1', 'gn-4': 'bom-pkg' }
    })),
    categoryCustomData: { warranty: 12 },
    milestoneNodeIds: ['gn-1', 'gn-2', 'gn-3', 'gn-4']
  }
];

export const MOCK_BOMS: BOM[] = [
  {
    id: 'bom-1',
    name: '夹克主料 BOM',
    parentProductId: 'p3',
    version: 'V1.0',
    items: [
      { productId: MAT_FABRIC, quantity: 2.2, note: '主面料用量' },
      { productId: MAT_ZIPPER, quantity: 1, note: '前襟拉链' },
      { productId: MAT_CHIP, quantity: 1, note: '背部温控模块' }
    ]
  },
  {
    id: 'bom-pkg',
    name: '夹克包装 BOM',
    parentProductId: 'p3',
    version: 'V1.0',
    items: [
      { productId: MAT_BOX, quantity: 1, note: '标准礼盒' }
    ]
  }
];

export const MOCK_GLOBAL_NODES: GlobalNodeTemplate[] = [
  {
    id: 'gn-1',
    name: '物料核对',
    hasBOM: true,
    enablePieceRate: true,
    reportTemplate: [
      { id: 'batch', label: '原材料批号', type: 'text', required: true }
    ]
  },
  {
    id: 'gn-2',
    name: '结构加工',
    hasBOM: false,
    enablePieceRate: true,
    reportTemplate: [
      { id: 'machine', label: '设备编号', type: 'text', required: true }
    ]
  },
  {
    id: 'gn-3',
    name: '功能测试',
    hasBOM: false,
    reportTemplate: [
      { id: 'is_ok', label: '测试是否通过', type: 'boolean', required: true }
    ]
  },
  {
    id: 'gn-4',
    name: '包装入库',
    hasBOM: true,
    reportTemplate: [
      { id: 'box_type', label: '包装规格', type: 'select', options: ['标准', '旗舰'] }
    ]
  }
];

export const MOCK_PARTNERS: Partner[] = [
  { id: 'pa-1', name: '华强电子', categoryId: 'pc-1', contact: '陈总', customData: { biz_type: '合作供应', phone: '13812345678', level: 'AA' } },
  { id: 'pa-2', name: '蓝星航空科技', categoryId: 'pc-2', contact: '张工', customData: { region: '华东', phone: '13988889999', level: '战略客户' } },
];

export const MOCK_WORKERS: Worker[] = [
  { id: 'w-1', name: '王大力', group: '一车间A组', role: '组长', status: 'ACTIVE', skills: ['精益生产'], assignedMilestoneIds: ['gn-1', 'gn-2'] },
  { id: 'w-2', name: '李晓霞', group: '二车间', role: '普工', status: 'ACTIVE', skills: ['包装'], assignedMilestoneIds: ['gn-4'] },
];

export const MOCK_EQUIPMENT: Equipment[] = [
  { id: 'e-1', name: '全自动裁剪机', code: 'EQ-CUT-01', assignedMilestoneIds: ['gn-1'] },
  { id: 'e-2', name: '5轴热压机', code: 'EQ-WELD-02', assignedMilestoneIds: ['gn-2'] },
];

export const MOCK_ORDERS: ProductionOrder[] = [];

export const STATUS_COLORS: Record<string, string> = {
  [MilestoneStatus.PENDING]: 'bg-gray-100 text-gray-600',
  [MilestoneStatus.IN_PROGRESS]: 'bg-blue-100 text-blue-600',
  [MilestoneStatus.COMPLETED]: 'bg-emerald-100 text-emerald-600',
  [MilestoneStatus.DELAYED]: 'bg-red-100 text-red-600',
  [OrderStatus.PLANNING]: 'bg-gray-100 text-gray-600',
  [OrderStatus.PRODUCING]: 'bg-blue-100 text-blue-600',
  [OrderStatus.QC]: 'bg-amber-100 text-amber-600',
  [OrderStatus.SHIPPED]: 'bg-emerald-100 text-emerald-600',
  [OrderStatus.ON_HOLD]: 'bg-red-100 text-red-600',
};

export const ORDER_STATUS_MAP = {
  [OrderStatus.PLANNING]: { label: '待排产', color: 'text-gray-500' },
  [OrderStatus.PRODUCING]: { label: '生产中', color: 'text-blue-500' },
  [OrderStatus.QC]: { label: '质检中', color: 'text-amber-500' },
  [OrderStatus.SHIPPED]: { label: '已发货', color: 'text-emerald-500' },
  [OrderStatus.ON_HOLD]: { label: '暂停', color: 'text-red-500' },
};