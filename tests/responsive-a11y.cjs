const { chromium } = require('playwright');
const fs = require('fs');
const axeSrc = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const B = process.env.BASE_URL || 'http://localhost:5173', OUT = require('fs').mkdtempSync(require('os').tmpdir() + '/wzp-');
const pages = {
  'tle.direction': ['/agency/dashboard', '/agency/trips/t-4/register', '/agency/trips/t-4/boarding', '/agency/trips/t-4/manifest', '/agency/fleet/buses', '/agency/tickets/TKT-261118-LC04-015'],
  'police.tg': ['/police/manifests/m-2b', '/police/passengers/pt-9'],
  'poste.hilla': ['/border/trips/t-3', '/border/dashboard'],
  'douanes.bj': ['/customs/trips/t-3'],
  'admin.central': ['/admin/accounts', '/admin/roles', '/admin/statistics'],
  'chauffeur.mensah': ['/driver/home', '/driver/route'],
};
(async () => {
  const browser = await chromium.launch();
  const widths = [320, 390, 768, 1024, 1440, 1920];
  const axeAll = {};
  // login page
  for (const w of widths) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
    const p = await ctx.newPage(); await p.goto(B + '/login'); await p.waitForTimeout(300);
    const of = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (of > 1) console.log('OVERFLOW', w, '/login', of);
    if (w === 390 || w === 1440) await p.screenshot({ path: `${OUT}/resp_login_${w}.png` });
    if (w === 1440) { await p.addScriptTag({ content: axeSrc }); const r = await p.evaluate(async () => (await axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] })).violations.map((v) => `${v.id} (${v.impact}) x${v.nodes.length}: ${v.nodes[0].target}`)); axeAll['/login'] = r; }
    await ctx.close();
  }
  for (const [login, paths] of Object.entries(pages)) {
    for (const w of widths) {
      const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
      const p = await ctx.newPage();
      await p.goto(B + '/login');
      await p.locator('input[autocomplete=username]').fill(login); await p.locator('input[type=password]').fill('demo2026');
      await p.getByRole('button', { name: 'Se connecter' }).click(); await p.waitForTimeout(600);
      for (const path of paths) {
        await p.goto(B + path); await p.waitForTimeout(450);
        const of = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        const clipped = await p.evaluate(() => [...document.querySelectorAll('button, a.btn')].filter((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && (r.right > window.innerWidth + 1); }).length);
        if (of > 1 || clipped) console.log('ISSUE', w, path, 'overflow', of, 'offscreen-buttons', clipped);
        if ([320, 768, 1920].includes(w)) await p.screenshot({ path: `${OUT}/resp_${w}${path.replace(/[^a-z0-9]+/gi, '_')}.png`, fullPage: true });
        if (w === 1440 && !axeAll[path]) {
          await p.addScriptTag({ content: axeSrc });
          axeAll[path] = await p.evaluate(async () => (await axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] })).violations.map((v) => `${v.id} (${v.impact}) x${v.nodes.length}: ${v.nodes[0].target} — ${v.nodes[0].failureSummary?.split('\n')[1] ?? ''}`));
        }
      }
      await ctx.close();
    }
  }
  console.log('AXE');
  for (const [k, v] of Object.entries(axeAll)) console.log(k, v.length ? '\n  ' + v.join('\n  ') : 'OK');
  await browser.close();
})();
