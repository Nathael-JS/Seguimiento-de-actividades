# Historial de cambios

Una entrada por cada pull request fusionado en `main`, de la más nueva a la más vieja. Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).

- **Agregado:** funciones nuevas.
- **Cambiado:** comportamiento distinto al anterior.
- **Corregido:** errores, con su causa.
- **Advertencias:** lo que hay que saber o hacer (configuración, variables, avisos del log, efectos para los usuarios).
- **Archivos:** dónde quedó el cambio.

Los incidentes (síntoma, causa, solución y prevención) se detallan en la [bitácora de DOCUMENTACION.md](DOCUMENTACION.md#17-bitácora-de-incidentes). La referencia técnica completa está en [DOCUMENTACION.md](DOCUMENTACION.md).

---

## [PR #29] 2026-11-05: Control de versiones y servidor de planta

### Agregado
- **Servidor de planta** (Rocky Linux 10.2, NGINX 1.26.3, PostgreSQL 16.15, Node 22, sin internet). Guía paso a paso en `DESPLIEGUE_PLANTA.md`. En `deploy/`:
  - NGINX: HTTPS (TLS 1.2/1.3, HSTS), redirección de 80 y encabezados del proxy;
  - servicio de systemd de la app, con usuario sin privilegios y disco de solo lectura;
  - respaldo diario cifrado a una carpeta de red, con su timer;
  - variables de ejemplo;
  - `instalar.sh`, con versiones lado a lado para volver atrás.
- **`npm run paquete`:** arma el `.tar.gz` para el servidor (app compilada + dependencias de producción exactas).
- **CI en cada PR** (`.github/workflows/ci.yml`): `npm ci`, `npm audit` (altas y críticas), lint, build y pruebas con PostgreSQL.
- **Dependabot:** cada lunes un PR con las actualizaciones de npm y cada mes las de GitHub Actions; las de seguridad, en cuanto salen.

### Cambiado
- **Fuentes dentro de la app:** IBM Plex sale de `@fontsource` (subconjunto latino); ya no se pide a Google Fonts. La app abre sin internet.
- **`HOST`:** nueva variable para elegir dónde escucha la app (`127.0.0.1` en planta; sigue `0.0.0.0` por defecto para Render).
- **Versiones exactas:** `package.json` sin `^` (las mismas del lockfile) y `.npmrc` con `save-exact=true`. Node 22.
- **Render:** construye con `npm ci && npm run build`, que instala exactamente el `package-lock.json`.
- **`restaurar.js` y `vaciar.js`:** sus mensajes ya no suponen Render.

### Advertencias
- **En tu equipo:** instala con `npm ci`, no con `npm install`. Con el lockfile del repositorio, `npm audit` da 0 vulnerabilidades; si un `npm install` muestra otras, viene de versiones distintas a las del lockfile.
- **Render:** si el servicio no se creó como Blueprint, cambiar a mano *Settings → Build Command* a `npm ci && npm run build`.
- **GitHub:** en *Settings → Code security* activar *Dependabot alerts* y *Dependabot security updates*.
- **Migración:** usar el respaldo JSON (Usuarios → Descargar respaldo); el `pg_dump` de Neon puede venir de una versión de PostgreSQL más nueva que la 16.
- **NGINX solo IPv4:** si la red de planta usa IPv6, agregar las líneas `listen [::]` (nota en el archivo).

### Archivos
- `deploy/` (nuevo), `scripts/paquete.sh`, `DESPLIEGUE_PLANTA.md`
- `package.json`, `package-lock.json`, `.npmrc`, `.gitignore`, `render.yaml`, `.github/workflows/ci.yml`, `.github/dependabot.yml`
- `index.html`, `src/main.jsx`, `server/index.js`, `server/restaurar.js`, `server/vaciar.js`
- `README.md`, `DOCUMENTACION.md`, `PRUEBAS.md`

---

## [PR #28] 2026-11-05: Marca de autoría y plantilla con el turno 4

### Agregado
- **Marca de autoría** "© Copyright 2026 IT Team GDL / MICHELL TOVAR Test Engineer Jr. All Rights Reserved.":
  - al pie de la portada, del inicio de sesión, del cambio de contraseña obligatorio y de cada pantalla de la app;
  - en el pie de cada página de los PDF de Reportes.
- Es igual en ambos idiomas.

### Cambiado
- **Plantilla de ejemplo (.xlsx):**
  - turnos 1 a 4 (antes A/B/C con los horarios viejos), con una persona de ejemplo en el turno 4;
  - el menú desplegable del turno ofrece 1, 2, 3 y 4;
  - instrucciones al día: horarios nuevos, las personas se registran con *Registrarse* y ya no se menciona a Laura.
- **Vista previa de la plantilla:** muestra "Turno 4 · Administrativo" en lugar de la clave interna (D).

### Archivos
- `public/plantilla-departamento.xlsx`, `src/Ajustes.jsx`
- `src/comun.js` (`COPYRIGHT`), `src/ui.jsx` (`Firma`), `src/Shell.jsx`, `src/Login.jsx`, `src/CambioObligatorio.jsx`, `src/pdf.js`, `src/index.css`

---

## [PR #27] 2026-11-05: Salida, tiempo extra registrado y Matriz mejorada

### Agregado
- **Marcar salida:** desde 30 min antes del fin del turno, en la barra de arriba (`POST /api/salida/:no`). El turno 3 la marca a la mañana siguiente sin abrir otra jornada.
- **Tiempo extra registrado:** junto a la salida, **Tiempo extra** pide cuánto se quedará (30 min a 6 h, `POST /api/extra/:no`). Al marcar la salida se valida solo:
  - cuenta si salió más de 15 min después del fin del turno;
  - cuenta lo que se quedó de verdad, hasta lo registrado;
  - sin registro no cuenta.
- **Matriz:** vuelve la columna de tiempo extra (validado y, debajo, lo registrado); columnas ordenables; en celular, una tarjeta por persona.

### Advertencias
- **Render:** se queda en el plan gratis (se duerme tras 15 min sin uso).
- El tiempo extra solo cuenta desde hoy: las jornadas anteriores no tienen registro.

### Archivos
- `server/app.js`, `server/app.test.js`, `server/datos/pruebas/checador.json` (registros de prueba)
- `src/Shell.jsx`, `src/Matriz.jsx`, `src/comun.js` (`horas`), `src/Icono.jsx` (`clock`), `src/index.css`, `src/en.js`
- `DOCUMENTACION.md`, `PRUEBAS.md`

---

## [PR #26] 2026-11-05: Inicio desde 0 y dependencias al día

### Agregado
- **Plantillas → Nuevo gerente** (super administrador, `POST /api/admin/gerentes`, pide confirmación):
  - El gerente queda por registrar.
  - El departamento se crea si no existe; a uno que ya tiene gerente no se le quita.
  - Después, el gerente se registra en la app y carga la plantilla de su gente.

### Cambiado
- **Inicio desde 0:** `server/datos/inicio` ya no trae usuarios ni departamentos (se quitaron Laura y Jorge). *Vaciar datos* deja solo a los super administradores.
- **`@fastify/static` 10.1.10:** con `npm audit fix`, los avisos de `glob` y `minimatch` pasan a 0 vulnerabilidades.

### Corregido
- **Menú lateral:** el nombre y el puesto ya no se cortan (antes salía "Super administrador · 900…").

### Advertencias
- **Volver a vaciar producción:** tras el merge, correr *Vaciar datos* otra vez para quitar a Laura y Jorge, reiniciar Render y dar de alta al gerente desde Plantillas.

### Archivos
`server/app.js`, `server/vaciar.js`, `server/datos/inicio/*.json`, `server/app.test.js`, `server/db.test.js`, `src/Admin.jsx`, `src/en.js`, `src/index.css`, `package-lock.json`, `README.md`, `DOCUMENTACION.md`, `PRUEBAS.md`, `CHANGELOG.md`

---

## [PR #25] 2026-11-05: Turnos 1-4, foto de perfil, asistencia al entrar, inicio limpio y Reportes en PDF

### Agregado
- **Turnos nuevos**, guardados con las claves internas A–D: 1 Matutino 07:00–15:00, 2 Vespertino 15:00–22:30, 3 Nocturno 22:30–07:00 y 4 Administrativo 08:00–17:30.
  - En pantalla se ven como "Turno N · Nombre".
  - El reloj de la portada dibuja el turno 4 por dentro.
  - La plantilla de Excel acepta 1-4.
  - En herencias, al administrativo le sigue el administrativo del día siguiente.
- **Foto de perfil:**
  - Se sube desde Perfil y se recorta a 256 px en el navegador.
  - Aparece en todas partes donde antes había iniciales (componente `Avatar`).
  - Endpoints: `POST`/`DELETE /api/perfil/:no/foto` y `GET /api/fotos/:empleado`.
- **Asistencia al entrar:** la primera vez del día que la persona abre la app queda su entrada y ve "Bienvenido, {nombre}: asistencia checada a las HH:MM". Endpoint: `POST /api/asistencia/:no`, con la fecha validada contra el servidor.
- **Departamentos:** el gerente que lo dirige puede renombrarlo o borrarlo, solo si no tiene personas. Endpoints: `PATCH`/`DELETE /api/departamentos/:clave`.
- **Límite de cambios de estado:** el técnico / Ing. Jr puede cambiar el estado de una misma actividad hasta 5 veces; después espera 10 minutos.
- **Inicio limpio:**
  - `server/datos/inicio/` trae a Laura y Jorge por registrar y el departamento Liquid Cooling.
  - Workflow **Vaciar datos**: primero respalda, luego vacía y conserva a los super administradores (`server/vaciar.js`).
  - Los datos de los mockups pasan a `server/datos/pruebas/` y solo se usan en las pruebas automáticas.

### Cambiado
- **Sin "versión demo":** se quitaron el botón de revisión rápida y `GET /api/config`. Laura y Jorge son cuentas normales: se registran y usan MFA.
- **Matriz sin tiempo extra:** se implementará después con sus reglas.
- **Nombres de departamento:** siempre se usa el nombre guardado, así que renombrar se ve en todas partes.

### Corregido
- **Nombre flotante del menú plegado** tapado por el contenido. Ver incidente [I-09](DOCUMENTACION.md#i-09-nombre-flotante-del-menú-plegado-tapado-por-el-contenido).

### Advertencias
- **Turnos de usuarios existentes:** la base de producción conserva sus claves A, B y C, que ahora se leen como turnos 1, 2 y 3 con los **horarios nuevos**. Tras el inicio limpio no hay datos viejos.
- **Después de Vaciar datos:**
  - Hay que reiniciar Render.
  - Laura y Jorge deben registrarse cuanto antes con su número y correo.
  - Los super administradores se conservan con su app vinculada.

### Archivos
`server/app.js`, `server/db.js` (sin cambios de tablas), `server/vaciar.js`, `server/datos/**`, `.github/workflows/vaciar.yml`, `src/comun.js`, `src/ui.jsx`, `src/Shell.jsx`, `src/Login.jsx`, `src/App.jsx`, `src/Perfil.jsx`, `src/Ajustes.jsx`, `src/Dial.jsx`, `src/Matriz.jsx`, `src/plantilla.js`, `src/tablero.js` y casi todas las páginas (turnos y `Avatar`), `src/en.js`, `src/index.css`, pruebas, documentación

## Reportes en PDF real (vista previa y descarga), en el mismo PR #25

### Cambiado
- **Exportar PDF en Reportes** ya no abre la impresión del navegador: genera un PDF de verdad.
  - **Contenido:** encabezado con logo y filtros, recuadros de resumen (registros, % realizadas, incompletas y pendientes), tabla comparativa, detalle con el estado en color, y en el pie quién lo generó, cuándo y el número de página.
  - **En escritorio** se abre una vista previa con *Descargar PDF*. **En celular** se descarga directo, porque los visores de PDF dentro de la página no funcionan bien ahí.

### Agregado
- Dependencias `jspdf` y `jspdf-autotable`, que se cargan solo al exportar (137 kB comprimido). El JS inicial no cambió.

### Advertencias
- `npm audit` marca 3 avisos moderados en una dependencia de `@fastify/static` (`glob` / `minimatch`). No vienen de este cambio; se revisan en la ronda de optimización.

### Archivos
`src/pdf.js` (nuevo), `src/Reportes.jsx`, `src/en.js`, `src/index.css`, `package.json`, `package-lock.json`, `DOCUMENTACION.md`, `PRUEBAS.md`, `CHANGELOG.md`

---

## [PR #24] 2026-11-04: Errores, salud, rendimiento, registro validado con la plantilla y preparación del deploy

### Agregado
- **Manejo de errores del servidor:** un 500 se registra con un código de 8 caracteres y el usuario ve "Ocurrió un error en el servidor. Si se repite, comparte este código: …", sin detalles internos.
- **`SiFalla`:** si una pantalla falla, muestra "Algo falló en esta pantalla" con Recargar en vez de quedar en blanco. El error del navegador llega al log de Render a través de `POST /api/errores`.
- **`/api/salud`:** health check de Render (`healthCheckPath` en `render.yaml`) que también revisa la base.
- **`CUENTAS_PRUEBA=no`:** apaga las cuentas de prueba en producción. No entran, sus sesiones dejan de servir y se oculta la revisión rápida. Endpoint nuevo `GET /api/config`.
- **`PRUEBAS.md`:** lista de pruebas manuales por rol y lista para el deploy completo.
- **`CHANGELOG.md`, bitácora de incidentes y plantilla de PR.**
- **Registro validado con la plantilla:** solo se registra quien viene en la plantilla de su departamento, con su número y su correo. Si no coinciden, ve "Tus datos no coinciden con la plantilla de tu departamento. Comunícate con los administradores para verificar la plantilla." y el intento queda registrado.
- **Panel Plantillas** (super administrador):
  - Muestra quién está por registrar y quién ya se registró.
  - Permite corregir el número o el correo de una fila, o quitarla.
  - Lista los intentos rechazados y con quién coinciden.
  - Endpoints: `GET /api/admin/plantillas`, `PATCH` y `DELETE /api/admin/plantillas/:empleado`.
- **Errores en Registros:** el super administrador ve los errores del servidor (con su código) y los del navegador.

### Cambiado
- **Carga diferida:** las páginas (salvo Inicio) se descargan al abrirlas. El JS inicial bajó de 409 a 262 kB.
- **`npm run build`:** precomprime los archivos (Brotli y gzip). El JS principal viaja en unos 70 kB.
- **Notificaciones:** cada persona conserva sus últimas 200.
- **Plantilla:** las cuentas nuevas quedan **por registrar**. Ya no se generan contraseñas temporales, porque cada persona elige la suya al registrarse.
- **Registro:** ya no se eligen encargado, puesto ni departamento; vienen de la plantilla. Se eliminó `GET /api/encargados`, que publicaba sin sesión la lista de encargados.
- **Traducciones:** se quitaron 47 que ya no usaba ningún archivo.

### Advertencias
- **Antes de abrir a usuarios reales:** poner `CUENTAS_PRUEBA=no` en Render. Mientras no se haga, `10001` / `demo1234` (publicado en el repositorio) entra sin MFA.
- **Plan de Render:** el plan gratis se duerme tras 15 min sin uso; la primera visita tarda hasta un minuto.
- **Cuentas con contraseña temporal:** las que se hayan cargado antes de este cambio siguen funcionando igual (al entrar, cambian la contraseña).

### Archivos
`server/app.js`, `server/index.js`, `server/app.test.js`, `src/main.jsx`, `src/App.jsx`, `src/Shell.jsx`, `src/Login.jsx`, `src/Registro.jsx`, `src/Admin.jsx`, `src/Ajustes.jsx`, `src/comun.test.js`, `src/ui.jsx`, `src/comun.js`, `src/en.js`, `src/index.css`, `scripts/comprimir.js`, `package.json`, `render.yaml`, `PRUEBAS.md`, `CHANGELOG.md`, `DOCUMENTACION.md`, `README.md`, `.github/pull_request_template.md`

---

## [PR #23] 2026-11-04: Paneles minimizables, pestañas sincronizadas y borrar historial

### Corregido
- **Paneles encimados en el Inicio del gerente:** "Notificaciones recientes" quedaba encima de "Avance por turno".
  - **Causa:** el Inicio del gerente usaba la clase `.tablero`, la misma del Tablero kanban, con una rejilla de 6 columnas.
  - **Solución:** clase propia `.inicio-gerente`. Ver incidente [I-01](DOCUMENTACION.md#i-01-paneles-encimados-en-el-inicio-del-gerente).
- **La otra pestaña "se desactivaba"** al entrar con otra cuenta en el mismo navegador.
  - **Causa:** las pestañas comparten la cookie de sesión, y la otra pestaña no se enteraba del cambio.
  - **Solución:** las pestañas se sincronizan al momento (evento `storage`; el 403 trae `otraCuenta`). Ver incidente [I-02](DOCUMENTACION.md#i-02-se-desactivó-la-cuenta-al-abrir-dos-cuentas-en-dos-pestañas).

### Agregado
- **Componente `Panel`:** tarjeta con título que se minimiza a su barra y lo recuerda el navegador. Se usa en notificaciones recientes, tareas abiertas, avance por líder, avance por turno y requieren atención.
- **Buzón → Borrar historial**, con confirmación. Nuevo `DELETE /api/notificaciones/:no`, que borra solo las propias; los avisos automáticos no vuelven.
- **DOCUMENTACION.md:** sección "Problemas resueltos y guía rápida" (ahora es la bitácora de incidentes).

### Advertencias
- Para tener dos cuentas abiertas a la vez hay que usar una ventana de incógnito u otro navegador.

### Archivos
`src/TableroGerente.jsx`, `src/Inicio.jsx`, `src/ui.jsx`, `src/App.jsx`, `src/Shell.jsx`, `src/comun.js`, `src/Buzon.jsx`, `src/index.css`, `src/en.js`, `server/app.js`, `server/app.test.js`, `README.md`, `DOCUMENTACION.md`

---

## [PR #22] 2026-11-04: Tareas recurrentes, editar, tareas guardadas, documentación y seguridad del acceso

### Agregado
- **Tareas recurrentes:**
  - El interruptor **Repetir** permite repetir una tarea cada día hábil, cada semana o cada mes. Está al crear la tarea y en **Editar**.
  - Al llegar su fecha (cuando se consulta Inicio) se crea una copia nueva Pendiente.
  - Función `siguienteFecha()`, exportada para las pruebas.
- **Editar** en el menú ⋯ de la tarjeta:
  - El encargado puede cambiar texto, comentario, fecha, turno y recurrencia.
  - El técnico / Ing. Jr puede cambiar texto, fecha y recurrencia de las tareas que agregó.
  - Endpoint: `PATCH /api/actividades/:id/editar`.
- **Tareas guardadas:** plantillas personales, hasta 100 por persona.
  - Se crean con "Guardar como tarea", eligiendo una criticidad, y se muestran en un panel con "Usar" y "Eliminar".
  - Tabla nueva `guardadas`. Endpoints: `GET /api/guardadas/:no`, `POST /api/guardadas`, `DELETE /api/guardadas/:id`.
- **Criticidad al crear:** el encargado puede elegirla al crear una tarea (antes siempre nacía en Por clasificar).
- **DOCUMENTACION.md:** referencia técnica completa del sistema.
- **Migración automática:** `conectar()` agrega a las tablas existentes las columnas nuevas (`add column if not exists`).

### Cambiado
- **Recuperar contraseña:** ahora pide también el código de la app autenticadora. Una cuenta sin la app vinculada la tiene que restablecer un super administrador.
- **Plantilla de Excel:** las cuentas nuevas nacen con una contraseña temporal. El gerente la ve una sola vez y la puede descargar en CSV.
- **Bloqueo del login:** ahora cuenta por cuenta, no por lo que se escribe (número, correo o usuario del correo cuentan igual). Los códigos MFA fallidos suman al mismo contador, que vuelve a cero solo al entrar de verdad.

### Corregido
- **Recurrente movida a Urgente:** se repetía como "urgente cerrada" falsa en cada periodo, porque la copia nacía sin cierre de turno. Ahora deja de repetirse al pasar a Urgente.
- **Hueco al cargar la plantilla:** el cálculo de las contraseñas temporales dejaba una pausa a mitad del guardado. Ahora los hashes se calculan antes y en paralelo.
- **Interruptor Repetir:** se veía como un círculo grande por una regla CSS del formulario.
- **Fecha cortada** en el formulario de edición de la tarjeta.

### Advertencias
- **Recuperar contraseña:** quien no tenga la app vinculada ya no la recupera por su cuenta; lo hace un super administrador.
- **Cuentas de prueba:** las que tienen `prueba: true` siguen entrando y recuperando sin código. Hay que quitarlas cuando lleguen los usuarios reales.
- **Copias recurrentes:** se crean al consultar Inicio y se guardan con la siguiente escritura (`shortcut:` documentado).

### Archivos
`server/app.js`, `server/db.js`, `server/app.test.js`, `server/db.test.js`, `src/Tablero.jsx`, `src/Recuperar.jsx`, `src/Ajustes.jsx`, `src/Icono.jsx`, `src/comun.js`, `src/ui.jsx`, `src/en.js`, `src/index.css`, `README.md`, `DOCUMENTACION.md`

---

## [PR #21] 2026-11-03: Respaldo con upload-artifact v7

### Cambiado
- El workflow de respaldo usa `actions/upload-artifact@v7` (Node 24) en lugar de `@v4` (Node 20, en desuso). El artefacto se sigue descargando como zip.

### Archivos
`.github/workflows/respaldo.yml`

---

## [PR #20] 2026-11-03: Tablero del Jr con solicitudes, instancia única, respaldos y logo

### Agregado
- **Tablero del técnico / Ing. Jr:** ve solo sus actividades y puede agregar en Por clasificar.
  - Al mover una tarjeta crea una **solicitud de cambio**, que su encargado aprueba o rechaza desde la tarjeta.
  - Endpoint nuevo: `POST /api/actividades/:id/solicitud`.
- **Instancia única:** cada servidor toma la base de datos al cargarla. En un redeploy, la instancia anterior deja de guardar y responde 503.
- **Respaldos:**
  - **Diario:** workflow con `pg_dump` cifrado (AES-256), que se guarda 30 días.
  - **Manual:** botón "Descargar respaldo" del super administrador.
  - **Restaurar:** `npm run restaurar -- archivo.json`.
- **Logo:** reloj de turnos con una palomita, en el menú, la portada y el favicon.
- **Tareas propias en grupo:** el encargado recibe un solo aviso aunque se agreguen varias a la vez.

### Cambiado
- **Menú del Jr / Técnico:** Inicio, Tablero, Actividades asignadas (antes "Mis actividades"), Buzón y Perfil. Departamentos ahora es solo para encargados, también en el servidor.
- **Optimización:**
  - Las consultas GET ya no escriben en la base.
  - La sesión se renueva cada 5 minutos.
  - `qrcode` y `read-excel-file` se cargan solo cuando se usan: el JS principal bajó de 142 a 116 kB comprimido.

### Advertencias
- **Respaldo diario:** necesita los secretos de GitHub `DATABASE_URL` y `BACKUP_PASSWORD`.
- **Instancia única:** varias instancias a la vez no se reparten el trabajo (`shortcut:` en `server/db.js`).

### Archivos
`server/app.js`, `server/db.js`, `server/restaurar.js`, `.github/workflows/respaldo.yml`, `src/Tablero.jsx`, `src/Admin.jsx`, `src/Login.jsx`, `src/Ajustes.jsx`, `src/ui.jsx`, `public/favicon.svg`, y otros

---

## [PR #19] 2026-11-03: Persistencia en PostgreSQL (Neon)

### Agregado
- **Base de datos:** con `DATABASE_URL`, el servidor crea sus tablas, carga todo al arrancar y, después de cada petición, guarda solo lo que cambió, en una transacción y antes de responder.
- **Primer arranque:** con la base vacía, se llena con los datos de prueba.
- **Prueba de base de datos:** `server/db.test.js`, que corre con `TEST_DATABASE_URL`.

### Advertencias
- **SSL:** en Render, `DATABASE_URL` debe usar `sslmode=verify-full`. Con `require`, `pg` muestra una advertencia en el log. Ver incidente [I-04](DOCUMENTACION.md#i-04-advertencia-de-ssl-de-pg-en-el-log-de-render).
- **Sin `DATABASE_URL`:** todo vive en memoria y se pierde al reiniciar.

### Archivos
`server/db.js`, `server/index.js`, `server/app.js`, `server/db.test.js`, `package.json`

---

## [PR #18] 2026-11-03: Panel Por clasificar reemplaza a Registrar actividad

### Cambiado
- Las actividades se crean en el panel **Por clasificar** del Tablero (una por renglón) y se arrastran a su criticidad. El módulo "Registrar actividad" se eliminó.
- El arrastre se anima con View Transitions.

### Archivos
`src/Tablero.jsx`, `src/Lista.jsx`, `src/ui.jsx`, `src/index.css`, `server/app.js`; se eliminó `src/RegistrarActividad.jsx`

---

## [PR #17] 2026-11-03: Tablero por criticidad, vista de lista y sin porcentaje de avance

### Agregado
- **Tablero:** columnas Simple, Normal, Alta, Crítica y Urgente.
  - Semanas en pestañas.
  - Cada tarjeta se puede arrastrar, fijar o eliminar.
- **Vista de lista:** al estilo SharePoint, en Actividades asignadas y en Monitoreo, con el % de realizadas desplegable.

### Cambiado
- **Sin porcentaje de avance:** se quitó el avance por actividad. El estado manda: Realizada cuenta como 100 y lo demás como 0.

### Archivos
`src/Tablero.jsx`, `src/Lista.jsx`, `src/MisActividades.jsx`, `src/Monitoreo.jsx`, `server/app.js`, y otros

---

## PR #1 a #16: base del sistema

Login en 2 pasos (TOTP), sesiones con cookie HttpOnly, registro y recuperación, roles y menús, Inicio, Herencias con validación, Monitoreo, Reportes, Matriz, Jerarquía, Departamentos y plantilla de Excel, Buzón, tareas propias y urgentes, contraseñas con scrypt, super administradores y registros de auditoría, idioma inglés y tema oscuro. El detalle está en el historial de git (`git log`).
