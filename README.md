# Easy Performance

Herramienta para medir equipos de desarrollo a partir de los exports de Jira, Azure DevOps y GitLab. Calcula los KPIs de cada equipo, fija su baseline y propone mejoras. Interfaz en castellano e inglés.

**Abrir la aplicación:** https://alvar-zamorano-work.github.io/Easy-performance/

## Cómo se usa

- Es una sola página. Todo el cálculo se hace en el navegador y los datos que cargas no salen de tu equipo.
- Sin datos propios, la aplicación trae un banco de ejemplo ficticio.
- El asistente de IA es opcional. La clave se introduce en Ajustes y solo se guarda en el navegador.

## Desarrollo

Requisitos: Node 22.18 o posterior. Para el recorrido en el navegador, Chrome o Chromium (o su ruta en la variable `CHROME`).

```bash
npm ci
npm run comprobar          # tipos y tests
npm run verificar-web-v3   # construye la página y la recorre en Chromium
```

`npm run web-v3` genera la página en `dist/EasyPerformance-v3/EasyPerformance.html`.

## Publicación

Cada cambio que entra en `main` se comprueba y se publica solo en GitHub Pages (`.github/workflows/pages.yml`). Los PR pasan las mismas comprobaciones, sin publicar.

## Datos

En el repositorio solo hay datos sintéticos y exports de prueba que no son de cliente. Los datos reales nunca entran aquí.

El detalle técnico del núcleo, los adaptadores y el catálogo está en `LEEME.md` y en `docs/contrato-v3.md`.
