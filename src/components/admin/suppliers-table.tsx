"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { removeSupplierAction } from "@/modules/admin/product-actions";
import { formatCnpj } from "@/modules/companies/cnpj";
import { SupplierDialog, type SupplierOption } from "./product-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Badge, Notice } from "@/components/ui/misc";

type Row = SupplierOption & { notes: string | null; isActive: boolean; products: number };

export function SuppliersTable({ rows, q, showInactive }: { rows: Row[]; q: string; showInactive: boolean }) {
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <form className="flex gap-2"><Input name="q" defaultValue={q} placeholder="Razão social, fantasia, CNPJ ou contato" className="h-10 w-80" aria-label="Buscar" />{showInactive && <input type="hidden" name="inativos" value="1" />}<Button type="submit" variant="secondary" className="h-10 px-4">Buscar</Button></form>
        <Link href={showInactive ? "/admin/fornecedores" : "/admin/fornecedores?inativos=1"} className="link text-sm">{showInactive ? "Ocultar inativos" : "Mostrar inativos"}</Link>
        <Button className="ml-auto h-10 px-5" onClick={() => setEditing("new")}>Cadastrar fornecedor</Button>
      </div>
      {msg && <div className="mb-4"><Notice tone="success">{msg}</Notice></div>}
      <div className="card overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-[11px] uppercase tracking-label text-muted"><tr>{["Razão social", "Nome fantasia", "CNPJ", "Contato", "Telefone", "Produtos", ""].map((h) => <th key={h} className="whitespace-nowrap px-4 py-3 font-normal">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-line">
            {rows.map((s) => (
              <tr key={s.id}>
                <td className="px-4 py-3">{s.legalName} {!s.isActive && <Badge>Inativo</Badge>}</td>
                <td className="px-4 py-3">{s.tradeName ?? "—"}</td>
                <td className="whitespace-nowrap px-4 py-3">{s.cnpj ? formatCnpj(s.cnpj) : "—"}</td>
                <td className="px-4 py-3">{s.contact ?? "—"}</td>
                <td className="whitespace-nowrap px-4 py-3">{s.phone ?? "—"}</td>
                <td className="px-4 py-3">{s.products ? <Link className="link" href={`/admin/produtos?q=${encodeURIComponent(s.tradeName ?? s.legalName)}`}>{s.products}</Link> : 0}</td>
                <td className="whitespace-nowrap px-4 py-3 text-xs">
                  <button className="link mr-3" onClick={() => setEditing(s)}>Editar</button>
                  {confirmId === s.id
                    ? <span className="text-danger">{s.products ? "Desativar (tem produtos)?" : "Excluir?"} <button className="font-medium" disabled={pending} onClick={() => start(async () => {
                        const r = await removeSupplierAction(s.id);
                        setConfirmId(null);
                        setMsg(r.ok ? (r.data.deactivated ? `Fornecedor desativado — vinculado a ${r.data.links} produto(s), histórico preservado.` : "Fornecedor excluído.") : r.error);
                        router.refresh();
                      })}>Sim</button> <button className="text-muted" onClick={() => setConfirmId(null)}>Não</button></span>
                    : s.isActive && <button className="text-danger hover:underline" onClick={() => setConfirmId(s.id)}>Excluir</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="p-8 text-center text-sm text-muted">Nenhum fornecedor.</p>}
      </div>
      {editing && <SupplierDialog initial={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); setMsg("Fornecedor salvo."); router.refresh(); }} />}
    </>
  );
}
