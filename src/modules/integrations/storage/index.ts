import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { AppError, IntegrationNotConfiguredError } from "@/lib/errors";
import { BLOB_PREFIX, checkRef, deleteBlob, isBlob, putBlob, readBlob } from "./blob";
import type { UploadInput } from "./uploads";

/**
 * Armazenamento de imagens.
 * - STORAGE_PROVIDER=local → disco (desenvolvimento/homologação), servido por /api/media/<chave>.
 * - STORAGE_PROVIDER=vercel-blob → Vercel Blob público (produção na Vercel); o navegador envia direto ao Blob.
 */
export interface StoredFile { key: string; url: string }
const MAX_BYTES = 8 * 1024 * 1024;
const SIGNATURES: [string, (b: Buffer) => boolean][] = [
  ["image/jpeg", (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff],
  ["image/png", (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))],
  ["image/webp", (b) => b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP"],
  ["image/avif", (b) => b.subarray(4, 12).toString().startsWith("ftypavi")],
];
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif" };

/** Valida pelo conteúdo real (assinatura), não pela extensão enviada. */
export function detectImageType(buf: Buffer): string | null {
  return SIGNATURES.find(([, test]) => test(buf))?.[0] ?? null;
}

const localDir = () => path.resolve(process.env.STORAGE_LOCAL_DIR ?? "storage/uploads");
const safeKey = (key: string) => {
  if (!/^[a-z0-9-]+\.(jpg|png|webp|avif)$/.test(key)) throw new AppError("NOT_FOUND", "Arquivo não encontrado.", 404);
  return key;
};

const baseName = (originalName: string) => originalName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\.[a-z0-9]+$/, "").replace(/[^a-z0-9]+/g, "-").slice(0, 40).replace(/^-|-$/g, "");

export async function saveImage(input: UploadInput, originalName: string): Promise<StoredFile> {
  // Produção (Vercel): arquivo já está no Blob — confere o conteúdo real e o tamanho; se não servir, apaga.
  if (!(input instanceof File)) {
    if (!isBlob()) throw new AppError("FILE_REF", "Envio direto de arquivos não está ativo neste ambiente.");
    checkRef(input, "image");
    const buf = await readBlob(input.pathname, "image", MAX_BYTES).catch(async (e) => { await deleteBlob(input.url, "image"); throw e; });
    if (!detectImageType(buf)) { await deleteBlob(input.url, "image"); throw new AppError("FILE_TYPE", `"${originalName}" não é uma imagem JPG, PNG, WebP ou AVIF.`); }
    return { key: input.pathname, url: input.url };
  }
  const file = input;
  if (file.size > MAX_BYTES) throw new AppError("FILE_TOO_LARGE", `"${originalName}" passa de 8 MB.`);
  const buf = Buffer.from(await file.arrayBuffer());
  const type = detectImageType(buf);
  if (!type) throw new AppError("FILE_TYPE", `"${originalName}" não é uma imagem JPG, PNG, WebP ou AVIF.`);
  const base = baseName(originalName);
  const key = `${randomUUID()}${base ? `-${base}` : ""}.${EXT[type]}`;

  if (process.env.STORAGE_PROVIDER === "local") {
    await mkdir(localDir(), { recursive: true });
    await writeFile(path.join(localDir(), key), buf);
    return { key, url: `/api/media/${key}` };
  }
  if (isBlob()) {
    const b = await putBlob(`${BLOB_PREFIX.image}${key}`, buf, type, "image");
    return { key: b.pathname, url: b.url };
  }
  throw new IntegrationNotConfiguredError("Armazenamento de imagens");
}

export async function readLocal(key: string) {
  if (process.env.STORAGE_PROVIDER !== "local") throw new AppError("NOT_FOUND", "Arquivo não encontrado.", 404);
  const k = safeKey(key);
  try {
    const buf = await readFile(path.join(localDir(), k));
    return { buf, type: detectImageType(buf) ?? "application/octet-stream" };
  } catch {
    throw new AppError("NOT_FOUND", "Arquivo não encontrado.", 404);
  }
}

export async function deleteImage(key: string | null | undefined) {
  if (!key) return;
  if (isBlob() && key.startsWith(BLOB_PREFIX.image)) return deleteBlob(key, "image");
  if (process.env.STORAGE_PROVIDER === "local") await unlink(path.join(localDir(), safeKey(key))).catch(() => {});
}
