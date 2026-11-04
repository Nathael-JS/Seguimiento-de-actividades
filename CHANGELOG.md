# Historial de cambios

Una entrada por cada pull request fusionado en `main`, de la más nueva a la más vieja. Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).

- **Agregado:** funciones nuevas.
- **Cambiado:** comportamiento distinto al anterior.
- **Corregido:** errores, con su causa.
- **Advertencias:** lo que hay que saber o hacer (configuración, variables, avisos del log, efectos para los usuarios).
- **Archivos:** dónde quedó el cambio.

Los incidentes (síntoma, causa, solución y prevención) se detallan en la [bitácora de DOCUMENTACION.md](DOCUMENTACION.md#17-bitácora-de-incidentes). La referencia técnica completa está en [DOCUMENTACION.md](DOCUMENTACION.md).

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
