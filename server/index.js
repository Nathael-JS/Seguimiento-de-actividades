import { build } from './app.js'
import { cargar, conectar, guardador } from './db.js'

// Super administradores: JSON en la variable de entorno SUPERADMINS (en Render: Environment), nunca en el repositorio.
// [{ "name": "…", "email": "…", "password": "…" }]; su número de empleado es 90001, 90002… si no se indica "no"
let superadmins = []
try {
  superadmins = JSON.parse(process.env.SUPERADMINS || '[]')
} catch {
  console.error('SUPERADMINS no es un JSON válido: se arranca sin super administradores')
}

// PostgreSQL (Neon): DATABASE_URL en Render. La primera vez la base está vacía y se llena con los datos de
// prueba; después cada arranque carga lo guardado. Sin DATABASE_URL todo vive en memoria (desarrollo, pruebas)
const pool = process.env.DATABASE_URL && await conectar(process.env.DATABASE_URL)
const estado = pool ? await cargar(pool) : null
const db = pool && guardador(pool)

// trustProxy: Render atiende HTTPS y pasa la petición por un proxy; así req.protocol es 'https' (cookie Secure)
// y req.ip es la IP real del equipo (para el registro de accesos)
const app = build({ logger: true, trustProxy: true, superadmins, estado, guardar: db?.guardar })
if (db) {
  if (estado) db.yaGuardado(estado)
  await db.guardar(app.estado) // primer arranque: escribe los datos de prueba; después, solo lo que cambió al arrancar
  app.log.info(estado ? 'datos cargados de PostgreSQL' : 'PostgreSQL vacío: se cargaron los datos de prueba')
}
// Render asigna el puerto en PORT y necesita escuchar en 0.0.0.0
await app.listen({ port: Number(process.env.PORT) || 3000, host: '0.0.0.0' })
