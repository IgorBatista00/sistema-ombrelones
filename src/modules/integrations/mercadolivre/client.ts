import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { AppError } from "@/lib/errors";
import { hasEncryptionKey } from "@/lib/secret-box";
import type { MlOrder, MpPayment } from "./rules";

/**
 * Cliente da API do Mercado Livre (OAuth 2.0 com PKCE).
 * PENDENTE até configurar: MERCADOLIVRE_CLIENT_ID, MERCADOLIVRE_CLIENT_SECRET, APP_URL (redirect) e APP_ENCRYPTION_KEY.
 * A URL de retorno a cadastrar no app do Mercado Livre é `${APP_URL}/api/admin/integracoes/mercadolivre/callback`.
 */
const AUTH_URL = "https://auth.mercadolivre.com.br/authorization";
const API = "https://api.mercadolibre.com";
const MP_API = "https://api.mercadopago.com";

export function mlConfig() {
  const clientId = process.env.MERCADOLIVRE_CLIENT_ID ?? "", clientSecret = process.env.MERCADOLIVRE_CLIENT_SECRET ?? "";
  const base = (process.env.APP_URL ?? "").trim().replace(/\/$/, ""); // o endereço de retorno cadastrado no Mercado Livre precisa ser fixo (domínio de produção)
  const missing = [!clientId && "MERCADOLIVRE_CLIENT_ID", !clientSecret && "MERCADOLIVRE_CLIENT_SECRET", !base && "APP_URL", !hasEncryptionKey() && "APP_ENCRYPTION_KEY"].filter(Boolean) as string[];
  return { clientId, clientSecret, redirectUri: `${base}/api/admin/integracoes/mercadolivre/callback`, missing, configured: missing.length === 0 };
}
export const isMlConfigured = () => mlConfig().configured;

export function pkce() {
  const verifier = randomBytes(48).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url"), state: randomBytes(24).toString("base64url") };
}
export function authorizationUrl(state: string, challenge: string) {
  const c = mlConfig();
  const u = new URL(AUTH_URL);
  u.search = new URLSearchParams({ response_type: "code", client_id: c.clientId, redirect_uri: c.redirectUri, state, code_challenge: challenge, code_challenge_method: "S256" }).toString();
  return u.toString();
}

async function call<T>(url: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const { token, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(url, { ...rest, signal: AbortSignal.timeout(20_000), headers: { accept: "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...(rest.headers ?? {}) }, cache: "no-store" });
  } catch {
    throw new AppError("ML_UNAVAILABLE", "Não foi possível falar com o Mercado Livre agora. Tente novamente em instantes.", 502);
  }
  if (res.status === 401) throw new AppError("ML_UNAUTHORIZED", "A autorização do Mercado Livre expirou ou foi revogada. Conecte a conta novamente.", 401);
  if (res.status === 429) throw new AppError("ML_RATE_LIMIT", "Limite de consultas do Mercado Livre atingido. Aguarde um minuto e sincronize de novo.", 429);
  if (!res.ok) throw new AppError("ML_ERROR", `Mercado Livre respondeu com erro (${res.status}).`, 502);
  return res.json() as Promise<T>;
}

export interface MlToken { access_token: string; refresh_token: string; expires_in: number; user_id: number }
/** Parâmetros sempre no corpo (form-urlencoded), como recomenda a documentação. */
function tokenRequest(body: Record<string, string>) {
  return call<MlToken>(`${API}/oauth/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body).toString() });
}
export function exchangeCode(code: string, verifier: string) {
  const c = mlConfig();
  return tokenRequest({ grant_type: "authorization_code", client_id: c.clientId, client_secret: c.clientSecret, code, redirect_uri: c.redirectUri, code_verifier: verifier });
}
export function refreshToken(refresh: string) {
  const c = mlConfig();
  return tokenRequest({ grant_type: "refresh_token", client_id: c.clientId, client_secret: c.clientSecret, refresh_token: refresh });
}
export const getMe = (token: string) => call<{ id: number; nickname?: string }>(`${API}/users/me`, { token });

/** Pedidos do vendedor desde `from`, mais recentes primeiro (paginação offset/limit). */
export function searchOrders(token: string, sellerId: string, from: Date, offset: number, limit = 50) {
  const q = new URLSearchParams({ seller: sellerId, "order.date_created.from": from.toISOString().replace("Z", "-00:00"), sort: "date_desc", offset: String(offset), limit: String(limit) });
  return call<{ results: MlOrder[]; paging: { total: number; offset: number; limit: number } }>(`${API}/orders/search?${q}`, { token });
}
/** Detalhe do pagamento no Mercado Pago (data/situação da liberação e líquido). Falha aqui não interrompe a sincronização. */
export async function getMpPayment(token: string, paymentId: string): Promise<MpPayment | null> {
  try { return await call<MpPayment>(`${MP_API}/v1/payments/${encodeURIComponent(paymentId)}`, { token }); } catch (e) {
    if (e instanceof AppError && (e.code === "ML_RATE_LIMIT" || e.code === "ML_UNAUTHORIZED")) throw e;
    return null;
  }
}

/** Nome e caminho de uma categoria (recurso público /categories/{id}). */
export async function getCategory(token: string, categoryId: string) {
  try { return await call<{ id: string; name: string; path_from_root?: { id: string; name: string }[] }>(`${API}/categories/${encodeURIComponent(categoryId)}`, { token }); } catch (e) {
    if (e instanceof AppError && (e.code === "ML_RATE_LIMIT" || e.code === "ML_UNAUTHORIZED")) throw e;
    return null;
  }
}
