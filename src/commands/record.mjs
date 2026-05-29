// Grava um VÍDEO navegando pelo app. Dois modos:
//
//   1) Tour automático pelas rotas (default):
//        viewsense record --only feed,ranking
//
//   2) Fluxo customizado — você escreve um .mjs que exporta default
//      async (page, ctx) => { ... }  com as interações (cliques, forms...):
//        viewsense record --flow ./flows/checkout.mjs
//
// O vídeo só é finalizado quando o contexto fecha; a gente renomeia pro
// nome certo e aponta no relatório.

import { launchBrowser, newContext, goto } from '../browser.mjs';
import { loadConfig, resolveRoutes } from '../config.mjs';
import { ensureDir, writeReport } from '../report.mjs';
import { existsSync, renameSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function runRecord(flags = {}) {
  const cfg = await loadConfig(flags);
  const dir = `${cfg.outDir}/videos`;
  ensureDir(dir);

  const size = cfg.device ? undefined : cfg.viewport; // device traz seu próprio tamanho
  const browser = await launchBrowser();
  const ctx = await newContext(browser, cfg, {
    useAuth: true,
    recordVideo: { dir, size },
  });
  const page = await ctx.newPage();

  let label = 'tour';
  const steps = [];

  if (flags.flow) {
    const flowPath = resolve(process.cwd(), flags.flow);
    if (!existsSync(flowPath)) {
      console.error(`✗ flow não encontrado: ${flowPath}`);
      await browser.close();
      process.exit(1);
    }
    const mod = await import(pathToFileURL(flowPath).href);
    const flow = mod.default;
    if (typeof flow !== 'function') {
      console.error('✗ o arquivo de flow precisa exportar default async (page, ctx) => {}');
      await browser.close();
      process.exit(1);
    }
    label = flowPath.split(/[\\/]/).pop().replace(/\.[^.]+$/, '');
    console.log(`→ executando flow: ${label}`);
    const helpers = { goto: (p) => goto(page, `${cfg.baseUrl}${p}`, cfg), baseUrl: cfg.baseUrl, cfg };
    await flow(page, ctx, helpers);
    steps.push(`flow ${label} executado`);
  } else {
    const routes = resolveRoutes(cfg, flags);
    if (!routes.length) {
      console.error('✗ sem rotas pro tour. Use --route, --only, ou --flow.');
      await browser.close();
      process.exit(1);
    }
    console.log('→ gravando tour pelas rotas...');
    for (const route of routes) {
      const url = `${cfg.baseUrl}${route.path}`;
      console.log(`  • ${route.name}  ${url}`);
      await goto(page, url, cfg);
      // pequena rolagem pra dar movimento ao vídeo
      await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })).catch(() => {});
      await page.waitForTimeout(1200);
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' })).catch(() => {});
      await page.waitForTimeout(800);
      steps.push(`${route.name} (${url})`);
    }
  }

  // Pega o objeto video ANTES de fechar pra saber o caminho.
  const video = page.video();
  const before = new Set(safeReaddir(dir));
  await ctx.close(); // finaliza a gravação
  await browser.close();

  // Renomeia o .webm gerado pro nome legível.
  let finalPath = null;
  try {
    if (video) {
      const raw = await video.path();
      finalPath = `${dir}/${label}.webm`;
      if (existsSync(raw)) renameSync(raw, finalPath);
    }
  } catch {
    // fallback: pega o arquivo novo que apareceu na pasta
    const added = safeReaddir(dir).filter((f) => !before.has(f) && f.endsWith('.webm'));
    if (added[0]) {
      finalPath = `${dir}/${label}.webm`;
      try { renameSync(`${dir}/${added[0]}`, finalPath); } catch { finalPath = `${dir}/${added[0]}`; }
    }
  }

  const { mdPath } = writeReport(cfg.outDir, 'record', {
    summary: `Vídeo gravado: ${label}.`,
    items: [{ name: label, status: 'ok', video: finalPath || '(ver pasta videos/)', text: steps.join('\n') }],
  });
  console.log(`\n✓ vídeo: ${finalPath}`);
  console.log(`✓ relatório: ${mdPath}`);
}

function safeReaddir(dir) {
  try { return readdirSync(dir); } catch { return []; }
}
