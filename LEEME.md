# Easy Performance v1: acelerador

Acelerador para el consultor de Capgemini que entra en un proyecto de medición y mejora de la productividad de equipos de desarrollo. El plan completo está en el proyecto de Claude (claude/plan-v1-acelerador.md).

La v0 (carpetas easy-performance y easy-performance-v2) sigue siendo la demo comercial hasta que el bloque B5 la supere. No se toca.

## Estructura

| Carpeta | Qué hay |
|---|---|
| nucleo/ | Motor en TypeScript, sin interfaz y sin saber de qué plataforma vienen los datos. modelo.ts es el modelo neutro. |
| adaptadores/ | Convierten un export al modelo neutro. Hoy: Jira CSV. Todo lo propio de Jira (columnas, ids de estado, unidad del Tiempo en estado) vive aquí. |
| catalogo/ | Contenido editable en JSON: medidas, casos, objetivos, textos, vistas y estados normalizados con sus reglas. |
| esquemas/ | Esquemas JSON del modelo (tarea, equipo, iniciativa, contexto, cliente) y del catálogo, y el validador. |
| datos-sinteticos/ | Exports sintéticos con problemas sembrados y una carpeta de cliente de ejemplo (cliente.json, iniciativas, contexto). |
| datos-prueba/ | Exports de prueba que no son de cliente, cada uno con su .esperado.json. |
| tests/ | Tests con node:test. tests/referencia-v0 guarda el motor de la v0 sin cambios; tests/banco genera variantes de exports. |
| herramientas/ | Generador de datos sintéticos y resumen del núcleo por consola. |
| web/, skill/ | Carcasa web (B5) y skill de IA (B6). |

## Cómo fluyen los datos

1. El adaptador lee el export y devuelve una Lectura: tareas en el modelo neutro, estados de origen, campos por los que se puede reconocer el equipo y un mapeo de estados propuesto.
2. La detección propone fecha de referencia, mapeo de estados, campo de equipo y si los sprints son fiables.
3. El cliente firma el mapeo y los equipos en cliente.json. El cálculo usa ese mapeo; si no hay, la propuesta.

## Requisitos

Node 22.18 o posterior (ejecuta TypeScript sin compilar). Python 3 solo para regenerar los datos sintéticos.

## Comandos

```
npm install          # TypeScript, tipos de Node y Ajv (solo para comprobar tipos y esquemas)
npm test             # tests (siempre con hora de Madrid)
npm run tipos        # comprobación de tipos
npm run comprobar    # tipos y tests
npm run probar       # resumen por equipo del export sintético completo
npm run datos        # regenera los CSV sintéticos (deben salir idénticos)
```

## Banco de exports

Comprueba que el mismo trabajo exportado de formas distintas da el mismo resultado, y que un export incompleto da los avisos y las medidas "sin datos" que tocan. Variantes que genera hoy a partir del export sintético: Jira en castellano, punto y coma con saltos de Windows, fechas numéricas, Tiempo en estado en segundos, sin Tiempo en estado, sin campo Equipo, sprints con nombre de fecha, export cortado, estados propios del cliente y ficheros que no son de Jira.

Para añadir un export real: anonimizarlo, dejarlo en datos-prueba/ y escribir a su lado un .esperado.json con lo que debe salir (ver Jira.esperado.json). La regresión contra la v0 y el banco lo recorren solos.

## Reglas de trabajo

- Nada de datos de cliente en el repositorio: solo sintéticos y exports de prueba que no son de cliente.
- Una rama por bloque; merge a main al cerrar el bloque con su evidencia.
- No se afirma que algo funciona sin haberlo ejecutado y visto la salida.
- Solo equipos, nunca personas: el modelo neutro no tiene campos de personas y un test lo comprueba.
- Textos en castellano llano y sin rayas.

## Estado

- B1 (núcleo en TypeScript): hecho. Mismos resultados que la v0.
- B2 (modelo neutro, esquemas, adaptador Jira, banco de exports): en la rama feat/b2-modelo-neutro.
- Siguiente: B3, novedades del núcleo (internos y proveedores, iniciativas, agent readiness, paquete de diagnóstico).
