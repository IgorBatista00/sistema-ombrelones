import { appUrl } from "@/lib/app-url";
/** SEO — funções puras (testáveis): URLs absolutas, títulos, descrições e dados estruturados. */

export const siteUrl = () => (appUrl()).replace(/\/+$/, "");
/** "/api/media/x.jpg" → "https://dominio/api/media/x.jpg" (dados estruturados exigem URL completa). */
export const absUrl = (u: string) => (/^https?:\/\//.test(u) ? u : `${siteUrl()}${u.startsWith("/") ? "" : "/"}${u}`);

/** Marca ainda não definida (placeholder) → não publicar dados de empresa. */
export const isPlaceholder = (s: string | null | undefined) => !s || /^\[.*\]$/.test(s.trim());

const ACRONYMS = new Set(["LED", "UV", "PVC", "ABS", "MDF", "PP", "PE", "PET", "XL", "XXL", "USB", "RGB", "UV50", "UPF", "NF", "CNPJ"]);
const SMALL = new Set(["de", "da", "do", "das", "dos", "e", "em", "com", "para", "por", "a", "o", "as", "os", "no", "na", "nos", "nas", "sem", "ou"]);
/**
 * Nome todo em MAIÚSCULAS → forma de título para a aba/Google ("OMBRELONE ELOS LED 3,00M BRANCO" → "Ombrelone Elos LED 3,00 m Branco").
 * Nomes que já têm minúsculas ficam como estão (o cadastro manda).
 */
export function displayTitle(name: string) {
  const t = name.trim().replace(/\s+/g, " ");
  if (/[a-zà-ÿ]/.test(t)) return t;
  return t.split(" ").map((w, i) => {
    if (ACRONYMS.has(w) || /^\[.*\]$/.test(w)) return w; // siglas e marcações como [TESTE] ficam como estão
    const m = w.match(/^(\d+(?:[.,]\d+)?)(M|CM|MM|KG|G|L)$/); // 3,00M → 3,00 m
    if (m) return `${m[1]} ${m[2].toLowerCase()}`;
    if (/\d/.test(w)) return w.toLowerCase();
    const lw = w.toLocaleLowerCase("pt-BR");
    if (i > 0 && SMALL.has(lw)) return lw;
    return lw.charAt(0).toLocaleUpperCase("pt-BR") + lw.slice(1);
  }).join(" ");
}

/** Corta no fim de palavra, sem quebrar no meio, com reticências. */
export function clip(text: string, max = 155) {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1); const i = cut.lastIndexOf(" ");
  return `${(i > max * 0.6 ? cut.slice(0, i) : cut).replace(/[\s,.;:–-]+$/, "")}…`;
}

/** Descrição do produto para o Google: SEO cadastrado → descrição → montada com dados reais do cadastro (nada inventado). */
export function productMetaDescription(p: { name: string; seoDescription?: string | null; description?: string | null; categoryName: string; color?: string | null; frameMaterial?: string | null }) {
  if (p.seoDescription?.trim()) return clip(p.seoDescription);
  if (p.description?.trim()) return clip(p.description);
  const bits = [p.color && `Cor ${displayTitle(p.color)}`, p.frameMaterial && `estrutura em ${p.frameMaterial.toLowerCase()}`].filter(Boolean).join(", ");
  return clip(`${displayTitle(p.name)} — ${p.categoryName}.${bits ? ` ${bits}.` : ""} Ficha técnica completa e preço de atacado para empresas com CNPJ.`);
}

export function categoryMetaDescription(c: { name: string; seoDescription?: string | null; description?: string | null }, total: number) {
  if (c.seoDescription?.trim()) return clip(c.seoDescription);
  if (c.description?.trim()) return clip(c.description);
  return clip(`${c.name}: ${total} ${total === 1 ? "produto" : "produtos"} no catálogo, com ficha técnica completa e preço de atacado para empresas com CNPJ.`);
}

export type Crumb = { name: string; path: string };
export const breadcrumbLd = (items: Crumb[]) => ({
  "@context": "https://schema.org", "@type": "BreadcrumbList",
  itemListElement: items.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: absUrl(c.path) })),
});

/** JSON seguro dentro de <script> (evita fechar a tag com "</"). */
export const ldJson = (data: unknown) => JSON.stringify(data).replace(/</g, "\\u003c");

/** Parâmetros que só filtram/ordenam: a página não deve ser indexada como nova. */
export const FILTER_PARAMS = ["q", "dimensao", "cor", "abertura", "disponibilidade", "ordem"] as const;
export const hasFilters = (sp: Record<string, unknown>) => FILTER_PARAMS.some((k) => sp[k] != null && sp[k] !== "");
