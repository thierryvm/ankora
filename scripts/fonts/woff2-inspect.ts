/**
 * Minimal, dependency-free WOFF2 reader — enough to answer the questions the
 * font coverage test asks, and nothing more:
 *
 *   - which code points does the `cmap` map? (format 4 and format 12)
 *   - which OpenType features does `GSUB` / `GPOS` declare, and do they carry
 *     at least one lookup? (so `tnum` "survives" means it still DOES something)
 *   - which variation axes does `fvar` keep?
 *   - what do the `name` records say?
 *   - are the vertical metrics of two files of one family the same? (a
 *     mismatch would jump the line height when a latin-ext character appears)
 *
 * WOFF2 (W3C, https://www.w3.org/TR/WOFF2/) stores the SFNT tables as one
 * Brotli stream. Only `glyf`, `loca` and `hmtx` may be transformed; every
 * table read here is stored verbatim, so slicing the decompressed stream by
 * the directory lengths is exact. Node ships Brotli (`zlib`), so this file adds
 * no npm dependency — that is the point of writing it by hand.
 */
import { brotliDecompressSync } from 'node:zlib';

export type SfntTables = ReadonlyMap<string, Buffer>;

export type VerticalMetrics = {
  unitsPerEm: number;
  hheaAscender: number;
  hheaDescender: number;
  hheaLineGap: number;
  typoAscender: number;
  typoDescender: number;
  typoLineGap: number;
  winAscent: number;
  winDescent: number;
};

export type FontReport = {
  /** Every code point the best Unicode cmap subtable maps to a non-zero glyph. */
  codePoints: ReadonlySet<number>;
  /** The glyph id each of those code points maps to (two code points sharing a glyph = alias). */
  glyphIds: ReadonlyMap<number, number>;
  /** GSUB + GPOS feature tags that carry at least one lookup. */
  features: ReadonlySet<string>;
  /** `fvar` axis tags, in table order (empty for a static font). */
  axes: readonly string[];
  /** `name` records keyed by name ID (Windows / Unicode BMP records only). */
  names: ReadonlyMap<number, string>;
  /** `post.italicAngle` !== 0 or `head.macStyle` italic bit. */
  italic: boolean;
  metrics: VerticalMetrics;
};

function readBase128(buf: Buffer, offset: number): { value: number; next: number } {
  let value = 0;
  for (let i = 0; i < 5; i += 1) {
    const byte = buf.readUInt8(offset + i);
    if (i === 0 && byte === 0x80) throw new Error('WOFF2: UIntBase128 with a leading zero');
    if (value & 0xfe000000) throw new Error('WOFF2: UIntBase128 overflow');
    value = (value << 7) | (byte & 0x7f);
    if ((byte & 0x80) === 0) return { value: value >>> 0, next: offset + i + 1 };
  }
  throw new Error('WOFF2: UIntBase128 longer than 5 bytes');
}

// The 63 tags WOFF2 encodes as a 6-bit index (spec §5.1, table "Known Table Tags").
const KNOWN_TAGS = [
  'cmap',
  'head',
  'hhea',
  'hmtx',
  'maxp',
  'name',
  'OS/2',
  'post',
  'cvt ',
  'fpgm',
  'glyf',
  'loca',
  'prep',
  'CFF ',
  'VORG',
  'EBDT',
  'EBLC',
  'gasp',
  'hdmx',
  'kern',
  'LTSH',
  'PCLT',
  'VDMX',
  'vhea',
  'vmtx',
  'BASE',
  'GDEF',
  'GPOS',
  'GSUB',
  'EBSC',
  'JSTF',
  'MATH',
  'CBDT',
  'CBLC',
  'COLR',
  'CPAL',
  'SVG ',
  'sbix',
  'acnt',
  'avar',
  'bdat',
  'bloc',
  'bsln',
  'cvar',
  'fdsc',
  'feat',
  'fmtx',
  'fvar',
  'gvar',
  'hsty',
  'just',
  'lcar',
  'mort',
  'morx',
  'opbd',
  'prop',
  'trak',
  'Zapf',
  'Silf',
  'Glat',
  'Gloc',
  'Feat',
  'Sill',
] as const;

/** Decompresses a WOFF2 file into its (untransformed) SFNT tables. */
export function readWoff2Tables(file: Buffer): SfntTables {
  if (file.toString('latin1', 0, 4) !== 'wOF2') throw new Error('Not a WOFF2 file');
  const flavor = file.toString('latin1', 4, 8);
  if (flavor === 'ttcf') throw new Error('WOFF2 collections are not supported');
  const numTables = file.readUInt16BE(12);
  const totalCompressedSize = file.readUInt32BE(20);

  let offset = 48;
  const entries: { tag: string; length: number }[] = [];
  for (let i = 0; i < numTables; i += 1) {
    const flags = file.readUInt8(offset);
    offset += 1;
    const tagIndex = flags & 0x3f;
    let tag: string;
    if (tagIndex === 0x3f) {
      tag = file.toString('latin1', offset, offset + 4);
      offset += 4;
    } else {
      const known = KNOWN_TAGS[tagIndex];
      if (!known) throw new Error(`WOFF2: unknown table index ${tagIndex}`);
      tag = known;
    }
    const transformVersion = (flags >> 6) & 0x03;
    const orig = readBase128(file, offset);
    offset = orig.next;
    let length = orig.value;
    // glyf/loca are transformed when the version is 0; every other table is
    // transformed when it is NOT 0 (spec §5.2). A transformed table stores its
    // transformLength in the stream.
    const transformed =
      tag === 'glyf' || tag === 'loca' ? transformVersion === 0 : transformVersion !== 0;
    if (transformed) {
      const t = readBase128(file, offset);
      offset = t.next;
      length = t.value;
    }
    entries.push({ tag, length });
  }

  const stream = brotliDecompressSync(file.subarray(offset, offset + totalCompressedSize));
  const tables = new Map<string, Buffer>();
  let cursor = 0;
  for (const { tag, length } of entries) {
    tables.set(tag, stream.subarray(cursor, cursor + length));
    cursor += length;
  }
  return tables;
}

function table(tables: SfntTables, tag: string): Buffer {
  const t = tables.get(tag);
  if (!t) throw new Error(`Font has no '${tag}' table`);
  return t;
}

/** Code point → glyph id from the best Unicode subtable (format 12 preferred, else format 4). */
export function readCmap(tables: SfntTables): Map<number, number> {
  const cmap = table(tables, 'cmap');
  const count = cmap.readUInt16BE(2);
  let format4: number | undefined;
  let format12: number | undefined;
  for (let i = 0; i < count; i += 1) {
    const rec = 4 + i * 8;
    const platform = cmap.readUInt16BE(rec);
    const encoding = cmap.readUInt16BE(rec + 2);
    const sub = cmap.readUInt32BE(rec + 4);
    const format = cmap.readUInt16BE(sub);
    const unicode = platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10));
    if (!unicode) continue;
    if (format === 12) format12 = sub;
    if (format === 4) format4 = sub;
  }

  const points = new Map<number, number>();
  if (format12 !== undefined) {
    const groups = cmap.readUInt32BE(format12 + 12);
    for (let g = 0; g < groups; g += 1) {
      const base = format12 + 16 + g * 12;
      const start = cmap.readUInt32BE(base);
      const end = cmap.readUInt32BE(base + 4);
      const glyph = cmap.readUInt32BE(base + 8);
      for (let cp = start; cp <= end; cp += 1) {
        const id = glyph + (cp - start);
        if (id !== 0) points.set(cp, id);
      }
    }
    return points;
  }
  if (format4 === undefined) throw new Error('cmap has no Unicode format 4 or 12 subtable');

  const segX2 = cmap.readUInt16BE(format4 + 6);
  const ends = format4 + 14;
  const starts = ends + segX2 + 2;
  const deltas = starts + segX2;
  const rangeOffsets = deltas + segX2;
  for (let s = 0; s < segX2 / 2; s += 1) {
    const end = cmap.readUInt16BE(ends + s * 2);
    const start = cmap.readUInt16BE(starts + s * 2);
    const delta = cmap.readInt16BE(deltas + s * 2);
    const rangeOffsetPos = rangeOffsets + s * 2;
    const rangeOffset = cmap.readUInt16BE(rangeOffsetPos);
    for (let cp = start; cp <= end && cp !== 0xffff; cp += 1) {
      let glyph: number;
      if (rangeOffset === 0) {
        glyph = (cp + delta) & 0xffff;
      } else {
        const at = rangeOffsetPos + rangeOffset + (cp - start) * 2;
        const raw = cmap.readUInt16BE(at);
        glyph = raw === 0 ? 0 : (raw + delta) & 0xffff;
      }
      if (glyph !== 0) points.set(cp, glyph);
    }
  }
  return points;
}

/** Feature tags of a GSUB/GPOS table that reference at least one lookup. */
function readLayoutFeatures(layout: Buffer | undefined): Set<string> {
  const tags = new Set<string>();
  if (!layout) return tags;
  const featureList = layout.readUInt16BE(6);
  const count = layout.readUInt16BE(featureList);
  for (let i = 0; i < count; i += 1) {
    const rec = featureList + 2 + i * 6;
    const tag = layout.toString('latin1', rec, rec + 4);
    const feature = featureList + layout.readUInt16BE(rec + 4);
    const lookups = layout.readUInt16BE(feature + 2);
    if (lookups > 0) tags.add(tag);
  }
  return tags;
}

function readAxes(tables: SfntTables): string[] {
  const fvar = tables.get('fvar');
  if (!fvar) return [];
  const axesOffset = fvar.readUInt16BE(4);
  const count = fvar.readUInt16BE(8);
  const size = fvar.readUInt16BE(10);
  const axes: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const at = axesOffset + i * size;
    axes.push(fvar.toString('latin1', at, at + 4));
  }
  return axes;
}

function readNames(tables: SfntTables): Map<number, string> {
  const name = table(tables, 'name');
  const count = name.readUInt16BE(2);
  const storage = name.readUInt16BE(4);
  const names = new Map<number, string>();
  for (let i = 0; i < count; i += 1) {
    const rec = 6 + i * 12;
    const platform = name.readUInt16BE(rec);
    const encoding = name.readUInt16BE(rec + 2);
    const language = name.readUInt16BE(rec + 4);
    const id = name.readUInt16BE(rec + 6);
    const length = name.readUInt16BE(rec + 8);
    const off = name.readUInt16BE(rec + 10);
    // Windows, Unicode BMP, en-US: the record every subsetter keeps.
    if (platform !== 3 || encoding !== 1 || language !== 0x0409) continue;
    const raw = name.subarray(storage + off, storage + off + length);
    names.set(id, Buffer.from(raw).swap16().toString('utf16le'));
  }
  return names;
}

function readItalic(tables: SfntTables): boolean {
  const head = table(tables, 'head');
  const post = table(tables, 'post');
  const macStyleItalic = (head.readUInt16BE(44) & 0x02) !== 0;
  const italicAngle = post.readInt32BE(4);
  return macStyleItalic || italicAngle !== 0;
}

function readMetrics(tables: SfntTables): VerticalMetrics {
  const head = table(tables, 'head');
  const hhea = table(tables, 'hhea');
  const os2 = table(tables, 'OS/2');
  return {
    unitsPerEm: head.readUInt16BE(18),
    hheaAscender: hhea.readInt16BE(4),
    hheaDescender: hhea.readInt16BE(6),
    hheaLineGap: hhea.readInt16BE(8),
    typoAscender: os2.readInt16BE(68),
    typoDescender: os2.readInt16BE(70),
    typoLineGap: os2.readInt16BE(72),
    winAscent: os2.readUInt16BE(74),
    winDescent: os2.readUInt16BE(76),
  };
}

export function inspectWoff2(file: Buffer): FontReport {
  const tables = readWoff2Tables(file);
  const features = readLayoutFeatures(tables.get('GSUB'));
  for (const tag of readLayoutFeatures(tables.get('GPOS'))) features.add(tag);
  const glyphIds = readCmap(tables);
  return {
    codePoints: new Set(glyphIds.keys()),
    glyphIds,
    features,
    axes: readAxes(tables),
    names: readNames(tables),
    italic: readItalic(tables),
    metrics: readMetrics(tables),
  };
}
