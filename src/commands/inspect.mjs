// Inspeciona um elemento numa rota: outerHTML, estilos computados, bounding
// box e um screenshot recortado só do elemento. É o que o agente usa pra
// entender "por que esse card está quebrado" sem chutar pelo CSS.
//
//   viewsense inspect --route /feed --selector ".card"
//   viewsense inspect --route /feed --selector ".card" \
//       --styles "display,flex-direction,gap,width"

import { launchBrowser, newContext, goto } from '../browser.mjs';
import { loadConfig } from '../config.mjs';
import { ensureDir, writeReport } from '../report.mjs';

const DEFAULT_STYLES = [
  'display', 'position', 'flex-direction', 'justify-content', 'align-items',
  'gap', 'width', 'height', 'margin', 'padding', 'font-size', 'color',
  'background-color', 'overflow', 'z-index',
];

export async function runInspect(flags = {}) {
  const cfg = await loadConfig(flags);
  const selector = flags.selector;
  if (!selector) {
    console.error('✗ informe --selector "<css>"');
    process.exit(1);
  }
  const path = flags.route || '/';
  const styleProps = flags.styles ? flags.styles.split(',').map((s) => s.trim()) : DEFAULT_STYLES;

  const dir = `${cfg.outDir}/inspect`;
  ensureDir(dir);

  const browser = await launchBrowser();
  const ctx = await newContext(browser, cfg, { useAuth: true });
  const page = await ctx.newPage();
  const url = `${cfg.baseUrl}${path}`;
  console.log(`→ ${url}  →  ${selector}`);
  await goto(page, url, cfg);

  const el = page.locator(selector).first();
  const count = await page.locator(selector).count();
  if (!count) {
    console.error(`✗ selector "${selector}" não encontrado (0 matches).`);
    await browser.close();
    process.exit(1);
  }
  console.log(`  ${count} match(es) — inspecionando o primeiro`);

  const safe = selector.replace(/[^\w-]/g, '_').slice(0, 40);
  const shot = `${dir}/${safe}.png`;
  await el.scrollIntoViewIfNeeded().catch(() => {});
  await el.screenshot({ path: shot }).catch(() => {});

  const html = (await el.evaluate((node) => node.outerHTML).catch(() => '')).slice(0, 4000);

  const computed = await el.evaluate((node, props) => {
    const cs = getComputedStyle(node);
    const r = node.getBoundingClientRect();
    const out = { _rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } };
    for (const p of props) out[p] = cs.getPropertyValue(p);
    return out;
  }, styleProps);

  await browser.close();

  const metrics = {
    matches: count,
    rect: `${computed._rect.w}×${computed._rect.h} @ (${computed._rect.x},${computed._rect.y})`,
  };
  delete computed._rect;
  for (const [k, v] of Object.entries(computed)) metrics[k] = v;

  const { mdPath } = writeReport(cfg.outDir, 'inspect', {
    summary: `Inspeção de \`${selector}\` em ${path}.`,
    items: [{
      name: selector, url, status: 'ok',
      screenshot: shot, metrics, html,
    }],
  });
  console.log(`\n✓ relatório: ${mdPath}`);
}
