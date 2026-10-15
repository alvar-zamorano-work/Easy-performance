# Easy Performance v1: acelerador

Acelerador para el consultor de Capgemini que entra en un proyecto de medición y mejora de la productividad de equipos de desarrollo. El plan completo está en el proyecto de Claude (claude/plan-v1-acelerador.md).

La v0 (carpetas easy-performance y easy-performance-v2) no se toca. La carcasa web de B5 (dist/EasyPerformance) ya cubre todo lo de la v0 y añade lo nuevo.

## Estructura

| Carpeta | Qué hay |
|---|---|
| nucleo/ | Motor en TypeScript, sin interfaz y sin saber de qué plataforma vienen los datos. modelo.ts es el modelo neutro. |
| adaptadores/ | Convierten un export al modelo neutro. Hoy: Jira CSV. Todo lo propio de Jira (columnas, ids de estado, unidad del Tiempo en estado) vive aquí. |
| catalogo/ | Contenido editable en JSON: medidas, casos, objetivos, textos, vistas y estados normalizados con sus reglas. |
| esquemas/ | Esquemas JSON del modelo (tarea, equipo, iniciativa, contexto, cliente) y del catálogo, y el validador. |
| datos-sinteticos/ | Exports sintéticos de la v0 con problemas sembrados, una carpeta de cliente de ejemplo y b3/: dos equipos internos y dos de proveedores, dos iniciativas y descripciones de calidad conocida (lo sembrado está en b3/escenarios.json). |
| datos-prueba/ | Exports de prueba que no son de cliente, cada uno con su .esperado.json. |
| tests/ | Tests con node:test. tests/referencia-v0 guarda el motor de la v0 sin cambios; tests/banco genera variantes de exports. |
| herramientas/ | Generadores de datos sintéticos (el de la v0 en Python y el de B3 en TypeScript) y resumen del núcleo por consola. |
| web/, skill/ | Carcasa web (B5) y skill de IA (B6). |

## Cómo fluyen los datos

1. El adaptador lee el export y devuelve una Lectura: tareas en el modelo neutro, estados de origen, campos por los que se puede reconocer el equipo y un mapeo de estados propuesto.
2. La detección propone fecha de referencia, mapeo de estados, campo de equipo y si los sprints son fiables.
3. El cliente firma el mapeo y los equipos en cliente.json. El cálculo usa ese mapeo; si no hay, la propuesta.
4. diagnosticar() hace el recorrido completo: medidas por equipo y del área, comparaciones entre grupos, casos, iniciativas, agent readiness y paquete de diagnóstico.

## Qué calcula el núcleo (B3)

- Comparaciones entre grupos: internos frente a proveedores, entre proveedores y entre equipos de un área. Solo medidas normalizadas (plazo p80, retrabajo, reaperturas, bloqueo, arrastre entre sprints, antigüedad del pendiente, Throughput / FTE, agent readiness). Las medidas de lo terminado se comparan dentro del mismo tipo y tamaño de tarea con una prueba estratificada; una diferencia cuenta si es clara (z de 2 o más) y relevante (25% o más). Celdas con menos de 20 tareas: "pocos datos".
- Iniciativas: antes y después con dos semanas de latencia, los equipos que no participan como control, diferencia de diferencias y confianza según la muestra y la variabilidad histórica.
- Agent readiness: índice de 0 a 5 por ticket con catalogo/rubrica_agent_ready.json. Fuera solo salen agregados.
- Paquete de diagnóstico: solo agregados. comprobarPaquete rechaza títulos, descripciones, claves de ticket, campos de personas, textos largos y los nombres que se le indiquen; se pueden usar alias para los equipos.

## Carcasa web (B5)

Un solo HTML que se abre con doble clic, sin servidor ni instalación. Reutiliza la interfaz de la v0 (presentación, onboarding de cinco pasos, vistas por perfil, modo oscuro, impresión) y se apoya en el núcleo de este repositorio, empaquetado dentro del HTML.

- Pestañas nuevas: Comparar (internos frente a proveedores, entre proveedores y entre equipos de un área), Iniciativas (antes y después, efecto y confianza, alta de iniciativas) y Agentes (agent readiness por equipo y por criterio). Las dos primeras salen en el perfil de dirección; Agentes, cuando hay descripciones.
- Ajustes: FTE con su origen, tipo de equipo (interno o proveedor), proveedor y área, y exportación del paquete de diagnóstico con alias opcionales.
- Carpeta compartida: exports/, configuracion/, iniciativas/ (un JSON por iniciativa), contexto/, historico/ y diagnostico/. actualizar.ps1 la vuelca a exports/datos.js para abrirla sin permisos de carpeta.
- Demo: un banco ficticio con dos equipos internos y dos de proveedores (los datos sintéticos de B3).

`npm run web` genera dist/EasyPerformance. `npm run verificar-web` la recorre con Chromium (presentación y vistas sin scroll en 1280x720 y 1920x1080, sin errores de consola, modo oscuro, Jira.csv de principio a fin, paquete, PDF, demo y carpeta con iniciativas) y deja capturas en dist/verificacion. Ajustes es una página de formularios y puede tener scroll.

Pendiente de probar: actualizar.ps1 en Windows.

## Requisitos

Node 22.18 o posterior (ejecuta TypeScript sin compilar). Python 3 solo para regenerar los datos sintéticos. Para verificar-web, Chrome o Chromium instalado (o su ruta en la variable CHROME).

## Comandos

```
npm install          # TypeScript, tipos de Node y Ajv (solo para comprobar tipos y esquemas)
npm test             # tests (siempre con hora de Madrid)
npm run tipos        # comprobación de tipos
npm run comprobar    # tipos y tests
npm run probar       # resumen por equipo del export sintético completo
npm run datos        # regenera los CSV sintéticos de la v0 (deben salir idénticos)
npm run datos-b3     # regenera los datos sintéticos de B3 (deben salir idénticos)
npm run web          # genera la carcasa web en dist/EasyPerformance
npm run verificar-web  # recorre la carcasa con Chromium y guarda capturas
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
- B2 (modelo neutro, esquemas, adaptador Jira, banco de exports): hecho.
- B3 (comparaciones entre grupos, iniciativas, agent readiness, paquete de diagnóstico): hecho.
- B5 (carcasa web): en la rama feat/b5-web. Se adelantó a B4 para tener pronto el HTML con la experiencia de la v0.
- Siguiente: B4, arranque del consultor (ingesta, mapeo editable de estados normalizados, chequeo de calidad y documento de definiciones), ya dentro de esta carcasa.
