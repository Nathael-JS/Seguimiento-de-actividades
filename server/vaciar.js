// Inicio limpio: deja la base con los datos de server/datos/inicio (Laura y Jorge por registrar, Liquid Cooling)
// y conserva a los super administradores tal como están (con su app vinculada). Borra todo lo demás.
// Lo corre el workflow "Vaciar datos" de GitHub, que antes hace un respaldo. Después hay que reiniciar Render.
//   DATABASE_URL=postgresql://… node server/vaciar.js VACIAR
import { build } from './app.js'
import { cargar, conectar, respaldo, restaurar } from './db.js'

if (process.argv[2] !== 'VACIAR' || !process.env.DATABASE_URL) {
  console.error('Uso: DATABASE_URL=postgresql://… node server/vaciar.js VACIAR')
  process.exit(1)
}
process.env.DATOS_SEMILLA = 'inicio'
const pool = await conectar(process.env.DATABASE_URL)
try {
  const { datos } = await cargar(pool)
  const superadmins = datos?.usuarios.filter((u) => u.role === 'sa') ?? []
  const app = build()
  app.estado.usuarios.push(...superadmins)
  await restaurar(pool, respaldo(app.estado))
  console.log(`Base vaciada: ${app.estado.usuarios.length} usuarios (${superadmins.length} super administradores). Reinicia el servicio en Render.`)
} finally {
  await pool.end()
}
