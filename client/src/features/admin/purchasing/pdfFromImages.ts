// A tiny PDF writer: one JPEG picture per A4 page, nothing else.
// Enough for a purchase order sheet drawn on a canvas (Thai text included),
// without adding a PDF library.

const A4 = { width: 595.28, height: 841.89 }; // points

export interface JpegPage {
  bytes: Uint8Array; // the JPEG file
  width: number; // pixels
  height: number;
}

const ascii = (s: string) => new TextEncoder().encode(s);

/** Builds a PDF file with each JPEG filling one A4 page. */
export function pdfFromJpegs(pages: JpegPage[]): Uint8Array {
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (c: Uint8Array) => { chunks.push(c); length += c.length; };
  const object = (n: number, parts: (string | Uint8Array)[]) => {
    offsets[n] = length;
    push(ascii(`${n} 0 obj\n`));
    parts.forEach((p) => push(typeof p === 'string' ? ascii(p) : p));
    push(ascii('\nendobj\n'));
  };

  // Objects: 1 catalog, 2 page tree, then per page: page, picture, drawing.
  const pageNo = (i: number) => 3 + i * 3;
  push(ascii('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'));
  object(1, ['<< /Type /Catalog /Pages 2 0 R >>']);
  object(2, [`<< /Type /Pages /Kids [${pages.map((_, i) => `${pageNo(i)} 0 R`).join(' ')}] /Count ${pages.length} >>`]);
  pages.forEach((p, i) => {
    const n = pageNo(i);
    const draw = `q ${A4.width} 0 0 ${A4.height} 0 0 cm /Im0 Do Q`;
    object(n, [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4.width} ${A4.height}] /Resources << /XObject << /Im0 ${n + 1} 0 R >> >> /Contents ${n + 2} 0 R >>`]);
    object(n + 1, [
      `<< /Type /XObject /Subtype /Image /Width ${p.width} /Height ${p.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.bytes.length} >>\nstream\n`,
      p.bytes,
      '\nendstream',
    ]);
    object(n + 2, [`<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`]);
  });

  const count = 3 + pages.length * 3;
  const xref = length;
  let table = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let n = 1; n < count; n++) table += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`;
  push(ascii(`${table}trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`));

  const out = new Uint8Array(length);
  let at = 0;
  chunks.forEach((c) => { out.set(c, at); at += c.length; });
  return out;
}
