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
  ok('primera vez: tres pasos y la carga en la misma pantalla', (await p.$$eval('.ob-steps span', (x) => x.length)) === 3 && !!(await p.$('#onboarding .drop[data-action="import"]')));
  const alto = async () => A(p, () => Math.round(document.querySelector('#onboarding .ob-brand').getBoundingClientRect().top + scrollY));
  const altos = [await alto()];
  await clic(p, '[data-action="ob-abrir"][data-que="ayuda"]');
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
  ok('revisión: el veredicto del data check va arriba', /analizar/.test(await p.textContent('#onboarding [data-tipo="veredicto"]')));
  altos.push(await alto());
  await p.screenshot({ path: join(SALIDA, '01-revision.png'), fullPage: true });
  await clic(p, '[data-action="ob-abrir"][data-que="estados"]');
  ok('revisión: la tabla de estados, a un clic', await p.$$eval('#ob-estados select[data-change="map-estado"]', (x) => x.length) > 0);
  await p.screenshot({ path: join(SALIDA, '02-revision-estados.png'), fullPage: true });
  await clic(p, '[data-action="ob-rev-ok"]');
  ok('paso Qué mirar', /Qué quieres mirar primero/.test(await p.textContent('#onboarding')));
  altos.push(await alto());
  ok('la cabecera no salta entre pasos', Math.max(...altos) - Math.min(...altos) <= 1, altos.join(','));
  // Quitar Predictability: los arrastrados salen de la línea base
  await p.click('input[data-change="ctx-obj"][value="predictability"]', { force: true }); await p.waitForTimeout(200); await quieto(p);
  const kpis = await A(p, () => window.EP.S.vm.kpis);
  ok('Context cambia la línea base', !kpis.includes('arrastradas') && kpis.includes('bugs'), kpis.join(','));
  await p.screenshot({ path: join(SALIDA, '03-que-mirar.png'), fullPage: true });
  await clic(p, '[data-action="ob-role"][data-role="pmo"]');
  await clic(p, '[data-action="ob-finish"]');
  const e = await estado(p);
  ok('entra en la app con la vista del rol', e.vista === 'calidad' && !e.error, JSON.stringify(e));
  const cfg = await A(p, () => JSON.parse(localStorage.getItem(window.EP.CLAVES.cfg) || 'null'));
  ok('configuración guardada (en el espacio de esta carpeta)', cfg && cfg.contexto && cfg.contexto.hecho && cfg.mapeoEstados && !cfg.contexto.objetivos.includes('predictability'));
  ok('un corte guardado', (await A(p, () => window.EP.S.cortes.length)) === 1);
  // Proveedores marcados después del onboarding: la comparación se activa sin volver a contestar el Context
  const prov = await A(p, () => { const S = window.EP.S, P = window.EP.P, antes = P.contexto(S.cfg, S.det).proveedores; const eq = S.vm.equipos[0].nombre; S.cfg.equiposInfo = Object.assign({}, S.cfg.equiposInfo, { [eq]: { tipo: 'proveedor' } }); const despues = P.contexto(S.cfg, S.det).proveedores; delete S.cfg.equiposInfo[eq]; return { antes, despues, guardado: JSON.parse(localStorage.getItem(window.EP.CLAVES.cfg)).contexto.proveedores }; });
  ok('proveedores marcados después: se activa la comparación y no se guarda un sí que nadie ha dicho', prov.antes === false && prov.despues === true && prov.guardado === false, JSON.stringify(prov));
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
  const r = await A(p, () => ({ tareas: window.EP.S.lectura ? window.EP.S.lectura.tareas.length : 0, cfg: JSON.parse(localStorage.getItem(window.EP.CLAVES.cfg) || '{}').columnas }));
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
        const extra = v === 'fuentes' ? ['ficheros', 'mapeo', 'tipos', 'equipos', 'context', 'acuerdos'] : v === 'equipos' && rol !== 'equipo' ? ['', '__comparar'] : [''];
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
  ok('en la demo no se guarda la configuración', !(await A(p, () => localStorage.getItem(window.EP.CLAVES.cfg) || localStorage.getItem('easyperformance.config.v2'))));
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
  await clic(p, '[data-action="ob-rev-ok"]'); await clic(p, '[data-action="ob-finish"]');
  const fallos = [];
  for (const v of ['resumen', 'equipos', 'referencias', 'recomendaciones', 'iniciativas', 'cortes', 'fuentes', 'ajustes']) { await ir(p, v); await p.waitForTimeout(100); const e = await estado(p); if (e.error || e.ancho > 0) fallos.push(v + ': ' + (e.error || 'scroll')); }
  await fijarRol(p, 'pmo'); await ir(p, 'calidad'); const e = await estado(p); if (e.error) fallos.push('calidad: ' + e.error);
  const info = await A(p, () => ({ equipos: window.EP.S.vm.equipos.length, veredicto: window.EP.S.vm.dataCheck.veredicto, fiab: window.EP.S.vm.fiabilidad.nivel }));
  ok(`export ${nombre} de principio a fin`, !fallos.length && !p.errores.length, fallos.concat(p.errores).slice(0, 3).join(' | ') || `${info.equipos} equipos · ${info.veredicto} · fiabilidad ${info.fiab}`);
  if (nombre !== 'CSV_EXTRA') await p.screenshot({ path: join(SALIDA, `40-${nombre.replace(/\s+/g, '-')}.png`), fullPage: true });
  if (nombre === 'con fallos') {
    // Seguir en el arranque no confirma los estados dudosos: siguen por revisar hasta que alguien los mira uno a uno
    const dudoso = 'Pre-production window';
    const antes = await A(p, (d) => ({ guardado: (window.EP.S.cfg.mapeoEstados || {})[d] != null, revisar: window.EP.P.porRevisar(window.EP.S.cfg, window.EP.S.vm.det).map((e) => e.nombre) }), dudoso);
    ok('seguir en el arranque no confirma los estados dudosos', !antes.guardado && antes.revisar.includes(dudoso), JSON.stringify(antes));
    // La misma cifra de por revisar en el arranque, la tarjeta de Calidad, la comprobación de fiabilidad y el documento
    const cuadra = () => A(p, (d) => {
      const S = window.EP.S, comp = S.vm.fiabilidad.comprobaciones.filter((x) => x.id === 'estados')[0];
      const cfgC = window.EP.P.cfgCalculo(S.cfg, S.det);
      const doc = window.Nucleo.aMarkdown(window.Nucleo.definiciones(window.EP.P.lecturaCalculo(S.lectura, S.cfg), window.EP.P.clienteDe(S.cfg, S.det), { config: cfgC, det: S.det, modelo: S.r.modelo, generado: new Date() }));
      return { revisar: window.EP.P.porRevisar(S.cfg, S.vm.det).length, comp: comp.estado, enComp: comp.detalle.includes(d), enDoc: doc.includes(d) && /(Por confirmar|To confirm)/.test(doc) };
    }, dudoso);
    const c1 = await cuadra();
    ok('por revisar cuadra entre arranque, Calidad del dato y documento', c1.revisar === 1 && c1.comp === 'revisar' && c1.enComp && c1.enDoc, JSON.stringify(c1));
    await ir(p, 'fuentes'); await A(p, () => document.querySelector('[data-action="fuentes-tab"][data-tab="mapeo"]').click()); await quieto(p);
    ok('sin botón de confirmar todos', !(await p.$('[data-action="map-confirmar"]')));
    await clic(p, `[data-action="map-uno"][data-estado="${dudoso}"]`);
    const despues = await A(p, (d) => ({ guardado: (window.EP.S.cfg.mapeoEstados || {})[d], revisar: window.EP.P.porRevisar(window.EP.S.cfg, window.EP.S.vm.det).length }), dudoso);
    ok('"Es correcto" confirma solo ese estado', despues.guardado === 'en_curso' && despues.revisar === antes.revisar.length - 1, JSON.stringify(despues));
    const c2 = await cuadra();
    ok('tras confirmarlo, Calidad del dato ya no lo cuenta', c2.revisar === 0 && c2.comp === 'bien' && !c2.enComp, JSON.stringify(c2));
    await p.screenshot({ path: join(SALIDA, '41-mapeo-confirmado.png'), fullPage: true });
    // Tipos: pasar Task a bug sube los bugs del cálculo; la estimación se puede quitar y volver a la automática
    await A(p, () => document.querySelector('[data-action="fuentes-tab"][data-tab="tipos"]').click()); await quieto(p);
    const bugs = () => A(p, () => window.EP.P.lecturaCalculo(window.EP.S.lectura, window.EP.S.cfg).tareas.filter((x) => x.tipo === 'error').length);
    const b0 = await bugs();
    await p.selectOption('select[data-change="tipo-origen"][data-tipo="Task"]', 'error'); await p.waitForTimeout(200); await quieto(p);
    const b1 = await bugs(), guardado = await A(p, () => (window.EP.S.cfg.mapeoTipos || {}).Task);
    ok('un tipo cambiado a bug cuenta como bug', b1 > b0 && guardado === 'error', `${b0} -> ${b1}`);
    await p.screenshot({ path: join(SALIDA, '42-tipos.png'), fullPage: true });
    const est = () => A(p, () => window.EP.S.lectura.tareas.filter((x) => x.estimacion != null).length);
    const e0 = await est();
    await p.selectOption('select[data-change="tipo-estimacion"]', ''); await p.waitForTimeout(300); await quieto(p);
    const e1 = await est();
    await p.selectOption('select[data-change="tipo-estimacion"]', '__auto'); await p.waitForTimeout(300); await quieto(p);
    const e2 = await est();
    ok('campo de estimación: ninguno y otra vez automático', e0 > 0 && e1 === 0 && e2 === e0 && !p.errores.length, `${e0} -> ${e1} -> ${e2}`);
    // Reparto por un campo del export: sale en la ficha de cada equipo
    await A(p, () => document.querySelector('[data-action="fuentes-tab"][data-tab="tipos"]').click()); await quieto(p);
    await p.selectOption('select[data-change="tipo-reparto"]', 'Issue Type'); await p.waitForTimeout(300); await quieto(p);
    const rep = await A(p, () => { const e = window.EP.S.vm.equipos[0]; return e.reparto ? { campo: e.reparto.campo, suma: e.reparto.filas.reduce((s, x) => s + x.parte, 0), n: e.reparto.filas.length } : null; });
    ok('reparto por un campo elegido: suma el 100 % en la ficha de equipo', rep && rep.campo === 'Issue Type' && Math.abs(rep.suma - 1) < 1e-9 && !p.errores.length, JSON.stringify(rep));
  }
  await p.context().close();
}

// ---------- 5. Configuraciones guardadas antes: etapas de la v0 y mapeo de antes de este cambio ----------
{
  const ruta = join(RAIZ, 'datos-sinteticos', 'fallos', 'jira-con-fallos.csv'), dudoso = 'Pre-production window';
  const conCfg = async (cfg) => {
    const ctx = await navegador.newContext({ viewport: { width: 1280, height: 800 }, locale: 'es-ES', reducedMotion: 'reduce' });
    await ctx.addInitScript((c) => { try { if (!sessionStorage.getItem('__cfg')) { localStorage.setItem('easyperformance.config.v2', JSON.stringify(c)); sessionStorage.setItem('__cfg', '1'); } } catch (e) {} }, cfg);
    const p = await pagina(1280, 800, { ctx });
    await p.setInputFiles('#file-input', ruta); await p.waitForTimeout(500); await quieto(p);
    return p;
  };
  const estadoDe = (p) => A(p, (d) => ({ valor: window.EP.S.vm.mapeo[d], revisar: window.EP.P.porRevisar(window.EP.S.cfg, window.EP.S.vm.det).map((e) => e.nombre), cfg: window.EP.S.cfg }), dudoso);
  // Etapas de la v0: el estado revisado entonces como hecho sigue terminado, también después de seguir en el arranque
  let p = await conCfg({ etapas: { [dudoso]: 'hecho' } });
  const e0 = await estadoDe(p);
  await clic(p, '[data-action="ob-rev-ok"]');
  const e1 = await estadoDe(p);
  ok('etapas de la v0: se respetan y cuentan como revisadas', e0.valor === 'terminado' && !e0.revisar.includes(dudoso) && e1.valor === 'terminado' && !e1.revisar.includes(dudoso), JSON.stringify({ antes: e0.valor, despues: e1.valor, revisar: e1.revisar }));
  await p.context().close();
  // Mapeo de antes: un dudoso guardado igual que la propuesta vuelve a por revisar; uno cambiado a mano se respeta
  p = await conCfg({ mapeoEstados: { 'To Do': 'pendiente', 'In Progress': 'en_curso', [dudoso]: 'en_curso', 'In Review': 'en_revision', 'Blocked': 'bloqueado', 'Done': 'terminado' } });
  const m1 = await estadoDe(p);
  await p.context().close();
  p = await conCfg({ mapeoEstados: { [dudoso]: 'en_espera' } });
  const m2 = await estadoDe(p);
  await p.context().close();
  ok('mapeo de antes: los dudosos sin tocar vuelven a por revisar, los cambiados se respetan',
    m1.revisar.includes(dudoso) && m1.cfg.mapeoRevision === 2 && m2.valor === 'en_espera' && !m2.revisar.includes(dudoso), JSON.stringify({ m1: m1.revisar, m2: [m2.valor, m2.revisar] }));
}

// ---------- 6. Propuesta de estados con IA: repetirla no la borra y una respuesta vacía no toca nada ----------
{
  const p = await pagina(1280, 800);
  await p.setInputFiles('#file-input', join(RAIZ, 'datos-sinteticos', 'fallos', 'jira-con-fallos.csv')); await p.waitForTimeout(500); await quieto(p);
  await clic(p, '[data-action="ob-rev-ok"]'); await clic(p, '[data-action="ob-finish"]');
  // Sin confirmar nada: In Review no está confirmado en esta prueba
  await A(p, () => { delete window.EP.S.cfg.mapeoEstados; });
  let respuesta = JSON.stringify({ 'In Review': 'en_pruebas' });
  await p.route('https://api.anthropic.com/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: respuesta }] }) }));
  await fijarRol(p, 'pmo');
  await ir(p, 'ajustes'); await p.fill('#ia-clave', 'sk-ant-prueba'); await clic(p, '[data-action="ia-guardar"]');
  await ir(p, 'fuentes'); await A(p, () => document.querySelector('[data-action="fuentes-tab"][data-tab="mapeo"]').click()); await quieto(p);
  const pedir = async () => { await p.click('[data-action="ia-mapeo"]'); await p.waitForFunction(() => window.EP.S.iaEstado.mapeo !== 'trabajando'); await p.waitForTimeout(200); await quieto(p); };
  const leer = () => A(p, () => ({ ia: window.EP.S.cfg.mapeoIA || {}, valor: window.EP.S.vm.mapeo['In Review'], revisar: window.EP.P.porRevisar(window.EP.S.cfg, window.EP.S.vm.det).map((e) => e.nombre), aviso: window.EP.S.iaMapeoAviso }));
  await pedir(); const i1 = await leer();
  await pedir(); const i2 = await leer();
  respuesta = 'esto no es JSON';
  await pedir(); const i3 = await leer();
  ok('IA: la propuesta queda por revisar y repetirla no la borra', i1.ia['In Review'] === 'en_pruebas' && i1.revisar.includes('In Review') && i2.ia['In Review'] === 'en_pruebas' && i2.valor === 'en_pruebas' && i2.revisar.includes('In Review'), JSON.stringify([i1, i2]));
  ok('IA: una respuesta sin nada válido mantiene la propuesta anterior', i3.ia['In Review'] === 'en_pruebas' && /(ninguna propuesta|no valid)/.test(i3.aviso || ''), JSON.stringify(i3));
  await p.context().close();
}

// ---------- 7. Mejoras de dirección: preguntas, previsión, épicas, decisión de cada medida, acuerdos y valor congelado ----------
{
  const p = await pagina(1280, 800);
  await clic(p, '[data-action="demo"]'); await p.waitForTimeout(300); await quieto(p);
  await fijarIdioma(p, 'es'); await fijarRol(p, 'direccion'); await ir(p, 'resumen'); await quieto(p);
  const preg = await A(p, () => ({ hay: /Preguntas de dirección/.test(document.getElementById('page').textContent), objetivos: window.EP.P.contexto(window.EP.S.cfg, window.EP.S.det).objetivos.length }));
  ok('Resumen: preguntas de dirección, una por objetivo del Context', preg.hay, JSON.stringify(preg));
  await p.screenshot({ path: join(SALIDA, '50-preguntas.png'), fullPage: true });
  // Previsión en la ficha de equipo, con la pregunta de cuántas tareas
  const equipo = await A(p, () => window.EP.S.vm.equipos[0].nombre);
  await A(p, (n) => window.EP.openTeam(n), equipo); await quieto(p);
  const pv = await A(p, () => window.EP.S.vm.equipos[0].prevision);
  ok('previsión del equipo: al menos y lo normal en 4 semanas', pv && pv.cuatro.p85 <= pv.cuatro.p50 && /Previsión/.test(await A(p, () => document.getElementById('page').textContent)), JSON.stringify(pv && pv.cuatro));
  await p.fill('input[data-change="prev-n"]', '25'); await p.press('input[data-change="prev-n"]', 'Enter'); await p.waitForTimeout(200);
  await A(p, () => document.querySelector('input[data-change="prev-n"]').dispatchEvent(new Event('change', { bubbles: true }))); await p.waitForTimeout(200); await quieto(p);
  const resp = await A(p, () => document.querySelector('.prev-q span.small') ? document.querySelector('.prev-q span.small').textContent : '');
  ok('previsión: ¿cuándo terminamos 25 tareas? responde con semanas y fecha', /semana/.test(resp) && /hacia el/.test(resp), resp);
  await p.screenshot({ path: join(SALIDA, '51-prevision.png'), fullPage: true });
  // Épicas
  await ir(p, 'epicas'); await quieto(p);
  const ep = await A(p, () => ({ filas: document.querySelectorAll('#page table tr').length, v: window.EP.S.vm.epicas.epicas.length, error: window.EP.S.error ? window.EP.S.error.message : null }));
  ok('Épicas: tabla con avance, ritmo y previsión', ep.v > 0 && ep.filas > 1 && !ep.error, JSON.stringify(ep));
  await p.screenshot({ path: join(SALIDA, '52-epicas.png'), fullPage: true });
  // Panel de una medida: qué decisión dispara y quién la toma
  await A(p, (n) => window.EP.openDrill({ kind: 'medida', team: n, medida: 'entregas' }), equipo); await p.waitForTimeout(200);
  const caj = await A(p, () => document.body.innerText);
  ok('panel de una medida: decisión que dispara y quién la toma', /Qué decisión dispara/.test(caj) && /Quién la toma/.test(caj));
  await A(p, () => window.EP.openDrill(null)); await p.waitForTimeout(100);
  // Acuerdos
  await fijarRol(p, 'pmo'); await ir(p, 'fuentes'); await A(p, () => document.querySelector('[data-action="fuentes-tab"][data-tab="acuerdos"]').click()); await quieto(p);
  const acu = await A(p, () => document.querySelectorAll('#page .ficha.list .rrow').length);
  const [descarga] = await Promise.all([p.waitForEvent('download'), p.click('[data-action="acu-descargar"]')]);
  ok('Acuerdos: diez acuerdos y se descargan', acu === 10 && /acuerdos-easyperformance\.md$/.test(descarga.suggestedFilename()), `${acu} · ${descarga.suggestedFilename()}`);
  await p.screenshot({ path: join(SALIDA, '53-acuerdos.png'), fullPage: true });
  // Cortes: valor oficial congelado
  await ir(p, 'cortes'); await quieto(p);
  ok('Cortes: cada corte dice que sus cifras son el valor oficial congelado', /valor oficial de este corte/.test(await A(p, () => document.getElementById('page').textContent)));
  // Acuerdos: el periodo acaba el domingo (como el documento de definiciones) y con un solo equipo no dice "0 equipos"
  await fijarRol(p, 'pmo'); await ir(p, 'fuentes'); await A(p, () => document.querySelector('[data-action="fuentes-tab"][data-tab="acuerdos"]').click()); await quieto(p);
  const per = await A(p, () => { const S = window.EP.S, f = window.EP.fecha(new Date(new Date(S.vm.semanaFin).getTime() - 864e5)); return { f, ok: document.getElementById('page').textContent.includes('acaba el ' + f) }; });
  ok('Acuerdos: el periodo acaba el último día de la semana cerrada', per.ok, JSON.stringify(per));
  await A(p, () => { window.EP.S.cfg.campoEquipo = 'todos'; window.EP.recalcular(); window.EP.render(); }); await quieto(p);
  const uno = await A(p, () => document.getElementById('page').textContent);
  ok('Acuerdos: con todo el trabajo como un equipo no dice "0 equipos"', /un solo equipo/.test(uno) && !/0 equipos/.test(uno));
  await A(p, () => { delete window.EP.S.cfg.campoEquipo; window.EP.recalcular(); window.EP.render(); }); await quieto(p);
  // Reparto también en la demo
  await A(p, () => document.querySelector('[data-action="fuentes-tab"][data-tab="tipos"]').click()); await quieto(p);
  await p.selectOption('select[data-change="tipo-reparto"]', 'Issue Type'); await p.waitForTimeout(300); await quieto(p);
  const repDemo = await A(p, () => { const r = window.EP.S.vm.equipos[0].reparto; return r ? r.filas.map((x) => x.valor) : null; });
  ok('reparto en la demo: valores reales, no todo "sin valor"', repDemo && repDemo.length > 1 && repDemo.every((v) => v), JSON.stringify(repDemo));
  // Misma pregunta, misma respuesta: N igual a lo que hay en curso
  await A(p, (n) => window.EP.openTeam(n), equipo); await quieto(p);
  const enCurso = await A(p, () => { const pv = window.EP.S.vm.equipos[0].prevision; return pv && pv.cuandoEnCurso ? { n: pv.enCurso, w: pv.cuandoEnCurso.p85 } : null; });
  if (enCurso) {
    await A(p, (n) => { window.EP.S.prevN = { [window.EP.S.vm.equipos[0].nombre]: n }; window.EP.render(); }, enCurso.n); await quieto(p);
    const txt = await A(p, () => document.querySelector('.prev-q span.small').textContent);
    ok('previsión: la misma pregunta da la misma respuesta en la ficha', new RegExp('en ' + enCurso.w + ' semana').test(txt), `${JSON.stringify(enCurso)} · ${txt}`);
  }
  // Pregunta de coste: con coste y FTE el Resumen la responde con cifras, no "Sin datos"
  await A(p, () => { const S = window.EP.S; S.cfg.contexto = Object.assign({}, window.EP.P.contexto(S.cfg, S.det), { objetivos: ['speed', 'quality', 'predictability', 'cost'], hecho: true }); S.vm.equipos.forEach((e) => { S.cfg.fte = S.cfg.fte || {}; S.cfg.fte[e.nombre] = S.cfg.fte[e.nombre] || 5; S.cfg.coste = S.cfg.coste || {}; S.cfg.coste[e.nombre] = 6000; }); window.EP.recalcular(); }); 
  await fijarRol(p, 'direccion'); await ir(p, 'resumen'); await quieto(p);
  const coste = await A(p, () => { const hay = window.EP.S.vm.equipos.some((e) => e.medidas.coste && e.medidas.coste.disponible); const fichas = [...document.querySelectorAll('.ficha[data-tipo="pregunta"]')].map((f) => f.textContent); const c = fichas.find((x) => /cuesta cada entrega/.test(x)); return { hay, c: c ? c.slice(0, 120) : null }; });
  ok('pregunta de coste: responde cuando hay coste', coste.hay && coste.c && !/Sin datos/.test(coste.c), JSON.stringify(coste));
  ok('sin errores de consola en las mejoras de dirección', !p.errores.length, p.errores.slice(0, 3).join(' | '));
  await p.context().close();
}

// ---------- 7b. Campos de Jira: cualquier formato se lee y cualquier columna se puede revisar y asignar ----------
{
  const { variantes } = await import('../tests/variantes.ts');
  const { formatos } = await import('../tests/formatos.ts');
  const V = variantes(), FMT = formatos();
  const cargarFich = async (p, fs) => {
    await p.setInputFiles('#file-input', fs.map((f) => ({ name: f.nombre, mimeType: 'application/octet-stream', buffer: Buffer.from(f.texto) })));
    await p.waitForTimeout(400); await quieto(p);
  };
  // El "Excel" de Jira Server / Data Center (tabla HTML): equipos, sprints, etiquetas y épicas como en el CSV de Cloud
  {
    const p = await pagina(1280, 800);
    await cargarFich(p, [{ nombre: 'dc-excel.xls', texto: FMT.dcExcel.texto }]);
    const r = await A(p, () => { const T = window.EP.S.lectura.tareas; return { n: T.length, equipos: window.EP.S.det.equipoRecomendado, varios: T.filter((t) => t.sprints.length > 1).length, epica: T.filter((t) => t.padre_id).length }; });
    ok('Excel de Jira Data Center: equipos, sprints y épicas como en Cloud', r.n > 1000 && r.equipos === 'equipo' && r.varios > 100 && r.epica > 1000, JSON.stringify(r));
    await p.context().close();
  }
  // Columna rara: una fecha de inicio propia se avisa al cargar, se revisa y, elegida, da el tiempo de ciclo
  {
    const p = await pagina(1280, 800);
    await cargarFich(p, V.conFechaInicio.ficheros);
    const aviso = await A(p, () => { const x = document.querySelector('[data-tipo="columnas-raras"]'); return x ? x.innerText : ''; });
    ok('columnas raras: se avisa al cargar de la fecha de inicio sin usar', /Start Date\)»: fecha de inicio/.test(aviso), aviso.slice(0, 160));
    await clic(p, '[data-tipo="columnas-raras"] [data-action="col-revisar"]');
    const form = await A(p, () => ({ campos: document.querySelectorAll('#form-col select').length, grupos: document.querySelectorAll('#form-col .col-grupo').length,
      nombres: [...document.querySelectorAll('#form-col option')].some((o) => /Marta Ruiz|Jorge Gil/.test(o.textContent)), sugerida: /Start Date/.test(document.querySelector('#form-col select[name="empezada"]').closest('.field').innerText) }));
    ok('revisión de columnas: todos los campos por grupos, la sugerencia junto a su campo y sin nombres de personas', form.campos >= 25 && form.grupos === 6 && form.sugerida && !form.nombres, JSON.stringify(form));
    await p.selectOption('#form-col select[name="empezada"]', 'Custom field (Start Date)');
    await clic(p, '[data-action="col-aplicar"]');
    await clic(p, '[data-action="ob-rev-ok"]');
    await clic(p, '[data-action="ob-role"][data-role="pmo"]'); await clic(p, '[data-action="ob-finish"]');
    const r = await A(p, () => ({ guardada: (window.EP.S.cfg.columnas || {}).empezada, ciclo: window.EP.S.vm.equipos.filter((e) => e.medidas.ciclo && e.medidas.ciclo.disponible).length, n: window.EP.S.vm.equipos.length }));
    ok('fecha de inicio elegida a mano: se guarda y todos los equipos tienen tiempo de ciclo', r.guardada === 'Custom field (Start Date)' && r.ciclo === r.n && r.n > 1, JSON.stringify(r));
    // "No usar" el equipo desde Fuentes: todo pasa a ser un solo equipo, y se puede volver atrás
    await ir(p, 'fuentes'); await quieto(p);
    await clic(p, '#page [data-action="col-revisar"]');
    await p.selectOption('#form-col select[name="equipo"]', '__no_usar__');
    await clic(p, '[data-action="col-aplicar"]');
    const sinEq = await A(p, () => ({ campo: window.EP.S.vm.campoEquipo, sinColumna: window.EP.S.lectura.tareas.every((t) => !t.agrupadores.equipo), nota: document.body.innerText.indexOf('No usar') >= 0 }));
    // Sin la columna de equipo, los equipos se reconocen por lo siguiente que sirva (aquí, el componente)
    ok('"No usar" la columna de equipo: deja de leerse, los equipos salen de otro campo y Fuentes lo dice', sinEq.sinColumna && sinEq.campo !== 'equipo' && sinEq.nota, JSON.stringify(sinEq));
    ok('sin errores de consola al revisar columnas', !p.errores.length, p.errores.slice(0, 3).join(' | '));
    await p.context().close();
  }
}

// ---------- 8. Datos imperfectos (auditoría de noviembre de 2026): lo que no se puede medir no sale "normal" ----------
{
  const { variantes, EQUIPO_SALTO } = await import('../tests/variantes.ts');
  const V = variantes();
  const cargar = async (p, nombre) => {
    await p.setInputFiles('#file-input', V[nombre].ficheros.map((f) => ({ name: f.nombre, mimeType: 'text/csv', buffer: Buffer.from(f.texto) })));
    await p.waitForTimeout(400); await quieto(p);
  };
  const terminar = async (p) => {
    await clic(p, '[data-action="ob-rev-ok"]');
    await clic(p, '[data-action="ob-role"][data-role="direccion"]'); await clic(p, '[data-action="ob-finish"]');
  };
  // Estados que no se reconocen: se para nada más cargar y en el data check no se puede "seguir de todos modos"
  {
    const p = await pagina(1280, 800);
    await cargar(p, 'estadosAleman');
    ok('estados sin reconocer: aviso de que no se puede medir nada más cargar', /no se puede medir/.test(await p.textContent('#onboarding')) && !!(await p.$('[data-tipo="bloqueo"]')));
    const dc = await A(p, () => ({ seguir: !!document.querySelector('#onboarding [data-action="ob-rev-ok"]'), revisar: !!document.querySelector('#onboarding [data-action="ob-ver"][data-que="estados"].primary'), texto: document.getElementById('onboarding').innerText }));
    ok('estados sin reconocer: la revisión manda a revisar los estados, sin "seguir de todos modos"', !dc.seguir && dc.revisar && /ningún estado se reconoce como terminado/.test(dc.texto), JSON.stringify({ seguir: dc.seguir, revisar: dc.revisar }));
    ok('sin errores de consola con estados sin reconocer', !p.errores.length, p.errores.slice(0, 3).join(' | '));
    // Ya dentro de la aplicación (alguien que la usaba y carga un export malo): ni cabecera ni presentación enseñan cifras
    await A(p, () => { window.EP.S.onboarded = true; window.EP.S.view = 'resumen'; window.EP.render(); }); await quieto(p);
    const cab = await A(p, () => ({ botones: document.getElementById('page-actions').innerText, bloqueo: !!document.querySelector('#page [data-tipo="bloqueo"]') }));
    await A(p, () => { const b = document.createElement('button'); b.dataset.action = 'present'; b.id = 'x-present'; document.body.appendChild(b); }); await p.click('#x-present'); await p.waitForTimeout(200);
    const pres = await A(p, () => window.EP.S.presenting);
    ok('bloqueo dentro de la aplicación: sin resumen redactado ni presentación', cab.bloqueo && !/Presentar|Resumen redactado/.test(cab.botones) && !pres, JSON.stringify({ cab, pres }));
    await p.context().close();
  }
  // Solo trabajo abierto: lo dice al cargar
  {
    const p = await pagina(1280, 800);
    await cargar(p, 'soloAbiertas');
    ok('solo trabajo abierto: se dice al cargar', /solo trae trabajo abierto/.test(await p.textContent('#onboarding')));
    await p.context().close();
  }
  // Cierre masivo: la ficha del equipo pide revisar el dato, no dice "normal" ni "mejor"
  {
    const p = await pagina(1280, 800);
    await cargar(p, 'salto'); await terminar(p);
    const f = await A(p, (n) => { const e = window.EP.S.vm.equipos.find((x) => x.nombre === n); return { estado: e.estado, pie: window.EP.vistas.pieFicha(e), chip: [...document.querySelectorAll('.ficha')].filter((x) => x.textContent.indexOf(n) >= 0).map((x) => x.textContent).join(' ').slice(0, 400) }; }, EQUIPO_SALTO);
    // El equipo puede tener además otra alerta: el pie dice las dos cosas, y nunca "normal" o "mejor"
    ok('cierre masivo: la ficha pide revisar el dato', (f.estado === 'revisar' || f.estado === 'alerta') && /Revisar el dato: Entregas/.test(f.pie) && !/Mejor de lo normal|Todo dentro de lo normal/.test(f.pie), JSON.stringify({ estado: f.estado, pie: f.pie }));
    await p.context().close();
  }
  // Un cierre masivo de hace 9 semanas no marca las entregas de ahora
  {
    const p = await pagina(1280, 800);
    await cargar(p, 'masivoFuera'); await terminar(p);
    const m = await A(p, (n) => { const e = window.EP.S.vm.equipos.find((x) => x.nombre === n); return { revisar: e.medidas.entregas.revisar || null, dias: (e.medidas.entregas.diasMasivos || []).length }; }, EQUIPO_SALTO);
    ok('cierre masivo fuera de las semanas medidas: no marca las entregas de ahora', !m.revisar, JSON.stringify(m));
    await p.context().close();
  }
  // Configuración guardada con un nombre escrito de otra forma: el equipo elegido y su FTE no se pierden
  {
    const p = await pagina(1280, 800);
    await A(p, () => localStorage.setItem('easyperformance.config.v2', JSON.stringify({ campoEquipo: 'equipo', equipos: ['PORTAL CLIENTES', 'Datos'], fte: { 'PORTAL CLIENTES': 5 } })));
    await p.reload(); await p.waitForTimeout(500);
    await cargar(p, 'equiposMayusculas');
    const c = await A(p, () => ({ medidos: window.EP.S.vm.equiposMedidos, fte: window.EP.S.cfg.fte }));
    ok('configuración con un nombre antiguo: se pasa al nombre actual', c.medidos.length === 2 && c.medidos.indexOf('Datos') >= 0 && Object.values(c.fte)[0] === 5 && !c.fte['PORTAL CLIENTES'], JSON.stringify(c));
    await p.context().close();
  }
  // Sin tiempo en cada estado: la pregunta de ritmo responde "En parte", nunca "Sí"
  {
    const p = await pagina(1280, 800);
    await cargar(p, 'sinTiempos'); await terminar(p); await ir(p, 'resumen'); await quieto(p);
    const pr = await A(p, () => [...document.querySelectorAll('.ficha[data-tipo="pregunta"]')].map((x) => x.innerText.replace(/\s+/g, ' ')).find((x) => /ritmo de siempre/.test(x)) || '');
    ok('sin tiempo en cada estado: "¿Vamos al ritmo de siempre?" responde "En parte"', /En parte/.test(pr) && /Sin datos de Tiempo de ciclo/.test(pr), pr.slice(0, 160));
    await p.context().close();
  }
  // Export con todos los campos: "Team" viene con None en todas las filas y los equipos están en "Assigned Team"
  {
    const p = await pagina(1280, 800);
    await cargar(p, 'todosLosCampos'); await terminar(p);
    const r = await A(p, () => ({ campo: window.EP.S.det.equipoRecomendado, n: window.EP.S.vm.equipos.length, error: !!window.EP.S.error }));
    await fijarRol(p, 'pmo'); await ir(p, 'fuentes'); await quieto(p);
    const fu = await p.textContent('#page');
    ok('export con todos los campos: los equipos salen de "Assigned Team" y Fuentes lo dice', r.campo === 'equipo' && r.n > 1 && /Assigned Team/.test(fu) && !r.error, JSON.stringify(r));
    ok('sin errores de consola con todos los campos', !p.errores.length, p.errores.slice(0, 3).join(' | '));
    await p.context().close();
  }
  // Sin ningún cambio de estado: el trabajo en curso no da alerta y el baseline dice que el tiempo de ciclo no se puede medir
  {
    const p = await pagina(1280, 800);
    await cargar(p, 'sinCambiosEstado'); await terminar(p); await ir(p, 'resumen'); await quieto(p);
    const r = await A(p, () => {
      const wipMal = window.EP.S.vm.equipos.filter((e) => e.medidas.wip && ['atencion', 'critico'].includes(e.medidas.wip.estado)).map((e) => e.nombre);
      const filas = [...document.querySelectorAll('#page .fb[data-medida="ciclo"]')];
      return { wipMal, filas: filas.length, texto: filas.map((x) => x.innerText).join(' | ').slice(0, 200), motivo: filas[0] ? filas[0].getAttribute('title') : '' };
    });
    ok('sin cambios de estado: el trabajo en curso no da alerta', !r.wipMal.length, JSON.stringify(r.wipMal));
    ok('sin cambios de estado: el tiempo de ciclo dice en el baseline que no se puede medir y qué columna falta', r.filas > 0 && /no se puede medir/.test(r.texto) && /\[CHART\] Time in Status/.test(r.motivo || ''), JSON.stringify(r));
    await p.context().close();
  }
  // Datos de ejemplo: lo que supera un límite fijo lo dice así, y nada mejor que su franja sale "Fuera de rango"
  {
    const p = await pagina(1280, 800);
    await clic(p, '[data-action="demo"]');
    const r = await A(p, () => {
      const malas = [];
      window.EP.S.vm.equipos.forEach((e) => Object.entries(e.medidas).forEach(([id, m]) => { if (m && m.disponible && m.estado === 'critico' && m.estadoPor === 'limite' && /Fuera de rango/.test(window.EP.kit.estadoChip(m))) malas.push(e.nombre + ' ' + id); }));
      return { malas, limite: document.body.innerText.indexOf('Supera el límite') >= 0 };
    });
    ok('datos de ejemplo: "Supera el límite" en vez de "Fuera de rango" cuando manda un límite fijo', r.limite && !r.malas.length, JSON.stringify(r));
    await p.context().close();
  }
}

// ---------- 9. Maquetación: nada se pisa, nada se sale y el panel lateral se alcanza entero ----------
// Portátiles con Windows al 125 % o 150 % ven la página a 1280 x 720; también tableta y móvil.
{
const medirMaquetacion = () => {
      const vis = (el) => { const s = getComputedStyle(el); return s.visibility !== 'hidden' && s.display !== 'none' && el.getClientRects().length; };
      // Rectángulos de cada nodo de texto visible
      const rects = []; const tw = document.createTreeWalker(document.querySelector('.app') || document.body, NodeFilter.SHOW_TEXT);
      let n; while ((n = tw.nextNode())) { if (!n.textContent.trim()) continue; const el = n.parentElement; if (!el || !vis(el) || el.closest('svg') || el.closest('details:not([open]) > :not(summary)')) continue;
        // Recortado por el contenedor que oculta lo que sobra (texto con "…"): solo cuenta lo visible
        let clip = { left: -1e9, top: -1e9, right: 1e9, bottom: 1e9 };
        for (let x = el; x && x !== document.body; x = x.parentElement) { const s = getComputedStyle(x); if (s.overflowX !== 'visible' || s.overflowY !== 'visible') { const c = x.getBoundingClientRect(); clip = { left: Math.max(clip.left, c.left), top: Math.max(clip.top, c.top), right: Math.min(clip.right, c.right), bottom: Math.min(clip.bottom, c.bottom) }; } }
        const rg = document.createRange(); rg.selectNodeContents(n); for (const q0 of rg.getClientRects()) { const q = { left: Math.max(q0.left, clip.left), top: Math.max(q0.top, clip.top), right: Math.min(q0.right, clip.right), bottom: Math.min(q0.bottom, clip.bottom) }; if (q.right - q.left > 2 && q.bottom - q.top > 2) rects.push({ el, q, t: n.textContent.trim().slice(0, 40) }); } }
      const solapes = [];
      for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i], c = rects[j]; if (a.el === c.el) continue;
        const ix = Math.min(a.q.right, c.q.right) - Math.max(a.q.left, c.q.left), iy = Math.min(a.q.bottom, c.q.bottom) - Math.max(a.q.top, c.q.top);
        if (ix > 3 && iy > 3) solapes.push(a.t + ' ⟂ ' + c.t);
      }
      // Texto cortado: contenedores que recortan su contenido
      const cortados = [...document.querySelectorAll('.app *')].filter((el) => vis(el) && el.children.length === 0 && el.textContent.trim() && el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflow !== 'visible' && getComputedStyle(el).textOverflow !== 'ellipsis').map((el) => el.textContent.trim().slice(0, 40));
      // Contenido que se sale de su ficha o tarjeta (se ve cortado por el borde)
      const salen = [...document.querySelectorAll('.ficha, .tile, .card, .m, .status')].filter((el) => vis(el) && el.scrollWidth > el.clientWidth + 2).map((el) => (el.querySelector('.f-title, .t-label, b') || el).textContent.trim().slice(0, 30));
      const elip = [...document.querySelectorAll('.app *')].filter((el) => vis(el) && el.children.length === 0 && el.textContent.trim() && el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).textOverflow === 'ellipsis').length;
      const sb = document.querySelector('.sidebar');
      const lateral = sb ? { alto: sb.clientHeight, contenido: sb.scrollHeight, scroll: getComputedStyle(sb).overflowY, fijo: getComputedStyle(sb).position } : null;
      const desplaza = (el) => { for (let x = el.parentElement; x; x = x.parentElement) { const s = getComputedStyle(x); if (/(auto|scroll)/.test(s.overflowY + s.overflowX) && (x.scrollHeight > x.clientHeight || x.scrollWidth > x.clientWidth)) return true; } return false; };
      const fijo = sb && getComputedStyle(sb).position !== 'static';
      const fuera = [...document.querySelectorAll('.sidebar button, .sidebar select')].filter((el) => { const q = el.getBoundingClientRect(); return (q.bottom > innerHeight + 1 && fijo || q.right > innerWidth + 1) && !desplaza(el); }).length;
      return { solapes: [...new Set(solapes)].slice(0, 8), nSolapes: solapes.length, cortados: [...new Set(cortados.concat(salen))].slice(0, 6), nCortados: cortados.length + salen.length, elip,
        scrollH: document.documentElement.scrollWidth - innerWidth, lateral, botonesLateralFuera: fuera, base: getComputedStyle(document.body).fontSize };
    };
  const p = await pagina(1280, 720);
  await clic(p, '[data-action="demo"]'); await fijarRol(p, 'pmo');
  await A(p, () => document.querySelector('.toast')?.remove());
  for (const [w, h] of [[1280, 720], [1024, 768], [390, 844]]) {
    await p.setViewportSize({ width: w, height: h });
    const mal = [];
    for (const v of ['resumen', 'equipos', 'referencias', 'epicas', 'calidad', 'recomendaciones', 'iniciativas', 'cortes', 'fuentes', 'ajustes']) {
      await ir(p, v); await quieto(p);
      const r = await A(p, medirMaquetacion);
      if (r.nSolapes || r.nCortados || r.scrollH > 0 || r.botonesLateralFuera) mal.push(v + ': ' + JSON.stringify({ solapes: r.solapes.slice(0, 2), cortados: r.cortados.slice(0, 2), scrollH: r.scrollH, panel: r.botonesLateralFuera }));
    }
    ok(`maquetación a ${w} x ${h}: sin textos que se pisan, sin contenido cortado y con el panel lateral entero`, !mal.length, mal.slice(0, 3).join(' | '));
  }
  await p.context().close();
}

// ---------- 10. Persistencia: varias pestañas, varias copias, carpeta compartida, demo y borrar todo ----------
{
  const DS = join(RAIZ, 'datos-sinteticos');
  const COMPLETO = join(DS, 'jira-ejemplo-completo-2026-10-12.csv'), PARTE_A = join(DS, 'jira-2026-10-12-parte-a.csv'), ABRIL = join(DS, 'jira-2026-04-06.csv');
  const COPIAS = join(SALIDA, 'copias');
  const copia = (nombre, datosJs) => {
    const dir = join(COPIAS, nombre); mkdirSync(join(dir, 'exports'), { recursive: true });
    writeFileSync(join(dir, 'EasyPerformance.html'), readFileSync(join(RAIZ, 'dist', 'EasyPerformance-v3', 'EasyPerformance.html')));
    if (datosJs) writeFileSync(join(dir, 'exports', 'datos.js'), 'window.EASY_PERFORMANCE_EXPORTS = ' + JSON.stringify(datosJs.map((r) => ({ nombre: r.split('/').pop(), b64: readFileSync(r).toString('base64') }))) + ';');
    return 'file://' + join(dir, 'EasyPerformance.html');
  };
  const abrirEn = async (ctx, url) => {
    const p = await ctx.newPage(); p.errores = [];
    p.on('pageerror', (e) => p.errores.push('pageerror: ' + e.message)); p.on('dialog', (d) => d.accept());
    await p.goto(url); await p.waitForFunction(() => window.EP && window.EP.S && document.getElementById('busy')); await p.waitForTimeout(700); await quieto(p);
    return p;
  };
  const recargar = async (p) => { await p.reload(); await p.waitForFunction(() => window.EP && window.EP.S); await p.waitForTimeout(800); await quieto(p); };
  const subir = async (p, f) => { await p.setInputFiles('#file-input', f); await p.waitForTimeout(700); await quieto(p); await p.waitForTimeout(200); };
  const empezar = async (p, f, rol = 'pmo') => {
    await subir(p, f);
    if (await p.$('[data-action="ob-rev-ok"]')) await clic(p, '[data-action="ob-rev-ok"]');
    await clic(p, `[data-action="ob-role"][data-role="${rol}"]`); await clic(p, '[data-action="ob-finish"]');
  };
  const nuevaIni = async (p, nombre) => {
    await ir(p, 'iniciativas'); await quieto(p);
    await clic(p, '#page-actions [data-action="ini-nueva"]');
    await p.fill('#form-ini input[name=nombre]', nombre);
    await p.check('#form-ini input[name=equipos][value="Pagos"]');
    await clic(p, '#form-ini [data-action="ini-guardar"]');
  };
  const cfgGuardada = (p) => A(p, () => JSON.parse(localStorage.getItem(window.EP.CLAVES.cfg) || '{}'));
  const fechasCortes = (p) => A(p, () => window.EP.S.cortes.map((c) => c.fechaDatos.slice(0, 10)));
  const nuevoCtx = () => navegador.newContext({ viewport: { width: 1280, height: 900 }, locale: 'es-ES', acceptDownloads: true, reducedMotion: 'reduce' });

  // Dos pestañas a la vez: lo que hace una no lo pisa la otra
  {
    const url = copia('pestanas');
    const ctx = await nuevoCtx();
    const a = await abrirEn(ctx, url);
    await empezar(a, COMPLETO);
    const b = await abrirEn(ctx, url);
    await nuevaIni(a, 'Creada en A');
    await b.waitForTimeout(600); await quieto(b);
    const enB = await A(b, () => (window.EP.S.cfg.iniciativas || []).map((i) => i.nombre));
    ok('dos pestañas: la otra pestaña ve la iniciativa nueva sin recargar', enB.indexOf('Creada en A') >= 0, JSON.stringify(enB));
    // B cambia otra cosa de la configuración con su copia (incluso si no le llegó el aviso, la iniciativa de A se conserva)
    await A(b, () => { const S = window.EP.S; S.cfgVersion = 'vieja'; S.cfg.iniciativas = []; S.cfg.fte = Object.assign({}, S.cfg.fte, { Datos: 3 }); window.EP.guardarCfg(); });
    const g = await cfgGuardada(a);
    ok('dos pestañas: guardar con una copia vieja no borra la iniciativa de la otra', (g.iniciativas || []).some((i) => i.nombre === 'Creada en A') && g.fte && g.fte.Datos === 3, JSON.stringify({ ini: (g.iniciativas || []).map((i) => i.nombre), fte: g.fte }));
    // Una iniciativa quitada en una pestaña no vuelve
    const id = await A(a, () => window.EP.S.cfg.iniciativas.filter((i) => i.nombre === 'Creada en A')[0].id);
    await A(a, (id) => { const b = document.createElement('button'); b.dataset.action = 'ini-del'; b.dataset.id = id; document.body.appendChild(b); b.click(); b.remove(); }, id);
    await a.waitForTimeout(400); await quieto(a);
    await A(b, () => { const S = window.EP.S; S.cfgVersion = 'vieja'; window.EP.guardarCfg(); });
    ok('dos pestañas: una iniciativa quitada no la resucita la otra pestaña', !((await cfgGuardada(a)).iniciativas || []).some((i) => i.id === id));
    // Cortes: cada pestaña carga un export distinto y se guardan los dos
    await subir(a, ABRIL);
    await subir(b, PARTE_A);
    await recargar(a);
    const cs = await fechasCortes(a);
    ok('dos pestañas: los cortes guardados en cada pestaña se conservan', cs.some((c) => c.startsWith('2026-04-06')) && cs.some((c) => c.startsWith('2026-10-12')), JSON.stringify(cs));
    ok('dos pestañas: sin errores', !a.errores.length && !b.errores.length, a.errores.concat(b.errores).join(' | '));
    // Borrar todo en una pestaña: la otra vuelve a empezar y no reescribe lo borrado
    await ir(a, 'ajustes'); await quieto(a);
    await clic(a, '[data-action="clear-all"]');
    await b.waitForTimeout(1500); await b.waitForFunction(() => window.EP && window.EP.S); await quieto(b);
    await A(b, () => window.EP.guardarPrefs());
    const trasBorrar = await A(b, () => ({ onboarded: window.EP.S.onboarded, prefs: localStorage.getItem(window.EP.CLAVES.prefs) && JSON.parse(localStorage.getItem(window.EP.CLAVES.prefs)).onboarded }));
    ok('dos pestañas: borrar todo en una deja la otra como la primera vez', !trasBorrar.onboarded && !trasBorrar.prefs, JSON.stringify(trasBorrar));
    await ctx.close();
  }

  // Dos copias del HTML en carpetas distintas: cada una con sus datos. Y los datos de antes van a la primera que se abre
  {
    const ctx = await nuevoCtx();
    const pre = await abrirEn(ctx, copia('previa'));
    // Datos guardados con las claves de antes de los espacios
    await A(pre, () => { localStorage.clear(); localStorage.setItem('easyperformance.config.v2', JSON.stringify({ nombre: 'Antes', iniciativas: [{ id: 'ini-antes', nombre: 'De antes', equipos: ['Pagos'], inicio: '2026-01-01' }] })); localStorage.setItem('easyperformance.v3.prefs', JSON.stringify({ role: 'pmo', onboarded: false })); });
    await pre.close();
    const a = await abrirEn(ctx, copia('clienteA'));
    const ca = await A(a, () => ({ cfg: window.EP.S.cfg.nombre, role: window.EP.S.role, espacio: window.EP.CLAVES.espacio }));
    ok('datos de antes: los recoge la primera copia que se abre', ca.cfg === 'Antes' && ca.role === 'pmo' && !!ca.espacio, JSON.stringify(ca));
    await empezar(a, COMPLETO);
    await nuevaIni(a, 'Ini cliente A');
    await a.close();
    const b = await abrirEn(ctx, copia('clienteB'));
    const sb = await A(b, () => ({ tareas: window.EP.S.lectura ? window.EP.S.lectura.tareas.length : 0, ini: (window.EP.S.cfg.iniciativas || []).length, cortes: window.EP.S.cortes.length, nombre: window.EP.S.cfg.nombre || null }));
    ok('otra carpeta: no ve los datos, las iniciativas ni los cortes de la primera', !sb.tareas && !sb.ini && !sb.cortes && !sb.nombre, JSON.stringify(sb));
    // Copia de la configuración: se descarga en A y se carga en B
    const a2 = await abrirEn(ctx, copia('clienteA'));
    await ir(a2, 'ajustes'); await quieto(a2);
    const [desc] = await Promise.all([a2.waitForEvent('download'), a2.click('[data-action="cfg-exportar"]')]);
    const ruta = join(COPIAS, 'copia-config.json'); await desc.saveAs(ruta);
    const copiaJson = JSON.parse(readFileSync(ruta, 'utf8'));
    ok('copia de la configuración: lleva configuración, iniciativas y cortes, y nunca ficheros ni clave', copiaJson.tipo === 'easyperformance-configuracion' && copiaJson.cfg.iniciativas.some((i) => i.nombre === 'Ini cliente A') && copiaJson.cortes.length >= 1 && !/"(texto|b64|clave)"/.test(readFileSync(ruta, 'utf8')) && copiaJson.cortes.every((c) => c.ficheros.every((f) => Object.keys(f).join() === 'nombre,filas')), Object.keys(copiaJson).join(','));
    await empezar(b, COMPLETO);
    await ir(b, 'ajustes'); await quieto(b);
    await b.setInputFiles('input[data-change="cfg-importar"]', ruta); await b.waitForTimeout(800); await quieto(b);
    const tras = await A(b, () => ({ ini: (window.EP.S.cfg.iniciativas || []).map((i) => i.nombre), cortes: window.EP.S.cortes.length, guardada: JSON.parse(localStorage.getItem(window.EP.CLAVES.cfg) || '{}').iniciativas, error: window.EP.S.error }));
    ok('copia de la configuración: cargada en otra carpeta, trae las iniciativas y los cortes', tras.ini.indexOf('Ini cliente A') >= 0 && (tras.guardada || []).some((i) => i.nombre === 'Ini cliente A') && tras.cortes >= 1 && !tras.error, JSON.stringify(tras));
    // Copias mal formadas: una que no vale no cambia nada; un corte roto no entra y lo demás sí
    const conCopia = async (obj) => {
      const ruta2 = join(COPIAS, 'copia-mala.json'); writeFileSync(ruta2, JSON.stringify(obj));
      await b.setInputFiles('input[data-change="cfg-importar"]', ruta2); await b.waitForTimeout(800); await quieto(b);
      return A(b, () => ({ nombre: window.EP.S.cfg.nombre || null, cortes: window.EP.S.cortes.length, err: window.EP.S.error }));
    };
    const antesMala = await A(b, () => ({ nombre: window.EP.S.cfg.nombre || null, cortes: window.EP.S.cortes.length }));
    const r1 = await conCopia({ tipo: 'easyperformance-configuracion', cfg: [] });
    const r2 = await conCopia({ tipo: 'easyperformance-configuracion', cfg: { nombre: 'X', iniciativas: 'no' } });
    const r3 = await conCopia({ tipo: 'easyperformance-configuracion', cfg: { nombre: 'Con corte roto', iniciativas: [] }, cortes: [{ id: 'c1', huella: 'h', fechaDatos: 5, creado: 'x', equipos: {} }, { id: 'c2', huella: 'h2', fechaDatos: '2026-01-05T00:00:00.000Z', creado: '2026-01-06T00:00:00.000Z', equipos: {} }] });
    await ir(b, 'cortes'); await quieto(b);
    ok('copia mal formada: no cambia nada; un corte roto no entra y no rompe la página', r1.nombre === antesMala.nombre && r2.nombre === antesMala.nombre && r3.nombre === 'Con corte roto' && r3.cortes === antesMala.cortes && !r3.err && !(await A(b, () => window.EP.S.error)), JSON.stringify({ antesMala, r1, r2, r3 }));
    // Borrar todo en la carpeta que recogió los datos de antes: tampoco quedan los de antes
    const a3 = await abrirEn(ctx, copia('clienteA'));
    await ir(a3, 'ajustes'); await quieto(a3); await clic(a3, '[data-action="clear-all"]');
    ok('borrar todo: también lo que quedaba de antes de los espacios', !(await A(a3, () => localStorage.getItem('easyperformance.config.v2') || localStorage.getItem('easyperformance.v3.prefs'))));
    ok('dos copias: sin errores', !a.errores.length && !b.errores.length && !a2.errores.length, a.errores.concat(b.errores, a2.errores).join(' | '));
    await ctx.close();
  }

  // Carpeta compartida (datos.js) y una carga a mano después: al volver manda la carga a mano mientras la carpeta no cambie
  {
    const url = copia('carpeta', [ABRIL]);
    const ctx = await nuevoCtx();
    const pre = await abrirEn(ctx, copia('previa2'));
    await A(pre, () => { localStorage.clear(); localStorage.setItem('easyperformance.config.v2', JSON.stringify({ nombre: 'Cliente viejo', fte: { Pagos: 99 } })); });
    await pre.close();
    const p = await abrirEn(ctx, url);
    const mig = await A(p, () => ({ nombre: window.EP.S.cfg.nombre || null, reclamado: localStorage.getItem('easyperformance.v3.reclamado') }));
    ok('carpeta con datos.js: no recoge la configuración de otro cliente', mig.nombre !== 'Cliente viejo' && !mig.reclamado, JSON.stringify(mig));
    if (await p.$('[data-action="ob-rev-ok"]')) await clic(p, '[data-action="ob-rev-ok"]');
    await clic(p, '[data-action="ob-role"][data-role="pmo"]'); await clic(p, '[data-action="ob-finish"]');
    await subir(p, COMPLETO);
    await recargar(p);
    const f1 = await A(p, () => window.EP.S.lectura.informe.ficheros.map((f) => f.nombre));
    ok('carpeta compartida: la carga a mano sobrevive a la recarga', f1.length === 1 && f1[0].startsWith('jira-ejemplo-completo'), JSON.stringify(f1));
    // Deja un export nuevo en la carpeta: ahora manda la carpeta
    copia('carpeta', [PARTE_A]);
    await recargar(p);
    const f2 = await A(p, () => window.EP.S.lectura.informe.ficheros.map((f) => f.nombre));
    ok('carpeta compartida: un export nuevo en la carpeta vuelve a mandar', f2.length === 1 && f2[0].indexOf('parte-a') >= 0, JSON.stringify(f2));
    ok('carpeta compartida: sin errores', !p.errores.length, p.errores.join(' | '));
    await ctx.close();
  }

  // Demo y borrar todo: la demo no toca las preferencias reales; borrar todo deja todo como la primera vez
  {
    const url = copia('demo');
    const ctx = await nuevoCtx();
    const p = await abrirEn(ctx, url);
    await empezar(p, COMPLETO, 'direccion');
    await A(p, () => { const S = window.EP.S; S.prefs.byRole.direccion = { kpis: ['entregas', 'ciclo'] }; window.EP.guardarPrefs(); });
    const antes = await A(p, () => localStorage.getItem(window.EP.CLAVES.prefs));
    await A(p, () => { const b = document.createElement('button'); b.dataset.action = 'demo'; document.body.appendChild(b); b.click(); b.remove(); });
    await p.waitForTimeout(300); await quieto(p);
    await A(p, () => document.querySelector('#role-seg [data-role="pmo"]').click()); await quieto(p);
    await A(p, () => { const S = window.EP.S; S.prefs.byRole.pmo = { kpis: ['bugs'] }; window.EP.guardarPrefs(); });
    const enDemo = await A(p, () => localStorage.getItem(window.EP.CLAVES.prefs));
    await clic(p, '[data-action="demo-exit"]');
    const fuera = await A(p, () => ({ role: window.EP.S.role, pmo: !!window.EP.S.prefs.byRole.pmo, demo: window.EP.S.demo }));
    ok('demo: no guarda preferencias y al salir vuelven el rol y los indicadores de antes', antes === enDemo && fuera.role === 'direccion' && !fuera.pmo && !fuera.demo, JSON.stringify({ igual: antes === enDemo, fuera }));
    // El equipo elegido en la ficha de equipo se recuerda
    await ir(p, 'equipos'); await quieto(p);
    const otro = await A(p, () => { const t = [...document.querySelectorAll('[data-action="team-tab"]')].filter((x) => x.dataset.team !== '__comparar' && x.dataset.team !== window.EP.S.team)[0]; if (!t) return null; t.click(); return t.dataset.team; });
    await quieto(p);
    if (otro) { await recargar(p); ok('el equipo elegido se recuerda al volver', (await A(p, () => window.EP.S.team)) === otro, otro); }
    await ir(p, 'ajustes'); await quieto(p);
    await clic(p, '[data-action="clear-all"]');
    const limpio = await A(p, () => ({ byRole: Object.keys(window.EP.S.prefs.byRole), role: window.EP.S.role, cortes: window.EP.S.cortes.length, ls: Object.keys(localStorage).filter((k) => k === window.EP.CLAVES.cfg || k === window.EP.CLAVES.prefs) }));
    ok('borrar todo: también olvida los indicadores elegidos y el rol que estaban en memoria', !limpio.byRole.length && limpio.role === 'direccion' && !limpio.cortes && !limpio.ls.length, JSON.stringify(limpio));
    ok('demo y borrar todo: sin errores', !p.errores.length, p.errores.join(' | '));
    await ctx.close();
  }
}

// ---------- 11. Recomendaciones coherentes: cada equipo con su nivel y su evidencia; nada sobre datos por revisar ----------
{
  const { variantes, EQUIPO_SALTO } = await import('../tests/variantes.ts');
  const V = variantes();
  const DS = join(RAIZ, 'datos-sinteticos');
  const abrirCon = async (ficheros) => {
    const p = await pagina(1280, 800);
    await p.setInputFiles('#file-input', ficheros); await p.waitForTimeout(500); await quieto(p);
    if (await p.$('[data-action="ob-rev-ok"]')) await clic(p, '[data-action="ob-rev-ok"]');
    await clic(p, '[data-action="ob-role"][data-role="pmo"]'); await clic(p, '[data-action="ob-finish"]');
    return p;
  };
  // Lo que ve cada equipo de cada recomendación: nivel y evidencia, comparados con el caso de ese equipo en el modelo
  const coherencia = (p) => A(p, () => {
    const EP = window.EP, S = EP.S, mal = [];
    const nivelDe = (c) => (c.gravedad === 'critico' ? 'alto' : c.confianza === 'baja' ? 'bajo' : 'medio');
    const casoDe = (eq, id) => { const m = S.r.modelo.equipos.filter((x) => x.nombre === eq)[0]; return m ? m.casos.filter((c) => c.id === id)[0] : null; };
    let comprobadas = 0;
    S.vm.equipos.forEach((e) => {
      EP.vistas.recsActivas([e]).forEach((r) => {
        const c = r.grupo || r.fuente !== 'banco' ? null : casoDe(e.nombre, r.id);
        if (!c) return;
        comprobadas++;
        if (r.nivel !== nivelDe(c)) mal.push(e.nombre + ': ' + r.id + ' nivel ' + r.nivel + ' en vez de ' + nivelDe(c));
        if (r.evidencias[0][0] !== e.nombre) mal.push(e.nombre + ': ' + r.id + ' con la evidencia de ' + r.evidencias[0][0]);
      });
      // Un equipo "Estable" no tiene ningún caso grave activo
      if (e.estado === 'estable' && EP.vistas.recsActivas([e]).some((r) => { const c = !r.grupo && casoDe(e.nombre, r.id); return c && c.gravedad === 'critico'; })) mal.push(e.nombre + ': estable con recomendación alta');
    });
    return { mal, comprobadas };
  });
  // Datos con un caso compartido por varios equipos con distinta gravedad: el equipo leve no hereda el nivel ni la evidencia del grave
  const forzarCasoMixto = (p) => A(p, () => {
    const EP = window.EP, S = EP.S, eqs = S.r.modelo.equipos;
    if (eqs.length < 2) return false;
    eqs[0].casos.push({ id: 'todo_urgente', gravedad: 'critico', confianza: 'alta', evidencia: 'Evidencia grave de ' + eqs[0].nombre + '.', datos: {} });
    eqs[1].casos.push({ id: 'todo_urgente', gravedad: 'atencion', confianza: 'media', evidencia: 'Evidencia leve de ' + eqs[1].nombre + '.', datos: {} });
    S.vm = EP.P.construirVM(S.r, { lectura: S.lectura, det: S.det, cfg: S.cfg });
    return true;
  });
  {
    const p = await abrirCon(join(DS, 'jira-ejemplo-completo-2026-10-12.csv'));
    await forzarCasoMixto(p);
    const c = await coherencia(p);
    ok('recomendaciones: cada equipo ve su nivel y su evidencia, y ningún equipo estable tiene un caso grave', c.comprobadas > 0 && !c.mal.length, c.mal.slice(0, 3).join(' | ') + ' · comprobadas: ' + c.comprobadas);
    // La ficha de cada equipo enseña su propia evidencia (no la del primer equipo de la lista)
    const fichas = await A(p, () => {
      const EP = window.EP, S = EP.S, mal = []; let filas = 0;
      S.vm.equipos.forEach((e) => {
        const m = S.r.modelo.equipos.filter((x) => x.nombre === e.nombre)[0];
        S.team = e.nombre; S.teamCompare = false; EP.go('equipos');
        document.querySelectorAll('.rrow[data-kind="caso"]').forEach((row) => {
          const r = S.vm.recs.filter((x) => x.clave === row.dataset.id)[0], c = r && !r.grupo && m.casos.filter((x) => x.id === r.id)[0];
          if (!c) return;
          filas++;
          if (row.textContent.indexOf(EP.kit.primeraFrase(c.evidencia)) < 0) mal.push(e.nombre + ': ' + r.id);
        });
      });
      return { mal, filas };
    });
    ok('ficha de equipo: "Qué hacer" enseña la evidencia del propio equipo', fichas.filas > 0 && !fichas.mal.length, fichas.mal.slice(0, 3).join(', ') + ' · filas: ' + fichas.filas);
    // La clave de un descarte no depende del orden de urgencia; el cajón abierto desde un equipo enseña lo de ese equipo;
    // y un equipo que solo "pide atención" por una recomendación vuelve a "Estable" si se descarta
    const otros = await A(p, () => {
      const EP = window.EP, S = EP.S, eqs = S.r.modelo.equipos;
      const r = S.vm.recs.filter((x) => x.id === 'todo_urgente')[0];
      const orden = eqs.map((e) => e.nombre).filter((n) => r.equipos.indexOf(n) >= 0);
      EP.openDrill({ kind: 'caso', id: r.clave, team: eqs[1].nombre });
      const cajon = document.querySelector('#drawer').textContent; EP.openDrill(null);
      // Un equipo estable con un caso grave: "Pide atención"; descartada la recomendación, vuelve a "Estable"
      const e = S.vm.equipos.filter((x) => x.nombre === eqs[1].nombre)[0], antes = { estado: e.estado, todas: e.gravesTodas };
      e.estado = 'estable'; e.gravesTodas = ['todo_urgente'];
      EP.P.ajustarAtencion(S.vm, S.dismissed); const con = e.estado;
      S.dismissed[r.clave] = true; EP.P.ajustarAtencion(S.vm, S.dismissed); const sin = e.estado;
      delete S.dismissed[r.clave]; e.estado = antes.estado; e.gravesTodas = antes.todas; EP.P.ajustarAtencion(S.vm, S.dismissed);
      return { clave: r.clave, esperada: 'todo_urgente|' + orden.join(','), cajonLeve: cajon.indexOf('Evidencia leve de ' + eqs[1].nombre) >= 0, cajonGrave: cajon.indexOf('Evidencia grave de') >= 0, con, sin };
    });
    ok('recomendaciones: la clave sigue el orden del modelo, el cajón de un equipo es suyo y descartar quita "Pide atención"', otros.clave === otros.esperada && otros.cajonLeve && !otros.cajonGrave && otros.con === 'atencion' && otros.sin === 'estable', JSON.stringify(otros));
    // Resumen redactado de un equipo: su fiabilidad, no la del área
    const narr = await A(p, () => { const EP = window.EP, S = EP.S, e = S.vm.equipos[0]; EP.openDrill({ kind: 'resumen', team: e.nombre }); return document.querySelector('#drawer') ? document.querySelector('#drawer').textContent : ''; });
    ok('resumen redactado de un equipo: habla del equipo y de su dato', /Dato del equipo/.test(narr) && !/Ningún equipo se ha salido/.test(narr), narr.slice(0, 160));
    ok('recomendaciones: sin errores', !p.errores.length, p.errores.join(' | '));
    await p.context().close();
  }
  // Un equipo con un cierre en bloque: no se le recomienda nada que salga de sus entregas y la previsión lo avisa
  {
    const p = await abrirCon(V.salto.ficheros.map((f) => ({ name: f.nombre, mimeType: 'text/csv', buffer: Buffer.from(f.texto) })));
    const r = await A(p, (eq) => {
      const EP = window.EP, S = EP.S, e = S.vm.equipos.filter((x) => x.nombre === eq)[0];
      const deEntregas = ['demasiado_a_la_vez', 'entregas_irregulares'];
      const recs = S.vm.recs.filter((x) => deEntregas.indexOf(x.id) >= 0 && x.equipos.indexOf(eq) >= 0).map((x) => x.id);
      S.team = eq; S.teamCompare = false; EP.go('equipos');
      return { revisar: !!(e.medidas.entregas && e.medidas.entregas.revisar), recs, aviso: !!document.querySelector('.notice.warn') && /por revisar/.test(document.querySelector('#page').textContent) };
    }, EQUIPO_SALTO);
    ok('cierre en bloque: ninguna recomendación sale de entregas por revisar, y la previsión lo avisa', r.revisar && !r.recs.length && r.aviso, JSON.stringify(r));
    ok('cierre en bloque: sin errores', !p.errores.length, p.errores.join(' | '));
    await p.context().close();
  }
}

// ---------- 12. Cálculo: el área sin equipos sin rango normal, y lo que no se puede saber no sale "bien" ----------
{
  const { variantes, EQUIPO_TARDIO } = await import('../tests/variantes.ts');
  const V = variantes();
  const abrirVar = async (nombre) => {
    const p = await pagina(1280, 800);
    await p.setInputFiles('#file-input', V[nombre].ficheros.map((f) => ({ name: f.nombre, mimeType: 'text/csv', buffer: Buffer.from(f.texto) }))); await p.waitForTimeout(500); await quieto(p);
    if (await p.$('[data-action="ob-rev-ok"]')) await clic(p, '[data-action="ob-rev-ok"]');
    await clic(p, '[data-action="ob-role"][data-role="pmo"]'); await clic(p, '[data-action="ob-finish"]');
    return p;
  };
  {
    const p = await abrirVar('equipoTardio');
    await ir(p, 'referencias'); await quieto(p);
    const r = await A(p, (eq) => ({ sin: window.EP.S.vm.areaSin, n: window.EP.S.r.area.equipos[0].n, total: window.EP.S.r.modelo.equipos.filter((e) => e.nombre !== eq).reduce((s, e) => s + e.n, 0), texto: document.querySelector('#page').textContent }), EQUIPO_TARDIO);
    ok('área: sin el equipo que aún no tiene rango normal, y se dice', r.sin.indexOf(EQUIPO_TARDIO) >= 0 && r.n === r.total && r.texto.indexOf('Sin ' + EQUIPO_TARDIO) >= 0, JSON.stringify({ sin: r.sin, n: r.n, total: r.total }));
    ok('área: sin errores', !p.errores.length, p.errores.join(' | '));
    await p.context().close();
  }
  {
    const p = await abrirVar('sinTiempos');
    const f = await A(p, () => { const c = window.EP.S.vm.fiabilidad.comprobaciones.filter((x) => x.id === 'flujo')[0]; return c ? c.estado : null; });
    ok('sin tiempo en cada estado: "pasan por en curso" no sale bien', f !== 'bien', String(f));
    await p.context().close();
  }
}

await navegador.close();
writeFileSync(join(SALIDA, 'resultados.json'), JSON.stringify(resultados, null, 1));
const mal = resultados.filter((r) => !r.bien);
console.log(`\n${resultados.length - mal.length}/${resultados.length} comprobaciones bien`);
process.exit(mal.length ? 1 : 0);
