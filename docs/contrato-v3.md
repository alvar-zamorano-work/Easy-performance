# Contrato de la v3: pantallas de la versión UX sobre el núcleo de la v2

La v3 junta dos cosas que ya existen. La interfaz es la de la versión UX: fichas, panel lateral, vistas por rol, Referencias, Cortes, presentación y asistente. El cálculo es el núcleo de la v2: modelo neutro, banda de lo normal, fiabilidad, banco de casos, comparaciones, iniciativas con control e IA validada.

Este documento fija qué pinta cada pantalla y de qué campo del núcleo sale. Lo que no está aquí no se construye. Si algo cambia, se cambia aquí primero.

## Reglas que no se negocian

1. **El núcleo calcula, la pantalla pinta.** Ninguna cifra se calcula en la interfaz. Si una ficha necesita un dato que el núcleo no da, se añade al núcleo con su test.
2. **Solo equipos, nunca personas.** No hay asignado, autor ni "por persona" en ninguna pantalla, export o petición a la IA. El test del modelo neutro lo sigue comprobando.
3. **Dos idiomas, castellano e inglés.** Toda cadena visible sale de un diccionario o del catálogo. Un test exige cada clave en los dos idiomas y ninguna raya, ni larga ni media.
4. **Nada de datos de cliente en el repositorio.** Los exports de cliente se prueban fuera, en una carpeta que no se versiona.
5. **La IA solo ve el paquete de diagnóstico.** Todo lo que devuelve (recomendaciones, lectura de iniciativas, resumen redactado y respuestas del asistente) se valida cifra a cifra antes de enseñarse.
6. **La v2 sigue intacta.** `web/` no se toca y la rama `feat/pasos` tampoco. La v3 vive en `web-v3/` y se construye aparte. Los cambios del núcleo son compatibles: la página de la v2 sigue pasando su verificación.

## Arquitectura

```
nucleo/ y adaptadores/        cálculo (TypeScript), compartido con la v2
catalogo/                     catálogo en inglés (el de siempre)
catalogo/es/                  textos en castellano del catálogo (mismas claves)
web-v3/src/nucleo-web.ts      expone el núcleo en window (como la v2, más lo nuevo)
web-v3/src/puente.js          convierte la salida de diagnosticar() en la vista-modelo (VM)
web-v3/src/textos.es.json     diccionario de pantalla en castellano
web-v3/src/textos.en.json     diccionario de pantalla en inglés
web-v3/src/app.js             estado, persistencia, onboarding, navegación y acciones
web-v3/src/vistas-*.js        pantallas (fichas), panel lateral, presentación, asistente
web-v3/src/estilos.css        estilo de la versión UX, con la Ubuntu incrustada de la v2
web-v3/construir.ts           un solo HTML: dist/EasyPerformance-v3/EasyPerformance.html
web-v3/verificar.mjs          recorrido en Chromium, en castellano y en inglés
```

Las pantallas solo leen la VM y el diccionario. Nunca leen `diagnosticar()` directamente. Así, si el núcleo cambia de forma, solo cambia `puente.js`.

## La vista-modelo (VM)

`puente.js` exporta `construirVM(diag, cliente, contexto, idioma, rol)` y devuelve:

| Campo | Qué es | De dónde sale |
|---|---|---|
| `vm.fechaDatos` | Último día con actividad real | `diag.det.fechaRef` |
| `vm.semanas` | Ventana actual (4), proporciones (8) y referencia (12) | `diag.preparacion.ctx.K`, `KP`, `R` |
| `vm.kpis` | Medidas visibles, en orden, según el Context | `columnas()` de la v2 más `bugs` en Quality |
| `vm.area` | La misma ficha que un equipo, para el área entera | `diag.area.equipos[0]` |
| `vm.equipos[]` | Una ficha por equipo (ver abajo) | `diag.modelo.equipos[]` |
| `vm.recs[]` | Recomendaciones del banco, ya filtradas por el Context | `eq.casos`, `diag.casosGrupo`, `diag.casosAgentReady` y `catalogo.casos` |
| `vm.fiabilidad` | Nivel, las 10 comprobaciones y la tabla por equipo | `Nucleo.fiabilidad(...)` |
| `vm.dataCheck` | Ready, Ready with limits o Not ready, con motivos | lógica de `dataCheck()` de la v2, movida al puente |
| `vm.comparaciones` | Interno frente a proveedor, entre proveedores y por área | `diag.comparaciones`, `diag.casosGrupo` |
| `vm.iniciativas[]` | Cada iniciativa con su seguimiento | `diag.iniciativas[]` y `Nucleo.seguimiento(...)` |
| `vm.paquete` | Lo único que ve la IA | `diag.paquete` |

Ficha de equipo `vm.equipos[i]`:

| Campo | Qué es | De dónde sale |
|---|---|---|
| `nombre`, `tipo`, `proveedor`, `area` | Identidad del equipo | `eq.nombre` y `cliente.equipos.lista` |
| `estado` | Una palabra: Datos poco fiables, Con alerta, Referencia provisional o Estable | crítico o atención en alguna medida visible, fiabilidad del equipo y estado de la referencia |
| `medidas[id]` | `valor`, `serie` (16 semanas), `ref` (lo, hi, med, n), `estado`, `estadoTexto`, `motivoEstado`, `tendencia`, `referencia` | `eq.medidas[id]` (y `eq.kpis.coste`) |
| `cambios[]` | Medidas visibles en atención o crítico, la peor primero | `eq.medidas` |
| `tiempo` | Días en curso frente a días en espera, y la espera por estado | `Derivada.cursoMs`, `esperaMs` y `porEstado` vía el núcleo |
| `atascadas[]`, `enCurso[]` | Trabajo parado hoy (solo en pantalla, nunca en el paquete) | `eq.atascadas`, `eq.enCurso` |
| `sprints` | Si son fiables y por qué | `eq.sprints` |
| `fiabilidad` | Sus 6 comprobaciones de equipo y cuántas están bien | `fiabilidad().porEquipo` |
| `semanasConDatos`, `entregadas`, `n` | Volumen | `eq.semanasConDatos`, `eq.entregadas`, `eq.n` |

## KPIs

Los que se ven son los de la v2 más bugs. El Context decide cuáles:

| Objetivo del Context | Medidas | Nota |
|---|---|---|
| Speed | Lead time (`ciclo`), Deliveries (`entregas`) | Lead time necesita tiempo en cada estado |
| Quality | Rework (`retrabajo`), **Bugs nuevos por semana (`bugs`)** | `bugs` es nueva en el núcleo |
| Predictability | Carried over (`arrastradas`) | Nunca con flujo continuo |
| Cost | Cost per delivery (`coste`) | Solo con FTE y coste |
| AI readiness | Agent-ready (`agent_readiness`) | |

Los cuatro indicadores destacados son los cuatro primeros visibles. El usuario puede cambiarlos en Personalizar, entre las medidas disponibles del catálogo. La proporción de bugs (`errores`) de la v2 queda en la ficha de equipo, en "Ver todos los indicadores".

## Pantalla por pantalla

La navegación no cambia: Resumen, Equipos, Referencias, Calidad del dato, Recomendaciones, Iniciativas, Cortes, Fuentes y mapeo, Ajustes. Cada pantalla mantiene la plantilla de fichas: barra de estado, cuatro indicadores y rejilla de fichas.

### Onboarding

| Paso | Qué enseña | De dónde sale |
|---|---|---|
| Bienvenida | Qué hace, Empezar o Explorar con datos de ejemplo | textos |
| Datos | Zona para soltar ficheros y qué formatos se leen hoy (Jira; Azure DevOps y GitLab tras B6) | textos |
| Revisión | Ficheros, filas, tareas, épicas fuera, campo de equipo propuesto | `lectura.informe`, `det.opcionesEquipo`, `det.equipoRecomendado` |
| Mapeo | Estados de origen y su estado común, los dudosos abiertos | `det.estados` (`propuestaPor`) y `cfg.mapeoEstados` |
| Context | Las tres preguntas de la v2 | `cfg.contexto` |
| Data check | Veredicto, qué KPI se puede medir y qué limita | `vm.dataCheck` |
| Para quién | Dirección, PMO o Equipo (y cuál) | `S.rol` |

Los datos de ejemplo son los del banco ficticio de la v2 (cuatro equipos, 52 semanas, FTE, proveedores y dos iniciativas). Entran directo en Resumen, como en la versión UX.

### Resumen

| Elemento | Campo |
|---|---|
| Barra de estado | equipos con alerta (`vm.equipos[].estado`), poco fiables, referencias provisionales |
| Equipos con alerta | cuenta y un punto por equipo |
| Fiabilidad del dato | `vm.fiabilidad.nivel` y "n de 10 bien" (sustituye a la media de 0 a 100) |
| Referencias establecidas | cuenta de `medidas.entregas.referencia === 'establecida'` y de `bugs` |
| Recomendaciones de nivel alto | `vm.recs` por nivel |
| Ficha de equipo | estado, la peor medida, tres cifras destacadas y la línea de entregas con su banda |
| Qué hacer primero | tres primeras `vm.recs` |

### Equipos

Pestañas por equipo y "Comparar".

| Elemento | Campo |
|---|---|
| Barra de estado | peor cambio, fiabilidad del equipo, estado de la referencia, entregadas y en curso |
| Cuatro indicadores | `medidas[id]`: cifra, banda (`ref.lo` a `ref.hi`), chip de estado y línea de 16 semanas con la banda sombreada |
| Qué ha cambiado | `cambios[]` con `estadoTexto` |
| Dónde se va el tiempo | `tiempo`: en curso frente a espera, y la espera por estado de origen |
| Qué hacer | `vm.recs` del equipo |
| Fiabilidad | `fiabilidad` del equipo y referencias de entrega y bugs |
| Trabajo parado hoy | `atascadas[]` (clave y título, solo en pantalla) |
| Ver todos los indicadores | resto de medidas disponibles |

Comparar enseña `vm.comparaciones` con la leyenda de la v2: solo medidas normalizadas, dentro del mismo tipo y tamaño de tarea, "pocos datos" por debajo de 20 tareas y nunca ranking. Si no hay proveedores ni áreas marcadas, enseña la tabla de equipos de la v2 (cada uno frente a su propia banda) y un enlace para marcarlos.

### Referencias

| Elemento | Campo |
|---|---|
| Referencia de entrega | `medidas.entregas.ref` y `referencia` |
| Referencia de bugs | `medidas.bugs.ref` y `referencia` |
| Periodo de referencia | fijo: las 12 semanas anteriores a la ventana actual |
| Mínimos | 6 semanas con valor para tener banda (provisional) y 12 para darla por establecida |
| Ficha por equipo | banda en grande, valor actual debajo, motivo si es provisional |

Desaparecen el periodo fijo con fechas y las ventanas configurables. La v2 usa siempre 4, 8 y 12 semanas, igual que su catálogo de KPI y su modelo de medida para Power BI.

### Calidad del dato

| Elemento | Campo |
|---|---|
| Barra de estado | `vm.fiabilidad.nivel` y el veredicto del Data check |
| Indicadores | nivel, comprobaciones bien, por revisar, estados por confirmar |
| Ficha por equipo | sus 6 comprobaciones con valor y estado (en lugar del anillo de 0 a 100) |
| Qué falla más | las comprobaciones en "revisar", con su arreglo y los equipos afectados |

Pulsar una comprobación abre el panel lateral con qué mira, el umbral, el detalle y cómo se arregla.

### Recomendaciones

| Elemento | Campo |
|---|---|
| Nivel alto, medio y bajo | gravedad crítico es alto; atención es medio; atención con confianza baja es bajo |
| Ficha | título y señal del caso, la cifra que la dispara, equipos, nivel |
| Por qué (panel lateral) | evidencia, causas, preguntas, plan, cómo comprobarlo |
| Marca "IA de acuerdo" | recomendación de la IA que repite un caso para los mismos equipos |
| Recomendaciones de la IA | `IA.validarRecomendaciones`; las descartadas no se enseñan |
| Crear iniciativa | solo si la medida del caso es evaluable (`MEDIDAS_INICIATIVA`) |

Se conservan descartar y restaurar, y el filtro por equipo y por nivel.

### Iniciativas

| Elemento | Campo |
|---|---|
| Estado | `seguimiento().estado`: planificada, midiendo, funciona, sin efecto claro, empeora, sin datos |
| Antes y después | `antes`, `despues` de los equipos de la iniciativa |
| El resto de equipos | `control.antes`, `control.despues` |
| Avance | `progreso` y `completaEl` |
| Gráfico | `serie`: la iniciativa frente al resto, con el margen de dos semanas sombreado |
| Confianza | `confianza` con su regla (ruido histórico, 20 tareas, ventana completa) |
| Lectura con IA | `IA.validarImpacto` |

El "antes congelado" de la versión UX se sustituye por el método de la v2: 4 semanas antes (8 en proporciones), dos semanas de margen y el resto de equipos como control.

### Cortes

Un corte es una foto de cifras agregadas en cada carga: fecha de los datos, ficheros, tareas y, por equipo, estado y valor y estado de cada medida visible. Sale de `vm`, nunca de las tareas. Se guarda en el navegador y, si hay carpeta compartida, en `historico/`. La pantalla compara el último con el anterior, como hoy.

### Fuentes y mapeo

Pestañas: Ficheros, Mapeo de estados, Equipos y Context.

| Pestaña | Campo |
|---|---|
| Ficheros | `lectura.informe`: filas, repetidas, épicas, subtareas, sin clave, columnas reconocidas y avisos |
| Mapeo de estados | `det.estados` con su propuesta y motivo, y la opción de proponerlo con IA (`IA.validarMapeo`) |
| Equipos | campo de equipo, equipos incluidos, interno o proveedor, área, FTE y coste |
| Context | las tres preguntas y los documentos de contexto |

### Ajustes

IA (clave en la sesión del navegador, modelo y Probar conexión), idioma, para quién se muestra, carpeta compartida, exportaciones (catálogo de KPI en Word y Markdown, modelo de medida, paquete de diagnóstico) y "Qué mide easyperformance y cómo" desde el catálogo.

### Panel lateral

| Tipo | Contenido |
|---|---|
| `medida` | definición, banda, por qué tiene ese estado y las tareas que componen la cifra (`detalleMedida`), con export a CSV |
| `comprobacion` | qué mira, umbral, detalle, arreglo y equipos |
| `caso` | el "Por qué" de una recomendación |
| `resumen` | resumen redactado para el rol |
| `ayuda`, `personalizar` | como hoy |

### Presentación

Portada con el estado del área, una diapositiva por equipo (cuatro indicadores, qué ha cambiado, qué hacer) y cierre con lo primero que hay que hacer. Todo desde la VM.

### Asistente

El asistente se queda. Responde sobre lo que se ve en pantalla, en el idioma de la interfaz, con preguntas sugeridas por rol. Cambia cómo:

1. La petición lleva el paquete de diagnóstico (si se está en un equipo, solo ese equipo), el rol, la pantalla y el historial corto.
2. El modelo responde en JSON: la respuesta en texto y la lista de cifras que usa, cada una con equipo (o área), medida y valor.
3. `IA.validarChat` comprueba cada cifra contra el paquete, con la misma tolerancia que las recomendaciones. También rechaza números del texto que no estén en esa lista, nombres de equipo desconocidos y menciones a personas.
4. Si la respuesta no pasa, no se enseña. Sale "No he podido comprobar las cifras de esta respuesta" y un botón para preguntar de nuevo.
5. Sin clave de IA, el asistente no responde y lo dice. El resto de la página funciona igual.

El resumen redactado usa la misma validación. Sin clave hay un resumen por reglas en tres bloques por rol, como en la versión UX, construido desde la VM.

## Lo que se añade al núcleo (B2)

| Pieza | Qué hace | Test |
|---|---|---|
| Medida `bugs` | Bugs creados por semana (media de 4 semanas), sin descartados, con banda y semáforo, `dir: menos`, `requiere: errores`. Entra en el objetivo Quality | valor y banda en el banco B3; no disponible sin tipo |
| `referencia` en cada medida | `establecida` con 12 semanas de referencia, `provisional` con 6 a 11, `sin` con menos | casos con historia corta |
| `motivoEstado` | `banda` o `limite`, con el límite que manda. La tarjeta dice "por encima del límite del 20 %" | Rework del área del banco B3 |
| `detalleMedida(preparacion, equipo, medida)` | Las tareas que componen la cifra actual: clave, título, tipo, estado, fechas y días. Solo en memoria | cuenta igual al valor en entregas y bugs |
| Campo de equipo | Reconoce `Assigned Team`, `Squad` y `Equipo asignado`, y lo prefiere al componente | export de prueba con esa columna |
| Carried over del área | Que el área no pierda la medida cuando sus equipos sí la tienen | banco B3 |
| `peticionChat` y `validarChat` | Asistente con cifras validadas, en los dos idiomas | proveedor falso con cifras buenas y malas |
| Narrativa | Resumen por reglas y su versión con IA validada | por rol, sin rayas |

## Idioma (B3)

- `idioma` es `es` o `en`. Por defecto, el del navegador. Se cambia en Ajustes y se guarda.
- Catálogo: los ficheros de `catalogo/` siguen en inglés. `catalogo/es/` tiene solo los textos, con las mismas claves. `cargarCatalogo(idioma)` los junta. El castellano parte del catálogo de `feat/producto` y se revisa frente a los cambios de `feat/pasos`.
- Núcleo: las frases que hoy escribe el código (fiabilidad, semáforo, motivos, seguimiento, documentos) pasan a `catalogo/textos-nucleo.json` con `{ en, es }` por clave. El núcleo recibe `idioma` en la configuración.
- IA: las instrucciones al modelo piden responder en el idioma de la interfaz y con las mismas reglas de escritura.
- Documentos: el catálogo de KPI en Word y el modelo de medida salen en el idioma elegido.

## Persistencia

- Configuración del cliente: la misma clave que la v2 (`easyperformance.config.v2`). Un cliente montado en la v2 abre en la v3.
- Preferencias de la v3 (rol, idioma, indicadores destacados, recomendaciones descartadas): `easyperformance.v3.prefs`.
- Cortes: IndexedDB `easyperformance-v3`.
- Clave de IA: solo en `sessionStorage`. Nunca en ficheros ni en exportaciones.
- Carpeta compartida: la de la v2 (`exports/`, `configuracion/`, `iniciativas/`, `contexto/`, `historico/`, `diagnostico/`).

## Lo que sale de la versión UX

WIP por persona y número de personas, columna de asignado, regla "sin asignado", DORA (despliegues, fallos, recuperación), PR (revisión y tamaño), puntuación de 0 a 100, ventanas configurables y periodo fijo, y el motor propio (`00` a `70`).

## Lo que entra de la v2

Context, Data check, comparación interno frente a proveedor, coste por entrega, agent-ready, catálogo de KPI en Word, modelo de medida, paquete de diagnóstico, carpeta compartida e IA validada.

No entran en esta versión: los conectores de demostración (enseñaban datos de ejemplo bajo el nombre de herramientas sin adaptador) y el tutorial de siete pasos (lo cubren la ayuda y el onboarding).

## Verificación (B5)

- `npm run comprobar`: los 147 tests de la v2 más los nuevos.
- `npm run verificar-web`: la página de la v2, construida con el núcleo de la v3, sigue dando 83 de 83. El HTML de la v2 del Escritorio y la rama `feat/pasos` no se tocan.
- `npm run verificar-web-v3`: onboarding, cada pantalla, panel lateral, presentación, asistente con proveedor falso (respuesta válida y respuesta rechazada) y móvil a 390 px, en castellano y en inglés, sin errores de consola y sin scroll lateral.
- Prueba con un export real de cliente, fuera del repositorio.
- Revisión final por un agente que no ha visto el trabajo.
