import "server-only";
import ExcelJS from "exceljs";
import { readXlsxLite } from "@/lib/xlsx-lite";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { isValidCnpj, normalizeCnpj } from "@/modules/companies/cnpj";
import { parseDecimal, parseLeadTime, parseMoney, parsePercentBps, toMm } from "./cost";
import { recalcProductCost, slugify } from "./service";
import type { AdminProductRow } from "./admin-queries";
import { parseMarkup, validateMarkup } from "@/modules/pricing/markup";

// =====================================================================
// Modelo de importação
// =====================================================================
export const TEMPLATE_COLUMNS = [
  ["codigo", "Obrigatório. Código (SKU) do produto — chave para criar ou atualizar"],
  ["produto", "Obrigatório. Nome do produto"],
  ["categoria", "Nome exato de uma categoria cadastrada (obrigatório para produto novo)"],
  ["status", "ativo ou inativo (novos sem status entram como inativo)"],
  ["descricao", "Descrição exibida na loja"],
  ["cor", "Cor / acabamento"],
  ["unidade_medida", "cm ou m (medidas montado)"],
  ["altura", "Altura montado"], ["comprimento", "Comprimento montado"], ["profundidade", "Profundidade montado"], ["diametro", "Diâmetro montado"],
  ["caixa_altura_cm", "Embalagem: altura (cm)"], ["caixa_largura_cm", "Embalagem: largura (cm)"], ["caixa_comprimento_cm", "Embalagem: comprimento (cm)"],
  ["caixa_peso_kg", "Embalagem: peso (kg)"], ["volumes", "Quantidade de volumes iguais (padrão 1)"],
  ["fornecedor_cnpj", "CNPJ do fornecedor principal"], ["fornecedor_nome", "Razão social (cria o fornecedor se não existir)"],
  ["custo_mercadoria", "Custo da mercadoria em R$ (ex.: 1234,56)"], ["ipi_compra", "IPI de compra em % (ex.: 6,5)"],
  ["codigo_no_fornecedor", "Código do produto no fornecedor"], ["prazo_entrega", "pronta entrega, 15, 30, 60, 90 ou importação"],
  ["moq", "Pedido mínimo junto ao fornecedor (un.)"], ["markup", "Markup de venda (ex.: 2,5). Preço = custo final × markup — aplicado no site pela aba Tabela"],
  ["observacoes_internas", "Uso interno"],
] as const;
type Col = (typeof TEMPLATE_COLUMNS)[number][0];
const ALIASES: Record<string, Col> = {
  nome: "produto", nome_do_produto: "produto", sku: "codigo", codigo_sku: "codigo", nome_do_fornecedor: "fornecedor_nome",
  fornecedor: "fornecedor_nome", ipi_de_compra: "ipi_compra", ipi: "ipi_compra", custo: "custo_mercadoria", observacoes: "observacoes_internas", markup_de_venda: "markup", mkp: "markup",
};
const norm = (h: string) => h.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
const COLS = new Set<string>(TEMPLATE_COLUMNS.map(([c]) => c));

const REQUIRED = new Set(["codigo", "produto", "categoria"]);
const GROUPS: [string, string, Col[]][] = [
  ["Identificação", "FF1F2522", ["codigo", "produto", "categoria", "status", "descricao", "cor"]],
  ["Medidas montado", "FF4A5A4F", ["unidade_medida", "altura", "comprimento", "profundidade", "diametro"]],
  ["Embalagem", "FF6B5B3E", ["caixa_altura_cm", "caixa_largura_cm", "caixa_comprimento_cm", "caixa_peso_kg", "volumes"]],
  ["Fornecedor e custo", "FF2D5872", ["fornecedor_cnpj", "fornecedor_nome", "custo_mercadoria", "ipi_compra", "codigo_no_fornecedor", "prazo_entrega", "moq"]],
  ["Venda", "FF2F6B45", ["markup", "observacoes_internas"]],
];
const WIDTH: Partial<Record<Col, number>> = { codigo: 16, produto: 38, categoria: 24, descricao: 48, fornecedor_nome: 30, fornecedor_cnpj: 20, observacoes_internas: 30, prazo_entrega: 16 };
const NUMFMT: Partial<Record<Col, string>> = { custo_mercadoria: "#,##0.00", ipi_compra: "0.00", markup: "0.00##", caixa_peso_kg: "0.0##", altura: "0.0#", comprimento: "0.0#", profundidade: "0.0#", diametro: "0.0#" };

/**
 * Modelo de importação: aba "produtos" (cabeçalho = nomes que o importador lê; NÃO renomear), listas de opções,
 * formatos numéricos, comentário em cada coluna, aba "instrucoes" e aba "listas" (categorias cadastradas hoje).
 */
export async function buildTemplate(categories?: string[]) {
  const cats = categories ?? (await db.category.findMany({ orderBy: { name: "asc" }, select: { name: true } })).map((c) => c.name);
  const order = GROUPS.flatMap(([, , cols]) => cols);
  const desc = new Map<string, string>(TEMPLATE_COLUMNS.map(([c, d]) => [c, d]));
  const wb = new ExcelJS.Workbook();
  wb.creator = "Painel"; wb.created = new Date();

  const ws = wb.addWorksheet("produtos", { views: [{ state: "frozen", xSplit: 2, ySplit: 1 }] });
  ws.columns = order.map((key) => ({ header: key, key, width: WIDTH[key] ?? Math.max(14, key.length + 3), style: key === "codigo" ? { numFmt: "@" } : NUMFMT[key] ? { numFmt: NUMFMT[key] } : {} }));
  const head = ws.getRow(1); head.height = 30;
  order.forEach((key, i) => {
    const g = GROUPS.find(([, , cols]) => cols.includes(key))!;
    const c = head.getCell(i + 1);
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: g[1] } };
    c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    c.note = `${g[0]}${REQUIRED.has(key) ? " · OBRIGATÓRIO" : ""}\n${desc.get(key)}`;
    if (REQUIRED.has(key)) c.border = { bottom: { style: "thick", color: { argb: "FFC0392B" } } };
  });
  const colOf = (k: Col) => order.indexOf(k) + 1;
  const letter = (k: Col) => ws.getColumn(colOf(k)).letter;
  const range = (k: Col) => `${letter(k)}2:${letter(k)}1001`;
  // API de validação por intervalo (existe no ExcelJS, mas sem tipagem) — evita uma regra por célula
  const dv = (ws as unknown as { dataValidations: { add(range: string, v: ExcelJS.DataValidation): void } }).dataValidations;
  const list = (k: Col, formula: string, prompt: string, strict = true) => dv.add(range(k), { type: "list", allowBlank: true, formulae: [formula], showErrorMessage: strict, errorStyle: strict ? "stop" : "warning", errorTitle: "Valor fora da lista", error: prompt, showInputMessage: true, promptTitle: k, prompt });
  list("status", '"ativo,inativo"', "ativo ou inativo");
  list("unidade_medida", '"cm,m"', "cm ou m");
  list("prazo_entrega", '"pronta entrega,15,30,60,90,importação"', "pronta entrega, 15, 30, 60, 90 ou importação");
  const decimal = (k: Col, min: number, max: number, msg: string) => dv.add(range(k), { type: "decimal", operator: "between", allowBlank: true, formulae: [min, max], showErrorMessage: true, errorTitle: "Número inválido", error: msg });
  for (const k of ["altura", "comprimento", "profundidade", "diametro", "caixa_altura_cm", "caixa_largura_cm", "caixa_comprimento_cm", "caixa_peso_kg"] as Col[]) decimal(k, 0, 100000, "Use apenas números (ex.: 3,5)");
  decimal("custo_mercadoria", 0, 100000000, "Valor em reais, só números (ex.: 1234,56)");
  decimal("ipi_compra", 0, 100, "Percentual, só o número (ex.: 6,5)");
  decimal("markup", 0.01, 100, "Markup é um multiplicador (ex.: 2,5)");
  dv.add(`${letter("volumes")}2:${letter("volumes")}1001`, { type: "whole", operator: "between", allowBlank: true, formulae: [1, 50], showErrorMessage: true, error: "Número inteiro de volumes (1 a 50)" });
  dv.add(`${letter("moq")}2:${letter("moq")}1001`, { type: "whole", operator: "between", allowBlank: true, formulae: [0, 1000000], showErrorMessage: true, error: "Número inteiro" });

  // aba de listas (categorias atuais) — validação "aviso", para não travar categoria recém-criada no sistema
  const lists = wb.addWorksheet("listas");
  lists.columns = [{ header: "categorias cadastradas no sistema", key: "c", width: 40 }];
  lists.getRow(1).font = { bold: true };
  cats.forEach((c) => lists.addRow({ c }));
  if (cats.length) list("categoria", `listas!$A$2:$A$${cats.length + 1}`, "Use o nome exato de uma categoria cadastrada no sistema (aba listas). Categoria nova: cadastre antes no painel.", false);

  // exemplos claramente marcados — APAGAR antes de importar
  let exRow = 2;
  const pick = (re: RegExp, fallback: string) => cats.find((c) => re.test(c)) ?? fallback;
  const ex = (o: Partial<Record<Col, string | number>>) => { const row = ws.getRow(exRow++); order.forEach((k, i) => { if (o[k] !== undefined) row.getCell(i + 1).value = o[k]!; }); row.font = { italic: true, color: { argb: "FF8A8F87" } }; row.commit(); };
  ex({ codigo: "EXEMPLO-001", produto: "[EXEMPLO — APAGUE ESTA LINHA] Ombrelone central", categoria: pick(/ombrel|centra/i, cats[0] ?? ""), status: "inativo", descricao: "Texto que aparece na loja.", cor: "Areia",
    unidade_medida: "m", altura: 2.6, diametro: 3, caixa_altura_cm: 20, caixa_largura_cm: 20, caixa_comprimento_cm: 180, caixa_peso_kg: 18.5, volumes: 1,
    fornecedor_nome: "[nome do fornecedor]", custo_mercadoria: 1000, ipi_compra: 6.5, codigo_no_fornecedor: "ABC-123", prazo_entrega: "30", moq: 1, markup: 2.5 });
  ex({ codigo: "EXEMPLO-002", produto: "[EXEMPLO — APAGUE ESTA LINHA] Base", categoria: pick(/base|acess/i, cats[cats.length - 1] ?? ""), status: "inativo", unidade_medida: "cm", altura: 10, diametro: 50, volumes: 1, markup: 2 });

  const help = wb.addWorksheet("instrucoes");
  help.columns = [{ key: "c", width: 24 }, { key: "g", width: 20 }, { key: "o", width: 14 }, { key: "d", width: 95 }];
  const steps = [
    "1. Preencha a aba \"produtos\" a partir da linha 2 — um produto por linha. Apague as duas linhas de [EXEMPLO].",
    "2. Não renomeie nem mude a ordem dos títulos da linha 1: o sistema lê pelo nome da coluna. Pode deixar colunas em branco.",
    "3. O código é a chave: se já existir no sistema, o produto é ATUALIZADO (só as colunas preenchidas); se não existir, é CRIADO.",
    "4. Produto novo exige: codigo, produto e categoria (nome exato — veja a aba \"listas\"). Sem status, entra como inativo (não aparece na loja).",
    "5. Números: use vírgula ou ponto como decimal, sem \"R$\" e sem \"%\" (ex.: 1234,56 · 6,5 · 2,5).",
    "6. Fornecedor: informe o CNPJ e/ou a razão social. Se não existir, ele é cadastrado. Custo e IPI ficam no fornecedor principal.",
    "7. Custo final = custo da mercadoria + IPI + custos adicionais já cadastrados no produto. Preço de venda = custo final × markup.",
    "8. O preço só muda na loja quando você clica em \"Atualizar no site\" na aba Tabela. Fotos são enviadas no cadastro do produto.",
    "9. No painel: Produtos › Importar Excel › escolha o arquivo › confira a prévia (erros e avisos por linha) › Confirmar.",
  ];
  help.addRow(["COMO USAR"]).font = { bold: true, size: 13 };
  steps.forEach((t) => { const r = help.addRow([t]); help.mergeCells(r.number, 1, r.number, 4); r.alignment = { wrapText: true, vertical: "top" }; r.height = 30; });
  help.addRow([]);
  help.addRow(["coluna", "grupo", "obrigatória?", "como preencher"]).font = { bold: true };
  order.forEach((k) => help.addRow([k, GROUPS.find(([, , cols]) => cols.includes(k))![0], k === "codigo" || k === "produto" ? "sim" : k === "categoria" ? "produto novo" : "", desc.get(k) ?? ""]));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// Leitura (xlsx ou csv) — somente a primeira aba
// =====================================================================
const MAX_ROWS = 2000;
type RawRow = Partial<Record<Col, string>> & { __line: number };

export function cellText(v: ExcelJS.CellValue): string {
  if (v == null) return "";
  if (typeof v === "object") {
    if ("result" in v) return cellText(v.result as ExcelJS.CellValue);
    if ("text" in v) return String(v.text);
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
    if (v instanceof Date) return v.toISOString();
  }
  return typeof v === "number" ? String(v).replace(".", ",") : String(v);
}

function parseCsv(text: string): string[][] {
  const first = text.split(/\r?\n/, 1)[0] ?? "";
  const sep = (first.match(/;/g)?.length ?? 0) >= (first.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch; continue; }
    if (ch === '"') q = true; else if (ch === sep) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

/** Lê a 1ª aba de um .xlsx ou um .csv como matriz de textos (reaproveitado por outras importações). */
export async function readMatrix(buf: Buffer, filename: string): Promise<string[][]> {
  let matrix: string[][];
  if (/\.csv$/i.test(filename)) {
    matrix = parseCsv(buf.toString("utf8").replace(/^﻿/, ""));
  } else if (/\.xlsx$/i.test(filename)) {
    const wb = new ExcelJS.Workbook();
    let ok = true;
    try { await wb.xlsx.load(buf as unknown as ArrayBuffer); } catch { ok = false; }
    if (ok) {
      const ws = wb.worksheets[0];
      if (!ws) throw new AppError("BAD_FILE", "A planilha está vazia.");
      matrix = [];
      ws.eachRow({ includeEmpty: true }, (r, n) => { const vals = (r.values as ExcelJS.CellValue[]).slice(1); matrix[n - 1] = vals.map(cellText); });
    } else {
      // reserva: alguns programas gravam comentários que o ExcelJS não abre — lê só os valores direto do arquivo
      try { matrix = await readXlsxLite(buf); } catch { throw new AppError("BAD_FILE", "Não foi possível ler a planilha. Salve como .xlsx ou .csv."); }
    }
  } else {
    throw new AppError("BAD_FILE", "Formato não suportado. Use .xlsx ou .csv (arquivos .xls antigos: salve como .xlsx).");
  }
  return matrix;
}

export async function readSheet(buf: Buffer, filename: string): Promise<RawRow[]> {
  const matrix = await readMatrix(buf, filename);
  const header = (matrix[0] ?? []).map((h) => { const k = norm(h ?? ""); return (COLS.has(k) ? k : ALIASES[k]) as Col | undefined; });
  if (!header.includes("codigo") || !header.includes("produto")) throw new AppError("BAD_HEADER", 'A primeira linha precisa ter as colunas "codigo" e "produto". Baixe o modelo.');
  const rows: RawRow[] = [];
  for (let i = 1; i < matrix.length; i++) {
    const r = matrix[i]; if (!r || r.every((c) => !String(c ?? "").trim())) continue;
    const obj: RawRow = { __line: i + 1 };
    header.forEach((col, j) => { if (col) obj[col] = String(r[j] ?? "").trim(); });
    rows.push(obj);
  }
  if (rows.length > MAX_ROWS) throw new AppError("TOO_MANY_ROWS", `Máximo de ${MAX_ROWS} linhas por importação.`);
  return rows;
}

// =====================================================================
// Validação (prévia) e gravação
// =====================================================================
export interface ImportRowResult { line: number; code: string; name: string; action: "criar" | "atualizar" | "ignorar"; errors: string[]; warnings: string[] }

async function lookups() {
  const [categories, products, suppliers] = await Promise.all([
    db.category.findMany({ select: { id: true, name: true } }),
    db.product.findMany({ where: { code: { not: null } }, select: { id: true, code: true } }),
    db.supplier.findMany({ select: { id: true, cnpj: true, legalName: true, tradeName: true } }),
  ]);
  return {
    category: (name: string) => categories.find((c) => norm(c.name) === norm(name)),
    product: (code: string) => products.find((p) => p.code === code),
    supplier: (cnpj: string | null, name: string | null) =>
      (cnpj && suppliers.find((s) => s.cnpj === cnpj)) ||
      (name && suppliers.find((s) => norm(s.legalName) === norm(name) || (s.tradeName && norm(s.tradeName) === norm(name)))) || undefined,
  };
}

export async function validateImport(rows: RawRow[]): Promise<ImportRowResult[]> {
  const L = await lookups();
  const seen = new Set<string>();
  return rows.map((r) => {
    const code = (r.codigo ?? "").toUpperCase(); const name = r.produto ?? "";
    const errors: string[] = []; const warnings: string[] = [];
    if (/^EXEMPLO-/i.test(code) || /\[EXEMPLO/i.test(name)) errors.push("Linha de exemplo do modelo — apague antes de importar");
    if (!code) errors.push("Código vazio");
    else if (!/^[A-Z0-9][A-Z0-9._\-/]*$/.test(code)) errors.push("Código com caracteres inválidos");
    if (!name) errors.push("Nome vazio");
    if (code && seen.has(code)) errors.push("Código repetido na planilha");
    seen.add(code);
    const exists = code ? L.product(code) : undefined;
    if (r.categoria && !L.category(r.categoria)) (exists ? warnings : errors).push(`Categoria "${r.categoria}" não encontrada`);
    if (!r.categoria && !exists) errors.push("Categoria obrigatória para produto novo");
    if (r.status && !["ativo", "inativo"].includes(norm(r.status))) errors.push('Status deve ser "ativo" ou "inativo"');
    if (r.unidade_medida && !["cm", "m"].includes(norm(r.unidade_medida))) errors.push('Unidade deve ser "cm" ou "m"');
    for (const k of ["altura", "comprimento", "profundidade", "diametro", "caixa_altura_cm", "caixa_largura_cm", "caixa_comprimento_cm", "caixa_peso_kg", "moq", "volumes"] as const) {
      if (r[k] && (parseDecimal(r[k]) == null || parseDecimal(r[k])! < 0)) errors.push(`"${k}" não é um número válido`);
    }
    const box = [r.caixa_altura_cm, r.caixa_largura_cm, r.caixa_comprimento_cm].filter(Boolean).length;
    if (box > 0 && box < 3) errors.push("Embalagem incompleta: informe altura, largura e comprimento da caixa");
    if (r.custo_mercadoria && parseMoney(r.custo_mercadoria) == null) errors.push("Custo da mercadoria inválido");
    if (r.ipi_compra && parsePercentBps(r.ipi_compra) == null) errors.push("IPI inválido");
    if (r.markup) { const e = validateMarkup(parseMarkup(r.markup)); if (e) errors.push(`Markup: ${e}`); else if (parseMarkup(r.markup)! < 10_000) warnings.push("Markup menor que 1: preço abaixo do custo"); }
    if (r.prazo_entrega && !parseLeadTime(r.prazo_entrega)) warnings.push(`Prazo "${r.prazo_entrega}" não reconhecido (ficará vazio)`);
    const cnpj = r.fornecedor_cnpj ? normalizeCnpj(r.fornecedor_cnpj) : null;
    if (cnpj && !isValidCnpj(cnpj)) warnings.push("CNPJ do fornecedor inválido (será ignorado; busca pelo nome)");
    const hasSupplierData = r.custo_mercadoria || r.ipi_compra || r.codigo_no_fornecedor || r.prazo_entrega || r.moq;
    if ((cnpj || r.fornecedor_nome) && !L.supplier(cnpj && isValidCnpj(cnpj) ? cnpj : null, r.fornecedor_nome ?? null)) {
      if (r.fornecedor_nome) warnings.push(`Fornecedor "${r.fornecedor_nome}" será cadastrado`);
      else errors.push("Fornecedor não encontrado pelo CNPJ e sem nome para cadastrar");
    }
    if (hasSupplierData && !cnpj && !r.fornecedor_nome) errors.push("Dados de custo sem fornecedor (informe CNPJ ou nome)");
    return { line: r.__line, code, name, action: errors.length ? "ignorar" : exists ? "atualizar" : "criar", errors, warnings };
  });
}

export async function commitImport(actorId: string, rows: RawRow[]) {
  const results = await validateImport(rows);
  const L = await lookups();
  let created = 0, updated = 0, suppliersCreated = 0; const failed: { line: number; error: string }[] = [];

  for (const [i, r] of rows.entries()) {
    const res = results[i];
    if (res.action === "ignorar") continue;
    try {
      await db.$transaction(async (tx) => {
        const code = res.code; const unit = norm(r.unidade_medida ?? "") === "m" ? "M" : "CM";
        const cat = r.categoria ? L.category(r.categoria) : undefined;
        const existing = await tx.product.findUnique({ where: { code } });
        const status = r.status ? norm(r.status) === "ativo" : existing ? existing.isActive : false;
        const data: Prisma.ProductUncheckedUpdateInput = {
          name: res.name, isActive: status,
          ...(cat ? { categoryId: cat.id } : {}),
          ...(r.descricao ? { description: r.descricao } : {}),
          ...(r.cor ? { color: r.cor } : {}),
          ...(r.observacoes_internas ? { internalNotes: r.observacoes_internas } : {}),
          ...(r.markup ? { markup: parseMarkup(r.markup), markupUpdatedAt: new Date() } : {}),
          ...(r.unidade_medida ? { measureUnit: unit } : {}),
          ...(r.altura ? { heightMm: toMm(parseDecimal(r.altura), unit) } : {}),
          ...(r.comprimento ? { lengthMm: toMm(parseDecimal(r.comprimento), unit) } : {}),
          ...(r.profundidade ? { depthMm: toMm(parseDecimal(r.profundidade), unit) } : {}),
          ...(r.diametro ? { diameterMm: toMm(parseDecimal(r.diametro), unit) } : {}),
        };
        let pid: string;
        if (existing) { await tx.product.update({ where: { id: existing.id }, data }); pid = existing.id; updated++; }
        else {
          let slug = slugify(res.name), n = 2;
          while (await tx.product.findUnique({ where: { slug } })) slug = `${slugify(res.name)}-${n++}`;
          const p = await tx.product.create({ data: { ...(data as Prisma.ProductUncheckedCreateInput), code, slug, categoryId: cat!.id, deletedAt: null } });
          pid = p.id; created++;
        }
        if (r.caixa_altura_cm && r.caixa_largura_cm && r.caixa_comprimento_cm) {
          await tx.productPackage.deleteMany({ where: { productId: pid } });
          await tx.productPackage.create({ data: {
            productId: pid, heightMm: toMm(parseDecimal(r.caixa_altura_cm), "CM")!, widthMm: toMm(parseDecimal(r.caixa_largura_cm), "CM")!,
            lengthMm: toMm(parseDecimal(r.caixa_comprimento_cm), "CM")!, weightG: r.caixa_peso_kg ? Math.round(parseDecimal(r.caixa_peso_kg)! * 1000) : null,
            quantity: Math.max(1, Math.round(parseDecimal(r.volumes) ?? 1)),
          } });
        }
        // Fornecedor principal
        const cnpjRaw = r.fornecedor_cnpj ? normalizeCnpj(r.fornecedor_cnpj) : null;
        const cnpj = cnpjRaw && isValidCnpj(cnpjRaw) ? cnpjRaw : null;
        if (cnpj || r.fornecedor_nome) {
          let supplierId = (await tx.supplier.findFirst({ where: cnpj ? { cnpj } : { OR: [{ legalName: { equals: r.fornecedor_nome!, mode: "insensitive" } }, { tradeName: { equals: r.fornecedor_nome!, mode: "insensitive" } }] } }))?.id;
          if (!supplierId && cnpj && r.fornecedor_nome) supplierId = (await tx.supplier.findFirst({ where: { legalName: { equals: r.fornecedor_nome, mode: "insensitive" } } }))?.id;
          if (!supplierId) { supplierId = (await tx.supplier.create({ data: { legalName: r.fornecedor_nome!, cnpj } })).id; suppliersCreated++; }
          const costCents = r.custo_mercadoria ? parseMoney(r.custo_mercadoria) : undefined;
          const ipiBps = r.ipi_compra ? parsePercentBps(r.ipi_compra) : undefined;
          await tx.productSupplier.updateMany({ where: { productId: pid, supplierId: { not: supplierId } }, data: { isPrincipal: false } });
          const prev = await tx.productSupplier.findUnique({ where: { productId_supplierId: { productId: pid, supplierId } } });
          const linkData = {
            isPrincipal: true,
            ...(costCents !== undefined ? { costCents } : {}), ...(ipiBps !== undefined ? { ipiBps } : {}),
            ...(r.codigo_no_fornecedor ? { supplierCode: r.codigo_no_fornecedor } : {}),
            ...(r.prazo_entrega && parseLeadTime(r.prazo_entrega) ? { leadTime: parseLeadTime(r.prazo_entrega)! } : {}),
            ...(r.moq ? { moq: Math.round(parseDecimal(r.moq)!) } : {}),
          };
          const link = prev
            ? await tx.productSupplier.update({ where: { id: prev.id }, data: linkData })
            : await tx.productSupplier.create({ data: { ...linkData, productId: pid, supplierId } });
          if (!prev || prev.costCents !== link.costCents || prev.ipiBps !== link.ipiBps) {
            await tx.supplierCostHistory.create({ data: { productSupplierId: link.id, costCents: link.costCents, ipiBps: link.ipiBps, changedById: actorId } });
          }
        }
        if (!(await tx.productVariant.count({ where: { productId: pid } }))) {
          const taken = await tx.productVariant.findUnique({ where: { sku: code } });
          await tx.productVariant.create({ data: { productId: pid, sku: taken ? `${code}-01` : code, color: r.cor || null, name: r.cor || null } });
        }
        // Custo final inclui os custos adicionais já cadastrados no produto
        await recalcProductCost(tx, pid);
      });
    } catch (e) {
      failed.push({ line: res.line, error: e instanceof Error ? e.message.split("\n").pop()! : "Erro" });
    }
  }
  await db.auditLog.create({ data: { actorId, action: "product.import", entity: "Product", after: { created, updated, suppliersCreated, failed: failed.length } } });
  return { created, updated, suppliersCreated, ignored: results.filter((r) => r.action === "ignorar").length, failed };
}

// =====================================================================
// Exportação (exatamente a lista filtrada)
// =====================================================================
export async function buildExport(rows: AdminProductRow[]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("produtos");
  ws.columns = [
    { header: "codigo", key: "codigo", width: 16 }, { header: "produto", key: "produto", width: 40 }, { header: "categoria", key: "categoria", width: 22 },
    { header: "cor", key: "cor", width: 14 }, { header: "status", key: "status", width: 10 }, { header: "fornecedor_principal", key: "forn", width: 28 },
    { header: "fornecedor_cnpj", key: "cnpj", width: 18 }, { header: "custo_mercadoria", key: "merc", width: 16, style: { numFmt: "#,##0.00" } },
    { header: "ipi_compra_%", key: "ipi", width: 12, style: { numFmt: "0.00" } }, { header: "custo_final_base", key: "custo", width: 16, style: { numFmt: "#,##0.00" } },
    { header: "preco_atacado", key: "preco", width: 14, style: { numFmt: "#,##0.00" } }, { header: "margem_%", key: "margem", width: 10, style: { numFmt: "0.0" } },
    { header: "cubagem_m3", key: "cub", width: 12, style: { numFmt: "0.000" } }, { header: "saldo_livre", key: "saldo", width: 11 },
    { header: "skus", key: "skus", width: 24 }, { header: "pendencias", key: "pend", width: 30 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  const c = (v: number | null) => (v == null ? null : v / 100);
  for (const r of rows) {
    ws.addRow({
      codigo: r.code, produto: r.name, categoria: r.category, cor: r.color, status: r.archived ? "arquivado" : r.isActive ? "ativo" : "inativo",
      forn: r.supplier, cnpj: r.supplierCnpj, merc: c(r.supplierCostCents), ipi: r.supplierIpiBps == null ? null : r.supplierIpiBps / 100,
      custo: c(r.costFinalCents), preco: c(r.priceCents), margem: r.marginBps == null ? null : r.marginBps / 100,
      cub: r.cubage || null, saldo: r.freeStock, skus: r.skus.join(", "), pend: r.alerts.join(", "),
    });
  }
  ws.autoFilter = { from: "A1", to: "P1" };
  return Buffer.from(await wb.xlsx.writeBuffer());
}
