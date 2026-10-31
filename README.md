# Seguimiento-de-actividades
apliacion enfocada al registro y monitoreo de actividades empresariales

## Estructura

- `src/` — frontend React + Vite: login, menú según el rol e Inicio; los demás módulos están "en desarrollo".
- `server/` — API con Fastify (`POST /api/login`, `GET /api/inicio/:no`); en producción también sirve el frontend compilado (`dist/`).
- `server/schema.sql` — tablas de PostgreSQL; se crean solas al arrancar el servidor.
- `server/seed.sql` — datos de prueba de los mockups (contraseña `demo1234`, **texto plano, sin seguridad todavía**); se cargan solo si la base está vacía.
- `render.yaml` — despliegue en Render: base de datos PostgreSQL + servicio web.

## Despliegue en Render

1. En Render: **New → Blueprint** y elige este repositorio (usa `render.yaml`). Crea la base `seguimiento-db` y le pasa su conexión al servicio en `DATABASE_URL`.
2. Render ejecuta `npm install && npm run build` y luego `npm start`.
3. Entra con `10482` / `demo1234` (técnico) o `10001` / `demo1234` (gerente).

## Scripts

- `npm run build` — compila el frontend.
- `npm start` — levanta Fastify (puerto `PORT`, 3000 por defecto). Necesita `DATABASE_URL`.
- `npm test` — pruebas de la API contra PostgreSQL en memoria (PGlite), sin instalar nada más.
- `npm run lint` — oxlint.
