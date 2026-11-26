import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: {} }));
import { compareNatural, sortRows } from "@/modules/pricing/table";

const r = (name: string, category = "Ombrelones", calcCents: number | null = null, code: string | null = null) => ({ name, category, calcCents, costCents: calcCents, code });

describe("ordenação da tabela", () => {
  it("medidas ficam em sequência numérica", () => {
    const names = ["OMBRELONE VILLA 2,70M BRANCO", "OMBRELONE VILLA 2,00M BRANCO", "OMBRELONE VILLA 2,40M PRETO", "OMBRELONE VILLA 2,40M AZUL", "OMBRELONE VILLA 10,00M", "OMBRELONE VILLA 3,5M", "OMBRELONE VILLA 3,00M"];
    expect([...names].sort(compareNatural)).toEqual(["OMBRELONE VILLA 2,00M BRANCO", "OMBRELONE VILLA 2,40M AZUL", "OMBRELONE VILLA 2,40M PRETO", "OMBRELONE VILLA 2,70M BRANCO", "OMBRELONE VILLA 3,00M", "OMBRELONE VILLA 3,5M", "OMBRELONE VILLA 10,00M"]);
  });
  it("categoria, depois produto e medida", () => {
    const rows = [r("CAPA ELOS 3,00M", "Bases e acessórios"), r("ELOS 3,50M", "Ombrelones"), r("CAPA ELOS 2,70M", "Bases e acessórios"), r("ELOS 3,00M", "Ombrelones")];
    expect(sortRows(rows, "linha").map((x) => x.name)).toEqual(["CAPA ELOS 2,70M", "CAPA ELOS 3,00M", "ELOS 3,00M", "ELOS 3,50M"]);
  });
  it("preço sem valor vai para o fim", () => {
    expect(sortRows([r("A", "x", null), r("B", "x", 500), r("C", "x", 100)], "preco").map((x) => x.name)).toEqual(["C", "B", "A"]);
  });
});
