// Gera docs/demo.gif renderizando um "terminal" animado no Chromium do
// Playwright e codificando os frames em GIF (sem ffmpeg).
//
//   node scripts/make-demo.mjs
//
// Dev-only: gifenc e pngjs são instalados com --no-save e não entram no pacote.

import { chromium } from 'playwright';
import gifenc from 'gifenc';
const { GIFEncoder, quantize, applyPalette } = gifenc;
import { PNG } from 'pngjs';
import { mkdirSync, writeFileSync } from 'node:fs';

const W = 760, H = 430, DELAY = 95;

const LINES = [
  { t: '$ npx viewsense snapshot --route /feed', c: 'p' },
  { t: '→ feed  localhost:3000/feed', c: 'a' },
  { t: '✓ .viewsense/snapshot.md  (texto, baixo custo)', c: 'g' },
  { t: '', c: '' },
  { t: '$ npx viewsense shot --device "iPhone 14 Pro"', c: 'p' },
  { t: '→ home  ... ok', c: 'a' },
  { t: '→ feed  ... ok', c: 'a' },
  { t: '✓ .viewsense/screenshots/  (viewport + full)', c: 'g' },
  { t: '', c: '' },
  { t: '$ npx viewsense record --only feed,ranking', c: 'p' },
  { t: '🎬 .viewsense/videos/tour.webm', c: 'm' },
  { t: '', c: '' },
  { t: '👀 seu agente agora VÊ o app rodando.', c: 'y' },
];

const COLORS = { p: '#e6e6e6', a: '#56d4dd', g: '#5bd97a', m: '#d98cff', y: '#f2d65c', '': '#e6e6e6' };

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;padding:0;background:#0d1117}
  #win{width:${W}px;height:${H}px;background:#0d1117;font-family:"Cascadia Code",Consolas,"Courier New",monospace;overflow:hidden}
  #bar{height:34px;background:#161b22;display:flex;align-items:center;padding:0 14px;gap:8px;border-bottom:1px solid #21262d}
  .dot{width:12px;height:12px;border-radius:50%}
  #title{color:#8b949e;font-size:13px;margin-left:10px}
  #t{padding:16px 18px;font-size:15px;line-height:1.55;white-space:pre}
  .ln{display:block}
  #cur{display:inline-block;width:9px;height:17px;background:#56d4dd;vertical-align:-3px}
</style></head><body><div id="win">
  <div id="bar"><div class="dot" style="background:#ff5f56"></div><div class="dot" style="background:#ffbd2e"></div><div class="dot" style="background:#27c93f"></div><div id="title">viewsense demo</div></div>
  <div id="t"></div>
</div>
<script>
  const LINES = ${JSON.stringify(LINES)};
  const COLORS = ${JSON.stringify(COLORS)};
  window.render = (n, cur) => {
    const t = document.getElementById('t');
    let html = '';
    for (let i = 0; i < n && i < LINES.length; i++) {
      const l = LINES[i];
      const last = (i === n - 1);
      const curEl = (last && cur) ? '<span id="cur"></span>' : '';
      html += '<span class="ln" style="color:' + (COLORS[l.c] || '#e6e6e6') + '">' + escapeHtml(l.t) + curEl + '</span>';
    }
    t.innerHTML = html;
  };
  function escapeHtml(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
</script></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'networkidle' });

// Monta a lista de frames: revela linha a linha (2 frames cada, cursor pisca)
// e segura o final por alguns frames.
const frames = [];
for (let n = 1; n <= LINES.length; n++) {
  frames.push({ n, cur: true });
  frames.push({ n, cur: false });
}
for (let k = 0; k < 8; k++) frames.push({ n: LINES.length, cur: k % 2 === 0 });

console.log(`→ capturando ${frames.length} frames...`);
const rgbaFrames = [];
for (const f of frames) {
  await page.evaluate(({ n, cur }) => window.render(n, cur), f);
  const buf = await page.screenshot({ type: 'png' });
  const png = PNG.sync.read(buf);
  rgbaFrames.push({ data: new Uint8Array(png.data), w: png.width, h: png.height });
}
await browser.close();

// Paleta global a partir do frame mais cheio (último).
const fullest = rgbaFrames[rgbaFrames.length - 1];
const palette = quantize(fullest.data, 256);

const gif = GIFEncoder();
rgbaFrames.forEach((fr, i) => {
  const index = applyPalette(fr.data, palette);
  gif.writeFrame(index, fr.w, fr.h, { palette, delay: DELAY, repeat: 0, first: i === 0 });
});
gif.finish();

mkdirSync('docs', { recursive: true });
writeFileSync('docs/demo.gif', gif.bytes());
console.log(`✓ docs/demo.gif (${(gif.bytes().length / 1024).toFixed(0)} KB, ${rgbaFrames.length} frames)`);
