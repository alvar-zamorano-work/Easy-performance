/* easyperformance v3: arranque. Pasa los datos de antes a su espacio, lee los cortes y la carpeta recordada, y carga. */
(function () {
  const EP = window.EP;
  const ir = () => EP.migrar().catch(() => { }).then(() => Promise.all([EP.cortes.releer(), EP.carpeta.recordar()])).then(() => EP.arrancar());
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ir); else ir();
})();
