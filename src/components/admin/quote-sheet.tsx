"use client";
/* eslint-disable @next/next/no-img-element */
import { useMemo, useState } from "react";
import type { ClientOption, QuoteProductOption } from "@/modules/quotes/service";
import { PAY_METHODS, STATUS_LABEL, installmentError, validUntil } from "@/modules/quotes/totals";
import { EMPTY_CLIENT, emptyItem, sheetInstallments, sheetTotals, toMoneyIn, type ClientData, type CommercialData, type CompanyHeader, type SheetData, type SheetItem } from "@/modules/quotes/sheet";
export type { CompanyHeader, SheetData } from "@/modules/quotes/sheet";
import { formatBRL } from "@/lib/money";
import { formatCnpj } from "@/modules/companies/cnpj";

const cents = (s: string) => { const t = (s ?? "").trim().replace(/[R$\s]/g, ""); if (!t) return 0; const n = t.includes(",") ? Number(t.replace(/\./g, "").replace(",", ".")) : Number(t); return Number.isFinite(n) ? Math.round(n * 100) : 0; };
const num = (c: number) => (c / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dBR = (iso: string) => new Date(iso + "T12:00:00Z").toLocaleDateString("pt-BR", { timeZone: "UTC" });
void toMoneyIn;

/** Valor da parcela: mostra o calculado; ao digitar, fixa o valor (vazio = volta ao automático). */
function InstallmentValue({ cents, fixed, label, onCommit }: { cents: number; fixed: boolean; label: string; onCommit: (v: number | null) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const show = draft ?? (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const commit = () => {
    if (draft == null) return;
    const t = draft.trim().replace(/[R$\s]/g, "");
    setDraft(null);
    if (!t) return onCommit(null);
    const n = t.includes(",") ? Number(t.replace(/\./g, "").replace(",", ".")) : Number(t);
    if (Number.isFinite(n) && n >= 0) onCommit(Math.round(n * 100));
  };
  return (
    <span className="flex items-center gap-1.5">
      {fixed ? <button type="button" className="qs-chip !m-0 !px-1.5 !py-0 text-[10px]" title="Voltar ao valor automático" onClick={() => onCommit(null)} aria-label={`Desfixar parcela ${label}`}>fixado ×</button> : <span className="text-[10px] text-[#8a8f87]">auto</span>}
      R$<input className={`qs-in !w-24 !p-0.5 text-right ${fixed ? "font-semibold" : ""}`} inputMode="decimal" value={show} onFocus={(e) => { setDraft(show); e.target.select(); }} onChange={(e) => setDraft(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setDraft(null); }} aria-label={`Valor da parcela ${label}`} />
    </span>
  );
}

function Cell({ label, value, onEdit, span = 1, ph, edit }: { label: string; value: string; onEdit?: (v: string) => void; span?: number; ph?: string; edit: boolean }) {
  return (
    <div className="qs-cell" style={{ gridColumn: `span ${span}` }}>
      <div className="qs-lbl">{label}</div>
      {edit && onEdit ? <input className="qs-in" value={value} placeholder={ph} onChange={(e) => onEdit(e.target.value)} aria-label={label} /> : <div className="qs-val">{value || "\u00a0"}</div>}
    </div>
  );
}
function Field({ label, value, onEdit, area, edit }: { label: string; value: string; onEdit: (v: string) => void; area?: boolean; edit: boolean }) {
  return (
    <>
      <div className="qs-lbl">{label}</div>
      {edit ? (area ? <textarea className="qs-in qs-ta" rows={3} value={value} onChange={(e) => onEdit(e.target.value)} aria-label={label} /> : <input className="qs-in" value={value} onChange={(e) => onEdit(e.target.value)} aria-label={label} />)
        : <div className={`qs-val ${area ? "qs-notes" : ""}`}>{value || "\u00a0"}</div>}
    </>
  );
}

/**
 * Folha do orçamento no padrão do modelo da empresa.
 * edit=true: campos editáveis; edit=false: documento para impressão (A4).
 */
export function QuoteSheet({ data, onChange, edit, company, products = [], clients = [], onUpload }: {
  data: SheetData; onChange?: (d: SheetData) => void; edit: boolean; company: CompanyHeader;
  products?: QuoteProductOption[]; clients?: ClientOption[]; onUpload?: (file: File) => Promise<string | null>;
}) {
  const [searchIdx, setSearchIdx] = useState<number | null>(edit && data.items.length === 1 && !data.items[0].variantId ? 0 : null);
  const [search, setSearch] = useState("");
  const t = useMemo(() => sheetTotals(data), [data]);
  const ip = useMemo(() => sheetInstallments(data, t.total), [data, t.total]);
  const inst = ip.rows;
  const setFixed = (i: number, v: number | null) => { const arr = [...data.installmentValues]; while (arr.length <= i) arr.push(null); arr[i] = v; set({ installmentValues: arr }); };
  const set = (patch: Partial<SheetData>) => onChange?.({ ...data, ...patch });
  const setClient = (k: keyof ClientData, v: string) => set({ client: { ...data.client, [k]: v } });
  const setCom = (k: keyof CommercialData, v: string) => set({ commercial: { ...data.commercial, [k]: v } });
  const setItem = (i: number, patch: Partial<SheetItem>) => set({ items: data.items.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  const pay = PAY_METHODS.find((m) => m.label === data.paymentTerms);
  const rowsByItem = (() => { let k = -1; return data.items.map((i) => (i.variantId ? t.rows[++k] : undefined)); })();

  const choose = (i: number, o: QuoteProductOption) => {
    setItem(i, { variantId: o.variantId, imageUrl: o.images[0] ?? null, name: o.name, measures: o.measures ?? "", finish: o.finish ?? "", itemNotes: o.notes ?? "", unitPrice: toMoneyIn(o.priceCents), unitCostCents: o.unitCostCents, weightG: o.weightG, cubageM3: o.cubageM3 });
    setSearchIdx(null); setSearch("");
  };
  const found = searchIdx != null && search.trim() ? products.filter((p) => [p.code, p.name].some((x) => x.toLowerCase().includes(search.toLowerCase()))).slice(0, 8) : [];
  const due = validUntil(new Date(data.issuedAt + "T12:00:00Z"), data.validDays);

  return (
    <div className="qsheet">
      {/* Cabeçalho */}
      <div className="qs-head">
        <div className="qs-logo">{company.logoUrl ? <img src={company.logoUrl} alt={company.brandName} className="h-full w-full object-contain" /> : company.brandName.toUpperCase().slice(0, 16)}</div>
        <div className="qs-company">
          <b>{company.brandName}</b>
          <span>{company.cnpj ? formatCnpj(company.cnpj) : "[CNPJ da empresa]"}</span>
          {(company.address ?? "[Endereço]").split(/\s*[\n·]\s*/).map((l, i) => <span key={i}>{l}</span>)}
        </div>
        <div className="qs-meta">
          <div className="qs-cell"><div className="qs-lbl">Situação</div><div className="qs-val pt-2.5">{STATUS_LABEL[data.status]}</div></div>
          <div className="qs-cell"><div className="qs-lbl">Nº Pedido</div><div className="qs-val pt-2.5 font-semibold">{data.code ?? <span className="qs-muted font-normal">automático ao salvar</span>}</div></div>
          <div className="qs-cell"><div className="qs-lbl">Data</div>{edit ? <input type="date" className="qs-in" value={data.issuedAt} onChange={(e) => set({ issuedAt: e.target.value })} aria-label="Data" /> : <div className="qs-val pt-2.5">{dBR(data.issuedAt)}</div>}</div>
          <div className="qs-cell"><div className="qs-lbl">Prazo de Entrega</div><div className="qs-val flex items-center gap-1.5">{edit ? <input className="qs-in !w-14 !p-1" inputMode="numeric" value={data.deliveryDays} onChange={(e) => set({ deliveryDays: e.target.value.replace(/\D/g, "") })} aria-label="Prazo de entrega em dias" /> : data.deliveryDays || "–"} <span className="qs-muted">dias corridos</span></div></div>
        </div>
      </div>

      {/* Cliente */}
      <div className="qs-bar">Dados do Cliente</div>
      {edit && (
        <div className="qs-toolbar">
          <span className="qs-mini">Cliente cadastrado:</span>
          <select className="qs-sel max-w-72" value={data.companyId ? `co:${data.companyId}` : data.clientId ? `cl:${data.clientId}` : ""} aria-label="Cliente cadastrado"
            onChange={(e) => { const c = clients.find((x) => x.key === e.target.value); if (!c) return set({ companyId: "", clientId: "" }); const { key: _k, kind, id, ...fields } = c; void _k; set({ companyId: kind === "company" ? id : "", clientId: kind === "client" ? id : "", client: { ...EMPTY_CLIENT, ...fields, cnpj: fields.cnpj ? formatCnpj(fields.cnpj) : "" } }); }}>
            <option value="">— cliente avulso —</option>{clients.map((c) => <option key={c.key} value={c.key}>{c.name}{c.kind === "company" ? " (conta no site)" : ""}</option>)}
          </select>
          {(data.companyId || data.clientId) && <button type="button" className="text-[11.5px] underline underline-offset-2" onClick={() => set({ companyId: "", clientId: "" })}>Desvincular</button>}
        </div>
      )}
      <div className="qs-grid" style={{ gridTemplateColumns: "2fr 1fr 1fr" }}>
        <Cell edit={edit} label="Cliente" value={data.client.name} onEdit={(v) => setClient("name", v)} span={2} />
        <Cell edit={edit} label="CPF" value={data.client.cpf} onEdit={(v) => setClient("cpf", v)} />
        <Cell edit={edit} label="Endereço" value={data.client.address} onEdit={(v) => setClient("address", v)} span={2} />
        <Cell edit={edit} label="CNPJ" value={data.client.cnpj} onEdit={(v) => setClient("cnpj", v)} />
        <Cell edit={edit} label="Cidade / UF" value={data.client.city} onEdit={(v) => setClient("city", v)} />
        <Cell edit={edit} label="CEP" value={data.client.cep} onEdit={(v) => setClient("cep", v)} />
        <Cell edit={edit} label="Inscrição Estadual" value={data.client.ie} onEdit={(v) => setClient("ie", v)} />
        <Cell edit={edit} label="Contato" value={data.client.contact} onEdit={(v) => setClient("contact", v)} />
        <Cell edit={edit} label="Celular" value={data.client.mobile} onEdit={(v) => setClient("mobile", v)} />
        <Cell edit={edit} label="E-mail" value={data.client.email} onEdit={(v) => setClient("email", v)} />
        <Cell edit={edit} label="Casa em obra / contato" value={data.client.site} onEdit={(v) => setClient("site", v)} span={2} />
        <Cell edit={edit} label="Aniversário" value={data.client.birthday} onEdit={(v) => setClient("birthday", v)} />
        <Cell edit={edit} label="Endereço de entrega" value={data.client.delivery} onEdit={(v) => setClient("delivery", v)} span={3} />
      </div>

      {/* Comercial */}
      <div className="qs-bar">Dados Comerciais</div>
      <div className="qs-grid" style={{ gridTemplateColumns: "1fr 1fr 1fr 1fr 1.6fr" }}>
        <Cell edit={edit} label="Profissional" value={data.commercial.professional} onEdit={(v) => setCom("professional", v)} />
        <Cell edit={edit} label="Vendedor" value={data.commercial.seller} onEdit={(v) => setCom("seller", v)} />
        <Cell edit={edit} label="Gerente" value={data.commercial.manager} onEdit={(v) => setCom("manager", v)} />
        <Cell edit={edit} label="Celular" value={data.commercial.mobile} onEdit={(v) => setCom("mobile", v)} />
        <Cell edit={edit} label="E-mail" value={data.commercial.email} onEdit={(v) => setCom("email", v)} />
      </div>

      {/* Produtos */}
      <div className="qs-bar">Produtos</div>
      <table className="qs-table">
        <thead><tr><th style={{ width: "25%" }}>Foto</th><th>Descrição</th><th className="qs-num">Qtd</th><th className="qs-num">Valor Unit.</th><th className="qs-num">Desconto Unit.</th><th className="qs-num">Valor Total</th></tr></thead>
        <tbody>
          {data.items.map((it, i) => {
            const opt = products.find((p) => p.variantId === it.variantId);
            const row = rowsByItem[i];
            return (
              <tr key={i} className="qs-item">
                <td className="qs-photo">
                  <div className="qs-imgbox">{it.imageUrl && <img src={it.imageUrl} alt={it.name} />}</div>
                  {edit && <>
                    <button type="button" className="qs-chip" disabled={!opt?.images.length} onClick={() => { if (!opt?.images.length) return; const idx = opt.images.indexOf(it.imageUrl ?? ""); setItem(i, { imageUrl: opt.images[(idx + 1) % opt.images.length] }); }}>▣ Escolher do catálogo</button>
                    <label className="qs-link">enviar do dispositivo<input type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f && onUpload) { const url = await onUpload(f); if (url) setItem(i, { imageUrl: url }); } }} /></label>
                  </>}
                  <div className="qs-itemno">Item {i + 1}</div>
                </td>
                <td className="qs-desc">
                  {edit && <>
                    <div className="qs-line"><button type="button" className="qs-btn" onClick={() => { setSearchIdx(i); setSearch(""); }}>⬚ Selecionar produto</button></div>
                    <div className="qs-line"><span className="qs-mini">Buscar:</span>
                      <input className="qs-in !min-h-0 flex-1 !p-0.5" placeholder="Digite o nome ou número do produto" value={searchIdx === i ? search : ""} onFocus={() => setSearchIdx(i)} onChange={(e) => { setSearchIdx(i); setSearch(e.target.value); }} aria-label="Buscar produto" />
                      {searchIdx === i && found.length > 0 && (
                        <div className="qs-results">{found.map((p) => (
                          <button key={p.variantId} type="button" onClick={() => choose(i, p)}>
                            {p.images[0] ? <img src={p.images[0]} alt="" className="h-9 w-9 rounded object-cover" /> : <span className="h-9 w-9 rounded bg-[#ece8e1]" />}
                            <span className="flex-1">{p.code} · {p.name}<br /><span className="text-[10px] text-muted">{p.stockText}</span></span>
                            <span>{p.priceCents == null ? "sem preço" : formatBRL(p.priceCents)}</span>
                          </button>))}</div>
                      )}
                    </div>
                  </>}
                  <div className="qs-name">{edit ? <input className="qs-in !p-0 font-semibold" value={it.name} placeholder="Selecione um produto" onChange={(e) => setItem(i, { name: e.target.value })} aria-label="Nome do produto" /> : it.name}</div>
                  <div className="qs-sub2">
                    <div><Field edit={edit} label="Medidas" value={it.measures} onEdit={(v) => setItem(i, { measures: v })} /></div>
                    <div><Field edit={edit} label="Acabamento da estrutura" value={it.finish} onEdit={(v) => setItem(i, { finish: v })} /></div>
                  </div>
                  <Field edit={edit} label="Corda / Tela / Fibra" value={it.cordage} onEdit={(v) => setItem(i, { cordage: v })} />
                  <Field edit={edit} label="Observações" value={it.itemNotes} onEdit={(v) => setItem(i, { itemNotes: v })} area />
                </td>
                <td className="qs-num">{edit ? <input className="qs-in text-center" inputMode="numeric" value={it.quantity} onChange={(e) => setItem(i, { quantity: e.target.value.replace(/\D/g, "") })} aria-label="Quantidade" /> : it.quantity}</td>
                <td className="qs-num">{edit ? <input className="qs-in text-center" inputMode="decimal" value={it.unitPrice} onChange={(e) => setItem(i, { unitPrice: e.target.value })} aria-label="Valor unitário" /> : num(cents(it.unitPrice))}</td>
                <td className="qs-num">{edit ? <input className="qs-in text-center" inputMode="decimal" placeholder="0,00" value={it.unitDiscount} onChange={(e) => setItem(i, { unitDiscount: e.target.value })} aria-label="Desconto unitário" /> : num(cents(it.unitDiscount))}</td>
                <td className="qs-num qs-tot"><b>{formatBRL(row?.total ?? 0)}</b>{edit && <button type="button" className="qs-trash" onClick={() => set({ items: data.items.filter((_, j) => j !== i) })} aria-label={`Remover item ${i + 1}`}>Remover</button>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {edit && <button type="button" className="qs-add" onClick={() => { set({ items: [...data.items, emptyItem()] }); setSearchIdx(data.items.length); setSearch(""); }}>+ &nbsp;Adicionar produto</button>}

      {/* Pagamento + resumo */}
      <div className="qs-bottom">
        <div>
          <div className="qs-bar">Pagamento e Observações</div>
          <div className="qs-lbl">Forma de pagamento</div>
          {edit ? <select className="qs-sel qs-full" value={pay?.key ?? "OUTRO"} onChange={(e) => { const m = PAY_METHODS.find((x) => x.key === e.target.value)!; set({ paymentTerms: m.key === "OUTRO" ? "" : m.label, installmentPlan: m.plan || data.installmentPlan, installmentValues: m.plan ? [] : data.installmentValues }); }} aria-label="Forma de pagamento">
            {PAY_METHODS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}</select> : <div className="qs-val">{data.paymentTerms}</div>}
          {edit && !pay && <input className="qs-in" value={data.paymentTerms} onChange={(e) => set({ paymentTerms: e.target.value })} placeholder="Descreva a forma de pagamento" aria-label="Forma de pagamento personalizada" />}
          <Field edit={edit} label="Informações adicionais" value={data.notes} onEdit={(v) => set({ notes: v })} area />
          <Field edit={edit} label="Parcelamento" value={data.installmentPlan} onEdit={(v) => set({ installmentPlan: v })} />
          {inst.map((x, i) => (
            <div key={x.index} className="qs-inst" data-parcela={x.index}>
              <span>{x.index}&nbsp; {x.label}{x.due && ` - ${x.due.toLocaleDateString("pt-BR", { timeZone: "UTC" })}`}</span>
              {edit ? <InstallmentValue cents={x.valueCents} fixed={x.fixed} label={x.index} onCommit={(v) => setFixed(i, v)} /> : <span>{formatBRL(x.valueCents)}</span>}
            </div>
          ))}
          {edit && inst.length > 1 && <p className="qs-note">Digite o valor de uma parcela para fixá-lo; as demais dividem o restante. Apague o valor para voltar ao automático.</p>}
          {inst.length > 0 && ip.diffCents !== 0 && <p className="qs-note qs-err" role="alert">{installmentError(ip.diffCents)} Soma das parcelas: {formatBRL(ip.sumCents)} · total do pedido: {formatBRL(t.total)}.</p>}
        </div>
        <div>
          <div className="qs-bar">Resumo Financeiro</div>
          <div className="qs-sumrow"><span>Subtotal</span><span>{formatBRL(t.subtotal)}</span></div>
          <div className="qs-sumrow"><span>Desconto</span><span>{edit ? <input className="qs-in w-28 text-right" placeholder="0,00" inputMode="decimal" value={data.extraDiscount} onChange={(e) => set({ extraDiscount: e.target.value })} aria-label="Desconto geral" /> : t.discount ? formatBRL(t.discount) : "–"}</span></div>
          <div className="qs-sumrow"><span>{edit ? <select className="qs-sel" value={data.freightTerm} onChange={(e) => set({ freightTerm: e.target.value as SheetData["freightTerm"] })} aria-label="Frete"><option value="FOB">Frete FOB</option><option value="CIF">Frete CIF</option><option value="COTAR">Frete a cotar</option></select> : data.freightTerm === "COTAR" ? "Frete a cotar" : `Frete ${data.freightTerm}`}</span>
            <span>{data.freightTerm === "CIF" ? (edit ? <input className="qs-in w-28 text-right" inputMode="decimal" value={data.freight} onChange={(e) => set({ freight: e.target.value })} aria-label="Valor do frete" /> : num(t.freight)) : data.freightTerm === "COTAR" ? "–" : "0,00"}</span></div>
          <div className="qs-sumrow"><span>Quantidade total</span><span>{t.quantity}</span></div>
          <div className="qs-sumrow"><span>Peso total da carga</span><span>{t.weightKg ? `${t.weightKg.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg` : "–"}</span></div>
          <div className="qs-sumrow"><span>Cubagem total da carga</span><span>{t.cubageM3 ? `${t.cubageM3.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} m³` : "–"}</span></div>
          {t.missingLoad > 0 && <p className="qs-note">* {t.missingLoad} item(ns) sem peso ou medidas cadastradas: o total pode estar incompleto.</p>}
          <div className="qs-total"><span>Total do Pedido</span><span>{formatBRL(t.total)}</span></div>
          {edit && <p className="qs-note">Uso interno (não sai na impressão): custo {t.cost == null ? "—" : formatBRL(t.cost)} · margem {t.marginBps == null ? "—" : `${(t.marginBps / 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`}</p>}
        </div>
      </div>
      <div className="qs-sign"><div>Assinatura do Cliente</div><div>Assinatura da Empresa</div></div>
      <p className="qs-foot">Orçamento {data.code ?? "(novo)"} · válido por {data.validDays} dias (até {due.toLocaleDateString("pt-BR", { timeZone: "UTC" })}). Preços sujeitos à confirmação de estoque no fechamento do pedido. Imagens ilustrativas.</p>
    </div>
  );
}
