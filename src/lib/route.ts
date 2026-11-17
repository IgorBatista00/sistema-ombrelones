import type { z, ZodTypeAny } from "zod";
import { AppError, toErrorResponse } from "./errors";
import "./zod-pt";

/** Envelope padrão das rotas: valida corpo com Zod e padroniza erros. */
export function route<C = { params: Promise<Record<string, string>> }>(fn: (req: Request, ctx: C) => Promise<unknown>) {
  return async (req: Request, ctx: C) => {
    try {
      // Proteção CSRF simples: mutações só a partir da própria origem.
      if (req.method !== "GET" && !req.url.includes("/api/webhooks/")) {
        const origin = req.headers.get("origin");
        if (origin && new URL(origin).host !== new URL(req.url).host) throw new AppError("CSRF", "Origem não permitida.", 403);
      }
      const data = await fn(req, ctx);
      return data instanceof Response ? data : Response.json({ data: data ?? null });
    } catch (e) {
      return toErrorResponse(e);
    }
  };
}

export async function parseBody<S extends ZodTypeAny>(req: Request, schema: S): Promise<z.output<S>> {
  const json = await req.json().catch(() => { throw new AppError("BAD_JSON", "Requisição inválida."); });
  const r = schema.safeParse(json);
  if (!r.success) {
    const first = r.error.issues[0];
    throw new AppError("VALIDATION", first?.message ?? "Dados inválidos.", 422, r.error.flatten().fieldErrors);
  }
  return r.data;
}
