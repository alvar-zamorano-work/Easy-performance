// Verificación de la carcasa web en Chromium (criterios de B5 del plan).
//   npm run web && CHROME=/ruta/a/chrome node web/verificar.mjs
// Comprueba: sin scroll en 1280x720 y 1920x1080, sin errores de consola, modo oscuro, impresión a PDF,
// recorrido completo con el Jira.csv de prueba, demo sin pisar la configuración y carpeta con dos iniciativas.

import { chromium } from 'playwright-core';
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
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
const TAMANOS = [[1280, 720], [1920, 1080]];
mkdirSync(SALIDA, { recursive: true });

const resultados = [];
const ok = (nombre, bien, detalle = '') => { resultados.push({ nombre, bien, detalle }); console.log((bien ? 'OK   ' : 'FALLO') + ' ' + nombre + (detalle ? ' · ' + detalle : '')); };

const navegador = await chromium.launch({ executablePath: CHROME });

async function pagina(ancho, alto, opciones = {}) {
  const ctx = await navegador.newContext({ viewport: { width: ancho, height: alto }, colorScheme: opciones.oscuro ? 'dark' : 'light' });
  const p = await ctx.newPage();
  p.errores = [];
  p.on('console', (m) => { if (m.type() === 'error') p.errores.push(m.text().split('\n')[0]); });
  p.on('pageerror', (e) => p.errores.push('pageerror: ' + e.message));
  await p.goto(HTML);
  await p.waitForTimeout(400);
  return p;
}
const medir = (p) => p.evaluate(() => {
  const pa = document.querySelector('.pantalla');
  return { scroll: document.documentElement.scrollHeight - innerHeight, ancho: document.documentElement.scrollWidth - innerWidth, recorte: pa ? pa.scrollHeight - pa.clientHeight : 0 };
});
const accion = async (p, sel) => { await p.click(sel); await p.waitForTimeout(350); };
const vistas = (p) => p.evaluate(() => [...document.querySelectorAll('[data-accion="vista"]')].map((b) => b.getAttribute('data-v')));

/** Recorre todas las vistas con pantallas y comprueba que caben sin scroll. Devuelve los fallos. */
async function recorrerVistas(p, etiqueta, capturas = false) {
  const fallos = [];
  for (const v of await vistas(p)) {
    if (v === 'config') continue; // Ajustes es una página de formularios, como en la v0
    await accion(p, `[data-accion="vista"][data-v="${v}"]`);
    const n = await p.evaluate(() => (window.EasyPerformance.pantActual || {}).n || 1);
    for (let i = 0; i < n; i++) {
      if (i > 0) await accion(p, `.subnav [data-accion="pantalla"][data-i="${i}"]`);
      const m = await medir(p);
      if (m.scroll > 1 || m.ancho > 1 || m.recorte > 2) fallos.push(`${v} ${i + 1}: scroll ${m.scroll}, ancho ${m.ancho}, recorte ${m.recorte}`);
      if (capturas) await p.screenshot({ path: join(SALIDA, `${etiqueta}-${v}-${i + 1}.png`) });
    }
  }
  return fallos;
}

// 1. Presentación y demo, sin scroll en los dos tamaños
for (const [w, h] of TAMANOS) {
  const p = await pagina(w, h);
  const enPres = await p.evaluate(() => window.EasyPerformance.presentacion);
  const fallosPres = [];
  const nDiap = await p.evaluate(() => document.querySelectorAll('[data-accion="diap"]').length);
  for (let i = 0; i < nDiap; i++) {
    await p.evaluate((k) => { window.EasyPerformance.diap = k; window.EasyPerformance.render(); }, i);
    await p.waitForTimeout(200);
    const m = await medir(p);
    if (m.scroll > 1 || m.ancho > 1) fallosPres.push(`diapositiva ${i + 1}: scroll ${m.scroll}`);
    if (w === 1280) await p.screenshot({ path: join(SALIDA, `presentacion-${i + 1}.png`) });
  }
  ok(`presentación de ${nDiap} pantallas sin scroll en ${w}x${h}`, enPres && nDiap === 6 && !fallosPres.length, fallosPres.join('; '));
  await p.evaluate(() => window.EasyPerformance.ACC['ver-demo']());
  await p.waitForTimeout(600);
  const fallos = await recorrerVistas(p, `demo-${w}`, true);
  ok(`demo: todas las pantallas sin scroll en ${w}x${h}`, !fallos.length, fallos.join('; '));
  ok(`demo sin errores de consola en ${w}x${h}`, !p.errores.length, p.errores.join(' | '));
  await p.context().close();
}

// 2. Modo oscuro
{
  const p = await pagina(1280, 720, { oscuro: true });
  await p.evaluate(() => window.EasyPerformance.ACC['ver-demo']());
  await p.waitForTimeout(500);
  const fallos = await recorrerVistas(p, 'oscuro', false);
  for (const v of ['equipo', 'grupos', 'agentes']) { await accion(p, `[data-accion="vista"][data-v="${v}"]`); await p.screenshot({ path: join(SALIDA, `oscuro-${v}.png`) }); }
  const fondo = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
  ok('modo oscuro: sin errores, sin scroll y con fondo oscuro', !fallos.length && !p.errores.length && fondo === 'rgb(11, 16, 38)', `fondo ${fondo}; ${fallos.join('; ')} ${p.errores.join(' | ')}`);
  await p.context().close();
}

// 3. Recorrido completo con el Jira.csv de prueba, configuración guardada, impresión y demo sin pisar nada
{
  const p = await pagina(1280, 720);
  const t0 = Date.now();
  await accion(p, '[data-accion="saltar-presentacion"]');
  await p.setInputFiles('#entrada-ficheros', join(RAIZ, 'datos-prueba', 'Jira.csv'));
  await p.waitForFunction(() => window.EasyPerformance.det, null, { timeout: 60000 });
  await p.screenshot({ path: join(SALIDA, 'jira-paso-1.png') });
  await accion(p, '[data-accion="aceptar-todo"]');
  await p.screenshot({ path: join(SALIDA, 'jira-paso-6.png') });
  // Perfil de dirección para ver también El área, Comparar e Iniciativas
  await p.evaluate(() => { const b = window.EasyPerformance.borrador; if (b.perfiles.indexOf('direccion') < 0) b.perfiles.push('direccion'); });
  await accion(p, '[data-accion="terminar"]');
  const tiempo = Date.now() - t0;
  const estado = await p.evaluate(() => ({ eqs: window.EasyPerformance.modelo.equipos.map((e) => e.nombre), cfg: !!localStorage.getItem('easyperformance.configuracion.v1') }));
  ok('recorrido con Jira.csv: carga, puesta en marcha y configuración guardada', estado.eqs.length >= 3 && estado.cfg, `${estado.eqs.join(', ')} · ${Math.round(tiempo / 1000)} s`);
  const fallos = await recorrerVistas(p, 'jira', true);
  ok('Jira.csv: todas las pantallas sin scroll en 1280x720', !fallos.length, fallos.join('; '));
  // Marcar dos equipos como proveedor y exportar el paquete de diagnóstico
  await p.evaluate(() => {
    const A = window.EasyPerformance, eqs = A.modelo.equipos.map((e) => e.nombre);
    A.cfg.equiposInfo = {}; eqs.forEach((e, i) => { A.cfg.equiposInfo[e] = i % 2 ? { tipo: 'proveedor', proveedor: 'Proveedor ' + (i + 1) } : { tipo: 'interno' }; });
    A.diag = null;
  });
  const paq = await p.evaluate(() => { const d = window.EasyPerformance.diagnostico(); return { problemas: d.problemas, comparaciones: d.comparaciones.length, tam: JSON.stringify(d.paquete).length }; });
  ok('Jira.csv: diagnóstico y paquete sin problemas', paq.problemas.length === 0 && paq.comparaciones >= 1, `${paq.comparaciones} comparaciones · ${Math.round(paq.tam / 1024)} KB · ${paq.problemas.join(' | ')}`);
  // Impresión: todas las pantallas seguidas
  await accion(p, '[data-accion="vista"][data-v="todos"]');
  await p.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  await p.emulateMedia({ media: 'print' });
  const pdf = await p.pdf({ format: 'A4', printBackground: true });
  writeFileSync(join(SALIDA, 'impresion-el-area.pdf'), pdf);
  await p.emulateMedia({ media: 'screen' });
  await p.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  const paginas = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  ok('impresión a PDF de El área (todas sus pantallas)', paginas >= 2, `${paginas} páginas`);
  // Demo y vuelta: la configuración real no cambia
  const antes = await p.evaluate(() => localStorage.getItem('easyperformance.configuracion.v1'));
  await p.evaluate(() => window.EasyPerformance.ACC['ver-demo']());
  await p.waitForTimeout(500);
  const enDemo = await p.evaluate(() => window.EasyPerformance.modelo.equipos.map((e) => e.nombre).join(','));
  await p.evaluate(() => window.EasyPerformance.ACC['empezar']());
  await p.waitForTimeout(500);
  const despues = await p.evaluate(() => ({ cfg: localStorage.getItem('easyperformance.configuracion.v1'), eqs: window.EasyPerformance.modelo.equipos.map((e) => e.nombre).join(',') }));
  ok('demo sin pisar la configuración real', antes === despues.cfg && enDemo !== despues.eqs && despues.eqs === estado.eqs.join(','), `demo: ${enDemo} · vuelta: ${despues.eqs}`);
  ok('recorrido con Jira.csv sin errores de consola', !p.errores.length, p.errores.join(' | '));
  await p.context().close();
}

// 4. Carpeta compartida con dos ficheros de iniciativa (carpeta simulada con la misma interfaz que la de Chrome)
{
  const p = await pagina(1280, 720);
  const csv = readFileSync(join(RAIZ, 'datos-sinteticos', 'b3', 'jira-b3.csv'), 'utf8');
  const dir = join(RAIZ, 'datos-sinteticos', 'b3', 'cliente');
  const inis = ['limite-wip-pagos.json', 'formacion-pruebas-riesgos.json'].map((f) => ({ nombre: f, texto: readFileSync(join(dir, 'iniciativas', f), 'utf8') }));
  const ctx = readFileSync(join(dir, 'contexto', 'contexto.json'), 'utf8');
  const leidas = await p.evaluate(async ({ csv, inis, ctx }) => {
    const fichero = (nombre, texto) => ({ kind: 'file', name: nombre, getFile: async () => new File([texto], nombre) });
    const carpeta = (nombre, entradas, subs = {}) => ({
      kind: 'directory', name: nombre,
      queryPermission: async () => 'granted', requestPermission: async () => 'granted',
      getDirectoryHandle: async (n) => { if (subs[n]) return subs[n]; throw new DOMException('No existe', 'NotFoundError'); },
      values: () => entradas[Symbol.iterator] ? (async function* () { yield* entradas; })() : null,
    });
    const raiz = carpeta('cliente-prueba', [], {
      exports: carpeta('exports', [fichero('jira-b3.csv', csv)]),
      iniciativas: carpeta('iniciativas', inis.map((i) => fichero(i.nombre, i.texto))),
      contexto: carpeta('contexto', [fichero('contexto.json', ctx)]),
    });
    const A = window.EasyPerformance;
    A.carpeta = raiz;
    await A.leerCarpeta(raiz);
    await new Promise((r) => setTimeout(r, 300));
    return { iniciativas: A.iniciativasCarpeta.map((i) => i.id), contexto: A.contexto ? A.contexto.documentos.length : 0, det: !!A.det };
  }, { csv, inis, ctx });
  await p.evaluate(() => { const A = window.EasyPerformance; A.ACC['aceptar-todo'](); const b = A.borrador; if (b.perfiles.indexOf('direccion') < 0) b.perfiles.push('direccion'); A.ACC['terminar'](); });
  await p.waitForTimeout(400);
  await accion(p, '[data-accion="vista"][data-v="iniciativas"]');
  await p.screenshot({ path: join(SALIDA, 'carpeta-iniciativas.png') });
  const tarjetas = await p.evaluate(() => [...document.querySelectorAll('.ini h3')].map((h) => h.textContent));
  ok('carpeta compartida: dos ficheros de iniciativa leídos y evaluados', leidas.iniciativas.length === 2 && tarjetas.length === 2 && leidas.contexto === 2, `${leidas.iniciativas.join(', ')} · contexto ${leidas.contexto} documentos · ${tarjetas.join(' / ')}`);
  ok('carpeta compartida sin errores de consola', !p.errores.length, p.errores.join(' | '));
  await p.context().close();
}

await navegador.close();
writeFileSync(join(SALIDA, 'resultado.json'), JSON.stringify(resultados, null, 1));
const fallidos = resultados.filter((r) => !r.bien).length;
console.log(`\n${resultados.length - fallidos} de ${resultados.length} comprobaciones bien. Capturas en ${SALIDA}`);
process.exit(fallidos ? 1 : 0);
