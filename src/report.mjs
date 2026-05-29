// Toda command escreve um pequeno relatório (JSON + Markdown) no outDir.
// É isso que o agente de IA lê primeiro: barato em tokens e diz exatamente
// quais artefatos (prints/vídeos) existem pra ele abrir só o que precisar.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, relative } from 'node:path';

export function ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
}

export function writeReport(outDir, name, data) {
  ensureDir(outDir);
  const jsonPath = `${outDir}/${name}.json`;
  writeFileSync(jsonPath, JSON.stringify(data, null, 2));

  const mdPath = `${outDir}/${name}.md`;
  writeFileSync(mdPath, toMarkdown(name, data));

  return { jsonPath, mdPath };
}

function rel(p) {
  try { return relative(process.cwd(), p).replace(/\\/g, '/'); } catch { return p; }
}

function toMarkdown(name, data) {
  const lines = [`# viewsense — ${name}`, ''];
  lines.push(`> ${new Date().toISOString()}`, '');

  if (data.summary) {
    lines.push(data.summary, '');
  }

  if (Array.isArray(data.items)) {
    for (const item of data.items) {
      lines.push(`## ${item.name || item.path || 'item'}`);
      if (item.url) lines.push(`- URL: ${item.url}`);
      if (item.status) lines.push(`- Status: ${item.status}`);
      if (item.note) lines.push(`- ${item.note}`);
      if (item.screenshot) lines.push(`- 📸 \`${rel(item.screenshot)}\``);
      if (item.fullScreenshot) lines.push(`- 📸 full: \`${rel(item.fullScreenshot)}\``);
      if (item.video) lines.push(`- 🎬 \`${rel(item.video)}\``);
      if (item.metrics) {
        lines.push('- Métricas:');
        for (const [k, v] of Object.entries(item.metrics)) {
          lines.push(`  - ${k}: ${v}`);
        }
      }
      if (item.html) {
        lines.push('', '```html', item.html, '```');
      }
      if (item.text) {
        lines.push('', '```', item.text, '```');
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

export { dirname };
