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
  mejor: 'más alto' | 'más bajo' | null; necesita: string[]; nivel: string; comparableEntreGrupos: boolean; nota?: string;
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
  tiempos: 'tiempo en cada estado', inicio: 'fecha de inicio del trabajo', puntos: 'estimación', errores: 'tipo de tarea Error',
  primera: 'fecha de primera respuesta', sprints: 'sprints', api: 'conexión directa con la plataforma', descripcion: 'descripción de los tickets',
};

export function modeloDeMedida(opciones: { catalogo?: Catalogo; generado?: Date } = {}): ModeloMedida {
  const cat = opciones.catalogo || CATALOGO;
  const entidades: EntidadModelo[] = [
    {
      id: 'tarea', nombre: 'Tarea', clave: ['tarea_id'], fuente: 'Herramienta de gestión del trabajo (Jira hoy; Azure DevOps u otra con su adaptador).', quien: 'Export o conector',
      campos: [
        { campo: 'tarea_id', tipo: 'texto', que: 'Clave de la tarea en el origen.', jira: jira('clave') },
        { campo: 'equipo_id', tipo: 'texto', que: 'Equipo al que pertenece, según el campo acordado con el cliente.', jira: jira('equipo') + ' (o Components, o Project Name)' },
        { campo: 'tipo', tipo: 'historia | error | tarea | otro', que: 'Tipo común de la tarea.', jira: jira('tipo') },
        { campo: 'estado_origen', tipo: 'texto', que: 'Estado en la herramienta.', jira: jira('estado') },
        { campo: 'prioridad', tipo: 'baja | media | alta | urgente', que: 'Prioridad común.', jira: jira('prioridad') },
        { campo: 'estimacion', tipo: 'número', que: 'Estimación (puntos u otra unidad), si existe.', jira: jira('puntos') },
        { campo: 'sprints', tipo: 'lista', que: 'Sprints por los que ha pasado, en orden.', jira: jira('sprint') },
        { campo: 'fecha_creada', tipo: 'fecha', que: 'Cuándo se creó.', jira: jira('creada') },
        { campo: 'fecha_terminada', tipo: 'fecha', que: 'Cuándo se terminó.', jira: jira('resuelta') },
        { campo: 'descartada', tipo: 'sí o no', que: 'Cerrada sin hacer (duplicada, no se hará). No cuenta como entrega.', jira: jira('resolucion') },
        { campo: 'tiempos_estado', tipo: 'lista de estado, visitas y tiempo', que: 'Tiempo acumulado en cada estado; de aquí salen plazo, espera, bloqueo y retrabajo.', jira: jira('tis') },
        { campo: 'calidad_ticket', tipo: '0 a 5', que: 'Índice de ticket bien definido, calculado sobre la descripción. La descripción no sale nunca del cálculo.', jira: jira('descripcion') },
      ],
      nota: 'No tiene campos de personas: ni asignado, ni informador, ni comentarios.',
    },
    {
      id: 'estado', nombre: 'Estado común', clave: ['estado_origen'], fuente: 'Mapeo firmado con el cliente, propuesto a partir del catálogo de estados.', quien: 'Consultor y cliente',
      campos: [
        { campo: 'estado_origen', tipo: 'texto', que: 'Estado tal como se llama en la herramienta.' },
        { campo: 'estado_comun', tipo: Object.keys(cat.estados.estados).join(' | '), que: 'Uno de los nueve estados comunes. Así todos los equipos se miden con las mismas reglas.' },
      ],
    },
    {
      id: 'equipo', nombre: 'Equipo', clave: ['equipo_id'], fuente: 'Configuración firmada con el cliente.', quien: 'Consultor y cliente',
      campos: [
        { campo: 'equipo_id', tipo: 'texto', que: 'Identificador común en todas las fuentes.' },
        { campo: 'tipo', tipo: 'interno | proveedor', que: 'Si el equipo es propio o de un proveedor.' },
        { campo: 'proveedor', tipo: 'texto', que: 'Nombre del proveedor, si lo es.' },
        { campo: 'area', tipo: 'texto', que: 'Grupo de nivel superior (área, tribu, producto).' },
        { campo: 'usa_sprints', tipo: 'sí o no', que: 'Si trabaja por sprints.' },
      ],
    },
    {
      id: 'capacidad', nombre: 'Capacidad', clave: ['equipo_id', 'mes'], fuente: 'Herramienta de plantilla (headcount) o contrato del proveedor.', quien: 'Recursos humanos, compras o el propio equipo',
      campos: [
        { campo: 'fte', tipo: 'número', que: 'Personas equivalentes a jornada completa ese mes.' },
        { campo: 'origen', tipo: 'contrato | declarado | estimado', que: 'De dónde sale la cifra. Se muestra siempre al lado.' },
      ],
    },
    {
      id: 'coste', nombre: 'Coste', clave: ['equipo_id', 'mes'], fuente: 'Finanzas (coste interno cargado) o contrato del proveedor (tarifa).', quien: 'Finanzas o compras',
      campos: [
        { campo: 'coste_fte_mes', tipo: 'euros', que: 'Lo que cuesta al mes un FTE de ese equipo.' },
        { campo: 'tipo_coste', tipo: 'interno | tarifa', que: 'Coste interno cargado o tarifa de proveedor.' },
      ],
      nota: 'Es un dato de equipo: nunca el salario de una persona.',
    },
    {
      id: 'iniciativa', nombre: 'Iniciativa de mejora', clave: ['iniciativa_id'], fuente: 'Oficina de productividad.', quien: 'Consultor con el cliente',
      campos: [
        { campo: 'equipos', tipo: 'lista de equipo_id', que: 'Equipos en los que se prueba.' },
        { campo: 'fecha_inicio, fecha_fin', tipo: 'fechas', que: 'Cuándo empieza y, si acaba, cuándo.' },
        { campo: 'medidas_objetivo', tipo: 'lista de medida y dirección', que: 'Qué medida debe moverse y hacia dónde.' },
      ],
    },
    {
      id: 'semana', nombre: 'Calendario', clave: ['semana'], fuente: 'Generado.', quien: 'Automático',
      campos: [{ campo: 'semana', tipo: 'fecha (lunes)', que: 'Unidad de tiempo de todas las series.' }, { campo: 'mes', tipo: 'año y mes', que: 'Para unir con capacidad y coste.' }],
    },
  ];
  const relaciones: RelacionModelo[] = [
    { desde: 'tarea', hacia: 'equipo', cardinalidad: 'muchas a uno', por: 'equipo_id' },
    { desde: 'tarea', hacia: 'estado', cardinalidad: 'muchas a uno', por: 'estado_origen' },
    { desde: 'tarea', hacia: 'semana', cardinalidad: 'muchas a uno', por: 'fecha_terminada (y fecha_creada para lo que entra)' },
    { desde: 'capacidad', hacia: 'equipo', cardinalidad: 'muchas a uno', por: 'equipo_id, una fila por mes' },
    { desde: 'coste', hacia: 'equipo', cardinalidad: 'muchas a uno', por: 'equipo_id, una fila por mes' },
    { desde: 'capacidad', hacia: 'coste', cardinalidad: 'uno a uno', por: 'equipo_id y mes' },
    { desde: 'iniciativa', hacia: 'equipo', cardinalidad: 'muchas a muchas', por: 'equipos' },
  ];
  const medidas: MedidaModelo[] = cat.ordenMedidas.map((id) => {
    const m = cat.medidas[id];
    return {
      id, nombre: m.nombre, pregunta: m.pregunta, definicion: m.como, unidad: m.unidad, formato: m.formato,
      mejor: m.dir === 'mas' ? 'más alto' : m.dir === 'menos' ? 'más bajo' : null,
      necesita: ['tarea', 'estado'].concat(m.requiere ? [NECESITA[m.requiere] || m.requiere] : []),
      nivel: 'equipo y semana; el área se calcula con todas sus tareas, nunca como media de equipos',
      comparableEntreGrupos: COMPARABLES.has(id),
    };
  });
  medidas.push(
    {
      id: 'throughput', nombre: 'Throughput / FTE', pregunta: '¿Cuánto termina cada persona equivalente del equipo?',
      definicion: 'Tareas terminadas al mes (media de las últimas 4 semanas) entre el FTE del equipo.', unidad: 'tareas al mes por FTE', formato: 'num',
      mejor: 'más alto', necesita: ['tarea', 'capacidad'], nivel: 'equipo y mes; el área suma tareas y FTE', comparableEntreGrupos: true,
      nota: 'Depende del tamaño de las tareas: entre grupos se lee junto al reparto por tipo y tamaño.',
    },
    {
      id: 'coste_mes', nombre: 'Coste del equipo al mes', pregunta: '¿Cuánto cuesta el equipo?',
      definicion: 'FTE del mes por el coste mensual de un FTE de ese equipo.', unidad: 'euros al mes', formato: 'eur',
      mejor: null, necesita: ['capacidad', 'coste'], nivel: 'equipo y mes; el área suma', comparableEntreGrupos: false,
    },
    {
      id: 'coste', nombre: 'Coste por entrega', pregunta: '¿Cuánto cuesta cada tarea terminada?',
      definicion: 'Coste del equipo al mes entre las tareas terminadas al mes (media de las últimas 4 semanas). Las descartadas no cuentan.', unidad: 'euros por tarea', formato: 'eur',
      mejor: 'más bajo', necesita: ['tarea', 'capacidad', 'coste'], nivel: 'equipo y mes; el área divide el coste total entre todas sus tareas', comparableEntreGrupos: true,
      nota: 'Una tarea no es una unidad fija de trabajo. Sirve para ver la tendencia de un equipo y, entre grupos, solo con un reparto de trabajo parecido.',
    },
  );
  return {
    version: 1,
    nombre: 'Modelo de medida de Easy Performance',
    generado: (opciones.generado || new Date()).toISOString(),
    para_que: 'Especificación de las definiciones comunes para montarlas en cualquier herramienta: esta página para el piloto, o la plataforma de datos del cliente para escalar a cientos de equipos con conectores.',
    reglas: [
      'Solo se mide a equipos. Nunca a personas: el modelo no tiene campos de personas.',
      'Cada medida se compara con la historia del propio equipo: últimas 4 semanas para plazos y entregas, 8 para porcentajes, frente a las 12 semanas anteriores.',
      'Bien: dentro de lo habitual (percentiles 15 a 85) con un margen del 10%. Atención: hasta un 25% peor. Crítico: más.',
      'Las cifras del área salen de todas sus tareas juntas, nunca de medias de equipos.',
      'Una definición se cambia primero en el documento de definiciones firmado y después en el modelo.',
    ],
    entidades,
    relaciones,
    medidas,
    comparaciones: [
      'Internos frente a proveedores, entre proveedores y entre equipos de una misma área.',
      'Solo medidas que no dependen del tamaño del equipo; nunca volumen bruto.',
      'Lo terminado se compara dentro del mismo tipo y tamaño de tarea, en las últimas ' + SEMANAS_COMPARACION + ' semanas.',
      'Celdas con menos de ' + MUESTRA_MINIMA + ' tareas: "pocos datos". Una diferencia cuenta si es clara (z de 2 o más) y de un ' + Math.round(DIFERENCIA_MINIMA * 100) + '% o más.',
    ],
    iniciativas: [
      'Antes y después con la misma ventana, empezando ' + Math.round(LATENCIA_DIAS / 7) + ' semanas después del inicio.',
      'Los equipos sin la iniciativa sirven de control (diferencia de diferencias).',
      'Confianza alta, media o baja según la muestra y la variabilidad del equipo. Indica si merece seguir, no demuestra la causa.',
    ],
    despliegue: [
      { fase: 'Arranque y piloto', como: 'Esta página: un fichero HTML que lee los exports de una carpeta y calcula en el navegador, sin servidor.', volumen: 'Probado hasta 200 equipos y 62.000 tareas al año (unos 1.000 FTE): unos 13 segundos de carga en un portátil.' },
      { fase: 'Escala', como: 'Las mismas entidades, uniones y medidas en la plataforma de datos del cliente, alimentadas por conectores con su herramienta de gestión, de plantilla y de finanzas.', volumen: 'Cientos de equipos y miles de desarrolladores.' },
    ],
    requisitos_para_escalar: [
      'Un identificador de equipo común en la herramienta de gestión, en la de plantilla y en finanzas. Es lo que suele faltar y lo que da valor a la unión de datos.',
      'Mapeo de estados firmado por cada herramienta de gestión.',
      'FTE y coste por equipo y mes, con su origen.',
      'Un responsable del modelo en el cliente que apruebe los cambios de definición.',
      'Criterio de ticket bien definido acordado (rúbrica de ' + Object.keys(RUBRICA.criterios).length + ' criterios).',
    ],
  };
}
