import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('persisted routes, residual certificate, filters and comparison', async ({ page, request }) => {
  const response = await request.get('http://127.0.0.1:8000/api/v1/runs?scenario_id=S05&policy=solver_with_one_replan&provenance=fixture&limit=200');
  const rows = (await response.json()).items;
  let chosen;
  for (const row of rows) {
    const detail = await (await request.get(`http://127.0.0.1:8000/api/v1/runs/${row.id}`)).json();
    if (detail.simulation?.replan_dataset) { chosen = detail; break; }
  }
  expect(chosen).toBeTruthy();
  await page.goto(`/?view=fleet&run=${chosen.id}`);
  await expect(page.getByRole('heading', { name: 'Feuille de route', exact:false })).toBeVisible();
  await page.getByLabel('Version du plan').selectOption('residual');
  await expect(page.getByRole('button',{name:/Commande révélée/}).first()).toBeVisible();
  await expect(page.getByRole('heading', {name:/Certificat indépendant.*suffixe futur/})).toBeVisible();
  await expect(page.locator('.route-map .maplibregl-canvas')).toBeVisible();
  await expect(page.locator('.route-map .stop-marker')).toHaveCount(chosen.simulation.replan_dataset.stops.length);
  await page.screenshot({ path:'screenshots/residual.png', fullPage:true });
  await page.getByRole('button', {name:'Exécutions',exact:true}).click();
  await page.getByLabel('Filtrer par scénario').selectOption('S03');
  const expectedRows=(await (await request.get('http://127.0.0.1:8000/api/v1/runs?scenario_id=S03&limit=200')).json()).items.length;
  await expect(page.locator('.run-table tbody tr')).toHaveCount(expectedRows);
  await page.getByRole('button', {name:'Comparer',exact:true}).first().click();
  await expect(page.getByLabel('Exécution A')).toBeVisible();
  const pair=(await (await request.get('http://127.0.0.1:8000/api/v1/runs?scenario_id=S03&provenance=fixture&status=succeeded&limit=200')).json()).items;
  const a=pair.find(row=>row.policy==='baseline_only'&&row.seed===17);
  const b=pair.find(row=>row.policy==='solver_with_one_replan'&&row.seed===17);
  await page.goto(`/?view=compare&left=${a.id}&right=${b.id}&scenario=S03`);
  await expect(page.locator('.compare-notice')).toBeVisible();
  await expect(page.locator('.comparison-table')).toHaveAttribute('data-left-run',a.id);
  await expect(page.locator('.comparison-table')).toHaveAttribute('data-right-run',b.id);
  await expect(page.locator('.comparison-table tbody tr').first()).toBeVisible();
  await expect(page.getByText('Chargement des deux plans…', {exact:true})).toHaveCount(0);
  await expect(page.locator('.route-map .maplibregl-canvas')).toBeVisible();
  await expect(page.locator('.route-map .stop-marker')).toHaveCount(28);
  await page.screenshot({path:'screenshots/comparison.png',fullPage:true});
});

test('agent replay hides future outputs and individual usage', async ({page,request})=>{
  const rows=(await (await request.get('http://127.0.0.1:8000/api/v1/runs?provenance=fixture&status=succeeded&limit=1')).json()).items;
  await page.goto(`/?view=observatory&run=${rows[0].id}`);
  const slider=page.getByLabel('Position Horloge réelle des agents');
  await expect(slider).toBeVisible();
  await slider.fill('0');
  await expect(page.getByText('État historique des agents',{exact:true})).toBeVisible();
  await expect(page.locator('.inspector .json-output')).toHaveCount(0);
  await expect(page.getByRole('heading',{name:'Coûts, tokens et appels individuels'})).toBeVisible();
  await expect(page.locator('.metering tbody tr').first()).toBeVisible();
  await expect(page.locator('.overall-cost')).toHaveCount(0);
  await page.screenshot({path:'screenshots/early-replay.png',fullPage:true});
});

test('individual failed model attempts are inspectable without fictional tokens',async({page,request})=>{
  const rows=(await (await request.get('http://127.0.0.1:8000/api/v1/runs?provenance=live&status=failed&limit=1')).json()).items;
  test.skip(!rows.length,'No recorded live failure in this environment');
  await page.goto(`/?view=observatory&run=${rows[0].id}`);
  await expect(page.getByText('Cette exécution est terminée sans plan validé.',{exact:false})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Coûts, tokens et appels individuels'})).toBeVisible();
  await page.getByRole('button',{name:'Par modèle',exact:true}).click();
  await expect(page.locator('.metering tbody').first().getByText('gpt-6.1-sol',{exact:true})).toBeVisible();
  await page.locator('.metering').getByRole('button',{name:/Planification · tentative 1/}).click();
  await expect(page.getByText('Erreur du fournisseur',{exact:true})).toBeVisible();
  await page.screenshot({path:'screenshots/failed-metering.png',fullPage:true});
});

test('create fixture through API and preserve modal keyboard focus',async({page})=>{
  await page.goto('/');
  const opener=page.getByRole('button',{name:'Nouvelle exécution',exact:true});
  await opener.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(opener).toBeFocused();
  await opener.click();
  await page.getByRole('button',{name:'Créer l’exécution',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button',{name:'Flotte & tournées',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Tournées de la flotte / Montréal'})).toBeVisible({timeout:15000});
});

test('responsive overview accessibility and rendering',async({page,request})=>{
  const rows=(await (await request.get('http://127.0.0.1:8000/api/v1/runs?provenance=fixture&status=succeeded&scenario_id=S01&limit=1')).json()).items;
  await page.goto(`/?view=overview&run=${rows[0].id}`);
  await expect(page.getByRole('heading',{name:'Vue d’ensemble',exact:true})).toBeVisible();
  await expect(page.locator('.overall-cost .meter-summary')).toBeVisible();
  await expect(page.getByRole('heading',{name:'Tournées de la flotte / Montréal'})).toBeVisible();
  await expect(page.locator('.route-map .maplibregl-canvas')).toBeVisible();
  const results=await new AxeBuilder({page}).analyze();
  expect(results.violations.filter(v=>['critical','serious'].includes(v.impact||''))).toEqual([]);
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'screenshots/mobile.png',fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBeTruthy();
});

test('analytics donuts, model filters and accessible responsive charts',async({page,request})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/?view=analytics');
  await expect(page.getByRole('heading',{name:'Analytique des opérations',exact:true})).toBeVisible();
  await expect(page.locator('.analytics-kpis')).toBeVisible({timeout:15000});
  await expect(page.locator('.overall-cost .meter-summary')).toBeVisible();
  await expect(page.getByRole('img',{name:'Nombre d’exécutions par statut'}).locator('svg')).toBeVisible();
  await expect(page.getByRole('img',{name:'Nombre d’exécutions par statut'}).locator('svg path[d*="A"]').first()).toBeVisible();
  const usage=await (await request.get('http://127.0.0.1:8000/api/v1/usage')).json();
  if(Number(usage.totals.cost_usd)>0){
    await expect(page.getByRole('img',{name:'Part du coût API estimé par agent, en USD'}).locator('svg')).toBeVisible();
    await expect(page.getByRole('img',{name:'Part du coût API estimé par agent, en USD'}).locator('svg path[d*="A"]').first()).toBeVisible();
  }
  await page.screenshot({path:'screenshots/analytics.png',fullPage:true});
  const results=await new AxeBuilder({page}).analyze();
  expect(results.violations.filter(v=>['critical','serious'].includes(v.impact||''))).toEqual([]);
  await page.getByRole('button',{name:'Tokens par rôle',exact:true}).click();
  if(usage.totals.total_tokens!=null){
    await expect(page.getByRole('img',{name:'Tokens d’entrée et de sortie déclarés, empilés par rôle'}).locator('svg')).toBeVisible();
  }else{
    await expect(page.getByText('Aucun token déclaré dans cette cohorte.',{exact:true})).toBeVisible();
  }
  await page.getByRole('button',{name:'Modèles',exact:true}).click();
  if(usage.models.length){
    const model=usage.models[0].model;
    await page.locator('.analytics-primary table').getByRole('button',{name:model,exact:true}).click();
    await expect(page).toHaveURL(new RegExp(`model=${encodeURIComponent(model)}`));
    await expect(page.locator('.analytics-primary tbody tr')).toHaveCount(1);
    await expect(page.locator('.overall-cost .meter-summary')).toBeVisible();
  }
  await page.setViewportSize({width:390,height:844});
  await expect(page.locator('.analytics-kpis')).toBeVisible();
  await page.screenshot({path:'screenshots/analytics-mobile.png',fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBeTruthy();
});

test('Montreal street map and persisted multiple-delivery dispatch',async({page})=>{
  test.skip(process.env.CI==='true','Public OSRM/tiles integration is verified locally; Python CI mocks external providers');
  test.setTimeout(45000);
  await page.goto('/?view=dispatch');
  await expect(page.getByRole('heading',{name:'Livraisons sur l’île de Montréal',exact:true})).toBeVisible();
  await expect(page.locator('.dispatch-map-canvas .maplibregl-canvas')).toBeVisible({timeout:15000});
  await expect.poll(async()=>page.locator('.dispatch-map-canvas').evaluate(element=>{
    const canvas=element.querySelector('canvas');
    return canvas ? Math.abs(canvas.getBoundingClientRect().width-element.getBoundingClientRect().width) : 999;
  })).toBeLessThan(3);
  await page.getByRole('button',{name:'Charger un exemple montréalais',exact:true}).click();
  await expect(page.locator('.dispatch-draft li')).toHaveCount(2);
  await page.getByRole('combobox',{name:'Véhicule',exact:true}).selectOption('van4');
  const creation=page.waitForResponse(response=>response.url().endsWith('/api/v1/dispatch/trips')&&response.request().method()==='POST');
  await page.getByRole('button',{name:'Créer le trajet routier',exact:false}).click();
  const created=await creation;
  expect(created.status()).toBe(201);
  const trip=await created.json();
  expect(trip.deliveries).toHaveLength(2);
  expect(trip.stops.map(stop=>stop.kind)).toEqual(['pickup','dropoff','pickup','dropoff']);
  await expect(page.locator('.dispatch-map-stop')).toHaveCount(4);
  const start=page.waitForResponse(response=>response.url().endsWith(`/dispatch/trips/${trip.id}/start`));
  await page.getByRole('button',{name:'Démarrer la simulation',exact:false}).click();
  expect((await start).status()).toBe(200);
  await expect(page.locator('.dispatch-sim-progress')).toBeVisible();
  await expect(page.locator('.dispatch-map-vehicle')).toBeVisible();
  await page.getByLabel('Chantiers déclarés',{exact:false}).check();
  await page.getByRole('heading',{name:'Livraisons sur l’île de Montréal',exact:true}).click();
  await page.screenshot({path:'screenshots/dispatch.png',fullPage:true});
  const results=await new AxeBuilder({page}).analyze();
  expect(results.violations.filter(v=>['critical','serious'].includes(v.impact||''))).toEqual([]);
  await page.setViewportSize({width:390,height:844});
  await expect.poll(async()=>page.locator('.dispatch-map-canvas').evaluate(element=>{
    const box=element.getBoundingClientRect();
    return [...element.querySelectorAll('.dispatch-map-stop')].every(stop=>{
      const point=stop.getBoundingClientRect();
      return point.left>=box.left&&point.right<=box.right&&point.top>=box.top&&point.bottom<=box.bottom;
    });
  })).toBeTruthy();
  await page.screenshot({path:'screenshots/dispatch-mobile.png',fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBeTruthy();
  const cancel=page.waitForResponse(response=>response.url().endsWith(`/dispatch/trips/${trip.id}/cancel`));
  await page.getByRole('button',{name:'Annuler',exact:false}).click();
  expect((await cancel).status()).toBe(200);
  await expect(page.locator('.dispatch-trip-card.selected .dispatch-status')).toHaveText('Annulé');
});
