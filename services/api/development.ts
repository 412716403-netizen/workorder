import { request, buildQs } from './_client';
import type {
  DevStyleDto,
  DevBomDto,
  DevStageTemplateDto,
  DevMaterialBatchRequest,
  DevMaterialBatchResult,
  DevMaterialDocMutationResult,
  DevMaterialDocUpdateRequest,
  DevMaterialRecordsResponse,
} from '../../types';

export const devStyles = {
  list: (params?: { categoryId?: string; search?: string; status?: string }) => {
    const qs = buildQs(params ?? {});
    return request<DevStyleDto[]>(`/dev/styles${qs}`);
  },
  get: (id: string) => request<DevStyleDto>(`/dev/styles/${id}`),
  getStageField: (fieldId: string) =>
    request<{ id: string; value: string }>(`/dev/styles/stage-fields/${encodeURIComponent(fieldId)}`),
  /** 同源相对路径；`<video src>` 走 Cookie 鉴权并可 Range 分段 */
  stageFieldFileUrl: (fieldId: string, index: number) =>
    `/api/dev/styles/stage-fields/${encodeURIComponent(fieldId)}/files/${Math.max(0, Math.floor(index))}`,
  getAttachment: (attachmentId: string) =>
    request<{ id: string; fileName: string; fileUrl: string; fileType?: string }>(
      `/dev/styles/attachments/${encodeURIComponent(attachmentId)}`,
    ),
  create: (data: unknown) =>
    request<DevStyleDto>('/dev/styles', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: unknown) =>
    request<DevStyleDto>(`/dev/styles/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) =>
    request<{ message: string }>(`/dev/styles/${id}`, { method: 'DELETE' }),
  publish: (id: string) =>
    request<{ style: DevStyleDto; productId: string }>(`/dev/styles/${id}/publish`, { method: 'POST' }),
  addSample: (
    id: string,
    data: { name?: string; stageNames?: string[]; colorId?: string; sizeId?: string },
  ) =>
    request<DevStyleDto>(`/dev/styles/${id}/samples`, { method: 'POST', body: JSON.stringify(data) }),
  deleteSample: (sampleId: string) =>
    request<DevStyleDto>(`/dev/styles/samples/${sampleId}`, { method: 'DELETE' }),
  updateStage: (
    stageId: string,
    data: {
      status?: string;
      fields?: Array<{ id?: string; label: string; value: string; type?: string }>;
      attachments?: Array<{ id?: string; fileName: string; fileUrl: string; fileType?: string }>;
      user?: string;
    },
  ) => request<DevStyleDto>(`/dev/styles/stages/${stageId}`, { method: 'PUT', body: JSON.stringify(data) }),
  syncVariantNodeBoms: (styleId: string, variantId: string, nodeBoms: Record<string, string>) =>
    request<{ variantId: string; nodeBoms: Record<string, string> }>(
      `/dev/styles/${styleId}/variants/${variantId}/node-boms`,
      {
        method: 'PUT',
        body: JSON.stringify({ nodeBoms }),
      },
    ),
};

export const devBoms = {
  list: (params?: { parentStyleId?: string }) => {
    const qs = buildQs({ all: 'true', ...(params ?? {}) });
    return request<DevBomDto[]>(`/dev/styles/boms/all${qs}`);
  },
  get: (id: string) => request<DevBomDto>(`/dev/styles/boms/${id}`),
  create: (data: unknown) =>
    request<DevBomDto>('/dev/styles/boms', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: unknown) =>
    request<DevBomDto>(`/dev/styles/boms/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) =>
    request<{ message: string }>(`/dev/styles/boms/${id}`, { method: 'DELETE' }),
};

export const devTemplates = {
  list: () => request<DevStageTemplateDto[]>('/dev/stage-templates'),
  create: (data: {
    name: string;
    order?: number;
    fields?: Array<{
      label: string;
      required?: boolean;
      order?: number;
      type?: string;
      options?: string[];
      dateWithTime?: boolean;
      dateAutoFill?: boolean;
    }>;
  }) =>
    request<DevStageTemplateDto>('/dev/stage-templates', { method: 'POST', body: JSON.stringify(data) }),
  update: (
    id: string,
    data: {
      name?: string;
      order?: number;
      fields?: Array<{
        id?: string;
        label: string;
        required?: boolean;
        order?: number;
        type?: string;
        options?: string[];
        dateWithTime?: boolean;
        dateAutoFill?: boolean;
      }>;
    },
  ) =>
    request<DevStageTemplateDto>(`/dev/stage-templates/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) =>
    request<{ message: string }>(`/dev/stage-templates/${id}`, { method: 'DELETE' }),
};

export const devMaterial = {
  listRecords: (styleId: string) =>
    request<DevMaterialRecordsResponse>(`/dev/styles/${styleId}/material-records`),
  issueBatch: (styleId: string, body: DevMaterialBatchRequest) =>
    request<DevMaterialBatchResult>(`/dev/styles/${styleId}/material-issues/batch`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  returnBatch: (styleId: string, body: DevMaterialBatchRequest) =>
    request<DevMaterialBatchResult>(`/dev/styles/${styleId}/material-returns/batch`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateDoc: (styleId: string, docNo: string, body: DevMaterialDocUpdateRequest) =>
    request<DevMaterialDocMutationResult>(
      `/dev/styles/${styleId}/material-docs/${encodeURIComponent(docNo)}`,
      { method: 'PUT', body: JSON.stringify(body) },
    ),
  deleteDoc: (styleId: string, docNo: string) =>
    request<DevMaterialDocMutationResult>(
      `/dev/styles/${styleId}/material-docs/${encodeURIComponent(docNo)}`,
      { method: 'DELETE' },
    ),
};
