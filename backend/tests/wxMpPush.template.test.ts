import { describe, expect, it } from 'vitest';
import { buildTodoRemindTemplateData } from '../src/services/wxMpPush.service.js';
import { truncateWxTemplateThing } from '../../shared/types.js';

describe('truncateWxTemplateThing', () => {
  it('keeps short text', () => {
    expect(truncateWxTemplateThing('跟进回货')).toBe('跟进回货');
  });
  it('truncates long text with ellipsis', () => {
    const long = '这是一段非常非常长的待办任务名称用来测试截断';
    const out = truncateWxTemplateThing(long, 20);
    expect(out.length).toBe(20);
    expect(out.endsWith('…')).toBe(true);
  });
});

describe('buildTodoRemindTemplateData', () => {
  it('prefers sourceTitle and formats time', () => {
    const data = buildTodoRemindTemplateData({
      note: '备注内容',
      sourceTitle: '外协回货跟进',
      remindAt: new Date('2026-07-31T12:05:00+08:00'),
    });
    expect(data.thing1.value).toBe('外协回货跟进');
    expect(data.time3.value).toMatch(/2026年07月31日/);
  });
});

describe('buildMessageTemplateData', () => {
  it('prefixes and truncates title', async () => {
    const { buildMessageTemplateData } = await import('../src/services/wxMpPush.service.js');
    const data = buildMessageTemplateData('公告 · 系统维护通知请查收', new Date('2026-07-31T08:00:00+08:00'));
    expect(data.thing1.value.length).toBeLessThanOrEqual(20);
    expect(data.time3.value).toMatch(/2026年07月31日/);
  });
});
