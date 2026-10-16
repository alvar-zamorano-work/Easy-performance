// Construye la carpeta de entrega con EasyPerformance.html: un solo fichero, sin servidor y sin conexión.
//   TZ=Europe/Madrid node web/construir.ts [carpeta]   (por defecto dist/EasyPerformance)

import { build } from 'esbuild';
import { mkdirSync, readFileSync, readdirSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(RAIZ, 'web', 'src');
const DEMO = join(RAIZ, 'datos-sinteticos', 'b3');
const FALLOS = join(RAIZ, 'datos-sinteticos', 'fallos');
const ASEGURADORA = join(RAIZ, 'datos-sinteticos', 'aseguradora');
const leerJson = (...p: string[]) => JSON.parse(readFileSync(join(...p), 'utf8'));

/** Sin "</script" dentro de un bloque <script>. */
const seguro = (s: string) => s.replace(/<\/script/gi, '<\\/script');

function fuentes(): string {
  return [400, 500, 700].map((peso) => {
    const b64 = readFileSync(join(SRC, 'fuentes', `ubuntu-latin-${peso}-normal.woff2`)).toString('base64');
    return `@font-face{font-family:"Ubuntu";font-style:normal;font-weight:${peso};font-display:swap;src:url(data:font/woff2;base64,${b64}) format("woff2")}`;
  }).join('\n');
}

/** Datos de una demo: equipos y FTE de su cliente, más sus iniciativas y su contexto (por defecto, los de B3). */
function demoCliente(cliente: { sector: string; equipos: { lista: any[] } }, extra: Record<string, unknown> = {}, nombre = 'Banco ficticio', dir = DEMO): string {
  const dirIni = join(dir, 'cliente', 'iniciativas');
  const iniciativas = readdirSync(dirIni).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(readFileSync(join(dirIni, f), 'utf8')));
  const contexto = JSON.parse(readFileSync(join(dir, 'cliente', 'contexto', 'contexto.json'), 'utf8'));
  const equiposInfo: Record<string, unknown> = {}, fte: Record<string, number> = {}, fteOrigen: Record<string, string> = {};
  for (const e of cliente.equipos.lista) {
    equiposInfo[e.nombre] = { tipo: e.tipo, proveedor: e.proveedor, area: e.area };
    if (e.fte.length) { fte[e.nombre] = e.fte[e.fte.length - 1].valor; fteOrigen[e.nombre] = e.fte[e.fte.length - 1].origen; }
  }
  // Costes inventados para la demo: coste interno cargado de un FTE y tarifa mensual de cada proveedor
  const COSTE_DEMO: Record<string, number> = { interno: 6500, 'Proveedor Norte': 8200, 'Proveedor Sur': 7400, 'Proveedor Este': 7800, 'Proveedor Oeste': 7100 };
  const coste: Record<string, number> = {};
  for (const e of cliente.equipos.lista) { const c = COSTE_DEMO[e.tipo === 'proveedor' ? e.proveedor : 'interno']; if (c) coste[e.nombre] = c; }
  return JSON.stringify({ nombre, sector: cliente.sector, equiposInfo, fte, fteOrigen, coste, iniciativas, contexto, ...extra });
}

export async function construir(destino = join(RAIZ, 'dist', 'EasyPerformance')): Promise<string> {
  const r = await build({
    entryPoints: [join(SRC, 'nucleo-web.ts')], bundle: true, format: 'iife', write: false, target: 'es2019',
    minify: true, legalComments: 'none', logLevel: 'silent',
  });
  const nucleo = r.outputFiles[0].text;
  const demoCsv = readFileSync(join(DEMO, 'jira-b3.csv'), 'utf8');
  if (/<\/script/i.test(demoCsv)) throw new Error('El CSV de la demo contiene </script');
  // Segunda demo: el mismo banco con un fallo sembrado por cada comprobación de fiabilidad
  const fallosCsv = readFileSync(join(FALLOS, 'jira-con-fallos.csv'), 'utf8');
  if (/<\/script/i.test(fallosCsv)) throw new Error('El CSV con fallos contiene </script');
  const escenarios = leerJson(FALLOS, 'escenarios.json');
  // Tercera demo: una aseguradora con un export de Jira en castellano y solo tres fallos
  const asegCsv = readFileSync(join(ASEGURADORA, 'jira-aseguradora.csv'), 'utf8');
  if (/<\/script/i.test(asegCsv)) throw new Error('El CSV de la aseguradora contiene </script');
  const escAseg = leerJson(ASEGURADORA, 'escenarios.json');
  const piezas: Record<string, string> = {
    '/*ESTILOS*/': readFileSync(join(SRC, 'app.css'), 'utf8').replace('/*FUENTES*/', fuentes()),
    '/*DEMO*/': demoCsv,
    '/*DEMO_CLIENTE*/': seguro(demoCliente(leerJson(DEMO, 'cliente', 'cliente.json'))),
    '/*DEMO_FALLOS*/': fallosCsv,
    '/*DEMO_FALLOS_CLIENTE*/': seguro(demoCliente(leerJson(FALLOS, 'cliente', 'cliente.json'), { sembrados: escenarios.sembrados })),
    '/*DEMO_ASEGURADORA*/': asegCsv,
    '/*DEMO_ASEGURADORA_CLIENTE*/': seguro(demoCliente(leerJson(ASEGURADORA, 'cliente', 'cliente.json'), { sembrados: escAseg.sembrados, sin_fallo: escAseg.sin_fallo }, 'Aseguradora ficticia', ASEGURADORA)),
    '/*LAMINAS*/': seguro(JSON.stringify(JSON.parse(readFileSync(join(SRC, 'laminas.json'), 'utf8')))),
    '/*NUCLEO*/': seguro(nucleo),
    // proceso.js (la animación del método) va antes de la interfaz, que lo usa
    '/*APP*/': seguro(readFileSync(join(SRC, 'proceso.js'), 'utf8') + '\n' + readFileSync(join(SRC, 'app.js'), 'utf8')),
  };
  let html = readFileSync(join(SRC, 'plantilla.html'), 'utf8');
  for (const [marca, contenido] of Object.entries(piezas)) {
    if (!html.includes(marca)) throw new Error('Falta la marca ' + marca);
    html = html.split(marca).join(contenido);
  }
  mkdirSync(destino, { recursive: true });
  const salida = join(destino, 'EasyPerformance.html');
  writeFileSync(salida, html);
  // Carpeta de trabajo del cliente, como en la v0, más iniciativas/ y contexto/
  const leeme: Record<string, string> = {
    exports: 'Deja aquí los CSV exportados de Jira (con Todos los campos). Easy Performance los une y quita los repetidos.\n',
    configuracion: 'Aquí va cliente.json: lo que se ha cambiado en Cómo funciona (proveedores, áreas, FTE, estados). También los documentos de definiciones.\n',
    iniciativas: 'Un fichero .json por iniciativa de mejora. Los crea el consultor.\n',
    contexto: 'contexto.json: resúmenes que escribe o aprueba el consultor (método, organización, stack, contratos). Solo los usa el paquete de diagnóstico.\n',
    historico: 'Fotos semanales de lo abierto. Las guarda la página al leer la carpeta.\n',
    diagnostico: 'Paquetes de diagnóstico exportados desde Cómo funciona. Solo llevan cifras agregadas.\n',
  };
  for (const [sub, texto] of Object.entries(leeme)) { mkdirSync(join(destino, sub), { recursive: true }); writeFileSync(join(destino, sub, 'LEEME.txt'), texto); }
  // datos.js vacío: así la página no da error al abrirla antes de ejecutar actualizar
  const datosJs = join(destino, 'exports', 'datos.js');
  if (!existsSync(datosJs)) writeFileSync(datosJs, '// Lo rellena actualizar.ps1 con los CSV de esta carpeta. Mientras tanto, vacío.\nwindow.EASY_PERFORMANCE_EXPORTS = null;\n');
  for (const f of ['actualizar.ps1', 'actualizar.bat', 'LEEME.txt']) {
    const origen = join(RAIZ, 'web', 'carpeta', f);
    if (existsSync(origen)) copyFileSync(origen, join(destino, f));
  }
  return salida;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  construir(process.argv[2]).then((s) => console.log(`${s} (${Math.round(readFileSync(s).length / 1024)} KB)`));
}
