# Carcasa web

Bloque B5. Un solo HTML que se abre con doble clic, sin servidor.

- src/plantilla.html, estilos.css, graficos.js e interfaz.js: la interfaz, heredada de la v0 y ampliada con Comparar, Iniciativas y Agentes.
- src/nucleo-web.ts: expone el núcleo a la interfaz (Motor, CATALOGO y Nucleo).
- construir.ts: empaqueta el núcleo con esbuild y lo mete en el HTML con fuentes, demo y estilos. Crea dist/EasyPerformance con las carpetas de trabajo.
- carpeta/: actualizar.ps1 y actualizar.bat, que se copian a la carpeta compartida.
- verificar.mjs: recorrido automático en Chromium con capturas.

`npm run web` y `npm run verificar-web` desde la raíz.
