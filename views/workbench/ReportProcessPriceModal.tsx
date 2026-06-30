import React from 'react';
import ProcessNodePriceModalCore from './ProcessNodePriceModalCore';

interface ReportProcessPriceModalProps {
  open: boolean;
  onClose: () => void;
  showAmount: boolean;
  onSaved?: () => void;
}

const ReportProcessPriceModal: React.FC<ReportProcessPriceModalProps> = props => (
  <ProcessNodePriceModalCore {...props} variant="report" />
);

export default ReportProcessPriceModal;
