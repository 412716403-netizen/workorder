import { describe, expect, it } from 'vitest';
import type { DevStageDto, ReportFieldDefinition } from '../../types';
import { DevStageStatus } from '../../types';
import { serializeDevStageFileItems } from '../../utils/devStageFileValue';
import { templateFieldsUnchanged } from './DevStageRegisterModal';

const fileTemplate = {
  id: 'tpl-file',
  label: '图纸文件',
  type: 'file',
  required: false,
} as ReportFieldDefinition;

const stage: DevStageDto = {
  id: 'stage-1',
  name: '图纸',
  status: DevStageStatus.IN_PROGRESS,
  order: 0,
  updatedAt: '2026-08-04T00:00:00.000Z',
  fields: [
    {
      id: 'field-1',
      label: '图纸文件',
      type: 'file',
      value: JSON.stringify([{ name: '结构图.pdf', deferred: true }]),
    },
  ],
  attachments: [],
};

describe('templateFieldsUnchanged', () => {
  const fullValue = serializeDevStageFileItems([
    { name: '结构图.pdf', url: 'data:application/pdf;base64,AAAA' },
  ]);

  it('完整文件加载后未编辑仍判定为无变更', () => {
    expect(
      templateFieldsUnchanged(
        stage,
        [fileTemplate],
        { [fileTemplate.id]: fullValue },
        { [fileTemplate.id]: fullValue },
      ),
    ).toBe(true);
  });

  it('删除已加载文件后判定为有变更', () => {
    expect(
      templateFieldsUnchanged(
        stage,
        [fileTemplate],
        { [fileTemplate.id]: '' },
        { [fileTemplate.id]: fullValue },
      ),
    ).toBe(false);
  });
});
