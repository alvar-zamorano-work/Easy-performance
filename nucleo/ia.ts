// Módulo de IA (plan v1, apartado 11; plan v2, decisión 4): la IA recibe solo el paquete de diagnóstico
// y el catálogo, y devuelve recomendaciones con evidencia citada. Nunca calcula medidas ni ve datos crudos.
// Tres usos: recomendaciones desde el paquete, propuesta de mapeo de estados (solo nombres y recuentos)
// y lectura del impacto de las iniciativas. Cada uso tiene su petición y su validador: lo que la IA
// devuelve se comprueba contra el paquete antes de enseñarlo, y lo que no cuadra se descarta.
// El proveedor es una función (petición -> texto): así se prueba con uno falso y se cambia de modelo sin tocar nada más.

import { CATALOGO, type Catalogo } from './catalogo.ts';
import { formatear } from './formato.ts';
import type { Paquete } from './paquete.ts';
import type { EstadoNormalizado } from './modelo.ts';

export interface PeticionIA { system: string; user: string; maxTokens: number }
export type ProveedorIA = (p: PeticionIA) => Promise<string>;
export type Confianza = 'low' | 'medium' | 'high';
export const CATEGORIAS_CONTEXTO = ['metodo', 'organizacion', 'stack', 'contratos', 'otro'] as const;
export type CategoriaContexto = (typeof CATEGORIAS_CONTEXTO)[number];

export interface EvidenciaIA { equipo: string | null; medida: string; valor: number; texto: string }
export interface RecomendacionIA {
  titulo: string;
  destinatario: { tipo: 'equipo' | 'grupo' | 'area'; id: string };
  equipos: string[];
  evidencia: EvidenciaIA[];
  causa: { caso: string | null; texto: string };
  accion: string;
  primer_paso: string;
  comprobar: string;
  confianza: Confianza;
  pregunta: string;
  contexto_necesario: CategoriaContexto | null;
  /** Medida objetivo para registrarla como iniciativa, si procede. */
  medida: string | null;
}

export interface ResultadoRecomendaciones { recomendaciones: RecomendacionIA[]; descartadas: { motivo: string; bruto: unknown }[]; problemas: string[] }

const MAX_RECS = 6;
const TOLERANCIA = 0.02;

/** Saca el JSON de una respuesta, aunque venga entre ``` o con texto alrededor. */
export function extraerJson(texto: string): unknown {
  const t = String(texto || '').trim();
  const sinValla = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  try { return JSON.parse(sinValla); } catch { /* sigue */ }
  const a = sinValla.search(/[[{]/);
  if (a < 0) throw new Error('The answer has no JSON.');
  const cierre = sinValla[a] === '[' ? ']' : '}';
  const b = sinValla.lastIndexOf(cierre);
  if (b <= a) throw new Error('The answer has no JSON.');
  return JSON.parse(sinValla.slice(a, b + 1));
}

const NOMBRES_CONTEXTO: Record<CategoriaContexto, string> = { metodo: 'way of working', organizacion: 'organisation', stack: 'technology stack', contratos: 'vendor contracts', otro: 'other' };
/** Palabras que delatan una prescripción sobre una categoría de contexto (cambiar de stack, renegociar un contrato...); si la categoría está vacía, la recomendación se descarta. Nombrar la deuda técnica como causa no es prescribir sobre el stack. */
const PISTAS: Record<CategoriaContexto, RegExp> = {
  stack: /\b(migrat\w* (to|the)|rewrite|new framework|change (the|of) (framework|language|architecture|platform)|programming language|microservices?|cloud provider|replace the (tool|stack|platform)|adopt\w* (a |the )?\w*(framework|platform|language))\b/i,
  contratos: /\b(contract|SLA|penalt|rate card|tariff|renegotiat|procurement|supplier agreement)\b/i,
  organizacion: /\b(org chart|reorgani[sz]|headcount|hiring|hire|staffing|reporting line)\b/i,
  metodo: /\b(scrum|kanban|SAFe|ceremon|sprint length|definition of done|retrospective)\b/i,
  otro: /$^/,
};

function categoriasVacias(p: Paquete): CategoriaContexto[] {
  return CATEGORIAS_CONTEXTO.filter((c) => !p.contexto[c] || p.contexto[c].vacia);
}

function resumenCatalogo(cat: Catalogo): string {
  const casos = Object.entries(cat.casos).map(([id, c]) => `- ${id}: ${c.titulo}. Signal: ${c.senal} First step: ${c.plan[0]?.paso ?? ''}`);
  const medidas = Object.entries(cat.medidas).map(([id, m]) => `- ${id}: ${m.nombre} (${m.unidad}). ${m.como}`);
  return `Measures (id: name):\n${medidas.join('\n')}\n\nCase bank (id: title):\n${casos.join('\n')}`;
}

/** Paquete reducido para la petición: sin series semanales largas, que no aportan y gastan tokens. */
function paqueteParaPrompt(p: Paquete) {
  const recortar = (m: Record<string, any>) => Object.fromEntries(Object.entries(m).map(([id, x]) => [id, x && x.serie ? { ...x, serie: x.serie.slice(-8) } : x]));
  return {
    ...p,
    medidas: { equipos: Object.fromEntries(Object.entries(p.medidas.equipos).map(([e, m]) => [e, recortar(m as Record<string, any>)])), area: p.medidas.area ? recortar(p.medidas.area as Record<string, any>) : null },
  };
}

const SISTEMA_RECS = `You are the analyst of an improvement office that helps software delivery teams. You receive a diagnostic package: aggregated measures per team, active cases from a case bank, comparisons between groups, initiatives and their evaluation, and context notes. You never see tickets, people or raw data, and you never calculate measures yourself.

Rules:
1. Cite only numbers that are in the package. Each evidence item must name the team (or null for the whole area), the measure id and the exact value from the package.
2. Do not give opinions on a context category that is empty. If a recommendation would need it, set "contexto_necesario" to that category and keep the action within what the data supports.
3. At most ${MAX_RECS} recommendations. First what repeats across teams or a whole group, then single teams. Compare teams only on normalised measures and never rank them.
4. Plain language, in the language the message asks for. Short sentences. No dashes as punctuation. Never mention people.
5. Answer with JSON only, no prose around it.`;

export function peticionRecomendaciones(paquete: Paquete, catalogo: Catalogo = CATALOGO, idioma: Idioma = 'en'): PeticionIA {
  const vacias = categoriasVacias(paquete).map((c) => NOMBRES_CONTEXTO[c]);
  const esquema = `[{"titulo": string, "destinatario": {"tipo": "equipo"|"grupo"|"area", "id": string}, "equipos": string[], "evidencia": [{"equipo": string|null, "medida": string, "valor": number, "texto": string}], "causa": {"caso": string|null, "texto": string}, "accion": string, "primer_paso": string, "comprobar": string, "confianza": "low"|"medium"|"high", "pregunta": string, "contexto_necesario": "metodo"|"organizacion"|"stack"|"contratos"|"otro"|null, "medida": string|null}]`;
  const user = `Diagnostic package (JSON):\n${JSON.stringify(paqueteParaPrompt(paquete))}\n\n${resumenCatalogo(catalogo)}\n\nEmpty context categories (do not give opinions on them): ${vacias.length ? vacias.join(', ') : 'none'}.\n\nTeam ids you may use: ${paquete.equipos.map((e) => e.id).join(', ')}. Group ids: ${paquete.comparaciones.flatMap((c) => c.grupos.map((g) => g.id)).join(', ') || 'none'}. Use "area" for the whole area.\n"medida" is the measure id to track if this recommendation becomes an initiative (one of the measure ids above) or null.\n"causa.caso" is the id of the case from the case bank that explains it, or null if it is a new cause.\n\nReturn a JSON array with this shape:\n${esquema}\n\n${ESCRITURA[idioma]}`;
  return { system: SISTEMA_RECS, user, maxTokens: 4000 };
}

function numero(v: unknown): number | null { const n = typeof v === 'string' ? parseFloat(v) : (v as number); return typeof n === 'number' && isFinite(n) ? n : null; }
function cerca(a: number, b: number): boolean { return Math.abs(a - b) <= Math.max(Math.abs(b) * TOLERANCIA, 0.005); }

/** Valores del paquete donde puede encajar una cifra citada: la medida del equipo, su rango, los datos de sus casos y las comparaciones. */
function valoresDe(p: Paquete, equipo: string | null, medida: string): number[] {
  const out: number[] = [];
  const mete = (m: any) => { if (m && m.disponible) { out.push(m.valor); if (m.rango) out.push(m.rango.lo, m.rango.hi, m.rango.mediana); } };
  if (equipo == null || equipo === 'area') mete((p.medidas.area as any)?.[medida]);
  const eq = equipo ? (p.medidas.equipos as any)[equipo] : null;
  if (eq) mete(eq[medida]);
  for (const c of p.casos_activos) if (!equipo || c.equipo === equipo) for (const v of Object.values(c.datos)) if (typeof v === 'number') out.push(v);
  for (const c of p.casos_grupo) for (const v of Object.values(c.datos)) if (typeof v === 'number') out.push(v);
  for (const c of p.comparaciones) {
    const m = (c.medidas as any)[medida];
    if (m) for (const s of m.segmentos) for (const x of Object.values(s.porGrupo) as any[]) if (x.valor != null) out.push(x.valor);
    for (const g of Object.values(c.porGrupo) as any[]) { if (g.throughputFte != null) out.push(g.throughputFte); if (g.antiguedadPendiente != null) out.push(g.antiguedadPendiente); out.push(g.agentReady.listos, g.agentReady.indiceMedio); }
  }
  const ar = (p.agent_readiness.equipos as any)[equipo || ''];
  if (ar) out.push(ar.listos, ar.indiceMedio);
  return out.filter((v) => v != null && isFinite(v));
}

function coincide(p: Paquete, equipo: string | null, medida: string, valor: number): boolean {
  const vals = valoresDe(p, equipo, medida);
  return vals.some((v) => cerca(valor, v) || cerca(valor, v * 100) || cerca(valor / 100, v));
}

export function validarRecomendaciones(texto: string, paquete: Paquete, catalogo: Catalogo = CATALOGO): ResultadoRecomendaciones {
  const problemas: string[] = [];
  let bruto: unknown;
  try { bruto = extraerJson(texto); } catch (e) { return { recomendaciones: [], descartadas: [], problemas: ['The answer is not valid JSON: ' + (e as Error).message] }; }
  const lista = Array.isArray(bruto) ? bruto : (bruto && typeof bruto === 'object' && Array.isArray((bruto as any).recomendaciones) ? (bruto as any).recomendaciones : null);
  if (!lista) return { recomendaciones: [], descartadas: [], problemas: ['The answer is not a list of recommendations.'] };
  const equipos = new Set(paquete.equipos.map((e) => e.id));
  const grupos = new Map<string, string[]>();
  for (const c of paquete.comparaciones) for (const g of c.grupos) grupos.set(g.id, g.equipos);
  const medidas = new Set<string>([...paquete.definiciones.map((d) => d.id), ...Object.keys(catalogo.medidas)]);
  const vacias = categoriasVacias(paquete);
  const out: RecomendacionIA[] = [], descartadas: { motivo: string; bruto: unknown }[] = [];
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  for (const r of lista as any[]) {
    const fuera = (motivo: string) => descartadas.push({ motivo, bruto: r });
    if (!r || typeof r !== 'object') { fuera('Not an object.'); continue; }
    const titulo = str(r.titulo), accion = str(r.accion), primer = str(r.primer_paso);
    if (!titulo || !accion) { fuera('Missing title or action.'); continue; }
    const d = r.destinatario || {};
    let tipo: 'equipo' | 'grupo' | 'area' = d.tipo, id = str(d.id);
    let eqs: string[] = [];
    if (tipo === 'area' || id === 'area') { tipo = 'area'; id = 'area'; eqs = [...equipos]; }
    else if (tipo === 'grupo' && grupos.has(id)) eqs = grupos.get(id)!;
    else if (equipos.has(id)) { tipo = 'equipo'; eqs = [id]; }
    else { fuera('Unknown recipient: ' + (id || '(empty)')); continue; }
    if (Array.isArray(r.equipos) && r.equipos.length) {
      const malos = r.equipos.filter((e: unknown) => !equipos.has(String(e)));
      if (malos.length) { fuera('Unknown team: ' + malos.join(', ')); continue; }
      if (tipo === 'equipo') eqs = r.equipos.map(String);
    }
    const ev = Array.isArray(r.evidencia) ? r.evidencia : [];
    if (!ev.length) { fuera('No evidence cited.'); continue; }
    const evidencia: EvidenciaIA[] = [];
    let mala: string | null = null;
    for (const e of ev) {
      const med = str(e && e.medida), val = numero(e && e.valor), eq = e && e.equipo != null && e.equipo !== 'area' ? str(e.equipo) : null;
      if (!medidas.has(med) && !/^[a-z_]+$/.test(med)) { mala = 'Unknown measure in evidence: ' + med; break; }
      if (eq && !equipos.has(eq)) { mala = 'Unknown team in evidence: ' + eq; break; }
      if (val == null) { mala = 'Evidence without a number.'; break; }
      if (!coincide(paquete, eq, med, val)) { mala = `Cited value not in the package: ${eq || 'area'} ${med} ${val}`; break; }
      evidencia.push({ equipo: eq, medida: med, valor: val, texto: str(e.texto) });
    }
    if (mala) { fuera(mala); continue; }
    const causa = r.causa || {};
    const caso = str(causa.caso) || null;
    if (caso && !catalogo.casos[caso]) { fuera('Unknown case id: ' + caso); continue; }
    const ctx = str(r.contexto_necesario) as CategoriaContexto;
    const contexto = (CATEGORIAS_CONTEXTO as readonly string[]).includes(ctx) ? ctx : null;
    const textoTodo = [titulo, accion, primer, str(causa.texto), str(r.comprobar)].join(' ');
    const opina = vacias.find((c) => c !== 'otro' && PISTAS[c].test(textoTodo) && contexto !== c);
    if (opina) { fuera(`Opinion on an empty context category (${NOMBRES_CONTEXTO[opina]}).`); continue; }
    const conf = str(r.confianza).toLowerCase();
    const confianza: Confianza = conf === 'high' || conf === 'medium' ? conf : 'low';
    const medida = str(r.medida) && medidas.has(str(r.medida)) ? str(r.medida) : (evidencia[0] ? evidencia[0].medida : null);
    out.push({
      titulo, destinatario: { tipo, id }, equipos: eqs, evidencia, causa: { caso, texto: str(causa.texto) }, accion, primer_paso: primer || accion,
      comprobar: str(r.comprobar), confianza, pregunta: str(r.pregunta), contexto_necesario: contexto, medida,
    });
  }
  // Primero lo que afecta a más equipos; después por confianza
  const peso: Record<Confianza, number> = { high: 0, medium: 1, low: 2 };
  out.sort((a, b) => b.equipos.length - a.equipos.length || peso[a.confianza] - peso[b.confianza]);
  if (out.length > MAX_RECS) { problemas.push(`${out.length} recommendations; only the first ${MAX_RECS} are kept.`); out.length = MAX_RECS; }
  return { recomendaciones: out, descartadas, problemas };
}

// ---------- mapeo de estados ----------
export interface EstadoParaMapear { nombre: string; actuales: number; categoria?: string | null; propuesta: EstadoNormalizado }

const SISTEMA_MAPEO = `You map the workflow states of a delivery tool (Jira, Azure DevOps, ServiceNow, GitLab) to nine common states. You only see state names and how many tasks are in each one. Answer with JSON only.`;

export function peticionMapeoEstados(estados: EstadoParaMapear[], catalogo: Catalogo = CATALOGO): PeticionIA {
  const comunes = Object.entries(catalogo.estados.estados).map(([id, e]) => `- ${id}: ${e.nombre}. ${e.descripcion}`).join('\n');
  const lista = estados.map((e) => `- "${e.nombre}" (${e.actuales} tasks now${e.categoria ? ', category ' + e.categoria : ''}; current proposal: ${e.propuesta})`).join('\n');
  const user = `Common states:\n${comunes}\n\nStates in the tool:\n${lista}\n\nReturn a JSON object: {"<state name>": "<common state id>"} with every state. Keep the current proposal unless the name clearly says otherwise.`;
  return { system: SISTEMA_MAPEO, user, maxTokens: 1500 };
}

export function validarMapeo(texto: string, estados: EstadoParaMapear[], catalogo: Catalogo = CATALOGO): { mapeo: Record<string, EstadoNormalizado>; cambios: number; problemas: string[] } {
  let bruto: any;
  try { bruto = extraerJson(texto); } catch (e) { return { mapeo: {}, cambios: 0, problemas: ['The answer is not valid JSON: ' + (e as Error).message] }; }
  if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) return { mapeo: {}, cambios: 0, problemas: ['The answer is not an object.'] };
  const validos = new Set(Object.keys(catalogo.estados.estados));
  const nombres = new Map(estados.map((e) => [e.nombre, e]));
  const mapeo: Record<string, EstadoNormalizado> = {}, problemas: string[] = [];
  let cambios = 0;
  for (const [nombre, v] of Object.entries(bruto)) {
    const e = nombres.get(nombre);
    if (!e) { problemas.push('Unknown state: ' + nombre); continue; }
    if (!validos.has(String(v))) { problemas.push(`Unknown common state for "${nombre}": ${String(v)}`); continue; }
    mapeo[nombre] = String(v) as EstadoNormalizado;
    if (mapeo[nombre] !== e.propuesta) cambios++;
  }
  return { mapeo, cambios, problemas };
}

// ---------- lectura del impacto de las iniciativas ----------
const SISTEMA_IMPACTO = `You read the evaluation of improvement initiatives for software delivery teams and write a short, plain reading of each one for the team lead, in the language the message asks for. You only see aggregated figures. Every number you write must appear in the evaluation. No dashes as punctuation. Answer with JSON only.`;

export function peticionImpacto(paquete: Paquete, idioma: Idioma = 'en'): PeticionIA {
  const user = `Initiatives and their evaluation (JSON):\n${JSON.stringify(paquete.iniciativas)}\n\nMeasures: ${paquete.definiciones.map((d) => `${d.id} = ${d.nombre} (${d.unidad})`).join('; ')}.\nPercentages are stored as fractions (0.12 = 12%).\n\nFor each initiative return: {"id": string, "veredicto": "works"|"no clear effect"|"getting worse"|"too early", "lectura": string (at most 60 words: what changed, what the other teams did in the same weeks, and what to do next), "cifras": number[] (every number you used, as stored)}.\nReturn a JSON array. Keep "veredicto" in English as listed; write "lectura" following this rule: ${ESCRITURA[idioma]}`;
  return { system: SISTEMA_IMPACTO, user, maxTokens: 2000 };
}

export interface LecturaImpacto { id: string; veredicto: string; lectura: string }

export function validarImpacto(texto: string, paquete: Paquete): { lecturas: LecturaImpacto[]; descartadas: { motivo: string; bruto: unknown }[]; problemas: string[] } {
  let bruto: unknown;
  try { bruto = extraerJson(texto); } catch (e) { return { lecturas: [], descartadas: [], problemas: ['The answer is not valid JSON: ' + (e as Error).message] }; }
  const lista = Array.isArray(bruto) ? bruto : null;
  if (!lista) return { lecturas: [], descartadas: [], problemas: ['The answer is not a list.'] };
  const porId = new Map(paquete.iniciativas.map((i) => [i.id, i]));
  const VEREDICTOS = ['works', 'no clear effect', 'getting worse', 'too early'];
  const lecturas: LecturaImpacto[] = [], descartadas: { motivo: string; bruto: unknown }[] = [];
  for (const r of lista as any[]) {
    const ini = r && porId.get(String(r.id));
    if (!ini) { descartadas.push({ motivo: 'Unknown initiative: ' + (r && r.id), bruto: r }); continue; }
    const lectura = typeof r.lectura === 'string' ? r.lectura.trim() : '';
    if (!lectura) { descartadas.push({ motivo: 'Empty reading.', bruto: r }); continue; }
    // Todas las cifras del texto tienen que estar en la evaluación (tal cual, como porcentaje o redondeadas)
    const valores: number[] = [];
    for (const x of ini.evaluacion.resultados) {
      for (const v of [x.antes, x.despues, x.efecto, x.control?.antes, x.control?.despues]) if (typeof v === 'number') valores.push(v);
      if (x.muestra) for (const v of Object.values(x.muestra)) if (typeof v === 'number') valores.push(v);
    }
    const cifras: number[] = (lectura.match(/\d+(?:[.,]\d+)?/g) || []).map((s: string) => parseFloat(s.replace(',', '.')));
    const sinApoyo = cifras.filter((c: number) => !valores.some((v) => cerca(c, v) || cerca(c, v * 100) || Math.abs(c - Math.round(v * 10) / 10) < 0.051 || Math.abs(c - Math.round(v * 100)) < 0.51 || Math.abs(c - Math.round(v * 1000) / 10) < 0.051));
    if (sinApoyo.length) { descartadas.push({ motivo: 'Numbers not in the evaluation: ' + sinApoyo.join(', '), bruto: r }); continue; }
    const veredicto = VEREDICTOS.includes(String(r.veredicto)) ? String(r.veredicto) : 'too early';
    lecturas.push({ id: ini.id, veredicto, lectura });
  }
  return { lecturas, descartadas, problemas: [] };
}

// ---------- proveedores ----------
export interface ConfigAnthropic { clave: string; modelo?: string; version?: string; url?: string; fetch?: typeof fetch; navegador?: boolean }
export const MODELO_POR_DEFECTO = 'claude-sonnet-5-5';

/** Llama a la API de Claude. En el navegador hace falta la cabecera de acceso directo; la clave nunca se registra ni se guarda aquí. */
export function proveedorAnthropic(cfg: ConfigAnthropic): ProveedorIA {
  const f = cfg.fetch || (globalThis as any).fetch;
  if (!f) throw new Error('fetch is not available.');
  const url = cfg.url || 'https://api.anthropic.com/v1/messages';
  return async (p) => {
    const headers: Record<string, string> = { 'content-type': 'application/json', 'x-api-key': cfg.clave, 'anthropic-version': cfg.version || '2023-06-01' };
    if (cfg.navegador !== false) headers['anthropic-dangerous-direct-browser-access'] = 'true';
    const res = await f(url, { method: 'POST', headers, body: JSON.stringify({ model: cfg.modelo || MODELO_POR_DEFECTO, max_tokens: p.maxTokens, system: p.system, messages: [{ role: 'user', content: p.user }] }) });
    if (!res.ok) {
      let detalle = '';
      try { const j = await res.json(); detalle = j && j.error && j.error.message ? ': ' + j.error.message : ''; } catch { /* sin detalle */ }
      throw new Error(`The AI provider answered ${res.status}${detalle}`);
    }
    const data = await res.json();
    const partes = Array.isArray(data.content) ? data.content : [];
    return partes.filter((x: any) => x && x.type === 'text').map((x: any) => x.text).join('\n');
  };
}

/** Proveedor falso para tests y demos sin red: devuelve lo que se le da, por tipo de petición. */
export function proveedorFalso(respuestas: { recomendaciones?: unknown; mapeo?: unknown; impacto?: unknown; chat?: unknown }): ProveedorIA {
  return async (p) => {
    const cual = p.system === SISTEMA_MAPEO ? respuestas.mapeo : p.system === SISTEMA_IMPACTO ? respuestas.impacto
      : p.system.startsWith('You answer questions') ? respuestas.chat : respuestas.recomendaciones;
    return typeof cual === 'string' ? cual : JSON.stringify(cual ?? []);
  };
}

/** Las recomendaciones del banco de casos, en el formato de la IA: sirven de respuesta de referencia en las evals. */
export function recomendacionesDeReferencia(paquete: Paquete, catalogo: Catalogo = CATALOGO): RecomendacionIA[] {
  const porCaso = new Map<string, { equipos: string[]; evidencia: EvidenciaIA[]; gravedad: string }>();
  for (const c of paquete.casos_activos) {
    const def = catalogo.casos[c.caso];
    if (!def) continue;
    const x = porCaso.get(c.caso) || { equipos: [], evidencia: [], gravedad: 'atencion' };
    const m = def.medida ? (paquete.medidas.equipos as any)[c.equipo]?.[def.medida] : null;
    if (!x.equipos.includes(c.equipo)) x.equipos.push(c.equipo);
    if (m && m.disponible) { const md = catalogo.medidas[def.medida!]; x.evidencia.push({ equipo: c.equipo, medida: def.medida!, valor: m.valor, texto: `${c.equipo}: ${md ? md.nombre.toLowerCase() : def.medida} is ${formatear(m.valor, md ? md.formato : 'num')}${m.rango ? ` (normal ${formatear(m.rango.lo, md ? md.formato : 'num')} to ${formatear(m.rango.hi, md ? md.formato : 'num')})` : ''}` }); }
    if (c.gravedad === 'critico') x.gravedad = 'critico';
    porCaso.set(c.caso, x);
  }
  const out: RecomendacionIA[] = [];
  for (const [id, x] of porCaso) {
    const def = catalogo.casos[id];
    if (!x.evidencia.length) continue;
    out.push({
      titulo: def.titulo, destinatario: x.equipos.length === 1 ? { tipo: 'equipo', id: x.equipos[0] } : { tipo: 'area', id: 'area' }, equipos: x.equipos,
      evidencia: x.evidencia, causa: { caso: id, texto: def.causas[0] || '' }, accion: def.plan[0]?.paso || '', primer_paso: def.plan[0]?.paso || '',
      comprobar: def.comprobar, confianza: x.gravedad === 'critico' ? 'high' : 'medium', pregunta: def.preguntas[0] || '', contexto_necesario: null, medida: def.medida,
    });
  }
  return out.sort((a, b) => b.equipos.length - a.equipos.length).slice(0, MAX_RECS);
}

/** Eval de un paquete: pide recomendaciones, valida, y comprueba que los casos sembrados aparecen. */
export async function evaluarPaquete(proveedor: ProveedorIA, paquete: Paquete, casosEsperados: string[], catalogo: Catalogo = CATALOGO) {
  const texto = await proveedor(peticionRecomendaciones(paquete, catalogo));
  const r = validarRecomendaciones(texto, paquete, catalogo);
  const citados = new Set(r.recomendaciones.map((x) => x.causa.caso).filter(Boolean));
  const encontrados = casosEsperados.filter((c) => citados.has(c));
  return { ...r, esperados: casosEsperados, encontrados, faltan: casosEsperados.filter((c) => !citados.has(c)), bruto: texto };
}

// ---------- asistente de conversación y resumen redactado (v3) ----------
// El asistente responde sobre el paquete de diagnóstico y devuelve, además del texto, las cifras que usa.
// validarChat comprueba cada cifra contra el paquete y cada número del texto contra esas cifras: lo que no cuadra no se enseña.

export type Idioma = 'es' | 'en';
export type RolIA = 'direccion' | 'pmo' | 'equipo';
export interface CifraIA { equipo: string | null; medida: string; valor: number }
export interface RespuestaIA { respuesta: string; cifras: CifraIA[] }
export interface MensajeIA { rol: 'usuario' | 'asistente'; texto: string }
export interface ResultadoChat { ok: boolean; respuesta: RespuestaIA | null; problemas: string[] }

const ESCRITURA: Record<Idioma, string> = {
  en: 'Write in plain English. Short sentences, one idea per sentence. No dashes as punctuation. No emojis.',
  es: 'Escribe en castellano llano de España. Frases cortas, una idea por frase. Sin rayas como puntuación: usa comas, dos puntos o puntos. Escribe "IA", nunca "AI". Sin emojis.',
};
const LECTOR: Record<RolIA, string> = {
  direccion: 'The reader is management: overall state, where there is a real problem with evidence, what to decide. No tool jargon.',
  pmo: 'The reader is the PMO or delivery lead: data reliability, what to fix in how data is captured, which comparisons are valid.',
  equipo: 'The reader is the team itself: its flow against its own normal and what to do this week. No comparison with other teams.',
};

const sistemaChat = (idioma: Idioma) => `You answer questions about the delivery performance of software teams. You receive a diagnostic package with aggregated figures per team and for the whole area, plus data reliability notes. You never see tickets, people or raw data.

Rules:
1. Use only what is in the package. If it does not have the answer, say so and say where on the page to look.
2. Every number you write in "respuesta" must also be in "cifras", with the team (null for the whole area), the measure id and the value exactly as stored in the package. Percentages are stored as fractions (0.25): write them as percentages in the text and as stored in "cifras".
3. Each team is compared only against its own normal range. Never rank teams. Never mention people.
4. If a figure has low reliability, say so before drawing conclusions from it.
5. ${ESCRITURA[idioma]}
6. Answer with JSON only: {"respuesta": string, "cifras": [{"equipo": string|null, "medida": string, "valor": number}]}.`;

/** El paquete recortado a un equipo: sus medidas, sus casos y el área como contexto. */
export function paqueteDeEquipo(p: Paquete, equipo: string): Paquete {
  const x = JSON.parse(JSON.stringify(p)) as any;
  x.equipos = x.equipos.filter((e: any) => e.id === equipo);
  x.medidas.equipos = equipo in x.medidas.equipos ? { [equipo]: x.medidas.equipos[equipo] } : {};
  x.casos_activos = x.casos_activos.filter((c: any) => c.equipo === equipo);
  x.casos_grupo = []; x.comparaciones = [];
  x.iniciativas = x.iniciativas.filter((i: any) => i.equipos.includes(equipo));
  x.agent_readiness.equipos = equipo in x.agent_readiness.equipos ? { [equipo]: x.agent_readiness.equipos[equipo] } : {};
  x.datos.porEquipo = equipo in x.datos.porEquipo ? { [equipo]: x.datos.porEquipo[equipo] } : {};
  return x as Paquete;
}

export interface OpcionesChat {
  idioma: Idioma;
  rol: RolIA;
  /** Pantalla desde la que se pregunta, para dar contexto ("Resumen", "Equipo Pagos"...). */
  pantalla?: string;
  /** Si se pregunta desde la ficha de un equipo, el paquete se recorta a ese equipo. */
  equipo?: string | null;
  historial?: MensajeIA[];
  /** Agregados que no están en el paquete y la pantalla enseña (fiabilidad, data check). Solo cifras y textos cortos. */
  extra?: Record<string, unknown>;
}

function cuerpoChat(paquete: Paquete, o: OpcionesChat, catalogo: Catalogo): string {
  const p = o.equipo ? paqueteDeEquipo(paquete, o.equipo) : paquete;
  const medidas = Object.entries(catalogo.medidas).map(([id, m]) => `- ${id}: ${m.nombre} (${m.unidad})`).join('\n');
  return `Diagnostic package (JSON):\n${JSON.stringify(paqueteParaPrompt(p))}\n\n${o.extra ? `Other figures shown on the page (JSON):\n${JSON.stringify(o.extra)}\n\n` : ''}Measures (id: name):\n${medidas}\n\nTeam ids: ${p.equipos.map((e) => e.id).join(', ')}.\n${LECTOR[o.rol]}${o.pantalla ? `\nThe user is on this screen: ${o.pantalla}.` : ''}`;
}

export function peticionChat(paquete: Paquete, pregunta: string, o: OpcionesChat, catalogo: Catalogo = CATALOGO): PeticionIA {
  const hist = (o.historial || []).slice(-6).map((m) => `${m.rol === 'usuario' ? 'User' : 'Assistant'}: ${m.texto}`).join('\n');
  const user = `${cuerpoChat(paquete, o, catalogo)}\n\n${hist ? `Conversation so far:\n${hist}\n\n` : ''}Question: ${pregunta}\n\nAnswer in at most 150 words.`;
  return { system: sistemaChat(o.idioma), user, maxTokens: 1500 };
}

export function peticionResumen(paquete: Paquete, o: OpcionesChat, catalogo: Catalogo = CATALOGO): PeticionIA {
  const user = `${cuerpoChat(paquete, o, catalogo)}\n\nWrite the summary for this reader in three short blocks separated by a blank line: what is happening, how far the data can be trusted, and what to do first. At most 180 words. Use "- " for list items.`;
  return { system: sistemaChat(o.idioma), user, maxTokens: 1500 };
}

/** Todos los números de un valor cualquiera (incluidos los que van dentro de textos como "92%" o "5 of 6"). */
function numerosDe(x: unknown, out: number[] = []): number[] {
  if (typeof x === 'number' && isFinite(x)) out.push(x);
  else if (typeof x === 'string') (x.match(/\d+(?:[.,]\d+)?/g) || []).forEach((s) => out.push(parseFloat(s.replace(',', '.'))));
  else if (Array.isArray(x)) x.forEach((v) => numerosDe(v, out));
  else if (x && typeof x === 'object') Object.values(x).forEach((v) => numerosDe(v, out));
  return out;
}

/** Quita del texto lo que lleva números pero no son cifras: fechas, nombres de equipo y semanas de las ventanas. */
function sinNumerosNeutros(texto: string, equipos: string[]): string {
  let t = texto;
  equipos.slice().sort((a, b) => b.length - a.length).forEach((e) => { t = t.split(e).join(' '); });
  return t
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, ' ')
    .replace(/\b\d{1,2}[/.]\d{1,2}[/.]\d{2,4}\b/g, ' ')
    .replace(/\b\d{1,2}\s+(de\s+)?(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic|jan|apr|aug|dec)[a-z]*\.?(\s+(de\s+)?\d{4})?/gi, ' ')
    .replace(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(,?\s+\d{4})?/gi, ' ')
    .replace(/\b20[2-3]\d\b/g, ' ');
}

/** Valores donde puede estar una cifra del asistente: la medida de ese equipo (o del área) con su rango y su serie reciente,
 *  los datos de los casos de ese equipo, su agent readiness, las comparaciones de esa medida y las iniciativas que la miden.
 *  Más estricto que la validación de recomendaciones: una cifra tiene que estar donde dice que está. */
function coincideEstricto(p: Paquete, equipo: string | null, medida: string, valor: number): boolean {
  const out: number[] = [];
  const m = equipo ? (p.medidas.equipos as any)[equipo]?.[medida] : (p.medidas.area as any)?.[medida];
  if (m && m.disponible) {
    out.push(m.valor);
    if (m.rango) out.push(m.rango.lo, m.rango.hi, m.rango.mediana);
    if (Array.isArray(m.serie)) out.push(...m.serie.slice(-8));
  }
  for (const c of p.casos_activos) if (c.equipo === equipo) out.push(...Object.values(c.datos).filter((v): v is number => typeof v === 'number'));
  if (medida === 'agent_readiness') { const ar = (p.agent_readiness.equipos as any)[equipo || '']; if (ar) out.push(ar.listos, ar.indiceMedio); }
  for (const c of p.comparaciones) { const cm = (c.medidas as any)[medida]; if (cm) for (const sg of cm.segmentos) for (const x of Object.values(sg.porGrupo) as any[]) if (x.valor != null) out.push(x.valor); }
  for (const i of p.iniciativas) if (!equipo || i.equipos.includes(equipo)) for (const x of i.evaluacion.resultados) if (x.medida === medida) out.push(...[x.antes, x.despues, x.efecto, x.control?.antes, x.control?.despues].filter((v): v is number => typeof v === 'number'));
  return out.filter((v) => v != null && isFinite(v)).some((v) => cerca(valor, v) || cerca(valor, v * 100) || cerca(valor / 100, v));
}

const limpiarRayas = (t: string) => t.replace(/\s*[—–]\s*/g, ', ');

/** Valida una respuesta del asistente o un resumen redactado. Sirve para los dos idiomas. */
export function validarChat(texto: string, paquete: Paquete, o: { equipo?: string | null; extra?: Record<string, unknown> } = {}): ResultadoChat {
  const problemas: string[] = [];
  let bruto: any;
  try { bruto = extraerJson(texto); } catch (e) { return { ok: false, respuesta: null, problemas: ['The answer is not valid JSON: ' + (e as Error).message] }; }
  const respuesta = bruto && typeof bruto.respuesta === 'string' ? limpiarRayas(bruto.respuesta.trim()) : '';
  if (!respuesta) return { ok: false, respuesta: null, problemas: ['Empty answer.'] };
  const p = o.equipo ? paqueteDeEquipo(paquete, o.equipo) : paquete;
  const equipos = new Set(p.equipos.map((e) => e.id));
  const lista = Array.isArray(bruto.cifras) ? bruto.cifras : [];
  const extra = o.extra ? numerosDe(o.extra) : [];
  const cifras: CifraIA[] = [];
  for (const c of lista) {
    const eq = c && c.equipo != null && c.equipo !== 'area' ? String(c.equipo) : null;
    const med = c && typeof c.medida === 'string' ? c.medida.trim() : '';
    const val = numero(c && c.valor);
    if (val == null) { problemas.push('Figure without a number.'); continue; }
    if (eq && !equipos.has(eq)) { problemas.push('Unknown team in a figure: ' + eq); continue; }
    const enPaquete = /^[a-z_]+$/.test(med) && coincideEstricto(p, eq, med, val);
    const enExtra = extra.some((v) => cerca(val, v) || cerca(val * 100, v) || cerca(val, v * 100));
    if (!enPaquete && !enExtra) { problemas.push(`Figure not in the package: ${eq || 'area'} ${med} ${val}`); continue; }
    cifras.push({ equipo: eq, medida: med, valor: val });
  }
  // Cada número del texto tiene que salir de una cifra validada (tal cual, en porcentaje o redondeado),
  // o ser un recuento pequeño de equipos o una de las ventanas de semanas.
  const validos = cifras.map((c) => c.valor).concat(extra);
  const neutros = new Set([4, 8, 12, 16, 26, 52]);
  const nEquipos = paquete.equipos.length;
  const apoyado = (n: number) => validos.some((v) => cerca(n, v) || cerca(n, v * 100) || Math.abs(n - Math.round(v * 10) / 10) < 0.051 || Math.abs(n - Math.round(v)) < 0.51 || Math.abs(n - Math.round(v * 100)) < 0.51 || Math.abs(n - Math.round(v * 1000) / 10) < 0.051)
    || neutros.has(n) || (Number.isInteger(n) && n >= 0 && n <= nEquipos);
  const enTexto = (sinNumerosNeutros(respuesta, [...paquete.equipos.map((e) => e.id)]).match(/\d+(?:[.,]\d+)?/g) || []).map((s) => parseFloat(s.replace(',', '.')));
  const sinApoyo = enTexto.filter((n) => !apoyado(n));
  if (sinApoyo.length) problemas.push('Numbers in the text that are not in the package: ' + [...new Set(sinApoyo)].join(', '));
  const ok = problemas.length === 0;
  return { ok, respuesta: ok ? { respuesta, cifras } : null, problemas };
}
