import { Pool } from "pg";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { attachDatabasePool } from "@vercel/functions";

const g = globalThis as unknown as { prisma?: PrismaClient };
const onVercel = !!process.env.VERCEL;

/**
 * Conexão com o PostgreSQL.
 * Na Vercel cada instância abre poucas conexões (use a URL "pooled" do banco em DATABASE_URL)
 * e as conexões ociosas são devolvidas antes de a instância ser suspensa (attachDatabasePool).
 */
function create() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL!,
    max: Number(process.env.DB_POOL_SIZE ?? (onVercel ? 5 : 10)),
    ...(onVercel ? { idleTimeoutMillis: 5_000 } : {}),
  });
  if (onVercel) attachDatabasePool(pool);
  return new PrismaClient({ adapter: new PrismaPg(pool), log: process.env.APP_ENV === "development" ? ["warn", "error"] : ["error"] });
}

export const db = g.prisma ?? create();
g.prisma = db; // reaproveita a mesma conexão entre requisições (dev e instâncias da Vercel)
