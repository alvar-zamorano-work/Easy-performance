// Modelo de medida (lo que en una plataforma de datos se llama capa semántica): qué entidades hay,
// de qué fuente sale cada una, cómo se unen y cómo se calcula cada medida, con sus reglas.
// No depende de esta página: es la especificación para montar las mismas definiciones en la plataforma
// de datos del cliente (por ejemplo, un modelo semántico de Power BI o tablas en su almacén de datos)
// cuando haya que pasar de un piloto con exports a cientos de equipos con conectores.

import { Tx } from './idioma.ts';
import { CATALOGO, type Catalogo } from './catalogo.ts';
import { DIFERENCIA_MINIMA, MUESTRA_MINIMA, SEMANAS_COMPARACION } from './grupos.ts';
import { LATENCIA_DIAS } from './iniciativas.ts';
import { RUBRICA } from './agent-readiness.ts';
import { ALIAS } from '../adaptadores/jira/columnas.ts';

export interface CampoModelo { campo: string; tipo: string; que: string; jira?: string }
export interface EntidadModelo { id: string; nombre: string; clave: string[]; fuente: string; quien: string; campos: CampoModelo[]; nota?: string }
export interface RelacionModelo { desde: string; hacia: string; cardinalidad: string; por: string }
export interface MedidaModelo {
  id: string; nombre: string; pregunta: string; definicion: string; unidad: string; formato: string;
  mejor: 'higher' | 'lower' | null; necesita: string[]; nivel: string; comparableEntreGrupos: boolean; nota?: string;
}
export interface ModeloMedida {
  version: number;
  nombre: string;
  generado: string;
  para_que: string;
  reglas: string[];
  entidades: EntidadModelo[];
  relaciones: RelacionModelo[];
  medidas: MedidaModelo[];
  comparaciones: string[];
  iniciativas: string[];
  despliegue: { fase: string; como: string; volumen: string }[];
  requisitos_para_escalar: string[];
}

/** Nombre de la columna de Jira (en inglés) de la que sale un campo del modelo. */
const jira = (alias: string) => (ALIAS[alias] ? ALIAS[alias][0].replace(/\b\w/g, (c) => c.toUpperCase()) : '');

const COMPARABLES = new Set(['ciclo', 'retrabajo', 'arrastradas', 'agent_readiness', 'throughput', 'coste']);
const NECESITA = (): Record<string, string> => ({
  tiempos: Tx('time in each status', 'tiempo en cada estado'), inicio: Tx('date work starts', 'fecha de inicio del trabajo'), puntos: Tx('estimate', 'estimación'), errores: Tx('Bug task type', 'tipo de tarea Bug'),
  primera: Tx('date of first response', 'fecha de primera respuesta'), sprints: 'sprints', api: Tx('direct connection to the platform', 'conexión directa con la plataforma'), descripcion: Tx('ticket descriptions', 'descripciones de los tickets'),
});

export function modeloDeMedida(opciones: { catalogo?: Catalogo; generado?: Date } = {}): ModeloMedida {
  const cat = opciones.catalogo || CATALOGO;
  const entidades: EntidadModelo[] = [
    {
      id: 'tarea', nombre: Tx('Task', 'Tarea'), clave: ['tarea_id'], fuente: Tx('Work management tool (Jira today; Azure DevOps or another one with its adapter).', 'Herramienta de gestión del trabajo (Jira hoy; Azure DevOps u otra con su adaptador).'), quien: Tx('Export or connector', 'Export o conector'),
      campos: [
        { campo: 'tarea_id', tipo: 'text', que: Tx('Task key in the source.', 'Clave de la tarea en el origen.'), jira: jira('clave') },
        { campo: 'equipo_id', tipo: 'text', que: Tx('Team it belongs to, according to the field agreed with the client.', 'Equipo al que pertenece, según el campo acordado con el cliente.'), jira: jira('equipo') + Tx(' (or Components, or Project Name)', ' (o Components, o Project Name)') },
        { campo: 'tipo', tipo: 'historia | error | tarea | otro', que: Tx('Common task type (story, bug, task, other).', 'Tipo común de la tarea.'), jira: jira('tipo') },
        { campo: 'estado_origen', tipo: 'text', que: Tx('Status in the tool.', 'Estado en la herramienta.'), jira: jira('estado') },
        { campo: 'prioridad', tipo: 'baja | media | alta | urgente', que: Tx('Common priority (low, medium, high, urgent).', 'Prioridad común.'), jira: jira('prioridad') },
        { campo: 'estimacion', tipo: 'number', que: Tx('Estimate (points or another unit), if any.', 'Estimación (puntos u otra unidad), si existe.'), jira: jira('puntos') },
        { campo: 'sprints', tipo: 'list', que: Tx('Sprints it has been through, in order.', 'Sprints por los que ha pasado, en orden.'), jira: jira('sprint') },
        { campo: 'fecha_creada', tipo: 'date', que: Tx('When it was created.', 'Cuándo se creó.'), jira: jira('creada') },
        { campo: 'fecha_terminada', tipo: 'date', que: Tx('When it was done.', 'Cuándo se terminó.'), jira: jira('resuelta') },
        { campo: 'descartada', tipo: Tx('yes or no', 'sí o no'), que: Tx('Closed without doing it (duplicate, will not do). Does not count as a delivery.', 'Cerrada sin hacer (duplicada, no se hará). No cuenta como entrega.'), jira: jira('resolucion') },
        { campo: 'tiempos_estado', tipo: Tx('list of status, visits and time', 'lista de estado, visitas y tiempo'), que: Tx('Time accumulated in each status; lead time, waiting, blocked time and rework come from here.', 'Tiempo acumulado en cada estado; de aquí salen plazo, espera, bloqueo y retrabajo.'), jira: jira('tis') },
        { campo: 'calidad_ticket', tipo: Tx('0 to 5', '0 a 5'), que: Tx('Well-defined ticket index, calculated on the description. The description never leaves the calculation.', 'Índice de ticket bien definido, calculado sobre la descripción. La descripción no sale nunca del cálculo.'), jira: jira('descripcion') },
      ],
      nota: Tx('It has no people fields: no assignee, no reporter, no comments.', 'No tiene campos de personas: ni asignado, ni informador, ni comentarios.'),
    },
    {
      id: 'estado', nombre: Tx('Common status', 'Estado común'), clave: ['estado_origen'], fuente: Tx('Mapping signed with the client, proposed from the status catalogue.', 'Mapeo firmado con el cliente, propuesto a partir del catálogo de estados.'), quien: Tx('Consultant and client', 'Consultor y cliente'),
      campos: [
        { campo: 'estado_origen', tipo: 'text', que: Tx('Status as it is named in the tool.', 'Estado tal como se llama en la herramienta.') },
        { campo: 'estado_comun', tipo: Object.keys(cat.estados.estados).join(' | '), que: Tx('One of the nine common statuses. This way every team is measured with the same rules.', 'Uno de los nueve estados comunes. Así todos los equipos se miden con las mismas reglas.') },
      ],
    },
    {
      id: 'equipo', nombre: Tx('Team', 'Equipo'), clave: ['equipo_id'], fuente: Tx('Configuration signed with the client.', 'Configuración firmada con el cliente.'), quien: Tx('Consultant and client', 'Consultor y cliente'),
      campos: [
        { campo: 'equipo_id', tipo: 'text', que: Tx('Common identifier across all sources.', 'Identificador común en todas las fuentes.') },
        { campo: 'tipo', tipo: 'interno | proveedor', que: Tx('Whether the team is in-house or from a vendor.', 'Si el equipo es propio o de un proveedor.') },
        { campo: 'proveedor', tipo: 'text', que: Tx('Vendor name, if it is a vendor team.', 'Nombre del proveedor, si lo es.') },
        { campo: 'area', tipo: 'text', que: Tx('Higher-level group (area, tribe, product).', 'Grupo de nivel superior (área, tribu, producto).') },
        { campo: 'usa_sprints', tipo: Tx('yes or no', 'sí o no'), que: Tx('Whether it works in sprints.', 'Si trabaja por sprints.') },
      ],
    },
    {
      id: 'capacidad', nombre: Tx('Capacity', 'Capacidad'), clave: ['equipo_id', 'mes'], fuente: Tx('Headcount tool or vendor contract.', 'Herramienta de plantilla (headcount) o contrato del proveedor.'), quien: Tx('Human resources, procurement or the team itself', 'Recursos humanos, compras o el propio equipo'),
      campos: [
        { campo: 'fte', tipo: 'number', que: Tx('Full-time equivalent people that month.', 'Personas equivalentes a jornada completa ese mes.') },
        { campo: 'origen', tipo: 'contrato | declarado | estimado', que: Tx('Where the figure comes from (contract, declared, estimated). Always shown next to it.', 'De dónde sale la cifra. Se muestra siempre al lado.') },
      ],
    },
    {
      id: 'coste', nombre: Tx('Cost', 'Coste'), clave: ['equipo_id', 'mes'], fuente: Tx('Finance (internal charged cost) or vendor contract (rate).', 'Finanzas (coste interno cargado) o contrato del proveedor (tarifa).'), quien: Tx('Finance or procurement', 'Finanzas o compras'),
      campos: [
        { campo: 'coste_fte_mes', tipo: 'euros', que: Tx('What one FTE of that team costs per month.', 'Lo que cuesta al mes un FTE de ese equipo.') },
        { campo: 'tipo_coste', tipo: 'interno | tarifa', que: Tx('Internal charged cost or vendor rate.', 'Coste interno cargado o tarifa de proveedor.') },
      ],
      nota: Tx('It is a team figure: never the salary of a person.', 'Es un dato de equipo: nunca el salario de una persona.'),
    },
    {
      id: 'iniciativa', nombre: Tx('Improvement initiative', 'Iniciativa de mejora'), clave: ['iniciativa_id'], fuente: Tx('Improvement office.', 'Oficina de productividad.'), quien: Tx('Consultant with the client', 'Consultor con el cliente'),
      campos: [
        { campo: 'equipos', tipo: Tx('list of equipo_id', 'lista de equipo_id'), que: Tx('Teams where it is tried.', 'Equipos en los que se prueba.') },
        { campo: 'fecha_inicio, fecha_fin', tipo: 'dates', que: Tx('When it starts and, if it ends, when.', 'Cuándo empieza y, si acaba, cuándo.') },
        { campo: 'medidas_objetivo', tipo: Tx('list of measure and direction', 'lista de medida y dirección'), que: Tx('Which measure should move and in which direction.', 'Qué medida debe moverse y hacia dónde.') },
      ],
    },
    {
      id: 'semana', nombre: Tx('Calendar', 'Calendario'), clave: ['semana'], fuente: Tx('Generated.', 'Generado.'), quien: Tx('Automatic', 'Automático'),
      campos: [{ campo: 'semana', tipo: Tx('date (Monday)', 'fecha (lunes)'), que: Tx('Time unit of every series.', 'Unidad de tiempo de todas las series.') }, { campo: 'mes', tipo: Tx('year and month', 'año y mes'), que: Tx('To join with capacity and cost.', 'Para unir con capacidad y coste.') }],
    },
  ];
  const relaciones: RelacionModelo[] = [
    { desde: 'tarea', hacia: 'equipo', cardinalidad: Tx('many to one', 'muchas a uno'), por: 'equipo_id' },
    { desde: 'tarea', hacia: 'estado', cardinalidad: Tx('many to one', 'muchas a uno'), por: 'estado_origen' },
    { desde: 'tarea', hacia: 'semana', cardinalidad: Tx('many to one', 'muchas a uno'), por: Tx('fecha_terminada (and fecha_creada for incoming work)', 'fecha_terminada (y fecha_creada para lo que entra)') },
    { desde: 'capacidad', hacia: 'equipo', cardinalidad: Tx('many to one', 'muchas a uno'), por: Tx('equipo_id, one row per month', 'equipo_id, una fila por mes') },
    { desde: 'coste', hacia: 'equipo', cardinalidad: Tx('many to one', 'muchas a uno'), por: Tx('equipo_id, one row per month', 'equipo_id, una fila por mes') },
    { desde: 'capacidad', hacia: 'coste', cardinalidad: Tx('one to one', 'uno a uno'), por: Tx('equipo_id and mes', 'equipo_id y mes') },
    { desde: 'iniciativa', hacia: 'equipo', cardinalidad: Tx('many to many', 'muchas a muchas'), por: 'equipos' },
  ];
  const medidas: MedidaModelo[] = cat.ordenMedidas.map((id) => {
    const m = cat.medidas[id];
    return {
      id, nombre: m.nombre, pregunta: m.pregunta, definicion: m.como, unidad: m.unidad, formato: m.formato,
      mejor: m.dir === 'mas' ? 'higher' : m.dir === 'menos' ? 'lower' : null,
      necesita: ['tarea', 'estado'].concat(m.requiere ? [NECESITA()[m.requiere] || m.requiere] : []),
      nivel: Tx('team and week; the area is calculated with all its tasks, never as an average of teams', 'equipo y semana; el área se calcula con todas sus tareas, nunca como media de equipos'),
      comparableEntreGrupos: COMPARABLES.has(id),
    };
  });
  medidas.push(
    {
      id: 'throughput', nombre: 'Throughput / FTE', pregunta: Tx('How much does each full-time person in the team finish?', '¿Cuánto termina cada persona equivalente del equipo?'),
      definicion: Tx('Tasks done per month (average of the last 4 weeks) divided by the team FTE.', 'Tareas terminadas al mes (media de las últimas 4 semanas) entre el FTE del equipo.'), unidad: Tx('tasks per month per FTE', 'tareas al mes por FTE'), formato: 'num',
      mejor: 'higher', necesita: ['tarea', 'capacidad'], nivel: Tx('team and month; the area adds up tasks and FTE', 'equipo y mes; el área suma tareas y FTE'), comparableEntreGrupos: true,
      nota: Tx('It depends on task size: between groups it is read next to the mix by type and size.', 'Depende del tamaño de las tareas: entre grupos se lee junto al reparto por tipo y tamaño.'),
    },
    {
      id: 'coste_mes', nombre: Tx('Team cost per month', 'Coste del equipo al mes'), pregunta: Tx('How much does the team cost?', '¿Cuánto cuesta el equipo?'),
      definicion: Tx('FTE of the month times the monthly cost of one FTE of that team.', 'FTE del mes por el coste mensual de un FTE de ese equipo.'), unidad: Tx('euros per month', 'euros al mes'), formato: 'eur',
      mejor: null, necesita: ['capacidad', 'coste'], nivel: Tx('team and month; the area adds up', 'equipo y mes; el área suma'), comparableEntreGrupos: false,
    },
    {
      id: 'coste', nombre: Tx('Cost per delivery', 'Coste por entrega'), pregunta: Tx('How much does each done task cost?', '¿Cuánto cuesta cada tarea terminada?'),
      definicion: Tx('Team cost per month divided by the tasks done per month (average of the last 4 weeks). Discarded tasks do not count.', 'Coste del equipo al mes entre las tareas terminadas al mes (media de las últimas 4 semanas). Las descartadas no cuentan.'), unidad: Tx('euros per task', 'euros por tarea'), formato: 'eur',
      mejor: 'lower', necesita: ['tarea', 'capacidad', 'coste'], nivel: Tx('team and month; the area divides the total cost by all its tasks', 'equipo y mes; el área divide el coste total entre todas sus tareas'), comparableEntreGrupos: true,
      nota: Tx('A task is not a fixed unit of work. It shows the trend of a team and, between groups, only with a similar mix of work.', 'Una tarea no es una unidad fija de trabajo. Sirve para ver la tendencia de un equipo y, entre grupos, solo con un reparto de trabajo parecido.'),
    },
  );
  return {
    version: 1,
    nombre: Tx('Easy Performance measurement model', 'Modelo de medida de Easy Performance'),
    generado: (opciones.generado || new Date()).toISOString(),
    para_que: Tx('Specification of the common definitions so they can be built in any tool: this page for the pilot, or the client data platform to scale to hundreds of teams with connectors.', 'Especificación de las definiciones comunes para montarlas en cualquier herramienta: esta página para el piloto, o la plataforma de datos del cliente para escalar a cientos de equipos con conectores.'),
    reglas: [
      Tx('Only teams are measured. Never people: the model has no people fields.', 'Solo se mide a equipos. Nunca a personas: el modelo no tiene campos de personas.'),
      Tx('Each measure is compared with the history of the team itself: last 4 weeks for lead times and deliveries, 8 for percentages, against the 12 weeks before.', 'Cada medida se compara con la historia del propio equipo: últimas 4 semanas para plazos y entregas, 8 para porcentajes, frente a las 12 semanas anteriores.'),
      Tx('Good: within the usual range (percentiles 15 to 85) with a 10% margin. Attention: up to 25% worse. Critical: beyond that.', 'Bien: dentro de lo habitual (percentiles 15 a 85) con un margen del 10%. Atención: hasta un 25% peor. Crítico: más.'),
      Tx('Area figures come from all its tasks together, never from averages of teams.', 'Las cifras del área salen de todas sus tareas juntas, nunca de medias de equipos.'),
      Tx('A definition changes first in the signed definitions document and then in the model.', 'Una definición se cambia primero en el documento de definiciones firmado y después en el modelo.'),
    ],
    entidades,
    relaciones,
    medidas,
    comparaciones: [
      Tx('In-house versus vendors, between vendors and between teams in the same area.', 'Internos frente a proveedores, entre proveedores y entre equipos de una misma área.'),
      Tx('Only measures that do not depend on team size; never raw volume.', 'Solo medidas que no dependen del tamaño del equipo; nunca volumen bruto.'),
      Tx('Done work is compared within the same task type and size, over the last ', 'Lo terminado se compara dentro del mismo tipo y tamaño de tarea, en las últimas ') + SEMANAS_COMPARACION + Tx(' weeks.', ' semanas.'),
      Tx('Cells with fewer than ', 'Celdas con menos de ') + MUESTRA_MINIMA + Tx(' tasks: "few data". A difference counts if it is clear (z of 2 or more) and of ', ' tareas: "pocos datos". Una diferencia cuenta si es clara (z de 2 o más) y de un ') + Math.round(DIFERENCIA_MINIMA * 100) + Tx('% or more.', '% o más.'),
    ],
    iniciativas: [
      Tx('Before and after with the same window, starting ', 'Antes y después con la misma ventana, empezando ') + Math.round(LATENCIA_DIAS / 7) + Tx(' weeks after the start.', ' semanas después del inicio.'),
      Tx('Teams without the initiative serve as control (difference in differences).', 'Los equipos sin la iniciativa sirven de control (diferencia de diferencias).'),
      Tx('High, medium or low confidence depending on the sample and the variability of the team. It says whether it is worth continuing, it does not prove the cause.', 'Confianza alta, media o baja según la muestra y la variabilidad del equipo. Indica si merece seguir, no demuestra la causa.'),
    ],
    despliegue: [
      { fase: Tx('Start-up and pilot', 'Arranque y piloto'), como: Tx('This page: an HTML file that reads the exports from a folder and calculates in the browser, with no server.', 'Esta página: un fichero HTML que lee los exports de una carpeta y calcula en el navegador, sin servidor.'), volumen: Tx('Tested up to 200 teams and 62,000 tasks per year (about 1,000 FTE): about 13 seconds to load on a laptop.', 'Probado hasta 200 equipos y 62.000 tareas al año (unos 1.000 FTE): unos 13 segundos de carga en un portátil.') },
      { fase: Tx('Scale', 'Escala'), como: Tx('The same entities, joins and measures in the client data platform, fed by connectors to its work management, headcount and finance tools.', 'Las mismas entidades, uniones y medidas en la plataforma de datos del cliente, alimentadas por conectores con su herramienta de gestión, de plantilla y de finanzas.'), volumen: Tx('Hundreds of teams and thousands of developers.', 'Cientos de equipos y miles de desarrolladores.') },
    ],
    requisitos_para_escalar: [
      Tx('A common team identifier in the work management tool, the headcount tool and finance. It is what is usually missing and what gives value to joining the data.', 'Un identificador de equipo común en la herramienta de gestión, en la de plantilla y en finanzas. Es lo que suele faltar y lo que da valor a la unión de datos.'),
      Tx('Status mapping signed for each work management tool.', 'Mapeo de estados firmado por cada herramienta de gestión.'),
      Tx('FTE and cost per team and month, with their source.', 'FTE y coste por equipo y mes, con su origen.'),
      Tx('An owner of the model at the client who approves definition changes.', 'Un responsable del modelo en el cliente que apruebe los cambios de definición.'),
      Tx('Agreed criterion for a well-defined ticket (rubric of ', 'Criterio de ticket bien definido acordado (rúbrica de ') + Object.keys(RUBRICA.criterios).length + Tx(' criteria).', ' criterios).'),
    ],
  };
}
