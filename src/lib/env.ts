import { z } from "zod";

/** Variáveis obrigatórias para a aplicação subir. Integrações são opcionais
 *  e verificadas individualmente pelos adaptadores (ver modules/integrations). */
const schema = z.object({
  APP_ENV: z.enum(["development", "staging", "production"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET deve ter 32+ caracteres"),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),
});

let cached: z.infer<typeof schema> | null = null;
export function env() {
  if (!cached) cached = schema.parse(process.env);
  return cached;
}
