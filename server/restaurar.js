// Restaura un respaldo descargado por el super administrador (Usuarios → Descargar respaldo) en DATABASE_URL.
// Reemplaza todo lo que haya; después hay que reiniciar la app (Render o systemctl restart seguimiento).
//   DATABASE_URL=postgresql://… npm run restaurar -- respaldo.json
import { readFileSync } from 'node:fs'
import { conectar, restaurar } from './db.js'

const [archivo] = process.argv.slice(2)
if (!archivo || !process.env.DATABASE_URL) {
  console.error('Uso: DATABASE_URL=postgresql://… npm run restaurar -- respaldo.json')
  process.exit(1)
}
const pool = await conectar(process.env.DATABASE_URL)
try {
  await restaurar(pool, JSON.parse(readFileSync(archivo, 'utf8')))
  console.log('Restaurado. Reinicia la app para que lo cargue (Render: Restart service; planta: systemctl restart seguimiento).')
} finally {
  await pool.end()
}
