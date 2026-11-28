"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type ReactNode } from "react";
import { applyPendingStockAction, deleteListingAction, markShippedAction, recalcSaleCostsAction, saveListingAction, setMlStockFromAction, setOwnPrefixesAction, setSaleOwnerAction } from "@/modules/admin/ml-actions";
import { bpsFromPct, listingUnitCost, simulateListing } from "@/modules/mercadolivre/rules";
import { formatBRL } from "@/lib/money";
import type { ListingInit } from "@/modules/mercadolivre/listing-form";

const inp = "mt-1 h-10 w-full rounded border border-line px-2";
const btn = "inline-flex h-9 items-center whitespace-nowrap rounded px-4 text-sm";
const money = (s: string) => { const t = s.trim().replace(/[R$\s]/g, ""); if (!t) return null; const n = t.includes(",") ? Number(t.replace(/\./g, "").replace(",", ".")) : Number(t); return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : NaN; };

function Dialog({ title, onClose, wide, children }: { title: string; onClose: () => void; wide?: boolean; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 text-left" role="dialog" aria-modal="true" aria-label={title} onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <div className={`max-h-[92dvh] w-full ${wide ? "max-w-3xl" : "max-w-lg"} overflow-y-auto rounded-lg bg-white p-5 shadow-xl`}><h2 className="font-sans text-lg font-medium">{title}</h2>{children}</div>
    </div>
  );
}
function useAct() {
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const go = <T,>(fn: () => Promise<{ ok: true; data: T } | { ok: false; error: string }>, done: (d: T) => void) => { setErr(null); start(async () => { const r = await fn(); if (!r.ok) return setErr(r.error); done(r.data); router.refresh(); }); };
  return { err, pending, go, setErr };
}
const Err = ({ e }: { e: string | null }) => (e ? <p className="mt-3 rounded border border-danger/40 bg-danger/5 p-2 text-sm text-danger" role="alert">{e}</p> : null);

export type VariantOpt = { id: string; sku: string; name: string; unitCostCents: number | null; mto: boolean };
export function ListingButton({ label, initial, variants, variant = "primary" }: { label: string; initial: ListingInit; variants: VariantOpt[]; variant?: "primary" | "secondary" | "link" }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<ListingInit>(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const { err, pending, go, setErr } = useAct();
  const set = <K extends keyof ListingInit>(k: K, v: ListingInit[K]) => setF((s) => ({ ...s, [k]: v }));
  const comp = (i: number, patch: Partial<{ variantId: string; quantity: string }>) => setF((s) => ({ ...s, components: s.components.map((c, j) => (j === i ? { ...c, ...patch } : c)) }));
  const sim = useMemo(() => {
    const price = money(f.price);
    const uc = listingUnitCost(f.components.filter((c) => c.variantId).map((c) => ({ quantity: Number(c.quantity) || 1, unitCostCents: variants.find((v) => v.id === c.variantId)?.unitCostCents ?? null })));
    if (price == null || Number.isNaN(price)) return null;
    const l = { saleFeeBps: bpsFromPct(f.saleFeePct) || 0, fixedFeeCents: money(f.fixedFee) || 0, shippingCostCents: money(f.shippingCost) || 0, packagingCents: money(f.packaging) || 0, taxBps: bpsFromPct(f.taxPct) || 0, otherCostCents: money(f.otherCost) || 0 };
    return { ...simulateListing(price, l, uc.missing ? null : uc.cents), unitCost: uc };
  }, [f, variants]);
  const cls = variant === "primary" ? `${btn} h-10 bg-accent px-5 text-accent-ink` : variant === "secondary" ? `${btn} border border-line hover:bg-ink/5` : "link text-xs";
  const field = (k: keyof ListingInit, l: string, extra: Record<string, unknown> = {}) => <label className="text-xs text-muted">{l}<input className={inp} value={f[k] as string} onChange={(e) => set(k, e.target.value as never)} {...extra} /></label>;
  return (
    <>
      <button type="button" className={cls} onClick={() => { setF(initial); setErr(null); setMsg(null); setOpen(true); }} data-ml-listing={initial.id ?? "novo"}>{label}</button>
      {open && (
        <Dialog wide title={initial.id ? `Editar anúncio` : "Cadastrar anúncio"} onClose={() => setOpen(false)}>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {field("mlItemId", "Nº do anúncio (MLB)", { placeholder: "MLB1234567890" })}
            {field("variation", "Variação (como na planilha)", { placeholder: "Ex.: Cor: Areia — vazio = todas" })}
            {field("sku", "SKU no Mercado Livre")}
            <div className="sm:col-span-2">{field("title", "Título *", { maxLength: 200 })}</div>
            <label className="text-xs text-muted">Situação<select className={inp} value={f.status} onChange={(e) => set("status", e.target.value)}><option value="ATIVO">Ativo</option><option value="PAUSADO">Pausado</option><option value="ENCERRADO">Encerrado</option></select></label>
          </div>
          <fieldset className="mt-5"><legend className="text-sm font-medium">Produtos que saem do estoque a cada unidade vendida</legend>
            <p className="text-xs text-muted">Para kits (ex.: ombrelone + base), adicione uma linha para cada produto.</p>
            {f.components.map((c, i) => {
              const v = variants.find((x) => x.id === c.variantId);
              return (
                <div key={i} className="mt-2 flex flex-wrap items-end gap-2" data-ml-comp={i}>
                  <label className="min-w-64 flex-1 text-xs text-muted">Produto<select className={inp} value={c.variantId} onChange={(e) => comp(i, { variantId: e.target.value })} aria-label="Produto do cadastro"><option value="">Selecione</option>{variants.map((x) => <option key={x.id} value={x.id}>{x.sku} · {x.name}</option>)}</select></label>
                  <label className="w-20 text-xs text-muted">Qtd.<input className={inp} inputMode="numeric" value={c.quantity} onChange={(e) => comp(i, { quantity: e.target.value })} aria-label="Quantidade" /></label>
                  <span className="pb-2 text-xs text-muted">{v ? (v.unitCostCents != null ? `custo ${formatBRL(v.unitCostCents)}` : "sem custo no cadastro") + (v.mto ? " · sob encomenda (sem baixa)" : "") : ""}</span>
                  <button type="button" className="pb-2 text-danger" aria-label="Remover produto" onClick={() => set("components", f.components.length > 1 ? f.components.filter((_, j) => j !== i) : [{ variantId: "", quantity: "1" }])}>✕</button>
                </div>
              );
            })}
            <button type="button" className="mt-2 text-sm link" onClick={() => set("components", [...f.components, { variantId: "", quantity: "1" }])}>+ Adicionar produto</button>
          </fieldset>
          <fieldset className="mt-5"><legend className="text-sm font-medium">Preço e custos de venda</legend>
            <p className="text-xs text-muted">Usados para a simulação e para estimar quando a planilha não trouxer tarifa ou frete. Quando a planilha traz, valem os valores reais.</p>
            <div className="mt-2 grid gap-3 sm:grid-cols-4">
              {field("price", "Preço de venda (R$)", { inputMode: "decimal" })}
              <label className="text-xs text-muted">Tipo<select className={inp} value={f.listingType} onChange={(e) => set("listingType", e.target.value)}><option value="">—</option><option value="classico">Clássico</option><option value="premium">Premium</option></select></label>
              {field("saleFeePct", "Tarifa de venda (%)", { inputMode: "decimal" })}
              {field("fixedFee", "Tarifa fixa por unid. (R$)", { inputMode: "decimal" })}
              {field("shippingCost", "Frete por unid. (R$)", { inputMode: "decimal" })}
              {field("packaging", "Embalagem por unid. (R$)", { inputMode: "decimal" })}
              {field("taxPct", "Imposto sobre a venda (%)", { inputMode: "decimal" })}
              {field("otherCost", "Outros por unid. (R$)", { inputMode: "decimal" })}
            </div>
          </fieldset>
          {sim && (
            <div className="mt-4 rounded border border-line bg-ink/[0.02] p-3 text-sm" data-ml-sim>
              <p className="font-medium">Simulação por unidade vendida</p>
              <p className="mt-1">Preço {formatBRL(money(f.price) ?? 0)} − tarifas {formatBRL(sim.fees)} − frete {formatBRL(sim.shipping)} − imposto {formatBRL(sim.tax)} − embalagem/outros {formatBRL(sim.extras)} − custo dos produtos {sim.unitCost.missing ? "?" : formatBRL(sim.cost)}</p>
              <p className="mt-1">{sim.costMissing ? <span className="text-warning">Falta o custo de algum produto no cadastro: o lucro não pode ser calculado.</span> : <>= <strong className={sim.profit < 0 ? "text-danger" : "text-success"}>{formatBRL(sim.profit)}</strong> de lucro ({sim.marginBps != null ? (sim.marginBps / 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) : "—"}% do preço)</>}</p>
            </div>
          )}
          <label className="mt-4 block text-xs text-muted">Observações<textarea className="mt-1 w-full rounded border border-line p-2" rows={2} value={f.notes} maxLength={1000} onChange={(e) => set("notes", e.target.value)} /></label>
          <Err e={err} />
          {msg && <p className="mt-3 rounded border border-success/40 bg-success/5 p-2 text-sm text-success" role="status">{msg}</p>}
          <div className="mt-4 flex justify-end gap-2"><button className={`${btn} hover:bg-ink/5`} onClick={() => setOpen(false)}>Fechar</button>
            <button className={`${btn} bg-accent text-accent-ink`} disabled={pending} onClick={() => go(() => saveListingAction(initial.id ?? null, { ...f, components: f.components.filter((c) => c.variantId) }), (d) => { setMsg(`Anúncio salvo.${d.linked ? ` ${d.linked} item(ns) de venda vinculado(s).` : ""}`); if (!initial.id) setTimeout(() => setOpen(false), 900); })}>{pending ? "Salvando…" : "Salvar anúncio"}</button></div>
        </Dialog>
      )}
    </>
  );
}

export function DeleteListingButton({ id, title }: { id: string; title: string }) {
  const [confirm, setConfirm] = useState(false);
  const { err, pending, go } = useAct();
  if (!confirm) return <button className="text-xs text-danger hover:underline" onClick={() => setConfirm(true)}>Excluir</button>;
  return (
    <span className="inline-flex flex-wrap items-center gap-2 text-xs"><span>Excluir “{title.slice(0, 30)}”? As vendas ficam, só perdem o vínculo.</span>
      <button className="rounded bg-danger px-2 py-1 text-white" disabled={pending} onClick={() => go(() => deleteListingAction(id), () => setConfirm(false))}>Excluir</button>
      <button className="px-1 hover:underline" onClick={() => setConfirm(false)}>Não</button>{err && <span className="text-danger">{err}</span>}</span>
  );
}

export function ShipButton({ orderIds, shipped, label }: { orderIds: string[]; shipped: boolean; label: string }) {
  const { err, pending, go } = useAct();
  return (
    <span className="inline-flex flex-col items-end">
      <button type="button" className={`${btn} ${shipped ? "bg-accent text-accent-ink" : "border border-line hover:bg-ink/5"}`} disabled={pending || !orderIds.length} onClick={() => go(() => markShippedAction(orderIds, shipped), () => {})} data-ml-ship={shipped ? "sim" : "nao"}>{pending ? "Salvando…" : label}</button>
      {err && <span className="mt-1 text-xs text-danger">{err}</span>}
    </span>
  );
}

/** Fila de expedição com seleção em massa. */
export function ShipQueueSelect({ ids }: { ids: string[] }) {
  const [sel, setSel] = useState<string[]>([]);
  return (
    <div className="mb-3 flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={sel.length === ids.length && ids.length > 0} onChange={(e) => { setSel(e.target.checked ? ids : []); document.querySelectorAll<HTMLInputElement>("input[data-ship-sel]").forEach((c) => (c.checked = e.target.checked)); }} /> Selecionar todas</label>
      <ShipSelected />
    </div>
  );
}
function ShipSelected() {
  const { err, pending, go } = useAct();
  return (
    <span>
      <button type="button" className={`${btn} bg-accent text-accent-ink`} disabled={pending} data-ml-ship-selected onClick={() => {
        const ids = [...document.querySelectorAll<HTMLInputElement>("input[data-ship-sel]:checked")].map((c) => c.value);
        go(() => markShippedAction(ids, true), () => {});
      }}>{pending ? "Salvando…" : "Marcar selecionadas como despachadas"}</button>
      {err && <span className="ml-2 text-xs text-danger">{err}</span>}
    </span>
  );
}

export function StockFromForm({ current }: { current: string | null }) {
  const [v, setV] = useState(current ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const { err, pending, go } = useAct();
  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="text-xs text-muted">Baixar estoque das vendas a partir de<input type="date" className={`${inp} w-44`} value={v} onChange={(e) => { setV(e.target.value); setMsg(null); }} data-ml-stock-from /></label>
      <button type="button" className={`${btn} h-10 border border-line hover:bg-ink/5`} disabled={pending} onClick={() => go(() => setMlStockFromAction(v || null), () => setMsg(v ? "Data salva." : "Baixa automática desligada."))}>Salvar</button>
      {current && <button type="button" className={`${btn} h-10 hover:bg-ink/5`} disabled={pending} onClick={() => { setV(""); go(() => setMlStockFromAction(null), () => setMsg("Baixa automática desligada.")); }}>Desligar</button>}
      {msg && <span className="pb-2 text-xs text-success">{msg}</span>}{err && <span className="pb-2 text-xs text-danger">{err}</span>}
    </div>
  );
}

/** Início dos SKUs da empresa: vendas com outro SKU são de outra empresa (mesma conta do ML). */
export function OwnPrefixesForm({ initial }: { initial: string[] }) {
  const [v, setV] = useState(initial.join(", "));
  const [res, setRes] = useState<string | null>(null);
  const { err, pending, go } = useAct();
  return (
    <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); go(() => setOwnPrefixesAction(v), (d) => { setRes(`Salvo: ${d.prefixes.length ? d.prefixes.join(", ") : "todas as vendas são da empresa"}. ${d.changed} venda(s) reclassificada(s).`); }); }} data-own-prefixes>
      <label className="block text-xs text-muted">SKUs da empresa começam com<input className="mt-1 block h-10 w-64 rounded border border-line bg-white px-3 text-sm text-ink" value={v} onChange={(e) => setV(e.target.value)} placeholder="ex.: PA50" aria-describedby="own-prefixes-help" /></label>
      <button type="submit" className={`${btn} border border-line bg-white hover:bg-ink/5`} disabled={pending}>{pending ? "Salvando…" : "Salvar"}</button>
      <span id="own-prefixes-help" className="w-full text-xs text-muted">Separe por vírgula (ex.: PA50, PA51). Vendas com outro SKU ficam como “de outra empresa”. Em branco = todas são da empresa.</span>
      {res && <span className="w-full text-xs" role="status">{res}</span>}{err && <span className="w-full text-xs text-danger">{err}</span>}
    </form>
  );
}

/** Correção manual de uma venda: da empresa / de outra empresa / voltar à regra do SKU. */
export function SaleOwnerButton({ id, foreign, manual }: { id: string; foreign: boolean; manual: boolean | null }) {
  const { err, pending, go } = useAct();
  const set = (v: boolean | null) => go(() => setSaleOwnerAction(id, v), () => {});
  return (
    <span className="inline-flex flex-col items-end gap-1 text-xs">
      <button type="button" className="link whitespace-nowrap" disabled={pending} onClick={() => set(!foreign)} data-sale-owner={foreign ? "minha" : "outra"}>{foreign ? "É da empresa" : "Não é da empresa"}</button>
      {manual != null && <button type="button" className="whitespace-nowrap text-muted underline" disabled={pending} onClick={() => set(null)}>voltar à regra do SKU</button>}
      {err && <span className="text-danger">{err}</span>}
    </span>
  );
}

export function RecalcCostsButton() {
  const [res, setRes] = useState<string | null>(null);
  const { err, pending, go } = useAct();
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button type="button" className={`${btn} border border-line bg-white hover:bg-ink/5`} disabled={pending} onClick={() => go(() => recalcSaleCostsAction(), (d) => setRes(d.fixed ? `${d.fixed} venda(s) passaram a ter custo.${d.left ? ` Ainda sem custo: ${d.left}.` : ""}` : d.left ? `Nenhuma venda mudou. Ainda sem custo: ${d.left} — cadastre o anúncio ou o custo do produto.` : "Todas as vendas já têm custo."))} data-ml-recalc>
        {pending ? "Recalculando…" : "Recalcular custos"}</button>
      {res && <span className="text-xs" role="status">{res}</span>}{err && <span className="text-xs text-danger">{err}</span>}
    </span>
  );
}

export function ApplyStockButton({ pending: count }: { pending: number }) {
  const [res, setRes] = useState<string | null>(null);
  const { err, pending, go } = useAct();
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button type="button" className={`${btn} border border-line hover:bg-ink/5`} disabled={pending} onClick={() => go(() => applyPendingStockAction(), (d) => setRes(`${d.moved} movimentação(ões) de estoque em ${d.orders} venda(s).${d.negative.length ? ` Estoque negativo em: ${d.negative.join(", ")}.` : ""}`))} data-ml-apply-stock>
        {pending ? "Aplicando…" : `Dar baixa nas vendas pendentes (${count})`}</button>
      {res && <span className="text-xs">{res}</span>}{err && <span className="text-xs text-danger">{err}</span>}
    </span>
  );
}

