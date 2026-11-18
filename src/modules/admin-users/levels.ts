/** Níveis de acesso do painel — regras puras (sem banco), usadas no servidor e nas telas. */

export const LEVELS = [
  { key: "ADM", label: "Adm", hint: "Acesso total, inclusive usuários e níveis de acesso." },
  { key: "COMERCIAL", label: "Comercial", hint: "Orçamentos, funil, pedidos e clientes." },
  { key: "EXPEDICAO", label: "Expedição", hint: "Logística, entregas, estoque e ordens de compra." },
  { key: "FINANCEIRO", label: "Financeiro", hint: "Financeiro, faturamento, cobrança e dashboard." },
] as const;
export type LevelKey = (typeof LEVELS)[number]["key"];
export const levelLabel = (k: string | null | undefined) => LEVELS.find((l) => l.key === k)?.label ?? "Sem nível";

/** Áreas do painel = permissões que o sistema já confere em cada tela. */
export const AREAS = [
  { key: "DASHBOARD", label: "Dashboard", hint: "Indicadores gerais (os valores financeiros só aparecem com Financeiro)" },
  { key: "ORDERS", label: "Pedidos, orçamentos e funil", hint: "Inclui o cadastro de clientes usado nos orçamentos" },
  { key: "CUSTOMERS", label: "Clientes", hint: "Cadastro de clientes e contas da loja" },
  { key: "PRODUCTS", label: "Produtos, tabela, fornecedores e custos", hint: "Mostra custos e margens dos produtos" },
  { key: "STOCK", label: "Estoque e ordens de compra", hint: "" },
  { key: "LOGISTICS", label: "Logística e entregas", hint: "" },
  { key: "FINANCE", label: "Financeiro", hint: "Recebimentos, saídas, faturamento, cobrança e Mercado Livre" },
  { key: "SETTINGS", label: "Configurações da loja", hint: "Dados da empresa, logo, textos e políticas" },
  { key: "ADMIN_USERS", label: "Usuários e níveis de acesso", hint: "Somente Adm" },
] as const;
export type AreaKey = (typeof AREAS)[number]["key"];
const ALL = AREAS.map((a) => a.key) as AreaKey[];
/** Áreas que só o Adm pode ter (evita que alguém se dê mais acesso). */
export const ADM_ONLY: AreaKey[] = ["ADMIN_USERS"];

export type LevelMatrix = Record<Exclude<LevelKey, "ADM">, AreaKey[]>;
export const DEFAULT_MATRIX: LevelMatrix = {
  COMERCIAL: ["ORDERS", "CUSTOMERS"],
  EXPEDICAO: ["LOGISTICS", "STOCK"],
  FINANCEIRO: ["FINANCE", "DASHBOARD"],
};

/** Limpa o que vier do banco/formulário: só áreas conhecidas, nunca as exclusivas do Adm, na ordem da lista. */
export function normalizeMatrix(raw: unknown): LevelMatrix {
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out = {} as LevelMatrix;
  for (const k of Object.keys(DEFAULT_MATRIX) as (keyof LevelMatrix)[]) {
    const v = Array.isArray(src[k]) ? (src[k] as unknown[]) : DEFAULT_MATRIX[k];
    out[k] = ALL.filter((a) => v.includes(a) && !ADM_ONLY.includes(a));
  }
  return out;
}

export function permissionsFor(level: LevelKey, matrix: LevelMatrix): AreaKey[] {
  return level === "ADM" ? [...ALL] : ALL.filter((a) => matrix[level].includes(a));
}

/** Um nível precisa de pelo menos uma área, senão a pessoa entra e não vê nada. */
export function matrixError(m: LevelMatrix) {
  const empty = (Object.keys(m) as (keyof LevelMatrix)[]).find((k) => m[k].length === 0);
  return empty ? `O nível ${levelLabel(empty)} precisa de pelo menos uma área.` : null;
}

/**
 * Proteções ao mudar nível ou desativar alguém:
 * ninguém tira o próprio acesso de Adm nem se desativa, e sempre sobra pelo menos um Adm ativo.
 */
export function guardChange(p: { actorId: string; targetId: string; targetLevel: string | null; targetActive: boolean; nextLevel: string | null; nextActive: boolean; activeAdmCount: number }) {
  const self = p.actorId === p.targetId;
  if (self && !p.nextActive) return "Você não pode desativar o seu próprio usuário.";
  if (self && p.targetLevel === "ADM" && p.nextLevel !== "ADM") return "Você não pode tirar o seu próprio nível Adm. Peça a outro Adm.";
  const losesAdm = p.targetLevel === "ADM" && p.targetActive && (p.nextLevel !== "ADM" || !p.nextActive);
  if (losesAdm && p.activeAdmCount <= 1) return "É preciso manter pelo menos um usuário Adm ativo.";
  return null;
}

/** Senha provisória legível (sem 0/O, 1/l/I), com letras e números. */
const cryptoRand = (n: number) => { const a = new Uint32Array(1); globalThis.crypto.getRandomValues(a); return a[0] % n; };
export function generateTempPassword(rand: (n: number) => number = cryptoRand) {
  const letters = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ", digits = "23456789";
  const pick = (s: string) => s[rand(s.length)];
  const chars = [...Array(8)].map(() => pick(letters)).concat([...Array(4)].map(() => pick(digits)));
  for (let i = chars.length - 1; i > 0; i--) { const j = rand(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
  return chars.join("");
}
