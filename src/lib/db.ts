import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const g = globalThis as unknown as { prisma?: PrismaClient };

function create() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL!, max: Number(process.env.DB_POOL_SIZE ?? 10) });
  return new PrismaClient({ adapter, log: process.env.APP_ENV === "development" ? ["warn", "error"] : ["error"] });
}

export const db = g.prisma ?? create();
if (process.env.NODE_ENV !== "production") g.prisma = db;
