"use server";
/**
 * Server Actions do painel. TODAS verificam permissão no servidor e
 * registram auditoria. Nenhuma ação altera a situação financeira para
 * "pago" — isso só ocorre via webhook do provedor.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { CompanyStatus, OpeningType, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { requireAdmin } from "@/modules/auth/session";
import { proposeQuote, proposeQuoteSchema } from "@/modules/orders/service";
import { transition } from "@/modules/orders/transition";
import { releaseReservations } from "@/modules/inventory/reservations";
import { sendEmail } from "@/modules/integrations/email";
import { appUrl } from "@/lib/app-url";

export type ActionState = { ok?: boolean; error?: string } | null;
const fail = (e: unknown): ActionState => ({ error: e instanceof AppError ? e.message : e instanceof z.ZodError ? e.issues[0]?.message : "Erro inesperado." });

const audit = (actorId: string, action: string, entity: string, entityId: string, after?: unknown, before?: unknown) =>
  db.auditLog.create({ data: { actorId, action, entity, entityId, after: after as Prisma.InputJsonValue, before: before as Prisma.InputJsonValue } });

const optStr = z.string().trim().transform((v) => v || null);
const optInt = z.string().trim().transform((v) => (v === "" ? null : Math.round(Number(v.replace(",", "."))))).refine((v) => v === null || (Number.isFinite(v) && v >= 0), "Número inválido");
const moneyToCents = z.string().trim().transform((v) => Math.round(Number(v.replace(/\./g, "").replace(",", ".")) * 100)).refine((v) => Number.isFinite(v) && v >= 0, "Valor inválido");

// ---------------------------------------------------------------- Logística

export async function proposeQuoteAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const { user } = await requireAdmin("LOGISTICS");
    const input = proposeQuoteSchema.parse({
      carrierName: fd.get("carrierName"),
      priceCents: moneyToCents.parse(fd.get("price")),
      deadlineDays: Number(fd.get("deadlineDays")),
      validUntil: fd.get("validUntil"),
      notes: fd.get("notes") || undefined,
    });
    await proposeQuote(user.id, String(fd.get("orderId")), input);
    revalidatePath("/admin/logistica");
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function logisticAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const { user } = await requireAdmin("LOGISTICS");
    const orderId = String(fd.get("orderId"));
    const to = String(fd.get("to"));
    await db.$transaction(async (tx) => {
      if (to === "SHIPPED") {
        const carrierName = z.string().min(2).parse(fd.get("carrierName"));
        await tx.shipment.create({ data: { orderId, carrierName, trackingCode: (fd.get("trackingCode") as string) || null, trackingUrl: (fd.get("trackingUrl") as string) || null, shippedAt: new Date() } });
      }
      if (to === "DELIVERED") await tx.shipment.updateMany({ where: { orderId, deliveredAt: null }, data: { deliveredAt: new Date() } });
      await transition(tx, orderId, "LOGISTIC", to, { type: "ADMIN", id: user.id }, (fd.get("note") as string) || undefined);
      await audit(user.id, `order.logistic.${to.toLowerCase()}`, "Order", orderId);
    });
    const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { shipments: true } });
    const buyer = await db.user.findUnique({ where: { id: order.userId } });
    const url = `${appUrl()}/minha-conta/pedidos/${order.id}`;
    if (buyer && to === "SHIPPED") await sendEmail(buyer.email, { kind: "order-shipped", orderNumber: order.code, url, tracking: order.shipments.at(-1)?.trackingCode });
    if (buyer && to === "DELIVERED") await sendEmail(buyer.email, { kind: "order-delivered", orderNumber: order.code, url });
    revalidatePath(`/admin/pedidos/${orderId}`);
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function cancelOrderAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const { user } = await requireAdmin("ORDERS");
    const orderId = String(fd.get("orderId"));
    const reason = z.string().trim().min(3, "Informe o motivo").parse(fd.get("reason"));
    await db.$transaction(async (tx) => {
      await transition(tx, orderId, "COMMERCIAL", "CANCELED", { type: "ADMIN", id: user.id }, reason);
      await tx.order.update({ where: { id: orderId }, data: { canceledAt: new Date(), cancelReason: reason } });
      await releaseReservations(tx, orderId);
      await audit(user.id, "order.cancel", "Order", orderId, { reason });
    });
    revalidatePath(`/admin/pedidos/${orderId}`);
    return { ok: true };
  } catch (e) { return fail(e); }
}

// ---------------------------------------------------------------- Clientes

export async function setCompanyStatusAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const { user } = await requireAdmin("CUSTOMERS");
    const id = String(fd.get("companyId"));
    const status = z.enum(["ACTIVE", "BLOCKED", "UNDER_REVIEW"]).parse(fd.get("status")) as CompanyStatus;
    const reason = (fd.get("reason") as string) || null;
    const before = await db.company.findUniqueOrThrow({ where: { id } });
    if (status === "ACTIVE") {
      const verified = await db.companyMember.count({ where: { companyId: id, user: { emailVerifiedAt: { not: null } } } });
      if (!verified) throw new AppError("NOT_VERIFIED", "Nenhum usuário da empresa confirmou o e-mail.");
    }
    await db.company.update({ where: { id }, data: { status, blockedReason: status === "BLOCKED" ? reason : null } });
    if (status === "BLOCKED") await db.session.deleteMany({ where: { user: { memberships: { some: { companyId: id } } } } });
    await audit(user.id, `company.status.${status.toLowerCase()}`, "Company", id, { status, reason }, { status: before.status });
    revalidatePath("/admin/clientes");
    return { ok: true };
  } catch (e) { return fail(e); }
}

// ---------------------------------------------------------------- Produtos

const variantSchema = z.object({
  sku: z.string().trim().toUpperCase().min(2).max(40),
  name: optStr, color: optStr, finish: optStr, sizeLabel: optStr,
  saleUnit: z.coerce.number().int().min(1),
  availability: z.enum(["STOCK", "MADE_TO_ORDER", "UNAVAILABLE"]),
  leadTimeDays: optInt,
  isActive: z.boolean(),
});

/** Cria/edita variação + preço vigente + saldo + volume de embalagem principal. */
export async function saveVariantAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const { user } = await requireAdmin("PRODUCTS");
    const productId = String(fd.get("productId"));
    const variantId = String(fd.get("variantId") || "");
    const v = variantSchema.parse({
      ...Object.fromEntries(["sku", "name", "color", "finish", "sizeLabel", "saleUnit", "availability", "leadTimeDays"].map((k) => [k, String(fd.get(k) ?? "")])),
      isActive: fd.get("isActive") === "on",
    });
    const price = String(fd.get("price") ?? "").trim();
    const onHand = String(fd.get("onHand") ?? "").trim();
    const pkg = ["lengthMm", "widthMm", "heightMm", "weightG"].map((k) => optInt.parse(String(fd.get(`pkg_${k}`) ?? "")));
    const pkgQty = Number(fd.get("pkg_quantity") || 1);

    await db.$transaction(async (tx) => {
      const variant = variantId
        ? await tx.productVariant.update({ where: { id: variantId }, data: v })
        : await tx.productVariant.create({ data: { ...v, productId } });

      if (price) {
        const cents = moneyToCents.parse(price);
        const list = await tx.priceList.findFirstOrThrow({ where: { isDefault: true } });
        const current = await tx.price.findFirst({ where: { variantId: variant.id, priceListId: list.id, validTo: null }, orderBy: { validFrom: "desc" } });
        if (current?.amountCents !== cents) {
          // Histórico de preços preservado: encerra o vigente e cria novo.
          const now = new Date();
          if (current) await tx.price.update({ where: { id: current.id }, data: { validTo: now } });
          await tx.price.create({ data: { variantId: variant.id, priceListId: list.id, amountCents: cents, validFrom: now } });
        }
      }
      if (onHand !== "") {
        const qty = z.coerce.number().int().min(0).parse(onHand);
        const stock = await tx.stockLevel.findUnique({ where: { variantId: variant.id } });
        if (stock && qty < stock.reserved) throw new AppError("STOCK_BELOW_RESERVED", `Saldo não pode ser menor que o reservado (${stock.reserved}).`);
        await tx.stockLevel.upsert({ where: { variantId: variant.id }, update: { onHand: qty, version: { increment: 1 } }, create: { variantId: variant.id, onHand: qty } });
        if ((stock?.onHand ?? 0) !== qty) await tx.stockMovement.create({ data: { variantId: variant.id, type: "AJUSTE", delta: qty - (stock?.onHand ?? 0), balanceAfter: qty, reason: "Correção de lançamento", notes: "Editado no cadastro do produto", actorId: user.id } });
      }
      if (pkg.every((x) => x != null)) {
        const [lengthMm, widthMm, heightMm, weightG] = pkg as number[];
        await tx.packageVolume.deleteMany({ where: { variantId: variant.id } });
        await tx.packageVolume.create({ data: { variantId: variant.id, lengthMm, widthMm, heightMm, weightG, quantity: pkgQty } });
      }
      await tx.auditLog.create({ data: { actorId: user.id, action: variantId ? "variant.update" : "variant.create", entity: "ProductVariant", entityId: variant.id, after: { ...v, price, onHand } as Prisma.InputJsonValue } });
    });
    revalidatePath(`/admin/produtos/${productId}`);
    return { ok: true };
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") return { error: "SKU já utilizado por outra variação." };
    return fail(e);
  }
}


// ---------------------------------------------------------------- Configurações

const SETTING_KEYS = ["brand", "company", "contact", "commercial", "shipping"] as const;

export async function saveSettingAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const { user } = await requireAdmin("SETTINGS");
    const key = String(fd.get("key"));
    let value: Prisma.InputJsonValue;
    if (key.startsWith("page:")) {
      value = { body: String(fd.get("body") ?? "") };
    } else if ((SETTING_KEYS as readonly string[]).includes(key)) {
      if (key === "commercial") {
        const enabled = ["PIX", "BOLETO", "CREDIT_CARD"].filter((m) => fd.get(`method_${m}`) === "on");
        if (!enabled.length) throw new AppError("VALIDATION", "Habilite ao menos uma forma de pagamento.");
        value = {
          reservationMinutes: { PIX: Number(fd.get("res_PIX")), BOLETO: Number(fd.get("res_BOLETO")), CREDIT_CARD: Number(fd.get("res_CREDIT_CARD")) },
          quoteReservationHours: Number(fd.get("quoteReservationHours")),
          enabledMethods: enabled,
          maxInstallments: Number(fd.get("maxInstallments")),
          boletoDueDays: Number(fd.get("boletoDueDays")),
        };
        if (Object.values(value as Record<string, unknown>).some((x) => typeof x === "number" && !(x > 0))) throw new AppError("VALIDATION", "Valores numéricos devem ser positivos.");
      } else {
        value = Object.fromEntries([...fd.entries()].filter(([k]) => !["key"].includes(k) && !k.startsWith("$")).map(([k, v]) => [k, String(v).trim()]).filter(([, v]) => v !== ""));
      }
    } else throw new AppError("VALIDATION", "Configuração desconhecida.");
    const before = await db.setting.findUnique({ where: { key } });
    await db.setting.upsert({ where: { key }, update: { value, updatedBy: user.id }, create: { key, value, updatedBy: user.id } });
    await audit(user.id, "setting.update", "Setting", key, value, before?.value);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) { return fail(e); }
}
