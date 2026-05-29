// Cria um viewsense.config.json no projeto atual a partir do exemplo.
// Não sobrescreve se já existir (a menos que --force).

import { existsSync, copyFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const TEMPLATE = {
  baseUrl: 'http://localhost:3000',
  outDir: './.viewsense',
  device: null,
  viewport: { width: 1440, height: 900 },
  waitAfterLoad: 1500,
  routes: [
    { name: 'home', path: '/' },
    { name: 'login', path: '/login' }
  ],
  auth: {
    strategy: 'manual',
    storageState: './.viewsense/auth.json',
    loginPath: '/login'
  },
  initScripts: []
};

export async function runInit(flags = {}) {
  const target = resolve(process.cwd(), 'viewsense.config.json');
  if (existsSync(target) && !flags.force) {
    console.error('✗ viewsense.config.json já existe. Use --force pra sobrescrever.');
    process.exit(1);
  }

  // Tenta copiar o example empacotado; senão escreve o template embutido.
  const example = resolve(__dirname, '../../viewsense.config.example.json');
  try {
    if (existsSync(example)) copyFileSync(example, target);
    else writeFileSync(target, JSON.stringify(TEMPLATE, null, 2));
  } catch {
    writeFileSync(target, JSON.stringify(TEMPLATE, null, 2));
  }

  console.log(`✓ criado viewsense.config.json`);
  console.log('  Edite "routes" com as páginas do seu app e rode:');
  console.log('    viewsense snapshot --route /');
}
