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
| web/, skill/ | La página (un solo HTML, con su tutorial) y la skill de IA (B6). |

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

Un solo HTML que se abre con doble clic, sin servidor ni instalación. Es el producto (28 oct 2026): fuera la presentación, los conectores simulados, el método animado, la animación de generar recomendaciones y el apartado "Cómo funciona"; queda lo que hace falta para medir, más un tutorial. No hay puesta en marcha: se carga el export de Jira y se ve el tablero.

- Entrada: soltar el CSV de Jira (uno o varios), elegir ficheros o una carpeta (Chrome y Edge). El botón "Ver el tutorial con datos de ejemplo" carga el banco ficticio y arranca el tutorial. Sin claim ni conectores: Azure DevOps, GitLab y ServiceNow se nombran como fuentes que entran con su adaptador; hoy funciona Jira.
- Cinco pestañas: Tablero, Recomendaciones, Iniciativas, Datos y Ajustes. En la cabecera, Tutorial y Actualizar.
- Tablero: el área (nombre, botón directo a las recomendaciones, fiabilidad y equipos que necesitan atención, cuatro indicadores con tendencia, la tabla de equipos donde el color es el estado, internos y proveedores, iniciativas) o un equipo (cuatro indicadores, el plazo semana a semana y sus recomendaciones). Cada cifra frente a lo normal en ese equipo.
- Recomendaciones: siempre listas, sin botón de generar. Lista ordenada y detalle con qué pasa, qué hacer primero, las cifras, el plan, cómo se sigue (registrar como iniciativa) y, plegado, preguntas, causas y respaldo.
- Iniciativas: cada una con en qué consiste, por qué y qué se espera; estado automático (planificada, midiendo, funciona, sin efecto claro, va a peor), cifras antes y después frente al resto, gráfico y fechas. "Cómo se ha evaluado" despliega los seis pasos con las cifras reales (sin animación). "Nueva iniciativa" la registra desde la página (nombre, fechas, equipos, medida objetivo, descripción, qué se espera); se guarda en la configuración y, con la carpeta, en iniciativas/. Las registradas aquí se pueden quitar; las de la carpeta, no.
- Datos: Fiabilidad (diez comprobaciones con cómo se arregla cada una, tabla por equipo y avisos) y Cómo se ha leído el export (ficheros, lo que resuelve la página sola, lo que hay que confirmar en Ajustes, lo que se arregla al exportar, cuánta historia trae y la tabla columna a columna).
- Ajustes: campo de equipo, proveedores, áreas, FTE y coste, estados (mapeo editable a los nueve estados comunes), nombre del cliente y descargas (definiciones en Word y markdown, paquete de diagnóstico, modelo de medida), y un enlace a los datos de ejemplo y al tutorial. Se guarda en el navegador y en configuracion/cliente.json con la carpeta. Una configuración de la versión anterior se aprovecha.
- Tutorial: diez pasos sobre la interfaz real (medidas del área, fiabilidad y equipos, tabla de equipos, detalle de un equipo, recomendaciones, registrar como iniciativa, iniciativas, fiabilidad, ajustes, actualizar). Señala el elemento con un foco y explica al lado; avanza con Siguiente o la flecha derecha, vuelve con Anterior, Esc cierra. Sin datos cargados usa los de ejemplo; con datos del cliente, los suyos.
- Datos de ejemplo: un banco ficticio (B3) con dos equipos internos, dos de proveedores, un año, dos iniciativas y costes inventados. Nunca tocan los datos reales ni la configuración.
- Carpeta compartida: exports/, configuracion/, iniciativas/ (un JSON por iniciativa), contexto/, historico/ y diagnostico/. actualizar.ps1 la vuelca a exports/datos.js para abrirla sin permisos de carpeta.

Código: web/src/app.js (interfaz), tutorial.js, app.css, plantilla.html y nucleo-web.ts (el núcleo para la página). `npm run web` genera dist/EasyPerformance (1,3 MB). `npm run verificar-web` la recorre con Chromium: entrada, tutorial completo, datos de ejemplo en 1280x720 y 1920x1080, contenido del tablero, recomendaciones y registro, alta y baja de una iniciativa, detalle de la evaluación, datos y ajustes, los dos exports con fallos sembrados cargados desde la entrada (cada fallo detectado y sin falsas alarmas), modo oscuro, móvil, portátil al 150 %, Jira.csv de principio a fin con cambios en Ajustes, definiciones, paquete y modelo, carpeta con iniciativas y configuración anterior. 55 comprobaciones; deja capturas en dist/verificacion.

Los exports sintéticos con fallos (datos-sinteticos/fallos y aseguradora) ya no van dentro del HTML: se cargan como cualquier export y la verificación los usa.

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
npm run datos-fallos # regenera el export con fallos (debe salir idéntico)
npm run datos-aseguradora # regenera el ejemplo de la aseguradora (debe salir idéntico)
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
- B5 (carcasa web): hecho. Se adelantó a B4 para tener pronto el HTML con la experiencia de la v0.
- B4 (equipos, mapeo editable, calidad y documento de definiciones): hecho. La puesta en marcha en pasos se quitó después: lo editable vive ahora en Ajustes.
- Interfaz simplificada (tablero, recomendaciones y cómo funciona): hecha.
- Producto completo (28 oct 2026): fuera todo lo explainer; cinco pestañas, tutorial, alta de iniciativas desde la página. En la rama feat/producto.
- Siguiente: B6, skill de IA del consultor con sus evals; adaptador de Azure DevOps (B8).
