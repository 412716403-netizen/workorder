import React, { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { fetchKnowledgeAssetBlob } from '../../services/api/knowledgeBase';
import {
  parseExcelPreviewFromBuffer,
  type ExcelPreviewParseResult,
} from '../../utils/parseExcelPreview';
import type { ExcelPreviewSheetGrid } from '../../utils/excelXlsGrid';

const KnowledgeExcelPreview: React.FC<{ assetUrl: string }> = ({ assetUrl }) => {
  const [result, setResult] = useState<ExcelPreviewParseResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const objectUrlsRef = useRef<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    setResult(null);
    setError(null);
    setActiveIdx(0);

    const registerUrl = (url: string) => objectUrlsRef.current.push(url);

    (async () => {
      try {
        const blob = await fetchKnowledgeAssetBlob(assetUrl);
        const buffer = await blob.arrayBuffer();
        const parsed = await parseExcelPreviewFromBuffer(buffer, registerUrl);
        if (!cancelled) setResult(parsed);
      } catch {
        if (!cancelled) setError('无法解析该表格文件');
      }
    })();

    return () => {
      cancelled = true;
      for (const url of objectUrlsRef.current) URL.revokeObjectURL(url);
      objectUrlsRef.current = [];
    };
  }, [assetUrl]);

  if (error) {
    return <div className="kb-file-preview-hint">{error}</div>;
  }
  if (!result) {
    return (
      <div className="kb-file-preview-hint">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        <span>正在加载表格…</span>
      </div>
    );
  }

  const names = result.sheets.map((s) => s.name);
  const idx = Math.min(activeIdx, result.sheets.length - 1);

  return (
    <div className="kb-excel-preview">
      <div className="kb-excel-sheet">
        {result.mode === 'html' ? (
          <div dangerouslySetInnerHTML={{ __html: result.sheets[idx].html }} />
        ) : (
          <ExcelGridTable grid={result.sheets[idx]} />
        )}
      </div>
      {names.length > 1 && (
        <div className="kb-excel-tabs">
          {names.map((name, i) => (
            <button
              key={name + i}
              type="button"
              className={`kb-excel-tab${i === idx ? ' is-active' : ''}`}
              onClick={() => setActiveIdx(i)}
            >
              {name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const ExcelGridTable: React.FC<{ grid: ExcelPreviewSheetGrid }> = ({ grid }) => (
  <table className="kb-excel-grid">
    <colgroup>
      {grid.colWidths.map((w, i) => (
        <col key={i} style={{ width: `${w}px`, minWidth: `${Math.min(w, 48)}px` }} />
      ))}
    </colgroup>
    <tbody>
      {grid.rows.map((row, r) => (
        <tr key={r} style={{ height: `${grid.rowHeights[r]}px` }}>
          {row.map((cell, c) => {
            if (!cell) return null;
            return (
              <td
                key={c}
                rowSpan={cell.rowSpan}
                colSpan={cell.colSpan}
                className={cell.images.length ? 'has-image' : undefined}
              >
                {cell.images.map((img, i) => (
                  <img
                    key={i}
                    src={img.url}
                    alt=""
                    className="kb-excel-img"
                    style={{ width: `${img.width}px`, height: `${img.height}px` }}
                    loading="lazy"
                  />
                ))}
                {cell.text}
              </td>
            );
          })}
        </tr>
      ))}
    </tbody>
  </table>
);

export default KnowledgeExcelPreview;
