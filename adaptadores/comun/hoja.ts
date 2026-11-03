// Hojas de cálculo sin librerías externas: .xlsx (zip con XML), .xls (formato binario de Excel 97-2003) y el ".xls"
// que en realidad es una tabla HTML (así exporta Jira Server "Excel"). Se lee la primera hoja y se devuelve como
// filas de texto, igual que un CSV, para que los adaptadores no cambien. Las celdas con formato de fecha salen como
// "aaaa-mm-dd hh:mm", sin ambigüedad de día y mes. Todo en el navegador: el fichero no sale de él.

export type FormatoHoja = 'csv' | 'xlsx' | 'xls' | 'html';

export function detectarFormato(b: Uint8Array): FormatoHoja {
  if (b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04) return 'xlsx';
  if (b.length >= 8 && b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0) return 'xls';
  const inicio = new TextDecoder('latin1').decode(b.subarray(0, 2048)).replace(/^﻿/, '').trimStart().toLowerCase();
  if (inicio.startsWith('<') && /<(html|table|!doctype|\?xml|meta)/.test(inicio)) return 'html';
  return 'csv';
}

export interface Hoja { filas: string[][]; hoja: string; hojas: number }

/** Lee la primera hoja de un Excel o una tabla HTML. */
export async function leerHoja(b: Uint8Array): Promise<Hoja> {
  const f = detectarFormato(b);
  if (f === 'xlsx') return leerXlsx(b);
  if (f === 'xls') return leerXls(b);
  if (f === 'html') return leerHtml(decodificar(b));
  throw new Error('No es una hoja de cálculo');
}

/** Filas a texto CSV (coma, comillas dobles), para pasarlas a los adaptadores. */
export function aCsv(filas: string[][]): string {
  const celda = (v: string) => (/[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v);
  return filas.map((f) => f.map((v) => celda(v == null ? '' : String(v))).join(',')).join('\n');
}

function decodificar(b: Uint8Array): string {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(b); } catch { return new TextDecoder('windows-1252').decode(b); }
}

// ---------- fechas y números ----------
const dos = (n: number) => (n < 10 ? '0' : '') + n;
function fechaDeSerie(n: number, en1904: boolean): string {
  const dias = Math.floor(n) + (en1904 ? 1462 : 0), ms = Math.round((n - Math.floor(n)) * 864e5);
  const d = new Date(Date.UTC(1899, 11, 30) + dias * 864e5 + ms);
  return `${d.getUTCFullYear()}-${dos(d.getUTCMonth() + 1)}-${dos(d.getUTCDate())} ${dos(d.getUTCHours())}:${dos(d.getUTCMinutes())}`;
}
const numero = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 1e10) / 1e10));
/** ¿Es un formato de fecha? Ids internos de Excel o un código con d, m, y, h fuera de comillas y corchetes de color. */
function esFormatoFecha(id: number, codigo: string | undefined): boolean {
  if ((id >= 14 && id <= 22) || (id >= 45 && id <= 47) || (id >= 27 && id <= 36) || (id >= 50 && id <= 58)) return true;
  if (!codigo) return false;
  const limpio = codigo.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '').replace(/\\./g, '').toLowerCase();
  return /[dmyh]/.test(limpio) && !/^[#0.,%\s]*$/.test(limpio);
}

// ---------- tabla HTML ----------
const ENTIDADES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function entidades(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') { const c = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return isFinite(c) ? String.fromCodePoint(c) : m; }
    return ENTIDADES[e.toLowerCase()] ?? m;
  });
}
export function leerHtml(html: string): Hoja {
  const tablas = html.match(/<table[\s\S]*?<\/table>/gi) || [];
  // La tabla con más filas es la de las tareas (Jira mete otras pequeñas para el encabezado)
  let mejor: string[][] = [];
  tablas.forEach((t) => {
    const filas = (t.match(/<tr[\s\S]*?<\/tr>/gi) || []).map((tr) => (tr.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/gi) || [])
      .map((td) => entidades(td.replace(/^<t[dh][^>]*>|<\/t[dh]>$/gi, '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')).replace(/[ \t]+/g, ' ').trim()));
    if (filas.length > mejor.length) mejor = filas;
  });
  return { filas: mejor, hoja: 'html', hojas: tablas.length };
}

// ---------- .xlsx: zip con XML ----------
async function inflar(datos: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate-raw');
  const flujo = new Blob([datos]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(flujo).arrayBuffer());
}
async function leerZip(b: Uint8Array): Promise<Map<string, () => Promise<string>>> {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let fin = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 70000); i--) if (v.getUint32(i, true) === 0x06054b50) { fin = i; break; }
  if (fin < 0) throw new Error('Zip sin directorio');
  const total = v.getUint16(fin + 10, true);
  let p = v.getUint32(fin + 16, true);
  const out = new Map<string, () => Promise<string>>();
  const utf8 = new TextDecoder('utf-8');
  for (let k = 0; k < total; k++) {
    if (v.getUint32(p, true) !== 0x02014b50) break;
    const metodo = v.getUint16(p + 10, true), tam = v.getUint32(p + 20, true);
    const ln = v.getUint16(p + 28, true), le = v.getUint16(p + 30, true), lc = v.getUint16(p + 32, true), local = v.getUint32(p + 42, true);
    const nombre = utf8.decode(b.subarray(p + 46, p + 46 + ln));
    const inicio = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    const datos = b.subarray(inicio, inicio + tam);
    out.set(nombre.replace(/^\//, ''), async () => utf8.decode(metodo === 0 ? datos : await inflar(datos)));
    p += 46 + ln + le + lc;
  }
  return out;
}
const atributo = (tag: string, nombre: string) => { const m = new RegExp('\\s' + nombre + '="([^"]*)"').exec(tag); return m ? entidades(m[1]) : null; };
function textoXml(fragmento: string): string {
  return (fragmento.match(/<t(?:\s[^>]*)?>[\s\S]*?<\/t>|<t(?:\s[^>]*)?\/>/g) || []).map((t) => entidades(t.replace(/^<t[^>]*>|<\/t>$|^<t[^>]*\/>$/g, ''))).join('');
}
/** Columna de una referencia como "AB12" a índice desde 0. */
function columnaDe(ref: string): number { let n = 0; for (const c of ref.replace(/\d+$/, '')) n = n * 26 + (c.charCodeAt(0) - 64); return n - 1; }

export async function leerXlsx(b: Uint8Array): Promise<Hoja> {
  const zip = await leerZip(b);
  const leer = async (n: string) => { const f = zip.get(n); return f ? f() : ''; };
  const libro = await leer('xl/workbook.xml');
  const hojasXml = libro.match(/<sheet\b[^>]*>/g) || [];
  if (!hojasXml.length) throw new Error('Libro sin hojas');
  const primera = hojasXml[0] as string;
  const rid = atributo(primera, 'r:id'), nombreHoja = atributo(primera, 'name') || 'Hoja1';
  const rels = await leer('xl/_rels/workbook.xml.rels');
  const rel = (rels.match(/<Relationship\b[^>]*>/g) || []).find((r) => atributo(r, 'Id') === rid);
  let destino = rel ? atributo(rel, 'Target') || 'worksheets/sheet1.xml' : 'worksheets/sheet1.xml';
  destino = destino.startsWith('/') ? destino.slice(1) : 'xl/' + destino.replace(/^\.\//, '');
  const en1904 = /date1904="(1|true)"/.test(libro);
  const compartidas = ((await leer('xl/sharedStrings.xml')).match(/<si>[\s\S]*?<\/si>|<si\/>/g) || []).map(textoXml);
  // Estilos: qué índices de estilo son de fecha
  const estilos = await leer('xl/styles.xml');
  const codigos: Record<number, string> = {};
  (estilos.match(/<numFmt\b[^>]*>/g) || []).forEach((n) => { codigos[+(atributo(n, 'numFmtId') || 0)] = atributo(n, 'formatCode') || ''; });
  const xfs = (/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(estilos) || ['', ''])[1].match(/<xf\b[^>]*>/g) || [];
  const esFecha = xfs.map((x) => { const id = +(atributo(x, 'numFmtId') || 0); return esFormatoFecha(id, codigos[id]); });
  const xml = await leer(destino);
  const filas: string[][] = [];
  (xml.match(/<row\b[^>]*>[\s\S]*?<\/row>|<row\b[^>]*\/>/g) || []).forEach((fila) => {
    const r = +(atributo(fila.slice(0, fila.indexOf('>') + 1), 'r') || filas.length + 1) - 1;
    const celdas: string[] = [];
    (fila.match(/<c\b[^>]*\/>|<c\b[^>]*>[\s\S]*?<\/c>/g) || []).forEach((c, k) => {
      const tag = c.slice(0, c.indexOf('>') + 1);
      const ref = atributo(tag, 'r'), col = ref ? columnaDe(ref) : k, tipo = atributo(tag, 't') || 'n', s = +(atributo(tag, 's') || 0);
      const v = (/<v>([\s\S]*?)<\/v>/.exec(c) || ['', ''])[1];
      let txt = '';
      if (tipo === 's') txt = compartidas[+v] ?? '';
      else if (tipo === 'inlineStr') txt = textoXml(c);
      else if (tipo === 'str' || tipo === 'e') txt = entidades(v);
      else if (tipo === 'b') txt = v === '1' ? 'TRUE' : 'FALSE';
      else if (v !== '') { const n = parseFloat(v); txt = isFinite(n) ? (esFecha[s] ? fechaDeSerie(n, en1904) : numero(n)) : v; }
      celdas[col] = txt;
    });
    for (let i = 0; i < celdas.length; i++) if (celdas[i] == null) celdas[i] = '';
    filas[r] = celdas;
  });
  for (let i = 0; i < filas.length; i++) if (!filas[i]) filas[i] = [];
  return { filas, hoja: nombreHoja, hojas: hojasXml.length };
}

// ---------- .xls: Excel 97-2003 (contenedor OLE con el flujo "Workbook" en registros BIFF8) ----------
function flujoOle(b: Uint8Array, buscado: string[]): Uint8Array {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const sector = 1 << v.getUint16(30, true), mini = 1 << v.getUint16(32, true);
  const nFat = v.getUint32(44, true), dir0 = v.getUint32(48, true), corte = v.getUint32(56, true);
  const miniFat0 = v.getUint32(60, true), difat0 = v.getUint32(68, true);
  const pos = (s: number) => (s + 1) * sector;
  // Tabla de asignación: sus sectores salen de la DIFAT (109 en la cabecera y el resto encadenados)
  const sectoresFat: number[] = [];
  for (let i = 0; i < 109 && sectoresFat.length < nFat; i++) sectoresFat.push(v.getUint32(76 + i * 4, true));
  let d = difat0;
  while (sectoresFat.length < nFat && d < 0xfffffffa) {
    for (let i = 0; i < sector / 4 - 1 && sectoresFat.length < nFat; i++) sectoresFat.push(v.getUint32(pos(d) + i * 4, true));
    d = v.getUint32(pos(d) + sector - 4, true);
  }
  const fat: number[] = [];
  sectoresFat.forEach((s) => { for (let i = 0; i < sector / 4; i++) fat.push(v.getUint32(pos(s) + i * 4, true)); });
  const cadena = (inicio: number, tabla: number[]) => { const out: number[] = []; let s = inicio; while (s < 0xfffffffa && out.length <= tabla.length) { out.push(s); s = tabla[s]; } return out; };
  const leerCadena = (inicio: number, tam: number) => { const out = new Uint8Array(cadena(inicio, fat).length * sector); cadena(inicio, fat).forEach((s, i) => out.set(b.subarray(pos(s), pos(s) + sector), i * sector)); return out.subarray(0, tam || out.length); };
  const dir = leerCadena(dir0, 0), dv = new DataView(dir.buffer, dir.byteOffset, dir.byteLength);
  const entradas: { nombre: string; tipo: number; inicio: number; tam: number }[] = [];
  for (let o = 0; o + 128 <= dir.length; o += 128) {
    const largo = dv.getUint16(o + 64, true);
    let nombre = ''; for (let i = 0; i < Math.max(0, largo / 2 - 1); i++) nombre += String.fromCharCode(dv.getUint16(o + i * 2, true));
    entradas.push({ nombre, tipo: dv.getUint8(o + 66), inicio: dv.getUint32(o + 116, true), tam: dv.getUint32(o + 120, true) });
  }
  const e = entradas.find((x) => x.tipo === 2 && buscado.includes(x.nombre));
  if (!e) throw new Error('El fichero no tiene libro de Excel');
  if (e.tam >= corte) return leerCadena(e.inicio, e.tam);
  // Flujos pequeños: van en el mini flujo de la entrada raíz
  const raiz = entradas.find((x) => x.tipo === 5)!;
  const miniFlujo = leerCadena(raiz.inicio, raiz.tam);
  const mf = leerCadena(miniFat0, 0), mfv = new DataView(mf.buffer, mf.byteOffset, mf.byteLength);
  const miniFat: number[] = []; for (let i = 0; i < mf.length / 4; i++) miniFat.push(mfv.getUint32(i * 4, true));
  const out = new Uint8Array(e.tam);
  cadena(e.inicio, miniFat).forEach((s, i) => out.set(miniFlujo.subarray(s * mini, Math.min(s * mini + mini, miniFlujo.length)).subarray(0, Math.min(mini, e.tam - i * mini)), i * mini));
  return out;
}

export function leerXls(b: Uint8Array): Hoja {
  const w = flujoOle(b, ['Workbook', 'Book']);
  const v = new DataView(w.buffer, w.byteOffset, w.byteLength);
  // Registros: [tipo u16][largo u16][datos]
  const regs: { tipo: number; o: number; largo: number }[] = [];
  for (let o = 0; o + 4 <= w.length;) { const tipo = v.getUint16(o, true), largo = v.getUint16(o + 2, true); regs.push({ tipo, o: o + 4, largo }); o += 4 + largo; }
  const latin1 = new TextDecoder('windows-1252');
  const utf16 = (o: number, n: number) => { let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(v.getUint16(o + i * 2, true)); return s; };
  // Cadena con la longitud en 16 bits (LABEL, STRING, FORMAT)
  const cadena16 = (o: number) => { const n = v.getUint16(o, true), f = v.getUint8(o + 2); return f & 1 ? utf16(o + 3, n) : latin1.decode(w.subarray(o + 3, o + 3 + n)); };
  let en1904 = false;
  const codigos: Record<number, string> = {}, xfFmt: number[] = [], hojas: { nombre: string; pos: number }[] = [];
  let sst: string[] = [];
  let i = 0;
  for (; i < regs.length; i++) {
    const r = regs[i];
    if (r.tipo === 0x0a) break; // fin del bloque global
    if (r.tipo === 0x22) en1904 = v.getUint16(r.o, true) === 1;
    else if (r.tipo === 0x41e) codigos[v.getUint16(r.o, true)] = cadena16(r.o + 2);
    else if (r.tipo === 0xe0) xfFmt.push(v.getUint16(r.o + 2, true));
    else if (r.tipo === 0x85) { const n = v.getUint8(r.o + 6), f = v.getUint8(r.o + 7); hojas.push({ pos: v.getUint32(r.o, true), nombre: f & 1 ? utf16(r.o + 8, n) : latin1.decode(w.subarray(r.o + 8, r.o + 8 + n)) }); }
    else if (r.tipo === 0xfc) {
      // Tabla de cadenas compartidas, repartida en el registro y sus CONTINUE
      const trozos = [{ o: r.o, largo: r.largo }];
      while (regs[i + 1] && regs[i + 1].tipo === 0x3c) { i++; trozos.push({ o: regs[i].o, largo: regs[i].largo }); }
      sst = leerSst(v, w, trozos, latin1);
    }
  }
  const esFecha = xfFmt.map((id) => esFormatoFecha(id, codigos[id]));
  const hoja = hojas[0];
  const filas: string[][] = [];
  const poner = (fila: number, col: number, txt: string) => { (filas[fila] = filas[fila] || [])[col] = txt; };
  const valorNum = (n: number, ixfe: number) => (esFecha[ixfe] ? fechaDeSerie(n, en1904) : numero(n));
  const rk = (x: number) => { let n = x & 2 ? x >> 2 : new DataView(new Uint32Array([0, x & 0xfffffffc]).buffer).getFloat64(0, true); if (x & 1) n /= 100; return n; };
  let enHoja = false, pendiente: [number, number] | null = null;
  for (const r of regs) {
    if (!enHoja) { if (r.o - 4 === (hoja ? hoja.pos : -1)) enHoja = true; continue; }
    const o = r.o;
    if (r.tipo === 0x0a) break;
    if (r.tipo === 0xfd) poner(v.getUint16(o, true), v.getUint16(o + 2, true), sst[v.getUint32(o + 6, true)] ?? '');
    else if (r.tipo === 0x203) poner(v.getUint16(o, true), v.getUint16(o + 2, true), valorNum(v.getFloat64(o + 6, true), v.getUint16(o + 4, true)));
    else if (r.tipo === 0x27e) poner(v.getUint16(o, true), v.getUint16(o + 2, true), valorNum(rk(v.getUint32(o + 6, true)), v.getUint16(o + 4, true)));
    else if (r.tipo === 0xbd) {
      const fila = v.getUint16(o, true), c0 = v.getUint16(o + 2, true), n = (r.largo - 6) / 6;
      for (let k = 0; k < n; k++) poner(fila, c0 + k, valorNum(rk(v.getUint32(o + 4 + k * 6 + 2, true)), v.getUint16(o + 4 + k * 6, true)));
    } else if (r.tipo === 0x204) poner(v.getUint16(o, true), v.getUint16(o + 2, true), cadena16(o + 6));
    else if (r.tipo === 0x205) { const val = v.getUint8(o + 6), err = v.getUint8(o + 7); poner(v.getUint16(o, true), v.getUint16(o + 2, true), err ? '' : val ? 'TRUE' : 'FALSE'); }
    else if (r.tipo === 0x06) {
      const fila = v.getUint16(o, true), col = v.getUint16(o + 2, true);
      if (v.getUint16(o + 12, true) === 0xffff) { const t = v.getUint8(o + 6); if (t === 0) pendiente = [fila, col]; else if (t === 1) poner(fila, col, v.getUint8(o + 8) ? 'TRUE' : 'FALSE'); }
      else poner(fila, col, valorNum(v.getFloat64(o + 6, true), v.getUint16(o + 4, true)));
    } else if (r.tipo === 0x207 && pendiente) { poner(pendiente[0], pendiente[1], cadena16(o)); pendiente = null; }
  }
  for (let k = 0; k < filas.length; k++) { const f = filas[k] = filas[k] || []; for (let c = 0; c < f.length; c++) if (f[c] == null) f[c] = ''; }
  return { filas, hoja: hoja ? hoja.nombre : 'Hoja1', hojas: hojas.length };
}

/** Cadenas compartidas BIFF8: una cadena puede partirse entre CONTINUE, y cada trozo vuelve a decir si va en 8 o 16 bits. */
function leerSst(v: DataView, w: Uint8Array, trozos: { o: number; largo: number }[], latin1: { decode: (b: Uint8Array) => string }): string[] {
  let t = 0, p = trozos[0].o + 8; // salta total y únicas
  const finTrozo = () => trozos[t].o + trozos[t].largo;
  const avanza = () => { if (p >= finTrozo() && t + 1 < trozos.length) { t++; p = trozos[t].o; return true; } return false; };
  const u8 = () => { avanza(); return v.getUint8(p++); };
  const u16 = () => { avanza(); const x = v.getUint16(p, true); p += 2; return x; };
  const u32 = () => { avanza(); const x = v.getUint32(p, true); p += 4; return x; };
  const saltar = (n: number) => { while (n > 0) { avanza(); const k = Math.min(n, finTrozo() - p); p += k; n -= k; if (k === 0) break; } };
  const unicas = v.getUint32(trozos[0].o + 4, true);
  const out: string[] = [];
  for (let s = 0; s < unicas; s++) {
    if (p >= finTrozo() && t + 1 >= trozos.length) break;
    const n = u16(); let flags = u8();
    const runs = flags & 8 ? u16() : 0, ext = flags & 4 ? u32() : 0;
    let txt = '', quedan = n;
    while (quedan > 0) {
      if (p >= finTrozo()) { if (!avanza()) break; flags = v.getUint8(p++); } // nuevo trozo: vuelve el indicador de 8 o 16 bits
      const ancho = flags & 1 ? 2 : 1, caben = Math.floor((finTrozo() - p) / ancho), k = Math.min(quedan, caben);
      if (ancho === 2) for (let c = 0; c < k; c++) txt += String.fromCharCode(v.getUint16(p + c * 2, true));
      else txt += latin1.decode(w.subarray(p, p + k));
      p += k * ancho; quedan -= k;
      if (k === 0 && !avanza()) break;
    }
    saltar(runs * 4 + ext);
    out.push(txt);
  }
  return out;
}
