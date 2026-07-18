import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';

/**
 * 将全屏遮罩弹窗挂到 document.body，
 * 避免主内容区 overflow/层叠上下文导致 fixed 相对内容区定位、视觉上不居中。
 */
export function ModalPortal({ children }: { children: ReactNode }) {
  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
}

export default ModalPortal;
