"use client";
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { applyPricesAction, setMarkupAction, setProfileAction } from "@/modules/admin/price-table-actions";
import { PRICING_LABEL, divisorBps, formatMarkup, parseMarkup, rowPricing, validateMarkup, type MarkupProfileRule, type PricingState } from "@/modules/pricing/markup";
import { formatBRL } from "@/lib/money";

export type Row = { id: string; code: string | null; name: string; description: string | null; category: string; image: string | null; isActive: boolean; archived: boolean; variants: number; mixedSitePrices: boolean; costCents: number | null; markup: number | null; profileId: string | null; sitePriceCents: number | null; state: PricingState };
export type ProfileOpt = MarkupProfileRule & { id: string; name: string };
const TONE: Record<PricingState, string> = { sem_custo: "bg-[#f5e4e0] text-[#a24a3a]", sem_markup: "bg-[#f3ead6] text-[#7a5a17]", abaixo_custo: "bg-[#f5e4e0] text-[#a24a3a]", abaixo_minimo: "bg-[#f5e4e0] text-[#a24a3a]", desatualizado: "bg-[#e6eef4] text-[#2d5872]", ok: "bg-[#e3efe6] text-[#2f6b45]" };
const pct = (bps: number | null) => (bps == null ? "—" : `${(bps / 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);

const MANUAL = "__manual";
const divTxt = (p: ProfileOpt) => `÷ ${(divisorBps(p, "ideal") / 10_000).toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`;

export function PriceTable({ initial, profiles }: { initial: Row[]; profiles: ProfileOpt[] }) {
  const byId = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);
  const [manualOpen, setManualOpen] = useState<Set<string>>(new Set());
  const [bulkProfile, setBulkProfile] = useState("");
  const [rows, setRows] = useState(initial);
  useEffect(() => setRows(initial), [initial]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const view = useMemo(() => rows.map((r) => {
    const raw = draft[r.id];
    const m = raw === undefined ? r.markup : parseMarkup(raw);
    const invalid = raw !== undefined && !!validateMarkup(m);
    const mk = invalid ? null : m;
    const profile = r.profileId ? byId.get(r.profileId) ?? null : null;
    const pr = rowPricing({ costCents: r.costCents, markup: mk, profile, sitePriceCents: r.sitePriceCents });
    const calc = pr.calc;
    return { ...r, profile, editing: raw !== undefined, invalid, liveMarkup: mk, calc, min: pr.min, margin: pr.marginBps, siteMargin: pr.siteMarginBps, diff: calc != null && r.sitePriceCents != null ? calc - r.sitePriceCents : null, liveState: invalid ? r.state : pr.state };
  }), [rows, draft, byId]);

  const recompute = (x: Row, patch: Partial<Row>): Row => { const n = { ...x, ...patch }; const profile = n.profileId ? byId.get(n.profileId) ?? null : null; return { ...n, state: rowPricing({ costCents: n.costCents, markup: n.markup, profile, sitePriceCents: n.sitePriceCents }).state }; };
  const saveProfile = (ids: string[], profileId: string | null, after?: () => void) => start(async () => {
    const r = await setProfileAction(ids, profileId);
    if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
    setRows((rs) => rs.map((x) => (ids.includes(x.id) ? recompute(x, { profileId }) : x)));
    const name = profileId ? byId.get(profileId)?.name : null;
    setMsg({ ok: true, text: ids.length > 1 ? `Markup ${name ? `“${name}”` : "removido"} em ${ids.length} produtos.` : name ? `Markup “${name}” aplicado.` : "Markup removido." });
    after?.(); router.refresh();
  });

  const saveMarkup = (ids: string[], value: string, after?: () => void) => start(async () => {
    const r = await setMarkupAction(ids, value);
    if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
    setRows((rs) => rs.map((x) => (ids.includes(x.id) ? recompute(x, { markup: r.data.markup, profileId: null }) : x)));
    setDraft((d) => { const n = { ...d }; ids.forEach((i) => delete n[i]); return n; });
    setMsg({ ok: true, text: ids.length > 1 ? `Markup ${value ? formatMarkup(r.data.markup) : "removido"} em ${ids.length} produtos.` : "Markup salvo." });
    after?.(); router.refresh();
  });
  const commit = (r: (typeof view)[number]) => {
    const raw = draft[r.id]; if (raw === undefined) return;
    if (r.invalid) { setMsg({ ok: false, text: `${r.code ?? r.name}: ${validateMarkup(parseMarkup(raw))}` }); return; }
    if (parseMarkup(raw) === r.markup) { setDraft((d) => { const n = { ...d }; delete n[r.id]; return n; }); return; }
    saveMarkup([r.id], raw);
  };
  const apply = (ids: string[]) => {
    const list = view.filter((r) => ids.includes(r.id));
    const changes = list.filter((r) => r.calc != null && r.calc !== r.sitePriceCents && (r.profile || (r.liveMarkup ?? 0) >= 10_000));
    if (!changes.length) { setMsg({ ok: false, text: "Nenhum preço para atualizar: os selecionados já estão em dia, estão sem custo/markup ou com markup abaixo de 1." }); return; }
    if (!confirm(`Atualizar o preço de venda no site de ${changes.length} produto(s) para o preço calculado pelo markup?`)) return;
    start(async () => {
      const r = await applyPricesAction(changes.map((c) => c.id));
      if (!r.ok) { setMsg({ ok: false, text: r.error }); return; }
      setRows((rs) => rs.map((x) => { const c = changes.find((y) => y.id === x.id); return c && r.data.applied.includes(x.code ?? x.name) ? { ...x, sitePriceCents: c.calc, mixedSitePrices: false, state: "ok" } : x; }));
      setMsg({ ok: true, text: `Preço atualizado no site: ${r.data.applied.length} produto(s).${r.data.skipped.length ? ` Pulados: ${r.data.skipped.map((s) => `${s.name} (${s.reason})`).join(", ")}.` : ""}` });
      setSel(new Set()); router.refresh();
    });
  };
  const allSel = view.length > 0 && view.every((r) => sel.has(r.id));

  return (
    <div>
      <div className="sticky top-0 z-10 mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-white/95 p-3 backdrop-blur" aria-live="polite">
        <span className="text-sm">{sel.size ? `${sel.size} selecionado(s)` : "Selecione produtos para alterar em massa"}</span>
        <span className="flex items-center gap-2 text-sm">Markup
          <select className="h-9 rounded border border-line px-2" value={bulkProfile} onChange={(e) => setBulkProfile(e.target.value)} aria-label="Markup para os selecionados" data-bulk-profile>
            <option value="">Escolha…</option>{profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}<option value={MANUAL}>Manual (multiplicador)</option>
          </select>
          {bulkProfile === MANUAL && <input className="h-9 w-20 rounded border border-line px-2 text-right" placeholder="2,50" value={bulk} onChange={(e) => setBulk(e.target.value)} aria-label="Multiplicador para os selecionados" />}
        </span>
        <button className="h-9 rounded border border-ink/70 px-3 text-sm disabled:opacity-40" data-bulk-apply
          disabled={!sel.size || pending || !bulkProfile || (bulkProfile === MANUAL && (!bulk.trim() || !!validateMarkup(parseMarkup(bulk))))}
          onClick={() => bulkProfile === MANUAL ? saveMarkup([...sel], bulk, () => setBulk("")) : saveProfile([...sel], bulkProfile)}>Aplicar markup</button>
        <button className="h-9 rounded bg-accent px-4 text-sm text-accent-ink disabled:opacity-40" disabled={!sel.size || pending} onClick={() => apply([...sel])}>Atualizar preço no site</button>
        {msg && <span className={`text-sm ${msg.ok ? "text-success" : "text-danger"}`} role="status">{msg.text}</span>}
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[1080px] text-left text-sm">
          <thead className="border-b border-line text-[11px] uppercase tracking-label text-muted">
            <tr>
              <th className="w-10 px-3 py-3"><input type="checkbox" checked={allSel} onChange={() => setSel(allSel ? new Set() : new Set(view.map((r) => r.id)))} aria-label="Selecionar todos" /></th>
              {["Foto", "Produto e descrição", "Custo final", "Markup", "Preço calculado", "Margem", "Preço atual no site", "Situação", ""].map((h) => <th key={h} className="whitespace-nowrap px-3 py-3 font-normal">{h}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {view.map((r) => (
              <tr key={r.id} className={`align-top ${sel.has(r.id) ? "bg-ink/[0.03]" : ""} ${r.archived ? "opacity-60" : ""}`} data-row={r.code ?? r.name}>
                <td className="px-3 py-3"><input type="checkbox" checked={sel.has(r.id)} onChange={() => setSel((s) => { const n = new Set(s); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })} aria-label={`Selecionar ${r.name}`} /></td>
                <td className="px-3 py-3"><div className="h-16 w-16 overflow-hidden rounded bg-[#ece8e1]">{r.image ? <img src={r.image} alt={r.name} className="h-full w-full object-cover" loading="lazy" /> : <span className="grid h-full place-items-center text-[10px] text-muted">sem foto</span>}</div></td>
                <td className="max-w-[340px] px-3 py-3">
                  <div className="flex flex-wrap items-baseline gap-x-2"><span className="font-mono text-xs text-muted">{r.code ?? "—"}</span><Link className="font-medium hover:underline" href={`/admin/produtos/${r.id}`}>{r.name}</Link></div>
                  <p className="text-xs text-muted">{r.category}{r.variants > 1 ? ` · ${r.variants} variações` : ""}{!r.isActive ? " · inativo" : ""}{r.archived ? " · arquivado" : ""}</p>
                  {r.description ? <p className="mt-1 line-clamp-2 text-xs" title={r.description}>{r.description}</p> : <p className="mt-1 text-xs text-muted">Sem descrição</p>}
                </td>
                <td className="whitespace-nowrap px-3 py-3">{r.costCents != null ? formatBRL(r.costCents) : <Link className="text-xs text-danger underline" href={`/admin/produtos/${r.id}`}>cadastrar custo</Link>}</td>
                <td className="px-3 py-3">
                  <select className="h-9 max-w-[190px] rounded border border-line px-2 text-sm" aria-label={`Markup de ${r.name}`} data-profile-select
                    value={r.profileId ?? (r.markup != null || manualOpen.has(r.id) ? MANUAL : "")}
                    onChange={(e) => { const v = e.target.value; if (v === MANUAL) { setManualOpen((s) => new Set(s).add(r.id)); if (r.profileId) { if (r.markup != null) saveMarkup([r.id], formatMarkup(r.markup)); else saveProfile([r.id], null); } } else saveProfile([r.id], v || null); }}>
                    <option value="">— sem markup —</option>{profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}<option value={MANUAL}>Manual (multiplicador)</option>
                  </select>
                  {r.profile ? <p className="mt-1 text-xs text-muted">{divTxt(r.profile)}</p> : (r.markup != null || manualOpen.has(r.id)) && (
                    <input className={`mt-1 h-9 w-20 rounded border px-2 text-right ${r.invalid ? "border-danger" : r.editing ? "border-ink" : "border-line"}`} inputMode="decimal" placeholder="2,50"
                      value={draft[r.id] ?? formatMarkup(r.markup)} onChange={(e) => setDraft((d) => ({ ...d, [r.id]: e.target.value }))}
                      onBlur={() => commit(r)} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setDraft((d) => { const n = { ...d }; delete n[r.id]; return n; }); }}
                      aria-label={`Multiplicador de ${r.name}`} />)}
                </td>
                <td className="whitespace-nowrap px-3 py-3" data-calc><span className="font-medium">{r.calc != null ? formatBRL(r.calc) : "—"}</span>{r.min != null && <div className="text-xs text-muted">mínimo {formatBRL(r.min)}</div>}</td>
                <td className={`whitespace-nowrap px-3 py-3 ${r.margin != null && r.margin < 0 ? "text-danger" : ""}`}>{pct(r.margin)}{r.siteMargin != null && r.sitePriceCents !== r.calc && <div className={`text-xs ${r.profile && r.siteMargin < r.profile.minMarginBps ? "text-danger" : "text-muted"}`}>no site: {pct(r.siteMargin)}</div>}</td>
                <td className="whitespace-nowrap px-3 py-3">{r.sitePriceCents != null ? formatBRL(r.sitePriceCents) : <span className="text-muted">sem preço</span>}
                  {r.diff != null && r.diff !== 0 && <div className={`text-xs ${r.diff > 0 ? "text-success" : "text-danger"}`}>{r.diff > 0 ? "+" : "−"}{formatBRL(Math.abs(r.diff))} p/ calculado</div>}
                  {r.mixedSitePrices && <div className="text-xs text-muted">variações com preços diferentes</div>}</td>
                <td className="px-3 py-3"><span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] ${TONE[r.liveState]}`}>{PRICING_LABEL[r.liveState]}</span></td>
                <td className="px-3 py-3 text-right">{(r.liveState === "desatualizado" || r.liveState === "abaixo_minimo") && !r.editing && <button className="whitespace-nowrap text-xs underline underline-offset-2" disabled={pending} onClick={() => apply([r.id])} data-apply={r.code}>Atualizar no site</button>}</td>
              </tr>
            ))}
            {view.length === 0 && <tr><td colSpan={10} className="p-8 text-center text-muted">Nenhum produto encontrado.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
