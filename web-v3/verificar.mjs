// Verificación de la v3 en Chromium.
//   npm run web-v3 && node web-v3/verificar.mjs        (CHROME=/ruta/a/chrome si no lo encuentra)
//   CSV_EXTRA=/ruta/a/otro.csv node web-v3/verificar.mjs   prueba además ese CSV de principio a fin (no se guarda nada de él)
// Comprueba: primera vez en castellano e inglés; carga de un CSV con la configuración guiada completa (revisión, estados,
// Context, data check, rol) y que la configuración se guarda con la clave de la v2; recarga sin volver a cargar; Excel
// rechazado con la ayuda del CSV; demo en todas las páginas, roles e idiomas sin errores, sin claves de texto sin traducir,
// sin rayas y sin scroll horizontal (1280 y 390 px); panel lateral de cada tipo con la lista de tareas y su CSV;
// presentación; recomendaciones descartadas y recuperadas; iniciativa creada desde una recomendación; asistente con la
// API simulada: respuesta con cifras del paquete (se enseña), con una cifra inventada (se rechaza) y con error (se avisa);
// la clave solo en sessionStorage; propuestas de IA validadas; los dos exports con fallos.

import { chromium } from 'playwright-core';
import { mkdirSync, existsSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const HTML = 'file://' + join(RAIZ, 'dist', 'EasyPerformance-v3', 'EasyPerformance.html');
const SALIDA = join(RAIZ, 'dist', 'verificacion-v3');
const CHROME = process.env.CHROME || [
  '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].find((r) => existsSync(r));
rmSync(SALIDA, { recursive: true, force: true });
mkdirSync(SALIDA, { recursive: true });

const resultados = [];
const ok = (nombre, bien, detalle = '') => { resultados.push({ nombre, bien: !!bien, detalle }); console.log((bien ? 'OK   ' : 'FALLO') + ' ' + nombre + (detalle ? ' · ' + detalle : '')); };
const navegador = await chromium.launch({ executablePath: CHROME });

async function pagina(ancho, alto, opciones = {}) {
  const ctx = opciones.ctx || await navegador.newContext({ viewport: { width: ancho, height: alto }, locale: opciones.locale || 'es-ES', acceptDownloads: true, reducedMotion: 'reduce' });
  const p = await ctx.newPage();
  p.errores = [];
  p.on('console', (m) => { if (m.type() === 'error') p.errores.push(m.text().split('\n')[0]); });
  p.on('pageerror', (e) => p.errores.push('pageerror: ' + e.message));
  p.on('dialog', (d) => d.accept());
  await p.goto(HTML);
  await p.waitForTimeout(500);
  return p;
}
const A = (p, fn, arg) => p.evaluate(fn, arg);
const quieto = (p) => p.waitForFunction(() => document.getElementById('busy').classList.contains('hidden'), null, { timeout: 90000 });
const clic = async (p, sel) => { await p.click(sel); await p.waitForTimeout(200); await quieto(p); };
const estado = (p) => A(p, () => ({ error: window.EP.S.error ? window.EP.S.error.message : null, faltan: Object.keys(window.__faltan || {}), ancho: document.documentElement.scrollWidth - innerWidth, vista: window.EP.S.view }));
const rayas = (p) => A(p, () => { const t = document.body.innerText; const m = t.match(/.{0,30}[—–].{0,30}/); return m ? m[0] : null; });
const ir = (p, v) => A(p, (v) => window.EP.go(v), v);
const fijarRol = async (p, r) => { await A(p, (r) => document.querySelector(`#role-seg [data-role="${r}"]`).click(), r); await quieto(p); };
const fijarIdioma = async (p, l) => { await A(p, (l) => { const b = document.querySelector(`#lang-seg [data-lang="${l}"]`) || document.querySelector(`.ob-lang [data-lang="${l}"]`); b.click(); }, l); await p.waitForTimeout(200); await quieto(p); };

// ---------- 1. Primera vez ----------
{
  const p = await pagina(1280, 800);
  const txt = await p.textContent('#onboarding');
  ok('primera vez en castellano', /Mide el flujo de tus equipos/.test(txt) && /Ver con datos de ejemplo/.test(txt));
  await fijarIdioma(p, 'en');
  ok('primera vez en inglés', /Measure your teams/.test(await p.textContent('#onboarding')));
  await fijarIdioma(p, 'es');
  await clic(p, '[data-action="ob-go"][data-step="data"]');
  const t2 = await p.textContent('#onboarding');
  ok('paso de datos con la ayuda para conseguir los datos', /Cómo conseguir los datos/.test(t2) && /Excel de Jira/.test(t2));
  // Un fichero que no es ni CSV ni Excel: se dice cuál y no se rompe nada
  await p.setInputFiles('#file-input', { name: 'roto.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from('PK\u0003\u0004nada') });
  await p.waitForTimeout(400); await quieto(p);
  ok('fichero ilegible: aviso con su nombre', /roto\.xlsx/.test(await p.textContent('.toast')) && !(await estado(p)).error);
  // CSV de verdad: configuración guiada completa
  await p.setInputFiles('#file-input', join(RAIZ, 'datos-sinteticos', 'jira-ejemplo-completo-2026-10-12.csv'));
  await p.waitForTimeout(500); await quieto(p);
  ok('revisión tras cargar', /Esto es lo que se ha leído/.test(await p.textContent('#onboarding')));
  await p.screenshot({ path: join(SALIDA, '01-revision.png'), fullPage: true });
  await clic(p, '[data-action="ob-go"][data-step="mapeo"]');
  ok('paso de estados', await p.$$eval('select[data-change="map-estado"]', (x) => x.length) > 0);
  await clic(p, '[data-action="ob-mapeo-ok"]');
  ok('paso Context', /tres preguntas/.test(await p.textContent('#onboarding')));
  // Quitar Predictability: los arrastrados salen de la línea base
  await p.click('input[data-change="ctx-obj"][value="predictability"]', { force: true }); await p.waitForTimeout(200); await quieto(p);
  const kpis = await A(p, () => window.EP.S.vm.kpis);
  ok('Context cambia la línea base', !kpis.includes('arrastradas') && kpis.includes('bugs'), kpis.join(','));
  await clic(p, '[data-action="ob-context-ok"]');
  ok('data check', /aguanta este export/.test(await p.textContent('#onboarding')));
  await p.screenshot({ path: join(SALIDA, '02-datacheck.png'), fullPage: true });
  await clic(p, '[data-action="ob-go"][data-step="rol"], [data-step="rol"]');
  await clic(p, '[data-action="ob-role"][data-role="pmo"]');
  await clic(p, '[data-action="ob-finish"]');
  const e = await estado(p);
  ok('entra en la app con la vista del rol', e.vista === 'calidad' && !e.error, JSON.stringify(e));
  const cfg = await A(p, () => JSON.parse(localStorage.getItem('easyperformance.config.v2') || 'null'));
  ok('configuración guardada con la clave de la v2', cfg && cfg.contexto && cfg.contexto.hecho && cfg.mapeoEstados && !cfg.contexto.objetivos.includes('predictability'));
  ok('un corte guardado', (await A(p, () => window.EP.S.cortes.length)) === 1);
  // Recarga: abre directamente con los ficheros guardados en el navegador
  await p.reload(); await p.waitForTimeout(1500); await quieto(p);
  const e2 = await estado(p);
  ok('recarga sin volver a cargar', await p.isVisible('#app') && !e2.error && (await A(p, () => window.EP.S.cortes.length)) === 1, JSON.stringify(e2));
  ok('sin errores de consola en la primera vez', !p.errores.length, p.errores.slice(0, 3).join(' | '));
  await p.context().close();
}

// ---------- 1b. Importación: Excel, fila de título y columnas elegidas a mano ----------
{
  const HOJAS = join(RAIZ, 'datos-sinteticos', 'hojas');
  for (const n of ['jira-con-titulo.xlsx', 'jira-con-titulo.xls', 'jira-html.xls']) {
    const p = await pagina(1280, 800);
    await p.setInputFiles('#file-input', join(HOJAS, n)); await p.waitForTimeout(500); await quieto(p);
    const r = await A(p, () => ({ tareas: window.EP.S.lectura ? window.EP.S.lectura.tareas.length : 0, paso: window.EP.S.ob.step }));
    ok(`Excel ${n}: se lee entero`, r.tareas === 360 && r.paso === 'revision' && !p.errores.length, JSON.stringify(r) + ' ' + p.errores.slice(0, 2).join(' | '));
    await p.context().close();
  }
  // Títulos que no se reconocen: la página pide elegir las columnas, se guardan y no hay que repetirlo
  const p = await pagina(1280, 800);
  const raro = readFileSync(join(HOJAS, 'referencia.csv'), 'utf8').replace(/^Project,Key,Summary,Issue Type,Status,Created/, 'Proyecto,Ticket,Asunto,Clase,Situación,Alta');
  await p.setInputFiles('#file-input', { name: 'raro.csv', mimeType: 'text/csv', buffer: Buffer.from(raro) }); await p.waitForTimeout(400); await quieto(p);
  ok('columnas que faltan: se piden', await p.isVisible('#form-col') && /Elige las columnas que faltan/.test(await p.textContent('#onboarding')));
  await p.screenshot({ path: join(SALIDA, '05-columnas.png'), fullPage: true });
  await clic(p, '[data-action="col-aplicar"]');
  ok('sin elegir la clave no sigue', await p.isVisible('#form-col') && /Falta elegir/.test(await p.textContent('.toast')));
  await p.selectOption('#form-col select[name="clave"]', 'Ticket'); await p.selectOption('#form-col select[name="creada"]', 'Alta');
  await p.selectOption('#form-col select[name="tipo"]', 'Clase'); await p.selectOption('#form-col select[name="estado"]', 'Situación');
  await clic(p, '[data-action="col-aplicar"]'); await quieto(p);
  const r = await A(p, () => ({ tareas: window.EP.S.lectura ? window.EP.S.lectura.tareas.length : 0, cfg: JSON.parse(localStorage.getItem('easyperformance.config.v2') || '{}').columnas }));
  ok('con las columnas elegidas se lee y se guarda la elección', r.tareas === 360 && r.cfg && r.cfg.clave === 'Ticket', JSON.stringify(r));
  await p.reload(); await p.waitForTimeout(1200); await quieto(p);
  ok('al volver, se lee sin preguntar otra vez', (await A(p, () => window.EP.S.lectura ? window.EP.S.lectura.tareas.length : 0)) === 360 && !(await p.$('#form-col')));
  ok('sin errores de consola en la importación', !p.errores.length, p.errores.slice(0, 3).join(' | '));
  await p.context().close();
}

// ---------- 2. Demo: todas las páginas, roles e idiomas ----------
async function recorrer(p, etiqueta) {
  const fallos = [];
  for (const lang of ['es', 'en']) {
    await fijarIdioma(p, lang);
    for (const rol of ['direccion', 'pmo', 'equipo']) {
      await fijarRol(p, rol);
      const vistas = await A(p, () => [...document.querySelectorAll('#nav button:not(.hidden)')].map((b) => b.dataset.view));
      for (const v of vistas) {
        await ir(p, v); await p.waitForTimeout(120);
        const extra = v === 'fuentes' ? ['ficheros', 'mapeo', 'equipos', 'context'] : v === 'equipos' && rol !== 'equipo' ? ['', '__comparar'] : [''];
        for (const x of extra) {
          if (v === 'fuentes') await A(p, (x) => document.querySelector(`[data-action="fuentes-tab"][data-tab="${x}"]`).click(), x);
          if (x === '__comparar') await A(p, () => document.querySelector('[data-team="__comparar"]').click());
          await p.waitForTimeout(80);
          const e = await estado(p), r = await rayas(p);
          if (e.error || e.ancho > 0 || r) fallos.push(`${lang}/${rol}/${v}${x ? '/' + x : ''}: ${e.error || ''}${e.ancho > 0 ? ' scroll ' + e.ancho : ''}${r ? ' raya «' + r + '»' : ''}`);
        }
      }
    }
  }
  const faltan = (await estado(p)).faltan;
  ok(`demo ${etiqueta}: todas las páginas sin errores ni scroll ni rayas`, !fallos.length, fallos.slice(0, 4).join(' | '));
  ok(`demo ${etiqueta}: sin textos sin traducir`, !faltan.length, faltan.join(', '));
}
{
  const p = await pagina(1280, 800);
  await clic(p, '[data-action="demo"]'); await p.waitForTimeout(500); await quieto(p);
  ok('la demo entra directamente', await p.isVisible('#app') && await p.isVisible('#demo-band'));
  await recorrer(p, '1280');
  await fijarIdioma(p, 'es'); await fijarRol(p, 'pmo');
  // Panel lateral
  await ir(p, 'equipos'); await p.waitForTimeout(150);
  await p.click('.tile[data-kind="medida"]'); await p.waitForTimeout(200);
  const filas = await p.$$eval('#drawer tr', (x) => x.length);
  ok('panel de una medida con su lista de tareas', filas > 2, filas + ' filas');
  const [descarga] = await Promise.all([p.waitForEvent('download'), p.click('[data-action="drill-csv"]')]);
  ok('CSV de la lista de tareas', /\.csv$/.test(descarga.suggestedFilename()));
  await p.keyboard.press('Escape');
  await p.click('details.mas summary'); await p.waitForTimeout(100);
  ok('ficha del equipo: lo que no es baseline va plegado', await p.isVisible('details.mas[open] .fila-dot'));
  for (const [sel, nombre] of [['.fila-dot[data-kind="comprobacion"]', 'comprobación'], ['.rrow[data-kind="caso"]', 'caso'], ['[data-kind="resumen"]', 'resumen redactado'], ['[data-kind="personalizar"]', 'personalizar'], ['[data-kind="ayuda"]', 'ayuda']]) {
    await p.click(sel); await p.waitForTimeout(200);
    const t = (await p.textContent('#drawer')) || '';
    ok('panel: ' + nombre, t.length > 40 && !(await estado(p)).error);
    await p.keyboard.press('Escape'); await p.waitForTimeout(100);
  }
  // Resumen centrado en la baseline: una fila por indicador y equipo, con su barra y su rango
  await ir(p, 'resumen'); await p.waitForTimeout(100);
  const filasBl = await p.$$eval('#page .fb', (x) => x.length), nEq = await A(p, () => window.EP.visibles().length), nK = await A(p, () => window.EP.kit.destacados().length);
  ok('resumen: la baseline de cada equipo', filasBl === nEq * nK && (await p.$$eval('#page .tile', (x) => x.length)) === 0, `${filasBl} filas`);
  ok('el menú dice Baseline', /Baseline/.test(await p.textContent('#nav')) && !/Referencias/.test(await p.textContent('#nav')));
  // Gráficos con el eje desde cero: el punto más bajo nunca toca el techo por ruido
  await ir(p, 'referencias'); await p.waitForTimeout(100);
  ok('página Baseline con un gráfico por indicador', (await p.$$eval('#page svg.grafico', (x) => x.length)) >= nEq * nK);
  // Personalizar: cambia los indicadores destacados del rol
  await ir(p, 'resumen'); await p.click('[data-kind="personalizar"]'); await p.waitForTimeout(150);
  await p.click('input[data-change="pref-tile"][value="ciclo"]'); await p.waitForTimeout(150);
  ok('personalizar quita un indicador', !(await A(p, () => window.EP.kit.destacados().includes('ciclo'))));
  await p.click('[data-action="pref-reset"]'); await p.keyboard.press('Escape');
  // Presentación
  await clic(p, '[data-action="present"]');
  const nDiap = await A(p, () => window.EP.visibles().length + 2);
  for (let i = 0; i < nDiap; i++) { await p.keyboard.press('ArrowRight'); await p.waitForTimeout(60); }
  ok('presentación hasta la última diapositiva', /Por dónde empezar/.test(await p.textContent('#present')) && !(await estado(p)).error);
  await p.screenshot({ path: join(SALIDA, '10-presentacion.png') });
  await p.keyboard.press('Escape');
  // Recomendaciones: descartar, recuperar, crear iniciativa
  await ir(p, 'recomendaciones'); await p.waitForTimeout(150);
  const antes = await p.$$eval('#page > .fichas > .ficha[data-rec]', (x) => x.length);
  await p.click('[data-action="rec-dismiss"]'); await p.waitForTimeout(150);
  const despues = await p.$$eval('#page > .fichas > .ficha[data-rec]', (x) => x.length);
  ok('descartar una recomendación', despues === antes - 1 && await p.$('details.dismissed'));
  await p.click('details.dismissed summary'); await p.click('[data-action="rec-restore"]'); await p.waitForTimeout(150);
  ok('recuperarla', (await p.$$eval('#page > .fichas > .ficha[data-rec]', (x) => x.length)) === antes);
  const nIni = await A(p, () => window.EP.S.vm.iniciativas.length);
  await p.click('[data-action="rec-ini"]'); await p.waitForTimeout(200);
  ok('formulario de iniciativa con la recomendación', await p.$('#form-ini') && (await p.inputValue('#form-ini input[name="nombre"]')).length > 3);
  await clic(p, '[data-action="ini-guardar"]');
  ok('iniciativa creada y medida', (await A(p, () => window.EP.S.vm.iniciativas.length)) === nIni + 1 && /Iniciativa guardada/.test(await p.textContent('.toast')));
  ok('en la demo no se guarda la configuración', !(await A(p, () => localStorage.getItem('easyperformance.config.v2'))));
  await p.screenshot({ path: join(SALIDA, '11-iniciativas.png'), fullPage: true });
  ok('sin errores de consola en la demo', !p.errores.length, p.errores.slice(0, 3).join(' | '));
  await p.context().close();
}
{
  const p = await pagina(390, 844);
  await clic(p, '[data-action="demo"]'); await p.waitForTimeout(300); await quieto(p);
  await recorrer(p, '390 px');
  await p.screenshot({ path: join(SALIDA, '20-movil.png'), fullPage: true });
  await p.context().close();
}

// ---------- 3. Asistente e IA con la API simulada ----------
{
  const p = await pagina(1280, 800);
  await clic(p, '[data-action="demo"]'); await p.waitForTimeout(300); await quieto(p);
  await ir(p, 'resumen');
  await p.click('#assistant-fab'); await p.waitForTimeout(150);
  ok('asistente sin clave no pregunta', await p.isDisabled('#chat-input') && /Sin clave de IA/.test(await p.textContent('#assistant')));
  await p.click('[data-chat="close"]');
  let modo = 'buena', peticiones = 0;
  await p.route('https://api.anthropic.com/**', async (route) => {
    peticiones++;
    const cuerpo = JSON.parse(route.request().postData() || '{}');
    const sistema = cuerpo.system || '';
    let texto = '[]';
    if (/You answer questions/.test(sistema)) {
      const v = await A(p, () => { const e = window.EP.S.vm.paquete.medidas.equipos; const k = Object.keys(e)[0]; return { equipo: k, valor: e[k].entregas.valor }; });
      const coma = String(Math.round(v.valor * 10) / 10).replace('.', ',');
      if (modo === 'buena') texto = JSON.stringify({ respuesta: `${v.equipo} termina ${coma} tareas por semana.`, cifras: [{ equipo: v.equipo, medida: 'entregas', valor: v.valor }] });
      else if (modo === 'inventada') texto = JSON.stringify({ respuesta: `${v.equipo} termina 987 tareas por semana.`, cifras: [{ equipo: v.equipo, medida: 'entregas', valor: 987 }] });
      else { await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { message: 'simulated' } }) }); return; }
    } else if (/recommend/i.test(sistema)) {
      texto = await A(p, () => JSON.stringify(window.Nucleo.IA.recomendacionesDeReferencia(window.EP.S.vm.paquete, window.CATALOGO)));
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: texto }] }) });
  });
  await ir(p, 'ajustes'); await p.fill('#ia-clave', 'sk-ant-prueba'); await clic(p, '[data-action="ia-guardar"]');
  const almac = await A(p, () => ({ sesion: sessionStorage.getItem('easyperformance.v3.ia'), local: JSON.stringify(Object.assign({}, localStorage)) }));
  ok('la clave solo en sessionStorage', almac.sesion === 'sk-ant-prueba' && !almac.local.includes('sk-ant-prueba'));
  await ir(p, 'resumen');
  await p.click('#assistant-fab'); await p.waitForTimeout(100);
  await p.fill('#chat-input', '¿Cómo va el primer equipo?'); await p.click('[data-chat="send"]');
  await p.waitForFunction(() => !window.EP.S.chat.busy);
  ok('respuesta con cifras del paquete se enseña', /cifras comprobadas/.test(await p.textContent('#assistant')) && /termina/.test(await p.textContent('#assistant')));
  modo = 'inventada';
  await p.click('[data-chat="ask"]'); await p.waitForFunction(() => !window.EP.S.chat.busy);
  ok('respuesta con una cifra inventada se rechaza', /no la enseño/.test(await p.textContent('#assistant')) && !/987/.test(await p.textContent('#assistant')));
  modo = 'error';
  await p.fill('#chat-input', 'Otra'); await p.press('#chat-input', 'Enter'); await p.waitForFunction(() => !window.EP.S.chat.busy);
  ok('error de la API se avisa', /no ha respondido/.test(await p.textContent('#assistant')));
  await p.screenshot({ path: join(SALIDA, '30-asistente.png') });
  await p.click('[data-chat="close"]');
  // Propuestas de IA
  await ir(p, 'recomendaciones'); await p.waitForTimeout(100);
  await p.click('[data-action="ia-recs"]'); await p.waitForFunction(() => window.EP.S.iaEstado.recs !== 'trabajando');
  ok('propuestas de IA validadas: las que repiten un caso se unen a él', (await A(p, () => window.EP.S.iaEstado.recs)) === 'hecho' && /La IA coincide/.test(await p.textContent('#page')));
  // Resumen redactado con IA
  modo = 'buena';
  await ir(p, 'resumen'); await p.click('[data-kind="resumen"]'); await p.waitForTimeout(100);
  await p.click('[data-action="ia-resumen"]'); await p.waitForFunction(() => !Object.values(window.EP.S.narrativas).some((n) => n.trabajando));
  ok('resumen redactado con IA comprobado', /Redactado por la IA/.test(await p.textContent('#drawer')));
  ok('sin errores de consola con IA', !p.errores.filter((x) => !/500/.test(x)).length, p.errores.slice(0, 3).join(' | '));
  await p.context().close();
}

// ---------- 4. Exports con fallos y CSV extra ----------
for (const [nombre, ruta] of [['con fallos', join(RAIZ, 'datos-sinteticos', 'fallos', 'jira-con-fallos.csv')], ['aseguradora', join(RAIZ, 'datos-sinteticos', 'aseguradora', 'jira-aseguradora.csv')]].concat(process.env.CSV_EXTRA ? [['CSV_EXTRA', process.env.CSV_EXTRA]] : [])) {
  const p = await pagina(1280, 800);
  await p.setInputFiles('#file-input', ruta); await p.waitForTimeout(500); await quieto(p);
  for (const paso of ['mapeo', 'context']) { await clic(p, `[data-action="ob-go"][data-step="${paso}"], [data-action="ob-mapeo-ok"]`); }
  await clic(p, '[data-action="ob-context-ok"]');
  await clic(p, '[data-step="rol"]'); await clic(p, '[data-action="ob-finish"]');
  const fallos = [];
  for (const v of ['resumen', 'equipos', 'referencias', 'recomendaciones', 'iniciativas', 'cortes', 'fuentes', 'ajustes']) { await ir(p, v); await p.waitForTimeout(100); const e = await estado(p); if (e.error || e.ancho > 0) fallos.push(v + ': ' + (e.error || 'scroll')); }
  await fijarRol(p, 'pmo'); await ir(p, 'calidad'); const e = await estado(p); if (e.error) fallos.push('calidad: ' + e.error);
  const info = await A(p, () => ({ equipos: window.EP.S.vm.equipos.length, veredicto: window.EP.S.vm.dataCheck.veredicto, fiab: window.EP.S.vm.fiabilidad.nivel }));
  ok(`export ${nombre} de principio a fin`, !fallos.length && !p.errores.length, fallos.concat(p.errores).slice(0, 3).join(' | ') || `${info.equipos} equipos · ${info.veredicto} · fiabilidad ${info.fiab}`);
  if (nombre !== 'CSV_EXTRA') await p.screenshot({ path: join(SALIDA, `40-${nombre.replace(/\s+/g, '-')}.png`), fullPage: true });
  await p.context().close();
}

await navegador.close();
writeFileSync(join(SALIDA, 'resultados.json'), JSON.stringify(resultados, null, 1));
const mal = resultados.filter((r) => !r.bien);
console.log(`\n${resultados.length - mal.length}/${resultados.length} comprobaciones bien`);
process.exit(mal.length ? 1 : 0);
