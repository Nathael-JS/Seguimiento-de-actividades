import { readFileSync } from 'node:fs'

const sql = (archivo) => readFileSync(new URL(archivo, import.meta.url), 'utf8')

// Crea las tablas que falten y carga los datos de prueba si la base está vacía
export async function prepararDb(db) {
  await db.query(sql('./schema.sql'))
  const { rows } = await db.query('SELECT count(*)::int AS n FROM empleados')
  if (rows[0].n === 0) await db.query(sql('./seed.sql'))
}
