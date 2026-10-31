import pg from 'pg'
import { build } from './app.js'
import { prepararDb } from './db.js'

if (!process.env.DATABASE_URL) throw new Error('Falta la variable DATABASE_URL con la conexión a PostgreSQL')

const db = new pg.Pool({ connectionString: process.env.DATABASE_URL })
await prepararDb(db)

const app = build(db, { logger: true })
// Sin esto, una conexión inactiva que se cae tumbaría el proceso
db.on('error', (err) => app.log.error(err))
// Render asigna el puerto en PORT y necesita escuchar en 0.0.0.0
await app.listen({ port: Number(process.env.PORT) || 3000, host: '0.0.0.0' })
