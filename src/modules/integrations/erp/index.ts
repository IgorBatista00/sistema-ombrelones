/**
 * Integração ERP (Bling ou outro) — CONTRATO preparado, implementação PENDENTE.
 *
 * Sistema responsável por cada dado (evita divergência):
 * | Dado                 | Fonte da verdade | Direção            |
 * |----------------------|------------------|--------------------|
 * | Produtos / SKUs      | ERP              | ERP → loja         |
 * | Conteúdo/fotos/SEO   | Loja             | (não sincroniza)   |
 * | Preços de atacado    | ERP              | ERP → loja         |
 * | Estoque físico       | ERP              | ERP → loja (onHand)|
 * | Reservas             | Loja             | (não sincroniza)   |
 * | Clientes (empresas)  | Loja             | loja → ERP         |
 * | Pedidos              | Loja             | loja → ERP (pagos) |
 * | Notas fiscais        | ERP              | ERP → loja         |
 * | Situação faturamento | ERP              | ERP → loja         |
 */
import { IntegrationNotConfiguredError } from "@/lib/errors";

export interface ErpProduct { erpRef: string; sku: string; name: string; priceCents: number | null; onHand: number | null; active: boolean }
export interface ErpInvoice { orderErpRef: string; number: string; series: string; accessKey: string; status: "AUTHORIZED" | "REJECTED" | "CANCELED"; pdfUrl?: string; xmlUrl?: string; issuedAt: Date }

export interface ErpProvider {
  readonly name: string;
  pullProducts(since?: Date): Promise<ErpProduct[]>;
  pushCustomer(companyId: string): Promise<string>;
  pushOrder(orderId: string): Promise<string>;
  pullInvoices(since?: Date): Promise<ErpInvoice[]>;
}

export function getErpProvider(): ErpProvider {
  throw new IntegrationNotConfiguredError("ERP");
}
