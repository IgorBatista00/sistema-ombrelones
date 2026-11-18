# Publicação na Vercel — passo a passo

Estrutura:

| Peça | Função | Onde fica |
|---|---|---|
| **Claude** | desenvolve, corrige e atualiza o código | nesta conversa |
| **GitHub** | guarda o código e o histórico de versões | repositório privado `IgorBatista00/sistema-ombrelones` |
| **Vercel** | publica o site, roda o sistema, prévias e domínio | vercel.com |
| **Banco PostgreSQL (Neon)** | produtos, clientes, pedidos, financeiro | criado pela própria Vercel (aba Storage) |
| **Vercel Blob** | fotos dos produtos (público) e NF/boletos/comprovantes (privado) | criado pela própria Vercel (aba Storage) |

> Senhas e chaves **nunca** vão no código nem em conversas: você digita direto no painel da Vercel.

---

## Custos (conferidos em nov/2026 — confirme na tela antes de assinar)

| Item | Plano | Quanto | Observação |
|---|---|---|---|
| Vercel | **Hobby (grátis)** | US$ 0 | **Só uso pessoal, não comercial.** Serve para testar antes de abrir para clientes. Tarefa agendada no máx. 1x/dia. |
| Vercel | **Pro** | **US$ 20/mês por membro** | **Obrigatório para loja comercial.** Inclui crédito de uso; o excedente é cobrado por uso. |
| Banco (Neon) | Free | US$ 0 | 1 GB de dados e 100 horas de processamento/mês; “dorme” sem uso (primeiro acesso depois fica ~1 s mais lento). |
| Banco (Neon) | Launch | por uso, sem mínimo | ~US$ 0,106 por hora de processamento + US$ 0,35 por GB/mês. |
| Vercel Blob | — | por uso | ~US$ 0,023 por GB/mês de arquivos guardados (há franquia incluída). |
| Domínio | — | anual | Cobrado onde o domínio está registrado (ex.: registro.br). |
| Pendentes | CNPJ, e-mail, Pagar.me, Melhor Envio | conforme cada serviço | Pagar.me cobra por transação. Contratar só quando for ativar. |

Valores em dólar são cobrados no cartão (pode haver IOF). Acompanhe em **Vercel › Usage**.

---

## 1. Criar a conta e importar o projeto

1. Acesse **vercel.com › Sign Up › Continue with GitHub** e autorize.
2. No painel: **Add New… › Project**.
3. Em **Import Git Repository**, se o repositório não aparecer: **Adjust GitHub App Permissions** → selecione **Only select repositories** → `sistema-ombrelones` → **Save**.
4. Clique **Import** ao lado de `sistema-ombrelones`. A Vercel detecta **Next.js** e lê o `vercel.json` (não altere *Build Command* nem *Install Command*).
5. Clique **Deploy**. **A 1ª publicação vai falhar de propósito** com a mensagem
   `DATABASE_URL não configurada` — o banco ainda não existe. Siga para o passo 2.

## 2. Criar o banco (PostgreSQL)

1. No projeto: aba **Storage › Create Database › Neon (Serverless Postgres) › Continue**.
2. Região: **São Paulo (South America / sa-east-1)**. Plano: **Free** para começar.
3. Em **Connect Project**, marque os ambientes **Production** e **Preview** e ative a opção de
   **criar um branch do banco para cada prévia** (Preview deployments). Assim, as prévias usam uma **cópia** do banco e nunca mexem nos dados reais.
4. Confirme: a Vercel cria sozinha as variáveis `DATABASE_URL` e `DATABASE_URL_UNPOOLED`.
   > Se São Paulo não aparecer na lista, me avise: ajusto a região do site para ficar junto do banco.

## 3. Criar os dois armazenamentos de arquivos (Blob)

1. **Storage › Create Database › Blob** → nome `fotos` → acesso **Public** → **Create** → **Connect** ao projeto (Production e Preview).
   Variável criada: `BLOB_READ_WRITE_TOKEN`.
2. De novo **Storage › Create Database › Blob** → nome `documentos` → acesso **Private** → **Create** → **Connect**,
   e no campo de **prefixo das variáveis** (Environment Variables Prefix / Custom Prefix) escreva `PRIVATE_BLOB`.
   Variável criada: `PRIVATE_BLOB_READ_WRITE_TOKEN`.
   > NF, boletos e comprovantes ficam no store **privado**: só abrem pelo painel, para quem tem acesso ao Financeiro.

## 4. Variáveis de ambiente

**Settings › Environment Variables › Add New** — escolha o ambiente marcando **Production** e/ou **Preview**:

| Nome | Production | Preview | Observação |
|---|---|---|---|
| `APP_ENV` | `production` | `staging` | prévias não aparecem no Google |
| `APP_URL` | `https://SEU-PROJETO.vercel.app` (depois, o domínio) | *(não criar)* | |
| `STORAGE_PROVIDER` | `vercel-blob` | `vercel-blob` | |
| `NEXT_PUBLIC_UPLOAD_MODE` | `blob` | `blob` | envio direto de fotos/PDFs |
| `CRON_SECRET` | texto aleatório de 32+ caracteres | — | **Sensitive** |
| `SEED_ADMIN_EMAIL` | seu e-mail de acesso | — | cria o 1º Adm |
| `SEED_ADMIN_PASSWORD` | senha forte (12+ letras e números) | — | **Sensitive**; apagar depois do 1º acesso |
| `APP_ENCRYPTION_KEY` | 32 bytes em base64 | — | **Sensitive**; só ao ativar o Mercado Livre |

Gerar valores aleatórios (no seu computador): `openssl rand -base64 32`. Marque **Sensitive** nas chaves.
As variáveis do banco e do Blob já foram criadas nos passos 2 e 3. A lista completa de nomes está em `.env.example`.

## 5. Publicar

1. **Deployments** › na publicação que falhou › **⋯ › Redeploy**.
2. Nos registros (**Building**) devem aparecer, nesta ordem: `prisma migrate deploy` (aplica as tabelas), `tsx prisma/seed.ts` (categorias e seu Adm) e `next build`.
3. Ao terminar (**Ready**), abra `https://SEU-PROJETO.vercel.app/api/health` → deve mostrar `{"ok":true}`.
4. Entre em `/entrar` com o e-mail e a senha do passo 4, vá em **Minha senha** e troque a senha.
5. **Apague** a variável `SEED_ADMIN_PASSWORD` (Settings › Environment Variables › ⋯ › Delete).
6. Crie os demais usuários em **Usuários** (Adm, Comercial, Expedição, Financeiro).
7. **Configurações**: nome da marca, dados da empresa e contatos. Depois importe produtos e clientes pelas planilhas.

## 6. Conferência depois de publicar

- [ ] `/api/health` responde `{"ok":true}`
- [ ] catálogo abre no celular; visitante **não vê preço**
- [ ] login no painel; cada nível vê só o seu menu
- [ ] enviar uma foto em um produto e um PDF em uma venda (testa os dois armazenamentos)
- [ ] **Settings › Cron Jobs** mostra `/api/cron/expire-reservations`

## 7. Conectar o seu domínio

1. **Settings › Domains › Add Domain** → digite `seudominio.com.br` → **Add**. Aceite a sugestão de também adicionar `www`.
2. A Vercel mostra os **registros DNS** a criar — use **exatamente** os valores exibidos nessa tela:
   - domínio sem www (`seudominio.com.br`): registro **A** → o IP que a Vercel mostrar;
   - `www`: registro **CNAME** → o endereço que a Vercel mostrar.
3. No **registro.br** (ou onde o domínio está): **Meus domínios › seu domínio › DNS › Editar zona** e crie os registros.
   Se o domínio usa “servidores DNS do Registro.br”, a edição é por ali; se aponta para outro provedor, edite lá.
4. Aguarde a Vercel mostrar **Valid Configuration** (minutos a algumas horas). O HTTPS é automático.
5. Troque `APP_URL` (Production) para `https://seudominio.com.br` e faça **Redeploy**.
6. Depois disso, siga `LANCAMENTO-SEO.md` (Search Console e sitemap).

---

## Como ficam as atualizações

```
Você pede aqui  →  Claude altera e testa  →  envia ao GitHub  →  Vercel publica
```

- **Com prévia (recomendado para mudanças maiores):** envio a alteração para um **branch** separado e abro um
  *Pull Request* no GitHub. A Vercel cria uma **prévia** com endereço próprio (aparece no Pull Request e em **Deployments**),
  usando uma cópia do banco. Você confere; se estiver bom, clica **Merge pull request** no GitHub e o site oficial é atualizado.
- **Direto (ajustes pequenos):** envio para o branch `main` e a Vercel publica no site oficial em poucos minutos.
- **Voltar atrás:** **Deployments** › publicação anterior que estava boa › **⋯ › Promote to Production** (ou **Instant Rollback**).
  Atenção: voltar o código não desfaz mudanças já feitas no banco.
- As prévias ficam protegidas por login da Vercel (**Settings › Deployment Protection › Vercel Authentication**).

## Detalhes técnicos (para referência)

- `vercel.json`: região das funções **gru1 (São Paulo)**, build `npm run vercel-build` (`scripts/vercel-build.mjs`), tarefa diária às 06:00 (horário de Brasília).
- Cada ambiente usa o **próprio banco**: as migrações rodam no build de produção e de cada prévia.
- Arquivos: o navegador envia direto ao Blob (`/api/admin/uploads/token` gera autorização de 10 min, só para tipos/tamanhos permitidos); o servidor confere o conteúdo real antes de registrar. Limites: fotos 8 MB, documentos 15 MB, planilhas de importação 4 MB.
- Reservas de estoque vencidas são liberadas sob demanda (carrinho, pedidos, estoque) e pela tarefa diária. No plano **Pro**, pode-se aumentar a frequência em `vercel.json` (ex.: `*/10 * * * *`).
- Sem a variável `STORAGE_PROVIDER=vercel-blob`, o sistema tenta gravar em disco — o que **não funciona** na Vercel.
