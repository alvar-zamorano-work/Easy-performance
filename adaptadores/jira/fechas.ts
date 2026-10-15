// Fechas de los exports de Jira: ISO, "12/Oct/26 8:12 AM", "12/oct/26 8:12" y dd/mm/aaaa.

import { norm } from '../../nucleo/util.ts';

const MESES: Record<string, number> = { jan: 0, ene: 0, feb: 1, mar: 2, apr: 3, abr: 3, may: 4, jun: 5, jul: 6, aug: 7, ago: 7, sep: 8, set: 8, oct: 9, nov: 10, dec: 11, dic: 11 };

export function leerFecha(entrada: unknown): Date | null {
  if (entrada == null) return null;
  const s = String(entrada).trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  m = s.match(/^(\d{1,2})[\/\-\s]([A-Za-zÀ-ÿ\.]{3,6})[\/\-\s](\d{2,4})(?:,?\s+(\d{1,2}):(\d{2})(?::\d{2})?\s*([aApP])?\.?\s?[mM]?\.?)?/);
  if (m) {
    const clave = norm(m[2]).replace(/\./g, '').slice(0, 3);
    if (Object.prototype.hasOwnProperty.call(MESES, clave)) {
      let y = +m[3];
      if (y < 100) y += 2000;
      let h = +(m[4] || 0);
      const ap = m[6] ? m[6].toLowerCase() : null;
      if (ap === 'p' && h < 12) h += 12;
      if (ap === 'a' && h === 12) h = 0;
      return new Date(y, MESES[clave], +m[1], h, +(m[5] || 0));
    }
  }
  m = s.match(/^(\d{1,2})[\/\.](\d{1,2})[\/\.](\d{2,4})(?:,?\s+(\d{1,2}):(\d{2}))?/);
  if (m) {
    let yy = +m[3];
    if (yy < 100) yy += 2000;
    return new Date(yy, +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0));
  }
  const t = Date.parse(s);
  return isNaN(t) ? null : new Date(t);
}
