// Carrega a config do viewsense mesclando (na ordem de prioridade):
//   1. flags da linha de comando  (--base, --device, --out, ...)
//   2. variáveis de ambiente      (VIEWSENSE_*)
//   3. arquivo de config          (viewsense.config.{json,mjs})
//   4. defaults
//
// Assim o mesmo projeto funciona com um único arquivo versionado e os
// segredos (email/senha) ficam só no ambiente.

import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const DEFAULTS = {
  baseUrl: 'http://localhost:3000',
  outDir: './.viewsense',
  // device: nome de um device do Playwright (ex: "iPhone 14 Pro") ou null p/ desktop.
  device: null,
  viewport: { width: 1440, height: 900 },
  // Espera fixa depois do load (ms) — dá tempo de fontes/animações/lazy-load.
  waitAfterLoad: 1500,
  // Rotas conhecidas do app. name é usado pra nomear arquivos.
  routes: [],
  // JS injetado em toda página antes de carregar (ex: aceitar cookie banner,
  // mascarar navigator.webdriver, setar localStorage). String ou array de strings.
  initScripts: [],
  auth: null,
  // locale/timezone do contexto
  locale: 'pt-BR',
  timezoneId: 'America/Sao_Paulo',
};

const CONFIG_NAMES = [
  'viewsense.config.mjs',
  'viewsense.config.js',
  'viewsense.config.json',
];

async function loadConfigFile(explicitPath) {
  const candidates = explicitPath ? [explicitPath] : CONFIG_NAMES;
  for (const name of candidates) {
    const full = resolve(process.cwd(), name);
    if (!existsSync(full)) continue;
    if (full.endsWith('.json')) {
      return JSON.parse(readFileSync(full, 'utf8'));
    }
    const mod = await import(pathToFileURL(full).href);
    return mod.default ?? mod.config ?? mod;
  }
  return {};
}

function fromEnv() {
  const e = process.env;
  const out = {};
  if (e.VIEWSENSE_BASE_URL) out.baseUrl = e.VIEWSENSE_BASE_URL;
  if (e.VIEWSENSE_OUT) out.outDir = e.VIEWSENSE_OUT;
  if (e.VIEWSENSE_DEVICE) out.device = e.VIEWSENSE_DEVICE;
  if (e.VIEWSENSE_LOCALE) out.locale = e.VIEWSENSE_LOCALE;
  if (e.VIEWSENSE_TZ) out.timezoneId = e.VIEWSENSE_TZ;
  // Credenciais sempre via env — nunca no arquivo versionado.
  const auth = {};
  if (e.VIEWSENSE_EMAIL) auth.email = e.VIEWSENSE_EMAIL;
  if (e.VIEWSENSE_PASSWORD) auth.password = e.VIEWSENSE_PASSWORD;
  if (Object.keys(auth).length) out.auth = auth;
  return out;
}

function deepMerge(base, over) {
  if (over == null) return base;
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const [k, v] of Object.entries(over)) {
    if (v && typeof v === 'object' && !Array.isArray(v) &&
        out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) {
      out[k] = deepMerge(out[k], v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export async function loadConfig(flags = {}) {
  const file = await loadConfigFile(flags.config);
  let cfg = deepMerge(DEFAULTS, file);
  cfg = deepMerge(cfg, fromEnv());

  // Flags da CLI sobrescrevem tudo.
  const flagOver = {};
  if (flags.base) flagOver.baseUrl = flags.base;
  if (flags.out) flagOver.outDir = flags.out;
  if (flags.device !== undefined) flagOver.device = flags.device || null;
  cfg = deepMerge(cfg, flagOver);

  return cfg;
}

// Resolve a lista de rotas a usar a partir das flags.
//   --route /feed,/ranking   → rotas ad-hoc
//   --only feed,ranking      → filtra as rotas nomeadas da config
//   (nada)                   → todas as rotas da config
export function resolveRoutes(cfg, flags = {}) {
  if (flags.route) {
    return flags.route.split(',').map((p) => {
      const path = p.trim();
      const name = path.replace(/^\//, '').replace(/[/?#].*$/, '').replace(/[^\w-]/g, '_') || 'root';
      return { name, path };
    });
  }
  let routes = cfg.routes || [];
  if (flags.only) {
    const want = new Set(flags.only.split(',').map((s) => s.trim()));
    routes = routes.filter((r) => want.has(r.name));
  }
  return routes;
}
