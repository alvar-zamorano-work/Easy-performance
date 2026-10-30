/* easyperformance v3: arranque. Espera a los cortes y a la carpeta recordada, y carga. */
(function () {
  const EP = window.EP;
  const ir = () => Promise.all([EP.cortes.listo, EP.carpeta.recordar()]).then(() => EP.arrancar());
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ir); else ir();
})();
