import { request, buildQs } from './_client';
import type { DevStyleDto, DevBomDto, DevStageTemplateDto } from '../../types';

export const devStyles = {
  list: (params?: { categoryId?: string; search?: string; status?: string }) => {
    const qs = buildQs(params ?? {});
    return request<DevStyleDto[]>(`/dev/styles${qs}`);
  },
  get: (id: string) => request<DevStyleDto>(`/dev/styles/${id}`),
  create: (data: unknown) =>
    request<DevStyleDto>('/dev/styles', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: unknown) =>
    request<DevStyleDto>(`/dev/styles/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) =>
    request<{ message: string }>(`/dev/styles/${id}`, { method: 'DELETE' }),
  publish: (id: string) =>
    request<{ style: DevStyleDto; productId: string }>(`/dev/styles/${id}/publish`, { method: 'POST' }),
  addSample: (id: string, data: { name?: string; stageNames?: string[] }) =>
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
    request<DevStyleDto>(`/dev/styles/${styleId}/variants/${variantId}/node-boms`, {
      method: 'PUT',
      body: JSON.stringify({ nodeBoms }),
    }),
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
