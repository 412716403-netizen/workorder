/**
 * 生产操作（物料领退 / 外发 / 返修）的 collabData 自定义字段快照读写
 * =================================================================
 *
 * ProductionOpRecord.collabData 是一个 JSON 字段，用于挂各业务形态扩展的自定义
 * 字段快照（区别于固定列）。三个业务域（material / outsource / rework）各自
 * 有独立的键空间与校验规则：
 *
 *   material：按 STOCK_OUT/STOCK_RETURN × 是否外发合作伙伴，分 4 个键；
 *             入口见 material.ts 的 materialStockCustomDataCollabKey。
 *   outsource：按 dispatch/receive 分 2 个键。
 *   rework：按 defectTreatment（首条快照）/ reworkReport 分 2 个键。
 *
 * 这里只做 re-export 聚合，方便新文件一次性导入；现有文件推荐直接从
 * 具体子模块（material / outsource / rework）导入，保持导入路径与职责的
 * 明确对应关系。
 */

export * from './material';
export * from './outsource';
export * from './rework';
