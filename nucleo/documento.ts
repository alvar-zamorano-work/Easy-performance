// Documento sencillo (títulos, párrafos, listas, tablas y bloque de firma) que se escribe en markdown y en Word.
// El .docx se arma a mano (XML de Office dentro de un zip sin comprimir) para que funcione igual en Node y en el navegador.

import { Tx } from './idioma.ts';
/** Texto con partes en negrita: ['Normal ', { b: 'negrita' }, ' normal']. */
export type Trozo = string | { b: string };
export type Texto = string | Trozo[];

export type Bloque =
  | { tipo: 'h1'; texto: string }
  | { tipo: 'h2'; texto: string }
  | { tipo: 'p'; texto: Texto; nota?: boolean }
  | { tipo: 'lista'; items: Texto[] }
  | { tipo: 'tabla'; cabecera: string[]; filas: string[][]; anchos: number[] }
  | { tipo: 'firma'; partes: string[] };

export interface Documento {
  titulo: string;
  subtitulo: string;
  meta: string;
  pie: string;
  bloques: Bloque[];
}

const trozos = (t: Texto): Trozo[] => (typeof t === 'string' ? [t] : t);

// ---------- markdown ----------

const mdEsc = (s: string) => s.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
function mdTexto(t: Texto): string {
  return trozos(t).map((x) => (typeof x === 'string' ? x : '**' + x.b.trim() + '**' + (x.b.match(/\s+$/) || [''])[0])).join('');
}
function mdTabla(cab: string[], filas: string[][]): string {
  return ['| ' + cab.map(mdEsc).join(' | ') + ' |', '|' + cab.map(() => ' --- |').join(''), ...filas.map((f) => '| ' + f.map(mdEsc).join(' | ') + ' |')].join('\n');
}

export function aMarkdown(doc: Documento): string {
  const out: string[] = ['# ' + doc.titulo, '', '**' + doc.subtitulo + '**', '', '_' + doc.meta + '_', ''];
  doc.bloques.forEach((b) => {
    switch (b.tipo) {
      case 'h1': out.push('## ' + b.texto, ''); break;
      case 'h2': out.push('### ' + b.texto, ''); break;
      case 'p': out.push(b.nota ? '_' + mdTexto(b.texto) + '_' : mdTexto(b.texto), ''); break;
      case 'lista': b.items.forEach((i) => out.push('- ' + mdTexto(i))); out.push(''); break;
      case 'tabla': out.push(mdTabla(b.cabecera, b.filas), ''); break;
      case 'firma': out.push(mdTabla([Tx('Party', 'Parte'), Tx('Name', 'Nombre'), Tx('Role', 'Cargo'), Tx('Date', 'Fecha'), Tx('Signature', 'Firma')], b.partes.map((p) => [p, ' ', ' ', ' ', ' '])), ''); break;
    }
  });
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

// ---------- Word ----------

const ANCHO_TEXTO = 9638; // A4 (11906) menos 2 cm de margen a cada lado, en veinteavos de punto
const xmlEsc = (s: string) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const run = (texto: string, negrita = false) =>
  '<w:r>' + (negrita ? '<w:rPr><w:b/></w:rPr>' : '') + '<w:t xml:space="preserve">' + xmlEsc(texto) + '</w:t></w:r>';
const runs = (t: Texto) => trozos(t).map((x) => (typeof x === 'string' ? run(x) : run(x.b, true))).join('');
const parrafo = (estilo: string | null, contenido: string, extra = '') =>
  '<w:p>' + (estilo || extra ? '<w:pPr>' + (estilo ? '<w:pStyle w:val="' + estilo + '"/>' : '') + extra + '</w:pPr>' : '') + contenido + '</w:p>';

function anchos(rel: number[]): number[] {
  const total = rel.reduce((s, x) => s + x, 0);
  const a = rel.map((x) => Math.floor(ANCHO_TEXTO * x / total));
  a[a.length - 1] += ANCHO_TEXTO - a.reduce((s, x) => s + x, 0);
  return a;
}
function tablaXml(cab: string[], filas: string[][], rel: number[], alto = 0): string {
  const w = anchos(rel);
  const celda = (texto: string, i: number, encabezado: boolean) =>
    '<w:tc><w:tcPr><w:tcW w:w="' + w[i] + '" w:type="dxa"/>' + (encabezado ? '<w:shd w:val="clear" w:color="auto" w:fill="F3F4F7"/>' : '') + '</w:tcPr>' +
    parrafo('Tabla', run(texto, encabezado)) + '</w:tc>';
  const fila = (f: string[], encabezado: boolean) =>
    '<w:tr><w:trPr>' + (encabezado ? '<w:tblHeader/>' : '') + '<w:cantSplit/>' + (alto && !encabezado ? '<w:trHeight w:val="' + alto + '"/>' : '') + '</w:trPr>' +
    f.map((t, i) => celda(t, i, encabezado)).join('') + '</w:tr>';
  return '<w:tbl><w:tblPr><w:tblStyle w:val="TablaEP"/><w:tblW w:w="' + ANCHO_TEXTO + '" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="1" w:noVBand="1"/></w:tblPr>' +
    '<w:tblGrid>' + w.map((x) => '<w:gridCol w:w="' + x + '"/>').join('') + '</w:tblGrid>' +
    fila(cab, true) + filas.map((f) => fila(f, false)).join('') + '</w:tbl>' + parrafo('Separacion', '');
}

function cuerpoXml(doc: Documento): string {
  const p: string[] = [
    parrafo('Title', run(doc.titulo)),
    parrafo('Subtitle', run(doc.subtitulo)),
    parrafo('Nota', run(doc.meta), '<w:pBdr><w:bottom w:val="single" w:sz="8" w:space="8" w:color="1DB8F2"/></w:pBdr><w:spacing w:after="240"/>'),
  ];
  doc.bloques.forEach((b, i) => {
    const sigue = doc.bloques[i + 1];
    switch (b.tipo) {
      case 'h1': p.push(parrafo('Heading1', run(b.texto))); break;
      case 'h2': p.push(parrafo('Heading2', run(b.texto))); break;
      // Un párrafo que presenta una lista o una tabla va en la misma página que ella
      case 'p': p.push(parrafo(b.nota ? 'Nota' : null, runs(b.texto), sigue && (sigue.tipo === 'lista' || sigue.tipo === 'tabla' || sigue.tipo === 'firma') ? '<w:keepNext/>' : '')); break;
      case 'lista': b.items.forEach((i) => p.push(parrafo('ListParagraph', runs(i), '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>'))); break;
      case 'tabla': p.push(tablaXml(b.cabecera, b.filas, b.anchos)); break;
      case 'firma': p.push(tablaXml([Tx('Party', 'Parte'), Tx('Name', 'Nombre'), Tx('Role', 'Cargo'), Tx('Date', 'Fecha'), Tx('Signature', 'Firma')], b.partes.map((x) => [x, '', '', '', '']), [3, 3, 3, 2, 3], 900)); break;
    }
  });
  const sect = '<w:sectPr><w:footerReference w:type="default" r:id="rId4"/><w:pgSz w:w="11906" w:h="16838"/>' +
    '<w:pgMar w:top="1418" w:right="1134" w:bottom="1418" w:left="1134" w:header="709" w:footer="567" w:gutter="0"/></w:sectPr>';
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<w:body>' + p.join('') + sect + '</w:body></w:document>';
}

const FUENTE = '<w:rFonts w:ascii="Ubuntu" w:hAnsi="Ubuntu" w:eastAsia="Ubuntu" w:cs="Ubuntu"/>';
const ESTILOS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
  '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
  '<w:docDefaults><w:rPrDefault><w:rPr>' + FUENTE + '<w:color w:val="1F2A44"/><w:sz w:val="20"/><w:szCs w:val="20"/><w:lang w:val="en-GB" w:eastAsia="en-GB" w:bidi="ar-SA"/></w:rPr></w:rPrDefault>' +
  '<w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
  '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
  '<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="60"/></w:pPr><w:rPr><w:b/><w:color w:val="121A38"/><w:sz w:val="48"/><w:szCs w:val="48"/></w:rPr></w:style>' +
  '<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="60"/></w:pPr><w:rPr><w:color w:val="0058AB"/><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr></w:style>' +
  '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="360" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:color w:val="0058AB"/><w:sz w:val="30"/><w:szCs w:val="30"/></w:rPr></w:style>' +
  '<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="60"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:color w:val="121A38"/><w:sz w:val="23"/><w:szCs w:val="23"/></w:rPr></w:style>' +
  '<w:style w:type="paragraph" w:styleId="Nota"><w:name w:val="Nota"/><w:basedOn w:val="Normal"/><w:qFormat/><w:rPr><w:color w:val="5B6577"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr></w:style>' +
  '<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="60"/><w:ind w:left="567"/></w:pPr></w:style>' +
  '<w:style w:type="paragraph" w:styleId="Tabla"><w:name w:val="Tabla"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:before="40" w:after="40" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr></w:style>' +
  '<w:style w:type="paragraph" w:styleId="Separacion"><w:name w:val="Separacion"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="60" w:line="120" w:lineRule="exact"/></w:pPr></w:style>' +
  '<w:style w:type="paragraph" w:styleId="Footer"><w:name w:val="footer"/><w:basedOn w:val="Normal"/><w:rPr><w:color w:val="5B6577"/><w:sz w:val="16"/><w:szCs w:val="16"/></w:rPr></w:style>' +
  '<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>' +
  '<w:style w:type="table" w:styleId="TablaEP"><w:name w:val="Easy Performance table"/><w:basedOn w:val="TableNormal"/><w:tblPr><w:tblBorders>' +
  '<w:top w:val="single" w:sz="4" w:space="0" w:color="ADB8C2"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="ADB8C2"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="DDE2E8"/>' +
  '</w:tblBorders><w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>' +
  '</w:styles>';

const NUMERACION = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
  '<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
  '<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="singleLevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/>' +
  '<w:pPr><w:ind w:left="567" w:hanging="283"/></w:pPr><w:rPr><w:color w:val="0058AB"/></w:rPr></w:lvl></w:abstractNum>' +
  '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>';

function pieXml(texto: string): string {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<w:p><w:pPr><w:pStyle w:val="Footer"/><w:tabs><w:tab w:val="right" w:pos="' + ANCHO_TEXTO + '"/></w:tabs></w:pPr>' + run(texto) +
    Tx('<w:r><w:tab/></w:r><w:r><w:t xml:space="preserve">Page </w:t></w:r><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r>', '<w:r><w:tab/></w:r><w:r><w:t xml:space="preserve">Página </w:t></w:r><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r>') +
    '<w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p></w:ftr>';
}

export function aDocx(doc: Documento, fecha: Date = new Date()): Uint8Array {
  const iso = fecha.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const ficheros: [string, string][] = [
    ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
      '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>' +
      '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>' +
      '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>' +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
      '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>'],
    ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
      '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>'],
    ['docProps/core.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
      '<dc:title>' + xmlEsc(doc.titulo + ' · ' + doc.subtitulo) + Tx('</dc:title><dc:creator>Easy Performance</dc:creator><dc:language>en-GB</dc:language>', '</dc:title><dc:creator>Easy Performance</dc:creator><dc:language>es-ES</dc:language>') +
      '<dcterms:created xsi:type="dcterms:W3CDTF">' + iso + '</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">' + iso + '</dcterms:modified></cp:coreProperties>'],
    ['docProps/app.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Easy Performance</Application></Properties>'],
    ['word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>' +
      '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>' +
      '<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>'],
    ['word/document.xml', cuerpoXml(doc)],
    ['word/styles.xml', ESTILOS],
    ['word/numbering.xml', NUMERACION],
    ['word/settings.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:defaultTabStop w:val="709"/><w:characterSpacingControl w:val="doNotCompress"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>'],
    ['word/footer1.xml', pieXml(doc.pie)],
  ];
  const enc = new TextEncoder();
  return zipSinComprimir(ficheros.map(([nombre, texto]) => ({ nombre, datos: enc.encode(texto) })), fecha);
}

// ---------- zip sin compresión ----------

const TABLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
export function crc32(d: Uint8Array): number {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < d.length; i++) c = TABLA_CRC[(c ^ d[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

export function zipSinComprimir(ficheros: { nombre: string; datos: Uint8Array }[], fecha: Date = new Date()): Uint8Array {
  const enc = new TextEncoder();
  const hora = (fecha.getHours() << 11) | (fecha.getMinutes() << 5) | (fecha.getSeconds() >> 1);
  const dia = ((Math.max(1980, fecha.getFullYear()) - 1980) << 9) | ((fecha.getMonth() + 1) << 5) | fecha.getDate();
  const partes: Uint8Array[] = [], central: Uint8Array[] = [];
  let desplazamiento = 0;
  ficheros.forEach((f) => {
    const nombre = enc.encode(f.nombre), crc = crc32(f.datos), n = f.datos.length;
    const local = new Uint8Array(30 + nombre.length), vl = new DataView(local.buffer);
    vl.setUint32(0, 0x04034b50, true); vl.setUint16(4, 20, true); vl.setUint16(6, 0x0800, true); vl.setUint16(8, 0, true);
    vl.setUint16(10, hora, true); vl.setUint16(12, dia, true); vl.setUint32(14, crc, true); vl.setUint32(18, n, true); vl.setUint32(22, n, true);
    vl.setUint16(26, nombre.length, true); vl.setUint16(28, 0, true); local.set(nombre, 30);
    const cd = new Uint8Array(46 + nombre.length), vc = new DataView(cd.buffer);
    vc.setUint32(0, 0x02014b50, true); vc.setUint16(4, 20, true); vc.setUint16(6, 20, true); vc.setUint16(8, 0x0800, true); vc.setUint16(10, 0, true);
    vc.setUint16(12, hora, true); vc.setUint16(14, dia, true); vc.setUint32(16, crc, true); vc.setUint32(20, n, true); vc.setUint32(24, n, true);
    vc.setUint16(28, nombre.length, true); vc.setUint32(42, desplazamiento, true); cd.set(nombre, 46);
    partes.push(local, f.datos); central.push(cd);
    desplazamiento += local.length + n;
  });
  const tamCentral = central.reduce((s, c) => s + c.length, 0);
  const fin = new Uint8Array(22), vf = new DataView(fin.buffer);
  vf.setUint32(0, 0x06054b50, true); vf.setUint16(8, ficheros.length, true); vf.setUint16(10, ficheros.length, true);
  vf.setUint32(12, tamCentral, true); vf.setUint32(16, desplazamiento, true);
  const todo = [...partes, ...central, fin];
  const out = new Uint8Array(todo.reduce((s, p) => s + p.length, 0));
  let o = 0;
  todo.forEach((p) => { out.set(p, o); o += p.length; });
  return out;
}
