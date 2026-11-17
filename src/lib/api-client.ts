/** Cliente fetch tipado para as rotas internas (/api/*). */
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string; details?: unknown } };

export async function api<T = unknown>(url: string, opts: { method?: string; body?: unknown } = {}): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method: opts.method ?? "GET",
      headers: opts.body ? { "Content-Type": "application/json" } : undefined,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: json.error ?? { code: "HTTP_" + res.status, message: "Não foi possível concluir. Tente novamente." } };
    return { ok: true, data: json.data as T };
  } catch {
    return { ok: false, error: { code: "NETWORK", message: "Falha de conexão. Verifique sua internet." } };
  }
}
