// Mede performance real das rotas: TTFB, FCP, LCP, DOMContentLoaded, tempo
// até networkidle, nº de requests, JS transferido e os maiores requests.
//
//   viewsense perf
//   viewsense perf --only feed,home

import { launchBrowser, newContext } from '../browser.mjs';
import { loadConfig, resolveRoutes } from '../config.mjs';
import { writeReport } from '../report.mjs';

export async function runPerf(flags = {}) {
  const cfg = await loadConfig(flags);
  const routes = resolveRoutes(cfg, flags);
  if (!routes.length) {
    console.error('✗ nenhuma rota. Defina "routes" na config ou use --route /caminho');
    process.exit(1);
  }

  const needsAuth = routes.some((r) => r.auth);
  const browser = await launchBrowser();
  const ctx = await newContext(browser, cfg, { useAuth: needsAuth });

  // Warmup: dev servers compilam on-demand e mentem o TTFB na 1ª request.
  if (!flags['no-warmup']) {
    console.log('→ warmup...');
    for (const r of routes) {
      const p = await ctx.newPage();
      await p.goto(`${cfg.baseUrl}${r.path}`, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
      await p.close();
    }
  }

  const items = [];
  for (const route of routes) {
    const page = await ctx.newPage();
    const requests = [];
    page.on('response', async (res) => {
      let bytes = 0;
      try { bytes = (await res.body()).length; } catch {}
      requests.push({ url: res.url().replace(cfg.baseUrl, '').slice(0, 80), type: res.request().resourceType(), bytes });
    });

    const url = `${cfg.baseUrl}${route.path}`;
    const t0 = Date.now();
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    const m = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0];
      const paints = performance.getEntriesByType('paint');
      const lcp = performance.getEntriesByType('largest-contentful-paint').pop();
      return {
        ttfb: nav?.responseStart || 0,
        domContent: nav?.domContentLoadedEventEnd || 0,
        fcp: paints.find((p) => p.name === 'first-contentful-paint')?.startTime || 0,
        lcp: lcp?.startTime || 0,
      };
    });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    const idle = Date.now() - t0;

    const jsReqs = requests.filter((r) => r.type === 'script');
    const jsKB = Math.round(jsReqs.reduce((s, r) => s + (r.bytes || 0), 0) / 1024);
    const top = [...requests].sort((a, b) => b.bytes - a.bytes).slice(0, 5)
      .map((r) => `${Math.round(r.bytes / 1024)}KB [${r.type}] ${r.url}`);

    const metrics = {
      TTFB: `${Math.round(m.ttfb)}ms`,
      FCP: `${Math.round(m.fcp)}ms`,
      LCP: `${Math.round(m.lcp)}ms`,
      DOMContentLoaded: `${Math.round(m.domContent)}ms`,
      networkIdle: `${idle}ms`,
      requests: requests.length,
      'JS files': jsReqs.length,
      'JS total': `${jsKB}KB`,
    };
    console.log(`→ ${route.name}: LCP ${metrics.LCP}, JS ${metrics['JS total']}, ${requests.length} reqs`);
    items.push({ name: route.name, path: route.path, url, status: 'ok', metrics, text: 'Top requests:\n' + top.join('\n') });
    await page.close();
  }

  await browser.close();
  const { mdPath } = writeReport(cfg.outDir, 'perf', {
    summary: `Performance de ${items.length} rota(s).`,
    items,
  });
  console.log(`\n✓ relatório: ${mdPath}`);
}
