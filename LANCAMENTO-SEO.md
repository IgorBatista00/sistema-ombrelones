# Lista de lançamento — SEO da loja

Siga na ordem no dia de publicar o site. Itens marcados **(você)** dependem de informação ou acesso seu.

## 1. Configuração do servidor (antes de abrir o site)
- [ ] `APP_ENV=production` — sem isso o robots.txt manda o Google **não ler nada** (proteção da homologação).
- [ ] `APP_URL=https://www.seudominio.com.br` — domínio definitivo, com **https** e a mesma forma (com ou sem www) que será divulgada. Ele vai para endereços oficiais (canonical), sitemap e dados estruturados.
- [ ] Redirecionar a outra forma do domínio (com/sem www) e o `http://` para o endereço oficial (301), na hospedagem/DNS.
- [ ] Conferir: `https://seudominio/robots.txt` deve mostrar `Allow: /api/media/` e `Disallow: /admin`; `https://seudominio/sitemap.xml` deve listar as páginas com o domínio certo.

## 2. Conteúdo que só você pode fornecer (você)
- [ ] Nome da marca (Configurações) — substitui [NOME DA MARCA] nos títulos e libera os dados de empresa para o Google.
- [ ] Razão social, CNPJ, endereço, telefone/WhatsApp e e-mail (Configurações) — aparecem no rodapé e nos dados de empresa.
- [ ] Textos aprovados de: Política de privacidade, Termos comerciais, Política de entrega, Trocas e devoluções. Enquanto vazias, essas páginas ficam fora do Google automaticamente.
- [ ] Fotos dos produtos (cada uma com descrição do que aparece, ex.: "ombrelone aberto em área de piscina").
- [ ] Descrições dos produtos (a planilha `descricoes-produtos.xlsx` já tem textos revisados) e, nas categorias, o "Texto de apresentação" (Produtos → Categorias → Página e SEO).
- [ ] Decidir se as cores de um mesmo modelo viram **variações de um só produto** (recomendado: uma página forte em vez de várias parecidas).

## 3. Google Search Console (você, com acesso ao domínio)
- [ ] Criar a propriedade do **domínio** em https://search.google.com/search-console e validar pelo DNS.
- [ ] Enviar o sitemap: `https://seudominio/sitemap.xml`.
- [ ] Inspecionar e pedir indexação da home, de `/produtos`, de cada `/categorias/...` e de 2–3 produtos.
- [ ] Testar uma página de produto em https://search.google.com/test/rich-results (deve reconhecer "Trilha de navegação"; "Produto" aparece sem preço — esperado, o preço é só para empresas cadastradas).
- [ ] (Opcional) Bing Webmaster Tools — dá para importar do Search Console.

## 4. Depois de 2 a 4 semanas
- [ ] Search Console → Páginas: ver o que não foi indexado e o motivo.
- [ ] Search Console → Desempenho: buscas que já trazem impressões; ajustar títulos/descrições das páginas nas posições 8–20.
- [ ] PageSpeed Insights (https://pagespeed.web.dev) na home, numa categoria e num produto, com as fotos definitivas.
