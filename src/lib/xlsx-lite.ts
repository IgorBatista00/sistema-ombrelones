import "server-only";
import JSZip from "jszip";

/**
 * Leitor reserva de .xlsx (só valores), usado quando o ExcelJS não consegue abrir o arquivo
 * — ex.: planilhas com comentários gravadas por alguns programas. Lê o XML do pacote diretamente.
 */
const decode = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16))).replace(/&amp;/g, "&");
const texts = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => decode(m[1])).join("");
const colIndex = (ref: string) => { const letters = ref.replace(/\d+/g, ""); let n = 0; for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };

/** Todas as abas, na ordem do arquivo (inclui ocultas). */
export async function readXlsxLiteAll(buf: Buffer): Promise<{ name: string; matrix: string[][] }[]> {
  const zip = await JSZip.loadAsync(buf);
  const wbXml = (await zip.file("xl/workbook.xml")?.async("string")) ?? "";
  const relsXml = (await zip.file("xl/_rels/workbook.xml.rels")?.async("string")) ?? "";
  const ssXml = (await zip.file("xl/sharedStrings.xml")?.async("string")) ?? "";
  const shared = [...ssXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => texts(m[1]));
  const sheets = [...wbXml.matchAll(/<sheet\b([^>]*)\/?>/g)].map((m) => ({ name: decode(m[1].match(/\bname="([^"]*)"/)?.[1] ?? ""), rid: m[1].match(/\br:id="([^"]+)"/)?.[1] }));
  const out: { name: string; matrix: string[][] }[] = [];
  for (const sh of sheets.length ? sheets : [{ name: "", rid: undefined }]) {
    const target = sh.rid ? relsXml.match(new RegExp(`<Relationship\\b[^>]*Id="${sh.rid}"[^>]*Target="([^"]+)"`))?.[1] ?? relsXml.match(new RegExp(`<Relationship\\b[^>]*Target="([^"]+)"[^>]*Id="${sh.rid}"`))?.[1] : undefined;
    const sheetPath = target ? (target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`) : "xl/worksheets/sheet1.xml";
    const xml = await zip.file(sheetPath)?.async("string");
    if (xml) out.push({ name: sh.name, matrix: sheetMatrix(xml, shared) });
  }
  if (!out.length) throw new Error("planilha sem aba");
  return out;
}

export async function readXlsxLite(buf: Buffer): Promise<string[][]> {
  return (await readXlsxLiteAll(buf))[0].matrix;
}

function sheetMatrix(sheet: string, shared: string[]): string[][] {
  const out: string[][] = [];
  for (const row of sheet.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const r = Number(row[1].match(/\br="(\d+)"/)?.[1] ?? out.length + 1) - 1;
    const cells: string[] = [];
    for (const c of row[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1], inner = c[2] ?? "";
      const ref = attrs.match(/\br="([A-Z]+\d+)"/)?.[1]; const idx = ref ? colIndex(ref) : cells.length;
      const t = attrs.match(/\bt="([^"]+)"/)?.[1];
      const v = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      let val = "";
      if (t === "s") val = shared[Number(v)] ?? "";
      else if (t === "inlineStr") val = texts(inner);
      else if (t === "b") val = v === "1" ? "VERDADEIRO" : "FALSO";
      else if (v != null) val = decode(v);
      if (val && t !== "s" && t !== "inlineStr" && t !== "str" && /^-?\d+\.\d+$/.test(val)) val = val.replace(".", ","); // decimal no padrão brasileiro
      cells[idx] = val;
    }
    out[r] = Array.from(cells, (x) => x ?? "");
  }
  return Array.from(out, (x) => x ?? []);
}
