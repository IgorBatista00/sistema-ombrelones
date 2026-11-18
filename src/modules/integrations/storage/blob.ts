import "server-only";
import { del, get, put } from "@vercel/blob";
import { AppError, IntegrationNotConfiguredError } from "@/lib/errors";

/**
 * Vercel Blob (produção na Vercel). Dois stores separados:
 * - PÚBLICO (imagens de produto/orçamento) → token BLOB_READ_WRITE_TOKEN
 * - PRIVADO (NF, boletos, comprovantes)   → token PRIVATE_BLOB_READ_WRITE_TOKEN
 * Na Vercel o disco do servidor não guarda arquivos e cada requisição aceita no máx. 4,5 MB,
 * por isso o navegador envia o arquivo DIRETO ao Blob (rota /api/admin/uploads/token gera um token curto)
 * e o servidor só confere o arquivo depois (tipo real e tamanho) antes de registrá-lo.
 */
export type BlobKind = "image" | "doc";
export const BLOB_PREFIX: Record<BlobKind, string> = { image: "img/", doc: "doc/" };
export const isBlob = () => process.env.STORAGE_PROVIDER === "vercel-blob";

export function blobToken(kind: BlobKind) {
  const t = kind === "image" ? process.env.BLOB_READ_WRITE_TOKEN : process.env.PRIVATE_BLOB_READ_WRITE_TOKEN;
  if (!t) throw new IntegrationNotConfiguredError(kind === "image" ? "Armazenamento de imagens (Vercel Blob)" : "Armazenamento de documentos (Vercel Blob privado)");
  return t;
}
const access = (kind: BlobKind): "public" | "private" => (kind === "image" ? "public" : "private");

/** Referência enviada pelo navegador depois do upload direto. */
export interface BlobRef { url: string; pathname: string; name: string }
export const isBlobRef = (v: unknown): v is BlobRef =>
  !!v && typeof v === "object" && typeof (v as BlobRef).url === "string" && typeof (v as BlobRef).pathname === "string";

/** Aceita só arquivos do NOSSO store e da pasta certa (impede registrar URL de terceiros). */
export function checkRef(ref: BlobRef, kind: BlobKind) {
  let u: URL;
  try { u = new URL(ref.url); } catch { throw new AppError("FILE_REF", "Arquivo enviado inválido."); }
  const host = kind === "image" ? ".public.blob.vercel-storage.com" : ".private.blob.vercel-storage.com";
  if (u.protocol !== "https:" || !u.hostname.endsWith(host)) throw new AppError("FILE_REF", "Arquivo enviado inválido.");
  if (!ref.pathname.startsWith(BLOB_PREFIX[kind]) || ref.pathname.includes("..") || decodeURIComponent(u.pathname.slice(1)) !== ref.pathname) throw new AppError("FILE_REF", "Arquivo enviado inválido.");
}

/** Lê o arquivo do Blob (até `max` bytes) para validar o conteúdo. */
export async function readBlob(pathnameOrUrl: string, kind: BlobKind, max: number): Promise<Buffer> {
  const r = await get(pathnameOrUrl, { access: access(kind), token: blobToken(kind), useCache: false });
  if (!r || r.statusCode !== 200) throw new AppError("NOT_FOUND", "Arquivo não encontrado.", 404);
  if (r.blob.size > max) throw new AppError("FILE_TOO_LARGE", "Arquivo maior que o permitido.");
  return Buffer.from(await new Response(r.stream).arrayBuffer());
}

export async function putBlob(pathname: string, buf: Buffer, contentType: string, kind: BlobKind) {
  return put(pathname, buf, { access: access(kind), token: blobToken(kind), contentType, addRandomSuffix: false, allowOverwrite: false });
}

export async function deleteBlob(pathnameOrUrl: string, kind: BlobKind) {
  try { await del(pathnameOrUrl, { token: blobToken(kind) }); } catch (e) { console.error("não foi possível apagar do Blob", pathnameOrUrl, e); }
}

/** Abre um documento privado para download (stream, sem passar pelo limite de 4,5 MB de corpo). */
export async function streamPrivate(pathname: string) {
  const r = await get(pathname, { access: "private", token: blobToken("doc") });
  if (!r || r.statusCode !== 200) throw new AppError("NOT_FOUND", "Arquivo não encontrado.", 404);
  return r.stream;
}
