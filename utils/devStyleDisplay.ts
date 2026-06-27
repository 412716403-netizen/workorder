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

/** 节点是否已录入资料：有附件或任一字段填了非空值 */
export function devStageHasEnteredData(stage: DevSampleDto['stages'][number]): boolean {
  if (stage.attachments.length > 0) return true;
  return stage.fields.some((f) => (f.value ?? '').trim() !== '');
}

/**
 * 样品轮次可删除（与后端 deleteDevSample 一致）：
 * 全部节点为待开始；或仅第一个节点为「进行中且未录入资料」、其余待开始。
 */
export function canDeleteDevSample(sample: DevSampleDto): boolean {
  return sample.stages.every((st, idx) => {
    if (st.status === DevStageStatus.PENDING) return true;
    if (idx === 0 && st.status === DevStageStatus.IN_PROGRESS && !devStageHasEnteredData(st)) {
      return true;
    }
    return false;
  });
}

export function getDevSampleDeleteBlockReason(
  sample: DevSampleDto,
  // opts 保留以兼容调用方；不再限制最少样品数（头样亦可删，款式可回到 0 样品）
  _opts?: { sampleCount?: number },
): string | null {
  if (!canDeleteDevSample(sample)) {
    return '该样品轮次存在已录入资料或已推进的节点，无法删除';
  }
  return null;
}
