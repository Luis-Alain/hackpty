import { deflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Deterministic OCR bitmap fixtures, drawn with the same 5x7 bitmap-font PNG
 * encoding approach as diagnostics/qvac-spike/fixture.ts, extended with the
 * digits 2-9 and '/' so vitals, doses and dates can be rendered. Synthetic
 * only; every note states SYNTHETIC and NOT A REAL PATIENT.
 */
export const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');

const glyphs: Record<string, string> = {
  A:'01110 10001 10001 11111 10001 10001 10001',B:'11110 10001 10001 11110 10001 10001 11110',C:'01111 10000 10000 10000 10000 10000 01111',
  D:'11110 10001 10001 10001 10001 10001 11110',E:'11111 10000 10000 11110 10000 10000 11111',F:'11111 10000 10000 11110 10000 10000 10000',
  G:'01111 10000 10000 10111 10001 10001 01110',H:'10001 10001 10001 11111 10001 10001 10001',I:'11111 00100 00100 00100 00100 00100 11111',
  J:'00111 00010 00010 00010 00010 10010 01100',K:'10001 10010 10100 11000 10100 10010 10001',L:'10000 10000 10000 10000 10000 10000 11111',
  M:'10001 11011 10101 10101 10001 10001 10001',N:'10001 11001 10101 10011 10001 10001 10001',O:'01110 10001 10001 10001 10001 10001 01110',
  P:'11110 10001 10001 11110 10000 10000 10000',Q:'01110 10001 10001 10001 10101 10010 01101',R:'11110 10001 10001 11110 10100 10010 10001',
  S:'01111 10000 10000 01110 00001 00001 11110',T:'11111 00100 00100 00100 00100 00100 00100',U:'10001 10001 10001 10001 10001 10001 01110',
  V:'10001 10001 10001 10001 10001 01010 00100',W:'10001 10001 10001 10101 10101 11011 10001',X:'10001 10001 01010 00100 01010 10001 10001',
  Y:'10001 10001 01010 00100 00100 00100 00100',Z:'11111 00001 00010 00100 01000 10000 11111',
  '0':'01110 10001 10011 10101 11001 10001 01110','1':'00100 01100 00100 00100 00100 00100 01110',
  '2':'01110 10001 00001 00010 00100 01000 11111','3':'11111 00010 00100 00010 00001 10001 01110',
  '4':'00010 00110 01010 10010 11111 00010 00010','5':'11111 10000 11110 00001 00001 10001 01110',
  '6':'00110 01000 10000 11110 10001 10001 01110','7':'11111 00001 00010 00100 01000 01000 01000',
  '8':'01110 10001 10001 01110 10001 10001 01110','9':'01110 10001 10001 01111 00001 00010 01100',
  ':':'00000 00100 00100 00000 00100 00100 00000','.':'00000 00000 00000 00000 00000 00100 00100','-':'00000 00000 00000 11111 00000 00000 00000',
  '/':'00001 00010 00010 00100 01000 01000 10000',' ':'00000 00000 00000 00000 00000 00000 00000',
};

function crc32(bytes: Buffer) { let crc = 0xffffffff; for (const byte of bytes) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); } return (crc ^ 0xffffffff) >>> 0; }
function chunk(type: string, data: Buffer) { const kind = Buffer.from(type), length = Buffer.alloc(4), crc = Buffer.alloc(4); length.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([kind, data]))); return Buffer.concat([length, kind, data, crc]); }

export interface OcrBitmapSpec { id: string; lines: string[]; maskedLine?: number; }

/** Scoring reference: every visible line verbatim, a masked line replaced by the required abstention marker. */
export const referenceText = (spec: OcrBitmapSpec) => spec.lines.map((line, index) => index === spec.maskedLine ? '[unclear]' : line).join('\n');

export function renderOcrBitmap(spec: OcrBitmapSpec): Buffer {
  const lines = spec.lines;
  const width = Math.max(1160, 90 + Math.max(...lines.map(line => line.length)) * 30), height = Math.max(450, 90 + lines.length * 75), scale = 5;
  const pixels = Buffer.alloc(width * height * 3, 255);
  for (let line = 0; line < lines.length; line++) for (let col = 0; col < lines[line].length; col++) {
    const glyph = glyphs[lines[line][col]]; if (!glyph) throw new Error(`Missing OCR fixture glyph ${lines[line][col]}`);
    const rows = glyph.split(' ');
    for (let y = 0; y < 7; y++) for (let x = 0; x < 5; x++) if (rows[y][x] === '1') for (let py = 0; py < scale; py++) for (let px = 0; px < scale; px++) {
      const index = ((45 + line * 75 + y * scale + py) * width + (45 + col * 6 * scale + x * scale + px)) * 3; pixels[index] = 15; pixels[index + 1] = 15; pixels[index + 2] = 15;
    }
  }
  // A solid bar deliberately removes information; no hidden letters remain.
  if (spec.maskedLine !== undefined) for (let y = 45 + spec.maskedLine * 75; y < 45 + spec.maskedLine * 75 + 35; y++) for (let x = 45; x < width - 45; x++) { const index = (y * width + x) * 3; pixels[index] = pixels[index + 1] = pixels[index + 2] = 15; }
  const raw = Buffer.alloc(height * (width * 3 + 1)); for (let y = 0; y < height; y++) pixels.copy(raw, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

export const OCR_BITMAP_FIXTURES: OcrBitmapSpec[] = [
  {
    id: 'syn-ocr-stress-01',
    lines: [
      'SYNTHETIC OUTPATIENT NOTE - NOT A REAL PATIENT',
      'SOURCE ID: SYN-OCR-STRESS-01',
      'VISIT DATE: 2026-08-14',
      'BLOOD PRESSURE 142/88 MMHG SEATED.',
      'WEIGHT 79.5 KG. HEART RATE 72 BPM.',
      'DENIES CHEST PAIN. DENIES DIZZINESS.',
      'MEDICATION: AMLODIPINE 5 MG ONCE DAILY.',
      'NO NEW MEDICATIONS SINCE 2026-05-02.',
      'PLAN: FOLLOW UP IN 3 MONTHS.',
    ],
  },
  {
    id: 'syn-ocr-mask-01',
    lines: [
      'SYNTHETIC OUTPATIENT NOTE - NOT A REAL PATIENT',
      'SOURCE ID: SYN-OCR-MASK-01',
      'VISIT DATE: 2026-09-01',
      'REPORTS HEADACHES TWICE PER WEEK.',
      'DURATION ABOUT TWO WEEKS.',
      'NO DIAGNOSIS RECORDED.',
      'PLAN: REVIEW SYMPTOM LOG IN 2 WEEKS.',
    ],
    maskedLine: 4,
  },
];

async function main(root = process.cwd()) {
  const directory = path.join(root, 'diagnostics/qvac-spike/ocr-fixtures/bitmaps');
  await mkdir(directory, { recursive: true });
  const written: { id: string; file: string; sha256: string; bytes: number; reference: string }[] = [];
  for (const spec of OCR_BITMAP_FIXTURES) {
    const first = renderOcrBitmap(spec), second = renderOcrBitmap(spec);
    if (sha256(first) !== sha256(second)) throw new Error(`Non-deterministic rendering for ${spec.id}`);
    const file = path.join(directory, `${spec.id}.png`);
    await writeFile(file, first);
    written.push({ id: spec.id, file: path.relative(root, file), sha256: sha256(first), bytes: first.length, reference: referenceText(spec) });
  }
  console.log(JSON.stringify({ generatedAt: new Date().toISOString(), deterministic: true, fixtures: written }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
