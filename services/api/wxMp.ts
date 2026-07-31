import { request } from './_client';

export type WxMpStatus = {
  configured: boolean;
  bound: boolean;
};

export type WxMpBindQrcode = {
  scene: string;
  ticket: string;
  qrcodeUrl: string;
  expireSeconds: number;
};

export const wxMp = {
  status() {
    return request<WxMpStatus>('/wx-mp/status');
  },
  createBindQrcode() {
    return request<WxMpBindQrcode>('/wx-mp/bind-qrcode', { method: 'POST', body: '{}' });
  },
  unbind() {
    return request<{ bound: false }>('/wx-mp/unbind', { method: 'POST', body: '{}' });
  },
};
