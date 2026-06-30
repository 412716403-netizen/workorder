import React from 'react';
import ProcessNodePriceModalCore from './ProcessNodePriceModalCore';

interface OutsourceProcessPriceModalProps {
  open: boolean;
  onClose: () => void;
  showAmount: boolean;
  onSaved?: () => void;
}

const OutsourceProcessPriceModal: React.FC<OutsourceProcessPriceModalProps> = props => (
  <ProcessNodePriceModalCore {...props} variant="outsource" />
);

export default OutsourceProcessPriceModal;
