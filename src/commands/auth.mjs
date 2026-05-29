// Captura uma sessão autenticada e salva como storageState (cookies +
// localStorage) num arquivo que as outras commands reusam.
//
// Estratégias (cfg.auth.strategy):
//   "manual"  — abre o browser, VOCÊ loga (resolve captcha etc.), e a gente
//               salva assim que cair numa rota autenticada. (default)
//   "form"    — preenche email/senha e clica submit automaticamente.
//   "token"   — injeta uma sessão já existente no localStorage (ex: apps que
//               guardam o JWT numa chave conhecida). Veja cfg.auth.token.
//
// Credenciais vêm SEMPRE do ambiente: VIEWSENSE_EMAIL / VIEWSENSE_PASSWORD.

import { launchBrowser, newContext } from '../browser.mjs';
import { ensureDir } from '../report.mjs';
import { dirname } from 'node:path';

export async function runAuth(cfg, flags = {}) {
  const auth = cfg.auth || {};
  const out = auth.storageState || `${cfg.outDir}/auth.json`;
  ensureDir(dirname(out));
  const strategy = flags.strategy || auth.strategy || 'manual';

  // Confere se o servidor está de pé antes de abrir o browser.
  const ping = await fetch(cfg.baseUrl).catch(() => null);
  if (!ping) {
    console.error(`✗ ${cfg.baseUrl} não respondeu. Suba seu app primeiro (ex: npm run dev).`);
    process.exit(1);
  }
  console.log(`→ servidor ok (HTTP ${ping.status})`);

  if (strategy === 'manual') return manualAuth(cfg, out);
  if (strategy === 'form') return formAuth(cfg, out);
  if (strategy === 'token') return tokenAuth(cfg, out);
  console.error(`✗ estratégia de auth desconhecida: ${strategy}`);
  process.exit(1);
}

const PUBLIC_AUTH_PATHS = [
  '/login', '/signin', '/sign-in', '/cadastro', '/signup', '/sign-up',
  '/register', '/recuperar-senha', '/redefinir-senha', '/forgot', '/reset',
  '/verificar-email', '/verify',
];

function loginUrl(cfg) {
  const path = cfg.auth?.loginPath || '/login';
  return `${cfg.baseUrl}${path}`;
}

async function waitForLogin(page, cfg, timeoutMs) {
  const extra = cfg.auth?.publicPaths || [];
  const publics = [...PUBLIC_AUTH_PATHS, ...extra];
  await page.waitForURL((url) => {
    const u = url.toString();
    if (u.startsWith('chrome-error://') || u === 'about:blank') return false;
    if (publics.some((p) => u.includes(p))) return false;
    return u.startsWith(cfg.baseUrl);
  }, { timeout: timeoutMs });
}

async function manualAuth(cfg, out) {
  console.log('\n→ abrindo navegador (modo visível).');
  console.log('→ FAÇA LOGIN normalmente (email/senha, captcha, OAuth...).');
  console.log('→ assim que você cair numa página autenticada eu salvo e fecho.\n');

  const browser = await launchBrowser({ headed: true });
  const ctx = await newContext(browser, cfg, { stealth: true });
  const page = await ctx.newPage();
  page.on('framenavigated', (f) => {
    if (f === page.mainFrame()) console.log(`  [nav] ${f.url()}`);
  });

  await page.goto(loginUrl(cfg), { waitUntil: 'domcontentloaded' });
  console.log('  → aguardando login (até 10 min)...');
  try {
    await waitForLogin(page, cfg, 10 * 60_000);
  } catch {
    console.error('\n✗ timeout esperando o login.');
    await browser.close();
    process.exit(1);
  }
  await page.waitForTimeout(2000); // deixa a app hidratar a sessão
  await ctx.storageState({ path: out });
  console.log(`\n✓ sessão salva em ${out}`);
  await browser.close();
}

async function formAuth(cfg, out) {
  const email = cfg.auth?.email;
  const password = cfg.auth?.password;
  if (!email || !password) {
    console.error('✗ estratégia "form" precisa de VIEWSENSE_EMAIL e VIEWSENSE_PASSWORD.');
    process.exit(1);
  }
  const f = cfg.auth?.form || {};
  const headed = !!process.env.VIEWSENSE_HEADED;

  const browser = await launchBrowser({ headed });
  const ctx = await newContext(browser, cfg, { stealth: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`  [pageerror] ${e.message}`));

  console.log(`→ abrindo ${loginUrl(cfg)}`);
  await page.goto(loginUrl(cfg), { waitUntil: 'domcontentloaded' });

  const emailSel = f.emailSelector ||
    'input[type="email"], input[name="email"], input[placeholder*="email" i]';
  const passSel = f.passwordSelector ||
    'input[type="password"], input[name="password"], input[placeholder*="senha" i]';
  const submitSel = f.submitSelector ||
    'button[type="submit"], button:has-text("Entrar"), button:has-text("Login"), button:has-text("Sign in")';

  console.log('→ preenchendo credenciais...');
  await page.locator(emailSel).first().waitFor({ timeout: 10_000 });
  await page.locator(emailSel).first().fill(email);
  await page.locator(passSel).first().fill(password);

  console.log('→ submetendo...');
  await Promise.all([
    waitForLogin(page, cfg, 30_000).catch(() => null),
    page.locator(submitSel).first().click(),
  ]);
  await page.waitForTimeout(2000);

  const url = page.url();
  if (PUBLIC_AUTH_PATHS.some((p) => url.includes(p))) {
    console.error(`\n✗ ainda em página de login (${url}). Credenciais erradas ou captcha?`);
    const err = await page.locator('[role="alert"], .error, [class*="error" i]')
      .first().textContent().catch(() => null);
    if (err) console.error(`  Mensagem na tela: "${err.trim()}"`);
    console.error('  Dica: use a estratégia "manual" se houver captcha.');
    await browser.close();
    process.exit(1);
  }

  await ctx.storageState({ path: out });
  console.log(`\n✓ sessão salva em ${out}`);
  await browser.close();
}

// Injeção genérica de token no localStorage. cfg.auth.token:
//   { key: "nome-da-chave", value: "<json>", fromEnv: "VIEWSENSE_SESSION" }
// O value pode ser uma string JSON literal ou vir de uma env var (fromEnv).
async function tokenAuth(cfg, out) {
  const t = cfg.auth?.token || {};
  const key = t.key;
  let value = t.value;
  if (t.fromEnv && process.env[t.fromEnv]) value = process.env[t.fromEnv];
  if (!key || !value) {
    console.error('✗ estratégia "token" precisa de cfg.auth.token.key e .value (ou .fromEnv).');
    process.exit(1);
  }

  const browser = await launchBrowser({ headed: false });
  const ctx = await newContext(browser, cfg, { stealth: true });
  const page = await ctx.newPage();
  await page.goto(cfg.baseUrl, { waitUntil: 'domcontentloaded' });
  await page.evaluate(({ k, v }) => localStorage.setItem(k, v), { k: key, v: value });

  // valida indo pra uma rota autenticada, se houver
  const authRoute = (cfg.routes || []).find((r) => r.auth);
  if (authRoute) {
    await page.goto(`${cfg.baseUrl}${authRoute.path}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    if (PUBLIC_AUTH_PATHS.some((p) => page.url().includes(p))) {
      console.error('✗ token injetado mas a app redirecionou pro login — token inválido?');
      await browser.close();
      process.exit(1);
    }
  }

  await ctx.storageState({ path: out });
  console.log(`✓ sessão (token) salva em ${out}`);
  await browser.close();
}
