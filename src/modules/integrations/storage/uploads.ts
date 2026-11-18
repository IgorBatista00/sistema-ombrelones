import { isBlobRef, type BlobRef } from "./blob";

/**
 * Arquivos recebidos num formulário: File (envio pelo servidor, em desenvolvimento)
 * ou referência JSON a um arquivo já enviado direto ao Vercel Blob pelo navegador (produção).
 */
export type UploadInput = File | BlobRef;
export const uploadName = (u: UploadInput) => (u instanceof File ? u.name : u.name || u.pathname.split("/").pop() || "arquivo");

export function formUploads(form: FormData, field = "files"): UploadInput[] {
  const out: UploadInput[] = [];
  for (const v of form.getAll(field)) {
    if (v instanceof File) { if (v.size > 0) out.push(v); continue; }
    try { const j = JSON.parse(String(v)); if (isBlobRef(j)) out.push({ url: j.url, pathname: j.pathname, name: String(j.name ?? "").slice(0, 200) }); } catch { /* ignora campo inválido */ }
  }
  return out;
}

/** Copia os arquivos para outro FormData (mantendo o formato de cada um). */
export const appendUploads = (fd: FormData, list: UploadInput[], field = "files") => list.forEach((u) => fd.append(field, u instanceof File ? u : JSON.stringify(u)));
