#!/usr/bin/env node
// ViewSense — dá olhos pro seu agente de IA enxergar o app rodando.
//
// Uso:  viewsense <comando> [flags]
//
// Comandos:
//   init        cria viewsense.config.json no projeto atual
//   auth        captura/salva uma sessão autenticada (storageState)
//   shot        screenshots de uma/várias rotas (viewport + full page)
//   snapshot    descrição TEXTUAL da página (economiza tokens) — use primeiro
//   inspect     outerHTML + estilos computados + print de um elemento
//   perf        métricas de performance por rota (TTFB/FCP/LCP/JS...)
//   record      grava um vídeo do tour pelas rotas ou de um flow custom
//
// Flags comuns:
//   --base <url>        baseUrl (ex: http://localhost:3000)
//   --device <nome>     device Playwright (ex: "iPhone 14 Pro"); vazio = desktop
//   --route <p1,p2>     rotas ad-hoc (ex: /feed,/ranking)
//   --only <n1,n2>      filtra rotas nomeadas da config
//   --out <dir>         pasta de saída (default ./.viewsense)
//   --config <arquivo>  caminho de config custom
//   --selector <css>    (inspect) elemento a inspecionar
//   --styles <a,b>      (inspect) props de estilo computado
//   --flow <arquivo>    (record) flow custom .mjs
//   --strategy <nome>   (auth) manual | form | token

// Imports são dinâmicos (dentro do dispatch) pra que `help` e `init` funcionem
// sem o Playwright instalado — só os comandos de browser o exigem.

function parseArgs(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        flags[key] = true; // flag booleana
      } else {
        flags[key] = next;
        i++;
      }
    } else {
      positional.push(a);
    }
  }
  return { command: positional[0], flags };
}

const HELP = `ViewSense — dá olhos pro seu agente de IA ver o app rodando.

Uso: viewsense <comando> [flags]

Comandos:
  init        cria viewsense.config.json no projeto
  auth        salva uma sessão autenticada (--strategy manual|form|token)
  snapshot    descrição textual da página (barato em tokens) — comece aqui
  shot        screenshots (viewport + full page)
  inspect     HTML + estilos computados + print de um elemento (--selector)
  perf        métricas de performance por rota
  record      grava vídeo (tour automático ou --flow custom.mjs)

Flags comuns: --base --device --route --only --out --config
Exemplos:
  viewsense init
  viewsense auth --strategy manual
  viewsense snapshot --route /feed
  viewsense shot --device "iPhone 14 Pro"
  viewsense inspect --route /feed --selector ".card"
  viewsense perf --only home,feed
  viewsense record --only feed,ranking
`;

async function main() {
  const { command, flags } = parseArgs(process.argv.slice(2));

  if (!command || command === 'help' || flags.help) {
    console.log(HELP);
    return;
  }

  try {
    switch (command) {
      case 'init': {
        const { runInit } = await import('../src/commands/init.mjs');
        return await runInit(flags);
      }
      case 'auth': {
        const [{ runAuth }, { loadConfig }] = await Promise.all([
          import('../src/commands/auth.mjs'),
          import('../src/config.mjs'),
        ]);
        return await runAuth(await loadConfig(flags), flags);
      }
      case 'shot': {
        const { runShot } = await import('../src/commands/shot.mjs');
        return await runShot(flags);
      }
      case 'snapshot': {
        const { runSnapshot } = await import('../src/commands/snapshot.mjs');
        return await runSnapshot(flags);
      }
      case 'inspect': {
        const { runInspect } = await import('../src/commands/inspect.mjs');
        return await runInspect(flags);
      }
      case 'perf': {
        const { runPerf } = await import('../src/commands/perf.mjs');
        return await runPerf(flags);
      }
      case 'record': {
        const { runRecord } = await import('../src/commands/record.mjs');
        return await runRecord(flags);
      }
      default:
        console.error(`✗ comando desconhecido: ${command}\n`);
        console.log(HELP);
        process.exit(1);
    }
  } catch (err) {
    console.error(`\n✗ erro: ${err?.message || err}`);
    if (process.env.VIEWSENSE_DEBUG) console.error(err);
    process.exit(1);
  }
}

main();
