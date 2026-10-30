// Lector de CSV tolerante: separador coma, punto y coma o tabulador; comillas dobles; BOM.

/**
 * Separador del fichero: coma, punto y coma o tabulador. Se mira en las primeras líneas, no solo en la primera,
 * porque un export guardado desde Excel puede traer encima de los títulos una línea con otro número de columnas.
 * Gana el que más columnas da en alguna de esas líneas.
 */
export function detectarSeparador(t: string): string {
  const seps = [',', ';', '\t'];
  const max: Record<string, number> = { ',': 0, ';': 0, '\t': 0 };
  let cuenta: Record<string, number> = { ',': 0, ';': 0, '\t': 0 };
  let dentro = false, lineas = 0;
  const cerrar = () => { seps.forEach((k) => { if (cuenta[k] > max[k]) max[k] = cuenta[k]; }); cuenta = { ',': 0, ';': 0, '\t': 0 }; lineas++; };
  for (let i = 0; i < t.length && i < 200000 && lineas < 30; i++) {
    const c = t[i];
    if (c === '"') dentro = !dentro;
    else if (!dentro && c === '\n') cerrar();
    else if (!dentro && Object.prototype.hasOwnProperty.call(cuenta, c)) cuenta[c]++;
  }
  cerrar();
  let mejor = ',';
  seps.forEach((k) => { if (max[k] > max[mejor]) mejor = k; });
  return mejor;
}

export function leerCSV(t: string): string[][] {
  if (t.charCodeAt(0) === 0xfeff) t = t.slice(1);
  const sep = detectarSeparador(t), sc = sep.charCodeAt(0);
  const filas: string[][] = [];
  let fila: string[] = [], campo = '', i = 0;
  const n = t.length;
  while (i < n) {
    const c = t.charCodeAt(i);
    if (c === 34) { // comillas
      i++;
      while (i < n) {
        const j = t.indexOf('"', i);
        if (j === -1) { campo += t.slice(i); i = n; break; }
        campo += t.slice(i, j);
        if (t.charCodeAt(j + 1) === 34) { campo += '"'; i = j + 2; } else { i = j + 1; break; }
      }
      continue;
    }
    if (c === sc) { fila.push(campo); campo = ''; i++; continue; }
    if (c === 10 || c === 13) {
      fila.push(campo); campo = ''; filas.push(fila); fila = [];
      if (c === 13 && t.charCodeAt(i + 1) === 10) i++;
      i++;
      continue;
    }
    let k = i;
    while (k < n) {
      const d = t.charCodeAt(k);
      if (d === sc || d === 10 || d === 13 || d === 34) break;
      k++;
    }
    campo += t.slice(i, k);
    i = k;
  }
  if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila); }
  return filas.filter((f) => !(f.length === 1 && f[0] === ''));
}
