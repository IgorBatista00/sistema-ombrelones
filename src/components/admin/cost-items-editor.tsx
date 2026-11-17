"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveCostItemAction } from "@/modules/admin/product-actions";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";

type Item = { id?: string; key: string; label: string; unit: string; price: string; category: string; isActive: boolean; uses?: number };

export function CostItemsEditor({ items, categories }: { items: Item[]; categories: { key: string; label: string }[] }) {
  return (
    <div className="space-y-8">
      {categories.map((c) => (
        <section key={c.key}>
          <h2 className="label mb-3">{c.label}</h2>
          <div className="card divide-y divide-line">
            {items.filter((i) => i.category === c.key).map((i) => <CostRow key={i.id} item={i} categories={categories} />)}
            <CostRow item={{ key: "", label: "", unit: c.key === "TECIDO" ? "m" : "un", price: "", category: c.key, isActive: true }} categories={categories} isNew />
          </div>
        </section>
      ))}
    </div>
  );
}

function CostRow({ item, categories, isNew }: { item: Item; categories: { key: string; label: string }[]; isNew?: boolean }) {
  const [f, setF] = useState(item);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const dirty = JSON.stringify(f) !== JSON.stringify(item);
  return (
    <form className="grid items-center gap-2 p-3 md:grid-cols-[140px_2fr_70px_120px_150px_auto_auto]" onSubmit={(e) => {
      e.preventDefault();
      start(async () => {
        const r = await saveCostItemAction({ ...f, id: item.id ?? null });
        if (!r.ok) return setMsg({ ok: false, text: r.error });
        setMsg({ ok: true, text: r.data.recalculated ? `Salvo · ${r.data.recalculated} produto(s) recalculado(s)` : "Salvo" });
        if (isNew) setF(item);
        router.refresh();
      });
    }}>
      <Input className="h-9" placeholder="chave" value={f.key} onChange={(e) => setF({ ...f, key: e.target.value })} aria-label="Chave" required />
      <Input className="h-9" placeholder={isNew ? "Novo item — descrição" : "Descrição"} value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} aria-label="Descrição" required />
      <Input className="h-9" placeholder="un" value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} aria-label="Unidade" required />
      <Input className="h-9" placeholder="Preço (R$)" inputMode="decimal" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} aria-label="Preço" required />
      <Select className="h-9" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} aria-label="Categoria" disabled={!!item.uses}>{categories.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</Select>
      <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={f.isActive} onChange={(e) => setF({ ...f, isActive: e.target.checked })} /> Ativo{item.uses ? ` · ${item.uses} prod.` : ""}</label>
      <div className="flex items-center gap-2">
        <Button type="submit" variant={isNew ? "primary" : "secondary"} className="h-9 px-4 text-xs" disabled={pending || !dirty}>{isNew ? "Adicionar" : "Salvar"}</Button>
        {msg && <span className={`text-xs ${msg.ok ? "text-success" : "text-danger"}`}>{msg.text}</span>}
      </div>
    </form>
  );
}
