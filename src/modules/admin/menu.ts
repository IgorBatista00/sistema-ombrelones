import type { AdminPermission } from "@prisma/client";

/** Itens do menu do painel e a(s) permissão(ões) que liberam cada um. */
export const MENU: { href: string; label: string; perm: AdminPermission | AdminPermission[] }[] = [
  { href: "/admin/meu-dia", label: "Meu dia", perm: ["DASHBOARD", "ORDERS", "LOGISTICS", "FINANCE", "STOCK"] },
  { href: "/admin", label: "Dashboard", perm: "DASHBOARD" },
  { href: "/admin/pedidos", label: "Pedidos", perm: "ORDERS" },
  { href: "/admin/orcamentos", label: "Orçamentos", perm: "ORDERS" },
  { href: "/admin/funil", label: "Funil de orçamentos", perm: "ORDERS" },
  { href: "/admin/mercadolivre", label: "Mercado Livre", perm: ["ORDERS", "FINANCE", "LOGISTICS"] },
  { href: "/admin/logistica", label: "Logística", perm: "LOGISTICS" },
  { href: "/admin/entregas", label: "Entregas", perm: "LOGISTICS" },
  { href: "/admin/produtos", label: "Produtos", perm: "PRODUCTS" },
  { href: "/admin/tabela", label: "Tabela", perm: "PRODUCTS" },
  { href: "/admin/estoque", label: "Estoque", perm: "STOCK" },
  { href: "/admin/ordens-compra", label: "Ordens de compra", perm: "STOCK" },
  { href: "/admin/fornecedores", label: "Fornecedores", perm: "PRODUCTS" },
  { href: "/admin/tabela-custos", label: "Tabela de custos", perm: "PRODUCTS" },
  { href: "/admin/clientes", label: "Clientes", perm: "CUSTOMERS" },
  { href: "/admin/financeiro", label: "Financeiro", perm: "FINANCE" },
  { href: "/admin/configuracoes", label: "Configurações", perm: "SETTINGS" },
  { href: "/admin/usuarios", label: "Usuários", perm: "ADMIN_USERS" },
];

export const allowedMenu = (perms: readonly string[]) =>
  MENU.filter((m) => (Array.isArray(m.perm) ? m.perm : [m.perm]).some((p) => perms.includes(p))).map(({ href, label }) => ({ href, label }));

/** Primeira página que a pessoa pode abrir (destino depois do login). */
export const homeFor = (perms: readonly string[]) => allowedMenu(perms)[0]?.href ?? "/admin/sem-acesso";
