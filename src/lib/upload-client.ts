/**
 * Envio de arquivos pelo navegador.
 * - Desenvolvimento (padrão): o arquivo vai junto no formulário, como sempre.
 * - Vercel (NEXT_PUBLIC_UPLOAD_MODE=blob): cada arquivo vai DIRETO ao Vercel Blob (sem o limite de 4,5 MB
 *   da Vercel) e o formulário leva só a referência; o servidor confere o arquivo antes de registrar.
 */
export type UploadKind = "image" | "doc";
export const DIRECT_UPLOAD = process.env.NEXT_PUBLIC_UPLOAD_MODE === "blob";
const LIMIT: Record<UploadKind, [number, string]> = { image: [8 * 1024 * 1024, "8 MB"], doc: [15 * 1024 * 1024, "15 MB"] };
const PREFIX: Record<UploadKind, string> = { image: "img/", doc: "doc/" };
const slug = (name: string) => {
  const ext = (name.match(/\.([a-z0-9]{1,5})$/i)?.[1] ?? "").toLowerCase();
  const base = name.replace(/\.[^.]+$/, "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "arquivo";
  return ext ? `${base}.${ext}` : base;
};

/** Acrescenta os arquivos ao FormData no campo indicado (envio direto quando ativo). Lança Error com mensagem em português. */
export async function appendFiles(fd: FormData, files: File[], kind: UploadKind, field = "files") {
  const [max, label] = LIMIT[kind];
  const big = files.find((f) => f.size > max);
  if (big) throw new Error(`"${big.name}" passa de ${label}.`);
  if (!DIRECT_UPLOAD) { files.forEach((f) => fd.append(field, f)); return; }
  const { upload } = await import("@vercel/blob/client");
  for (const f of files) {
    try {
      const b = await upload(`${PREFIX[kind]}${slug(f.name)}`, f, {
        access: kind === "doc" ? "private" : "public", handleUploadUrl: "/api/admin/uploads/token", clientPayload: JSON.stringify({ kind }), contentType: f.type || undefined,
      });
      fd.append(field, JSON.stringify({ url: b.url, pathname: b.pathname, name: f.name }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      throw new Error(/content type|contentType/i.test(msg) ? `"${f.name}": tipo de arquivo não aceito.` : /too large|size/i.test(msg) ? `"${f.name}" passa de ${label}.` : `Não foi possível enviar "${f.name}". Verifique a conexão e tente de novo.`);
    }
  }
}

/** Planilhas de importação continuam passando pelo servidor: limite de 4 MB por arquivo (limite da Vercel). */
export const SHEET_MAX_BYTES = 4 * 1024 * 1024;
export const sheetTooBig = (f: File) => (f.size > SHEET_MAX_BYTES ? `A planilha "${f.name}" passa de 4 MB. Divida em arquivos menores (por exemplo, por categoria) e importe em partes.` : null);
