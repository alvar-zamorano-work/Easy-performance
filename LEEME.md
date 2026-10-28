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
| datos-sinteticos/ | Exports sintéticos de la v0 con problemas sembrados, una carpeta de cliente de ejemplo y b3/: dos equipos internos y dos de proveedores, dos iniciativas y descripciones de calidad conocida (lo sembrado está en b3/escenarios.json). Y fallos/: el export de B3 con un fallo sembrado por cada comprobación de fiabilidad (lista en fallos/escenarios.json). Y aseguradora/: cinco equipos distintos, export de Jira en castellano con el equipo en Componentes, columnas de personas y solo tres fallos (lista en aseguradora/escenarios.json). |
| datos-prueba/ | Exports de prueba que no son de cliente, cada uno con su .esperado.json. |
| tests/ | Tests con node:test. tests/referencia-v0 guarda el motor de la v0 sin cambios; tests/banco genera variantes de exports. |
| herramientas/ | Generadores de datos sintéticos (el de la v0 en Python, y los de B3, el export con fallos y la aseguradora en TypeScript) y resumen del núcleo por consola. |
| web/ | La página (un solo HTML, con su tutorial y el método animado). El módulo de IA vive en nucleo/ia.ts. |

## Cómo fluyen los datos

1. El adaptador lee el export y devuelve una Lectura: tareas en el modelo neutro, estados de origen, campos por los que se puede reconocer el equipo y un mapeo de estados propuesto.
2. La detección propone fecha de referencia, mapeo de estados, campo de equipo y si los sprints son fiables.
3. El cliente firma el mapeo y los equipos en cliente.json. El cálculo usa ese mapeo; si no hay, la propuesta.
4. diagnosticar() hace el recorrido completo: medidas por equipo y del área, comparaciones entre grupos, casos, iniciativas, agent readiness y paquete de diagnóstico.

## Qué calcula el núcleo (B3)

- Comparaciones entre grupos: internos frente a proveedores, entre proveedores y entre equipos de un área. Solo medidas normalizadas (plazo al 85%, el mismo del tablero, retrabajo, reaperturas, bloqueo, arrastre entre sprints, antigüedad del pendiente, Throughput / FTE, agent readiness). Las medidas de lo terminado se comparan dentro del mismo tipo y tamaño de tarea con una prueba estratificada; una diferencia cuenta si es clara (z de 2 o más) y relevante (25% o más). Celdas con menos de 20 tareas: "pocos datos".
- Iniciativas: antes y después con dos semanas de latencia, los equipos que no participan como control, diferencia de diferencias y confianza según la muestra y la variabilidad histórica.
- Agent readiness: índice de 0 a 5 por ticket con catalogo/rubrica_agent_ready.json. Fuera solo salen agregados.
- Paquete de diagnóstico: solo agregados. comprobarPaquete rechaza títulos, descripciones, claves de ticket, campos de personas, textos largos y los nombres que se le indiquen; se pueden usar alias para los equipos.

## La página (web/)

Un solo HTML que se abre con doble clic, sin servidor ni instalación. Desde el 28 oct 2026 (plan v2, claude/plan-v2-pasos.md) la página está en inglés y se organiza como los cuatro pasos del método de Capgemini, con funcionalidad real en cada uno; Settings aparte. Los pasos son la navegación, no una explicación.

- Arranque (antes del paso 1): Context, tres preguntas (qué mejorar, cómo trabajan los equipos, proveedores y coste) que deciden qué KPIs se enseñan y qué casos del banco se activan; se guarda por cliente y se edita en Setup > Context. Después el método animado y el Data check: veredicto Ready, Ready with limits (qué KPI no se puede calcular y por qué, fiabilidad media o baja) o Not ready (menos de 50 tareas, menos de la mitad con equipo, menos de 4 semanas), con el botón a Measure. Cada Update lo repite.
- Entrada: seis conectores (Jira en vivo, con CSV o carpeta; Azure DevOps, ServiceNow, GitLab y GitHub como conectores de demo etiquetados, que cargan los datos de ejemplo; otra herramienta con su adaptador), zona para soltar los exports y el tutorial. Al cargar datos se ve el método animado de seis etapas (Ingest, Teams, States, Quality, Capacity, Baseline) con las cifras reales del export; Esc lo salta y con "reducir movimiento" no se muestra.
- 1 Measure: Baseline (el área o un equipo: fiabilidad y equipos que necesitan atención, indicadores con tendencia, tabla de equipos, plazo semana a semana), Data (las diez comprobaciones de fiabilidad y cómo se ha leído el export) y Context (campo de equipo; proveedores, áreas, FTE y coste; mapeo de estados a los nueve comunes; documentos de contexto por categoría; el catálogo de KPIs en Word y markdown).
- 2 Analyze: señales (cifras fuera de lo normal, diferencias entre grupos, recomendaciones), el panel del asistente de IA, la lista ordenada de recomendaciones con su detalle (qué pasa, qué hacer primero, cifras, plan, cómo se sigue, preguntas y causas) y la comparación entre internos y proveedores con el mismo tipo y tamaño de tarea.
- 3 Improve and standardize: el plan de iniciativas (desde una recomendación o con "New initiative"; las registradas aquí se pueden quitar) y el bloque "The same rules for every team": cinco medidas, estados comunes, catálogo de KPIs y modelo de medida.
- 4 Learn and evolve: las iniciativas evaluadas con estado, cifras antes y después frente al resto, gráfico y "How it was evaluated" (seis pasos con las cifras reales), la lectura de la IA si se pide, y el bloque del siguiente ciclo (Update, cadencia semanal, mensual y trimestral).
- Settings: nombre del cliente, el asistente de IA (proveedor, modelo, clave y si se recuerda en el dispositivo; probar la conexión; olvidar la clave), qué está en vivo en esta copia (conectores marcados como demo, API como hoja de ruta), exportaciones (paquete de diagnóstico, catálogo, modelo) y datos de ejemplo.
- Asistente de IA (nucleo/ia.ts): recibe solo el paquete de diagnóstico (cifras agregadas, sin títulos, claves ni personas) y el catálogo. Tres usos: comprobar el mapeo de estados (solo nombres y recuentos), recomendaciones con evidencia citada (cada cifra se comprueba contra el paquete; lo que no cuadra se descarta; las que repiten un caso del banco se unen a él) y lectura del impacto de las iniciativas (cada número tiene que estar en la evaluación). La clave se manda como cabecera en cada llamada desde el navegador y vive en sessionStorage (o localStorage si se pide); nunca en cliente.json ni en ficheros. Sin clave, todo funciona igual con el banco de casos. Proveedor: Claude por defecto; la interfaz de proveedor admite otros. Evals: tests/ia.test.ts con proveedor falso; `npm run evaluar-ia` con la clave en ANTHROPIC_API_KEY (nunca en el código) sobre los tres paquetes sintéticos.
- Tutorial: once pasos por los cuatro bloques sobre la interfaz real. Avanza con Next o la flecha derecha, Back vuelve, Esc cierra. Sin datos cargados usa los de ejemplo.
- Datos de ejemplo: un banco ficticio (B3, en inglés: Payments, Risk, Mobile App de Vendor North y Customer Portal de Vendor South) con un año, dos iniciativas y costes inventados. Nunca tocan los datos reales ni la configuración.
- Carpeta compartida: exports/, configuracion/, iniciativas/ (un JSON por iniciativa), contexto/, historico/ y diagnostico/. actualizar.ps1 la vuelca a exports/datos.js para abrirla sin permisos de carpeta.

Código: web/src/app.js (interfaz), tutorial.js, proceso.js (método animado), app.css, plantilla.html y nucleo-web.ts (el núcleo para la página, con el módulo de IA). `npm run web` genera dist/EasyPerformance (1,4 MB). `npm run verificar-web` la recorre con Chromium: entrada y conectores, método animado, tutorial completo, datos de ejemplo en 1280x720 y 1920x1080 en todas las pantallas de los cuatro pasos, contenido de cada paso, IA con la API simulada en el navegador (clave, recomendaciones validadas y descartadas, mapeo, impacto, fallo de la API), los dos exports con fallos sembrados, modo oscuro, móvil, portátil al 150 %, Jira.csv de principio a fin con cambios en Context, catálogo, paquete y modelo, carpeta con iniciativas y configuración anterior. 83 comprobaciones (incluidas Context, Data check y el cambio de KPIs según los objetivos); deja capturas en dist/verificacion.

Los textos del núcleo, los adaptadores y el catálogo están en inglés (formato en-GB en cifras y fechas). La versión en castellano queda en la rama feat/producto. Los exports sintéticos de la v0 (jira-ejemplo-completo) conservan sus nombres en castellano porque son fixtures de regresión.

Pendiente de probar: actualizar.ps1 en Windows; la llamada a la API de Claude desde el navegador en la red corporativa de Capgemini.

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
npm run datos-fallos # regenera el export con fallos (debe salir idéntico)
npm run datos-aseguradora # regenera el ejemplo de la aseguradora (debe salir idéntico)
npm run web          # genera la carcasa web en dist/EasyPerformance
npm run verificar-web  # recorre la carcasa con Chromium y guarda capturas
npm run evaluar-ia   # eval de la IA con el proveedor real (ANTHROPIC_API_KEY en el entorno)
```

## Banco de exports

Comprueba que el mismo trabajo exportado de formas distintas da el mismo resultado, y que un export incompleto da los avisos y las medidas "sin datos" que tocan. Variantes que genera hoy a partir del export sintético: Jira en castellano, punto y coma con saltos de Windows, fechas numéricas, Tiempo en estado en segundos, sin Tiempo en estado, sin campo Equipo, sprints con nombre de fecha, export cortado, estados propios del cliente y ficheros que no son de Jira.

Para añadir un export real: anonimizarlo, dejarlo en datos-prueba/ y escribir a su lado un .esperado.json con lo que debe salir (ver Jira.esperado.json). La regresión contra la v0 y el banco lo recorren solos.

## Reglas de trabajo

- Nada de datos de cliente en el repositorio: solo sintéticos y exports de prueba que no son de cliente.
- Una rama por bloque; merge a main al cerrar el bloque con su evidencia.
- No se afirma que algo funciona sin haberlo ejecutado y visto la salida.
- Solo equipos, nunca personas: el modelo neutro no tiene campos de personas y un test lo comprueba.
- Textos llanos y sin rayas: la página y el catálogo en inglés; comentarios, tests y documentación en castellano.

## Estado

- B1 (núcleo en TypeScript): hecho. Mismos resultados que la v0.
- B2 (modelo neutro, esquemas, adaptador Jira, banco de exports): hecho.
- B3 (comparaciones entre grupos, iniciativas, agent readiness, paquete de diagnóstico): hecho.
- B5 (carcasa web): hecho. Se adelantó a B4 para tener pronto el HTML con la experiencia de la v0.
- B4 (equipos, mapeo editable, calidad y documento de definiciones): hecho. La puesta en marcha en pasos se quitó después: lo editable vive ahora en Ajustes.
- Interfaz simplificada (tablero, recomendaciones y cómo funciona): hecha.
- Producto completo (28 oct 2026): fuera todo lo explainer; cinco pestañas, tutorial, alta de iniciativas desde la página. En la rama feat/producto.
- v2, los cuatro pasos (28 oct 2026): página en inglés organizada como Measure, Analyze, Improve, Learn; conectores de demo y método animado; IA con clave API dentro del producto (nucleo/ia.ts, con evals). En la rama feat/pasos.
- Siguiente: adaptador de Azure DevOps (B8); eval de la IA con el proveedor real; probar la API desde la red corporativa.
