# [NOME DA MARCA] — E-commerce B2B de ombrelones

Loja B2B para venda de ombrelones, guarda-sóis, bases e acessórios a pessoas jurídicas.
O cliente cadastra o CNPJ, tem os preços de atacado liberados automaticamente após as validações,
monta o pedido sem pedido mínimo, calcula ou solicita o frete, paga e acompanha a compra.

> **Situação atual:** Etapas 1 a 4 implementadas e testadas; Etapas 5 a 7 com estrutura,
> contratos e telas prontos, **pendentes de credenciais e homologação** (ver lista no fim).
> Nenhuma ação externa é simulada: sem credenciais, a funcionalidade informa que não está operacional.

---

## 1. Stack

| Camada | Tecnologia |
|---|---|
| Aplicação | Next.js 15 (App Router) + React 19 + TypeScript (strict) |
| Estilo | Tailwind CSS 3 com tokens em variáveis CSS (troca de marca em 1 arquivo) |
| Banco | PostgreSQL 14+ |
| ORM | Prisma 6 em modo sem binário (`engineType = "client"` + driver `pg`) |
| Validação | Zod (todas as entradas validadas no servidor) |
| Autenticação | Sessão própria: token aleatório em cookie `httpOnly`, apenas o hash SHA-256 no banco; senhas com bcrypt (custo 12) |
| Testes | Vitest (unitários + integração com Postgres real) |

---

## 2. Estrutura de pastas

```
prisma/
  schema.prisma            Modelagem completa (30 tabelas)
  migrations/              Migração inicial (SQL versionado)
  seed.ts                  Categorias, tabela de preço, condições comerciais, admin e (opcional) dados [DEMO]
scripts/
  expire-reservations.ts   Job: libera reservas vencidas e cancela pedidos não pagos
src/
  middleware.ts            Barreira rápida para /admin e /minha-conta (sem cookie → login)
  app/
    (loja)/                LOJA PÚBLICA (layout com cabeçalho e rodapé)
      page.tsx               01 · Início
      produtos/              02 · Catálogo   ·   produtos/[slug] → 03 · Produto
      carrinho/              04 · Carrinho e checkout
      minha-conta/           05 · Minha conta (+ pedidos/[id]: confirmação, cotação, pagamento)
      cadastro, entrar, verificar-email, recuperar-senha, redefinir-senha   (fluxos de acesso)
      institucional/[slug]   Políticas (texto editável no painel)
    admin/                 PAINEL ADMINISTRATIVO (layout independente, menu lateral)
      page.tsx               Dashboard
      pedidos/ logistica/ produtos/ clientes/ financeiro/ configuracoes/
    api/                   Endpoints (ver seção 6)
    sitemap.ts, robots.ts
  components/
    ui/                    Design system: Button, Field/Input/Select, Badge, Notice, ícones
    layout/ catalog/ product/ cart/ account/ admin/
  modules/                 REGRAS DE NEGÓCIO (sem dependência de UI)
    auth/                  sessão, senha, tokens, requireBuyer / requireAdmin
    companies/             CNPJ (numérico e alfanumérico), cadastro, risco, endereços, dados do site
    catalog/               consultas do catálogo (preço só sai com autorização)
    pricing/               ÚNICO ponto de leitura de preços
    inventory/             disponibilidade, reservas atômicas, baixa e liberação
    cart/                  carrinho recalculado no servidor, "comprar novamente"
    orders/                máquina de 4 estados, criação de pedido, cotação, pagamento, webhook, expiração
    admin/                 métricas e Server Actions do painel (com auditoria)
    integrations/          cnpj · shipping (Melhor Envio) · payments (Pagar.me) · erp (Bling) · email
  lib/                     db, erros, rate limit, cripto, envelope de rotas, formatação
tests/                     regras críticas (ver seção 8)
```

---

## 3. Regras de negócio implementadas

**Proteção de preços.** `viewer.canSeePrices` (e-mail verificado **e** empresa `ACTIVE`) é calculado
no servidor a cada requisição. Para visitantes, o catálogo nem consulta a tabela de preços: o valor
não aparece no HTML, no JSON da API, nos dados estruturados nem na ordenação por preço. Isso é coberto por teste.

**Cadastro por CNPJ** (Seção 6 do briefing):
1. valida formato e dígitos, **inclusive o CNPJ alfanumérico** em vigor desde jul/2026 (IN RFB 2.229/2024);
2. consulta o provedor no servidor, recusa CNPJ inexistente ou com situação diferente de ATIVA;
3. bloqueia CNPJ e e-mail já cadastrados (com caminho para login/recuperação);
4. análise de risco **proporcional** (e-mail descartável, empresa recém-aberta, vários cadastros do mesmo IP,
   domínio corporativo coincidente reduz risco). Score ≥ 50 → `UNDER_REVIEW` (revisão excepcional); o resto é liberado
   automaticamente ao confirmar o e-mail;
5. rate limit por IP e por CNPJ; bloqueio temporário após 10 senhas erradas; respostas que não revelam se o e-mail existe;
6. o vínculo usuário ⇄ empresa (`CompanyMember`) já suporta vários usuários por empresa (papéis OWNER/BUYER/VIEWER).

**Pedido com 4 dimensões independentes** — Comercial, Financeiro, Logístico e Fiscal — com transições
validadas (`orders/state.ts`) e histórico completo. Regras cruzadas:
- pagamento só com pedido confirmado **e** frete definido;
- **"Pago" só pode ser aplicado pelo webhook autenticado** do gateway — nem admin, nem cliente;
- expedição e nota fiscal só após pagamento;
- pedido pago não é cancelado sem estorno.

**Estoque e reservas.** Reserva via `UPDATE … WHERE onHand - reserved >= qtd` (atômico no Postgres):
dois pedidos nunca reservam o mesmo saldo (teste de integração com 20 pedidos simultâneos).
Prazo da reserva configurável por meio de pagamento (Pix, boleto, cartão) e para cotação manual.
Pagamento confirmado → baixa definitiva; expiração/cancelamento/recusa → liberação.
Itens **sob encomenda** não consomem saldo e exibem prazo próprio.

**Frete.** Automático (Melhor Envio, cotação refeita no servidor ao fechar o pedido — o cliente não
consegue forjar o valor) ou **cotação manual**: pedido `Aguardando cotação`, equipe envia proposta
no painel, cliente aceita/recusa; pagamento só é liberado após o aceite. Nada é cobrado sem confirmação.

**Snapshot.** O pedido guarda preços, dados da empresa, endereço, embalagens e condições comerciais
vigentes na compra. Alterar preço no painel cria novo registro com vigência (histórico preservado).

**Idempotência.** Criação de pedido (chave do cliente), cobrança no gateway (`Idempotency-Key`) e
webhooks (`IntegrationEvent` único por provedor + ID do evento; reprocessamento seguro; status reconsultado na API do gateway).

**Cadastro de produtos (painel › Produtos).** Formulário único para novo, editar e duplicar, em blocos:
fotos (envio múltiplo, principal, reordenar, remover), dados do produto, características técnicas (cm ou m),
embalagem com vários volumes e cubagem automática, fornecedores (N:N, principal, código no fornecedor,
prazo, MOQ, custo, IPI) e custos adicionais da **Tabela de custos**. Custo final base = mercadoria + IPI do
fornecedor principal + adicionais, recalculado no servidor. Rascunho automático no navegador.
Diferenças em relação ao sistema anterior: vínculos de fornecedor são atualizados por diferença (não são apagados
e recriados), há histórico permanente de custo (`SupplierCostHistory`), alterar um item da tabela de custos
recalcula os produtos que o usam, a importação considera os custos adicionais existentes e a lista sinaliza
produtos sem foto, sem fornecedor, sem preço, sem custo ou com margem abaixo de 15%.
Importar Excel mostra uma prévia linha a linha antes de gravar; Exportar Excel gera exatamente a lista filtrada.

**Controle de estoque (painel › Estoque, permissão STOCK).** Por SKU: físico, reservado em pedidos, disponível,
mínimo (editável), situação (zerado / abaixo do mínimo / normal / sob encomenda), custo e valor do estoque.
Movimentações manuais de **entrada**, **saída** e **ajuste de inventário** com motivo, documento e observação;
a linha de saldo é travada durante o lançamento, a saída nunca consome unidades reservadas e o ajuste não
fica abaixo do reservado. Pedido pago gera a movimentação **Venda** automaticamente. Histórico completo por SKU
e exportação em Excel.
**Custo médio ponderado móvel.** Compras com nota fiscal entram por **Estoque › Registrar compra**
(fornecedor, nota, data, frete e outras despesas, itens com quantidade, custo e IPI). Frete e despesas são
rateados pelo valor de cada item; custo final unitário = custo + IPI + rateio. A cada compra:
novo médio = (saldo × médio atual + qtd × custo final) ÷ (saldo + qtd). Saídas (venda, perda, ajuste) não alteram
o médio. Venda paga grava o **CMV** (qtd × médio) no item do pedido e na movimentação. A mesma nota do mesmo
fornecedor não pode ser lançada duas vezes. Valor do estoque = saldo × custo médio. Por SKU, o histórico mostra
compras (variação entre pedidos, menor e maior custo), **margem real** (preço × médio) e **margem de reposição**
(preço × última compra), com alerta quando o custo de compra está subindo. Saldo existente antes da primeira
compra parte do custo do cadastro. ICMS recuperável não entra no custo — confirmar o critério com o contador.
**Na loja**, o cliente vê o disponível (físico − reservado) conforme a configuração do painel:
quantidade exata ("24 unidades disponíveis"), faixa ("Mais de 10 unidades") ou só "Em estoque", com aviso
"Últimas N unidades" abaixo do limite escolhido.

**Orçamentos (painel › Orçamentos, permissão ORDERS).** Layout baseado no modelo de orçamento da empresa:
a tela de edição *é* a própria folha (o que se vê é o que sai impresso — `components/admin/quote-sheet.tsx`).
Blocos: cabeçalho (marca, CNPJ, endereço · Situação, Nº Pedido, Data, Prazo de entrega em dias corridos);
**Dados do Cliente** (cliente cadastrado preenche tudo, ou avulso: nome, CPF, CNPJ, IE, endereço, cidade/UF, CEP,
contato, celular, e-mail, casa em obra, aniversário, endereço de entrega); **Dados Comerciais** (profissional,
vendedor, gerente, celular, e-mail); **Produtos** com foto (escolher entre as fotos do cadastro ou enviar do
dispositivo), busca por nome/código, nome em maiúsculas, Medidas e Acabamento vindos do
cadastro, Corda/Tela/Fibra, Observações, Qtd, Valor unitário, **Desconto unitário em R$** e total;
**Pagamento e Observações** (forma, informações adicionais, parcelamento — ex. "30/60/90" ou "na venda/30/60" —
com datas e valores calculados; a última parcela absorve o arredondamento); **Resumo Financeiro** (subtotal,
desconto, frete FOB/CIF/a cotar, quantidade, peso e cubagem da carga a partir do cadastro, total do pedido);
assinaturas. Custo médio e margem aparecem só na edição.
**Gerar orçamento** abre `/orcamento/:id` no mesmo layout, pronto para imprimir/salvar em PDF (A4), com
"Copiar resumo (WhatsApp)" e mudança de situação (rascunho → emitido → enviado → aprovado/recusado; expira
sozinho após a validade). Duplicar cria um rascunho com preços atuais do cadastro.

**Funil de orçamentos (painel › Funil de orçamentos, permissão ORDERS).** Kanban com todos os orçamentos já salvos
— é o banco de dados comercial. Colunas: **Salvos** (rascunho, emitido, enviado), **Fechados** (aprovados) e
**Perdidos** (recusados ou com validade vencida). Arraste o cartão entre colunas (ou use "Mover para…"): fechar e
perder gravam a **data de fechamento** (`Quote.closedAt`); perder pede o **motivo** (`Quote.lostReason`: preço,
prazo, concorrente, desistência, sem resposta, outro); reabrir limpa os dois (orçamento vencido não reabre — use
Duplicar). Expirados fecham sozinhos na data do fim da validade. Filtros por **data de criação** e **data de
fechamento** (dias no fuso de Brasília, fim inclusivo) e busca por **nome do cliente/contato** (sem diferenciar
maiúsculas) ou **número** (`NOV-0042`, `42`). Indicadores: valor em aberto, fechado (com ticket médio), perdido e
taxa de fechamento (em quantidade e em valor), sempre respeitando os filtros. Regras em `src/modules/quotes/funnel.ts`.

**Financeiro integrado ao funil (painel › Financeiro, permissão FINANCE).** Orçamento movido para **Fechados** vira
uma **venda** (`Sale`, dados congelados: cliente, CNPJ/CPF, vendedor, total, CMV estimado pelo custo médio, condição
de pagamento) com as **parcelas a receber** (`Receivable`) geradas do parcelamento do orçamento, contadas a partir da
**data de fechamento** ("na venda/entrada" vence no fechamento; "na entrega" fica com vencimento a definir; sem
parcelamento = à vista; a última parcela absorve o arredondamento). Reabrir ou perder o orçamento **cancela** a venda;
editar um orçamento fechado **refaz** as parcelas — ambos **bloqueados** se já houver recebimento lançado (estorne
antes). Abas: **Vendas** (filtro por data da venda, situação Quitada/Em aberto/Em atraso/Cancelada, busca por
cliente, CNPJ ou nº; indicadores de faturamento, ticket médio, margem bruta estimada, recebido, carteira a receber,
próximos 7 dias e atraso; previsão de recebimento por mês), **Contas a receber** (filtro por vencimento e situação;
**dar baixa** com data, valor, forma e observação; **estornar**; definir vencimento das parcelas "na entrega") e
**Pagamentos do site** (gateway, somente consulta). Toda baixa/estorno/vencimento vai para o log de auditoria.
Orçamentos aprovados antes desta versão são convertidos em venda automaticamente ao abrir o Financeiro.
**Página da venda** (Financeiro › clique no nº da venda): resumo (total, recebido, saldo, condição, nota fiscal),
parcelas com baixa/estorno, **documentos** e **observações**.
- Documentos: nota fiscal (PDF e/ou XML da NF-e), boletos, comprovantes de pagamento e outros — vinculados à venda
  ou a uma parcela específica, com descrição (ex.: "NF-e 1234 série 1"). Tipo validado pelo **conteúdo** do arquivo
  (PDF, XML, JPG, PNG, WebP; até 15 MB; nome sanitizado). Ficam em **armazenamento privado**
  (`STORAGE_PRIVATE_DIR`, padrão `storage/private`; em produção, bucket privado — pendente) e só abrem pela rota
  `/api/admin/financeiro/documentos/:id`, que exige permissão FINANCE (`Cache-Control: private, no-store`; XML sempre
  baixa). Remover é exclusão lógica (o arquivo fica para auditoria) e vai para o log.
- Observações: histórico com autor, data e hora; só o autor exclui a própria (fica no log).
- A lista de vendas mostra "NF anexada" / "Sem NF" e a quantidade de anexos e observações.

**Recebimentos Mercado Livre** (aba do Financeiro, permissão FINANCE) — integração automática, **PENDENTE** até
configurar `MERCADOLIVRE_CLIENT_ID`, `MERCADOLIVRE_CLIENT_SECRET`, `APP_URL` e `APP_ENCRYPTION_KEY` (32 bytes base64,
`openssl rand -base64 32`). No app do Mercado Livre, cadastrar a URL de retorno
`${APP_URL}/api/admin/integracoes/mercadolivre/callback`.
- Conexão por OAuth 2.0 com `state` e PKCE (S256), cookies httpOnly de 10 min; credenciais enviadas no corpo do
  POST `/oauth/token`; access token (6 h) renovado automaticamente pelo refresh token; tokens guardados
  **criptografados (AES-256-GCM)** em `MlConnection` e nunca registrados em log. "Desconectar" apaga os tokens.
- "Sincronizar agora" (7/30/60/90 dias): `GET /orders/search?seller=…` paginado (até 300 pedidos por vez) e, para
  cada pagamento, `GET api.mercadopago.com/v1/payments/{id}` (data/situação da liberação e líquido). Um registro por
  pagamento em `MlReceipt` (idempotente), com bruto (`transaction_amount`), frete (`shipping_cost`), tarifa
  (`marketplace_fee`), líquido (`net_received_amount`; se ausente, estimado = bruto − tarifa, marcado com *) e
  liberação (liberado / a liberar / sem informação / devolvido). Resposta original guardada em `raw` para auditoria.
- Filtros por data da venda, liberação e busca (pedido, comprador, produto). Valores ficam **só nesta aba** (não
  entram nos totais do Financeiro). Erros de rede, limite de requisições e autorização expirada viram mensagens claras.
- **Categoria do anúncio**: a sincronização guarda os itens de cada pedido (`MlOrderItem`: anúncio, título,
  `category_id`, quantidade, `unit_price`, `sale_fee` por unidade) e o nome/caminho de cada categoria
  (`GET /categories/{id}` → `name`, `path_from_root`; cache `MlCategory` renovado a cada 30 dias). A aba ganha o filtro
  "Categoria do anúncio", a coluna Categoria na lista e o quadro **Vendas por categoria de anúncio** (pedidos,
  unidades, faturamento = preço × quantidade sem frete, participação, tarifas, ticket médio; pedidos não cancelados;
  respeita período e busca; clique na categoria filtra). Com filtro de categoria, os indicadores de pagamento mostram
  o valor do pedido inteiro (um pedido pode ter anúncios de categorias diferentes) — a tela avisa.
- Pendências: notificações automáticas (webhook `orders_v2`) e conciliação com o relatório de liberações do Mercado
  Pago (custos de envio cobrados do vendedor e impostos). Código em `src/modules/integrations/mercadolivre/`.

**Outras receitas** (aba do Financeiro): lançamentos sem venda ligada — juros de aplicação, rendimentos, juros e
multas de clientes, reembolsos, venda de sucata/ativos etc. Cada lançamento tem descrição, categoria, valor,
situação (**recebida**, com data e forma, ou **prevista**, com data esperada — depois "Receber"), observação;
editar e excluir ficam no log de auditoria. Categorias editáveis ("Categorias", gravadas em `Setting`
`finance.otherIncome`; renomear/excluir não altera lançamentos antigos). Filtros por data, categoria, situação e
busca; indicadores de recebido, previsto (com alerta de previstas com data passada) e recebido por categoria.
Somam no "Recebido" da aba Vendas (mostrado separado: vendas · outras receitas) e as previstas entram na previsão de
recebimento; **não** entram no faturamento nem na margem das vendas. Código em `src/modules/finance/other-income*.ts`.
Regras em `src/modules/finance/receivables.ts` (testadas) e `src/modules/finance/sales.ts`.

**Entregas (painel › Entregas, permissão LOGISTICS).** Todo pedido fechado no funil (orçamento em Fechados) gera uma
entrega com cliente, CNPJ/CPF, contato, telefone, **endereço de entrega** (campo "Endereço de entrega" do orçamento;
se vazio, o endereço do cliente), itens com foto e medidas, peso/cubagem, valor, data do fechamento e **prazo
prometido** (fechamento + prazo de entrega do orçamento, em dias corridos). Situações: **A agendar → Agendada → Em
rota → Entregue** (agendar exige data; entregue exige data não futura e registra quem recebeu; transportadora/
responsável, rastreio e observações). Atrasada = não entregue e a data agendada (ou, sem agendamento, a prometida)
já passou. Filtros por situação (a entregar, atrasadas, a agendar, agendadas, em rota, entregues, canceladas),
busca por cliente, nº, cidade ou endereço e período (previsão/agendamento ou data da entrega); indicadores incluem
entregues no mês e % entregue no prazo; link "Abrir no mapa". Reabrir/perder o pedido no funil **cancela** a
entrega (bloqueado se já entregue); fechar de novo reativa. Editar um pedido fechado atualiza a entrega (o endereço só
enquanto "A agendar"). Pedidos fechados antes desta versão entram ao abrir a aba. Tudo no log de auditoria.
Regras em `src/modules/deliveries/rules.ts` (testadas) e `src/modules/deliveries/service.ts`.

**Modelo de importação de produtos** (Produtos › Importar Excel › baixar modelo, ou `/api/admin/products/template`):
aba "produtos" com os títulos que o importador lê (não renomear), colunas agrupadas por cor (identificação, medidas,
embalagem, fornecedor e custo, venda), comentário em cada título, listas de opções (status, unidade, prazo,
categorias cadastradas — aba "listas"), validação de números, aba "instrucoes" e duas linhas de exemplo que o
importador recusa se não forem apagadas. Coluna `markup` grava o markup de venda do produto (o preço continua sendo
aplicado pela aba Tabela).

**Tabela (painel › Tabela, permissão PRODUCTS).** Todos os produtos em uma tabela com foto, código, nome, categoria e
descrição, **custo final** (do cadastro: fornecedor principal + IPI + custos adicionais), **markup de venda por
produto** (editável na própria linha; aceita "2,5", "2.35", "1,8x"), **preço calculado = custo final × markup**
(recalculado enquanto você digita), margem resultante (1 − 1/markup) e preço atual do site com a diferença.
Situações: sem custo, sem markup, abaixo do custo (markup < 1), preço do site diferente, em dia. Ações em massa:
aplicar o mesmo markup aos selecionados e **atualizar o preço no site** (todas as variações do produto, mantendo o
histórico de preços; pulados os sem custo/markup ou com markup < 1). O preço do site só muda por essa ação; mudança
de custo deixa a linha como "preço do site diferente". Markup em `Product.markup` (fator × 10.000). Tudo no log.
Regras em `src/modules/pricing/markup.ts` (testadas) e `src/modules/pricing/table.ts`.

**Parcelas com valores diferentes (orçamento).** As DATAS continuam vindo do campo Parcelamento
("entrada/30/60/90/120/150" = dias contados da data base; "na entrega" = sem data). O VALOR de cada parcela é
editável: digitar um valor fixa a parcela; as demais (automáticas) dividem igualmente o restante (a última absorve o
arredondamento); apagar volta ao automático. A soma é conferida com o total: com diferença, o orçamento pode ser
salvo como rascunho, mas não gerado nem fechado no funil. Trocar a forma de pagamento por uma pronta limpa os valores
fixados. Gravado em `Quote.installmentValues` (centavos por parcela; null = automático) e copiado para a venda; as
contas a receber usam esses valores, com as datas contadas do fechamento. Lógica em `installmentPlan()`
(`src/modules/quotes/totals.ts`, testada).

**Numeração de pedidos e orçamentos (automática).** Código = 3 letras do mês de criação + número com 4 dígitos
(ex.: `NOV-0041`, `DEZ-0042`). O número vem de **uma única sequência contínua** no banco (`doc_number_seq`),
compartilhada por pedidos e orçamentos — não reinicia no mês e nunca se repete entre os dois. O "Nº Pedido" do
orçamento é o próprio código dele: quando o orçamento virar pedido, o pedido herda o mesmo número. Pedidos feitos
direto no site pegam o próximo número da mesma sequência. O mês segue o fuso de Brasília. Código gravado na coluna
`code` (pedidos e orçamentos); buscas aceitam `NOV-0041`, `nov-41` ou `41`. Lógica em `src/lib/doc-code.ts`.

---

## 4. Sistema responsável por cada dado (ERP)

| Dado | Fonte da verdade | Direção |
|---|---|---|
| Produtos / SKUs | ERP | ERP → loja |
| Fotos, descrições, SEO | Loja | — |
| Preços de atacado | ERP | ERP → loja |
| Estoque físico (`onHand`) | ERP | ERP → loja |
| Reservas | Loja | — |
| Clientes (empresas) | Loja | loja → ERP |
| Pedidos | Loja | loja → ERP (após pagamento) |
| Notas fiscais e situação de faturamento | ERP | ERP → loja |

Até a integração, preço e saldo são editados no painel.

---

## 5. Variáveis de ambiente

Todas documentadas em **`.env.example`**. Resumo:

| Variável | Obrigatória | Uso |
|---|---|---|
| `DATABASE_URL` | sim | PostgreSQL |
| `APP_URL`, `APP_ENV` | sim | links de e-mail, sitemap, robots (homologação não indexa) |
| `SESSION_SECRET`, `SESSION_TTL_DAYS` | sim | sessão |
| `CNPJ_PROVIDER`, `CNPJ_API_URL`, `CNPJ_API_KEY` | p/ cadastro | consulta de CNPJ |
| `SHIPPING_PROVIDER`, `MELHORENVIO_*`, `SHIPPING_ORIGIN_ZIP` | p/ frete automático | Melhor Envio |
| `PAYMENT_PROVIDER`, `PAGARME_*` | p/ pagamento | Pagar.me (chave secreta, pública e Basic Auth do webhook) |
| `ERP_PROVIDER`, `BLING_*` | futuro | ERP |
| `EMAIL_PROVIDER`, `EMAIL_FROM`, `EMAIL_API_KEY`, `ADMIN_NOTIFICATION_EMAIL` | p/ e-mails | transacionais |
| `IMAGE_CDN_HOST`, `STORAGE_PROVIDER`, `STORAGE_LOCAL_DIR`, `STORAGE_*` | p/ fotos | `local` grava em disco (dev/homologação); S3/R2 pendente |
| `NEXT_PUBLIC_WHATSAPP` | não | único valor público |

Chaves privadas **nunca** usam `NEXT_PUBLIC_` e nunca ficam no banco.

---

## 6. Endpoints e autorização

| Método e rota | Acesso | Descrição |
|---|---|---|
| `POST /api/auth/cnpj` | público + rate limit | valida e consulta CNPJ (pré-preenchimento) |
| `POST /api/auth/register` | público + rate limit | cria empresa e usuário; envia verificação |
| `POST /api/auth/login` · `logout` | público | sessão |
| `POST /api/auth/forgot` · `reset` · `resend` | público / logado | recuperação e reenvio de verificação |
| `GET /api/products` | público | catálogo; **preço só para empresa validada** |
| `GET·POST·PATCH /api/cart` | comprador validado | ver, somar, definir quantidade (0 remove) |
| `POST /api/cart/reorder` | comprador validado | comprar novamente (preços atuais) |
| `POST /api/addresses` | comprador validado | novo endereço da empresa |
| `POST /api/checkout/shipping` | comprador validado | cotação automática |
| `POST /api/orders` | comprador validado | cria pedido (idempotente) |
| `POST /api/orders/:id/quote` | comprador da empresa | aceita/recusa cotação manual |
| `POST /api/orders/:id/pay` | comprador da empresa | gera cobrança Pix/boleto/cartão |
| `POST /api/webhooks/payments/:provider` | gateway (Basic Auth) | atualização de pagamento |
| `POST /api/admin/uploads` | admin PRODUCTS | envio de fotos (valida o conteúdo real do arquivo, até 8 MB) |
| `GET /api/admin/products/export` · `template` | admin PRODUCTS | Excel da lista filtrada · modelo de importação |
| `POST /api/admin/products/import` | admin PRODUCTS | `mode=preview` (não grava) ou `mode=commit` |
| `GET /api/admin/stock/export` | admin STOCK | Excel do estoque filtrado |

Regras gerais: todo pedido/endereço é filtrado por `companyId` da sessão (isolamento entre empresas);
mutações exigem mesma origem (proteção CSRF) e cookie `SameSite=Lax`; erros seguem o formato
`{ error: { code, message, details } }`. O painel usa Server Actions com `requireAdmin(<permissão>)`
por ação e grava `AuditLog` com antes/depois. Permissões: DASHBOARD, PRODUCTS, CUSTOMERS, ORDERS,
LOGISTICS, FINANCE, SETTINGS, ADMIN_USERS, STOCK.

---

## 7. Instalação e publicação

```bash
cp .env.example .env            # preencha DATABASE_URL, APP_URL, SESSION_SECRET
npm install                     # gera o Prisma Client
npm run db:deploy               # aplica prisma/migrations
SEED_ADMIN_EMAIL=voce@empresa.com.br SEED_ADMIN_PASSWORD='senha-forte' npm run db:seed
npm run dev                     # http://localhost:3000  ·  painel em /admin
```
Demonstração com produtos de exemplo marcados `[DEMO]`: `SEED_DEMO=true npm run db:seed`
(bloqueado quando `APP_ENV=production`).

**Publicação** (Vercel, Railway, Render ou VPS com Node 20+):
1. PostgreSQL gerenciado com **backup diário e point-in-time recovery** (Neon, Supabase, RDS…);
2. variáveis de ambiente no provedor; `APP_ENV=production`;
3. build: `npm run build` · start: `npm start` · antes de cada deploy: `npm run db:deploy`;
4. **cron a cada 5 minutos**: `npm run jobs:expire-reservations` (ou Vercel Cron chamando o mesmo módulo);
5. no painel do Pagar.me, webhook para `https://SEU_DOMINIO/api/webhooks/payments/pagarme` com Basic Auth
   igual a `PAGARME_WEBHOOK_USER/PASSWORD`;
6. HTTPS obrigatório (cabeçalhos de segurança e HSTS já configurados em `next.config.ts`).

---

## 8. Testes

```bash
npm test                                          # unitários (62 casos)
TEST_DATABASE_URL=postgresql://…/banco_teste npm test   # + integração com Postgres real
```
Cobertos: CNPJ numérico e alfanumérico · transições e bloqueios entre os 4 estados · "pago" só via webhook ·
disponibilidade, unidade de venda e expiração de reservas · totais em centavos · análise de risco ·
**não exposição de preço** a visitantes · **concorrência de estoque** (20 reservas simultâneas, zero venda a mais).

Também validado ponta a ponta em ambiente local (banco real): cadastro com CNPJ (inválido, baixado,
inexistente, duplicado, válido), verificação de e-mail liberando preços, carrinho, CSRF, pedido com
cotação manual, idempotência, proposta e aceite da cotação, bloqueio de pagamento sem gateway,
10 pedidos concorrentes disputando o mesmo saldo e expiração automática liberando o estoque.

---

## 9. Integrações pendentes de credenciais ou homologação

| # | Integração | O que já existe | O que falta |
|---|---|---|---|
| 1 | **Consulta de CNPJ** | interface, adaptador HTTP, mapeamento, erros, rate limit | escolher provedor (CNPJá, SERPRO…), credenciais, ajustar `mapResponse` ao contrato real |
| 2 | **Frete — Melhor Envio** | adaptador da API v2, volumes por SKU, recálculo no servidor, fallback para cotação manual | token, CEP de origem, confirmar transportadoras que aceitam volumes longos |
| 3 | **Pagamentos — Pagar.me** | Pix, boleto e cartão (API v5), idempotência, webhook autenticado com reconsulta, estornos | chaves de teste, homologação dos 3 meios, **componente de tokenização do cartão no navegador** (cartão fica desabilitado até lá) |
| 4 | **ERP — Bling** | contrato (`ErpProvider`) e matriz de responsabilidade dos dados | implementação OAuth e jobs de sincronização |
| 5 | **E-mail transacional** | 8 modelos (verificação, senha, pedido, pagamento, cotação, expedição, entrega, aviso interno) | provedor (Resend/SES/SMTP), domínio com SPF/DKIM |
| 6 | **Armazenamento de imagens** | envio múltiplo com validação; modo `local` funcionando | adaptador S3/R2 (credenciais) e `IMAGE_CDN_HOST` |
| 7 | **Notas fiscais** | entidades, estados fiscais, área "Documentos" | vem do ERP (item 4) |

**Conteúdo pendente (não inventado):** logotipo e identidade definitiva, fotografias (banner, categorias,
produtos), especificações técnicas, preços, estoque, dados empresariais do rodapé, textos das políticas
(privacidade/LGPD, termos, entrega, trocas) — todos editáveis no painel.

**Próximos passos de desenvolvimento:** tela de gestão de usuários administrativos (hoje via seed);
convite de usuários adicionais por empresa; troca de empresa ativa para usuários multiempresa;
relatórios exportáveis; upload direto de imagens.

## Financeiro → Saídas (contas a pagar do dia a dia)

Subaba **Saídas** em `/admin/financeiro?aba=saidas` (permissão FINANCE).

- **Lançar**: descrição, categoria, fornecedor/favorecido (opcional, com sugestões dos já usados), valor, vencimento e observação. Pode marcar “já foi paga” (data ≤ hoje + forma).
- **Repetição**: *Parcelar o valor* (divide o total em N parcelas mensais; a última absorve o arredondamento) ou *Repetir todo mês* (mesmo valor por N meses — aluguel, internet). Máx. 60. Vencimento no dia 31 cai no último dia dos meses curtos. Cada saída da série recebe “1/3, 2/3…”.
- **Pagar / Estornar**: registra data, valor pago (pode diferir — juros, desconto), forma e observação. Data futura é recusada.
- **Editar**: vale só para a saída escolhida. **Excluir**: só ela ou ela + as próximas em aberto da mesma série (pagas nunca são apagadas em lote).
- **Anexos**: boleto, NF (PDF/XML), comprovante — mesmo armazenamento privado e validação por assinatura dos anexos das vendas; servidos em `/api/admin/financeiro/saidas/documentos/[id]` com `Cache-Control: private, no-store`.
- **Categorias** editáveis (Setting `finance.expenseCategories`).
- **Filtros**: busca (descrição, fornecedor, observação), período (vencimento para abertas, data de pagamento para pagas), categoria e situação (a pagar, vencidas, pagas).
- **Indicadores**: a pagar, vencidas, próximos 7 dias, pago (no período) e pago por categoria.
- Tudo grava em `AuditLog` (entity `Expense`). Migração: `20261116190000_saidas`. Regras puras em `src/modules/finance/expense-rules.ts` (testes em `tests/expenses.test.ts`).

## Ajustes de 16/11/2026

- **Validade do orçamento**: o orçamento não vai mais sozinho para “Perdidos” quando a validade vence. Ele continua em “Salvos”, e o cartão do funil mostra “validade vencida” em vermelho. Para dar como perdido, arraste para “Perdidos”. Orçamentos que já tinham ido para Perdidos por validade (status EXPIRADO) continuam lá.
- **Financeiro não trava**: ao abrir, o Financeiro gera as vendas dos orçamentos fechados que ainda não têm venda. Se um deles tiver problema (ex.: parcelas que não fecham o total), ele é pulado e a tela mostra um aviso com o número e o motivo. Entregas fazem o mesmo (pulam e registram no log).
- **Arquivos apagados de verdade**: remover um anexo (venda ou saída) ou excluir uma saída apaga também o arquivo do armazenamento privado (`deleteDocumentFile`), depois de confirmada a exclusão no banco.

## Produtos → exclusão em massa

Na lista de Produtos, cada linha tem uma caixa de seleção (e o cabeçalho, "selecionar todos"). Ao marcar, aparece uma barra no rodapé com **Excluir selecionados**, que pede confirmação.

- Produto **sem histórico** é apagado de vez (variações, preços, estoque, fotos, volumes).
- Produto que já aparece em **pedidos do site, orçamentos, compras, movimentações ou reservas de estoque** é **arquivado**: some do site e da lista padrão (fica em Status → Arquivados) e o histórico continua íntegro. A exclusão individual segue a mesma regra (`src/modules/products/delete.ts`).
- Cada produto é tratado separadamente: se um falhar, os outros seguem, e o resultado mostra excluídos, arquivados e falhas. Máx. 500 por vez. Tudo vai para o `AuditLog`.

## Produtos → Categorias

Botão **Categorias** no topo da aba Produtos (substitui o bloco que ficava no fim da página). Abre uma janela para:
- **criar** (só o nome; o endereço `/produtos?categoria=<slug>` é gerado sozinho, sem acento, e não se repete);
- **renomear** (o endereço não muda, para não quebrar links já divulgados);
- **ordenar** com ▲▼ (a ordem é a do site);
- **ativar/desativar** (desativada some da loja junto com os produtos dela; no painel tudo continua);
- **imagem** opcional (URL) usada no site;
- **excluir**, só se a categoria não tiver produtos (inclusive arquivados).
Nomes repetidos são recusados. Tudo grava no `AuditLog`. Código: `src/modules/products/categories.ts` e `src/components/admin/categories-manager.tsx`.

## SEO da loja (16/11/2026)

Ver também `LANCAMENTO-SEO.md` (lista para o dia da publicação).

- **Categorias com endereço próprio**: `/categorias/<slug>`, com título, descrição e texto de apresentação editáveis (Produtos → Categorias → "Página e SEO"). O formato antigo `/produtos?categoria=x` redireciona (308) para o novo.
- **Filtros, busca e ordenação** (`cor`, `dimensao`, `abertura`, `disponibilidade`, `ordem`, `q`): `noindex, follow` e endereço oficial na página da categoria/catálogo. Paginação (`?pagina=2`) tem endereço oficial próprio.
- **Produto**: título e descrição automáticos melhores (`src/lib/seo.ts`): nome em MAIÚSCULAS vira forma de título só no título da aba/Google (o nome cadastrado não muda); descrição cortada sem quebrar palavra ou montada com dados reais do cadastro. "Título SEO"/"Descrição SEO" do produto continuam tendo prioridade.
- **Dados estruturados**: Product (sem preço; imagens e URL completas), BreadcrumbList em produto e categoria, Organization/WebSite na home **só quando a marca estiver cadastrada** (nada inventado).
- **robots.txt** (dinâmico): em produção libera `/api/media/` (fotos) e bloqueia admin, API, conta, carrinho, login/cadastro e páginas de senha.
- **sitemap.xml**: só páginas indexáveis — home, catálogo, categorias ativas, produtos ativos (com fotos) e institucionais com texto. Institucionais sem texto ficam `noindex`.
- **Rodapé** com links para todas as categorias (ligação interna).
- Migração: `20261116200000_seo_categorias` (Category.seoTitle, Category.seoDescription).

## Dashboard → Financeiro

Bloco "Financeiro · contas a receber" no Dashboard (só para quem também tem a permissão FINANCE):
- **A receber (em aberto)**: parcelas em aberto das vendas ativas do funil, com quanto vence nos próximos 7 dias e quanto está sem vencimento.
- **Em atraso**: parcelas vencidas e não recebidas (destacado em vermelho quando > 0).
- **Recebido (no período do Dashboard: 7/30/90 dias)**: parcelas recebidas + outras receitas, com a divisão.
- Tabela com as parcelas atrasadas e as que vencem em 7 dias (até 8), com link para a venda. Cada indicador abre a lista certa em Financeiro → Contas a receber.
Código: `financeDashboard()` em `src/modules/finance/queries.ts`.

## Orçamentos → categoria do pedido (controle interno)

- **Novo orçamento** abre primeiro a escolha da categoria (1, 2, 3…) e depois a folha já com ela. Dá para continuar sem categoria e trocar depois no editor ("Categoria do pedido", acima da folha).
- **Editar categorias** na mesma tela (Setting `quotes.categories`; padrão: Revenda / lojistas, Projetos (arquitetos e paisagistas), Hotelaria e comércio). Renomear/excluir não altera pedidos salvos; os filtros continuam mostrando categorias já usadas.
- Uso interno: **não aparece** no orçamento impresso/PDF nem para o cliente.
- A categoria vai para a venda (Financeiro) e para a entrega quando o pedido é fechado (e acompanha edições).
- Filtros: Orçamentos (coluna + filtro), Funil (etiqueta no cartão + filtro), Financeiro → Vendas e Contas a receber (filtro "Categoria do pedido", parâmetro `pedido`), Entregas (etiqueta + filtro). Todos aceitam "Sem categoria".
- Migração: `20261116210000_categoria_pedido` (Quote/Sale/Delivery.category). Código: `src/modules/quotes/categories.ts`, `src/components/admin/order-categories.tsx`.

## Clientes → cadastro e importação por planilha

- Aba **Clientes** agora tem duas seções: **Cadastro de clientes** (comercial, usado nos orçamentos) e **Contas da loja (site)** (empresas com login, como antes).
- O cadastro aceita **PJ (CNPJ) ou PF (CPF)**, com contato, endereço completo, entrega, aniversário e observações (modelo `Client`). Importar **não cria login** e não interfere no cadastro da empresa na loja (CNPJ continua livre para se cadastrar no site).
- **Importar planilha** (.xlsx ou .csv): Baixar modelo → preencher → Ver prévia (erros e avisos por linha, nada gravado) → Importar. CNPJ/CPF é a chave: existente → atualiza só os campos preenchidos; novo → cria. Valida CNPJ/CPF (dígitos), UF, CEP, e-mail; recupera zero à esquerda; ignora linhas [EXEMPLO] e documentos repetidos na mesma planilha. Até 3.000 linhas.
- No orçamento, **"Cliente cadastrado"** lista o cadastro + as contas da loja (marcadas "conta no site") e preenche os dados do cliente. O orçamento guarda o vínculo (`Quote.clientId`); excluir o cliente do cadastro não apaga os dados já gravados no orçamento.
- Leitura de .xlsx mais robusta (`src/lib/xlsx-lite.ts`): se o ExcelJS não abrir o arquivo (ex.: comentários gravados por alguns programas), lê os valores direto do arquivo. Vale também para a importação de produtos.
- Permissão: CUSTOMERS. Migração `20261116220000_cadastro_clientes`. Código: `src/modules/clients/{rules,service}.ts`, rotas `/api/admin/clients/{template,import}`.

## Meu dia

Primeira opção do menu do painel (`/admin/meu-dia`). Resumo do dia (fuso de Brasília), com navegação para o dia anterior/seguinte ou qualquer data:
- **Vendas do dia**: vendas fechadas no funil, pedidos do site pagos no dia e **pedidos do Mercado Livre** do dia (data da venda; cancelados e estornados ficam de fora), com cliente/comprador, itens, tarifa e líquido do ML. Mostra a divisão por canal e quando o Mercado Livre foi atualizado pela última vez, com o botão **Atualizar Mercado Livre** (sincroniza os últimos 3 dias; permissão FINANCE).
- **Itens vendidos**: quantidades somadas por produto, com valor.
- **Entregas**: agendadas (ou, sem agendamento, prometidas) para o dia, **atrasadas** e entregues no dia, com endereço, telefone e itens; aviso das entregas ainda sem data. **Itens a entregar**: lista de separação somada (dia + atrasadas).
- **Vencendo**: parcelas a receber (indica boleto) e contas a pagar (Saídas) que vencem no dia, mais o total já vencido antes.
- **Orçamentos feitos**: quantidade, total orçado e lista.
Cada bloco aparece só para quem tem a permissão da área (ORDERS, LOGISTICS, FINANCE). Código: `src/modules/admin/my-day.ts` e `my-day-rules.ts`.

## Mercado Livre → importar a planilha de vendas (antes da integração direta)

Em Financeiro › Recebimentos Mercado Livre › **Importar planilha de vendas** (permissão FINANCE):
- Aceita o arquivo baixado em Mercado Livre › Vendas › "Baixar Excel de vendas" (.xlsx ou .csv). O cabeçalho é procurado nas primeiras 20 linhas e as colunas são reconhecidas pelo nome (nº da venda, data, estado/descrição, unidades, receita por produtos/envio, tarifas, cancelamentos, total, nº do anúncio, título, variação, preço unitário, comprador). Regras em `src/modules/integrations/mercadolivre/sheet-rules.ts` (testes em `tests/ml-sheet.test.ts`).
- **Prévia** antes de gravar: vendas agrupadas por nº da venda, totais, canceladas e linhas com erro/aviso (ex.: linha de resumo de pacote sem anúncio é ignorada).
- Grava nas mesmas tabelas da integração (`MlReceipt` com `paymentId = PLAN-<nº da venda>`, `MlOrderItem`), então as vendas aparecem na aba (marcadas "via planilha"), nos indicadores e no **Meu dia**. Liberação do dinheiro fica "sem informação"; categoria do anúncio fica "Sem categoria" (a planilha não traz).
- Reimportar o mesmo período **atualiza** (não duplica). Venda que já veio pela integração é ignorada; e quando a integração sincroniza um pedido que veio da planilha, a versão da planilha é apagada (sem contar duas vezes).
- Rota: `POST /api/admin/financeiro/mercadolivre/importar` (`mode=preview|commit`).

## Financeiro → Faturamento e cobrança

Subaba **Faturamento e cobrança** (`/admin/financeiro?aba=faturamento`), só para vendas do funil de orçamentos (Mercado Livre e site faturam pelo próprio canal). Esteira em etapas clicáveis:
1. **A faturar** — vendas sem NF; alerta quando a entrega já saiu/foi entregue (vermelho) ou está agendada. Ação **Informar NF**: número (até 9 dígitos, sem repetir em outra venda ativa), data de emissão (não futura) e PDF/XML opcional (vai para os documentos da venda). Uma NF por venda; dá para corrigir ou desfazer.
2. **Boletos a emitir** — parcelas cuja forma prevista é Boleto e que ainda não têm boleto. Ação **Registrar boleto**: nosso número/linha digitável e/ou PDF (anexado à parcela). Desfazer limpa o número e remove o PDF do boleto.
3. **Boletos emitidos** — aguardando pagamento, com **Dar baixa**.
4. **Em atraso** — qualquer parcela vencida (com a próxima ação certa).
5. **Recebido** — parcelas recebidas no período (padrão: mês atual).

**Forma prevista da parcela** (`Receivable.plannedMethod`): deduzida da condição de pagamento (ex.: "Pix + boleto" → entrada Pix, demais Boleto; "Boleto 30/60/90" → Boleto; cartão → Cartão; "50% … na entrega" → a definir) e ajustável na lista ou na página da venda. Regras puras em `src/modules/finance/billing-rules.ts` (testes `tests/billing.test.ts`).

A página da venda mostra o quadro da NF e a coluna **Cobrança** por parcela. O **Meu dia** mostra "vendas a faturar" e "boletos a emitir", e marca **Sem NF** nas entregas do dia. Migração `20261117100000_faturamento_cobranca`. Rota de envio: `POST /api/admin/financeiro/faturamento` (`kind=nf|boleto`, permissão FINANCE).
