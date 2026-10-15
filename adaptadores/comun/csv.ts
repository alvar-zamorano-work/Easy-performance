// Lector de CSV tolerante: separador coma, punto y coma o tabulador; comillas dobles; BOM.

export function detectarSeparador(t: string): string {
  const cuentas: Record<string, number> = { ',': 0, ';': 0, '\t': 0 };
  let dentro = false;
  for (let i = 0; i < t.length && i < 20000; i++) {
    const c = t[i];
    if (c === '"') dentro = !dentro;
    else if (!dentro && (c === '\n' || c === '\r')) break;
    else if (!dentro && Object.prototype.hasOwnProperty.call(cuentas, c)) cuentas[c]++;
  }
  let mejor = ',';
  Object.keys(cuentas).forEach((k) => { if (cuentas[k] > cuentas[mejor]) mejor = k; });
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
