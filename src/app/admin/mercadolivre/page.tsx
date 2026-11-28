import Link from "next/link";
import { requireAdminPage } from "@/modules/auth/session";
import { formatBRL } from "@/lib/money";
import { PageHead } from "@/components/admin/ui";
import { Badge } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { MlSheetImportButton } from "@/components/admin/ml-sheet-import";
import { MlListingImportButton } from "@/components/admin/ml-listing-import";
import { MlDashboardView } from "@/components/admin/ml-dashboard";
import { mlDashboard } from "@/modules/mercadolivre/dashboard";
import { mlSaleCheck } from "@/modules/mercadolivre/sale-check";
import { COST_LABEL, LEVEL_LABEL, SALE_ISSUES, type SaleIssue } from "@/modules/mercadolivre/sale-check-rules";
import { ApplyStockButton, DeleteListingButton, ListingButton, OwnPrefixesForm, RecalcCostsButton, SaleOwnerButton, ShipButton, ShipQueueSelect, StockFromForm } from "@/components/admin/ml";
import { emptyListing, listingInitFrom } from "@/modules/mercadolivre/listing-form";
import { listingFormOptions, mlFilterSchema, mlListingsByProduct, mlListingsView, mlPeriod, mlProfitByListing, mlSalesView, mlShippingQueue } from "@/modules/mercadolivre/service";
import { SHIP_STAGE, fmtPct } from "@/modules/mercadolivre/rules";
import { spDay } from "@/modules/purchase-orders/rules";

export const metadata = { title: "Mercado Livre" };
const d = (x: Date | null) => (x ? x.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—");
const dt = (x: Date) => x.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const pct = (bps: number | null) => (bps == null ? "—" : `${(bps / 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);
const money = (c: number) => <span className={c < 0 ? "text-danger" : ""}>{formatBRL(c)}</span>;

export default async function MercadoLivrePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { admin } = await requireAdminPage(["ORDERS", "FINANCE", "LOGISTICS"]);
  const has = (p: string) => admin.permissions.includes(p as never);
  const can = { profit: has("FINANCE") || has("PRODUCTS"), ship: has("LOGISTICS") || has("ORDERS"), stock: has("STOCK"), imp: has("FINANCE") || has("ORDERS") };
  const f = mlFilterSchema.parse(await searchParams);
  const tabs = ([["painel", "Painel"], ["vendas", "Vendas"], ["enviar", "A enviar"], ["anuncios", "Anúncios"], ["produtos", "Anúncios por produto"], ["validacao", "Validação das vendas"], ["lucro", "Lucro por anúncio"]] as const).filter(([k]) => (k === "anuncios" || k === "produtos" || k === "validacao" || k === "lucro" || k === "painel" ? can.profit : true));
  const aba = tabs.some(([k]) => k === f.aba) ? f.aba! : !has("ORDERS") && !has("FINANCE") ? "enviar" : can.profit ? "painel" : "vendas";
  const { de, ate } = mlPeriod(f);
  const qs = (patch: Record<string, string | undefined>) => { const p = new URLSearchParams(); for (const [k, v] of Object.entries({ ...f, ...patch })) if (v) p.set(k, v); return `/admin/mercadolivre?${p}`; };
  const variants = can.profit && (aba === "anuncios" || aba === "lucro" || aba === "vendas" || aba === "validacao") ? await listingFormOptions() : [];

  const period = (
    <form className="card mb-5 flex flex-wrap items-end gap-3 p-4" role="search">
      <input type="hidden" name="aba" value={aba} />
      <fieldset className="text-xs text-muted"><legend>Período da venda</legend><div className="mt-1 flex items-center gap-1.5"><Input type="date" name="de" defaultValue={de} className="h-10 w-[150px]" aria-label="De" /><span>até</span><Input type="date" name="ate" defaultValue={ate} className="h-10 w-[150px]" aria-label="Até" /></div></fieldset>
      {aba === "vendas" && <>
        <label className="block min-w-[200px] flex-1 text-xs text-muted">Buscar<Input name="q" defaultValue={f.q} placeholder="Nº da venda, comprador, anúncio, MLB ou SKU" className="mt-1 h-10" /></label>
        <label className="block text-xs text-muted">Envio<Select name="envio" defaultValue={f.envio ?? ""} className="mt-1 h-10"><option value="">Todos</option>{(["a_enviar", "enviada", "entregue", "problema", "cancelada", "outra"] as const).map((k) => <option key={k} value={k}>{SHIP_STAGE[k].label}</option>)}</Select></label>
        <label className="block text-xs text-muted">Anúncio<Select name="vinculo" defaultValue={f.vinculo ?? ""} className="mt-1 h-10"><option value="">Todos</option><option value="sem">Sem anúncio cadastrado</option><option value="com">Com anúncio cadastrado</option></Select></label>
      </>}
      <Button type="submit" className="h-10">Filtrar</Button>
      {aba === "painel" && (() => {
        const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
        const back = (n: number) => new Date(Date.parse(`${today}T12:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);
        const pm = new Date(Date.parse(`${today.slice(0, 8)}01T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
        const opts: [string, string, string][] = [["Mês atual", `${today.slice(0, 8)}01`, today], ["Mês anterior", `${pm.slice(0, 8)}01`, pm], ["Últimos 30 dias", back(29), today], ["Últimos 90 dias", back(89), today], ["Este ano", `${today.slice(0, 4)}-01-01`, today]];
        return <div className="flex flex-wrap gap-1 pb-1 text-xs" data-quick-period>{opts.map(([l, a, b]) => <Link key={l} href={qs({ aba: "painel", de: a, ate: b })} className={`rounded px-3 py-1.5 ${de === a && ate === b ? "bg-ink text-canvas" : "hover:bg-ink/5"}`}>{l}</Link>)}</div>;
      })()}
    </form>
  );

  return (
    <>
      <PageHead title="Mercado Livre" subtitle={can.profit ? "Vendas, expedição, anúncios e lucro. As vendas entram pela planilha exportada do Mercado Livre." : "Vendas e expedição. As vendas entram pela planilha exportada do Mercado Livre."} action={can.imp ? <MlSheetImportButton /> : undefined} />
      <nav className="mb-5 flex gap-1 overflow-x-auto border-b border-line" aria-label="Visão">
        {tabs.map(([k, l]) => <Link key={k} href={qs({ aba: k, envio: undefined, q: undefined, vinculo: undefined, anuncio: undefined, produto: undefined, tipo: undefined, sev: undefined, problema: undefined })} aria-current={aba === k ? "page" : undefined} className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-sm ${aba === k ? "border-ink font-medium" : "border-transparent text-muted hover:text-ink"}`}>{l}</Link>)}
      </nav>
      {aba === "painel" && <>{period}<MlDashboardView d={await mlDashboard(f)} qs={qs} /></>}
      {aba === "vendas" && <Sales f={f} period={period} can={can} />}
      {aba === "enviar" && <ToShip can={can} />}
      {aba === "anuncios" && <Listings f={f} period={period} variants={variants} can={can} qs={qs} />}
      {aba === "produtos" && <ByProduct f={f} period={period} qs={qs} />}
      {aba === "validacao" && <SaleCheck f={f} qs={qs} variants={variants} />}
      {aba === "lucro" && <Profit f={f} period={period} />}
    </>
  );
}

type Can = { profit: boolean; ship: boolean; stock: boolean; imp: boolean };

async function Sales({ f, period, can }: { f: Parameters<typeof mlSalesView>[0]; period: React.ReactNode; can: Can }) {
  const { rows, summary: s, stockFrom, pendingStock } = await mlSalesView(f);
  const cards: [string, React.ReactNode, string?][] = [
    ["Vendas", s.orders, s.cancelled ? `${s.cancelled} cancelada(s)` : undefined], ["Unidades", s.units], ["Faturamento (produtos)", formatBRL(s.product)],
    ...(can.profit ? ([["Tarifas e fretes ML", formatBRL(s.fees)], ["Custo dos produtos", formatBRL(s.cost), s.costMissing ? `${s.costMissing} venda(s) sem custo` : undefined], ["Lucro", money(s.profit), `margem ${pct(s.marginBps)}`]] as [string, React.ReactNode, string?][]) : []),
    ["A enviar", s.toShip, s.problems ? `${s.problems} com atenção` : undefined],
  ];
  return (
    <>
      {period}
      <div className="mb-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-7">{cards.map(([l, v, h]) => <div key={l} className="card p-4"><p className="label">{l}</p><p className="mt-1 text-lg font-medium">{v}</p>{h && <p className="text-xs text-muted">{h}</p>}</div>)}</div>
      {(s.unlinked > 0 || s.estimated > 0) && can.profit && (
        <p className="card mb-4 border-l-4 p-3 text-sm">
          {s.unlinked > 0 && <>{s.unlinked} venda(s) de anúncios ainda não cadastrados: sem custo nem baixa de estoque. <Link className="link" href="/admin/mercadolivre?aba=anuncios">Cadastrar anúncios</Link>. </>}
          {s.estimated > 0 && <>{s.estimated} venda(s) com tarifa/frete estimados pelo cadastro do anúncio (a planilha não trouxe).</>}
        </p>
      )}
      {can.stock && stockFrom && pendingStock > 0 && <div className="mb-4"><ApplyStockButton pending={pendingStock} /></div>}
      {rows.length === 0 && <p className="card p-8 text-center text-sm text-muted">Nenhuma venda no período. Importe a planilha em “Importar planilha do Mercado Livre”.</p>}
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.orderId} className={`card grid gap-3 p-4 text-sm lg:grid-cols-[1fr_1.6fr_auto] ${r.cancelled ? "opacity-60" : ""}`} data-ml-order={r.orderId}>
            <div>
              <div className="flex flex-wrap items-center gap-2"><span className="font-medium">Venda {r.orderId}</span><Badge tone={r.stageTone}>{r.stageLabel}</Badge></div>
              <p className="text-xs text-muted">{dt(r.saleDate)}{r.buyer ? ` · ${r.buyer}` : ""}</p>
              <p className="mt-1 text-xs text-muted">{r.statusText}</p>
              {r.shipBy && r.stage === "a_enviar" && <p className="text-xs">Despachar até {d(r.shipBy)}</p>}
            </div>
            <ul className="space-y-1 text-xs">{r.lines.map((l) => (
              <li key={l.id}>
                <span className="font-medium">{l.quantity}×</span> {l.title} <span className="text-muted">({l.itemId}{l.sku ? ` · SKU ${l.sku}` : ""})</span>
                {!l.listingId && <Badge tone="warning">sem anúncio cadastrado</Badge>}
              </li>))}
            </ul>
            <div className="text-right text-xs">
              <p className="text-sm font-medium">{formatBRL(r.product)}</p>
              {can.profit && !r.cancelled && <>
                <p className="text-muted">ML: −{formatBRL(r.fees + r.shipping)}{r.estimated ? " (est.)" : ""} · custo: {r.costMissing ? "?" : `−${formatBRL(r.cost)}`}</p>
                <p>Lucro {r.costMissing ? <span className="text-warning">sem custo</span> : <>{money(r.profit)} <span className="text-muted">({pct(r.marginBps)})</span></>}</p>
              </>}
              {r.linked && !r.cancelled && (r.stocked ? <p className="text-muted">Estoque baixado</p> : stockFrom && spDay(r.saleDate) >= stockFrom ? <p className="text-warning">Estoque não baixado</p> : null)}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

async function ToShip({ can }: { can: Can }) {
  const q = await mlShippingQueue();
  return (
    <>
      <p className="mb-4 text-sm text-muted">Vendas com status “a enviar” na última planilha importada (até 60 dias). Ao despachar, marque aqui: a venda sai desta lista mesmo antes da próxima planilha.</p>
      {q.length === 0 ? <p className="card p-8 text-center text-sm text-muted">Nada a enviar. 🎉</p> : (
        <>
          {can.ship && <ShipQueueSelect ids={q.map((r) => r.orderId)} />}
          <ul className="space-y-2">
            {q.map((r) => (
              <li key={r.orderId} className={`card grid gap-3 p-4 text-sm md:grid-cols-[auto_1fr_1.4fr_auto] ${r.late ? "border-l-4 border-l-[#a24a3a]" : ""}`} data-ml-ship-row={r.orderId}>
                {can.ship ? <input type="checkbox" className="mt-1" value={r.orderId} data-ship-sel aria-label={`Selecionar venda ${r.orderId}`} /> : <span />}
                <div>
                  <p className="font-medium">Venda {r.orderId}</p>
                  <p className="text-xs text-muted">Vendida em {d(r.saleDate)} · há {r.ageDays} dia(s){r.buyer ? ` · ${r.buyer}` : ""}</p>
                  {r.shipBy ? <p className={`text-xs ${r.late ? "font-medium text-danger" : r.dueToday ? "font-medium text-warning" : ""}`}>{r.late ? "Prazo de despacho vencido" : r.dueToday ? "Despachar hoje" : "Despachar até"} · {d(r.shipBy)}</p> : <p className="text-xs text-muted">Prazo de despacho: veja no Mercado Livre (a planilha não trouxe)</p>}
                </div>
                <div className="text-xs"><p className="label">Separar</p><ul className="mt-1 space-y-0.5">{r.pick.map((p, i) => <li key={i}><span className="font-medium">{p.quantity}×</span> {p.sku} · {p.name}</li>)}</ul></div>
                <div className="flex items-start justify-end">{can.ship && <ShipButton orderIds={[r.orderId]} shipped label="Despachada" />}</div>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

type Qs = (patch: Record<string, string | undefined>) => string;
/** Foto(s) do produto ligado ao anúncio (kit: até 3 sobrepostas). */
function Thumbs({ items, size = 52 }: { items: { image: string | null; name: string }[]; size?: number }) {
  if (!items.length) return <div className="grid place-items-center rounded border border-dashed border-line text-[10px] text-muted" style={{ width: size, height: size }}>sem produto</div>;
  const shown = items.slice(0, 3);
  return (
    <div className="relative" style={{ width: size + (shown.length - 1) * 14, height: size }} data-thumbs>
      {shown.map((c, i) => (
        <div key={i} className="absolute top-0 overflow-hidden rounded border border-line bg-white shadow-sm" style={{ left: i * 14, width: size, height: size, zIndex: 10 - i }} title={c.name}>
          {c.image ? <img src={c.image} alt={c.name} className="h-full w-full object-contain p-0.5" loading="lazy" /> : <span className="grid h-full place-items-center text-[9px] text-muted">sem foto</span>}
        </div>
      ))}
      {items.length > 3 && <span className="absolute -bottom-1 -right-1 z-20 rounded bg-ink px-1 text-[10px] text-canvas">+{items.length - 3}</span>}
    </div>
  );
}

async function Listings({ f, period, variants, can, qs }: { f: Parameters<typeof mlListingsView>[0]; period: React.ReactNode; variants: Awaited<ReturnType<typeof listingFormOptions>>; can: Can; qs: Qs }) {
  const v = await mlListingsView(f);
  const prodName = f.produto && f.produto !== "sem" ? v.listings.flatMap((l) => l.components).find((c) => c.variantId === f.produto) : null;
  return (
    <>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <p className="max-w-2xl text-sm text-muted">Cadastre cada anúncio com os produtos que ele vende (inclusive kits) e os custos de venda. As vendas são ligadas sozinhas pelo nº do anúncio (MLB), pela variação ou pelo SKU.</p>
        <div className="flex flex-wrap gap-2"><MlListingImportButton /><ListingButton label="Cadastrar anúncio" initial={emptyListing()} variants={variants} /></div>
      </div>
      {can.stock && (
        <div className="card mb-5 p-4 text-sm">
          <p className="font-medium">Baixa automática de estoque</p>
          <p className="mb-3 text-xs text-muted">Cada venda importada de um anúncio cadastrado tira os produtos do estoque e uma venda cancelada devolve. Reimportar a planilha não baixa de novo. Escolha a data a partir da qual vale, para não descontar de novo vendas antigas que o estoque já reflete.</p>
          <StockFromForm current={v.stockFrom} />
          {!v.stockFrom && <p className="mt-2 text-xs text-warning">Desligada: as vendas não estão mexendo no estoque.</p>}
        </div>
      )}
      {period}
      <form className="card mb-4 flex flex-wrap items-end gap-3 p-4 text-xs text-muted" role="search" data-listing-filter>
        <input type="hidden" name="aba" value="anuncios" />{f.de && <input type="hidden" name="de" value={f.de} />}{f.ate && <input type="hidden" name="ate" value={f.ate} />}{f.produto && <input type="hidden" name="produto" value={f.produto} />}
        <label className="block">Buscar<Input name="q" defaultValue={f.q ?? ""} placeholder="Título, MLB, SKU ou produto" className="mt-1 h-10 w-72" /></label>
        <label className="block">Tipo<select name="tipo" defaultValue={f.tipo ?? ""} className="mt-1 h-10 rounded border border-line bg-white px-2 text-sm text-ink"><option value="">Todos</option><option value="classico">Clássico</option><option value="premium">Premium</option></select></label>
        <Button type="submit" variant="secondary" className="h-10">Filtrar</Button>
        {(f.q || f.tipo || f.produto) && <Link className="link pb-2.5" href={qs({ q: undefined, tipo: undefined, produto: undefined })}>Limpar filtros</Link>}
        {f.produto && <span className="w-full text-sm text-ink" data-produto-chip>Mostrando os anúncios de: <b className="font-medium">{f.produto === "sem" ? "anúncios sem produto ligado" : prodName ? `${prodName.sku} · ${prodName.name}` : "produto selecionado"}</b> ({v.listings.length})</span>}
      </form>
      <div className="card overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-[11px] uppercase tracking-label text-muted"><tr>{["Foto", "Anúncio", "Produtos", "Preço", "Custos de venda", "Custo produtos", "Lucro/unid.", "Vendidas", ""].map((h) => <th key={h} className="whitespace-nowrap px-4 py-3 font-normal">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-line">{v.listings.map((l) => (
            <tr key={l.id} className={l.status !== "ATIVO" ? "text-muted" : ""} data-ml-listing-row={l.mlItemId ?? l.sku ?? l.id}>
              <td className="px-4 py-3"><Thumbs items={l.components.map((c) => ({ image: c.image, name: c.name }))} /></td>
              <td className="min-w-64 px-4 py-3"><p className="font-medium">{l.title}</p><p className="text-xs text-muted">{[l.mlItemId, l.variation, l.listingType === "premium" ? "Premium" : l.listingType === "classico" ? "Clássico" : null].filter(Boolean).join(" · ")}{l.status !== "ATIVO" ? ` · ${l.status === "PAUSADO" ? "Pausado" : "Encerrado"}` : ""}</p></td>
              <td className="whitespace-nowrap px-4 py-3 text-xs">{l.components.length ? l.components.map((c) => <p key={c.variantId}><Link className="hover:underline" href={qs({ aba: "anuncios", produto: c.variantId, q: undefined })} title={`Ver todos os anúncios de ${c.name}`}>{c.quantity}× {c.sku}</Link>{c.mto ? " (encomenda)" : ""}</p>) : <span className="text-warning">nenhum produto</span>}</td>
              <td className="whitespace-nowrap px-4 py-3">{l.priceCents != null ? formatBRL(l.priceCents) : "—"}</td>
              <td className="px-4 py-3 text-xs">{[l.saleFeeBps != null && `tarifa ${fmtPct(l.saleFeeBps)}%`, l.fixedFeeCents && `fixa ${formatBRL(l.fixedFeeCents)}`, l.shippingCostCents && `frete ${formatBRL(l.shippingCostCents)}`, l.packagingCents && `embal. ${formatBRL(l.packagingCents)}`, l.taxBps != null && `imposto ${fmtPct(l.taxBps)}%`, l.otherCostCents && `outros ${formatBRL(l.otherCostCents)}`].filter(Boolean).join(" · ") || "—"}</td>
              <td className="whitespace-nowrap px-4 py-3">{l.costMissing ? <span className="text-warning">falta custo</span> : formatBRL(l.unitCostCents ?? 0)}</td>
              <td className="whitespace-nowrap px-4 py-3">{l.simulation && !l.simulation.costMissing ? <>{money(l.simulation.profit)} <span className="text-xs text-muted">({pct(l.simulation.marginBps)})</span></> : "—"}</td>
              <td className="px-4 py-3">{l.soldUnits}</td>
              <td className="px-4 py-3 text-right"><div className="flex flex-col items-end gap-1"><ListingButton label="Editar" variant="secondary" initial={listingInitFrom(l)} variants={variants} /><DeleteListingButton id={l.id} title={l.title} /></div></td>
            </tr>))}</tbody>
        </table>
        {v.listings.length === 0 && <p className="p-8 text-center text-sm text-muted">{f.q || f.tipo || f.produto ? "Nenhum anúncio com esses filtros." : "Nenhum anúncio cadastrado ainda."}</p>}
      </div>
      {v.unlinked.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 font-sans text-base font-medium">Vendidos e ainda sem cadastro</h2>
          <p className="mb-3 text-xs text-muted">Anúncios que aparecem nas vendas importadas mas não estão cadastrados. Cadastre para ter custo, lucro e baixa de estoque.</p>
          <div className="card overflow-x-auto"><table className="w-full text-left text-sm">
            <thead className="border-b border-line text-[11px] uppercase tracking-label text-muted"><tr>{["Anúncio", "Unidades vendidas", "Última venda", ""].map((h) => <th key={h} className="px-4 py-3 font-normal">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-line">{v.unlinked.slice(0, 50).map((u) => (
              <tr key={`${u.itemId}|${u.variation}`} data-ml-unlinked={u.itemId}>
                <td className="px-4 py-3"><p>{u.title}</p><p className="text-xs text-muted">{u.itemId}{u.variation ? ` · ${u.variation}` : ""}{u.sku ? ` · SKU ${u.sku}` : ""}</p></td>
                <td className="px-4 py-3">{u.units}</td><td className="px-4 py-3">{d(u.lastSale)}</td>
                <td className="px-4 py-3 text-right"><ListingButton label="Cadastrar" variant="secondary" variants={variants} initial={emptyListing({ mlItemId: /^[A-Z]{3}\d+$/.test(u.itemId) ? u.itemId : "", variation: u.variation, sku: u.sku ?? "", title: u.title.replace(/ — .*$/, ""), price: u.lastPriceCents != null ? (u.lastPriceCents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "" })} /></td>
              </tr>))}</tbody>
          </table></div>
        </section>
      )}
    </>
  );
}

const LEVEL_STYLE = { critico: { cls: "text-danger", bg: "bg-danger/10 border-danger/30", icon: "✕", dot: "bg-danger" }, aviso: { cls: "text-warning", bg: "bg-warning/10 border-warning/30", icon: "!", dot: "bg-warning" }, info: { cls: "text-muted", bg: "bg-ink/[0.04] border-line", icon: "i", dot: "bg-ink/30" }, ok: { cls: "text-success", bg: "bg-success/10 border-success/30", icon: "✓", dot: "bg-success" } } as const;
function LevelBadge({ level, cancelled }: { level: keyof typeof LEVEL_STYLE; cancelled?: boolean }) {
  const s = LEVEL_STYLE[level];
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded border px-2 py-0.5 text-xs font-medium ${s.bg} ${s.cls}`}><span aria-hidden className="grid h-3.5 w-3.5 place-items-center rounded-full border border-current text-[9px] leading-none">{s.icon}</span>{level === "ok" && cancelled ? "Cancelada" : LEVEL_LABEL[level]}</span>;
}

async function SaleCheck({ f, qs, variants }: { f: Parameters<typeof mlSaleCheck>[0]; qs: Qs; variants: Awaited<ReturnType<typeof listingFormOptions>> }) {
  const { summary: s, list } = await mlSaleCheck(f);
  const pctOk = s.active ? Math.round((s.ok / s.active) * 100) : 100;
  const diff = s.mlNet - s.columnsNet;
  const chip = (patch: Record<string, string | undefined>, label: React.ReactNode, active: boolean, key: string) => <Link key={key} href={qs({ aba: "validacao", ...patch })} className={`rounded border px-3 py-1.5 text-xs ${active ? "border-ink bg-ink text-canvas" : "border-line bg-white hover:border-ink/50"}`}>{label}</Link>;
  return (
    <>
      <p className="mb-4 max-w-3xl text-sm text-muted">Confere cada venda importada da planilha do Mercado Livre: se está ligada a um anúncio e tem custo, se as tarifas vieram e se a soma das colunas bate com o <b className="font-medium text-ink">Total</b> que o ML informa. <b className="font-medium text-ink">Crítico</b> deixa o lucro errado; <b className="font-medium text-ink">Atenção</b> merece conferência.</p>
      <form className="card mb-4 flex flex-wrap items-end gap-3 p-4" role="search">
        <input type="hidden" name="aba" value="validacao" />{f.sev && <input type="hidden" name="sev" value={f.sev} />}{f.problema && <input type="hidden" name="problema" value={f.problema} />}
        <fieldset className="text-xs text-muted"><legend>Período da venda (em branco = todas)</legend><div className="mt-1 flex items-center gap-1.5"><Input type="date" name="de" defaultValue={f.de ?? ""} className="h-10 w-[150px]" aria-label="De" /><span>até</span><Input type="date" name="ate" defaultValue={f.ate ?? ""} className="h-10 w-[150px]" aria-label="Até" /></div></fieldset>
        <label className="block min-w-[220px] flex-1 text-xs text-muted">Buscar<Input name="q" defaultValue={f.q ?? ""} placeholder="Nº da venda, anúncio, MLB ou SKU" className="mt-1 h-10" /></label>
        <Button type="submit" className="h-10">Filtrar</Button>
        {(f.de || f.ate || f.q) && <Link href={qs({ aba: "validacao", de: undefined, ate: undefined, q: undefined })} className="pb-2 text-xs underline">Limpar</Link>}
      </form>
      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4" data-check-summary>
        <div className="card p-4"><p className="label">Vendas conferidas</p><p className={`mt-2 text-3xl ${pctOk >= 90 ? "text-success" : pctOk >= 60 ? "text-warning" : "text-danger"}`}>{pctOk}%</p><p className="mt-1 text-xs text-muted">{s.ok} de {s.active} vendas válidas sem crítico nem atenção · {s.cancelled} cancelada(s)</p></div>
        <div className="card p-4"><p className="label">Críticas</p><p className={`mt-2 text-3xl ${s.critico ? "text-danger" : ""}`}>{s.critico}</p><p className="mt-1 text-xs text-muted">{s.noCostUnits ? `${s.noCostUnits} un. sem custo · ${formatBRL(s.noCostRevenue)} faturados sem custo` : "nenhuma venda sem custo"}</p></div>
        <div className="card p-4"><p className="label">Atenção</p><p className={`mt-2 text-3xl ${s.aviso ? "text-warning" : ""}`}>{s.aviso}</p><p className="mt-1 text-xs text-muted">{s.cancelledValue ? `canceladas com ${formatBRL(s.cancelledValue)} lançados pelo ML` : "valores para conferir"}</p></div>
        <div className="card p-4" data-check-total><p className="label">Conferência com o Total do ML</p><p className={`mt-2 text-3xl ${Math.abs(diff) >= 200 ? "text-danger" : "text-success"}`}>{diff === 0 ? "Bate" : formatBRL(diff)}</p><p className="mt-1 text-xs text-muted">ML informa {formatBRL(s.mlNet)} líquido; as colunas somam {formatBRL(s.columnsNet)} ({s.withTotal} vendas válidas com Total)</p></div>
      </div>
      <div className="card mb-4 p-4" data-check-costs>
        <div className="flex flex-wrap items-baseline justify-between gap-2"><p className="font-medium">Custos contabilizados nas vendas</p><p className="text-sm"><b className={`font-medium ${s.allCosts === s.active ? "text-success" : "text-danger"}`}>{s.allCosts} de {s.active}</b> <span className="text-muted">vendas válidas com os 4 custos</span></p></div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{s.costs.map((c) => (
          <Link key={c.key} href={qs({ aba: "validacao", sev: undefined, problema: c.key === "tarifa" ? "sem_tarifa" : c.key === "frete" ? "sem_frete" : c.key === "imposto" ? "sem_imposto" : "sem_custo" })} className="rounded border border-line p-3 hover:border-ink/50" data-cost={c.key}>
            <p className="label">{COST_LABEL[c.key]}</p>
            <p className={`mt-1 text-2xl ${c.missing || c.estimated ? "text-danger" : "text-success"}`}>{c.ok}<span className="text-sm text-muted">/{s.active}</span></p>
            <p className="text-xs text-muted">{c.missing ? `${c.missing} sem ${COST_LABEL[c.key].toLowerCase()}` : "todas contabilizadas"}{c.estimated ? ` · ${c.estimated} estimada(s) pelo anúncio` : ""}</p>
          </Link>))}</div>
        <p className="mt-2 text-xs text-muted">Mercadoria e imposto vêm do anúncio cadastrado: venda sem anúncio fica sem os dois (o filtro mostra “sem anúncio” separado). Frete “de pacote”: o ML cobra o frete numa das vendas do mesmo pacote.</p>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-3"><RecalcCostsButton /><span className="text-xs text-muted">Use depois de cadastrar anúncios ou custos de produtos: as vendas que estavam sem custo passam a ter.</span></div>
      <div className="card mb-4 flex flex-wrap items-start justify-between gap-4 p-4" data-foreign-box>
        <div className="min-w-64 flex-1"><p className="font-medium">Vendas de outra empresa na mesma conta</p><p className="mt-1 text-xs text-muted">{s.foreign ? <>{s.foreign} venda(s) com SKU de outra empresa ({formatBRL(s.foreignRevenue)}) ficam guardadas, mas fora do faturamento, lucro, caixa, estoque, A enviar e Financeiro. <Link className="link" href={qs({ aba: "validacao", sev: "outras", problema: undefined })}>Ver a lista</Link></> : "Nenhuma venda de outra empresa nas planilhas importadas."}</p></div>
        <OwnPrefixesForm initial={s.prefixes} />
      </div>
      <div className="card mb-4 p-4" data-check-filters>
        <p className="mb-2 text-xs text-muted">Filtrar por nível</p>
        <div className="flex flex-wrap gap-2">{chip({ sev: undefined, problema: undefined }, `Todas (${s.total})`, !f.sev && !f.problema, "t")}{chip({ sev: "critico", problema: undefined }, `Crítico (${s.critico})`, f.sev === "critico", "c")}{chip({ sev: "aviso", problema: undefined }, `Atenção (${s.aviso})`, f.sev === "aviso", "a")}{chip({ sev: "ok", problema: undefined }, `Conferidas (${s.ok})`, f.sev === "ok", "o")}{chip({ sev: "canceladas", problema: undefined }, `Canceladas (${s.cancelled})`, f.sev === "canceladas", "x")}{chip({ sev: "outras", problema: undefined }, `De outra empresa (${s.foreign})`, f.sev === "outras", "f")}</div>
        {s.byIssue.length > 0 && <><p className="mb-2 mt-4 text-xs text-muted">Filtrar pelo problema</p>
        <div className="flex flex-wrap gap-2">{s.byIssue.map((i) => chip({ problema: i.code, sev: undefined }, <span className="inline-flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${LEVEL_STYLE[i.level].dot}`} />{i.label} ({i.count})</span>, f.problema === i.code, i.code))}</div></>}
      </div>
      {f.problema && SALE_ISSUES[f.problema as SaleIssue] && <p className="mb-3 rounded border border-line bg-white px-4 py-2 text-sm"><b className="font-medium">{SALE_ISSUES[f.problema as SaleIssue].label}:</b> {SALE_ISSUES[f.problema as SaleIssue].fix}</p>}
      <div className="card overflow-x-auto" data-check-table>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-[11px] uppercase tracking-label text-muted"><tr>{["Venda", "Anúncio", "Custos", "Valores", "Nível", "O que conferir", ""].map((h) => <th key={h} className="whitespace-nowrap px-4 py-3 font-normal">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-line">{list.map((r) => (
            <tr key={r.id} data-check-row={r.orderId} className="align-top">
              <td className="whitespace-nowrap px-4 py-3"><p className="font-medium tabular-nums">{r.orderId}</p><p className="text-xs text-muted">{d(r.saleDate)} · {r.quantity} un.</p><p className="max-w-48 truncate text-xs text-muted" title={r.status}>{r.status}</p></td>
              <td className="min-w-60 max-w-80 px-4 py-3"><p className="line-clamp-2">{r.title}</p><p className="text-xs text-muted">{[r.itemId, r.sku ? `SKU ${r.sku}` : null].filter(Boolean).join(" · ")}</p><p className={`text-xs ${r.listingId ? "text-muted" : "text-danger"}`}>{r.listingId ? "Anúncio cadastrado" : "Sem anúncio no cadastro"}</p></td>
              <td className="whitespace-nowrap px-4 py-3 text-xs" data-costs>{r.foreign ? <span className="text-muted">—</span> : r.costs ? <ul className="space-y-0.5">{(Object.keys(COST_LABEL) as (keyof typeof COST_LABEL)[]).map((k) => { const v = r.costs![k]; return <li key={k} className={v === "falta" ? "text-danger" : v === "estimado" ? "text-warning" : ""}><span aria-hidden className="mr-1 inline-block w-3">{v === "falta" ? "✕" : v === "estimado" ? "≈" : "✓"}</span>{COST_LABEL[k]}{v === "pacote" && <span className="text-muted"> (pacote)</span>}{v === "estimado" && <span> (estimada)</span>}{v === "falta" && <span className="sr-only"> não contabilizado</span>}</li>; })}</ul> : <span className="text-muted">cancelada</span>}</td>
              <td className="whitespace-nowrap px-4 py-3 text-xs tabular-nums"><div className="grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5">
                <span className="text-muted">Produto</span><span className="text-right">{formatBRL(r.productCents)}</span>
                <span className="text-muted">Tarifas + envio</span><span className="text-right">−{formatBRL(r.feesCents)}</span>
                <span className="text-muted">Total ML</span><span className="text-right">{r.netCents == null ? "—" : formatBRL(r.netCents)}{r.diffCents ? <span className={Math.abs(r.diffCents) >= 200 ? " text-danger" : " text-muted"}> ({r.diffCents > 0 ? "+" : ""}{formatBRL(r.diffCents)})</span> : null}</span>
                <span className="text-muted">Custo</span><span className={`text-right ${r.costCents == null && !r.cancelled ? "text-danger" : ""}`}>{r.cancelled ? "—" : r.costCents == null ? "sem custo" : formatBRL(r.costCents)}</span>
                <span className="text-muted">Lucro no sistema</span><span className="text-right">{r.cancelled ? "R$ 0 (cancelada)" : money(r.profitCents)}</span>
              </div></td>
              <td className="px-4 py-3">{r.foreign ? <span className="whitespace-nowrap rounded border border-line px-2 py-0.5 text-xs text-muted">Outra empresa</span> : <LevelBadge level={r.level} cancelled={r.cancelled} />}</td>
              <td className="min-w-72 px-4 py-3">{r.issues.length ? <ul className="space-y-1.5">{r.issues.map((c) => (
                <li key={c} className="text-xs"><span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${LEVEL_STYLE[SALE_ISSUES[c].level].dot}`} aria-hidden /><b className="font-medium">{SALE_ISSUES[c].label}</b>
                  {c === "total_diferente" && r.diffCents != null && <span className="text-muted"> — o ML pagou {formatBRL(Math.abs(r.diffCents))} {r.diffCents < 0 ? "a menos" : "a mais"} que a soma das colunas</span>}
                  {c === "cancelada_com_valor" && r.netCents != null && <span className="text-muted"> — ML lançou {formatBRL(r.netCents)}</span>}
                  <span className="block pl-3.5 text-muted">{SALE_ISSUES[c].fix}</span></li>))}</ul> : r.foreign ? <span className="text-xs text-muted">Fora dos números da empresa (SKU {r.sku ?? "—"}).</span> : <span className="text-xs text-success">{r.cancelled ? "Cancelada sem valor lançado — fora do faturamento." : "Tudo certo."}</span>}</td>
              <td className="space-y-2 px-4 py-3 text-right">{r.foreign ? <p className="text-xs text-warning">De outra empresa{r.foreignManual != null ? " (marcada à mão)" : ""}</p> : null}{!r.foreign && r.init && (r.issues.includes("sem_anuncio") ? <ListingButton label="Cadastrar anúncio" variant="secondary" initial={r.init} variants={variants} /> : r.issues.some((c) => c === "sem_custo" || c === "sem_imposto" || c === "prejuizo") ? <ListingButton label="Abrir anúncio" variant="secondary" initial={r.init} variants={variants} /> : null)}<div><SaleOwnerButton id={r.id} foreign={r.foreign} manual={r.foreignManual} /></div></td>
            </tr>))}</tbody>
        </table>
        {!list.length && <p className="p-8 text-center text-sm text-muted">Nenhuma venda com esse filtro.</p>}
      </div>
      <p className="mt-2 text-xs text-muted">O lucro de cada venda usa as colunas da planilha (receita, tarifas, frete e reembolsos), o custo dos produtos do anúncio e o imposto/embalagem cadastrados no anúncio. Vendas canceladas ficam fora do faturamento.</p>
    </>
  );
}

async function ByProduct({ f, period, qs }: { f: Parameters<typeof mlListingsByProduct>[0]; period: React.ReactNode; qs: Qs }) {
  const v = await mlListingsByProduct(f);
  const range = (a: number | null, b: number | null) => (a == null ? "—" : a === b ? formatBRL(a) : `${formatBRL(a)} a ${formatBRL(b!)}`);
  return (
    <>
      <p className="mb-4 max-w-3xl text-sm text-muted">Quantos anúncios cada produto tem no Mercado Livre, pelo SKU ligado ao anúncio. Um kit conta para cada produto dentro dele. Clique no produto para ver os anúncios dele.</p>
      {period}
      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <div className="card p-4"><p className="label">Produtos com anúncio</p><p className="mt-2 text-2xl">{v.list.length}</p></div>
        <div className="card p-4"><p className="label">Anúncios cadastrados</p><p className="mt-2 text-2xl">{v.listings}</p></div>
        <div className="card p-4"><p className="label">Anúncios sem produto ligado</p><p className={`mt-2 text-2xl ${v.noProduct ? "text-warning" : ""}`}>{v.noProduct ? <Link className="hover:underline" href={qs({ aba: "anuncios", produto: "sem" })}>{v.noProduct}</Link> : 0}</p>{v.noProduct > 0 && <p className="mt-1 text-xs text-muted">Clique para ver e ligar o produto em “Editar”.</p>}</div>
      </div>
      <div className="card overflow-x-auto" data-by-product>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-[11px] uppercase tracking-label text-muted"><tr>{["Foto", "Produto", "Anúncios", "Sozinho / em kit", "Clássico / Premium", "Preço (anúncios do produto sozinho)", "Lucro/unid. médio", "Vendidas", ""].map((h) => <th key={h} className="whitespace-nowrap px-4 py-3 font-normal">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-line">{v.list.map((g) => (
            <tr key={g.variantId} data-product-group={g.sku}>
              <td className="px-4 py-3"><Thumbs items={[{ image: g.image, name: g.name }]} size={56} /></td>
              <td className="min-w-56 px-4 py-3"><Link className="font-medium hover:underline" href={qs({ aba: "anuncios", produto: g.variantId, q: undefined, tipo: undefined })}>{g.name}</Link><p className="text-xs text-muted">SKU {g.sku}{g.code && g.code !== g.sku ? ` · código ${g.code}` : ""}</p></td>
              <td className="px-4 py-3"><span className="text-xl">{g.total}</span>{g.active !== g.total && <div className="text-xs text-muted">{g.active} ativo(s)</div>}</td>
              <td className="whitespace-nowrap px-4 py-3">{g.alone} / {g.inKit}</td>
              <td className="whitespace-nowrap px-4 py-3">{g.classico} / {g.premium}</td>
              <td className="whitespace-nowrap px-4 py-3">{range(g.minPrice, g.maxPrice)}</td>
              <td className="whitespace-nowrap px-4 py-3">{g.avgProfit == null ? "—" : money(g.avgProfit)}</td>
              <td className="px-4 py-3">{g.soldUnits}</td>
              <td className="px-4 py-3 text-right"><Link className="link text-xs" href={qs({ aba: "anuncios", produto: g.variantId, q: undefined, tipo: undefined })}>Ver anúncios</Link></td>
            </tr>))}</tbody>
        </table>
        {!v.list.length && <p className="p-8 text-center text-sm text-muted">Nenhum anúncio ligado a produto ainda.</p>}
      </div>
      <p className="mt-2 text-xs text-muted">“Vendidas” conta as unidades do produto vendidas no período, inclusive dentro de kits. Preço e lucro médio consideram só os anúncios em que o produto é vendido sozinho.</p>
    </>
  );
}

async function Profit({ f, period }: { f: Parameters<typeof mlProfitByListing>[0]; period: React.ReactNode }) {
  const { list } = await mlProfitByListing(f);
  const tot = list.reduce((a, m) => ({ product: a.product + m.product, profit: a.profit + m.profit, units: a.units + m.units }), { product: 0, profit: 0, units: 0 });
  return (
    <>
      {period}
      <div className="card overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-[11px] uppercase tracking-label text-muted"><tr>{["Anúncio", "Unidades", "Faturamento", "Tarifas e fretes ML", "Custo produtos", "Embalagem, impostos e outros", "Lucro", "Margem", "Lucro/unid."].map((h) => <th key={h} className="whitespace-nowrap px-4 py-3 font-normal">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-line">{list.map((m) => (
            <tr key={(m.listingId ?? "") + m.title} data-ml-profit={m.title}>
              <td className="px-4 py-3">{m.listingId ? m.title : <span className="text-muted">{m.title}</span>}{m.estimated && <span className="ml-1 text-xs text-muted">(tarifas est.)</span>}</td>
              <td className="px-4 py-3">{m.units}</td><td className="whitespace-nowrap px-4 py-3">{formatBRL(m.product)}</td><td className="whitespace-nowrap px-4 py-3">{formatBRL(m.fees)}</td>
              <td className="whitespace-nowrap px-4 py-3">{m.costMissing ? <span className="text-warning">incompleto</span> : formatBRL(m.cost)}</td><td className="whitespace-nowrap px-4 py-3">{formatBRL(m.extras)}</td>
              <td className="whitespace-nowrap px-4 py-3 font-medium">{m.costMissing ? <span className="text-warning">—</span> : money(m.profit)}</td>
              <td className="px-4 py-3">{m.costMissing ? "—" : pct(m.marginBps)}</td><td className="whitespace-nowrap px-4 py-3">{m.costMissing ? "—" : formatBRL(m.unitProfit)}</td>
            </tr>))}</tbody>
          {list.length > 0 && <tfoot className="border-t border-line text-sm font-medium"><tr><td className="px-4 py-3">Total</td><td className="px-4 py-3">{tot.units}</td><td className="px-4 py-3">{formatBRL(tot.product)}</td><td colSpan={3} /><td className="px-4 py-3">{money(tot.profit)}</td><td className="px-4 py-3">{pct(tot.product ? Math.round((tot.profit / tot.product) * 10000) : null)}</td><td /></tr></tfoot>}
        </table>
        {list.length === 0 && <p className="p-8 text-center text-sm text-muted">Nenhuma venda no período.</p>}
      </div>
      <p className="mt-3 text-xs text-muted">Lucro = faturamento + frete recebido − tarifas e frete do ML − reembolsos − custo dos produtos (custo médio do estoque no momento da venda) − embalagem, impostos e outros do cadastro do anúncio. Vendas canceladas não entram.</p>
    </>
  );
}
