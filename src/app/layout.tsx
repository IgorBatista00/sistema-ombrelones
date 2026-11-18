import type { Metadata, Viewport } from "next";
import "./globals.css";
import { getSiteSettings } from "@/modules/companies/site-settings";
import { appUrl } from "@/lib/app-url";

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSiteSettings();
  return {
    metadataBase: new URL(appUrl()),
    title: { default: `${s.brandName} · Ombrelones para empresas`, template: `%s · ${s.brandName}` },
    description: "Ombrelones, guarda-sóis, bases e acessórios com preços exclusivos para lojistas e empresas. Cadastre seu CNPJ.",
    openGraph: { type: "website", locale: "pt_BR", siteName: s.brandName },
  };
}
export const viewport: Viewport = { themeColor: "#faf8f4", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="flex min-h-dvh flex-col">
        <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-ink focus:px-4 focus:py-2 focus:text-canvas">Pular para o conteúdo</a>
        {children}
      </body>
    </html>
  );
}
