// Documento de definiciones (plan, apartado 12, semana 1): de dónde salen los datos, qué es cada equipo,
// qué significa cada estado, cómo se calcula cada medida y qué calidad tienen los datos.
// Se genera desde la configuración del arranque y es lo que firman el cliente y Capgemini.

import { Tx, regional } from './idioma.ts';
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

const NOMBRE_ETAPA = (): Record<Etapa, string> => ({ pendiente: Tx('Backlog', 'Pendiente'), curso: Tx('In progress', 'En curso'), espera: Tx('Waiting', 'En espera'), hecho: Tx('Done', 'Hecho') });
const ORDEN_ESTADOS: EstadoNormalizado[] = ['nuevo', 'pendiente', 'en_curso', 'bloqueado', 'en_revision', 'en_pruebas', 'en_espera', 'terminado', 'descartado'];
const NOMBRE_ORIGEN = (): Record<string, string> => ({ contrato: Tx('contract', 'contrato'), declarado: Tx('declared by the team', 'declarado por el equipo'), estimado: Tx('estimated', 'estimado') });
const REQUISITO = (): Record<string, string> => ({
  tiempos: Tx('the time in each status', 'el tiempo en cada estado'), inicio: Tx('the date work starts', 'la fecha de inicio del trabajo'), puntos: Tx('the estimate in points', 'la estimación en puntos'), errores: Tx('the Bug task type', 'el tipo de tarea Bug'),
  primera: Tx('the date of first response', 'la fecha de primera respuesta'), sprints: Tx('the sprints', 'los sprints'), api: Tx('a direct connection to the platform', 'una conexión directa con la plataforma'), descripcion: Tx('the ticket descriptions', 'las descripciones de los tickets'),
});
const SIN_CLIENTE = () => Tx('the client', 'el cliente');

const plataformaTexto = (p: string) => (p === 'jira' ? 'Jira' : p.charAt(0).toUpperCase() + p.slice(1));
const n = (x: number) => x.toLocaleString(regional());
const mayuscula = (s: string) => s.replace(/^./, (c) => c.toUpperCase());

export function definiciones(lectura: Lectura, cliente: ClienteV2, opciones: OpcionesDefiniciones = {}): Documento {
  const cat = opciones.catalogo || CATALOGO;
  const det = opciones.det || detectar(lectura);
  const cfg = opciones.config || configDesdeCliente(cliente);
  const modelo = opciones.modelo || calcular(lectura.tareas, det, cfg, cat);
  const generado = opciones.generado || new Date();
  const inf = lectura.informe;
  const plataforma = plataformaTexto(lectura.plataforma);
  const nombreCliente = (cliente.nombre || '').trim() || SIN_CLIENTE();
  const mapeo: Record<string, EstadoNormalizado> = { ...det.mapeoEstados, ...(cliente.mapeoEstados || {}), ...(cfg.mapeoEstados || {}) };
  const b: Bloque[] = [];
  const h1 = (t: string) => b.push({ tipo: 'h1', texto: t });
  const h2 = (t: string) => b.push({ tipo: 'h2', texto: t });
  const p = (t: Texto, nota = false) => b.push({ tipo: 'p', texto: t, nota });
  const lista = (items: Texto[]) => { if (items.length) b.push({ tipo: 'lista', items }); };
  const tabla = (cabecera: string[], filas: string[][], anchos: number[]) => b.push({ tipo: 'tabla', cabecera, filas, anchos });

  p(Tx('This document sets how the performance of the teams of ', 'Este documento fija cómo se mide el rendimiento de los equipos de ') + nombreCliente + Tx(' is measured. It records where the data comes from, what each team is, what each status means and how each measure is calculated.', '. Recoge de dónde salen los datos, qué es cada equipo, qué significa cada estado y cómo se calcula cada medida.'));
  p(Tx('Once both parties sign it, these rules apply to the dashboard, the comparisons and the evaluation of initiatives. If a rule changes, it changes here first.', 'Cuando lo firman las dos partes, estas reglas se aplican al tablero, a las comparaciones y a la evaluación de iniciativas. Si una regla cambia, cambia aquí primero.'));

  // 1. Objetivos
  const objetivos = cat.objetivos.filter((o) => o.fijo || cliente.objetivos.includes(o.id));
  if (objetivos.length) {
    h1(Tx('1. What we want to achieve', '1. Qué queremos conseguir'));
    lista(objetivos.map((o) => [{ b: o.titulo + '.' }, ' ' + o.frase]));
  }

  // 2. Datos
  h1(Tx('2. Where the data comes from', '2. De dónde salen los datos'));
  const desde = det.fechaMin, hasta = new Date(Math.min(det.fechaRef.getTime(), det.fechaMax.getTime()));
  lista([
    [{ b: Tx('Source. ', 'Fuente. ') }, plataforma + Tx(' CSV export with all fields.', ': export CSV con todos los campos.')],
    [{ b: Tx('Period. ', 'Periodo. ') }, Tx('From ', 'Del ') + fechaCorta(desde) + Tx(' to ', ' al ') + fechaCorta(hasta) + Tx('. Measures run up to the week ending ', '. Las medidas llegan hasta la semana que acaba el ') + fechaCorta(new Date(modelo.semanaFin.getTime() - 864e5)) + '.'],
    [{ b: Tx('Tasks. ', 'Tareas. ') }, n(inf.tareas) + Tx(' tasks. Epics (', ' tareas. Las épicas (') + n(inf.epicas) + Tx(') and subtasks (', ') y las subtareas (') + n(inf.subtareas) + Tx(') do not count. Repeated rows (', ') no cuentan. Las filas repetidas (') + n(inf.duplicadas) + Tx(') count once, with their most recent version.', ') cuentan una vez, con su versión más reciente.')],
    [{ b: Tx('People. ', 'Personas. ') }, Tx('Only teams are measured. People columns (assignee, reporter, comments) are not read.', 'Solo se miden equipos. Las columnas de personas (asignado, informador, comentarios) no se leen.')],
  ]);
  if (inf.ficheros.length) tabla([Tx('File', 'Fichero'), Tx('Rows', 'Filas'), Tx('Columns with data', 'Columnas con datos')], inf.ficheros.map((f) => [f.nombre, n(f.filas), f.columnasConDatos + Tx(' of ', ' de ') + f.columnas]), [6, 2, 2]);

  // 3. Equipos
  h1(Tx('3. Teams', '3. Equipos'));
  const opcion = det.opcionesEquipo.find((o) => o.id === cfg.campoEquipo);
  const campo = det.camposEquipo.find((c) => c.id === cfg.campoEquipo);
  if (!opcion || opcion.id === 'todos') p(Tx('All work is measured as a single team.', 'Todo el trabajo se mide como un solo equipo.'));
  else p(Tx('Each task belongs to the team given by the ', 'Cada tarea es del equipo que indica el campo ') + (campo ? campo.nombre : cfg.campoEquipo || '').replace(/\s+field$/i, '') + Tx(' field. Tasks without that field, or from teams not on the list, do not count.', '. Las tareas sin ese campo, o de equipos que no están en la lista, no cuentan.'));
  const tareasDe = (nombre: string) => (opcion && opcion.id !== 'todos' ? (opcion.valores.find((v) => v.valor === nombre)?.n ?? 0) : inf.tareas);
  const info = new Map(cliente.equipos.lista.map((e) => [e.nombre, e]));
  tabla([Tx('Team', 'Equipo'), Tx('Tasks', 'Tareas'), Tx('Type', 'Tipo'), Tx('Area', 'Área'), 'FTE'], modelo.equipos.map((eq) => {
    const e = info.get(eq.nombre);
    const ultimo = e ? e.fte.slice().sort((a, x) => a.periodo.localeCompare(x.periodo)).pop() : undefined;
    const fte = ultimo ? formatear(ultimo.valor, 'num') + ' (' + (NOMBRE_ORIGEN()[ultimo.origen] || ultimo.origen) + ')' : Tx('Not given', 'Sin indicar');
    const tipo = e && e.tipo === 'proveedor' ? Tx('Vendor: ', 'Proveedor: ') + (e.proveedor || 'unnamed') : Tx('In-house', 'Internos');
    return [eq.nombre, n(tareasDe(eq.nombre)), tipo, (e && e.area) || Tx('Not given', 'Sin indicar'), fte];
  }), [3, 1.5, 3, 2.5, 2.5]);
  p(Tx('FTE is the number of full-time people in each team. ', 'El FTE es el número de personas a tiempo completo de cada equipo. ') + plataforma + Tx(' does not have it: it comes from the contract, the team declares it or it is estimated. Without FTE, the Throughput / FTE measure is not calculated for that team.', ' no lo trae: sale del contrato, lo declara el equipo o se estima. Sin FTE, la medida Throughput / FTE no se calcula para ese equipo.'), true);
  if (cfg.coste && Object.keys(cfg.coste).length) {
    h2(Tx('Capacity and cost', 'Capacidad y coste'));
    p(Tx('The cost of each team is its FTE times the monthly cost of one FTE: the internal charged cost for in-house teams and the contract rate for vendor teams. It is a team figure, never the salary of a person.', 'El coste de cada equipo es su FTE por el coste mensual de un FTE: el coste interno cargado en los equipos internos y la tarifa del contrato en los de proveedor. Es una cifra del equipo, nunca el sueldo de una persona.'));
    tabla([Tx('Team', 'Equipo'), 'FTE', Tx('Cost of one FTE per month', 'Coste de un FTE al mes'), Tx('Team cost per month', 'Coste del equipo al mes')], modelo.equipos.map((eq) => {
      const f = cfg.fte && cfg.fte[eq.nombre], c = cfg.coste![eq.nombre];
      return [eq.nombre, f ? formatear(f, 'num') : Tx('Not given', 'Sin indicar'), c ? formatear(c, 'eur') : Tx('Not given', 'Sin indicar'), f && c ? formatear(f * c, 'eur') : Tx('Not calculated', 'Sin calcular')];
    }), [3, 1.5, 2.75, 2.75]);
    lista([
      [{ b: Tx('Cost per delivery. ', 'Coste por entrega. ') }, Tx('Team cost per month divided by the tasks done per month (average of the last 4 weeks). Discarded tasks do not count. Lower is better.', 'Coste del equipo al mes entre las tareas terminadas al mes (media de las últimas 4 semanas). Las descartadas no cuentan. Mejor cuanto más bajo.')],
      [{ b: Tx('How to read it. ', 'Cómo leerlo. ') }, Tx('A task is not a fixed unit of work. Cost per delivery shows the trend of each team against its own history and, between groups, only with a similar mix of work.', 'Una tarea no es una unidad fija de trabajo. El coste por entrega enseña la tendencia de cada equipo frente a su propia historia y, entre grupos, solo con un reparto de trabajo parecido.')],
    ]);
  }

  // 4. Estados
  h1(Tx('4. Statuses', '4. Estados'));
  p(Tx('Each ', 'Cada estado de ') + plataforma + Tx(' status maps to a common status. This way every team is measured with the same rules, even if each one uses its own statuses.', ' se traduce a un estado común. Así todos los equipos se miden con las mismas reglas, aunque cada uno use sus propios estados.'));
  const actuales = new Map(det.estados.map((e) => [e.nombre, e]));
  const nombres = Object.keys(mapeo).filter((k) => actuales.has(k));
  nombres.sort((a, x) => ORDEN_ESTADOS.indexOf(mapeo[a]) - ORDEN_ESTADOS.indexOf(mapeo[x]) || (actuales.get(x)!.visitas - actuales.get(a)!.visitas));
  tabla([Tx('Status in ', 'Estado en ') + plataforma, Tx('Category in ', 'Categoría en ') + plataforma, Tx('Common status', 'Estado común'), Tx('Counts as', 'Cuenta como'), Tx('Tasks now', 'Tareas ahora')], nombres.map((k) => {
    const e = actuales.get(k)!, comun = mapeo[k];
    return [k, e.categoria || Tx('No category', 'Sin categoría'), cat.estados.estados[comun].nombre, NOMBRE_ETAPA()[etapaDe(comun, cat.estados)] + (comun === 'descartado' ? Tx(' (not a delivery)', ' (no es entrega)') : ''), n(e.actuales)];
  }), [3, 2.5, 2.2, 2.3, 1.5]);
  // Estados que nadie ha confirmado y que no se reconocieron por su nombre
  const sinRegla = nombres.filter((k) => actuales.get(k)!.propuestaPor !== 'nombre' && !(cliente.mapeoEstados && cliente.mapeoEstados[k]) && !(cfg.mapeoEstados && cfg.mapeoEstados[k]));
  if (sinRegla.length) p([{ b: Tx('To confirm. ', 'Por confirmar. ') }, Tx('These statuses were not recognised by name and were assigned by category or by default: ', 'Estos estados no se reconocieron por su nombre y se asignaron por categoría o por defecto: ') + sinRegla.join(', ') + '.']);
  const usados = new Set(nombres.map((k) => mapeo[k]));
  h2(Tx('What each common status means', 'Qué significa cada estado común'));
  tabla([Tx('Common status', 'Estado común'), Tx('Meaning', 'Qué significa'), Tx('Counts as', 'Cuenta como')], ORDEN_ESTADOS.filter((s) => usados.has(s)).map((s) => {
    const d = cat.estados.estados[s];
    return [d.nombre, d.descripcion, NOMBRE_ETAPA()[d.etapa]];
  }), [2.2, 6, 1.8]);
  h2(Tx('Rules that follow from the statuses', 'Reglas que salen de los estados'));
  lista([
    Tx('The lead time of a task adds up the time spent in In progress and Waiting statuses. Time in Backlog does not count.', 'El tiempo de ciclo de una tarea suma el tiempo en los estados En curso y En espera. El tiempo en Pendiente no cuenta.'),
    Tx('Waiting time adds up the Blocked, Review, Testing and Waiting statuses.', 'El tiempo en espera suma los estados Bloqueado, En revisión, En pruebas y En espera.'),
    Tx('A Discarded task does not count as a delivery.', 'Una tarea Descartada no cuenta como entrega.'),
    Tx('If a done task entered the same work status more than once, it is rework. Returns after a block do not count.', 'Si una tarea terminada entró más de una vez en el mismo estado de trabajo, es retrabajo. Las vueltas después de un bloqueo no cuentan.'),
  ]);

  // 5. Medidas
  const medidas = cliente.medidas.filter((id) => cat.medidas[id]);
  h1(Tx('5. Measures', '5. Medidas'));
  p(Tx('Each measure is compared with what is normal for the team itself, never with other teams. Normal is the range the measure sits in 7 weeks out of 10, looking at the ', 'Cada medida se compara con lo que es normal para el propio equipo, nunca con otros equipos. Lo normal es el rango en el que está la medida 7 semanas de cada 10, mirando las ') + (cfg.semanasReferencia || 12) + Tx(' weeks before the ones being measured.', ' semanas anteriores a las que se miden.'));
  lista([
    [{ b: Tx('Good. ', 'Bien. ') }, Tx('Within the usual range or better, with a 10% margin.', 'Dentro del rango habitual o mejor, con un margen del 10 %.')],
    [{ b: Tx('Attention. ', 'Atención. ') }, Tx('Worse than usual, up to 25% beyond the margin.', 'Peor de lo habitual, hasta un 25 % más allá del margen.')],
    [{ b: Tx('Critical. ', 'Crítico. ') }, Tx('Much worse than usual.', 'Mucho peor de lo habitual.')],
    [{ b: Tx('Fixed limits. ', 'Límites fijos. ') }, Tx('Some measures also have an attention limit and a critical limit. If a team agrees its own limits, its limits apply.', 'Algunas medidas tienen además un límite de atención y uno crítico. Si un equipo acuerda sus propios límites, se aplican los suyos.')],
  ]);
  medidas.forEach((id) => {
    const def = cat.medidas[id];
    h2(def.nombre);
    p([{ b: def.pregunta + ' ' }, def.como]);
    const extra: Texto[] = [];
    const unidad = def.formato === 'pct' ? (Tx('Percentage ', 'Porcentaje ') + (def.unidad || '')).trim() : (def.unidad || '');
    if (unidad) extra.push([{ b: Tx('Unit. ', 'Unidad. ') }, mayuscula(unidad) + '.', def.dir ? (def.dir === 'menos' ? Tx(' Lower is better.', ' Mejor cuanto más bajo.') : Tx(' Higher is better.', ' Mejor cuanto más alto.')) : '']);
    if (def.limites && (def.limites.atencion != null || def.limites.critico != null)) {
      const f = (x: number) => formatear(x, def.formato);
      extra.push([{ b: Tx('Fixed limits. ', 'Límites fijos. ') }, mayuscula([def.limites.atencion != null ? Tx('attention from ', 'atención desde ') + f(def.limites.atencion) : '', def.limites.critico != null ? Tx('critical from ', 'crítico desde ') + f(def.limites.critico) : ''].filter(Boolean).join(Tx(' and ', ' y '))) + '.']);
    }
    const propios = modelo.equipos.filter((eq) => cfg.limites && cfg.limites[eq.nombre] && cfg.limites[eq.nombre][id]);
    if (propios.length) {
      extra.push([{ b: Tx('Team limits. ', 'Límites del equipo. ') }, propios.map((eq) => {
        const l = cfg.limites![eq.nombre][id];
        return eq.nombre + ': ' + [l.atencion != null ? Tx('attention ', 'atención ') + formatear(l.atencion, def.formato) : '', l.critico != null ? Tx('critical ', 'crítico ') + formatear(l.critico, def.formato) : ''].filter(Boolean).join(', ');
      }).join('; ') + '.']);
    }
    if (def.requiere) extra.push([{ b: Tx('Needs. ', 'Necesita. ') }, mayuscula(REQUISITO()[def.requiere] || def.requiere) + Tx(' in the export.', ' en el export.')]);
    const sin = modelo.equipos.filter((eq) => !(eq.medidas[id] && eq.medidas[id].disponible));
    if (sin.length) extra.push([{ b: Tx('No data in ', 'Sin datos en ') + sin.map((eq) => eq.nombre).join(', ') + '. ' }, (sin[0].medidas[id] && sin[0].medidas[id].motivo) || Tx('The export does not have what is needed.', 'El export no trae lo necesario.')]);
    lista(extra);
  });

  // 6. Comparaciones entre grupos
  const proveedores = cliente.equipos.lista.some((e) => e.tipo === 'proveedor');
  const areas = new Set(cliente.equipos.lista.map((e) => e.area).filter(Boolean));
  let s = 6;
  h1(s++ + Tx('. Comparisons between groups', '. Comparaciones entre grupos'));
  p(proveedores || areas.size ? Tx('In-house and vendor teams, vendors against each other and teams within the same area are compared with these rules:', 'Los equipos internos y los de proveedor, los proveedores entre sí y los equipos de una misma área se comparan con estas reglas:') : Tx('When there are vendor teams or areas with several teams, they will be compared with these rules:', 'Cuando haya equipos de proveedor o áreas con varios equipos, se compararán con estas reglas:'));
  lista([
    Tx('Only measures that do not depend on team size: the lead time in which almost everything started is done (85% of tasks), rework, reopened tasks, blocked time, tasks carried over sprints, backlog age, Throughput / FTE and tickets ready for AI agents.', 'Solo medidas que no dependen del tamaño del equipo: el tiempo de ciclo en el que se termina casi todo lo empezado (el 85 % de las tareas), el retrabajo, las tareas reabiertas, el tiempo bloqueado, las tareas arrastradas entre sprints, la antigüedad del pendiente, el Throughput / FTE y los tickets listos para agentes de IA.'),
    Tx('Never raw volume and never people.', 'Nunca el volumen bruto y nunca personas.'),
    Tx('Done work is compared within the same task type and size. The mix of work of each group is shown next to it.', 'Lo terminado se compara dentro del mismo tipo y tamaño de tarea. Al lado se enseña el reparto de trabajo de cada grupo.'),
    Tx('The last ', 'Se usan las últimas ') + SEMANAS_COMPARACION + Tx(' weeks are used. If a cell has fewer than ', ' semanas. Si una celda tiene menos de ') + MUESTRA_MINIMA + Tx(' tasks, it says "few data".', ' tareas, dice "pocos datos".'),
    Tx('A difference counts if it is clear (not explained by chance) and relevant (', 'Una diferencia cuenta si es clara (no la explica el azar) y relevante (') + Math.round(DIFERENCIA_MINIMA * 100) + Tx('% or more).', ' % o más).'),
    Tx('It does not measure effort or difficulty. A difference is a question for the meeting, not a ranking.', 'No mide esfuerzo ni dificultad. Una diferencia es una pregunta para la reunión, no un ranking.'),
  ]);

  // 7. Iniciativas
  h1(s++ + Tx('. Initiatives', '. Iniciativas'));
  p(Tx('An initiative is a change tried in one or more teams, with a target measure and an expected effect. It is evaluated like this:', 'Una iniciativa es un cambio que se prueba en uno o más equipos, con una medida objetivo y un efecto esperado. Se evalúa así:'));
  lista([
    Tx('Before: the weeks of the measure (4 for lead times and deliveries, 8 for percentages) right before it starts.', 'Antes: las semanas de la medida (4 en tiempos y entregas, 8 en porcentajes) justo antes de empezar.'),
    Tx('After: the same number of weeks, starting ', 'Después: el mismo número de semanas, empezando ') + Math.round(LATENCIA_DIAS / 7) + Tx(' weeks after the start to give the change time to show.', ' semanas después del inicio, para que el cambio tenga tiempo de notarse.'),
    Tx('The change in the teams with the initiative is compared with the change in the teams without it, over the same dates.', 'El cambio en los equipos con la iniciativa se compara con el cambio en los equipos sin ella, en las mismas fechas.'),
    Tx('Confidence (high, medium or low) depends on the number of tasks and on how much the measure varies in that team.', 'La confianza (alta, media o baja) depende del número de tareas y de cuánto varía la medida en ese equipo.'),
    Tx('It is not a controlled experiment: it says whether it is worth continuing, it does not prove the cause.', 'No es un experimento controlado: dice si merece la pena seguir, no demuestra la causa.'),
  ]);

  // 8. Listo para agentes
  if (medidas.includes('agent_readiness') || modelo.equipos.some((eq) => eq.medidas.agent_readiness && eq.medidas.agent_readiness.disponible)) {
    h1(s++ + Tx('. Tickets ready for AI agents', '. Tickets listos para agentes de IA'));
    p(RUBRICA.definicion + Tx(' Each ticket scores one point per criterion. It is ready with ', ' Cada ticket suma un punto por criterio. Está listo con ') + RUBRICA.listoDesde + Tx(' out of 5 or more.', ' de 5 o más.'));
    tabla([Tx('Criterion', 'Criterio'), Tx('When it is met', 'Cuándo se cumple')], Object.values(RUBRICA.criterios).map((c) => [c.nombre, c.como]), [3, 7]);
    p(Tx('It is calculated on the ticket text in the browser. Only aggregate figures leave, never the text.', 'Se calcula sobre el texto del ticket en el navegador. Solo salen cifras agregadas, nunca el texto.'), true);
  }

  // 9. Calidad de los datos
  h1(s++ + Tx('. Data quality', '. Calidad de los datos'));
  p(Tx('Signs that ', 'Señales de que ') + plataforma + Tx(' does not reflect what really happens. Review them with each team before drawing conclusions.', ' no refleja lo que de verdad pasa. Revisarlos con cada equipo antes de sacar conclusiones.'));
  const generales = inf.avisos.concat(det.avisos).map((a) => a.texto);
  if (generales.length) { h2(Tx('From the export', 'Del export')); lista(generales); }
  // Lo que se repite en todos los equipos va una sola vez
  const eqs = modelo.equipos;
  const comunes = eqs.length > 1 ? eqs[0].calidad.avisos.filter((a) => eqs.every((eq) => eq.calidad.avisos.includes(a))) : [];
  const filasCalidad = eqs.map((eq) => {
    const propios = eq.calidad.avisos.filter((a) => !comunes.includes(a));
    return [eq.nombre, propios.length ? propios.join(' ') : (comunes.length ? Tx('Nothing else.', 'Nada más.') : Tx('No warnings.', 'Sin avisos.'))];
  });
  if (comunes.length) filasCalidad.unshift([Tx('All teams', 'Todos los equipos'), comunes.join(' ')]);
  tabla([Tx('Team', 'Equipo'), Tx('Warnings', 'Avisos')], filasCalidad, [2.5, 7.5]);
  const noDisponibles = cat.ordenMedidas.filter((id) => !modelo.equipos.some((eq) => eq.medidas[id] && eq.medidas[id].disponible));
  if (noDisponibles.length) {
    h2(Tx('What cannot be measured with this data', 'Lo que no se puede medir con estos datos'));
    lista(noDisponibles.map((id) => {
      const m = modelo.equipos[0] && modelo.equipos[0].medidas[id];
      return [{ b: cat.medidas[id].nombre + '. ' }, (m && m.motivo) || Tx('The export does not have what is needed.', 'El export no trae lo necesario.')];
    }));
  }

  // 10. Qué no mide
  h1(s++ + Tx('. What it does not measure', '. Lo que no mide'));
  lista([
    Tx('It does not measure people: every figure is a team figure.', 'No mide personas: cada cifra es de un equipo.'),
    Tx('It does not measure the effort or difficulty of each task.', 'No mide el esfuerzo ni la dificultad de cada tarea.'),
    Tx('It does not compare teams to make rankings. Each team is measured against its own history.', 'No compara equipos para hacer rankings. Cada equipo se mide frente a su propia historia.'),
  ]);

  // Firma
  h1(s++ + Tx('. Agreement', '. Acuerdo'));
  p(Tx('Both parties review these definitions and accept them as the basis for measurement.', 'Las dos partes revisan estas definiciones y las aceptan como base de la medición.'));
  b.push({ tipo: 'firma', partes: [nombreCliente === SIN_CLIENTE() ? Tx('Client', 'Cliente') : nombreCliente, 'Capgemini Invent'] });

  return {
    titulo: Tx('Measurement definitions', 'Definiciones de medida'),
    subtitulo: (nombreCliente === SIN_CLIENTE() ? 'Easy Performance' : nombreCliente + ' · Easy Performance'),
    meta: Tx('Version for review and signature. Prepared on ', 'Versión para revisión y firma. Preparada el ') + fechaCorta(generado) + Tx(' with ', ' con datos de ') + plataforma + Tx(' data up to ', ' hasta el ') + fechaCorta(hasta) + '.',
    pie: Tx('Measurement definitions', 'Definiciones de medida') + (nombreCliente === SIN_CLIENTE() ? '' : ' · ' + nombreCliente),
    bloques: b,
  };
}
