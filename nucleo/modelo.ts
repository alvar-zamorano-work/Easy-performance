// Modelo de datos neutro (plan, apartado 5). Los adaptadores convierten cada plataforma a este modelo
// y el núcleo no sabe de qué plataforma vienen los datos. Esquemas JSON en esquemas/modelo/.
// Regla fija: nunca hay campos de personas (asignado, creador, comentarios con nombres).

export type TipoTarea = 'historia' | 'error' | 'tarea' | 'subtarea' | 'epica' | 'otro';
export type EstadoNormalizado =
  | 'nuevo' | 'pendiente' | 'en_curso' | 'bloqueado' | 'en_revision' | 'en_pruebas' | 'en_espera' | 'terminado' | 'descartado';
export type Etapa = 'pendiente' | 'curso' | 'espera' | 'hecho';
export type Prioridad = 'baja' | 'media' | 'alta' | 'urgente';

/** Tiempo acumulado en un estado de origen (por ejemplo, el campo "Tiempo en estado" de Jira). */
export interface TiempoEnEstado { estado: string; visitas: number; ms: number }

/** Cambio de estado con fecha, cuando la plataforma lo da (historial o API). */
export interface CambioEstado { estado: string; fecha: Date }

export interface FechasTarea {
  creada: Date;
  actualizada: Date | null;
  /** Inicio del trabajo, solo si la plataforma lo da de forma explícita. Si no, el núcleo lo deduce. */
  empezada: Date | null;
  terminada: Date | null;
  /** Cuándo entró la tarea en su estado (o categoría de estado) actual. */
  cambio_estado: Date | null;
  primera_respuesta: Date | null;
}

export interface Tarea {
  id: string;
  clave_origen: string;
  plataforma: string;
  tipo: TipoTarea;
  tipo_origen: string;
  /** Solo en memoria: nunca va al paquete de diagnóstico ni a ficheros derivados. */
  titulo: string;
  /** Solo en memoria, para agent readiness. Nunca sale del navegador. */
  descripcion: string;
  estado_origen: string;
  /** Propuesta del adaptador para esta tarea. El mapeo del cliente (cliente.json) manda sobre ella. */
  estado_normalizado: EstadoNormalizado;
  /** Campos por los que se puede reconocer el equipo (equipo, componente, proyecto, etiqueta...). */
  agrupadores: Record<string, string>;
  /** Equipo asignado según la configuración del cliente. null hasta que se elige cómo reconocer equipos. */
  equipo_id: string | null;
  prioridad: Prioridad | null;
  prioridad_origen: string;
  estimacion: number | null;
  /** Sprints por los que ha pasado, en orden; el último es el actual. */
  sprints: string[];
  fechas: FechasTarea;
  historial_estados: CambioEstado[];
  tiempos_estado: TiempoEnEstado[];
  /** Cerrada sin hacer según la plataforma (resolución "duplicado", "no se hará"...). */
  descartada: boolean;
  /** Reaperturas cuando la plataforma las da; null si hay que deducirlas de los tiempos por estado. */
  reaperturas: number | null;
  etiquetas: string[];
  enlaces: number;
  tiene_criterios: boolean;
  padre_id: string | null;
  /** Solo en memoria, para agrupar por épica en pantalla. */
  padre_titulo: string;
}

export interface FteEnPeriodo { periodo: string; valor: number; origen: 'contrato' | 'declarado' | 'estimado' }
export interface Limites { atencion?: number | null; critico?: number | null }

export interface Equipo {
  id: string;
  nombre: string;
  tipo: 'interno' | 'proveedor';
  proveedor: string | null;
  area: string | null;
  usa_sprints: boolean;
  fte: FteEnPeriodo[];
  limites: Record<string, Limites>;
}

export interface MedidaObjetivo { medida: string; direccion: 'subir' | 'bajar' }

export interface Iniciativa {
  id: string;
  nombre: string;
  descripcion: string;
  fecha_inicio: string;
  fecha_fin: string | null;
  equipos: string[];
  medidas_objetivo: MedidaObjetivo[];
  efecto_esperado: string;
  estado: 'planificada' | 'en_curso' | 'evaluada' | 'descartada';
  origen: string;
  evaluacion: unknown;
  notas: string;
}

export type CategoriaContexto = 'metodo' | 'organizacion' | 'stack' | 'contratos' | 'otro';
export interface DocumentoContexto { categoria: CategoriaContexto; titulo: string; resumen: string; fuente: string; fecha: string }
export interface Contexto { documentos: DocumentoContexto[] }

/** Un campo por el que se puede reconocer el equipo, tal como lo declara el adaptador. */
export interface CampoAgrupador { id: string; nombre: string; peso: number }

/** Información de cada estado de origen que ve el adaptador. */
export interface EstadoOrigen { nombre: string; categoria: string }

export interface Aviso { tipo: 'aviso' | 'error'; texto: string }

export interface FicheroEntrada { nombre: string; texto: string }

export interface InformeIngesta {
  plataforma: string;
  ficheros: { nombre: string; filas: number; columnas: number; columnasConDatos: number }[];
  avisos: Aviso[];
  filasLeidas: number;
  duplicadas: number;
  epicas: number;
  subtareas: number;
  sinClave: number;
  campos: Record<string, true | 'vacio'>;
  tareas: number;
  /** Tareas sin fecha de creación legible: no se pueden medir y se cuentan aparte para que no se pierdan sin aviso. */
  sinFecha?: number;
  /** Cómo se han leído las fechas numéricas (día/mes o mes/día), cuando el fichero las trae así. */
  ordenFechas?: 'dm' | 'md';
  /** Ficheros que no se han podido leer porque falta una columna obligatoria: sus títulos, para elegirla a mano. */
  columnasPendientes?: { fichero: string; cabecera: string[]; faltan: string[] }[];
}

/** Lo que devuelve cualquier adaptador: tareas en el modelo neutro y lo que sabe del origen. */
export interface Lectura {
  plataforma: string;
  tareas: Tarea[];
  informe: InformeIngesta;
  estados: EstadoOrigen[];
  camposEquipo: CampoAgrupador[];
  mapeoPropuesto: Record<string, EstadoNormalizado>;
  /** Detalle propio de la plataforma (por ejemplo, unidad del Tiempo en estado de Jira). */
  detalle: Record<string, unknown>;
}
