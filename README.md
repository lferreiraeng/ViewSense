# 👀 ViewSense

Dê olhos pro seu agente de IA. Em vez de só *ler* o código, ele passa a navegar pelo app rodando, ver o que está na tela, tirar prints, gravar vídeo e inspecionar elementos. Gasta uma fração dos tokens e do tempo.

![ViewSense demo](https://raw.githubusercontent.com/lferreiraeng/ViewSense/main/docs/demo.gif)

[![npm](https://img.shields.io/npm/v/viewsense.svg)](https://www.npmjs.com/package/viewsense)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org)

## O problema

Quando você pede pra um agente de IA arrumar um layout ou entender um fluxo, ele normalmente adivinha pelo código: lê 15 arquivos de componente, monta um modelo mental do CSS e torce pra estar certo. Isso é caro (muitos tokens), lento e quase sempre errado, porque o que aparece na tela depende de estado, dados, breakpoints e CSS computado que nenhum arquivo isolado revela.

## A ideia

ViewSense é uma CLI que roda em cima do [Playwright](https://playwright.dev) e dá ao agente um canal visual pro app:

- **`snapshot`**: descrição textual e estruturada da página (headings, botões, links, árvore ARIA). Barata em tokens, o agente "lê" a tela sem precisar de imagem.
- **`shot`**: screenshots (viewport e página inteira), mobile ou desktop.
- **`record`**: grava vídeo de um tour pelas rotas ou de um fluxo customizado (login, checkout, etc).
- **`inspect`**: `outerHTML`, estilos computados, bounding box e print recortado de um elemento. É como o agente descobre *por que* o card está quebrado.
- **`perf`**: métricas reais por rota (TTFB, FCP, LCP, JS transferido, número de requests).
- **`auth`**: captura uma sessão logada uma vez e reusa em tudo (manual, formulário ou token).

Todo comando grava um relatório em Markdown e JSON no diretório de saída. O agente lê o relatório (curto, barato) e só abre o print ou vídeo específico quando precisa do pixel. É isso que corta o gasto de tokens.

> Nasceu de um conjunto de scripts internos do [aluno.dev](https://aluno.dev) e foi generalizado pra funcionar em qualquer app web (Next.js, Vite, Rails, Django, o que for, porque ele só fala HTTP).

## Instalação

Precisa de Node.js 18 ou superior.

```bash
# no seu projeto
npm install --save-dev viewsense

# baixe o browser do Playwright (uma vez só, ~150MB)
npx playwright install chromium
```

Ou rode sem instalar:

```bash
npx viewsense --help
```

## Começando em 30 segundos

```bash
# 1. cria o viewsense.config.json
npx viewsense init

# 2. suba seu app (em outro terminal)
npm run dev

# 3. olhe uma página em texto, barato:
npx viewsense snapshot --route /

# 4. tire um print:
npx viewsense shot --route /
```

Os artefatos saem em `./.viewsense/` (prints, vídeos, relatórios `.md`).

## Configuração

`viewsense init` cria um `viewsense.config.json`. Exemplo:

```json
{
  "baseUrl": "http://localhost:3000",
  "outDir": "./.viewsense",
  "device": null,
  "viewport": { "width": 1440, "height": 900 },
  "waitAfterLoad": 1500,
  "routes": [
    { "name": "home",  "path": "/" },
    { "name": "login", "path": "/login" },
    { "name": "feed",  "path": "/feed", "auth": true }
  ],
  "auth": {
    "strategy": "manual",
    "storageState": "./.viewsense/auth.json",
    "loginPath": "/login"
  },
  "initScripts": [
    "try { localStorage.setItem('cookie_consent','accepted'); } catch(e) {}"
  ]
}
```

| Campo | O que faz |
|---|---|
| `baseUrl` | URL base do app rodando. |
| `device` | Nome de um [device do Playwright](https://github.com/microsoft/playwright/blob/main/packages/playwright-core/src/server/deviceDescriptors.ts) (ex: `"iPhone 14 Pro"`). `null` usa desktop com `viewport`. |
| `routes[]` | Páginas conhecidas. `name` nomeia os arquivos. `auth: true` exige sessão. |
| `auth.strategy` | `manual`, `form` ou `token` (veja abaixo). |
| `initScripts[]` | JS injetado em toda página (fechar cookie banner, mascarar bot, setar localStorage). |
| `waitAfterLoad` | Espera fixa após o load (ms) pra fontes, animações e lazy-load. |

Precedência: flags da CLI, depois variáveis de ambiente (`VIEWSENSE_*`), depois o arquivo de config, depois os defaults.

## Comandos

### `snapshot`: leia a tela em texto (comece por aqui)
```bash
npx viewsense snapshot --route /feed
```
Extrai título, headings, elementos interativos (role, nome, href), contagens e a árvore ARIA. Sem imagem significa poucos tokens. O agente decide depois se precisa de um print.

### `shot`: screenshots
```bash
npx viewsense shot                       # todas as rotas da config
npx viewsense shot --only feed,home      # só essas
npx viewsense shot --route /vagas        # rota ad-hoc
npx viewsense shot --device "iPhone 14 Pro"
```
Gera `nome.png` (viewport) e `nome-full.png` (página inteira) por rota.

### `inspect`: anatomia de um elemento
```bash
npx viewsense inspect --route /feed --selector ".card"
npx viewsense inspect --route /feed --selector ".card" --styles "display,gap,width"
```
`outerHTML`, estilos computados, bounding box e print recortado. Ideal pra debugar "por que isso está desalinhado".

### `perf`: performance real
```bash
npx viewsense perf --only home,feed
```
TTFB, FCP, LCP, DOMContentLoaded, networkIdle, número de requests, KB de JS e os 5 maiores requests.

### `record`: vídeo
```bash
# tour automático pelas rotas
npx viewsense record --only feed,ranking

# fluxo customizado (você escreve as interações)
npx viewsense record --flow ./examples/flow.example.mjs
```
Salva um `.webm`. Um flow é um `.mjs` que exporta `default async (page, ctx, { goto, baseUrl }) => { ... }`. Veja [`examples/flow.example.mjs`](./examples/flow.example.mjs).

### `auth`: capturar sessão (uma vez)
```bash
# você loga na janela do browser; a sessão é salva ao cair numa rota autenticada
npx viewsense auth --strategy manual

# login automático por formulário (sem captcha)
VIEWSENSE_EMAIL=foo@bar.com VIEWSENSE_PASSWORD=segredo \
  npx viewsense auth --strategy form

# injeta um token ou sessão existente no localStorage
VIEWSENSE_SESSION='{"access_token":"..."}' \
  npx viewsense auth --strategy token
```
A sessão vira `storageState` (cookies e localStorage) e é reusada por todos os comandos em rotas `auth: true`.

> 🔒 Credenciais nunca vão no arquivo de config, só por variável de ambiente. E o `auth.json` está no `.gitignore` por padrão. Não versione.

## Variáveis de ambiente

| Variável | Equivalente |
|---|---|
| `VIEWSENSE_BASE_URL` | `baseUrl` / `--base` |
| `VIEWSENSE_DEVICE` | `device` / `--device` |
| `VIEWSENSE_OUT` | `outDir` / `--out` |
| `VIEWSENSE_EMAIL` / `VIEWSENSE_PASSWORD` | credenciais (auth `form`) |
| `VIEWSENSE_SESSION` | sessão (auth `token`, via `fromEnv`) |
| `VIEWSENSE_HEADED` | mostra a janela do browser (debug) |
| `VIEWSENSE_DEBUG` | imprime stack traces completos |

## Usando com um agente de IA

A ideia é o fluxo barato: o agente roda um comando, lê o relatório `.md` e só carrega imagens ou vídeos quando precisa.

Sugestão de instrução pro seu agente (no arquivo de regras do seu editor):

```md
Para ver o app rodando, use a CLI `viewsense` (Playwright por baixo):
- Comece com `npx viewsense snapshot --route <rota>` e leia .viewsense/snapshot.md
  (texto, barato). Só peça screenshot se realmente precisar do visual.
- Layout quebrado? `npx viewsense inspect --route <rota> --selector "<css>"`.
- Antes e depois de uma mudança visual: `npx viewsense shot --only <nomes>`.
- Páginas autenticadas exigem `npx viewsense auth` uma vez.
- Não abra a imagem inteira sem motivo, o .md já resume o que existe.
```

Uma imagem custa mais de mil tokens pro modelo. Um `snapshot` textual da mesma página costuma custar uma fração disso e ainda dá seletores e hierarquia que a imagem não dá. O agente acerta de primeira em vez de ler dezenas de arquivos.

## Como nasceu

ViewSense começou como um punhado de scripts Playwright internos do [aluno.dev](https://aluno.dev): login automatizado, screenshots mobile, inspeção de cards, medição de performance. A ideia se mostrou boa demais pra ficar só num projeto, então virou ferramenta genérica e reusável:

- App-agnóstico, nada de Supabase ou Next.js hardcoded, tudo vem da config.
- CLI única (`viewsense <comando>`) no lugar de vários arquivos soltos.
- Auth unificada: as 4 estratégias antigas (manual, formulário, API e token) viraram `--strategy manual|form|token`.
- `snapshot`: descrição textual da página, o maior corte de tokens.
- `record`: gravação de vídeo (tour ou flow custom).
- Relatórios `.md` e `.json` em todo comando, pensados pra leitura por IA.
- Segurança: credenciais só por env, `auth.json` e `.env` no `.gitignore`.

## Contribuindo

PRs são bem-vindos. Ideias: presets de auth (Supabase, Clerk, Auth0), diff visual de screenshots, captura de erros de console, comparação mobile e desktop lado a lado.

## Licença

[MIT](./LICENSE)
