"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ProductDetail } from "@/modules/catalog/queries";
import { formatBRL } from "@/lib/money";
import { Button, ButtonLink } from "@/components/ui/button";
import { Price } from "@/components/catalog/price";
import { api } from "@/lib/api-client";

type Variant = ProductDetail["variants"][number];

export function BuyBox({ variants, locked, loggedIn, canBuy }: { variants: Variant[]; locked: boolean; loggedIn: boolean; canBuy: boolean }) {
  const [vid, setVid] = useState(variants[0]?.id);
  const v = variants.find((x) => x.id === vid) ?? variants[0];
  const [qty, setQty] = useState(v?.saleUnit ?? 1);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  if (!v) return <p className="mt-6 text-sm text-muted">Produto indisponível no momento.</p>;

  const maxQty = v.availability.state === "in_stock" ? v.availability.available : 100_000;
  const sellable = v.availability.state === "in_stock" || v.availability.state === "made_to_order";
  const step = v.saleUnit;

  const selectVariant = (id: string) => {
    setVid(id);
    const nv = variants.find((x) => x.id === id)!;
    setQty(nv.saleUnit);
    window.dispatchEvent(new CustomEvent("variant-change", { detail: id }));
  };

  const add = () => start(async () => {
    setMsg(null);
    const r = await api("/api/cart", { method: "POST", body: { variantId: v.id, quantity: qty } });
    if (r.ok) { setMsg({ ok: true, text: "Adicionado ao carrinho." }); router.refresh(); }
    else setMsg({ ok: false, text: r.error.message });
  });

  return (
    <div className="mt-6">
      <p className="text-xs text-muted">SKU {v.sku}{v.sizeLabel && <> · {v.sizeLabel}</>}</p>
      <div className="mt-6"><Price cents={v.priceCents} locked={locked} size="lg" /></div>

      {variants.length > 1 && (
        <fieldset className="mt-8">
          <legend className="label mb-3">Cor / acabamento</legend>
          <div className="flex flex-wrap gap-2">
            {variants.map((x) => (
              <button key={x.id} type="button" onClick={() => selectVariant(x.id)} aria-pressed={x.id === v.id}
                className={`rounded border px-4 py-2 text-sm transition-colors ${x.id === v.id ? "border-ink bg-ink text-canvas" : "border-line hover:border-ink"}`}>
                {[x.color, x.finish, x.sizeLabel].filter(Boolean).join(" · ") || x.name || x.sku}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      <p className={`mt-6 text-sm ${v.availability.state === "in_stock" ? "text-success" : "text-muted"}`}>{v.stockLabel}</p>

      {canBuy ? (
        <div className="mt-6 space-y-4">
          <div className="flex items-stretch gap-3">
            <div className="flex h-12 items-center rounded border border-line" role="group" aria-label="Quantidade">
              <button className="h-full w-11 text-lg disabled:opacity-30" onClick={() => setQty((q) => Math.max(step, q - step))} disabled={qty <= step} aria-label="Diminuir">−</button>
              <input type="number" inputMode="numeric" min={step} step={step} max={maxQty} value={qty}
                onChange={(e) => setQty(Math.max(step, Math.min(maxQty, Number(e.target.value) || step)))}
                className="h-full w-14 bg-transparent text-center text-sm outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" aria-label="Quantidade" />
              <button className="h-full w-11 text-lg disabled:opacity-30" onClick={() => setQty((q) => Math.min(maxQty, q + step))} disabled={qty + step > maxQty} aria-label="Aumentar">+</button>
            </div>
            <Button className="flex-1" onClick={add} disabled={!sellable || pending || v.priceCents == null}>{pending ? "Adicionando…" : "Adicionar ao carrinho"}</Button>
          </div>
          {v.priceCents != null && <p className="text-sm text-muted">Subtotal: <span className="text-ink">{formatBRL(v.priceCents * qty)}</span>{step > 1 && <> · vendido em múltiplos de {step}</>}</p>}
          {msg && <p role="status" className={`text-sm ${msg.ok ? "text-success" : "text-danger"}`}>{msg.text} {msg.ok && <Link href="/carrinho" className="link text-ink">Ver carrinho</Link>}</p>}
        </div>
      ) : !loggedIn ? (
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <ButtonLink href="/cadastro" className="flex-1">Cadastrar minha empresa</ButtonLink>
          <ButtonLink href="/entrar" variant="secondary" className="flex-1">Já tenho cadastro</ButtonLink>
        </div>
      ) : null}
    </div>
  );
}
