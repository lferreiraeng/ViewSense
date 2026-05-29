// Helpers de browser: lança o Chromium e cria um contexto já configurado
// com device/viewport, locale, storageState (auth) e init scripts.

import { chromium, devices } from 'playwright';
import { existsSync } from 'node:fs';

// Flags stealth: reduzem a chance de WAF/Cloudflare/captcha bloquearem.
const STEALTH_ARGS = [
  '--disable-blink-features=AutomationControlled',
  '--no-sandbox',
];

const STEALTH_INIT = () => {
  try {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    Object.defineProperty(navigator, 'languages', {
      get: () => ['pt-BR', 'pt', 'en-US', 'en'],
    });
    Object.defineProperty(navigator, 'plugins', {
      get: () => [1, 2, 3, 4, 5].map(() => ({ name: 'Chrome PDF Plugin' })),
    });
  } catch {}
};

export async function launchBrowser({ headed = false, slowMo = 0 } = {}) {
  return chromium.launch({
    headless: !headed,
    slowMo: headed ? Math.max(slowMo, 40) : slowMo,
    args: STEALTH_ARGS,
  });
}

// Cria um contexto pronto pra uso. Opções:
//   cfg          → config resolvida
//   useAuth      → injeta o storageState salvo (se existir)
//   recordVideo  → { dir, size } pra gravar vídeo
//   stealth      → aplica máscaras anti-bot (default true)
export async function newContext(browser, cfg, opts = {}) {
  const { useAuth = false, recordVideo = null, stealth = true } = opts;

  const devicePreset = cfg.device ? devices[cfg.device] : null;
  if (cfg.device && !devicePreset) {
    console.warn(`⚠ device "${cfg.device}" não existe no Playwright — usando viewport desktop.`);
  }

  const ctxOpts = {
    ...(devicePreset ?? { viewport: cfg.viewport }),
    locale: cfg.locale,
    timezoneId: cfg.timezoneId,
  };

  const authFile = cfg.auth?.storageState;
  if (useAuth && authFile && existsSync(authFile)) {
    ctxOpts.storageState = authFile;
  } else if (useAuth && authFile) {
    console.warn(`⚠ auth pedido mas ${authFile} não existe. Rode: viewsense auth`);
  }

  if (recordVideo) ctxOpts.recordVideo = recordVideo;

  const ctx = await browser.newContext(ctxOpts);

  // Init scripts: stealth + os definidos pelo usuário (string de função/JS).
  if (stealth) await ctx.addInitScript(STEALTH_INIT);
  const scripts = normalizeInitScripts(cfg.initScripts);
  for (const s of scripts) await ctx.addInitScript(s);

  return ctx;
}

function normalizeInitScripts(initScripts) {
  if (!initScripts) return [];
  const arr = Array.isArray(initScripts) ? initScripts : [initScripts];
  return arr.filter(Boolean);
}

// Navega pra uma rota e espera estabilizar (networkidle + fontes + delay).
// Retorna a URL final (útil pra detectar redirect de auth).
export async function goto(page, url, cfg) {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 }).catch(async () => {
    // networkidle pode estourar em apps com polling; cai pro domcontentloaded.
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  });
  await page.evaluate(() => document.fonts?.ready).catch(() => {});
  if (cfg.waitAfterLoad) await page.waitForTimeout(cfg.waitAfterLoad);
  return page.url();
}

export { devices };
