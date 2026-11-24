import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // O cliente do banco (Prisma sem binário) carrega arquivos .wasm em tempo de execução;
  // o rastreamento automático da Vercel não os detecta, então incluímos a pasta gerada em todas as rotas.
  outputFileTracingIncludes: {
    "/**/*": ["./node_modules/.prisma/client/**/*"],
  },
  images: {
    formats: ["image/avif", "image/webp"],
    // Fotos enviadas em produção ficam no Vercel Blob (store público); IMAGE_CDN_HOST para um CDN próprio, se houver.
    remotePatterns: [
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
      ...(process.env.IMAGE_CDN_HOST ? [{ protocol: "https" as const, hostname: process.env.IMAGE_CDN_HOST }] : []),
    ],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
