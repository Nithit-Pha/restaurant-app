// Draws a purchase order as A4 pages on a canvas and downloads them as a PDF.
// The canvas uses the app's own fonts, so Thai text always comes out right.
import { pdfFromJpegs, type JpegPage } from './pdfFromImages';

export interface OrderSheetLine {
  name: string;
  packs: number;
  packLabel: string; // "Bag 5 kg" or "5 kg"
  amount: string; // "25 kg"
}

export interface OrderSheet {
  fileName: string;
  draft: boolean; // shows "DRAFT" across the top
  labels: {
    title: string; draft: string; number: string; date: string; delivery: string; to: string; from: string;
    no: string; item: string; packs: string; pack: string; amount: string; note: string; orderedBy: string; page: string;
  };
  restaurant: { name: string; lines: string[] };
  supplier: { name: string; lines: string[] };
  number: string;
  date: string;
  delivery: string | null;
  lines: OrderSheetLine[];
  note: string | null;
  orderedBy: string | null;
}

const PX_PER_MM = 8; // ≈ 200 dpi
const W = 210;
const H = 297;
const M = 16; // page margin in mm
const FONT = '"IBM Plex Sans", "IBM Plex Sans Thai", system-ui, sans-serif';
const INK = '#1f2421';
const MUTED = '#6b706c';
const LINE = '#d9d6cf';
const ACCENT = '#55663b';

type Ctx = CanvasRenderingContext2D;

const font = (ctx: Ctx, size: number, weight = 400) => { ctx.font = `${weight} ${size}px ${FONT}`; };

/** Breaks text into lines that fit `width` (word by word; Thai is split into words by the browser). */
function wrap(ctx: Ctx, text: string, width: number): string[] {
  const seg = typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? [...new Intl.Segmenter(undefined, { granularity: 'word' }).segment(text)].map((s) => s.segment)
    : text.split(/(\s+)/);
  const out: string[] = [];
  let line = '';
  for (const piece of seg) {
    const next = line + piece;
    if (ctx.measureText(next).width <= width || !line) { line = next; continue; }
    out.push(line.trimEnd());
    line = piece.trimStart();
  }
  if (line.trim()) out.push(line.trimEnd());
  return out.length ? out : [''];
}

function newPage(): { canvas: HTMLCanvasElement; ctx: Ctx } {
  const canvas = document.createElement('canvas');
  canvas.width = W * PX_PER_MM;
  canvas.height = H * PX_PER_MM;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(PX_PER_MM, PX_PER_MM); // draw in millimetres
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = 'alphabetic';
  return { canvas, ctx };
}

function hr(ctx: Ctx, y: number, color = LINE, width = 0.25) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(M, y);
  ctx.lineTo(W - M, y);
  ctx.stroke();
}

/** Columns of the lines table (x in mm). */
const COL = { no: M + 2, item: M + 12, packs: 128, pack: 134, amount: W - M - 2 };

function tableHead(ctx: Ctx, s: OrderSheet, y: number): number {
  ctx.fillStyle = '#f2f0ea';
  ctx.fillRect(M, y, W - 2 * M, 8);
  font(ctx, 3, 600);
  ctx.fillStyle = MUTED;
  const base = y + 5.3;
  ctx.textAlign = 'left';
  ctx.fillText(s.labels.no, COL.no, base);
  ctx.fillText(s.labels.item, COL.item, base);
  ctx.textAlign = 'right';
  ctx.fillText(s.labels.packs, COL.packs, base);
  ctx.textAlign = 'left';
  ctx.fillText(s.labels.pack, COL.pack, base);
  ctx.textAlign = 'right';
  ctx.fillText(s.labels.amount, COL.amount, base);
  ctx.textAlign = 'left';
  return y + 8;
}

/** First page header: restaurant, title, number and dates, supplier. Returns the y below it. */
function firstHeader(ctx: Ctx, s: OrderSheet): number {
  let y = M + 6;
  font(ctx, 6, 600);
  ctx.fillStyle = INK;
  wrap(ctx, s.restaurant.name, 100).slice(0, 2).forEach((l) => { ctx.fillText(l, M, y); y += 7; });
  font(ctx, 3.2);
  ctx.fillStyle = MUTED;
  s.restaurant.lines.forEach((text) => wrap(ctx, text, 100).forEach((l) => { ctx.fillText(l, M, y); y += 4.6; }));

  // Title block, right side.
  ctx.textAlign = 'right';
  let ry = M + 6;
  font(ctx, 7, 600);
  ctx.fillStyle = ACCENT;
  ctx.fillText(s.labels.title, W - M, ry);
  ry += 8;
  if (s.draft) {
    font(ctx, 3.6, 600);
    ctx.fillStyle = '#b4531c';
    ctx.fillText(s.labels.draft, W - M, ry);
    ry += 6;
  }
  const meta: [string, string][] = [[s.labels.number, s.number], [s.labels.date, s.date]];
  if (s.delivery) meta.push([s.labels.delivery, s.delivery]);
  meta.forEach(([k, v]) => {
    font(ctx, 3.4, 600);
    ctx.fillStyle = INK;
    ctx.fillText(v, W - M, ry);
    const vw = ctx.measureText(v).width;
    font(ctx, 3.4);
    ctx.fillStyle = MUTED;
    ctx.fillText(`${k}  `, W - M - vw, ry);
    ry += 5.2;
  });
  ctx.textAlign = 'left';

  y = Math.max(y, ry) + 4;
  hr(ctx, y, LINE, 0.3);
  y += 7;

  // Supplier
  font(ctx, 3, 600);
  ctx.fillStyle = MUTED;
  ctx.fillText(s.labels.to.toUpperCase(), M, y);
  y += 6;
  font(ctx, 4.6, 600);
  ctx.fillStyle = INK;
  wrap(ctx, s.supplier.name, W - 2 * M).forEach((l) => { ctx.fillText(l, M, y); y += 5.6; });
  font(ctx, 3.4);
  ctx.fillStyle = INK;
  s.supplier.lines.forEach((text) => wrap(ctx, text, W - 2 * M).forEach((l) => { ctx.fillText(l, M, y); y += 4.8; }));
  return y + 5;
}

function laterHeader(ctx: Ctx, s: OrderSheet): number {
  font(ctx, 4, 600);
  ctx.fillStyle = INK;
  ctx.fillText(`${s.labels.title} ${s.number}`, M, M + 5);
  ctx.textAlign = 'right';
  font(ctx, 3.4);
  ctx.fillStyle = MUTED;
  ctx.fillText(s.supplier.name, W - M, M + 5);
  ctx.textAlign = 'left';
  return M + 12;
}

function footer(ctx: Ctx, s: OrderSheet, page: number, pages: number) {
  font(ctx, 3);
  ctx.fillStyle = MUTED;
  hr(ctx, H - M + 1);
  if (s.orderedBy) ctx.fillText(`${s.labels.orderedBy}: ${s.orderedBy}`, M, H - M + 6);
  ctx.textAlign = 'right';
  ctx.fillText(`${s.number} · ${s.labels.page} ${page}/${pages}`, W - M, H - M + 6);
  ctx.textAlign = 'left';
}

/** Draws all pages. Exported for checking the layout in the browser. */
export async function drawOrderSheet(s: OrderSheet): Promise<HTMLCanvasElement[]> {
  if (typeof document !== 'undefined' && document.fonts) {
    await Promise.all([400, 600].flatMap((w) => [
      document.fonts.load(`${w} 16px "IBM Plex Sans"`, 'A'),
      document.fonts.load(`${w} 16px "IBM Plex Sans Thai"`, 'ก'),
    ])).catch(() => undefined);
  }
  const bottom = H - M - 4;
  const pages: { canvas: HTMLCanvasElement; ctx: Ctx }[] = [];
  let page = newPage();
  pages.push(page);
  let y = tableHead(page.ctx, s, firstHeader(page.ctx, s));

  s.lines.forEach((line, i) => {
    font(page.ctx, 3.6);
    const nameLines = wrap(page.ctx, line.name, COL.packs - COL.item - 14);
    const packLines = wrap(page.ctx, line.packLabel, COL.amount - COL.pack - 24);
    const rowH = Math.max(nameLines.length, packLines.length) * 4.8 + 3.4;
    if (y + rowH > bottom) {
      page = newPage();
      pages.push(page);
      y = tableHead(page.ctx, s, laterHeader(page.ctx, s));
    }
    const ctx = page.ctx;
    const base = y + 5.6;
    font(ctx, 3.6);
    ctx.fillStyle = MUTED;
    ctx.fillText(String(i + 1), COL.no, base);
    ctx.fillStyle = INK;
    nameLines.forEach((l, k) => ctx.fillText(l, COL.item, base + k * 4.8));
    packLines.forEach((l, k) => ctx.fillText(l, COL.pack, base + k * 4.8));
    ctx.textAlign = 'right';
    font(ctx, 3.8, 600);
    ctx.fillText(String(line.packs), COL.packs, base);
    font(ctx, 3.6);
    ctx.fillText(line.amount, COL.amount, base);
    ctx.textAlign = 'left';
    y += rowH;
    hr(ctx, y);
  });

  if (s.note) {
    font(page.ctx, 3.4);
    const noteLines = wrap(page.ctx, s.note, W - 2 * M - 8);
    const boxH = noteLines.length * 4.8 + 11;
    if (y + 6 + boxH > bottom) {
      page = newPage();
      pages.push(page);
      y = laterHeader(page.ctx, s);
    }
    const ctx = page.ctx;
    y += 6;
    ctx.fillStyle = '#f7f5f0';
    ctx.fillRect(M, y, W - 2 * M, boxH);
    font(ctx, 3, 600);
    ctx.fillStyle = MUTED;
    ctx.fillText(s.labels.note.toUpperCase(), M + 4, y + 5.5);
    font(ctx, 3.4);
    ctx.fillStyle = INK;
    noteLines.forEach((l, k) => ctx.fillText(l, M + 4, y + 10.5 + k * 4.8));
  }

  pages.forEach((p, i) => footer(p.ctx, s, i + 1, pages.length));
  return pages.map((p) => p.canvas);
}

async function toJpeg(canvas: HTMLCanvasElement): Promise<JpegPage> {
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not draw the page'))), 'image/jpeg', 0.9));
  return { bytes: new Uint8Array(await blob.arrayBuffer()), width: canvas.width, height: canvas.height };
}

/** Draws the order and makes the browser download it as a PDF. */
export async function downloadOrderPdf(s: OrderSheet): Promise<void> {
  const canvases = await drawOrderSheet(s);
  const pdf = pdfFromJpegs(await Promise.all(canvases.map(toJpeg)));
  const url = URL.createObjectURL(new Blob([pdf as BlobPart], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = s.fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
