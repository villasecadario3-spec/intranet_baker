/* Panel de Control de Obras 3.0 · configuración para la intranet (intranetbaker.cl). La completa TI.
   api:  dirección base del servicio del Panel (ver documentacion/API_panel.md). Ejemplo: "https://api.ibaker.cl/panel-obras".
   msal: el mismo registro de aplicación de Microsoft que usan los otros módulos de la intranet (clientId y authority);
         el Panel pide el permiso User.Read y envía el token en "Authorization: Bearer …" a cada llamada al servicio.
   sondeoSeg: cada cuántos segundos la página vuelve a leer los datos, para ver los cambios de otros usuarios. */
window.PANEL_CONFIG = {
  api: "https://api.ibaker.cl/panel-obras",
  msal: {
    clientId: "9a56ab1c-d3c4-4460-9892-1d4da768ecfb",
    authority: "https://login.microsoftonline.com/87c9a653-b08e-42c9-92bc-260458dffc26",
    scopes: ["User.Read"]
  },
  sondeoSeg: 20
};

/* TI · Puente de sesión: la intranet guarda el inicio de sesión de Microsoft en la pestaña (sessionStorage) y este módulo lo busca en localStorage.
   Aquí se copia la sesión ya iniciada en la intranet para no pedir el inicio de sesión de nuevo (y evitar que la redirección vuelva a la intranet). */
(function () {
  try {
    var cid = "9a56ab1c-d3c4-4460-9892-1d4da768ecfb", A = "msal.account.keys", T = "msal.token.keys." + cid;
    var sa = JSON.parse(sessionStorage.getItem(A) || "[]");
    if (!sa.length) return;
    var copiar = function (k) { var v = sessionStorage.getItem(k); if (v !== null) localStorage.setItem(k, v); };
    var la = JSON.parse(localStorage.getItem(A) || "[]");
    sa.forEach(function (k) { copiar(k); if (la.indexOf(k) < 0) la.push(k); });
    localStorage.setItem(A, JSON.stringify(la));
    var st = JSON.parse(sessionStorage.getItem(T) || "null");
    if (st) {
      var lt = JSON.parse(localStorage.getItem(T) || "null") || { idToken: [], accessToken: [], refreshToken: [] };
      ["idToken", "accessToken", "refreshToken"].forEach(function (t) {
        lt[t] = lt[t] || [];
        (st[t] || []).forEach(function (k) { copiar(k); if (lt[t].indexOf(k) < 0) lt[t].push(k); });
      });
      localStorage.setItem(T, JSON.stringify(lt));
    }
  } catch (e) { /* si falla, el Panel pide el inicio de sesión como siempre */ }
})();
