import { describe, expect, it } from "vitest";
import { DEFAULT_MATRIX, generateTempPassword, guardChange, levelLabel, matrixError, normalizeMatrix, permissionsFor } from "@/modules/admin-users/levels";
import { allowedMenu, homeFor } from "@/modules/admin/menu";
import { passwordSchema } from "@/modules/auth/password";

describe("níveis de acesso", () => {
  it("Adm tem tudo; os demais seguem a tabela", () => {
    expect(permissionsFor("ADM", DEFAULT_MATRIX)).toContain("ADMIN_USERS");
    expect(permissionsFor("ADM", DEFAULT_MATRIX)).toHaveLength(9);
    expect(permissionsFor("COMERCIAL", DEFAULT_MATRIX)).toEqual(["ORDERS", "CUSTOMERS"]);
    expect(permissionsFor("EXPEDICAO", DEFAULT_MATRIX)).toEqual(["STOCK", "LOGISTICS"]);
    expect(permissionsFor("FINANCEIRO", DEFAULT_MATRIX)).toEqual(["DASHBOARD", "FINANCE"]);
    expect(levelLabel("EXPEDICAO")).toBe("Expedição");
    expect(levelLabel(null)).toBe("Sem nível");
  });

  it("nunca deixa outro nível ganhar a gestão de usuários e ignora áreas desconhecidas", () => {
    const m = normalizeMatrix({ COMERCIAL: ["ORDERS", "ADMIN_USERS", "XYZ"], EXPEDICAO: "lixo" });
    expect(m.COMERCIAL).toEqual(["ORDERS"]);
    expect(m.EXPEDICAO).toEqual(["STOCK", "LOGISTICS"]);
    expect(matrixError({ ...m, FINANCEIRO: [] })).toMatch(/Financeiro precisa/);
    expect(matrixError(m)).toBeNull();
  });

  it("protege contra ficar sem Adm e contra se trancar para fora", () => {
    const base = { actorId: "a", targetId: "a", targetLevel: "ADM", targetActive: true, nextLevel: "ADM", nextActive: true, activeAdmCount: 2 };
    expect(guardChange({ ...base, nextActive: false })).toMatch(/próprio usuário/);
    expect(guardChange({ ...base, nextLevel: "COMERCIAL" })).toMatch(/próprio nível Adm/);
    expect(guardChange({ ...base, targetId: "b", nextLevel: "COMERCIAL", activeAdmCount: 1 })).toMatch(/pelo menos um usuário Adm/);
    expect(guardChange({ ...base, targetId: "b", nextActive: false, activeAdmCount: 1 })).toMatch(/pelo menos um usuário Adm/);
    expect(guardChange({ ...base, targetId: "b", nextLevel: "COMERCIAL", activeAdmCount: 2 })).toBeNull();
    expect(guardChange({ ...base, targetId: "b", targetLevel: "COMERCIAL", nextActive: false, activeAdmCount: 1 })).toBeNull();
  });

  it("gera senha provisória válida e legível", () => {
    for (let i = 0; i < 50; i++) {
      const p = generateTempPassword();
      expect(p).toHaveLength(12);
      expect(passwordSchema.safeParse(p).success).toBe(true);
      expect(p).not.toMatch(/[01OlI]/);
    }
  });

  it("monta o menu e a página inicial de cada nível", () => {
    const com = allowedMenu(permissionsFor("COMERCIAL", DEFAULT_MATRIX)).map((m) => m.label);
    expect(com).toEqual(["Meu dia", "Pedidos", "Orçamentos", "Funil de orçamentos", "Clientes"]);
    expect(allowedMenu(permissionsFor("EXPEDICAO", DEFAULT_MATRIX)).map((m) => m.label)).toEqual(["Meu dia", "Logística", "Entregas", "Estoque", "Ordens de compra"]);
    expect(allowedMenu(permissionsFor("FINANCEIRO", DEFAULT_MATRIX)).map((m) => m.label)).toEqual(["Meu dia", "Dashboard", "Financeiro"]);
    expect(allowedMenu(permissionsFor("ADM", DEFAULT_MATRIX)).map((m) => m.label)).toContain("Usuários");
    expect(homeFor(["CUSTOMERS"])).toBe("/admin/clientes");
    expect(homeFor([])).toBe("/admin/sem-acesso");
  });
});
