import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/seo";

// lido a cada acesso: a configuração do servidor (APP_ENV, APP_URL) vale sem precisar recompilar
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();
  const production = process.env.APP_ENV === "production";
  return {
    rules: production
      ? {
          userAgent: "*",
          // fotos dos produtos ficam em /api/media: liberadas (o Google precisa delas); o resto de /api não
          allow: ["/", "/api/media/"],
          disallow: ["/admin", "/api/", "/minha-conta", "/carrinho", "/cadastro", "/entrar", "/recuperar-senha", "/redefinir-senha", "/verificar-email", "/orcamento/"],
        }
      : { userAgent: "*", disallow: "/" }, // homologação/demonstração não indexa
    sitemap: `${base}/sitemap.xml`,
  };
}
