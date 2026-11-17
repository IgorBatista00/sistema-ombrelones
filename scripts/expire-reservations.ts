/** Job agendado (cron do provedor de hospedagem, a cada 5 min). */
import { expireReservations } from "../src/modules/orders/service";
expireReservations().then((r) => { console.log(`Pedidos expirados: ${r.canceled}`); process.exit(0); });
