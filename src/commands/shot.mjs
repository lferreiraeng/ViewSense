// Tira screenshots de uma ou mais rotas (viewport + full page) e escreve
// um relatório dizendo o que foi gerado.
//
//   viewsense shot                  # todas as rotas da config
//   viewsense shot --only feed,home # só essas
//   viewsense shot --route /vagas   # rota ad-hoc
//   viewsense shot --device "iPhone 14 Pro"

import { launchBrowser, newContext, goto } from '../browser.mjs';
import { loadConfig, resolveRoutes } from '../config.mjs';
import { ensureDir, writeReport } from '../report.mjs';

export async function runShot(flags = {}) {
  const cfg = await loadConfig(flags);
  const routes = resolveRoutes(cfg, flags);
  if (!routes.length) {
    console.error('✗ nenhuma rota. Defina "routes" na config ou use --route /caminho');
    process.exit(1);
  }

  const dir = `${cfg.outDir}/screenshots`;
  ensureDir(dir);

  const needsAuth = routes.some((r) => r.auth);
  const browser = await launchBrowser();
  const ctx = await newContext(browser, cfg, { useAuth: needsAuth });
  const page = await ctx.newPage();

  const items = [];
  for (const route of routes) {
    const url = `${cfg.baseUrl}${route.path}`;
    process.stdout.write(`→ ${route.name}  ${url} ... `);
    const finalUrl = await goto(page, url, cfg);

    if (route.auth && !finalUrl.includes(route.path)) {
      console.log(`redirecionou pra ${finalUrl} (sem auth) — pulei`);
      items.push({ name: route.name, path: route.path, url: finalUrl, status: 'skipped (no auth)' });
      continue;
    }

    const shot = `${dir}/${route.name}.png`;
    const full = `${dir}/${route.name}-full.png`;
    await page.screenshot({ path: shot, fullPage: false });
    await page.screenshot({ path: full, fullPage: true });
    console.log('ok');
    items.push({
      name: route.name, path: route.path, url: finalUrl,
      status: 'ok', screenshot: shot, fullScreenshot: full,
    });
  }

  await browser.close();

  const device = cfg.device || `desktop ${cfg.viewport.width}x${cfg.viewport.height}`;
  const ok = items.filter((i) => i.status === 'ok').length;
  const { mdPath } = writeReport(cfg.outDir, 'shot', {
    summary: `${ok}/${items.length} rotas capturadas (device: ${device}).`,
    device, baseUrl: cfg.baseUrl, items,
  });
  console.log(`\n✓ relatório: ${mdPath}`);
}
