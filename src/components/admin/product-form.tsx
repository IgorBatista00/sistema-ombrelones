"use client";
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { saveProductFormAction, saveSupplierAction } from "@/modules/admin/product-actions";
import { COST_CATEGORIES, LEAD_TIMES, computeCost, cubicMeters, marginBps, parseDecimal, parseMoney, parsePercentBps, type CostCategory } from "@/modules/products/cost";
import { formatCnpj } from "@/modules/companies/cnpj";
import { MAX_PRODUCT_IMAGES } from "@/modules/products/limits";
import { formatBRL } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Badge, Notice } from "@/components/ui/misc";

// ---------------------------------------------------------------- tipos
export type SupplierOption = { id: string; legalName: string; tradeName: string | null; cnpj: string | null; contact: string | null; phone: string | null; email: string | null };
export type CostItemOption = { id: string; label: string; unit: string; priceCents: number; category: CostCategory };
type Img = { id?: string | null; url: string; storageKey?: string | null; alt: string };
type Pkg = { label: string; lengthCm: string; widthCm: string; heightCm: string; weightKg: string; quantity: number };
type Link_ = { id?: string | null; supplierId: string; supplierCode: string; leadTime: string; moq: string; cost: string; ipi: string; notes: string; isPrincipal: boolean };
type CostLine = { category: CostCategory; costItemId: string; quantity: string };
export interface FormValues {
  id: string | null; code: string; name: string; slug: string; categoryId: string; isActive: boolean; isFeatured: boolean;
  description: string; internalNotes: string; color: string; measureUnit: "CM" | "M";
  height: string; length: string; depth: string; diameter: string;
  frameMaterial: string; openingType: string; coverFeatures: string; weightKg: string; warranty: string; careInstructions: string;
  seoTitle: string; seoDescription: string;
  packages: Pkg[]; suppliers: Link_[]; costItems: CostLine[]; images: Img[];
}
export const EMPTY_FORM: FormValues = {
  id: null, code: "", name: "", slug: "", categoryId: "", isActive: true, isFeatured: false, description: "", internalNotes: "", color: "",
  measureUnit: "CM", height: "", length: "", depth: "", diameter: "", frameMaterial: "", openingType: "", coverFeatures: "", weightKg: "",
  warranty: "", careInstructions: "", seoTitle: "", seoDescription: "", packages: [], suppliers: [], costItems: [], images: [],
};

const OPENINGS = [["", "—"], ["MANIVELA", "Manivela"], ["MANUAL", "Manual"], ["ALAVANCA", "Alavanca"], ["AUTOMATICA", "Automática"], ["OUTRO", "Outro"]];
const pctFmt = (bps: number) => `${(bps / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;

// ---------------------------------------------------------------- componente
export function ProductForm(props: {
  initial: FormValues;
  mode: "new" | "edit" | "duplicate";
  draftKey: string;
  categories: { id: string; name: string }[];
  suppliers: SupplierOption[];
  costItems: CostItemOption[];
  wholesalePriceCents: number | null;
}) {
  const [v, setV] = useState<FormValues>(props.initial);
  const [suppliers, setSuppliers] = useState(props.suppliers);
  const [error, setError] = useState<string | null>(null);
  const [draftNotice, setDraftNotice] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [imgNotice, setImgNotice] = useState<string | null>(null);
  const [supplierDialog, setSupplierDialog] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const loaded = useRef(false);

  // ---- Rascunho automático (localStorage, 300 ms)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(props.draftKey);
      if (raw) {
        const d = JSON.parse(raw) as { v: FormValues; at: number };
        if (JSON.stringify(d.v) !== JSON.stringify(props.initial)) {
          setV({ ...EMPTY_FORM, ...d.v });
          setDraftNotice(props.mode === "edit" ? "Alterações não salvas recuperadas" : "Rascunho do produto recuperado");
        }
      }
    } catch { /* armazenamento indisponível: segue sem rascunho */ }
    loaded.current = true;
  }, [props.draftKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!loaded.current) return;
    const t = setTimeout(() => { try { localStorage.setItem(props.draftKey, JSON.stringify({ v, at: Date.now() })); } catch {} }, 300);
    return () => clearTimeout(t);
  }, [v, props.draftKey]);
  const discardDraft = () => { try { localStorage.removeItem(props.draftKey); } catch {} setV(props.initial); setDraftNotice(null); };

  const set = <K extends keyof FormValues>(k: K, val: FormValues[K]) => setV((s) => ({ ...s, [k]: val }));
  const up = (k: keyof FormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => set(k, e.target.value as never);

  // ---- Custo calculado na tela (mesmo motor do servidor)
  const cost = useMemo(() => computeCost(
    v.suppliers.map((s) => ({ costCents: parseMoney(s.cost), ipiBps: parsePercentBps(s.ipi), isPrincipal: s.isPrincipal })),
    v.costItems.flatMap((c) => {
      const item = props.costItems.find((i) => i.id === c.costItemId);
      const q = parseDecimal(c.quantity);
      return item && q ? [{ category: c.category, priceCents: item.priceCents, quantity: q }] : [];
    }),
  ), [v.suppliers, v.costItems, props.costItems]);
  const margin = marginBps(props.wholesalePriceCents, cost.finalCents);
  const cubage = cubicMeters(v.packages.flatMap((p) => {
    const [l, w, h] = [parseDecimal(p.lengthCm), parseDecimal(p.widthCm), parseDecimal(p.heightCm)];
    return l && w && h ? [{ lengthMm: l * 10, widthMm: w * 10, heightMm: h * 10, quantity: p.quantity || 1 }] : [];
  }));

  // ---- Fotos
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    const room = MAX_PRODUCT_IMAGES - v.images.length;
    if (room <= 0) { setImgNotice(`Este produto já tem ${MAX_PRODUCT_IMAGES} fotos, o máximo permitido. Remova uma para adicionar outra.`); return; }
    const chosen = [...files].slice(0, room);
    const skipped = files.length - chosen.length;
    setImgNotice(skipped > 0 ? `Limite de ${MAX_PRODUCT_IMAGES} fotos por produto: ${chosen.length === 1 ? "foi adicionada 1 foto" : `foram adicionadas ${chosen.length} fotos`} e ${skipped === 1 ? "1 ficou de fora" : `${skipped} ficaram de fora`}.` : null);
    setUploading(true); setError(null);
    const fd = new FormData();
    chosen.forEach((f) => fd.append("files", f));
    try {
      const res = await fetch("/api/admin/uploads", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) setError(`Erro no upload: ${json.error?.message ?? "tente novamente"}`);
      else set("images", [...v.images, ...json.data.map((f: { url: string; key: string }) => ({ url: f.url, storageKey: f.key, alt: "" }))].slice(0, MAX_PRODUCT_IMAGES));
    } catch { setError("Erro no upload: falha de conexão."); }
    setUploading(false);
  }
  const moveImg = (i: number, d: number) => { const a = [...v.images]; const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; set("images", a); };
  const makeMain = (i: number) => { const a = [...v.images]; const [img] = a.splice(i, 1); set("images", [img, ...a]); };

  // ---- Fornecedores
  const linked = new Set(v.suppliers.map((s) => s.supplierId));
  const addSupplier = (id: string) => {
    if (!id || linked.has(id)) return;
    set("suppliers", [...v.suppliers, { supplierId: id, supplierCode: "", leadTime: "", moq: "", cost: "", ipi: "", notes: "", isPrincipal: v.suppliers.length === 0 }]);
  };
  const updLink = (i: number, patch: Partial<Link_>) => set("suppliers", v.suppliers.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const removeLink = (i: number) => {
    const rest = v.suppliers.filter((_, j) => j !== i);
    if (rest.length && !rest.some((s) => s.isPrincipal)) rest[0] = { ...rest[0], isPrincipal: true }; // o primeiro assume
    set("suppliers", rest);
  };
  const makePrincipal = (i: number) => set("suppliers", v.suppliers.map((s, j) => ({ ...s, isPrincipal: j === i })));

  // ---- Custos adicionais
  const costLine = (cat: CostCategory) => v.costItems.find((c) => c.category === cat);
  const setCostLine = (cat: CostCategory, patch: Partial<CostLine>) => {
    const cur = costLine(cat) ?? { category: cat, costItemId: "", quantity: "" };
    const next = { ...cur, ...patch };
    set("costItems", next.costItemId ? [...v.costItems.filter((c) => c.category !== cat), next] : v.costItems.filter((c) => c.category !== cat));
  };

  // ---- Salvar
  const save = () => start(async () => {
    setError(null);
    if (!v.code.trim() || !v.name.trim()) { setError("Preencha o código (SKU) e o nome do produto."); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    if (!v.categoryId) { setError("Escolha a categoria."); return; }
    const r = await saveProductFormAction(v);
    if (!r.ok) { setError(r.error); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    try { localStorage.removeItem(props.draftKey); } catch {}
    router.push(`/admin/produtos/${r.data.id}?salvo=${props.mode === "edit" ? "atualizado" : "cadastrado"}`);
    router.refresh();
  });

  const unitLbl = v.measureUnit === "M" ? "m" : "cm";

  return (
    <div className="pb-28">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="label">{props.mode === "new" ? "Novo produto" : props.mode === "duplicate" ? "Duplicar produto" : "Editar produto"}</p>
          <h1 className="mt-1 font-sans text-2xl font-medium">{v.name || "Sem nome"}</h1>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/produtos" className="inline-flex h-10 items-center rounded px-4 text-sm hover:bg-ink/5">Cancelar</Link>
          <Button className="h-10 px-5" onClick={save} disabled={pending || uploading}>{pending ? "Salvando..." : "Salvar produto"}</Button>
        </div>
      </div>

      {draftNotice && <div className="mb-4"><Notice tone="warning" title={draftNotice}>Os dados digitados antes foram restaurados. <button className="link text-ink" onClick={discardDraft}>Descartar e voltar ao original</button></Notice></div>}
      {error && <div className="mb-4"><Notice tone="danger">{error}</Notice></div>}

      <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
        <div className="space-y-5">
          {/* 01 · Imagens */}
          <Section n={1} title={`Imagens · ${v.images.length} de ${MAX_PRODUCT_IMAGES}`} hint="Até 8 fotos por produto. A primeira é a principal (vitrine e carrinho).">
            <div className="flex flex-wrap gap-3">
              {v.images.map((img, i) => (
                <div key={img.url} className="group relative h-32 w-32 overflow-hidden rounded border border-line bg-[#ece8e1]">
                  <img src={img.url} alt={img.alt || `Foto ${i + 1}`} className="h-full w-full object-cover" />
                  {i === 0 && <span className="absolute left-1 top-1 rounded bg-ink px-1.5 py-0.5 text-[10px] text-canvas">Principal</span>}
                  <div className="absolute inset-x-0 bottom-0 flex justify-between bg-ink/70 p-1 text-canvas opacity-100 md:opacity-0 md:group-hover:opacity-100">
                    <button type="button" className="px-1.5" aria-label="Mover para a esquerda" onClick={() => moveImg(i, -1)} disabled={i === 0}>←</button>
                    <button type="button" className="px-1.5" aria-label="Definir como principal" onClick={() => makeMain(i)} disabled={i === 0}>★</button>
                    <button type="button" className="px-1.5" aria-label="Mover para a direita" onClick={() => moveImg(i, 1)} disabled={i === v.images.length - 1}>→</button>
                    <button type="button" className="px-1.5" aria-label="Remover foto" onClick={() => { set("images", v.images.filter((_, j) => j !== i)); setImgNotice(null); }}>✕</button>
                  </div>
                </div>
              ))}
              {v.images.length < MAX_PRODUCT_IMAGES && <label className={`flex h-32 w-32 cursor-pointer flex-col items-center justify-center rounded border border-dashed border-line text-center text-xs text-muted hover:border-ink hover:text-ink ${uploading ? "pointer-events-none opacity-50" : ""}`}>
                <span className="text-2xl leading-none">+</span>{uploading ? "Enviando…" : "Adicionar fotos"}
                <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple className="sr-only" onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
              </label>}
            </div>
            {v.images.length > 0 && (
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {v.images.map((img, i) => <Input key={img.url} className="h-9 text-xs" placeholder={`Descrição da foto ${i + 1} (acessibilidade)`} value={img.alt} onChange={(e) => set("images", v.images.map((x, j) => (j === i ? { ...x, alt: e.target.value } : x)))} />)}
              </div>
            )}
            {v.images.length > MAX_PRODUCT_IMAGES && <div className="mt-3"><Notice tone="danger">Este produto tem {v.images.length} fotos. O máximo agora é {MAX_PRODUCT_IMAGES}: remova {v.images.length - MAX_PRODUCT_IMAGES} para conseguir salvar.</Notice></div>}
            {imgNotice && <div className="mt-3"><Notice tone="warning">{imgNotice}</Notice></div>}
            <p className="mt-3 text-xs text-muted">{v.images.length >= MAX_PRODUCT_IMAGES ? "Limite de fotos atingido. " : ""}JPG, PNG, WebP ou AVIF até 8 MB cada. Fotos removidas são apagadas do armazenamento ao salvar.</p>
          </Section>

          {/* 02 · Dados do produto */}
          <Section n={2} title="Dados do produto">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Código (SKU) *" htmlFor="code"><Input id="code" value={v.code} onChange={(e) => set("code", e.target.value.toUpperCase())} className="h-10" required /></Field>
              <Field label="Nome *" htmlFor="name"><Input id="name" value={v.name} onChange={up("name")} className="h-10" required /></Field>
              <Field label="Categoria *" htmlFor="categoryId"><Select id="categoryId" value={v.categoryId} onChange={up("categoryId")} className="h-10"><option value="">Selecione</option>{props.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
              <Field label="Status" htmlFor="status"><Select id="status" value={v.isActive ? "ativo" : "inativo"} onChange={(e) => set("isActive", e.target.value === "ativo")} className="h-10"><option value="ativo">Ativo (visível na loja)</option><option value="inativo">Inativo</option></Select></Field>
              <div className="sm:col-span-2"><Field label="Descrição (exibida na loja)" htmlFor="description"><Textarea id="description" rows={6} value={v.description} onChange={up("description")} /></Field></div>
              <div className="sm:col-span-2"><Field label="Observações internas" htmlFor="internalNotes" hint="Nunca aparecem para o cliente."><Textarea id="internalNotes" rows={3} value={v.internalNotes} onChange={up("internalNotes")} /></Field></div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.isFeatured} onChange={(e) => set("isFeatured", e.target.checked)} /> Destaque na página inicial</label>
            </div>
          </Section>

          {/* 03 · Características técnicas */}
          <Section n={3} title="Características técnicas" hint="Não inventar: deixe em branco o que não estiver confirmado.">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="sm:col-span-2"><Field label="Cor / acabamento" htmlFor="color"><Input id="color" value={v.color} onChange={up("color")} className="h-10" /></Field></div>
              <Field label="Unidade das medidas" htmlFor="measureUnit"><Select id="measureUnit" value={v.measureUnit} onChange={(e) => set("measureUnit", e.target.value as "CM" | "M")} className="h-10"><option value="CM">Centímetros (cm)</option><option value="M">Metros (m)</option></Select></Field>
              {([["height", "Altura"], ["length", "Comprimento"], ["depth", "Profundidade"], ["diameter", "Diâmetro"]] as const).map(([k, l]) => (
                <Field key={k} label={`${l} montado (${unitLbl})`} htmlFor={k}><Input id={k} inputMode="decimal" value={v[k]} onChange={up(k)} className="h-10" /></Field>
              ))}
              <Field label="Peso do produto (kg)" htmlFor="weightKg"><Input id="weightKg" inputMode="decimal" value={v.weightKg} onChange={up("weightKg")} className="h-10" /></Field>
              <Field label="Material da estrutura" htmlFor="frameMaterial"><Input id="frameMaterial" value={v.frameMaterial} onChange={up("frameMaterial")} className="h-10" /></Field>
              <Field label="Tipo de abertura" htmlFor="openingType"><Select id="openingType" value={v.openingType} onChange={up("openingType")} className="h-10">{OPENINGS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
              <div className="sm:col-span-3"><Field label="Características da cobertura" htmlFor="coverFeatures"><Textarea id="coverFeatures" rows={2} value={v.coverFeatures} onChange={up("coverFeatures")} /></Field></div>
              <Field label="Garantia" htmlFor="warranty"><Input id="warranty" value={v.warranty} onChange={up("warranty")} className="h-10" /></Field>
              <div className="sm:col-span-2"><Field label="Cuidados e conservação" htmlFor="careInstructions"><Input id="careInstructions" value={v.careInstructions} onChange={up("careInstructions")} className="h-10" /></Field></div>
            </div>
          </Section>

          {/* 04 · Embalagem e logística */}
          <Section n={4} title="Embalagem e logística" hint="Usada no cálculo de frete.">
            <div className="space-y-3">
              {v.packages.map((p, i) => {
                const upd = (patch: Partial<Pkg>) => set("packages", v.packages.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                const [l, w, h] = [parseDecimal(p.lengthCm), parseDecimal(p.widthCm), parseDecimal(p.heightCm)];
                const m3 = l && w && h ? (l * w * h) / 1_000_000 : null;
                return (
                  <div key={i} className="grid items-end gap-2 rounded border border-line p-3 sm:grid-cols-[1.2fr_repeat(4,1fr)_70px_auto]">
                    <Field label={`Volume ${i + 1}`} htmlFor={`pl${i}`}><Input id={`pl${i}`} placeholder="Ex.: mastro" value={p.label} onChange={(e) => upd({ label: e.target.value })} className="h-9" /></Field>
                    <Field label="Altura (cm)" htmlFor={`ph${i}`}><Input id={`ph${i}`} inputMode="decimal" value={p.heightCm} onChange={(e) => upd({ heightCm: e.target.value })} className="h-9" /></Field>
                    <Field label="Largura (cm)" htmlFor={`pw${i}`}><Input id={`pw${i}`} inputMode="decimal" value={p.widthCm} onChange={(e) => upd({ widthCm: e.target.value })} className="h-9" /></Field>
                    <Field label="Compr. (cm)" htmlFor={`pc${i}`}><Input id={`pc${i}`} inputMode="decimal" value={p.lengthCm} onChange={(e) => upd({ lengthCm: e.target.value })} className="h-9" /></Field>
                    <Field label="Peso (kg)" htmlFor={`pk${i}`}><Input id={`pk${i}`} inputMode="decimal" value={p.weightKg} onChange={(e) => upd({ weightKg: e.target.value })} className="h-9" /></Field>
                    <Field label="Qtd." htmlFor={`pq${i}`}><Input id={`pq${i}`} type="number" min={1} value={p.quantity} onChange={(e) => upd({ quantity: Math.max(1, Number(e.target.value) || 1) })} className="h-9" /></Field>
                    <div className="flex items-center gap-3 pb-2 text-xs text-muted"><span className="whitespace-nowrap">{m3 != null ? `${(m3 * (p.quantity || 1)).toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} m³` : "—"}</span><button type="button" className="text-danger" aria-label="Remover volume" onClick={() => set("packages", v.packages.filter((_, j) => j !== i))}>✕</button></div>
                  </div>
                );
              })}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Button type="button" variant="secondary" className="h-9 px-4 text-xs" onClick={() => set("packages", [...v.packages, { label: "", lengthCm: "", widthCm: "", heightCm: "", weightKg: "", quantity: 1 }])}>+ Adicionar volume</Button>
                <p className="text-sm">Cubagem total: <strong className="font-medium">{cubage.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} m³</strong> <span className="text-xs text-muted">(A × L × C ÷ 1.000.000 × qtd.)</span></p>
              </div>
            </div>
          </Section>

          {/* 05 · Fornecedores */}
          <Section n={5} title="Fornecedores" hint="Uso interno. O principal define o custo.">
            <div className="flex flex-wrap gap-2">
              <Select className="h-10 max-w-sm" value="" onChange={(e) => addSupplier(e.target.value)} aria-label="Adicionar fornecedor cadastrado">
                <option value="">Adicionar fornecedor cadastrado…</option>
                {suppliers.filter((s) => !linked.has(s.id)).map((s) => <option key={s.id} value={s.id}>{s.tradeName ?? s.legalName}{s.cnpj ? ` · ${formatCnpj(s.cnpj)}` : ""}</option>)}
              </Select>
              <Button type="button" variant="secondary" className="h-10 px-4 text-sm" onClick={() => setSupplierDialog(true)}>Novo fornecedor</Button>
            </div>
            <div className="mt-4 space-y-3">
              {v.suppliers.length === 0 && <p className="text-sm text-muted">Nenhum fornecedor vinculado. Sem fornecedor, o custo da mercadoria fica zerado.</p>}
              {v.suppliers.map((l, i) => {
                const s = suppliers.find((x) => x.id === l.supplierId);
                const withIpi = (() => { const c = parseMoney(l.cost); const ipi = parsePercentBps(l.ipi) ?? 0; return c == null ? null : c + Math.round((c * ipi) / 10_000); })();
                return (
                  <div key={l.supplierId} className={`rounded border p-4 ${l.isPrincipal ? "border-ink" : "border-line"}`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="text-sm">
                        <p className="font-medium">{s?.legalName ?? "Fornecedor"} {l.isPrincipal && <Badge tone="success">Principal</Badge>}</p>
                        <p className="text-xs text-muted">{[s?.cnpj && formatCnpj(s.cnpj), s?.contact, s?.phone, s?.email].filter(Boolean).join(" · ") || "Sem dados de contato"}</p>
                      </div>
                      <div className="flex gap-2 text-xs">
                        {!l.isPrincipal && <button type="button" className="link" onClick={() => makePrincipal(i)}>Marcar principal</button>}
                        <button type="button" className="text-danger hover:underline" onClick={() => removeLink(i)} aria-label="Remover vínculo">Remover</button>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      <Field label="Código no fornecedor" htmlFor={`sc${i}`}><Input id={`sc${i}`} value={l.supplierCode} onChange={(e) => updLink(i, { supplierCode: e.target.value })} className="h-9" /></Field>
                      <Field label="Prazo de entrega" htmlFor={`lt${i}`}><Select id={`lt${i}`} value={l.leadTime} onChange={(e) => updLink(i, { leadTime: e.target.value })} className="h-9"><option value="">—</option>{LEAD_TIMES.map(([k, lb]) => <option key={k} value={k}>{lb}</option>)}</Select></Field>
                      <Field label="MOQ (un.)" htmlFor={`mq${i}`}><Input id={`mq${i}`} inputMode="numeric" value={l.moq} onChange={(e) => updLink(i, { moq: e.target.value.replace(/\D/g, "") })} className="h-9" /></Field>
                      <Field label="Custo mercadoria (R$)" htmlFor={`co${i}`}><Input id={`co${i}`} inputMode="decimal" placeholder="0,00" value={l.cost} onChange={(e) => updLink(i, { cost: e.target.value })} className="h-9" /></Field>
                      <Field label="IPI de compra (%)" htmlFor={`ip${i}`}><Input id={`ip${i}`} inputMode="decimal" placeholder="0" value={l.ipi} onChange={(e) => updLink(i, { ipi: e.target.value })} className="h-9" /></Field>
                      <div className="flex flex-col justify-end pb-2 text-xs text-muted">Com IPI: <span className="text-sm text-ink">{withIpi == null ? "—" : formatBRL(withIpi)}</span></div>
                      <div className="sm:col-span-3"><Field label="Observações" htmlFor={`ob${i}`}><Input id={`ob${i}`} value={l.notes} onChange={(e) => updLink(i, { notes: e.target.value })} className="h-9" /></Field></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>

          {/* 07 · Custos adicionais */}
          <Section n={7} title="Custos adicionais" hint="Itens da tabela de custos.">
            {props.costItems.length === 0 && <p className="mb-3 text-sm text-muted">Nenhum item cadastrado. <Link href="/admin/tabela-custos" className="link">Cadastrar na tabela de custos</Link></p>}
            <div className="grid gap-3 sm:grid-cols-2">
              {COST_CATEGORIES.map(({ key, label, qtyLabel }) => {
                const line = costLine(key); const opts = props.costItems.filter((i) => i.category === key);
                const item = opts.find((o) => o.id === line?.costItemId); const q = parseDecimal(line?.quantity);
                return (
                  <div key={key} className="rounded border border-line p-4">
                    <p className="mb-3 text-sm font-medium">{label}</p>
                    <div className="grid grid-cols-[1fr_100px] gap-2">
                      <Select className="h-9" value={line?.costItemId ?? ""} onChange={(e) => setCostLine(key, { costItemId: e.target.value })} aria-label={label}>
                        <option value="">Não se aplica</option>
                        {opts.map((o) => <option key={o.id} value={o.id}>{o.label} · {formatBRL(o.priceCents)}/{o.unit}</option>)}
                      </Select>
                      <Input className="h-9" inputMode="decimal" placeholder={qtyLabel} aria-label={qtyLabel} value={line?.quantity ?? ""} disabled={!line} onChange={(e) => setCostLine(key, { quantity: e.target.value })} />
                    </div>
                    <p className="mt-2 text-right text-xs text-muted">Subtotal: <span className="text-ink">{item && q ? formatBRL(Math.round(q * item.priceCents)) : "—"}</span></p>
                  </div>
                );
              })}
            </div>
          </Section>

          <Section n={8} title="SEO" hint="Opcional — título e descrição para buscadores.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="URL (slug)" htmlFor="slug" hint="Gerado pelo nome se vazio."><Input id="slug" value={v.slug} onChange={up("slug")} className="h-10" /></Field>
              <Field label="Título SEO" htmlFor="seoTitle"><Input id="seoTitle" maxLength={70} value={v.seoTitle} onChange={up("seoTitle")} className="h-10" /></Field>
              <div className="sm:col-span-2"><Field label="Descrição SEO" htmlFor="seoDescription"><Input id="seoDescription" maxLength={170} value={v.seoDescription} onChange={up("seoDescription")} className="h-10" /></Field></div>
            </div>
          </Section>
        </div>

        {/* 06 · Custos (resumo fixo ao lado) */}
        <aside className="xl:sticky xl:top-6 xl:self-start">
          <section className="card p-6">
            <div className="mb-5 flex items-baseline gap-3"><span className="font-display text-sm text-muted">06</span><h2 className="font-sans text-base font-medium">Custos</h2></div>
            <dl className="space-y-2 text-sm">
              <Row k="Custo da mercadoria" v={formatBRL(cost.merchandiseCents)} />
              <Row k="IPI de compra" v={`${pctFmt(cost.ipiBps)} · ${formatBRL(cost.ipiCents)}`} />
              <Row k="Mercadoria + IPI" v={formatBRL(cost.withIpiCents)} />
              {COST_CATEGORIES.map(({ key, label }) => <Row key={key} k={`+ ${label.replace("Custo ", "")}`} v={formatBRL(cost.byCategory[key])} muted />)}
              <div className="flex justify-between border-t border-line pt-3 text-base"><dt>Custo final base</dt><dd className="font-medium">{formatBRL(cost.finalCents)}</dd></div>
            </dl>
            {cost.missingSupplierCost && <p className="mt-3 text-xs text-warning">Sem custo do fornecedor principal — o custo final está incompleto.</p>}
            <div className="mt-5 rounded bg-canvas p-4 text-sm">
              <p className="label mb-2">Margem sobre o preço de atacado</p>
              {props.wholesalePriceCents == null
                ? <p className="text-xs text-muted">{props.mode === "edit" ? "Defina o preço da variação para ver a margem." : "Salve o produto e defina o preço da variação para ver a margem."}</p>
                : <p>Preço {formatBRL(props.wholesalePriceCents)} → margem <strong className={margin != null && margin < 0 ? "text-danger" : margin != null && margin < 1500 ? "text-warning" : "text-success"}>{margin == null ? "—" : pctFmt(margin)}</strong></p>}
            </div>
            <p className="mt-4 text-xs text-muted">Calculado aqui e conferido no servidor ao salvar. Mudanças na tabela de custos recalculam os produtos automaticamente.</p>
          </section>
        </aside>
      </div>

      {/* Rodapé fixo */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur md:left-60">
        <div className="flex items-center justify-between gap-3 px-5 py-3 md:px-10">
          <p className="hidden text-sm text-muted sm:block">Custo final base: <span className="text-ink">{formatBRL(cost.finalCents)}</span> · Cubagem: <span className="text-ink">{cubage.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} m³</span></p>
          <div className="ml-auto flex gap-2">
            <Link href="/admin/produtos" className="inline-flex h-10 items-center rounded px-4 text-sm hover:bg-ink/5">Cancelar</Link>
            <Button className="h-10 px-5" onClick={save} disabled={pending || uploading}>{pending ? "Salvando..." : "Salvar produto"}</Button>
          </div>
        </div>
      </div>

      {supplierDialog && (
        <SupplierDialog
          onClose={() => setSupplierDialog(false)}
          onSaved={(s) => { setSuppliers((xs) => [...xs, s]); addSupplier(s.id); setSupplierDialog(false); }}
        />
      )}
    </div>
  );
}

/** Fora do componente: definido dentro, seria recriado a cada tecla e os campos perderiam o foco. */
function Section({ n, title, hint, children }: { n: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="card p-6">
      <div className="mb-5 flex items-baseline gap-3"><span className="font-display text-sm text-muted">{String(n).padStart(2, "0")}</span><h2 className="font-sans text-base font-medium">{title}</h2>{hint && <span className="text-xs text-muted">{hint}</span>}</div>
      {children}
    </section>
  );
}

const Row = ({ k, v, muted }: { k: string; v: string; muted?: boolean }) => (
  <div className={`flex justify-between gap-4 ${muted ? "text-xs text-muted" : ""}`}><dt className={muted ? "" : "text-muted"}>{k}</dt><dd>{v}</dd></div>
);

// ---------------------------------------------------------------- pop-up de fornecedor (também usado na tela de fornecedores)
export function SupplierDialog({ initial, onClose, onSaved }: { initial?: Partial<SupplierOption> & { notes?: string | null }; onClose: () => void; onSaved: (s: SupplierOption) => void }) {
  const draftKey = `b2b:supplier-draft:${initial?.id ?? "novo"}`;
  const [f, setF] = useState(() => {
    const base = { id: initial?.id ?? null, legalName: initial?.legalName ?? "", tradeName: initial?.tradeName ?? "", cnpj: initial?.cnpj ? formatCnpj(initial.cnpj) : "", contact: initial?.contact ?? "", phone: initial?.phone ?? "", email: initial?.email ?? "", notes: initial?.notes ?? "" };
    try { const d = localStorage.getItem(draftKey); if (d) return { ...base, ...JSON.parse(d) }; } catch {}
    return base;
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  useEffect(() => { const t = setTimeout(() => { try { localStorage.setItem(draftKey, JSON.stringify(f)); } catch {} }, 300); return () => clearTimeout(t); }, [f, draftKey]);
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  const fld = (k: keyof typeof f, label: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <Field label={label} htmlFor={`sup-${String(k)}`}><Input id={`sup-${String(k)}`} value={f[k] ?? ""} onChange={(e) => setF({ ...f, [k]: e.target.value })} className="h-10" {...extra} /></Field>
  );
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" role="dialog" aria-modal="true" aria-label="Fornecedor" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="card max-h-[90vh] w-full max-w-lg overflow-y-auto p-6" onSubmit={(e) => {
        e.preventDefault(); setError(null);
        start(async () => {
          const r = await saveSupplierAction(f);
          if (!r.ok) return setError(r.error);
          try { localStorage.removeItem(draftKey); } catch {}
          onSaved(r.data);
        });
      }}>
        <h2 className="mb-5 font-sans text-lg font-medium">{f.id ? "Editar fornecedor" : "Novo fornecedor"}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">{fld("legalName", "Razão social *", { required: true, autoFocus: true })}</div>
          {fld("tradeName", "Nome fantasia")}
          {fld("cnpj", "CNPJ", { placeholder: "00.000.000/0000-00", onBlur: () => setF({ ...f, cnpj: f.cnpj ? formatCnpj(f.cnpj) : "" }) })}
          {fld("contact", "Contato")}
          {fld("phone", "Telefone", { type: "tel" })}
          <div className="sm:col-span-2">{fld("email", "E-mail", { type: "email" })}</div>
          <div className="sm:col-span-2"><Field label="Observações" htmlFor="sup-notes"><Textarea id="sup-notes" rows={3} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field></div>
        </div>
        {error && <div className="mt-4"><Notice tone="danger">{error}</Notice></div>}
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="ghost" className="h-10" onClick={onClose}>Cancelar</Button>
          <Button type="submit" className="h-10 px-5" disabled={pending}>{pending ? "Salvando..." : "Salvar fornecedor"}</Button>
        </div>
      </form>
    </div>
  );
}
