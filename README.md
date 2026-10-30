# Seguimiento-de-actividades
apliacion enfocada al registro y monitoreo de actividades empresariales

## Estructura

- `src/` — frontend React + Vite (login y página "en desarrollo").
- `server/` — API con Fastify (`POST /api/login`); en producción también sirve el frontend compilado (`dist/`).
- `server/usuarios.json` — usuarios de prueba (contraseña `demo1234`, **texto plano, sin seguridad todavía**).
- `render.yaml` — despliegue en Render.

## Despliegue en Render

1. En Render: **New → Blueprint** y elige este repositorio (usa `render.yaml`).
2. Render ejecuta `npm install && npm run build` y luego `npm start`.
3. Entra con `10482` / `demo1234` (o cualquier usuario de `server/usuarios.json`).

## Scripts

- `npm run build` — compila el frontend.
- `npm start` — levanta Fastify (puerto `PORT`, 3000 por defecto).
- `npm test` — pruebas del login.
- `npm run lint` — oxlint.
