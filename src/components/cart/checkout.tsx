"use client";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import type { PricedCart } from "@/modules/cart/service";
import type { ShippingOption } from "@/modules/integrations/shipping";
import { api } from "@/lib/api-client";
import { formatBRL } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { ImagePlaceholder, Notice } from "@/components/ui/misc";

type Address = { id: string; label: string | null; line: string };

export function Checkout({ initialCart, addresses: initialAddresses, autoShipping }: { initialCart: PricedCart; addresses: Address[]; autoShipping: boolean }) {
  const [cart, setCart] = useState(initialCart);
  const [addresses, setAddresses] = useState(initialAddresses);
  const [addressId, setAddressId] = useState(initialAddresses[0]?.id ?? "");
  const [mode, setMode] = useState<"AUTOMATIC" | "MANUAL_QUOTE">(autoShipping ? "AUTOMATIC" : "MANUAL_QUOTE");
  const [options, setOptions] = useState<ShippingOption[] | null>(null);
  const [optionId, setOptionId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const router = useRouter();

  const shipping = options?.find((o) => o.id === optionId) ?? null;
  const total = cart.subtotalCents != null && shipping ? cart.subtotalCents + shipping.priceCents : null;
  const ready = cart.canCheckout && !!addressId && (mode === "MANUAL_QUOTE" || !!shipping);

  const updateQty = (variantId: string, quantity: number) => start(async () => {
    const r = await api<PricedCart>("/api/cart", { method: "PATCH", body: { variantId, quantity } });
    if (r.ok) { setCart(r.data); setOptions(null); setOptionId(""); router.refresh(); } else setError(r.error.message);
  });

  const quote = () => start(async () => {
    setError(null); setOptions(null); setOptionId("");
    const r = await api<ShippingOption[]>("/api/checkout/shipping", { method: "POST", body: { addressId } });
    if (!r.ok) return setError(r.error.message);
    setOptions(r.data);
    if (r.data.length === 0) setError("Nenhuma transportadora automática atende este envio. Solicite uma cotação manual.");
  });

  const placeOrder = () => start(async () => {
    setError(null);
    const body = mode === "AUTOMATIC" ? { shippingMode: mode, addressId, shippingOptionId: optionId, idempotencyKey, notes: notes || undefined } : { shippingMode: mode, addressId, idempotencyKey, notes: notes || undefined };
    const r = await api<{ id: string }>("/api/orders", { method: "POST", body });
    if (r.ok) { router.push(`/minha-conta/pedidos/${r.data.id}?novo=1`); router.refresh(); } else setError(r.error.message);
  });

  return (
    <div className="grid gap-12 lg:grid-cols-[1.6fr_1fr]">
      <div className="space-y-14">
        {/* 1. Itens */}
        <section aria-labelledby="itens">
          <h2 id="itens" className="label mb-4">1 · Itens</h2>
          <ul className="divide-y divide-line border-y border-line">
            {cart.lines.map((l) => (
              <li key={l.id} className="grid grid-cols-[72px_1fr] gap-4 py-5 md:grid-cols-[96px_1fr_auto]">
                <Link href={`/produtos/${l.productSlug}`} className="relative aspect-square overflow-hidden rounded">
                  {l.image ? <Image src={l.image.url} alt={l.image.alt} fill sizes="96px" className="object-cover" /> : <ImagePlaceholder label="" />}
                </Link>
                <div className="min-w-0">
                  <Link href={`/produtos/${l.productSlug}`} className="text-[15px] hover:underline">{l.productName}</Link>
                  <p className="mt-1 text-xs text-muted">SKU {l.sku}{l.variantName && ` · ${l.variantName}`}</p>
                  <p className="mt-1 text-xs text-muted">{l.unitPriceCents != null ? `${formatBRL(l.unitPriceCents)} / un.` : "Sem preço"}{l.madeToOrder && ` · Sob encomenda${l.leadTimeDays ? ` (${l.leadTimeDays} dias)` : ""}`}</p>
                  {l.issues.length > 0 && <p className="mt-1 text-xs text-danger">{l.issues.join(" · ")}</p>}
                  <div className="mt-3 flex items-center gap-4 md:hidden"><Qty l={l} onChange={updateQty} disabled={pending} /></div>
                </div>
                <div className="col-span-2 hidden items-center gap-6 md:col-span-1 md:flex">
                  <Qty l={l} onChange={updateQty} disabled={pending} />
                  <p className="w-28 text-right">{l.totalCents != null ? formatBRL(l.totalCents) : "—"}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* 2. Endereço */}
        <section aria-labelledby="endereco">
          <h2 id="endereco" className="label mb-4">2 · Endereço de entrega</h2>
          <div className="space-y-3">
            {addresses.map((a) => (
              <label key={a.id} className={`flex cursor-pointer gap-3 rounded-lg border p-4 text-sm transition-colors ${addressId === a.id ? "border-ink" : "border-line hover:border-ink/40"}`}>
                <input type="radio" name="address" className="mt-1 accent-[rgb(var(--accent))]" checked={addressId === a.id} onChange={() => { setAddressId(a.id); setOptions(null); setOptionId(""); }} />
                <span>{a.label && <span className="block font-medium">{a.label}</span>}<span className="text-muted">{a.line}</span></span>
              </label>
            ))}
            <NewAddress onCreated={(a) => { setAddresses((xs) => [...xs, a]); setAddressId(a.id); setOptions(null); }} />
          </div>
        </section>

        {/* 3. Frete */}
        <section aria-labelledby="frete">
          <h2 id="frete" className="label mb-4">3 · Frete</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <ModeCard active={mode === "AUTOMATIC"} disabled={!autoShipping} onClick={() => setMode("AUTOMATIC")} title="Frete automático"
              text={autoShipping ? "Consulte transportadoras, valores e prazos agora." : "Integração de frete ainda não ativada."} />
            <ModeCard active={mode === "MANUAL_QUOTE"} onClick={() => setMode("MANUAL_QUOTE")} title="Solicitar cotação"
              text="Nossa equipe envia transportadora, valor e prazo. Você aceita antes de pagar." />
          </div>

          {mode === "AUTOMATIC" && autoShipping && (
            <div className="mt-5 space-y-3">
              <Button variant="secondary" onClick={quote} disabled={!addressId || pending || !cart.canCheckout}>{pending && !options ? "Consultando…" : "Consultar frete"}</Button>
              {options?.map((o) => (
                <label key={o.id} className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg border p-4 text-sm ${optionId === o.id ? "border-ink" : "border-line"}`}>
                  <span className="flex items-center gap-3">
                    <input type="radio" name="ship" className="accent-[rgb(var(--accent))]" checked={optionId === o.id} onChange={() => setOptionId(o.id)} />
                    <span><span className="block">{o.carrierName} · {o.serviceName}</span><span className="text-xs text-muted">Prazo estimado: {o.deadlineDays} dias úteis</span></span>
                  </span>
                  <span>{formatBRL(o.priceCents)}</span>
                </label>
              ))}
            </div>
          )}
          {mode === "MANUAL_QUOTE" && (
            <p className="mt-4 text-sm text-muted">O pedido será registrado como <strong className="text-ink">Aguardando cotação</strong> e os itens ficam reservados enquanto preparamos a proposta. Nenhum valor de frete é cobrado sem o seu aceite.</p>
          )}
        </section>

        <section>
          <Field label="Observações (opcional)" htmlFor="notes"><Textarea id="notes" maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Horário de recebimento, referência de compra…" /></Field>
        </section>
      </div>

      {/* Resumo */}
      <aside className="lg:sticky lg:top-28 lg:self-start">
        <div className="card p-6">
          <h2 className="label mb-5">Resumo</h2>
          <dl className="space-y-3 text-sm">
            <Row k="Subtotal" v={cart.subtotalCents != null ? formatBRL(cart.subtotalCents) : "—"} />
            <Row k="Frete" v={mode === "MANUAL_QUOTE" ? "A cotar" : shipping ? formatBRL(shipping.priceCents) : "Consulte"} />
            <div className="border-t border-line pt-3"><Row k="Total" v={mode === "MANUAL_QUOTE" ? "Após cotação" : total != null ? formatBRL(total) : "—"} strong /></div>
          </dl>
          {error && <div className="mt-5"><Notice tone="danger">{error}</Notice></div>}
          <Button className="mt-6 w-full" disabled={!ready || pending} onClick={placeOrder}>
            {pending ? "Processando…" : mode === "MANUAL_QUOTE" ? "Solicitar cotação" : "Continuar para pagamento"}
          </Button>
          <p className="mt-4 text-xs text-muted">Preços e disponibilidade são confirmados no momento do pedido.</p>
        </div>
      </aside>
    </div>
  );
}

function Qty({ l, onChange, disabled }: { l: PricedCart["lines"][number]; onChange: (v: string, q: number) => void; disabled: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-10 items-center rounded border border-line">
        <button className="h-full w-9 disabled:opacity-30" disabled={disabled || l.quantity <= l.saleUnit} onClick={() => onChange(l.variantId, l.quantity - l.saleUnit)} aria-label="Diminuir">−</button>
        <span className="w-10 text-center text-sm" aria-live="polite">{l.quantity}</span>
        <button className="h-full w-9 disabled:opacity-30" disabled={disabled} onClick={() => onChange(l.variantId, l.quantity + l.saleUnit)} aria-label="Aumentar">+</button>
      </div>
      <button className="text-xs text-muted underline-offset-4 hover:text-danger hover:underline" disabled={disabled} onClick={() => onChange(l.variantId, 0)}>Remover</button>
    </div>
  );
}

function ModeCard({ active, disabled, onClick, title, text }: { active: boolean; disabled?: boolean; onClick: () => void; title: string; text: string }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} aria-pressed={active}
      className={`rounded-lg border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${active ? "border-ink bg-surface" : "border-line hover:border-ink/40"}`}>
      <span className="block text-sm font-medium">{title}</span>
      <span className="mt-1 block text-xs text-muted">{text}</span>
    </button>
  );
}

const Row = ({ k, v, strong }: { k: string; v: string; strong?: boolean }) => (
  <div className={`flex justify-between ${strong ? "text-base" : ""}`}><dt className={strong ? "" : "text-muted"}>{k}</dt><dd>{v}</dd></div>
);

function NewAddress({ onCreated }: { onCreated: (a: Address) => void }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const fields = useMemo(() => [
    ["recipient", "Destinatário", "sm:col-span-2"], ["zipCode", "CEP", ""], ["street", "Rua", "sm:col-span-2"], ["number", "Número", ""],
    ["complement", "Complemento", ""], ["district", "Bairro", ""], ["city", "Cidade", ""], ["state", "UF", ""], ["label", "Apelido (opcional)", "sm:col-span-2"],
  ] as const, []);
  if (!open) return <button type="button" className="link text-sm" onClick={() => setOpen(true)}>+ Adicionar endereço</button>;
  return (
    <form className="card grid gap-4 p-5 sm:grid-cols-3" onSubmit={(e) => {
      e.preventDefault();
      const body = Object.fromEntries(new FormData(e.currentTarget));
      start(async () => {
        const r = await api<{ id: string; label: string | null; street: string; number: string; complement: string | null; district: string; city: string; state: string; zipCode: string }>("/api/addresses", { method: "POST", body });
        if (!r.ok) return setError(r.error.message);
        const a = r.data;
        onCreated({ id: a.id, label: a.label, line: `${a.street}, ${a.number}${a.complement ? ` – ${a.complement}` : ""} · ${a.district} · ${a.city}/${a.state} · CEP ${a.zipCode}` });
        setOpen(false);
      });
    }}>
      {fields.map(([name, label, span]) => (
        <div key={name} className={span}><Field label={label} htmlFor={`addr-${name}`}><Input id={`addr-${name}`} name={name} required={!["complement", "label"].includes(name)} maxLength={name === "state" ? 2 : undefined} /></Field></div>
      ))}
      {error && <div className="sm:col-span-3"><Notice tone="danger">{error}</Notice></div>}
      <div className="flex gap-3 sm:col-span-3">
        <Button type="submit" disabled={pending}>Salvar endereço</Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
      </div>
    </form>
  );
}
