// Verificación de la página en Chromium: los cuatro pasos (Measure, Analyze, Improve, Learn), Settings, conectores de demo,
// método animado, tutorial e IA (con la API simulada en el navegador).
//   npm run web && CHROME=/ruta/a/chrome node web/verificar.mjs
// Comprueba: entrada con los seis conectores y la zona de carga; conector de demo con el método animado de seis etapas;
// datos de ejemplo en 1280x720 y 1920x1080 (sin scroll horizontal, sin errores de consola) en todas las pantallas de los
// cuatro pasos; tutorial de once pasos sobre la interfaz; contenido de Measure (baseline, data, context), Analyze
// (señales, recomendaciones, comparación), Improve (plan, alta y baja de iniciativa, estándar) y Learn (evaluación,
// ciclo); IA: clave en el navegador (nunca en cliente.json), recomendaciones validadas contra el paquete, las que
// repiten un caso se unen a la del banco, mapeo de estados y lectura del impacto, y un fallo de la API no rompe nada;
// los dos exports con fallos sembrados; modo oscuro, móvil y portátil al 150 %; Jira.csv de principio a fin (estados y
// proveedores cambiados y guardados, catálogo de KPIs y paquete); ejemplo sin pisar la configuración; carpeta con dos
// iniciativas; configuración de la versión anterior.
// El navegador pide "reducir movimiento" salvo en los bloques del tutorial y del método animado.

import { chromium } from 'playwright-core';
import { readFileSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const HTML = 'file://' + join(RAIZ, 'dist', 'EasyPerformance', 'EasyPerformance.html');
const SALIDA = join(RAIZ, 'dist', 'verificacion');
const CHROME = process.env.CHROME || [
  '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome',
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
  p.on('dialog', (d) => d.accept());
  await p.goto(HTML);
  await p.waitForTimeout(400);
  return p;
}
const A = (p, fn, arg) => p.evaluate(fn, arg);
const medir = (p) => A(p, () => ({ alto: document.documentElement.scrollHeight, ancho: document.documentElement.scrollWidth - innerWidth }));
const clic = async (p, sel) => { await p.click(sel); await p.waitForTimeout(250); };
const listo = (p) => p.waitForFunction(() => window.EasyPerformance.r && document.getElementById('ocupado').hidden, null, { timeout: 90000 });
const texto = (p, sel) => p.$eval(sel, (e) => e.textContent.trim());
const paso = (p, v) => clic(p, `.paso[data-v="${v}"]`);
const setup = async (p, s) => { await clic(p, '[data-accion="vista"][data-v="setup"]'); await clic(p, `[data-accion="setup-sec"][data-s="${s}"]`); };
/** La API de Claude, simulada en el navegador: contesta con lo que se le dé (o devuelve un error). */
async function apiSimulada(p, respuesta, estado = 200) {
  await p.route('https://api.anthropic.com/v1/messages', async (ruta) => {
    const req = ruta.request();
    const cab = req.headers();
    p.peticionesIa = p.peticionesIa || [];
    p.peticionesIa.push({ clave: cab['x-api-key'], navegador: cab['anthropic-dangerous-direct-browser-access'], cuerpo: req.postDataJSON() });
    if (estado !== 200) return ruta.fulfill({ status: estado, contentType: 'application/json', body: JSON.stringify({ error: { message: 'simulated failure' } }) });
    const texto = typeof respuesta === 'function' ? await respuesta(p, req.postDataJSON()) : respuesta;
    return ruta.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [{ type: 'text', text: typeof texto === 'string' ? texto : JSON.stringify(texto) }] }) });
  });
}

/** Recorre Measure (área y cada equipo, data, context), Analyze, Improve, Learn y Settings. Devuelve fallos de ancho y altos. */
async function recorrer(p, etiqueta, capturas) {
  const fallos = [], altos = [];
  const mirar = async (nombre) => {
    const m = await medir(p);
    if (m.ancho > 1) fallos.push(`${nombre}: ${m.ancho}px de scroll horizontal`);
    altos.push(`${nombre} ${m.alto}`);
    if (capturas) await p.screenshot({ path: join(SALIDA, `${etiqueta}-${nombre}.png`), fullPage: true });
  };
  await paso(p, 'measure');
  await p.selectOption('select[data-cambio="ver"]', 'area'); await p.waitForTimeout(200);
  await mirar('measure-area');
  const eqs = await A(p, () => window.EasyPerformance.r.modelo.equipos.map((e) => e.nombre));
  for (const [i, e] of eqs.entries()) { await p.selectOption('select[data-cambio="ver"]', e); await p.waitForTimeout(200); await mirar('measure-team-' + (i + 1)); }
  await p.selectOption('select[data-cambio="ver"]', 'area'); await p.waitForTimeout(150);
  await setup(p, 'data');
  for (const s of ['fiabilidad', 'lectura']) { await clic(p, `[data-accion="datos-sec"][data-s="${s}"]`); await mirar('setup-data-' + s); }
  await clic(p, '[data-accion="setup-sec"][data-s="context"]'); await mirar('setup-context');
  await clic(p, '[data-accion="setup-sec"][data-s="settings"]'); await mirar('setup-settings');
  await paso(p, 'analyze'); await mirar('analyze');
  await paso(p, 'improve'); await mirar('improve');
  await paso(p, 'learn'); await mirar('learn');
  await paso(p, 'measure');
  return { fallos, altos };
}

// 1. Entrada: seis conectores (Jira en vivo, cuatro de demo, otra herramienta), zona de carga y tutorial. Datos de ejemplo en dos tamaños.
for (const [w, h] of [[1280, 720], [1920, 1080]]) {
  const p = await pagina(w, h);
  const entrada = await A(p, () => ({ vista: window.EasyPerformance.vista, zona: !!document.getElementById('zona'), tutorial: !!document.querySelector('.inicio [data-accion="tutorial"]'),
    h1: document.querySelector('.inicio h1').textContent, conectores: [...document.querySelectorAll('.conector')].map((c) => c.querySelector('b').textContent + ':' + c.querySelector('.con-estado').textContent), presentacion: !!document.querySelector('.claim, [data-accion="presentacion"]'), palabras: document.querySelector('.inicio').textContent.trim().split(/\s+/).length }));
  const m0 = await medir(p);
  if (w === 1280) await p.screenshot({ path: join(SALIDA, 'entrada.png') });
  ok(`entrada en ${w}x${h}: seis conectores (Jira en vivo, cuatro de demo etiquetados, otra herramienta), zona de carga y tutorial, con menos de 90 palabras`,
    entrada.vista === 'inicio' && entrada.zona && entrada.tutorial && entrada.h1 === 'Team performance from your delivery tools' && entrada.conectores.length === 6 && entrada.conectores[0] === 'Jira:Live' && entrada.conectores.filter((c) => /:Demo connector$/.test(c)).length === 4 && !entrada.presentacion && entrada.palabras < 90 && m0.ancho <= 1 && m0.alto <= h + 1, entrada.conectores.join(' | ') + ` · ${entrada.palabras} palabras · alto ${m0.alto}`);
  await A(p, () => window.EasyPerformance.verDemo()); await listo(p);
  const enDemo = await A(p, () => ({ demo: window.EasyPerformance.demo, vista: window.EasyPerformance.vista, pasos: [...document.querySelectorAll('.paso')].map((x) => x.querySelector('b').textContent).join(', '), estados: [...document.querySelectorAll('.paso small')].map((x) => x.textContent), banda: /Sample data/.test(document.querySelector('.banda-demo').textContent), ajustes: document.querySelector('.btn-ajustes').textContent, subnav: !!document.querySelector('.subnav') }));
  ok(`datos de ejemplo en ${w}x${h}: Measure con los cuatro pasos y su estado en la cabecera, Setup aparte y sin subsecciones`, enDemo.demo && enDemo.vista === 'measure' && enDemo.pasos === 'Measure, Analyze, Improve, Learn' && /4 teams/.test(enDemo.estados[0]) && /to do/.test(enDemo.estados[1]) && /initiatives/.test(enDemo.estados[2]) && /evaluated/.test(enDemo.estados[3]) && enDemo.banda && enDemo.ajustes === 'Setup' && !enDemo.subnav, enDemo.estados.join(' | '));
  const r = await recorrer(p, `ejemplo-${w}`, true);
  ok(`ejemplo: todas las pantallas de los cuatro pasos sin scroll horizontal en ${w}x${h}`, !r.fallos.length, r.fallos.join('; ') + ' · altos: ' + r.altos.join(', '));
  ok(`ejemplo sin errores de consola en ${w}x${h}`, !p.errores.length, p.errores.join(' | '));
  await p.context().close();
}

// 2. Conector de demo: panel con lo que se lee, etiqueta de demo, y el método animado de seis etapas con cifras reales
{
  const p = await pagina(1280, 720, { animar: true });
  await clic(p, '.conector[data-f="ado"]');
  const panel = await A(p, () => ({ h2: document.querySelector('.fuentes h2').textContent, demo: !!document.querySelector('.fuentes h2 .chip'), lee: document.querySelector('.con-datos').textContent, boton: document.querySelector('[data-accion="conectar"]').textContent, csv: !!document.querySelector('.fuentes [data-accion="ficheros"]') }));
  await p.screenshot({ path: join(SALIDA, 'conector-ado.png') });
  ok('conector de demo: panel de Azure DevOps etiquetado como demo, qué se lee, sin carga de CSV', /Azure DevOps/.test(panel.h2) && panel.demo && /Never people or comments/.test(panel.lee) && panel.boton === 'Connect and load' && !panel.csv, JSON.stringify(panel));
  await clic(p, '[data-accion="fuentes"]'); await clic(p, '.conector[data-f="jira"]');
  const jira = await A(p, () => ({ demo: !!document.querySelector('.fuentes h2 .chip'), csv: !!document.querySelector('.fuentes [data-accion="ficheros"]'), boton: document.querySelector('[data-accion="conectar"]').textContent }));
  ok('conector de Jira: carga real por CSV o carpeta, y la conexión directa marcada como demo', !jira.demo && jira.csv && jira.boton === 'Connect (demo)', JSON.stringify(jira));
  await clic(p, '[data-accion="fuentes"]'); await clic(p, '.conector[data-f="ado"]'); await clic(p, '[data-accion="conectar"]'); await listo(p);
  await p.waitForSelector('.proc.abierto', { timeout: 5000 }); await p.waitForTimeout(700);
  const etapas = await A(p, () => ({ nombres: [...document.querySelectorAll('.proc-nombre')].map((x) => x.textContent).join(','), kicker: document.querySelector('.proc-kicker').textContent, fuente: document.querySelector('.proc-fuente').textContent, titulo: document.querySelector('.proc-texto h3').textContent, res: document.querySelector('.proc-res').textContent, simulada: window.EasyPerformance.simulada }));
  await p.screenshot({ path: join(SALIDA, 'metodo-1.png') });
  ok('método animado: seis etapas (Ingest, Teams, States, Quality, Capacity, Baseline) desde el conector de demo, con la fuente simulada', etapas.nombres === 'Ingest,Teams,States,Quality,Capacity,Baseline' && etapas.kicker === 'Step 1 · Measure' && /Azure DevOps \(demo connector\)/.test(etapas.fuente) && /from Azure DevOps/.test(etapas.titulo) && /\d tasks from/.test(etapas.res) && etapas.simulada === 'ado', JSON.stringify(etapas));
  const vistos = [];
  for (let k = 0; k < 6; k++) {
    const e = await A(p, () => ({ paso: document.querySelector('.proc-paso').textContent, titulo: document.querySelector('.proc-texto h3').textContent, visual: document.querySelector('.proc-visual').children.length, res: (document.querySelector('.proc-res') || {}).textContent || '', activo: document.querySelector('.proc-est.activo .proc-nombre').textContent }));
    vistos.push(e);
    if (k === 2) await p.screenshot({ path: join(SALIDA, 'metodo-estados.png') });
    if (k === 3) await p.screenshot({ path: join(SALIDA, 'metodo-calidad.png') });
    await p.click('[data-proc="siguiente"]'); await p.waitForTimeout(350);
  }
  const fin = await A(p, () => ({ titulo: document.querySelector('.proc-texto h3').textContent, hechos: document.querySelectorAll('.proc-est.hecho').length, boton: document.querySelector('[data-proc="fin"]').textContent, resumen: document.querySelectorAll('.v-resumen > div').length }));
  await p.screenshot({ path: join(SALIDA, 'metodo-final.png') });
  await p.click('[data-proc="fin"]'); await p.waitForTimeout(400);
  const tras = await A(p, () => ({ proc: !!document.querySelector('.proc'), vista: window.EasyPerformance.vista, banda: document.querySelector('.banda-demo').textContent }));
  ok('método animado: cada etapa tiene visual y resultado, el final resume y lleva al baseline; la banda dice que es un conector de demo',
    vistos.every((v, i) => v.paso === `Step ${i + 1} of 6` && v.visual >= 1 && v.res) && /Azure DevOps/.test(vistos[2].titulo) === false && /translate the states/.test(vistos[2].titulo) && /Reliability/.test(vistos[3].res) && fin.titulo === 'Data ready to use' && fin.hechos === 6 && fin.boton === 'See the baseline' && fin.resumen === 4 && !tras.proc && tras.vista === 'measure' && /Demo connector for Azure DevOps/.test(tras.banda),
    vistos.map((v) => v.activo + ': ' + v.titulo).join(' > '));
  // Esc cierra; con "reducir movimiento" no se muestra
  await clic(p, '[data-accion="salir-demo"]'); await clic(p, '.conector[data-f="servicenow"]'); await clic(p, '[data-accion="conectar"]'); await listo(p);
  await p.waitForSelector('.proc.abierto', { timeout: 5000 }); await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  const esc = await A(p, () => ({ proc: !!document.querySelector('.proc'), vista: window.EasyPerformance.vista, simulada: window.EasyPerformance.simulada }));
  ok('método animado: Esc lo salta y deja el baseline del conector elegido', !esc.proc && esc.vista === 'measure' && esc.simulada === 'servicenow', JSON.stringify(esc));
  ok('conectores y método sin errores de consola', !p.errores.length, p.errores.join(' | '));
  await p.context().close();
  const q = await pagina(1280, 720);
  await clic(q, '.conector[data-f="gitlab"]'); await clic(q, '[data-accion="conectar"]'); await listo(q); await q.waitForTimeout(400);
  const sin = await A(q, () => ({ proc: !!document.querySelector('.proc'), vista: window.EasyPerformance.vista }));
  ok('con "reducir movimiento" el conector carga sin animación', !sin.proc && sin.vista === 'measure', JSON.stringify(sin));
  await q.context().close();
}

// 3. El tutorial: once pasos por los cuatro bloques sobre la interfaz real
{
  const p = await pagina(1280, 720, { animar: true });
  await clic(p, '.inicio [data-accion="tutorial"]'); await listo(p); await p.waitForTimeout(600);
  const pasos = [];
  for (let k = 0; k < 9; k++) {
    const est = await A(p, () => {
      const t = document.querySelector('.tut-tarjeta'); if (!t) return null;
      const f = document.querySelector('.tut-foco'), r = f && !f.hidden ? f.getBoundingClientRect() : null;
      return { cuenta: t.querySelector('.tut-cuenta').textContent, titulo: t.querySelector('h3').textContent, vista: window.EasyPerformance.vista, ver: window.EasyPerformance.ver, foco: !!r, dentro: r ? r.top >= -2 && r.bottom <= innerHeight + 2 : null, tarjeta: (() => { const b = t.getBoundingClientRect(); return b.top >= 0 && b.bottom <= innerHeight && b.left >= 0 && b.right <= innerWidth; })() };
    });
    if (!est) break;
    pasos.push(est);
    if (k === 0) await p.screenshot({ path: join(SALIDA, 'tutorial-1.png') });
    if (k === 3) await p.screenshot({ path: join(SALIDA, 'tutorial-4.png') });
    if (k === 1) { await p.keyboard.press('ArrowRight'); await p.waitForTimeout(500); }
    else { await p.click('[data-tut="siguiente"]'); await p.waitForTimeout(500); }
  }
  const tras = await A(p, () => ({ tut: !!document.querySelector('.tut'), vista: window.EasyPerformance.vista, demo: window.EasyPerformance.demo, visto: !!localStorage.getItem('easyperformance.tutorial') }));
  const vistas = pasos.map((x) => x.vista).join(',');
  const kickers = pasos.map((x) => x.cuenta.replace(/ · Step \d+ of \d+$/, '')).join(',');
  const palabras = await A(p, () => 0);
  ok('tutorial: siete pasos cortos que recorren Measure, Analyze, Improve y Learn, y acaba en Measure',
    pasos.length === 7 && /Step 1 of 7$/.test(pasos[0].cuenta) && /Step 7 of 7$/.test(pasos[6].cuenta) && vistas === 'measure,measure,measure,analyze,analyze,learn,measure' && kickers === 'The four steps,Step 1 · Measure,Step 1 · Measure,Step 2 · Analyze,Step 3 · Improve,Step 4 · Learn,Every week' && !tras.tut && tras.vista === 'measure' && tras.demo && tras.visto,
    pasos.map((x) => x.titulo).join(' > '));
  ok('tutorial: cada paso señala un elemento visible y la tarjeta cabe en pantalla', pasos.every((x) => x.foco && x.dentro && x.tarjeta), JSON.stringify(pasos.map((x) => [x.foco, x.dentro, x.tarjeta])));
  await clic(p, '.cab [data-accion="tutorial"]'); await p.waitForTimeout(500);
  await p.click('[data-tut="siguiente"]'); await p.waitForTimeout(400);
  const dos = await texto(p, '.tut-cuenta');
  await p.click('[data-tut="anterior"]'); await p.waitForTimeout(400);
  const uno = await texto(p, '.tut-cuenta');
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  const cerrado = !(await p.$('.tut'));
  ok('tutorial: se reabre desde la cabecera, Back vuelve y Esc lo cierra', /Step 2 of 7$/.test(dos) && /Step 1 of 7$/.test(uno) && cerrado, dos + ' / ' + uno);
  ok('tutorial sin errores de consola', !p.errores.length, p.errores.join(' | '));
  await p.context().close();
}

// 4. Contenido con los datos de ejemplo en los cuatro pasos
{
  const p = await pagina(1440, 900);
  await A(p, () => window.EasyPerformance.verDemo()); await listo(p);
  const cab = await A(p, () => ({ h: document.querySelector('.titular h1').textContent, sub: document.querySelector('.titular p:not(.kicker)').textContent, foco: [...document.querySelectorAll('.estado-area .pill-eq')].map((x) => x.textContent), boton: (document.querySelector('.bloque-cab [data-accion="vista"][data-v="analyze"]') || {}).textContent || '', kicker: document.querySelector('.titular .kicker').textContent, tira: document.querySelector('[data-accion="fiabilidad"]').textContent, bloques: document.querySelectorAll('.pagina > section').length }));
  const filas = await p.$$eval('.tabla-equipos tbody tr', (t) => t.map((x) => x.querySelector('th').textContent));
  ok('measure: una pantalla (titular con el cliente, equipos que necesitan atención, cuatro cifras, tabla), el botón a Analyze y la fiabilidad', cab.kicker === 'Step 1 of 4' && cab.h === 'Measure' && /^Sample bank: 4 teams, 2 in-house and 2 from vendors/.test(cab.sub) && /^\d things to do$/.test(cab.boton) && cab.foco.length === 2 && cab.foco.some((x) => /Mobile App/.test(x)) && cab.foco.some((x) => /Customer Portal/.test(x)) && /Data reliability high/.test(cab.tira) && cab.bloques === 4 && filas.length === 4 && filas.some((x) => /Vendor North/.test(x)), JSON.stringify(cab));
  await p.selectOption('select[data-cambio="ver"]', 'Mobile App'); await p.waitForTimeout(200);
  const eq = await A(p, () => ({ t: document.querySelector('.cab-area .h-area').textContent, fuera: [...document.querySelectorAll('.kpi.kpi-critico .kpi-cab, .kpi.kpi-atencion .kpi-cab')].map((x) => x.textContent).join(', '), kpis: document.querySelectorAll('.kpi').length, graf: !!document.querySelector('.grafico polyline'), recs: document.querySelectorAll('.bloque-oscuro li').length, normal: document.querySelector('.kpi .kpi-n').textContent }));
  ok('measure: vista de un equipo con indicadores, gráfico del plazo y sus recomendaciones', eq.kpis === 5 && eq.graf && eq.recs >= 2 && eq.t === 'Mobile App' && /Rework/.test(eq.fuera) && /^Normal: /.test(eq.normal), `${eq.t} · ${eq.fuera} · ${eq.recs} recs · ${eq.normal}`);
  await p.hover('.kpi .con-tip'); await p.waitForTimeout(250);
  const tip = await A(p, () => { const t = document.getElementById('tip'); return t && !t.hidden ? t.textContent : ''; });
  ok('tooltips: al pasar por el plazo se explica qué significa, con su cifra', /^What this team starts today will almost surely be done in [\d.]+ days or less\./.test(tip), tip);
  await clic(p, '.bloque-oscuro [data-accion="ver-recs"]');
  const filtro = await A(p, () => ({ vista: window.EasyPerformance.vista, f: window.EasyPerformance.recEquipo, items: document.querySelectorAll('.rec-item').length, todas: window.EasyPerformance.recomendaciones().filter((x) => x.equipos.includes('Mobile App')).length }));
  ok('analyze: "See them" filtra por el equipo', filtro.vista === 'analyze' && filtro.f === 'Mobile App' && filtro.items === filtro.todas, JSON.stringify(filtro));
  await p.selectOption('select[data-cambio="rec-equipo"]', 'todos'); await p.waitForTimeout(200);
  const senales = await p.$$eval('.senal', (t) => t.map((x) => x.textContent.replace(/\s+/g, ' ').trim()));
  const lista = await p.$$eval('.rec-item', (t) => t.map((x) => ({ t: x.querySelector('b').textContent, crit: !!x.querySelector('.chip-critico') })));
  const det = await A(p, () => { const d = document.querySelector('.rec-detalle'); return { h: d.querySelector('h2').textContent, paso: /First step/.test(d.querySelector('.rec-resumen').textContent) && /What is happening/.test(d.textContent), de: !!d.querySelector('.cifra'), plan: d.querySelectorAll('.rec-plan li').length, ini: !!d.querySelector('[data-accion="registrar"]'), plegado: [...d.querySelectorAll('details')].every((x) => !x.open), visible: d.textContent.trim().split(/\s+/).length }; });
  const grupos = await A(p, () => ({ peor: document.querySelectorAll('.tabla-grupos td.peor').length, resumen: document.querySelector('#grupos .linea-sum').textContent, abierto: document.querySelector('#grupos details').open }));
  const panelIa = await texto(p, '.bloque-ia');
  await p.screenshot({ path: join(SALIDA, 'analyze.png'), fullPage: true });
  ok('analyze: señales, lista ordenada, detalle con qué pasa y primer paso (lo demás plegado), comparación de grupos en una línea y panel de IA sin clave', senales.length === 4 && /figures outside normal/.test(senales[0]) && /vendor vs in-house gaps/.test(senales[1]) && lista.length >= 3 && lista[0].crit && det.h === lista[0].t && det.paso && det.de && det.plan >= 2 && det.ini && det.plegado && grupos.peor >= 3 && /Vendors worse on/.test(grupos.resumen) && !grupos.abierto && /Add an API key in Setup/.test(panelIa), senales.join(' | ') + ' · ' + lista.map((x) => (x.crit ? 'critical: ' : '') + x.t).join(' / '));
  await clic(p, '.rec-item:nth-child(2)');
  const det2 = await A(p, () => ({ h: document.querySelector('.rec-detalle h2').textContent, sel: document.querySelector('.rec-item[aria-current="true"] b').textContent, filas: [...document.querySelectorAll('.rec-detalle .cf-fila')].map((x) => x.textContent) }));
  ok('analyze: al elegir otra se ve su detalle, con la cifra de cada equipo frente a lo normal', det2.h === lista[1].t && det2.sel === lista[1].t && det2.filas.length >= 2 && det2.filas.every((t) => /Normal/.test(t)), det2.h + ' · ' + det2.filas.length + ' filas');
  await p.click('.rec-detalle details:last-of-type summary'); await p.waitForTimeout(100);
  const abierta = await p.$eval('.rec-detalle details:last-of-type', (d) => d.open && /Usual causes/.test(d.textContent));
  ok('analyze: causas y respaldo al desplegar', abierta);
  const reg = await p.$('.rec-detalle [data-accion="registrar"]');
  if (reg) { await reg.click(); await listo(p); await p.waitForTimeout(300); }
  const tras = await A(p, () => ({ registrada: !!document.querySelector('.rec-detalle .rec-seg-estado'), inis: window.EasyPerformance.r.iniciativas.map((x) => x.iniciativa.id), cab: document.querySelector('.paso[data-v="improve"] small').textContent }));
  ok('analyze: registrar una iniciativa la lleva a Improve y la cabecera lo refleja', !!reg && tras.registrada && tras.inis.length === 3 && /3 initiatives/.test(tras.cab), tras.inis.join(', '));
  // Improve: plan con las tres, la registrada se puede quitar, el bloque de estándar, alta y baja desde la página
  await paso(p, 'improve');
  const plan = await A(p, () => ({ kicker: document.querySelector('.titular .kicker').textContent, n: document.querySelectorAll('.tabla-ini tbody tr').length, chips: [...document.querySelectorAll('.tabla-ini .chip')].map((x) => x.textContent), quitar: document.querySelectorAll('[data-accion="quitar-ini"]').length, cols: [...document.querySelectorAll('.tabla-ini thead th')].map((x) => x.textContent).join(','), estandar: document.querySelector('#estandar').textContent.replace(/\s+/g, ' '), botones: document.querySelectorAll('#estandar .btn').length, m: Math.round(document.documentElement.scrollHeight) }));
  await p.screenshot({ path: join(SALIDA, 'improve.png'), fullPage: true });
  ok('improve: una tabla con las tres iniciativas (una planificada que se puede quitar) y el estándar en una línea con dos descargas', plan.kicker === 'Step 3 of 4' && plan.n === 3 && plan.chips.includes('Planned') && plan.quitar === 1 && plan.cols === 'Initiative,Teams,Target,Start,Status,' && /5 measures, 1 definition each\. 5 tool states mapped to 5 common states/.test(plan.estandar) && plan.botones === 2 && plan.m <= 900, plan.estandar + ' · alto ' + plan.m);
  await clic(p, '[data-accion="nueva-ini"]');
  const form = await A(p, () => ({ f: !!document.getElementById('form-ini'), eqs: document.querySelectorAll('#form-ini input[name="equipos"]').length, medidas: document.querySelectorAll('#form-ini select[name="medida"] option').length }));
  await p.fill('#form-ini input[name="nombre"]', 'Peer review in Risk');
  await p.fill('#form-ini input[name="fecha_inicio"]', '2026-07-01');
  await p.fill('#form-ini textarea[name="descripcion"]', 'Every story is reviewed by another person of the team before testing.');
  await p.selectOption('#form-ini select[name="medida"]', 'retrabajo');
  await p.check('#form-ini input[name="equipos"][value="Risk"]');
  await p.click('#form-ini button[type="submit"]'); await listo(p); await p.waitForTimeout(400);
  const alta = await A(p, () => ({ n: document.querySelectorAll('.seg-plan').length, form: !!document.getElementById('form-ini'), nueva: [...document.querySelectorAll('.seg-plan')].filter((x) => /Peer review/.test(x.querySelector('th').textContent)).map((x) => ({ chip: x.querySelector('.chip').textContent, equipos: x.children[1].textContent, medida: x.children[2].textContent, quitar: !!x.querySelector('[data-accion="quitar-ini"]') }))[0], guardada: (JSON.parse(localStorage.getItem('easyperformance.config.v2') || '{}').iniciativas || []).length }));
  ok('improve: alta desde la página con nombre, fecha, equipo y medida; aparece en la tabla con botón de quitar; en ejemplo no se guarda', form.f && form.eqs === 4 && form.medidas >= 3 && alta.n === 4 && !alta.form && alta.nueva && alta.nueva.equipos === 'Risk' && /Rework/.test(alta.nueva.medida) && alta.nueva.quitar && alta.guardada === 0, JSON.stringify(alta.nueva));
  await clic(p, '.seg-plan[data-ini^="ini-peer"] [data-accion="quitar-ini"]'); await listo(p); await p.waitForTimeout(300);
  const baja = await p.$$eval('.seg-plan', (t) => t.length);
  ok('improve: quitar una iniciativa la retira de la tabla', baja === 3, baja + ' iniciativas');
  // Learn: las dos evaluadas con gráfico y detalle de la evaluación; la planificada no está; el bloque del ciclo
  await paso(p, 'learn');
  const seg = await A(p, () => ({ kicker: document.querySelector('.titular .kicker').textContent, cards: [...document.querySelectorAll('.seg')].map((x) => ({ chip: x.querySelector('.seg-cab .chip').textContent, graf: !!x.querySelector('.seg-graf polyline.seg-ini'), eval: !!x.querySelector('.seg-eval'), plegado: !x.querySelector('.seg-eval').open, cifras: x.querySelectorAll('.seg-cifras b').length, conf: [...x.querySelectorAll('.seg-dl dd')].map((d) => d.textContent).join('|') })), resumen: document.querySelector('.seg-resumen').textContent, ciclo: document.querySelector('#ciclo').textContent.replace(/\s+/g, ' '), boton: !!document.querySelector('#ciclo [data-accion="actualizar"]') }));
  ok('learn: las dos iniciativas evaluadas (una funciona, otra va a peor) con antes, después y gráfico, el detalle plegado, confianza en inglés y el ciclo en una línea', seg.kicker === 'Step 4 of 4' && seg.cards.length === 2 && seg.cards.some((x) => x.chip === 'Works') && seg.cards.some((x) => x.chip === 'Getting worse') && seg.cards.every((x) => x.graf && x.eval && x.plegado && x.cifras === 3 && /high|medium|low/.test(x.conf) && !/alta|media|baja/.test(x.conf)) && /Planned 1/.test(seg.resumen) && /Data up to .* Weekly: .* Monthly: .* Quarterly: /.test(seg.ciclo) && seg.boton, JSON.stringify(seg.cards.map((x) => x.chip + ' ' + x.conf)) + ' ' + seg.ciclo);
  await p.click('.seg[data-ini="limite-wip-pagos"] .seg-eval summary'); await p.waitForTimeout(200);
  const ev = await A(p, () => { const d = document.querySelector('.seg[data-ini="limite-wip-pagos"] .seg-eval'); return { open: d.open, pasos: [...d.querySelectorAll('.ev-cab > div > b')].map((x) => x.textContent), antes: (d.querySelector('.ev-paso .v-fila b') || {}).textContent, efecto: (d.querySelector('.v-ecu-res') || {}).textContent, checks: d.querySelectorAll('.v-check .v-ico.ok').length }; });
  await p.screenshot({ path: join(SALIDA, 'learn-evaluacion.png'), fullPage: true });
  ok('learn: "How it was evaluated" detalla los seis pasos con sus cifras en inglés', ev.open && ev.pasos.length === 6 && /^Before the start/.test(ev.pasos[0]) && /^Confidence high/.test(ev.pasos[5]) && /6\.2 days/.test(ev.antes) && /own effect/.test(ev.efecto) && ev.checks === 3, ev.pasos.join(' > ') + ' · ' + ev.antes + ' · ' + ev.efecto);
  // Measure > Data y Context
  await clic(p, '.paso[data-v="measure"]'); await p.selectOption('select[data-cambio="ver"]', 'area'); await p.waitForTimeout(200); await clic(p, '[data-accion="fiabilidad"]');
  const fia = await A(p, () => ({ vista: window.EasyPerformance.vista, setup: window.EasyPerformance.setup, sec: window.EasyPerformance.datos, cartas: document.querySelectorAll('.fiab-c').length, filas: document.querySelectorAll('.tabla-fiab tbody tr').length, h: document.querySelector('.fiab-cab h2').textContent }));
  ok('setup > data: el chip de fiabilidad de Measure abre las diez comprobaciones y la tabla por equipo', fia.vista === 'setup' && fia.setup === 'data' && fia.sec === 'fiabilidad' && fia.cartas === 10 && fia.filas === 4 && fia.h === 'Data reliability', JSON.stringify(fia));
  await clic(p, '[data-accion="datos-sec"][data-s="lectura"]');
  const lec = await A(p, () => ({ ficheros: /sample-data\.csv: 1,232 tasks/.test(document.querySelector('.pagina .bloque').textContent), hall: [...document.querySelectorAll('.hall h4')].map((x) => x.textContent), descarta: /Discards 2 columns with people/.test(document.querySelector('.hall-solo').textContent), confirmar: /Confirm in Setup/.test(document.querySelector('.hall-consultor').textContent), historia: (document.querySelector('.escalera li.actual b') || {}).textContent, cols: document.querySelectorAll('.tabla-cols tbody tr').length, fuera: document.querySelectorAll('.tabla-cols tr.col-fuera').length }));
  await p.screenshot({ path: join(SALIDA, 'measure-data-lectura.png'), fullPage: true });
  ok('setup > data: lectura del export con ficheros, hallazgos, nivel de historia y tabla de columnas, en inglés y con miles en formato en-GB', lec.ficheros && lec.hall.join('|') === 'Solved by the page itself|To confirm in Setup|Fixed when exporting' && lec.descarta && lec.confirmar && lec.historia === 'Time in each state' && lec.cols >= 20 && lec.fuera === 2, JSON.stringify(lec));
  await clic(p, '[data-accion="setup-sec"][data-s="context"]');
  const ctx = await A(p, () => ({ filas: [...document.querySelectorAll('#leido .leido-cab b')].map((x) => x.textContent), docs: document.querySelectorAll('.ctx-cat.con').length, vacias: document.querySelectorAll('.ctx-cat:not(.con)').length, catalogo: !!document.querySelector('#ajuste-definiciones [data-accion="definiciones"]'), ia: !!document.querySelector('[data-accion="ia-mapeo"]') }));
  await clic(p, '[data-accion="editar"][data-e="estados"]');
  const est = await A(p, () => ({ filas: document.querySelectorAll('select[data-cambio="estado"]').length, iaBoton: !!document.querySelector('[data-accion="ia-mapeo"]'), nota: /With an API key in Settings/.test(document.querySelector('.leido-panel').textContent) }));
  await p.screenshot({ path: join(SALIDA, 'measure-context.png'), fullPage: true });
  ok('setup > context: campo de equipo, proveedores y FTE, estados; documentos de contexto por categoría; catálogo de KPIs; sin clave la IA solo se anuncia', ctx.filas.join('|') === 'Team field|Vendors, areas, FTE and cost|States' && ctx.docs === 2 && ctx.vacias === 3 && ctx.catalogo && !ctx.ia && est.filas === 5 && !est.iaBoton && est.nota, JSON.stringify(ctx));
  // Settings
  await clic(p, '[data-accion="setup-sec"][data-s="settings"]');
  const aj = await A(p, () => ({ h: [...document.querySelectorAll('.pagina h2')].map((x) => x.textContent.trim()), nombre: document.querySelector('input[data-cambio="nombre"]').value, clave: !!document.querySelector('input[data-cambio="ia-clave"]'), vivo: [...document.querySelectorAll('.vivo .chip')].map((x) => x.textContent).join(','), botones: document.querySelectorAll('#ajuste-exportar .btn').length }));
  await p.screenshot({ path: join(SALIDA, 'settings.png'), fullPage: true });
  ok('setup > settings: cliente, asistente de IA, qué está en vivo (con los conectores marcados como demo), exportaciones y datos de ejemplo', aj.h.join('|') === 'AI assistant|What is live in this copy|Exports|Sample data' && aj.nombre === 'Sample bank' && aj.clave && aj.vivo === 'Live,Live,Needs a key,Demo,Roadmap' && aj.botones === 3, aj.h.join(', ') + ' · ' + aj.vivo);
  ok('contenido de ejemplo sin errores de consola', !p.errores.length, p.errores.join(' | '));
  await p.context().close();
}

// 5. IA: clave solo en el navegador, recomendaciones validadas, unión con el banco de casos, mapeo de estados, lectura del impacto, y un fallo de la API
{
  const p = await pagina(1440, 900);
  await A(p, () => window.EasyPerformance.verDemo()); await listo(p);
  await setup(p, 'settings');
  await p.fill('input[data-cambio="ia-clave"]', 'sk-ant-prueba-123'); await p.locator('input[data-cambio="ia-clave"]').dispatchEvent('change'); await p.waitForTimeout(200);
  const guardado = await A(p, () => ({ ses: JSON.parse(sessionStorage.getItem('easyperformance.ai') || '{}').clave, loc: localStorage.getItem('easyperformance.ai'), cfg: JSON.stringify(localStorage.getItem('easyperformance.config.v2') || '').includes('sk-ant'), vivo: [...document.querySelectorAll('.vivo .chip')].map((x) => x.textContent)[2], olvidar: !!document.querySelector('[data-accion="ia-olvidar"]') }));
  await p.check('input[data-cambio="ia-recordar"]'); await p.waitForTimeout(150);
  const recordada = await A(p, () => JSON.parse(localStorage.getItem('easyperformance.ai') || '{}').clave);
  await p.uncheck('input[data-cambio="ia-recordar"]'); await p.waitForTimeout(150);
  const olvidada = await A(p, () => localStorage.getItem('easyperformance.ai'));
  ok('ia: la clave vive en la sesión del navegador, en el dispositivo solo si se pide, y nunca en la configuración del cliente', guardado.ses === 'sk-ant-prueba-123' && guardado.loc === null && !guardado.cfg && guardado.vivo === 'Live' && guardado.olvidar && recordada === 'sk-ant-prueba-123' && olvidada === null, JSON.stringify(guardado));
  // Probar la conexión
  await apiSimulada(p, 'OK');
  await clic(p, '[data-accion="ia-probar"]'); await p.waitForTimeout(500);
  const probada = await A(p, () => ({ chip: (document.querySelector('#ajuste-ia .chip') || {}).textContent, aviso: document.getElementById('aviso').textContent }));
  ok('ia: probar la conexión manda la clave y la cabecera de navegador y muestra Connected', probada.chip === 'Connected' && /Connected/.test(probada.aviso) && p.peticionesIa[0].clave === 'sk-ant-prueba-123' && p.peticionesIa[0].navegador === 'true' && /^claude-/.test(p.peticionesIa[0].cuerpo.model), JSON.stringify(probada));
  // Recomendaciones: la referencia (casos del banco) más una nueva, una con equipo inventado y una con cifra inventada
  await p.unroute('https://api.anthropic.com/v1/messages');
  await apiSimulada(p, (pg) => pg.evaluate(() => {
    const r = window.Nucleo.IA.recomendacionesDeReferencia(window.EasyPerformance.r.paquete, window.CATALOGO);
    const nueva = { ...r[0], titulo: 'Review handovers between vendors', causa: { caso: null, texto: 'Work waits at every handover between the two vendor teams.' }, accion: 'Agree one weekly handover slot and a shared definition of ready.', primer_paso: 'List the open handovers of the last two weeks.', pregunta: 'Which handovers waited more than three days?', confianza: 'medium' };
    const equipoFalso = { ...r[0], titulo: 'Ghost', destinatario: { tipo: 'equipo', id: 'Ghost team' }, equipos: ['Ghost team'] };
    const cifraFalsa = { ...r[0], titulo: 'Wrong number', causa: { caso: null, texto: 'x' }, evidencia: [{ ...r[0].evidencia[0], valor: 999 }] };
    return JSON.stringify([...r, nueva, equipoFalso, cifraFalsa]);
  }));
  await paso(p, 'analyze');
  const antes = await A(p, () => ({ boton: document.querySelector('[data-accion="ia-recs"]').textContent, items: document.querySelectorAll('.rec-item').length }));
  await clic(p, '[data-accion="ia-recs"]'); await p.waitForTimeout(900);
  const recs = await A(p, () => ({ ia: window.EasyPerformance.iaRecs.length, descartadas: window.EasyPerformance.iaDescartadas, items: document.querySelectorAll('.rec-item').length, nuevas: document.querySelectorAll('.rec-item .chip-ia').length, acuerdos: document.querySelectorAll('.rec-item .ia-ok').length, senal: document.querySelector('.senal-ia').textContent.replace(/\s+/g, ' ').trim(), panel: document.querySelector('.bloque-ia p.nota').textContent, cab: document.querySelector('.paso[data-v="analyze"] small').textContent, enviado: null }));
  const enviado = p.peticionesIa[p.peticionesIa.length - 1].cuerpo;
  const paqueteEnviado = enviado.messages[0].content.includes('"casos_activos"') && !/"titulo"|"descripcion"|Persona/.test(enviado.messages[0].content.split('\n\nMeasures')[0]);
  await p.screenshot({ path: join(SALIDA, 'analyze-ia.png'), fullPage: true });
  ok('ia: recibe el paquete sin campos prohibidos; las que repiten un caso se unen a la del banco, la nueva se lista con la etiqueta AI, y las que citan un equipo o una cifra inventados se descartan',
    antes.boton === 'Generate' && paqueteEnviado && recs.descartadas === 2 && recs.nuevas === 1 && recs.items === antes.items + 1 && recs.acuerdos >= 3 && /checked against the package/.test(recs.panel) && /2 discarded/.test(recs.panel) && /to do/.test(recs.cab), JSON.stringify(recs) + ' · paquete sin prohibidos: ' + paqueteEnviado + ' · antes: ' + antes.items);
  await clic(p, '.rec-item:has(.chip-ia)');
  const detIa = await A(p, () => { const d = document.querySelector('.rec-detalle'); return { h: d.querySelector('h2').textContent, chip: d.querySelector('.chip-ia').textContent, conf: /Confidence medium/.test(d.textContent), driver: /handover/.test(d.querySelector('.rec-resumen').textContent), cifras: d.querySelectorAll('.cifra').length, enPaquete: [...d.querySelectorAll('.cifra .chip')].every((x) => x.textContent === 'Checked'), registrar: !!d.querySelector('[data-accion="registrar"]'), pregunta: /Which handovers waited/.test(d.textContent) }; });
  ok('ia: la ficha de una recomendación de la IA muestra el driver, el primer paso, las cifras comprobadas (plegadas), la pregunta y el botón de registrar', detIa.h === 'Review handovers between vendors' && detIa.chip === 'AI' && detIa.conf && detIa.driver && detIa.cifras >= 2 && detIa.enPaquete && detIa.registrar && detIa.pregunta, JSON.stringify(detIa));
  await clic(p, '.rec-detalle [data-accion="registrar"]'); await listo(p); await p.waitForTimeout(300);
  const regIa = await A(p, () => ({ ini: window.EasyPerformance.r.iniciativas.map((x) => x.iniciativa.notas).filter((n) => /AI assistant/.test(n)).length, estado: !!document.querySelector('.rec-detalle .rec-seg-estado') }));
  ok('ia: una recomendación de la IA se registra como iniciativa', regIa.ini === 1 && regIa.estado, JSON.stringify(regIa));
  await clic(p, '.rec-item:has(.ia-ok)');
  const acuerdo = await A(p, () => ({ extra: (document.querySelector('.rec-detalle .rec-ia-extra') || {}).textContent || '' }));
  ok('ia: la recomendación del banco con la que la IA coincide enseña lo que la IA añade', /^AI/.test(acuerdo.extra.trim()) && acuerdo.extra.trim().length > 10, acuerdo.extra.slice(0, 80));
  // Mapeo de estados: la IA cambia uno; se aplica, se marca y se guarda como corrección
  await p.unroute('https://api.anthropic.com/v1/messages');
  await apiSimulada(p, (pg, cuerpo) => pg.evaluate(() => { const m = {}; window.EasyPerformance.det.estados.forEach((e) => { m[e.nombre] = window.EasyPerformance.r.preparacion.mapeo[e.nombre]; }); m['In Review'] = 'en_espera'; return JSON.stringify(m); }));
  await setup(p, 'context'); await clic(p, '[data-accion="editar"][data-e="estados"]');
  const soloNombres = async () => { const c = p.peticionesIa[p.peticionesIa.length - 1].cuerpo.messages[0].content; return /"In Review"/.test(c) && !/casos_activos|"serie"/.test(c); };
  await clic(p, '[data-accion="ia-mapeo"]'); await listo(p); await p.waitForTimeout(400);
  const mapeo = await A(p, () => ({ m: window.EasyPerformance.r.preparacion.mapeo['In Review'], sel: document.querySelector('select[data-cambio="estado"][data-e="In Review"]').value, chip: /AI proposal applied/.test(document.querySelector('#ajuste-estados').textContent), aviso: document.getElementById('aviso').textContent }));
  ok('ia: la propuesta de mapeo de estados solo lleva nombres y recuentos, se aplica al cálculo, se ve en la tabla y se avisa', (await soloNombres()) && mapeo.m === 'en_espera' && mapeo.sel === 'en_espera' && mapeo.chip && /changed 1 state/.test(mapeo.aviso), JSON.stringify(mapeo));
  // Lectura del impacto: una buena y una con cifra inventada
  await p.unroute('https://api.anthropic.com/v1/messages');
  await apiSimulada(p, (pg) => pg.evaluate(() => {
    const inis = window.EasyPerformance.r.paquete.iniciativas.filter((i) => i.evaluacion.resultados.some((x) => x.disponible && x.antes != null));
    const f = (x, v) => (x.medida === 'ciclo' ? Math.round(v * 10) / 10 : Math.round(v * 100));
    const buena = inis.map((i) => { const x = i.evaluacion.resultados.find((y) => y.disponible); return { id: i.id, veredicto: x.enDireccionEsperada ? 'works' : 'getting worse', lectura: `It moved from ${f(x, x.antes)} to ${f(x, x.despues)} while the other teams stayed around ${f(x, x.control.despues)}. Keep it and review it next month.` }; });
    return JSON.stringify([...buena, { id: inis[0].id, veredicto: 'works', lectura: 'It improved by 4242 points.' }]);
  }));
  await paso(p, 'learn');
  await clic(p, '[data-accion="ia-impacto"]'); await p.waitForTimeout(700);
  const impacto = await A(p, () => ({ lecturas: document.querySelectorAll('.ia-lectura').length, texto: (document.querySelector('.ia-lectura p') || {}).textContent || '', panel: document.querySelector('.bloque-ia p.nota').textContent }));
  await p.screenshot({ path: join(SALIDA, 'learn-ia.png'), fullPage: true });
  ok('ia: la lectura del impacto aparece en cada iniciativa evaluada y la que inventa una cifra se descarta', impacto.lecturas === 2 && /moved from/.test(impacto.texto) && /2 readings, every number checked/.test(impacto.panel) && /1 discarded/.test(impacto.panel), JSON.stringify(impacto));
  // Un fallo de la API no rompe nada
  await p.unroute('https://api.anthropic.com/v1/messages');
  await apiSimulada(p, null, 401);
  await paso(p, 'analyze'); await clic(p, '[data-accion="ia-recs"]'); await p.waitForTimeout(600);
  const fallo = await A(p, () => ({ estado: window.EasyPerformance.iaEstado, panel: document.querySelector('.bloque-ia p.nota').textContent, items: document.querySelectorAll('.rec-item').length, boton: !document.querySelector('[data-accion="ia-recs"]').disabled }));
  ok('ia: si la API falla se dice en el panel, las recomendaciones anteriores siguen y se puede volver a pedir', fallo.estado === 'error' && /401/.test(fallo.panel) && /simulated failure/.test(fallo.panel) && fallo.items >= 7 && fallo.boton, fallo.panel);
  // Olvidar la clave
  await setup(p, 'settings'); await clic(p, '[data-accion="ia-olvidar"]');
  const sinClave = await A(p, () => ({ ses: sessionStorage.getItem('easyperformance.ai'), loc: localStorage.getItem('easyperformance.ai'), vivo: [...document.querySelectorAll('.vivo .chip')].map((x) => x.textContent)[2] }));
  ok('ia: olvidar la clave la borra de la sesión y del dispositivo', sinClave.ses === null && sinClave.loc === null && sinClave.vivo === 'Needs a key', JSON.stringify(sinClave));
  const erroresIa = p.errores.filter((e) => !/401/.test(e));
  ok('ia sin errores de consola (salvo el 401 simulado)', !erroresIa.length, erroresIa.join(' | '));
  await p.context().close();
}

// 6. Los dos exports con fallos sembrados, cargados desde la entrada: cada fallo lo detecta su comprobación, sin falsas alarmas
const CON_FALLOS = [
  { nombre: 'export con fallos', csv: ['fallos', 'jira-con-fallos.csv'], escenarios: ['fallos', 'escenarios.json'], nivel: 'Low' },
  { nombre: 'aseguradora', csv: ['aseguradora', 'jira-aseguradora.csv'], escenarios: ['aseguradora', 'escenarios.json'], nivel: 'Medium' },
];
const COLS_FIAB = ['tiempos', 'flujo', 'registro', 'estimacion', 'sprints', 'historia'];
for (const e of CON_FALLOS) {
  const p = await pagina(1280, 720);
  const esc = JSON.parse(readFileSync(join(RAIZ, 'datos-sinteticos', ...e.escenarios), 'utf8'));
  await p.setInputFiles('#entrada-ficheros', join(RAIZ, 'datos-sinteticos', ...e.csv)); await listo(p); await p.waitForTimeout(300);
  const tira = await texto(p, '[data-accion="fiabilidad"]');
  await clic(p, '[data-accion="fiabilidad"]');
  const f = await A(p, () => {
    const z = window.EasyPerformance.fiab();
    return { nivel: document.querySelector('.fiab-nivel b').textContent, area: z.comprobaciones.filter((c) => c.estado === 'revisar').map((c) => c.id), revisar: [...document.querySelectorAll('.fiab-c.fiab-revisar h3')].map((x) => x.textContent),
      porEquipo: Object.fromEntries(z.porEquipo.map((e) => [e.equipo, Object.keys(e.valores).filter((k) => e.valores[k].estado === 'revisar')])) };
  });
  const detectado = esc.sembrados.map((s) => {
    const area = s.ambito === 'equipo' ? null : f.area.includes(s.id);
    const equipo = s.ambito === 'area' || !COLS_FIAB.includes(s.id) ? null : (f.porEquipo[s.equipo] || []).includes(s.id);
    return { id: s.id, ok: area !== false && equipo !== false };
  });
  const falsas = f.area.filter((id) => !esc.sembrados.some((s) => s.id === id));
  await p.screenshot({ path: join(SALIDA, e.nombre.replace(/ /g, '-') + '-fiabilidad.png'), fullPage: true });
  ok(e.nombre + ': fiabilidad ' + e.nivel.toLowerCase() + ' y los ' + esc.sembrados.length + ' fallos sembrados detectados, sin falsas alarmas', new RegExp('reliability ' + e.nivel.toLowerCase()).test(tira) && f.nivel === e.nivel && detectado.every((x) => x.ok) && !falsas.length, detectado.filter((x) => !x.ok).map((x) => x.id).join(', ') + ' sin detectar · falsas: ' + falsas.join(', ') + ' · por revisar: ' + f.revisar.join(', '));
  if (esc.sin_fallo) {
    const bien = esc.sin_fallo.every((s) => !(f.porEquipo[s.equipo] || []).includes(s.id));
    ok(e.nombre + ': un equipo sin sprints no se marca', bien, JSON.stringify(esc.sin_fallo));
  }
  if (e.nombre === 'aseguradora') {
    await clic(p, '[data-accion="datos-sec"][data-s="lectura"]');
    const cols = await A(p, () => Object.fromEntries([...document.querySelectorAll('.tabla-cols tbody tr')].map((t) => [t.querySelector('th code').textContent, t.querySelector('td:last-child').textContent])));
    const eq = await A(p, () => [...document.querySelectorAll('.tabla-cols tbody tr')].filter((t) => /Team of each task/.test(t.textContent)).map((t) => t.querySelector('th code').textContent));
    ok('aseguradora: un Jira en castellano se lee igual (personas descartadas, Ramo ignorado, equipo en Componentes)', ['Persona asignada', 'Informador', 'Creador', 'Comentario'].every((k) => cols[k] === 'Discarded') && cols['Campo personalizado (Ramo)'] === 'Ignored' && cols['Estado'] === 'Used' && eq.join() === 'Componentes', JSON.stringify(eq));
  }
  ok(e.nombre + ' sin errores de consola', !p.errores.length, p.errores.join(' | '));
  await p.context().close();
}

// 7. Modo oscuro, móvil y portátil al 150 %
{
  const p = await pagina(1280, 720, { oscuro: true });
  await A(p, () => window.EasyPerformance.verDemo()); await listo(p);
  const r = await recorrer(p, 'oscuro', false);
  await p.screenshot({ path: join(SALIDA, 'oscuro-area.png'), fullPage: true });
  const fondo = await A(p, () => getComputedStyle(document.body).backgroundColor);
  ok('modo oscuro: fondo oscuro, sin scroll horizontal ni errores', fondo === 'rgb(11, 16, 38)' && !r.fallos.length && !p.errores.length, `fondo ${fondo} ${r.fallos.join('; ')} ${p.errores.join(' | ')}`);
  await p.context().close();
  const q = await pagina(390, 844);
  const entradaMovil = await medir(q);
  await A(q, () => window.EasyPerformance.verDemo()); await listo(q);
  const rq = await recorrer(q, 'movil', false);
  await q.screenshot({ path: join(SALIDA, 'movil-area.png'), fullPage: true });
  await paso(q, 'improve'); await clic(q, '[data-accion="nueva-ini"]');
  const mi = await medir(q);
  if (mi.ancho > 1) rq.fallos.push('formulario de iniciativa: ' + mi.ancho + 'px de scroll horizontal');
  await q.screenshot({ path: join(SALIDA, 'movil-improve.png'), fullPage: true });
  ok('móvil (390 px): sin scroll horizontal en la entrada ni en ninguna pantalla', entradaMovil.ancho <= 1 && !rq.fallos.length && !q.errores.length, rq.fallos.join('; ') + q.errores.join(' | '));
  await q.context().close();
  const w = await pagina(1280, 600);
  const raiz = () => A(w, () => getComputedStyle(document.documentElement).fontSize);
  const entrada = await medir(w), raizW = await raiz();
  await A(w, () => window.EasyPerformance.verDemo()); await listo(w);
  const matriz = await A(w, () => Math.round(document.querySelector('.tabla-caja').getBoundingClientRect().top));
  const cabecera = await A(w, () => Math.round(document.querySelector('.cab').getBoundingClientRect().height));
  const rw = await recorrer(w, 'portatil-150', false);
  await w.screenshot({ path: join(SALIDA, 'portatil-150-area.png') });
  ok('portátil al 150 % (1280 x 600): letra reducida, la entrada cabe, la cabecera en una línea y la tabla de equipos asoma', raizW === '13px' && entrada.alto <= 600 && cabecera <= 70 && matriz < 600 && !rw.fallos.length && !w.errores.length, `raíz ${raizW}, entrada ${entrada.alto}px, cabecera ${cabecera}px, tabla en ${matriz}px ${rw.fallos.join('; ')} ${w.errores.join(' | ')}`);
  await w.context().close();
  const g = await pagina(1512, 860);
  const raizG = await A(g, () => getComputedStyle(document.documentElement).fontSize);
  await A(g, () => window.EasyPerformance.verDemo()); await listo(g);
  const cabG = await A(g, () => Math.round(document.querySelector('.cab').getBoundingClientRect().height));
  ok('pantalla grande (1512 x 860): tamaño completo y la cabecera en una línea', raizG === '16px' && cabG <= 80, 'raíz ' + raizG + ', cabecera ' + cabG + 'px');
  await g.context().close();
}

// 8. Jira.csv de principio a fin: del CSV al baseline, cambios en Context, catálogo de KPIs y paquete
{
  const p = await pagina(1280, 720);
  const t0 = Date.now();
  await p.setInputFiles('#entrada-ficheros', join(RAIZ, 'datos-prueba', 'Jira.csv'));
  await listo(p);
  const seg = Math.round((Date.now() - t0) / 1000);
  const inicio = await A(p, () => ({ vista: window.EasyPerformance.vista, eqs: window.EasyPerformance.r.modelo.equipos.map((e) => e.nombre).join(', '), recs: window.EasyPerformance.recomendaciones().length, proc: !!document.querySelector('.proc') }));
  await p.screenshot({ path: join(SALIDA, 'jira-area.png'), fullPage: true });
  ok('Jira.csv: de la carga al baseline (con "reducir movimiento" no hay método animado)', inicio.vista === 'measure' && inicio.eqs === 'Infrastructure, Mobile, Web' && !inicio.proc, `${inicio.eqs} · ${inicio.recs} recomendaciones · ${seg} s`);
  const r = await recorrer(p, 'jira', true);
  ok('Jira.csv: todas las pantallas sin scroll horizontal', !r.fallos.length, r.fallos.join('; ') + ' · altos: ' + r.altos.join(', '));
  await setup(p, 'data'); await clic(p, '[data-accion="datos-sec"][data-s="fiabilidad"]');
  const fj = await A(p, () => ({ nivel: document.querySelector('.fiab-nivel b').textContent, revisar: document.querySelectorAll('.fiab-c.fiab-revisar').length, arreglo: [...document.querySelectorAll('.fiab-c.fiab-revisar')].every((x) => /How to fix it/.test(x.textContent)) }));
  ok('Jira.csv: la fiabilidad avisa de lo que hay que revisar y cómo arreglarlo', fj.revisar >= 3 && fj.arreglo && fj.nivel !== 'High', JSON.stringify(fj));
  await clic(p, '[data-accion="setup-sec"][data-s="context"]'); await clic(p, '[data-accion="editar"][data-e="estados"]');
  const antes = await A(p, () => window.EasyPerformance.r.preparacion.mapeo['In Progress']);
  await p.selectOption('select[data-cambio="estado"][data-e="In Progress"]', 'en_revision');
  await listo(p); await p.waitForTimeout(300);
  const despues = await A(p, () => ({ m: window.EasyPerformance.r.preparacion.mapeo['In Progress'], g: JSON.parse(localStorage.getItem('easyperformance.config.v2') || '{}') }));
  ok('context: un estado cambiado se recalcula y se guarda', antes === 'en_curso' && despues.m === 'en_revision' && despues.g.mapeoEstados && despues.g.mapeoEstados['In Progress'] === 'en_revision', `In Progress: ${antes} a ${despues.m}`);
  await clic(p, '[data-accion="editar"][data-e="equipos"]');
  const cmpAntes = await A(p, () => window.EasyPerformance.r.comparaciones.filter((c) => c.dimension === 'tipo').length);
  await p.selectOption('select[data-cambio="eq"][data-campo="tipo"][data-e="Mobile"]', 'proveedor'); await listo(p); await p.waitForTimeout(300);
  await p.fill('input[data-cambio="eq"][data-campo="proveedor"][data-e="Mobile"]', 'Vendor One'); await p.press('input[data-campo="proveedor"][data-e="Mobile"]', 'Tab'); await listo(p); await p.waitForTimeout(300);
  const cmp = await A(p, () => ({ n: window.EasyPerformance.r.comparaciones.filter((c) => c.dimension === 'tipo').length, g: JSON.parse(localStorage.getItem('easyperformance.config.v2')).equiposInfo }));
  ok('context: marcar un proveedor activa la comparación y se guarda', cmpAntes === 0 && cmp.n === 1 && cmp.g.Mobile.tipo === 'proveedor' && cmp.g.Mobile.proveedor === 'Vendor One', JSON.stringify(cmp.g));
  await paso(p, 'analyze');
  const grupos = await A(p, () => ({ h: (document.querySelector('#grupos .linea-sum') || {}).textContent || '', cols: [...document.querySelectorAll('#grupos thead th')].map((x) => x.textContent).join(',') }));
  ok('analyze: con un proveedor marcado aparece la comparación In-house vs vendors', /In-house vs vendors/.test(grupos.h) && /In-house/.test(grupos.cols) && /Vendors/.test(grupos.cols), grupos.cols);
  await p.screenshot({ path: join(SALIDA, 'jira-analyze.png'), fullPage: true });
  // Documentos desde Settings
  await setup(p, 'settings');
  await p.fill('input[data-cambio="nombre"]', 'Test client'); await p.press('input[data-cambio="nombre"]', 'Tab');
  const bajar = async (sel) => {
    const [d] = await Promise.all([p.waitForEvent('download'), p.click(sel)]);
    const ruta = join(SALIDA, d.suggestedFilename()); await d.saveAs(ruta);
    return { nombre: d.suggestedFilename(), datos: readFileSync(ruta) };
  };
  const docx = await bajar('#ajuste-exportar [data-accion="definiciones"][data-f="docx"]'), paq = await bajar('[data-accion="paquete"]'), mod = await bajar('[data-accion="modelo"]');
  await clic(p, '[data-accion="setup-sec"][data-s="context"]');
  const md = await bajar('[data-accion="definiciones"][data-f="md"]');
  const mdT = md.datos.toString('utf8');
  ok('catálogo de KPIs en Word y markdown con los cambios, en inglés y sin rayas', docx.datos.slice(0, 2).toString() === 'PK' && docx.datos.toString('latin1').includes('word/document.xml') && /^kpi-catalogue-test-client-/.test(docx.nombre) &&
    mdT.includes('Test client') && /\| In Progress \| In Progress \| (In review|Review) \|/.test(mdT) && /Vendor: Vendor One/.test(mdT) && !/[—–]/.test(mdT), `${docx.nombre} · ${md.nombre}`);
  const paquete = JSON.parse(paq.datos.toString('utf8'));
  const problemas = await A(p, (x) => window.Nucleo.comprobarPaquete(x), paquete);
  const modelo = JSON.parse(mod.datos.toString('utf8'));
  ok('paquete de diagnóstico y modelo de medida exportados; el paquete sin campos prohibidos', problemas.length === 0 && !!paquete.equipos && /^diagnostic-package-/.test(paq.nombre) && mod.nombre === 'measurement-model.json' && !!modelo, `${paq.nombre} · ${Math.round(paq.datos.length / 1024)} KB · ${mod.nombre}`);
  // Iniciativa registrada desde la página con datos reales: se guarda en la configuración
  await paso(p, 'improve'); await clic(p, '[data-accion="nueva-ini"]');
  await p.fill('#form-ini input[name="nombre"]', 'Test with real data');
  await p.fill('#form-ini input[name="fecha_inicio"]', '2025-03-01');
  await p.check('#form-ini input[name="equipos"][value="Web"]');
  await p.click('#form-ini button[type="submit"]'); await listo(p); await p.waitForTimeout(300);
  const guardada = await A(p, () => ({ n: document.querySelectorAll('.seg-plan').length, cfg: (JSON.parse(localStorage.getItem('easyperformance.config.v2') || '{}').iniciativas || []).map((i) => i.nombre) }));
  ok('improve: con datos reales la iniciativa queda guardada en la configuración', guardada.n === 1 && guardada.cfg.join() === 'Test with real data', JSON.stringify(guardada));
  // Datos de ejemplo desde Settings y vuelta: la configuración real no cambia
  const cfgAntes = await A(p, () => localStorage.getItem('easyperformance.config.v2'));
  await setup(p, 'settings');
  await clic(p, '#ajuste-datos [data-accion="demo"]'); await listo(p); await p.waitForTimeout(300);
  const enDemo = await A(p, () => window.EasyPerformance.r.modelo.equipos.map((e) => e.nombre).join(', '));
  await clic(p, '[data-accion="salir-demo"]'); await p.waitForTimeout(300);
  const vuelta = await A(p, () => ({ cfg: localStorage.getItem('easyperformance.config.v2'), eqs: window.EasyPerformance.r.modelo.equipos.map((e) => e.nombre).join(', ') }));
  ok('datos de ejemplo sin pisar la configuración ni los datos reales', cfgAntes === vuelta.cfg && enDemo !== vuelta.eqs && vuelta.eqs === 'Infrastructure, Mobile, Web', `ejemplo: ${enDemo} · vuelta: ${vuelta.eqs}`);
  await p.reload(); await p.waitForTimeout(400);
  await p.setInputFiles('#entrada-ficheros', join(RAIZ, 'datos-prueba', 'Jira.csv')); await listo(p);
  const otraVez = await A(p, () => ({ m: window.EasyPerformance.r.preparacion.mapeo['In Progress'], n: window.EasyPerformance.r.comparaciones.filter((c) => c.dimension === 'tipo').length, ini: window.EasyPerformance.r.iniciativas.length }));
  ok('los cambios y la iniciativa se conservan al volver a abrir la página', otraVez.m === 'en_revision' && otraVez.n === 1 && otraVez.ini === 1, JSON.stringify(otraVez));
  ok('recorrido con Jira.csv sin errores de consola', !p.errores.length, p.errores.join(' | '));
  await p.context().close();
}

// 9. Carpeta compartida con dos iniciativas y contexto (carpeta simulada con la interfaz de la de Chrome)
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
    const raiz = carpeta('test-client', [], {
      exports: carpeta('exports', [fichero('jira-b3.csv', csv)]),
      iniciativas: carpeta('iniciativas', inis.map((i) => fichero(i.nombre, i.texto))),
      contexto: carpeta('contexto', [fichero('contexto.json', ctx)]),
    });
    window.EasyPerformance.carpeta = raiz;
    await window.EasyPerformance.leerCarpeta(raiz);
  }, { csv, inis, ctx });
  await listo(p); await p.waitForTimeout(300);
  const r = await A(p, () => ({ ini: window.EasyPerformance.r.iniciativas.map((x) => x.iniciativa.id), ctx: window.EasyPerformance.contexto ? window.EasyPerformance.contexto.documentos.length : 0, cab: document.querySelector('.paso[data-v="improve"] small').textContent }));
  await paso(p, 'improve');
  const quitar = await p.$$eval('[data-accion="quitar-ini"]', (t) => t.length);
  await setup(p, 'context');
  const docs = await p.$$eval('.ctx-cat.con', (t) => t.length);
  await p.screenshot({ path: join(SALIDA, 'carpeta-context.png'), fullPage: true });
  ok('carpeta compartida: dos iniciativas leídas y evaluadas, y el contexto en Context; las de la carpeta no se quitan desde la página', r.ini.length === 2 && /2 initiatives/.test(r.cab) && r.ctx === 2 && quitar === 0 && docs === 2, `${r.ini.join(', ')} · contexto ${r.ctx} documentos`);
  ok('carpeta compartida sin errores de consola', !p.errores.length, p.errores.join(' | '));
  await p.context().close();
}

// 10. Una configuración guardada por la versión anterior se aprovecha
{
  const p = await pagina(1280, 720);
  await A(p, () => localStorage.setItem('easyperformance.configuracion.v1', JSON.stringify({
    version: 1, campoEquipo: 'componentes', equipos: ['Infrastructure', 'Mobile', 'Web'], etapas: { 'To Do': 'pendiente', 'In Progress': 'curso', 'Done': 'hecho' },
    equiposInfo: { Web: { tipo: 'proveedor', proveedor: 'Vendor Web' } }, objetivos: ['tardamos'], medidas: ['ciclo'], perfiles: ['responsable'],
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
