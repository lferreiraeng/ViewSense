// Gera docs/demo.gif: uma cena "lado a lado" contando um uso real do ViewSense.
// Esquerda = terminal rodando os comandos. Direita = um celular mostrando o app
// sendo visto/inspecionado (caso: debugar o layout do /feed no mobile).
//
//   node scripts/make-demo.mjs
//
// Dev-only: gifenc e pngjs entram com --no-save e não vão pro pacote.

import { chromium } from 'playwright';
import gifenc from 'gifenc';
const { GIFEncoder, quantize, applyPalette } = gifenc;
import { PNG } from 'pngjs';
import { mkdirSync, writeFileSync } from 'node:fs';

const W = 900, H = 480, DELAY = 110, COLORS_N = 128;
const DEBUG = process.argv.includes('--debug');

// Linhas do terminal (esquerda). c = classe de cor.
const TERM = [
  { t: '$ viewsense snapshot --route /feed', c: 'p' }, // 0
  { t: '→ feed  localhost:3000/feed', c: 'a' },         // 1
  { t: '✓ .viewsense/snapshot.md  (texto)', c: 'g' },   // 2
  { t: '', c: '' },                                     // 3
  { t: '$ viewsense shot --device "iPhone 14 Pro"', c: 'p' }, // 4
  { t: '✓ .viewsense/screenshots/feed.png', c: 'g' },   // 5
  { t: '', c: '' },                                     // 6
  { t: '$ viewsense inspect --selector ".card"', c: 'p' }, // 7
  { t: '✓ display:flex  gap:12px  w:343px', c: 'g' },   // 8
];
const TCOL = { p: '#e6edf3', a: '#56d4dd', g: '#5bd97a', '': '#e6edf3' };

// Sequência: [linhas mostradas, painel, frames de hold]
const SEQ = [
  [0, 'feed', 2],
  [1, 'feed', 2],
  [2, 'feed', 1],
  [3, 'feedChip', 3],
  [5, 'feedChip', 2],
  [6, 'shot', 3],
  [8, 'shot', 2],
  [9, 'inspect', 4],
  [9, 'done', 7],
];

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box}
  html,body{margin:0;padding:0}
  #stage{width:${W}px;height:${H}px;display:flex;background:#0d1117;font-family:"Segoe UI",system-ui,sans-serif}

  /* ---------- TERMINAL (esquerda) ---------- */
  #term{width:404px;height:100%;background:#0d1117;border-right:1px solid #21262d;display:flex;flex-direction:column}
  #bar{height:36px;background:#161b22;display:flex;align-items:center;padding:0 14px;gap:8px;border-bottom:1px solid #21262d;flex:none}
  .dot{width:12px;height:12px;border-radius:50%}
  #ttl{color:#8b949e;font-size:13px;margin-left:8px}
  #lines{padding:18px 16px;font-family:"Cascadia Code",Consolas,monospace;font-size:14px;line-height:1.7;white-space:pre;color:#e6edf3}
  .ln{display:block}
  #cur{display:inline-block;width:8px;height:16px;background:#56d4dd;vertical-align:-3px;margin-left:1px}

  /* ---------- PALCO DIREITO ---------- */
  #right{flex:1;position:relative;background:radial-gradient(120% 120% at 70% 10%, #1b2433 0%, #0d1117 70%);display:flex;align-items:center;justify-content:center}

  /* celular */
  #phone{width:248px;height:430px;background:#0b1220;border:6px solid #1f2937;border-radius:34px;box-shadow:0 22px 50px rgba(0,0,0,.5);overflow:hidden;position:relative}
  #notch{position:absolute;top:8px;left:50%;transform:translateX(-50%);width:90px;height:18px;background:#1f2937;border-radius:0 0 12px 12px;z-index:5}
  #app{position:absolute;inset:0;background:#0f1629;color:#e6edf3;display:flex;flex-direction:column}
  #ahead{height:54px;display:flex;align-items:center;justify-content:space-between;padding:18px 16px 0;font-weight:700;font-size:17px}
  #ahead span{color:#56d4dd}
  #feedwrap{flex:1;padding:10px 12px;display:flex;flex-direction:column;gap:10px;overflow:hidden}
  .card{background:#15203a;border:1px solid #243049;border-radius:14px;padding:12px;display:flex;gap:12px;position:relative}
  .av{width:38px;height:38px;border-radius:50%;flex:none}
  .c1 .av{background:linear-gradient(135deg,#f472b6,#a78bfa)}
  .c2 .av{background:linear-gradient(135deg,#34d399,#22d3ee)}
  .cbody{flex:1;min-width:0}
  .nm{font-size:13px;font-weight:600}
  .tx{font-size:12px;color:#aab4c5;margin-top:3px;line-height:1.35}
  .ft{font-size:12px;color:#56d4dd;margin-top:8px;font-weight:600}
  #nav{height:46px;background:#0b1220;border-top:1px solid #243049;display:flex;align-items:center;justify-content:space-around;font-size:16px;color:#5b6677}
  #nav .on{color:#56d4dd}

  /* chip do snapshot */
  .chip{display:none;position:absolute;top:66px;right:8px;white-space:nowrap;background:#0d1117;border:1px solid #2f3b52;border-radius:10px;padding:7px 11px;font-size:11.5px;color:#e6edf3;box-shadow:0 8px 24px rgba(0,0,0,.5);align-items:center;gap:7px;font-family:"Cascadia Code",monospace}
  .chip b{color:#5bd97a}
  .chip i{color:#8b949e;font-style:normal}

  /* badge do shot */
  .badge{display:none;position:absolute;bottom:30px;right:-6px;background:#0d1117;border:1px solid #2f3b52;border-radius:10px;padding:8px 12px;font-size:12px;color:#e6edf3;box-shadow:0 8px 24px rgba(0,0,0,.5);align-items:center;gap:8px}

  /* inspect: anel + tooltip */
  .c1{transition:none}
  .ring{display:none;position:absolute;inset:-3px;border:2px solid #f2c14e;border-radius:16px;box-shadow:0 0 0 4px rgba(242,193,78,.18)}
  .tip{display:none;position:absolute;left:10px;top:118px;width:182px;background:#1a1f2e;border:1px solid #f2c14e;border-radius:10px;padding:10px 12px;font-family:"Cascadia Code",monospace;font-size:12px;line-height:1.7;color:#e6edf3;white-space:pre;box-shadow:0 12px 32px rgba(0,0,0,.6);z-index:9}
  .tip b{color:#f2c14e}
  .tip::after{content:"";position:absolute;right:-7px;top:22px;width:0;height:0;border-top:7px solid transparent;border-bottom:7px solid transparent;border-left:7px solid #f2c14e}

  /* legenda final */
  #cap{position:absolute;left:0;right:0;bottom:0;padding:16px;background:linear-gradient(0deg,rgba(13,17,23,.96),rgba(13,17,23,0));opacity:0;transition:none}
  #cap .box{background:#56d4dd;color:#06222a;font-weight:700;font-size:15px;border-radius:12px;padding:11px 14px;text-align:center}

  [data-panel="feedChip"] .chip{display:flex}
  [data-panel="shot"] .badge{display:flex}
  [data-panel="inspect"] .c1 .ring, [data-panel="done"] .c1 .ring{display:block}
  [data-panel="inspect"] .tip, [data-panel="done"] .tip{display:block}
  [data-cap="1"] #cap{opacity:1}
</style></head><body>
<div id="stage" data-panel="feed" data-cap="0">
  <div id="term">
    <div id="bar"><div class="dot" style="background:#ff5f56"></div><div class="dot" style="background:#ffbd2e"></div><div class="dot" style="background:#27c93f"></div><div id="ttl">terminal — agente de IA</div></div>
    <div id="lines"></div>
  </div>
  <div id="right">
    <div id="phone">
      <div id="notch"></div>
      <div id="app">
        <div id="ahead">DevFeed <span>👀</span></div>
        <div id="feedwrap">
          <div class="card c1">
            <div class="ring"></div>
            <div class="av"></div>
            <div class="cbody"><div class="nm">Ana Souza</div><div class="tx">Resolvi o bug do layout do feed!</div><div class="ft">▲ 128</div></div>
          </div>
          <div class="card c2">
            <div class="av"></div>
            <div class="cbody"><div class="nm">João Lima</div><div class="tx">Deploy na sexta? 😅</div><div class="ft">▲ 87</div></div>
          </div>
        </div>
        <div id="nav"><span class="on">⌂</span><span>🔍</span><span>＋</span><span>♥</span><span>☰</span></div>
      </div>
      <div class="chip">📄 <span><b>snapshot.md</b> <i>· barato</i></span></div>
      <div class="badge">📸 <span>feed.png salvo</span></div>
    </div>
    <div class="tip"><b>.card</b>\ndisplay: flex\ngap: 12px\nwidth: 343px</div>
    <div id="cap"><div class="box">👀 Seu agente VÊ o app e acerta de primeira.</div></div>
  </div>
</div>
<script>
  const TERM = ${JSON.stringify(TERM)};
  const TCOL = ${JSON.stringify(TCOL)};
  function esc(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
  window.render = (n, panel, cap, cur) => {
    const box = document.getElementById('lines');
    let h = '';
    for (let i = 0; i < n && i < TERM.length; i++) {
      const l = TERM[i], last = (i === n - 1);
      h += '<span class="ln" style="color:' + (TCOL[l.c] || '#e6edf3') + '">' + esc(l.t) + (last && cur ? '<span id="cur"></span>' : '') + '</span>';
    }
    box.innerHTML = h;
    const st = document.getElementById('stage');
    st.setAttribute('data-panel', panel);
    st.setAttribute('data-cap', cap ? '1' : '0');
  };
</script></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'networkidle' });

// Expande a sequência em frames (cursor pisca durante os holds).
const frames = [];
for (const [n, panel, hold] of SEQ) {
  for (let k = 0; k < hold; k++) frames.push({ n, panel, cap: panel === 'done', cur: k % 2 === 0 });
}

console.log(`→ capturando ${frames.length} frames...`);
const rgba = [];
for (const f of frames) {
  await page.evaluate(({ n, panel, cap, cur }) => window.render(n, panel, cap, cur), f);
  const png = PNG.sync.read(await page.screenshot({ type: 'png' }));
  rgba.push({ data: new Uint8Array(png.data), w: png.width, h: png.height });
}

if (DEBUG) {
  for (const name of ['feedChip', 'shot', 'inspect', 'done']) {
    const idx = SEQ.findIndex(s => s[1] === name);
    const [n, panel] = SEQ[idx];
    await page.evaluate(({ n, panel }) => window.render(n, panel, panel === 'done', false), { n, panel });
    await page.screenshot({ path: `docs/_dbg_${name}.png` });
  }
}
await browser.close();

const palette = quantize(rgba[rgba.length - 1].data, COLORS_N);
const gif = GIFEncoder();
rgba.forEach((fr, i) => {
  gif.writeFrame(applyPalette(fr.data, palette), fr.w, fr.h, { palette, delay: DELAY, repeat: 0, first: i === 0 });
});
gif.finish();
mkdirSync('docs', { recursive: true });
writeFileSync('docs/demo.gif', gif.bytes());
console.log(`✓ docs/demo.gif (${(gif.bytes().length / 1024).toFixed(0)} KB, ${rgba.length} frames)`);
