import type { AppDictionaries, DevSampleDto, DevStyleDto, Partner } from '../types';
import { DEV_STAGE_STATUS_LABEL, DevStageStatus, DevStyleStatus } from '../types';

export type DevSampleSidebarProgressKind = 'exception' | 'in_progress' | 'completed' | 'pending';

export interface DevSampleSidebarProgress {
  kind: DevSampleSidebarProgressKind;
  label: string;
}

/** 开发列表侧栏：样品轮次当前进度摘要（异常 > 进行中 > 全部完成 > 待开始） */
export function getDevSampleSidebarProgress(sample: DevSampleDto): DevSampleSidebarProgress {
  const errorSt = sample.stages.find((st) => st.status === DevStageStatus.EXCEPTION);
  if (errorSt) {
    return { kind: 'exception', label: `异常 (${errorSt.name})` };
  }
  const inProgress = sample.stages.find((st) => st.status === DevStageStatus.IN_PROGRESS);
  if (inProgress) {
    return { kind: 'in_progress', label: inProgress.name };
  }
  if (sample.stages.length > 0 && sample.stages.every((st) => st.status === DevStageStatus.COMPLETED)) {
    return { kind: 'completed', label: DEV_STAGE_STATUS_LABEL[DevStageStatus.COMPLETED] };
  }
  return { kind: 'pending', label: DEV_STAGE_STATUS_LABEL[DevStageStatus.PENDING] };
}

/** 开发款式「客户」展示/排序：优先 supplierId 对应合作单位名称，兼容历史 customerName */
export function resolveDevStyleCustomerName(
  style: DevStyleDto,
  partners?: Partner[],
): string | undefined {
  const legacy = style.customerName?.trim();
  if (legacy) return legacy;
  const sid = style.supplierId?.trim();
  if (!sid || !partners?.length) return undefined;
  return partners.find((p) => p.id === sid)?.name?.trim() || undefined;
}

export function resolveColorNames(style: DevStyleDto, dict: AppDictionaries): string[] {
  return style.colorIds.map((id) => dict.colors.find((c) => c.id === id)?.name ?? id);
}

export function resolveSizeNames(style: DevStyleDto, dict: AppDictionaries): string[] {
  return style.sizeIds.map((id) => dict.sizes.find((s) => s.id === id)?.name ?? id);
}

export function formatDevStyleCreatedAt(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
  } catch {
    return iso;
  }
}

export function isDevStyleArchived(style: DevStyleDto): boolean {
  return style.status === DevStyleStatus.ARCHIVED;
}

export function canDeleteDevStyle(style: DevStyleDto): boolean {
  if (style.status === DevStyleStatus.PUBLISHED) return false;
  return style.samples.every((s) =>
    s.stages.every((st, idx) => {
      if (idx === 0) return st.status === 'pending' || st.status === 'in_progress';
      return st.status === 'pending';
    }),
  );
}

/** 样品轮次：该轮次下全部节点均为待开始方可删除（与后端 deleteDevSample 一致） */
export function canDeleteDevSample(sample: DevSampleDto): boolean {
  return sample.stages.every((st) => st.status === DevStageStatus.PENDING);
}

export function getDevSampleDeleteBlockReason(
  sample: DevSampleDto,
  opts?: { sampleCount?: number },
): string | null {
  if (opts?.sampleCount !== undefined && opts.sampleCount <= 1) {
    return '至少保留一个样品轮次，无法删除';
  }
  if (!canDeleteDevSample(sample)) {
    return '该样品轮次存在已开始的节点，无法删除';
  }
  return null;
}
