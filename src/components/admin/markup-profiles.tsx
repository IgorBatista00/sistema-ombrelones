"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { deleteProfileAction, saveProfileAction } from "@/modules/admin/price-table-actions";
import { COST_FIELDS, fmtPct, parsePct, pctInput, summarizeProfile, validateProfile, type MarkupProfileRule } from "@/modules/pricing/markup";
import { formatBRL } from "@/lib/money";

export type ProfileView = MarkupProfileRule & { id: string; name: string; products: number };
type Draft = Record<string, string> & { name: string };
const KEYS = [...COST_FIELDS.map((f) => f.key), "idealMarginBps", "minMarginBps"] as const;
const LABELS: Record<string, string> = { ...Object.fromEntries(COST_FIELDS.map((f) => [f.key, f.label])), idealMarginBps: "Margem ideal", minMarginBps: "Margem mínima" };
const toDraft = (p?: ProfileView): Draft => ({ name: p?.name ?? "", ...Object.fromEntries(KEYS.map((k) => [k, p ? pctInput(p[k]) : ""])) }) as Draft;
const toRule = (d: Draft): MarkupProfileRule | null => {
  const out: Record<string, number> = {};
  for (const k of KEYS) { const v = parsePct(d[k]); if (v != null && Number.isNaN(v)) return null; out[k] = v ?? 0; }
  return out as unknown as MarkupProfileRule;
};
const div = (bps: number) => (bps / 10_000).toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const mult = (bps: number | null) => (bps == null ? "—" : `${(bps / 10_000).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}×`);

export function MarkupProfiles({ initial }: { initial: ProfileView[] }) {
  const [list, setList] = useState<(ProfileView | { id: null; key: string })[]>(initial);
  useEffect(() => setList((l) => [...l.filter((x) => x.id === null), ...initial]), [initial]);
  const add = () => setList((l) => [{ id: null, key: String(Date.now()) }, ...l]);
  return (
    <div>
      <div className="mb-4 flex justify-end"><button className="inline-flex h-10 items-center gap-2 rounded bg-accent px-4 text-sm text-accent-ink" onClick={add} data-new-markup>+ Novo markup</button></div>
      {list.length === 0 && <div className="card p-8 text-center text-sm text-muted">Nenhum markup cadastrado. Clique em “Novo markup” para criar o primeiro (ex.: Consumidor Final 6x, Revenda à vista).</div>}
      <div className="grid gap-4 lg:grid-cols-2">
        {list.map((p) => <ProfileCard key={p.id ?? (p as { key: string }).key} profile={p.id ? (p as ProfileView) : undefined} onCancelNew={() => setList((l) => l.filter((x) => x !== p))} />)}
      </div>
    </div>
  );
}

function ProfileCard({ profile, onCancelNew }: { profile?: ProfileView; onCancelNew: () => void }) {
  const [d, setD] = useState<Draft>(() => toDraft(profile));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const rule = toRule(d);
  const s = rule ? summarizeProfile(rule) : null;
  const err = !rule ? "Algum percentual está inválido. Use números como 5,7." : validateProfile({ ...rule, name: d.name });
  const dirty = JSON.stringify(d) !== JSON.stringify(toDraft(profile));
  const ex = 10_000; // custo de exemplo: R$ 100,00

  const save = () => start(async () => {
    if (err) { setMsg({ ok: false, text: err }); return; }
    const r = await saveProfileAction({ ...d, ...(profile ? { id: profile.id } : {}) });
    if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
    setMsg({ ok: true, text: "Markup salvo." });
    if (!profile) onCancelNew();
    router.refresh();
  });
  const remove = () => {
    if (!profile) { onCancelNew(); return; }
    if (profile.products) { setMsg({ ok: false, text: `Esse markup está em ${profile.products} produto(s). Troque o markup deles na aba Tabela antes de excluir.` }); return; }
    if (!confirm(`Excluir o markup “${profile.name}”?`)) return;
    start(async () => { const r = await deleteProfileAction(profile.id); if (!r.ok) setMsg({ ok: false, text: r.error }); else router.refresh(); });
  };

  return (
    <section className="card p-5" data-profile={profile?.name ?? "novo"}>
      <div className="flex items-start gap-3">
        <input className="h-11 flex-1 rounded border border-line px-3 font-medium" placeholder="Nome do markup (ex.: Consumidor Final 6x)" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} aria-label="Nome do markup" />
        <button className="grid h-11 w-11 place-items-center rounded hover:bg-ink/5" onClick={remove} aria-label="Excluir markup" title="Excluir markup">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" /></svg>
        </button>
      </div>
      {profile && <p className="mt-1 text-xs text-muted">{profile.products ? `Usado em ${profile.products} produto(s)` : "Ainda não está em nenhum produto"}</p>}
      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
        {KEYS.map((k) => (
          <label key={k} className="block text-sm">{LABELS[k]} (%)
            <input className={`mt-1 h-10 w-full rounded border px-3 ${parsePct(d[k]) != null && Number.isNaN(parsePct(d[k])) ? "border-danger" : "border-line"}`} inputMode="decimal" placeholder="0" value={d[k]} onChange={(e) => setD({ ...d, [k]: e.target.value })} data-field={k} />
          </label>
        ))}
      </div>
      <div className="mt-4 rounded border border-line bg-ink/[0.02] p-4 text-sm" data-summary>
        <Line label="Total custos (%)" value={s ? fmtPct(s.costs) : "—"} />
        <Line label="Custos + margem mínima" value={s ? fmtPct(s.costsPlusMin) : "—"} />
        <Line label="Custos + margem ideal" value={s ? fmtPct(s.costsPlusIdeal) : "—"} />
        <hr className="my-2 border-line" />
        <Line label="Divisor (mínima)" value={s && s.divMin > 0 ? div(s.divMin) : "—"} strong />
        <Line label="Divisor (ideal)" value={s && s.divIdeal > 0 ? div(s.divIdeal) : "—"} strong />
        <Line label="Equivale a multiplicar o custo por" value={s ? `${mult(s.multIdeal)} (mín. ${mult(s.multMin)})` : "—"} />
        {s && s.divIdeal > 0 && <p className="mt-2 text-xs text-muted">Exemplo: custo de {formatBRL(ex)} → preço ideal {formatBRL(Math.round(ex * 10_000 / s.divIdeal))}{s.divMin > 0 ? ` · mínimo ${formatBRL(Math.round(ex * 10_000 / s.divMin))}` : ""}.</p>}
      </div>
      {(msg || (dirty && err)) && <p className={`mt-3 text-sm ${msg?.ok ? "text-success" : "text-danger"}`} role="status">{msg?.text ?? err}</p>}
      <button className="mt-4 h-11 w-full rounded bg-accent text-sm text-accent-ink disabled:opacity-50" disabled={pending || (!dirty && !!profile)} onClick={save}>{pending ? "Salvando…" : "Salvar"}</button>
    </section>
  );
}
const Line = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
  <div className="flex justify-between py-0.5"><span>{label}</span><span className={strong ? "font-semibold" : "font-medium"}>{value}</span></div>
);
