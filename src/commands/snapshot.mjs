// O comando que MAIS economiza token. Em vez de mandar uma imagem pro modelo
// (cara, ~1k+ tokens cada), extrai uma descrição TEXTUAL e estruturada do que
// está na tela: título, headings, elementos interativos (com role/nome/href),
// e a árvore de acessibilidade enxuta. O agente "lê" a página por uma fração
// do custo e só pede um screenshot quando realmente precisa do visual.
//
//   viewsense snapshot --route /feed
//   viewsense snapshot --only feed,home

import { launchBrowser, newContext, goto } from '../browser.mjs';
import { loadConfig, resolveRoutes } from '../config.mjs';
import { writeReport } from '../report.mjs';

export async function runSnapshot(flags = {}) {
  const cfg = await loadConfig(flags);
  const routes = resolveRoutes(cfg, flags);
  if (!routes.length) {
    console.error('✗ nenhuma rota. Defina "routes" na config ou use --route /caminho');
    process.exit(1);
  }

  const needsAuth = routes.some((r) => r.auth);
  const browser = await launchBrowser();
  const ctx = await newContext(browser, cfg, { useAuth: needsAuth });
  const page = await ctx.newPage();

  const items = [];
  for (const route of routes) {
    const url = `${cfg.baseUrl}${route.path}`;
    console.log(`→ ${route.name}  ${url}`);
    const finalUrl = await goto(page, url, cfg);

    if (route.auth && !finalUrl.includes(route.path)) {
      items.push({ name: route.name, url: finalUrl, status: 'skipped (no auth)' });
      continue;
    }

    const data = await page.evaluate(() => {
      const text = (el) => (el?.innerText || el?.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 120);
      const visible = (el) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
      };
      const headings = [...document.querySelectorAll('h1,h2,h3')]
        .filter(visible).map((h) => `${h.tagName.toLowerCase()}: ${text(h)}`).slice(0, 30);

      const interactive = [...document.querySelectorAll('a[href],button,[role="button"],input,select,textarea,[role="link"],[role="tab"]')]
        .filter(visible)
        .map((el) => {
          const tag = el.tagName.toLowerCase();
          const role = el.getAttribute('role') || tag;
          const name = text(el) || el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('name') || el.getAttribute('value') || '';
          const href = el.getAttribute('href');
          return `[${role}] ${name}${href ? ` → ${href}` : ''}`;
        })
        .slice(0, 80);

      // Conta imagens sem alt (acessibilidade) e erros visíveis.
      const imgsNoAlt = [...document.querySelectorAll('img')].filter((i) => visible(i) && !i.getAttribute('alt')).length;

      return {
        title: document.title,
        headings,
        interactive,
        counts: {
          links: document.querySelectorAll('a[href]').length,
          buttons: document.querySelectorAll('button,[role="button"]').length,
          inputs: document.querySelectorAll('input,select,textarea').length,
          images: document.querySelectorAll('img').length,
          imagesWithoutAlt: imgsNoAlt,
        },
      };
    });

    // Árvore ARIA em texto (ótima descrição semântica e barata em tokens).
    let axText = '(indisponível)';
    try {
      const aria = await page.locator('body').ariaSnapshot();
      if (aria) axText = aria.split('\n').slice(0, 120).join('\n');
    } catch {}

    const body = [
      `Título: ${data.title}`,
      '',
      `Contagens: ${Object.entries(data.counts).map(([k, v]) => `${k}=${v}`).join(', ')}`,
      '',
      'Headings:',
      ...data.headings.map((h) => `  ${h}`),
      '',
      'Elementos interativos:',
      ...data.interactive.map((i) => `  ${i}`),
      '',
      'Árvore ARIA:',
      axText,
    ].join('\n');

    items.push({ name: route.name, url: finalUrl, status: 'ok', text: body });
  }

  await browser.close();
  const { mdPath } = writeReport(cfg.outDir, 'snapshot', {
    summary: `Snapshot textual de ${items.length} rota(s) — leia isto antes de pedir screenshots.`,
    items,
  });
  console.log(`\n✓ relatório: ${mdPath}`);
}
