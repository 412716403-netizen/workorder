import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { SearchableProductSelect } from '../../components/SearchableProductSelect';
import { useMasterData } from '../../contexts/AppDataContext';

interface ProductLinkInsertDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (productId: string) => void;
}

/** 资料库插入「关联产品」：选择产品档案 */
const ProductLinkInsertDialog: React.FC<ProductLinkInsertDialogProps> = ({
  open,
  onClose,
  onConfirm,
}) => {
  const { products, categories } = useMasterData();
  const [productId, setProductId] = useState('');
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    setProductId('');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const handleConfirm = () => {
    if (!productId.trim()) {
      toast.error('请选择产品');
      return;
    }
    onConfirm(productId.trim());
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
        aria-label="关联产品"
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="kb-link-insert-body">
          <div className="kb-link-insert-fields">
            <div className="kb-link-insert-row kb-product-link-row">
              <span className="kb-link-insert-label">产品</span>
              <div className="kb-product-link-select">
                <SearchableProductSelect
                  options={products}
                  categories={categories}
                  value={productId}
                  onChange={setProductId}
                  placeholder="搜索并选择产品…"
                  allowQuickCreate={false}
                />
              </div>
            </div>
          </div>
          <button
            ref={confirmRef}
            type="button"
            className="kb-link-insert-confirm"
            onClick={handleConfirm}
          >
            确定
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default ProductLinkInsertDialog;
