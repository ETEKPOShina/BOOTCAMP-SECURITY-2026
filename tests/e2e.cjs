const { chromium } = require('playwright');
const B = process.env.BASE_URL || 'http://localhost:5173';
const OUT = require('path').join(__dirname, '..', 'docs', 'screenshots');
let fails = 0;
const vis = async (loc) => { try { await loc.waitFor({ state: 'visible', timeout: 4000 }); return true; } catch { return false; } };
const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) fails++; };
async function login(ctx, id, vp) {
  const p = await ctx.newPage();
  if (vp) await p.setViewportSize(vp);
  p.on('pageerror', (e) => { console.log('PAGEERROR', id, e.message); fails++; });
  await p.goto(B + '/login');
  await p.locator('input[autocomplete=username]').fill(id);
  await p.locator('input[type=password]').fill('demo2026');
  await p.getByRole('button', { name: 'Se connecter' }).click();
  await p.waitForTimeout(700);
  return p;
}
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  // reset data
  const r = await ctx.newPage(); await r.goto(B + '/login'); await r.evaluate(() => localStorage.clear()); await r.reload(); await r.close();

  // --- validation & wrong password
  const lp = await ctx.newPage(); await lp.goto(B + '/login');
  await lp.getByRole('button', { name: 'Se connecter' }).click();
  ok(await lp.getByText('Ce champ est obligatoire.').count() === 2, 'login required-field validation');
  await lp.locator('input[autocomplete=username]').fill('tle.direction'); await lp.locator('input[type=password]').fill('x');
  await lp.getByRole('button', { name: 'Se connecter' }).click(); await lp.waitForTimeout(600);
  ok(await lp.getByText('Identifiant ou mot de passe incorrect.').isVisible(), 'wrong password rejected');
  await lp.close();

  // --- agency: create trip
  const ag = await login(ctx, 'tle.direction');
  await ag.goto(B + '/agency/trips/new');
  await ag.getByRole('button', { name: 'Enregistrer le voyage' }).click();
  ok(await ag.getByText('Sélectionnez un bus disponible.').isVisible(), 'trip form validation');
  const busOpts = await ag.locator('#trip-busId option').allTextContents();
  ok(busOpts.some((o) => o.includes('TG 6102 DM') && o.includes('indisponible')), 'expired bus flagged unavailable');
  const drvOpts = await ag.locator('#trip-driverId option').allTextContents();
  ok(drvOpts.some((o) => o.includes('Edem Kpodar') && o.includes('indisponible')), 'expired driver flagged unavailable');
  await ag.locator('#trip-busId').selectOption({ label: 'TG 5530 DM · 60 places' });
  await ag.locator('#trip-driverId').selectOption({ label: 'Yawo Mensah' });
  await ag.getByLabel('Ouidah').check();
  await ag.getByRole('button', { name: 'Enregistrer le voyage' }).click();
  await ag.waitForURL(/\/agency\/trips\/t-/);
  const tripUrl = ag.url(); const tripId = tripUrl.split('/').pop();
  await ag.locator('h1', { hasText: /^WZP-/ }).waitFor();
  const tripRef = (await ag.locator('h1').textContent()).trim();
  ok(/^WZP-\d{6}-LC[A-Z0-9]{3}$/.test(tripRef), 'trip created with reference ' + tripRef);

  // --- register passenger
  await ag.goto(`${B}/agency/trips/${tripId}/register`);
  await ag.getByRole('button', { name: /Continuer/ }).click();
  ok(await ag.getByText('Indiquez le choix du voyageur').first().isVisible(), 'consent required before continuing');
  await ag.getByLabel(/Le voyageur accepte/).check();
  await ag.getByRole('button', { name: /Continuer/ }).click();
  await ag.getByRole('button', { name: /Continuer/ }).click();
  ok(await ag.locator('#reg-lastName-err').isVisible(), 'identity required fields');
  await ag.locator('#reg-lastName').fill('TESTEUR'); await ag.locator('#reg-firstName').fill('Démo');
  await ag.locator('#reg-dateOfBirth').fill('1990-01-01'); await ag.locator('#reg-nationality').selectOption('Togolaise');
  await ag.getByRole('button', { name: /Continuer/ }).click();
  await ag.locator('#reg-documentNumber').fill('DEMO-TEST-0001'); await ag.locator('#reg-documentExpiry').fill('2030-01-01');
  const sims = ag.getByRole('button', { name: 'Capture simulée' });
  await sims.nth(0).click(); await sims.nth(0).click();
  await ag.getByRole('button', { name: /Continuer/ }).click();
  await ag.getByRole('button', { name: 'Capture simulée' }).click();
  await ag.getByRole('button', { name: /Continuer/ }).click();
  await ag.locator('#reg-baggageCount').fill('2');
  await ag.getByLabel('Marchandises commerciales déclarées').fill('Tissus — 1 ballot');
  await ag.getByRole('button', { name: 'Enregistrer le passager', exact: true }).click();
  await ag.waitForURL(/\/agency\/tickets\//, { timeout: 5000 });
  const ticketRef = decodeURIComponent(ag.url().split('/').pop());
  ok(/^TKT-/.test(ticketRef), 'ticket generated ' + ticketRef);
  await ag.locator('img[alt^="QR code du billet"]').waitFor();
  ok(await ag.locator('img[alt^="QR code du billet"]').count() === 1, 'ticket QR rendered');
  ok(await ag.locator('.bag-label').count() === 2, '2 baggage labels');
  await ag.screenshot({ path: OUT + '/e2e_ticket.png', fullPage: true });

  // QR resolves
  const qrp = await ctx.newPage(); // new tab: no session -> login redirect
  await qrp.goto(`${B}/billet/${ticketRef}`); await qrp.waitForTimeout(400);
  ok(qrp.url().includes('/login'), 'QR url requires login');
  await qrp.close();
  await ag.goto(`${B}/billet/${ticketRef}`); await ag.waitForTimeout(400);
  ok(ag.url().includes(`/agency/tickets/${ticketRef}`), 'QR resolves to ticket for agency');

  // provisional manifest + boarding
  await ag.goto(`${B}/agency/trips/${tripId}/manifest`);
  await ag.getByRole('button', { name: 'Préparer la liste provisoire' }).click(); await ag.waitForTimeout(600);
  ok(await ag.getByText('Liste provisoire').first().isVisible(), 'provisional manifest prepared');
  await ag.goto(`${B}/agency/trips/${tripId}/boarding`);
  await ag.getByRole('button', { name: "Ouvrir l'embarquement" }).click(); await ag.waitForTimeout(600);
  await ag.locator('#scan').fill(`${B}/billet/${ticketRef}`); await ag.getByRole('button', { name: "Confirmer l'embarquement" }).click(); await ag.waitForTimeout(600);
  ok(await ag.getByText('Embarqué : TESTEUR Démo').isVisible(), 'boarding by QR url');
  await ag.locator('#scan').fill(ticketRef); await ag.getByRole('button', { name: "Confirmer l'embarquement" }).click(); await ag.waitForTimeout(600);
  ok(await ag.getByText("Ce billet a déjà été utilisé pour l'embarquement.").isVisible(), 'duplicate boarding warning');
  await ag.locator('#scan').fill('TKT-261118-LC02-005'); await ag.getByRole('button', { name: "Confirmer l'embarquement" }).click(); await ag.waitForTimeout(600);
  ok(await ag.getByText('Ce billet correspond à un autre voyage.').isVisible(), 'other-trip ticket rejected');
  await ag.getByRole('button', { name: "Clôturer l'embarquement" }).first().click();
  await ag.getByText("La liste définitive des passagers sera préparée").waitFor();
  await ag.getByRole('dialog').getByRole('button', { name: "Clôturer l'embarquement" }).click(); await ag.waitForTimeout(700);
  ok(await ag.getByText('Embarquement clôturé.').first().isVisible(), 'boarding closed');
  await ag.goto(`${B}/agency/trips/${tripId}/manifest`);
  await ag.getByText('Liste définitive').first().waitFor();
  ok(await ag.getByText('Liste définitive').first().isVisible(), 'final manifest created');
  await ag.getByRole('button', { name: /Transmettre/ }).first().click();
  await ag.waitForTimeout(3500);
  const states = await ag.locator('section.panel').first().locator('tbody tr').allTextContents();
  ok(states.length === 2 && states.every((s) => s.includes('Reçu')), 'both authorities acknowledged (simulated): ' + states.map((s) => s.slice(0, 40)).join(' | '));
  const agHtml = await ag.locator('#root').innerHTML();
  ok(!/Rouge|Signalement nécessitant|liste de démonstration/.test(agHtml), 'agency manifest page has no police status');
  // agency pages never show police status
  for (const p of ['/agency/trips/t-2/passengers', '/agency/passengers/p-9', '/agency/trips/t-2']) {
    await ag.goto(B + p); await ag.locator('h1').waitFor(); await ag.waitForTimeout(300);
    const h = await ag.locator('#root').innerHTML();
    ok(!/badge-solid-red|Rouge —|Signalement nécessitant|Correspondance simulée/.test(h), 'no police data on ' + p);
  }

  // --- police BJ reviews new manifest
  const po = await login(ctx, 'police.bj');
  await po.goto(B + '/police/manifests');
  await po.getByRole('link', { name: new RegExp(tripRef.slice(4)) }).first().click(); await po.waitForTimeout(600);
  ok(await vis(po.getByText('En cours de vérification').first()), 'police opening sets verifying');
  await po.getByRole('button', { name: /TESTEUR Démo/ }).click();
  await po.getByRole('button', { name: 'Confirmer après vérification' }).click(); await po.waitForTimeout(700);
  ok(await vis(po.locator('table .badge', { hasText: 'Confirmé' }).first()), 'police manual review recorded');
  await po.goto(B + '/police/passengers/pt-9');
  ok(await po.getByText('Motif — réservé aux personnels de police habilités').isVisible() === false, 'BJ police cannot see pt-9? (pt-9 reviewed by BJ too)');
  await po.goto(B + '/police/audit'); await po.waitForTimeout(300);
  ok(await vis(po.locator('table').getByText('Révision manuelle enregistrée').first()), 'review in police audit');

  // agency sees processed for BJ
  await ag.goto(`${B}/agency/trips/${tripId}/manifest`); await ag.waitForTimeout(400);
  ok((await ag.locator('section.panel').first().locator('tbody tr').nth(1).textContent()).includes('Traité'), 'agency sees BJ "Traité" ack only');

  // --- driver T2: border arrival
  const dr = await login(ctx, 'chauffeur.adjete', { width: 390, height: 844 });
  await dr.getByRole('button', { name: "Signaler l'arrivée à la frontière" }).click();
  await dr.getByRole('dialog').getByRole('button', { name: 'Confirmer' }).click(); await dr.waitForTimeout(500);
  ok(await dr.getByText('À la frontière').first().isVisible(), 'driver border arrival updates status');

  // --- border TG processes T2 exit
  const bt = await login(ctx, 'poste.sanvee');
  await bt.getByRole('button', { name: 'Identifier un bus' }).first().click();
  await bt.getByLabel('Immatriculation, référence ou QR code').fill('TG 4821 DM');
  await bt.getByRole('dialog').getByRole('button', { name: 'Identifier le voyage' }).click(); await bt.waitForTimeout(500);
  ok(bt.url().endsWith('/border/trips/t-2'), 'bus identified by registration');
  ok(await bt.getByRole('button', { name: /Valider l'entrée — service béninois/ }).isDisabled(), 'entry validation restricted to Benin service');
  ok(await bt.locator('.badge-solid-red').count() >= 1, 'border officer sees status colour');
  ok(!(await bt.locator('#root').innerHTML()).includes('Correspondance simulée'), 'border officer does not see police reason');
  await bt.getByRole('button', { name: 'Enregistrer le comptage' }).click();
  await bt.getByLabel('Nombre de passagers comptés à bord').fill('5');
  await bt.getByRole('dialog').getByRole('button', { name: 'Enregistrer' }).click(); await bt.waitForTimeout(600);
  ok(await vis(bt.getByText('Écart de comptage détecté').first()), 'count discrepancy detected');
  await bt.getByRole('button', { name: 'Confirmer' }).first().click(); await bt.waitForTimeout(500);
  await bt.getByRole('button', { name: 'Contrôle classique' }).first().click(); await bt.waitForTimeout(500);
  await bt.getByRole('button', { name: 'Valider la sortie' }).click();
  await bt.getByRole('dialog').getByRole('button', { name: 'Valider la sortie' }).click(); await bt.waitForTimeout(600);
  ok(await vis(bt.getByText(/Sortie validée à/)), 'exit validated by TG');
  await bt.goto(B + '/border/discrepancies');
  ok(await vis(bt.locator('table').getByText('Écart de comptage').first()), 'discrepancy listed');

  // --- customs BJ
  const cu = await login(ctx, 'douanes.bj');
  await cu.goto(B + '/customs/trips/t-2');
  await cu.locator('h1').waitFor();
  const cuHtml = await cu.locator('#root').innerHTML();
  ok(cuHtml.includes('Cosmétiques') && !/badge-solid|Vert|Rouge|DEMO-TG-100877/.test(cuHtml), 'customs sees goods, no police status, no document numbers');
  await cu.getByRole('button', { name: 'Enregistrer la prise en charge' }).click();
  await cu.getByRole('dialog').getByRole('button', { name: 'Enregistrer' }).click(); await cu.waitForTimeout(600);
  ok(await cu.getByText('Prise en charge douanière enregistrée.').isVisible(), 'customs handling recorded');
  await cu.goto(B + '/police/dashboard'); await cu.waitForTimeout(500);
  ok(cu.url().includes('/customs/dashboard'), 'customs cannot open police workspace');

  // --- driver offline queue
  await dr.goto(B + '/driver/profile');
  await dr.getByLabel(/Simuler l'absence de réseau/).check();
  await dr.goto(B + '/driver/route');
  await dr.getByRole('button', { name: 'Départ du poste frontalier' }).click();
  await dr.getByRole('dialog').getByRole('button', { name: 'Enregistrer' }).click(); await dr.waitForTimeout(400);
  ok(await dr.getByText(/Hors ligne · 1 en attente/).isVisible(), 'offline event queued');
  await dr.goto(B + '/driver/profile');
  await dr.getByLabel(/Simuler l'absence de réseau/).uncheck(); await dr.waitForTimeout(600);
  ok(await dr.getByText('Connecté').isVisible(), 'queue synchronised after reconnect');
  await dr.goto(B + '/driver/home');
  await dr.getByRole('button', { name: "Confirmer l'arrivée" }).click();
  await dr.getByRole('dialog').getByRole('button', { name: 'Confirmer' }).click(); await dr.waitForTimeout(500);
  ok(await dr.getByText('Arrivé à destination').first().isVisible() || await dr.getByText('Aucun voyage assigné').first().isVisible() || await dr.getByText(/Voyage en cours/).isVisible(), 'driver destination arrival');
  await ag.goto(B + '/agency/trips/t-2'); await ag.waitForTimeout(400);
  ok(await ag.getByText('Arrivé à destination').first().isVisible(), 'agency sees completed trip');
  ok(await ag.getByText('Départ du poste frontalier').first().isVisible(), 'synced offline event in agency timeline');

  // --- admin
  const ad = await login(ctx, 'admin.central');
  await ad.goto(B + '/admin/agencies/org-ag-3');
  await ad.getByRole('button', { name: "Accorder l'agrément" }).click();
  await ad.getByRole('dialog').getByRole('button', { name: 'Confirmer' }).click(); await ad.waitForTimeout(600);
  ok(await vis(ad.locator('h1 + .badge, .page-head .badge', { hasText: 'Agréée' }).first()), 'agency approved');
  await ad.goto(B + '/admin/accounts?nouveau=1');
  const dlg = ad.getByRole('dialog');
  await dlg.getByLabel('Nom complet').fill('Agent Test'); await dlg.getByLabel('Identifiant professionnel').fill('cst.guichet');
  await dlg.getByLabel('Adresse e-mail professionnelle').fill('cst@demo.test');
  await dlg.getByLabel('Organisation').selectOption({ label: 'Corridor Sud Transport' });
  await dlg.getByLabel('Rôle').selectOption({ label: 'Agent de guichet' });
  await dlg.getByRole('button', { name: 'Créer le compte' }).click(); await ad.waitForTimeout(800);
  ok(ad.url().includes('/admin/accounts/u-'), 'account created');
  await ad.getByRole('button', { name: 'Suspendre le compte' }).click();
  await ad.getByRole('dialog').getByRole('button', { name: 'Confirmer' }).click(); await ad.waitForTimeout(600);
  ok(await vis(ad.locator('.page-head .badge', { hasText: 'Suspendu' }).first()), 'account suspended');
  await ad.goto(B + '/admin/trips/t-2');
  ok(!(await ad.locator('#root').innerHTML()).includes('DEMO Signalement') && !(await ad.locator('#root').innerHTML()).includes('Correspondance simulée'), 'admin trip view has no passenger identity or police reason');
  await ad.goto(B + '/admin/audit');
  ok(await vis(ad.locator('table').getByText('Prise en charge douanière enregistrée').first()), 'admin audit has cross-org actions');
  ok(!(await ad.locator('#root').innerHTML()).includes('Résultat confirmé'), 'admin audit hides police detail');
  // suspended login
  const sp = await ctx.newPage(); await sp.goto(B + '/login');
  await sp.locator('input[autocomplete=username]').fill('cst.guichet'); await sp.locator('input[type=password]').fill('demo2026');
  await sp.getByRole('button', { name: 'Se connecter' }).click(); await sp.waitForTimeout(600);
  ok(await sp.getByText('Ce compte est suspendu').isVisible(), 'suspended account cannot log in');

  // counter agent cannot open fleet management / stats
  const cnt = await login(ctx, 'tle.guichet');
  await cnt.goto(B + '/agency/statistics');
  ok(await vis(cnt.getByText('Accès non autorisé')), 'counter agent blocked from statistics');
  ok(await cnt.getByRole('link', { name: 'Statistiques' }).count() === 0, 'counter agent nav hides statistics');

  console.log('\nFAILURES:', fails);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
