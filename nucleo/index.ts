// Punto de entrada del núcleo y de los adaptadores.

export { leerJira } from '../adaptadores/jira/ingerir.ts';
export { detectar, valorEquipo, TODOS } from './detectar.ts';
export { calcular } from './calcular.ts';
export { proponerEstado, etapaDe, etapasV0AMapeo } from './estados.ts';
export { formatear, fechaCorta } from './formato.ts';
export { CATALOGO } from './catalogo.ts';
export type * from './tipos.ts';
export type { Catalogo, CasoDef, MedidaDef, ObjetivoDef, CatalogoEstados } from './catalogo.ts';
export { migrarClienteV0, configDesdeCliente, equiposDetectados } from './cliente.ts';
export type { ClienteV0, ClienteV2 } from './cliente.ts';
