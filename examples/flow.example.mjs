// Exemplo de "flow" pro comando `viewsense record --flow examples/flow.example.mjs`
//
// Você recebe a `page` do Playwright (já autenticada se houver auth.json),
// o `ctx`, e um objeto de helpers { goto, baseUrl, cfg }.
// Tudo que acontecer aqui é gravado em vídeo.
//
// Doc da API da page: https://playwright.dev/docs/api/class-page

export default async function flow(page, ctx, { goto, baseUrl }) {
  // 1. Vai pro feed
  await goto('/feed');

  // 2. Clica no primeiro card (ajuste o selector pro seu app)
  const card = page.locator('.card, article, [data-testid="post"]').first();
  if (await card.count()) {
    await card.click().catch(() => {});
    await page.waitForTimeout(1500);
  }

  // 3. Rola devagar pra mostrar o conteúdo
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 300) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 150));
    }
  });

  // 4. Volta pro topo
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await page.waitForTimeout(1000);
}
