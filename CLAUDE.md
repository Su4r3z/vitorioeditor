# vitorioeditor: portfólio de vídeos

Site de portfólio de vídeos de Vitorio Trevizan | Editor de Vídeo.
Endereço: vitorioeditor.pages.dev (domínio próprio vem depois).
Documentação completa, plano e plano de segurança: https://claude.ai/artifact/HeYV92SAye3sC4nQdAoY4j

Responda sempre em português, com linguagem casual e direta.

## Objetivo

Substituir os links do Google Drive que vão para os clientes. O cliente abre pelo celular, quase sempre vindo do WhatsApp ou da bio do Instagram, toca no vídeo e ele começa em menos de 1 segundo.

## Escopo da v1

- Até 15 vídeos, maioria vertical (9:16).
- RF01 Grade de vídeos com capa, título, categoria (só etiqueta, sem filtro) e duração.
- RF02 Toque abre o player em tela cheia vertical, tocando com som.
- RF03 Arrastar para cima ou para baixo troca de vídeo, estilo Reels.
- RF04 Link próprio por vídeo: /v/[slug], abre direto no player.
- RF05 Botão de WhatsApp fixo, com mensagem pronta citando o vídeo visto.
- RF06 Prévia com imagem e título no WhatsApp (Open Graph por página /v/).
- RF08 Seção Sobre curta, com serviços e link do Instagram.
- RF09 Métricas com Cloudflare Web Analytics (sem cookies).
- Fora do escopo: filtro por categoria, painel admin, área de cliente, versão em inglês.

## Stack

- HTML, CSS e JavaScript puros. Sem framework e sem dependências npm em produção.
- build.mjs em Node, sem dependências, lê videos.json e gera dist/ com index.html, /v/[slug]/index.html e 404.html.
- Vídeo: Cloudflare Stream em HLS.
  - Manifest: https://customer-<CODE>.cloudflarestream.com/<UID>/manifest/video.m3u8
  - Capa: thumbnail do próprio Stream, com o segundo definido em videos.json.
- Player: HLS nativo no Safari/iOS. hls.js (versão light, arquivo fixo em src/vendor/) no resto, carregado só no primeiro toque.
- Hospedagem: Cloudflare Pages, publicação automática a cada push no GitHub (Su4r3z/vitorioeditor).

## Estrutura

```
src/index.html      modelo da página principal
src/video.html      modelo da página /v/
src/styles.css
src/app.js          grade e abertura do player
src/player.js       player, import dinâmico no primeiro toque
src/vendor/hls.light.min.js
src/favicon.svg
design/             protótipo aprovado da Fase 1 (não vai para o ar)
videos.json         lista dos vídeos (uid "TESTE" = capa de teste local)
site.json           textos, serviços, Instagram, WhatsApp e streamCode (customer-XXXX)
build.mjs           gera dist/
_headers            modelo de segurança e cache; o build preenche a origem do Stream e o hash do CSS e grava em dist/_headers
```

Formato de cada item em videos.json:

```json
{ "slug": "criativo-loja-x", "uid": "ID_DO_STREAM", "title": "Criativo Loja X", "category": "Anúncio", "duration": 32, "thumbTime": 2 }
```

## Metas de performance (não negociáveis)

- LCP abaixo de 2,0 s em 4G. Lighthouse mobile Performance 95 ou mais.
- Primeiro quadro do vídeo menos de 1,0 s após o toque.
- Peso inicial abaixo de 150 KB sem capas. Cada capa abaixo de 40 KB.
- CLS abaixo de 0,05. INP abaixo de 200 ms.
- Nada de vídeo tocando sozinho na grade (pesa e o Stream cobra por minuto assistido).
- Vídeo só baixa no toque. Pré-carregar só o início do próximo vídeo da fila.

## UX/UI e animações

- Mobile first (360 a 430 px). Grade 2 colunas no celular, 3 no tablet, 4 no desktop.
- Fundo escuro, texto claro, uma cor de destaque só em botões e no vídeo ativo. Destaque aprovado: âmbar #FFB23E (texto escuro por cima).
- Player: CTA e botão de som ficam bem acima da borda de baixo (72 px + safe-area), porque a barra do navegador interno corta o rodapé.
- Serviços da seção Sobre: criativos para anúncio, Reels e TikTok, roteirização de conteúdo, vídeo institucional. Vitório não faz cortes de podcast ou live.
- Capas sempre com aspect-ratio 9/16 reservado.
- Áreas de toque mínimas de 44 x 44 px. Ações principais na metade de baixo da tela.
- Player: tocar pausa, arrastar troca, fechar no canto, botão de som visível.
- Fonte do sistema ou uma fonte só, poucos pesos.
- Animações só com transform e opacity, 150 a 300 ms. View Transitions na capa virando player, com fallback.
- Respeitar prefers-reduced-motion. Contraste WCAG AA.
- Testar também no navegador interno do WhatsApp e do Instagram.

## Segurança

- Nunca colocar chave ou token da Cloudflare no código ou no repositório. O site não precisa de nenhuma.
- Zero pacotes npm no site. hls.js em versão fixa, servido do próprio site.
- _headers com CSP restrita (default-src 'self', Stream e Cloudflare Insights liberados só onde precisa, frame-ancestors 'none'), nosniff, Referrer-Policy e Permissions-Policy. Modelo na aba Segurança do doc.
- Stream: Allowed Origins só com vitorioeditor.pages.dev e download desligado. Isso é feito pelo Vitório no painel.
- Nenhum formulário e nenhuma coleta de dados pessoais.

## Fases

0. Preparação (Vitório): contas, Stream, repositório, 15 vídeos e textos.
1. Design: telas da grade, do player e da página /v/. Vitório aprova no celular antes de codar.
2. Base do site: HTML, CSS, grade, videos.json, build.mjs. Pronto com Lighthouse 95+.
3. Player. Pronto quando o vídeo começa em menos de 1 s no celular do Vitório.
4. Animações e acabamento, 404, Open Graph.
5. Vídeos reais do Stream.
6. Testes em aparelhos reais e revisão de acessibilidade.
7. Publicação e checklist de segurança.

Trabalhe uma fase por vez e pare no fim de cada uma para o Vitório testar.

## Notas de implementação

- CSS fica inline no `<style>` de cada página (sem request bloqueando). A CSP libera esse bloco pelo hash sha256 que o build calcula. Não use atributo `style=""` no HTML gerado, porque a CSP bloqueia.
- Cloudflare Pages: comando de build `node build.mjs`, pasta de saída `dist`.
- Sem streamCode no site.json, o build usa capas SVG de teste em /capas-teste/.
- Fase 2 fechada em 2026-11-17: Lighthouse mobile 100/100/100/100 na grade e na /v/, index.html com 3,5 KB gzip.
