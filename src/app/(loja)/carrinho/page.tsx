import type { Metadata } from "next";
import { getViewer } from "@/modules/auth/session";
import { getPricedCart } from "@/modules/cart/service";
import { isAutomaticShippingConfigured } from "@/modules/integrations/shipping";
import { db } from "@/lib/db";
import { ButtonLink } from "@/components/ui/button";
import { Checkout } from "@/components/cart/checkout";

export const metadata: Metadata = { title: "Carrinho", robots: { index: false } };

export default async function CartPage() {
  const viewer = await getViewer();
  if (!viewer.user || !viewer.company || !viewer.canSeePrices) {
    return (
      <div className="container py-20 text-center md:py-28">
        <h1 className="text-4xl">Carrinho</h1>
        <p className="mx-auto mt-4 max-w-md text-muted">
          {!viewer.user ? "Entre ou cadastre sua empresa para montar seu pedido." : "Sua empresa precisa estar validada para comprar. Confirme seu e-mail ou aguarde a análise."}
        </p>
        {!viewer.user && (
          <div className="mt-8 flex justify-center gap-3">
            <ButtonLink href="/entrar?next=/carrinho">Entrar</ButtonLink>
            <ButtonLink href="/cadastro" variant="secondary">Cadastrar empresa</ButtonLink>
          </div>
        )}
      </div>
    );
  }
  const [cart, addresses] = await Promise.all([
    getPricedCart({ user: viewer.user, company: viewer.company }),
    db.address.findMany({ where: { companyId: viewer.company.id }, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] }),
  ]);

  return (
    <div className="container py-10 md:py-16">
      <h1 className="mb-10 text-4xl md:text-5xl">Carrinho</h1>
      {cart.lines.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-muted">Seu carrinho está vazio.</p>
          <ButtonLink href="/produtos" className="mt-6">Explorar produtos</ButtonLink>
        </div>
      ) : (
        <Checkout
          initialCart={JSON.parse(JSON.stringify(cart))}
          addresses={addresses.map((a) => ({ id: a.id, label: a.label, line: `${a.street}, ${a.number}${a.complement ? ` – ${a.complement}` : ""} · ${a.district} · ${a.city}/${a.state} · CEP ${a.zipCode.replace(/(\d{5})(\d{3})/, "$1-$2")}` }))}
          autoShipping={isAutomaticShippingConfigured()}
        />
      )}
    </div>
  );
}
