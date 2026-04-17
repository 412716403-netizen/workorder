import React from 'react';
import { Trash2 } from 'lucide-react';
import type {
  PrintBodyElement,
  PrintDynamicListElementConfig,
  PrintHeaderFooterConfig,
  PrintImageElementConfig,
  PrintLineElementConfig,
  PrintQRCodeElementConfig,
  PrintRectElementConfig,
  PrintSalesBillMatrixElementConfig,
  PrintTableElementConfig,
  PrintTemplate,
  PrintTemplateDocumentType,
  PrintTextElementConfig,
} from '../../types';
import type { PrintSelection } from './usePrintEditor';
import type { PrintFieldOption } from './printFieldOptions';
import { TemplatePaperSettings } from './TemplatePaperSettings';
import { FontSizePtInput } from './FontSizePtInput';
import { HeaderFooterEditor } from './HeaderFooterEditor';
import { ElementCommonProperties } from './ElementCommonProperties';
import { TextPropertyEditor } from './TextPropertyEditor';
import { QRCodePropertyEditor } from './QRCodePropertyEditor';
import { LinePropertyEditor } from './LinePropertyEditor';
import { ImagePropertyEditor } from './ImagePropertyEditor';
import { RectPropertyEditor } from './RectPropertyEditor';
import { DynamicTableGridEditor } from './DynamicTableGridEditor';
import { DynamicListPropertyEditor } from './DynamicListPropertyEditor';
import { Labeled } from './Labeled';

export function PropertyPanel({
  template,
  selection,
  selectedElement,
  fieldOptions,
  onSetName,
  onSetDocumentType,
  setPaperSize,
  setPaperMarginsMm,
  setPaperBackgroundColor,
  swapPaperDimensions,
  onUpdateElement,
  onUpdateElementConfig,
  onDeleteElement,
  onUpdateHeader,
  onUpdateFooter,
  onRemoveHeader,
  onRemoveFooter,
  bringToFront,
  sendToBack,
}: {
  template: PrintTemplate;
  selection: PrintSelection;
  selectedElement: PrintBodyElement | null;
  fieldOptions: PrintFieldOption[];
  onSetName: (name: string) => void;
  onSetDocumentType: (documentType: PrintTemplateDocumentType) => void;
  setPaperSize: (w: number, h: number) => void;
  setPaperMarginsMm: (patch: Partial<{ top: number; bottom: number; left: number; right: number }>) => void;
  setPaperBackgroundColor: (c: string) => void;
  swapPaperDimensions: () => void;
  onUpdateElement: (id: string, patch: Partial<PrintBodyElement>) => void;
  onUpdateElementConfig: (id: string, config: PrintBodyElement['config']) => void;
  onDeleteElement: (id: string) => void;
  onUpdateHeader: (c: PrintHeaderFooterConfig) => void;
  onUpdateFooter: (c: PrintHeaderFooterConfig) => void;
  onRemoveHeader: () => void;
  onRemoveFooter: () => void;
  bringToFront: (id: string) => void;
  sendToBack: (id: string) => void;
}) {
  if (selection.kind === 'paper') {
    return (
      <TemplatePaperSettings
        template={template}
        onSetName={onSetName}
        onSetDocumentType={onSetDocumentType}
        setPaperSize={setPaperSize}
        setPaperMarginsMm={setPaperMarginsMm}
        setPaperBackgroundColor={setPaperBackgroundColor}
        swapPaperDimensions={swapPaperDimensions}
      />
    );
  }

  if (selection.kind === 'header' && template.header) {
    return (
      <div className="h-full overflow-y-auto p-4">
        <HeaderFooterEditor
          title="页眉设置"
          config={template.header}
          onChange={onUpdateHeader}
          onDelete={onRemoveHeader}
          fieldOptions={fieldOptions}
        />
      </div>
    );
  }
  if (selection.kind === 'footer' && template.footer) {
    return (
      <div className="h-full overflow-y-auto p-4">
        <HeaderFooterEditor
          title="页脚设置"
          config={template.footer}
          onChange={onUpdateFooter}
          onDelete={onRemoveFooter}
          fieldOptions={fieldOptions}
        />
      </div>
    );
  }

  if (selection.kind !== 'element' || !selectedElement) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-slate-400">
        <p>点击图纸空白区域设置纸张与模板</p>
        <p className="text-xs text-slate-400/90">或选择页眉、页脚、画布上的组件以编辑属性</p>
      </div>
    );
  }

  const el = selectedElement;

  let specific: React.ReactNode = null;
  if (el.type === 'text') {
    const c = el.config as PrintTextElementConfig;
    specific = (
      <TextPropertyEditor el={el} c={c} fieldOptions={fieldOptions} onUpdateElementConfig={onUpdateElementConfig} />
    );
  } else if (el.type === 'qrcode') {
    const c = el.config as PrintQRCodeElementConfig;
    specific = (
      <QRCodePropertyEditor el={el} c={c} fieldOptions={fieldOptions} onUpdateElementConfig={onUpdateElementConfig} />
    );
  } else if (el.type === 'line') {
    const c = el.config as PrintLineElementConfig;
    specific = (
      <LinePropertyEditor el={el} c={c} onUpdateElementConfig={onUpdateElementConfig} />
    );
  } else if (el.type === 'image') {
    const c = el.config as PrintImageElementConfig;
    specific = (
      <ImagePropertyEditor el={el} c={c} fieldOptions={fieldOptions} onUpdateElement={onUpdateElement} onUpdateElementConfig={onUpdateElementConfig} />
    );
  } else if (el.type === 'rect') {
    const c = el.config as PrintRectElementConfig;
    specific = (
      <RectPropertyEditor el={el} c={c} onUpdateElementConfig={onUpdateElementConfig} />
    );
  } else if (el.type === 'dynamicTable') {
    const c = el.config as PrintTableElementConfig;
    specific = (
      <DynamicTableGridEditor el={el} c={c} fieldOptions={fieldOptions} onUpdateElementConfig={onUpdateElementConfig} />
    );
  } else if (el.type === 'dynamicList') {
    const c = el.config as PrintDynamicListElementConfig;
    specific = (
      <DynamicListPropertyEditor
        el={el}
        c={c}
        fieldOptions={fieldOptions}
        templateDocumentType={template.documentType}
        onUpdateElementConfig={onUpdateElementConfig}
      />
    );
  } else if (el.type === 'salesBillMatrix') {
    const c = el.config as PrintSalesBillMatrixElementConfig;
    const pt = c.fontSizePt ?? 7;
    specific = (
      <div className="space-y-3 text-xs font-bold text-slate-700">
        <p className="text-[10px] font-semibold leading-relaxed text-slate-500">
          数据来自打印上下文中的 <code className="rounded bg-slate-100 px-1">salesBillMatrix</code>（销售单预览/打印时注入）。表格线为黑色、表头无底色；分页按组件高度自动估算（每块约 11mm）。
        </p>
        <Labeled label="字号 (pt)">
          <FontSizePtInput
            id={`${el.id}-matrix-pt`}
            value={pt}
            min={5}
            max={14}
            roundToHalf
            className="w-full rounded-lg border border-slate-200 px-2 py-2"
            onCommit={n => onUpdateElementConfig(el.id, { fontSizePt: n })}
          />
        </Labeled>
      </div>
    );
  }

  return (
    <div className="h-full space-y-4 overflow-y-auto p-4">
      <h3 className="text-sm font-black text-slate-800">
        {el.type === 'text'
          ? '文本'
          : el.type === 'qrcode'
            ? '二维码'
            : el.type === 'line'
              ? '线条'
              : el.type === 'rect'
                ? '矩形'
                : el.type === 'image'
                  ? '图片'
                  : el.type === 'dynamicList'
                    ? '动态列表'
                    : el.type === 'salesBillMatrix'
                      ? '销售单矩阵表'
                      : '表格'}
      </h3>
      {specific}
      <ElementCommonProperties
        el={el}
        onUpdateElement={onUpdateElement}
        bringToFront={bringToFront}
        sendToBack={sendToBack}
      />
      <button
        type="button"
        onClick={() => onDeleteElement(el.id)}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 py-2.5 text-sm font-bold text-rose-600 hover:bg-rose-100"
      >
        <Trash2 className="h-4 w-4" /> 删除组件
      </button>
    </div>
  );
}
