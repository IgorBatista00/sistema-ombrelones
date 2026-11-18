import "server-only";
import { expireReservations } from "./service";

/**
 * Libera reservas vencidas "sob demanda" (no máx. 1 vez por minuto por instância).
 * Assim o sistema não depende de tarefa agendada frequente — o plano gratuito da Vercel só agenda 1x por dia.
 * A tarefa diária /api/cron/expire-reservations continua como garantia.
 */
let last = 0;
export async function expireReservationsIfDue(now = Date.now()) {
  if (now - last < 60_000) return;
  last = now;
  try { await expireReservations(new Date(now)); } catch (e) { console.error("falha ao expirar reservas", e); }
}
