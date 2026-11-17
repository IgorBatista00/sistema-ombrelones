/** Documentos do financeiro — regras puras (tipos aceitos, validação pelo conteúdo). */
export const DOC_TYPES = { NOTA_FISCAL: "Nota fiscal", BOLETO: "Boleto", COMPROVANTE: "Comprovante de pagamento", OUTRO: "Outro" } as const;
export type DocTypeKey = keyof typeof DOC_TYPES;
export const MAX_DOC_BYTES = 15 * 1024 * 1024;
export const ACCEPT = ".pdf,.xml,.jpg,.jpeg,.png,.webp,application/pdf,text/xml,application/xml,image/jpeg,image/png,image/webp";

/** Identifica o arquivo pela assinatura (PDF, XML da NF-e, JPG, PNG, WebP). Extensão enviada é ignorada. */
export function detectDocType(b: Buffer): { mime: string; ext: string } | null {
  if (b.length < 4) return null;
  if (b.subarray(0, 5).toString("latin1") === "%PDF-") return { mime: "application/pdf", ext: "pdf" };
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: "image/png", ext: "png" };
  if (b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP") return { mime: "image/webp", ext: "webp" };
  const head = b.subarray(0, 512).toString("utf8").replace(/^﻿/, "").trimStart();
  if (/^<\?xml[\s?]/.test(head) || /^<(nfeProc|NFe|procEventoNFe|CompNfse|Nfse)[\s>]/.test(head)) return { mime: "application/xml", ext: "xml" };
  return null;
}

/** Nome de arquivo seguro para exibição/download (sem caminhos nem caracteres de controle). */
export function safeFileName(name: string, ext: string) {
  const base = (name.split(/[\\/]/).pop() ?? "arquivo").replace(/[\u0000-\u001f"<>|:*?]/g, "").replace(/\.[A-Za-z0-9]{1,5}$/, "").trim().slice(0, 100) || "arquivo";
  return `${base}.${ext}`;
}

export const formatBytes = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`);
