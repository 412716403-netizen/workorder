/**
 * 工作台消息中心：平台公告 DTO（存 platform_announcements 表）
 */

/** 平台 admin 发布公告的统一发布人展示名 */
export const DASHBOARD_PLATFORM_PUBLISHER = '系统';

export const MAX_PLATFORM_ANNOUNCEMENTS = 50;

export interface DashboardPublishedMessage {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  publisherName: string;
}

export function publishedMessageToNotification(msg: DashboardPublishedMessage) {
  return {
    id: msg.id,
    type: 'announcement' as const,
    title: msg.title,
    body: msg.body,
    createdAt: msg.createdAt,
    publisherName: msg.publisherName,
  };
}
