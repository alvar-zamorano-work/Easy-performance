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
// Labs (IA, cortes, carpeta) está apagado por defecto: las comprobaciones de esas funciones lo encienden antes
const labs = async (p) => { await A(p, () => { window.EP.S.prefs.labs = true; window.EP.guardarPrefs(); window.EP.render(); }); await quieto(p); };
// "Compartir" abre un cajón con presentar, el resumen redactado, imprimir y el catálogo
const compartir = async (p, accion) => { await p.click('#page-actions [data-kind="compartir"]'); await p.waitForTimeout(150); await p.click(`#drawer .compartir[data-action="${accion}"]`); await p.waitForTimeout(200); await quieto(p); };
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
  // Quitar Predictability: los arrastrados salen de la baseline
  await p.click('input[data-change="ctx-obj"][value="predictability"]', { force: true }); await p.waitForTimeout(200); await quieto(p);
  const kpis = await A(p, () => window.EP.S.vm.kpis);
  ok('Context cambia la baseline', !kpis.includes('arrastradas') && kpis.includes('bugs'), kpis.join(','));
  await p.screenshot({ path: join(SALIDA, '03-que-mirar.png'), fullPage: true });
  await clic(p, '[data-action="ob-role"][data-role="pmo"]');
  await clic(p, '[data-action="ob-finish"]');
  const e = await estado(p);
  const rec = await A(p, () => window.EP.S.recorrido);
  ok('entra en la app: la primera vez, el recorrido empieza en el Resumen', e.vista === 'resumen' && rec === 1 && !e.error, JSON.stringify({ e, rec }));
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
  for (const [sel, nombre] of [['.fila-dot[data-kind="comprobacion"]', 'comprobación'], ['.rrow[data-kind="caso"]', 'caso'], ['#page-actions [data-kind="compartir"]', 'compartir'], ['[data-kind="personalizar"]', 'personalizar'], ['[data-kind="ayuda"]', 'ayuda']]) {
    await p.click(sel); await p.waitForTimeout(200);
    const t = (await p.textContent('#drawer')) || '';
    ok('panel: ' + nombre, t.length > 40 && !(await estado(p)).error);
    await p.keyboard.press('Escape'); await p.waitForTimeout(100);
  }
  // Resumen centrado en la baseline: una fila por indicador y equipo, con su barra y su rango
  await ir(p, 'resumen'); await p.waitForTimeout(100);
  const filasBl = await p.$$eval('#page .fb', (x) => x.length), nEq = await A(p, () => window.EP.visibles().length), nK = await A(p, () => window.EP.kit.destacados().length);
  // Una ficha por equipo y, con más de un equipo, otra de toda el área
  ok('resumen: la baseline de cada equipo y la de toda el área', filasBl === (nEq + (nEq > 1 ? 1 : 0)) * nK && (await p.$$eval('#page .tile', (x) => x.length)) === 0, `${filasBl} filas`);
  const textoMenu = await p.textContent('#nav');
  ok('el menú dice Baseline, Qué hacer y Datos', /Baseline/.test(textoMenu) && /Qué hacer/.test(textoMenu) && /Datos/.test(textoMenu) && !/Referencias|Línea base/.test(textoMenu), textoMenu);
  // Los gráficos de cada indicador están en la ficha de equipo
  await ir(p, 'equipos'); await p.waitForTimeout(100);
  ok('ficha de equipo con un gráfico por indicador destacado', (await p.$$eval('#page svg.grafico', (x) => x.length)) >= nK);
  // Personalizar: cambia los indicadores destacados del rol
  await ir(p, 'resumen'); await p.click('[data-kind="personalizar"]'); await p.waitForTimeout(150);
  await p.click('input[data-change="pref-tile"][value="ciclo"]'); await p.waitForTimeout(150);
  ok('personalizar quita un indicador', !(await A(p, () => window.EP.kit.destacados().includes('ciclo'))));
  await p.click('[data-action="pref-reset"]'); await p.keyboard.press('Escape');
  // Compartir: sus opciones son filas de la página, no botones con el aspecto del navegador
  await p.click('#page-actions [data-kind="compartir"]'); await p.waitForTimeout(150);
  const filasCompartir = await A(p, () => [...document.querySelectorAll('#drawer button.compartir')].map((b) => { const s = getComputedStyle(b); return { borde: s.borderTopStyle, fondo: s.backgroundColor, fuente: s.fontFamily === getComputedStyle(document.body).fontFamily, izq: s.textAlign, ancho: Math.round(b.getBoundingClientRect().width) }; }));
  ok('Compartir: filas con el estilo de la página, alineadas a la izquierda y del mismo ancho', filasCompartir.length === 4 && filasCompartir.every((f) => f.borde !== 'outset' && f.fuente && (f.izq === 'left' || f.izq === 'start') && f.ancho === filasCompartir[0].ancho), JSON.stringify(filasCompartir[0]));
  await p.keyboard.press('Escape'); await p.waitForTimeout(100);
  // Presentación
  await compartir(p, 'present');
  ok('al presentar desde Compartir el panel se cierra', await A(p, () => document.getElementById('drawer').classList.contains('hidden')));
  const nDiap = await A(p, () => window.EP.visibles().length + 2);
  for (let i = 0; i < nDiap; i++) { await p.keyboard.press('ArrowRight'); await p.waitForTimeout(60); }
  // El botón fijo "Salir" no tapa el estado del equipo en ninguna diapositiva
  await A(p, () => { window.EP.S.slide = 0; window.EP.render(); });
  const tapados = [];
  for (let i = 0; i < nDiap; i++) {
    const r = await A(p, () => { const c = document.querySelector('#present .slide-head .chip'); const b = document.querySelector('#present .present-close'); if (!c || !b) return null; const a = c.getBoundingClientRect(), z = b.getBoundingClientRect(); return !(a.right <= z.left || a.left >= z.right || a.bottom <= z.top || a.top >= z.bottom) ? c.textContent.trim() : null; });
    if (r) tapados.push(i + 1 + ':' + r);
    await p.keyboard.press('ArrowRight'); await p.waitForTimeout(60);
  }
  ok('presentación: el botón Salir no tapa el estado del equipo', !tapados.length, tapados.join(', '));
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
  // Sin clave de IA no sale el botón Preguntar (no tapa contenido para algo que no se puede usar)
  ok('asistente sin clave: no sale el botón Preguntar', await A(p, () => document.getElementById('assistant-fab').classList.contains('hidden')));
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
  await labs(p); await ir(p, 'ajustes'); await p.fill('#ia-clave', 'sk-ant-prueba'); await clic(p, '[data-action="ia-guardar"]');
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
  await ir(p, 'resumen'); await compartir(p, 'drill');
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
  await labs(p);
  for (const v of ['resumen', 'equipos', 'recomendaciones', 'iniciativas', 'cortes', 'fuentes', 'ajustes']) { await ir(p, v); await p.waitForTimeout(100); const e = await estado(p); if (e.error || e.ancho > 0) fallos.push(v + ': ' + (e.error || 'scroll')); }
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
  await labs(p); await ir(p, 'ajustes'); await p.fill('#ia-clave', 'sk-ant-prueba'); await clic(p, '[data-action="ia-guardar"]');
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
  // Cortes (Labs): valor oficial congelado
  await labs(p); await ir(p, 'cortes'); await quieto(p);
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
  const coste = await A(p, () => { const hay = window.EP.S.vm.equipos.some((e) => e.medidas.coste && e.medidas.coste.disponible); const fichas = [...document.querySelectorAll('[data-tipo="pregunta"]')].map((f) => f.textContent); const c = fichas.find((x) => /cuesta cada entrega/.test(x)); return { hay, c: c ? c.slice(0, 120) : null }; });
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
    // Con la fiabilidad en cada cifra (auditoría UX) pueden salir más medidas por revisar: Entregas tiene que estar entre ellas
    ok('cierre masivo: la ficha pide revisar el dato', (f.estado === 'revisar' || f.estado === 'alerta') && /Revisar el dato: [^·]*Entregas/.test(f.pie) && !/Mejor de lo normal|Todo dentro de lo normal/.test(f.pie), JSON.stringify({ estado: f.estado, pie: f.pie }));
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
    const pr = await A(p, () => [...document.querySelectorAll('[data-tipo="pregunta"]')].map((x) => x.innerText.replace(/\s+/g, ' ')).find((x) => /ritmo de siempre/.test(x)) || '');
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
    ok('sin cambios de estado: el tiempo de ciclo dice en la baseline que no se puede medir y qué columna falta', r.filas > 0 && /no se puede medir/.test(r.texto) && /\[CHART\] Time in Status/.test(r.motivo || ''), JSON.stringify(r));
    await p.context().close();
  }
  // Datos de ejemplo: sin baseline, lo que supera un límite fijo lo dice así ("Límite crítico", nunca "Fuera de rango").
  // Con baseline manda la baseline (auditoría UX): el límite superado es un aviso y no pone chip de límite.
  {
    const p = await pagina(1280, 800);
    await clic(p, '[data-action="demo"]');
    const r = await A(p, () => {
      const malas = [];
      window.EP.S.vm.equipos.forEach((e) => Object.entries(e.medidas).forEach(([id, m]) => { if (m && m.disponible && m.estado === 'critico' && m.estadoPor === 'limite' && window.EP.kit.estadoChip(m).indexOf(window.EP.t('estado.critico')) >= 0) malas.push(e.nombre + ' ' + id); }));
      // Lo marcado por un límite crítico fijo lleva el chip de límite, nunca "Fuera de rango"
      const conLimite = window.EP.S.vm.equipos.some((e) => Object.values(e.medidas).some((m) => m && m.disponible && m.estado === 'critico' && m.estadoPor === 'limite' && window.EP.kit.estadoChip(m).indexOf(window.EP.t('estado.limite.critico')) >= 0));
      const avisos = [], avisoConChip = [];
      window.EP.S.vm.equipos.forEach((e) => Object.entries(e.medidas).forEach(([id, m]) => { if (!m || !m.disponible || !m.aviso) return; avisos.push(e.nombre + ' ' + id); const c = window.EP.kit.estadoChip(m); if (c.indexOf(window.EP.t('estado.limite.critico')) >= 0 || c.indexOf(window.EP.t('estado.limite.atencion')) >= 0) avisoConChip.push(e.nombre + ' ' + id); }));
      return { malas, limite: conLimite, avisos: avisos.length, avisoConChip };
    });
    ok('datos de ejemplo: con baseline, un límite fijo superado es un aviso sin chip de límite; sin ella, "Límite crítico" y nunca "Fuera de rango"', r.avisos > 0 && !r.avisoConChip.length && !r.malas.length, JSON.stringify(r));
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
  await clic(p, '[data-action="demo"]'); await fijarRol(p, 'pmo'); await labs(p);
  await A(p, () => document.querySelector('.toast')?.remove());
  for (const [w, h] of [[1280, 720], [1024, 768], [390, 844]]) {
    await p.setViewportSize({ width: w, height: h });
    const mal = [];
    for (const v of ['resumen', 'equipos', 'epicas', 'calidad', 'recomendaciones', 'iniciativas', 'cortes', 'fuentes', 'ajustes']) {
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
  // Con datos ya cargados se pregunta si el export sustituye o se suma: aquí sustituye
  const subir = async (p, f) => { await p.setInputFiles('#file-input', f); await p.waitForTimeout(700); await quieto(p); if (await p.$('[data-action="carga-sustituir"]')) await clic(p, '[data-action="carga-sustituir"]'); await p.waitForTimeout(200); };
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
    await labs(b); await ir(b, 'cortes'); await quieto(b);
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
      const e = S.vm.equipos.filter((x) => x.nombre === eqs[1].nombre)[0], antes = { estado: e.estado, todas: e.gravesTodas, sinGraves: e.estadoSinGraves };
      e.estado = 'estable'; e.estadoSinGraves = 'estable'; e.gravesTodas = ['todo_urgente'];
      EP.P.ajustarAtencion(S.vm, S.dismissed); const con = e.estado;
      S.dismissed[r.clave] = true; EP.P.ajustarAtencion(S.vm, S.dismissed); const sin = e.estado;
      // Con un dato por revisar: "Pide atención" va por delante y, descartada, vuelve a "Revisar el dato". Provisional se queda
      delete S.dismissed[r.clave]; e.estadoSinGraves = 'revisar'; EP.P.ajustarAtencion(S.vm, S.dismissed); const conRev = e.estado;
      S.dismissed[r.clave] = true; EP.P.ajustarAtencion(S.vm, S.dismissed); const sinRev = e.estado;
      delete S.dismissed[r.clave]; e.estadoSinGraves = 'provisional'; EP.P.ajustarAtencion(S.vm, S.dismissed); const conProv = e.estado;
      e.estado = antes.estado; e.estadoSinGraves = antes.sinGraves; e.gravesTodas = antes.todas; EP.P.ajustarAtencion(S.vm, S.dismissed);
      return { clave: r.clave, esperada: 'todo_urgente|' + orden.join(','), cajonLeve: cajon.indexOf('Evidencia leve de ' + eqs[1].nombre) >= 0, cajonGrave: cajon.indexOf('Evidencia grave de') >= 0, con, sin, conRev, sinRev, conProv };
    });
    ok('recomendaciones: la clave sigue el orden del modelo, el cajón de un equipo es suyo y descartar quita "Pide atención"', otros.clave === otros.esperada && otros.cajonLeve && !otros.cajonGrave && otros.con === 'atencion' && otros.sin === 'estable'
      && otros.conRev === 'atencion' && otros.sinRev === 'revisar' && otros.conProv === 'provisional', JSON.stringify(otros));
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
    await ir(p, 'resumen'); await quieto(p);
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

// ---------- 13. Semáforo y textos: el chip y el texto dicen lo mismo; un límite fijo no se enseña como "lo normal" ----------
{
  const p = await pagina(1280, 800);
  await p.setInputFiles('#file-input', join(RAIZ, 'datos-sinteticos', 'jira-ejemplo-completo-2026-10-12.csv')); await p.waitForTimeout(500); await quieto(p);
  if (await p.$('[data-action="ob-rev-ok"]')) await clic(p, '[data-action="ob-rev-ok"]');
  await clic(p, '[data-action="ob-role"][data-role="pmo"]'); await clic(p, '[data-action="ob-finish"]');
  const r = await A(p, () => {
    const EP = window.EP, S = EP.S, K = EP.kit, mal = [], t = EP.t;
    S.vm.equipos.forEach((e) => Object.keys(e.medidas).forEach((id) => {
      const m = e.medidas[id];
      if (!m || !m.disponible || m.valor == null) return;
      const chip = K.estadoChip(m), rango = K.rango(id, m), porque = K.porque(id, m);
      // "Normal" dentro de su franja, o algo mejor que ella dentro del margen (que la barra pinta). Por el lado malo, nunca.
      const dir = EP.cat().medidas[id] ? EP.cat().medidas[id].dir : null, mg = m.margen || 0;
      const fuera = m.ref && (m.valor < m.ref.lo - 1e-9 || m.valor > m.ref.hi + 1e-9);
      const algoMejor = m.ref && dir && (dir === 'menos' ? m.valor < m.ref.lo && m.valor >= m.ref.lo - mg - 1e-9 : m.valor > m.ref.hi && m.valor <= m.ref.hi + mg + 1e-9);
      if (fuera && !algoMejor && chip.indexOf('>' + t('estado.bien') + '<') >= 0) mal.push(e.nombre + ' ' + id + ': Normal fuera de la franja');
      // Marcada por un límite fijo: ni "Lo normal" en el rango ni "Cerca" con un texto de superar
      if ((m.estadoPor === 'limite' || m.estadoPor === 'limite_equipo') && m.estado !== 'bien') {
        if (/Lo normal/.test(rango)) mal.push(e.nombre + ' ' + id + ': límite con "Lo normal"');
        if (m.estado === 'atencion' && /Supera/.test(rango + porque)) mal.push(e.nombre + ' ' + id + ': atención con "Supera"');
      }
    }));
    return mal;
  });
  ok('semáforo: "Normal" solo dentro de la franja; un límite fijo se enseña como límite', !r.length, r.slice(0, 4).join(' | '));
  ok('semáforo: sin errores', !p.errores.length, p.errores.join(' | '));
  await p.context().close();
}
// ---------- 14. Cargar datos: otro export desde cualquier rol, sustituir o sumar, y un export malo no pisa el bueno ----------
{
  const { variantes } = await import('../tests/variantes.ts');
  const V = variantes();
  const DS = join(RAIZ, 'datos-sinteticos');
  const comoFich = (nombre) => V[nombre].ficheros.map((f) => ({ name: f.nombre, mimeType: 'text/csv', buffer: Buffer.from(f.texto) }));
  const p = await pagina(1280, 800);
  await p.setInputFiles('#file-input', join(DS, 'jira-2026-04-06.csv')); await p.waitForTimeout(500); await quieto(p);
  if (await p.$('[data-action="ob-rev-ok"]')) await clic(p, '[data-action="ob-rev-ok"]');
  await clic(p, '[data-action="ob-role"][data-role="direccion"]'); await clic(p, '[data-action="ob-finish"]');
  await labs(p); // la línea "desde los datos del..." y la página Cortes son de Labs
  const boton = async () => A(p, () => { const b = document.querySelector('.sb-foot [data-action="import"]'); return !!b && b.offsetParent !== null; });
  const vDir = await boton(); await fijarRol(p, 'equipo'); const vEq = await boton(); await fijarRol(p, 'pmo');
  ok('cargar otro export: el botón está en todos los roles', vDir && vEq, JSON.stringify({ vDir, vEq }));
  // Segundo export: se pregunta; "sumar" junta los dos, "sustituir" deja solo el nuevo
  await p.setInputFiles('#file-input', join(DS, 'jira-ejemplo-completo-2026-10-12.csv')); await p.waitForTimeout(500); await quieto(p);
  const pregunta = !!(await p.$('[data-action="carga-sumar"]'));
  await clic(p, '[data-action="carga-sumar"]');
  const sumados = await A(p, () => window.EP.S.ficheros.map((f) => f.nombre));
  // El mismo nombre de fichero (Jira descarga todos igual) se suma con otro nombre, no sustituye
  await p.setInputFiles('#file-input', join(DS, 'jira-2026-04-06.csv')); await p.waitForTimeout(500); await quieto(p);
  await clic(p, '[data-action="carga-sumar"]');
  const mismoNombre = await A(p, () => window.EP.S.ficheros.map((f) => f.nombre));
  ok('sumar un fichero con el mismo nombre: se suma con otro nombre', mismoNombre.length === 3 && mismoNombre.indexOf('jira-2026-04-06 (2).csv') >= 0, JSON.stringify(mismoNombre));
  await p.setInputFiles('#file-input', join(DS, 'jira-2026-10-12-parte-a.csv')); await p.waitForTimeout(500); await quieto(p);
  await clic(p, '[data-action="carga-sustituir"]');
  const sustituido = await A(p, () => window.EP.S.ficheros.map((f) => f.nombre));
  await ir(p, 'resumen'); await quieto(p);
  const desde = await A(p, () => /Desde los datos del/.test(document.querySelector('#page').textContent));
  ok('Resumen: dice qué ha cambiado desde la carga anterior', desde);
  ok('otro export: se pregunta, "sumar" junta y "sustituir" deja solo el nuevo', pregunta && sumados.length === 2 && sustituido.length === 1 && /parte-a/.test(sustituido[0]), JSON.stringify({ sumados, sustituido }));
  // Los mismos datos con otra configuración no crean un corte repetido; el corte actual no se puede borrar
  const nCortes = await A(p, () => window.EP.S.cortes.length);
  await A(p, () => { const S = window.EP.S; S.cfg.fte = Object.assign({}, S.cfg.fte, { Pagos: 4 }); window.EP.guardarCfg(); window.EP.recalcular(); window.EP.cortes.capturar(false, true); });
  const nCortes2 = await A(p, () => window.EP.S.cortes.length);
  await ir(p, 'cortes'); await quieto(p);
  const borrarActual = await A(p, () => [...document.querySelectorAll('.rrow.corte')].filter((r) => r.querySelector('.chip.info')).some((r) => r.querySelector('[data-action="corte-borrar"]')));
  ok('cortes: otra configuración no crea un corte repetido y el actual no se borra', nCortes2 === nCortes && !borrarActual, JSON.stringify({ nCortes, nCortes2, borrarActual }));
  // Un export que no se puede medir: no se guarda, no deja corte, no tapa Iniciativas y se puede volver a los datos de antes
  const antesIdb = await A(p, async () => (await window.EP.idbGet('ficheros')).map((f) => f.nombre));
  await p.setInputFiles('#file-input', comoFich('soloAbiertas')); await p.waitForTimeout(500); await quieto(p);
  await clic(p, '[data-action="carga-sustituir"]');
  // Otro export malo seguido, y entrar y salir de la demo: los buenos siguen guardados
  await p.setInputFiles('#file-input', comoFich('soloAbiertas').map((f) => Object.assign({}, f, { name: 'otro-' + f.name }))); await p.waitForTimeout(500); await quieto(p);
  await clic(p, '[data-action="carga-sustituir"]');
  await A(p, () => { const b = document.createElement('button'); b.dataset.action = 'demo'; document.body.appendChild(b); b.click(); b.remove(); }); await p.waitForTimeout(300); await quieto(p);
  await clic(p, '[data-action="demo-exit"]');
  const malo = await A(p, async () => ({ aviso: !!document.querySelector('[data-action="carga-volver"]'), idb: (await window.EP.idbGet('ficheros')).map((f) => f.nombre), cortes: window.EP.S.cortes.length }));
  await ir(p, 'iniciativas'); await quieto(p);
  const iniVisible = await A(p, () => !!document.querySelector('#page [data-action="ini-nueva"], #page-actions [data-action="ini-nueva"]'));
  await clic(p, '[data-action="carga-volver"]');
  const vuelta = await A(p, () => window.EP.S.ficheros.map((f) => f.nombre));
  ok('export que no se puede medir: no pisa los ficheros buenos ni deja corte, Iniciativas se ve y se vuelve a lo anterior', malo.aviso && JSON.stringify(malo.idb) === JSON.stringify(antesIdb) && malo.cortes === nCortes && iniVisible && JSON.stringify(vuelta) === JSON.stringify(antesIdb), JSON.stringify({ malo, antesIdb, iniVisible, vuelta }));
  // Equipos nuevos: con equipos elegidos, un equipo que llega después se avisa y se puede medir; sus iniciativas no se esconden
  await A(p, () => { const S = window.EP.S; S.cfg.campoEquipo = S.vm.campoEquipo; S.cfg.equipos = S.vm.equiposMedidos.slice(0, 2); S.cfg.equiposDescartados = []; S.cfg.iniciativas = (S.cfg.iniciativas || []).concat([{ id: 'ini-fuera', nombre: 'De un equipo fuera', equipos: [S.vm.equiposMedidos[3]], fecha_inicio: '2026-08-03', fecha_fin: null, medidas_objetivo: [{ medida: 'ciclo', direccion: 'bajar' }], estado: 'planificada', origen: 'propia' }]); window.EP.guardarCfg(); window.EP.recalcular(); window.EP.go('resumen'); });
  await quieto(p);
  const nuevos = await A(p, () => ({ lista: window.EP.S.vm.fuera.nuevos, aviso: !!document.querySelector('[data-action="eq-nuevos-anadir"]') }));
  await ir(p, 'iniciativas'); await quieto(p);
  const avisoIni = await A(p, () => /De un equipo fuera/.test(document.querySelector('#page').textContent));
  await ir(p, 'resumen'); await quieto(p);
  await clic(p, '[data-action="eq-nuevos-anadir"]');
  const medidos = await A(p, () => window.EP.S.vm.equiposMedidos.length);
  ok('equipos nuevos: se avisan, se pueden medir y sus iniciativas no se esconden', nuevos.lista.length >= 1 && nuevos.aviso && avisoIni && medidos >= 3, JSON.stringify({ nuevos, avisoIni, medidos }));
  // Lo que queda fuera de la medición se dice (equipos no medidos y tareas sin equipo)
  await A(p, () => { const S = window.EP.S, fuera = S.vm.equiposMedidos[S.vm.equiposMedidos.length - 1]; S.cfg.equipos = S.vm.equiposMedidos.slice(0, -1); S.cfg.equiposDescartados = [fuera]; window.EP.guardarCfg(); window.EP.recalcular(); window.EP.go('resumen'); });
  await quieto(p);
  const fueraTxt = await A(p, () => ({ f: window.EP.S.vm.fuera, txt: /Fuera de la medición/.test(document.querySelector('#page').textContent), nuevo: !!document.querySelector('[data-action="eq-nuevos-anadir"]') }));
  ok('fuera de la medición: se dice qué equipos no se miden y no se ofrecen como nuevos si se descartaron', fueraTxt.txt && !fueraTxt.nuevo && fueraTxt.f.fuera.length === 1, JSON.stringify(fueraTxt));
  ok('cargar datos: sin errores', !p.errores.length, p.errores.join(' | '));
  await p.context().close();
}

// ---------- 15. Personalizar y roles: solo indicadores medibles; el rol Equipo ve y crea lo de su equipo ----------
{
  const { variantes } = await import('../tests/variantes.ts');
  const p = await pagina(1280, 800);
  await p.setInputFiles('#file-input', variantes().sinTiempos.ficheros.map((f) => ({ name: f.nombre, mimeType: 'text/csv', buffer: Buffer.from(f.texto) }))); await p.waitForTimeout(500); await quieto(p);
  if (await p.$('[data-action="ob-rev-ok"]')) await clic(p, '[data-action="ob-rev-ok"]');
  await clic(p, '[data-action="ob-role"][data-role="direccion"]'); await clic(p, '[data-action="ob-finish"]');
  // Un indicador elegido que no se puede medir (tiempo de ciclo sin tiempos): sale marcado con el motivo, cuenta y se puede cambiar
  const r = await A(p, () => {
    const EP = window.EP, S = EP.S; S.prefs.byRole.direccion = ['ciclo', 'entregas', 'bugs', 'wip']; EP.guardarPrefs();
    EP.openDrill({ kind: 'personalizar' });
    const marcados = [...document.querySelectorAll('input[data-change="pref-tile"]:checked')].map((x) => x.value);
    const fila = [...document.querySelectorAll('#drawer label.check')].filter((l) => l.querySelector('input').value === 'ciclo')[0];
    return { medible: EP.kit.medible('ciclo'), marcados, cuenta: /Elegidos: 4 de 4/.test(document.querySelector('#drawer').textContent), motivo: fila ? /no se puede medir/.test(fila.textContent) : false };
  });
  const cambio = await A(p, () => {
    document.querySelector('input[data-change="pref-tile"][value="ciclo"]').click();
    const libre = [...document.querySelectorAll('input[data-change="pref-tile"]:not(:checked)')].filter((x) => window.EP.kit.medible(x.value) && x.value !== 'ciclo')[0]; libre.click();
    return window.EP.kit.destacados();
  });
  ok('Personalizar: lo que cuenta coincide con lo marcado; un indicador que no se puede medir lo dice y se cambia por otro', !r.medible && r.marcados.length === 4 && r.cuenta && r.motivo && cambio.length === 4 && cambio.indexOf('ciclo') < 0, JSON.stringify({ r, cambio }));
  await A(p, () => window.EP.openDrill(null));
  // Rol Equipo: no hereda "Comparar equipos" y solo puede crear iniciativas de su equipo
  await fijarRol(p, 'pmo');
  await ir(p, 'equipos'); await quieto(p);
  await A(p, () => { const b = document.querySelector('[data-action="team-tab"][data-team="__comparar"]'); if (b) b.click(); }); await quieto(p);
  await fijarRol(p, 'equipo');
  await ir(p, 'equipos'); await quieto(p);
  const titulo = await A(p, () => document.querySelector('#page-title').textContent);
  await ir(p, 'iniciativas'); await quieto(p);
  await clic(p, '#page-actions [data-action="ini-nueva"]');
  const equiposForm = await A(p, () => [...document.querySelectorAll('#form-ini input[name="equipos"]')].map((x) => x.value));
  ok('rol Equipo: no sale "Comparar equipos" y la iniciativa solo puede ser de su equipo', !/Comparar/.test(titulo) && equiposForm.length === 1, JSON.stringify({ titulo, equiposForm }));
  ok('Personalizar y roles: sin errores', !p.errores.length, p.errores.join(' | '));
  await p.context().close();
}

// ---------- 16. Lenguaje: un solo término (Baseline), cifras con unidad, ayuda de cada página y Resumen en una pantalla ----------
{
  const p = await pagina(1280, 720);
  await p.setInputFiles('#file-input', join(RAIZ, 'datos-sinteticos', 'jira-ejemplo-completo-2026-10-12.csv')); await p.waitForTimeout(500); await quieto(p);
  if (await p.$('[data-action="ob-rev-ok"]')) await clic(p, '[data-action="ob-rev-ok"]');
  await clic(p, '[data-action="ob-role"][data-role="direccion"]'); await clic(p, '[data-action="ob-finish"]');
  // Ninguna página dice "lo normal", "línea base", "rango habitual", "franja", "Context" ni "KPI"
  const malas = [];
  for (const rol of ['direccion', 'pmo', 'equipo']) {
    await fijarRol(p, rol);
    for (const v of await A(p, () => window.EP.POR_ROL[window.EP.S.role])) {
      await ir(p, v); await quieto(p);
      const txt = await A(p, () => document.querySelector('.content').innerText);
      const m = txt.match(/.{0,30}\b(lo normal|Lo normal|[Ll][ií]neas? base|rango habitual|lo habitual|habitual era|semanas de referencia|franja|Context|KPI)\b.{0,30}/);
      if (m) malas.push(rol + '/' + v + ': ' + m[0].replace(/\s+/g, ' '));
    }
  }
  ok('lenguaje: un solo término (Baseline) y sin palabras en inglés en ninguna página', !malas.length, malas.slice(0, 3).join(' | '));
  await fijarRol(p, 'direccion'); await ir(p, 'equipos'); await quieto(p);
  const unidades = await A(p, () => [...document.querySelectorAll('.tile[data-medida]')].map((x) => ({ id: x.dataset.medida, u: (x.querySelector('.t-unit') || {}).textContent || '' })));
  ok('cifras con unidad y con las semanas que miran', unidades.length > 0 && unidades.every((x) => /semana/.test(x.u)), JSON.stringify(unidades));
  await A(p, () => window.EP.openDrill({ kind: 'ayuda' }));
  const ayuda = await A(p, () => ({ pregunta: /Esta página responde/.test(document.querySelector('#drawer').textContent), etiquetas: document.querySelectorAll('#drawer .leyenda > div').length }));
  await A(p, () => window.EP.openDrill(null));
  ok('"Cómo leerlo": qué responde la página y todas las etiquetas', ayuda.pregunta && ayuda.etiquetas >= 10, JSON.stringify(ayuda));
  await ir(p, 'resumen'); await quieto(p);
  const pantalla = await A(p, () => ({ equipos: document.querySelector('.fichas.cols-2').getBoundingClientRect().top, fab: !document.getElementById('assistant-fab').classList.contains('hidden') }));
  ok('Resumen: los equipos empiezan en la primera pantalla (1280 x 720) y sin clave de IA no hay botón Preguntar', pantalla.equipos < 720 && !pantalla.fab, JSON.stringify(pantalla));
  ok('lenguaje: sin errores', !p.errores.length && !Object.keys(await A(p, () => window.__faltan || {})).length, p.errores.join(' | '));
  await p.context().close();
}

// ---------- 17. Navegación: el mismo menú corto para todos, Qué hacer y Datos con pestañas, Compartir y Labs ----------
{
  const p = await pagina(1280, 720);
  await p.setInputFiles('#file-input', join(RAIZ, 'datos-sinteticos', 'jira-ejemplo-completo-2026-10-12.csv')); await p.waitForTimeout(500); await quieto(p);
  if (await p.$('[data-action="ob-rev-ok"]')) await clic(p, '[data-action="ob-rev-ok"]');
  await clic(p, '[data-action="ob-role"][data-role="pmo"]'); await clic(p, '[data-action="ob-finish"]');
  // Primera visita: recorrido de tres pasos (Resumen, Baseline, Qué hacer) que se puede terminar
  const pasos = [];
  for (let i = 0; i < 3; i++) { pasos.push(await A(p, () => ({ v: window.EP.S.view, paso: (document.querySelector('.recorrido .tiny') || {}).textContent || '' }))); await clic(p, '[data-action="recorrido-sig"]'); }
  const trasRecorrido = await A(p, () => ({ hay: !!document.querySelector('.recorrido'), hecho: !!window.EP.S.prefs.recorridoHecho }));
  ok('recorrido de primera visita: Resumen, Baseline y Qué hacer, y no vuelve a salir', pasos.map((x) => x.v).join(',') === 'resumen,referencias,recomendaciones' && pasos.every((x, i) => x.paso.indexOf(String(i + 1)) >= 0) && !trasRecorrido.hay && trasRecorrido.hecho, JSON.stringify({ pasos, trasRecorrido }));
  await ir(p, 'resumen'); await quieto(p);
  const menu = () => A(p, () => [...document.querySelectorAll('#nav button')].filter((b) => !b.classList.contains('hidden')).map((b) => b.dataset.view));
  const menus = {};
  for (const rol of ['direccion', 'pmo', 'equipo']) { await fijarRol(p, rol); menus[rol] = (await menu()).join(','); }
  ok('menú: el mismo para los tres roles, Baseline la segunda entrada, seis entradas y Ajustes; el PMO empieza en el Resumen', pasos[0].v === 'resumen' && menus.direccion === menus.pmo && menus.pmo === menus.equipo && menus.pmo.split(',').length <= 7 && menus.pmo.indexOf('cortes') < 0 && menus.pmo.split(',')[1] === 'referencias', JSON.stringify({ menus }));
  await fijarRol(p, 'pmo');
  await ir(p, 'recomendaciones'); await quieto(p);
  const tabsQh = await A(p, () => [...document.querySelectorAll('.sub-tabs .tab')].map((x) => x.dataset.view).join(','));
  await ir(p, 'calidad'); await quieto(p);
  const tabsDatos = await A(p, () => [...document.querySelectorAll('.sub-tabs .tab')].map((x) => x.dataset.view).join(','));
  await ir(p, 'fuentes'); await quieto(p);
  const marcado = await A(p, () => document.querySelector('#nav button.active').dataset.view);
  ok('Qué hacer y Datos: dos pestañas cada uno, y el menú marca su entrada', tabsQh === 'recomendaciones,iniciativas' && tabsDatos === 'calidad,fuentes' && marcado === 'calidad', JSON.stringify({ tabsQh, tabsDatos, marcado }));
  await ir(p, 'resumen'); await quieto(p);
  await clic(p, '#page-actions [data-kind="compartir"]');
  const compartir = await A(p, () => [...document.querySelectorAll('#drawer .compartir')].map((x) => x.dataset.action).join(','));
  await A(p, () => window.EP.openDrill(null));
  const area = await A(p, () => /Toda el área/.test(document.querySelector('#page').textContent));
  ok('Compartir junta presentar, texto, imprimir y documentos; el Resumen enseña toda el área', compartir === 'present,drill,print,exp-docx' && area, JSON.stringify({ compartir, area }));
  // Labs: apagado, ni Cortes ni IA; encendido, aparecen
  await ir(p, 'ajustes'); await quieto(p);
  const sinLabs = await A(p, () => ({ ia: !!document.getElementById('ia-clave'), cortes: !document.querySelector('#nav [data-view="cortes"]').classList.contains('hidden') }));
  await A(p, () => document.querySelector('input[data-change="labs"]').click()); await quieto(p);
  const conLabs = await A(p, () => ({ ia: !!document.getElementById('ia-clave'), cortes: !document.querySelector('#nav [data-view="cortes"]').classList.contains('hidden') }));
  ok('Labs: apagado no se ven IA ni Cortes; encendido, sí', !sinLabs.ia && !sinLabs.cortes && conLabs.ia && conLabs.cortes, JSON.stringify({ sinLabs, conLabs }));
  // Con Labs apagado: el Resumen no enlaza a Cortes, Cortes no se abre y el asistente se cierra
  await A(p, () => { window.EP.S.chat.open = true; window.EP.render(); });
  const chatAntes = await A(p, () => !document.getElementById('assistant').classList.contains('hidden'));
  await A(p, () => document.querySelector('input[data-change="labs"]').click()); await quieto(p);
  await ir(p, 'resumen'); await quieto(p);
  const sinCortes = await A(p, () => ({ linea: !!document.querySelector('#page [data-view="cortes"]'), chat: !document.getElementById('assistant').classList.contains('hidden'), abierto: window.EP.S.chat.open }));
  await ir(p, 'cortes'); await quieto(p);
  const vistaCortes = await A(p, () => window.EP.S.view);
  ok('Labs apagado: sin enlace a Cortes, Cortes no se abre y el asistente se cierra', chatAntes && !sinCortes.linea && !sinCortes.chat && !sinCortes.abierto && vistaCortes === 'resumen', JSON.stringify({ chatAntes, sinCortes, vistaCortes }));
  // El recorrido: ir a otra página lo termina y no vuelve a salir fuera de contexto
  await ir(p, 'ajustes'); await quieto(p); await clic(p, '[data-action="recorrido-ver"]');
  await clic(p, '[data-action="recorrido-sig"]'); // paso 2: Equipos
  await fijarRol(p, 'direccion'); await ir(p, 'equipos'); await quieto(p);
  const fueraDeSitio = await A(p, () => ({ tarjeta: !!document.querySelector('.recorrido'), paso: window.EP.S.recorrido }));
  ok('recorrido: cambiar de rol o de página a mitad lo termina', !fueraDeSitio.tarjeta && !fueraDeSitio.paso, JSON.stringify(fueraDeSitio));
  // Al recargar, cada rol empieza en su página (el recorrido ya está visto)
  await fijarRol(p, 'pmo'); await p.reload(); await p.waitForTimeout(500); await quieto(p);
  const inicioPmo = await A(p, () => ({ v: window.EP.S.view, rec: window.EP.S.recorrido || 0 }));
  ok('al recargar, el PMO empieza en el Resumen y no vuelve el recorrido', inicioPmo.v === 'resumen' && !inicioPmo.rec, JSON.stringify(inicioPmo));
  // Pestañas: se marcan como página actual y el foco se queda en la elegida
  await ir(p, 'recomendaciones'); await quieto(p);
  await p.focus('.sub-tabs [data-view="iniciativas"]'); await p.keyboard.press('Enter'); await p.waitForTimeout(200); await quieto(p);
  const foco = await A(p, () => ({ v: window.EP.S.view, foco: document.activeElement && document.activeElement.dataset.view, actual: (document.querySelector('.sub-tabs [aria-current="page"]') || {}).dataset?.view, titulo: document.querySelector('#page-title') ? document.querySelector('#page-title').textContent : '' }));
  ok('pestañas: Iniciativas se marca, conserva el foco y lleva el título de Qué hacer', foco.v === 'iniciativas' && foco.foco === 'iniciativas' && foco.actual === 'iniciativas' && foco.titulo === 'Qué hacer', JSON.stringify(foco));
  ok('navegación: sin errores', !p.errores.length && !Object.keys(await A(p, () => window.__faltan || {})).length, p.errores.join(' | '));
  await p.context().close();
}

// ---------- 18. Auditoría UX (P0): manda la baseline, la fiabilidad llega a cada cifra y un estado por equipo ----------
{
  const abrir = async (ruta) => {
    const p = await pagina(1440, 900);
    await p.setInputFiles('#file-input', ruta); await p.waitForTimeout(500); await quieto(p);
    const veredicto = await p.textContent('#onboarding [data-tipo="veredicto"]');
    await clic(p, '[data-action="ob-rev-ok"]');
    await clic(p, '[data-action="ob-role"][data-role="direccion"]'); await clic(p, '[data-action="ob-finish"]');
    await A(p, () => { const b = document.querySelector('[data-action="recorrido-fin"]'); if (b) b.click(); }); await quieto(p);
    return { p, veredicto };
  };
  // Lo que se ve de cada equipo en el Resumen: el chip, y el tono y el texto de cada fila
  const filas = (p) => A(p, () => [...document.querySelectorAll('#page .ficha')].filter((f) => f.querySelector('.fbs')).map((f) => ({
    equipo: (f.querySelector('.f-title') || {}).textContent, chip: (f.querySelector('.f-head .chip') || {}).textContent || '',
    filas: [...f.querySelectorAll('.fb')].map((r) => ({ medida: r.dataset.medida, tono: (r.querySelector('.fb-v').className.match(/t-(\w+)/) || [])[1], lim: !!r.querySelector('.b-lim'), margen: !!r.querySelector('.b-margen'), banda: !!r.querySelector('.b-band') })),
  })));
  {
    const { p } = await abrir(join(RAIZ, 'datos-sinteticos', 'aseguradora', 'jira-aseguradora.csv'));
    const vm = await A(p, () => window.EP.S.vm.equipos.map((e) => ({ nombre: e.nombre, estado: e.estado, graves: e.graves.length, ret: e.medidas.retrabajo && { v: e.medidas.retrabajo.valor, lo: e.medidas.retrabajo.ref && e.medidas.retrabajo.ref.lo, estado: e.medidas.retrabajo.estado, aviso: !!e.medidas.retrabajo.aviso } })));
    // Una mejora frente a su baseline no es una alerta: Digital Channel baja su retrabajo al 22 % (baseline 25 % a 35 %)
    const dc = vm.find((e) => e.nombre === 'Digital Channel');
    ok('auditoría: un retrabajo que mejora frente a su baseline sale normal, con el límite fijo como aviso', dc.ret.v < dc.ret.lo && dc.ret.estado === 'bien' && dc.ret.aviso && dc.estado !== 'alerta', JSON.stringify(dc));
    const res = await filas(p);
    const dcEq = res.find((x) => x.equipo === 'Digital Channel'), dcFila = dcEq && dcEq.filas.find((f) => f.medida === 'retrabajo');
    ok('auditoría: en la barra, el límite fijo es una marca aparte y la cifra no sale en ámbar', !!dcFila && dcFila.lim && dcFila.tono !== 'warn' && dcFila.tono !== 'bad', JSON.stringify(dcFila || res.map((x) => x.equipo)));
    // Donde hay baseline (la franja), se pinta también el margen
    const conBanda = res.flatMap((x) => x.filas.filter((f) => f.banda).map((f) => Object.assign({ equipo: x.equipo }, f)));
    ok('auditoría: la barra pinta el margen alrededor de la baseline', conBanda.length > 0 && conBanda.every((f) => f.margen), JSON.stringify(conBanda.filter((f) => !f.margen).map((f) => f.equipo + ':' + f.medida)));
    // El pie de un equipo con una recomendación urgente: "dentro de su baseline" solo si no hay nada por revisar
    const pies = await A(p, () => {
      const V = window.EP.vistas, base = { nombre: 'X', cambios: [], graves: ['todo_urgente'], mejores: [], avisos: [], medidas: {}, estado: 'atencion' };
      return { limpio: V.pieFicha(Object.assign({}, base, { revisarDato: [] })), conDato: V.pieFicha(Object.assign({}, base, { revisarDato: ['ciclo'] })) };
    });
    ok('auditoría: con una recomendación urgente y un dato por revisar, el pie no dice "dentro de su baseline"', /dentro de su baseline/i.test(pies.limpio) && !/dentro de su baseline/i.test(pies.conDato) && /Revisar el dato/.test(pies.conDato), JSON.stringify(pies));
    // "Mucho retrabajo" no salta en un equipo que mejora frente a su baseline
    const recs = await A(p, () => window.EP.S.vm.recs.filter((r) => r.id === 'retrabajo').map((r) => r.equipos));
    ok('auditoría: "Mucho retrabajo" solo en el equipo que empeora (Policies), no en Digital Channel', recs.length === 1 && recs[0].indexOf('Policies') >= 0 && recs[0].indexOf('Digital Channel') < 0, JSON.stringify(recs));
    // Un estado por equipo: con una recomendación urgente, nunca "Estable"; el mismo chip en el Resumen y en la presentación
    ok('auditoría: ningún equipo con una recomendación urgente sale "Estable"', vm.every((e) => !e.graves || e.estado !== 'estable'), JSON.stringify(vm.map((e) => e.nombre + ':' + e.estado + ':' + e.graves)));
    const chipsResumen = Object.fromEntries(res.filter((x) => x.chip).map((x) => [x.equipo, x.chip]));
    await A(p, () => { window.EP.S.presenting = true; window.EP.S.slide = 0; window.EP.render(); });
    const chipsPres = {};
    for (let i = 0; i < 8; i++) {
      const r = await A(p, () => ({ t: (document.querySelector('#present .slide-head h1') || {}).textContent, c: (document.querySelector('#present .slide-head .chip') || {}).textContent }));
      if (r.t && r.c) chipsPres[r.t] = r.c;
      await p.keyboard.press('ArrowRight'); await p.waitForTimeout(60);
    }
    await p.keyboard.press('Escape');
    const distintos = Object.keys(chipsPres).filter((k) => chipsResumen[k] && chipsResumen[k] !== chipsPres[k]);
    ok('auditoría: el estado de cada equipo es el mismo en el Resumen y en la presentación', Object.keys(chipsPres).length >= 5 && !distintos.length, JSON.stringify({ chipsResumen, chipsPres }));
    // Épicas: sin fechas de vencimiento, ni un 0 ni en verde
    await ir(p, 'epicas'); await quieto(p);
    const riesgo = await A(p, () => { const t = [...document.querySelectorAll('#page .tiles > *')].find((x) => /VENCIDAS|vencidas/i.test(x.innerText)); return t ? { texto: t.innerText, verde: !!t.querySelector('.tone-good, .t-good, .good') } : null; });
    ok('auditoría: Épicas sin vencimientos no enseña un 0 en verde', riesgo && /sin datos/.test(riesgo.texto) && !riesgo.verde, JSON.stringify(riesgo));
    ok('sin errores de consola en la sección de la auditoría (aseguradora)', !p.errores.length, p.errores.slice(0, 3).join(' | '));
    await p.context().close();
  }
  {
    const { p, veredicto } = await abrir(join(RAIZ, 'datos-sinteticos', 'fallos', 'jira-con-fallos.csv'));
    ok('auditoría: con fiabilidad baja, el veredicto es "Se puede mirar, no decidir"', /Se puede mirar, no decidir/.test(veredicto), veredicto.slice(0, 80));
    ok('auditoría: con fiabilidad baja, el titular del Resumen lo dice', /no decidir/.test(await p.textContent('#page .status')), '');
    // Lo que depende de una comprobación que falla no sale en verde ni "mejor": Payments salta el en curso en 1 de cada 3 tareas
    const dud = await A(p, () => window.EP.S.vm.equipos.flatMap((e) => Object.values(e.medidas).filter((m) => m && m.revisar === 'dato').map((m) => ({ e: e.nombre, id: m.id, estado: m.estado, lado: m.lado || null, tono: window.EP.kit.tonoDe(m) }))));
    const pay = dud.filter((x) => x.e === 'Payments').map((x) => x.id);
    ok('auditoría: en Payments, tiempo de ciclo y retrabajo salen "Revisar el dato"', pay.indexOf('ciclo') >= 0 && pay.indexOf('retrabajo') >= 0, JSON.stringify(pay));
    ok('auditoría: ninguna cifra dudosa sale en verde', dud.length > 0 && dud.every((x) => x.tono !== 'good'), JSON.stringify(dud.filter((x) => x.tono === 'good')));
    // En pantalla: ni la cifra ni la marca de una medida dudosa salen en verde, tampoco en Toda el área
    const enPantalla = await A(p, () => {
      const S = window.EP.S, todos = [S.vm.area].concat(S.vm.equipos), mal = [], vistas = [];
      todos.forEach((e) => Object.keys(e.medidas).forEach((id) => {
        const m = e.medidas[id]; if (!m || m.revisar !== 'dato') return;
        document.querySelectorAll(`#page .fb[data-team="${CSS.escape(e.nombre)}"][data-medida="${CSS.escape(id)}"]`).forEach((r) => {
          vistas.push(e.nombre + ':' + id);
          if (r.querySelector('.fb-v.t-good') || r.querySelector('.b-now.tone-good')) mal.push(e.nombre + ':' + id);
        });
      }));
      const a = S.vm.area;
      return { mal, vistas: vistas.length, area: Object.keys(a.medidas).filter((id) => a.medidas[id] && a.medidas[id].revisar === 'dato').map((id) => id + ' ' + Math.round((a.medidas[id].dudosoParte || 0) * 100) + '%'), areaNombre: a.nombre };
    });
    ok('auditoría: en el Resumen, ninguna cifra dudosa sale en verde (equipos y Toda el área)', enPantalla.vistas > 0 && !enPantalla.mal.length, JSON.stringify(enPantalla));
    ok('auditoría: en Toda el área, una cifra que es dudosa en equipos con el 25 % de las tareas o más sale "Revisar el dato"', enPantalla.area.length > 0, JSON.stringify(enPantalla));
    const pregs = await A(p, () => [...document.querySelectorAll('#page details.preg')].map((d) => d.querySelector('summary .chip').textContent));
    ok('auditoría: con datos por revisar en equipos de la pregunta, "¿Vamos al ritmo de siempre?" no responde "Sí"', pregs.length && pregs[0] !== 'Sí', JSON.stringify(pregs));
    ok('sin errores de consola en la sección de la auditoría (export con fallos)', !p.errores.length, p.errores.slice(0, 3).join(' | '));
    await p.context().close();
  }
}

// ---------- 19. La baseline como columna vertebral: página Baseline, Resumen, Qué hacer, Comparar e Iniciativas ----------
{
  const p = await pagina(1280, 800);
  await clic(p, '[data-action="demo"]'); await p.waitForTimeout(300); await quieto(p);
  await fijarIdioma(p, 'es'); await fijarRol(p, 'direccion');
  // Página Baseline: toda el área y cada equipo, cada indicador destacado con su gráfico y el mismo color que su estado
  await ir(p, 'referencias'); await quieto(p);
  const bl = await A(p, () => {
    const EP = window.EP, K = EP.kit, vm = EP.S.vm, dest = K.destacados();
    const fichas = [...document.querySelectorAll('#page [data-tipo="baseline"]')];
    const malTono = [], sinGrafico = [];
    fichas.forEach((f) => f.querySelectorAll('.bl').forEach((b) => {
      const e = b.dataset.team === vm.area.nombre ? vm.area : vm.equipos.find((x) => x.nombre === b.dataset.team), m = e && e.medidas[b.dataset.medida];
      const tono = ((b.querySelector('.bl-cifras b') || {}).className || '').replace('t-', '');
      if (tono !== K.tonoDe(m)) malTono.push(b.dataset.team + ':' + b.dataset.medida + ' ' + tono + '/' + K.tonoDe(m));
      if (m && m.disponible && Array.isArray(m.serie) && !b.querySelector('svg.grafico')) sinGrafico.push(b.dataset.team + ':' + b.dataset.medida);
    }));
    const prov = EP.visibles().filter(K.baselineProvisional).length;
    const cuenta = (document.querySelector('#nav [data-view="referencias"] .count') || {}).textContent || '';
    return { fichas: fichas.length, equipos: EP.visibles().length, bloques: fichas.map((f) => f.querySelectorAll('.bl').length), dest: dest.length, primera: fichas[0] && fichas[0].dataset.team, area: vm.area.nombre,
      malTono, sinGrafico, prov, cuenta, titular: document.querySelector('#page .status b').textContent, leyenda: !!document.querySelector('#page .bl-leyenda') };
  });
  ok('Baseline: toda el área primero y una ficha por equipo, cada una con sus indicadores destacados', bl.fichas === bl.equipos + 1 && bl.primera === bl.area && bl.bloques.every((n) => n === bl.dest) && bl.leyenda, JSON.stringify(bl));
  ok('Baseline: cada indicador con su gráfico y la cifra del color de su estado', !bl.malTono.length && !bl.sinGrafico.length, JSON.stringify({ malTono: bl.malTono, sinGrafico: bl.sinGrafico }));
  ok('Baseline: el titular y el número del menú cuentan los mismos equipos con baseline provisional', (bl.prov ? /provisional/.test(bl.titular) && bl.cuenta === String(bl.prov) : /Todas las baselines/.test(bl.titular) && !bl.cuenta), JSON.stringify({ prov: bl.prov, cuenta: bl.cuenta, titular: bl.titular }));
  // Resumen: primero la baseline de cada equipo, después por dónde empezar (en el orden de Qué hacer) y al final las preguntas
  await ir(p, 'resumen'); await quieto(p);
  const res = await A(p, () => {
    const h = [...document.querySelectorAll('#page .sec h2')].map((x) => x.textContent);
    const filas = [...document.querySelectorAll('#page .que-hacer .rrow')].map((r) => r.querySelector('b').textContent);
    return { h, filas, recs: window.EP.vistas.recsActivas(window.EP.visibles()).map((r) => r.titulo) };
  });
  const iB = res.h.indexOf('Cada equipo frente a su baseline'), iE = res.h.indexOf('Por dónde empezar'), iP = res.h.indexOf('Preguntas de dirección');
  ok('Resumen: la baseline primero, después por dónde empezar y al final las preguntas de dirección', iB >= 0 && iB < iE && iE < iP, JSON.stringify(res.h));
  ok('Resumen: por dónde empezar son las tres primeras de Qué hacer, en el mismo orden', res.filas.length === Math.min(3, res.recs.length) && res.filas.every((x, i) => x === res.recs[i]), JSON.stringify(res));
  // Qué hacer: cada recomendación con medida enseña esa medida en sus equipos frente a su baseline, con la cifra del equipo
  await ir(p, 'recomendaciones'); await quieto(p);
  const qh = await A(p, () => {
    const EP = window.EP, vm = EP.S.vm, mal = [];
    let con = 0, deberian = 0;
    document.querySelectorAll('#page [data-rec]').forEach((f) => {
      const r = vm.recs.find((x) => x.clave === f.dataset.rec);
      const posibles = r && r.medida ? r.equipos.filter((n) => { const e = vm.equipos.find((x) => x.nombre === n), m = e && e.medidas[r.medida]; return m && m.disponible && m.ref && Array.isArray(m.serie); }) : [];
      const minis = [...f.querySelectorAll('.mini-bl')];
      if (posibles.length) deberian++;
      if (minis.length) con++;
      if (posibles.length && !minis.length) mal.push('sin gráfico: ' + r.titulo);
      minis.forEach((x) => {
        const e = vm.equipos.find((y) => y.nombre === x.dataset.team), m = e && e.medidas[x.dataset.medida];
        if (!r || x.dataset.medida !== r.medida || r.equipos.indexOf(x.dataset.team) < 0) mal.push('otra medida o equipo: ' + x.dataset.team + ':' + x.dataset.medida);
        else if (x.querySelector('.mini-cab b').textContent !== EP.valor(x.dataset.medida, m.valor) || !x.querySelector('svg.grafico .g-band')) mal.push('cifra o baseline: ' + x.dataset.team + ':' + x.dataset.medida);
      });
    });
    return { con, deberian, mal };
  });
  ok('Qué hacer: cada recomendación con medida enseña su gráfico frente a la baseline de sus equipos, con su cifra', qh.deberian > 0 && qh.con === qh.deberian && !qh.mal.length, JSON.stringify(qh));
  // Comparar: cada cifra sobre la baseline de su propio equipo; la baseline en el centro y lo mejor siempre a la derecha
  await fijarRol(p, 'pmo'); await ir(p, 'equipos'); await A(p, () => document.querySelector('[data-team="__comparar"]').click()); await quieto(p);
  const cmp = await A(p, () => {
    const EP = window.EP, K = EP.kit, vm = EP.S.vm, mal = [];
    const marcas = [...document.querySelectorAll('#page .sobre-btn')];
    marcas.forEach((b) => {
      const e = b.dataset.team === vm.area.nombre ? vm.area : vm.equipos.find((x) => x.nombre === b.dataset.team), id = b.dataset.medida, m = e.medidas[id];
      const dir = (window.CATALOGO.medidas[id] || {}).dir, x = parseFloat(b.querySelector('.sb-now').style.left);
      const dentro = m.valor >= m.ref.lo && m.valor <= m.ref.hi, mejor = dir === 'menos' ? m.valor < m.ref.lo : m.valor > m.ref.hi;
      const bien = dentro ? x >= 30 && x <= 70 : mejor ? x > 70 : x < 30;
      if (!bien) mal.push(b.dataset.team + ':' + id + ' x=' + x);
      if (!b.querySelector('.sb-now').classList.contains('tone-' + K.tonoDe(m))) mal.push('color ' + b.dataset.team + ':' + id);
    });
    return { n: marcas.length, filas: document.querySelectorAll('#page table.cmp-bl tr').length - 1, equipos: vm.equipos.length, mal };
  });
  ok('Comparar: cada cifra sobre su propia baseline (en el centro), lo mejor a la derecha y el color de su estado', cmp.n > 0 && cmp.filas === cmp.equipos + 1 && !cmp.mal.length, JSON.stringify(cmp));
  // Iniciativas: el después se lee contra la baseline que tenían sus equipos antes de empezar
  await ir(p, 'iniciativas'); await quieto(p);
  const ini = await A(p, () => {
    const EP = window.EP, vm = EP.S.vm, mal = [];
    let con = 0;
    vm.iniciativas.forEach(({ ini, s }) => {
      const card = [...document.querySelectorAll('#page .ficha.ini')].find((c) => c.querySelector('.f-title').textContent === ini.nombre);
      if (!card) { mal.push('sin tarjeta: ' + ini.nombre); return; }
      if (!s.baseline) { if (card.querySelector('.ini-bl')) mal.push('baseline inventada: ' + ini.nombre); return; }
      con++;
      if (!card.querySelector('.ini-chart .ic-bl')) mal.push('sin baseline en el gráfico: ' + ini.nombre);
      if (s.despues == null) return;
      const bl = s.baseline, esperado = s.despues >= bl.lo && s.despues <= bl.hi ? 'Dentro' : (s.direccion === 'bajar' ? s.despues < bl.lo : s.despues > bl.hi) ? 'Mejor' : 'Peor';
      const chip = (card.querySelector('.ini-bl .chip') || {}).textContent || '';
      if (chip.indexOf(esperado) !== 0) mal.push(ini.nombre + ': ' + chip + ' / ' + esperado);
    });
    return { n: vm.iniciativas.length, con, mal };
  });
  ok('Iniciativas: el gráfico y el después frente a la baseline de antes de empezar', ini.con > 0 && !ini.mal.length, JSON.stringify(ini));
  // El rol Equipo ve solo la baseline de su equipo; en inglés, la página se llama igual
  await fijarRol(p, 'equipo'); await ir(p, 'referencias'); await quieto(p);
  const soloSuyo = await A(p, () => [...document.querySelectorAll('#page [data-tipo="baseline"]')].map((f) => f.dataset.team));
  ok('Baseline en el rol Equipo: solo su equipo, sin toda el área', soloSuyo.length === 1 && soloSuyo[0] === (await A(p, () => window.EP.S.team)), JSON.stringify(soloSuyo));
  await fijarIdioma(p, 'en'); await fijarRol(p, 'direccion'); await ir(p, 'referencias'); await quieto(p);
  const en = await A(p, () => ({ menu: document.querySelector('#nav [data-view="referencias"]').textContent, titulo: document.getElementById('page-title').textContent, titular: document.querySelector('#page .status b').textContent }));
  ok('Baseline en inglés', /Baseline/.test(en.menu) && en.titulo === 'Baseline' && /baselines? /i.test(en.titular), JSON.stringify(en));
  await fijarIdioma(p, 'es');
  await p.screenshot({ path: join(SALIDA, '19-baseline.png'), fullPage: true });
  ok('sin errores de consola en la sección de la baseline', !p.errores.length && !Object.keys(await A(p, () => window.__faltan || {})).length, p.errores.slice(0, 3).join(' | '));
  await p.context().close();
}

await navegador.close();
writeFileSync(join(SALIDA, 'resultados.json'), JSON.stringify(resultados, null, 1));
const mal = resultados.filter((r) => !r.bien);
console.log(`\n${resultados.length - mal.length}/${resultados.length} comprobaciones bien`);
process.exit(mal.length ? 1 : 0);
