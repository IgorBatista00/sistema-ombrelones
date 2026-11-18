import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { checkRef } from "@/modules/integrations/storage/blob";
import { formUploads, appendUploads } from "@/modules/integrations/storage/uploads";
import { appUrl } from "@/lib/app-url";

const env = { ...process.env };
afterEach(() => { process.env = { ...env }; });

describe("arquivos no Vercel Blob", () => {
  const img = { url: "https://abc123.public.blob.vercel-storage.com/img/foto-x1Y2.jpg", pathname: "img/foto-x1Y2.jpg", name: "foto.jpg" };
  it("aceita só arquivos do nosso store, na pasta certa", () => {
    expect(() => checkRef(img, "image")).not.toThrow();
    expect(() => checkRef({ ...img, url: "https://evil.com/img/foto.jpg" }, "image")).toThrow(/inválido/);
    expect(() => checkRef({ ...img, url: "http://abc123.public.blob.vercel-storage.com/img/foto-x1Y2.jpg" }, "image")).toThrow();
    expect(() => checkRef(img, "doc")).toThrow(); // imagem pública não vale como documento privado
    expect(() => checkRef({ ...img, pathname: "doc/foto-x1Y2.jpg" }, "image")).toThrow(); // pathname diferente da URL
    const doc = { url: "https://abc.private.blob.vercel-storage.com/doc/nf-AbC.pdf", pathname: "doc/nf-AbC.pdf", name: "nf.pdf" };
    expect(() => checkRef(doc, "doc")).not.toThrow();
    expect(() => checkRef({ ...doc, url: "https://abc.private.blob.vercel-storage.com/doc/../x.pdf", pathname: "doc/../x.pdf" }, "doc")).toThrow();
  });
  it("lê do formulário tanto arquivos quanto referências e ignora lixo", () => {
    const fd = new FormData();
    fd.append("files", new File(["abc"], "a.pdf"));
    fd.append("files", new File([], "vazio.pdf"));
    fd.append("files", JSON.stringify(img));
    fd.append("files", "não é json");
    fd.append("files", JSON.stringify({ url: 1 }));
    const list = formUploads(fd);
    expect(list).toHaveLength(2);
    expect(list[0]).toBeInstanceOf(File);
    expect(list[1]).toEqual(img);
    const copy = new FormData(); appendUploads(copy, list);
    expect(formUploads(copy)).toHaveLength(2);
  });
});

describe("endereço público", () => {
  it("produção usa APP_URL; prévia usa o próprio endereço", () => {
    process.env.APP_URL = "https://loja.com.br/"; delete process.env.VERCEL_ENV;
    expect(appUrl()).toBe("https://loja.com.br");
    process.env.VERCEL_ENV = "preview"; process.env.VERCEL_BRANCH_URL = "loja-git-ajuste-x.vercel.app";
    expect(appUrl()).toBe("https://loja-git-ajuste-x.vercel.app");
    delete process.env.APP_URL; delete process.env.VERCEL_ENV; delete process.env.VERCEL_BRANCH_URL; process.env.VERCEL_PROJECT_PRODUCTION_URL = "loja.vercel.app";
    expect(appUrl()).toBe("https://loja.vercel.app");
  });
});
