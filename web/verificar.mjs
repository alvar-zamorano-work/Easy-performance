// Verificación de la página en Chromium: tablero, recomendaciones y cómo funciona, sin puesta en marcha.
//   npm run web && CHROME=/ruta/a/chrome node web/verificar.mjs
// Comprueba: entrada (sin presentación), demo en 1280x720 y 1920x1080 (sin scroll horizontal, sin errores de consola),
// modo oscuro, pantalla de móvil, Jira.csv de principio a fin (carga directa al tablero, mapeo de estados y proveedores
// cambiados y guardados, documento de definiciones y paquete), demo sin pisar la configuración, carpeta con dos
// iniciativas y una configuración de la versión anterior. Además, con animaciones: conectores de la entrada,
// el método de carga, la generación de recomendaciones, la lista con detalle y el registro de una iniciativa.
// Y los dos ejemplos con fallos (banco con un fallo por comprobación y aseguradora con tres): cada fallo lo detecta su
// comprobación, sin falsas alarmas, también al cargar el CSV desde la entrada; y la tabla de columnas real.
// Salvo en ese bloque, el navegador pide "reducir movimiento": la página no anima y va directa al resultado.

import { chromium } from 'playwright-core';
import { readFileSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const HTML = 'file://' + join(RAIZ, 'dist', 'EasyPerformance', 'EasyPerformance.html');
const SALIDA = join(RAIZ, 'dist', 'verificacion');
const CHROME = process.env.CHROME || [
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].find((r) => existsSync(r));
rmSync(SALIDA, { recursive: true, force: true });
mkdirSync(SALIDA, { recursive: true });

const resultados = [];
const ok = (nombre, bien, detalle = '') => { resultados.push({ nombre, bien, detalle }); console.log((bien ? 'OK   ' : 'FALLO') + ' ' + nombre + (detalle ? ' · ' + detalle : '')); };
const navegador = await chromium.launch({ executablePath: CHROME });

async function pagina(ancho, alto, opciones = {}) {
  const ctx = await navegador.newContext({ viewport: { width: ancho, height: alto }, colorScheme: opciones.oscuro ? 'dark' : 'light', acceptDownloads: true, reducedMotion: opciones.animar ? 'no-preference' : 'reduce' });
  const p = await ctx.newPage();
  p.errores = [];
  p.on('console', (m) => { if (m.type() === 'error') p.errores.push(m.text().split('\n')[0]); });
  p.on('pageerror', (e) => p.errores.push('pageerror: ' + e.message));
  await p.goto(HTML);
  await p.waitForTimeout(400);
  return p;
}
const A = (p, fn, arg) => p.evaluate(fn, arg);
const medir = (p) => A(p, () => ({ alto: document.documentElement.scrollHeight, ancho: document.documentElement.scrollWidth - innerWidth }));
const clic = async (p, sel) => { await p.click(sel); await p.waitForTimeout(250); };
const listo = (p) => p.waitForFunction(() => window.EasyPerformance.r && document.getElementById('ocupado').hidden, null, { timeout: 90000 });
const texto = (p, sel) => p.$eval(sel, (e) => e.textContent.trim());
/** Avanza la animación con el botón Siguiente hasta que aparece el selector (o el final). */
async function avanzarHasta(p, sel) {
  for (let k = 0; k < 10; k++) {
    if (await p.$(sel)) return true;
    const b = await p.$('.proc [data-proc="siguiente"]');
    if (!b) break;
    await b.click(); await p.waitForTimeout(250);
  }
  return !!(await p.$(sel));
}

/** Recorre tablero (área y cada equipo), recomendaciones y cómo funciona. Devuelve fallos de ancho y altos. */
async function recorrer(p, etiqueta, capturas) {
  const fallos = [], altos = [];
  const mirar = async (nombre) => {
    const m = await medir(p);
    if (m.ancho > 1) fallos.push(`${nombre}: ${m.ancho}px de scroll horizontal`);
    altos.push(`${nombre} ${m.alto}`);
    if (capturas) await p.screenshot({ path: join(SALIDA, `${etiqueta}-${nombre}.png`), fullPage: true });
  };
  await clic(p, '[data-accion="vista"][data-v="tablero"]');
  await p.selectOption('select[data-cambio="ver"]', 'area'); await p.waitForTimeout(200);
  await mirar('area');
  const eqs = await A(p, () => window.EasyPerformance.r.modelo.equipos.map((e) => e.nombre));
  for (const [i, e] of eqs.entries()) { await p.selectOption('select[data-cambio="ver"]', e); await p.waitForTimeout(200); await mirar('equipo-' + (i + 1)); }
  await p.selectOption('select[data-cambio="ver"]', 'area'); await p.waitForTimeout(150);
  await clic(p, '[data-accion="vista"][data-v="recomendaciones"]'); await mirar('recomendaciones');
  await clic(p, '[data-accion="vista"][data-v="iniciativas"]'); await mirar('iniciativas');
  await clic(p, '[data-accion="vista"][data-v="como"]');
  for (const s of ['metodo', 'fuentes', 'fiabilidad', 'datos']) { await clic(p, `[data-accion="como-sec"][data-s="${s}"]`); await mirar('como-' + s); }
  await clic(p, '[data-accion="como-sec"][data-s="metodo"]');
  await clic(p, '[data-accion="vista"][data-v="tablero"]');
  return { fallos, altos };
}

// 1. Entrada y demo: el fichero es directamente la demo, sin presentación
for (const [w, h] of [[1280, 720], [1920, 1080]]) {
  const p = await pagina(w, h);
  const entrada = await A(p, () => ({ vista: window.EasyPerformance.vista, zona: !!document.getElementById('zona'), ejemplos: document.querySelectorAll('.ejemplo[data-accion="demo"]').length,
    presentacion: !!document.querySelector('[data-accion="presentacion"]') || !!document.getElementById('laminas') }));
  const m0 = await medir(p);
  if (w === 1280) await p.screenshot({ path: join(SALIDA, 'entrada.png') });
  ok(`entrada en ${w}x${h}: cargar datos y tres ejemplos, sin presentación`, entrada.vista === 'inicio' && entrada.zona && entrada.ejemplos === 3 && !entrada.presentacion && m0.ancho <= 1 && m0.alto <= h + 1, `alto ${m0.alto}`);
  await clic(p, '[data-accion="demo"][data-d="b3"]');
  await listo(p);
  const enDemo = await A(p, () => ({ demo: window.EasyPerformance.demo, vista: window.EasyPerformance.vista }));
  ok(`el ejemplo abre el tablero con datos de ejemplo en ${w}x${h}`, enDemo.demo && enDemo.vista === 'tablero');
  const r = await recorrer(p, `demo-${w}`, true);
  ok(`demo: tablero, equipos, recomendaciones y cómo funciona sin scroll horizontal en ${w}x${h}`, !r.fallos.length, r.fallos.join('; ') + ' · altos: ' + r.altos.join(', '));
  ok(`demo sin errores de consola en ${w}x${h}`, !p.errores.length, p.errores.join(' | '));
  await p.context().close();
}

// 2. Contenido de la demo: lo sembrado en los datos sintéticos aparece donde toca
{
  const p = await pagina(1440, 900);
  await clic(p, '[data-accion="demo"]'); await listo(p);
  const cab = await A(p, () => ({ h1: document.querySelector('.cab-area h1').textContent, sub: document.querySelector('.cab-area p').textContent, foco: [...document.querySelectorAll('.estado-area .pill-eq')].map((x) => x.textContent), boton: !!document.querySelector('.cab-area [data-accion="generar"]') }));
  const filas = await p.$$eval('.tabla-equipos tbody tr', (t) => t.length);
  const grupos = await p.$$eval('.tabla-grupos td.peor', (t) => t.map((x) => x.textContent));
  const ini = await p.$$eval('.fila-ini', (t) => t.map((x) => x.textContent));
  ok('demo: cabecera con el área y el botón, y la franja de estado nombra a los dos equipos sembrados con problemas', cab.h1 === 'Banco ficticio' && /4 equipos: 2 internos y 2 de proveedores/.test(cab.sub) && cab.boton && cab.foco.length === 2 && cab.foco.some((x) => /App móvil/.test(x)) && cab.foco.some((x) => /Portal clientes/.test(x)), JSON.stringify(cab));
  ok('demo: tabla de equipos, internos y proveedores e iniciativas', filas === 4 && grupos.length >= 3 && ini.length === 2 && ini.some((x) => /Funciona/.test(x)), `${filas} equipos · ${grupos.length} medidas peor en proveedores · ${ini.length} iniciativas`);
  const coste = await A(p, () => ({ fila: [...document.querySelectorAll('.fila-coste th')].map((x) => x.textContent), celdas: [...document.querySelectorAll('.fila-coste td')].map((x) => x.textContent) }));
  ok('demo: entregas por FTE y coste por entrega de internos y proveedores', coste.fila.includes('Coste por entrega') && coste.celdas.every((x) => /\d/.test(x)) && coste.celdas.some((x) => /^\d\.\d{3} €$/.test(x)), coste.fila.join(', ') + ' · ' + coste.celdas.join(' | '));
  // Antes de generar, el equipo enseña qué está fuera de lo normal y el botón; sin animación, generar es inmediato
  await p.selectOption('select[data-cambio="ver"]', 'App móvil'); await p.waitForTimeout(200);
  const antes = await A(p, () => ({ boton: !!document.querySelector('.bloque-oscuro [data-accion="generar"]'), cuenta: !!document.querySelector('.pestana .cuenta') }));
  await clic(p, '.bloque-oscuro [data-accion="generar"]');
  const gen = await A(p, () => ({ vista: window.EasyPerformance.vista, generadas: window.EasyPerformance.generadas, items: document.querySelectorAll('.rec-item').length }));
  ok('recomendaciones: se generan con el botón (sin animación con reducir movimiento)', antes.boton && !antes.cuenta && gen.vista === 'recomendaciones' && gen.generadas && gen.items >= 3, JSON.stringify(gen));
  await clic(p, '[data-accion="vista"][data-v="tablero"]');
  const eq = await A(p, () => ({ t: document.querySelector('.cab-area h1').textContent, fuera: [...document.querySelectorAll('.kpi.kpi-critico .kpi-cab, .kpi.kpi-atencion .kpi-cab')].map((x) => x.textContent).join(', '), kpis: document.querySelectorAll('.kpi').length, graf: !!document.querySelector('.grafico polyline'), recs: document.querySelectorAll('.bloque-oscuro li').length }));
  ok('demo: vista de un equipo con indicadores, gráfico del plazo y sus recomendaciones', eq.kpis === 5 && eq.graf && eq.recs >= 2 && eq.t === 'App móvil' && /Retrabajo/.test(eq.fuera), `${eq.t} · fuera de lo normal: ${eq.fuera} · ${eq.recs} recomendaciones`);
  await clic(p, '.bloque-oscuro [data-accion="ver-recs"]');
  const filtro = await A(p, () => ({ f: window.EasyPerformance.recEquipo, items: document.querySelectorAll('.rec-item').length, todas: window.EasyPerformance.recomendaciones().filter((x) => x.equipos.includes('App móvil')).length }));
  ok('recomendaciones: "Ver qué hacer" filtra por el equipo', filtro.f === 'App móvil' && filtro.items === filtro.todas, JSON.stringify(filtro));
  await p.selectOption('select[data-cambio="rec-equipo"]', 'todos'); await p.waitForTimeout(200);
  const lista = await p.$$eval('.rec-item', (t) => t.map((x) => ({ t: x.querySelector('b').textContent, crit: !!x.querySelector('.chip-critico') })));
  const det = await A(p, () => { const d = document.querySelector('.rec-detalle'); return { h: d.querySelector('h2').textContent, paso: /Qué hacer primero/i.test(d.querySelector('.rec-resumen').textContent) && /Qué pasa/i.test(d.textContent), de: !!d.querySelector('.cifra'), plan: d.querySelectorAll('.rec-plan li').length, ini: /Cómo se sigue/i.test(d.textContent) }; });
  const funciona = await p.$$eval('.funciona', (t) => t.length);
  ok('recomendaciones: lista ordenada y detalle con qué pasa, qué hacer primero, cifras, plan y seguimiento', lista.length >= 3 && lista[0].crit && det.h === lista[0].t && det.paso && det.de && det.plan >= 2 && det.ini && funciona === 1, lista.map((x) => (x.crit ? 'crítico: ' : '') + x.t).join(' / '));
  await clic(p, '.rec-item:nth-child(2)');
  const det2 = await A(p, () => ({ h: document.querySelector('.rec-detalle h2').textContent, sel: document.querySelector('.rec-item[aria-current="true"] b').textContent, filas: [...document.querySelectorAll('.rec-detalle .cf-fila')].map((x) => x.textContent) }));
  ok('recomendaciones: al elegir otra se ve su detalle, con la cifra de cada equipo frente a lo normal', det2.h === lista[1].t && det2.sel === lista[1].t && det2.filas.length >= 2 && det2.filas.every((t) => /Lo normal/.test(t)), det2.h + ' · ' + det2.filas.length + ' filas');
  await p.click('.rec-detalle details summary'); await p.waitForTimeout(100);
  const abierta = await p.$eval('.rec-detalle details', (d) => d.open && /Causas habituales/.test(d.textContent));
  ok('recomendaciones: causas y respaldo al desplegar', abierta);
  const reg = await p.$('.rec-detalle [data-accion="registrar"]');
  if (reg) { await reg.click(); await listo(p); await p.waitForTimeout(300); }
  const tras = await A(p, () => ({ registrada: !!document.querySelector('.rec-detalle .rec-seg-estado'), inis: window.EasyPerformance.r.iniciativas.map((x) => x.iniciativa.id) }));
  await clic(p, '[data-accion="vista"][data-v="tablero"]');
  await p.selectOption('select[data-cambio="ver"]', 'area'); await p.waitForTimeout(200);
  const filasIni = await p.$$eval('.fila-ini', (t) => t.length);
  ok('recomendaciones: registrar una iniciativa la lleva al tablero', !!reg && tras.registrada && tras.inis.length === 3 && filasIni === 3, tras.inis.join(', '));
  // Seguimiento automático: estado de cada una, gráfico y fechas
  await clic(p, '[data-accion="vista"][data-v="iniciativas"]');
  const seg = await A(p, () => [...document.querySelectorAll('.seg')].map((x) => ({ chip: x.querySelector('.seg-cab .chip').textContent, graf: !!x.querySelector('.seg-graf polyline.seg-ini'), fechas: x.querySelectorAll('.seg-dl dd').length })));
  ok('iniciativas: seguimiento automático con estado, gráfico y fechas', seg.length === 3 && seg.some((x) => x.chip === 'Funciona') && seg.some((x) => x.chip === 'Va a peor') && seg.some((x) => x.chip === 'Planificada') && seg.filter((x) => x.graf).length >= 2 && seg.every((x) => x.fechas >= 4), seg.map((x) => x.chip).join(', '));
  // Cada iniciativa dice en qué consiste, por qué y qué se espera; la registrada desde una recomendación, con su plan entero
  const ficha = await A(p, () => [...document.querySelectorAll('.seg')].map((x) => ({ chip: x.querySelector('.seg-cab .chip').textContent, f: x.querySelector('.seg-ficha') ? x.querySelector('.seg-ficha').textContent : '', pasos: x.querySelectorAll('.seg-ficha ol li').length })));
  ok('iniciativas: cada una dice en qué consiste, por qué y qué se espera', ficha.length === 3 && ficha.every((x) => /En qué consiste/.test(x.f) && /Por qué/.test(x.f) && /Qué se espera/.test(x.f) && x.f.length > 150) && ficha.some((x) => x.chip === 'Planificada' && x.pasos >= 2), ficha.map((x) => x.chip + ' ' + x.f.length + ' car., ' + x.pasos + ' pasos').join(' · '));
  // Ayuda al pasar el cursor por una medida
  await clic(p, '[data-accion="vista"][data-v="tablero"]');
  await p.hover('.kpi .con-tip'); await p.waitForTimeout(250);
  const tip = await A(p, () => { const t = document.getElementById('tip'); return t && !t.hidden ? t.textContent : ''; });
  ok('tooltips: al pasar por el plazo se explica qué significa, con su cifra', /^Lo que el área empieza hoy estará terminado, casi seguro, en [\d,]+ días o menos\./.test(tip), tip);
  // Fiabilidad: tira en el tablero y apartado propio
  const tira = await texto(p, '.fiab-tira');
  await clic(p, '.fiab-tira [data-accion="fiabilidad"]');
  const fia = await A(p, () => ({ como: window.EasyPerformance.como, cartas: document.querySelectorAll('.fiab-c').length, filas: document.querySelectorAll('.tabla-fiab tbody tr').length }));
  ok('fiabilidad: tira en el tablero y apartado con diez comprobaciones y tabla por equipo', /Fiabilidad alta/.test(tira) && fia.como === 'fiabilidad' && fia.cartas === 10 && fia.filas === 4, tira.slice(0, 60));
  ok('demo de contenido sin errores de consola', !p.errores.length, p.errores.join(' | '));
  await p.context().close();
}

// 2b. Con animaciones: entrada con conectores, método de carga y generación de recomendaciones
{
  const p = await pagina(1280, 720, { animar: true });
  const tiles = await p.$$eval('.conector', (t) => t.map((x) => x.querySelector('b').textContent));
  await clic(p, '[data-accion="fuente"][data-f="ado"]');
  const panel = await A(p, () => ({ h: document.querySelector('.fuentes h2').textContent, alto: document.documentElement.scrollHeight }));
  ok('entrada: conectores y panel de conexión simulada sin scroll', tiles.length === 5 && tiles.includes('Azure DevOps') && tiles.includes('ServiceNow') && panel.h === 'Conectar Azure DevOps' && panel.alto <= 721, tiles.join(', ') + ' · alto ' + panel.alto);
  await p.click('[data-accion="conectar"]');
  await p.waitForSelector('.proc', { timeout: 10000 });
  const est = await p.$$eval('.proc-est', (t) => t.map((x) => x.textContent.trim()));
  // No avanza solo: tras 3,5 s sigue en el paso 1; avanza con el botón, la flecha derecha y vuelve con Anterior
  await p.waitForTimeout(3500);
  const quieto = await texto(p, '.proc-paso');
  await p.click('.proc [data-proc="siguiente"]'); await p.waitForTimeout(250);
  const conBoton = await texto(p, '.proc-paso');
  await p.keyboard.press('ArrowRight'); await p.waitForTimeout(250);
  const conFlecha = await texto(p, '.proc-paso');
  await p.click('.proc [data-proc="anterior"]'); await p.waitForTimeout(250);
  const atras = await texto(p, '.proc-paso');
  ok('animación: avanza solo con el botón o la flecha, y vuelve con Anterior', /^Paso 1 de 6/.test(quieto) && /^Paso 2 de 6/.test(conBoton) && /^Paso 3 de 6/.test(conFlecha) && /^Paso 2 de 6/.test(atras), [quieto, conBoton, conFlecha, atras].join(' > '));
  await avanzarHasta(p, '.proc-escena .v-matriz'); await p.waitForTimeout(1200);
  await p.screenshot({ path: join(SALIDA, 'metodo-medir.png') });
  await avanzarHasta(p, '.proc [data-proc="fin"]');
  await p.waitForTimeout(1200);
  const fin = await A(p, () => ({ alto: document.querySelector('.proc').scrollHeight, cifras: [...document.querySelectorAll('.proc .v-resumen b')].map((x) => x.textContent), fuente: document.querySelector('.proc-fuente').textContent }));
  await p.screenshot({ path: join(SALIDA, 'metodo-final.png') });
  ok('método de carga: seis pasos con las cifras reales y sin desbordar', est.length === 6 && fin.alto <= 721 && fin.cifras[0] === '1.232' && /Azure DevOps/.test(fin.fuente), est.join(' > ') + ' · ' + fin.cifras.join(', '));
  await p.click('.proc [data-proc="fin"]'); await p.waitForTimeout(400);
  const tras = await A(p, () => ({ proc: !!document.querySelector('.proc'), vista: window.EasyPerformance.vista, sim: window.EasyPerformance.simulada, banda: document.querySelector('.banda-demo').textContent }));
  ok('método de carga: al terminar se ve el tablero de la simulación', !tras.proc && tras.vista === 'tablero' && tras.sim === 'ado' && /Simulación de Azure DevOps/.test(tras.banda), tras.banda.slice(0, 60));
  await clic(p, '[data-accion="vista"][data-v="recomendaciones"]');
  const previa = await A(p, () => ({ generar: !!document.querySelector('.generar [data-accion="generar"]'), pasos: document.querySelectorAll('.generar-pasos li').length }));
  await p.click('.generar [data-accion="generar"]');
  await p.waitForSelector('.proc', { timeout: 10000 });
  await avanzarHasta(p, '.proc-etiqueta'); await p.waitForTimeout(2600);
  const etiqueta = await texto(p, '.proc-etiqueta');
  await p.screenshot({ path: join(SALIDA, 'generar-ia.png') });
  await avanzarHasta(p, '.proc [data-proc="fin"]');
  await p.waitForTimeout(800);
  await p.click('.proc [data-proc="fin"]'); await p.waitForTimeout(400);
  const res = await A(p, () => ({ items: document.querySelectorAll('.rec-item').length, n: window.EasyPerformance.recomendaciones().length, cuenta: (document.querySelector('.pestana .cuenta') || {}).textContent }));
  await p.screenshot({ path: join(SALIDA, 'recomendaciones.png'), fullPage: true });
  ok('generar recomendaciones: animación con la IA marcada como próxima fase y después la lista', previa.generar && previa.pasos === 6 && etiqueta === 'Próxima fase' && res.items === res.n && res.items >= 3 && res.cuenta === String(res.n), JSON.stringify(res));
  // Esc salta la animación
  await clic(p, '[data-accion="generar"]');
  await p.waitForSelector('.proc', { timeout: 5000 });
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  const salto = await A(p, () => ({ proc: !!document.querySelector('.proc'), items: document.querySelectorAll('.rec-item').length }));
  ok('Esc salta la animación y deja el resultado', !salto.proc && salto.items >= 3, JSON.stringify(salto));
  ok('animaciones sin errores de consola', !p.errores.length, p.errores.join(' | '));
  await p.context().close();
}

// 2c. Los dos ejemplos con fallos sembrados: la página detecta cada uno y no da falsas alarmas.
// El mismo CSV, descargado y cargado desde la entrada sin la configuración de la demo, da las mismas comprobaciones.
const CON_FALLOS = [
  { id: 'fallos', nombre: 'export con fallos', csv: ['fallos', 'jira-con-fallos.csv'], fichero: 'export-jira-con-fallos.csv', nivel: 'Baja', n: 10, banda: /Export con fallos/ },
  { id: 'aseguradora', nombre: 'aseguradora', csv: ['aseguradora', 'jira-aseguradora.csv'], fichero: 'export-jira-aseguradora.csv', nivel: 'Media', n: 3, banda: /Aseguradora ficticia/ },
];
for (const e of CON_FALLOS) {
  const p = await pagina(1280, 720);
  await clic(p, `[data-accion="demo"][data-d="${e.id}"]`);
  await listo(p); await p.waitForTimeout(300);
  const tira = await texto(p, '.fiab-tira'), banda = await texto(p, '.banda-demo');
  await clic(p, '.banda-demo [data-accion="fiabilidad"]');
  const leerFiab = () => A(p, () => ({
    nivel: document.querySelector('.fiab-nivel b').textContent,
    revisar: [...document.querySelectorAll('.fiab-c.fiab-revisar h3')].map((x) => x.textContent).sort().join(', '),
    porEquipo: [...document.querySelectorAll('.tabla-fiab .fv-revisar')].length,
    sembrados: [...document.querySelectorAll('.tabla-sembrados tbody tr .chip')].map((x) => x.textContent),
    nota: (document.querySelector('.sembrados .nota') || {}).textContent || '',
    sinFallo: [...document.querySelectorAll('.sin-fallo .chip')].map((x) => x.textContent),
  }));
  const f = await leerFiab();
  await p.screenshot({ path: join(SALIDA, e.id + '-fiabilidad.png'), fullPage: true });
  ok(e.nombre + ': fiabilidad ' + e.nivel.toLowerCase() + ' y los ' + e.n + ' fallos sembrados detectados', new RegExp('Fiabilidad ' + e.nivel.toLowerCase()).test(tira) && e.banda.test(banda) && f.nivel === e.nivel && f.sembrados.length === e.n && f.sembrados.every((x) => x === 'Detectado'), f.sembrados.filter((x) => x !== 'Detectado').length + ' sin detectar · ' + f.revisar);
  if (e.n < 10) ok(e.nombre + ': sin falsas alarmas y un equipo sin sprints no se marca', /sin falsas alarmas/.test(f.nota) && f.sinFallo.length === 1 && f.sinFallo[0] === 'No se marca' && f.revisar.split(', ').length === e.n, f.revisar + ' · ' + f.sinFallo.join(', '));
  const [d] = await Promise.all([p.waitForEvent('download'), p.click('[data-accion="bajar-ejemplo"]')]);
  const bajado = readFileSync(await d.path(), 'utf8');
  const original = readFileSync(join(RAIZ, 'datos-sinteticos', ...e.csv), 'utf8');
  ok(e.nombre + ': el CSV que se descarga es el del ejemplo', d.suggestedFilename() === e.fichero && bajado === original, d.suggestedFilename() + ' ' + bajado.length);
  if (e.id === 'aseguradora') {
    // Cómo se ha leído cada columna: personas descartadas, campo propio ignorado y el equipo en Componentes
    await clic(p, '[data-accion="como-sec"][data-s="fuentes"]');
    const cols = await A(p, () => Object.fromEntries([...document.querySelectorAll('.tabla-cols tbody tr')].map((t) => [t.querySelector('th code').textContent, t.querySelector('td:last-child').textContent])));
    const eq = await A(p, () => [...document.querySelectorAll('.tabla-cols tbody tr')].filter((t) => /Equipo de cada tarea/.test(t.textContent)).map((t) => t.querySelector('th code').textContent));
    await p.screenshot({ path: join(SALIDA, 'aseguradora-columnas.png'), fullPage: true });
    ok('aseguradora: tabla de columnas real (personas descartadas, Ramo ignorado, equipo en Componentes)', ['Persona asignada', 'Informador', 'Creador', 'Comentario'].every((k) => cols[k] === 'Se descarta') && cols['Campo personalizado (Ramo)'] === 'Se ignora' && cols['Estado'] === 'Se usa' && eq.join() === 'Componentes', JSON.stringify(eq));
  }
  await clic(p, '[data-accion="salir-demo"]');
  await p.setInputFiles('#entrada-ficheros', join(RAIZ, 'datos-sinteticos', ...e.csv)); await listo(p); await p.waitForTimeout(300);
  await clic(p, '.fiab-tira [data-accion="fiabilidad"]');
  const g = await leerFiab();
  ok(e.nombre + ' cargado desde la entrada: las mismas comprobaciones por revisar', g.nivel === f.nivel && g.revisar === f.revisar && g.porEquipo === f.porEquipo && !g.sembrados.length, g.revisar);
  ok(e.nombre + ' sin errores de consola', !p.errores.length, p.errores.join(' | '));
  await p.context().close();
}

// 3. Modo oscuro y móvil
{
  const p = await pagina(1280, 720, { oscuro: true });
  await clic(p, '[data-accion="demo"]'); await listo(p);
  const r = await recorrer(p, 'oscuro', false);
  await p.screenshot({ path: join(SALIDA, 'oscuro-area.png'), fullPage: true });
  const fondo = await A(p, () => getComputedStyle(document.body).backgroundColor);
  ok('modo oscuro: fondo oscuro, sin scroll horizontal ni errores', fondo === 'rgb(11, 16, 38)' && !r.fallos.length && !p.errores.length, `fondo ${fondo} ${r.fallos.join('; ')} ${p.errores.join(' | ')}`);
  await p.context().close();
  const q = await pagina(390, 844);
  await clic(q, '[data-accion="demo"]'); await listo(q);
  const rq = await recorrer(q, 'movil', false);
  await q.screenshot({ path: join(SALIDA, 'movil-area.png'), fullPage: true });
  await clic(q, '[data-accion="generar"]');
  const mr = await medir(q);
  if (mr.ancho > 1) rq.fallos.push('recomendaciones generadas: ' + mr.ancho + 'px de scroll horizontal');
  await q.screenshot({ path: join(SALIDA, 'movil-recomendaciones.png'), fullPage: true });
  ok('móvil (390 px): sin scroll horizontal en ninguna pantalla', !rq.fallos.length && !q.errores.length, rq.fallos.join('; ') + q.errores.join(' | '));
  await q.context().close();
}

// 4. Jira.csv de principio a fin: directo al tablero, cambios en Cómo funciona, definiciones y paquete
{
  const p = await pagina(1280, 720);
  const t0 = Date.now();
  await p.setInputFiles('#entrada-ficheros', join(RAIZ, 'datos-prueba', 'Jira.csv'));
  await listo(p);
  const seg = Math.round((Date.now() - t0) / 1000);
  const inicio = await A(p, () => ({ vista: window.EasyPerformance.vista, eqs: window.EasyPerformance.r.modelo.equipos.map((e) => e.nombre).join(', '), recs: window.EasyPerformance.recomendaciones().length }));
  await p.screenshot({ path: join(SALIDA, 'jira-area.png'), fullPage: true });
  ok('Jira.csv: de la carga al tablero sin puesta en marcha', inicio.vista === 'tablero' && inicio.eqs === 'Infrastructure, Mobile, Web', `${inicio.eqs} · ${inicio.recs} recomendaciones · ${seg} s`);
  const r = await recorrer(p, 'jira', true);
  ok('Jira.csv: todas las pantallas sin scroll horizontal', !r.fallos.length, r.fallos.join('; ') + ' · altos: ' + r.altos.join(', '));
  // Fiabilidad del export de prueba: avisa de lo que hay que revisar y cómo arreglarlo
  await clic(p, '[data-accion="vista"][data-v="como"]');
  await clic(p, '[data-accion="como-sec"][data-s="fiabilidad"]');
  const fj = await A(p, () => ({ nivel: document.querySelector('.fiab-nivel b').textContent, revisar: document.querySelectorAll('.fiab-c.fiab-revisar').length, arreglo: [...document.querySelectorAll('.fiab-c.fiab-revisar')].every((x) => /Cómo se arregla/.test(x.textContent)) }));
  ok('Jira.csv: la fiabilidad avisa de lo que hay que revisar y cómo arreglarlo', fj.revisar >= 3 && fj.arreglo && fj.nivel !== 'Alta', JSON.stringify(fj));
  // Estados: In Progress pasa a En revisión
  await clic(p, '[data-accion="como-sec"][data-s="datos"]');
  await clic(p, '[data-accion="editar"][data-e="estados"]');
  const antes = await A(p, () => window.EasyPerformance.r.preparacion.mapeo['In Progress']);
  await p.selectOption('select[data-cambio="estado"][data-e="In Progress"]', 'en_revision');
  await listo(p); await p.waitForTimeout(300);
  const despues = await A(p, () => ({ m: window.EasyPerformance.r.preparacion.mapeo['In Progress'], g: JSON.parse(localStorage.getItem('easyperformance.config.v2') || '{}') }));
  ok('Cómo funciona: un estado cambiado se recalcula y se guarda', antes === 'en_curso' && despues.m === 'en_revision' && despues.g.mapeoEstados && despues.g.mapeoEstados['In Progress'] === 'en_revision', `In Progress: ${antes} a ${despues.m}`);
  // Proveedores: Mobile pasa a ser de un proveedor y aparece la comparación
  await clic(p, '[data-accion="editar"][data-e="equipos"]');
  const cmpAntes = await A(p, () => window.EasyPerformance.r.comparaciones.filter((c) => c.dimension === 'tipo').length);
  await p.selectOption('select[data-cambio="eq"][data-campo="tipo"][data-e="Mobile"]', 'proveedor'); await listo(p); await p.waitForTimeout(300);
  await p.fill('input[data-cambio="eq"][data-campo="proveedor"][data-e="Mobile"]', 'Proveedor Uno'); await p.press('input[data-campo="proveedor"][data-e="Mobile"]', 'Tab'); await listo(p); await p.waitForTimeout(300);
  const cmp = await A(p, () => ({ n: window.EasyPerformance.r.comparaciones.filter((c) => c.dimension === 'tipo').length, g: JSON.parse(localStorage.getItem('easyperformance.config.v2')).equiposInfo }));
  ok('Cómo funciona: marcar un proveedor activa la comparación y se guarda', cmpAntes === 0 && cmp.n === 1 && cmp.g.Mobile.tipo === 'proveedor' && cmp.g.Mobile.proveedor === 'Proveedor Uno', JSON.stringify(cmp.g));
  await p.screenshot({ path: join(SALIDA, 'jira-como.png'), fullPage: true });
  // Documentos
  await p.fill('input[data-cambio="nombre"]', 'Cliente de prueba'); await p.press('input[data-cambio="nombre"]', 'Tab');
  const bajar = async (sel) => {
    const [d] = await Promise.all([p.waitForEvent('download'), p.click(sel)]);
    const ruta = join(SALIDA, d.suggestedFilename()); await d.saveAs(ruta);
    return { nombre: d.suggestedFilename(), datos: readFileSync(ruta) };
  };
  const docx = await bajar('[data-accion="definiciones"][data-f="docx"]'), md = await bajar('[data-accion="definiciones"][data-f="md"]'), paq = await bajar('[data-accion="paquete"]');
  const mdT = md.datos.toString('utf8');
  ok('documento de definiciones en Word y markdown con los cambios', docx.datos.slice(0, 2).toString() === 'PK' && docx.datos.toString('latin1').includes('word/document.xml') &&
    mdT.includes('Cliente de prueba') && mdT.includes('| In Progress | In Progress | En revisión |') && mdT.includes('Proveedor: Proveedor Uno') && !/[\u2014\u2013]/.test(mdT), `${docx.nombre} · ${md.nombre}`);
  const paquete = JSON.parse(paq.datos.toString('utf8'));
  const problemas = await A(p, (x) => window.Nucleo.comprobarPaquete(x), paquete);
  ok('paquete de diagnóstico exportado y sin campos prohibidos', problemas.length === 0 && !!paquete.equipos, `${paq.nombre} · ${Math.round(paq.datos.length / 1024)} KB`);
  // Demo desde Cómo funciona y vuelta: la configuración real no cambia
  const cfgAntes = await A(p, () => localStorage.getItem('easyperformance.config.v2'));
  await clic(p, '[data-accion="vista"][data-v="como"]');
  await clic(p, '.pagina [data-accion="demo"]'); await listo(p); await p.waitForTimeout(300);
  const enDemo = await A(p, () => window.EasyPerformance.r.modelo.equipos.map((e) => e.nombre).join(', '));
  await clic(p, '[data-accion="salir-demo"]'); await p.waitForTimeout(300);
  const vuelta = await A(p, () => ({ cfg: localStorage.getItem('easyperformance.config.v2'), eqs: window.EasyPerformance.r.modelo.equipos.map((e) => e.nombre).join(', ') }));
  ok('demo sin pisar la configuración ni los datos reales', cfgAntes === vuelta.cfg && enDemo !== vuelta.eqs && vuelta.eqs === 'Infrastructure, Mobile, Web', `demo: ${enDemo} · vuelta: ${vuelta.eqs}`);
  // Al volver a abrir la página y cargar el mismo export, los cambios siguen
  await p.reload(); await p.waitForTimeout(400);
  await p.setInputFiles('#entrada-ficheros', join(RAIZ, 'datos-prueba', 'Jira.csv')); await listo(p);
  const otraVez = await A(p, () => ({ m: window.EasyPerformance.r.preparacion.mapeo['In Progress'], n: window.EasyPerformance.r.comparaciones.filter((c) => c.dimension === 'tipo').length }));
  ok('los cambios se conservan al volver a abrir la página', otraVez.m === 'en_revision' && otraVez.n === 1, JSON.stringify(otraVez));
  ok('recorrido con Jira.csv sin errores de consola', !p.errores.length, p.errores.join(' | '));
  await p.context().close();
}

// 5. Carpeta compartida con dos iniciativas y contexto (carpeta simulada con la interfaz de la de Chrome)
{
  const p = await pagina(1280, 720);
  const csv = readFileSync(join(RAIZ, 'datos-sinteticos', 'b3', 'jira-b3.csv'), 'utf8');
  const dir = join(RAIZ, 'datos-sinteticos', 'b3', 'cliente');
  const inis = ['limite-wip-pagos.json', 'formacion-pruebas-riesgos.json'].map((f) => ({ nombre: f, texto: readFileSync(join(dir, 'iniciativas', f), 'utf8') }));
  const ctx = readFileSync(join(dir, 'contexto', 'contexto.json'), 'utf8');
  await A(p, async ({ csv, inis, ctx }) => {
    const fichero = (nombre, texto) => ({ kind: 'file', name: nombre, getFile: async () => new File([texto], nombre) });
    const carpeta = (nombre, entradas, subs = {}) => ({
      kind: 'directory', name: nombre, queryPermission: async () => 'granted', requestPermission: async () => 'granted',
      getDirectoryHandle: async (n) => { if (subs[n]) return subs[n]; throw new DOMException('No existe', 'NotFoundError'); },
      values: () => (async function* () { yield* entradas; })(),
    });
    const raiz = carpeta('cliente-prueba', [], {
      exports: carpeta('exports', [fichero('jira-b3.csv', csv)]),
      iniciativas: carpeta('iniciativas', inis.map((i) => fichero(i.nombre, i.texto))),
      contexto: carpeta('contexto', [fichero('contexto.json', ctx)]),
    });
    window.EasyPerformance.carpeta = raiz;
    await window.EasyPerformance.leerCarpeta(raiz);
  }, { csv, inis, ctx });
  await listo(p); await p.waitForTimeout(300);
  const r = await A(p, () => ({ ini: window.EasyPerformance.r.iniciativas.map((x) => x.iniciativa.id), ctx: window.EasyPerformance.contexto ? window.EasyPerformance.contexto.documentos.length : 0, filas: document.querySelectorAll('.fila-ini').length }));
  await p.screenshot({ path: join(SALIDA, 'carpeta-area.png'), fullPage: true });
  ok('carpeta compartida: dos iniciativas leídas y evaluadas, y el contexto', r.ini.length === 2 && r.filas === 2 && r.ctx === 2, `${r.ini.join(', ')} · contexto ${r.ctx} documentos`);
  ok('carpeta compartida sin errores de consola', !p.errores.length, p.errores.join(' | '));
  await p.context().close();
}

// 6. Una configuración guardada por la versión anterior se aprovecha
{
  const p = await pagina(1280, 720);
  await A(p, () => localStorage.setItem('easyperformance.configuracion.v1', JSON.stringify({
    version: 1, campoEquipo: 'componentes', equipos: ['Infrastructure', 'Mobile', 'Web'], etapas: { 'To Do': 'pendiente', 'In Progress': 'curso', 'Done': 'hecho' },
    equiposInfo: { Web: { tipo: 'proveedor', proveedor: 'Proveedor Web' } }, objetivos: ['tardamos'], medidas: ['ciclo'], perfiles: ['responsable'],
  })));
  await p.reload(); await p.waitForTimeout(400);
  await p.setInputFiles('#entrada-ficheros', join(RAIZ, 'datos-prueba', 'Jira.csv')); await listo(p);
  const r = await A(p, () => ({ eqs: window.EasyPerformance.r.modelo.equipos.map((e) => e.nombre).join(', '), m: window.EasyPerformance.r.preparacion.mapeo['In Progress'], cmp: window.EasyPerformance.r.comparaciones.filter((c) => c.dimension === 'tipo').length }));
  ok('configuración de la versión anterior: equipos, estados y proveedores', r.eqs === 'Infrastructure, Mobile, Web' && r.m === 'en_curso' && r.cmp === 1 && !p.errores.length, JSON.stringify(r) + ' ' + p.errores.join(' | '));
  await p.context().close();
}

await navegador.close();
writeFileSync(join(SALIDA, 'resultado.json'), JSON.stringify(resultados, null, 1));
const fallidos = resultados.filter((r) => !r.bien).length;
console.log(`\n${resultados.length - fallidos} de ${resultados.length} comprobaciones bien. Capturas en ${SALIDA}`);
process.exit(fallidos ? 1 : 0);
