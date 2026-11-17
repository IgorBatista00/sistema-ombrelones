import Link from "next/link";
import type { recentMovements } from "@/modules/inventory/admin-queries";
import { MOVEMENT_LABEL } from "@/modules/inventory/movements-rules";
import { Badge } from "@/components/ui/misc";

export function MovesTable({ moves, withProduct }: { moves: Awaited<ReturnType<typeof recentMovements>>; withProduct?: boolean }) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-line text-[11px] uppercase tracking-label text-muted"><tr>{["Data", ...(withProduct ? ["Produto"] : []), "Tipo", "Qtd.", "Saldo após", "Motivo", "Usuário"].map((h) => <th key={h} className="whitespace-nowrap px-4 py-3 font-normal">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-line">
          {moves.map((m) => (
            <tr key={m.id}>
              <td className="whitespace-nowrap px-4 py-2">{m.createdAt.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</td>
              {withProduct && <td className="px-4 py-2"><Link href={`/admin/estoque/${m.variantId}`} className="link">{m.sku}</Link> <span className="text-muted">· {m.productName}</span></td>}
              <td className="px-4 py-2"><Badge tone={m.type === "ENTRADA" ? "success" : m.type === "AJUSTE" ? "neutral" : "warning"}>{MOVEMENT_LABEL[m.type]}</Badge></td>
              <td className={`px-4 py-2 ${m.delta < 0 ? "text-danger" : "text-success"}`}>{m.delta > 0 ? "+" : ""}{m.delta}</td>
              <td className="px-4 py-2">{m.balanceAfter ?? "—"}</td>
              <td className="px-4 py-2">{m.reason}{(m.notes || m.reference) && <div className="text-xs text-muted">{[m.reference, m.notes].filter(Boolean).join(" · ")}</div>}</td>
              <td className="px-4 py-2 text-muted">{m.actor}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {moves.length === 0 && <p className="p-6 text-center text-sm text-muted">Sem movimentações.</p>}
    </div>
  );
}
