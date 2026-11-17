import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { saveDocument, deleteDocumentFile } from "@/modules/integrations/storage/private";
import { DOC_TYPES, type DocTypeKey } from "./document-rules";

export async function attachDocument(actor: { id: string; name: string }, form: FormData) {
  const meta = z.object({
    saleId: z.string().min(1),
    receivableId: z.string().optional().nullable().transform((v) => v || null),
    type: z.enum(Object.keys(DOC_TYPES) as [DocTypeKey, ...DocTypeKey[]], { message: "Escolha o tipo do documento." }),
    description: z.string().trim().max(160).optional().nullable().transform((v) => v || null),
  }).safeParse({ saleId: form.get("saleId"), receivableId: form.get("receivableId"), type: form.get("type"), description: form.get("description") });
  if (!meta.success) throw new AppError("VALIDATION", meta.error.issues[0]?.message ?? "Dados inválidos.", 422);
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) throw new AppError("NO_FILES", "Selecione o arquivo.");
  if (files.length > 10) throw new AppError("TOO_MANY", "Envie até 10 arquivos por vez.");
  const sale = await db.sale.findUnique({ where: { id: meta.data.saleId }, include: { receivables: { select: { id: true } } } });
  if (!sale) throw new AppError("NOT_FOUND", "Venda não encontrada.", 404);
  if (meta.data.receivableId && !sale.receivables.some((r) => r.id === meta.data.receivableId)) throw new AppError("VALIDATION", "Parcela não pertence a esta venda.", 422);
  const saved = [];
  for (const f of files) {
    const s = await saveDocument(f);
    const doc = await db.$transaction(async (tx) => {
      const d = await tx.financeDocument.create({ data: { saleId: sale.id, receivableId: meta.data.receivableId, type: meta.data.type, description: meta.data.description, fileName: s.fileName, storageKey: s.key, mimeType: s.mime, sizeBytes: s.size, uploadedById: actor.id, uploadedBy: actor.name } });
      await tx.auditLog.create({ data: { actorId: actor.id, action: "finance.document.attach", entity: "Sale", entityId: sale.id, after: { documentId: d.id, type: d.type, fileName: d.fileName, receivableId: d.receivableId } } });
      return d;
    });
    saved.push({ id: doc.id, fileName: doc.fileName });
  }
  return saved;
}

export async function removeDocument(actorId: string, id: string) {
  const d = await db.financeDocument.findUnique({ where: { id } });
  if (!d || d.deletedAt) throw new AppError("NOT_FOUND", "Documento não encontrado.", 404);
  await db.$transaction([
    db.financeDocument.update({ where: { id }, data: { deletedAt: new Date() } }),
    db.auditLog.create({ data: { actorId, action: "finance.document.remove", entity: "Sale", entityId: d.saleId, before: { documentId: d.id, type: d.type, fileName: d.fileName } } }),
  ]);
  await deleteDocumentFile(d.storageKey);
}

const noteText = z.string().trim().min(1, "Escreva a observação.").max(2000, "Observação muito longa (máx. 2.000 caracteres).");
export async function addSaleNote(actor: { id: string; name: string }, saleId: string, text: string) {
  const t = noteText.safeParse(text);
  if (!t.success) throw new AppError("VALIDATION", t.error.issues[0].message, 422);
  if (!(await db.sale.findUnique({ where: { id: saleId }, select: { id: true } }))) throw new AppError("NOT_FOUND", "Venda não encontrada.", 404);
  return db.saleNote.create({ data: { saleId, text: t.data, authorId: actor.id, authorName: actor.name } });
}
/** Só quem escreveu apaga a própria observação (fica registrada no log). */
export async function removeSaleNote(actorId: string, id: string) {
  const n = await db.saleNote.findUnique({ where: { id } });
  if (!n || n.deletedAt) throw new AppError("NOT_FOUND", "Observação não encontrada.", 404);
  if (n.authorId !== actorId) throw new AppError("FORBIDDEN", "Só o autor pode excluir a observação.", 403);
  await db.$transaction([
    db.saleNote.update({ where: { id }, data: { deletedAt: new Date() } }),
    db.auditLog.create({ data: { actorId, action: "finance.note.remove", entity: "Sale", entityId: n.saleId, before: { text: n.text } } }),
  ]);
}

export async function saleDetail(id: string) {
  return db.sale.findUnique({
    where: { id },
    include: {
      receivables: { orderBy: { position: "asc" }, include: { documents: { where: { deletedAt: null }, orderBy: { createdAt: "asc" } } } },
      documents: { where: { deletedAt: null }, orderBy: { createdAt: "desc" } },
      notes: { where: { deletedAt: null }, orderBy: { createdAt: "desc" } },
    },
  });
}
