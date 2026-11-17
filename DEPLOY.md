# Publicação (Railway + GitHub)

Fluxo depois de pronto: pedido no chat → alteração no GitHub (proposta / pull request) → prévia → aprovação → publicação automática.

> **Nunca** cole senhas, tokens ou chaves no chat. Elas vão só no painel da Railway (aba **Variables** do serviço).

## 1. Projeto na Railway (uma vez)

1. Railway › **New Project** › **Deploy from GitHub repo** › escolha o repositório privado do sistema.
2. No mesmo projeto: **+ New** › **Database** › **PostgreSQL**. Ligue os **backups** do banco (aba Backups) desde o primeiro dia.
3. No serviço do sistema, aba **Settings**:
   - **Build command**: `npm run build`
   - **Pre-deploy command**: `npm run release` (atualiza o banco e garante os dados básicos a cada publicação)
   - **Start command**: `npm start`
   - **Healthcheck path**: `/api/health` (timeout 120 s)
   - **Restart policy**: On failure
4. **+ New** › **Volume** ligado ao serviço do sistema, montado em `/data` (é onde ficam fotos, NFs, boletos e comprovantes).
5. **Networking** › **Custom domain**: adicione o seu domínio e crie no Registro.br o registro DNS que a Railway mostrar.
6. (Opcional, recomendado) **Settings › Environments**: ligue os ambientes de **pull request** — cada proposta ganha uma prévia com link. Use um banco separado para as prévias (nunca o de produção).

## 2. Variáveis (aba Variables do serviço do sistema)

| Variável | O que colocar |
|---|---|
| `DATABASE_URL` | Referência ao banco do projeto: `${{Postgres.DATABASE_URL}}` |
| `APP_ENV` | `production` (sem isso o site fica fechado para o Google) |
| `APP_URL` | `https://www.seudominio.com.br` (com https, sem barra no fim) |
| `NODE_ENV` | `production` |
| `APP_ENCRYPTION_KEY` | Gere no seu computador: `openssl rand -base64 32` (guarde uma cópia em local seguro: sem ela não dá para ler os tokens já salvos) |
| `STORAGE_PROVIDER` | `local` |
| `STORAGE_LOCAL_DIR` | `/data/uploads` |
| `STORAGE_PRIVATE_DIR` | `/data/private` |
| `SEED_ADMIN_EMAIL` | Seu e-mail de administrador |
| `SEED_ADMIN_PASSWORD` | Senha forte (12+ caracteres, letras e números). Depois do 1º acesso: troque a senha no sistema e **apague esta variável** |
| `MERCADOLIVRE_CLIENT_ID` / `MERCADOLIVRE_CLIENT_SECRET` | Só quando for ligar a integração direta (veja a aba Mercado Livre do Financeiro) |

As demais variáveis do `.env.example` (pagamentos, frete, e-mail, ERP) ficam vazias até cada integração ser ligada — o sistema mostra "integração pendente".

## 3. Primeira publicação

1. Faça um deploy (a Railway publica sozinha ao receber o código).
2. Nos logs do **pre-deploy**, confirme que as migrações rodaram sem erro.
3. Abra `https://seudominio/api/health` → deve mostrar `{"ok":true}`.
4. Entre em `/entrar` com o administrador, troque a senha e apague `SEED_ADMIN_PASSWORD`.
5. Configurações: nome da marca, razão social, CNPJ, endereço e contatos. Depois importe produtos e clientes pelas planilhas.
6. Siga `LANCAMENTO-SEO.md` (Search Console, sitemap).

## 4. Rotina agendada (reservas de estoque da loja)

Crie um **Cron** na Railway (novo serviço do mesmo repositório, mesmas variáveis) com o comando `npm run jobs:expire-reservations` a cada 10 minutos. Necessário só quando a loja estiver recebendo pedidos com pagamento online.

## 5. Atualizações (depois de pronto)

- Cada alteração vai como **pull request**: a Railway gera a prévia (se os ambientes de PR estiverem ligados). Confira e faça o merge → publicação automática em produção.
- Para voltar uma versão: Railway › Deployments › escolha a anterior › **Redeploy**.
- O banco é atualizado sozinho pelo `npm run release`. Migrações nunca apagam dados sem aviso explícito na proposta.
