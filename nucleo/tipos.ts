// Tipos de la detección y de los resultados del cálculo. Los datos de entrada están en modelo.ts.

import type { Aviso, CampoAgrupador, Etapa, EstadoNormalizado, Limites, Tarea } from './modelo.ts';

export type * from './modelo.ts';

export type Semaforo = 'bien' | 'atencion' | 'critico' | 'sin' | 'neutro';
export type Gravedad = 'critico' | 'atencion';
export type Confianza = 'alta' | 'media' | 'baja';

export interface EstadoDetectado {
  nombre: string;
  actuales: number;
  visitas: number;
  categoria: string;
  horasMedias: number | null;
  estado: EstadoNormalizado;
  etapa: Etapa;
  bloqueo: boolean;
}

export interface OpcionEquipoDetectada {
  id: string;
  nombre: string;
  valores: { valor: string; n: number }[];
  cobertura: number;
  valida: boolean;
  puntuacion: number;
}

export interface Deteccion {
  plataforma: string;
  avisos: Aviso[];
  fechaMin: Date;
  fechaMax: Date;
  fechaRef: Date;
  hayTiempos: boolean;
  estados: EstadoDetectado[];
  /** Mapeo propuesto: estado de origen -> estado normalizado. */
  mapeoEstados: Record<string, EstadoNormalizado>;
  /** Campos por los que el adaptador sabe reconocer equipos. */
  camposEquipo: CampoAgrupador[];
  opcionesEquipo: OpcionEquipoDetectada[];
  equipoRecomendado: string;
  haySprints: boolean;
  sprintsComoFecha: boolean;
}

export interface ConfigCalculo {
  semanasActuales?: number;
  semanasProporciones?: number;
  semanasReferencia?: number;
  /** Mapeo del cliente: estado de origen -> estado normalizado. Manda sobre la propuesta. */
  mapeoEstados?: Record<string, EstadoNormalizado>;
  /** Mapeo de la v0 (estado -> etapa). Solo para leer cliente.json antiguos; se convierte a mapeoEstados. */
  etapas?: Record<string, Etapa>;
  campoEquipo?: string;
  equipos?: string[];
  /** Visión del área: los equipos incluidos se tratan como uno solo con este nombre. */
  unirComo?: string;
  limites?: Record<string, Record<string, Limites>>;
  fte?: Record<string, number>;
}

/** Datos derivados de cada tarea dentro del cálculo. */
export interface Derivada {
  t: Tarea;
  equipo: string;
  estado: EstadoNormalizado;
  etapa: Etapa;
  cursoMs: number;
  esperaMs: number;
  porEstado: Record<string, number>;
  entregada: boolean;
  descartada: boolean;
  conTiempos: boolean;
  salto?: boolean;
  ciclo?: number;
  inicio?: Date | null;
  total?: number;
  retrabajo: boolean;
  primeraH: number | null;
}

export interface Rango { lo: number; hi: number; med: number; n: number }

export interface Tendencia { sentido: 'estable' | 'sube' | 'baja' | 'mejora' | 'empeora'; cambio: number; sube?: boolean }

export interface MedidaCalculada {
  id: string;
  disponible: boolean;
  motivo?: string | null;
  falta?: string;
  valor?: number | null;
  serie?: (number | null)[] | null;
  ventana?: number;
  ref?: Rango;
  tendencia?: Tendencia | null;
  estado?: Semaforo;
  estadoTexto?: string;
}

export interface Series {
  entregas: number[];
  entradas: number[];
  salidas: number[];
  pendiente: number[];
  wip: number[];
  velocidad: number[];
  pendienteEdad: (number | null)[];
  entregasMedia: (number | null)[];
  ciclo85: (number | null)[];
  ciclo50: (number | null)[];
  total85: (number | null)[];
  espera: (number | null)[];
  errores: (number | null)[];
  retrabajo: (number | null)[];
  arrastradas: (number | null)[];
  regularidad: (number | null)[];
  estimacion: (number | null)[];
  primera85: (number | null)[];
  velocidadMedia: (number | null)[];
  reparto: (Record<string, number> | null)[];
}

export interface SprintResumen {
  nombre: string;
  tareas: number;
  arrastre: number | null;
  alFinal: number | null;
  cerradas: number;
  fin: Date;
}

export interface InfoSprints { fiables: boolean; motivo: string | null; ultimos: SprintResumen[] }

/** Tarea en curso. "clave" y "resumen" solo se usan en pantalla; nunca van al paquete de diagnóstico. */
export interface TareaEnCurso { clave: string; resumen: string; estado: string; etapa: Etapa; edad: number }

export interface Negocio {
  n: number;
  ciclo50: number | null;
  ciclo85: number | null;
  total50: number | null;
  total85: number | null;
  epicas: { nombre: string; n: number; parte: number }[];
  urgente: { n: number; mediana: number | null };
  resto: { n: number; mediana: number | null };
}

export interface CierreEnBloque { fecha: Date; n: number }

export interface CalidadEquipo {
  saltos: number;
  saltosParte: number;
  sinPuntos: number;
  historias: number;
  cierresBloque: CierreEnBloque[];
  avisos: string[];
}

export interface CicloTarea { clave: string; resumen: string; dias: number; fecha: Date; puntos: number | null }

export interface CasoActivo {
  id: string;
  gravedad: Gravedad;
  confianza: Confianza;
  evidencia: string;
  datos: Record<string, unknown>;
}

export interface ResultadoEquipo {
  nombre: string;
  n: number;
  entregadas: number;
  series: Series;
  medidas: Record<string, MedidaCalculada>;
  atascadas: TareaEnCurso[];
  enCurso: TareaEnCurso[];
  umbralEdad: number | null;
  sprints: InfoSprints;
  semanasConDatos: number;
  kpis: Record<string, MedidaCalculada>;
  negocio: Negocio;
  calidad: CalidadEquipo;
  ciclos: CicloTarea[];
  casos: CasoActivo[];
}

export interface Modelo {
  fechaRef: Date;
  semanas: Date[];
  semanaFin: Date;
  equipos: ResultadoEquipo[];
  cierresBloque: CierreEnBloque[];
}

/** Contexto compartido por los cálculos de cada equipo. */
export interface ContextoCalculo {
  semanas: Date[];
  N: number;
  finDe: (w: number) => Date;
  semanaDe: (d: Date | null) => number;
  semanaFin: Date;
  fechaRef: Date;
  K: number;
  KP: number;
  R: number;
  det: Deteccion;
  cfg: ConfigCalculo;
  cierresBloque: CierreEnBloque[];
}
