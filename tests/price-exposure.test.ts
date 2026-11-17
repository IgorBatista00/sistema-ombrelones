import { describe, expect, it, vi } from "vitest";

/**
 * Garante que o catálogo NÃO consulta nem devolve preço para visitantes.
 * O banco é simulado; o teste verifica o contrato da camada de consulta.
 */
vi.mock("server-only", () => ({}));
const priceFindMany = vi.fn(async () => [{ variantId: "v1", amountCents: 12345, validFrom: new Date() }]);
vi.mock("@/lib/db", () => ({
  db: {
    product: {
      count: vi.fn(async () => 1),
      findMany: vi.fn(async () => [{
        id: "p1", slug: "p", name: "Produto", category: { slug: "c", name: "C" }, images: [],
        variants: [{ id: "v1", sku: "SKU1", sizeLabel: "3 m", availability: "STOCK", stock: { onHand: 1, reserved: 0 }, leadTimeDays: null }],
      }]),
    },
    price: { findMany: priceFindMany },
    setting: { findUnique: vi.fn(async () => null) },
  },
}));

describe("Proteção de preços", () => {
  it("visitante: priceCents = null e a tabela de preços não é lida", async () => {
    const { listProducts } = await import("@/modules/catalog/queries");
    priceFindMany.mockClear();
    const res = await listProducts({}, false);
    expect(res.items[0].priceCents).toBeNull();
    expect(JSON.stringify(res)).not.toContain("12345");
    expect(priceFindMany).not.toHaveBeenCalled();
  });
  it("visitante não consegue ordenar por preço", async () => {
    const { listProducts } = await import("@/modules/catalog/queries");
    priceFindMany.mockClear();
    await listProducts({ sort: "price_asc" }, false);
    expect(priceFindMany).not.toHaveBeenCalled();
  });
  it("empresa validada recebe o preço", async () => {
    const { listProducts } = await import("@/modules/catalog/queries");
    const res = await listProducts({}, true);
    expect(res.items[0].priceCents).toBe(12345);
  });
});
