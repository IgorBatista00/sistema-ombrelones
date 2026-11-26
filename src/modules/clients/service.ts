import "server-only";
import ExcelJS from "exceljs";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { readMatrix } from "@/modules/products/excel";
import { formatCnpj } from "@/modules/companies/cnpj";
import { CLIENT_ALIASES, CLIENT_COLS, CLIENT_COLUMNS, clientKey, formatCep, formatCpf, nextClientCode, parseClientRow, UFS, type ClientCol, type ParsedClient, type RawClientRow } from "./rules";

const MAX_ROWS = 3000;
const norm = (h: string) => h.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
const TEXT_COLS = new Set<ClientCol>(["codigo", "cnpj", "cpf", "cep", "celular", "telefone", "inscricao_estadual", "aniversario"]);

/** Modelo .xlsx: cabeçalho com notas, colunas de documento como texto (não perdem o zero), listas de tipo/UF, 2 exemplos e instruções. */
export async function buildClientTemplate() {
  const wb = new ExcelJS.Workbook(); wb.creator = "Painel"; wb.created = new Date();
  const ws = wb.addWorksheet("clientes", { views: [{ state: "frozen", xSplit: 2, ySplit: 1 }] });
  const widths: Partial<Record<ClientCol, number>> = { nome: 38, nome_fantasia: 26, endereco: 38, endereco_entrega: 34, email: 30, observacoes: 40, contato: 22, cidade: 20, bairro: 20 };
  ws.columns = CLIENT_COLUMNS.map(([key]) => ({ header: key, key, width: widths[key] ?? 16, style: TEXT_COLS.has(key) ? { numFmt: "@" } : {} }));
  const head = ws.getRow(1); head.height = 28;
  CLIENT_COLUMNS.forEach(([key, desc], i) => {
    const c = head.getCell(i + 1);
    c.font = { bold: true, color: { argb: "FFFFFFFF" } }; c.alignment = { vertical: "middle", horizontal: "center" };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: key === "nome" ? "FF8C3B2E" : "FF2F3A33" } };
    c.note = desc;
  });
  const col = (k: ClientCol) => ws.getColumn(CLIENT_COLUMNS.findIndex(([c]) => c === k) + 1).letter;
  const dv = (ws as unknown as { dataValidations: { add(range: string, v: ExcelJS.DataValidation): void } }).dataValidations;
  dv.add(`${col("tipo")}2:${col("tipo")}${MAX_ROWS + 1}`, { type: "list", allowBlank: true, formulae: ['"PJ,PF"'], showErrorMessage: true, error: "Use PJ (empresa) ou PF (pessoa física)." });
  dv.add(`${col("uf")}2:${col("uf")}${MAX_ROWS + 1}`, { type: "list", allowBlank: true, formulae: [`listas!$A$2:$A$${UFS.length + 1}`], showErrorMessage: true, error: "Use a sigla do estado (ex.: SP)." });
  const lists = wb.addWorksheet("listas"); lists.columns = [{ header: "UF", key: "u", width: 8 }]; UFS.forEach((u) => lists.addRow({ u }));
  const ex = (o: Partial<Record<ClientCol, string>>) => { const r = ws.addRow(CLIENT_COLUMNS.map(([k]) => o[k] ?? "")); r.font = { italic: true, color: { argb: "FF8A8F87" } }; };
  ex({ tipo: "PJ", nome: "[EXEMPLO — APAGUE ESTA LINHA] Razão social da empresa", nome_fantasia: "Nome fantasia", cnpj: "00.000.000/0000-00", inscricao_estadual: "ISENTO", contato: "Nome do comprador", celular: "(11) 90000-0000", email: "compras@empresa.com.br", endereco: "Rua Exemplo, 100 — sala 2", bairro: "Centro", cidade: "São Paulo", uf: "SP", cep: "00000-000" });
  ex({ tipo: "PF", nome: "[EXEMPLO — APAGUE ESTA LINHA] Nome completo do cliente", cpf: "000.000.000-00", celular: "(11) 90000-0000", email: "cliente@email.com", cidade: "Campinas", uf: "SP", endereco_entrega: "Endereço da obra", aniversario: "25/03", observacoes: "Indicação do arquiteto X" });
  const help = wb.addWorksheet("instrucoes"); help.columns = [{ key: "a", width: 22 }, { key: "b", width: 100 }];
  help.addRow(["COMO USAR"]).font = { bold: true, size: 13 };
  [
    "1. Preencha a aba \"clientes\" a partir da linha 2 — um cliente por linha. Apague as duas linhas de [EXEMPLO].",
    "2. Não renomeie os títulos da linha 1. Colunas podem ficar em branco; só \"nome\" é obrigatória.",
    "3. CNPJ ou CPF é a chave: se o cliente já existir, ele é ATUALIZADO (só as colunas preenchidas); se não existir, é CRIADO.",
    "4. Sem CNPJ/CPF o cliente é sempre criado de novo — evite reimportar a mesma planilha sem documento.",
    "5. Documentos, CEP e telefones podem ter pontuação. As colunas já estão como texto para não perder o zero à esquerda.",
    "6. No painel: Clientes › Importar planilha › escolha o arquivo › confira a prévia (erros e avisos por linha) › Confirmar.",
    "7. Importar não cria login no site: o cliente passa a aparecer em \"Cliente cadastrado\" nos orçamentos.",
  ].forEach((t) => { const r = help.addRow([t]); help.mergeCells(r.number, 1, r.number, 2); r.alignment = { wrapText: true }; });
  help.addRow([]); help.addRow(["coluna", "como preencher"]).font = { bold: true };
  CLIENT_COLUMNS.forEach(([k, d]) => help.addRow([k, d]));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function readClientSheet(buf: Buffer, filename: string): Promise<RawClientRow[]> {
  const matrix = await readMatrix(buf, filename);
  const header = (matrix[0] ?? []).map((h) => { const k = norm(h ?? ""); return (CLIENT_COLS.has(k) ? k : CLIENT_ALIASES[k]) as ClientCol | undefined; });
  if (!header.includes("nome")) throw new AppError("BAD_HEADER", 'A primeira linha precisa ter a coluna "nome". Baixe o modelo de planilha.');
  const rows: RawClientRow[] = [];
  for (let i = 1; i < matrix.length; i++) {
    const r = matrix[i]; if (!r || r.every((c) => !String(c ?? "").trim())) continue;
    const obj: RawClientRow = { __line: i + 1 };
    header.forEach((c, j) => { if (c && !obj[c]) obj[c] = String(r[j] ?? "").trim(); });
    rows.push(obj);
  }
  if (!rows.length) throw new AppError("EMPTY", "Nenhum cliente encontrado na planilha.");
  if (rows.length > MAX_ROWS) throw new AppError("TOO_MANY_ROWS", `Máximo de ${MAX_ROWS} linhas por importação.`);
  return rows;
}

export type ClientImportRow = { line: number; name: string; doc: string; action: "criar" | "atualizar" | "ignorar"; errors: string[]; warnings: string[] };
type Planned = ClientImportRow & { data: ParsedClient | null; existingId: string | null };

async function plan(rows: RawClientRow[]): Promise<Planned[]> {
  const parsed = rows.map((r) => ({ r, p: parseClientRow(r) }));
  const cnpjs = parsed.map((x) => x.p.data?.cnpj).filter(Boolean) as string[], cpfs = parsed.map((x) => x.p.data?.cpf).filter(Boolean) as string[];
  const existing = await db.client.findMany({ where: { OR: [{ cnpj: { in: cnpjs } }, { cpf: { in: cpfs } }] }, select: { id: true, cnpj: true, cpf: true } });
  const codes = parsed.map((x) => x.p.data?.code).filter(Boolean) as string[];
  const codeOwners = new Map((await db.client.findMany({ where: { code: { in: codes } }, select: { id: true, code: true, name: true } })).map((c) => [c.code!, c]));
  const seenCode = new Map<string, number>();
  const byKey = new Map(existing.flatMap((e) => [e.cnpj && [`cnpj:${e.cnpj}`, e.id], e.cpf && [`cpf:${e.cpf}`, e.id]].filter(Boolean) as [string, string][]));
  const seen = new Map<string, number>();
  return parsed.map(({ r, p }) => {
    const errors = [...p.errors], warnings = [...p.warnings];
    const key = p.data ? clientKey(p.data) : null;
    if (key && seen.has(key)) errors.push(`Mesmo ${key.startsWith("cnpj") ? "CNPJ" : "CPF"} da linha ${seen.get(key)} — deixe uma linha por cliente.`);
    if (key && !seen.has(key)) seen.set(key, r.__line);
    const existingId = key ? byKey.get(key) ?? null : null;
    const code = p.data?.code;
    if (code) {
      const owner = codeOwners.get(code);
      if (owner && owner.id !== existingId) errors.push(`O código ${code} já é do cliente "${owner.name}".`);
      if (seenCode.has(code)) errors.push(`Mesmo código da linha ${seenCode.get(code)}.`); else seenCode.set(code, r.__line);
    }
    const ok = p.data && !errors.length;
    const doc = p.data?.cnpj ? formatCnpj(p.data.cnpj) : p.data?.cpf ? formatCpf(p.data.cpf) : (r.cnpj || r.cpf || "");
    return { line: r.__line, name: p.data?.name ?? (r.nome ?? ""), doc, action: ok ? (existingId ? "atualizar" : "criar") : "ignorar", errors, warnings, data: ok ? p.data : null, existingId };
  });
}

/** Prévia: nada é gravado. */
export async function previewClientImport(rows: RawClientRow[]): Promise<ClientImportRow[]> {
  return (await plan(rows)).map(({ data: _d, existingId: _e, ...rest }) => rest); // eslint-disable-line @typescript-eslint/no-unused-vars
}

/** Grava: cria os novos e atualiza os existentes (só os campos preenchidos). Linhas com erro são ignoradas. */
export async function commitClientImport(actorId: string, rows: RawClientRow[]) {
  const planned = await plan(rows);
  const todo = planned.filter((p) => p.data);
  if (!todo.length) throw new AppError("NOTHING", "Nenhuma linha válida para importar. Corrija os erros da prévia.", 422);
  let created = 0, updated = 0;
  await db.$transaction(async (tx) => {
    const used = (await tx.client.findMany({ where: { code: { not: null } }, select: { code: true } })).map((c) => c.code);
    for (const p of todo) if (p.data!.code) used.push(p.data!.code);
    for (const p of todo) {
      const d = p.data!;
      if (p.existingId) {
        const patch = Object.fromEntries(Object.entries(d).filter(([, v]) => v != null && v !== "")) as Prisma.ClientUpdateInput;
        await tx.client.update({ where: { id: p.existingId }, data: patch }); updated++;
      } else {
        const code = d.code ?? nextClientCode(used); used.push(code);
        await tx.client.create({ data: { ...d, code, source: "IMPORT", createdById: actorId } }); created++;
      }
    }
    await tx.auditLog.create({ data: { actorId, action: "client.import", entity: "Client", entityId: "import", after: { created, updated, ignored: planned.length - todo.length } } });
  }, { timeout: 60_000 });
  return { created, updated, ignored: planned.length - todo.length, failed: planned.filter((p) => !p.data).map((p) => ({ line: p.line, error: p.errors[0] ?? p.warnings[0] ?? "Ignorada" })) };
}

export async function clientsView(q?: string, page = 1) {
  const t = q?.trim(); const d = t?.replace(/\D/g, "");
  const where: Prisma.ClientWhereInput = t ? { OR: [
    { code: { contains: t, mode: "insensitive" } }, { name: { contains: t, mode: "insensitive" } }, { tradeName: { contains: t, mode: "insensitive" } }, { contactName: { contains: t, mode: "insensitive" } },
    { email: { contains: t, mode: "insensitive" } }, { city: { contains: t, mode: "insensitive" } },
    ...(d && d.length >= 3 ? [{ cnpj: { contains: d } }, { cpf: { contains: d } }] : []),
  ] } : {};
  const per = 50;
  const [rows, total, all] = await Promise.all([
    db.client.findMany({ where, orderBy: { name: "asc" }, skip: (page - 1) * per, take: per, include: { _count: { select: { quotes: true } } } }),
    db.client.count({ where }), db.client.count(),
  ]);
  const siteCnpjs = new Set((await db.company.findMany({ where: { cnpj: { in: rows.map((r) => r.cnpj).filter(Boolean) as string[] } }, select: { cnpj: true } })).map((c) => c.cnpj));
  return { rows: rows.map((r) => ({ ...r, hasSiteAccount: !!r.cnpj && siteCnpjs.has(r.cnpj) })), total, all, page, pages: Math.max(1, Math.ceil(total / per)) };
}

export async function deleteClient(actorId: string, id: string) {
  const c = await db.client.findUnique({ where: { id } });
  if (!c) throw new AppError("NOT_FOUND", "Cliente não encontrado.", 404);
  await db.$transaction([db.client.delete({ where: { id } }), db.auditLog.create({ data: { actorId, action: "client.delete", entity: "Client", entityId: id, before: { name: c.name, cnpj: c.cnpj, cpf: c.cpf } } })]);
}

/** Formato do "Cliente cadastrado" do orçamento. */
export function clientToQuoteFields(c: { name: string; cnpj: string | null; cpf: string | null; stateRegistration: string | null; street: string | null; district: string | null; city: string | null; state: string | null; zipCode: string | null; contactName: string | null; mobile: string | null; phone: string | null; email: string | null; birthday: string | null; deliveryAddress: string | null }) {
  return {
    name: c.name, cpf: c.cpf ? formatCpf(c.cpf) : "", cnpj: c.cnpj ?? "", ie: c.stateRegistration ?? "",
    address: [c.street, c.district].filter(Boolean).join(" · "), city: [c.city, c.state].filter(Boolean).join(" - "), cep: c.zipCode ? formatCep(c.zipCode) : "",
    contact: c.contactName ?? "", mobile: c.mobile ?? c.phone ?? "", email: c.email ?? "", site: "", birthday: c.birthday ?? "", delivery: c.deliveryAddress ?? "",
  };
}
