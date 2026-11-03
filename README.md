# Seguimiento-de-actividades
apliacion enfocada al registro y monitoreo de actividades empresariales

## Estructura

- `src/` — frontend React + Vite: login con verificación en 2 pasos, registro, recuperar contraseña, menú según el rol, Inicio, Registrar actividad (con herencia de pendientes), Mis actividades, Monitoreo, Reportes (exportar a Excel/PDF), Buzón, Departamentos y Perfil.
- `server/` — API con Fastify; en producción también sirve el frontend compilado (`dist/`).
- `server/*.json` — datos de prueba de los mockups: usuarios (contraseña `demo1234`, guardada con hash), actividades, notificaciones y el checador simulado.

**Sin base de datos por ahora:** los cambios (cuentas nuevas, contraseñas, actividades, avances, notificaciones leídas) viven en la memoria del servidor y se comparten entre usuarios, pero se pierden al reiniciar o redeployar.

**Sesión:** al terminar los 2 pasos el servidor guarda la sesión en una cookie `HttpOnly` y `SameSite=Strict` (en Render, también `Secure`). Al recargar la página se sigue dentro; se cierra con "Cerrar sesión", al cerrar el navegador o tras 12 h sin uso. El servidor toma de la sesión quién pide: nadie puede ver ni cambiar datos como otro empleado. Cambiar la contraseña cierra las demás sesiones de esa persona (recuperarla, todas). Las sesiones también viven en memoria: al reiniciar el servidor hay que volver a entrar.

**Matriz de seguimiento** (encargados, su rama): yield de diarias y de urgentes (realizadas ÷ asignadas; las de hoy abiertas y las urgentes sin cerrar aún no cuentan), tiempo extra (salida después del fin de turno) y asistencia (días hábiles con entrada ÷ días hábiles), estos dos hasta ayer. **Checador simulado:** `server/checador.json` trae entrada/salida de lunes a viernes, oct–dic 2026; se cambia por el checador real.

**Jerarquía** (encargados): árbol de su rama; cada persona abre su Monitoreo. En **Monitoreo**, tocar el nombre muestra sus actividades asignadas (30 días atrás y lo programado).

**Departamentos:** cada quien ve solo la plantilla de su departamento; los equipos nunca cruzan departamentos.

**Portada y acceso:** una presentación de tres slides (un dial de 24 h que avanza por los turnos A, B y C; se puede pausar o saltar y no se mueve con "reducir movimiento") termina en dos accesos: **Gerencia** (Gerente, Senior, Ing. Full) y **Jr / Técnico**. Cada acceso tiene su login y su registro (solo los puestos de ese acceso); entrar por el acceso equivocado lo indica. Después de la primera vez, la portada abre directo en la elección.

**Cuentas de prueba:** las de los mockups (`"prueba": true` en `server/usuarios.json`) entran sin el código de la app, para revisiones rápidas; el login de cada acceso tiene un botón para entrar con Laura (Gerente) o Jorge (Técnico). Las cuentas registradas sí piden MFA. Quitar `prueba` cuando haya usuarios reales.

**Ajustes del gerente:** crea departamentos (quien lo crea lo dirige) y carga la plantilla de su gente desde Excel (`.xlsx`; ejemplo en `public/plantilla-departamento.xlsx`). Se revisa todo antes de guardar: el formato en el navegador (`src/plantilla.js`) y las reglas en el servidor (número de otro departamento, correo repetido, encargado de mayor puesto y del mismo departamento). Si una fila tiene error no se guarda nada. Las personas nuevas crean su contraseña con "¿Olvidaste tu contraseña?". PDF no: sus tablas no se pueden leer de forma confiable.

**Super administradores:** fuera de los departamentos; su menú es **Usuarios** (lista y ficha completa: puesto, turno, dar o quitar acceso, restablecer contraseña con una temporal que se muestra una vez y obliga a cambiarla, reiniciar el MFA) y **Registros** (inicios de sesión, intentos fallidos y cambios de los administradores, con fecha, IP y navegador/sistema; filtros, exportar CSV y borrar los anteriores a una fecha). Los cambios piden volver a escribir su contraseña (vale 5 minutos). Sus cuentas no van en el repositorio: se definen en la variable de entorno `SUPERADMINS` (ver Despliegue). La MAC del equipo no se puede obtener desde un navegador.

**Contraseñas:** se guardan con scrypt (`node:crypto`); nadie, ni un super administrador, puede verlas.

**MFA con app autenticadora (TOTP):** el segundo paso del login pide el código de 6 dígitos de Google o Microsoft Authenticator. La primera vez que alguien entra, la app muestra un QR y la clave para vincularla; queda guardada al escribir el primer código. Un código no se acepta dos veces y se tolera ±30 s de desfase del reloj. Sin servicios externos (`node:crypto`). Pendiente: códigos de respaldo y reinicio del MFA por un administrador si alguien pierde el teléfono.

**Herencias** (Ing. Full o superior): se propone heredar una actividad pendiente o incompleta del equipo, con motivo, a cualquier departamento. El servidor verifica dos condiciones sí/no: mismo nivel de puesto (técnico ↔ Ing. Jr, Ing. Full ↔ Senior) y turno siguiente (o el mismo empleado al día siguiente). La valida el encargado directo de quien la recibe: acepta, rechaza o redirige a alguien de su equipo, con comentario. Si quien propone ya es ese encargado, entra directo. Límites por día: 2 por turno y 2 a otro departamento para quien propone; 2 redirecciones para quien valida.

**Criticidad** de las actividades diarias: simple, normal, alta o crítica. La crítica va después de las urgentes y pasa directo al turno siguiente (sin validación ni límite) una vez al día.

**Rate de aprobación:** % de las actividades de los últimos 30 días realizadas a tiempo (a más tardar el día que les tocaba, en la hora local de quien consulta). Las de hoy que siguen abiertas aún no cuentan. Se muestra en Departamentos, Perfil y Monitoreo.

## Idioma, tema y horas

- **Idioma ES / EN**: los textos se escriben en español dentro de `t('…')` (`src/i18n.js`) y su traducción va en `src/en.js`, con el texto en español como clave. Si falta una traducción se muestra el español. Los mensajes de error del servidor también se traducen en el cliente. `npm test` revisa que todo texto tenga su versión en inglés.
- **Tema claro / oscuro**: botón en la barra superior y en el login; se recuerda en el navegador y por defecto sigue al sistema.
- **Horas**: el servidor guarda instantes en UTC y cada navegador los muestra en su hora local.
- **Avisos automáticos**: actividad atrasada (al ejecutor y a quien la asignó) y contraseña por vencer; se generan una sola vez al consultar Inicio y el Buzón se actualiza cada 30 s.

## Tareas propias (técnico e Ing. Jr)

En **Mis actividades**, "Nueva tarea" agrega una tarea con los datos del empleado tal cual (él mismo, su turno, la fecha de hoy) y avisa a su encargado.
- **Diaria:** una actividad más del seguimiento.
- **Urgente:** va primero, no se puede heredar y al terminar el turno se valida: queda fija en su estado (incompleta si no llegó al 100 %) y se avisa al empleado y a su encargado.

## API

| Método | Ruta | Uso |
|---|---|---|
| `POST` | `/api/login` | Paso 1: usuario (correo, alias o número) y contraseña; genera el código |
| `POST` | `/api/login/verificar` | Paso 2: código de la app autenticadora (5 min, 5 intentos); abre la sesión (cookie) y devuelve el usuario |
| `GET` | `/api/encargados` | Encargados y los departamentos donde pueden serlo (Registro, sin sesión) |
| `GET` | `/api/deptos` | Catálogo de departamentos (sin sesión) |
| `POST` | `/api/departamentos` | Un gerente crea un departamento y queda como quien lo dirige |
| `POST` | `/api/departamentos/:clave/plantilla` | Cargar la plantilla del departamento (`soloRevisar: true` solo valida) |
| `GET` | `/api/sesion` | Usuario de la sesión actual (al recargar la página) |
| `POST` | `/api/logout` | Cerrar sesión |
| `POST` | `/api/registro` | Crear cuenta (técnico / Ing. Jr eligen encargado; encargados indican su área) |
| `POST` | `/api/recuperar` | Validar número de empleado y correo; da un permiso de un solo uso |
| `POST` | `/api/recuperar/cambiar` | Contraseña nueva con ese permiso |
| `GET` | `/api/perfil/:no` | Datos del empleado y días para que venza su contraseña; con `?hoy=&zona=`, su rate de aprobación |
| `POST` | `/api/perfil/:no/password` | Cambiar la contraseña propia (pide la actual) |
| `GET` | `/api/departamentos` | Plantilla de los departamentos de quien consulta (el suyo y los que dirige); con `?hoy=&zona=` (fecha y zona horaria IANA del navegador), el rate de cada uno |
| `GET` | `/api/inicio/:no` | Indicadores y notificaciones. `?desde=` (inicio del día local) cuenta solo lo abierto y lo realizado hoy; `?hoy=` (fecha local) genera los avisos automáticos |
| `POST` | `/api/notificaciones/:no/leidas` | Marcar todas como leídas |
| `POST` | `/api/notificaciones/:no/:id/leida` | Marcar una como leída (al tocarla en el Buzón) |
| `GET` | `/api/equipo/:no` | Equipo de un encargado con jefe y actividades vigentes de cada uno |
| `POST` | `/api/actividades` | Registrar actividades por puntos (diarias, o urgentes con el cierre del turno elegido) y notificar al empleado |
| `POST` | `/api/actividades/propia` | El técnico / Ing. Jr agrega una tarea suya, diaria o urgente (con su fin de turno); se avisa a su encargado |
| `GET` | `/api/actividades/:no` | Actividades asignadas a un empleado (urgentes abiertas primero) |
| `PATCH` | `/api/actividades/:id` | El asignado actualiza estado, avance y comentario; se notifica al encargado |
| `GET` | `/api/actividades/:id/receptores` | Quiénes pueden recibir esa actividad (cualquier departamento) y quién la validaría |
| `POST` | `/api/actividades/:id/heredar` | Proponer la herencia con motivo; entra directo si es crítica o si quien propone es el encargado de quien la recibe |
| `GET` | `/api/herencias/:no?hoy=` | Por validar, enviadas y lo usado hoy de cada límite |
| `POST` | `/api/herencias/:id/responder` | Aceptar, rechazar o redirigir (con comentario) |
| `POST` | `/api/reportes` | Actividades de los empleados elegidos entre dos fechas, opcionalmente por turno; Reportes arma con ellas el comparativo por empleado y por líder (`src/reporte.js`) |
| `GET` | `/api/matriz/:no` | Matriz de seguimiento del equipo con `?desde=&hasta=&hoy=` |

Las rutas de login, registro, recuperar contraseña, `/api/encargados` y `/api/deptos` son públicas; las demás piden sesión (401 si no hay) y el `:no` de la dirección o el `por` del cuerpo debe ser el de la sesión (403 si no).

- `render.yaml` — despliegue en Render.

## Despliegue en Render

**Super administradores:** en el servicio de Render, *Environment* → agregar `SUPERADMINS` con un JSON (no se sube al repositorio; en local, en un `.env` que git ignora):

```
[{"name":"Nombre Apellido","email":"correo@empresa.com","password":"…"},{"name":"…","email":"…","password":"…"}]
```

Sus números de empleado son 90001, 90002… en ese orden (o `"no"` en cada uno). Entran por **Gerencia** y la primera vez vinculan su app autenticadora.


1. En Render: **New → Blueprint** y elige este repositorio (usa `render.yaml`).
2. Render ejecuta `npm install && npm run build` y luego `npm start`.
3. Elige el acceso y entra con `10001` / `demo1234` (Gerencia) o `10482` / `demo1234` (Jr / Técnico), o con el botón de revisión rápida. Una cuenta registrada vincula su app autenticadora con el QR; los datos viven en memoria y tras reiniciar el servidor se vuelve a vincular.

## Scripts

- `npm run build` — compila el frontend.
- `npm start` — levanta Fastify (puerto `PORT`, 3000 por defecto).
- `npm test` — pruebas de la API, de la plantilla y de las traducciones (todo texto de interfaz del código y del servidor debe tener su inglés en `src/en.js`).
- `npm run lint` — oxlint.
