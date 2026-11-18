/**
 * Build na Vercel (vercel.json › buildCommand = "npm run vercel-build").
 * 1. gera o cliente do banco  2. aplica as migrações pendentes  3. dados iniciais (categorias e Adm, se ainda não existirem)  4. compila o site.
 * Produção e cada prévia usam o PRÓPRIO banco (variáveis do ambiente correspondente na Vercel).
 */
import { execSync } from "node:child_process";

const env = { ...process.env };
// migrações precisam de conexão direta (sem pooler); se o banco não informar, usa a mesma URL
if (!env.DATABASE_URL_UNPOOLED && env.DATABASE_URL) env.DATABASE_URL_UNPOOLED = env.DATABASE_URL;
const run = (cmd) => { console.log(`\n▶ ${cmd}`); execSync(cmd, { stdio: "inherit", env }); };

run("npx prisma generate");
if (!env.DATABASE_URL) {
  console.error("\n✖ DATABASE_URL não configurada neste ambiente da Vercel (Settings › Environment Variables). Conecte o banco antes de publicar.");
  process.exit(1);
}
run("npx prisma migrate deploy");
run("npx tsx prisma/seed.ts");
run("npx next build");
