// Paquete de diagnóstico (plan, apartado 10): lo único que pasa a la IA. Solo agregados.
// Nunca lleva títulos, descripciones, claves de ticket, nombres de personas ni comentarios;
// comprobarPaquete lo verifica antes de exportar.

import { Tx } from './idioma.ts';
import { CATALOGO, type Catalogo } from './catalogo.ts';
import { RUBRICA, agregar, CRITERIOS_AR, type AgregadoAR } from './agent-readiness.ts';
import type { ClienteV2 } from './cliente.ts';
import type { Comparacion } from './grupos.ts';
import type { CasoEquipoNuevo, CasoGrupo } from './casos-grupo.ts';
import type { EvaluacionIniciativa } from './iniciativas.ts';
import type { Preparacion } from './calcular.ts';
import type { Deteccion, MedidaCalculada, Modelo, ResultadoEquipo } from './tipos.ts';
import type { CategoriaContexto, Contexto, Iniciativa, Lectura } from './modelo.ts';

export const VERSION_PAQUETE = 1;
const SEMANAS_SERIE = 26;
const CATEGORIAS: CategoriaContexto[] = ['metodo', 'organizacion', 'stack', 'contratos', 'otro'];

export interface EntradaPaquete {
  cliente: ClienteV2;
  lectura: Lectura;
  det: Deteccion;
  preparacion: Preparacion;
  modelo: Modelo;
  /** El área entera como un solo equipo (calcular con unirComo). */
  area: Modelo | null;
  comparaciones: Comparacion[];
  casosGrupo: CasoGrupo[];
  casosAgentReady: CasoEquipoNuevo[];
  iniciativas: { iniciativa: Iniciativa; evaluacion: EvaluacionIniciativa }[];
  contexto: Contexto | null;
  /** Alias para no mostrar el nombre real de los equipos. Por defecto, el nombre. */
  alias?: Record<string, string>;
  generado: Date;
  catalogo?: Catalogo;
}

const dia = (d: Date | null | undefined) => (d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : null);
const redondear = (x: number | null | undefined, dec = 4) => (x == null || !isFinite(x) ? null : Math.round(x * 10 ** dec) / 10 ** dec);

function medidaPaquete(m: MedidaCalculada) {
  if (!m.disponible) return { disponible: false, motivo: m.motivo ?? null };
  return {
    disponible: true,
    valor: redondear(m.valor),
    rango: m.ref ? { lo: redondear(m.ref.lo), hi: redondear(m.ref.hi), mediana: redondear(m.ref.med) } : null,
    estado: m.estado ?? null,
    tendencia: m.tendencia ? m.tendencia.sentido : null,
    serie: m.serie ? m.serie.slice(-SEMANAS_SERIE).map((x) => redondear(x)) : null,
  };
}
const medidasEquipo = (e: ResultadoEquipo) => Object.fromEntries(Object.entries(e.medidas).map(([id, m]) => [id, medidaPaquete(m)]));
const soloNumeros = (datos: Record<string, unknown>) => Object.fromEntries(Object.entries(datos).filter(([, v]) => typeof v === 'number').map(([k, v]) => [k, redondear(v as number)]));

export function generarPaquete(e: EntradaPaquete) {
  const cat = e.catalogo || CATALOGO;
  const equiposCliente = e.cliente.equipos.lista;
  const activas = new Set(e.cliente.medidas.length ? e.cliente.medidas : Object.keys(cat.medidas));
  const usaSprints = e.det.haySprints && !e.det.sprintsComoFecha;
  const fte = (nombre: string) => {
    const eq = equiposCliente.find((x) => x.nombre === nombre);
    const u = eq ? eq.fte.slice().sort((a, b) => a.periodo.localeCompare(b.periodo)).pop() : null;
    return u ? { valor: u.valor, origen: u.origen, periodo: u.periodo } : null;
  };
  const arPorEquipo: Record<string, AgregadoAR> = {};
  const desde = e.comparaciones[0]?.desde, hasta = e.preparacion.ctx.semanaFin;
  for (const [nombre, items] of Object.entries(e.preparacion.porEquipo)) {
    const creadas = items.filter((d) => !d.descartada && (!desde || d.t.fechas.creada >= desde) && d.t.fechas.creada < hasta);
    arPorEquipo[nombre] = agregar(creadas.map((d) => d.ar), RUBRICA);
  }
  const ficheros = e.lectura.informe.ficheros.map((f) => f.nombre);
  const sinFicheros = (t: string) => ficheros.reduce((s, f) => s.split(f).join('A file'), t);
  const contexto = Object.fromEntries(CATEGORIAS.map((c) => {
    const docs = (e.contexto?.documentos || []).filter((d) => d.categoria === c);
    return [c, { vacia: docs.length === 0, documentos: docs.map((d) => ({ documento: d.titulo, sintesis: d.resumen, fecha: d.fecha })) }];
  }));

  const paquete = {
    version: VERSION_PAQUETE,
    generado: dia(e.generado),
    cliente: {
      sector: e.cliente.sector,
      plataforma: e.cliente.plataforma,
      periodo: { desde: dia(e.det.fechaMin), hasta: dia(e.det.fechaRef) },
      usa_sprints: usaSprints,
      objetivos: e.cliente.objetivos,
    },
    equipos: e.modelo.equipos.map((x) => {
      const eq = equiposCliente.find((c) => c.nombre === x.nombre);
      return { id: x.nombre, tipo: eq?.tipo ?? null, proveedor: eq?.proveedor ?? null, area: eq?.area ?? null, fte: fte(x.nombre) };
    }),
    medidas: {
      equipos: Object.fromEntries(e.modelo.equipos.map((x) => [x.nombre, medidasEquipo(x)])),
      area: e.area && e.area.equipos[0] ? medidasEquipo(e.area.equipos[0]) : null,
    },
    casos_activos: [
      ...e.modelo.equipos.flatMap((x) => x.casos.map((c) => ({ equipo: x.nombre, caso: c.id, gravedad: c.gravedad, confianza: c.confianza, senal: cat.casos[c.id]?.senal ?? null, datos: soloNumeros(c.datos) }))),
      ...e.casosAgentReady.map((c) => ({ equipo: c.equipo, caso: c.id, gravedad: c.gravedad, confianza: 'alta' as const, senal: cat.casos[c.id]?.senal ?? null, datos: soloNumeros(c.datos) })),
    ],
    casos_grupo: e.casosGrupo.map((c) => ({ caso: c.id, dimension: c.dimension, ambito: c.ambito, grupo: c.grupo, gravedad: c.gravedad, evidencia: c.evidencia, datos: soloNumeros(c.datos) })),
    comparaciones: e.comparaciones.map((c) => ({
      dimension: c.dimension, ambito: c.ambito, desde: dia(c.desde), hasta: dia(c.hasta),
      grupos: c.grupos.map((g) => ({ id: g.id, nombre: g.nombre, equipos: g.equipos })),
      medidas: Object.fromEntries(Object.entries(c.medidas).map(([m, v]) => [m, {
        disponible: v.disponible,
        segmentos: v.segmentos.map((s) => ({ tipo: s.tipo, tamano: s.tamano, porGrupo: Object.fromEntries(Object.entries(s.porGrupo).map(([g, x]) => [g, { n: x.n, valor: redondear(x.valor) }])) })),
      }])),
      porGrupo: Object.fromEntries(Object.entries(c.porGrupo).map(([g, x]) => [g, {
        terminadas: x.terminadas, antiguedadPendiente: redondear(x.antiguedadPendiente), throughputFte: redondear(x.throughputFte),
        fte: x.fte, agentReady: { tickets: x.agentReady.tickets, listos: redondear(x.agentReady.listos), indiceMedio: redondear(x.agentReady.indiceMedio) },
      }])),
      reparto: Object.fromEntries(Object.entries(c.reparto).map(([g, r]) => [g, {
        porTipo: Object.fromEntries(Object.entries(r.porTipo).map(([k, v]) => [k, redondear(v)])),
        porTamano: Object.fromEntries(Object.entries(r.porTamano).map(([k, v]) => [k, redondear(v)])),
      }])),
      diferencias: c.diferencias.map((d) => ({ ...d, valorPeor: redondear(d.valorPeor), valorResto: redondear(d.valorResto) })),
      aviso: cat.textos['comparacion.aviso'] ?? null,
    })),
    iniciativas: e.iniciativas.map(({ iniciativa: i, evaluacion: ev }) => ({
      id: i.id, nombre: i.nombre, equipos: i.equipos, fecha_inicio: i.fecha_inicio, fecha_fin: i.fecha_fin, estado: i.estado, origen: i.origen,
      medidas_objetivo: i.medidas_objetivo, efecto_esperado: i.efecto_esperado,
      evaluacion: {
        fecha: dia(ev.fechaEvaluacion),
        aviso: cat.textos['iniciativa.aviso'] ?? null,
        resultados: ev.resultados.map((r) => ({
          medida: r.medida, direccion: r.direccion, disponible: r.disponible, motivo: r.motivo ?? null,
          antes: redondear(r.antes), despues: redondear(r.despues),
          control: r.control ? { antes: redondear(r.control.antes), despues: redondear(r.control.despues) } : null,
          efecto: redondear(r.efecto), confianza: r.confianza ?? null, enDireccionEsperada: r.enDireccionEsperada ?? null,
          muestra: r.muestra ?? null,
          ventanas: r.ventanas ? { antes: [dia(r.ventanas.antes.desde), dia(r.ventanas.antes.hasta)], despues: [dia(r.ventanas.despues.desde), dia(r.ventanas.despues.hasta)], completa: r.ventanas.completa } : null,
        })),
      },
    })),
    agent_readiness: {
      listoDesde: RUBRICA.listoDesde,
      criterios: Object.fromEntries(CRITERIOS_AR.map((k) => [k, RUBRICA.criterios[k].nombre])),
      equipos: Object.fromEntries(Object.entries(arPorEquipo).map(([n, a]) => [n, {
        tickets: a.tickets, indiceMedio: redondear(a.indiceMedio), listos: redondear(a.listos),
        porCriterio: Object.fromEntries(Object.entries(a.porCriterio).map(([k, v]) => [k, redondear(v)])),
      }])),
    },
    datos: {
      tareas: e.lectura.informe.tareas,
      ficheros: ficheros.length,
      avisos: [...e.lectura.informe.avisos, ...e.det.avisos].map((a) => ({ tipo: a.tipo, texto: sinFicheros(a.texto) })),
      porEquipo: Object.fromEntries(e.modelo.equipos.map((x) => [x.nombre, x.calidad.avisos])),
    },
    contexto,
    definiciones: Object.entries(cat.medidas).filter(([id]) => activas.has(id)).map(([id, m]) => ({ id, nombre: m.nombre, como: m.como, unidad: m.unidad })),
  };
  return e.alias && Object.keys(e.alias).length ? anonimizar(paquete, e.alias) : paquete;
}

export type Paquete = ReturnType<typeof generarPaquete>;

/** Cambia los nombres de equipo por su alias en claves y textos. */
export function anonimizar<T>(x: T, alias: Record<string, string>): T {
  const nombres = Object.keys(alias).sort((a, b) => b.length - a.length);
  const cambiar = (s: string) => nombres.reduce((t, n) => t.split(n).join(alias[n]), s);
  const recorrer = (v: unknown): unknown => {
    if (typeof v === 'string') return cambiar(v);
    if (Array.isArray(v)) return v.map(recorrer);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, w]) => [cambiar(k), recorrer(w)]));
    return v;
  };
  return recorrer(x) as T;
}

const CAMPOS_PROHIBIDOS = /^(titulo|title|descripcion|description|resumen|summary|clave|clave_origen|key|issue_key|asignado|assignee|reporter|informador|creador|creator|comentarios?|comments?|personas?|watchers|padre_titulo|parent_summary)$/i;
const CLAVE_TICKET = /\b[A-Z][A-Z0-9]{1,9}-\d+\b/;
const TEXTO_LARGO = 600;
const SECCIONES = ['version', 'generado', 'cliente', 'equipos', 'medidas', 'casos_activos', 'casos_grupo', 'comparaciones', 'iniciativas', 'agent_readiness', 'datos', 'contexto', 'definiciones'];

/** Problemas que impiden exportar el paquete. Lista vacía = se puede exportar. */
export function comprobarPaquete(p: unknown, opciones: { nombresProhibidos?: string[] } = {}): string[] {
  const problemas: string[] = [];
  if (!p || typeof p !== 'object' || Array.isArray(p)) return [Tx('The package is not an object.', 'El paquete no es un objeto.')];
  const claves = Object.keys(p);
  SECCIONES.forEach((s) => { if (!claves.includes(s)) problemas.push(Tx(`Missing section "${s}".`, `Falta la sección "${s}".`)); });
  claves.forEach((k) => { if (!SECCIONES.includes(k)) problemas.push(Tx(`Unexpected section: "${k}".`, `Sección no prevista: "${k}".`)); });
  const prohibidos = (opciones.nombresProhibidos || []).filter(Boolean);
  const recorrer = (v: unknown, ruta: string) => {
    if (typeof v === 'string') {
      if (CLAVE_TICKET.test(v)) problemas.push(Tx(`${ruta}: looks like a ticket key ("${v.match(CLAVE_TICKET)![0]}").`, `${ruta}: parece una clave de ticket ("${v.match(CLAVE_TICKET)![0]}").`));
      if (v.length > TEXTO_LARGO && !ruta.startsWith('contexto.')) problemas.push(Tx(`${ruta}: text too long; it may be a ticket description.`, `${ruta}: texto demasiado largo; puede ser una descripción de ticket.`));
      for (const n of prohibidos) if (v.includes(n)) problemas.push(Tx(`${ruta}: contains a name that must not be shared ("${n}").`, `${ruta}: contiene un nombre que no puede salir ("${n}").`));
      return;
    }
    if (Array.isArray(v)) { v.forEach((w, i) => recorrer(w, `${ruta}[${i}]`)); return; }
    if (v && typeof v === 'object') {
      for (const [k, w] of Object.entries(v)) {
        if (CAMPOS_PROHIBIDOS.test(k)) problemas.push(Tx(`${ruta ? ruta + '.' : ''}${k}: field that can never go in the package.`, `${ruta ? ruta + '.' : ''}${k}: campo que nunca puede ir en el paquete.`));
        if (CLAVE_TICKET.test(k)) problemas.push(Tx(`${ruta ? ruta + '.' : ''}${k}: looks like a ticket key.`, `${ruta ? ruta + '.' : ''}${k}: parece una clave de ticket.`));
        recorrer(w, ruta ? `${ruta}.${k}` : k);
      }
    }
  };
  recorrer(p, '');
  return problemas;
}
