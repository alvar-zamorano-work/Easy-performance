# La página

Un solo HTML que se abre con doble clic, sin servidor. Es el producto, en inglés, organizado como los cuatro pasos (Measure, Analyze, Improve, Learn) más Settings, con conectores de demo, el método animado de carga, un tutorial y el asistente de IA.

- src/app.js y app.css: la interfaz (entrada con conectores, los cuatro pasos, settings y las llamadas a la IA).
- src/proceso.js: el método animado de carga (seis etapas con las cifras reales). Se empaqueta antes de app.js.
- src/tutorial.js: el recorrido guiado sobre la propia interfaz (foco sobre el elemento real y una tarjeta por paso). Se empaqueta antes de app.js.
- src/nucleo-web.ts: expone el núcleo a la interfaz (Motor, CATALOGO y Nucleo).
- src/plantilla.html: el esqueleto del HTML.
- construir.ts: empaqueta el núcleo con esbuild y lo mete en el HTML con fuentes, los datos de ejemplo (B3) y estilos. Crea dist/EasyPerformance con las carpetas de trabajo.
- carpeta/: actualizar.ps1 y actualizar.bat, que se copian a la carpeta compartida.
- verificar.mjs: recorrido automático en Chromium con capturas (73 comprobaciones), con la API de Claude simulada en el navegador.

`npm run web` y `npm run verificar-web` desde la raíz. Para verificar hace falta Chrome o Chromium (ruta en la variable CHROME si no está en las habituales).
