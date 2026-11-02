# Seguimiento-de-actividades
apliacion enfocada al registro y monitoreo de actividades empresariales

## Estructura

- `src/` — frontend React + Vite: login con verificación en 2 pasos, registro, recuperar contraseña, menú según el rol, Inicio, Registrar actividad (con herencia de pendientes), Mis actividades, Monitoreo, Reportes (exportar a Excel/PDF), Buzón, Departamentos y Perfil.
- `server/` — API con Fastify; en producción también sirve el frontend compilado (`dist/`).
- `server/*.json` — datos de prueba de los mockups: usuarios (contraseña `demo1234`, **texto plano, sin seguridad todavía**), actividades y notificaciones.

**Sin base de datos por ahora:** los cambios (cuentas nuevas, contraseñas, actividades, avances, notificaciones leídas) viven en la memoria del servidor y se comparten entre usuarios, pero se pierden al reiniciar o redeployar.

**Simulado:** el código de la verificación en 2 pasos se muestra en pantalla en lugar de enviarse por correo.

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
| `POST` | `/api/login/verificar` | Paso 2: código de 6 dígitos (5 min, 5 intentos); devuelve la sesión |
| `POST` | `/api/login/reenviar` | Nuevo código para la misma verificación |
| `POST` | `/api/registro` | Crear cuenta (técnico / Ing. Jr eligen encargado; encargados indican su área) |
| `POST` | `/api/recuperar` | Validar número de empleado y correo; da un permiso de un solo uso |
| `POST` | `/api/recuperar/cambiar` | Contraseña nueva con ese permiso |
| `GET` | `/api/perfil/:no` | Datos del empleado y días para que venza su contraseña; con `?hoy=&zona=`, su rate de aprobación |
| `POST` | `/api/perfil/:no/password` | Cambiar la contraseña propia (pide la actual) |
| `GET` | `/api/departamentos` | Plantilla de todos los departamentos; con `?hoy=&zona=` (fecha y zona horaria IANA del navegador), el rate de cada uno |
| `GET` | `/api/inicio/:no` | Indicadores y notificaciones. `?desde=` (inicio del día local) cuenta solo lo abierto y lo realizado hoy; `?hoy=` (fecha local) genera los avisos automáticos |
| `POST` | `/api/notificaciones/:no/leidas` | Marcar todas como leídas |
| `POST` | `/api/notificaciones/:no/:id/leida` | Marcar una como leída (al tocarla en el Buzón) |
| `GET` | `/api/equipo/:no` | Equipo de un encargado con jefe y actividades vigentes de cada uno |
| `POST` | `/api/actividades` | Registrar actividades por puntos y notificar al empleado |
| `POST` | `/api/actividades/propia` | El técnico / Ing. Jr agrega una tarea suya, diaria o urgente (con su fin de turno); se avisa a su encargado |
| `GET` | `/api/actividades/:no` | Actividades asignadas a un empleado (urgentes abiertas primero) |
| `PATCH` | `/api/actividades/:id` | El asignado actualiza estado, avance y comentario; se notifica al encargado |
| `POST` | `/api/actividades/:id/heredar` | Heredar una pendiente o incompleta al día siguiente o a otro técnico / Ing. Jr del siguiente turno |
| `POST` | `/api/reportes` | Actividades de los empleados elegidos entre dos fechas, opcionalmente por turno; Reportes arma con ellas el comparativo por empleado y por líder (`src/reporte.js`) |
- `render.yaml` — despliegue en Render.

## Despliegue en Render

1. En Render: **New → Blueprint** y elige este repositorio (usa `render.yaml`).
2. Render ejecuta `npm install && npm run build` y luego `npm start`.
3. Entra con `10482` / `demo1234` (técnico) o `10001` / `demo1234` (gerente). El código de verificación aparece en pantalla (simulado).

## Scripts

- `npm run build` — compila el frontend.
- `npm start` — levanta Fastify (puerto `PORT`, 3000 por defecto).
- `npm test` — pruebas de la API y de las traducciones.
- `npm run lint` — oxlint.
