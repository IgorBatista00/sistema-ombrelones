import { describe, expect, it } from "vitest";
import { nextClientCode, parseClientRow } from "@/modules/clients/rules";

describe("código do cliente", () => {
  it("numeração automática continua do maior código numérico", () => {
    expect(nextClientCode([])).toBe("00001");
    expect(nextClientCode(["00007", "ABC-1", null, "00012"])).toBe("00013");
  });
  it("código vem da planilha e é validado", () => {
    expect(parseClientRow({ __line: 2, nome: "Empresa Teste", codigo: "C-120" }).data?.code).toBe("C-120");
    expect(parseClientRow({ __line: 2, nome: "Empresa Teste" }).data?.code).toBeNull();
    expect(parseClientRow({ __line: 2, nome: "Empresa Teste", codigo: "A B" }).errors[0]).toMatch(/Código inválido/);
  });
});
