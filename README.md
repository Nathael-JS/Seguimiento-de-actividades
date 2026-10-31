# Seguimiento-de-actividades
apliacion enfocada al registro y monitoreo de actividades empresariales

## Estructura

- `src/` — frontend React + Vite: login, menú según el rol, Inicio, Registrar actividad (con herencia de pendientes), Mis actividades, Monitoreo, Reportes (exportar a Excel/PDF) y Buzón; los demás módulos están "en desarrollo".
- `server/` — API con Fastify; en producción también sirve el frontend compilado (`dist/`).
- `server/*.json` — datos de prueba de los mockups: usuarios (contraseña `demo1234`, **texto plano, sin seguridad todavía**), actividades y notificaciones.

**Sin base de datos por ahora:** los cambios (actividades registradas, avances, notificaciones leídas) viven en la memoria del servidor y se comparten entre usuarios, pero se pierden al reiniciar o redeployar.

## API

| Método | Ruta | Uso |
|---|---|---|
| `POST` | `/api/login` | Login por correo, alias o número de empleado |
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
3. Entra con `10482` / `demo1234` (técnico) o `10001` / `demo1234` (gerente).

## Scripts

- `npm run build` — compila el frontend.
- `npm start` — levanta Fastify (puerto `PORT`, 3000 por defecto).
- `npm test` — pruebas de la API.
- `npm run lint` — oxlint.
