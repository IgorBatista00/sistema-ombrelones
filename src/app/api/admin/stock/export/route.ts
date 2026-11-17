import ExcelJS from "exceljs";
import { route } from "@/lib/route";
import { requireAdmin } from "@/modules/auth/session";
import { getStockDisplay } from "@/modules/inventory/movements";
import { listStock, type StockFilters } from "@/modules/inventory/admin-queries";

const STATE = { zero: "zerado", low: "abaixo do mínimo", ok: "normal", mto: "sob encomenda" };

/** GET /api/admin/stock/export?<filtros> → estoque-AAAA-MM-DD.xlsx */
export const GET = route(async (req) => {
  await requireAdmin("STOCK");
  const rows = await listStock(Object.fromEntries(new URL(req.url).searchParams) as StockFilters, await getStockDisplay());
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet("estoque");
  ws.columns = [
    { header: "sku", key: "sku", width: 16 }, { header: "codigo_produto", key: "code", width: 16 }, { header: "produto", key: "name", width: 40 }, { header: "categoria", key: "cat", width: 22 },
    { header: "fisico", key: "onHand", width: 10 }, { header: "reservado", key: "reserved", width: 10 }, { header: "disponivel", key: "available", width: 11 }, { header: "minimo", key: "min", width: 9 },
    { header: "situacao", key: "state", width: 18 }, { header: "custo_medio", key: "cost", width: 14, style: { numFmt: "#,##0.00" } }, { header: "ultima_compra", key: "last", width: 14, style: { numFmt: "#,##0.00" } }, { header: "valor_estoque", key: "value", width: 14, style: { numFmt: "#,##0.00" } },
  ];
  ws.getRow(1).font = { bold: true }; ws.views = [{ state: "frozen", ySplit: 1 }];
  rows.forEach((r) => ws.addRow({ sku: r.sku, code: r.code, name: r.productName, cat: r.category, onHand: r.madeToOrder ? null : r.onHand, reserved: r.madeToOrder ? null : r.reserved, available: r.madeToOrder ? null : r.available, min: r.madeToOrder ? null : r.minQty, state: STATE[r.state], cost: r.unitCostCents == null ? null : r.unitCostCents / 100, last: r.lastCostCents == null ? null : r.lastCostCents / 100, value: r.valueCents == null || r.madeToOrder ? null : r.valueCents / 100 }));
  const date = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  return new Response(new Uint8Array(Buffer.from(await wb.xlsx.writeBuffer())), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="estoque-${date}.xlsx"`, "Cache-Control": "no-store" } });
});
