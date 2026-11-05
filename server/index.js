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

// PostgreSQL: DATABASE_URL (Neon en Render; local en el servidor de planta). La primera vez la base está vacía y se llena con los datos de
// prueba; después cada arranque carga lo guardado. Sin DATABASE_URL todo vive en memoria (desarrollo, pruebas)
const pool = process.env.DATABASE_URL && await conectar(process.env.DATABASE_URL)
const { datos: estado = null, instancia } = pool ? await cargar(pool) : {}
const db = pool && guardador(pool, instancia)

// trustProxy: Render o NGINX atienden HTTPS y pasan la petición por un proxy; así req.protocol es 'https' (cookie Secure)
// y req.ip es la IP real del equipo (para el registro de accesos)
const app = build({ logger: true, trustProxy: true, superadmins, estado, guardar: db?.guardar, salud: pool && (() => pool.query('select 1')),
  // CUENTAS_PRUEBA=no con usuarios reales: las cuentas de prueba (demo1234, sin MFA) dejan de entrar
  cuentasPrueba: process.env.CUENTAS_PRUEBA !== 'no',
})
if (db) {
  if (estado) db.yaGuardado(estado)
  await db.guardar(app.estado) // primer arranque: escribe los datos de prueba; después, solo lo que cambió al arrancar
  app.log.info(estado ? 'datos cargados de PostgreSQL' : 'PostgreSQL vacío: se cargaron los datos de prueba')
}
// PORT: Render lo asigna. HOST: en Render 0.0.0.0; en el servidor de planta 127.0.0.1 (solo NGINX llega a la app)
await app.listen({ port: Number(process.env.PORT) || 3000, host: process.env.HOST || '0.0.0.0' })
