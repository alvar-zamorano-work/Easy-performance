// Verificación de la página en Chromium: tablero, recomendaciones, iniciativas, datos y ajustes, más el tutorial.
//   npm run web && CHROME=/ruta/a/chrome node web/verificar.mjs
// Comprueba: entrada (cargar datos y tutorial, sin presentación ni conectores simulados), tutorial de diez pasos sobre la
// interfaz, datos de ejemplo en 1280x720 y 1920x1080 (sin scroll horizontal, sin errores de consola), contenido del
// tablero, recomendaciones directas con lista y detalle, registro desde una recomendación, alta y baja de una
// iniciativa desde la página, detalle estático de la evaluación, datos (fiabilidad y lectura del export), ajustes,
// modo oscuro, móvil, portátil al 150 %, Jira.csv de principio a fin (estados y proveedores cambiados y guardados,
// documento de definiciones y paquete), ejemplo sin pisar la configuración, carpeta con dos iniciativas y una
// configuración de la versión anterior. Y los dos exports con fallos sembrados cargados desde la entrada: cada fallo lo
// detecta su comprobación y no hay falsas alarmas.
// El navegador pide "reducir movimiento" salvo en el bloque del tutorial.

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
const VISTAS = ['tablero', 'recomendaciones', 'iniciativas', 'datos', 'ajustes'];

/** Recorre tablero (área y cada equipo), recomendaciones, iniciativas, datos (las dos secciones) y ajustes. Devuelve fallos de ancho y altos. */
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
  await clic(p, '[data-accion="vista"][data-v="datos"]');
  for (const s of ['fiabilidad', 'lectura']) { await clic(p, `[data-accion="datos-sec"][data-s="${s}"]`); await mirar('datos-' + s); }
  await clic(p, '[data-accion="vista"][data-v="ajustes"]'); await mirar('ajustes');
  await clic(p, '[data-accion="vista"][data-v="tablero"]');
  return { fallos, altos };
}

// 1. Entrada y datos de ejemplo en dos tamaños: solo cargar datos y el tutorial; nada de presentación ni conectores
for (const [w, h] of [[1280, 720], [1920, 1080]]) {
  const p = await pagina(w, h);
  const entrada = await A(p, () => ({ vista: window.EasyPerformance.vista, zona: !!document.getElementById('zona'), tutorial: !!document.querySelector('.inicio [data-accion="tutorial"]'),
    h1: document.querySelector('.inicio h1').textContent, sobra: !!document.querySelector('.conector, .ejemplo, .claim, .metodo-mini, [data-accion="fuente"], [data-accion="conectar"], [data-accion="presentacion"]') }));
  const m0 = await medir(p);
  if (w === 1280) await p.screenshot({ path: join(SALIDA, 'entrada.png') });
  ok(`entrada en ${w}x${h}: cargar datos y tutorial, sin presentación ni conectores simulados`, entrada.vista === 'inicio' && entrada.zona && entrada.tutorial && !entrada.sobra && entrada.h1 === 'Rendimiento de equipos desde Jira' && m0.ancho <= 1 && m0.alto <= h + 1, `alto ${m0.alto}`);
  await A(p, () => window.EasyPerformance.verDemo()); await listo(p);
  const enDemo = await A(p, () => ({ demo: window.EasyPerformance.demo, vista: window.EasyPerformance.vista, pest: [...document.querySelectorAll('.pestana')].map((x) => x.textContent.trim().replace(/\s*\d+$/, '')).join(', '), banda: /Datos de ejemplo/.test(document.querySelector('.banda-demo').textContent) }));
  ok(`datos de ejemplo en ${w}x${h}: tablero con cinco pestañas y la banda de ejemplo`, enDemo.demo && enDemo.vista === 'tablero' && enDemo.pest === 'Tablero, Recomendaciones, Iniciativas, Datos, Ajustes' && enDemo.banda, enDemo.pest);
  const r = await recorrer(p, `ejemplo-${w}`, true);
  ok(`ejemplo: todas las pantallas sin scroll horizontal en ${w}x${h}`, !r.fallos.length, r.fallos.join('; ') + ' · altos: ' + r.altos.join(', '));
  ok(`ejemplo sin errores de consola en ${w}x${h}`, !p.errores.length, p.errores.join(' | '));
  await p.context().close();
}

// 2. El tutorial: diez pasos sobre la interfaz real, con los datos de ejemplo si no hay otros
{
  const p = await pagina(1280, 720, { animar: true });
  await clic(p, '.inicio [data-accion="tutorial"]'); await listo(p); await p.waitForTimeout(600);
  const pasos = [];
  for (let k = 0; k < 12; k++) {
    const est = await A(p, () => {
      const t = document.querySelector('.tut-tarjeta'); if (!t) return null;
      const f = document.querySelector('.tut-foco'), r = f && !f.hidden ? f.getBoundingClientRect() : null;
      return { cuenta: t.querySelector('.tut-cuenta').textContent, titulo: t.querySelector('h3').textContent, vista: window.EasyPerformance.vista, ver: window.EasyPerformance.ver, foco: !!r, dentro: r ? r.top >= -2 && r.bottom <= innerHeight + 2 : null, tarjeta: (() => { const b = t.getBoundingClientRect(); return b.top >= 0 && b.bottom <= innerHeight && b.left >= 0 && b.right <= innerWidth; })() };
    });
    if (!est) break;
    pasos.push(est);
    if (k === 0) await p.screenshot({ path: join(SALIDA, 'tutorial-1.png') });
    if (k === 4) await p.screenshot({ path: join(SALIDA, 'tutorial-5.png') });
    if (k === 1) { await p.keyboard.press('ArrowRight'); await p.waitForTimeout(500); }
    else { await p.click('[data-tut="siguiente"]'); await p.waitForTimeout(500); }
  }
  const tras = await A(p, () => ({ tut: !!document.querySelector('.tut'), vista: window.EasyPerformance.vista, demo: window.EasyPerformance.demo, visto: !!localStorage.getItem('easyperformance.tutorial') }));
  const vistas = pasos.map((x) => x.vista).join(',');
  ok('tutorial: diez pasos que recorren tablero, equipo, recomendaciones, iniciativas, datos y ajustes, y acaba en el tablero',
    pasos.length === 10 && pasos[0].cuenta === 'Paso 1 de 10' && pasos[9].cuenta === 'Paso 10 de 10' && vistas === 'tablero,tablero,tablero,tablero,recomendaciones,recomendaciones,iniciativas,datos,ajustes,tablero' && pasos[3].ver !== 'area' && !tras.tut && tras.vista === 'tablero' && tras.demo && tras.visto,
    pasos.map((x) => x.titulo).join(' > '));
  ok('tutorial: cada paso señala un elemento visible y la tarjeta cabe en pantalla', pasos.every((x) => x.foco && x.dentro && x.tarjeta), JSON.stringify(pasos.map((x) => [x.foco, x.dentro, x.tarjeta])));
  // Desde la cabecera, con datos cargados, también se abre; Esc lo cierra y Anterior vuelve
  await clic(p, '.cab [data-accion="tutorial"]'); await p.waitForTimeout(500);
  await p.click('[data-tut="siguiente"]'); await p.waitForTimeout(400);
  const dos = await texto(p, '.tut-cuenta');
  await p.click('[data-tut="anterior"]'); await p.waitForTimeout(400);
  const uno = await texto(p, '.tut-cuenta');
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  const cerrado = !(await p.$('.tut'));
  ok('tutorial: se reabre desde la cabecera, Anterior vuelve y Esc lo cierra', dos === 'Paso 2 de 10' && uno === 'Paso 1 de 10' && cerrado, dos + ' / ' + uno);
  ok('tutorial sin errores de consola', !p.errores.length, p.errores.join(' | '));
  await p.context().close();
}

// 3. Contenido con los datos de ejemplo: lo sembrado aparece donde toca; recomendaciones directas; iniciativas desde la página
{
  const p = await pagina(1440, 900);
  await A(p, () => window.EasyPerformance.verDemo()); await listo(p);
  const cab = await A(p, () => ({ h1: document.querySelector('.cab-area h1').textContent, sub: document.querySelector('.cab-area p').textContent, foco: [...document.querySelectorAll('.estado-area .pill-eq')].map((x) => x.textContent), boton: (document.querySelector('.cab-area [data-accion="vista"][data-v="recomendaciones"]') || {}).textContent || '', generar: !!document.querySelector('[data-accion="generar"]') }));
  const filas = await p.$$eval('.tabla-equipos tbody tr', (t) => t.length);
  const grupos = await p.$$eval('.tabla-grupos td.peor', (t) => t.map((x) => x.textContent));
  const ini = await p.$$eval('.fila-ini', (t) => t.map((x) => x.textContent));
  ok('tablero: cabecera con el área, botón directo a las recomendaciones (sin generar) y los dos equipos sembrados con problemas', cab.h1 === 'Banco ficticio' && /4 equipos: 2 internos y 2 de proveedores/.test(cab.sub) && /Ver las \d recomendaciones/.test(cab.boton) && !cab.generar && cab.foco.length === 2 && cab.foco.some((x) => /App móvil/.test(x)) && cab.foco.some((x) => /Portal clientes/.test(x)), JSON.stringify(cab));
  ok('tablero: tabla de equipos, internos y proveedores e iniciativas', filas === 4 && grupos.length >= 3 && ini.length === 2 && ini.some((x) => /Funciona/.test(x)), `${filas} equipos · ${grupos.length} medidas peor en proveedores · ${ini.length} iniciativas`);
  const coste = await A(p, () => ({ fila: [...document.querySelectorAll('.fila-coste th')].map((x) => x.textContent), celdas: [...document.querySelectorAll('.fila-coste td')].map((x) => x.textContent) }));
  ok('tablero: entregas por FTE y coste por entrega de internos y proveedores', coste.fila.includes('Coste por entrega') && coste.celdas.every((x) => /\d/.test(x)) && coste.celdas.some((x) => /^\d\.\d{3} €$/.test(x)), coste.fila.join(', ') + ' · ' + coste.celdas.join(' | '));
  await p.selectOption('select[data-cambio="ver"]', 'App móvil'); await p.waitForTimeout(200);
  const eq = await A(p, () => ({ t: document.querySelector('.cab-area h1').textContent, fuera: [...document.querySelectorAll('.kpi.kpi-critico .kpi-cab, .kpi.kpi-atencion .kpi-cab')].map((x) => x.textContent).join(', '), kpis: document.querySelectorAll('.kpi').length, graf: !!document.querySelector('.grafico polyline'), recs: document.querySelectorAll('.bloque-oscuro li').length, cuenta: (document.querySelector('.pestana .cuenta') || {}).textContent }));
  ok('tablero: vista de un equipo con indicadores, gráfico del plazo y sus recomendaciones ya listas', eq.kpis === 5 && eq.graf && eq.recs >= 2 && eq.t === 'App móvil' && /Retrabajo/.test(eq.fuera) && /^\d+$/.test(eq.cuenta || ''), `${eq.t} · fuera de lo normal: ${eq.fuera} · ${eq.recs} recomendaciones · pestaña ${eq.cuenta}`);
  await clic(p, '.bloque-oscuro [data-accion="ver-recs"]');
  const filtro = await A(p, () => ({ f: window.EasyPerformance.recEquipo, items: document.querySelectorAll('.rec-item').length, todas: window.EasyPerformance.recomendaciones().filter((x) => x.equipos.includes('App móvil')).length }));
  ok('recomendaciones: "Ver qué hacer" filtra por el equipo', filtro.f === 'App móvil' && filtro.items === filtro.todas, JSON.stringify(filtro));
  await p.selectOption('select[data-cambio="rec-equipo"]', 'todos'); await p.waitForTimeout(200);
  const lista = await p.$$eval('.rec-item', (t) => t.map((x) => ({ t: x.querySelector('b').textContent, crit: !!x.querySelector('.chip-critico') })));
  const det = await A(p, () => { const d = document.querySelector('.rec-detalle'); return { h: d.querySelector('h2').textContent, paso: /Qué hacer primero/i.test(d.querySelector('.rec-resumen').textContent) && /Qué pasa/i.test(d.textContent), de: !!d.querySelector('.cifra'), plan: d.querySelectorAll('.rec-plan li').length, ini: /Cómo se sigue/i.test(d.textContent) }; });
  const funciona = await p.$$eval('.funciona', (t) => t.length);
  await p.screenshot({ path: join(SALIDA, 'recomendaciones.png'), fullPage: true });
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
  // Iniciativas: seguimiento, ficha, detalle estático de la evaluación, alta desde la página y baja
  await clic(p, '[data-accion="vista"][data-v="iniciativas"]');
  const seg = await A(p, () => [...document.querySelectorAll('.seg')].map((x) => ({ chip: x.querySelector('.seg-cab .chip').textContent, graf: !!x.querySelector('.seg-graf polyline.seg-ini'), fechas: x.querySelectorAll('.seg-dl dd').length, quitar: !!x.querySelector('[data-accion="quitar-ini"]'), eval: !!x.querySelector('.seg-eval') })));
  ok('iniciativas: seguimiento automático con estado, gráfico y fechas; la registrada aquí se puede quitar', seg.length === 3 && seg.some((x) => x.chip === 'Funciona') && seg.some((x) => x.chip === 'Va a peor') && seg.some((x) => x.chip === 'Planificada') && seg.filter((x) => x.graf).length >= 2 && seg.every((x) => x.fechas >= 4) && seg.filter((x) => x.quitar).length === 1 && seg.filter((x) => x.eval).length === 2, seg.map((x) => x.chip + (x.quitar ? ' (quitar)' : '')).join(', '));
  const ficha = await A(p, () => [...document.querySelectorAll('.seg')].map((x) => ({ chip: x.querySelector('.seg-cab .chip').textContent, f: x.querySelector('.seg-ficha') ? x.querySelector('.seg-ficha').textContent : '', pasos: x.querySelectorAll('.seg-ficha ol li').length })));
  ok('iniciativas: cada una dice en qué consiste, por qué y qué se espera', ficha.length === 3 && ficha.every((x) => /En qué consiste/.test(x.f) && /Por qué/.test(x.f) && /Qué se espera/.test(x.f) && x.f.length > 150) && ficha.some((x) => x.chip === 'Planificada' && x.pasos >= 2), ficha.map((x) => x.chip + ' ' + x.f.length + ' car., ' + x.pasos + ' pasos').join(' · '));
  await p.click('.seg[data-ini="limite-wip-pagos"] .seg-eval summary'); await p.waitForTimeout(200);
  const ev = await A(p, () => { const d = document.querySelector('.seg[data-ini="limite-wip-pagos"] .seg-eval'); return { open: d.open, pasos: [...d.querySelectorAll('.ev-cab > div > b')].map((x) => x.textContent), antes: (d.querySelector('.ev-paso .v-fila b') || {}).textContent, efecto: (d.querySelector('.v-ecu-res') || {}).textContent, checks: d.querySelectorAll('.v-check .v-ico.ok').length }; });
  await p.screenshot({ path: join(SALIDA, 'evaluacion-iniciativa.png'), fullPage: true });
  ok('iniciativas: "Cómo se ha evaluado" detalla los seis pasos con sus cifras, sin animación', ev.open && ev.pasos.length === 6 && /^Antes/.test(ev.pasos[0]) && /^Confianza alta/.test(ev.pasos[5]) && /6,2 días/.test(ev.antes) && /efecto propio/.test(ev.efecto) && ev.checks === 3, ev.pasos.join(' > ') + ' · ' + ev.antes + ' · ' + ev.efecto);
  await clic(p, '[data-accion="nueva-ini"]');
  const form = await A(p, () => ({ f: !!document.getElementById('form-ini'), eqs: document.querySelectorAll('#form-ini input[name="equipos"]').length, medidas: document.querySelectorAll('#form-ini select[name="medida"] option').length }));
  await p.fill('#form-ini input[name="nombre"]', 'Revisión por pares en Riesgos');
  await p.fill('#form-ini input[name="fecha_inicio"]', '2026-07-01');
  await p.fill('#form-ini textarea[name="descripcion"]', 'Cada historia la revisa otra persona del equipo antes de pasar a pruebas.');
  await p.selectOption('#form-ini select[name="medida"]', 'retrabajo');
  await p.check('#form-ini input[name="equipos"][value="Riesgos"]');
  await p.click('#form-ini button[type="submit"]'); await listo(p); await p.waitForTimeout(400);
  const alta = await A(p, () => ({ n: document.querySelectorAll('.seg').length, form: !!document.getElementById('form-ini'), nueva: [...document.querySelectorAll('.seg')].filter((x) => /Revisión por pares/.test(x.querySelector('h2').textContent)).map((x) => ({ chip: x.querySelector('.seg-cab .chip').textContent, ficha: x.querySelector('.seg-ficha').textContent, medida: x.querySelector('.seg-dl dd').textContent, quitar: !!x.querySelector('[data-accion="quitar-ini"]') }))[0], guardada: (JSON.parse(localStorage.getItem('easyperformance.config.v2') || '{}').iniciativas || []).length }));
  await p.screenshot({ path: join(SALIDA, 'iniciativas.png'), fullPage: true });
  ok('iniciativas: alta desde la página con nombre, fecha, equipo y medida; aparece evaluada y con botón de quitar', form.f && form.eqs === 4 && form.medidas >= 3 && alta.n === 4 && !alta.form && alta.nueva && /Revisión por pares|revisa otra persona/.test(alta.nueva.ficha) && /Retrabajo/.test(alta.nueva.medida) && alta.nueva.quitar && alta.guardada === 0, JSON.stringify(alta.nueva) + ' · en ejemplo no se guarda: ' + alta.guardada);
  await clic(p, '.seg[data-ini^="ini-revision"] [data-accion="quitar-ini"]'); await listo(p); await p.waitForTimeout(300);
  const baja = await p.$$eval('.seg', (t) => t.length);
  ok('iniciativas: quitar una iniciativa la retira del seguimiento', baja === 3, baja + ' iniciativas');
  // Ayuda al pasar el cursor por una medida
  await clic(p, '[data-accion="vista"][data-v="tablero"]');
  await p.hover('.kpi .con-tip'); await p.waitForTimeout(250);
  const tip = await A(p, () => { const t = document.getElementById('tip'); return t && !t.hidden ? t.textContent : ''; });
  ok('tooltips: al pasar por el plazo se explica qué significa, con su cifra', /^Lo que el área empieza hoy estará terminado, casi seguro, en [\d,]+ días o menos\./.test(tip), tip);
  // Datos: la tira del tablero lleva a Fiabilidad; la lectura del export dice qué se resuelve, qué confirmar y columna a columna
  const tira = await texto(p, '.fiab-tira');
  await clic(p, '.fiab-tira [data-accion="fiabilidad"]');
  const fia = await A(p, () => ({ vista: window.EasyPerformance.vista, sec: window.EasyPerformance.datos, cartas: document.querySelectorAll('.fiab-c').length, filas: document.querySelectorAll('.tabla-fiab tbody tr').length, sembrados: !!document.querySelector('.sembrados, .tabla-sembrados, [data-accion="demo"][data-d]') }));
  ok('datos: la tira del tablero abre Fiabilidad con diez comprobaciones y la tabla por equipo', /Fiabilidad alta/.test(tira) && fia.vista === 'datos' && fia.sec === 'fiabilidad' && fia.cartas === 10 && fia.filas === 4 && !fia.sembrados, tira.slice(0, 60));
  await clic(p, '[data-accion="datos-sec"][data-s="lectura"]');
  const lec = await A(p, () => ({ ficheros: /datos-de-ejemplo\.csv: 1\.232 tareas/.test(document.querySelector('.pagina .bloque').textContent), hall: [...document.querySelectorAll('.hall h4')].map((x) => x.textContent), descarta: /Descarta 2 columnas con personas/.test(document.querySelector('.hall-solo').textContent), confirmar: /Confirmar en Ajustes/.test(document.querySelector('.hall-consultor').textContent), historia: (document.querySelector('.escalera li.actual b') || {}).textContent, cols: document.querySelectorAll('.tabla-cols tbody tr').length, fuera: document.querySelectorAll('.tabla-cols tr.col-fuera').length, consultor: /consultor/i.test(document.querySelector('.pagina').textContent) }));
  await p.screenshot({ path: join(SALIDA, 'datos-lectura.png'), fullPage: true });
  ok('datos: lectura del export con ficheros, hallazgos, nivel de historia y tabla de columnas, sin mencionar al consultor', lec.ficheros && lec.hall.join('|') === 'Lo resuelve la página sola|Por confirmar en Ajustes|Se arregla al exportar' && lec.descarta && lec.confirmar && lec.historia === 'Tiempo en cada estado' && lec.cols >= 20 && lec.fuera === 2 && !lec.consultor, JSON.stringify(lec));
  // Ajustes: tres filas editables, documentos y datos de ejemplo
  await clic(p, '[data-accion="vista"][data-v="ajustes"]');
  const aj = await A(p, () => ({ filas: [...document.querySelectorAll('#leido .leido-cab b')].map((x) => x.textContent), botones: [...document.querySelectorAll('#ajuste-cliente .btn')].map((x) => x.textContent), nombre: document.querySelector('input[data-cambio="nombre"]').value, explainer: !!document.querySelector('.modelo, .flujo, .plat, .sem-pasos, .cadencias') }));
  await p.screenshot({ path: join(SALIDA, 'ajustes.png'), fullPage: true });
  ok('ajustes: campo de equipo, proveedores y FTE, estados, nombre del cliente y descargas; sin explicaciones del método', aj.filas.join('|') === 'Campo de equipo|Proveedores, áreas, FTE y coste|Estados' && aj.botones.length === 4 && aj.nombre === 'Banco ficticio' && !aj.explainer, aj.filas.join(', '));
  ok('contenido de ejemplo sin errores de consola', !p.errores.length, p.errores.join(' | '));
  await p.context().close();
}

// 4. Los dos exports con fallos sembrados, cargados desde la entrada: cada fallo lo detecta su comprobación, sin falsas alarmas
const CON_FALLOS = [
  { nombre: 'export con fallos', csv: ['fallos', 'jira-con-fallos.csv'], escenarios: ['fallos', 'escenarios.json'], nivel: 'Baja' },
  { nombre: 'aseguradora', csv: ['aseguradora', 'jira-aseguradora.csv'], escenarios: ['aseguradora', 'escenarios.json'], nivel: 'Media' },
];
const COLS_FIAB = ['tiempos', 'flujo', 'registro', 'estimacion', 'sprints', 'historia'];
for (const e of CON_FALLOS) {
  const p = await pagina(1280, 720);
  const esc = JSON.parse(readFileSync(join(RAIZ, 'datos-sinteticos', ...e.escenarios), 'utf8'));
  await p.setInputFiles('#entrada-ficheros', join(RAIZ, 'datos-sinteticos', ...e.csv)); await listo(p); await p.waitForTimeout(300);
  const tira = await texto(p, '.fiab-tira');
  await clic(p, '.fiab-tira [data-accion="fiabilidad"]');
  // Un fallo sembrado está detectado si su comprobación pide revisar donde se sembró: en el área, en su equipo o en los dos
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
  ok(e.nombre + ': fiabilidad ' + e.nivel.toLowerCase() + ' y los ' + esc.sembrados.length + ' fallos sembrados detectados, sin falsas alarmas', new RegExp('Fiabilidad ' + e.nivel.toLowerCase()).test(tira) && f.nivel === e.nivel && detectado.every((x) => x.ok) && !falsas.length, detectado.filter((x) => !x.ok).map((x) => x.id).join(', ') + ' sin detectar · falsas: ' + falsas.join(', ') + ' · por revisar: ' + f.revisar.join(', '));
  if (esc.sin_fallo) {
    const bien = esc.sin_fallo.every((s) => !(f.porEquipo[s.equipo] || []).includes(s.id));
    ok(e.nombre + ': un equipo sin sprints no se marca', bien, JSON.stringify(esc.sin_fallo));
  }
  if (e.nombre === 'aseguradora') {
    await clic(p, '[data-accion="datos-sec"][data-s="lectura"]');
    const cols = await A(p, () => Object.fromEntries([...document.querySelectorAll('.tabla-cols tbody tr')].map((t) => [t.querySelector('th code').textContent, t.querySelector('td:last-child').textContent])));
    const eq = await A(p, () => [...document.querySelectorAll('.tabla-cols tbody tr')].filter((t) => /Equipo de cada tarea/.test(t.textContent)).map((t) => t.querySelector('th code').textContent));
    ok('aseguradora: tabla de columnas real (personas descartadas, Ramo ignorado, equipo en Componentes)', ['Persona asignada', 'Informador', 'Creador', 'Comentario'].every((k) => cols[k] === 'Se descarta') && cols['Campo personalizado (Ramo)'] === 'Se ignora' && cols['Estado'] === 'Se usa' && eq.join() === 'Componentes', JSON.stringify(eq));
  }
  ok(e.nombre + ' sin errores de consola', !p.errores.length, p.errores.join(' | '));
  await p.context().close();
}

// 5. Modo oscuro, móvil y portátil al 150 %
{
  const p = await pagina(1280, 720, { oscuro: true });
  await A(p, () => window.EasyPerformance.verDemo()); await listo(p);
  const r = await recorrer(p, 'oscuro', false);
  await p.screenshot({ path: join(SALIDA, 'oscuro-area.png'), fullPage: true });
  const fondo = await A(p, () => getComputedStyle(document.body).backgroundColor);
  ok('modo oscuro: fondo oscuro, sin scroll horizontal ni errores', fondo === 'rgb(11, 16, 38)' && !r.fallos.length && !p.errores.length, `fondo ${fondo} ${r.fallos.join('; ')} ${p.errores.join(' | ')}`);
  await p.context().close();
  const q = await pagina(390, 844);
  await A(q, () => window.EasyPerformance.verDemo()); await listo(q);
  const rq = await recorrer(q, 'movil', false);
  await q.screenshot({ path: join(SALIDA, 'movil-area.png'), fullPage: true });
  await clic(q, '[data-accion="vista"][data-v="iniciativas"]'); await clic(q, '[data-accion="nueva-ini"]');
  const mi = await medir(q);
  if (mi.ancho > 1) rq.fallos.push('formulario de iniciativa: ' + mi.ancho + 'px de scroll horizontal');
  await q.screenshot({ path: join(SALIDA, 'movil-iniciativa.png'), fullPage: true });
  ok('móvil (390 px): sin scroll horizontal en ninguna pantalla', !rq.fallos.length && !q.errores.length, rq.fallos.join('; ') + q.errores.join(' | '));
  await q.context().close();
  // Portátil con Windows al 150 %: la ventana útil se queda en unos 1280 x 600 y todo debe reducirse en proporción
  const w = await pagina(1280, 600);
  const raiz = () => A(w, () => getComputedStyle(document.documentElement).fontSize);
  const entrada = await medir(w), raizW = await raiz();
  await A(w, () => window.EasyPerformance.verDemo()); await listo(w);
  const matriz = await A(w, () => Math.round(document.querySelector('.tabla-caja').getBoundingClientRect().top));
  const rw = await recorrer(w, 'portatil-150', false);
  await w.screenshot({ path: join(SALIDA, 'portatil-150-area.png') });
  ok('portátil al 150 % (1280 x 600): letra reducida, la entrada cabe y la tabla de equipos asoma', raizW === '13px' && entrada.alto <= 600 && matriz < 560 && !rw.fallos.length && !w.errores.length, `raíz ${raizW}, entrada ${entrada.alto}px, tabla en ${matriz}px ${rw.fallos.join('; ')} ${w.errores.join(' | ')}`);
  await w.context().close();
  const g = await pagina(1512, 860);
  const raizG = await A(g, () => getComputedStyle(document.documentElement).fontSize);
  ok('pantalla grande (1512 x 860): tamaño completo', raizG === '16px', 'raíz ' + raizG);
  await g.context().close();
}

// 6. Jira.csv de principio a fin: directo al tablero, cambios en Ajustes, definiciones y paquete
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
  await clic(p, '[data-accion="vista"][data-v="datos"]'); await clic(p, '[data-accion="datos-sec"][data-s="fiabilidad"]');
  const fj = await A(p, () => ({ nivel: document.querySelector('.fiab-nivel b').textContent, revisar: document.querySelectorAll('.fiab-c.fiab-revisar').length, arreglo: [...document.querySelectorAll('.fiab-c.fiab-revisar')].every((x) => /Cómo se arregla/.test(x.textContent)) }));
  ok('Jira.csv: la fiabilidad avisa de lo que hay que revisar y cómo arreglarlo', fj.revisar >= 3 && fj.arreglo && fj.nivel !== 'Alta', JSON.stringify(fj));
  // Estados: In Progress pasa a En revisión
  await clic(p, '[data-accion="vista"][data-v="ajustes"]');
  await clic(p, '[data-accion="editar"][data-e="estados"]');
  const antes = await A(p, () => window.EasyPerformance.r.preparacion.mapeo['In Progress']);
  await p.selectOption('select[data-cambio="estado"][data-e="In Progress"]', 'en_revision');
  await listo(p); await p.waitForTimeout(300);
  const despues = await A(p, () => ({ m: window.EasyPerformance.r.preparacion.mapeo['In Progress'], g: JSON.parse(localStorage.getItem('easyperformance.config.v2') || '{}') }));
  ok('ajustes: un estado cambiado se recalcula y se guarda', antes === 'en_curso' && despues.m === 'en_revision' && despues.g.mapeoEstados && despues.g.mapeoEstados['In Progress'] === 'en_revision', `In Progress: ${antes} a ${despues.m}`);
  // Proveedores: Mobile pasa a ser de un proveedor y aparece la comparación
  await clic(p, '[data-accion="editar"][data-e="equipos"]');
  const cmpAntes = await A(p, () => window.EasyPerformance.r.comparaciones.filter((c) => c.dimension === 'tipo').length);
  await p.selectOption('select[data-cambio="eq"][data-campo="tipo"][data-e="Mobile"]', 'proveedor'); await listo(p); await p.waitForTimeout(300);
  await p.fill('input[data-cambio="eq"][data-campo="proveedor"][data-e="Mobile"]', 'Proveedor Uno'); await p.press('input[data-campo="proveedor"][data-e="Mobile"]', 'Tab'); await listo(p); await p.waitForTimeout(300);
  const cmp = await A(p, () => ({ n: window.EasyPerformance.r.comparaciones.filter((c) => c.dimension === 'tipo').length, g: JSON.parse(localStorage.getItem('easyperformance.config.v2')).equiposInfo }));
  ok('ajustes: marcar un proveedor activa la comparación y se guarda', cmpAntes === 0 && cmp.n === 1 && cmp.g.Mobile.tipo === 'proveedor' && cmp.g.Mobile.proveedor === 'Proveedor Uno', JSON.stringify(cmp.g));
  // El enlace del tablero a los ajustes de equipos abre esa fila
  await clic(p, '[data-accion="vista"][data-v="tablero"]');
  await p.screenshot({ path: join(SALIDA, 'jira-ajustes.png'), fullPage: true });
  // Documentos
  await clic(p, '[data-accion="vista"][data-v="ajustes"]');
  await p.fill('input[data-cambio="nombre"]', 'Cliente de prueba'); await p.press('input[data-cambio="nombre"]', 'Tab');
  const bajar = async (sel) => {
    const [d] = await Promise.all([p.waitForEvent('download'), p.click(sel)]);
    const ruta = join(SALIDA, d.suggestedFilename()); await d.saveAs(ruta);
    return { nombre: d.suggestedFilename(), datos: readFileSync(ruta) };
  };
  const docx = await bajar('[data-accion="definiciones"][data-f="docx"]'), md = await bajar('[data-accion="definiciones"][data-f="md"]'), paq = await bajar('[data-accion="paquete"]'), mod = await bajar('[data-accion="modelo"]');
  const mdT = md.datos.toString('utf8');
  ok('documento de definiciones en Word y markdown con los cambios', docx.datos.slice(0, 2).toString() === 'PK' && docx.datos.toString('latin1').includes('word/document.xml') &&
    mdT.includes('Cliente de prueba') && mdT.includes('| In Progress | In Progress | En revisión |') && mdT.includes('Proveedor: Proveedor Uno') && !/[\u2014\u2013]/.test(mdT), `${docx.nombre} · ${md.nombre}`);
  const paquete = JSON.parse(paq.datos.toString('utf8'));
  const problemas = await A(p, (x) => window.Nucleo.comprobarPaquete(x), paquete);
  const modelo = JSON.parse(mod.datos.toString('utf8'));
  ok('paquete de diagnóstico y modelo de medida exportados; el paquete sin campos prohibidos', problemas.length === 0 && !!paquete.equipos && mod.nombre === 'modelo-de-medida.json' && !!modelo, `${paq.nombre} · ${Math.round(paq.datos.length / 1024)} KB · ${mod.nombre}`);
  // Iniciativa registrada desde la página con datos reales: se guarda en la configuración
  await clic(p, '[data-accion="vista"][data-v="iniciativas"]'); await clic(p, '[data-accion="nueva-ini"]');
  await p.fill('#form-ini input[name="nombre"]', 'Prueba con datos reales');
  await p.fill('#form-ini input[name="fecha_inicio"]', '2025-03-01');
  await p.check('#form-ini input[name="equipos"][value="Web"]');
  await p.click('#form-ini button[type="submit"]'); await listo(p); await p.waitForTimeout(300);
  const guardada = await A(p, () => ({ n: document.querySelectorAll('.seg').length, cfg: (JSON.parse(localStorage.getItem('easyperformance.config.v2') || '{}').iniciativas || []).map((i) => i.nombre) }));
  ok('iniciativas: con datos reales la iniciativa queda guardada en la configuración', guardada.n === 1 && guardada.cfg.join() === 'Prueba con datos reales', JSON.stringify(guardada));
  // Datos de ejemplo desde Ajustes y vuelta: la configuración real no cambia
  const cfgAntes = await A(p, () => localStorage.getItem('easyperformance.config.v2'));
  await clic(p, '[data-accion="vista"][data-v="ajustes"]');
  await clic(p, '#ajuste-datos [data-accion="demo"]'); await listo(p); await p.waitForTimeout(300);
  const enDemo = await A(p, () => window.EasyPerformance.r.modelo.equipos.map((e) => e.nombre).join(', '));
  await clic(p, '[data-accion="salir-demo"]'); await p.waitForTimeout(300);
  const vuelta = await A(p, () => ({ cfg: localStorage.getItem('easyperformance.config.v2'), eqs: window.EasyPerformance.r.modelo.equipos.map((e) => e.nombre).join(', ') }));
  ok('datos de ejemplo sin pisar la configuración ni los datos reales', cfgAntes === vuelta.cfg && enDemo !== vuelta.eqs && vuelta.eqs === 'Infrastructure, Mobile, Web', `ejemplo: ${enDemo} · vuelta: ${vuelta.eqs}`);
  // Al volver a abrir la página y cargar el mismo export, los cambios siguen
  await p.reload(); await p.waitForTimeout(400);
  await p.setInputFiles('#entrada-ficheros', join(RAIZ, 'datos-prueba', 'Jira.csv')); await listo(p);
  const otraVez = await A(p, () => ({ m: window.EasyPerformance.r.preparacion.mapeo['In Progress'], n: window.EasyPerformance.r.comparaciones.filter((c) => c.dimension === 'tipo').length, ini: window.EasyPerformance.r.iniciativas.length }));
  ok('los cambios y la iniciativa se conservan al volver a abrir la página', otraVez.m === 'en_revision' && otraVez.n === 1 && otraVez.ini === 1, JSON.stringify(otraVez));
  ok('recorrido con Jira.csv sin errores de consola', !p.errores.length, p.errores.join(' | '));
  await p.context().close();
}

// 7. Carpeta compartida con dos iniciativas y contexto (carpeta simulada con la interfaz de la de Chrome)
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
  await clic(p, '[data-accion="vista"][data-v="iniciativas"]');
  const quitar = await p.$$eval('[data-accion="quitar-ini"]', (t) => t.length);
  await p.screenshot({ path: join(SALIDA, 'carpeta-area.png'), fullPage: true });
  ok('carpeta compartida: dos iniciativas leídas y evaluadas, y el contexto; las de la carpeta no se quitan desde la página', r.ini.length === 2 && r.filas === 2 && r.ctx === 2 && quitar === 0, `${r.ini.join(', ')} · contexto ${r.ctx} documentos`);
  ok('carpeta compartida sin errores de consola', !p.errores.length, p.errores.join(' | '));
  await p.context().close();
}

// 8. Una configuración guardada por la versión anterior se aprovecha
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
