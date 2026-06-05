/**
 * Nayuki qrcodegen wrapper — same encoder as qrcode.react (level L, boostEcl, margin 0).
 * Core library vendored in ./qrcodegenCore.js (MIT, Project Nayuki).
 */
import qrcodegen from './qrcodegenCore.js';

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
  Ecc: { LOW: unknown };
}

interface QrSegmentStatic {
  makeSegments(text: string): unknown[];
}

const gen = qrcodegen as { QrCode: QrCodeStatic; QrSegment: QrSegmentStatic };

/** Returns QR module matrix (true = dark), matching qrcode.react useQRCode defaults. */
export function getQrCells(value: string): boolean[][] {
  const text = value.length > 2000 ? value.slice(0, 2000) : value || '-';
  const segments = gen.QrSegment.makeSegments(text);
  const qr = gen.QrCode.encodeSegments(segments, gen.QrCode.Ecc.LOW, 1, undefined, undefined, true);
  return qr.getModules();
}

/** QR version for a payload (size = version * 4 + 17 modules). */
export function getQrVersion(value: string): number {
  const n = getQrCells(value).length;
  return (n - 17) / 4;
}
