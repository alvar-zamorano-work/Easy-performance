# Prueba de escala (16 oct 2026)

`TZ=Europe/Madrid node --max-old-space-size=6144 herramientas/prueba-escala.ts 1 10 25 50 100`

Multiplica el export sintético de B3 (4 equipos de 5 FTE, un año de trabajo) renombrando claves y equipos. Mide el recorrido completo del núcleo: lectura del CSV, detección y diagnóstico (medidas, área, comparaciones, casos y paquete). Node 22 en la máquina virtual de Cowork sobre un MacBook Air. En el navegador corre el mismo JavaScript, así que el orden de magnitud es el mismo.

| Equipos | FTE aprox. | Tareas (un año) | CSV | Tiempo total | Memoria |
|---:|---:|---:|---:|---:|---:|
| 4 | 20 | 1.232 | 0,9 MB | 0,2 s | 28 MB |
| 40 | 200 | 12.320 | 8,6 MB | 1,8 s | 96 MB |
| 100 | 500 | 30.800 | 21,6 MB | 5,4 s | 196 MB |
| 200 | 1.000 | 61.600 | 43,2 MB | 12,9 s | 255 MB |
| 400 | 2.000 | 123.200 | 86,5 MB | 31,1 s | 1.041 MB |

Lectura: el cálculo aguanta un área de hasta unos 1.000 desarrolladores con una carga de unos 13 segundos. Con 2.000 ya tarda medio minuto y necesita 1 GB de memoria, y la página no está pensada para leer 400 equipos en una tabla (habría que agruparlos por área). A esa escala, las mismas definiciones (modelo de medida) van en la plataforma de datos del cliente con conectores.
