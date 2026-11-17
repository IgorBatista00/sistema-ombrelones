/** Cadastro de clientes — regras puras da importação (sem banco). */
import { isValidCnpj, normalizeCnpj } from "@/modules/companies/cnpj";

export const CLIENT_COLUMNS = [
  ["tipo", "PJ (empresa) ou PF (pessoa física). Em branco: o sistema deduz pelo CNPJ/CPF"],
  ["nome", "OBRIGATÓRIO. Razão social (PJ) ou nome completo (PF)"],
  ["nome_fantasia", "Nome fantasia (PJ)"],
  ["cnpj", "CNPJ — com ou sem pontuação. Chave para atualizar um cliente já cadastrado"],
  ["cpf", "CPF — com ou sem pontuação. Chave para atualizar um cliente já cadastrado"],
  ["inscricao_estadual", "Inscrição estadual (ou ISENTO)"],
  ["contato", "Nome da pessoa de contato"],
  ["celular", "Celular/WhatsApp com DDD"],
  ["telefone", "Telefone fixo com DDD"],
  ["email", "E-mail"],
  ["endereco", "Rua, número e complemento"],
  ["bairro", "Bairro"],
  ["cidade", "Cidade"],
  ["uf", "Sigla do estado (ex.: SP)"],
  ["cep", "CEP — 8 números, com ou sem traço"],
  ["endereco_entrega", "Endereço de entrega, se for diferente"],
  ["aniversario", "Dia e mês (ex.: 25/03)"],
  ["observacoes", "Anotações internas"],
] as const;
export type ClientCol = (typeof CLIENT_COLUMNS)[number][0];
export const CLIENT_COLS = new Set<string>(CLIENT_COLUMNS.map(([c]) => c));
export const CLIENT_ALIASES: Record<string, ClientCol> = {
  razao_social: "nome", nome_completo: "nome", cliente: "nome", fantasia: "nome_fantasia", e_mail: "email", whatsapp: "celular", fone: "telefone",
  ie: "inscricao_estadual", inscricao: "inscricao_estadual", estado: "uf", logradouro: "endereco", rua: "endereco", entrega: "endereco_entrega",
  data_de_aniversario: "aniversario", obs: "observacoes", observacao: "observacoes", tipo_de_cliente: "tipo", pessoa: "tipo", cnpj_cpf: "cnpj",
};
export const UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"];

export const digits = (s: string) => s.replace(/\D/g, "");
export function isValidCpf(raw: string) {
  const c = digits(raw);
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  const dv = (n: number) => { let s = 0; for (let i = 0; i < n; i++) s += Number(c[i]) * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  return dv(9) === Number(c[9]) && dv(10) === Number(c[10]);
}
export const formatCpf = (c: string) => digits(c).replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
export const formatCep = (c: string) => digits(c).replace(/(\d{5})(\d{3})/, "$1-$2");
export function formatPhone(p: string) {
  const d = digits(p).replace(/^55(?=\d{10,11}$)/, "");
  return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : p.trim();
}
/** "25/03", "25/03/1980", data do Excel (ISO) → "25/03"; inválido → null. */
export function parseBirthday(raw: string) {
  const t = raw.trim(); if (!t) return null;
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const br = t.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-]\d{2,4})?$/);
  const [d, m] = iso ? [Number(iso[3]), Number(iso[2])] : br ? [Number(br[1]), Number(br[2])] : [0, 0];
  if (!d || !m || m > 12 || d > [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]) return null;
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

export type ParsedClient = {
  personType: "PJ" | "PF"; name: string; tradeName: string | null; cnpj: string | null; cpf: string | null; stateRegistration: string | null;
  contactName: string | null; mobile: string | null; phone: string | null; email: string | null; street: string | null; district: string | null;
  city: string | null; state: string | null; zipCode: string | null; deliveryAddress: string | null; birthday: string | null; notes: string | null;
};
export type RawClientRow = Partial<Record<ClientCol, string>> & { __line: number };

/** Valida e normaliza uma linha. Campos vazios ficam null (na atualização, não apagam o que já existe). */
export function parseClientRow(r: RawClientRow): { data: ParsedClient | null; errors: string[]; warnings: string[]; example: boolean } {
  const errors: string[] = [], warnings: string[] = [];
  const v = (k: ClientCol) => (r[k] ?? "").trim();
  const opt = (k: ClientCol, max = 200) => { const x = v(k).replace(/\s+/g, " "); return x ? x.slice(0, max) : null; };
  const name = v("nome").replace(/\s+/g, " ");
  const example = /\[EXEMPLO/i.test(name);
  if (example) return { data: null, errors, warnings: ["Linha de exemplo do modelo — ignorada."], example };
  if (name.length < 2) errors.push("Informe o nome (razão social ou nome completo).");

  // CNPJ: aceita números (planilha pode ter perdido o zero à esquerda) e o novo formato alfanumérico
  let cnpj: string | null = null, cpf: string | null = null;
  const rawCnpj = v("cnpj"), rawCpf = v("cpf");
  if (rawCnpj) {
    let c = normalizeCnpj(rawCnpj);
    if (/^\d{11}$/.test(c) && !v("cpf") && isValidCpf(c)) { cpf = c; warnings.push("O número na coluna cnpj é um CPF — cadastrado como CPF."); }
    else { if (/^\d{12,13}$/.test(c)) c = c.padStart(14, "0"); if (isValidCnpj(c)) cnpj = c; else errors.push(`CNPJ inválido (${rawCnpj}).`); }
  }
  if (rawCpf) {
    let c = digits(rawCpf); if (c.length >= 9 && c.length < 11) c = c.padStart(11, "0");
    if (isValidCpf(c)) cpf = c; else errors.push(`CPF inválido (${rawCpf}).`);
  }
  const tipo = v("tipo").toUpperCase().replace(/[^A-Z]/g, "");
  let personType: "PJ" | "PF";
  if (["PJ", "JURIDICA", "EMPRESA", "CNPJ"].includes(tipo)) personType = "PJ";
  else if (["PF", "FISICA", "PESSOAFISICA", "CPF"].includes(tipo)) personType = "PF";
  else { if (tipo) warnings.push(`Tipo "${v("tipo")}" não reconhecido — use PJ ou PF.`); personType = cnpj ? "PJ" : cpf ? "PF" : "PJ"; }
  if (personType === "PF" && cnpj && !cpf) warnings.push("Pessoa física com CNPJ — confira o tipo.");
  if (!rawCnpj && !rawCpf) warnings.push("Sem CNPJ/CPF: será sempre cadastrado como cliente novo (pode duplicar em uma nova importação).");

  const email = opt("email", 160)?.toLowerCase() ?? null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push(`E-mail inválido (${email}).`);
  const uf = opt("uf", 2)?.toUpperCase() ?? null;
  if (v("uf") && (!uf || !UFS.includes(uf) || v("uf").length > 2)) errors.push(`UF inválida (${v("uf")}) — use a sigla, ex.: SP.`);
  let cep = v("cep") ? digits(v("cep")) : null;
  if (cep && cep.length === 7) cep = cep.padStart(8, "0");
  if (cep && cep.length !== 8) errors.push(`CEP inválido (${v("cep")}) — 8 números.`);
  const phoneOf = (k: ClientCol) => { const x = v(k); if (!x) return null; const d = digits(x).replace(/^55(?=\d{10,11}$)/, ""); if (d.length < 10 || d.length > 11) warnings.push(`${k === "celular" ? "Celular" : "Telefone"} sem DDD ou com tamanho estranho (${x}) — gravado como está.`); return formatPhone(x); };
  const mobile = phoneOf("celular"), phone = phoneOf("telefone");
  const birthday = parseBirthday(v("aniversario"));
  if (v("aniversario") && !birthday) warnings.push(`Aniversário não reconhecido (${v("aniversario")}) — use dia/mês, ex.: 25/03. Campo ignorado.`);

  if (errors.length) return { data: null, errors, warnings, example };
  return { errors, warnings, example, data: {
    personType, name: name.slice(0, 200), tradeName: opt("nome_fantasia"), cnpj, cpf, stateRegistration: opt("inscricao_estadual", 30),
    contactName: opt("contato", 120), mobile, phone, email, street: opt("endereco", 200), district: opt("bairro", 120), city: opt("cidade", 120),
    state: uf, zipCode: cep, deliveryAddress: opt("endereco_entrega", 300), birthday, notes: opt("observacoes", 2000),
  } };
}

/** Chave de duplicidade: CNPJ ou CPF. */
export const clientKey = (c: Pick<ParsedClient, "cnpj" | "cpf">) => (c.cnpj ? `cnpj:${c.cnpj}` : c.cpf ? `cpf:${c.cpf}` : null);
