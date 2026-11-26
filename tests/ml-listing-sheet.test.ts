import { describe, expect, it } from "vitest";
import { componentsFromSkus, dedupeListings, findListingHeader, parseListingRow } from "@/modules/mercadolivre/listing-sheet-rules";
import { matchListing } from "@/modules/mercadolivre/rules";

const head = [
  ["FAMILY_ID", "ITEM_ID", "PRODUCT_NUMBER", "TITLE", "VARIATIONS", "PRICE", "SALE_PRICE", "TIERED_PRICING_TAX_INCLUSION_TYPE", "LISTING_TYPE", "FEE_PER_SALE", "STATUS", "SHIPPING_HEIGHT", "SHIPPING_WEIGHT"],
  ["Agrupador de variações", "Código do anúncio", "Número do produto", "Título", "Variações", "Preço", "Preço em promoção", "Impostos incluídos", "Tipo de anúncio", "Tarifa de venda", "sku 1", "sku 2", ""],
];
const row = (o: Partial<Record<string, string>>) => ["1", o.id ?? "MLB4067280041", "U1", o.title ?? "Capa Protetora Para Ombrelone", o.v ?? "Branco", o.p ?? "38.09", o.sp ?? "-", "", o.t ?? "Clássico", o.f ?? "11.5", o.s1 ?? "PA5005009", o.s2 ?? "", ""];

describe("planilha de anúncios do Mercado Livre", () => {
  it("acha o cabeçalho com códigos + rótulos e usa as colunas de SKU", () => {
    const h = findListingHeader([...head, row({})])!;
    expect(h.lastHeaderRow).toBe(1);
    expect([...h.cols.entries()].filter(([, f]) => f === "sku").map(([i]) => i)).toEqual([10, 11]);
  });
  it("lê preço promocional, tipo, tarifa e kit", () => {
    const h = findListingHeader([...head])!;
    const r = parseListingRow(row({ p: "443.82", sp: "396.89", t: "Premium", f: "16.5", s1: "PA5005003", s2: "pa5005009" }), h.cols, 3).ok!;
    expect(r).toMatchObject({ itemId: "MLB4067280041", priceCents: 39689, listPriceCents: 44382, listingType: "premium", feeBps: 1650, skus: ["PA5005003", "PA5005009"] });
  });
  it("variação igual ao título ou '-' vira vazia", () => {
    const h = findListingHeader([...head])!;
    expect(parseListingRow(row({ v: "-" }), h.cols, 3).ok!.variation).toBe("");
    expect(parseListingRow(row({ title: "Ombrelone Bege 3,0 M", v: "Ombrelone Bege 3,0 M" }), h.cols, 3).ok!.variation).toBe("");
  });
  it("linhas repetidas com outro título são ignoradas", () => {
    const h = findListingHeader([...head])!;
    const a = parseListingRow(row({ id: "MLB4302189691", title: "Ombrelone Articulado 2,70 M", v: "-" }), h.cols, 8).ok!;
    const b = parseListingRow(row({ id: "MLB4302189691", title: "Conjunto Para Jardim Mesa 4 Cadeiras", v: "Branco" }), h.cols, 87).ok!;
    const d = dedupeListings([a, b]);
    expect(d.keep.map((x) => x.line)).toEqual([8]);
    expect(d.dropped[0].reason).toMatch(/linha 8/);
  });
  it("kit soma SKUs repetidos", () => {
    expect(componentsFromSkus(["A", "B", "A"])).toEqual([{ sku: "A", quantity: 2 }, { sku: "B", quantity: 1 }]);
  });
  it("venda 'Cor: Branco' liga ao anúncio 'Branco'; MLB com uma variação só liga direto", () => {
    const ls = [{ id: "x", mlItemId: "MLB1", variation: "Branco", sku: null }, { id: "y", mlItemId: "MLB1", variation: "Preto", sku: null }, { id: "z", mlItemId: "MLB2", variation: "Azul", sku: null }];
    expect(matchListing(ls, { itemId: "MLB1", variation: "Cor: Branco", sku: null })).toBe("x");
    expect(matchListing(ls, { itemId: "MLB2", variation: "Cor: Azul-escuro", sku: null })).toBe("z");
    expect(matchListing(ls, { itemId: "MLB1", variation: "Cor: Verde", sku: null })).toBeNull();
  });
});
