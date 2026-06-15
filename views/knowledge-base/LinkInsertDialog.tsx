import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import {
  isAllowedKnowledgeExternalUrl,
  normalizeKnowledgeExternalUrl,
} from '../../shared/knowledgeLinkUrl';

interface LinkInsertDialogProps {
  open: boolean;
  initialText?: string;
  onClose: () => void;
  onConfirm: (text: string, href: string) => void;
}

const LinkInsertDialog: React.FC<LinkInsertDialogProps> = ({
  open,
  initialText = '',
  onClose,
  onConfirm,
}) => {
  const [text, setText] = useState('');
  const [href, setHref] = useState('');
  const textRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setText(initialText);
    setHref('');
    const t = window.setTimeout(() => textRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open, initialText]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const handleConfirm = () => {
    const label = text.trim();
    if (!label) {
      toast.error('请输入链接文本');
      return;
    }
    const normalized = normalizeKnowledgeExternalUrl(href);
    if (!isAllowedKnowledgeExternalUrl(normalized)) {
      toast.error('请输入有效的网址（http / https / mailto）');
      return;
    }
    onConfirm(label, normalized);
    onClose();
  };

  if (!open) return null;

  return createPortal(
    <div
      className="kb-link-insert-overlay"
      onMouseDown={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="kb-link-insert-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="插入超链接"
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="kb-link-insert-body">
          <div className="kb-link-insert-fields">
            <div className="kb-link-insert-row">
              <span className="kb-link-insert-label">文本</span>
              <input
                ref={textRef}
                type="text"
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder="输入文本"
                className="kb-link-insert-input"
                onKeyDown={e => {
                  if (e.key === 'Enter') handleConfirm();
                }}
              />
            </div>
            <div className="kb-link-insert-row">
              <span className="kb-link-insert-label">链接</span>
              <input
                type="url"
                value={href}
                onChange={e => setHref(e.target.value)}
                placeholder="粘贴或输入链接"
                className="kb-link-insert-input"
                onKeyDown={e => {
                  if (e.key === 'Enter') handleConfirm();
                }}
              />
            </div>
          </div>
          <button
            type="button"
            className="kb-link-insert-confirm"
            onClick={handleConfirm}
          >
            确认
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default LinkInsertDialog;
