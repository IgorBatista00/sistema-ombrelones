import { describe, expect, it } from "vitest";
import { formatCnpj, isValidCnpj, normalizeCnpj } from "@/modules/companies/cnpj";

describe("CNPJ", () => {
  it("aceita CNPJ numérico válido, com ou sem máscara", () => {
    expect(isValidCnpj("11.222.333/0001-81")).toBe(true);
    expect(isValidCnpj("11222333000181")).toBe(true);
  });
  it("rejeita dígito verificador errado", () => {
    expect(isValidCnpj("11.222.333/0001-82")).toBe(false);
  });
  it("rejeita sequências repetidas e tamanhos inválidos", () => {
    expect(isValidCnpj("00000000000000")).toBe(false);
    expect(isValidCnpj("11111111111111")).toBe(false);
    expect(isValidCnpj("1122233300018")).toBe(false);
    expect(isValidCnpj("")).toBe(false);
  });
  it("aceita CNPJ alfanumérico (exemplo oficial da Receita: 12.ABC.345/01DE-35)", () => {
    expect(isValidCnpj("12.ABC.345/01DE-35")).toBe(true);
    expect(isValidCnpj("12abc34501de35")).toBe(true);
    expect(isValidCnpj("12.ABC.345/01DE-36")).toBe(false);
  });
  it("DV alfanumérico precisa ser numérico", () => {
    expect(isValidCnpj("12ABC34501DEAB")).toBe(false);
  });
  it("normaliza e formata", () => {
    expect(normalizeCnpj("12.abc.345/01de-35")).toBe("12ABC34501DE35");
    expect(formatCnpj("11222333000181")).toBe("11.222.333/0001-81");
  });
});
