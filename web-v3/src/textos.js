/* easyperformance v3: textos de pantalla en castellano e inglés (window.TEXTOS los trae construir.ts desde textos.es.json y textos.en.json).
   t('clave', { n: 3 }) sustituye {n}. tn('clave', n) elige 'clave.1' o 'clave.n'. */
(function () {
  const T = window.TEXTOS || { es: {}, en: {} };
  let lang = 'es';
  function t(k, p) {
    let s = T[lang] && T[lang][k] != null ? T[lang][k] : (T.en[k] != null ? T.en[k] : null);
    if (s == null) { (window.__faltan = window.__faltan || {})[k] = 1; s = k; }
    if (p) s = String(s).replace(/\{(\w+)\}/g, (m, x) => (p[x] != null ? p[x] : m));
    return s;
  }
  const tn = (k, n, p) => t(k + (n === 1 ? '.1' : '.n'), Object.assign({ n }, p || {}));
  function fijar(l) {
    lang = l === 'en' ? 'en' : 'es';
    document.documentElement.lang = lang;
    if (window.Nucleo) window.Nucleo.fijarIdioma(lang);
  }
  const navegador = () => (/^es\b/i.test((navigator.languages && navigator.languages[0]) || navigator.language || '') ? 'es' : 'en');
  window.I18N = { t, tn, fijar, navegador, get lang() { return lang; } };
})();
