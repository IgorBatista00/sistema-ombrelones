"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { disconnectMlAction, syncMlAction } from "@/modules/admin/finance-actions";

/** `compact`: sem escolha de período (sincroniza os últimos 3 dias) — usado no Meu dia. */
export function MlSyncButton({ compact }: { compact?: boolean } = {}) {
  const [days, setDays] = useState(compact ? "3" : "30");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <span className="flex flex-wrap items-center gap-2">
      {!compact && <select className="h-10 rounded border border-line px-2 text-sm" value={days} onChange={(e) => setDays(e.target.value)} aria-label="Período da sincronização">
        <option value="7">Últimos 7 dias</option><option value="30">Últimos 30 dias</option><option value="60">Últimos 60 dias</option><option value="90">Últimos 90 dias</option>
      </select>}
      <button className={compact ? "h-8 rounded border border-ink/70 px-3 text-xs hover:bg-ink hover:text-canvas disabled:opacity-50" : "h-10 rounded bg-accent px-4 text-sm text-accent-ink disabled:opacity-50"} disabled={pending} onClick={() => start(async () => {
        setMsg(null);
        const r = await syncMlAction(Number(days));
        if (!r.ok) return setMsg({ ok: false, text: r.error });
        setMsg({ ok: true, text: `${r.data.orders} pedido(s) lidos, ${r.data.saved} recebimento(s) atualizados.${r.data.capped ? " Limite por sincronização atingido: sincronize de novo para continuar." : ""}` });
        router.refresh();
      })}>{pending ? "Sincronizando…" : compact ? "Atualizar Mercado Livre" : "Sincronizar agora"}</button>
      {msg && <span className={`text-sm ${msg.ok ? "text-success" : "text-danger"}`} role="status">{msg.text}</span>}
    </span>
  );
}

export function MlDisconnectButton() {
  const [pending, start] = useTransition();
  const router = useRouter();
  return <button className="text-sm text-danger underline-offset-2 hover:underline" disabled={pending} onClick={() => { if (confirm("Desconectar a conta do Mercado Livre? Os recebimentos já sincronizados continuam aqui; novas sincronizações exigirão conectar de novo.")) start(async () => { await disconnectMlAction(); router.refresh(); }); }}>Desconectar conta</button>;
}
