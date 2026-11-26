import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { formatBRL } from "@/lib/money";

export type PdfRow = { code: string | null; name: string; category: string; description: string | null; image: string | null; costCents: number | null; profileName: string | null; markupText: string | null; calcCents: number | null; minCents: number | null; marginBps: number | null; sitePriceCents: number | null; stateLabel: string };
export type PdfOptions = { mode: "clientes" | "interna"; photos: boolean; brand: string; subtitle: string; generatedAt: Date; fetchImage?: (url: string) => Promise<Uint8Array | null> };

const INK = rgb(0.12, 0.14, 0.13), MUTED = rgb(0.45, 0.45, 0.43), LINE = rgb(0.86, 0.85, 0.82), ZEBRA = rgb(0.975, 0.97, 0.96);
const brDate = (d: Date) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(d);
const pct = (bps: number | null) => (bps == null ? "-" : `${(bps / 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);
const money = (c: number | null) => (c == null ? "-" : formatBRL(c).replace(/ /g, " "));

type Col = { title: string; width: number; align?: "left" | "right"; maxLines?: number; get: (r: PdfRow) => string; bold?: boolean; size?: number };

/** Gera a tabela de preços em PDF (A4). "clientes": código, produto, descrição e preço do site. "interna": custos, markup e margens. */
export async function buildPriceTablePdf(rows: PdfRow[], o: PdfOptions) {
  const doc = await PDFDocument.create();
  doc.setTitle(`Tabela de preços - ${o.brand}`); doc.setCreator(o.brand); doc.setProducer(o.brand);
  const font = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const landscape = o.mode === "interna";
  const [W, H] = landscape ? [841.89, 595.28] : [595.28, 841.89];
  const M = 32, inner = W - 2 * M;
  const photoW = o.photos ? 52 : 0;

  const cols: Col[] = o.mode === "clientes"
    ? [
        { title: "Código", width: 72, get: (r) => r.code ?? "-", size: 8 },
        { title: "Produto", width: 0, get: (r) => r.name, bold: true, maxLines: 2 },
        { title: "Descrição", width: 0, get: (r) => r.description ?? "", maxLines: 4, size: 7.5 },
        { title: "Preço", width: 78, align: "right", get: (r) => money(r.sitePriceCents), bold: true },
      ]
    : [
        { title: "Código", width: 68, get: (r) => r.code ?? "-", size: 7.5 },
        { title: "Produto", width: 0, get: (r) => r.name, bold: true, maxLines: 2, size: 8 },
        { title: "Categoria", width: 82, get: (r) => r.category, maxLines: 2, size: 7.5 },
        { title: "Custo final", width: 62, align: "right", get: (r) => money(r.costCents), size: 8 },
        { title: "Markup", width: 92, get: (r) => r.profileName ?? r.markupText ?? "-", maxLines: 2, size: 7.5 },
        { title: "Preço calculado", width: 70, align: "right", get: (r) => money(r.calcCents), bold: true, size: 8 },
        { title: "Mínimo", width: 62, align: "right", get: (r) => money(r.minCents), size: 8 },
        { title: "Margem", width: 44, align: "right", get: (r) => pct(r.marginBps), size: 8 },
        { title: "Preço no site", width: 66, align: "right", get: (r) => money(r.sitePriceCents), size: 8 },
        { title: "Situação", width: 78, get: (r) => r.stateLabel, maxLines: 2, size: 7 },
      ];
  const fixed = cols.reduce((a, c) => a + c.width, 0) + photoW, flex = cols.filter((c) => !c.width);
  flex.forEach((c, i) => (c.width = o.mode === "clientes" ? (i === 0 ? 0.42 : 0.58) * (inner - fixed) : (inner - fixed) / flex.length));

  // caracteres fora da codificação da fonte padrão são trocados (o PDF não aceita qualquer Unicode)
  const okCache = new Map<string, boolean>();
  const safe = (t: string, f: PDFFont) => [...t.replace(/[−‐‑]/g, "-").replace(/[  ]/g, " ").replace(/[“”]/g, '"').replace(/[‘’]/g, "'")].map((ch) => {
    const k = ch; if (!okCache.has(k)) { try { f.encodeText(ch); okCache.set(k, true); } catch { okCache.set(k, false); } }
    return okCache.get(k) ? ch : "?";
  }).join("");
  const wrap = (text: string, f: PDFFont, size: number, width: number, maxLines = 99) => {
    const words = safe(text, f).replace(/\s+/g, " ").trim().split(" ").filter(Boolean); const lines: string[] = []; let cur = "";
    for (const w of words) {
      const t = cur ? `${cur} ${w}` : w;
      if (f.widthOfTextAtSize(t, size) <= width) { cur = t; continue; }
      if (cur) lines.push(cur); cur = w;
      while (f.widthOfTextAtSize(cur, size) > width && cur.length > 1) { let i = cur.length; while (i > 1 && f.widthOfTextAtSize(cur.slice(0, i), size) > width) i--; lines.push(cur.slice(0, i)); cur = cur.slice(i); }
    }
    if (cur) lines.push(cur);
    if (lines.length > maxLines) { const l = lines.slice(0, maxLines); let last = l[maxLines - 1]; while (last && f.widthOfTextAtSize(`${last}...`, size) > width) last = last.slice(0, -1); l[maxLines - 1] = `${last}...`; return l; }
    return lines;
  };

  // fotos (jpg/png) — as que não puderem ser lidas ficam em branco
  const images = new Map<string, PDFImage | null>();
  if (o.photos && o.fetchImage) {
    await Promise.all([...new Set(rows.map((r) => r.image).filter(Boolean) as string[])].map(async (url) => {
      try {
        const bytes = await o.fetchImage!(url); if (!bytes) { images.set(url, null); return; }
        const isPng = bytes[0] === 0x89 && bytes[1] === 0x50, isJpg = bytes[0] === 0xff && bytes[1] === 0xd8;
        images.set(url, isPng ? await doc.embedPng(bytes) : isJpg ? await doc.embedJpg(bytes) : null);
      } catch { images.set(url, null); }
    }));
  }

  const pages: PDFPage[] = [];
  let page!: PDFPage, y = 0;
  const headerRow = () => {
    let x = M + photoW; const h = 20;
    page.drawRectangle({ x: M, y: y - h, width: inner, height: h, color: INK });
    if (o.photos) page.drawText("Foto", { x: M + 6, y: y - 13.5, size: 7.5, font: bold, color: rgb(1, 1, 1) });
    for (const c of cols) {
      const t = safe(c.title.toUpperCase(), bold), tw = bold.widthOfTextAtSize(t, 7);
      page.drawText(t, { x: c.align === "right" ? x + c.width - 6 - tw : x + 6, y: y - 13.5, size: 7, font: bold, color: rgb(1, 1, 1) });
      x += c.width;
    }
    y -= h;
  };
  const newPage = () => {
    page = doc.addPage([W, H]); pages.push(page); y = H - M;
    page.drawText(safe(o.brand, bold), { x: M, y: y - 14, size: 14, font: bold, color: INK });
    const title = o.mode === "clientes" ? "Tabela de preços" : "Tabela de preços - uso interno";
    page.drawText(safe(title, font), { x: M, y: y - 30, size: 10, font, color: INK });
    const right = safe(`Gerada em ${brDate(o.generatedAt)}`, font); page.drawText(right, { x: W - M - font.widthOfTextAtSize(right, 8), y: y - 14, size: 8, font, color: MUTED });
    if (o.subtitle) { const st = safe(o.subtitle, font); page.drawText(st, { x: W - M - font.widthOfTextAtSize(st, 8), y: y - 28, size: 8, font, color: MUTED }); }
    y -= 44; headerRow();
  };
  newPage();

  rows.forEach((r, idx) => {
    const cells = cols.map((c) => { const f = c.bold ? bold : font, size = c.size ?? 8.5; return { c, f, size, lines: wrap(c.get(r), f, size, c.width - 12, c.maxLines) }; });
    const textH = Math.max(...cells.map((x) => x.lines.length * (x.size + 2.5))) + 12;
    const rowH = Math.max(textH, o.photos ? photoW + 4 : 0, 22);
    if (y - rowH < M + 24) newPage();
    if (idx % 2 === 1) page.drawRectangle({ x: M, y: y - rowH, width: inner, height: rowH, color: ZEBRA });
    page.drawLine({ start: { x: M, y: y - rowH }, end: { x: M + inner, y: y - rowH }, thickness: 0.5, color: LINE });
    if (o.photos) {
      const img = r.image ? images.get(r.image) : null, box = photoW - 8;
      if (img) { const s = Math.min(box / img.width, box / img.height); const w = img.width * s, h = img.height * s; page.drawImage(img, { x: M + 4 + (box - w) / 2, y: y - 4 - box + (box - h) / 2, width: w, height: h }); }
      else page.drawRectangle({ x: M + 4, y: y - 4 - box, width: box, height: box, borderColor: LINE, borderWidth: 0.5 });
    }
    let x = M + photoW;
    for (const { c, f, size, lines } of cells) {
      lines.forEach((ln, i) => {
        const tw = f.widthOfTextAtSize(ln, size);
        page.drawText(ln, { x: c.align === "right" ? x + c.width - 6 - tw : x + 6, y: y - 6 - size - i * (size + 2.5), size, font: f, color: c.title === "Código" || c.title === "Descrição" ? MUTED : INK });
      });
      x += c.width;
    }
    y -= rowH;
  });
  if (!rows.length) page.drawText("Nenhum produto com os filtros escolhidos.", { x: M, y: y - 20, size: 9, font, color: MUTED });

  pages.forEach((p, i) => {
    const t = `Página ${i + 1} de ${pages.length}`;
    p.drawText(t, { x: W - M - font.widthOfTextAtSize(t, 7.5), y: M - 14, size: 7.5, font, color: MUTED });
    const n = `${rows.length} produto(s)`; p.drawText(n, { x: M, y: M - 14, size: 7.5, font, color: MUTED });
  });
  return doc.save();
}
