# La página

Un solo HTML que se abre con doble clic, sin servidor. Es el producto: sin presentación ni explicaciones del método, solo lo que hace falta para medir, más un tutorial.

- src/app.js y app.css: la interfaz (entrada, tablero, recomendaciones, iniciativas, datos y ajustes).
- src/tutorial.js: el recorrido guiado sobre la propia interfaz (foco sobre el elemento real y una tarjeta por paso). Se empaqueta antes de app.js.
- src/nucleo-web.ts: expone el núcleo a la interfaz (Motor, CATALOGO y Nucleo).
- src/plantilla.html: el esqueleto del HTML.
- construir.ts: empaqueta el núcleo con esbuild y lo mete en el HTML con fuentes, los datos de ejemplo (B3) y estilos. Crea dist/EasyPerformance con las carpetas de trabajo.
- carpeta/: actualizar.ps1 y actualizar.bat, que se copian a la carpeta compartida.
- verificar.mjs: recorrido automático en Chromium con capturas (55 comprobaciones).

`npm run web` y `npm run verificar-web` desde la raíz. Para verificar hace falta Chrome o Chromium (ruta en la variable CHROME si no está en las habituales).
