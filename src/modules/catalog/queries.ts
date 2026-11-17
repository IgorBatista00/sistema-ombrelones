import "server-only";
import type { OpeningType, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getUnitPrices } from "@/modules/pricing";
import { availabilityLabel, computeAvailability, type AvailabilityInfo } from "@/modules/inventory/availability";
import { getStockDisplay } from "@/modules/inventory/movements";

/**
 * DTOs públicos do catálogo. O campo `priceCents` só é preenchido quando o
 * chamador passa `canSeePrices = true` (derivado da sessão no servidor).
 * Para visitantes, o preço NÃO sai do servidor — nem no HTML, nem no JSON.
 */
export interface ProductCard {
  id: string;
  slug: string;
  name: string;
  sku: string;
  sizeLabel: string | null;
  category: { slug: string; name: string };
  image: { url: string; alt: string } | null;
  availability: AvailabilityInfo;
  /** Texto de estoque para o cliente (segue a configuração do painel) */
  stockLabel: string;
  priceCents: number | null;
}

export interface CatalogFilters {
  q?: string;
  category?: string;
  size?: string;
  color?: string;
  opening?: OpeningType;
  availability?: "in_stock" | "made_to_order";
  sort?: "name" | "price_asc" | "price_desc";
  page?: number;
}

export const PAGE_SIZE = 12;

const cardInclude = {
  category: { select: { slug: true, name: true } },
  images: { orderBy: { position: "asc" }, take: 1 },
  variants: {
    where: { isActive: true },
    orderBy: { position: "asc" },
    include: { stock: true },
  },
} satisfies Prisma.ProductInclude;

type ProductWithCard = Prisma.ProductGetPayload<{ include: typeof cardInclude }>;

function buildWhere(f: CatalogFilters): Prisma.ProductWhereInput {
  const and: Prisma.ProductWhereInput[] = [{ isActive: true, deletedAt: null, category: { isActive: true } }];
  if (f.q?.trim()) {
    const q = f.q.trim();
    and.push({ OR: [{ name: { contains: q, mode: "insensitive" } }, { variants: { some: { sku: { contains: q, mode: "insensitive" } } } }] });
  }
  if (f.category) and.push({ category: { slug: f.category } });
  if (f.opening) and.push({ openingType: f.opening });
  if (f.size) and.push({ variants: { some: { isActive: true, sizeLabel: f.size } } });
  if (f.color) and.push({ variants: { some: { isActive: true, color: f.color } } });
  if (f.availability === "made_to_order") and.push({ variants: { some: { isActive: true, availability: "MADE_TO_ORDER" } } });
  if (f.availability === "in_stock") and.push({ variants: { some: { isActive: true, availability: "STOCK" } } });
  return { AND: and };
}

async function toCards(products: ProductWithCard[], canSeePrices: boolean): Promise<ProductCard[]> {
  const mainVariants = products.map((p) => p.variants[0]).filter(Boolean);
  const prices = canSeePrices ? await getUnitPrices(mainVariants.map((v) => v.id)) : new Map<string, number>();
  const display = await getStockDisplay();
  return products
    .filter((p) => p.variants.length > 0)
    .map((p) => {
      const v = p.variants[0];
      return {
        id: p.id,
        slug: p.slug,
        name: p.name,
        sku: v.sku,
        sizeLabel: v.sizeLabel,
        category: p.category,
        image: p.images[0] ? { url: p.images[0].url, alt: p.images[0].alt } : null,
        availability: computeAvailability(v.availability, v.stock, v.leadTimeDays),
        stockLabel: availabilityLabel(computeAvailability(v.availability, v.stock, v.leadTimeDays), display),
        priceCents: canSeePrices ? prices.get(v.id) ?? null : null,
      };
    });
}

export async function listProducts(filters: CatalogFilters, canSeePrices: boolean) {
  const where = buildWhere(filters);
  const page = Math.max(1, filters.page ?? 1);
  const sortByPrice = canSeePrices && (filters.sort === "price_asc" || filters.sort === "price_desc");

  if (sortByPrice) {
    // Catálogo B2B tem centenas (não milhões) de itens: ordenar em memória é
    // simples e correto. Se crescer, materializar preço vigente em coluna.
    const all = await db.product.findMany({ where, include: cardInclude });
    const cards = await toCards(all, true);
    const dir = filters.sort === "price_asc" ? 1 : -1;
    cards.sort((a, b) => ((a.priceCents ?? Infinity) - (b.priceCents ?? Infinity)) * dir);
    return { items: cards.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), total: cards.length, page, pageSize: PAGE_SIZE };
  }

  const [total, products] = await Promise.all([
    db.product.count({ where }),
    db.product.findMany({ where, include: cardInclude, orderBy: { name: "asc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
  ]);
  return { items: await toCards(products, canSeePrices), total, page, pageSize: PAGE_SIZE };
}

export async function listFeatured(canSeePrices: boolean) {
  const products = await db.product.findMany({
    where: { isActive: true, deletedAt: null, isFeatured: true },
    include: cardInclude,
    orderBy: { updatedAt: "desc" },
    take: 8,
  });
  return toCards(products, canSeePrices);
}

export async function listCategories() {
  return db.category.findMany({ where: { isActive: true }, orderBy: { position: "asc" } });
}

/** Valores existentes para popular os filtros (nada inventado). */
export async function getFacets() {
  const variants = await db.productVariant.findMany({
    where: { isActive: true, product: { isActive: true, deletedAt: null } },
    select: { sizeLabel: true, color: true, product: { select: { openingType: true } } },
  });
  const uniq = <T,>(xs: (T | null | undefined)[]) => [...new Set(xs.filter((x): x is T => x != null))].sort();
  return {
    sizes: uniq(variants.map((v) => v.sizeLabel)),
    colors: uniq(variants.map((v) => v.color)),
    openings: uniq(variants.map((v) => v.product.openingType)),
  };
}

export async function getProductBySlug(slug: string, canSeePrices: boolean) {
  const product = await db.product.findFirst({
    where: { slug, isActive: true, deletedAt: null, category: { isActive: true } },
    include: {
      category: true,
      packages: { orderBy: { position: "asc" } },
      images: { orderBy: { position: "asc" } },
      variants: {
        where: { isActive: true },
        orderBy: { position: "asc" },
        include: { stock: true, packages: true },
      },
    },
  });
  if (!product) return null;
  const prices = canSeePrices ? await getUnitPrices(product.variants.map((v) => v.id)) : new Map<string, number>();
  const display = await getStockDisplay();

  const variants = product.variants.map((v) => ({
    id: v.id,
    sku: v.sku,
    name: v.name,
    color: v.color,
    finish: v.finish,
    sizeLabel: v.sizeLabel,
    saleUnit: v.saleUnit,
    availability: computeAvailability(v.availability, v.stock, v.leadTimeDays),
    stockLabel: availabilityLabel(computeAvailability(v.availability, v.stock, v.leadTimeDays), display),
    priceCents: canSeePrices ? prices.get(v.id) ?? null : null,
    packages: (v.packages.length ? v.packages : product.packages.map((p) => ({ ...p, weightG: p.weightG ?? 0 }))).map((p) => ({ label: p.label, lengthMm: p.lengthMm, widthMm: p.widthMm, heightMm: p.heightMm, weightG: p.weightG, quantity: p.quantity })),
    imageIds: product.images.filter((i) => i.variantId === v.id).map((i) => i.id),
  }));

  // Campos internos (custo, observações, código interno) NUNCA saem para a loja
  const { category, images, packages: _pk, costFinalCents: _c, costUpdatedAt: _cu, internalNotes: _n, ...rest } = product;
  return {
    ...rest,
    category: { slug: category.slug, name: category.name },
    images: images.map((i) => ({ id: i.id, url: i.url, alt: i.alt, variantId: i.variantId })),
    variants,
  };
}

export type ProductDetail = NonNullable<Awaited<ReturnType<typeof getProductBySlug>>>;

export async function listRelated(productId: string, categoryId: string, canSeePrices: boolean) {
  const products = await db.product.findMany({
    where: { isActive: true, deletedAt: null, id: { not: productId }, categoryId, category: { isActive: true } },
    include: cardInclude,
    take: 4,
  });
  return toCards(products, canSeePrices);
}
