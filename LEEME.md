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
| datos-sinteticos/ | Exports sintéticos de la v0 con problemas sembrados, una carpeta de cliente de ejemplo y b3/: dos equipos internos y dos de proveedores, dos iniciativas y descripciones de calidad conocida (lo sembrado está en b3/escenarios.json). Y fallos/: el export de B3 con un fallo sembrado por cada comprobación de fiabilidad (lista en fallos/escenarios.json). |
| datos-prueba/ | Exports de prueba que no son de cliente, cada uno con su .esperado.json. |
| tests/ | Tests con node:test. tests/referencia-v0 guarda el motor de la v0 sin cambios; tests/banco genera variantes de exports. |
| herramientas/ | Generadores de datos sintéticos (el de la v0 en Python, y el de B3 y el export con fallos en TypeScript) y resumen del núcleo por consola. |
| web/, skill/ | La página (un solo HTML) y la skill de IA (B6). |

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

## La página (web/)

Un solo HTML que se abre con doble clic, sin servidor ni instalación. No hay puesta en marcha: se carga el export de Jira y se ve el tablero.

- Entrada: conectores de Jira, Azure DevOps, ServiceNow, GitLab y otra herramienta. Hoy funciona el export CSV de Jira; la conexión directa y las demás fuentes son una simulación que carga los datos de ejemplo.
- El método: al cargar desde la entrada, una animación de seis pasos (leer, equipos, estados, calidad, coste y medir) con las cifras reales de lo cargado. Avanza con el botón Siguiente o la flecha derecha; Anterior vuelve y Esc salta. Con "reducir movimiento" en el sistema no se muestra.

- Tablero: el área (cuatro indicadores, tabla de equipos, internos y proveedores, iniciativas) o un equipo (cuatro indicadores con su tendencia, el plazo semana a semana y sus recomendaciones). Cada cifra se compara con lo normal en ese equipo.
- Recomendaciones: se generan con un botón y una animación de seis pasos (señales, contexto, banco de casos, priorizar, IA y revisión). La IA va marcada como próxima fase: hoy el plan sale del banco de casos. Después, lista y detalle: qué pasa y qué hacer primero, la cifra de cada equipo frente a lo normal, el plan de acción, cómo se sigue (registrar como iniciativa) y, plegado, preguntas para la reunión, causas y respaldo.
- Iniciativas: seguimiento automático (nucleo/seguimiento.ts). En cada carga se recalcula su estado (planificada, midiendo, funciona, sin efecto claro, va a peor), la serie semanal de la medida frente al resto de equipos y cuándo estará completa la evaluación. Con la carpeta, cada carga deja una foto en historico/iniciativas-AAAA-MM-DD.json.
- Fiabilidad de los datos (nucleo/fiabilidad.ts): diez comprobaciones con su valor, desde cuándo están bien y cómo se arreglan, una tabla por equipo y un nivel (alta, media o baja) que se ve también en el tablero y en el paso de calidad de la animación. Una comprobación del área se marca para revisar también si falla en un equipo: una media buena no esconde un equipo roto. Los estados cuentan como reconocidos si se reconocen por su nombre o alguien los ha confirmado.
- Export con fallos (datos-sinteticos/fallos): el mismo banco ficticio con diez fallos sembrados, uno por comprobación (equipo nuevo con ocho semanas, export cortado, estado propio sin reconocer, saltos de pendiente a hecho, cierres en bloque, tareas creadas al terminar, sprints sin apuntar, historias sin estimar, sin tiempo en cada estado y tareas sin equipo). Se abre desde la entrada ("Ver un ejemplo con fallos en los datos"). En Fiabilidad, una tabla cruza en vivo cada fallo con la comprobación que lo detecta; el CSV se puede descargar y cargar como un export normal.
- Ayudas al pasar el cursor por el nombre de cada medida.
- Cómo funciona, en cuatro secciones: el método (diagrama del dato al plan de acción y el banco de casos), fuentes e ingesta (cómo se trata cada plataforma, primera ingesta y cadencia de actualización, cómo automatizarla), fiabilidad de los datos y vuestros datos. En vuestros datos, "Así hemos leído vuestros datos" (ficheros, campo de equipo, proveedores, áreas y FTE, estados y calidad), donde se corrige lo detectado. Desde ahí se descargan el documento de definiciones (Word y markdown) y el paquete de diagnóstico.
- Se detecta solo: el campo que reconoce al equipo, los equipos y el estado común de cada estado de Jira. Lo que no se puede detectar (proveedores, áreas, FTE) se indica en Cómo funciona. Lo cambiado se guarda en el navegador y en configuracion/cliente.json si se usa la carpeta. Una configuración de la versión anterior se aprovecha.
- Presentación de siete láminas y demo con un banco ficticio (datos sintéticos de B3), que no toca los datos reales.
- Carpeta compartida: exports/, configuracion/, iniciativas/ (un JSON por iniciativa), contexto/, historico/ y diagnostico/. actualizar.ps1 la vuelca a exports/datos.js para abrirla sin permisos de carpeta.

Código: web/src/app.js (interfaz), proceso.js (animación del método), app.css, laminas.json, plantilla.html y nucleo-web.ts (el núcleo para la página). `npm run web` genera dist/EasyPerformance. `npm run verificar-web` la recorre con Chromium (entrada, presentación, demo en 1280x720 y 1920x1080, conectores, método de carga y generación de recomendaciones con animación, export con fallos (los diez detectados, también al cargar el CSV desde la entrada), modo oscuro, móvil, Jira.csv de principio a fin con cambios en Cómo funciona, definiciones, paquete, carpeta con iniciativas y configuración anterior) y deja capturas y documentos en dist/verificacion. Las pantallas caben sin scroll a 1920x1080; en 1280x720 el tablero tiene algo de scroll vertical, y recomendaciones y Cómo funciona son páginas largas.

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
- B4 (equipos, mapeo editable, calidad y documento de definiciones): hecho. La puesta en marcha en pasos se quitó después: lo editable vive ahora en Cómo funciona.
- Interfaz simplificada (tablero, recomendaciones y cómo funciona): en la rama feat/ui-simple.
- Siguiente: B6, skill de IA del consultor con sus evals.
