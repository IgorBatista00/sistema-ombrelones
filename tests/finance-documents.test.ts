import { describe, expect, it } from "vitest";
import { detectDocType, safeFileName } from "@/modules/finance/document-rules";

describe("documentos do financeiro", () => {
  it("reconhece PDF, XML da NF-e e imagens pelo conteúdo", () => {
    expect(detectDocType(Buffer.from("%PDF-1.7\n..."))?.ext).toBe("pdf");
    expect(detectDocType(Buffer.from('﻿  <?xml version="1.0" encoding="UTF-8"?><nfeProc>'))?.ext).toBe("xml");
    expect(detectDocType(Buffer.from('<nfeProc versao="4.00">'))?.ext).toBe("xml");
    expect(detectDocType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]))?.mime).toBe("image/jpeg");
    expect(detectDocType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))?.mime).toBe("image/png");
  });
  it("recusa outros formatos, mesmo com extensão trocada", () => {
    expect(detectDocType(Buffer.from("<html><script>alert(1)</script>"))).toBeNull();
    expect(detectDocType(Buffer.from("MZ\x90\x00executavel"))).toBeNull();
    expect(detectDocType(Buffer.from("PK\x03\x04zip"))).toBeNull();
  });
  it("nome de arquivo seguro, com a extensão real", () => {
    expect(safeFileName("../../etc/NF 1234.exe", "pdf")).toBe("NF 1234.pdf");
    expect(safeFileName('bo"leto<1>.PDF', "pdf")).toBe("boleto1.pdf");
    expect(safeFileName("", "xml")).toBe("arquivo.xml");
  });
});
