## 1. Página "Apps" com ligação ao GitHub via token

- Nova rota `/_app/apps` + item na sidebar (`AppSidebar`) com ícone (lucide `AppWindow` ou `Plug`).
- Card "GitHub": input para Personal Access Token + nome do repo (`owner/repo` opcional).
- Token guardado em nova tabela `user_integrations` (user_id, provider='github', token encriptado-at-rest via RLS própria do user, metadata jsonb). RLS: só o próprio user lê/escreve.
- Server function `getGithubProfile` / `listGithubRepos`: lê o token do user via `requireSupabaseAuth` e chama `https://api.github.com/user` e `/user/repos`.
- UI mostra: estado (ligado/não ligado), avatar+username do GitHub, lista dos últimos 5 repos, botão "Desligar".
- Sem webhooks, sem push — apenas leitura inicial. Podemos estender depois.

## 2. Partilha pública do Travel Planner

- Nova coluna em `trips`: `public_slug text unique`, `is_public boolean default false`.
- Botão "Partilhar" na página de uma viagem → gera slug (nanoid) e mostra link `https://<app>/viagem/<slug>`.
- Nova rota PÚBLICA `src/routes/viagem.$slug.tsx` (fora de `_app`, sem auth).
- Loader chama server function `getPublicTrip(slug)` que usa `supabaseAdmin` (bypassa RLS) mas filtra `is_public=true` — devolve viagem + dias + itinerary items + itens (read-only).
- UI: vista read-only com mesmo layout/visual da página interna, header com "Partilhada por…", sem botões de edição.
- Botão para revogar partilha (limpa slug + is_public=false).

## 3. Minimizar a caixa de Notificações no Dashboard

- No componente do dashboard que mostra "Notificações", adicionar botão chevron (▼/▲) que colapsa o corpo.
- Estado persistido em `localStorage` (`dashboard.notifications.collapsed`).
- Quando colapsado mostra apenas o header com contador "X notificações".

## 4. Gestão de categorias em Finanças

- Nova tabela `finance_categories` (id, user_id, name, color, icon, kind: 'income'|'expense'|'both', created_at, updated_at). RLS por user.
- Seed automático na primeira utilização: as 9 categorias atuais (`comida`, `transportes`, etc.) são inseridas para o user se ainda não tiver nenhuma.
- Em `/financas`: novo botão "Categorias" → abre modal com lista + criar/editar/eliminar (não pode eliminar se houver transações a usar — mostrar erro).
- Selects de categoria nas transações passam a ler de `finance_categories` em vez do array hard-coded.
- Constante `CATEGORIES` removida; cores do pie chart usam `category.color` quando definido.

## 5. Notas — negrito e cor

- Atualmente as notas são `textarea` simples. Mudança mínima e pragmática:
  - Trocar por `contentEditable` ligeiro com toolbar: **B** (negrito) + dropdown de cor (6 cores predefinidas do tema).
  - Persistir conteúdo como HTML em `notes.content` (já é text — sem migração).
  - Sanitizar com `DOMPurify` ao renderizar (allowlist: `b,strong,span[style*=color]`).
- Notas antigas em texto puro continuam a funcionar (renderizadas tal-qual).

## Detalhes técnicos

- 1 migração SQL única com: `user_integrations`, `finance_categories`, novas colunas em `trips` (`public_slug`, `is_public`), + GRANTs + RLS + triggers `updated_at`.
- Função SQL `gen_trip_slug()` opcional, ou geramos slug no client com `nanoid` (já provavelmente instalado, senão `crypto.randomUUID().slice(0,8)`).
- `DOMPurify` via `bun add dompurify` + `@types/dompurify`.
- Sem secrets novos: token do GitHub é por-utilizador, guardado na DB do próprio user.

## Ordem de implementação

1. Migração DB (aprovação)
2. Apps/GitHub (rota + sidebar + server fn)
3. Partilha de viagens (rota pública + botão)
4. Categorias finanças (modal + refactor selects)
5. Notas com formatação (toolbar + sanitização)
6. Colapsar notificações no dashboard

Confirmas para avançar?
