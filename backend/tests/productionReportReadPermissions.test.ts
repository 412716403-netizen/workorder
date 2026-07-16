import { describe, it, expect } from 'vitest';
import {
  canReadWithProductionReport,
  canReadWithFinance,
  canReadWithProductionOrFinance,
} from '../src/middleware/tenant.js';

describe('canReadWithProductionReport（报工链路只读依赖端点）', () => {
  it('持有原细粒度键时放行', () => {
    expect(canReadWithProductionReport(['basic:products:view'], 'basic:products:view')).toBe(true);
    expect(canReadWithProductionReport(['settings:nodes:view'], 'settings:nodes:view')).toBe(true);
    expect(canReadWithProductionReport(['production:plans:view'], 'production:plans:view')).toBe(true);
  });

  it('持有顶级模块键（basic/settings）等同拥有该模块全部子权限', () => {
    expect(canReadWithProductionReport(['basic'], 'basic:products:view')).toBe(true);
    expect(canReadWithProductionReport(['settings'], 'settings:nodes:view')).toBe(true);
  });

  it('仅持有顶级 process_report（工序报工）也放行', () => {
    expect(canReadWithProductionReport(['process_report'], 'basic:products:view')).toBe(true);
    expect(canReadWithProductionReport(['process_report'], 'settings:nodes:view')).toBe(true);
    expect(canReadWithProductionReport(['process_report'], 'settings:categories:view')).toBe(true);
    expect(canReadWithProductionReport(['process_report'], 'basic:dictionaries:view')).toBe(true);
    expect(canReadWithProductionReport(['process_report'], 'production:plans:view')).toBe(true);
  });

  it('持有任意 production:* 细粒度键也放行（如仅工单报工记录）', () => {
    expect(
      canReadWithProductionReport(['production:orders_report_records:create'], 'basic:products:view'),
    ).toBe(true);
    expect(
      canReadWithProductionReport(['production:orders_report_records:create'], 'production:plans:view'),
    ).toBe(true);
  });

  it('无关模块拒绝（生产域专用路径仍不因 psi 单独放行；产品列表已改走 requireTenantMemberRead）', () => {
    expect(canReadWithProductionReport(['psi:sales_order:view'], 'basic:products:view')).toBe(false);
    expect(canReadWithProductionReport(['finance'], 'settings:nodes:view')).toBe(false);
  });
});

describe('canReadWithFinance（财务表单只读依赖端点）', () => {
  it('持有原细粒度键时放行', () => {
    expect(canReadWithFinance(['settings:finance_categories:view'], 'settings:finance_categories:view')).toBe(true);
    expect(canReadWithFinance(['basic:products:view'], 'basic:products:view')).toBe(true);
  });

  it('仅持有 finance / finance:* / psi:* 也放行（收付款与进销存单据依赖客户/商品主数据）', () => {
    expect(canReadWithFinance(['finance'], 'settings:finance_categories:view')).toBe(true);
    expect(canReadWithFinance(['finance:receipt:create'], 'settings:finance_categories:view')).toBe(true);
    expect(canReadWithFinance(['finance:payment:view'], 'basic:products:view')).toBe(true);
    expect(canReadWithFinance(['finance:receipt:view'], 'basic:partners:view')).toBe(true);
    expect(canReadWithFinance(['psi:sales_order:view_own'], 'basic:partners:view')).toBe(true);
    expect(canReadWithFinance(['psi:purchase_order:view'], 'basic:products:view')).toBe(true);
  });

  it('无财务/进销存域权限且缺细粒度键时拒绝', () => {
    expect(canReadWithFinance([], 'settings:finance_categories:view')).toBe(false);
    expect(canReadWithFinance(['production:orders_list:allow'], 'settings:finance_categories:view')).toBe(false);
  });
});

describe('canReadWithProductionOrFinance（产品等共用主数据）', () => {
  it('生产域、财务域或进销存域均可读产品', () => {
    expect(canReadWithProductionOrFinance(['process_report'], 'basic:products:view')).toBe(true);
    expect(canReadWithProductionOrFinance(['finance:receipt:view'], 'basic:products:view')).toBe(true);
    expect(canReadWithProductionOrFinance(['finance:payment:create'], 'settings:categories:view')).toBe(true);
    expect(canReadWithProductionOrFinance(['psi:sales_order:view'], 'basic:products:view')).toBe(true);
    expect(canReadWithProductionOrFinance(['psi:sales_bill:view_own'], 'basic:partners:view')).toBe(true);
  });

  it('无关模块拒绝', () => {
    expect(canReadWithProductionOrFinance(['workbench'], 'basic:products:view')).toBe(false);
  });
});
