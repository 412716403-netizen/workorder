/**
 * Nayuki qrcodegen wrapper — same encoder as qrcode.react (level M, boostEcl).
 * 纠错级别取 MEDIUM（~15% 容错），配合 `QR_QUIET_ZONE_MODULES` 静区显著提升扫码枪识别率。
 * 浏览器渲染（PrintPaper 的 QRCodeSVG，level="M" + marginSize）与矢量打印必须使用同一套参数，
 * 否则预览与实际打印会生成不同的码图案。
 * Core library vendored in ./qrcodegenCore.js (MIT, Project Nayuki).
 */
import qrcodegen from './qrcodegenCore.js';

/**
 * 二维码四周静区（quiet zone）模块数，QR 标准要求 ≥4。
 * 浏览器路径用 `QRCodeSVG marginSize`，矢量打印路径在 `drawQrInBox` 外扩等量白边，二者共用此常量保持一致。
 */
export const QR_QUIET_ZONE_MODULES = 4;

interface QrCodeInstance {
  getModules(): boolean[][];
}

interface QrCodeStatic {
  encodeSegments(
    segs: unknown[],
    ecl: unknown,
    minVersion?: number,
    maxVersion?: number,
    mask?: number,
    boostEcl?: boolean,
  ): QrCodeInstance;
  Ecc: { LOW: unknown; MEDIUM: unknown; QUARTILE: unknown; HIGH: unknown };
}

interface QrSegmentStatic {
  makeSegments(text: string): unknown[];
}

const gen = qrcodegen as { QrCode: QrCodeStatic; QrSegment: QrSegmentStatic };

/** Returns QR module matrix (true = dark), matching qrcode.react useQRCode defaults (level M, boostEcl). */
export function getQrCells(value: string): boolean[][] {
  const text = value.length > 2000 ? value.slice(0, 2000) : value || '-';
  const segments = gen.QrSegment.makeSegments(text);
  const qr = gen.QrCode.encodeSegments(segments, gen.QrCode.Ecc.MEDIUM, 1, undefined, undefined, true);
  return qr.getModules();
}

/** QR version for a payload (size = version * 4 + 17 modules). */
export function getQrVersion(value: string): number {
  const n = getQrCells(value).length;
  return (n - 17) / 4;
}
