/**
 * Endereço público do site (links de e-mail, sitemap, webhooks).
 * Produção: APP_URL (seu domínio). Prévias da Vercel: endereço da própria prévia, para os links funcionarem nela.
 */
export function appUrl() {
  const explicit = process.env.APP_URL?.trim();
  if (process.env.VERCEL_ENV === "preview") {
    const host = process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL;
    if (host) return `https://${host}`;
  }
  if (explicit) return explicit.replace(/\/+$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "http://localhost:3000";
}
