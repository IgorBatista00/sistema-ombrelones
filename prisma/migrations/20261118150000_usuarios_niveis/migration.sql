-- Níveis de acesso dos usuários do painel (Adm, Comercial, Expedição, Financeiro) e troca de senha obrigatória no primeiro acesso.
CREATE TYPE "AdminLevel" AS ENUM ('ADM', 'COMERCIAL', 'EXPEDICAO', 'FINANCEIRO');
ALTER TABLE "AdminUser" ADD COLUMN "level" "AdminLevel";
ALTER TABLE "AdminUser" ADD COLUMN "createdById" TEXT;
-- quem já gerenciava usuários passa a ser Adm; os demais ficam sem nível até o Adm escolher um
UPDATE "AdminUser" SET "level" = 'ADM' WHERE 'ADMIN_USERS' = ANY("permissions");
ALTER TABLE "User" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
