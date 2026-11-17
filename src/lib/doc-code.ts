import type { Prisma } from "@prisma/client";

/**
 * Código de pedidos e orçamentos: 3 letras do mês + número sequencial com 4 dígitos (ex.: NOV-0041).
 * O número vem de UMA sequência compartilhada (doc_number_seq) e é contínuo — não reinicia no mês.
 * Assim, um pedido gerado a partir de um orçamento pode herdar o mesmo número sem colidir.
 */
export const MONTHS = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"] as const;

export function docCode(number: number, date: Date = new Date(), timeZone = "America/Sao_Paulo") {
  const month = Number(new Intl.DateTimeFormat("en-US", { timeZone, month: "numeric" }).format(date));
  return `${MONTHS[month - 1]}-${String(number).padStart(4, "0")}`;
}

/** Reserva o próximo número da sequência (dentro da transação de criação). */
export async function nextDocNumber(tx: Prisma.TransactionClient) {
  const [row] = await tx.$queryRaw<{ n: bigint }[]>`SELECT nextval('doc_number_seq') AS n`;
  return Number(row.n);
}

/** Aceita "NOV-0041", "nov 41", "41" → 41 (para buscas). */
export function parseDocNumber(input: string) {
  const n = Number(input.replace(/\D/g, ""));
  return Number.isInteger(n) && n > 0 ? n : null;
}
