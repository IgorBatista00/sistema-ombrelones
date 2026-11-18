/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { requireAdminPage } from "@/modules/auth/session";
import { db } from "@/lib/db";
import { formatBRL } from "@/lib/money";
import { categoriesForAdmin } from "@/modules/products/categories";
import { CategoriesManager } from "@/components/admin/categories-manager";
import { getColorOptions, listAdminProducts, type AdminProductFilters } from "@/modules/products/admin-queries";
import { BulkDeleteBar, DeleteProductButton, ImportProductsButton, ProductCheckbox, SelectAllProducts } from "@/components/admin/product-list-actions";
import { PageHead } from "@/components/admin/ui";
import { ButtonLink } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { Badge } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";

const ALERTS = [["sem-foto", "Sem foto"], ["sem-fornecedor", "Sem fornecedor"], ["sem-preco", "Sem preço"], ["sem-custo", "Sem custo"], ["margem-baixa", "Margem abaixo de 15%"]] as const;
const m3 = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

export default async function ProductsAdmin({ searchParams }: { searchParams: Promise<AdminProductFilters> }) {
  await requireAdminPage("PRODUCTS");
  const sp = await searchParams;
  const [rows, categories, colors, catsFull] = await Promise.all([
    listAdminProducts(sp),
    db.category.findMany({ orderBy: { position: "asc" }, select: { id: true, name: true } }),
    getColorOptions(),
    categoriesForAdmin(),
  ]);
  const qs = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]).toString();
  const alertCount = (k: string) => rows.filter((r) => r.alerts.includes(k)).length;

  return (
    <>
      <PageHead title="Produtos" subtitle={`${rows.length} ${rows.length === 1 ? "produto" : "produtos"}${qs ? " (filtrados)" : ""}`}
        action={<div className="flex flex-wrap gap-2">
          <a href={`/api/admin/products/export${qs ? `?${qs}` : ""}`} className="inline-flex h-10 items-center rounded border border-ink/80 px-4 text-sm hover:bg-ink hover:text-canvas">Exportar Excel</a>
          <CategoriesManager categories={catsFull} />
          <ImportProductsButton />
          <ButtonLink href="/admin/produtos/novo" className="h-10 px-5">Cadastrar</ButtonLink>
        </div>} />

      <form className="mb-4 grid gap-3 md:grid-cols-[2fr_repeat(4,1fr)_auto]">
        <Input name="q" defaultValue={sp.q} placeholder="Código, nome, categoria ou fornecedor" className="h-10" aria-label="Buscar" />
        <Select name="categoria" defaultValue={sp.categoria ?? ""} className="h-10" aria-label="Categoria"><option value="">Todas as categorias</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        <Select name="status" defaultValue={sp.status ?? ""} className="h-10" aria-label="Status"><option value="">Ativos e inativos</option><option value="ativo">Ativos</option><option value="inativo">Inativos</option><option value="arquivado">Arquivados</option></Select>
        <Select name="cor" defaultValue={sp.cor ?? ""} className="h-10" aria-label="Cor"><option value="">Todas as cores</option>{colors.map((c) => <option key={c} value={c}>{c}</option>)}</Select>
        <Select name="alerta" defaultValue={sp.alerta ?? ""} className="h-10" aria-label="Pendências"><option value="">Sem filtro de pendência</option>{ALERTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
        <Button type="submit" className="h-10">Filtrar</Button>
      </form>

      <div className="mb-6 flex flex-wrap gap-2 text-xs">
        {ALERTS.map(([k, l]) => { const n = alertCount(l === "Margem abaixo de 15%" ? "Margem baixa" : l); return n > 0 && !sp.alerta ? <Link key={k} href={`?alerta=${k}`} className="rounded-full border border-warning/40 bg-warning/5 px-3 py-1 text-warning hover:bg-warning/10">{n} {l.toLowerCase()}</Link> : null; })}
      </div>

      <BulkDeleteBar total={rows.length} />

      {/* Desktop: tabela */}
      <div className="card hidden overflow-x-auto lg:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-[11px] uppercase tracking-label text-muted">
            <tr><th className="w-10 px-3 py-3">{rows.length > 0 && <SelectAllProducts />}</th>{["Cód.", "Foto", "Produto", "Cor", "Categoria", "Fornecedor princ.", "Custo final", "Preço atacado", "Margem", "Cubagem", "Status", ""].map((h) => <th key={h} className="whitespace-nowrap px-3 py-3 font-normal">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-ink/[0.02] has-[:checked]:bg-accent/[0.06]">
                <td className="px-3 py-2"><ProductCheckbox id={r.id} name={r.name} /></td>
                <td className="whitespace-nowrap px-3 py-2 font-medium">{r.code ?? <span className="text-warning">sem código</span>}</td>
                <td className="px-3 py-2"><Thumb url={r.image} /></td>
                <td className="max-w-64 px-3 py-2"><Link href={`/admin/produtos/${r.id}`} className="link">{r.name}</Link>{r.alerts.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{r.alerts.map((a) => <Badge key={a} tone="warning">{a}</Badge>)}</div>}</td>
                <td className="whitespace-nowrap px-3 py-2 text-muted">{r.color ?? "—"}</td>
                <td className="whitespace-nowrap px-3 py-2">{r.category}</td>
                <td className="max-w-40 truncate px-3 py-2">{r.supplier ?? <span className="text-muted">—</span>}</td>
                <td className="whitespace-nowrap px-3 py-2">{r.costFinalCents == null ? "—" : formatBRL(r.costFinalCents)}</td>
                <td className="whitespace-nowrap px-3 py-2">{r.priceCents == null ? "—" : formatBRL(r.priceCents)}</td>
                <td className={`whitespace-nowrap px-3 py-2 ${r.marginBps != null && r.marginBps < 1500 ? "text-danger" : ""}`}>{r.marginBps == null ? "—" : `${(r.marginBps / 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`}</td>
                <td className="whitespace-nowrap px-3 py-2">{r.cubage ? m3(r.cubage) : "—"}</td>
                <td className="px-3 py-2">{r.archived ? <Badge tone="danger">Arquivado</Badge> : r.isActive ? <Badge tone="success">Ativo</Badge> : <Badge>Inativo</Badge>}</td>
                <td className="whitespace-nowrap px-3 py-2"><RowActions id={r.id} name={r.name} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="p-8 text-center text-sm text-muted">Nenhum produto encontrado.</p>}
      </div>
      <div className="h-20" aria-hidden /> {/* espaço para a barra de seleção não cobrir a última linha */}

      {/* Mobile: cards */}
      <div className="space-y-3 lg:hidden">
        {rows.map((r) => (
          <div key={r.id} className="card flex gap-3 p-4 has-[:checked]:ring-1 has-[:checked]:ring-accent">
            <div className="pt-1"><ProductCheckbox id={r.id} name={r.name} /></div>
            <Thumb url={r.image} size={64} />
            <div className="min-w-0 flex-1 text-sm">
              <p className="text-xs text-muted">{r.code ?? "sem código"} · {r.category}{r.color && ` · ${r.color}`}</p>
              <Link href={`/admin/produtos/${r.id}`} className="font-medium">{r.name}</Link>
              <p className="mt-1 text-xs text-muted">{r.supplier ?? "Sem fornecedor"} · Custo {r.costFinalCents == null ? "—" : formatBRL(r.costFinalCents)} · {r.cubage ? `${m3(r.cubage)} m³` : "sem cubagem"}</p>
              <div className="mt-2 flex flex-wrap items-center gap-1">{r.isActive ? <Badge tone="success">Ativo</Badge> : <Badge>Inativo</Badge>}{r.alerts.map((a) => <Badge key={a} tone="warning">{a}</Badge>)}</div>
              <div className="mt-3"><RowActions id={r.id} name={r.name} /></div>
            </div>
          </div>
        ))}
      </div>

    </>
  );
}

function Thumb({ url, size = 44 }: { url: string | null; size?: number }) {
  return url
    ? <img src={url} alt="" width={size} height={size} className="shrink-0 rounded object-cover" style={{ width: size, height: size }} loading="lazy" />
    : <div className="flex shrink-0 items-center justify-center rounded bg-[#ece8e1] text-muted" style={{ width: size, height: size }} aria-label="Sem foto">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" /><path d="m3 8 9 5 9-5M12 13v8" /></svg>
      </div>;
}

function RowActions({ id, name }: { id: string; name: string }) {
  return (
    <span className="flex items-center gap-3 text-xs">
      <Link href={`/admin/produtos/${id}`} className="link">Editar</Link>
      <Link href={`/admin/produtos/${id}/duplicar`} className="link">Duplicar</Link>
      <DeleteProductButton id={id} name={name} />
    </span>
  );
}
