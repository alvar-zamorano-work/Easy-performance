// Cálculo de medidas por equipo: series semanales, valor actual, rango habitual del propio equipo,
// semáforo, tendencia, trabajo bloqueado, indicadores de comité, calidad del dato y casos activos.

import { DIA, cuantil, desv, inicioSemana, media, spearman, sumarDias } from './util.ts';
import { CATALOGO, type Catalogo } from './catalogo.ts';
import { etapaDe, etapasV0AMapeo } from './estados.ts';
import { valorEquipo } from './detectar.ts';
import { estadoMedida, rangoDe, tendencia } from './semaforo.ts';
import { analizarSprints } from './sprints.ts';
import { negocio } from './negocio.ts';
import { calidadEquipo, cierresEnBloque } from './calidad.ts';
import { kpisComite } from './kpis.ts';
import { evaluarCasos } from './casos.ts';
import { evaluarTicket, RUBRICA, type EvaluacionAR } from './agent-readiness.ts';
import type {
  ConfigCalculo, ContextoCalculo, Derivada, Deteccion, InfoSprints, MedidaCalculada, Modelo,
  ResultadoEquipo, Series, TareaEnCurso,
} from './tipos.ts';
import type { EstadoNormalizado, Tarea } from './modelo.ts';

/** Semanas que abarca el valor actual de cada medida ('P' = ventana larga de proporciones). */
const VENTANA: Record<string, number | 'P'> = { errores: 'P', retrabajo: 'P', arrastradas: 'P', reparto: 'P', regularidad: 8, estimacion: 12, agent_readiness: 12 };

export interface Preparacion {
  porEquipo: Record<string, Derivada[]>;
  nombresEquipo: string[];
  ctx: ContextoCalculo;
  mapeo: Record<string, EstadoNormalizado>;
}

export function calcular(tareas: Tarea[], det: Deteccion, cfgEntrada?: ConfigCalculo, catalogo: Catalogo = CATALOGO): Modelo {
  return calcularDesde(preparar(tareas, det, cfgEntrada), catalogo);
}

/** Cálculo a partir de una preparación ya hecha (evita repetirla cuando se usa también para comparar). */
export function calcularDesde(p: Preparacion, catalogo: Catalogo = CATALOGO): Modelo {
  const equipos = p.nombresEquipo.map((nombre) => calcularEquipo(nombre, p.porEquipo[nombre], p.ctx, catalogo));
  return { fechaRef: p.ctx.fechaRef, semanas: p.ctx.semanas, semanaFin: p.ctx.semanaFin, equipos, cierresBloque: p.ctx.cierresBloque };
}

/** Semanas del periodo, mapeo de estados y datos derivados de cada tarea, agrupados por equipo. */
export function preparar(tareas: Tarea[], det: Deteccion, cfgEntrada?: ConfigCalculo): Preparacion {
  const cfg: ConfigCalculo = cfgEntrada || {};
  const K = cfg.semanasActuales || 4, KP = cfg.semanasProporciones || 8, R = cfg.semanasReferencia || 12;
  // Mapeo de estados: el del cliente manda sobre la propuesta. Un cliente.json de la v0 trae etapas.
  const mapeo: Record<string, EstadoNormalizado> = {
    ...det.mapeoEstados,
    ...(cfg.etapas ? etapasV0AMapeo(cfg.etapas, det.mapeoEstados) : {}),
    ...(cfg.mapeoEstados || {}),
  };
  const valor = valorEquipo(cfg.campoEquipo || det.equipoRecomendado, det.camposEquipo);
  const incluidos = cfg.equipos && cfg.equipos.length ? cfg.equipos : null;

  const fechaRef = det.fechaRef;
  let semanaFin = inicioSemana(fechaRef);
  const dia = fechaRef.getDay();
  if (dia === 0 || dia === 6 || (dia === 5 && fechaRef.getHours() >= 12)) semanaFin = sumarDias(semanaFin, 7);
  let primera = inicioSemana(det.fechaMin);
  let N = Math.max(1, Math.round((semanaFin.getTime() - primera.getTime()) / (7 * DIA)));
  if (N > 104) { primera = sumarDias(semanaFin, -7 * 104); N = 104; }
  const semanas: Date[] = [];
  for (let w = 0; w < N; w++) semanas.push(sumarDias(primera, 7 * w));
  const finDe = (w: number) => (w + 1 < N ? semanas[w + 1] : semanaFin);
  const semanaDe = (d: Date | null) => {
    if (!d || d < primera || d >= semanaFin) return -1;
    return Math.min(N - 1, Math.floor((d.getTime() - primera.getTime()) / (7 * DIA)));
  };

  // Derivados por tarea
  const porEquipo: Record<string, Derivada[]> = {};
  tareas.forEach((t) => {
    let eq = valor(t) || 'No team';
    if (incluidos && incluidos.indexOf(eq) < 0) return;
    if (cfg.unirComo) eq = cfg.unirComo; // visión del área: los equipos incluidos, juntos como uno solo
    const f = t.fechas;
    const estado = mapeo[t.estado_origen] || t.estado_normalizado;
    const etapa = etapaDe(estado);
    let curso = 0, espera = 0, entradasCurso = 0, extra = 0, bloqueos = 0, bloqueoMs = 0, vecesHecho = 0;
    const porEstado: Record<string, number> = {};
    t.tiempos_estado.forEach((x) => {
      const est = mapeo[x.estado];
      const et = est ? etapaDe(est) : 'pendiente';
      const ms = x.ms;
      if (et === 'curso') { curso += ms; entradasCurso += x.visitas; }
      if (et === 'espera') { espera += ms; entradasCurso += x.visitas; porEstado[x.estado] = (porEstado[x.estado] || 0) + ms; }
      if (et === 'curso' || et === 'espera') {
        if (est === 'bloqueado') bloqueos += x.visitas; else extra += Math.max(0, x.visitas - 1);
      }
      if (est === 'bloqueado') bloqueoMs += ms;
      if (et === 'hecho') vecesHecho += x.visitas;
    });
    const descartada = !!(f.terminada && (t.descartada || estado === 'descartado'));
    const d: Derivada = {
      t, equipo: eq, estado, etapa, cursoMs: curso, esperaMs: espera, porEstado,
      entregada: !!(f.terminada && !descartada && (etapa === 'hecho' || !t.estado_origen)),
      descartada,
      conTiempos: t.tiempos_estado.length > 0,
      retrabajo: false,
      primeraH: null,
      bloqueoMs,
      reabierta: t.reaperturas != null ? t.reaperturas > 0 : vecesHecho > 1,
      ar: null as unknown as EvaluacionAR,
    };
    if (d.entregada && d.conTiempos && entradasCurso === 0) d.salto = true;
    if (d.entregada && (curso + espera) > 0) {
      d.ciclo = (curso + espera) / DIA;
      d.inicio = f.empezada || new Date(f.terminada!.getTime() - curso - espera);
    } else if (!f.terminada && (d.etapa === 'curso' || d.etapa === 'espera')) {
      d.inicio = f.empezada || f.cambio_estado || (f.actualizada ? new Date(f.actualizada.getTime() - curso - espera) : null);
    }
    if (d.entregada) d.total = (f.terminada!.getTime() - f.creada.getTime()) / DIA;
    d.retrabajo = d.entregada && d.conTiempos && (t.reaperturas != null ? t.reaperturas > 0 : (extra - bloqueos) > 0);
    d.primeraH = (f.primera_respuesta && f.primera_respuesta >= f.creada) ? (f.primera_respuesta.getTime() - f.creada.getTime()) / 36e5 : null;
    d.ar = evaluarTicket(t, estado, d.ciclo);
    (porEquipo[eq] = porEquipo[eq] || []).push(d);
  });

  const nombresEquipo = Object.keys(porEquipo).sort((a, b) => a.localeCompare(b, 'es'));
  const bloques = cierresEnBloque(tareas);
  const ctx: ContextoCalculo = { semanas, N, finDe, semanaDe, semanaFin, fechaRef, K, KP, R, det, cfg, cierresBloque: bloques };
  return { porEquipo, nombresEquipo, ctx, mapeo };
}

function calcularEquipo(nombre: string, items: Derivada[], c: ContextoCalculo, catalogo: Catalogo): ResultadoEquipo {
  const N = c.N, K = c.K, R = c.R, det = c.det, cfg = c.cfg;
  const vacia = () => new Array<number>(N).fill(0);
  const nula = <T = number>() => new Array<T | null>(N).fill(null);
  const s: Series = {
    entregas: vacia(), entradas: vacia(), salidas: vacia(), pendiente: vacia(), wip: vacia(), velocidad: vacia(),
    pendienteEdad: nula(), // antigüedad típica (mediana, días) de lo que espera sin empezar
    entregasMedia: nula(), ciclo85: nula(), ciclo50: nula(), total85: nula(), espera: nula(), errores: nula(), retrabajo: nula(),
    arrastradas: nula(), regularidad: nula(), estimacion: nula(), primera85: nula(), velocidadMedia: nula(),
    reparto: nula<Record<string, number>>(),
    agentReady: nula(),
  };
  const entregadas = items.filter((d) => d.entregada);
  // Conteos semanales
  items.forEach((d) => {
    const t = d.t;
    const wc = c.semanaDe(t.fechas.creada);
    if (wc >= 0) s.entradas[wc]++;
    if (t.fechas.terminada) {
      const wr = c.semanaDe(t.fechas.terminada);
      if (wr >= 0) {
        if (d.entregada) { s.entregas[wr]++; if (t.estimacion) s.velocidad[wr] += t.estimacion; }
        if (d.entregada || d.descartada) s.salidas[wr]++;
      }
    }
  });
  for (let w = 0; w < N; w++) {
    const fin = c.finDe(w);
    let pend = 0, wip = 0;
    const edades: number[] = [];
    for (let i = 0; i < items.length; i++) {
      const d = items[i], t = d.t;
      if (t.fechas.creada >= fin) continue;
      const abierta = !t.fechas.terminada || t.fechas.terminada >= fin;
      if (!abierta) continue;
      if (d.inicio && d.inicio < fin) { if (!d.descartada) wip++; } else { pend++; edades.push((fin.getTime() - t.fechas.creada.getTime()) / DIA); }
    }
    s.pendiente[w] = pend;
    s.wip[w] = wip;
    if (edades.length >= 3) s.pendienteEdad[w] = cuantil(edades, 0.5);
  }
  // Ventanas móviles
  const ventana = (w: number, k: number) => {
    const desde = c.semanas[Math.max(0, w - k + 1)], hasta = c.finDe(w);
    return entregadas.filter((d) => d.t.fechas.terminada! >= desde && d.t.fechas.terminada! < hasta);
  };
  const KP = c.KP;
  const sprintsInfo = analizarSprints(items, c);
  for (let w = 0; w < N; w++) {
    if (w >= K - 1) {
      s.entregasMedia[w] = media(s.entregas.slice(w - K + 1, w + 1));
      s.velocidadMedia[w] = media(s.velocidad.slice(w - K + 1, w + 1));
    }
    const v = ventana(w, K);
    const conCiclo = v.filter((d) => d.ciclo != null);
    if (conCiclo.length >= 5) {
      const cs = conCiclo.map((d) => d.ciclo!);
      s.ciclo85[w] = cuantil(cs, 0.85);
      s.ciclo50[w] = cuantil(cs, 0.5);
      let se = 0, st = 0;
      conCiclo.forEach((d) => { se += d.esperaMs; st += d.cursoMs + d.esperaMs; });
      s.espera[w] = st ? se / st : null;
    }
    if (v.length >= 5) s.total85[w] = cuantil(v.map((d) => d.total), 0.85);
    const vp = ventana(w, KP);
    if (w >= KP - 1 && vp.length >= 8) {
      s.errores[w] = vp.filter((d) => d.t.tipo === 'error').length / vp.length;
      const conT = vp.filter((d) => d.conTiempos);
      if (conT.length >= 8) s.retrabajo[w] = conT.filter((d) => d.retrabajo).length / conT.length;
      if (sprintsInfo.fiables) s.arrastradas[w] = vp.filter((d) => d.t.sprints.length > 1).length / vp.length;
      const rep: Record<string, number> = { historia: 0, error: 0, tarea: 0, otro: 0 };
      vp.forEach((d) => { rep[d.t.tipo] = (rep[d.t.tipo] || 0) + 1; });
      Object.keys(rep).forEach((k) => { rep[k] = rep[k] / vp.length; });
      s.reparto[w] = rep;
    }
    if (w >= 7) {
      const sem = s.entregas.slice(w - 7, w + 1), m = media(sem)!;
      s.regularidad[w] = m >= 1 ? desv(sem)! / m : null;
    }
    const v12 = ventana(w, 12).filter((d) => d.t.estimacion != null && d.ciclo != null && d.ciclo > 0);
    if (v12.length >= 20) s.estimacion[w] = spearman(v12.map((d) => d.t.estimacion!), v12.map((d) => d.ciclo!));
    const desde = c.semanas[Math.max(0, w - K + 1)], hasta = c.finDe(w);
    const pr = items.filter((d) => d.primeraH != null && d.t.fechas.creada >= desde && d.t.fechas.creada < hasta).map((d) => d.primeraH);
    if (pr.length >= 5) s.primera85[w] = cuantil(pr, 0.85);
    const desde12 = c.semanas[Math.max(0, w - 11)];
    const creadas = items.filter((d) => !d.descartada && d.t.fechas.creada >= desde12 && d.t.fechas.creada < hasta);
    if (w >= 11 && creadas.length >= 10) s.agentReady[w] = creadas.filter((d) => d.ar.indice >= RUBRICA.listoDesde).length / creadas.length;
  }

  // Trabajo bloqueado hoy. "Lo habitual" sale del periodo de referencia (antes de las últimas semanas),
  // no de las semanas que se están evaluando.
  const Lr = N - 1, refDesde = c.semanas[Math.max(0, Lr - K - R + 1)], refHasta = c.semanas[Math.max(0, Lr - K + 1)];
  let deRef = entregadas.filter((d) => d.ciclo != null && d.t.fechas.terminada! >= refDesde && d.t.fechas.terminada! < refHasta);
  if (deRef.length < 5) deRef = entregadas.filter((d) => d.ciclo != null && d.t.fechas.terminada! >= sumarDias(c.semanaFin, -7 * 16));
  const umbralEdad = deRef.length >= 5 ? cuantil(deRef.map((d) => d.ciclo), 0.85) : null;
  const enCurso: TareaEnCurso[] = items.filter((d) => !d.t.fechas.terminada && d.inicio && (d.etapa === 'curso' || d.etapa === 'espera'))
    .map((d) => ({ clave: d.t.clave_origen, resumen: d.t.titulo, estado: d.t.estado_origen, etapa: d.etapa, edad: (c.fechaRef.getTime() - d.inicio!.getTime()) / DIA }))
    .sort((a, b) => b.edad - a.edad);
  const atascadas = umbralEdad == null ? [] : enCurso.filter((x) => x.edad > umbralEdad);

  // Medidas: valor actual, referencia propia, estado y tendencia
  const L = N - 1;
  const series: Record<string, (number | null)[]> = {
    entregas: s.entregasMedia, regularidad: s.regularidad, ciclo: s.ciclo85, total: s.total85, espera: s.espera,
    wip: s.wip, arrastradas: s.arrastradas, errores: s.errores, retrabajo: s.retrabajo, pendiente: s.pendiente,
    estimacion: s.estimacion, velocidad: s.velocidadMedia, primera: s.primera85,
    reparto: s.reparto.map((r) => (r ? r.historia : null)),
    agent_readiness: s.agentReady,
  };
  const disponibles = disponibilidad(items, sprintsInfo, catalogo);
  const medidas: Record<string, MedidaCalculada> = {};
  Object.keys(catalogo.medidas).forEach((id) => {
    const def = catalogo.medidas[id];
    const m: MedidaCalculada = { id, disponible: disponibles[id] === true, motivo: disponibles[id] === true ? null : (disponibles[id] as string) };
    if (!m.disponible) { medidas[id] = m; return; }
    if (id === 'edad') {
      m.valor = umbralEdad == null ? null : atascadas.length;
      m.serie = null;
    } else {
      m.serie = series[id];
      m.valor = m.serie ? m.serie[L] : null;
      const vent = VENTANA[id];
      const win = vent === 'P' ? c.KP : (vent || K);
      m.ventana = win;
      const refVals = (m.serie || []).slice(Math.max(0, L - win - R + 1), Math.max(0, L - win + 1)).filter((x): x is number => x != null);
      const ref = rangoDe(refVals);
      if (ref) m.ref = ref;
      const previo = m.serie && L - win >= 0 ? m.serie[L - win] : null;
      m.tendencia = tendencia(m.valor, previo, def.dir);
    }
    const lim = (cfg.limites && cfg.limites[nombre] && cfg.limites[nombre][id]) || null;
    const est = estadoMedida(id, m.valor, m.ref, lim, def);
    m.estado = est.estado;
    m.estadoTexto = est.texto;
    medidas[id] = m;
  });

  const base = {
    nombre, n: items.length, entregadas: entregadas.length, series: s, medidas, atascadas, enCurso,
    umbralEdad, sprints: sprintsInfo,
    semanasConDatos: s.entregas.filter((x, i) => x > 0 || s.entradas[i] > 0).length,
  };
  const kpis = kpisComite(base, c, nombre);
  const neg = negocio(items, c);
  const calidad = calidadEquipo(items, c, sprintsInfo, det);
  const ciclos = entregadas.filter((d) => d.ciclo != null && d.t.fechas.terminada! >= sumarDias(c.semanaFin, -7 * 16))
    .map((d) => ({ clave: d.t.clave_origen, resumen: d.t.titulo, dias: d.ciclo!, fecha: d.t.fechas.terminada!, puntos: d.t.estimacion }));
  const info = { ...base, kpis, negocio: neg, calidad, ciclos };
  return { ...info, casos: evaluarCasos(info, items, c) };
}

function disponibilidad(items: Derivada[], sp: InfoSprints, catalogo: Catalogo): Record<string, true | string> {
  const hayTiempos = items.some((d) => d.conTiempos);
  const hayInicio = items.some((d) => d.inicio);
  const conPuntos = items.filter((d) => d.t.estimacion != null).length;
  const hayErrores = items.some((d) => d.t.tipo === 'error') || items.some((d) => d.t.tipo_origen);
  const hayPrimera = items.some((d) => d.primeraH != null);
  const hayDescripciones = items.some((d) => d.t.descripcion);
  const out: Record<string, true | string> = {};
  Object.keys(catalogo.medidas).forEach((id) => {
    const req = catalogo.medidas[id].requiere;
    if (!req) out[id] = true;
    else if (req === 'tiempos') out[id] = hayTiempos ? true : 'The export has no time in each status (in Jira, the Time in Status field). Export with All fields.';
    else if (req === 'inicio') out[id] = hayInicio ? true : 'This export does not say when each task started.';
    else if (req === 'puntos') out[id] = conPuntos >= 20 ? true : 'Very few tasks have story points.';
    else if (req === 'errores') out[id] = hayErrores ? true : 'The export has no task type.';
    else if (req === 'primera') out[id] = hayPrimera ? true : 'The export has no date of first response.';
    else if (req === 'sprints') out[id] = sp.fiables ? true : (sp.motivo as string);
    else if (req === 'descripcion') out[id] = hayDescripciones ? true : 'The export has no task descriptions.';
    else if (req === 'api') out[id] = 'It needs to know what was in each sprint at the start: with the Jira API or weekly snapshots.';
    else out[id] = true;
  });
  return out;
}
