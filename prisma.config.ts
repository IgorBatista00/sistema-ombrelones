import path from "node:path";
import { defineConfig } from "prisma/config";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Padrão: motor clássico do Prisma (binários baixados no install).
 * PRISMA_USE_ADAPTER=1 usa o Schema Engine em JS + driver pg (útil em
 * ambientes que bloqueiam o download dos binários).
 */
export default process.env.PRISMA_USE_ADAPTER === "1"
  ? defineConfig({
      schema: path.join("prisma", "schema.prisma"),
      experimental: { adapter: true },
      engine: "js",
      async adapter() { return new PrismaPg({ connectionString: process.env.DATABASE_URL! }); },
    })
  : defineConfig({ schema: path.join("prisma", "schema.prisma") });
