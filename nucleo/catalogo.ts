// Carga del catálogo desde catalogo/*.json. El catálogo es contenido: se edita sin tocar el código.
// En B2 se añaden los esquemas JSON y la validación.

import medidasJson from '../catalogo/medidas.json' with { type: 'json' };
import casosJson from '../catalogo/casos.json' with { type: 'json' };
import objetivosJson from '../catalogo/objetivos.json' with { type: 'json' };
import textosJson from '../catalogo/textos.json' with { type: 'json' };
import vistasJson from '../catalogo/vistas.json' with { type: 'json' };
import estadosJson from '../catalogo/estados.json' with { type: 'json' };
import type { Etapa, EstadoNormalizado, Limites } from './modelo.ts';

export type Requisito = 'tiempos' | 'inicio' | 'puntos' | 'errores' | 'primera' | 'sprints' | 'api' | 'descripcion';

export interface MedidaDef {
  nombre: string;
  pregunta: string;
  unidad: string;
  /** 'menos': mejor cuanto más bajo; 'mas': mejor cuanto más alto; null: sin semáforo. */
  dir: 'mas' | 'menos' | null;
  formato: string;
  requiere?: Requisito;
  como: string;
  /** Qué decisión dispara cuando cambia y quién la toma. */
  decision?: string;
  quien?: string;
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

export interface EstadoDef { nombre: string; etapa: Etapa; descripcion: string }
export interface ReglaEstado { estado: EstadoNormalizado; patron: string; categoria?: string }
export interface CatalogoEstados {
  version: number;
  estados: Record<EstadoNormalizado, EstadoDef>;
  /** Reglas en orden sobre el nombre del estado (sin acentos y en minúsculas); gana la primera. */
  reglas: ReglaEstado[];
  /** Si ninguna regla encaja, se mira la categoría de estado de la plataforma. */
  porCategoria: { patron: string; estado: EstadoNormalizado }[];
  porDefecto: EstadoNormalizado;
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
  estados: CatalogoEstados;
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
  estados: estadosJson as CatalogoEstados,
};

// ---------- idioma del catálogo (v3) ----------
// Los ficheros de catalogo/ están en inglés. catalogo/es/ tiene los mismos ficheros con solo los textos en castellano.
// aplicarIdiomaCatalogo cambia los textos en el sitio: CATALOGO y RUBRICA siguen siendo los mismos objetos.
import medidasEs from '../catalogo/es/medidas.json' with { type: 'json' };
import casosEs from '../catalogo/es/casos.json' with { type: 'json' };
import objetivosEs from '../catalogo/es/objetivos.json' with { type: 'json' };
import textosEs from '../catalogo/es/textos.json' with { type: 'json' };
import vistasEs from '../catalogo/es/vistas.json' with { type: 'json' };
import estadosEs from '../catalogo/es/estados.json' with { type: 'json' };
import rubricaJson from '../catalogo/rubrica_agent_ready.json' with { type: 'json' };
import rubricaEs from '../catalogo/es/rubrica_agent_ready.json' with { type: 'json' };

const FUENTES: [unknown, unknown][] = [
  [medidasJson, medidasEs], [casosJson, casosEs], [objetivosJson, objetivosEs], [textosJson, textosEs],
  [vistasJson, vistasEs], [estadosJson, estadosEs], [rubricaJson, rubricaEs],
];
const INGLES = FUENTES.map(([en]) => structuredClone(en));

/** Copia en destino los textos de base y, encima, los de traduccion. Solo toca cadenas; nunca cambia la estructura. */
function fusionar(destino: any, base: any, traduccion: any): void {
  if (Array.isArray(base)) {
    base.forEach((v, i) => {
      const t = Array.isArray(traduccion) ? traduccion[i] : undefined;
      if (typeof v === 'string') destino[i] = typeof t === 'string' ? t : v;
      else if (v && typeof v === 'object') fusionar(destino[i], v, t);
    });
    return;
  }
  for (const k of Object.keys(base)) {
    const v = base[k], t = traduccion && typeof traduccion === 'object' ? traduccion[k] : undefined;
    if (typeof v === 'string') destino[k] = typeof t === 'string' ? t : v;
    else if (v && typeof v === 'object') fusionar(destino[k], v, t);
  }
}

export function aplicarIdiomaCatalogo(idioma: 'es' | 'en'): void {
  FUENTES.forEach(([destino, es], i) => fusionar(destino, INGLES[i], idioma === 'es' ? es : null));
}

/** Textos del catálogo en castellano, tal cual (para comprobar que no falta ninguno). */
export const CATALOGO_ES = { medidas: medidasEs, casos: casosEs, objetivos: objetivosEs, textos: textosEs, vistas: vistasEs, estados: estadosEs, rubrica: rubricaEs };
export const CATALOGO_EN = { medidas: INGLES[0], casos: INGLES[1], objetivos: INGLES[2], textos: INGLES[3], vistas: INGLES[4], estados: INGLES[5], rubrica: INGLES[6] };
