import { build } from './app.js'

// Super administradores: JSON en la variable de entorno SUPERADMINS (en Render: Environment), nunca en el repositorio.
// [{ "name": "…", "email": "…", "password": "…" }]; su número de empleado es 90001, 90002… si no se indica "no"
let superadmins = []
try {
  superadmins = JSON.parse(process.env.SUPERADMINS || '[]')
} catch {
  console.error('SUPERADMINS no es un JSON válido: se arranca sin super administradores')
}

// trustProxy: Render atiende HTTPS y pasa la petición por un proxy; así req.protocol es 'https' (cookie Secure)
// y req.ip es la IP real del equipo (para el registro de accesos)
const app = build({ logger: true, trustProxy: true, superadmins })
// Render asigna el puerto en PORT y necesita escuchar en 0.0.0.0
await app.listen({ port: Number(process.env.PORT) || 3000, host: '0.0.0.0' })
