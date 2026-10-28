// Modelo de medida (lo que en una plataforma de datos se llama capa semántica): qué entidades hay,
// de qué fuente sale cada una, cómo se unen y cómo se calcula cada medida, con sus reglas.
// No depende de esta página: es la especificación para montar las mismas definiciones en la plataforma
// de datos del cliente (por ejemplo, un modelo semántico de Power BI o tablas en su almacén de datos)
// cuando haya que pasar de un piloto con exports a cientos de equipos con conectores.

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
const NECESITA: Record<string, string> = {
  tiempos: 'time in each status', inicio: 'date work starts', puntos: 'estimate', errores: 'Bug task type',
  primera: 'date of first response', sprints: 'sprints', api: 'direct connection to the platform', descripcion: 'ticket descriptions',
};

export function modeloDeMedida(opciones: { catalogo?: Catalogo; generado?: Date } = {}): ModeloMedida {
  const cat = opciones.catalogo || CATALOGO;
  const entidades: EntidadModelo[] = [
    {
      id: 'tarea', nombre: 'Task', clave: ['tarea_id'], fuente: 'Work management tool (Jira today; Azure DevOps or another one with its adapter).', quien: 'Export or connector',
      campos: [
        { campo: 'tarea_id', tipo: 'text', que: 'Task key in the source.', jira: jira('clave') },
        { campo: 'equipo_id', tipo: 'text', que: 'Team it belongs to, according to the field agreed with the client.', jira: jira('equipo') + ' (or Components, or Project Name)' },
        { campo: 'tipo', tipo: 'historia | error | tarea | otro', que: 'Common task type (story, bug, task, other).', jira: jira('tipo') },
        { campo: 'estado_origen', tipo: 'text', que: 'Status in the tool.', jira: jira('estado') },
        { campo: 'prioridad', tipo: 'baja | media | alta | urgente', que: 'Common priority (low, medium, high, urgent).', jira: jira('prioridad') },
        { campo: 'estimacion', tipo: 'number', que: 'Estimate (points or another unit), if any.', jira: jira('puntos') },
        { campo: 'sprints', tipo: 'list', que: 'Sprints it has been through, in order.', jira: jira('sprint') },
        { campo: 'fecha_creada', tipo: 'date', que: 'When it was created.', jira: jira('creada') },
        { campo: 'fecha_terminada', tipo: 'date', que: 'When it was done.', jira: jira('resuelta') },
        { campo: 'descartada', tipo: 'yes or no', que: 'Closed without doing it (duplicate, will not do). Does not count as a delivery.', jira: jira('resolucion') },
        { campo: 'tiempos_estado', tipo: 'list of status, visits and time', que: 'Time accumulated in each status; lead time, waiting, blocked time and rework come from here.', jira: jira('tis') },
        { campo: 'calidad_ticket', tipo: '0 to 5', que: 'Well-defined ticket index, calculated on the description. The description never leaves the calculation.', jira: jira('descripcion') },
      ],
      nota: 'It has no people fields: no assignee, no reporter, no comments.',
    },
    {
      id: 'estado', nombre: 'Common status', clave: ['estado_origen'], fuente: 'Mapping signed with the client, proposed from the status catalogue.', quien: 'Consultant and client',
      campos: [
        { campo: 'estado_origen', tipo: 'text', que: 'Status as it is named in the tool.' },
        { campo: 'estado_comun', tipo: Object.keys(cat.estados.estados).join(' | '), que: 'One of the nine common statuses. This way every team is measured with the same rules.' },
      ],
    },
    {
      id: 'equipo', nombre: 'Team', clave: ['equipo_id'], fuente: 'Configuration signed with the client.', quien: 'Consultant and client',
      campos: [
        { campo: 'equipo_id', tipo: 'text', que: 'Common identifier across all sources.' },
        { campo: 'tipo', tipo: 'interno | proveedor', que: 'Whether the team is in-house or from a vendor.' },
        { campo: 'proveedor', tipo: 'text', que: 'Vendor name, if it is a vendor team.' },
        { campo: 'area', tipo: 'text', que: 'Higher-level group (area, tribe, product).' },
        { campo: 'usa_sprints', tipo: 'yes or no', que: 'Whether it works in sprints.' },
      ],
    },
    {
      id: 'capacidad', nombre: 'Capacity', clave: ['equipo_id', 'mes'], fuente: 'Headcount tool or vendor contract.', quien: 'Human resources, procurement or the team itself',
      campos: [
        { campo: 'fte', tipo: 'number', que: 'Full-time equivalent people that month.' },
        { campo: 'origen', tipo: 'contrato | declarado | estimado', que: 'Where the figure comes from (contract, declared, estimated). Always shown next to it.' },
      ],
    },
    {
      id: 'coste', nombre: 'Cost', clave: ['equipo_id', 'mes'], fuente: 'Finance (internal charged cost) or vendor contract (rate).', quien: 'Finance or procurement',
      campos: [
        { campo: 'coste_fte_mes', tipo: 'euros', que: 'What one FTE of that team costs per month.' },
        { campo: 'tipo_coste', tipo: 'interno | tarifa', que: 'Internal charged cost or vendor rate.' },
      ],
      nota: 'It is a team figure: never the salary of a person.',
    },
    {
      id: 'iniciativa', nombre: 'Improvement initiative', clave: ['iniciativa_id'], fuente: 'Improvement office.', quien: 'Consultant with the client',
      campos: [
        { campo: 'equipos', tipo: 'list of equipo_id', que: 'Teams where it is tried.' },
        { campo: 'fecha_inicio, fecha_fin', tipo: 'dates', que: 'When it starts and, if it ends, when.' },
        { campo: 'medidas_objetivo', tipo: 'list of measure and direction', que: 'Which measure should move and in which direction.' },
      ],
    },
    {
      id: 'semana', nombre: 'Calendar', clave: ['semana'], fuente: 'Generated.', quien: 'Automatic',
      campos: [{ campo: 'semana', tipo: 'date (Monday)', que: 'Time unit of every series.' }, { campo: 'mes', tipo: 'year and month', que: 'To join with capacity and cost.' }],
    },
  ];
  const relaciones: RelacionModelo[] = [
    { desde: 'tarea', hacia: 'equipo', cardinalidad: 'many to one', por: 'equipo_id' },
    { desde: 'tarea', hacia: 'estado', cardinalidad: 'many to one', por: 'estado_origen' },
    { desde: 'tarea', hacia: 'semana', cardinalidad: 'many to one', por: 'fecha_terminada (and fecha_creada for incoming work)' },
    { desde: 'capacidad', hacia: 'equipo', cardinalidad: 'many to one', por: 'equipo_id, one row per month' },
    { desde: 'coste', hacia: 'equipo', cardinalidad: 'many to one', por: 'equipo_id, one row per month' },
    { desde: 'capacidad', hacia: 'coste', cardinalidad: 'one to one', por: 'equipo_id and mes' },
    { desde: 'iniciativa', hacia: 'equipo', cardinalidad: 'many to many', por: 'equipos' },
  ];
  const medidas: MedidaModelo[] = cat.ordenMedidas.map((id) => {
    const m = cat.medidas[id];
    return {
      id, nombre: m.nombre, pregunta: m.pregunta, definicion: m.como, unidad: m.unidad, formato: m.formato,
      mejor: m.dir === 'mas' ? 'higher' : m.dir === 'menos' ? 'lower' : null,
      necesita: ['tarea', 'estado'].concat(m.requiere ? [NECESITA[m.requiere] || m.requiere] : []),
      nivel: 'team and week; the area is calculated with all its tasks, never as an average of teams',
      comparableEntreGrupos: COMPARABLES.has(id),
    };
  });
  medidas.push(
    {
      id: 'throughput', nombre: 'Throughput / FTE', pregunta: 'How much does each full-time person in the team finish?',
      definicion: 'Tasks done per month (average of the last 4 weeks) divided by the team FTE.', unidad: 'tasks per month per FTE', formato: 'num',
      mejor: 'higher', necesita: ['tarea', 'capacidad'], nivel: 'team and month; the area adds up tasks and FTE', comparableEntreGrupos: true,
      nota: 'It depends on task size: between groups it is read next to the mix by type and size.',
    },
    {
      id: 'coste_mes', nombre: 'Team cost per month', pregunta: 'How much does the team cost?',
      definicion: 'FTE of the month times the monthly cost of one FTE of that team.', unidad: 'euros per month', formato: 'eur',
      mejor: null, necesita: ['capacidad', 'coste'], nivel: 'team and month; the area adds up', comparableEntreGrupos: false,
    },
    {
      id: 'coste', nombre: 'Cost per delivery', pregunta: 'How much does each done task cost?',
      definicion: 'Team cost per month divided by the tasks done per month (average of the last 4 weeks). Discarded tasks do not count.', unidad: 'euros per task', formato: 'eur',
      mejor: 'lower', necesita: ['tarea', 'capacidad', 'coste'], nivel: 'team and month; the area divides the total cost by all its tasks', comparableEntreGrupos: true,
      nota: 'A task is not a fixed unit of work. It shows the trend of a team and, between groups, only with a similar mix of work.',
    },
  );
  return {
    version: 1,
    nombre: 'Easy Performance measurement model',
    generado: (opciones.generado || new Date()).toISOString(),
    para_que: 'Specification of the common definitions so they can be built in any tool: this page for the pilot, or the client data platform to scale to hundreds of teams with connectors.',
    reglas: [
      'Only teams are measured. Never people: the model has no people fields.',
      'Each measure is compared with the history of the team itself: last 4 weeks for lead times and deliveries, 8 for percentages, against the 12 weeks before.',
      'Good: within the usual range (percentiles 15 to 85) with a 10% margin. Attention: up to 25% worse. Critical: beyond that.',
      'Area figures come from all its tasks together, never from averages of teams.',
      'A definition changes first in the signed definitions document and then in the model.',
    ],
    entidades,
    relaciones,
    medidas,
    comparaciones: [
      'In-house versus vendors, between vendors and between teams in the same area.',
      'Only measures that do not depend on team size; never raw volume.',
      'Done work is compared within the same task type and size, over the last ' + SEMANAS_COMPARACION + ' weeks.',
      'Cells with fewer than ' + MUESTRA_MINIMA + ' tasks: "few data". A difference counts if it is clear (z of 2 or more) and of ' + Math.round(DIFERENCIA_MINIMA * 100) + '% or more.',
    ],
    iniciativas: [
      'Before and after with the same window, starting ' + Math.round(LATENCIA_DIAS / 7) + ' weeks after the start.',
      'Teams without the initiative serve as control (difference in differences).',
      'High, medium or low confidence depending on the sample and the variability of the team. It says whether it is worth continuing, it does not prove the cause.',
    ],
    despliegue: [
      { fase: 'Start-up and pilot', como: 'This page: an HTML file that reads the exports from a folder and calculates in the browser, with no server.', volumen: 'Tested up to 200 teams and 62,000 tasks per year (about 1,000 FTE): about 13 seconds to load on a laptop.' },
      { fase: 'Scale', como: 'The same entities, joins and measures in the client data platform, fed by connectors to its work management, headcount and finance tools.', volumen: 'Hundreds of teams and thousands of developers.' },
    ],
    requisitos_para_escalar: [
      'A common team identifier in the work management tool, the headcount tool and finance. It is what is usually missing and what gives value to joining the data.',
      'Status mapping signed for each work management tool.',
      'FTE and cost per team and month, with their source.',
      'An owner of the model at the client who approves definition changes.',
      'Agreed criterion for a well-defined ticket (rubric of ' + Object.keys(RUBRICA.criterios).length + ' criteria).',
    ],
  };
}
