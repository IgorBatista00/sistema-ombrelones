import { describe, expect, it } from "vitest";
import { isValidCpf, parseBirthday, parseClientRow } from "@/modules/clients/rules";

describe("importação de clientes", () => {
  it("valida CPF", () => {
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("111.111.111-11")).toBe(false);
    expect(isValidCpf("529.982.247-24")).toBe(false);
  });
  it("aniversário", () => {
    expect(parseBirthday("5/3")).toBe("05/03"); expect(parseBirthday("25/03/1980")).toBe("25/03"); expect(parseBirthday("1980-03-25T00:00:00.000Z")).toBe("25/03");
    expect(parseBirthday("31/02")).toBeNull();
  });
  it("PJ completo, com CNPJ sem zero à esquerda e CEP sem zero", () => {
    const r = parseClientRow({ __line: 2, nome: "  Loja   Teste Ltda ", cnpj: "1222333000128", uf: "sp", cep: "1310100", celular: "11 99999-8888", email: "COMPRAS@LOJA.COM.BR" });
    expect(r.errors).toEqual([]);
    expect(r.data).toMatchObject({ personType: "PJ", name: "Loja Teste Ltda", state: "SP", zipCode: "01310100", mobile: "(11) 99999-8888", email: "compras@loja.com.br" });
  });
  it("PF deduzido pelo CPF; erros de CNPJ, UF, CEP e e-mail", () => {
    expect(parseClientRow({ __line: 3, nome: "Ana Souza", cpf: "52998224725" }).data?.personType).toBe("PF");
    const bad = parseClientRow({ __line: 4, nome: "X Y", cnpj: "11.222.333/0001-00", uf: "XX", cep: "123", email: "a@" });
    expect(bad.data).toBeNull(); expect(bad.errors).toHaveLength(4);
  });
  it("linha de exemplo é ignorada e sem documento gera aviso", () => {
    expect(parseClientRow({ __line: 2, nome: "[EXEMPLO — APAGUE] Loja" }).example).toBe(true);
    expect(parseClientRow({ __line: 5, nome: "Cliente sem doc" }).warnings[0]).toMatch(/Sem CNPJ\/CPF/);
  });
});
