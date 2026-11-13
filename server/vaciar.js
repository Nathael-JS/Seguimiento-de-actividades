// Inicio desde 0: deja la base con server/datos/inicio (sin usuarios ni departamentos) y conserva a los super
// administradores tal como están (con su app vinculada). Borra todo lo demás. Después, el super administrador da
// de alta al primer gerente en Plantillas → Nuevo gerente.
// Lo corre el workflow "Vaciar datos" de GitHub (o, en planta, a mano tras un respaldo). Después hay que reiniciar la app.
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
  // Sin departamentos: los super administradores integrados a uno vuelven a ser solo super administradores
  const superadmins = (datos?.usuarios.filter((u) => u.role === 'sa' || u.sa === true) ?? [])
    .map((u) => ({ ...u, role: 'sa', sa: true, dept: null, boss: null, ayudantes: [] }))
  const app = build()
  app.estado.usuarios.push(...superadmins)
  await restaurar(pool, respaldo(app.estado))
  console.log(`Base vaciada: ${app.estado.usuarios.length} usuarios (${superadmins.length} super administradores). Reinicia la app (Render: Restart service; planta: systemctl restart seguimiento).`)
} finally {
  await pool.end()
}
