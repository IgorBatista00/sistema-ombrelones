import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { AppError, IntegrationNotConfiguredError } from "@/lib/errors";
import { MAX_DOC_BYTES, detectDocType, safeFileName } from "@/modules/finance/document-rules";
import { BLOB_PREFIX, checkRef, deleteBlob, isBlob, putBlob, readBlob, streamPrivate } from "./blob";
import { uploadName, type UploadInput } from "./uploads";

/**
 * Armazenamento PRIVADO (documentos financeiros: NF, boletos, comprovantes).
 * Nunca é servido por URL pública: só pela rota /api/admin/financeiro/documentos/<id>, que exige permissão FINANCE.
 * STORAGE_PROVIDER=local → pasta STORAGE_PRIVATE_DIR (padrão storage/private).
 * STORAGE_PROVIDER=vercel-blob → store PRIVADO do Vercel Blob (exige token; nunca há link público).
 */
const dir = () => path.resolve(process.env.STORAGE_PRIVATE_DIR ?? "storage/private");
const keyOk = (k: string) => /^[0-9a-f-]{36}\.(pdf|xml|jpg|png|webp)$/.test(k);
const blobKeyOk = (k: string) => k.startsWith(BLOB_PREFIX.doc) && !k.includes("..");

export async function saveDocument(input: UploadInput) {
  const name = uploadName(input);
  if (!(input instanceof File)) {
    // Produção (Vercel): já está no Blob privado — confere tipo real e tamanho; se não servir, apaga.
    if (!isBlob()) throw new AppError("FILE_REF", "Envio direto de arquivos não está ativo neste ambiente.");
    checkRef(input, "doc");
    const buf = await readBlob(input.pathname, "doc", MAX_DOC_BYTES).catch(async (e) => { await deleteBlob(input.url, "doc"); throw e instanceof AppError && e.code === "FILE_TOO_LARGE" ? new AppError("FILE_TOO_LARGE", `"${name}" passa de 15 MB.`) : e; });
    const t = detectDocType(buf);
    if (!t) { await deleteBlob(input.url, "doc"); throw new AppError("FILE_TYPE", `"${name}" não é PDF, XML (NF-e) ou imagem JPG/PNG/WebP.`); }
    if (buf.length === 0) { await deleteBlob(input.url, "doc"); throw new AppError("FILE_EMPTY", "O arquivo está vazio."); }
    return { key: input.pathname, mime: t.mime, size: buf.length, fileName: safeFileName(name, t.ext) };
  }
  const file = input;
  if (file.size === 0) throw new AppError("FILE_EMPTY", "O arquivo está vazio.");
  if (file.size > MAX_DOC_BYTES) throw new AppError("FILE_TOO_LARGE", `"${file.name}" passa de 15 MB.`);
  const buf = Buffer.from(await file.arrayBuffer());
  const t = detectDocType(buf);
  if (!t) throw new AppError("FILE_TYPE", `"${file.name}" não é PDF, XML (NF-e) ou imagem JPG/PNG/WebP.`);
  const key = `${randomUUID()}.${t.ext}`;
  if (isBlob()) {
    const b = await putBlob(`${BLOB_PREFIX.doc}${key}`, buf, t.mime, "doc");
    return { key: b.pathname, mime: t.mime, size: buf.length, fileName: safeFileName(file.name, t.ext) };
  }
  if (process.env.STORAGE_PROVIDER !== "local") throw new IntegrationNotConfiguredError("Armazenamento de documentos");
  await mkdir(dir(), { recursive: true, mode: 0o700 });
  await writeFile(path.join(dir(), key), buf, { mode: 0o600 });
  return { key, mime: t.mime, size: buf.length, fileName: safeFileName(file.name, t.ext) };
}

/** Apaga o arquivo do armazenamento. Falha ao apagar não desfaz a exclusão do registro (fica no log do servidor). */
export async function deleteDocumentFile(key: string) {
  if (isBlob() && blobKeyOk(key)) return deleteBlob(key, "doc");
  if (!keyOk(key) || process.env.STORAGE_PROVIDER !== "local") return;
  try { await unlink(path.join(dir(), key)); } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") console.error("não foi possível apagar o arquivo", key, e); }
}

/** Conteúdo para download: stream (Blob, sem limite de 4,5 MB na resposta) ou Buffer (disco). */
export async function openDocument(key: string): Promise<ReadableStream<Uint8Array> | Buffer> {
  if (isBlob() && blobKeyOk(key)) return streamPrivate(key);
  return readDocument(key);
}

export async function readDocument(key: string) {
  if (!keyOk(key) || process.env.STORAGE_PROVIDER !== "local") throw new AppError("NOT_FOUND", "Arquivo não encontrado.", 404);
  try { return await readFile(path.join(dir(), key)); } catch { throw new AppError("NOT_FOUND", "Arquivo não encontrado.", 404); }
}
