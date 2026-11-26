/**
 * Importação da planilha de anúncios do Mercado Livre (Anúncios › Modificar em massa › Modificar em Excel) — regras puras.
 * O arquivo tem uma linha de códigos (ITEM_ID, TITLE…) e outra de rótulos (Código do anúncio, Título…); aceitamos as duas.
 * SKUs: colunas "sku", "sku 1", "sku 2"… (kits = mais de um SKU, cada um com quantidade 1).
 */
export type ListingField = "itemId" | "title" | "variation" | "price" | "salePrice" | "type" | "fee" | "sku";
const fold = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[_\s]+/g, " ").trim();
const HEAD: Record<string, ListingField> = {
  "item id": "itemId", "codigo do anuncio": "itemId", "numero do anuncio": "itemId", "id do anuncio": "itemId",
  title: "title", titulo: "title", "titulo do anuncio": "title",
  variations: "variation", variacoes: "variation", variacao: "variation",
  price: "price", preco: "price",
  "sale price": "salePrice", "preco em promocao": "salePrice", "preco promocional": "salePrice",
  "listing type": "type", "tipo de anuncio": "type",
  "fee per sale": "fee", "tarifa de venda": "fee",
  sku: "sku", "seller sku": "sku", "sku do vendedor": "sku", "codigo sku": "sku",
};
export function listingFieldOf(header: string): ListingField | null {
  const h = fold(header);
  if (/^sku ?\d*$/.test(h)) return "sku";
  return HEAD[h] ?? null;
}

/** Procura nas primeiras linhas a(s) linha(s) de cabeçalho. Junta códigos e rótulos (o rótulo vence: “sku 1” sobre STATUS). */
export function findListingHeader(matrix: string[][]) {
  for (let r = 0; r < Math.min(matrix.length, 8); r++) {
    const row = (matrix[r] ?? []).map((c) => String(c ?? ""));
    const cols = new Map<number, ListingField>();
    row.forEach((c, i) => { const f = listingFieldOf(c); if (f) cols.set(i, f); });
    if (![...cols.values()].includes("itemId")) continue;
    const next = (matrix[r + 1] ?? []).map((c) => String(c ?? ""));
    let last = r;
    if (!next.some((c) => /^MLB\d+$/i.test(c.trim()))) { // linha de rótulos logo abaixo dos códigos
      next.forEach((c, i) => { const f = listingFieldOf(c); if (f) cols.set(i, f); else if (c.trim() && cols.get(i) === "sku") cols.delete(i); });
      last = r + 1;
    }
    if (![...cols.values()].includes("title")) continue;
    return { lastHeaderRow: last, cols };
  }
  return null;
}

const toCents = (raw: string): number | null => {
  let t = raw.trim().replace(/^R\$\s*/i, "");
  if (!t || t === "-") return null;
  if (/,\d{1,2}$/.test(t)) t = t.replace(/\./g, "").replace(",", "."); else t = t.replace(/,/g, "");
  const v = Number(t);
  return Number.isFinite(v) && v >= 0 ? Math.round(v * 100) : null;
};
const toBps = (raw: string): number | null => {
  const t = raw.trim().replace("%", "").replace(",", ".");
  if (!t || t === "-") return null;
  const v = Number(t);
  if (!Number.isFinite(v) || v < 0) return null;
  return Math.round((v <= 1 ? v * 100 : v) * 100); // 0,115 ou 11,5 → 1150
};

export type ParsedListing = { line: number; itemId: string; title: string; variation: string; priceCents: number | null; listPriceCents: number | null; listingType: "classico" | "premium" | null; feeBps: number | null; skus: string[] };
export function parseListingRow(cells: string[], cols: Map<number, ListingField>, line: number): { line: number; ok: ParsedListing | null; errors: string[]; warnings: string[]; empty: boolean } {
  const get = (f: ListingField) => { for (const [i, k] of cols) if (k === f) return String(cells[i] ?? "").trim(); return ""; };
  const skus = [...cols].filter(([, k]) => k === "sku").map(([i]) => String(cells[i] ?? "").trim().toUpperCase()).filter((s) => s && s !== "-");
  const itemId = get("itemId").toUpperCase(), title = get("title").replace(/\s+/g, " ").trim();
  if (!itemId && !title) return { line, ok: null, errors: [], warnings: [], empty: true };
  const errors: string[] = [], warnings: string[] = [];
  if (!/^MLB\d{6,15}$/.test(itemId)) errors.push(`Código do anúncio inválido (${itemId || "vazio"}).`);
  if (!title) errors.push("Título vazio.");
  let variation = get("variation").replace(/\s+/g, " ").trim();
  if (variation === "-" || fold(variation) === fold(title)) variation = "";
  const list = toCents(get("price")), promo = toCents(get("salePrice"));
  const type = fold(get("type"));
  const listingType = type.startsWith("class") ? "classico" : type.startsWith("prem") ? "premium" : null;
  const feeBps = toBps(get("fee"));
  if (list == null && promo == null) warnings.push("Sem preço.");
  if (!skus.length) warnings.push("Sem SKU: o anúncio entra, mas sem produto ligado (ligue à mão depois).");
  if (get("title") !== get("title").trim()) warnings.push("Título com espaços no início — confira se a linha não foi copiada por engano.");
  return { line, ok: errors.length ? null : { line, itemId, title, variation, priceCents: promo ?? list, listPriceCents: list, listingType, feeBps, skus }, errors, warnings, empty: false };
}

/** Mesmo MLB+variação repetido, ou mesmo MLB com títulos diferentes: fica a primeira linha, as outras são ignoradas com aviso. */
export function dedupeListings(rows: ParsedListing[]) {
  const keep: ParsedListing[] = [], dropped: { line: number; reason: string }[] = [];
  const firstById = new Map<string, ParsedListing>(), seen = new Set<string>();
  for (const r of rows) {
    const f = firstById.get(r.itemId), key = `${r.itemId}|${fold(r.variation)}`;
    if (f && fold(f.title) !== fold(r.title)) { dropped.push({ line: r.line, reason: `${r.itemId} já aparece na linha ${f.line} com outro título (“${f.title}”). Linha ignorada — confira a planilha.` }); continue; }
    if (seen.has(key)) { dropped.push({ line: r.line, reason: `${r.itemId}${r.variation ? ` (${r.variation})` : ""} repetido — fica a linha ${f?.line}.` }); continue; }
    if (!f) firstById.set(r.itemId, r);
    seen.add(key); keep.push(r);
  }
  return { keep, dropped };
}

/** Componentes do kit a partir dos SKUs: SKU repetido soma quantidade. */
export function componentsFromSkus(skus: string[]) {
  const m = new Map<string, number>();
  for (const s of skus) m.set(s, (m.get(s) ?? 0) + 1);
  return [...m].map(([sku, quantity]) => ({ sku, quantity }));
}
