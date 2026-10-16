# La página

Un solo HTML que se abre con doble clic, sin servidor.

- src/app.js y app.css: la interfaz (entrada con conectores, tablero, recomendaciones, cómo funciona, presentación y demo).
- src/proceso.js: la animación por pasos del método de carga y de la generación de recomendaciones. Se empaqueta antes de app.js.
- src/laminas.json: las siete láminas de la presentación, en un lienzo de 1920x1080 que se escala a la ventana.
- src/nucleo-web.ts: expone el núcleo a la interfaz (Motor, CATALOGO y Nucleo).
- src/plantilla.html: el esqueleto del HTML.
- construir.ts: empaqueta el núcleo con esbuild y lo mete en el HTML con fuentes, demo, láminas y estilos. Crea dist/EasyPerformance con las carpetas de trabajo.
- carpeta/: actualizar.ps1 y actualizar.bat, que se copian a la carpeta compartida.
- verificar.mjs: recorrido automático en Chromium con capturas.

`npm run web` y `npm run verificar-web` desde la raíz.
