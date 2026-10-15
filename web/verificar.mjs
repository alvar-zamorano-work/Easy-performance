// Verificación de la página en Chromium: tablero, recomendaciones y cómo funciona, sin puesta en marcha.
//   npm run web && CHROME=/ruta/a/chrome node web/verificar.mjs
// Comprueba: entrada, presentación, demo en 1280x720 y 1920x1080 (sin scroll horizontal, sin errores de consola),
// modo oscuro, pantalla de móvil, Jira.csv de principio a fin (carga directa al tablero, mapeo de estados y proveedores
// cambiados y guardados, documento de definiciones y paquete), demo sin pisar la configuración, carpeta con dos
// iniciativas y una configuración de la versión anterior.

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
  const ctx = await navegador.newContext({ viewport: { width: ancho, height: alto }, colorScheme: opciones.oscuro ? 'dark' : 'light', acceptDownloads: true });
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
  await clic(p, '[data-accion="vista"][data-v="como"]'); await mirar('como');
  await clic(p, '[data-accion="vista"][data-v="tablero"]');
  return { fallos, altos };
}

// 1. Entrada y presentación
for (const [w, h] of [[1280, 720], [1920, 1080]]) {
  const p = await pagina(w, h);
  const entrada = await A(p, () => ({ vista: window.EasyPerformance.vista, zona: !!document.getElementById('zona'), demo: !!document.querySelector('[data-accion="demo"]') }));
  const m0 = await medir(p);
  if (w === 1280) await p.screenshot({ path: join(SALIDA, 'entrada.png') });
  ok(`entrada en ${w}x${h}: cargar datos, ver la demo y la presentación`, entrada.vista === 'inicio' && entrada.zona && entrada.demo && m0.ancho <= 1 && m0.alto <= h + 1, `alto ${m0.alto}`);
  await clic(p, '[data-accion="presentacion"]');
  const n = await A(p, () => document.querySelectorAll('[data-accion="lamina-ir"]').length);
  const fallos = [];
  for (let i = 0; i < n; i++) {
    await A(p, (k) => { window.EasyPerformance.lamina = k; window.EasyPerformance.render(); }, i);
    await p.waitForTimeout(120);
    const m = await medir(p);
    if (m.alto > h + 1 || m.ancho > 1) fallos.push(`lámina ${i + 1}: alto ${m.alto}`);
    if (w === 1280) await p.screenshot({ path: join(SALIDA, `lamina-${i + 1}.png`) });
  }
  ok(`presentación de ${n} láminas sin scroll en ${w}x${h}`, n === 7 && !fallos.length, fallos.join('; '));
  await A(p, () => { window.EasyPerformance.lamina = 5; window.EasyPerformance.render(); });
  await clic(p, '#lienzo [data-accion="ver-demo"]');
  await listo(p);
  const enDemo = await A(p, () => ({ demo: window.EasyPerformance.demo, vista: window.EasyPerformance.vista }));
  ok(`la lámina de la demo abre el tablero con datos de ejemplo en ${w}x${h}`, enDemo.demo && enDemo.vista === 'tablero');
  const r = await recorrer(p, `demo-${w}`, true);
  ok(`demo: tablero, equipos, recomendaciones y cómo funciona sin scroll horizontal en ${w}x${h}`, !r.fallos.length, r.fallos.join('; ') + ' · altos: ' + r.altos.join(', '));
  ok(`demo sin errores de consola en ${w}x${h}`, !p.errores.length, p.errores.join(' | '));
  await p.context().close();
}

// 2. Contenido de la demo: lo sembrado en los datos sintéticos aparece donde toca
{
  const p = await pagina(1440, 900);
  await clic(p, '[data-accion="demo"]'); await listo(p);
  const titular = await texto(p, '.titular h1');
  const filas = await p.$$eval('.tabla-equipos tbody tr', (t) => t.length);
  const grupos = await p.$$eval('.tabla-grupos td.peor', (t) => t.map((x) => x.textContent));
  const ini = await p.$$eval('.fila-ini', (t) => t.map((x) => x.textContent));
  ok('demo: el titular nombra a los dos equipos sembrados con problemas', /App móvil/.test(titular) && /Portal clientes/.test(titular), titular);
  ok('demo: tabla de equipos, internos y proveedores e iniciativas', filas === 4 && grupos.length >= 3 && ini.length === 2 && ini.some((x) => /Funciona/.test(x)), `${filas} equipos · ${grupos.length} medidas peor en proveedores · ${ini.length} iniciativas`);
  const coste = await A(p, () => ({ fila: [...document.querySelectorAll('.fila-coste th')].map((x) => x.textContent), celdas: [...document.querySelectorAll('.fila-coste td')].map((x) => x.textContent) }));
  ok('demo: entregas por FTE y coste por entrega de internos y proveedores', coste.fila.includes('Coste por entrega') && coste.celdas.every((x) => /\d/.test(x)) && coste.celdas.some((x) => /^\d\.\d{3} €$/.test(x)), coste.fila.join(', ') + ' · ' + coste.celdas.join(' | '));
  await p.selectOption('select[data-cambio="ver"]', 'App móvil'); await p.waitForTimeout(200);
  const eq = await A(p, () => ({ t: document.querySelector('.titular h1').textContent, kpis: document.querySelectorAll('.kpi').length, graf: !!document.querySelector('.grafico polyline'), recs: document.querySelectorAll('.bloque-oscuro li').length }));
  ok('demo: vista de un equipo con indicadores, gráfico del plazo y sus recomendaciones', eq.kpis === 5 && eq.graf && eq.recs >= 2 && /retrabajo/.test(eq.t), `${eq.t} · ${eq.recs} recomendaciones`);
  await clic(p, '[data-accion="vista"][data-v="recomendaciones"]');
  const recs = await p.$$eval('.rec', (t) => t.map((x) => ({ t: x.querySelector('h2').textContent, crit: !!x.querySelector('.chip-critico'), paso: /Primer paso/.test(x.textContent), de: !!x.querySelector('.rec-de li') })));
  const funciona = await p.$$eval('.funciona', (t) => t.length);
  ok('recomendaciones: ordenadas, con evidencia y primer paso', recs.length >= 3 && recs[0].crit && recs.every((x) => x.paso && x.de) && funciona === 1, recs.map((x) => (x.crit ? 'crítico: ' : '') + x.t).join(' / '));
  await p.click('.rec details summary'); await p.waitForTimeout(100);
  const abierta = await p.$eval('.rec details', (d) => d.open && /Plan/.test(d.textContent));
  ok('recomendaciones: causas y plan completo al desplegar', abierta);
  ok('demo de contenido sin errores de consola', !p.errores.length, p.errores.join(' | '));
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
  // Estados: In Progress pasa a En revisión
  await clic(p, '[data-accion="vista"][data-v="como"]');
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
