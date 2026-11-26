import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/modules/auth/session";
import { AppError } from "@/lib/errors";
import { db } from "@/lib/db";
import { ORDER_LABEL, priceTable, tableFilterSchema } from "@/modules/pricing/table";
import { PRICING_LABEL, formatMarkup } from "@/modules/pricing/markup";
import { buildPriceTablePdf } from "@/modules/pricing/table-pdf";
import { getSiteSettings } from "@/modules/companies/site-settings";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  try {
    const { user } = await requireAdmin("PRODUCTS");
    const sp = Object.fromEntries(req.nextUrl.searchParams);
    const f = tableFilterSchema.parse(sp);
    const mode = sp.modo === "interna" ? "interna" : "clientes";
    const photos = sp.fotos === "1";
    const priceFrom = sp.preco === "calculado" ? "calculado" : "site";
    const { rows, profiles, categories } = await priceTable(f);
    // tabela para clientes: só produtos ativos e não arquivados, com o preço escolhido (do site ou calculado pelo markup)
    const clientPrice = (r: (typeof rows)[number]) => (priceFrom === "calculado" ? r.calcCents : r.sitePriceCents);
    const active = rows.filter((r) => r.isActive && !r.archived);
    const list = mode === "clientes" ? active.filter((r) => clientPrice(r) != null).map((r) => ({ ...r, sitePriceCents: clientPrice(r) })) : rows;
    const left = mode === "clientes" ? active.length - list.length : 0;
    const emptyHint = mode !== "clientes" ? undefined : !active.length ? "Nenhum produto ativo com a busca e a categoria escolhidas." : priceFrom === "site"
      ? `${active.length} produto(s) ativo(s) estão sem preço no site. Na aba Tabela, use "Atualizar preço no site" ou gere o PDF com "Preço calculado pelo markup".`
      : `${active.length} produto(s) ativo(s) estão sem preço calculado (falta custo final ou markup). Cadastre o custo e escolha o markup na aba Tabela.`;
    const pname = new Map(profiles.map((p) => [p.id, p.name]));
    const settings = await getSiteSettings();
    const parts = [f.categoria ? categories.find((c) => c.slug === f.categoria)?.name : null, f.q ? `busca "${f.q}"` : null, f.situacao && mode === "interna" ? PRICING_LABEL[f.situacao] : null, f.ordem ? `ordem: ${ORDER_LABEL[f.ordem]}` : null].filter(Boolean);
    const origin = req.nextUrl.origin, cookie = req.headers.get("cookie") ?? "";
    const pdf = await buildPriceTablePdf(list.map((r) => ({
      code: r.code, name: r.name, category: r.category, description: r.description, image: r.image, costCents: r.costCents,
      profileName: r.profileId ? pname.get(r.profileId) ?? null : null, markupText: r.markup != null ? `Manual ${formatMarkup(r.markup)}x` : null,
      calcCents: r.calcCents, minCents: r.minCents, marginBps: r.marginBps, sitePriceCents: r.sitePriceCents, stateLabel: PRICING_LABEL[r.state],
    })), {
      mode, photos, brand: settings.brandName, subtitle: parts.join(" · "), generatedAt: new Date(), emptyHint,
      footNote: left > 0 ? `${left} produto(s) ativo(s) ficaram de fora por não terem ${priceFrom === "site" ? "preço no site" : "preço calculado"}.` : undefined,
      fetchImage: async (url) => {
        const abs = new URL(url, origin);
        const res = await fetch(abs, { headers: abs.origin === origin ? { cookie } : {}, signal: AbortSignal.timeout(8000) }).catch(() => null);
        return res?.ok ? new Uint8Array(await res.arrayBuffer()) : null;
      },
    });
    await db.auditLog.create({ data: { actorId: user.id, action: "price-table.pdf", entity: "PriceTable", entityId: mode, after: { products: list.length, photos, priceFrom, filters: f } } });
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
    return new NextResponse(Buffer.from(pdf), { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="tabela-precos-${mode}-${day}.pdf"`, "cache-control": "no-store" } });
  } catch (e) {
    if (e instanceof AppError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error(e);
    return NextResponse.json({ error: "Não foi possível gerar o PDF." }, { status: 500 });
  }
}
