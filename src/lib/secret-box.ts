import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Criptografia simétrica (AES-256-GCM) para segredos guardados no banco (ex.: tokens do Mercado Livre).
 * Chave em APP_ENCRYPTION_KEY: 32 bytes em base64 (gerar com `openssl rand -base64 32`). Nunca registrar o texto aberto.
 */
function key() {
  const k = Buffer.from(process.env.APP_ENCRYPTION_KEY ?? "", "base64");
  if (k.length !== 32) throw new Error("APP_ENCRYPTION_KEY ausente ou inválida (precisa de 32 bytes em base64).");
  return k;
}
export const hasEncryptionKey = () => Buffer.from(process.env.APP_ENCRYPTION_KEY ?? "", "base64").length === 32;

export function seal(plain: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), data.toString("base64")].join(".");
}
export function open(sealed: string) {
  const [v, iv, tag, data] = sealed.split(".");
  if (v !== "v1" || !iv || !tag || !data) throw new Error("Formato de segredo inválido.");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(data, "base64")), d.final()]).toString("utf8");
}
