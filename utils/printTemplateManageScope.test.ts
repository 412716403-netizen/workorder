import { describe, expect, it } from 'vitest';
import type { PrintTemplate } from '../types';
import { filterPrintTemplatesForManageScope, mergeScopedPrintTemplateListIntoFull } from './printTemplateManageScope';

function tpl(
  id: string,
  opts?: { documentType?: PrintTemplate['documentType']; printTemplateManageScope?: PrintTemplate['printTemplateManageScope'] },
): PrintTemplate {
  const t = new Date().toISOString();
  return {
    id,
    name: id,
    paperSize: { widthMm: 210, heightMm: 297 },
    elements: [],
    createdAt: t,
    updatedAt: t,
    ...opts,
  };
}

describe('filterPrintTemplatesForManageScope', () => {
  it('外协发出入口仅保留 outsource 或未定数据源', () => {
    const list = [
      tpl('a', { documentType: 'outsource' }),
      tpl('b', { documentType: 'order' }),
      tpl('c'),
    ];
    const r = filterPrintTemplatesForManageScope(list, 'outsourceDispatchFlowDetail');
    expect(r.map(x => x.id).sort()).toEqual(['a', 'c'].sort());
  });

  it('计划列表入口仅保留 plan 或未定数据源', () => {
    const list = [tpl('p', { documentType: 'plan' }), tpl('o', { documentType: 'order' }), tpl('u')];
    const r = filterPrintTemplatesForManageScope(list, 'planList');
    expect(r.map(x => x.id).sort()).toEqual(['p', 'u'].sort());
  });

  it('计划列表与计划标签按 printTemplateManageScope 互斥', () => {
    const list = [
      tpl('list', { documentType: 'plan', printTemplateManageScope: 'planList' }),
      tpl('lbl', { documentType: 'plan', printTemplateManageScope: 'planLabel' }),
      tpl('legacy', { documentType: 'plan' }),
    ];
    expect(filterPrintTemplatesForManageScope(list, 'planList').map(x => x.id).sort()).toEqual(['legacy', 'list'].sort());
    expect(filterPrintTemplatesForManageScope(list, 'planLabel').map(x => x.id).sort()).toEqual(['lbl', 'legacy'].sort());
  });

  it('工单详情与报工详情按 printTemplateManageScope 互斥（同为 order 数据源）', () => {
    const list = [
      tpl('wo', { documentType: 'order', printTemplateManageScope: 'orderDetail' }),
      tpl('rep', { documentType: 'order', printTemplateManageScope: 'reportBatchDetail' }),
      tpl('legacy', { documentType: 'order' }),
    ];
    const woDlg = filterPrintTemplatesForManageScope(list, 'orderDetail');
    expect(woDlg.map(x => x.id).sort()).toEqual(['legacy', 'wo'].sort());
    const repDlg = filterPrintTemplatesForManageScope(list, 'reportBatchDetail');
    expect(repDlg.map(x => x.id).sort()).toEqual(['legacy', 'rep'].sort());
  });

  it('外协发出与外协收回按 printTemplateManageScope 互斥', () => {
    const list = [
      tpl('recv', { documentType: 'outsource', printTemplateManageScope: 'outsourceReceiveFlowDetail' }),
      tpl('disp', { documentType: 'outsource', printTemplateManageScope: 'outsourceDispatchFlowDetail' }),
      tpl('legacy', { documentType: 'outsource' }),
    ];
    const recvOnly = filterPrintTemplatesForManageScope(list, 'outsourceReceiveFlowDetail');
    expect(recvOnly.map(x => x.id).sort()).toEqual(['legacy', 'recv'].sort());
    const dispOnly = filterPrintTemplatesForManageScope(list, 'outsourceDispatchFlowDetail');
    expect(dispOnly.map(x => x.id).sort()).toEqual(['disp', 'legacy'].sort());
  });
});

describe('mergeScopedPrintTemplateListIntoFull', () => {
  it('删除当前入口内模版时保留全量中其他数据源条目', () => {
    const full = [tpl('order1', { documentType: 'order' }), tpl('os1', { documentType: 'outsource' })];
    const merged = mergeScopedPrintTemplateListIntoFull(full, [], 'outsourceDispatchFlowDetail');
    expect(merged.map(t => t.id)).toEqual(['order1']);
  });

  it('在当前入口新增副本时追加到全量', () => {
    const full = [tpl('order1', { documentType: 'order' }), tpl('os1', { documentType: 'outsource' })];
    const copy = tpl('os2', { documentType: 'outsource' });
    const merged = mergeScopedPrintTemplateListIntoFull(full, [full[1], copy], 'outsourceDispatchFlowDetail');
    expect(merged).toHaveLength(3);
    expect(merged.some(t => t.id === 'os2')).toBe(true);
  });
});
