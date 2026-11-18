import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/modules/auth/session";
import { formatBRL } from "@/lib/money";
import { formatCnpj } from "@/modules/companies/cnpj";
import { Badge } from "@/components/ui/misc";
import { saleDetail } from "@/modules/finance/documents";
import { DOC_TYPES, formatBytes } from "@/modules/finance/document-rules";
import { SALE_LABEL, STATE_LABEL, receivableState, saleSummary } from "@/modules/finance/receivables";
import { ReceivableActions } from "@/components/admin/finance-actions";
import { DocumentUploader, NotesPanel, RemoveDocumentButton } from "@/components/admin/sale-documents";
import { BoletoButton, InvoiceButton, PlannedMethodSelect, UndoButton } from "@/components/admin/billing";
import { PARCEL_STAGE_LABEL, defaultParcelMethod, parcelStage } from "@/modules/finance/billing-rules";

export const metadata = { title: "Venda · Financeiro" };
const d = (x: Date | null) => (x ? x.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—");
const SALE_TONE = { quitada: "success", em_aberto: "warning", em_atraso: "danger", cancelada: "neutral" } as const;
const REC_TONE = { aberto: "warning", atrasado: "danger", a_definir: "neutral", recebido: "success", cancelado: "neutral" } as const;
const DOC_TONE = { NOTA_FISCAL: "success", BOLETO: "warning", COMPROVANTE: "success", OUTRO: "neutral" } as const;
const METHOD_GUESS = (t: string) => (/pix/i.test(t) ? "Pix" : /boleto/i.test(t) ? "Boleto" : /cart/i.test(t) ? "Cartão de crédito" : "Pix");
const href = (id: string) => `/api/admin/financeiro/documentos/${id}`;

export default async function SalePage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireAdminPage("FINANCE");
  const s = await saleDetail((await params).id);
  if (!s) notFound();
  const sum = saleSummary(s, s.receivables);
  const nf = s.documents.filter((x) => x.type === "NOTA_FISCAL");
  const recOpts = s.receivables.filter((r) => r.status !== "CANCELADO").map((r) => ({ id: r.id, label: r.label }));
  const doc = (x: (typeof s.documents)[number]) => (
    <li key={x.id} className="flex items-start justify-between gap-3 border-t border-line py-2.5 text-sm first:border-t-0" data-doc={x.fileName}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2"><Badge tone={DOC_TONE[x.type]}>{DOC_TYPES[x.type]}</Badge><a className="link truncate font-medium" href={href(x.id)} target="_blank" rel="noopener">{x.fileName}</a></div>
        <p className="mt-0.5 text-xs text-muted">{[x.description, x.receivableId && `parcela ${s.receivables.find((r) => r.id === x.receivableId)?.label ?? ""}`, formatBytes(x.sizeBytes), `${x.uploadedBy} · ${d(x.createdAt)}`].filter(Boolean).join(" · ")}</p>
      </div>
      <span className="flex shrink-0 gap-3 text-xs"><a className="link" href={`${href(x.id)}?baixar=1`}>Baixar</a><RemoveDocumentButton id={x.id} name={x.fileName} /></span>
    </li>
  );
  return (
    <>
      <nav className="label mb-4"><Link href="/admin/financeiro">Financeiro</Link> / Venda {s.code}</nav>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-sans text-2xl font-medium">Venda {s.code} <Badge tone={SALE_TONE[sum.state]}>{SALE_LABEL[sum.state]}</Badge></h1>
          <p className="mt-1 text-sm text-muted">{s.clientName}{s.clientDoc ? ` · ${s.clientDoc.replace(/\D/g, "").length === 14 ? formatCnpj(s.clientDoc) : s.clientDoc}` : ""} · fechada em {d(s.closedAt)}{s.seller ? ` · vendedor ${s.seller}` : ""}</p>
        </div>
        {s.quoteId && <Link href={`/orcamento/${s.quoteId}`} className="inline-flex h-10 items-center rounded border border-ink/70 px-4 text-sm hover:bg-ink hover:text-canvas">Ver orçamento</Link>}
      </div>
      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[["Total", formatBRL(s.totalCents)], ["Recebido", formatBRL(sum.received)], ["Saldo", formatBRL(sum.open)], ["Pagamento", s.paymentTerms]].map(([l, v]) => (
          <div key={l} className="card p-4"><p className="label">{l}</p><p className="mt-1 truncate text-lg font-medium" title={v}>{v}</p></div>
        ))}
        <div className={`card p-4 ${!s.invoiceNumber && s.quoteId && s.status === "ATIVA" ? "border-warning/50 bg-warning/[0.05]" : ""}`} data-invoice-box>
          <p className="label">Nota fiscal</p>
          {s.invoiceNumber ? <><p className="mt-1 text-lg font-medium">NF {s.invoiceNumber}</p><p className="text-xs text-muted">emitida {d(s.invoiceDate)}{s.invoicedBy ? ` · por ${s.invoicedBy}` : ""}</p>
            {s.status === "ATIVA" && s.quoteId && <div className="mt-1 flex gap-3"><InvoiceButton saleId={s.id} code={s.code} client={s.clientName} current={{ number: s.invoiceNumber, date: new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(s.invoiceDate ?? new Date()) }} /><UndoButton kind="nf" id={s.id} label="Desfazer" /></div>}</>
            : <><p className="mt-1 text-sm text-warning">A faturar{nf.length ? " · NF anexada, falta o número" : ""}</p>{s.status === "ATIVA" && s.quoteId && <div className="mt-2"><InvoiceButton saleId={s.id} code={s.code} client={s.clientName} compact /></div>}</>}
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(360px,1fr)]">
        <div className="space-y-5">
          <section className="card overflow-x-auto">
            <p className="label px-4 pt-4">Parcelas</p>
            <table className="mt-2 w-full text-left text-sm">
              <thead className="border-b border-line text-[11px] uppercase tracking-label text-muted"><tr>{["Parcela", "Vencimento", "Valor", "Cobrança", "Situação", "Recebimento e anexos"].map((h) => <th key={h} className="whitespace-nowrap px-4 py-2 font-normal">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-line">
                {s.receivables.map((r) => { const st = receivableState(r); return (
                  <tr key={r.id} className="align-top" data-parcel={r.label}>
                    <td className="px-4 py-3">{r.label}</td>
                    <td className="whitespace-nowrap px-4 py-3">{r.dueDate ? d(r.dueDate) : "A definir"}</td>
                    <td className="whitespace-nowrap px-4 py-3">{formatBRL(r.amountCents)}</td>
                    <td className="px-4 py-3 text-xs" data-billing-cell>{(() => {
                      const stage = parcelStage({ ...r, hasBoletoDoc: r.documents.some((x) => x.type === "BOLETO") }, s.paymentTerms);
                      if (stage === "recebido" || stage === "cancelado" || s.status !== "ATIVA" || !s.quoteId) return <span className="text-muted">{r.method ?? "—"}</span>;
                      return (<div className="space-y-1.5">
                        <PlannedMethodSelect receivableId={r.id} value={r.plannedMethod} fallback={defaultParcelMethod(s.paymentTerms, r.label)} />
                        <div><Badge tone={stage === "boleto_a_emitir" ? "warning" : stage === "forma_a_definir" ? "neutral" : "success"}>{PARCEL_STAGE_LABEL[stage]}</Badge></div>
                        {stage === "boleto_a_emitir" && <BoletoButton receivableId={r.id} code={s.code} client={s.clientName} label={r.label} amount={formatBRL(r.amountCents)} due={r.dueDate ? d(r.dueDate) : "a definir"} />}
                        {stage === "boleto_emitido" && <div>{r.boletoNumber && <div className="max-w-40 truncate font-mono" title={r.boletoNumber}>{r.boletoNumber}</div>}<span className="flex gap-2"><BoletoButton receivableId={r.id} code={s.code} client={s.clientName} label={r.label} amount={formatBRL(r.amountCents)} due={r.dueDate ? d(r.dueDate) : "a definir"} current={r.boletoNumber ?? ""} /><UndoButton kind="boleto" id={r.id} label="Desfazer" /></span></div>}
                      </div>);
                    })()}</td>
                    <td className="px-4 py-3"><Badge tone={REC_TONE[st]}>{STATE_LABEL[st]}</Badge><div className="mt-2"><ReceivableActions id={r.id} label={r.label} code={s.code} client={s.clientName} amountCents={r.amountCents} state={st} suggestedMethod={METHOD_GUESS(s.paymentTerms)} /></div></td>
                    <td className="px-4 py-3 text-xs">{r.status === "RECEBIDO" ? <>{d(r.receivedAt)} · {formatBRL(r.receivedCents ?? r.amountCents)}<br /><span className="text-muted">{r.method}{r.note ? ` · ${r.note}` : ""}</span></> : !r.documents.length && "—"}
                      {r.documents.map((x) => <div key={x.id} className="mt-0.5 max-w-[220px] truncate"><a className="link" href={href(x.id)} target="_blank" rel="noopener" title={x.fileName}>{DOC_TYPES[x.type].split(" ")[0]}: {x.fileName}</a></div>)}</td>
                  </tr>); })}
              </tbody>
            </table>
          </section>
          <section className="card p-4">
            <p className="label mb-2">Documentos da venda <span className="normal-case tracking-normal">· {s.documents.length}</span></p>
            {s.documents.length ? <ul>{s.documents.map(doc)}</ul> : <p className="text-sm text-muted">Nenhum documento anexado. Anexe a nota fiscal (PDF/XML), os boletos e os comprovantes de pagamento.</p>}
          </section>
        </div>
        <div className="space-y-5">
          <DocumentUploader saleId={s.id} receivables={recOpts} />
          <NotesPanel saleId={s.id} me={user.id} notes={s.notes.map((n) => ({ id: n.id, text: n.text, authorId: n.authorId, authorName: n.authorName, createdAt: n.createdAt.toISOString() }))} />
        </div>
      </div>
    </>
  );
}
