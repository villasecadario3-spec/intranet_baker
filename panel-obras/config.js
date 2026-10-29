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
