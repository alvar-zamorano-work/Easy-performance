# Easy Performance v1: acelerador

Acelerador para el consultor de Capgemini que entra en un proyecto de medición y mejora de la productividad de equipos de desarrollo. El plan completo está en el proyecto de Claude (claude/plan-v1-acelerador.md).

La v0 (carpetas easy-performance y easy-performance-v2) sigue siendo la demo comercial hasta que el bloque B5 la supere. No se toca.

## Estructura

| Carpeta | Qué hay |
|---|---|
| nucleo/ | Motor en TypeScript, sin interfaz: detección, medidas, semáforo, sprints, calidad del dato, indicadores de comité y casos. |
| catalogo/ | Contenido editable en JSON: medidas, casos, objetivos, textos y vistas. Se cambia sin tocar código. |
| adaptadores/ | Lectura de exports al formato del núcleo. Hoy: Jira CSV. |
| datos-sinteticos/ | Exports sintéticos de la v0 (cuatro equipos, 52 semanas, problemas sembrados) y escenarios.json. |
| datos-prueba/ | Exports de prueba que no son de cliente. Los tests los recorren todos. |
| tests/ | Tests con node:test. tests/referencia-v0 guarda el motor de la v0 sin cambios para comparar. |
| herramientas/ | Generador de datos sintéticos y resumen del núcleo por consola. |
| web/, skill/ | Carcasa web (B5) y skill de IA (B6). Vacías en B1. |

## Requisitos

Node 22.18 o posterior (ejecuta TypeScript sin compilar). Python 3 solo para regenerar los datos sintéticos.

## Comandos

```
npm install          # instala TypeScript y los tipos de Node (solo para comprobar tipos)
npm test             # tests (siempre con hora de Madrid)
npm run tipos        # comprobación de tipos
npm run comprobar    # tipos y tests
npm run probar       # resumen por equipo del export sintético completo
npm run datos        # regenera los CSV sintéticos (deben salir idénticos)
```

## Reglas de trabajo

- Nada de datos de cliente en el repositorio: solo sintéticos y exports de prueba que no son de cliente.
- Una rama por bloque; merge a main al cerrar el bloque con su evidencia.
- No se afirma que algo funciona sin haberlo ejecutado y visto la salida.
- Solo equipos, nunca personas: no se leen columnas de personas.
- Textos en castellano llano y sin rayas.

## Estado

B1 (repositorio y núcleo): el motor de la v0 está en módulos TypeScript y da exactamente los mismos resultados que la v0 (comparación de JSON en todos los exports y configuraciones de los tests). Siguiente: B2, modelo neutro, esquemas del catálogo y adaptador Jira al modelo neutro.
