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
import { mlDataQuality } from "@/modules/mercadolivre/quality";
import { ISSUES, SEV_LABEL, type IssueCode } from "@/modules/mercadolivre/quality-rules";
import { ApplyStockButton, DeleteListingButton, ListingButton, ShipButton, ShipQueueSelect, StockFromForm } from "@/components/admin/ml";
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
  const tabs = ([["painel", "Painel"], ["vendas", "Vendas"], ["enviar", "A enviar"], ["anuncios", "Anúncios"], ["produtos", "Anúncios por produto"], ["qualidade", "Qualidade dos dados"], ["lucro", "Lucro por anúncio"]] as const).filter(([k]) => (k === "anuncios" || k === "produtos" || k === "qualidade" || k === "lucro" || k === "painel" ? can.profit : true));
  const aba = tabs.some(([k]) => k === f.aba) ? f.aba! : !has("ORDERS") && !has("FINANCE") ? "enviar" : can.profit ? "painel" : "vendas";
  const { de, ate } = mlPeriod(f);
  const qs = (patch: Record<string, string | undefined>) => { const p = new URLSearchParams(); for (const [k, v] of Object.entries({ ...f, ...patch })) if (v) p.set(k, v); return `/admin/mercadolivre?${p}`; };
  const variants = can.profit && (aba === "anuncios" || aba === "lucro" || aba === "vendas" || aba === "qualidade") ? await listingFormOptions() : [];

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
      {aba === "qualidade" && <Quality f={f} qs={qs} variants={variants} />}
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

const SEV_STYLE = { critico: { cls: "text-danger", bg: "bg-danger/10 border-danger/30", icon: "✕" }, aviso: { cls: "text-warning", bg: "bg-warning/10 border-warning/30", icon: "!" }, info: { cls: "text-muted", bg: "bg-ink/[0.04] border-line", icon: "i" }, ok: { cls: "text-success", bg: "bg-success/10 border-success/30", icon: "✓" } } as const;
function SevBadge({ sev }: { sev: keyof typeof SEV_STYLE }) {
  const s = SEV_STYLE[sev];
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded border px-2 py-0.5 text-xs font-medium ${s.bg} ${s.cls}`}><span aria-hidden className="grid h-3.5 w-3.5 place-items-center rounded-full border border-current text-[9px] leading-none">{s.icon}</span>{sev === "ok" ? "Completo" : SEV_LABEL[sev]}</span>;
}

async function Quality({ f, qs, variants }: { f: Parameters<typeof mlDataQuality>[0]; qs: Qs; variants: Awaited<ReturnType<typeof listingFormOptions>> }) {
  const { summary: s, list } = await mlDataQuality(f);
  const pctOk = s.total ? Math.round((s.ok / s.total) * 100) : 100;
  const chip = (patch: Record<string, string | undefined>, label: React.ReactNode, active: boolean, key: string) => <Link key={key} href={qs({ aba: "qualidade", ...patch })} className={`rounded border px-3 py-1.5 text-xs ${active ? "border-ink bg-ink text-canvas" : "border-line bg-white hover:border-ink/50"}`}>{label}</Link>;
  return (
    <>
      <p className="mb-4 max-w-3xl text-sm text-muted">Confere cada anúncio e mostra o que está faltando para o custo, o lucro e o estoque saírem certos. <b className="font-medium text-ink">Crítico</b> deixa venda sem custo (lucro errado); <b className="font-medium text-ink">Atenção</b> deixa o cálculo impreciso; <b className="font-medium text-ink">Sugestão</b> é opcional.</p>
      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-5" data-quality-summary>
        <div className="card p-4"><p className="label">Nota geral</p><p className={`mt-2 text-3xl ${s.score >= 80 ? "text-success" : s.score >= 50 ? "text-warning" : "text-danger"}`}>{s.score}<span className="text-base text-muted">/100</span></p><p className="mt-1 text-xs text-muted">{pctOk}% dos anúncios completos (sem crítico nem atenção)</p></div>
        <div className="card p-4"><p className="label">Anúncios analisados</p><p className="mt-2 text-3xl">{s.total}</p><p className="mt-1 text-xs text-muted">inclui os vendidos sem cadastro</p></div>
        <div className="card p-4"><p className="label">Críticos</p><p className={`mt-2 text-3xl ${s.critico ? "text-danger" : ""}`}>{s.critico}</p><p className="mt-1 text-xs text-muted">{s.salesWithoutCost} item(ns) vendido(s) sem custo</p></div>
        <div className="card p-4"><p className="label">Atenção</p><p className={`mt-2 text-3xl ${s.aviso ? "text-warning" : ""}`}>{s.aviso}</p><p className="mt-1 text-xs text-muted">cálculo impreciso</p></div>
        <div className="card p-4"><p className="label">Completos</p><p className={`mt-2 text-3xl ${s.ok ? "text-success" : ""}`}>{s.ok}</p><p className="mt-1 text-xs text-muted">{s.info ? `${s.info} com sugestões opcionais` : "sem pendências"}</p></div>
      </div>
      <div className="card mb-4 p-4" data-quality-filters>
        <p className="mb-2 text-xs text-muted">Filtrar por nível</p>
        <div className="flex flex-wrap gap-2">{chip({ sev: undefined, problema: undefined }, `Todos (${s.total})`, !f.sev && !f.problema, "t")}{(["critico", "aviso", "info", "ok"] as const).map((k) => chip({ sev: k, problema: undefined }, `${k === "ok" ? "Sem nenhuma pendência" : k === "info" ? "Só sugestões" : SEV_LABEL[k]} (${k === "ok" ? s.ok - s.info : s[k]})`, f.sev === k, k))}</div>
        <p className="mb-2 mt-4 text-xs text-muted">Filtrar pelo que está faltando</p>
        <div className="flex flex-wrap gap-2">{s.byIssue.map((i) => chip({ problema: i.code, sev: undefined }, <span className="inline-flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${i.sev === "critico" ? "bg-danger" : i.sev === "aviso" ? "bg-warning" : "bg-ink/30"}`} />{i.label} ({i.count})</span>, f.problema === i.code, i.code))}</div>
        <form className="mt-4 flex flex-wrap items-end gap-2" role="search"><input type="hidden" name="aba" value="qualidade" />{f.sev && <input type="hidden" name="sev" value={f.sev} />}{f.problema && <input type="hidden" name="problema" value={f.problema} />}
          <label className="text-xs text-muted">Buscar<Input name="q" defaultValue={f.q ?? ""} placeholder="Título, MLB ou SKU" className="mt-1 h-9 w-72" /></label><Button type="submit" variant="secondary" className="h-9">Buscar</Button></form>
      </div>
      {f.problema && ISSUES[f.problema as IssueCode] && <p className="mb-3 rounded border border-line bg-white px-4 py-2 text-sm"><b className="font-medium">{ISSUES[f.problema as IssueCode].label}:</b> {ISSUES[f.problema as IssueCode].fix}</p>}
      <div className="card overflow-x-auto" data-quality-table>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-[11px] uppercase tracking-label text-muted"><tr>{["Foto", "Anúncio", "Nível", "Nota", "O que está faltando", "Vendas", ""].map((h) => <th key={h} className="whitespace-nowrap px-4 py-3 font-normal">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-line">{list.map((r) => (
            <tr key={r.key} data-quality-row={r.mlb ?? r.key} className="align-top">
              <td className="px-4 py-3"><Thumbs items={r.images} /></td>
              <td className="min-w-64 max-w-96 px-4 py-3"><p className="font-medium">{r.title}</p><p className="text-xs text-muted">{[r.mlb, r.variation, r.type === "premium" ? "Premium" : r.type === "classico" ? "Clássico" : null, r.priceCents != null ? formatBRL(r.priceCents) : null].filter(Boolean).join(" · ")}</p>{r.products && <p className="text-xs text-muted">{r.products}</p>}</td>
              <td className="px-4 py-3"><SevBadge sev={r.severity} /></td>
              <td className={`px-4 py-3 text-lg ${r.score >= 80 ? "text-success" : r.score >= 50 ? "text-warning" : "text-danger"}`}>{r.score}</td>
              <td className="min-w-72 px-4 py-3">{r.issues.length ? <ul className="space-y-1">{r.issues.map((c) => (
                <li key={c} className="text-xs"><span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${ISSUES[c].sev === "critico" ? "bg-danger" : ISSUES[c].sev === "aviso" ? "bg-warning" : "bg-ink/30"}`} aria-hidden /><b className="font-medium">{ISSUES[c].label}</b>
                  {c === "preco_diferente" && r.lastSoldPriceCents != null && <span className="text-muted"> (cadastrado {formatBRL(r.priceCents ?? 0)}, vendido por {formatBRL(r.lastSoldPriceCents)})</span>}
                  <span className="block pl-3.5 text-muted">{ISSUES[c].fix}</span></li>))}</ul> : <span className="text-xs text-success">Tudo preenchido.</span>}</td>
              <td className="whitespace-nowrap px-4 py-3 text-xs">{r.soldUnits} un.{r.salesWithoutCost > 0 && <div className="text-danger">{r.salesWithoutCost} sem custo</div>}</td>
              <td className="px-4 py-3 text-right">{r.severity !== "ok" && <ListingButton label={r.listingId ? "Corrigir" : "Cadastrar"} variant="secondary" initial={r.init} variants={variants} />}</td>
            </tr>))}</tbody>
        </table>
        {!list.length && <p className="p-8 text-center text-sm text-muted">Nenhum anúncio com esse filtro.</p>}
      </div>
      <p className="mt-2 text-xs text-muted">“Sem custo do produto” se resolve no cadastro do produto (aba Produtos), não no anúncio. Depois de corrigir, as vendas já importadas passam a usar o custo ao reimportar a planilha de vendas ou ao salvar o anúncio.</p>
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
