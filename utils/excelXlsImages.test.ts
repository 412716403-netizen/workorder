import { describe, it, expect } from 'vitest';
import {
  collectClientAnchorsFromOfficeArt,
  collectMsoDrawingGroupPayload,
  collectPictureShapesFromOfficeArt,
  computeXlsClientAnchorSize,
  extractAnchoredImagesFromXlsWorkbookStream,
  extractImagesFromXlsWorkbookStream,
  fitImageInBox,
  parseFoptBlipIndex,
  resolveAnchorHostCell,
  splitRasterImagesFromDrawingPayload,
} from './excelXlsImages';

/** 1×1 PNG */
const TINY_PNG = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==')
    .split('')
    .map((c) => c.charCodeAt(0)),
);

function biffRecord(type: number, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(4 + data.length);
  out[0] = type & 0xff;
  out[1] = (type >> 8) & 0xff;
  out[2] = data.length & 0xff;
  out[3] = (data.length >> 8) & 0xff;
  out.set(data, 4);
  return out;
}

function officeArtRecord(version: number, instance: number, type: number, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + body.length);
  const verInst = (instance << 4) | (version & 0x0f);
  out[0] = verInst & 0xff;
  out[1] = (verInst >> 8) & 0xff;
  out[2] = type & 0xff;
  out[3] = (type >> 8) & 0xff;
  out[4] = body.length & 0xff;
  out[5] = (body.length >> 8) & 0xff;
  out[6] = (body.length >> 16) & 0xff;
  out[7] = (body.length >> 24) & 0xff;
  out.set(body, 8);
  return out;
}

function u16le(n: number): Uint8Array {
  return Uint8Array.from([n & 0xff, (n >> 8) & 0xff]);
}

function u32le(n: number): Uint8Array {
  return Uint8Array.from([n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff]);
}

function makePictureSpContainer(blipIndex: number, col1: number, row1: number): Uint8Array {
  // FOPT: 1 property, pid=0x104 blip
  const foptBody = new Uint8Array([...u16le(0x0104), ...u32le(blipIndex)]);
  const fopt = officeArtRecord(0x3, 1, 0xf00b, foptBody);
  const anchorBody = new Uint8Array([
    ...u16le(0),
    ...u16le(col1),
    ...u16le(0),
    ...u16le(row1),
    ...u16le(0),
    ...u16le(col1 + 1),
    ...u16le(0),
    ...u16le(row1 + 1),
    ...u16le(0),
  ]);
  const clientAnchor = officeArtRecord(0, 0, 0xf010, anchorBody);
  const spBody = new Uint8Array([...fopt, ...clientAnchor]);
  return officeArtRecord(0x0f, 0, 0xf004, spBody);
}

describe('splitRasterImagesFromDrawingPayload', () => {
  it('extracts a PNG by signature', () => {
    const pad = new Uint8Array([0, 1, 2, 3]);
    const payload = new Uint8Array(pad.length + TINY_PNG.length + pad.length);
    payload.set(pad, 0);
    payload.set(TINY_PNG, pad.length);
    payload.set(pad, pad.length + TINY_PNG.length);
    const images = splitRasterImagesFromDrawingPayload(payload);
    expect(images).toHaveLength(1);
    expect(images[0]!.mimeType).toBe('image/png');
  });
});

describe('collectMsoDrawingGroupPayload', () => {
  it('concatenates MsoDrawingGroup and CONTINUE', () => {
    const part1 = new Uint8Array([0xaa, ...TINY_PNG.subarray(0, 10)]);
    const part2 = TINY_PNG.subarray(10);
    const stream = new Uint8Array([
      ...biffRecord(0x00eb, part1),
      ...biffRecord(0x003c, part2),
      ...biffRecord(0x000a, new Uint8Array([1])),
    ]);
    const drawing = collectMsoDrawingGroupPayload(stream);
    expect(drawing.length).toBe(part1.length + part2.length);
    expect(extractImagesFromXlsWorkbookStream(stream).some((img) => img.mimeType === 'image/png')).toBe(true);
  });
});

describe('parseFoptBlipIndex', () => {
  it('reads blip property', () => {
    const body = new Uint8Array([...u16le(0x0104), ...u32le(2)]);
    expect(parseFoptBlipIndex(body, 1)).toBe(2);
  });
});

describe('collectPictureShapesFromOfficeArt', () => {
  it('only keeps SpContainer with blip + anchor', () => {
    const sp = makePictureSpContainer(1, 1, 2);
    const shapes = collectPictureShapesFromOfficeArt(sp, 0);
    expect(shapes).toHaveLength(1);
    expect(shapes[0]).toMatchObject({ blipIndex: 1, anchor: { col1: 1, row1: 2 } });
    expect(collectClientAnchorsFromOfficeArt(sp, 0)).toHaveLength(1);
  });
});

describe('extractAnchoredImagesFromXlsWorkbookStream', () => {
  it('pairs by blip index not by stray anchors', () => {
    const drawingGroup = biffRecord(0x00eb, TINY_PNG);
    const sp = makePictureSpContainer(1, 1, 3);
    const bofBody = new Uint8Array([...u16le(0x0600), ...u16le(0x0010)]);
    const stream = new Uint8Array([
      ...biffRecord(0x0809, bofBody),
      ...drawingGroup,
      ...biffRecord(0x00ec, sp),
    ]);
    const anchored = extractAnchoredImagesFromXlsWorkbookStream(stream);
    expect(anchored.length).toBeGreaterThanOrEqual(1);
    expect(anchored[0]!.anchor.col1).toBe(1);
    expect(anchored[0]!.anchor.row1).toBe(3);
  });
});

describe('resolveAnchorHostCell', () => {
  it('picks the column containing the visual center', () => {
    // span A(0)–B(1), center in B
    const host = resolveAnchorHostCell(
      { col1: 0, dx1: 800, row1: 1, dy1: 0, col2: 1, dx2: 800, row2: 2, dy2: 0 },
      [60, 140],
      [20, 120, 120],
    );
    expect(host.col).toBe(1);
    expect(host.row).toBe(1);
  });
});

describe('fitImageInBox / computeXlsClientAnchorSize', () => {
  it('fits without upscaling', () => {
    expect(fitImageInBox(200, 100, 100, 100)).toEqual({ width: 100, height: 50 });
  });

  it('uses 1024/256 cell-relative offsets', () => {
    const size = computeXlsClientAnchorSize(
      { col1: 0, dx1: 0, row1: 0, dy1: 0, col2: 1, dx2: 0, row2: 1, dy2: 0 },
      [100, 80],
      [40, 30],
    );
    expect(size).toEqual({ width: 100, height: 40 });
  });
});
