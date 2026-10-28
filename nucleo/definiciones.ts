// Documento de definiciones (plan, apartado 12, semana 1): de dónde salen los datos, qué es cada equipo,
// qué significa cada estado, cómo se calcula cada medida y qué calidad tienen los datos.
// Se genera desde la configuración del arranque y es lo que firman el cliente y Capgemini.

import { CATALOGO, type Catalogo } from './catalogo.ts';
import { detectar } from './detectar.ts';
import { calcular } from './calcular.ts';
import { configDesdeCliente, type ClienteV2 } from './cliente.ts';
import { etapaDe } from './estados.ts';
import { fechaCorta, formatear } from './formato.ts';
import { RUBRICA } from './agent-readiness.ts';
import { DIFERENCIA_MINIMA, MUESTRA_MINIMA, SEMANAS_COMPARACION } from './grupos.ts';
import { LATENCIA_DIAS } from './iniciativas.ts';
import type { Bloque, Documento, Texto } from './documento.ts';
import type { ConfigCalculo, Deteccion, Modelo } from './tipos.ts';
import type { EstadoNormalizado, Etapa, Lectura } from './modelo.ts';

export interface OpcionesDefiniciones {
  /** Configuración del cálculo; por defecto, la que sale de cliente.json. */
  config?: ConfigCalculo;
  det?: Deteccion;
  modelo?: Modelo;
  generado?: Date;
  catalogo?: Catalogo;
}

const NOMBRE_ETAPA: Record<Etapa, string> = { pendiente: 'Backlog', curso: 'In progress', espera: 'Waiting', hecho: 'Done' };
const ORDEN_ESTADOS: EstadoNormalizado[] = ['nuevo', 'pendiente', 'en_curso', 'bloqueado', 'en_revision', 'en_pruebas', 'en_espera', 'terminado', 'descartado'];
const NOMBRE_ORIGEN: Record<string, string> = { contrato: 'contract', declarado: 'declared by the team', estimado: 'estimated' };
const REQUISITO: Record<string, string> = {
  tiempos: 'the time in each status', inicio: 'the date work starts', puntos: 'the estimate in points', errores: 'the Bug task type',
  primera: 'the date of first response', sprints: 'the sprints', api: 'a direct connection to the platform', descripcion: 'the ticket descriptions',
};
const SIN_CLIENTE = 'the client';

const plataformaTexto = (p: string) => (p === 'jira' ? 'Jira' : p.charAt(0).toUpperCase() + p.slice(1));
const n = (x: number) => x.toLocaleString('en-GB');
const mayuscula = (s: string) => s.replace(/^./, (c) => c.toUpperCase());

export function definiciones(lectura: Lectura, cliente: ClienteV2, opciones: OpcionesDefiniciones = {}): Documento {
  const cat = opciones.catalogo || CATALOGO;
  const det = opciones.det || detectar(lectura);
  const cfg = opciones.config || configDesdeCliente(cliente);
  const modelo = opciones.modelo || calcular(lectura.tareas, det, cfg, cat);
  const generado = opciones.generado || new Date();
  const inf = lectura.informe;
  const plataforma = plataformaTexto(lectura.plataforma);
  const nombreCliente = (cliente.nombre || '').trim() || SIN_CLIENTE;
  const mapeo: Record<string, EstadoNormalizado> = { ...det.mapeoEstados, ...(cliente.mapeoEstados || {}), ...(cfg.mapeoEstados || {}) };
  const b: Bloque[] = [];
  const h1 = (t: string) => b.push({ tipo: 'h1', texto: t });
  const h2 = (t: string) => b.push({ tipo: 'h2', texto: t });
  const p = (t: Texto, nota = false) => b.push({ tipo: 'p', texto: t, nota });
  const lista = (items: Texto[]) => { if (items.length) b.push({ tipo: 'lista', items }); };
  const tabla = (cabecera: string[], filas: string[][], anchos: number[]) => b.push({ tipo: 'tabla', cabecera, filas, anchos });

  p('This document sets how the performance of the teams of ' + nombreCliente + ' is measured. It records where the data comes from, what each team is, what each status means and how each measure is calculated.');
  p('Once both parties sign it, these rules apply to the dashboard, the comparisons and the evaluation of initiatives. If a rule changes, it changes here first.');

  // 1. Objetivos
  const objetivos = cat.objetivos.filter((o) => o.fijo || cliente.objetivos.includes(o.id));
  if (objetivos.length) {
    h1('1. What we want to achieve');
    lista(objetivos.map((o) => [{ b: o.titulo + '.' }, ' ' + o.frase]));
  }

  // 2. Datos
  h1('2. Where the data comes from');
  const desde = det.fechaMin, hasta = new Date(Math.min(det.fechaRef.getTime(), det.fechaMax.getTime()));
  lista([
    [{ b: 'Source. ' }, plataforma + ' CSV export with all fields.'],
    [{ b: 'Period. ' }, 'From ' + fechaCorta(desde) + ' to ' + fechaCorta(hasta) + '. Measures run up to the week ending ' + fechaCorta(new Date(modelo.semanaFin.getTime() - 864e5)) + '.'],
    [{ b: 'Tasks. ' }, n(inf.tareas) + ' tasks. Epics (' + n(inf.epicas) + ') and subtasks (' + n(inf.subtareas) + ') do not count. Repeated rows (' + n(inf.duplicadas) + ') count once, with their most recent version.'],
    [{ b: 'People. ' }, 'Only teams are measured. People columns (assignee, reporter, comments) are not read.'],
  ]);
  if (inf.ficheros.length) tabla(['File', 'Rows', 'Columns with data'], inf.ficheros.map((f) => [f.nombre, n(f.filas), f.columnasConDatos + ' of ' + f.columnas]), [6, 2, 2]);

  // 3. Equipos
  h1('3. Teams');
  const opcion = det.opcionesEquipo.find((o) => o.id === cfg.campoEquipo);
  const campo = det.camposEquipo.find((c) => c.id === cfg.campoEquipo);
  if (!opcion || opcion.id === 'todos') p('All work is measured as a single team.');
  else p('Each task belongs to the team given by the ' + (campo ? campo.nombre : cfg.campoEquipo || '').replace(/\s+field$/i, '') + ' field. Tasks without that field, or from teams not on the list, do not count.');
  const tareasDe = (nombre: string) => (opcion && opcion.id !== 'todos' ? (opcion.valores.find((v) => v.valor === nombre)?.n ?? 0) : inf.tareas);
  const info = new Map(cliente.equipos.lista.map((e) => [e.nombre, e]));
  tabla(['Team', 'Tasks', 'Type', 'Area', 'FTE'], modelo.equipos.map((eq) => {
    const e = info.get(eq.nombre);
    const ultimo = e ? e.fte.slice().sort((a, x) => a.periodo.localeCompare(x.periodo)).pop() : undefined;
    const fte = ultimo ? formatear(ultimo.valor, 'num') + ' (' + (NOMBRE_ORIGEN[ultimo.origen] || ultimo.origen) + ')' : 'Not given';
    const tipo = e && e.tipo === 'proveedor' ? 'Vendor: ' + (e.proveedor || 'unnamed') : 'In-house';
    return [eq.nombre, n(tareasDe(eq.nombre)), tipo, (e && e.area) || 'Not given', fte];
  }), [3, 1.5, 3, 2.5, 2.5]);
  p('FTE is the number of full-time people in each team. ' + plataforma + ' does not have it: it comes from the contract, the team declares it or it is estimated. Without FTE, the Throughput / FTE measure is not calculated for that team.', true);
  if (cfg.coste && Object.keys(cfg.coste).length) {
    h2('Capacity and cost');
    p('The cost of each team is its FTE times the monthly cost of one FTE: the internal charged cost for in-house teams and the contract rate for vendor teams. It is a team figure, never the salary of a person.');
    tabla(['Team', 'FTE', 'Cost of one FTE per month', 'Team cost per month'], modelo.equipos.map((eq) => {
      const f = cfg.fte && cfg.fte[eq.nombre], c = cfg.coste![eq.nombre];
      return [eq.nombre, f ? formatear(f, 'num') : 'Not given', c ? formatear(c, 'eur') : 'Not given', f && c ? formatear(f * c, 'eur') : 'Not calculated'];
    }), [3, 1.5, 2.75, 2.75]);
    lista([
      [{ b: 'Cost per delivery. ' }, 'Team cost per month divided by the tasks done per month (average of the last 4 weeks). Discarded tasks do not count. Lower is better.'],
      [{ b: 'How to read it. ' }, 'A task is not a fixed unit of work. Cost per delivery shows the trend of each team against its own history and, between groups, only with a similar mix of work.'],
    ]);
  }

  // 4. Estados
  h1('4. Statuses');
  p('Each ' + plataforma + ' status maps to a common status. This way every team is measured with the same rules, even if each one uses its own statuses.');
  const actuales = new Map(det.estados.map((e) => [e.nombre, e]));
  const nombres = Object.keys(mapeo).filter((k) => actuales.has(k));
  nombres.sort((a, x) => ORDEN_ESTADOS.indexOf(mapeo[a]) - ORDEN_ESTADOS.indexOf(mapeo[x]) || (actuales.get(x)!.visitas - actuales.get(a)!.visitas));
  tabla(['Status in ' + plataforma, 'Category in ' + plataforma, 'Common status', 'Counts as', 'Tasks now'], nombres.map((k) => {
    const e = actuales.get(k)!, comun = mapeo[k];
    return [k, e.categoria || 'No category', cat.estados.estados[comun].nombre, NOMBRE_ETAPA[etapaDe(comun, cat.estados)] + (comun === 'descartado' ? ' (not a delivery)' : ''), n(e.actuales)];
  }), [3, 2.5, 2.2, 2.3, 1.5]);
  // Estados que nadie ha confirmado y que no se reconocieron por su nombre
  const sinRegla = nombres.filter((k) => actuales.get(k)!.propuestaPor !== 'nombre' && !(cliente.mapeoEstados && cliente.mapeoEstados[k]) && !(cfg.mapeoEstados && cfg.mapeoEstados[k]));
  if (sinRegla.length) p([{ b: 'To confirm. ' }, 'These statuses were not recognised by name and were assigned by category or by default: ' + sinRegla.join(', ') + '.']);
  const usados = new Set(nombres.map((k) => mapeo[k]));
  h2('What each common status means');
  tabla(['Common status', 'Meaning', 'Counts as'], ORDEN_ESTADOS.filter((s) => usados.has(s)).map((s) => {
    const d = cat.estados.estados[s];
    return [d.nombre, d.descripcion, NOMBRE_ETAPA[d.etapa]];
  }), [2.2, 6, 1.8]);
  h2('Rules that follow from the statuses');
  lista([
    'The lead time of a task adds up the time spent in In progress and Waiting statuses. Time in Backlog does not count.',
    'Waiting time adds up the Blocked, Review, Testing and Waiting statuses.',
    'A Discarded task does not count as a delivery.',
    'If a done task entered the same work status more than once, it is rework. Returns after a block do not count.',
  ]);

  // 5. Medidas
  const medidas = cliente.medidas.filter((id) => cat.medidas[id]);
  h1('5. Measures');
  p('Each measure is compared with what is normal for the team itself, never with other teams. Normal is the range the measure sits in 7 weeks out of 10, looking at the ' + (cfg.semanasReferencia || 12) + ' weeks before the ones being measured.');
  lista([
    [{ b: 'Good. ' }, 'Within the usual range or better, with a 10% margin.'],
    [{ b: 'Attention. ' }, 'Worse than usual, up to 25% beyond the margin.'],
    [{ b: 'Critical. ' }, 'Much worse than usual.'],
    [{ b: 'Fixed limits. ' }, 'Some measures also have an attention limit and a critical limit. If a team agrees its own limits, its limits apply.'],
  ]);
  medidas.forEach((id) => {
    const def = cat.medidas[id];
    h2(def.nombre);
    p([{ b: def.pregunta + ' ' }, def.como]);
    const extra: Texto[] = [];
    const unidad = def.formato === 'pct' ? ('Percentage ' + (def.unidad || '')).trim() : (def.unidad || '');
    if (unidad) extra.push([{ b: 'Unit. ' }, mayuscula(unidad) + '.', def.dir ? (def.dir === 'menos' ? ' Lower is better.' : ' Higher is better.') : '']);
    if (def.limites && (def.limites.atencion != null || def.limites.critico != null)) {
      const f = (x: number) => formatear(x, def.formato);
      extra.push([{ b: 'Fixed limits. ' }, mayuscula([def.limites.atencion != null ? 'attention from ' + f(def.limites.atencion) : '', def.limites.critico != null ? 'critical from ' + f(def.limites.critico) : ''].filter(Boolean).join(' and ')) + '.']);
    }
    const propios = modelo.equipos.filter((eq) => cfg.limites && cfg.limites[eq.nombre] && cfg.limites[eq.nombre][id]);
    if (propios.length) {
      extra.push([{ b: 'Team limits. ' }, propios.map((eq) => {
        const l = cfg.limites![eq.nombre][id];
        return eq.nombre + ': ' + [l.atencion != null ? 'attention ' + formatear(l.atencion, def.formato) : '', l.critico != null ? 'critical ' + formatear(l.critico, def.formato) : ''].filter(Boolean).join(', ');
      }).join('; ') + '.']);
    }
    if (def.requiere) extra.push([{ b: 'Needs. ' }, mayuscula(REQUISITO[def.requiere] || def.requiere) + ' in the export.']);
    const sin = modelo.equipos.filter((eq) => !(eq.medidas[id] && eq.medidas[id].disponible));
    if (sin.length) extra.push([{ b: 'No data in ' + sin.map((eq) => eq.nombre).join(', ') + '. ' }, (sin[0].medidas[id] && sin[0].medidas[id].motivo) || 'The export does not have what is needed.']);
    lista(extra);
  });

  // 6. Comparaciones entre grupos
  const proveedores = cliente.equipos.lista.some((e) => e.tipo === 'proveedor');
  const areas = new Set(cliente.equipos.lista.map((e) => e.area).filter(Boolean));
  let s = 6;
  h1(s++ + '. Comparisons between groups');
  p(proveedores || areas.size ? 'In-house and vendor teams, vendors against each other and teams within the same area are compared with these rules:' : 'When there are vendor teams or areas with several teams, they will be compared with these rules:');
  lista([
    'Only measures that do not depend on team size: the lead time in which almost everything started is done (85% of tasks), rework, reopened tasks, blocked time, tasks carried over sprints, backlog age, Throughput / FTE and tickets ready for AI agents.',
    'Never raw volume and never people.',
    'Done work is compared within the same task type and size. The mix of work of each group is shown next to it.',
    'The last ' + SEMANAS_COMPARACION + ' weeks are used. If a cell has fewer than ' + MUESTRA_MINIMA + ' tasks, it says "few data".',
    'A difference counts if it is clear (not explained by chance) and relevant (' + Math.round(DIFERENCIA_MINIMA * 100) + '% or more).',
    'It does not measure effort or difficulty. A difference is a question for the meeting, not a ranking.',
  ]);

  // 7. Iniciativas
  h1(s++ + '. Initiatives');
  p('An initiative is a change tried in one or more teams, with a target measure and an expected effect. It is evaluated like this:');
  lista([
    'Before: the weeks of the measure (4 for lead times and deliveries, 8 for percentages) right before it starts.',
    'After: the same number of weeks, starting ' + Math.round(LATENCIA_DIAS / 7) + ' weeks after the start to give the change time to show.',
    'The change in the teams with the initiative is compared with the change in the teams without it, over the same dates.',
    'Confidence (high, medium or low) depends on the number of tasks and on how much the measure varies in that team.',
    'It is not a controlled experiment: it says whether it is worth continuing, it does not prove the cause.',
  ]);

  // 8. Listo para agentes
  if (medidas.includes('agent_readiness') || modelo.equipos.some((eq) => eq.medidas.agent_readiness && eq.medidas.agent_readiness.disponible)) {
    h1(s++ + '. Tickets ready for AI agents');
    p(RUBRICA.definicion + ' Each ticket scores one point per criterion. It is ready with ' + RUBRICA.listoDesde + ' out of 5 or more.');
    tabla(['Criterion', 'When it is met'], Object.values(RUBRICA.criterios).map((c) => [c.nombre, c.como]), [3, 7]);
    p('It is calculated on the ticket text in the browser. Only aggregate figures leave, never the text.', true);
  }

  // 9. Calidad de los datos
  h1(s++ + '. Data quality');
  p('Signs that ' + plataforma + ' does not reflect what really happens. Review them with each team before drawing conclusions.');
  const generales = inf.avisos.concat(det.avisos).map((a) => a.texto);
  if (generales.length) { h2('From the export'); lista(generales); }
  // Lo que se repite en todos los equipos va una sola vez
  const eqs = modelo.equipos;
  const comunes = eqs.length > 1 ? eqs[0].calidad.avisos.filter((a) => eqs.every((eq) => eq.calidad.avisos.includes(a))) : [];
  const filasCalidad = eqs.map((eq) => {
    const propios = eq.calidad.avisos.filter((a) => !comunes.includes(a));
    return [eq.nombre, propios.length ? propios.join(' ') : (comunes.length ? 'Nothing else.' : 'No warnings.')];
  });
  if (comunes.length) filasCalidad.unshift(['All teams', comunes.join(' ')]);
  tabla(['Team', 'Warnings'], filasCalidad, [2.5, 7.5]);
  const noDisponibles = cat.ordenMedidas.filter((id) => !modelo.equipos.some((eq) => eq.medidas[id] && eq.medidas[id].disponible));
  if (noDisponibles.length) {
    h2('What cannot be measured with this data');
    lista(noDisponibles.map((id) => {
      const m = modelo.equipos[0] && modelo.equipos[0].medidas[id];
      return [{ b: cat.medidas[id].nombre + '. ' }, (m && m.motivo) || 'The export does not have what is needed.'];
    }));
  }

  // 10. Qué no mide
  h1(s++ + '. What it does not measure');
  lista([
    'It does not measure people: every figure is a team figure.',
    'It does not measure the effort or difficulty of each task.',
    'It does not compare teams to make rankings. Each team is measured against its own history.',
  ]);

  // Firma
  h1(s++ + '. Agreement');
  p('Both parties review these definitions and accept them as the basis for measurement.');
  b.push({ tipo: 'firma', partes: [nombreCliente === SIN_CLIENTE ? 'Client' : nombreCliente, 'Capgemini Invent'] });

  return {
    titulo: 'Measurement definitions',
    subtitulo: (nombreCliente === SIN_CLIENTE ? 'Easy Performance' : nombreCliente + ' · Easy Performance'),
    meta: 'Version for review and signature. Prepared on ' + fechaCorta(generado) + ' with ' + plataforma + ' data up to ' + fechaCorta(hasta) + '.',
    pie: 'Measurement definitions' + (nombreCliente === SIN_CLIENTE ? '' : ' · ' + nombreCliente),
    bloques: b,
  };
}
