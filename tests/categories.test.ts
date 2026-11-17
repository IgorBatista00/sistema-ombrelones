import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: {} }));
import { slugify } from "@/modules/products/categories";
describe("slugify", () => {
  it("gera endereço sem acento e com hífen", () => {
    expect(slugify("Ombrelones com LED")).toBe("ombrelones-com-led");
    expect(slugify("  Bases & Acessórios / Capas ")).toBe("bases-acessorios-capas");
    expect(slugify("!!!")).toBe("categoria");
  });
});
