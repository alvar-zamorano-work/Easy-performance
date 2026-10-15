// Cálculo de medidas por equipo: series semanales, valor actual, rango habitual del propio equipo,
// semáforo, tendencia, trabajo bloqueado, indicadores de comité, calidad del dato y casos activos.

import { DIA, cuantil, desv, inicioSemana, media, spearman, sumarDias } from './util.ts';
import { CATALOGO, type Catalogo } from './catalogo.ts';
import { etapaPropuesta } from './estados.ts';
import { valorEquipo } from './detectar.ts';
import { estadoMedida, rangoDe, tendencia } from './semaforo.ts';
import { analizarSprints } from './sprints.ts';
import { negocio } from './negocio.ts';
import { calidadEquipo, cierresEnBloque } from './calidad.ts';
import { kpisComite } from './kpis.ts';
import { evaluarCasos } from './casos.ts';
import type {
  ConfigCalculo, ContextoCalculo, Derivada, Deteccion, Etapa, InfoSprints, MedidaCalculada, Modelo,
  ResultadoEquipo, Series, Tarea, TareaEnCurso,
} from './tipos.ts';

/** Semanas que abarca el valor actual de cada medida ('P' = ventana larga de proporciones). */
const VENTANA: Record<string, number | 'P'> = { errores: 'P', retrabajo: 'P', arrastradas: 'P', reparto: 'P', regularidad: 8, estimacion: 12 };

export function calcular(tareas: Tarea[], det: Deteccion, cfgEntrada?: ConfigCalculo, catalogo: Catalogo = CATALOGO): Modelo {
  const cfg: ConfigCalculo = cfgEntrada || {};
  const K = cfg.semanasActuales || 4, KP = cfg.semanasProporciones || 8, R = cfg.semanasReferencia || 12;
  const etapas = cfg.etapas || {};
  const etapaDe: Record<string, Etapa> = {}, bloqueoDe: Record<string, boolean> = {};
  det.estados.forEach((e) => { etapaDe[e.nombre] = etapas[e.nombre] || e.etapa; bloqueoDe[e.nombre] = e.bloqueo; });
  const f = det.factorTis || 1;
  const valor = valorEquipo(cfg.campoEquipo || det.equipoRecomendado);
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
    let eq = valor(t) || 'Sin equipo';
    if (incluidos && incluidos.indexOf(eq) < 0) return;
    if (cfg.unirComo) eq = cfg.unirComo; // visión del área: los equipos incluidos, juntos como uno solo
    const etapa = etapaDe[t.estado] || etapaPropuesta(t.estado, t.categoria);
    let curso = 0, espera = 0, entradasCurso = 0, extra = 0, bloqueos = 0;
    const porEstado: Record<string, number> = {};
    t.tis.forEach((x) => {
      const nom = det.nombrePorId[x.id] || ('Estado ' + x.id);
      const et = etapaDe[nom] || 'pendiente';
      const ms = x.v * f;
      if (et === 'curso') { curso += ms; entradasCurso += x.n; }
      if (et === 'espera') { espera += ms; entradasCurso += x.n; porEstado[nom] = (porEstado[nom] || 0) + ms; }
      if (et === 'curso' || et === 'espera') {
        if (bloqueoDe[nom]) bloqueos += x.n; else extra += Math.max(0, x.n - 1);
      }
    });
    const d: Derivada = {
      t, equipo: eq, etapa, cursoMs: curso, esperaMs: espera, porEstado,
      entregada: !!(t.resuelta && !t.descartada && (etapa === 'hecho' || !t.estado)),
      descartada: !!(t.resuelta && t.descartada),
      conTis: t.tis.length > 0,
      retrabajo: false,
      primeraH: null,
    };
    if (d.entregada && d.conTis && entradasCurso === 0) d.salto = true;
    if (d.entregada && (curso + espera) > 0) {
      d.ciclo = (curso + espera) / DIA;
      d.inicio = new Date(t.resuelta!.getTime() - curso - espera);
    } else if (!t.resuelta && (d.etapa === 'curso' || d.etapa === 'espera')) {
      d.inicio = t.cambioCategoria || (t.actualizada ? new Date(t.actualizada.getTime() - curso - espera) : null);
    }
    if (d.entregada) d.total = (t.resuelta!.getTime() - t.creada.getTime()) / DIA;
    d.retrabajo = d.entregada && d.conTis && (extra - bloqueos) > 0;
    d.primeraH = (t.primera && t.primera >= t.creada) ? (t.primera.getTime() - t.creada.getTime()) / 36e5 : null;
    (porEquipo[eq] = porEquipo[eq] || []).push(d);
  });

  const nombresEquipo = Object.keys(porEquipo).sort((a, b) => a.localeCompare(b, 'es'));
  const bloques = cierresEnBloque(tareas);
  const ctx: ContextoCalculo = { semanas, N, finDe, semanaDe, semanaFin, fechaRef, K, KP, R, det, cfg, cierresBloque: bloques };
  const equipos = nombresEquipo.map((nombre) => calcularEquipo(nombre, porEquipo[nombre], ctx, catalogo));
  return { fechaRef, semanas, semanaFin, equipos, cierresBloque: bloques };
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
  };
  const entregadas = items.filter((d) => d.entregada);
  // Conteos semanales
  items.forEach((d) => {
    const t = d.t;
    const wc = c.semanaDe(t.creada);
    if (wc >= 0) s.entradas[wc]++;
    if (t.resuelta) {
      const wr = c.semanaDe(t.resuelta);
      if (wr >= 0) {
        if (d.entregada) { s.entregas[wr]++; if (t.puntos) s.velocidad[wr] += t.puntos; }
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
      if (t.creada >= fin) continue;
      const abierta = !t.resuelta || t.resuelta >= fin;
      if (!abierta) continue;
      if (d.inicio && d.inicio < fin) { if (!d.descartada) wip++; } else { pend++; edades.push((fin.getTime() - t.creada.getTime()) / DIA); }
    }
    s.pendiente[w] = pend;
    s.wip[w] = wip;
    if (edades.length >= 3) s.pendienteEdad[w] = cuantil(edades, 0.5);
  }
  // Ventanas móviles
  const ventana = (w: number, k: number) => {
    const desde = c.semanas[Math.max(0, w - k + 1)], hasta = c.finDe(w);
    return entregadas.filter((d) => d.t.resuelta! >= desde && d.t.resuelta! < hasta);
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
      const conT = vp.filter((d) => d.conTis);
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
    const v12 = ventana(w, 12).filter((d) => d.t.puntos != null && d.ciclo != null && d.ciclo > 0);
    if (v12.length >= 20) s.estimacion[w] = spearman(v12.map((d) => d.t.puntos!), v12.map((d) => d.ciclo!));
    const desde = c.semanas[Math.max(0, w - K + 1)], hasta = c.finDe(w);
    const pr = items.filter((d) => d.primeraH != null && d.t.creada >= desde && d.t.creada < hasta).map((d) => d.primeraH);
    if (pr.length >= 5) s.primera85[w] = cuantil(pr, 0.85);
  }

  // Trabajo bloqueado hoy. "Lo habitual" sale del periodo de referencia (antes de las últimas semanas),
  // no de las semanas que se están evaluando.
  const Lr = N - 1, refDesde = c.semanas[Math.max(0, Lr - K - R + 1)], refHasta = c.semanas[Math.max(0, Lr - K + 1)];
  let deRef = entregadas.filter((d) => d.ciclo != null && d.t.resuelta! >= refDesde && d.t.resuelta! < refHasta);
  if (deRef.length < 5) deRef = entregadas.filter((d) => d.ciclo != null && d.t.resuelta! >= sumarDias(c.semanaFin, -7 * 16));
  const umbralEdad = deRef.length >= 5 ? cuantil(deRef.map((d) => d.ciclo), 0.85) : null;
  const enCurso: TareaEnCurso[] = items.filter((d) => !d.t.resuelta && d.inicio && (d.etapa === 'curso' || d.etapa === 'espera'))
    .map((d) => ({ clave: d.t.clave, resumen: d.t.resumen, estado: d.t.estado, etapa: d.etapa, edad: (c.fechaRef.getTime() - d.inicio!.getTime()) / DIA }))
    .sort((a, b) => b.edad - a.edad);
  const atascadas = umbralEdad == null ? [] : enCurso.filter((x) => x.edad > umbralEdad);

  // Medidas: valor actual, referencia propia, estado y tendencia
  const L = N - 1;
  const series: Record<string, (number | null)[]> = {
    entregas: s.entregasMedia, regularidad: s.regularidad, ciclo: s.ciclo85, total: s.total85, espera: s.espera,
    wip: s.wip, arrastradas: s.arrastradas, errores: s.errores, retrabajo: s.retrabajo, pendiente: s.pendiente,
    estimacion: s.estimacion, velocidad: s.velocidadMedia, primera: s.primera85,
    reparto: s.reparto.map((r) => (r ? r.historia : null)),
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
  const ciclos = entregadas.filter((d) => d.ciclo != null && d.t.resuelta! >= sumarDias(c.semanaFin, -7 * 16))
    .map((d) => ({ clave: d.t.clave, resumen: d.t.resumen, dias: d.ciclo!, fecha: d.t.resuelta!, puntos: d.t.puntos }));
  const info = { ...base, kpis, negocio: neg, calidad, ciclos };
  return { ...info, casos: evaluarCasos(info, items, c) };
}

function disponibilidad(items: Derivada[], sp: InfoSprints, catalogo: Catalogo): Record<string, true | string> {
  const hayTis = items.some((d) => d.conTis);
  const hayInicio = items.some((d) => d.inicio);
  const conPuntos = items.filter((d) => d.t.puntos != null).length;
  const hayErrores = items.some((d) => d.t.tipo === 'error') || items.some((d) => d.t.tipoTxt);
  const hayPrimera = items.some((d) => d.primeraH != null);
  const out: Record<string, true | string> = {};
  Object.keys(catalogo.medidas).forEach((id) => {
    const req = catalogo.medidas[id].requiere;
    if (!req) out[id] = true;
    else if (req === 'tis') out[id] = hayTis ? true : 'El export no trae el campo Tiempo en estado. Exporta con Todos los campos.';
    else if (req === 'inicio') out[id] = hayInicio ? true : 'No se puede saber cuándo empezó cada tarea con este export.';
    else if (req === 'puntos') out[id] = conPuntos >= 20 ? true : 'Hay muy pocas tareas con puntos de historia.';
    else if (req === 'errores') out[id] = hayErrores ? true : 'El export no trae el tipo de tarea.';
    else if (req === 'primera') out[id] = hayPrimera ? true : 'El export no trae la fecha de primera respuesta.';
    else if (req === 'sprints') out[id] = sp.fiables ? true : (sp.motivo as string);
    else if (req === 'api') out[id] = 'Necesita saber qué había al empezar cada sprint: con la API de Jira o con fotos semanales.';
    else out[id] = true;
  });
  return out;
}
