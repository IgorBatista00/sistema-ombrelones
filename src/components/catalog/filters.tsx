"use client";
import { useRouter, usePathname } from "next/navigation";
import { useState } from "react";
import { Input, Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

const OPENING_LABEL: Record<string, string> = { MANIVELA: "Manivela", MANUAL: "Manual", ALAVANCA: "Alavanca", AUTOMATICA: "Automática", OUTRO: "Outro" };

type Opt = { value: string; label: string };
interface Props {
  categories: Opt[];
  facets: { sizes: string[]; colors: string[]; openings: string[] };
  values: Record<string, string | number | undefined>;
  canSortByPrice: boolean;
  /** /produtos ou /categorias/<slug>: a categoria é o próprio endereço (não vira parâmetro). */
  basePath?: string;
}

/**
 * Formulário GET: funciona sem JavaScript (progressive enhancement).
 * No mobile, os filtros ficam recolhidos atrás de um botão.
 */
export function CatalogFilters({ categories, facets, values, canSortByPrice, basePath }: Props) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const current = usePathname();
  const pathname = basePath ?? current;
  const v = (k: string) => (values[k] == null ? "" : String(values[k]));
  const activeCount = ["categoria", "dimensao", "cor", "abertura", "disponibilidade"].filter((k) => values[k]).length;

  const submitOnChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const form = e.currentTarget.form!;
    const q = new URLSearchParams();
    new FormData(form).forEach((val, key) => { if (String(val) && key !== "categoria" && key !== "pagina") q.set(key, String(val)); });
    const cat = String(new FormData(form).get("categoria") ?? "");
    const path = cat ? `/categorias/${cat}` : "/produtos"; // categoria = endereço próprio
    router.push(`${path}${q.size ? `?${q}` : ""}`, { scroll: e.target.name === "categoria" ? true : false });
  };

  return (
    <aside aria-label="Filtros">
      <button type="button" className="flex h-12 w-full items-center justify-between rounded border border-line px-4 text-sm lg:hidden" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        Filtrar e ordenar {activeCount > 0 && <span className="text-muted">({activeCount})</span>}
        <span aria-hidden>{open ? "−" : "+"}</span>
      </button>
      <form method="get" action={pathname} className={`${open ? "mt-6 block" : "hidden"} space-y-6 lg:block`}>
        <div className="space-y-2">
          <label htmlFor="q" className="label block">Nome ou SKU</label>
          <Input id="q" name="q" defaultValue={v("q")} placeholder="Ex.: ombrelone 3 m" />
        </div>
        <FilterSelect name="categoria" label="Categoria" value={v("categoria")} options={categories} onChange={submitOnChange} />
        {facets.sizes.length > 0 && <FilterSelect name="dimensao" label="Dimensão" value={v("dimensao")} options={facets.sizes.map((s) => ({ value: s, label: s }))} onChange={submitOnChange} />}
        {facets.colors.length > 0 && <FilterSelect name="cor" label="Cor" value={v("cor")} options={facets.colors.map((s) => ({ value: s, label: s }))} onChange={submitOnChange} />}
        {facets.openings.length > 0 && <FilterSelect name="abertura" label="Tipo de abertura" value={v("abertura")} options={facets.openings.map((s) => ({ value: s, label: OPENING_LABEL[s] ?? s }))} onChange={submitOnChange} />}
        <FilterSelect name="disponibilidade" label="Disponibilidade" value={v("disponibilidade")} options={[{ value: "in_stock", label: "Pronta entrega" }, { value: "made_to_order", label: "Sob encomenda" }]} onChange={submitOnChange} />
        <FilterSelect name="ordem" label="Ordenar por" value={v("ordem")} placeholder="Nome (A–Z)"
          options={canSortByPrice ? [{ value: "price_asc", label: "Menor preço" }, { value: "price_desc", label: "Maior preço" }] : []} onChange={submitOnChange} />
        <div className="flex gap-2">
          <Button type="submit" className="flex-1">Aplicar</Button>
          {activeCount + (values.q ? 1 : 0) > 0 && <a href={pathname} className="flex h-12 items-center px-3 text-sm text-muted hover:text-ink">Limpar</a>}
        </div>
      </form>
    </aside>
  );
}

function FilterSelect({ name, label, value, options, onChange, placeholder = "Todos" }: { name: string; label: string; value: string; options: Opt[]; onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void; placeholder?: string }) {
  return (
    <div className="space-y-2">
      <label htmlFor={name} className="label block">{label}</label>
      <Select id={name} name={name} defaultValue={value} onChange={onChange}>
        <option value="">{placeholder}</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </Select>
    </div>
  );
}
