/**
 * Importação da planilha de vendas exportada pelo Mercado Livre (Vendas › "Baixar Excel de vendas") — regras puras.
 * O relatório tem linhas de título antes do cabeçalho e os nomes das colunas variam um pouco: por isso o cabeçalho
 * é procurado nas primeiras linhas e as colunas são reconhecidas pelo nome (sem acento, minúsculas).
 */
export type MlSheetField = "order" | "date" | "status" | "statusDesc" | "units" | "productRevenue" | "shippingRevenue" | "fee" | "shippingFee" | "refunds" | "total" | "sku" | "itemId" | "title" | "variation" | "unitPrice" | "buyer" | "pack" | "shipBy";

const norm = (h: string) => h.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[ºª°]/g, "").replace(/[^a-z0-9#]+/g, " ").trim();

/** Reconhece uma coluna pelo texto do cabeçalho. A ordem importa (o mais específico primeiro). */
export function fieldOf(header: string): MlSheetField | null {
  const h = norm(header);
  if (!h) return null;
  if (/^(n|no|nr|numero|#)( o)? (de |da )?venda$/.test(h) || h === "venda" || h === "id da venda" || h === "numero do pedido" || h === "pedido") return "order";
  if (/^(data )?limite (de |para )?(despacho|envio|postagem|entrega na transportadora)/.test(h) || /^(despachar|enviar|postar) ate/.test(h)) return "shipBy";
  if (/^data (da |de )?venda$/.test(h) || h === "data") return "date";
  if (/^descricao (do )?(status|estado)$/.test(h)) return "statusDesc";
  if (h === "estado" || h === "status" || h === "situacao") return "status";
  if (/^pacote/.test(h)) return "pack";
  if (h === "unidades" || h === "quantidade" || h === "qtd") return "units";
  if (/^receita por produtos?/.test(h)) return "productRevenue";
  if (/^receita por (envio|frete)/.test(h)) return "shippingRevenue";
  if (/^tarifas? de venda/.test(h)) return "fee";
  if (/^tarifas? de envio/.test(h) || /^custo de envio/.test(h)) return "shippingFee";
  if (/^cancelamentos?/.test(h) || /^reembolsos?/.test(h)) return "refunds";
  if (/^total( brl)?$/.test(h) || /^total liquido/.test(h)) return "total";
  if (h === "sku") return "sku";
  if (/^(#|n|no|numero)( o)? (de |do )?anuncio$/.test(h) || h === "id do anuncio" || h === "mlb") return "itemId";
  if (/^titulo( do anuncio)?$/.test(h) || h === "anuncio" || h === "produto") return "title";
  if (/^variac/.test(h)) return "variation";
  if (/^preco unitario/.test(h)) return "unitPrice";
  if (h === "comprador" || /^nome do comprador/.test(h) || h === "cliente") return "buyer";
  return null;
}

/** Procura a linha do cabeçalho nas primeiras 20 linhas: a que reconhece nº da venda + (título ou receita). */
export function findHeader(matrix: string[][]) {
  for (let i = 0; i < Math.min(matrix.length, 20); i++) {
    const cols = new Map<MlSheetField, number>();
    (matrix[i] ?? []).forEach((c, j) => { const f = fieldOf(String(c ?? "")); if (f && !cols.has(f)) cols.set(f, j); });
    if (cols.has("order") && (cols.has("title") || cols.has("productRevenue") || cols.has("total"))) return { row: i, cols };
  }
  return null;
}

/** "1.234,56", "-123,45", "R$ 99,90", "1234.5" → centavos (inteiro). Vazio → null. */
export function moneyCents(raw: string | undefined): number | null {
  let t = String(raw ?? "").trim().replace(/[R$\s]/g, "");
  if (!t || t === "-") return null;
  const neg = /^\(.*\)$/.test(t) || t.startsWith("-"); t = t.replace(/[()\-+]/g, "");
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if ((t.match(/\./g) ?? []).length > 1) t = t.replace(/\./g, "");
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n * 100) * (neg ? -1 : 1) : null;
}

const MONTHS = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
/** "17 de novembro de 2026 08:41 hs.", "17/11/2026 08:41", "2026-11-17T11:41:00Z" → Date (horário de Brasília quando não informado). */
export function parseMlDate(raw: string | undefined): Date | null {
  const t = norm(String(raw ?? "")).replace(/ hs?$/, "");
  if (!t) return null;
  const iso = String(raw).trim().match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/);
  if (iso) { const d = new Date(String(raw).trim()); return Number.isNaN(d.getTime()) ? null : d; }
  let y = 0, m = 0, d = 0, hh = 12, mm = 0;
  const ext = t.match(/^(\d{1,2}) de ([a-z]+) de (\d{4})(?: (\d{1,2}) (\d{2}))?/);
  const br = t.match(/^(\d{1,2}) (\d{1,2}) (\d{4})(?: (\d{1,2}) (\d{2}))?/);
  const ymd = t.match(/^(\d{4}) (\d{2}) (\d{2})(?: (\d{1,2}) (\d{2}))?/);
  if (ext) { d = +ext[1]; m = MONTHS.indexOf(ext[2]) + 1; y = +ext[3]; if (ext[4]) { hh = +ext[4]; mm = +ext[5]; } }
  else if (br) { d = +br[1]; m = +br[2]; y = +br[3]; if (br[4]) { hh = +br[4]; mm = +br[5]; } }
  else if (ymd) { y = +ymd[1]; m = +ymd[2]; d = +ymd[3]; if (ymd[4]) { hh = +ymd[4]; mm = +ymd[5]; } }
  if (!y || m < 1 || m > 12 || d < 1 || d > 31 || hh > 23 || mm > 59) return null;
  const date = new Date(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00-03:00`);
  if (Number.isNaN(date.getTime())) return null;
  const back = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(date); // 31/02 → 03/03: recusa
  return back === `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` ? date : null;
}

/** Prazo de despacho escrito no status: "Para entregar na coleta do dia 30 de novembro", "…postar até 3 de dezembro". */
export function shipByFromStatus(status: string, saleDate: Date): Date | null {
  const t = norm(status);
  const m = t.match(/(?:coleta|entregar|postar|despachar|enviar)[a-z ]*?(?:dia |ate )(\d{1,2}) de ([a-z]+)(?: de (\d{4}))?/);
  if (!m) return null;
  const mon = MONTHS.indexOf(m[2]) + 1; if (mon < 1) return null;
  const saleY = Number(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric" }).format(saleDate));
  const saleM = Number(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", month: "numeric" }).format(saleDate));
  const y = m[3] ? +m[3] : mon < saleM ? saleY + 1 : saleY; // dezembro → janeiro vira o ano seguinte
  return parseMlDate(`${m[1]}/${mon}/${y} 23:59`);
}

export const isCancelled = (status: string) => /cancel|devolu|reembols|nao concretizada|não concretizada/i.test(status);

export type MlSheetRow = {
  line: number; orderId: string; saleDate: Date; status: string; cancelled: boolean; title: string; itemId: string | null; sku: string | null; variation: string | null;
  quantity: number; unitPriceCents: number; productCents: number; shippingCents: number | null; feeCents: number | null; refundCents: number | null; totalCents: number | null; buyer: string | null;
  saleFeeCents: number | null; shippingFeeCents: number | null; shipBy: Date | null;
};
export type MlSheetResult = { line: number; orderId: string; title: string; ok: MlSheetRow | null; errors: string[]; warnings: string[]; skipped: boolean; packSummary?: boolean };

/** Uma linha da planilha → venda (um anúncio de um pedido). Linhas sem anúncio (resumo de pacote) são puladas. */
export function parseMlRow(cells: string[], cols: Map<MlSheetField, number>, line: number): MlSheetResult {
  const g = (f: MlSheetField) => (cols.has(f) ? String(cells[cols.get(f)!] ?? "").trim() : "");
  const errors: string[] = [], warnings: string[] = [];
  const orderId = g("order").replace(/\s+/g, "").replace(/^#/, "").replace(/[.,]0+$/, "");
  const title = [g("title"), g("variation")].filter(Boolean).join(" — ");
  if (!orderId && !title) return { line, orderId, title, ok: null, errors, warnings, skipped: true };
  if (!orderId || !/^[A-Za-z0-9_-]{4,40}$/.test(orderId)) errors.push(`Nº da venda inválido (${g("order") || "vazio"}).`);
  if (!title) return { line, orderId, title, ok: null, errors, warnings: ["Linha sem anúncio (resumo de pacote?) — ignorada; os produtos vêm nas linhas do pacote."], skipped: true };
  // linha-resumo de pacote: "Pacote de diversos produtos = Sim" sem nenhum valor — os produtos vêm nas linhas seguintes, cada um com seu nº
  if (/^sim$/i.test(g("pack")) && [g("productRevenue"), g("total"), g("fee"), g("shippingFee")].every((v) => moneyCents(v) == null)) {
    return { line, orderId, title, ok: null, errors, warnings: ["Resumo de pacote (sem valores) — ignorado; os produtos do pacote vêm nas linhas com valores."], skipped: true, packSummary: true };
  }
  const saleDate = parseMlDate(g("date"));
  if (!saleDate) errors.push(`Data da venda não reconhecida (${g("date") || "vazia"}).`);
  const status = [g("status"), g("statusDesc")].filter(Boolean).join(" — ");
  const quantity = Math.round(Number(g("units").replace(",", ".")) || 0) || 1;
  if (!g("units")) warnings.push("Sem a coluna/valor de unidades — considerada 1 unidade.");
  const productCents = moneyCents(g("productRevenue"));
  const unitPrice = moneyCents(g("unitPrice"));
  const total = moneyCents(g("total"));
  const product = productCents ?? (unitPrice != null ? unitPrice * quantity : null);
  if (product == null && total == null) errors.push("Sem valor da venda (receita por produtos, preço unitário ou total).");
  const fee = moneyCents(g("fee")), refund = moneyCents(g("refunds"));
  const shipRev = moneyCents(g("shippingRevenue")), shipFee = moneyCents(g("shippingFee"));
  const itemRaw = g("itemId").replace(/\s+/g, "");
  if (errors.length) return { line, orderId, title, ok: null, errors, warnings, skipped: false };
  const productFinal = product ?? total!;
  return { line, orderId, title, errors, warnings, skipped: false, ok: {
    line, orderId, saleDate: saleDate!, status: status || "—", cancelled: isCancelled(status), title: title.slice(0, 300),
    itemId: itemRaw ? itemRaw.toUpperCase() : null, sku: g("sku") || null, variation: g("variation") || null, quantity,
    unitPriceCents: unitPrice ?? Math.round(productFinal / quantity), productCents: productFinal,
    shippingCents: shipRev != null ? Math.abs(shipRev) : null,
    feeCents: fee != null || shipFee != null ? Math.abs(fee ?? 0) + Math.abs(shipFee ?? 0) : null,
    refundCents: refund != null ? Math.abs(refund) : null, totalCents: total, buyer: g("buyer") || null,
    saleFeeCents: fee != null ? Math.abs(fee) : null, shippingFeeCents: shipFee != null ? Math.abs(shipFee) : null, shipBy: parseMlDate(g("shipBy")) ?? shipByFromStatus(status, saleDate!),
  } };
}
