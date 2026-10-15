// Carga del catálogo desde catalogo/*.json. El catálogo es contenido: se edita sin tocar el código.
// En B2 se añaden los esquemas JSON y la validación.

import medidasJson from '../catalogo/medidas.json' with { type: 'json' };
import casosJson from '../catalogo/casos.json' with { type: 'json' };
import objetivosJson from '../catalogo/objetivos.json' with { type: 'json' };
import textosJson from '../catalogo/textos.json' with { type: 'json' };
import vistasJson from '../catalogo/vistas.json' with { type: 'json' };
import type { Limites } from './tipos.ts';

export type Requisito = 'tis' | 'inicio' | 'puntos' | 'errores' | 'primera' | 'sprints' | 'api';

export interface MedidaDef {
  nombre: string;
  pregunta: string;
  unidad: string;
  /** 'menos': mejor cuanto más bajo; 'mas': mejor cuanto más alto; null: sin semáforo. */
  dir: 'mas' | 'menos' | null;
  formato: string;
  requiere?: Requisito;
  como: string;
  limites?: Limites;
}

/** Lo mínimo que necesita el semáforo de una medida. */
export interface DefSemaforo { dir: 'mas' | 'menos' | null; formato: string; limites?: Limites }

export interface PasoPlan { paso: string; quien: string; esfuerzo: string }

export interface CasoDef {
  accionArea: string;
  comun: string;
  titulo: string;
  objetivos: string[];
  medida: string | null;
  requiere?: Requisito;
  senal: string;
  causas: string[];
  preguntas: string[];
  plan: PasoPlan[];
  comprobar: string;
  respaldo: string;
}

export interface ObjetivoDef {
  id: string;
  titulo: string;
  frase: string;
  medidas: string[];
  casos: string[];
  fijo?: boolean;
}

export interface Catalogo {
  version: number;
  medidas: Record<string, MedidaDef>;
  ordenMedidas: string[];
  casos: Record<string, CasoDef>;
  objetivos: ObjetivoDef[];
  textos: Record<string, string>;
  perfiles: typeof vistasJson.perfiles;
  graficos: typeof vistasJson.graficos;
  kpis: typeof vistasJson.kpis;
}

export const CATALOGO: Catalogo = {
  version: medidasJson.version,
  medidas: medidasJson.medidas as Record<string, MedidaDef>,
  ordenMedidas: medidasJson.orden,
  casos: casosJson.casos as Record<string, CasoDef>,
  objetivos: objetivosJson.objetivos as ObjetivoDef[],
  textos: textosJson.textos as Record<string, string>,
  perfiles: vistasJson.perfiles,
  graficos: vistasJson.graficos,
  kpis: vistasJson.kpis,
};
