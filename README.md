# Seguimiento-de-actividades
apliacion enfocada al registro y monitoreo de actividades empresariales

## Estructura

- `src/` — frontend React + Vite: login con verificación en 2 pasos, registro, recuperar contraseña, menú según el rol, Inicio, Registrar actividad (con herencia de pendientes), Mis actividades, Monitoreo, Reportes (exportar a Excel/PDF), Buzón, Departamentos y Perfil.
- `server/` — API con Fastify; en producción también sirve el frontend compilado (`dist/`).
- `server/*.json` — datos de prueba de los mockups: usuarios (contraseña `demo1234`, **texto plano, sin seguridad todavía**), actividades y notificaciones.

**Sin base de datos por ahora:** los cambios (cuentas nuevas, contraseñas, actividades, avances, notificaciones leídas) viven en la memoria del servidor y se comparten entre usuarios, pero se pierden al reiniciar o redeployar.

**Simulado:** el código de la verificación en 2 pasos se muestra en pantalla en lugar de enviarse por correo, y el rate de aprobación de Departamentos es un valor fijo de los datos de prueba.

## API

| Método | Ruta | Uso |
|---|---|---|
| `POST` | `/api/login` | Paso 1: usuario (correo, alias o número) y contraseña; genera el código |
| `POST` | `/api/login/verificar` | Paso 2: código de 6 dígitos (5 min, 5 intentos); devuelve la sesión |
| `POST` | `/api/login/reenviar` | Nuevo código para la misma verificación |
| `POST` | `/api/registro` | Crear cuenta (técnico / Ing. Jr eligen encargado; encargados indican su área) |
| `POST` | `/api/recuperar` | Validar número de empleado y correo; da un permiso de un solo uso |
| `POST` | `/api/recuperar/cambiar` | Contraseña nueva con ese permiso |
| `GET` | `/api/perfil/:no` | Datos del empleado y días para que venza su contraseña |
| `POST` | `/api/perfil/:no/password` | Cambiar la contraseña propia (pide la actual) |
| `GET` | `/api/departamentos` | Plantilla de todos los departamentos con rate |
| `GET` | `/api/inicio/:no` | Indicadores y notificaciones del empleado |
| `POST` | `/api/notificaciones/:no/leidas` | Marcar todas como leídas |
| `GET` | `/api/equipo/:no` | Equipo de un encargado con jefe y actividades vigentes de cada uno |
| `POST` | `/api/actividades` | Registrar actividades por puntos y notificar al empleado |
| `GET` | `/api/actividades/:no` | Actividades asignadas a un empleado |
| `PATCH` | `/api/actividades/:id` | El asignado actualiza estado, avance y comentario; se notifica al encargado |
| `POST` | `/api/actividades/:id/heredar` | Heredar una pendiente o incompleta al día siguiente o a otro técnico / Ing. Jr del siguiente turno |
| `POST` | `/api/reportes` | Actividades de los empleados elegidos entre dos fechas, opcionalmente por turno |
- `render.yaml` — despliegue en Render.

## Despliegue en Render

1. En Render: **New → Blueprint** y elige este repositorio (usa `render.yaml`).
2. Render ejecuta `npm install && npm run build` y luego `npm start`.
3. Entra con `10482` / `demo1234` (técnico) o `10001` / `demo1234` (gerente). El código de verificación aparece en pantalla (simulado).

## Scripts

- `npm run build` — compila el frontend.
- `npm start` — levanta Fastify (puerto `PORT`, 3000 por defecto).
- `npm test` — pruebas de la API.
- `npm run lint` — oxlint.
