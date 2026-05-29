// Aviso pós-instalação. Não baixamos o browser automaticamente (são ~150MB)
// pra não surpreender quem instala. Mostramos o comando.

// Pula em CI e quando o usuário pediu silêncio.
if (process.env.CI || process.env.VIEWSENSE_NO_POSTINSTALL) process.exit(0);

console.log(`
  ViewSense instalado 👀

  Falta baixar o Chromium do Playwright (uma vez só):

      npx playwright install chromium

  Depois:
      npx viewsense init
      npx viewsense snapshot --route /
`);
