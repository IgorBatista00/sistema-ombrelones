import { describe, expect, it } from "vitest";
import { absUrl, breadcrumbLd, clip, displayTitle, hasFilters, isPlaceholder, productMetaDescription } from "@/lib/seo";

describe("SEO", () => {
  it("título legível para nomes em maiúsculas", () => {
    expect(displayTitle("OMBRELONE ELOS LED 3,00M BRANCO")).toBe("Ombrelone Elos LED 3,00 m Branco");
    expect(displayTitle("BASE DE GRANITO 50KG")).toBe("Base de Granito 50 kg");
    expect(displayTitle("[EXEMPLO] BASE VILLA")).toBe("[EXEMPLO] Base Villa");
    expect(displayTitle("Ombrelone Central Lumière")).toBe("Ombrelone Central Lumière");
  });
  it("corta descrição sem quebrar palavra", () => {
    const d = clip("palavra ".repeat(40), 60);
    expect(d.length).toBeLessThanOrEqual(60); expect(d.endsWith("…")).toBe(true); expect(d).not.toMatch(/palav…$/);
  });
  it("descrição montada só com dados do cadastro", () => {
    expect(productMetaDescription({ name: "BASE VILLA", categoryName: "Bases e acessórios", color: "PRETO" })).toBe("Base Villa — Bases e acessórios. Cor Preto. Ficha técnica completa e preço de atacado para empresas com CNPJ.");
    expect(productMetaDescription({ name: "X", categoryName: "Y", seoDescription: "Minha descrição" })).toBe("Minha descrição");
  });
  it("URLs absolutas, trilha e filtros", () => {
    expect(absUrl("/api/media/a.jpg")).toMatch(/^https?:\/\/.+\/api\/media\/a\.jpg$/);
    expect(absUrl("https://cdn.x/a.jpg")).toBe("https://cdn.x/a.jpg");
    expect(breadcrumbLd([{ name: "Início", path: "/" }, { name: "Bases", path: "/categorias/bases" }]).itemListElement[1]).toMatchObject({ position: 2, name: "Bases" });
    expect(hasFilters({ pagina: 2 })).toBe(false); expect(hasFilters({ cor: "Areia" })).toBe(true);
    expect(isPlaceholder("[NOME DA MARCA]")).toBe(true); expect(isPlaceholder("Sombra Brasil")).toBe(false);
  });
});
