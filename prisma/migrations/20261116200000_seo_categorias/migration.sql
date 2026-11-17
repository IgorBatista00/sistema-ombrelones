-- SEO das páginas de categoria (/categorias/<slug>)
ALTER TABLE "Category" ADD COLUMN "seoTitle" TEXT;
ALTER TABLE "Category" ADD COLUMN "seoDescription" TEXT;
